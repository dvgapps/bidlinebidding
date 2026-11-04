"""Assemble parsed trips + raw lines into the app's JSON bundle and cross-check them."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .lines import N_DAYS, RawLine
from .trips import MONTHS, Trip

NY = ZoneInfo("America/New_York")
UTC = timezone.utc


@dataclass
class BidPeriodInfo:
    id: str
    start: date  # first calendar date of PP1
    pp_ids: list[str]
    domicile: str = "SDFZ"
    fleet: str = "757"
    generated: str = ""

    @property
    def pp_starts(self) -> list[date]:
        return [self.start + timedelta(days=N_DAYS * k) for k in range(len(self.pp_ids))]


def parse_header_date(s: str) -> date:
    m = re.fullmatch(r"(\d\d)([A-Z][a-z]{2})(\d{4})", s)
    return date(int(m[3]), MONTHS[m[2]], int(m[1]))


def local_span(trip: Trip, zulu_date: date) -> tuple[date, date]:
    """Domicile-local calendar dates of the trip report and release instants."""
    h, m = (int(x) for x in trip.reportUtc.split(":"))
    rep = datetime(zulu_date.year, zulu_date.month, zulu_date.day, h, m, tzinfo=UTC)
    rel = rep + timedelta(minutes=trip.tafb)
    return rep.astimezone(NY).date(), rel.astimezone(NY).date()


LINE_TYPE_BY_COMMENT = [
    ("BASE TRIP LINE", "base-trip"),
    ("PHL GATEWAY STANDBY", "gateway-standby"),
    ("RFD GATEWAY STANDBY", "gateway-standby"),
    ("AIRPORT STANDBY", "hot-standby"),
    ("SHIFTABLE RESERVE", "shiftable-reserve"),
    ("RESERVE RECOVERY LINE", "reserve-recovery"),
    ("VTOR LINE", "vtor"),
    ("VTO LINE", "vto"),
]


def classify(comment: str, kinds: set[str]) -> str:
    up = comment.upper()
    for key, t in LINE_TYPE_BY_COMMENT:
        if key in up:
            return t
    duty = kinds & {"trip", "HS", "GS"}
    if kinds & {"RA", "RB"} and not duty:
        return "reserve"
    if kinds & {"SA", "SB"} and not duty:
        return "shiftable-reserve"
    if "VTOR" in kinds:
        return "vtor"
    if "VTO" in kinds:
        return "vto"
    return "flying"


def fmt(m: int | None) -> str | None:
    return None if m is None else f"{m // 60}:{m % 60:02d}"


def hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def trip_type(t: Trip) -> str:
    kinds = {l.kind for d in t.duties for l in d.legs}
    if "hot-standby" in kinds:
        legs = [l for d in t.duties for l in d.legs if l.kind == "hot-standby"]
        return "hot-standby" if all(l.flight.startswith("SBA") for l in legs) else "gateway-standby"
    return "flying"


def pp_boundaries(bid: BidPeriodInfo) -> list[datetime]:
    """Instants (tz-aware) where each PP starts (03:00 domicile-local) plus the end of the last PP."""
    out = []
    for k in range(len(bid.pp_ids) + 1):
        d = bid.start + timedelta(days=N_DAYS * k)
        out.append(datetime(d.year, d.month, d.day, 3, 0, tzinfo=NY))
    return out


def flown_block_by_pp(t: Trip, report: datetime, bounds: list[datetime]) -> list[int]:
    """Flown block minutes per PP, pro-rating a leg that straddles a PP boundary."""
    res = [0] * (len(bounds) - 1)
    for d in t.duties:
        for g in d.legs:
            if g.kind != "flight":
                continue
            s0 = report + timedelta(minutes=g.startMin)
            e0 = s0 + timedelta(minutes=g.block)
            for i in range(len(res)):
                lo, hi = max(s0, bounds[i]), min(e0, bounds[i + 1])
                if hi > lo:
                    res[i] += round((hi - lo).total_seconds() / 60)
    return res


@dataclass
class BuildResult:
    lines: list[dict]
    problems: list[str] = field(default_factory=list)
    stats: dict = field(default_factory=dict)


def build_lines(raw: list[RawLine], trips: list[Trip], bid: BidPeriodInfo) -> BuildResult:
    tmap = {t.id: t for t in trips}
    res = BuildResult(lines=[])
    seen_dates: dict[str, set[str]] = {}
    pp_starts = bid.pp_starts
    bounds = pp_boundaries(bid)
    counts = {"ct_ok": 0, "ct_bad": 0, "bt_ok": 0, "bt_bad": 0, "bt_bad_crossing": 0}
    n_pp = len(pp_starts)
    n_inst = 0

    def problem(msg: str) -> None:
        res.problems.append(msg)

    for rl in raw:
        total = N_DAYS * n_pp
        kinds_by_day: list[str | None] = [None] * total
        trip_by_day: list[str | None] = [None] * total
        instances: list[dict] = []
        ct_calc = [0] * n_pp
        bt_calc = [0] * n_pp
        crossing = False
        for k, pp in enumerate(rl.pps[:n_pp]):
            base = N_DAYS * k
            for col, code in pp.codes.items():
                if 0 <= col < N_DAYS:
                    kinds_by_day[base + col] = code
            for inst in pp.instances:
                if not (0 <= inst.startCol < N_DAYS):
                    continue  # hidden overflow copy
                t = tmap.get(inst.tripId)
                start_abs = base + inst.startCol
                end_abs = base + inst.endCol
                sd = bid.start + timedelta(days=start_abs)
                ed = bid.start + timedelta(days=end_abs)
                n_inst += 1
                if t is None:
                    problem(f"line {rl.number}: trip {inst.tripId} not in trips PDF")
                    continue
                if rl.number not in t.lines:
                    problem(f"line {rl.number}: trip {inst.tripId} does not list this line")
                if inst.credit is not None and inst.reportUtc != t.reportUtc:
                    problem(f"line {rl.number} {sd}: trip {t.id} report {inst.reportUtc} != trips PDF {t.reportUtc}")
                if inst.credit is not None and inst.credit != t.credit:
                    problem(f"line {rl.number} {sd}: trip {t.id} credit {fmt(inst.credit)} != trips PDF {fmt(t.credit)}")
                ok = False
                for zd in (sd - timedelta(days=1), sd, sd + timedelta(days=1)):
                    ls, le = local_span(t, zd)
                    if ls == sd:
                        ok = True
                        seen_dates.setdefault(t.id, set()).add(zd.isoformat())
                        if le != ed:
                            problem(f"line {rl.number} {sd}: trip {t.id} local end {le} != grid end {ed}")
                        break
                if not ok:
                    problem(f"line {rl.number} {sd}: trip {t.id} cannot start on this local date")
                # credit by PP: a trip crossing the PP1/PP2 edge prints its PP1 portion in parentheses
                if inst.endCol > N_DAYS - 1:
                    crossing = True
                if k == 0 and inst.endCol > N_DAYS - 1 and n_pp > 1:
                    part = inst.ppCredit if inst.ppCredit is not None else t.credit
                    ct_calc[0] += part
                    ct_calc[1] += t.credit - part
                elif inst.ppCredit is not None:
                    ct_calc[k] += inst.ppCredit
                else:
                    ct_calc[k] += t.credit
                if ok:
                    h, mi = (int(x) for x in t.reportUtc.split(":"))
                    rep_dt = datetime(zd.year, zd.month, zd.day, h, mi, tzinfo=UTC)
                    for i, v in enumerate(flown_block_by_pp(t, rep_dt, bounds)):
                        bt_calc[min(i, n_pp - 1)] += v
                ttype = trip_type(t)
                for a in range(max(start_abs, 0), min(end_abs, total - 1) + 1):
                    kinds_by_day[a] = {"flying": "trip", "hot-standby": "HS", "gateway-standby": "GS"}[ttype]
                    trip_by_day[a] = trip_by_day[a] or t.id
                instances.append(
                    {
                        "tripId": t.id,
                        "startDate": sd.isoformat(),
                        "endDate": ed.isoformat(),
                        "reportUtc": t.reportUtc,
                        "credit": fmt(t.credit),
                        "ppCredit": fmt(inst.ppCredit),
                    }
                )
        days = []
        for a in range(total):
            d = bid.start + timedelta(days=a)
            cell = {"date": d.isoformat(), "kind": kinds_by_day[a] or "off"}
            if trip_by_day[a]:
                cell["tripId"] = trip_by_day[a]
            days.append(cell)
        kinds = {c["kind"] for c in days}
        for k, pp in enumerate(rl.pps[:n_pp]):
            st = pp.stats
            if "CT" not in st and ct_calc[k]:
                counts["ct_missing"] = counts.get("ct_missing", 0) + 1  # PDF omitted the CT cell
            elif "CT" in st:
                if hm(st["CT"]) == ct_calc[k]:
                    counts["ct_ok"] += 1
                else:
                    counts["ct_bad"] += 1
                    problem(f"line {rl.number} {pp.label}: CT printed {st.get('CT')} != computed {fmt(ct_calc[k])}")
            if "BT" in st:
                if hm(st["BT"]) == bt_calc[k]:
                    counts["bt_ok"] += 1
                elif crossing:
                    counts["bt_bad_crossing"] += 1  # allocation of a boundary-straddling trip is approximate
                else:
                    counts["bt_bad"] += 1
                    problem(f"line {rl.number} {pp.label}: BT printed {st['BT']} != computed {fmt(bt_calc[k])}")
        pps_out = []
        for k, pp in enumerate(rl.pps[:n_pp]):
            st = pp.stats
            pps_out.append(
                {
                    "id": pp.id or bid.pp_ids[k],
                    "label": pp.label,
                    "start": pp_starts[k].isoformat(),
                    "ct": st.get("CT"),
                    "bt": st.get("BT"),
                    "do": int(st["DO"]) if "DO" in st else None,
                    "dd": int(st["DD"]) if "DD" in st else None,
                }
            )
        res.lines.append(
            {
                "number": rl.number,
                "comment": rl.comment,
                "seats": {"captain": rl.seats[0], "firstOfficer": rl.seats[1], "other": rl.seats[2]},
                "eligible": {"captain": rl.seats[0] > 0, "firstOfficer": rl.seats[1] > 0},
                "type": classify(rl.comment, kinds),
                "page": rl.page,
                "pp": pps_out,
                "days": days,
                "tripInstances": instances,
            }
        )
    res.stats = {**counts, "instances": n_inst, "seenDates": {k: sorted(v) for k, v in seen_dates.items()}}
    return res

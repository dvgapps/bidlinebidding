"""Parser for `Trips - Bid NNNN DOM.pdf` (two trips per page, side by side).

Each page is split at its horizontal midpoint; each half is a column of trip blocks that start at a
`Trip Id:` row. Layout columns (x relative to the half, points): Day <48, Flight/route 48-135,
Start ~137, End ~165, Block ~193, A/C ~213, Cxn ~230, Need ~246, duty summary 262-313, trip summary >=314.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from .words import Page, Word, group_rows

MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}

RE_TIME = re.compile(r"^\((\d\d)\)(\d\d):(\d\d)$")
RE_DUR = re.compile(r"^(\d+)h(\d\d)$")
RE_ROUTE = re.compile(r"^([A-Z0-9]{3})-([A-Z0-9]{3})$")
RE_DATE = re.compile(r"(\d\d)([A-Z][a-z]{2})(\d{4})")
RE_CREDIT = re.compile(r"^(\d+)h(\d\d)([A-Z])$")
RE_DAY = re.compile(r"^(\d+)?\(\s*([A-Za-z]{2})?\s*\)\s*([A-Za-z]{2})?$")
# words pdfplumber glues together when columns are tight, e.g. "11h1074Y", "1h151/1", "2h33/..."
RE_GLUE = [
    re.compile(r"^(\d+h\d\d)(\d/\d)$"),
    re.compile(r"^(\d+h\d\d)([0-9A-Z]{3})$"),
]


class TripParseError(ValueError):
    pass


def dur_minutes(s: str) -> int:
    m = RE_DUR.match(s)
    if not m:
        raise TripParseError(f"bad duration {s!r}")
    return int(m[1]) * 60 + int(m[2])


def parse_date(s: str) -> date:
    m = RE_DATE.fullmatch(s)
    if not m:
        raise TripParseError(f"bad date {s!r}")
    return date(int(m[3]), MONTHS[m[2]], int(m[1]))


def expand_report_dates(spec: str, mask: str | None, count: int | None) -> list[date]:
    """`spec` is `02Jan2027-23Jan2027` or `Only on Tue 22Dec2026`; mask `.234...` Mon=1..Sun=7."""
    m = re.search(r"Only on \w+ (\d\d[A-Z][a-z]{2}\d{4})", spec)
    if m:
        return [parse_date(m[1])]
    m = re.search(r"(\d\d[A-Z][a-z]{2}\d{4})\s*-\s*(\d\d[A-Z][a-z]{2}\d{4})", spec)
    if not m or not mask or len(mask) != 7:
        raise TripParseError(f"bad report-date spec {spec!r} / {mask!r}")
    d0, d1 = parse_date(m[1]), parse_date(m[2])
    out = []
    d = d0
    while d <= d1:
        if mask[d.weekday()] != ".":
            out.append(d)
        d += timedelta(days=1)
    return out


@dataclass
class Leg:
    day: int
    flight: str
    kind: str  # flight | deadhead-company | deadhead-commercial | ground | hot-standby
    dep: str
    arr: str
    startUtc: str
    startLocalHour: int
    endUtc: str
    endLocalHour: int
    startMin: int  # minutes after trip report instant
    endMin: int
    block: int  # minutes
    aircraft: str
    iro: bool
    cxn: int | None  # minutes of connection after this leg (same duty)
    local_weekday: str | None = None
    utc_weekday: str | None = None


@dataclass
class Duty:
    reportUtc: str
    reportLocalHour: int
    reportMin: int
    reportLead: int  # minutes of pre-departure report time
    releaseUtc: str | None = None
    releaseMin: int | None = None
    postMin: int | None = None
    duty: int | None = None
    block: int | None = None
    rest: int | None = None
    credit: int | None = None
    creditCode: str | None = None
    restNote: str | None = None
    legs: list[Leg] = field(default_factory=list)


@dataclass
class Trip:
    id: str
    lines: list[int]
    reportUtc: str
    reportDates: list[str]  # expanded from range+mask; may over-count (see reportDatesStated)
    reportDatesStated: int
    duties: list[Duty]
    overnights: list[str]
    credit: int
    creditCode: str
    block: int
    duty: int
    tafb: int
    premium: float
    perDiem: float
    landings: int
    crew: str
    domicile: str
    page: int
    warnings: list[str] = field(default_factory=list)
    openDates: list[str] = field(default_factory=list)  # dates this trip is also (only) open time
    openOnly: bool = False  # appears only in the Open Trips section (on no bidline)

    def to_json(self) -> dict:
        from dataclasses import asdict

        return asdict(self)


def _split_glued(words: list[Word]) -> list[Word]:
    out: list[Word] = []
    for w in words:
        for rx in RE_GLUE:
            m = rx.match(w.text)
            if m:
                cut = w.x0 + (w.x1 - w.x0) * len(m[1]) / len(w.text)
                out.append(Word(w.x0, cut, w.top, w.bottom, m[1]))
                out.append(Word(cut, w.x1, w.top, w.bottom, m[2]))
                break
        else:
            out.append(w)
    return out


def _leg_kind(flight_tokens: list[str]) -> str:
    toks = flight_tokens
    j = " ".join(toks)
    if any(t.startswith(("SBG", "SBA")) for t in toks):
        return "hot-standby"
    if toks and toks[0] == "GT":
        return "ground"
    if "LIMO" in j or "LIM" in toks:
        return "ground"
    if toks and toks[0] == "DH":
        rest = toks[1:]
        if rest and rest[0] == "UPS":
            return "deadhead-company"
        return "deadhead-commercial"
    if "CML" in toks:
        return "deadhead-commercial"
    return "flight"


def _split_halves(page: Page) -> list[list[Word]]:
    half = page.width / 2
    footer = page.height - 55
    left, right = [], []
    for w in page.words:
        if w.top > footer:
            continue
        if w.x0 < half:
            left.append(w)
        else:
            right.append(Word(w.x0 - half, w.x1 - half, w.top, w.bottom, w.text))
    return [left, right]


def _split_trips(words: list[Word]) -> tuple[list[Word], list[list[Word]]]:
    """Return (continuation words that precede the first `Trip Id`, [trip blocks])."""
    starts = [
        w.top
        for w in words
        if w.text == "Trip" and w.x0 < 20 and any(v.text == "Id:" and abs(v.top - w.top) < 2 for v in words)
    ]
    starts.sort()
    lead_end = starts[0] - 1 if starts else 1e9
    lead = [w for w in words if w.top < lead_end]
    if not any(RE_TIME.match(w.text) for w in lead):
        lead = []  # just the page header (title / bid period lines)
    blocks = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else 1e9
        blocks.append([w for w in words if s - 1 <= w.top < e - 1])
    return lead, blocks


def _next_at_or_after(t: int, hhmm: int) -> int:
    """Smallest absolute minute >= t whose minute-of-day equals hhmm."""
    r = t - t % 1440 + hhmm
    return r if r >= t else r + 1440


def _resolve_clock(trip_id: str, duties: list[Duty]) -> list[str]:
    """Turn the raw HH:MM UTC tokens into minutes since the first report, using the known
    block (end = start + block), rest (next report = release + rest) and monotonic time."""
    warns: list[str] = []
    base = duties[0].reportMin
    prev_release: int | None = None
    prev_rest: int | None = None
    for k, d in enumerate(duties):
        raw_report = d.reportMin
        if k == 0:
            rep = raw_report
        elif prev_rest is not None:
            rep = prev_release + prev_rest
            if (rep - raw_report) % 1440:
                warns.append(f"duty {k + 1}: report {raw_report} != release+rest")
        else:
            rep = _next_at_or_after(prev_release, raw_report)
        d.reportMin = rep
        t = rep
        for leg in d.legs:
            s0 = _next_at_or_after(t, leg.startMin)
            leg.startMin = s0
            raw_end = leg.endMin
            leg.endMin = s0 + leg.block
            if leg.kind == "hot-standby":
                leg.endMin = _next_at_or_after(s0, raw_end)
            elif (leg.endMin - raw_end) % 1440:
                warns.append(f"leg {leg.flight} {leg.dep}-{leg.arr}: end time != start+block")
            t = leg.endMin
        if d.releaseMin is not None:
            d.releaseMin = _next_at_or_after(t, d.releaseMin)
            prev_release = d.releaseMin
        else:
            prev_release = t
        prev_rest = d.rest
    for d in duties:
        d.reportMin -= base
        if d.releaseMin is not None:
            d.releaseMin -= base
        for leg in d.legs:
            leg.startMin -= base
            leg.endMin -= base
    return warns


def parse_trip_block(words: list[Word], page_no: int) -> Trip:
    words = _split_glued(words)
    rows = group_rows(words)
    # ---- header -------------------------------------------------------------
    trip_id = None
    lines: list[int] = []
    in_lines = False
    h_duty = h_trip = None
    spec_words: list[str] = []
    body_start = None
    for ri, row in enumerate(rows):
        txt = " ".join(w.text for w in row if w.x0 < 250)
        if txt.startswith("Trip Id:"):
            trip_id = txt.split()[2]
        elif txt.startswith("Lines:"):
            in_lines = True
            lines += [int(x) for x in re.findall(r"\d+", txt[6:])]
        elif txt.startswith("Report Date Zulu:"):
            in_lines = False
            spec_words = [w.text for w in row if w.x0 < 250]
            right = [w for w in row if w.x0 >= 250]
            h_duty = next(w.x0 for w in right if w.text == "Duty")
            h_trip = next(w.x0 for w in right if w.text == "Trip")
        elif txt.startswith("Day Flight"):
            body_start = ri + 1
            hd = {w.text: w.x0 for w in row}
            break
        elif in_lines:
            lines += [int(x) for x in re.findall(r"\d+", txt)]
    if trip_id is None or body_start is None or not spec_words or h_duty is None:
        raise TripParseError(f"page {page_no}: cannot read trip header")
    spec = " ".join(spec_words)
    mask_m = re.search(r"\s([.1-7]{7})\s", " " + spec + " ")
    cnt_m = re.search(r"\((\d+) trips?\)", spec)
    dates = expand_report_dates(spec, mask_m[1] if mask_m else None, int(cnt_m[1]) if cnt_m else None)
    stated = int(cnt_m[1]) if cnt_m else len(dates)

    # ---- body ---------------------------------------------------------------
    duties: list[Duty] = []
    summary_events: list[tuple[str, str, str]] = []  # (label, value, note) from duty summary column
    trip_sum: dict[str, str] = {}
    cur: Duty | None = None

    c_flight = hd["Flight"] - 6
    c_route = hd["Departure-Arrival"] - 6
    c_end = hd["End"] - 4
    c_block = hd["Block"] - 6
    c_ac = hd["A/C"] - 6
    c_cxn = hd["Cxn"] - 6
    c_need = hd["Need"] - 4
    c_duty = h_duty - 3
    c_trip = h_trip - 3
    for row in rows[body_start:]:
        if row[0].text == "Day" and any(w.text == "Flight" for w in row):
            continue
        left = [w for w in row if w.x0 < c_duty]
        sumcol = [w for w in row if c_duty <= w.x0 < c_trip]
        tsum = [w for w in row if w.x0 >= c_trip]
        if sumcol:
            label = sumcol[0].text.rstrip(":")
            val = "".join(w.text for w in sumcol[1:2])
            note = " ".join(w.text for w in sumcol[2:])
            if label == "Credit":
                val = "".join(w.text for w in sumcol[1:])
            summary_events.append((label, val, note))
        if tsum:
            t = " ".join(w.text for w in tsum)
            for key in ("Crew", "Domicile", "Duty Time", "Block Time", "Credit Time", "TAFB", "Premium", "per Diem", "LDGS"):
                if t.startswith(key):
                    trip_sum[key] = t[len(key):].lstrip(": ").strip()
                    break
        if not left:
            continue
        # classify tokens in the left (leg) area by x position and regex
        day_txt = "".join(w.text for w in left if w.x0 < c_flight)
        times = [w for w in left if RE_TIME.match(w.text)]
        route = next((w for w in left if RE_ROUTE.match(w.text) and w.x0 >= c_route), None)
        durs = [w for w in left if RE_DUR.match(w.text)]
        block_w = next((w for w in durs if c_block <= w.x0 < c_ac), None)
        cxn_w = next((w for w in durs if c_cxn <= w.x0 < c_need), None)
        ac_w = next((w for w in left if c_ac <= w.x0 < c_cxn and not RE_DUR.match(w.text)), None)
        start_w = next((w for w in times if w.x0 < c_end), None)
        end_w = next((w for w in times if w.x0 >= c_end), None)

        if route is None:
            # report row (start time only) or release row (end time only)
            if start_w is not None and end_w is None:
                h, hh, mm = (int(x) for x in RE_TIME.match(start_w.text).groups())
                cur = Duty(
                    reportUtc=f"{hh:02d}:{mm:02d}",
                    reportLocalHour=h,
                    reportMin=hh * 60 + mm,
                    reportLead=dur_minutes(cxn_w.text) if cxn_w else 0,
                )
                duties.append(cur)
            elif end_w is not None and start_w is None and cur is not None:
                h, hh, mm = (int(x) for x in RE_TIME.match(end_w.text).groups())
                cur.releaseUtc = f"{hh:02d}:{mm:02d}"
                cur.releaseMin = hh * 60 + mm
                cur.postMin = dur_minutes(cxn_w.text) if cxn_w else 0
            continue
        # leg row
        if cur is None or start_w is None or end_w is None or block_w is None:
            raise TripParseError(f"trip {trip_id}: malformed leg row {[w.text for w in left]}")
        dm = RE_DAY.match(day_txt.replace(" ", ""))
        if not dm or not dm[1] and not day_txt[:1].isdigit():
            raise TripParseError(f"trip {trip_id}: bad day cell {day_txt!r}")
        day = int(re.match(r"\d+", day_txt)[0])
        lw = dm[2] if dm else None
        uw = dm[3] if dm else None
        flight_tokens = [w.text for w in left if c_flight <= w.x0 < route.x0 and not RE_TIME.match(w.text)]
        iro = any(w.text == "IRO" for w in left)
        h1, uh1, um1 = (int(x) for x in RE_TIME.match(start_w.text).groups())
        h2, uh2, um2 = (int(x) for x in RE_TIME.match(end_w.text).groups())
        fl = [t for t in flight_tokens if t != "IRO"]
        cur.legs.append(
            Leg(
                day=day,
                flight=" ".join(fl),
                kind=_leg_kind(fl),
                dep=RE_ROUTE.match(route.text)[1],
                arr=RE_ROUTE.match(route.text)[2],
                startUtc=f"{uh1:02d}:{um1:02d}",
                startLocalHour=h1,
                endUtc=f"{uh2:02d}:{um2:02d}",
                endLocalHour=h2,
                startMin=uh1 * 60 + um1,
                endMin=uh2 * 60 + um2,
                block=dur_minutes(block_w.text),
                aircraft=ac_w.text if ac_w else "",
                iro=iro,
                cxn=dur_minutes(cxn_w.text) if cxn_w else None,
                local_weekday=lw or None,
                utc_weekday=uw or None,
            )
        )

    if not duties or any(not d.legs for d in duties):
        raise TripParseError(f"trip {trip_id}: duty without legs")
    # ---- duty summaries (Duty/Block/Rest/Credit repeat per duty day) ---------
    di = -1
    for label, val, note in summary_events:
        if label == "Duty":
            di += 1
            if di < len(duties):
                duties[di].duty = dur_minutes(val)
        elif di >= 0 and di < len(duties):
            d = duties[di]
            if label == "Block":
                d.block = dur_minutes(val)
            elif label == "Rest":
                d.rest = None if val in ("-", "") else dur_minutes(val)
                d.restNote = note or None
            elif label == "Credit":
                m = RE_CREDIT.match(val)
                if m:
                    d.credit = int(m[1]) * 60 + int(m[2])
                    d.creditCode = m[3]
    if di + 1 != len(duties):
        raise TripParseError(f"trip {trip_id}: {len(duties)} duties but {di + 1} duty summaries")

    try:
        m = RE_CREDIT.match(trip_sum["Credit Time"].replace(" ", ""))
        credit, code = int(m[1]) * 60 + int(m[2]), m[3]
        tafb = dur_minutes(trip_sum["TAFB"])
        block = dur_minutes(trip_sum["Block Time"])
        dutyt = dur_minutes(trip_sum["Duty Time"])
        landings = int(trip_sum["LDGS"])
        premium = float(trip_sum["Premium"])
        per_diem = float(trip_sum["per Diem"])
    except (KeyError, AttributeError, ValueError) as e:
        raise TripParseError(f"trip {trip_id}: incomplete trip summary {trip_sum}") from e

    clock_problems = _resolve_clock(trip_id, duties)
    overnights = [d.legs[-1].arr for d in duties[:-1]]
    first_utc = duties[0].reportUtc
    return Trip(
        id=trip_id,
        lines=sorted(set(lines)),
        reportUtc=first_utc,
        reportDates=[d.isoformat() for d in dates],
        reportDatesStated=stated,
        duties=duties,
        overnights=overnights,
        credit=credit,
        creditCode=code,
        block=block,
        duty=dutyt,
        tafb=tafb,
        premium=premium,
        perDiem=per_diem,
        landings=landings,
        crew=trip_sum.get("Crew", ""),
        domicile=trip_sum.get("Domicile", ""),
        page=page_no,
        warnings=clock_problems,
    )


def parse_trips(pages: list[Page], first_page_no: int = 1) -> list[Trip]:
    """A trip longer than a column continues, without a header, at the top of the next column/page;
    such continuation words are appended to the previous trip block (tops shifted to keep order)."""
    blocks: list[tuple[int, list[Word]]] = []
    open_page: dict[int, bool] = {}
    shift = 0.0
    for i, page in enumerate(pages):
        head = " ".join(w.text for w in sorted(page.words, key=lambda w: (w.top, w.x0)) if w.top < 70)
        if "Open Trips" in head:
            is_open = True
        elif "Trip Report" in head:
            is_open = False
        else:
            is_open = open_page.get(first_page_no + i - 1, False)
        open_page[first_page_no + i] = is_open
        for half in _split_halves(page):
            lead, found = _split_trips(half)
            if lead and blocks:
                shift += 2000.0
                no, prev = blocks[-1]
                prev.extend(Word(w.x0, w.x1, w.top + shift, w.bottom + shift, w.text) for w in lead)
            for b in found:
                blocks.append((first_page_no + i, b))
    trips = [parse_trip_block(b, no) for no, b in blocks]
    for t in trips:
        t.openOnly = open_page.get(t.page, False)
    return merge_open_trips(trips)


def merge_open_trips(trips: list[Trip]) -> list[Trip]:
    """Fold the `Open Trips` section into the main one: same trip id => extra open dates."""
    main = {t.id: t for t in trips if not t.openOnly}
    out = list(main.values())
    for t in trips:
        if not t.openOnly:
            continue
        m = main.get(t.id)
        if m is None:
            out.append(t)
            continue
        if (m.credit, m.tafb, m.block) != (t.credit, t.tafb, t.block):
            raise TripParseError(f"open trip {t.id} differs from its bid-package twin")
        m.openDates = sorted(set(m.openDates) | set(t.reportDates))
    return sorted(out, key=lambda t: t.id)


def validate_trips(trips: list[Trip]) -> list[str]:
    """Internal consistency checks; returns human-readable problems (empty = OK)."""
    problems: list[str] = []
    seen: set[str] = set()
    for t in trips:
        if t.id in seen:
            problems.append(f"duplicate trip id {t.id}")
        seen.add(t.id)
        legs = [l for d in t.duties for l in d.legs]
        flown = sum(l.block for l in legs if l.kind == "flight")
        if flown != t.block:
            problems.append(f"trip {t.id}: flown leg blocks {flown} != block time {t.block}")
        problems.extend(f"trip {t.id}: {w}" for w in t.warnings)
        if sum(d.block or 0 for d in t.duties) != t.block:
            problems.append(f"trip {t.id}: duty-block sum != block time")
        last = t.duties[-1]
        if last.releaseMin is not None and last.releaseMin - t.duties[0].reportMin != t.tafb:
            problems.append(f"trip {t.id}: TAFB {t.tafb} != release-report {last.releaseMin}")
        if sum(d.duty or 0 for d in t.duties) != t.duty and t.duty:
            # Duty Time in the trip summary is total duty; tolerate trips where it equals TAFB for 1 duty
            problems.append(f"trip {t.id}: duty-period sum {sum(d.duty or 0 for d in t.duties)} != Duty Time {t.duty}")
    return problems

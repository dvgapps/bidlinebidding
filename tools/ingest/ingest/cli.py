"""Command line: `python -m ingest --trips <pdf> --lines <pdf> --out data/2701.json`."""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from .build import BidPeriodInfo, build_lines, parse_header_date, trip_type
from .opspecs import airport_info, load_opspecs
from .lines import load_bidline_pages, parse_lines
from .trips import parse_trips, validate_trips
from .words import load_pages

SCHEMA_VERSION = 1


def read_header(pages) -> dict:
    """`Bid Period : 2701`, date range, domicile, fleet, generation time from the first line-report page."""
    words = " ".join(w.text for w in sorted(pages[0].words, key=lambda w: (round(w.top), w.x0)) if w.top < 120)
    out = {}
    m = re.search(r"Bid Period\s*:\s*(\d{4})", words)
    out["id"] = m[1] if m else ""
    m = re.search(r"(\d\d[A-Z][a-z]{2}\d{4})\s*-\s*(\d\d[A-Z][a-z]{2}\d{4})", words)
    if m:
        out["start"], out["end"] = parse_header_date(m[1]), parse_header_date(m[2])
    m = re.search(r"Domicile:\s*(\w+)", words)
    out["domicile"] = m[1] if m else ""
    m = re.search(r"Fleet Type:\s*(\w+)", words)
    out["fleet"] = m[1] if m else ""
    m = re.search(r"Date/Time:\s*(\d\d[A-Z][a-z]{2}\d{4}\s+\d\d:\d\d)", words)
    out["generated"] = m[1] if m else ""
    return out


def run(
    trips_pdf: str, lines_pdf: str, out_path: str, seat: str = "CPT", quiet: bool = False, opspecs_pdf: str | None = None
) -> int:
    t0 = time.time()

    def log(msg: str) -> None:
        if not quiet:
            print(f"[{time.time() - t0:6.1f}s] {msg}", flush=True)

    log("reading line report PDF")
    lpages = load_bidline_pages(lines_pdf)
    hdr = read_header(lpages[2:])
    raw = parse_lines(lpages[2:], first_page_no=3)
    log(f"{len(raw)} bidlines parsed")
    pp_ids = []
    for pp in raw[0].pps:
        pp_ids.append(pp.id)
    bid = BidPeriodInfo(
        id=hdr["id"],
        start=hdr["start"],
        pp_ids=pp_ids,
        domicile=hdr["domicile"],
        fleet=hdr["fleet"],
        generated=hdr["generated"],
    )
    log("reading trips PDF (slow)")
    tpages = load_pages(trips_pdf)
    trips = parse_trips(tpages[1:], first_page_no=2)
    log(f"{len(trips)} trips parsed ({sum(1 for t in trips if t.openOnly)} open-only)")

    problems = [f"trips: {p}" for p in validate_trips(trips)]
    res = build_lines(raw, trips, bid)
    problems += [f"lines: {p}" for p in res.problems]

    # reverse index: trips PDF `Lines:` list must equal the set of lines that actually use the trip
    used: dict[str, set[int]] = {}
    for ln in res.lines:
        for inst in ln["tripInstances"]:
            used.setdefault(inst["tripId"], set()).add(ln["number"])
    unused = 0
    for t in trips:
        if t.openOnly:
            continue
        if set(t.lines) != used.get(t.id, set()):
            problems.append(
                f"index: trip {t.id} lists lines {sorted(t.lines)} but grids use {sorted(used.get(t.id, set()))}"
            )
        if not used.get(t.id):
            unused += 1
    actual = res.stats.pop("seenDates")

    airports: dict[str, dict] = {}
    if opspecs_pdf:
        ops = load_opspecs(opspecs_pdf)
        for t in trips:
            for d in t.duties:
                for g in d.legs:
                    for code in (g.dep, g.arr):
                        if code not in airports:
                            try:
                                airports[code] = airport_info(code, ops)
                            except KeyError as e:
                                problems.append(f"airports: {e}")
                                airports[code] = {"icao": None, "country": None, "intl": None}
        log(f"{len(airports)} airports, {sum(1 for a in airports.values() if a['intl'])} international")

    bundle = {
        "schema": SCHEMA_VERSION,
        "bidPeriod": {
            "id": bid.id,
            "domicile": bid.domicile,
            "fleet": bid.fleet,
            "seat": seat,
            "tz": "America/New_York",
            "generated": bid.generated,
            "startLocal": f"{bid.start.isoformat()}T03:00",
            "endLocal": f"{(bid.start + timedelta(days=28 * len(pp_ids))).isoformat()}T02:59",
            "pp": [
                {
                    "id": pid,
                    "startLocal": f"{(bid.start + timedelta(days=28 * k)).isoformat()}T03:00",
                    "endLocal": f"{(bid.start + timedelta(days=28 * (k + 1))).isoformat()}T02:59",
                }
                for k, pid in enumerate(pp_ids)
            ],
        },
        "trips": [
            {**t.to_json(), "type": trip_type(t), "reportDatesActual": actual.get(t.id, [])} for t in trips
        ],
        "airports": airports,
        "lines": res.lines,
        "checks": {**res.stats, "problems": len(problems), "tripsWithoutLines": unused},
    }
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf8")
    log(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")
    log(f"checks: {bundle['checks']}")
    for p in problems[:40]:
        print("PROBLEM:", p)
    if len(problems) > 40:
        print(f"... and {len(problems) - 40} more")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m ingest", description=__doc__)
    ap.add_argument("--trips", required=True, help="Trips - Bid NNNN DOM.pdf")
    ap.add_argument("--lines", required=True, help="Bidlines - Bid NNNN DOM.pdf")
    ap.add_argument("--out", required=True, help="output JSON bundle path")
    ap.add_argument("--opspecs", help="OpSpecs C070 PDF (authorized airports) to classify international airports")
    ap.add_argument("--seat", default="CPT")
    ap.add_argument("-q", "--quiet", action="store_true")
    a = ap.parse_args(argv)
    return run(a.trips, a.lines, a.out, a.seat, a.quiet, a.opspecs)


if __name__ == "__main__":
    sys.exit(main())

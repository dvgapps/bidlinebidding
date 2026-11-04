# Bid-package ingest tool

Parses the two PDFs of a UPS bid package (**Bidlines** and **Trips**) into one clean JSON bundle that the
PWA consumes. The PDF parsing is deliberately throwaway: a future raw-data feed only has to emit the same JSON.

```bash
cd tools/ingest
uv sync                                   # Python 3.13, pdfplumber, tzdata, pytest
uv run python -m ingest \
  --trips "../../docs/Trips - Bid 2701 SDFZ.pdf" \
  --lines "../../docs/Bidlines - Bid 2701 SDFZ.pdf" \
  --out ../../data/2701.json              # takes ~4 minutes (the Trips PDF is 330 pages)
uv run pytest                             # unit tests (fast) + bundle checks (need data/2701.json)
```

**Publish to your iPad** (after the Worker is deployed, see `../../worker/README.md`):

```bash
uv run python -m ingest --trips ... --lines ... --opspecs ... --out ../../data/2701.json --publish https://bidline-api.<you>.workers.dev
# or, for a file you already made:
uv run python -m ingest.publish --server https://bidline-api.<you>.workers.dev ../../data/2701.json
```

It asks for your Worker passphrase at a hidden prompt (or reads `BIDLINE_PASSPHRASE`), refuses a package with failed cross-checks, and uploads only the JSON.
On the iPad: Preferences > Bid package > Check server > Load (a **New package** button also appears in the toolbar).

Exit code is non-zero if any cross-check fails; every failed check is printed as `PROBLEM: ...`.

## What is checked (the ingest fails rather than guessing)

| Check | Source of truth |
|---|---|
| Every trip: flown leg block = Block Time; duty-period sums; TAFB = last release - first report; each leg's end time = start + block | Trips PDF, internal |
| Every trip instance in a line grid exists in the Trips PDF, lists that line in `Lines:`, has the same report time (UTC) and credit | Lines vs Trips |
| The grid's start/end calendar dates equal the trip's own report/release instants converted to America/New_York | Lines vs Trips |
| Reverse index: each trip's `Lines:` list equals the set of lines whose grids use it | Trips `Lines:` |
| Per PP, recomputed **CT** equals the printed CT (crossing trips use the parenthesised PP portion) | Bidlines PDF |
| Per PP, recomputed **BT** equals the printed BT (hard check for lines with no PP-crossing trip; counted separately for crossing ones because the PDF's allocation rule at the 03:00 boundary is approximate) | Bidlines PDF |

`DO` / `DD` are carried over exactly as printed. They are **not** recomputed: their definition (UPS/BidPro
day-counting around the 03:00 boundary and rest periods) was not reverse-engineered, and simple rules only matched
~20% of PPs.

## PDF quirks the parsers handle

* **Bidlines**: every row carries clipped text far off-page (x from -1800 to +1400) plus clipped text that lands
  on top of the label column; both garble real words (`CDT:`, `OPP2`). `bidline_page_filter` drops characters
  outside the table frame and, in the label column, any character not on a real label row (offsets measured from the
  weekday header row).
* Trip **bars** (green rectangles) are a continuous timeline: `x = cell_left + 5.02 + (days + local time-of-day fraction) * pitch`
  (fitted on 1,014 instances, max error 0.06 pt). Bar start/end therefore give the exact local report/release date, even
  for trips released at 23:55. Text labels of a trip are left-aligned to its bar, so they are matched by x, not by column.
* Trips crossing the PP1/PP2 edge print their number only in the first PP row; the second row shows an unlabeled bar
  (orphan), so a trip is never double counted.
* **Trips**: two trips per page (split at the page midpoint), the `Open Trips Report` section (page 311+) repeats trips with
  other report dates (merged into `openDates`) plus 81 trips on no bidline (`openOnly`); a very long trip continues
  without a header at the top of the next column/page (continuation words are re-attached); column x positions
  are taken from each block's own header row because the two sections differ by a few points; glued tokens
  (`11h1074Y`, `1h151/1`) are split; `Rest 11h56 S1` carries a rest note.
* "(N trips)" on the report-date line sometimes counts fewer dates than the day-of-week mask expands to
  (3 trips); `reportDatesStated` keeps the stated count and `reportDatesActual` lists the dates really used by lines.

## Output (`data/<bid>.json`, schema 1)

```
{ schema, bidPeriod{id,domicile,fleet,seat,tz,startLocal,endLocal,pp[]},
  trips[]  { id, type: flying|hot-standby|gateway-standby, lines[], reportUtc, reportDates[], reportDatesActual[],
             openDates[], openOnly, duties[{reportUtc, reportMin, releaseMin, duty, block, rest, credit, creditCode,
             legs[{day, flight, kind, dep, arr, startUtc, endUtc, startMin, endMin, block, aircraft, iro, cxn}]}],
             overnights[], credit, creditCode(D|M|T|L), block, duty, tafb, premium, perDiem, landings },
  lines[]  { number, comment, seats{captain,firstOfficer,other}, eligible{captain,firstOfficer},
             type: flying|base-trip|reserve|shiftable-reserve|reserve-recovery|hot-standby|gateway-standby|vto|vtor,
             pp[{id,start,ct,bt,do,dd}] (as printed), days[56 x {date, kind: off|trip|HS|GS|RA|RB|SA|SB|VTO|VTOR, tripId?}],
             tripInstances[{tripId,startDate,endDate,reportUtc,credit,ppCredit}] },
  checks{...} }
```

Times: `startMin`/`endMin`/`reportMin`/`releaseMin` are minutes after the trip's first report instant; combine with a
report date to get UTC instants. Calendar days are domicile-local (America/New_York); the bid period boundary is 03:00.

## Known gaps / next

* `%INTL` needs an international-airport list (not in the PDFs); trips carry the airports so the app can derive it.
* `DO`/`DD` definitions (see above) and the BT allocation rule for trips straddling the PP edge.
* Only one package (2701) has been seen; VTO/VTOR secondary-phase PDFs may need small parser changes.

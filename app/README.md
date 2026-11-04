# Bidline Bidding app (PWA)

React 19 + TypeScript + Vite 8, Zustand, Dexie (IndexedDB), TanStack Virtual, vite-plugin-pwa (Workbox), Vitest.

```bash
cd app
npm install
npm run dev        # http://localhost:5173 ; in dev the import screen offers the 2701 sample
npm test           # vitest (metrics, filters, and the generated data/2701.json when present)
npm run build      # type-check + production build + service worker in dist/
```

Node.js LTS is required (`winget install OpenJS.NodeJS.LTS`).

## Status (milestones 2 and 3)

* Import a bundle (`tools/ingest` output); it is saved in IndexedDB, `navigator.storage.persist()` is requested, and the app works offline.
* **Worksheets**: Bidding, Work 1, Work 2, Excluded (a line lives on exactly one). Order, worksheets and desired dates are saved per bid
  (rankings per seat) in IndexedDB; undo/redo (100 steps); toast with Undo after each move or sort.
* **Table**: virtualized; columns Line, Type, Pay, DO, DD, TB, DTO, TC (PP1 / PP2), %INTL, TAFB, %Wknd, %Sat, %Sun. Tapping a header
  sorts the current worksheet (an explicit, undoable action; manual order is never changed otherwise). Credit shows as decimal hours
  (150.0, BidPro style) or h:mm (toolbar toggle).
  * Pay/TC: a PP with no printed credit (VTO, VTOR, reserve) counts 75:00, so those lines show TC 75/75 and Pay 150.0; Pay floors each PP at 75:00.
  * DO / DD are as printed in the package. %INTL uses OpSpecs C070 countries (Canada and Mexico are not international).
* **Ranking**: grab handle on every row (drag, auto-scroll, multi-line drag when the row is selected), select boxes (header box selects all shown),
  and **Move Lines…**: all VTO / all VTOR / all RSV selection, move to start, to end, above or below a line number, to Work 1 / Work 2 / Excluded, Cancel.
* **Dates off**: + adds a range; start/end use a mini calendar limited to the bid period; picking a start moves the end to the same date, the end can
  never precede the start; ranges sort chronologically; slide a range left (or press Delete) to remove it (Undo in the toast).
  DTO = share of desired dates that are days off on the line (VTO/VTOR days count as off); calendar shows desired dates (yellow = off, red outline = conflict).
* **Export**: space-separated Bidding list (validated: no duplicates, all lines exist), Copy / Download .txt, plus Save/Restore backup (worksheets + dates).
* Calendar view (checkboxes, rank, pay and DTO per row), line sheet, trip sheet as before.

Not yet: drag handles in the calendar view, saved filter presets, Hold (IPA overlay), carry-in and commute scoring, auto-rank, backend sync,
iPad Safari testing (only desktop Chromium/Edge was exercised).

## Preferences: vacation

* **Preferences** (toolbar, and on the import screen so it can be filled in before the package is published): up to 5 vacation date ranges,
  entered like the Dates-off ranges (mini calendar, end never before start, chronological order, slide left to delete). Stored on the device
  across bid periods.
* Every bidline in the calendar view (and the line sheet) is shaded green on vacation days. The toolbar chip / Preferences checkbox hides it;
  the shading is switched back on each time a package is uploaded.

## Absolute numbering and block moves

* The `#` column (and `#n` in the calendar view) is each line's absolute position in its worksheet (1..N), unaffected by filters and
  renumbered after every move.
* **Move Lines…** has *Block by position*: enter From and To (e.g. 34 and 63); the lines in those positions are selected as soon as both
  are valid, then use Move to start / end, **Move before / after** a target (given as a line number or as a position), or move the block
  to another worksheet. The block keeps its internal order.

## Hold (IPA Snapshot)

* Needs the Worker (Preferences > Sync signed in, `IPA_EMPLOYEE_ID` secret set). The app fetches when it opens and when you tap **Hold ⟳**;
  the Worker throttles upstream requests to one per 3 minutes. The toolbar shows the page's own "updated" time, senior-bid count and the line you hold.
* **Hold** column: *Holding* (the line you currently hold), ✓ (holdable at your seniority; ✓ 2 = a multi-award reserve line with 2 left), ✕ (taken by someone
  more senior; the row is dimmed), – (not on your bid, so unknown). Sortable; the **Unavailable** chip hides ✕ lines. The IPA Snapshot is an aid, not authority.
* The last snapshot is kept on the device and dropped when a package for a different bid period is loaded; a warning appears if the snapshot's lines do not match the package.
* Errors are shown, never guessed around: "Snapshot format changed" when the page layout differs, "no bid on file" keeps the previous copy.

## Move Lines: multiple blocks and destination worksheet

1. **Select**: checkboxes, All VTO / VTOR / RSV, and/or up to **five blocks of absolute positions** (e.g. 21-44 and 93-114; **+ Add block**).
   The union is selected as soon as every filled block is valid; moved lines keep their relative order.
2. **Move to worksheet**: Bidding (default), Work 1, Work 2 or Excluded, from any worksheet (so Work 1 / Work 2 / Excluded lines can go back to Bidding).
3. **Place**: To start, To end, or **Move before / after** a **Pref #** (absolute position on the destination worksheet) or a Line #. The hint
   shows which line a position is. Positions count every line on the worksheet, including lines hidden by the view chips.

## Calendar view details

* Absolute position (`#`) has its own column. Date header on a medium grey band; weekends bright pink; the PP1/PP2 boundary is a 4 px high-contrast bar;
  trips are light blue; SA teal and SB orange (RA/RB violet, HS olive, gateway standby purple, vacation green overlay).
* A trip's layover shows the airport on the date the pilot goes to bed away from base (blue after a company deadhead, red after a commercial flight, LIMO or BUS,
  dark otherwise) and `L/O` on the following whole days of a multi-day layover. Calendar days are domicile-local (America/New_York).
* Tap a trip day: the BidPro-style trip popup (DAY = UTC weekday and date, DEP shows the local weekday+hour and Zulu time, TOG, BLK, per-duty summary
  with duty, credit and layover, footer with credit, block, landings and TAFB; IRO shown; Cat. omitted; print and previous/next trip of the line).
  Tap anywhere else in the row: the line details.

## Carry-in (previous bid period)

* **Preferences > Carry-in trips**: enter the line you were awarded in the previous bid period and tap **Use this line**; the trips of that line that are
  still running when the new period starts become the carry-in dates (needs the previous package to be stored on the device, which it is once it has been
  loaded). Or add/edit/delete the date ranges by hand (same pickers and slide-to-delete as Dates off). Saved per bid period and synced like the other settings.
* Orange (`#f5b333`) on every line for those dates (and an orange bar in the date header); a line with duty on a carry-in date gets a 1px `#2b3942`
  conflict box. Desired-dates conflicts use the same 1px box.

## Palette (CSS variables in `src/index.css`)

trip `#168aad` (text `#fafafa`), desired dates off `#fbf4a2`, carry-in `#f5b333`, conflict box `#2b3942` (1px), calendar row `#d1d1d5`, row separator `#ffffff`,
pop-ups `#f2f2f6` (dark text in both themes), weekends `#9dabb4`, date row `#77726f`, header / grab bar / tick boxes / `#` and Line columns `#2b3942`.

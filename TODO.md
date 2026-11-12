# BidlineBidding to-do list

Last updated 11 Nov 2026. "Discuss" means: talk it over with the owner before building anything.

## Waiting / recurring
- [ ] Weekly check (Mondays, scheduled task `ipad-header-fade-weekly-check`): iPadOS 27 release notes, GitHub, Reddit and Apple developer sources only; has the status-bar fade over the top of the installed app been fixed, and are there new workarounds? See `IPAD-DISPLAY-NOTES.md`. The owner is updating to iPadOS 27.2.1 (11 Nov 2026): look at the top of the app first, re-add it to the Home Screen if needed.
- [ ] BP2702 package expected around 24 Dec 2026: ingest and publish, load it, enter the 2701 awarded line, check the carry-in dates.

## Features from the original briefing (discuss)
- [ ] Saved filter presets
- [ ] Commute planner (drive time, nap rules, latest departure from home per work block, crashpad option)
- [ ] Key-dates panel (bid timeline) and the later bid phases (secondary VTO/BRL, tertiary VTOR/RDG)
- [ ] Shiftable-reserve window display
- [ ] Deviation planner for commercial deadheads (contract Article 13.H.5-13.H.7)
- [ ] Weighted auto-rank with an explanation ("why this line scored 82"); the multi-level Sort pane may already be enough

## Suggestions for sorting and filtering a few hundred lines (discuss)
- [ ] Number-range filters: credit, days off, commutes, TAFB, DTO at least N%
- [ ] "Conflict-free only" shortcut: hide lines that cover any desired date off
- [ ] Star, flag or note on a line (and a "starred only" filter)
- [ ] Tiers: dividers in the Bidding list (for example A / B / safety) with a count per tier
- [ ] Compare two or three lines side by side
- [ ] Pre-export check: warn when the last lines on Bidding are not holdable (a safety line), when unavailable lines are still ranked, or when lines you starred are missing
- [ ] Why-this-order: show the value of the active sort criteria on each row
- [ ] Saved sort recipes (a named set of criteria, one tap to apply)
- [ ] Snapshot of the Bidding order before each export, so you can compare or go back
- [ ] Print or PDF of the ranked list

## Housekeeping
- [ ] `app/README.md` "Not yet" list is stale (Hold, carry-in and the Sort pane now exist)
- [ ] `BRIEFING.md` (local only) still describes PocketBase, replaced by the Cloudflare Worker

## Decided / parked
- Pinch zoom: leave as it is (11 Nov 2026).
- Handing the app to co-workers: only a possibility; discuss first (the Worker, Hold and publishing are single-user).
- iOS "turn off Airplane Mode" pop-up on offline launch: system prompt, left alone.

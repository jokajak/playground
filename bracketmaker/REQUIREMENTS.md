# Bracket Maker — Requirements & Tracking

Living checklist of what Bracket Maker does today and what's planned. Status
keys: ✅ done · 🔜 planned (agreed, not built) · 💡 idea (needs decisions).

---

## ✅ Implemented

| # | Requirement | Notes |
|---|-------------|-------|
| R1 | Single-elimination brackets | Configurable participant count. |
| R2 | Configurable size: 2 / 4 / 8 / 16 / 32 / 64 / 128 | Dropdown selector (minimum 2). A 128-bracket seeds four quadrants of 32. |
| R3 | Title slot | Typed title at the top of the sheet; prints what you enter. |
| R4 | Printable, blank brackets | Blank lines for every matchup to fill in by hand. |
| R5 | Print layout | Controls hidden; landscape `@page`; the bracket is auto-scaled (on `beforeprint`) to fit a single page, so even a 64-bracket with play-ins prints whole without being cut off. The largest sizes still fit on one page but scale down past readable — 128 in either layout, and vertical from 16 participants up (it stacks every entry in one tall column rather than splitting into two shorter halves), are screen-first. |
| R6 | Two-sided ("March Madness") layout | Left half flows right, right half mirrors it, champion in the centre. |
| R6a | Smooth, connected connectors | Each connector is one rounded shape; arms, joiner and stub are colinear so lines never break. |
| R7 | Static hosting | No build step; served from the repo root on GitHub Pages. |
| R8 | Fillable entries | First-round slots are text inputs — type names, or leave blank to handwrite. On screen each shows a visible field box; printing strips the box and keeps only the writing line. |
| R8a | Pick-the-winner dropdowns | Every later round and the champion is a dropdown that selects the winner from its two feeding competitors. It stores which side advanced, so a name typed or fixed upstream propagates forward automatically. Prints as plain text on the line. |
| R9 | Quadrant seed numbers | First-round slots are numbered with standard tournament seeding (top seed vs lowest seed) within each quadrant, March Madness style — so seeds repeat across the up-to-four quadrants. Shown on the outer edge of each entry and printed. The 16-per-quadrant ordering matches the traditional NCAA region layout. |
| R10 | Save / load | Auto-saves to the browser (localStorage) so work survives a refresh. **Save** downloads the bracket as a JSON file and **Load** imports one, to move a bracket between devices. **Clear** resets the title and entries. If the browser won't store anything (private window, blocked site data, full storage), the page says so in place of the auto-save hint rather than silently promising a save it can't make. |
| R10a | Edits survive a redraw | Changing size, layout or any toggle rebuilds the bracket but keeps what you've typed. Every field carries a stable key naming its place in the tree (leaf index / round + first leaf), and state is saved and restored by those keys, so a slot keeps its contents through a rebuild. Only values whose slot no longer exists are dropped — entries past the end of a smaller bracket, or a play-in seed's typed name once that seed becomes a play-in dropdown. Save files written before this (version ≤ 6) stored plain document-order arrays and still load. |
| R11 | Wildcard play-ins | A **Wildcard play-ins** toggle. When on, the lowest seed in each quadrant (the 16-seed in a 64-bracket) is decided by a two-way play-in whose winner faces the 1-seed. The seed slot becomes a winner dropdown; the two competitors are drawn as a small fork in the outer margin and print cleanly. |
| R12 | 3rd place match (optional) | A **3rd place match** toggle. When on, a consolation line sits below the champion in the centre column: a dropdown between the two beaten semifinalists (the side each half's final did *not* advance), so it tracks the semifinal picks automatically. Disabled for a 2-bracket, which has no semifinals. The champion stays on the bracket's centre line. |
| R13 | Horizontal / vertical layout | A **Layout** selector. *Horizontal* is the original two-sided design: halves flow left and right into a centre champion. *Vertical* is a single, non-mirrored bracket — round 1 lists straight down the left edge, narrowing rightward into one champion (and any 3rd place) on the right. Same seeding, same dropdowns, same save file; only the assembly changes. Switching layout redraws the bracket, same as changing size or wildcards — and keeps your entries (R10a). |
| R14 | Score tracking (optional) | A **Track scores** toggle. When on, every match — including play-ins, the champion match, and 3rd place — gets a small pair of number boxes above its winner line for each side's score. Purely a note: it's saved/loaded/printed alongside everything else, but never drives the winner dropdown, so entering a score doesn't pick a winner for you. |
| R15 | Match date & time (optional) | A **Match date & time** toggle. When on, every match — including play-ins, the champion match and 3rd place — gets a date-and-time picker below its winner line, using the browser's native `datetime-local` control. Like scores it's purely a note: saved, loaded and printed with everything else, and it never affects the bracket. Filled times print as plain text; empty ones print as a blank line to write on by hand. Works alongside score tracking (scores sit above the line, times below). |

---

## 🔜 Planned

_Nothing actively queued._

---

## Out of scope (for now)

- Double elimination / full consolation brackets (beyond the 3rd place match)
- Byes or non-power-of-two counts
- Accounts or cloud sync

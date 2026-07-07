# Bracket Maker — Requirements & Tracking

Living checklist of what Bracket Maker does today and what's planned. Status
keys: ✅ done · 🔜 planned (agreed, not built) · 💡 idea (needs decisions).

---

## ✅ Implemented

| # | Requirement | Notes |
|---|-------------|-------|
| R1 | Single-elimination brackets | Configurable participant count. |
| R2 | Configurable size: 2 / 4 / 8 / 16 / 32 / 64 | Dropdown selector (minimum 2). |
| R3 | Title slot | Typed title at the top of the sheet; prints what you enter. |
| R4 | Printable, blank brackets | Blank lines for every matchup to fill in by hand. |
| R5 | Print layout | Controls hidden; landscape `@page`; the bracket is auto-scaled (on `beforeprint`) to fit a single page, so even a 64-bracket with play-ins prints whole without being cut off. |
| R6 | Two-sided ("March Madness") layout | Left half flows right, right half mirrors it, champion in the centre. |
| R6a | Smooth, connected connectors | Each connector is one rounded shape; arms, joiner and stub are colinear so lines never break. |
| R7 | Static hosting | No build step; served from the repo root on GitHub Pages. |
| R8 | Fillable entries | First-round slots are text inputs — type names, or leave blank to handwrite. On screen each shows a visible field box; printing strips the box and keeps only the writing line. |
| R8a | Pick-the-winner dropdowns | Every later round and the champion is a dropdown that selects the winner from its two feeding competitors. It stores which side advanced, so a name typed or fixed upstream propagates forward automatically. Prints as plain text on the line. |
| R9 | Quadrant seed numbers | First-round slots are numbered with standard tournament seeding (top seed vs lowest seed) within each quadrant, March Madness style — so seeds repeat across the up-to-four quadrants. Shown on the outer edge of each entry and printed. The 16-per-quadrant ordering matches the traditional NCAA region layout. |
| R10 | Save / load | Auto-saves to the browser (localStorage) so work survives a refresh. **Save** downloads the bracket as a JSON file and **Load** imports one, to move a bracket between devices. **Clear** resets the title and entries. |
| R11 | Wildcard play-ins | A **Wildcard play-ins** toggle. When on, the lowest seed in each quadrant (the 16-seed in a 64-bracket) is decided by a two-way play-in whose winner faces the 1-seed. The seed slot becomes a winner dropdown; the two competitors are drawn as a small fork in the outer margin and print cleanly. |

---

## 🔜 Planned

_Nothing actively queued._

---

## Out of scope (for now)

- Double elimination / consolation brackets
- Byes or non-power-of-two counts
- Score / result tracking
- Accounts or cloud sync

# Bracket Maker

Generate printable single-elimination tournament brackets. Pick a size
(2 to 128 participants) and a layout, add a title, and either type entries in
or print a blank bracket to fill in by hand. No server, no build step, no
accounts.

## Use it

**https://jokajak.github.io/playground/bracketmaker/**

## How to run locally

Because the page loads ES modules, open it through a tiny static server rather
than via `file://`:

```sh
cd bracketmaker
python3 -m http.server 8000
# then visit http://localhost:8000/
```

(Opening `index.html` directly with `file://` will load the page but the
bracket won't render, due to browser module-loading rules.)

## How to use

1. Choose the number of **Participants** (2 / 4 / 8 / 16 / 32 / 64 / 128).
2. Choose a **Layout** — Horizontal or Vertical (see below).
3. Type a **title** for the bracket (optional).
4. Type names into the slots, or leave them blank to fill in by hand.
5. Click **Print bracket** — it automatically scales the whole bracket onto a
   single landscape page. Leave the print dialog's scale on **Default / 100%**
   (no need to choose "Fit to page").

The bracket is two-sided (March Madness style) with the champion in the centre,
and the first-round slots are numbered with standard tournament **seeds** within
each quadrant (top seed vs lowest seed). A 128-bracket splits into four
quadrants of 32.

Type the competitors into the first-round slots; each later round (and the
champion) is a **dropdown that picks the winner** from its two feeding
competitors — so you advance teams by selecting, not retyping, and fixing a name
flows forward automatically. On screen each slot is a visible, editable field;
when printing, the field boxes and dropdown arrows drop away and only the writing
lines remain — so you can fill it in on screen or print a blank sheet and write
players in by hand.

### Layout: horizontal or vertical

**Horizontal** is the classic sheet: two halves flow left and right into the
champion in the middle (the two-sided "March Madness" look). **Vertical** is a
single, non-mirrored bracket — round 1 is listed straight down the left edge,
and every round narrows rightward into one champion box (with any 3rd place
match beside it) on the right, the way most bracket-generator sites lay out a
single-elimination sheet. Everything else is identical: same seeds, same
dropdowns, same save file — only the assembly changes.

Switching layout redraws the bracket (same as changing size or toggling
wildcards), but your entries, picks, scores and times come with it — see
[Saving your work](#saving-your-work). Vertical brackets get tall
rather than wide (one row per participant, all in a single column instead of
two shorter halves), so anything past 16 participants suits a wide screen or a
long scroll rather than print — it still fits onto a single printed page, just
scaled small. 128 is screen-first in either layout.

### Wildcard play-ins

Toggle **Wildcard play-ins** to add a play-in for the lowest seed in each
quadrant (the 16-seed in a 64-bracket): two wildcard competitors battle, and the
winner faces the 1-seed. The play-in is drawn as a small fork just outside the
bracket and works like any other matchup — pick the winner and it advances.

### 3rd place match

Toggle **3rd place match** to add a consolation line below the champion. Its two
competitors are the beaten semifinalists — whoever each half's final did *not*
advance — so it follows your semifinal picks automatically; just choose which of
them takes 3rd. It prints with the champion in the centre of the sheet. (A
2-participant bracket has no semifinals, so the toggle is disabled there.)

### Match date & time

Toggle **Match date & time** to add a date-and-time picker to every match,
below its winner line — including play-ins, the championship and the 3rd place
match. It's just a note attached to the match: it's saved, loaded and printed
with everything else and never affects who advances. Times you fill in print as
plain text; ones you leave empty print as a blank line, so you can print the
schedule half-filled and pencil in the rest. It pairs with **Track scores** —
scores sit above each winner line, times below.

### Saving your work

Your bracket is saved in the browser automatically, so a refresh won't lose it.
To move a bracket between devices, use **Save** (downloads a `.json` file) and
**Load** (imports one). **Clear** empties the title and entries.

Changing **Participants**, **Layout** or any toggle rebuilds the bracket, but
keeps what you've already typed — each slot holds its contents through the
rebuild. The only things that can't survive are values with nowhere left to go:
entries past the end of a smaller bracket (shrinking 32 → 16 drops the last 16,
and growing back doesn't bring them home), and a seed's typed name when you
switch that seed to a wildcard play-in, since the text box becomes a dropdown.

If your browser refuses to store anything — a private window, blocked site data,
or storage that's full — the page replaces the auto-save hint with a warning, so
you know to use **Save** instead of trusting a refresh.

## Roadmap

- [x] Configurable single-elimination brackets (2/4/8/16/32/64/128)
- [x] Title slot
- [x] Print-friendly layout
- [x] Two-sided (March Madness) layout
- [x] Type participant names directly into the slots
- [x] Pick round winners from the two feeding competitors
- [x] Per-quadrant seed numbers
- [x] Save / load brackets (auto-save + JSON file export/import)
- [x] Wildcard play-ins for the lowest seed in each quadrant
- [x] Optional 3rd place match between the beaten semifinalists
- [x] Horizontal or vertical layout
- [x] Optional score tracking per match
- [x] Optional date & time per match
- [x] Keep entries when resizing, switching layout or toggling options

See `REQUIREMENTS.md` for the full status checklist.

## Implementation

A single `index.html` (markup + styles) plus `src/bracket.js`, which builds the
bracket with a recursive flexbox layout so the connector lines stay aligned at
any size. See `PLAN.md` for the design notes.

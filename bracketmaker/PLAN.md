# Bracket Maker — Design Doc

## Overview

A static web app for generating printable single-elimination tournament
brackets. Choose a participant count and a title, then print a blank bracket
to fill in by hand. No server, no build step — served from the repo root on
GitHub Pages (same model as jeopardymaker).

---

## Scope

> See `REQUIREMENTS.md` for the live status checklist.

### Built
- Single-elimination brackets for **2, 4, 8, 16, 32, or 64** participants.
- A **title** slot at the top (typed, prints what you enter).
- **Two-sided ("March Madness") layout**: two halves mirror each other with the
  champion in the centre.
- **Fillable entries**: first-round slots are text inputs — type names, or leave
  blank to handwrite. On screen each is a visible field box; print keeps the line.
- **Pick-the-winner dropdowns**: later rounds and the champion select the winner
  from their two feeders, storing the chosen side so upstream edits propagate.
- **Per-quadrant seed numbers** in standard tournament order.
- **Wildcard play-ins** (toggle): the lowest seed in each quadrant is decided by
  a two-way play-in whose winner faces the 1-seed.
- **Save / load**: auto-save to localStorage plus JSON file export/import.
- **Print-friendly** output: blank matchup lines to handwrite on, controls
  hidden, landscape `@page`.

---

## Layout approach

The bracket is built recursively in `src/bracket.js`:

```
build(rounds):
  rounds === 0  -> a leaf slot (first-round entrant)
  otherwise     -> a .match = [ .feeders | .connector | .outcol ]
                     .feeders  = build(rounds-1) ×2  (top + bottom halves)
                     .outcol   = the winner slot, vertically centred
```

Because each `.feeders` is a flex column of two equal subtrees, and each
`.outcol` centres its single slot against the full height of those subtrees,
**flexbox does all the vertical alignment** — every connector line meets the
midpoint between the two slots that feed it, at any size, with no magic-number
spacing.

### Two-sided layout
The full bracket is `[ left half | champion | right half ]`. Each half is a
sub-bracket of `N/2` entrants built with `build(log2(N) - 1)`, producing one
finalist. The right half reuses the same builder, mirrored with CSS
(`flex-direction: row-reverse` plus moving the connector's vertical joiner to
the other side), and the champion slot sits in the centre between the two
finalists. The bracket is therefore half as tall as the participant count.

### Connector lines
Each `.connector` is drawn as a single rounded shape: a `::before` box supplies
the two arms (at 25% / 75%, where the feeder slots sit) joined by a vertical bar
with rounded corners, and a `::after` is the stub from the bar's middle to the
winner slot. Every writing line is an `<input>` (leaf) or `<select>` (winner)
whose bottom border is anchored to its band (`bottom: 50%`); the arms and stub
are nudged so all the horizontal lines are colinear, so the bracket never shows
a step or gap. The right half reuses the same connector flipped with
`transform: scaleX(-1)`.

The smallest bracket (2) has no connectors — each half is a single entrant line
that runs straight into the champion in the centre.

### Seeding
The bracket is split into up to four quadrants (`Math.min(4, size/2)` regions);
each is numbered `1..quadrantSize` in standard tournament order so the top seed
meets the lowest seed. Leaf slots in document order are top-to-bottom, left half
then right half, which maps cleanly onto the quadrants; `assignSeeds` walks them
and drops a `.seed` label on the outer edge (mirrored for the right half).

### Wildcard play-ins
The lowest seed in each quadrant always sits at index 1 of the quadrant in
standard seeding (the top seed's opening opponent), so `build` is given the set
of those leaf indices and swaps in a `playinLeaf`: the seed slot becomes a winner
`<select>` fed by two competitor inputs, with the pair drawn as a small fork
(`.playin`) absolutely positioned in the bracket's reserved outer padding. This
keeps the main grid pixel-aligned — the fork lives entirely in the margin and
reuses the normal connector.

### Printing
On `beforeprint`, the bracket is measured and `transform: scale()`-d to fit a
conservative landscape printable area (≈960×600 px, safe for US Letter and A4);
the host is sized to the scaled box with `overflow: hidden` so the (unchanged)
layout box can't spill onto extra pages. `afterprint` restores everything. This
makes even a 64-bracket with play-ins print as one whole page.

### Winner selection
`build` returns each subtree's value-holder (the leaf `<input>` or winner
`<select>`). Each winner select stores its two feeders on `__feeders`; its value
is the chosen feeder index. `resolveValue` walks those references to the live
name, and `syncWinners` refreshes every select's option labels — so typing or
re-picking upstream flows forward without copying strings around.

### Persistence
The state is `{ size, title, entries[], picks[] }`: `entries` are the leaf input
values and `picks` are each winner/champion select's chosen side, both in
document order — deterministic for a given size, so re-rendering and re-filling
round-trips losslessly. It auto-saves to `localStorage` on every edit and can be
exported/imported as a JSON file.

---

## Files

- `index.html` — controls (size, title, print, save/load), the printable sheet,
  styles, and a small module that wires the controls to `renderBracket`.
- `src/bracket.js` — `renderBracket(container, { size })` and the recursive
  builder.

---

## Out of scope (v1)

- Double elimination / consolation brackets
- Seeding, byes, or non-power-of-two counts
- Scores / results tracking
- Accounts or cloud sync

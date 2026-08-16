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
- Single-elimination brackets for **2, 4, 8, 16, 32, 64, or 128** participants.
- **Horizontal or vertical layout** (toggle): *horizontal* is the two-sided
  ("March Madness") design below; *vertical* is a single, non-mirrored flow —
  round 1 listed straight down the left edge, narrowing rightward to one
  champion on the right.
- A **title** slot at the top (typed, prints what you enter).
- **Two-sided ("March Madness") layout**: two halves mirror each other with the
  champion in the centre.
- **Fillable entries**: first-round slots are text inputs — type names, or leave
  blank to handwrite. On screen each is a visible field box; print keeps the line.
- **Pick-the-winner dropdowns**: later rounds and the champion select the winner
  from their two feeders, storing the chosen side so upstream edits propagate.
- **Per-quadrant seed numbers** in standard tournament order.
- **Quadrant titles** (toggle): an editable name per quadrant, set on its side
  down the bracket's outer edge beside that quadrant's first-round entries.
- **Wildcard play-ins** (toggle): the lowest seed in each quadrant is decided by
  a two-way play-in whose winner faces the 1-seed.
- **3rd place match** (toggle): a consolation line below the champion, contested
  by the two beaten semifinalists.
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

### Orientation
Both layouts build the exact same two `size/2` subtrees (`build(halfRounds)`,
called twice) and the exact same champion/3rd-place box (`finalCenter`) —
they only differ in how `renderBracket` assembles those pieces:

- **Horizontal** wraps the two subtrees in `.half.left` / `.half.right`, mirrors
  the right one with CSS (`flex-direction: row-reverse`, the connector flipped
  `scaleX(-1)`), and puts the champion column between them. This is the
  standard two-sided March Madness look.
- **Vertical** skips the mirroring entirely: both subtrees are appended
  straight into one shared `.feeders` column, exactly like an ordinary
  `.match` one level up — the only difference from what `build` itself would
  do is that the champion/3rd-place box replaces the plain winner slot in the
  final `.outcol`. Nothing is transposed or rotated; it's the same left-to-right
  flow as horizontal, just not split and mirrored into two halves. That's what
  makes round 1 read top-to-bottom as one list and the champion land on the
  right, instead of the two-sided design's left/right convergence.

Because both subtrees and the centre box are identical either way, switching
orientation only changes assembly, not the underlying tree — seeding, the
persisted field keys and the winner-select wiring are the same in both. (A
structural change like this redraws the bracket either way, the same as
changing size or toggling wildcards; because every field is keyed by its place
in the tree, the redraw carries typed entries across — see Persistence.) A `.bracket.vertical` bracket is also taller than its
horizontal counterpart for the same participant count: horizontal's two
halves sit side by side (bracket height ≈ `size/2 * row-h`), while vertical
stacks all `size` leaves in one column (bracket height ≈ `size * row-h`) — the
only CSS the vertical mode needs beyond what horizontal already defines.

### Seeding
The bracket is split into up to four quadrants (`quadrantCount(size)` regions —
four whenever there is room, fewer only for the smallest brackets; seeding,
play-ins and quadrant titles all divide it the same way);
each is numbered `1..quadrantSize` in standard tournament order so the top seed
meets the lowest seed. A 128-bracket therefore needs a 32-seed region ordering,
which is derived rather than typed out: each seed in the 16 order is followed by
its opening opponent (`33 - seed`), extending the existing shape one round
deeper. Leaf slots in document order are top-to-bottom, first subtree then
second, which maps cleanly onto the quadrants regardless of orientation;
`assignSeeds` walks them and drops a `.seed` label on the outer edge (mirrored
only where `.half.right` actually exists, i.e. only in horizontal mode).

### Quadrant titles
A quadrant is just the subtree spanning `quadrantSize(size)` leaves, so `build`
records the nodes whose leaf span matches as it comes back up the recursion —
`renderBracket` then hangs a `.quadrant-title` off each one. Keying the label
this way (rather than off the DOM after assembly) means the same quadrant gets
the same title in either orientation, since both build the identical tree.

The label is absolutely positioned against its quadrant's box, on the side away
from the centre — `right: 100%`, flipped to `left: 100%` under `.half.right`,
which is also the only thing that distinguishes the two halves here. Turning
titles on therefore never moves the tree; the bracket reserves the width in its
own padding, stacking with the play-in margin when wildcards are on (the titles
step outside the forks, which reach into that same margin).

The text runs down the edge with `writing-mode: vertical-rl`, plus a half turn
on the left-hand copies so they read bottom-to-top. In that writing mode the
block axis runs right-to-left, so `border-block-start` lands on the outer edge in
both halves — the vertical counterpart of the underline every other slot has,
and what an empty title prints as.

The toggle is disabled below 4 participants (`supportsQuadrantTitles`), where
the bracket is one match with no quadrants to tell apart.

### Wildcard play-ins
The lowest seed in each quadrant always sits at index 1 of the quadrant in
standard seeding (the top seed's opening opponent), so `build` is given the set
of those leaf indices and swaps in a `playinLeaf`: the seed slot becomes a winner
`<select>` fed by two competitor inputs, with the pair drawn as a small fork
(`.playin`) absolutely positioned in the bracket's reserved outer padding. This
keeps the main grid pixel-aligned — the fork lives entirely in the margin and
reuses the normal connector.

### 3rd place match
Each half's final *is* a semifinal, so the two beaten semifinalists are simply
the sides those two winner selects did not pick. Rather than duplicate state,
the 3rd-place select is fed two `loserOf(sel)` proxies — `{ __loserOf: sel }` —
and `resolveValue` reads the *unchosen* feeder (`1 - value`) through them. The
consolation line therefore follows the semifinal picks with no extra wiring, and
blanks itself again whenever a semifinal is un-picked.

It renders as a second labelled box in the centre column, below the champion.
The champion must stay level with the two finalist lines, so `.final-center`
gains a `::before` counterweight of exactly the 3rd-place block's height (gap +
box) — keeping the flex column's centred item centred, with no magic numbers and
nothing positioned outside the flow (so the print fitter still measures it).

The toggle is disabled below 4 participants: a 2-bracket has no semifinals, and
`renderBracket` guards on `supportsThirdPlace(size)` as well.

### Printing
On `beforeprint`, the bracket is measured and `transform: scale()`-d to fit a
conservative landscape printable area (≈960×600 px, safe for US Letter and A4);
the host is sized to the scaled box with `overflow: hidden` so the (unchanged)
layout box can't spill onto extra pages. `afterprint` restores everything. This
makes even a 64-bracket with play-ins print as one whole page. The largest
combinations still fit on one page, but scale past readable to do it: 128 in
either layout, and vertical from 16 participants up — its single tall column
(vs. horizontal's two shorter side-by-side halves) shrinks fast against a
landscape page's height — are screen-first.

### Winner selection
`build` returns each subtree's value-holder (the leaf `<input>` or winner
`<select>`). Each winner select stores its two feeders on `__feeders`; its value
is the chosen feeder index. `resolveValue` walks those references to the live
name, and `syncWinners` refreshes every select's option labels — so typing or
re-picking upstream flows forward without copying strings around.

### Persistence
The state is `{ size, orientation, wildcard, thirdPlace, trackScores, trackTimes,
quadrantTitles, title, fields{} }`. `fields` maps every value-holding element's
`data-key` to its value, covering entries, winner picks, scores, match times and
quadrant titles in one map.

The keys name a slot's **place in the tree**, not its place in the document:
`e3` is leaf 3, `w2:8` the winner of the 2-round match over leaves 8–11,
`champion` / `third` the centre boxes, `q0`..`q3` the quadrant titles, with
`#s0` / `#s1` / `#t` suffixes for a match's scores and time (see KEYS in
`bracket.js`). That choice is what makes a redraw non-destructive: because both
orientations build the same tree and a leaf keeps its index as the bracket
grows, re-rendering and re-filling by key carries the bracket's contents across
a resize, a layout flip or a toggle. The same map is the save format, so a file
saved from one layout opens in the other.

A rebuild can only carry over what it can see, so the page also keeps a
`remembered` map: every redraw folds the live fields into it (live wins, so
emptying a box on screen empties it here too) and re-fills from the whole map
afterwards. A value whose slot has just gone — a quadrant title with the toggle
off, an entry past the end of a smaller bracket, a seed's name once it becomes a
play-in dropdown — therefore survives until the user clears it, and since the
map *is* what gets saved, it survives a reload too.

New fields are additive by construction: an older copy of the page ignores keys
it has no slot for, and a bracket saved before a field existed simply has
nothing under that key. That is all `quadrantTitles` needed to be backwards
compatible — an absent flag reads as off, so old saves open exactly as before.

Versions ≤ 6 instead stored `entries[]` / `picks[]` / `scores[]` as document-order
arrays, which round-tripped only for an identical size and toggle combination —
and left nothing to re-fill from when the shape changed. Those arrays are still
read (for old saves) and still written alongside `fields` (so a file saved here
still opens in an older copy of the page).

It auto-saves to `localStorage` on every edit and can be exported/imported as a
JSON file. Storage can be absent (private windows, blocked site data) or full;
both surface as a warning in the controls rather than a silent no-op, since the
page otherwise claims work is being saved when it isn't.

---

## Files

- `index.html` — controls (size, title, print, save/load), the printable sheet,
  styles, and a small module that wires the controls to `renderBracket`.
- `src/bracket.js` — `renderBracket(container, { size, orientation, wildcard,
  thirdPlace, trackScores, trackTimes, quadrantTitles })` and the recursive
  builder.

---

## Out of scope (v1)

- Double elimination / consolation brackets
- Seeding, byes, or non-power-of-two counts
- Scores / results tracking
- Accounts or cloud sync

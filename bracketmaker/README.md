# Bracket Maker

Generate printable single-elimination tournament brackets. Pick a size
(2, 4, 8, 16, 32, or 64 participants), add a title, and either type entries in
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

1. Choose the number of **Participants** (2 / 4 / 8 / 16 / 32 / 64).
2. Type a **title** for the bracket (optional).
3. Type names into the slots, or leave them blank to fill in by hand.
4. Click **Print bracket** — it automatically scales the whole bracket onto a
   single landscape page. Leave the print dialog's scale on **Default / 100%**
   (no need to choose "Fit to page").

The bracket is two-sided (March Madness style) with the champion in the centre,
and the first-round slots are numbered with standard tournament **seeds** within
each quadrant (top seed vs lowest seed).

Type the competitors into the first-round slots; each later round (and the
champion) is a **dropdown that picks the winner** from its two feeding
competitors — so you advance teams by selecting, not retyping, and fixing a name
flows forward automatically. On screen each slot is a visible, editable field;
when printing, the field boxes and dropdown arrows drop away and only the writing
lines remain — so you can fill it in on screen or print a blank sheet and write
players in by hand.

### Wildcard play-ins

Toggle **Wildcard play-ins** to add a play-in for the lowest seed in each
quadrant (the 16-seed in a 64-bracket): two wildcard competitors battle, and the
winner faces the 1-seed. The play-in is drawn as a small fork just outside the
bracket and works like any other matchup — pick the winner and it advances.

### Saving your work

Your bracket is saved in the browser automatically, so a refresh won't lose it.
To move a bracket between devices, use **Save** (downloads a `.json` file) and
**Load** (imports one). **Clear** empties the title and entries.

## Roadmap

- [x] Configurable single-elimination brackets (2/4/8/16/32/64)
- [x] Title slot
- [x] Print-friendly layout
- [x] Two-sided (March Madness) layout
- [x] Type participant names directly into the slots
- [x] Pick round winners from the two feeding competitors
- [x] Per-quadrant seed numbers
- [x] Save / load brackets (auto-save + JSON file export/import)
- [x] Wildcard play-ins for the lowest seed in each quadrant

See `REQUIREMENTS.md` for the full status checklist.

## Implementation

A single `index.html` (markup + styles) plus `src/bracket.js`, which builds the
bracket with a recursive flexbox layout so the connector lines stay aligned at
any size. See `PLAN.md` for the design notes.

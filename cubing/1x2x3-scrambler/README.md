# 1×2×3 Character Cube Scrambler

A scrambler for the 1×2×3 "domino" puzzle (3 layers × 2 halves × 1 deep),
rendered as a 6-piece character cube instead of plain stickers.

Uses the same random-state approach as the WCA scramblers for small puzzles:
the full 96-state space is enumerated with a BFS from solved, a state is
sampled uniformly at random, and the optimal move sequence to reach it is
shown — so scrambles are always ≤ 6 moves (God's number for this puzzle) and
every state is equally likely, unlike a random sequence of moves.

## Use it

Open `index.html` directly in your browser. No server, no build step.

- **Space** — new scramble
- **C** — copy the scramble to the clipboard
- Difficulty selector — pick a target scramble depth (3–6), or leave it on
  "Random state" for the puzzle's true uniform distribution

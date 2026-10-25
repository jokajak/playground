# Chess Game Review

Review your Lichess games with a coach. Every move gets a rating
(brilliant, great, best, … mistake, blunder) and a plain-language explanation,
the review walks you through the key moments, and when you went wrong it asks
you to find a better move on the board before showing the answer.

Analysis runs entirely in your browser with Stockfish 19. Nothing is sent
anywhere except the requests to Lichess for your games.

## Use it

**https://jokajak.github.io/playground/chessreview/**

## How to run locally

The page has no build step, but it uses ES modules and a Web Worker, so it
has to be served over HTTP rather than opened as a file:

```sh
cd chessreview
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## How to use

1. **Load a game**, one of three ways:
   - Enter your **Lichess username** to list your 20 most recent finished
     games, then pick one. Your colour is detected from the game.
   - Paste a **game link or ID** (`https://lichess.org/abcd1234`, or
     `…/abcd1234/black` to review as Black).
   - Paste a **PGN** from anywhere and say which side you played.
2. **Pick a depth.** Standard (14) usually gets through a 40-move game in
   under a minute; Quick (12) is several times faster, and Deep (18) can take
   many minutes on a sharp game. Finished analyses are cached in your
   browser, so reopening a game is instant.
3. **Review.** The coach opens with your accuracy and a count of each kind of
   move, then **Start the review** steps through the key moments: your
   brilliant, great and inaccurate moves, mistakes and blunders, plus your
   opponent's mistakes (so you can see whether you punished them).
   - On your own mistakes, **Find a better move** turns the board back to the
     position before it. Make a move and the engine grades it: the best move,
     another good one, an improvement that still falls short, or not this one.
     After a wrong try you can ask it to **show** the answer.
   - **Show best line** and **Show the threat** play out the engine's line and
     the reply your move allowed; step through them with ◀ ▶.
   - On the board, a green arrow marks the best move and a red arrow the
     opponent's strongest reply to a mistake.
   - Click the evaluation graph or the move list to jump anywhere. Keyboard:
     ← → step, Home/End jump, F flips the board.

### How moves are rated

Each position is searched with three candidate lines (MultiPV 3). A move is
rated by how much it lowers the mover's winning chances, using Lichess's
centipawn-to-win-percentage curve:

| Rating | Drop in win % |
|---|---|
| Blunder | 20 or more |
| Mistake | 10–20 |
| Inaccuracy | 5–10 |
| Good | 2–5 |
| Excellent | under 2 |
| Best | the engine's top move |

On top of that:

- **Great**: the top move, when every alternative was at least 15 points
  worse and the move isn't an ordinary capture.
- **Brilliant**: a top-quality move that leaves a piece (knight or bigger)
  where it can be taken for free, without making the position worse.
- **Book**: a move inside the opening Lichess named for the game.
- **Forced**: the only legal move.

Accuracy is the average of Lichess's per-move accuracy formula.

The explanations come from rules on top of the engine's lines: checkmates
allowed or missed, pieces left hanging (and which one), forks played, allowed
or missed, free material picked up or passed over, and otherwise how the
balance of the position shifted. They are heuristics, not a human coach;
when they can't find a concrete reason they say how the evaluation changed
and give the engine's line.

### Limitations

- Standard chess only (Chess960 and other variants are skipped).
- Stockfish runs the single-threaded "lite" network so it works on
  GitHub Pages, which can't serve the headers multi-threaded WASM needs. It
  is far stronger than any human, but its verdicts can wobble on very sharp
  positions at low depth.
- Lichess rate-limits game exports; if a username lookup fails with a rate
  limit message, wait a minute.

## Development

The libraries in `src/vendor/` are copied from npm by a script, at the
versions locked in `package-lock.json`:

```sh
npm install
npm run sync-vendor   # refresh src/vendor/ after bumping a dependency
npm test              # review-logic tests against the real engine
```

- [chess.js](https://github.com/jhlywa/chess.js) — move generation and PGN
  parsing (BSD-2-Clause, see `src/vendor/LICENSE.chess.js`).
- [Chessground](https://github.com/lichess-org/chessground) — the Lichess
  board, with the cburnett pieces (GPL-3.0-or-later).
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) — Stockfish 19
  compiled to WebAssembly (GPL-3.0).

Source layout: `src/engine.js` talks UCI to the engine, `src/review.js` turns
evaluations into ratings and explanations (pure, testable in Node),
`src/lichess.js` wraps the Lichess API, and `src/app.js` is the page.

## License

GPL-3.0-or-later (see [LICENSE](LICENSE)), as required by the bundled
Chessground and Stockfish.

/* Opening analysis: names the opening as it develops, finds where the game
   leaves known theory, and lists the other book moves at each step. Uses the
   Lichess opening table, looked up by position so transpositions are named
   too. Pure logic, like review.js. */

import { Chess } from './vendor/chess.js';
import TABLE from './vendor/openings.js';

// The opening phase always covers at least this many plies, so the review
// starts with the first moves even when the game leaves theory early.
export const MIN_OPENING_PLIES = 6;

const START = new Chess().fen();

const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');

export function openingAt(fen) {
  const e = TABLE[epd(fen)];
  return e ? { eco: e[0], name: e[1], lines: e[2] } : null;
}

// "Italian Game: Two Knights Defense, Fried Liver Attack" → "Italian Game".
export const familyOf = (name) => name.split(':')[0];

// Book moves from `fen`: the legal moves that reach a named position. Main
// lines first, judged by how much listed theory follows each move.
export function bookMoves(fen) {
  const out = [];
  for (const m of new Chess(fen).moves({ verbose: true })) {
    const o = openingAt(m.after);
    if (o) out.push({ san: m.san, uci: m.from + m.to + (m.promotion || ''), ...o });
  }
  return out.sort((a, b) => b.lines - a.lines || a.san.localeCompare(b.san));
}

/* Walk the game's opening. Returns
     { name, eco, bookPly, endPly, steps }
   where bookPly is the last ply that reaches a named position, endPly is the
   last ply of the opening phase (the move that leaves the book included), and
   steps[i] describes ply i + 1 for every ply up to endPly:
     { ply, opening, named, renamed, inBook, leftBook, alternatives }
   `opening` is the name so far, `named` says this move reached a named
   position, and `renamed` that the name changed. Games set up from another
   position have no opening, but still get the minimum phase. */
export function analyseOpening(game) {
  const standard = game.startFen === START;
  const hits = standard ? game.plies.map((p) => openingAt(p.fenAfter)) : [];
  let bookPly = 0;
  hits.forEach((h, i) => { if (h) bookPly = i + 1; });

  const endPly = Math.min(game.plies.length, Math.max(bookPly + 1, MIN_OPENING_PLIES));
  const steps = [];
  let current = null;
  for (let i = 0; i < endPly; i++) {
    const p = game.plies[i];
    const hit = hits[i] || null;
    const renamed = !!hit && (!current || hit.name !== current.name);
    if (hit) current = hit;
    const inBook = standard && p.ply <= bookPly;
    steps.push({
      ply: p.ply,
      opening: current,
      named: !!hit,
      renamed,
      inBook,
      leftBook: standard && p.ply === bookPly + 1,
      alternatives: standard && (inBook || p.ply === bookPly + 1)
        ? bookMoves(p.fenBefore).filter((b) => b.uci !== p.uci)
        : [],
    });
  }
  const last = bookPly ? hits[bookPly - 1] : null;
  return { name: last && last.name, eco: last && last.eco, bookPly, endPly, steps };
}

// What the coach says about the opening at `step`, as plain text.
export function openingNote(step, prevOpening) {
  const o = step.opening;
  if (step.leftBook) return 'This move leaves known opening theory' + (o ? ` for the ${o.name}.` : '.');
  if (!o) return '';
  if (step.renamed) {
    if (prevOpening && familyOf(prevOpening.name) === familyOf(o.name)) {
      return `That makes it the ${o.name} (${o.eco}).`;
    }
    return `This is the ${o.name} (${o.eco}).`;
  }
  if (step.named) return `This is still the ${o.name}.`;
  if (step.inBook) return `Still ${o.name} theory.`;
  return '';
}

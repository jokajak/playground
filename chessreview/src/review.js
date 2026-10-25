/* Game review: turns engine evaluations into move classifications, accuracy
   and coach-style explanations. Pure logic on top of chess.js, so it runs in
   the browser and under `node --test` alike.

   Conventions: every stored evaluation is from White's point of view, as
   { cp } or { mate } (mate > 0: White mates). A finished game's checkmate is
   { mate: 0, winner: 'w' | 'b' }. Win percentages (0–100) are always from the
   point of view of the side being discussed. */

import { Chess } from './vendor/chess.js';

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const COLOR = { w: 'White', b: 'Black' };

// Win-percentage drop thresholds, in points out of 100.
export const THRESHOLD = { inaccuracy: 5, mistake: 10, blunder: 20, good: 2 };

export const CLASSES = {
  brilliant:  { label: 'Brilliant',  symbol: '!!', good: true },
  great:      { label: 'Great',      symbol: '!',  good: true },
  best:       { label: 'Best',       symbol: '★',  good: true },
  excellent:  { label: 'Excellent',  symbol: '👍', good: true },
  good:       { label: 'Good',       symbol: '✓',  good: true },
  book:       { label: 'Book',       symbol: '📖', good: true },
  forced:     { label: 'Forced',     symbol: '→',  good: true },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', good: false },
  mistake:    { label: 'Mistake',    symbol: '?',  good: false },
  blunder:    { label: 'Blunder',    symbol: '??', good: false },
};

// ── Parsing ────────────────────────────────────────────────────────────────

// Parse a PGN into the plies the review works on. Throws on illegal moves.
export function parseGame(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const headers = chess.getHeaders();
  const history = chess.history({ verbose: true });
  const startFen = history.length ? history[0].before : chess.fen();
  const plies = history.map((m, i) => ({
    ply: i + 1,
    color: m.color,
    san: m.san,
    uci: m.from + m.to + (m.promotion || ''),
    from: m.from,
    to: m.to,
    piece: m.piece,
    captured: m.captured || null,
    fenBefore: m.before,
    fenAfter: m.after,
  }));
  return { headers, startFen, plies };
}

export function positionsOf(game) {
  return [game.startFen, ...game.plies.map((p) => p.fenAfter)];
}

// ── Evaluation helpers ─────────────────────────────────────────────────────

const turnOf = (fen) => fen.split(' ')[1];

// Engine scores are from the side to move; store them from White's view.
export function toWhite(info, fen) {
  const s = turnOf(fen) === 'w' ? 1 : -1;
  return info.mate != null ? { mate: s * info.mate, pv: info.pv } : { cp: s * info.cp, pv: info.pv };
}

// Evaluation of a position the engine can't search because the game is over.
export function terminalEval(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { mate: 0, winner: chess.turn() === 'w' ? 'b' : 'w' };
  if (chess.isGameOver()) return { cp: 0 };
  return null;
}

// Mates count as a big centipawn score (closer mates are bigger), as on Lichess.
function cpEquivalent(e) {
  if (e.mate == null) return Math.max(-1000, Math.min(1000, e.cp));
  if (e.mate === 0) return e.winner === 'w' ? 2100 : -2100;
  return Math.sign(e.mate) * (21 - Math.min(10, Math.abs(e.mate))) * 100;
}

// Lichess's winning-chances curve, as 0–100 for `color`.
export function winPct(e, color) {
  const chances = 2 / (1 + Math.exp(-0.00368208 * cpEquivalent(e))) - 1;
  return 50 + 50 * (color === 'w' ? chances : -chances);
}

// Per-move accuracy from a win-percentage drop (Lichess's formula).
export function moveAccuracy(loss) {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

export function formatEval(e) {
  if (!e) return '';
  if (e.mate === 0) return e.winner === 'w' ? '1-0' : '0-1';
  if (e.mate != null) return (e.mate > 0 ? '' : '-') + 'M' + Math.abs(e.mate);
  const v = e.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

// Moves until mate for `color` (positive) or against it (negative), else null.
function mateFor(e, color) {
  if (!e || e.mate == null || e.mate === 0) return null;
  return color === 'w' ? e.mate : -e.mate;
}

// ── Engine pass ────────────────────────────────────────────────────────────

// Evaluate every position of the game. Returns one entry per position:
// { lines: [{cp|mate, pv}], eval } with scores from White's view.
export async function analyseGame(game, engine, { depth = 14, onProgress } = {}) {
  const fens = positionsOf(game);
  const out = [];
  await engine.newGame();
  for (let i = 0; i < fens.length; i++) {
    const fen = fens[i];
    const term = terminalEval(fen);
    if (term) out.push({ lines: [], eval: term });
    else {
      const lines = (await engine.analyse(fen, { depth })).map((l) => toWhite(l, fen));
      out.push({ lines, eval: lines.length ? strip(lines[0]) : { cp: 0 } });
    }
    if (onProgress) onProgress(i + 1, fens.length);
  }
  return out;
}

const strip = (l) => (l.mate != null ? { mate: l.mate } : { cp: l.cp });

// ── Board helpers ──────────────────────────────────────────────────────────

function material(chess, color) {
  let sum = 0;
  for (const row of chess.board()) for (const sq of row) if (sq && sq.color === color) sum += VALUE[sq.type];
  return sum;
}

function balance(chess, color) {
  return material(chess, color) - material(chess, color === 'w' ? 'b' : 'w');
}

const other = (c) => (c === 'w' ? 'b' : 'w');

function uciMove(chess, uci) {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return null;
  }
}

// Play a UCI line from `fen`; returns the SAN moves and the chess.js moves.
export function playLine(fen, pv, max = 99) {
  const chess = new Chess(fen);
  const moves = [];
  for (const uci of pv.slice(0, max)) {
    const m = uciMove(chess, uci);
    if (!m) break;
    moves.push(m);
  }
  return { chess, moves, san: moves.map((m) => m.san) };
}

// Number a SAN line for display: "12. Nf3 Nc6 13. Bb5" / "12... Nc6 13. Bb5".
export function numberLine(fen, sans) {
  const [, turn, , , , full] = fen.split(' ');
  let n = +full;
  let white = turn === 'w';
  const parts = [];
  sans.forEach((s, i) => {
    if (white) parts.push(n + '. ' + s);
    else parts.push((i === 0 ? n + '... ' : '') + s);
    if (!white) n++;
    white = !white;
  });
  return parts.join(' ');
}

// Material swing for `color` along a line, settled: we stop on a quiet ply so
// a capture isn't counted without its recapture.
function materialSwing(fen, pv, color, plies = 6) {
  const chess = new Chess(fen);
  const start = balance(chess, color);
  let settled = start;
  for (let i = 0; i < pv.length && i < plies + 2; i++) {
    const m = uciMove(chess, pv[i]);
    if (!m) break;
    const next = new Chess(chess.fen());
    const capturesPending = next.moves({ verbose: true }).some((x) => x.to === m.to && x.captured);
    if (i + 1 >= plies && !capturesPending) { settled = balance(chess, color); break; }
    settled = balance(chess, color);
  }
  return settled - start;
}

// Is the `color` piece on `sq` capturable without a fair trade?
function enPrise(chess, sq, color) {
  const piece = chess.get(sq);
  if (!piece || piece.type === 'k') return false;
  const defenders = chess.attackers(sq, color);
  // A king can't capture a defended piece.
  const attackers = chess.attackers(sq, other(color)).filter((a) => !defenders.length || chess.get(a).type !== 'k');
  if (!attackers.length) return false;
  const cheapest = Math.min(...attackers.map((a) => VALUE[chess.get(a).type] || 0));
  return !defenders.length || cheapest < VALUE[piece.type];
}

// Pieces the piece on `sq` attacks that it wins at least one of: the king,
// anything worth more than itself, or anything undefended. A forking piece
// that can simply be taken isn't a fork.
function forkTargets(chess, sq) {
  const me = chess.get(sq);
  if (!me || enPrise(chess, sq, me.color)) return [];
  const them = other(me.color);
  const targets = [];
  for (const row of chess.board()) {
    for (const t of row) {
      if (!t || t.color !== them) continue;
      if (!chess.attackers(t.square, me.color).includes(sq)) continue;
      const loose = !chess.attackers(t.square, them).length;
      if (t.type === 'k' || VALUE[t.type] > VALUE[me.type] || (loose && VALUE[t.type] >= 3)) targets.push(t);
    }
  }
  return targets.length >= 2 ? targets : [];
}

const listNames = (pieces) => {
  const names = pieces.map((p) => NAME[p.type]).sort((a, b) => (a === 'king' ? -1 : b === 'king' ? 1 : 0));
  return names.length === 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
};

// ── Classification ─────────────────────────────────────────────────────────

/* Build the review: one entry per ply with its classification, accuracy and
   explanation, plus per-side summaries. `evals` comes from analyseGame;
   `perspective` is the reader's colour, so their moves read as "you". */
export function buildReview(game, evals, { bookPly = 0, perspective = null } = {}) {
  const moves = game.plies.map((p, i) => classify(p, game.plies[i - 1], evals[i], evals[i + 1], bookPly));
  moves.forEach((m, i) => {
    const voice = !perspective || m.color === perspective ? VOICE.mine : VOICE.theirs;
    m.explanation = explain(m, moves[i - 1], voice);
  });
  const summary = {};
  for (const c of ['w', 'b']) {
    const mine = moves.filter((m) => m.color === c);
    const counts = Object.fromEntries(Object.keys(CLASSES).map((k) => [k, 0]));
    for (const m of mine) counts[m.cls]++;
    const acc = mine.length ? mine.reduce((s, m) => s + m.accuracy, 0) / mine.length : 100;
    summary[c] = { accuracy: acc, counts };
  }
  return { moves, summary };
}

function classify(p, prev, before, after, bookPly) {
  const c = p.color;
  const best = before.lines[0];
  const bestUci = best ? best.pv[0] : null;
  const wpBefore = winPct(before.eval, c);
  const wpAfter = winPct(after.eval, c);
  const isBest = p.uci === bestUci;
  // A move matching the engine's choice is never penalised for the small
  // disagreements between two searches of neighbouring positions.
  const loss = isBest ? 0 : Math.max(0, wpBefore - wpAfter);
  const chessBefore = new Chess(p.fenBefore);
  const chessAfter = new Chess(p.fenAfter);
  const m = {
    ...p, before, after, wpBefore, wpAfter, loss, isBest,
    best, bestSan: bestUci ? playLine(p.fenBefore, [bestUci]).san[0] : null,
    accuracy: moveAccuracy(loss),
    legalMoves: chessBefore.moves().length,
    isMate: chessAfter.isCheckmate(),
    recapture: !!(prev && prev.captured && p.captured && prev.to === p.to),
  };

  if (loss >= THRESHOLD.blunder) m.cls = 'blunder';
  else if (loss >= THRESHOLD.mistake) m.cls = 'mistake';
  else if (loss >= THRESHOLD.inaccuracy) m.cls = 'inaccuracy';
  else if (m.legalMoves === 1) m.cls = 'forced';
  else if (p.ply <= bookPly) m.cls = 'book';
  else if (isSacrifice(m, chessAfter) && wpAfter >= 50 && loss < THRESHOLD.good) m.cls = 'brilliant';
  else if (isBest && isOnlyMove(m)) m.cls = 'great';
  else if (isBest) m.cls = 'best';
  else if (loss < THRESHOLD.good) m.cls = 'excellent';
  else m.cls = 'good';
  return m;
}

// The moved piece is left where the opponent can take it for free, and it
// wasn't a trade (capturing something of similar value) or a promotion.
function isSacrifice(m, chessAfter) {
  if (m.isMate || m.piece === 'p' || m.piece === 'k' || m.uci.length > 4) return false;
  const moved = VALUE[m.piece];
  if (m.captured && VALUE[m.captured] >= moved - 1) return false;
  return enPrise(chessAfter, m.to, m.color);
}

// Only good move: every engine alternative is clearly worse, and it isn't
// an ordinary capture (taking a piece back, or one at least as valuable as
// the capturer), which most players find without thinking.
function isOnlyMove(m) {
  const lines = m.before.lines;
  if (lines.length < 2 || m.isMate) return false;
  if (m.captured && VALUE[m.captured] >= VALUE[m.piece]) return false;
  const second = winPct(lines[1], m.color);
  const best = winPct(lines[0], m.color);
  return best - second >= 15 && winPct(m.after.eval, m.color) >= 30 && !m.recapture;
}

// ── Explanations ───────────────────────────────────────────────────────────

function describe(wp) {
  if (wp >= 80) return 'winning';
  if (wp >= 60) return 'better';
  if (wp > 40) return 'roughly equal';
  if (wp > 20) return 'worse';
  return 'losing';
}

// Explanations talk to the reader about their own moves ("you", "your") and
// about the opponent's in the third person ("they", "their").
const VOICE = {
  mine:   { you: 'you', your: 'your', You: 'You', Your: 'Your' },
  theirs: { you: 'they', your: 'their', You: 'They', Your: 'Their' },
};

function explain(m, prev, voice) {
  const say = (str) => str.replace(/\{(you|your|You|Your)\}/g, (_, k) => voice[k]);
  const bestLine = m.best ? playLine(m.fenBefore, m.best.pv, 6) : null;
  const replyLine = m.after.lines[0] ? playLine(m.fenAfter, m.after.lines[0].pv, 6) : null;
  const parts = CLASSES[m.cls].good ? praise(m) : critique(m, prev, bestLine, replyLine);

  // Give the reader the concrete continuation behind the verdict.
  if (!CLASSES[m.cls].good && bestLine && bestLine.san.length) {
    m.bestLineText = numberLine(m.fenBefore, bestLine.san.slice(0, 5));
  }
  if (replyLine && replyLine.san.length) m.replyLineText = numberLine(m.fenAfter, replyLine.san.slice(0, 5));
  return say(parts.join(' '));
}

function praise(m) {
  const c = m.color;
  if (m.isMate) return ['Checkmate! That ends the game.'];
  if (m.cls === 'book') return ['A book move — standard opening theory.'];
  if (m.cls === 'forced') return ['The only legal move.'];

  const out = [];
  if (m.cls === 'brilliant') {
    out.push(`Brilliant! {You} leave {your} ${NAME[m.piece]} on ${m.to} where it can be taken, but grabbing it doesn't work out for ${COLOR[other(c)]}.`);
  } else if (m.cls === 'great') {
    const second = m.before.lines[1] && playLine(m.fenBefore, [m.before.lines[1].pv[0]]).san[0];
    out.push('Great find — the only move that holds {your} position together.' +
      (second ? ` Even the next-best try, ${second}, was clearly worse.` : ''));
  }

  const mate = mateFor(m.after.eval, c);
  const fork = forkTargets(new Chess(m.fenAfter), m.to);
  if (mate > 0) out.push(`This starts a forced checkmate in ${mate}.`);
  else if (fork.length) out.push(`It forks the ${listNames(fork)}.`);
  else if (m.captured && wasLoose(m)) out.push(`{You} grab the free ${NAME[m.captured]}.`);
  else if (m.san.startsWith('O-O')) out.push('Castling tucks {your} king away and connects {your} rooks.');
  else if (m.cls !== 'good' && materialSwing(m.fenBefore, [m.uci, ...(m.after.lines[0] ? m.after.lines[0].pv : [])], c) >= 2) {
    out.push('This wins material.');
  }

  if (m.cls === 'excellent') out.push(`Excellent — nearly as good as the top engine move, ${m.bestSan}.`);
  else if (m.cls === 'good') out.push(`A reasonable move, though ${m.bestSan} was more precise.`);
  else if (!out.length) out.push("The engine's top choice.");
  return out;
}

// Was the piece this move captured simply hanging (or worth more than the
// capturing piece)?
function wasLoose(m) {
  return enPrise(new Chess(m.fenBefore), m.to, other(m.color)) || VALUE[m.captured] > VALUE[m.piece];
}

function critique(m, prev, bestLine, replyLine) {
  const c = m.color;
  const o = other(c);
  const out = [{ inaccuracy: 'This is a little imprecise.', mistake: 'This is a mistake.', blunder: 'This is a blunder.' }[m.cls]];
  let namedBest = false;

  const hadMate = mateFor(m.before.eval, c);
  const allowsMate = mateFor(m.after.eval, o);
  // Material change over the next few moves, counted from before the move so
  // a capture made by the move itself is included.
  const couldWin = m.best ? materialSwing(m.fenBefore, m.best.pv, c) : 0;
  const playedSwing = materialSwing(m.fenBefore, [m.uci, ...(m.after.lines[0] ? m.after.lines[0].pv : [])], c);

  if (allowsMate > 0 && !(mateFor(m.before.eval, o) > 0)) {
    const line = allowsMate <= 3 && replyLine ? replyLine.san.slice(0, 2 * allowsMate - 1) : [];
    out.push(`It allows ${COLOR[o]} a forced checkmate in ${allowsMate}` +
      (line.length ? `: ${numberLine(m.fenAfter, line)}.` : '.'));
  } else if (hadMate > 0 && !(mateFor(m.after.eval, c) > 0)) {
    out.push(`{You} had a forced checkmate in ${hadMate}, starting with ${m.bestSan}.`);
    namedBest = true;
  } else if (replyLine && replyLine.moves.length && playedSwing <= -2 && couldWin - playedSwing >= 2) {
    out.push(whatHangs(m, replyLine));
  } else if (bestLine && bestLine.moves.length && couldWin >= 2 && couldWin - playedSwing >= 2) {
    out.push(whatWasMissed(m, bestLine));
    namedBest = true;
  } else {
    const from = describe(m.wpBefore);
    const to = describe(m.wpAfter);
    const reply = replyLine && replyLine.san[0];
    if (from === to) out.push(`{Your} position is still ${to}, but {you} give away some of {your} chances.`);
    else if (reply && m.cls !== 'inaccuracy') out.push(`It allows ${reply}, and {your} position goes from ${from} to ${to}.`);
    else out.push(`{Your} position goes from ${from} to ${to}.`);
  }

  if (!m.bestSan) return out;
  if (prev && (prev.cls === 'mistake' || prev.cls === 'blunder')) {
    out.push(`${COLOR[o]} had just slipped up with ${prev.san}` +
      (namedBest ? ', and that was the way to punish it.' : ` — ${m.bestSan} was the way to punish it.`));
  } else if (!namedBest) {
    out.push(`Better was ${m.bestSan}.`);
  }
  return out;
}

function whatHangs(m, replyLine) {
  const reply = replyLine.moves[0];
  const after = new Chess(m.fenAfter);
  after.move(reply.san);
  const fork = forkTargets(after, reply.to);
  if (fork.length) return `It allows ${reply.san}, forking {your} ${listNames(fork)}.`;
  // Name the most valuable piece the opponent takes (their moves are the
  // even plies of the line); a pawn grabbed on the way is rarely the point.
  let won = null;
  replyLine.moves.forEach((x, i) => {
    if (i % 2 === 0 && x.captured && (!won || VALUE[x.captured] > VALUE[won.captured])) won = x;
  });
  if (!won) return `After ${reply.san} {you} lose material.`;
  if (won.to === m.to && won.captured === m.piece) return `The ${NAME[m.piece]} isn't safe on ${m.to} — ${COLOR[other(m.color)]} can win it.`;
  const what = `{your} ${NAME[won.captured]} on ${won.to}`;
  if (won === reply) return `It leaves ${what} hanging — ${reply.san} wins it.`;
  return `After ${reply.san} {you} end up losing ${what}.`;
}

function whatWasMissed(m, bestLine) {
  const best = bestLine.moves[0];
  const after = new Chess(m.fenBefore);
  after.move(best.san);
  const fork = forkTargets(after, best.to);
  if (fork.length) return `{You} missed ${best.san}, forking the ${listNames(fork)}.`;
  if (best.captured && enPrise(new Chess(m.fenBefore), best.to, other(m.color))) {
    return `The ${NAME[best.captured]} on ${best.to} was free — ${best.san} picks it up.`;
  }
  return `${best.san} would have won material.`;
}

// Why the engine's move beats the one played, for the "find a better move"
// exercise. Talks to the reader directly.
export function explainBest(m) {
  if (!m.best) return '';
  const c = m.color;
  const line = playLine(m.fenBefore, m.best.pv, 6);
  const best = line.moves[0];
  if (!best) return '';
  const after = new Chess(m.fenBefore);
  after.move(best.san);
  const mate = mateFor(m.best, c);
  const fork = forkTargets(after, best.to);
  if (after.isCheckmate()) return "It's checkmate.";
  if (mate > 0) return `It starts a forced checkmate in ${mate}.`;
  if (fork.length) return `It forks the ${listNames(fork)}.`;
  if (best.captured && enPrise(new Chess(m.fenBefore), best.to, other(c))) return `It picks up the free ${NAME[best.captured]}.`;
  if (materialSwing(m.fenBefore, m.best.pv, c) >= 2) return 'It wins material.';
  return `It keeps the evaluation at ${formatEval(m.before.eval)}, where ${m.san} let it drop to ${formatEval(m.after.eval)}.`;
}

// Moves worth stopping on when walking through the game as `color`: that
// side's notable moves, plus the opponent's errors they get to punish.
export function keyMoments(review, color) {
  return review.moves
    .map((m, i) => i)
    .filter((i) => {
      const m = review.moves[i];
      if (m.isMate) return true;
      if (m.color === color) return ['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder'].includes(m.cls);
      return m.cls === 'mistake' || m.cls === 'blunder';
    });
}

// Grade a move the learner tries in place of `m`. `evalAfter` is the engine's
// view (White's POV) of the position after the attempt.
export function gradeAttempt(m, uci, evalAfter) {
  if (m.best && uci === m.best.pv[0]) return { verdict: 'best', loss: 0 };
  if (uci === m.uci) return { verdict: 'same', loss: m.loss };
  const loss = Math.max(0, m.wpBefore - winPct(evalAfter, m.color));
  if (loss < THRESHOLD.inaccuracy) return { verdict: 'good', loss };
  if (loss < m.loss - THRESHOLD.inaccuracy) return { verdict: 'better', loss };
  return { verdict: 'bad', loss };
}

export function sideName(c) {
  return COLOR[c];
}

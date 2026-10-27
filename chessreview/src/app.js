import { Chessground } from './vendor/chessground.js';
import { Chess } from './vendor/chess.js';
import { workerEngine } from './engine.js';
import { fetchUserGames, fetchGame, parseGameRef, playerName, colorOf } from './lichess.js';
import {
  parseGame, analyseGame, buildReview, keyMoments, gradeAttempt, explainBest, terminalEval, toWhite,
  playLine, numberLine, formatEval, winPct, positionsOf, sideName, CLASSES,
} from './review.js';
import { analyseOpening, openingNote, familyOf } from './openings.js';

const $ = (id) => document.getElementById(id);
const ENGINE_URL = new URL('./vendor/stockfish.js', import.meta.url);
const QUIZ_DEPTH = 12;
const ANIMATION_MS = 180;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

// Piece sets: cburnett ships with Chessground, the rest come from
// tools/fetch-assets.js.
const PIECE_SETS = {
  cburnett: 'Cburnett', merida: 'Merida', chessnut: 'Chessnut', mpchess: 'MPChess',
  fantasy: 'Fantasy', celtic: 'Celtic', spatial: 'Spatial', papercut: 'Papercut', rhosgfx: 'RhosGFX',
};

// ── Storage (best effort: private windows may refuse it) ───────────────────

const STORE = 'chessreview:v1:';
const MAX_CACHED = 15;

function load(key) {
  try { return JSON.parse(localStorage.getItem(STORE + key)); } catch { return null; }
}

function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); return true; } catch { return false; }
}

// Analyses are cached per game and depth; the oldest go first when full.
function cacheAnalysis(key, evals) {
  const index = (load('index') || []).filter((k) => k !== key);
  index.push(key);
  while (index.length > MAX_CACHED) {
    try { localStorage.removeItem(STORE + 'a:' + index.shift()); } catch { /* ignore */ }
  }
  while (!save('a:' + key, evals) && index.length > 1) {
    try { localStorage.removeItem(STORE + 'a:' + index.shift()); } catch { break; }
  }
  save('index', index);
}

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  game: null,       // parseGame() result
  meta: null,       // names, ratings, result, opening
  review: null,     // buildReview() result
  fens: [],         // position before ply 1 … after the last ply
  me: 'w',          // the reader's colour
  orientation: 'w',
  cursor: 0,        // 0 = start; k = after ply k
  keys: [],         // key-moment ply indexes (0-based into review.moves)
  opening: null,    // analyseOpening() result
  stops: [],        // plies the review stops on: the opening, then the key moments
  mode: 'browse',   // 'browse' | 'line' | 'quiz' | 'playback'
  line: null,       // { fens, sans, lastMoves, step, text } while showing a line
  quiz: null,       // { m, tries, result } while finding a better move
  playback: null,   // { target } while playing the moves up to a stop
};

let engine = null;
let ground = null;

function getEngine() {
  if (!engine) engine = workerEngine(ENGINE_URL);
  return engine;
}

function show(screen) {
  if (screen !== 'review') state.playback = null;
  for (const id of ['load', 'analysing', 'review']) $(id).hidden = id !== screen;
}

function showError(msg) {
  const el = $('load-error');
  el.textContent = msg;
  el.hidden = !msg;
}

// ── Load screen ────────────────────────────────────────────────────────────

const savedUser = load('username');
if (savedUser) $('username').value = savedUser;
const savedDepth = load('depth');
if ([...$('depth').options].some((o) => o.value === savedDepth)) $('depth').value = savedDepth;
$('depth').addEventListener('change', () => save('depth', $('depth').value));

$('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('username').value.trim();
  if (!name) return;
  showError('');
  save('username', name);
  const list = $('games');
  $('games-panel').hidden = false;
  $('games-title').textContent = 'Recent games';
  list.innerHTML = '<li class="muted">Loading games…</li>';
  try {
    const games = await fetchUserGames(name);
    renderGameList(games, name);
  } catch (err) {
    list.innerHTML = '';
    $('games-panel').hidden = true;
    showError(err.message);
  }
});

function renderGameList(games, username) {
  const list = $('games');
  list.innerHTML = '';
  $('games-title').textContent = `Recent games for ${username}`;
  if (!games.length) {
    list.innerHTML = '<li class="muted">No finished standard games found.</li>';
    return;
  }
  const depth = $('depth').value;
  for (const g of games) {
    const me = colorOf(g, username) || 'w';
    const them = me === 'w' ? 'black' : 'white';
    const opp = g.players[them];
    const outcome = !g.winner ? 'draw' : g.winner[0] === me ? 'win' : 'loss';
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'game-item';
    btn.innerHTML = `
      <span class="result ${outcome}">${{ win: 'W', loss: 'L', draw: '½' }[outcome]}</span>
      <span>
        <div class="who"></div>
        <div class="meta"></div>
      </span>
      <span class="when"></span>`;
    btn.querySelector('.who').textContent = `vs ${playerName(opp)}${opp.rating ? ' (' + opp.rating + ')' : ''}`;
    if (load('a:' + g.id + ':' + depth)) btn.querySelector('.who').insertAdjacentHTML('beforeend', '<span class="tag">reviewed</span>');
    btn.querySelector('.meta').textContent =
      `${me === 'w' ? 'White' : 'Black'} · ${g.speed} · ${g.opening ? g.opening.name : 'Unknown opening'}`;
    btn.querySelector('.when').textContent = new Date(g.createdAt).toLocaleDateString();
    btn.addEventListener('click', () => startLichessGame(g, me));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

$('link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const ref = parseGameRef($('game-link').value);
  if (!ref) { showError("That doesn't look like a Lichess game link or ID."); return; }
  try {
    const g = await fetchGame(ref.id);
    const me = ref.color || colorOf(g, load('username')) || 'w';
    startLichessGame(g, me);
  } catch (err) {
    showError(err.message);
  }
});

$('pgn-form').addEventListener('submit', (e) => {
  e.preventDefault();
  showError('');
  const pgn = $('pgn').value.trim();
  if (!pgn) return;
  let game;
  try {
    game = parseGame(pgn);
  } catch (err) {
    showError("Couldn't read that PGN: " + err.message);
    return;
  }
  if (!game.plies.length) { showError('That PGN has no moves.'); return; }
  // chess.js fills missing roster tags with "?".
  const h = Object.fromEntries(Object.entries(game.headers).filter(([, v]) => v && v !== '?'));
  start(game, {
    key: 'pgn-' + hash(pgn),
    white: h.White || 'White', black: h.Black || 'Black',
    whiteRating: h.WhiteElo, blackRating: h.BlackElo,
    result: h.Result !== '*' ? h.Result : null, opening: h.Opening || null, bookPly: 0,
  }, $('pgn-side').value);
});

function startLichessGame(g, me) {
  let game;
  try {
    game = parseGame(g.pgn);
  } catch (err) {
    showError("Couldn't read this game: " + err.message);
    return;
  }
  start(game, {
    key: g.id,
    url: 'https://lichess.org/' + g.id,
    white: playerName(g.players.white), black: playerName(g.players.black),
    whiteRating: g.players.white.rating, blackRating: g.players.black.rating,
    result: game.headers.Result,
    opening: g.opening ? g.opening.name : null,
    bookPly: g.opening ? g.opening.ply : 0,
  }, me);
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ── Analysis ───────────────────────────────────────────────────────────────

let cancelled = false;

$('cancel').addEventListener('click', () => {
  cancelled = true;
  if (engine) { engine.quit(); engine = null; }
  show('load');
});

async function start(game, meta, me) {
  const depth = +$('depth').value;
  const cacheKey = meta.key + ':' + depth;
  state.game = game;
  state.meta = meta;
  state.me = me;
  state.orientation = me;
  state.fens = positionsOf(game);

  let evals = load('a:' + cacheKey);
  if (!evals || evals.length !== state.fens.length) {
    cancelled = false;
    show('analysing');
    $('analysing-text').textContent = `Let me look over your game against ${me === 'w' ? meta.black : meta.white}…`;
    setProgress(0, state.fens.length);
    try {
      evals = await analyseGame(game, getEngine(), { depth, onProgress: setProgress });
    } catch (err) {
      if (!cancelled) { show('load'); showError('The engine failed: ' + err.message); }
      return;
    }
    if (cancelled) return;
    cacheAnalysis(cacheKey, evals);
  }

  state.opening = analyseOpening(game);
  const bookPly = Math.max(meta.bookPly || 0, state.opening.bookPly);
  state.review = buildReview(game, evals, { bookPly, perspective: me });
  state.keys = keyMoments(state.review, me);
  // Every move of the opening is a stop, so the review never skips it.
  state.stops = [...new Set([...state.opening.steps.map((st) => st.ply), ...state.keys.map((i) => i + 1)])]
    .sort((a, b) => a - b);
  state.mode = 'browse';
  state.cursor = 0;
  show('review');
  setupReview();
}

function setProgress(done, total) {
  $('progress-bar').style.width = (100 * done / total).toFixed(1) + '%';
  $('progress-text').textContent = done === 0
    ? 'Starting the engine…'
    : `Analysed ${done} of ${total} positions`;
}

// ── Review screen ──────────────────────────────────────────────────────────

const COLORS = Object.fromEntries(Object.keys(CLASSES).map((k) =>
  [k, getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim()]));

function badge(cls) {
  return `<span class="badge" style="background:${COLORS[cls]}">${CLASSES[cls].symbol}</span>`;
}

// "Nf6 is …" — how each classification reads in the coach's headline.
const VERDICT = {
  brilliant: 'brilliant', great: 'a great move', best: 'the best move', excellent: 'excellent',
  good: 'good', book: 'a book move', forced: 'forced', inaccuracy: 'an inaccuracy',
  mistake: 'a mistake', blunder: 'a blunder',
};

const moveNumber = (m) => +m.fenBefore.split(' ')[5];

function moveLabel(m) {
  const n = moveNumber(m);
  return m.color === 'w' ? `${n}. ${m.san}` : `${n}... ${m.san}`;
}

function setupReview() {
  const { meta } = state;
  $('game-title').innerHTML = '';
  const title = document.createTextNode(`${meta.white} vs ${meta.black}${meta.result ? ' · ' + meta.result : ''}`);
  if (meta.url) {
    const a = document.createElement('a');
    a.href = meta.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.color = 'inherit';
    a.appendChild(title);
    $('game-title').appendChild(a);
  } else {
    $('game-title').appendChild(title);
  }

  if (!ground) {
    ground = Chessground($('board'), {
      coordinates: true,
      animation: { enabled: true, duration: ANIMATION_MS },
      movable: { free: false, color: undefined, showDests: true },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
      highlight: { lastMove: true, check: true },
    });
  }
  renderSummary();
  renderOpening();
  renderMoveList();
  render();
}

// The opening at a glance: its name, and each move that named or renamed it.
function renderOpening() {
  const { opening, review, meta } = state;
  const name = opening.name || meta.opening;
  $('opening-panel').hidden = !name;
  if (!name) return;
  const el = $('opening');
  const book = opening.bookPly
    ? `In book until ${esc(moveLabel(review.moves[opening.bookPly - 1]))}.`
    : '';
  el.innerHTML = `<div class="opening-name">${esc(name)}${opening.eco ? ` <span class="tag">${esc(opening.eco)}</span>` : ''}</div>` +
    `<div class="muted" style="font-size:0.85rem;margin:2px 0 8px">${book}</div>`;
  const list = document.createElement('div');
  list.className = 'opening-trail';
  for (const st of opening.steps) {
    if (!st.renamed && !st.leftBook) continue;
    const b = document.createElement('button');
    b.dataset.ply = st.ply;
    b.innerHTML = `<span class="mv"></span><span></span>`;
    b.firstChild.textContent = moveLabel(review.moves[st.ply - 1]);
    b.lastChild.textContent = st.leftBook ? 'Leaves the book' : st.opening.name;
    b.addEventListener('click', () => goTo(st.ply));
    list.appendChild(b);
  }
  el.appendChild(list);
}

function renderSummary() {
  const { meta, review } = state;
  const rows = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'];
  let html = `<div></div><div class="head">${esc(meta.white)}</div><div class="head">${esc(meta.black)}</div>`;
  html += `<div class="label">Accuracy</div><div class="acc">${review.summary.w.accuracy.toFixed(0)}%</div><div class="acc">${review.summary.b.accuracy.toFixed(0)}%</div>`;
  for (const cls of rows) {
    html += `<div class="label">${badge(cls)} ${CLASSES[cls].label}</div>` +
      `<div class="num" style="color:${COLORS[cls]}">${review.summary.w.counts[cls]}</div>` +
      `<div class="num" style="color:${COLORS[cls]}">${review.summary.b.counts[cls]}</div>`;
  }
  $('summary').innerHTML = html;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderMoveList() {
  const el = $('moves');
  el.innerHTML = '';
  const moves = state.review.moves;
  // A game set up with Black to move starts with an empty White cell.
  const offset = moves.length && moves[0].color === 'b' ? 1 : 0;
  for (let i = -offset; i < moves.length; i += 2) {
    const no = document.createElement('div');
    no.className = 'no';
    no.textContent = moveNumber(moves[Math.max(i, 0)]) + '.';
    el.appendChild(no);
    for (const j of [i, i + 1]) {
      const cell = document.createElement('button');
      const m = moves[j];
      if (m && j >= 0) {
        cell.dataset.ply = j + 1;
        const notable = !['best', 'excellent', 'good', 'book', 'forced'].includes(m.cls);
        cell.innerHTML = `<span>${esc(m.san)}</span>` +
          (notable ? `<span class="sym" style="color:${COLORS[m.cls]}">${CLASSES[m.cls].symbol}</span>` : '');
        cell.addEventListener('click', () => goTo(j + 1));
      } else {
        cell.disabled = true;
      }
      el.appendChild(cell);
    }
  }
}

function goTo(k) {
  if (state.playback) {
    state.playback = null;
    ground.set({ animation: { duration: ANIMATION_MS } });
  }
  state.mode = 'browse';
  state.line = null;
  state.quiz = null;
  state.cursor = Math.max(0, Math.min(state.fens.length - 1, k));
  render();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Jump forward to ply `k`, playing the moves in between so the reader sees
// how the game got there. Any other navigation cancels the playback.
async function travel(k) {
  const from = state.mode === 'quiz' ? state.quiz.m.ply - 1 : state.cursor;
  if (k - from < 2 || REDUCED_MOTION.matches) return goTo(k);
  const run = { target: k };
  state.mode = 'playback';
  state.line = null;
  state.quiz = null;
  state.playback = run;
  // About two and a half seconds in all, but neither a blur nor a crawl.
  const delay = Math.max(160, Math.min(450, 2400 / (k - from)));
  ground.set({ animation: { duration: Math.round(delay * 0.7) } });
  render();
  for (let p = from + 1; p < k; p++) {
    state.cursor = p;
    renderPosition();
    await sleep(delay);
    if (state.playback !== run) return;
  }
  goTo(k);
}

// ── Rendering ──────────────────────────────────────────────────────────────

function render() {
  renderPosition();
  renderCoach();
  renderPlayers();
  $('board').classList.toggle('quiz', state.mode === 'quiz');
}

// Everything that follows the cursor: redrawn on each step of a playback.
function renderPosition() {
  renderBoard();
  renderEvalBar();
  renderGraph();
  const list = $('moves');
  for (const b of list.querySelectorAll('button[data-ply]')) {
    const cur = +b.dataset.ply === state.cursor;
    b.classList.toggle('current', cur);
    // Scroll only the list (scrollIntoView would also scroll the page).
    if (cur && (b.offsetTop < list.scrollTop || b.offsetTop + b.offsetHeight > list.scrollTop + list.clientHeight)) {
      list.scrollTop = b.offsetTop - list.clientHeight / 2;
    }
  }
  for (const b of $('opening').querySelectorAll('button[data-ply]')) {
    b.classList.toggle('current', +b.dataset.ply === state.cursor);
  }
}

function renderBoard() {
  const { mode, cursor, review } = state;
  const shapes = [];
  let fen, lastMove;

  if (mode === 'line') {
    const l = state.line;
    fen = l.fens[l.step];
    lastMove = l.lastMoves[l.step];
  } else if (mode === 'quiz') {
    const q = state.quiz;
    fen = q.fen;
    lastMove = q.lastMove;
    if (q.reveal) shapes.push({ orig: q.reveal.slice(0, 2), dest: q.reveal.slice(2, 4), brush: 'green' });
  } else {
    fen = state.fens[cursor];
    const m = review.moves[cursor - 1];
    // Playback shows the moves only, without the review's markings.
    if (m) lastMove = [m.from, m.to];
    if (m && mode === 'browse') {
      shapes.push({ orig: m.to, customSvg: { html: glyphSvg(m.cls), center: 'dest' } });
      if (!CLASSES[m.cls].good && m.best) {
        const b = m.best.pv[0];
        shapes.push({ orig: b.slice(0, 2), dest: b.slice(2, 4), brush: 'green' });
      }
      // On a mistake, also show the reply it allows.
      if (['mistake', 'blunder'].includes(m.cls) && m.after.lines[0]) {
        const r = m.after.lines[0].pv[0];
        shapes.push({ orig: r.slice(0, 2), dest: r.slice(2, 4), brush: 'red' });
      }
    }
  }

  const chess = new Chess(fen);
  // Moves are only allowed from the exercise's own position: after an attempt
  // the board shows the opponent to move, and stays locked until Try again.
  const quizzing = mode === 'quiz' && !state.quiz.thinking && !state.quiz.done && !state.quiz.result;
  ground.set({
    fen,
    orientation: state.orientation === 'w' ? 'white' : 'black',
    turnColor: chess.turn() === 'w' ? 'white' : 'black',
    check: chess.inCheck(),
    lastMove,
    movable: {
      color: quizzing ? (chess.turn() === 'w' ? 'white' : 'black') : undefined,
      dests: quizzing ? dests(chess) : new Map(),
      events: { after: onQuizMove },
    },
    drawable: { autoShapes: shapes },
  });
}

function dests(chess) {
  const map = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!map.has(m.from)) map.set(m.from, []);
    map.get(m.from).push(m.to);
  }
  return map;
}

// Classification glyph drawn on the corner of the destination square, in the
// 100×100 coordinate space chessground uses for custom SVG.
function glyphSvg(cls) {
  const sym = CLASSES[cls].symbol;
  const size = sym.length > 1 ? 30 : 34;
  return `<g transform="translate(72 0)">
    <circle cx="14" cy="14" r="15" fill="${COLORS[cls]}" stroke="#fff" stroke-width="2.5"/>
    <text x="14" y="15" font-size="${size * 0.62}" font-weight="800" fill="#fff" text-anchor="middle"
      dominant-baseline="central" font-family="system-ui, sans-serif">${sym}</text></g>`;
}

function renderPlayers() {
  const { meta, review } = state;
  const line = (c) => {
    const name = c === 'w' ? meta.white : meta.black;
    const rating = c === 'w' ? meta.whiteRating : meta.blackRating;
    const you = c === state.me ? ' (you)' : '';
    return `<span>${c === 'w' ? '○' : '●'} ${esc(name)}${rating ? ' ' + esc(rating) : ''}${you}</span>` +
      `<span class="acc">${review.summary[c].accuracy.toFixed(0)}% accuracy</span>`;
  };
  const bottom = state.orientation;
  $('bottom-player').innerHTML = line(bottom);
  $('top-player').innerHTML = line(bottom === 'w' ? 'b' : 'w');
}

function currentEval() {
  if (state.mode === 'quiz' && state.quiz.evalAfter) return state.quiz.evalAfter;
  const m = state.review.moves[state.cursor - 1];
  return m ? m.after.eval : state.review.moves[0] && state.review.moves[0].before.eval;
}

function renderEvalBar() {
  const e = currentEval() || { cp: 0 };
  const bar = $('evalbar');
  bar.classList.toggle('flipped', state.orientation === 'b');
  bar.querySelector('.white').style.height = winPct(e, 'w').toFixed(1) + '%';
  const num = bar.querySelector('.num');
  num.textContent = formatEval(e).replace(/^\+/, '');
  const whiteAhead = winPct(e, 'w') >= 50;
  // Show the number at the end of the bar belonging to the side ahead.
  const atBottom = whiteAhead !== (state.orientation === 'b');
  num.style.top = atBottom ? '' : '0';
  num.style.bottom = atBottom ? '0' : '';
  num.style.color = whiteAhead ? '#403d39' : '#f8f8f6';
}

function renderGraph() {
  const svg = $('graph');
  const moves = state.review.moves;
  const W = 600, H = 90;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const n = moves.length;
  const x = (i) => (n ? (i / n) * W : 0);
  const y = (e) => H - (winPct(e, 'w') / 100) * H;
  const pts = [[0, y(moves[0] ? moves[0].before.eval : { cp: 0 })], ...moves.map((m, i) => [x(i + 1), y(m.after.eval)])];
  const area = `M0,${H} ` + pts.map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  let html = `<rect width="${W}" height="${H}" fill="#403d39"/>` +
    `<path d="${area}" fill="#f1f0ec"/>` +
    `<line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#9ca3af" stroke-width="1" stroke-dasharray="4 4"/>`;
  moves.forEach((m, i) => {
    if (!['brilliant', 'great', 'mistake', 'blunder'].includes(m.cls)) return;
    html += `<circle cx="${x(i + 1)}" cy="${y(m.after.eval)}" r="4.5" fill="${COLORS[m.cls]}" stroke="#fff" stroke-width="1.5"/>`;
  });
  const cx = x(state.cursor);
  html += `<line x1="${cx}" x2="${cx}" y1="0" y2="${H}" stroke="var(--accent)" stroke-width="2"/>`;
  svg.innerHTML = html;
}

$('graph').addEventListener('click', (e) => {
  const r = $('graph').getBoundingClientRect();
  goTo(Math.round(((e.clientX - r.left) / r.width) * state.review.moves.length));
});

// ── Coach ──────────────────────────────────────────────────────────────────

function renderCoach() {
  const bubble = $('bubble');
  const actions = $('actions');
  actions.innerHTML = '';
  const add = (label, fn, primary) => {
    const b = document.createElement('button');
    b.className = 'btn small' + (primary ? ' primary' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    actions.appendChild(b);
    return b;
  };

  if (state.mode === 'quiz') return renderQuiz(bubble, add);
  if (state.mode === 'playback') {
    const target = state.playback.target;
    bubble.innerHTML = `<div class="headline">On to ${esc(moveLabel(state.review.moves[target - 1]))}…</div>` +
      '<div class="muted">Watch how the game got there.</div>';
    add('Skip ▶', () => goTo(target), true);
    return;
  }
  if (state.mode === 'line') {
    const l = state.line;
    bubble.innerHTML = `<div class="headline">${esc(l.title)}</div>` +
      `<div class="line">${l.sans.map((s, i) => (i + 1 === l.step ? `<b>${esc(s)}</b>` : esc(s))).join(' ')}</div>` +
      `<div class="muted" style="margin-top:8px;font-size:0.85rem">Use ◀ ▶ to step through the line.</div>`;
    add('Back to the game', () => goTo(state.cursor), true);
    return;
  }

  const { review, cursor, stops, opening } = state;
  const nextStop = stops.find((p) => p > cursor);
  const prevStop = [...stops].reverse().find((p) => p < cursor);

  if (cursor === 0) {
    bubble.innerHTML = introText();
    add('Start the review ▶', () => goTo(1), true);
    return;
  }

  const m = review.moves[cursor - 1];
  const mine = m.color === state.me;
  const who = mine ? '' : `${sideName(m.color)}'s `;
  const step = opening.steps[cursor - 1];
  // In the opening a book move is explained by the opening itself.
  const note = step && openingNote(step, cursor > 1 && opening.steps[cursor - 2].opening);
  const explanation = step && m.cls === 'book' && note ? '' : m.explanation;
  bubble.innerHTML =
    (step ? `<div class="phase">Opening · step ${cursor} of ${opening.endPly}</div>` : '') +
    `<div class="headline">${badge(m.cls)} <span>${esc(who + moveLabel(m))} is ` +
    `<span class="cls-text" style="color:${COLORS[m.cls]}">${VERDICT[m.cls]}</span></span>` +
    `<span class="muted" style="font-weight:500;font-size:0.85rem">${formatEval(m.after.eval)}</span></div>` +
    (note ? `<div class="opening-note">${esc(note)}</div>` : '') +
    (explanation ? `<div>${esc(explanation)}</div>` : '') +
    (step ? alternativesHtml(m, step, cursor > 1 && opening.steps[cursor - 2].opening) : '') +
    (m.bestLineText ? `<div class="line">Best line: <b>${esc(m.bestLineText)}</b></div>` : '');

  const bad = !CLASSES[m.cls].good;
  if (bad && mine) add('Find a better move', () => startQuiz(m), true);
  if (bad && m.best) add('Show best line', () => showLine(m.fenBefore, m.best.pv, `Instead of ${m.san}: the engine's line`));
  if (['mistake', 'blunder'].includes(m.cls) && m.after.lines[0]) {
    add('Show the threat', () => showLine(m.fenAfter, m.after.lines[0].pv, `What ${m.san} allows`));
  }
  if (prevStop != null) add(prevStop <= opening.endPly ? '◀ Previous move' : '◀ Previous key moment', () => goTo(prevStop));
  if (nextStop != null) {
    add(nextStop <= opening.endPly ? 'Next move ▶' : 'Next key moment ▶', () => travel(nextStop), !(bad && mine));
  } else if (cursor < review.moves.length) {
    add('Next move ▶', () => goTo(cursor + 1));
  }
  const afterOpening = stops.find((p) => p > opening.endPly);
  if (step && cursor < opening.endPly && afterOpening != null) add('Skip the opening ⏭', () => travel(afterOpening));
}

// The other book moves at this point, main lines first. Names are shortened
// to the variation when they stay in the opening already on the board.
function alternativesHtml(m, step, prevOpening) {
  const alts = step.alternatives.slice(0, 3);
  if (!alts.length) return '';
  const family = prevOpening && familyOf(prevOpening.name);
  const label = (a) => (family && familyOf(a.name) === family && a.name.includes(': ') ? a.name.split(': ')[1] : a.name);
  const items = alts.map((a) => `<b>${esc(numberLine(m.fenBefore, [a.san]))}</b> ${esc(label(a))}`);
  return `<div class="line">${step.leftBook ? 'The book moves were' : 'Other book moves'}: ${items.join(' · ')}</div>`;
}

function introText() {
  const { review, me, keys, meta } = state;
  const s = review.summary[me];
  const mine = review.moves.filter((m) => m.color === me);
  const errors = mine.filter((m) => ['mistake', 'blunder'].includes(m.cls)).length;
  const highlights = mine.filter((m) => ['brilliant', 'great'].includes(m.cls)).length;
  const acc = s.accuracy;
  const opener = acc >= 90 ? 'Great game!' : acc >= 75 ? 'Nice effort.' : acc >= 60 ? 'A fighting game.' : "That one was rough — but there's a lot to learn from it.";
  let text = `${opener} You played with <b>${acc.toFixed(0)}% accuracy</b>`;
  text += errors ? `, with ${errors} ${errors === 1 ? 'move' : 'moves'} I'd like to show you` : ' and no serious mistakes';
  text += highlights ? `, and ${highlights} standout ${highlights === 1 ? 'move' : 'moves'} worth celebrating.` : '.';
  const opening = state.opening.name || meta.opening;
  if (opening) text += ` <span class="muted">Opening: ${esc(opening)}.</span>`;
  const later = keys.filter((i) => i + 1 > state.opening.endPly).length;
  text += '<div style="margin-top:8px">' + (opening ? "We'll start with the opening, move by move" : "We'll start with the first moves");
  text += later
    ? `, then go through the ${later} key ${later === 1 ? 'moment' : 'moments'} after it. When you went wrong, I'll ask you to find a better move.</div>`
    : '. After that there are no big turning points — step through the moves to see each one rated.</div>';
  return `<div class="headline">Game review</div>${text}`;
}

// ── Lines ──────────────────────────────────────────────────────────────────

// Step through an engine line from `fen`. The game cursor stays put, so
// "Back to the game" returns to the move being discussed.
function showLine(fen, pv, title) {
  const { moves } = playLine(fen, pv, 8);
  const fens = [fen];
  const lastMoves = [undefined];
  for (const m of moves) { fens.push(m.after); lastMoves.push([m.from, m.to]); }
  const sans = numberLine(fen, moves.map((m) => m.san)).split(' ');
  // numberLine interleaves move numbers; keep them attached to their move.
  const tokens = [];
  for (const t of sans) {
    if (/^\d+\.(\.\.)?$/.test(t)) tokens.push(t);
    else if (tokens.length && /^\d+\.(\.\.)?$/.test(tokens.at(-1))) tokens[tokens.length - 1] += ' ' + t;
    else tokens.push(t);
  }
  state.mode = 'line';
  state.line = { fens, lastMoves, sans: tokens, step: 1, title };
  render();
}

// ── Quiz: find a better move ───────────────────────────────────────────────

function startQuiz(m) {
  state.cursor = m.ply;
  state.mode = 'quiz';
  state.quiz = { m, fen: m.fenBefore, tries: 0, result: null, thinking: false, done: false };
  const prev = state.review.moves[m.ply - 2];
  state.quiz.lastMove = prev ? [prev.from, prev.to] : undefined;
  render();
}

function renderQuiz(bubble, add) {
  const q = state.quiz;
  const m = q.m;
  let html;
  if (q.thinking) {
    html = `<div class="headline">Let me check that…</div>`;
  } else if (!q.result) {
    html = `<div class="headline">Your turn</div>` +
      `In the game you played <b>${esc(m.san)}</b>. Can you find something better? Make a move on the board.`;
  } else {
    html = q.result;
  }
  bubble.innerHTML = html;
  if (q.thinking) return;
  if (q.result && !q.done) add('Try again', () => resetQuiz(), true);
  if (!q.done && q.tries >= 1) add('Show me', () => revealQuiz(), q.tries >= 2);
  if (q.done) {
    if (m.best) add('Show best line', () => showLine(m.fenBefore, m.best.pv, "The engine's line"));
    const next = state.stops.find((p) => p > m.ply);
    if (next != null) add(next <= state.opening.endPly ? 'Next move ▶' : 'Next key moment ▶', () => travel(next), true);
  }
  add('Back to the game', () => goTo(m.ply));
}

function resetQuiz() {
  const q = state.quiz;
  q.fen = q.m.fenBefore;
  q.result = null;
  q.evalAfter = null;
  const prev = state.review.moves[q.m.ply - 2];
  q.lastMove = prev ? [prev.from, prev.to] : undefined;
  render();
}

function revealQuiz() {
  const q = state.quiz;
  const m = q.m;
  q.done = true;
  q.fen = m.fenBefore;
  q.reveal = m.best.pv[0];
  q.result = `<div class="headline">${badge('best')} The move was ${esc(m.bestSan)}</div>${esc(explainBest(m))}` +
    (m.bestLineText ? `<div class="line">Best line: <b>${esc(m.bestLineText)}</b></div>` : '');
  render();
}

async function onQuizMove(orig, dest) {
  const q = state.quiz;
  if (!q || q.done || q.thinking || q.result) {
    if (q) render(); // put back any piece the board moved
    return;
  }
  // Always grade against the exercise position, whatever the board shows.
  const chess = new Chess(q.m.fenBefore);
  let mv;
  try {
    // Promote to a queen; underpromotion is rarely the lesson here.
    mv = chess.move({ from: orig, to: dest, promotion: 'q' });
  } catch {
    render();
    return;
  }
  q.tries++;
  q.fen = chess.fen();
  q.lastMove = [orig, dest];
  q.thinking = true;
  render();

  const uci = mv.from + mv.to + (mv.promotion || '');
  let evalAfter = terminalEval(q.fen);
  if (!evalAfter) {
    const lines = await getEngine().analyse(q.fen, { depth: QUIZ_DEPTH, multipv: 1 });
    evalAfter = lines.length ? toWhite(lines[0], q.fen) : { cp: 0 };
  }
  if (state.quiz !== q) return; // the reader moved on meanwhile
  q.thinking = false;
  q.evalAfter = evalAfter;
  const g = gradeAttempt(q.m, uci, evalAfter);
  const m = q.m;
  const msg = {
    best: [`${badge('best')} Exactly — ${esc(mv.san)}!`, `That's the engine's top move. ${esc(explainBest(m))}`],
    good: [`${badge('excellent')} ${esc(mv.san)} works too!`, `That holds up well. The engine's favourite was ${esc(m.bestSan)}.`],
    better: [`${badge('inaccuracy')} Better than ${esc(m.san)}, but not quite`, `${esc(mv.san)} improves on the game, but there's something stronger here.`],
    same: [`${badge(m.cls)} That's the game move`, `${esc(m.san)} is what you played. Look for something else.`],
    bad: [`${badge('mistake')} Not this one`, `After ${esc(mv.san)} the position is ${formatEval(evalAfter)}. Look again — what is your opponent threatening, and what can you attack?`],
  }[g.verdict];
  q.result = `<div class="headline">${msg[0]}</div>${msg[1]}`;
  if (g.verdict === 'best' || g.verdict === 'good') q.done = true;
  render();
}

// ── Navigation ─────────────────────────────────────────────────────────────

function step(delta) {
  if (state.mode === 'line') {
    const l = state.line;
    l.step = Math.max(0, Math.min(l.fens.length - 1, l.step + delta));
    render();
    return;
  }
  goTo((state.mode === 'quiz' ? state.quiz.m.ply - 1 : state.cursor) + delta);
}

$('nav-first').addEventListener('click', () => goTo(0));
$('nav-prev').addEventListener('click', () => step(-1));
$('nav-next').addEventListener('click', () => step(1));
$('nav-last').addEventListener('click', () => goTo(state.fens.length - 1));
$('nav-flip').addEventListener('click', flip);
$('new-game').addEventListener('click', () => { show('load'); });

// ── Piece sets ─────────────────────────────────────────────────────────────

let pieceLink = null;

// Swap the piece stylesheet, dropping the old one only once the new one has
// loaded so the pieces never blink out.
function usePieces(set) {
  if (!PIECE_SETS[set]) set = 'cburnett';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL(set === 'cburnett' ? './vendor/chessground.cburnett.css' : `./vendor/pieces/${set}.css`, import.meta.url);
  link.dataset.pieces = set;
  pieceLink = link;
  link.addEventListener('load', () => {
    if (pieceLink !== link) { link.remove(); return; }
    for (const l of document.querySelectorAll('link[data-pieces]')) if (l !== link) l.remove();
  });
  document.head.appendChild(link);
  $('piece-set').value = set;
}

for (const [value, label] of Object.entries(PIECE_SETS)) $('piece-set').add(new Option(label, value));
const savedPieces = load('pieces');
if (savedPieces && savedPieces !== 'cburnett') usePieces(savedPieces);
$('piece-set').addEventListener('change', () => {
  usePieces($('piece-set').value);
  save('pieces', $('piece-set').value);
  $('piece-set').blur(); // give the arrow keys back to the board
});

function flip() {
  state.orientation = state.orientation === 'w' ? 'b' : 'w';
  render();
}

document.addEventListener('keydown', (e) => {
  if ($('review').hidden || e.target.matches('input, textarea, select')) return;
  if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'Home') goTo(0);
  else if (e.key === 'End') goTo(state.fens.length - 1);
  else if (e.key === 'f') flip();
  else return;
  e.preventDefault();
});

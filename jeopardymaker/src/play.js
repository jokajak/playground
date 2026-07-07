import { getRound, saveGameState, makeGameState } from './store.js';
import { createBuzzer, Phase } from './buzzer.js';

// One color per player slot (supports up to 6)
const PLAYER_COLORS = ['#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];

function playerColor(i) { return PLAYER_COLORS[i % PLAYER_COLORS.length]; }
function playerLabel(i) { return `P${i + 1}`; }

let _board = null;
let _state = null;
let _onExit = null;
let _buzzer = null;
let _boardEl = null;
let _scoreEls = [];
let _globalKeyHandler = null;

export function mountPlay(container, board, state, onExit) {
  _board = board;
  _state = state;
  _onExit = onExit;
  _buzzer = createBuzzer();

  if (_globalKeyHandler) document.removeEventListener('keydown', _globalKeyHandler);
  _globalKeyHandler = e => {
    if (document.querySelector('.modal-overlay, .help-overlay')) return;
    if (e.key === '?') _showHelp();
  };
  document.addEventListener('keydown', _globalKeyHandler);

  container.innerHTML = '';
  container.appendChild(_buildRoot());
}

// ── Root layout ──────────────────────────────────────────────────────────────

function _buildRoot() {
  const root = document.createElement('div');
  root.className = 'play-root';
  root.appendChild(_buildScorebar());
  _boardEl = _buildBoard();
  root.appendChild(_boardEl);
  return root;
}

function _buildScorebar() {
  const bar = document.createElement('div');
  bar.className = 'scorebar';

  const controls = document.createElement('div');
  controls.className = 'scorebar-controls';

  const exitBtn = document.createElement('button');
  exitBtn.className = 'ctrl-btn';
  exitBtn.textContent = '← Home';
  exitBtn.addEventListener('click', () => {
    if (_globalKeyHandler) { document.removeEventListener('keydown', _globalKeyHandler); _globalKeyHandler = null; }
    _onExit();
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'ctrl-btn';
  resetBtn.textContent = 'Reset';
  resetBtn.title = 'Clear all revealed cells and zero scores';
  resetBtn.addEventListener('click', _resetGame);

  const helpBtn = document.createElement('button');
  helpBtn.className = 'ctrl-btn';
  helpBtn.textContent = '?';
  helpBtn.addEventListener('click', _showHelp);

  controls.append(exitBtn, resetBtn, helpBtn);

  const scores = document.createElement('div');
  scores.className = 'scorebar-scores';

  _scoreEls = [];
  for (let i = 0; i < _state.playerCount; i++) {
    const el = document.createElement('div');
    el.className = 'player-score';
    el.style.color = playerColor(i);
    _scoreEls.push(el);
    scores.appendChild(el);
  }
  _refreshScores();

  bar.append(controls, scores);
  return bar;
}

function _refreshScores() {
  _scoreEls.forEach((el, i) => {
    el.textContent = `${playerLabel(i)}: ${_state.scores[i]}`;
  });
}

function _buildBoard() {
  const { categories, values } = getRound(_board);
  const revealed = new Set(_state.revealedCells);

  const board = document.createElement('div');
  board.className = 'play-board';
  board.style.gridTemplateColumns = `repeat(${categories.length}, 1fr)`;

  categories.forEach(cat => {
    const h = document.createElement('div');
    h.className = 'cell header-cell';
    h.textContent = cat.title;
    board.appendChild(h);
  });

  values.forEach((val, row) => {
    categories.forEach((cat, col) => {
      const key = `${row},${col}`;
      const el = document.createElement('div');
      el.className = 'cell value-cell' + (revealed.has(key) ? ' revealed' : '');
      el.dataset.row = row;
      el.dataset.col = col;
      if (!revealed.has(key)) {
        el.textContent = `$${val}`;
        el.addEventListener('click', () => _openCell(row, col, val, cat.cells[row]));
      }
      board.appendChild(el);
    });
  });

  return board;
}

function _refreshBoard() {
  const newBoard = _buildBoard();
  _boardEl.replaceWith(newBoard);
  _boardEl = newBoard;
}

function _markRevealed(row, col) {
  const key = `${row},${col}`;
  if (!_state.revealedCells.includes(key)) {
    _state.revealedCells.push(key);
    saveGameState(_state);
  }
  const el = _boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (el) {
    el.classList.add('revealed');
    el.textContent = '';
    el.replaceWith(el.cloneNode(false));
  }
}

function _resetGame() {
  if (!confirm('Reset game? This clears all revealed cells and scores.')) return;
  _state.revealedCells = [];
  _state.scores = _state.scores.map(() => 0);
  saveGameState(_state);
  _refreshScores();
  _refreshBoard();
}

function _adjustScore(playerIndex, delta) {
  _state.scores[playerIndex] += delta;
  saveGameState(_state);
  _refreshScores();
}

// ── Cell flow ────────────────────────────────────────────────────────────────
// Prompt shown → host taps a player button → buzz locked in
//   → Correct: award + show answer modal
//   → Wrong: deduct + reset buzzer + stay on prompt
// Prompt shown → Reveal Answer → answer modal
// Prompt shown → Close → back to board (not revealed)
// Answer modal → Close → mark cell revealed

function _openCell(row, col, value, cellData) {
  _buzzer.reset();
  _showPromptModal(row, col, value, cellData);
}

function _showPromptModal(row, col, value, cellData) {
  const { overlay, content } = _createModalShell();

  _renderCellPart(content, value, cellData.prompt);
  content.appendChild(_buildBuzzControls(row, col, value, cellData, overlay, content));

  document.body.appendChild(overlay);
  _syncBuzzUI(overlay, content, row, col, value, cellData);

  // Keyboard shortcuts (secondary to on-screen buttons)
  const keyHandler = e => {
    const phase = _buzzer.phase;
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= _state.playerCount && phase === Phase.IDLE) {
      _buzzer.buzz(digit);
      return;
    }
    if ((e.key === 'y' || e.key === 'Y') && phase !== Phase.IDLE) {
      e.preventDefault();
      const i = _buzzer.buzzedPlayer() - 1;
      _adjustScore(i, value);
      cleanup();
      _showAnswerModal(row, col, value, cellData);
    }
    if ((e.key === 'n' || e.key === 'N') && phase !== Phase.IDLE) {
      e.preventDefault();
      _adjustScore(_buzzer.buzzedPlayer() - 1, -value);
      _buzzer.reset();
    }
    if (e.code === 'Space') { e.preventDefault(); cleanup(); _showAnswerModal(row, col, value, cellData); }
    if (e.code === 'Escape') { cleanup(); }
  };
  document.addEventListener('keydown', keyHandler);

  const unsub = _buzzer.subscribe(() => _syncBuzzUI(overlay, content, row, col, value, cellData));

  function cleanup() {
    document.removeEventListener('keydown', keyHandler);
    unsub();
    _buzzer.reset();
    overlay.remove();
  }

  overlay._cleanup = cleanup;
}

function _buildBuzzControls(row, col, value, cellData, overlay, content) {
  const wrap = document.createElement('div');
  wrap.className = 'buzz-controls';
  wrap.dataset.buzzControls = '1';
  return wrap; // filled by _syncBuzzUI
}

function _syncBuzzUI(overlay, content, row, col, value, cellData) {
  const phase = _buzzer.phase;
  const wrap = content.querySelector('[data-buzz-controls]');
  if (!wrap) return;
  wrap.innerHTML = '';

  overlay.classList.toggle('buzz-p1', false);
  overlay.classList.toggle('buzz-p2', false);
  overlay.style.removeProperty('--buzz-color');

  if (phase === Phase.IDLE) {
    // Buzz-in row
    const buzzRow = document.createElement('div');
    buzzRow.className = 'buzz-btn-row';
    for (let i = 0; i < _state.playerCount; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn buzz-player-btn';
      btn.textContent = playerLabel(i);
      btn.style.borderColor = playerColor(i);
      btn.style.color = playerColor(i);
      btn.addEventListener('click', () => _buzzer.buzz(i + 1));
      buzzRow.appendChild(btn);
    }
    wrap.appendChild(buzzRow);

    // Utility row
    const utilRow = document.createElement('div');
    utilRow.className = 'buzz-util-row';

    const revealBtn = document.createElement('button');
    revealBtn.className = 'btn';
    revealBtn.textContent = 'Reveal Answer';
    revealBtn.addEventListener('click', () => {
      overlay._cleanup?.();
      _showAnswerModal(row, col, value, cellData);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay._cleanup?.());

    utilRow.append(revealBtn, closeBtn);
    wrap.appendChild(utilRow);

  } else {
    // Someone is buzzed in
    const playerIndex = _buzzer.buzzedPlayer() - 1;
    const color = playerColor(playerIndex);

    overlay.style.setProperty('--buzz-color', color);
    overlay.classList.add('buzz-active');

    const badge = document.createElement('div');
    badge.className = 'buzz-badge-active';
    badge.textContent = `${playerLabel(playerIndex)} buzzed in`;
    badge.style.color = color;
    badge.style.borderColor = color;
    wrap.appendChild(badge);

    const actionRow = document.createElement('div');
    actionRow.className = 'buzz-action-row';

    const correctBtn = document.createElement('button');
    correctBtn.className = 'btn primary buzz-correct-btn';
    correctBtn.textContent = '✓ Correct';
    correctBtn.style.background = color;
    correctBtn.style.borderColor = color;
    correctBtn.addEventListener('click', () => {
      _adjustScore(playerIndex, value);
      overlay._cleanup?.();
      _showAnswerModal(row, col, value, cellData);
    });

    const wrongBtn = document.createElement('button');
    wrongBtn.className = 'btn danger buzz-wrong-btn';
    wrongBtn.textContent = '✗ Wrong';
    wrongBtn.addEventListener('click', () => {
      _adjustScore(playerIndex, -value);
      _buzzer.reset();
    });

    actionRow.append(correctBtn, wrongBtn);
    wrap.appendChild(actionRow);

    // Keep Reveal + Close available even when buzzed
    const utilRow = document.createElement('div');
    utilRow.className = 'buzz-util-row';

    const revealBtn = document.createElement('button');
    revealBtn.className = 'btn';
    revealBtn.textContent = 'Reveal Answer';
    revealBtn.addEventListener('click', () => {
      overlay._cleanup?.();
      _showAnswerModal(row, col, value, cellData);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay._cleanup?.());

    utilRow.append(revealBtn, closeBtn);
    wrap.appendChild(utilRow);
  }
}

function _showAnswerModal(row, col, value, cellData) {
  const { overlay, content } = _createModalShell();
  _renderCellPart(content, value, cellData.answer);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn primary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', cleanup);
  content.appendChild(closeBtn);

  document.body.appendChild(overlay);

  const keyHandler = e => {
    if (e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); cleanup(); }
  };
  document.addEventListener('keydown', keyHandler);
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });

  function cleanup() {
    document.removeEventListener('keydown', keyHandler);
    overlay.remove();
    _markRevealed(row, col);
  }
}

// ── Modal helpers ────────────────────────────────────────────────────────────

function _createModalShell() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const content = document.createElement('div');
  content.className = 'modal-content';
  overlay.appendChild(content);
  return { overlay, content };
}

function _renderCellPart(content, value, part) {
  const valEl = document.createElement('div');
  valEl.className = 'modal-value';
  valEl.textContent = `$${value}`;
  content.appendChild(valEl);

  if (part.imageDataUrl) {
    const img = document.createElement('img');
    img.className = 'modal-image';
    img.src = part.imageDataUrl;
    content.appendChild(img);
  }
  if (part.text) {
    const p = document.createElement('p');
    p.className = 'modal-text';
    p.textContent = part.text;
    content.appendChild(p);
  }
}

// ── Help overlay ─────────────────────────────────────────────────────────────

function _showHelp() {
  const overlay = document.createElement('div');
  overlay.className = 'help-overlay';

  const box = document.createElement('div');
  box.className = 'help-content';

  const n = _state.playerCount;
  const keyRows = n <= 6
    ? `<tr><td>1–${n}</td><td>Buzz in Player 1–${n} (keyboard shortcut)</td></tr>` : '';

  box.innerHTML = `
    <h2>Keyboard Shortcuts</h2>
    <table class="help-table">
      ${keyRows}
      <tr><td>Y</td><td>Award buzzed player (+value)</td></tr>
      <tr><td>N</td><td>Deduct buzzed player (−value), reopen</td></tr>
      <tr><td>Space</td><td>Reveal answer / close cell</td></tr>
      <tr><td>Esc</td><td>Close prompt without resolving</td></tr>
      <tr><td>?</td><td>Show / hide this overlay</td></tr>
    </table>
    <p style="color:#aaa;font-size:0.8rem;font-weight:normal;margin-top:12px;text-align:center">
      Tap player buttons on screen to buzz in
    </p>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn primary help-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', close);
  box.appendChild(closeBtn);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const handler = e => {
    if (e.code === 'Escape' || e.key === '?') { close(); }
  };
  document.addEventListener('keydown', handler);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', handler);
  }
}

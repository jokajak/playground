import { listBoards, makeBoard, saveBoard, deleteBoard, loadBoard, loadGameState, makeGameState, importBoard, exportBoard } from './store.js';

export async function mountHome(container, { onPlay, onEdit }) {
  container.innerHTML = '';
  const boards = await listBoards();

  const root = document.createElement('div');
  root.className = 'home-root';

  const header = document.createElement('div');
  header.className = 'home-header';
  header.innerHTML = '<h1>Jeopardy Maker</h1>';
  root.appendChild(header);

  const actions = document.createElement('div');
  actions.className = 'home-actions';

  const newBtn = document.createElement('button');
  newBtn.textContent = 'New Board';
  newBtn.className = 'btn primary';
  newBtn.addEventListener('click', async () => {
    const name = prompt('Board name:', 'New Board');
    if (!name) return;
    const board = makeBoard(name, 3);
    await saveBoard(board);
    await mountHome(container, { onPlay, onEdit });
  });

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import JSON';
  importBtn.className = 'btn';
  importBtn.addEventListener('click', () => triggerImport(container, { onPlay, onEdit }));

  actions.appendChild(newBtn);
  actions.appendChild(importBtn);
  root.appendChild(actions);

  if (boards.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No boards yet. Create one or import a JSON file.';
    root.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'board-list';
    boards.forEach(board => list.appendChild(buildBoardItem(board, container, { onPlay, onEdit })));
    root.appendChild(list);
  }

  container.appendChild(root);
}

function buildBoardItem(board, container, { onPlay, onEdit }) {
  const item = document.createElement('li');
  item.className = 'board-item';

  const info = document.createElement('div');
  info.className = 'board-info';
  const title = document.createElement('span');
  title.className = 'board-title';
  title.textContent = board.name;
  const meta = document.createElement('span');
  meta.className = 'board-meta';
  const catCount = board.rounds[0].categories.length;
  meta.textContent = `${catCount} categories · ${new Date(board.createdAt).toLocaleDateString()}`;
  info.append(title, meta);

  const btns = document.createElement('div');
  btns.className = 'board-btns';

  const playBtn = document.createElement('button');
  playBtn.textContent = 'Play';
  playBtn.className = 'btn primary small';
  playBtn.addEventListener('click', async () => {
    const b = await loadBoard(board.id);
    const state = await loadGameState(board.id);
    onPlay(b, state);
  });

  const newGameBtn = document.createElement('button');
  newGameBtn.textContent = 'New Game';
  newGameBtn.className = 'btn small';
  newGameBtn.title = 'Choose player count, reset scores and revealed cells';
  newGameBtn.addEventListener('click', async () => {
    try {
      const b = await loadBoard(board.id);
      pickPlayerCount(n => {
        const state = makeGameState(board.id, n);
        onPlay(b, state);
      });
    } catch (e) {
      alert(`Could not start game: ${e.message}`);
    }
  });

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.className = 'btn small';
  editBtn.addEventListener('click', async () => {
    const b = await loadBoard(board.id);
    onEdit(b);
  });

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export';
  exportBtn.className = 'btn small';
  exportBtn.addEventListener('click', () => triggerExport(board));

  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.className = 'btn danger small';
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${board.name}"?`)) return;
    await deleteBoard(board.id);
    await mountHome(container, { onPlay, onEdit });
  });

  btns.append(playBtn, newGameBtn, editBtn, exportBtn, delBtn);
  item.append(info, btns);
  return item;
}

function triggerExport(board) {
  const json = exportBoard(board);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${board.name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function pickPlayerCount(onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const box = document.createElement('div');
  box.className = 'modal-content player-count-modal';

  const heading = document.createElement('div');
  heading.className = 'modal-value';
  heading.textContent = 'How many players?';
  box.appendChild(heading);

  const btnRow = document.createElement('div');
  btnRow.className = 'player-count-btns';
  [2, 3, 4, 5, 6].forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'btn primary player-count-btn';
    btn.textContent = n;
    btn.addEventListener('click', () => { overlay.remove(); onPick(n); });
    btnRow.appendChild(btn);
  });

  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const esc = e => { if (e.code === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}

function triggerImport(container, callbacks) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const board = importBoard(text);
      await saveBoard(board);
      await mountHome(container, callbacks);
    } catch (e) {
      alert(`Import failed: ${e.message}`);
    }
  });
  input.click();
}

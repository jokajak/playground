import { getRound, saveBoard, makeCategory, exportBoard as serializeBoard } from './store.js';
import { fileToDataUrl, wireDropzone, imageFromPaste } from './image.js';

let _board = null;
let _container = null;
let _onExit = null;
let _saveTimer = null;
let _keyHandler = null;
let _gridEl = null;

export function mountEditor(container, board, onExit) {
  _board = board;
  _container = container;
  _onExit = onExit;
  _render();
  _keyHandler = e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); _doExport(); }
  };
  document.addEventListener('keydown', _keyHandler);
}

function _unmount() {
  clearTimeout(_saveTimer);
  if (_keyHandler) { document.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
}

function _autoSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveBoard(_board), 400);
}

function _doExport() {
  const json = serializeBoard(_board);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${_board.name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Render ───────────────────────────────────────────────────────────────────

function _render() {
  _container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'editor-root';
  root.appendChild(_buildToolbar());
  _gridEl = _buildGrid();
  root.appendChild(_gridEl);
  _container.appendChild(root);
}

function _buildToolbar() {
  const bar = document.createElement('div');
  bar.className = 'editor-toolbar';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn small';
  backBtn.textContent = '← Home';
  backBtn.addEventListener('click', () => { _unmount(); _onExit(); });

  const titleInput = document.createElement('input');
  titleInput.className = 'editor-title-input';
  titleInput.type = 'text';
  titleInput.value = _board.name;
  titleInput.placeholder = 'Board name';
  titleInput.addEventListener('input', () => { _board.name = titleInput.value || 'Untitled'; _autoSave(); });

  const catCtrl = document.createElement('div');
  catCtrl.className = 'cat-ctrl';

  const minusBtn = document.createElement('button');
  minusBtn.className = 'btn small';
  minusBtn.textContent = '−';

  const countSpan = document.createElement('span');
  countSpan.className = 'cat-count';

  const plusBtn = document.createElement('button');
  plusBtn.className = 'btn small';
  plusBtn.textContent = '+';

  const refreshCount = () => {
    const n = getRound(_board).categories.length;
    countSpan.textContent = `${n} categories`;
    minusBtn.disabled = n <= 1;
    plusBtn.disabled = n >= 10;
  };

  minusBtn.addEventListener('click', () => {
    const cats = getRound(_board).categories;
    if (cats.length <= 1) return;
    cats.pop();
    refreshCount();
    _autoSave();
    _refreshGrid();
  });

  plusBtn.addEventListener('click', () => {
    const cats = getRound(_board).categories;
    if (cats.length >= 10) return;
    cats.push(makeCategory(`Category ${cats.length + 1}`));
    refreshCount();
    _autoSave();
    _refreshGrid();
  });

  refreshCount();
  catCtrl.append(minusBtn, countSpan, plusBtn);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn small';
  exportBtn.textContent = 'Export JSON';
  exportBtn.title = 'Ctrl+S / Cmd+S';
  exportBtn.addEventListener('click', _doExport);

  bar.append(backBtn, titleInput, catCtrl, exportBtn);
  return bar;
}

function _buildGrid() {
  const { categories, values } = getRound(_board);
  const grid = document.createElement('div');
  grid.className = 'editor-grid';
  grid.style.gridTemplateColumns = `repeat(${categories.length}, 1fr)`;

  categories.forEach((cat, col) => {
    const cell = document.createElement('div');
    cell.className = 'editor-cell editor-header-cell';
    const input = document.createElement('input');
    input.className = 'cat-title-input';
    input.type = 'text';
    input.value = cat.title;
    input.placeholder = 'Category';
    input.addEventListener('input', () => { cat.title = input.value; _autoSave(); });
    cell.appendChild(input);
    grid.appendChild(cell);
  });

  values.forEach((val, row) => {
    categories.forEach((cat, col) => {
      const cellData = cat.cells[row];
      const cellEl = document.createElement('div');
      cellEl.className = 'editor-cell editor-value-cell';
      cellEl.dataset.row = row;
      cellEl.dataset.col = col;
      _renderCellPreview(cellEl, val, cellData);
      cellEl.addEventListener('click', () => _openCellModal(col, row, val));
      grid.appendChild(cellEl);
    });
  });

  return grid;
}

function _refreshGrid() {
  if (!_gridEl) return;
  const newGrid = _buildGrid();
  _gridEl.replaceWith(newGrid);
  _gridEl = newGrid;
}

function _renderCellPreview(el, val, cellData) {
  el.innerHTML = '';
  const valEl = document.createElement('div');
  valEl.className = 'cell-val';
  valEl.textContent = `$${val}`;
  el.appendChild(valEl);

  const p = cellData.prompt;
  if (p.imageDataUrl) {
    const img = document.createElement('img');
    img.className = 'cell-thumb';
    img.src = p.imageDataUrl;
    el.appendChild(img);
  } else if (p.text) {
    const preview = document.createElement('div');
    preview.className = 'cell-preview';
    preview.textContent = p.text.length > 40 ? p.text.slice(0, 40) + '…' : p.text;
    el.appendChild(preview);
  }

  const hasPp = !!(p.text || p.imageDataUrl);
  const hasAp = !!(cellData.answer.text || cellData.answer.imageDataUrl);
  if (hasPp || hasAp) {
    const dots = document.createElement('div');
    dots.className = 'cell-dots';
    if (hasPp) dots.insertAdjacentHTML('beforeend', '<span class="dot dot-p" title="Has prompt"></span>');
    if (hasAp) dots.insertAdjacentHTML('beforeend', '<span class="dot dot-a" title="Has answer"></span>');
    el.appendChild(dots);
  }
}

// ── Cell modal ───────────────────────────────────────────────────────────────

function _openCellModal(col, row, val) {
  const { categories } = getRound(_board);
  const cat = categories[col];
  const cell = cat.cells[row];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const content = document.createElement('div');
  content.className = 'modal-content editor-modal-content';

  const heading = document.createElement('div');
  heading.className = 'editor-modal-heading';
  heading.textContent = `${cat.title || 'Category'} · $${val}`;
  content.appendChild(heading);

  const tabBar = document.createElement('div');
  tabBar.className = 'editor-tab-bar';
  const promptBtn = document.createElement('button');
  promptBtn.className = 'tab-btn active';
  promptBtn.textContent = 'Prompt';
  const answerBtn = document.createElement('button');
  answerBtn.className = 'tab-btn';
  answerBtn.textContent = 'Answer';
  tabBar.append(promptBtn, answerBtn);
  content.appendChild(tabBar);

  const tabBody = document.createElement('div');
  tabBody.className = 'editor-tab-body';
  content.appendChild(tabBody);

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn primary';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', closeModal);
  content.appendChild(doneBtn);

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // Document-level paste: when not in a textarea/input, treat as image paste
  // and route to whichever tab is active.
  const pasteHandler = async e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    const file = imageFromPaste(e);
    if (file) {
      e.preventDefault();
      const activeTab = promptBtn.classList.contains('active') ? 'prompt' : 'answer';
      const part = cell[activeTab];
      const dataUrl = await fileToDataUrl(file, msg => showTabError(tabBody, msg));
      if (dataUrl) { part.imageDataUrl = dataUrl; renderTab(activeTab); }
    }
  };
  document.addEventListener('paste', pasteHandler);

  function renderTab(which) {
    promptBtn.classList.toggle('active', which === 'prompt');
    answerBtn.classList.toggle('active', which === 'answer');
    tabBody.innerHTML = '';
    tabBody.appendChild(_buildTabPane(cell[which], () => renderTab(which)));
  }

  promptBtn.addEventListener('click', () => renderTab('prompt'));
  answerBtn.addEventListener('click', () => renderTab('answer'));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  const escHandler = e => { if (e.code === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);

  function closeModal() {
    document.removeEventListener('keydown', escHandler);
    document.removeEventListener('paste', pasteHandler);
    overlay.remove();
    _autoSave();
    const cellEl = _gridEl?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cellEl) _renderCellPreview(cellEl, val, cell);
  }

  renderTab('prompt');
}

function showTabError(tabBody, msg) {
  const errEl = tabBody.querySelector('.dropzone-error');
  if (errEl) { errEl.textContent = msg; setTimeout(() => { errEl.textContent = ''; }, 5000); }
}

function _buildTabPane(part, onRerender) {
  const pane = document.createElement('div');
  pane.className = 'tab-pane';

  const ta = document.createElement('textarea');
  ta.className = 'editor-textarea';
  ta.placeholder = 'Enter text…';
  ta.value = part.text || '';
  ta.addEventListener('input', () => { part.text = ta.value; });
  pane.appendChild(ta);

  // Dropzone
  const dropzone = document.createElement('div');
  dropzone.className = 'editor-dropzone' + (part.imageDataUrl ? ' has-image' : '');

  const onError = msg => {
    errEl.textContent = msg;
    setTimeout(() => { errEl.textContent = ''; }, 5000);
  };

  const onFile = async file => {
    const dataUrl = await fileToDataUrl(file, onError);
    if (dataUrl) { part.imageDataUrl = dataUrl; onRerender(); }
  };

  if (part.imageDataUrl) {
    const thumb = document.createElement('img');
    thumb.className = 'dropzone-thumb';
    thumb.src = part.imageDataUrl;
    dropzone.appendChild(thumb);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn small danger';
    removeBtn.textContent = '× Remove image';
    removeBtn.addEventListener('click', e => { e.stopPropagation(); part.imageDataUrl = null; onRerender(); });
    dropzone.appendChild(removeBtn);
  } else {
    const hint = document.createElement('div');
    hint.className = 'dropzone-hint';
    hint.innerHTML = '<span>Drop image here or paste</span>';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) onFile(fileInput.files[0]); });

    const pickBtn = document.createElement('button');
    pickBtn.className = 'btn small';
    pickBtn.textContent = 'Choose File';
    pickBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

    hint.appendChild(pickBtn);
    dropzone.appendChild(hint);
    dropzone.appendChild(fileInput);
  }

  wireDropzone(dropzone, onFile);

  // Paste directly on the dropzone element
  dropzone.addEventListener('paste', async e => {
    const file = imageFromPaste(e);
    if (file) { e.preventDefault(); await onFile(file); }
  });

  pane.appendChild(dropzone);

  const errEl = document.createElement('div');
  errEl.className = 'dropzone-error';
  pane.appendChild(errEl);

  return pane;
}

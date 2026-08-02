/* Multiplication Fluency — spaced-repetition drilling for times tables.
 * Everything (schedule + stats) lives in localStorage; no network, no build step.
 */
(function () {
  'use strict';

  const STORE_KEY = 'multiplication-fluency:v1';
  const THEME_KEY = 'mf-theme';

  const MIN_FACTOR = 0;
  const MAX_FACTOR = 12;

  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;

  /* Answer-speed thresholds that turn a correct answer into a grade. */
  const FAST_MS = 2500;   // recalled instantly -> "easy"
  const OK_MS = 6000;     // recalled, but worked for it -> "hard" beyond this

  /* Scheduler knobs (SM-2 with Anki-ish learning steps). */
  const START_EASE = 2.5;
  const MIN_EASE = 1.3;
  const MAX_INTERVAL = 365;      // days
  const LEARNING_STEP = 10 * MINUTE;
  const LEARNING_STEPS = 2;      // correct answers needed to leave the learning phase
  const RELEARN_GAP = 3;         // questions to wait before re-asking a missed fact
  const LEARNING_GAP = 6;        // ...before re-asking a new fact still in learning

  /* ---------------------------------------------------------------- storage */

  const defaultPrefs = () => ({
    tables: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    minB: 1,
    maxB: 12,
    pick: 'srs',
    newLimit: 10,
    mode: 'sprint',
    seconds: 60,
    count: 20,
    retry: true,
  });

  let store = { v: 1, facts: {}, prefs: defaultPrefs() };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        store.facts = parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : {};
        store.prefs = Object.assign(defaultPrefs(), parsed.prefs || {});
      }
    } catch (e) {
      /* corrupt or unavailable storage: start fresh, silently */
    }
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(store));
      } catch (e) { /* private mode / quota: keep running in memory */ }
    }, 120);
  }

  const key = (a, b) => a + 'x' + b;
  const parseKey = (k) => k.split('x').map(Number);

  function newRecord() {
    return {
      reps: 0,          // successful graduations out of learning
      step: 0,          // position within the learning steps
      learning: true,
      lapses: 0,
      ease: START_EASE,
      interval: 0,      // days
      due: 0,           // epoch ms; 0 = never scheduled
      seen: 0,
      correct: 0,
      avgMs: 0,
      lastMs: 0,
      lastSeen: 0,
    };
  }

  const getRecord = (k) => store.facts[k];
  function ensureRecord(k) {
    if (!store.facts[k]) store.facts[k] = newRecord();
    return store.facts[k];
  }

  /* -------------------------------------------------------------- scheduler */

  function gradeOf(correct, ms) {
    if (!correct) return 'again';
    if (ms <= FAST_MS) return 'easy';
    if (ms <= OK_MS) return 'good';
    return 'hard';
  }

  /* Slight randomisation so facts learned together don't clump forever. */
  const fuzz = () => 0.95 + Math.random() * 0.1;

  /* Applies one grade to a fact and returns what the scheduler did with it:
   * 'relearn' (missed), 'learning' (new fact, more reps this session),
   * 'review' (scheduled days out) or 'ahead' (extra practice, left alone). */
  function schedule(rec, grade, now) {
    /* Drilling a fact before it is due is extra practice: it must not push the
     * next review further out, or a single sitting would "master" everything.
     * Getting it wrong still counts — that is a genuine lapse. */
    if (grade !== 'again' && !rec.learning && rec.due > now) return 'ahead';

    if (grade === 'again') {
      rec.lapses++;
      rec.ease = Math.max(MIN_EASE, rec.ease - 0.2);
      rec.learning = true;
      rec.step = 0;
      rec.interval = 0;
      rec.due = now;
      return 'relearn';
    }

    if (rec.learning) {
      /* A new (or lapsed) fact has to come back correct twice before it is
       * allowed out to day-scale intervals. */
      rec.step++;
      if (rec.step < LEARNING_STEPS) {
        rec.due = now + LEARNING_STEP;
        return 'learning';
      }
      rec.learning = false;
      rec.step = 0;
      rec.reps = 1;
      rec.interval = grade === 'easy' ? 2 : 1;
      rec.due = now + rec.interval * DAY * fuzz();
      return 'review';
    }

    if (grade === 'hard') rec.ease = Math.max(MIN_EASE, rec.ease - 0.15);
    if (grade === 'easy') rec.ease = rec.ease + 0.1;

    let next;
    if (rec.reps <= 1) {
      next = grade === 'hard' ? 1 : grade === 'good' ? 3 : 5;
    } else {
      const mult = grade === 'hard' ? 0.6 : grade === 'easy' ? 1.3 : 1;
      next = Math.max(rec.interval + 0.5, rec.interval * rec.ease * mult);
    }
    rec.interval = Math.min(MAX_INTERVAL, next);
    rec.reps++;
    rec.due = now + rec.interval * DAY * fuzz();
    return 'review';
  }

  function recordAnswer(k, correct, ms) {
    const now = Date.now();
    const rec = ensureRecord(k);
    rec.seen++;
    if (correct) {
      rec.correct++;
      rec.avgMs = rec.avgMs ? Math.round(rec.avgMs * 0.7 + ms * 0.3) : ms;
    }
    rec.lastMs = ms;
    rec.lastSeen = now;
    const outcome = schedule(rec, gradeOf(correct, ms), now);
    save();
    return outcome;
  }

  /* ---------------------------------------------------------------- mastery */

  function mastery(k) {
    const rec = getRecord(k);
    if (!rec || !rec.seen) return 'new';
    if (rec.learning || rec.interval < 1) return 'learning';
    if (rec.interval < 14) return 'practicing';
    return 'fluent';
  }

  function weakness(rec) {
    if (!rec || !rec.seen) return 0;
    const errRate = 1 - rec.correct / rec.seen;
    const slow = rec.avgMs ? Math.min(1, Math.max(0, (rec.avgMs - OK_MS) / OK_MS)) : 0;
    return errRate * 3 + rec.lapses * 0.5 + slow;
  }

  function weakestKeys(limit) {
    return Object.keys(store.facts)
      .filter((k) => {
        const rec = store.facts[k];
        return rec.seen > 0 && weakness(rec) > 0;
      })
      .sort((x, y) => weakness(store.facts[y]) - weakness(store.facts[x]))
      .slice(0, limit);
  }

  /* ------------------------------------------------------------------- pool */

  function poolKeys(prefs) {
    const keys = [];
    const lo = Math.min(prefs.minB, prefs.maxB);
    const hi = Math.max(prefs.minB, prefs.maxB);
    prefs.tables.slice().sort((a, b) => a - b).forEach((a) => {
      for (let b = lo; b <= hi; b++) keys.push(key(a, b));
    });
    return keys;
  }

  function dueCounts(keys, now) {
    let due = 0, learning = 0, fresh = 0, soonest = Infinity;
    keys.forEach((k) => {
      const rec = getRecord(k);
      if (!rec || !rec.seen) { fresh++; return; }
      if (rec.due <= now) { due++; if (rec.learning) learning++; }
      else soonest = Math.min(soonest, rec.due);
    });
    return { due, learning, fresh, soonest };
  }

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  /* Due reviews first (they are the time-sensitive ones), with new facts
   * sprinkled in so a session isn't a wall of unfamiliar material. */
  function buildQueue(prefs, keys, now) {
    if (prefs.pick === 'free') return shuffle(keys.slice());

    const due = keys
      .filter((k) => { const r = getRecord(k); return r && r.seen && r.due <= now; })
      .sort((x, y) => getRecord(x).due - getRecord(y).due);

    const fresh = keys
      .filter((k) => { const r = getRecord(k); return !r || !r.seen; })
      .sort((x, y) => {
        const [a1, b1] = parseKey(x), [a2, b2] = parseKey(y);
        return (a1 * b1) - (a2 * b2) || a1 - a2;
      })
      .slice(0, prefs.newLimit);

    if (!due.length) return fresh;
    if (!fresh.length) return due;

    const queue = due.slice();
    const gap = Math.max(1, Math.floor(due.length / fresh.length));
    fresh.forEach((k, i) => {
      const at = Math.min(queue.length, (i + 1) * gap + i);
      queue.splice(at, 0, k);
    });
    return queue;
  }

  /* --------------------------------------------------------------- elements */

  const $ = (id) => document.getElementById(id);
  const el = {
    setup: $('setup'), drill: $('drill'), summary: $('summary'),
    tableChips: $('tableChips'), minB: $('minB'), maxB: $('maxB'), poolCount: $('poolCount'),
    pickSeg: $('pickSeg'), newField: $('newField'), newLimit: $('newLimit'),
    pickHelp: $('pickHelp'), dueLine: $('dueLine'),
    modeSeg: $('modeSeg'), sprintField: $('sprintField'), setField: $('setField'),
    seconds: $('seconds'), count: $('count'), optRetry: $('optRetry'), btnStart: $('btnStart'),
    progressSummary: $('progressSummary'), heatmap: $('heatmap'),
    focusLabel: $('focusLabel'), focusList: $('focusList'),
    btnDrillWeak: $('btnDrillWeak'), btnReset: $('btnReset'),
    drillProgress: $('drillProgress'), drillScore: $('drillScore'), drillBar: $('drillBar'),
    prompt: $('prompt'), answer: $('answer'), feedback: $('feedback'), srStatus: $('srStatus'),
    keypad: $('keypad'), btnQuit: $('btnQuit'),
    summaryTitle: $('summaryTitle'), summaryStats: $('summaryStats'), summarySched: $('summarySched'),
    summaryMissedWrap: $('summaryMissedWrap'), summaryMissed: $('summaryMissed'),
    summarySlowWrap: $('summarySlowWrap'), summarySlow: $('summarySlow'),
    btnAgain: $('btnAgain'), btnPracticeMissed: $('btnPracticeMissed'), btnBack: $('btnBack'),
    btnTheme: $('btnTheme'),
  };

  /* ------------------------------------------------------------ setup screen */

  function buildFactorControls() {
    for (let n = 1; n <= MAX_FACTOR; n++) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.dataset.table = String(n);
      b.textContent = String(n);
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', n + ' times table');
      el.tableChips.appendChild(b);
    }
    [el.minB, el.maxB].forEach((sel) => {
      for (let n = MIN_FACTOR; n <= MAX_FACTOR; n++) {
        const o = document.createElement('option');
        o.value = String(n);
        o.textContent = String(n);
        sel.appendChild(o);
      }
    });
  }

  function syncSetup() {
    const p = store.prefs;
    Array.from(el.tableChips.children).forEach((b) => {
      b.setAttribute('aria-pressed', p.tables.indexOf(Number(b.dataset.table)) !== -1 ? 'true' : 'false');
    });
    el.minB.value = String(p.minB);
    el.maxB.value = String(p.maxB);
    el.newLimit.value = String(p.newLimit);
    el.seconds.value = String(p.seconds);
    el.count.value = String(p.count);
    el.optRetry.checked = !!p.retry;

    Array.from(el.pickSeg.children).forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.pick === p.pick ? 'true' : 'false');
    });
    Array.from(el.modeSeg.children).forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.mode === p.mode ? 'true' : 'false');
    });
    el.sprintField.hidden = p.mode !== 'sprint';
    el.setField.hidden = p.mode !== 'set';
    el.newField.hidden = p.pick !== 'srs';

    const keys = poolKeys(p);
    const now = Date.now();
    el.poolCount.textContent = keys.length + ' fact' + (keys.length === 1 ? '' : 's') + ' selected';
    el.btnStart.disabled = keys.length === 0;

    if (p.pick === 'srs') {
      el.pickHelp.textContent =
        'Facts you miss come back within the same session; facts you nail move out to days, then weeks.';
      const c = dueCounts(keys, now);
      const bits = [];
      bits.push(c.due ? c.due + ' due now' : 'nothing due');
      if (c.fresh) bits.push(Math.min(c.fresh, p.newLimit) + ' new to introduce');
      if (!c.due && !c.fresh) {
        bits.push(c.soonest < Infinity ? 'next review ' + relativeTime(c.soonest - now) : '');
        bits.push('extra practice will use your soonest-due facts');
      }
      el.dueLine.textContent = bits.filter(Boolean).join(' · ');
    } else {
      el.pickHelp.textContent =
        'Straight random drilling over everything selected. Answers still feed the spaced-repetition schedule.';
      el.dueLine.textContent = '';
    }

    renderProgress(keys);
  }

  function relativeTime(ms) {
    if (ms <= 0) return 'now';
    const mins = ms / MINUTE;
    if (mins < 60) return 'in ' + Math.max(1, Math.round(mins)) + ' min';
    const hours = mins / 60;
    if (hours < 24) return 'in ' + Math.round(hours) + ' hr';
    const days = Math.round(hours / 24);
    return 'in ' + days + ' day' + (days === 1 ? '' : 's');
  }

  function renderProgress(keys) {
    const counts = { new: 0, learning: 0, practicing: 0, fluent: 0 };
    keys.forEach((k) => { counts[mastery(k)]++; });
    const tracked = counts.learning + counts.practicing + counts.fluent;
    el.progressSummary.textContent = tracked === 0
      ? 'No history yet — your first session builds the schedule.'
      : counts.fluent + ' fluent · ' + counts.practicing + ' in review · ' +
        counts.learning + ' still learning · ' + counts.new + ' not tried yet' +
        ' (of ' + keys.length + ' selected)';

    renderHeatmap();

    const weak = weakestKeys(8);
    el.focusLabel.hidden = weak.length === 0;
    el.btnDrillWeak.disabled = weakestKeys(1).length === 0;
    el.focusList.innerHTML = '';
    weak.forEach((k) => {
      const [a, b] = parseKey(k);
      const rec = getRecord(k);
      const acc = Math.round((rec.correct / rec.seen) * 100);
      const chip = document.createElement('span');
      chip.className = 'fact ' + (acc < 100 ? 'wrong' : 'slow');
      chip.innerHTML = a + ' &times; ' + b + ' <small>' + acc + '%</small>';
      chip.title = a + ' × ' + b + ' = ' + (a * b) + ' — ' + rec.correct + '/' + rec.seen +
        ' correct, next review ' + (rec.due ? relativeTime(rec.due - Date.now()) : 'now');
      el.focusList.appendChild(chip);
    });
  }

  function renderHeatmap() {
    const t = el.heatmap;
    Array.from(t.querySelectorAll('thead,tbody')).forEach((n) => n.remove());

    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    hrow.appendChild(document.createElement('th'));
    for (let b = MIN_FACTOR; b <= MAX_FACTOR; b++) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = String(b);
      hrow.appendChild(th);
    }
    thead.appendChild(hrow);
    t.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let a = MIN_FACTOR; a <= MAX_FACTOR; a++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = String(a);
      tr.appendChild(th);
      for (let b = MIN_FACTOR; b <= MAX_FACTOR; b++) {
        const k = key(a, b);
        const rec = getRecord(k);
        const td = document.createElement('td');
        td.className = 'm-' + mastery(k);
        const desc = a + ' × ' + b + ' = ' + (a * b) + ' — ' + (
          rec && rec.seen
            ? rec.correct + '/' + rec.seen + ' correct, next review ' + relativeTime(rec.due - Date.now())
            : 'not tried yet'
        );
        td.title = desc;
        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = desc;
        td.appendChild(sr);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    t.appendChild(tbody);
  }

  const PRESETS = {
    all: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    easy: [1, 2, 5, 10],
    low: [2, 3, 4, 5],
    high: [6, 7, 8, 9, 10, 11, 12],
    tricky: [6, 7, 8, 12],
    none: [],
  };

  function wireSetup() {
    el.tableChips.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-table]');
      if (!b) return;
      const n = Number(b.dataset.table);
      const i = store.prefs.tables.indexOf(n);
      if (i === -1) store.prefs.tables.push(n); else store.prefs.tables.splice(i, 1);
      save(); syncSetup();
    });

    document.querySelectorAll('[data-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        store.prefs.tables = PRESETS[b.dataset.preset].slice();
        save(); syncSetup();
      });
    });

    el.minB.addEventListener('change', () => { store.prefs.minB = Number(el.minB.value); save(); syncSetup(); });
    el.maxB.addEventListener('change', () => { store.prefs.maxB = Number(el.maxB.value); save(); syncSetup(); });
    el.newLimit.addEventListener('change', () => { store.prefs.newLimit = Number(el.newLimit.value); save(); syncSetup(); });
    el.seconds.addEventListener('change', () => { store.prefs.seconds = Number(el.seconds.value); save(); });
    el.count.addEventListener('change', () => { store.prefs.count = Number(el.count.value); save(); });
    el.optRetry.addEventListener('change', () => { store.prefs.retry = el.optRetry.checked; save(); });

    el.pickSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-pick]');
      if (!b) return;
      store.prefs.pick = b.dataset.pick; save(); syncSetup();
    });
    el.modeSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (!b) return;
      store.prefs.mode = b.dataset.mode; save(); syncSetup();
    });

    el.btnStart.addEventListener('click', () => startSession());
    el.btnDrillWeak.addEventListener('click', () => startSession({ keys: weakestKeys(15), label: 'Weakest facts' }));

    el.btnReset.addEventListener('click', () => {
      if (!window.confirm('Erase all progress and start the schedule over?')) return;
      store.facts = {};
      save(); syncSetup();
    });
  }

  /* ------------------------------------------------------------- the session */

  let S = null;

  function show(section) {
    el.setup.hidden = section !== 'setup';
    el.drill.hidden = section !== 'drill';
    el.summary.hidden = section !== 'summary';
  }

  function startSession(override) {
    const p = store.prefs;
    const opts = override || {};
    const keys = (opts.keys && opts.keys.length) ? opts.keys.slice() : poolKeys(p);
    if (!keys.length) return;

    const now = Date.now();
    S = {
      label: opts.label || null,
      free: !!opts.keys || p.pick === 'free',
      pool: keys,
      queue: opts.keys ? shuffle(keys.slice()) : buildQueue(p, keys, now),
      pending: [],            // in-session repeats: {k, readyAt}
      mode: p.mode,
      limit: p.mode === 'set' ? p.count : Infinity,
      endsAt: p.mode === 'sprint' ? now + p.seconds * 1000 : Infinity,
      startedAt: now,
      asked: 0,
      correct: 0,
      streak: 0,
      bestStreak: 0,
      times: [],
      missed: [],
      slow: [],
      introduced: 0,
      graduated: 0,
      lapsed: 0,
      current: null,
      typed: '',
      phase: 'idle',          // idle | answering | retry | between
      last: null,
      timer: null,
    };

    show('drill');
    el.feedback.textContent = '';
    el.feedback.className = 'feedback';
    S.timer = setInterval(tick, 200);
    nextQuestion();
  }

  function nextKey() {
    const ready = S.pending.filter((x) => x.readyAt <= S.asked);
    if (ready.length) {
      const pick = ready[0];
      S.pending.splice(S.pending.indexOf(pick), 1);
      return pick.k;
    }
    while (S.queue.length) {
      const k = S.queue.shift();
      if (k !== S.last || (!S.queue.length && !S.pending.length)) return k;
      S.queue.push(k);
      if (S.queue.every((q) => q === S.last)) return S.queue.shift();
    }
    if (S.pending.length) {
      const pick = S.pending.shift();
      return pick.k;
    }
    // Nothing due and nothing new left: keep practising the soonest-due facts.
    const extras = S.pool.slice().sort((x, y) => {
      const rx = getRecord(x), ry = getRecord(y);
      return (rx ? rx.due : 0) - (ry ? ry.due : 0);
    });
    const filtered = extras.filter((k) => k !== S.last);
    const source = filtered.length ? filtered : extras;
    S.queue = S.free ? shuffle(source.slice()) : source.slice(0, Math.max(6, Math.ceil(source.length / 2)));
    return S.queue.shift();
  }

  function nextQuestion() {
    if (S.asked >= S.limit || Date.now() >= S.endsAt) return endSession();

    const k = nextKey();
    const [a, b] = parseKey(k);
    const rec = getRecord(k);
    S.current = {
      k, a, b,
      answer: a * b,
      fresh: !rec || !rec.seen,
      shownAt: performance.now(),
    };
    S.last = k;
    S.typed = '';
    S.phase = 'answering';
    el.prompt.innerHTML = a + ' <span class="op">&times;</span> ' + b;
    el.prompt.setAttribute('aria-label', a + ' times ' + b);
    el.srStatus.textContent = a + ' times ' + b;
    paintAnswer();
    updateHud();
  }

  function paintAnswer() {
    const box = el.answer;
    box.classList.remove('right', 'wrong');
    if (S.typed === '') {
      box.classList.add('empty');
      box.innerHTML = '<span class="caret"></span>';
    } else {
      box.classList.remove('empty');
      box.textContent = S.typed;
    }
  }

  function updateHud() {
    const now = Date.now();
    if (S.mode === 'sprint') {
      const left = Math.max(0, S.endsAt - now);
      const secs = Math.ceil(left / 1000);
      el.drillProgress.innerHTML = '<b>' + Math.floor(secs / 60) + ':' +
        String(secs % 60).padStart(2, '0') + '</b> left';
      el.drillBar.style.width = (left / (store.prefs.seconds * 1000) * 100) + '%';
    } else if (S.mode === 'set') {
      el.drillProgress.innerHTML = '<b>' + Math.min(S.asked + 1, S.limit) + '</b> of ' + S.limit;
      el.drillBar.style.width = (S.asked / S.limit * 100) + '%';
    } else {
      el.drillProgress.innerHTML = '<b>' + S.asked + '</b> answered';
      el.drillBar.style.width = '100%';
    }
    const acc = S.asked ? Math.round(S.correct / S.asked * 100) : 100;
    el.drillScore.innerHTML = '<b>' + S.correct + '</b>/' + S.asked + ' · ' + acc + '%' +
      (S.streak >= 3 ? ' · <b>' + S.streak + '</b> streak' : '');
  }

  function tick() {
    if (!S) return;
    if (S.mode === 'sprint') {
      updateHud();
      if (Date.now() >= S.endsAt) endSession();
    }
  }

  function typeDigit(d) {
    if (S.phase !== 'answering' && S.phase !== 'retry') return;
    if (S.typed.length >= 4) return;
    if (S.typed === '0') S.typed = '';
    S.typed += d;
    paintAnswer();
  }

  function backspace() {
    if (S.phase !== 'answering' && S.phase !== 'retry') return;
    S.typed = S.typed.slice(0, -1);
    paintAnswer();
  }

  function submit() {
    if (S.phase === 'retry') return submitRetry();
    if (S.phase !== 'answering' || S.typed === '') return;

    const ms = Math.round(performance.now() - S.current.shownAt);
    const given = Number(S.typed);
    const right = given === S.current.answer;
    const fact = S.current.a + ' × ' + S.current.b + ' = ' + S.current.answer;

    const prev = getRecord(S.current.k);
    const wasLearning = !prev || !prev.seen || prev.learning;
    if (S.current.fresh) S.introduced++;
    const outcome = recordAnswer(S.current.k, right, ms);
    if (outcome === 'review' && wasLearning) S.graduated++;
    if (outcome === 'relearn') S.lapsed++;
    if (outcome === 'relearn' || outcome === 'learning') {
      S.pending.push({
        k: S.current.k,
        readyAt: S.asked + (outcome === 'relearn' ? RELEARN_GAP : LEARNING_GAP),
      });
    }

    S.asked++;
    S.times.push(ms);
    el.answer.classList.remove('empty');

    if (right) {
      S.correct++;
      S.streak++;
      S.bestStreak = Math.max(S.bestStreak, S.streak);
      if (ms > OK_MS) S.slow.push({ k: S.current.k, ms });
      el.answer.classList.add('right');
      el.feedback.className = 'feedback right';
      el.feedback.textContent = (ms <= FAST_MS ? 'Nice — ' : 'Correct — ') + (ms / 1000).toFixed(1) + 's';
      el.srStatus.textContent = 'Correct';
      S.phase = 'between';
      setTimeout(afterAnswer, 420);
    } else {
      S.streak = 0;
      S.missed.push({ k: S.current.k, given });
      el.answer.classList.add('wrong');
      el.feedback.className = 'feedback wrong';
      el.srStatus.textContent = 'Incorrect. ' + fact;
      if (store.prefs.retry) {
        el.feedback.textContent = fact + ' — type it in';
        S.phase = 'retry';
        setTimeout(() => {
          if (!S || S.phase !== 'retry') return;
          S.typed = '';
          paintAnswer();
        }, 900);
      } else {
        el.feedback.textContent = fact;
        S.phase = 'between';
        setTimeout(afterAnswer, 1400);
      }
    }
    updateHud();
  }

  function submitRetry() {
    if (S.typed === '') return;
    if (Number(S.typed) !== S.current.answer) {
      S.typed = '';
      paintAnswer();
      el.answer.classList.add('wrong');
      return;
    }
    el.answer.classList.remove('wrong');
    el.answer.classList.add('right');
    S.phase = 'between';
    setTimeout(afterAnswer, 260);
  }

  function afterAnswer() {
    if (!S) return;
    el.feedback.textContent = '';
    el.feedback.className = 'feedback';
    el.answer.classList.remove('right', 'wrong');
    nextQuestion();
  }

  function wireDrill() {
    el.keypad.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-key]');
      if (!b || !S) return;
      const k = b.dataset.key;
      if (k === 'enter') submit();
      else if (k === 'back') backspace();
      else typeDigit(k);
    });

    el.btnQuit.addEventListener('click', () => endSession());

    document.addEventListener('keydown', (e) => {
      if (el.drill.hidden || !S) return;
      if (e.key >= '0' && e.key <= '9') { typeDigit(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { backspace(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === '=') { submit(); e.preventDefault(); }
      else if (e.key === 'Escape') { endSession(); e.preventDefault(); }
    });
  }

  /* ------------------------------------------------------------------ ending */

  function endSession() {
    if (!S) return;
    clearInterval(S.timer);
    S.phase = 'done';
    const done = S;
    S = null;
    renderSummary(done);
    show('summary');
    syncSetup();
  }

  function statTile(value, label) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = '<div class="v"></div><div class="k"></div>';
    d.firstChild.textContent = value;
    d.lastChild.textContent = label;
    return d;
  }

  function renderSummary(s) {
    el.summaryTitle.textContent = s.label ? s.label + ' — session summary' : 'Session summary';

    const acc = s.asked ? Math.round(s.correct / s.asked * 100) : 0;
    const median = s.times.length
      ? s.times.slice().sort((a, b) => a - b)[Math.floor(s.times.length / 2)]
      : 0;
    const elapsed = Math.max(1, Math.round((Date.now() - s.startedAt) / 1000));
    const perMin = s.asked ? Math.round(s.asked / (elapsed / 60)) : 0;

    el.summaryStats.innerHTML = '';
    [
      [s.correct + '/' + s.asked, 'Correct'],
      [acc + '%', 'Accuracy'],
      [(median / 1000).toFixed(1) + 's', 'Median time'],
      [String(perMin), 'Per minute'],
      [String(s.bestStreak), 'Best streak'],
    ].forEach(([v, k]) => el.summaryStats.appendChild(statTile(v, k)));

    const sched = [];
    if (s.introduced) sched.push(s.introduced + ' new fact' + (s.introduced === 1 ? '' : 's') + ' introduced');
    if (s.graduated) sched.push(s.graduated + ' graduated to a day or more');
    if (s.lapsed) sched.push(s.lapsed + ' sent back to learning');
    const nowKeys = s.pool;
    const c = dueCounts(nowKeys, Date.now());
    sched.push(c.due ? c.due + ' still due' : (c.soonest < Infinity ? 'next review ' + relativeTime(c.soonest - Date.now()) : 'all caught up'));
    el.summarySched.textContent = sched.join(' · ');

    const missKeys = [];
    s.missed.forEach((m) => { if (missKeys.indexOf(m.k) === -1) missKeys.push(m.k); });
    el.summaryMissedWrap.hidden = missKeys.length === 0;
    el.summaryMissed.innerHTML = '';
    missKeys.forEach((k) => {
      const [a, b] = parseKey(k);
      const chip = document.createElement('span');
      chip.className = 'fact wrong';
      chip.innerHTML = a + ' &times; ' + b + ' = <small>' + (a * b) + '</small>';
      el.summaryMissed.appendChild(chip);
    });

    const slowKeys = [];
    s.slow.forEach((x) => { if (slowKeys.indexOf(x.k) === -1 && missKeys.indexOf(x.k) === -1) slowKeys.push(x.k); });
    el.summarySlowWrap.hidden = slowKeys.length === 0;
    el.summarySlow.innerHTML = '';
    slowKeys.forEach((k) => {
      const [a, b] = parseKey(k);
      const rec = getRecord(k);
      const chip = document.createElement('span');
      chip.className = 'fact slow';
      chip.innerHTML = a + ' &times; ' + b + ' <small>' + ((rec.lastMs || 0) / 1000).toFixed(1) + 's</small>';
      el.summarySlow.appendChild(chip);
    });

    el.btnPracticeMissed.hidden = missKeys.length === 0;
    el.btnPracticeMissed.onclick = () => startSession({ keys: missKeys, label: 'Missed facts' });
    el.btnAgain.onclick = () => startSession(s.label ? { keys: s.pool, label: s.label } : null);
  }

  function wireSummary() {
    el.btnBack.addEventListener('click', () => { show('setup'); syncSetup(); });
  }

  /* ------------------------------------------------------------------- theme */

  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function currentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function paintThemeButton() {
    el.btnTheme.innerHTML = currentTheme() === 'dark' ? SUN : MOON;
  }

  function wireTheme() {
    paintThemeButton();
    el.btnTheme.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      paintThemeButton();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeButton);
  }

  /* -------------------------------------------------------------------- boot */

  load();
  buildFactorControls();
  wireSetup();
  wireDrill();
  wireSummary();
  wireTheme();
  syncSetup();
})();

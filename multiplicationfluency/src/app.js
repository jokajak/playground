/* Multiplication Fluency — spaced-repetition drilling for times tables.
 *
 * Fluency, not just correctness, is the goal: a fact only counts as known
 * when it is recalled *quickly*, so answer speed drives the grading, the
 * schedule, the mastery colours, and the animals you collect.
 *
 * Everything (schedule + stats + menagerie) lives in localStorage; no network,
 * no build step.
 */
(function () {
  'use strict';

  const STORE_KEY = 'multiplication-fluency:v1';
  const THEME_KEY = 'mf-theme';

  const MIN_FACTOR = 0;
  const MAX_FACTOR = 12;

  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;

  /* Answer-speed thresholds. FLUENT_MS is *the* bar: a correct answer slower
   * than this is knowledge, not fluency, and the scheduler treats it that way. */
  const SNAP_MS = 1500;      // straight off the top of your head -> "easy"
  const FLUENT_MS = 3000;    // the fluency bar; slower correct answers -> "hard"
  const FLUENT_STREAK = 3;   // quick answers in a row before a fact counts fluent

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

  let store = { v: 1, facts: {}, prefs: defaultPrefs(), animals: {}, names: {} };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        store.facts = parsed.facts && typeof parsed.facts === 'object' ? parsed.facts : {};
        store.prefs = Object.assign(defaultPrefs(), parsed.prefs || {});
        store.animals = parsed.animals && typeof parsed.animals === 'object' ? parsed.animals : {};
        store.names = parsed.names && typeof parsed.names === 'object' ? parsed.names : {};
        /* Records written before fluency tracking existed have no streak. */
        Object.keys(store.facts).forEach((k) => {
          if (typeof store.facts[k].fastStreak !== 'number') store.facts[k].fastStreak = 0;
        });
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
      fastStreak: 0,    // correct answers in a row inside the fluency bar
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
    if (ms <= SNAP_MS) return 'easy';
    if (ms <= FLUENT_MS) return 'good';
    return 'hard';   // right, but worked it out — not fluent yet
  }

  const isQuick = (ms) => ms <= FLUENT_MS;

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
      /* A new (or lapsed) fact has to come back *quickly* twice before it is
       * allowed out to day-scale intervals. Working the answer out counts as
       * a correct answer, but it does not advance the learning step. */
      if (grade === 'hard') {
        rec.due = now + LEARNING_STEP;
        return 'learning';
      }
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

    if (grade === 'hard') {
      /* Slow recall is a step backwards: see it again sooner, not later. */
      rec.ease = Math.max(MIN_EASE, rec.ease - 0.15);
      rec.interval = Math.max(1, rec.interval * 0.7);
    } else {
      if (grade === 'easy') rec.ease = rec.ease + 0.1;
      const next = rec.reps <= 1
        ? (grade === 'good' ? 3 : 5)
        : Math.max(rec.interval + 0.5, rec.interval * rec.ease * (grade === 'easy' ? 1.3 : 1));
      rec.interval = Math.min(MAX_INTERVAL, next);
    }
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
    rec.fastStreak = (correct && isQuick(ms)) ? rec.fastStreak + 1 : 0;
    rec.lastMs = ms;
    rec.lastSeen = now;
    const outcome = schedule(rec, gradeOf(correct, ms), now);
    save();
    return outcome;
  }

  /* ---------------------------------------------------------------- mastery */

  /* Fluent means recalled quickly, repeatedly — not merely answered right.
   * Deliberately independent of how long the interval has grown, so a fact
   * can be earned as fluent in the session where you actually get quick at it. */
  function isFluent(rec) {
    return !!rec && !rec.learning && rec.fastStreak >= FLUENT_STREAK &&
      !!rec.avgMs && rec.avgMs <= FLUENT_MS;
  }

  function mastery(k) {
    const rec = getRecord(k);
    if (!rec || !rec.seen) return 'new';
    if (rec.learning) return 'learning';
    if (isFluent(rec)) return 'fluent';
    return 'practicing';
  }

  /* Slow counts against you as much as wrong does — that is the whole point. */
  function weakness(rec) {
    if (!rec || !rec.seen) return 0;
    const errRate = 1 - rec.correct / rec.seen;
    const slow = rec.avgMs ? Math.min(1.5, Math.max(0, (rec.avgMs - FLUENT_MS) / FLUENT_MS)) : 0;
    return errRate * 3 + rec.lapses * 0.5 + slow * 1.5;
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

  /* -------------------------------------------------------------- menagerie */

  /* Companions hatch as your count of *fluent* facts grows. Nothing here is
   * awarded for merely getting answers right — only for getting quick. */
  const COMPANIONS = [
    { need: 1, emoji: '🐣', name: 'Chick' },
    { need: 3, emoji: '🐹', name: 'Hamster' },
    { need: 6, emoji: '🐥', name: 'Duckling' },
    { need: 10, emoji: '🐢', name: 'Turtle' },
    { need: 15, emoji: '🐸', name: 'Frog' },
    { need: 21, emoji: '🐶', name: 'Puppy' },
    { need: 28, emoji: '🦔', name: 'Hedgehog' },
    { need: 36, emoji: '🐱', name: 'Kitten' },
    { need: 45, emoji: '🐧', name: 'Penguin' },
    { need: 55, emoji: '🐰', name: 'Bunny' },
    { need: 66, emoji: '🦦', name: 'Otter' },
    { need: 78, emoji: '🦊', name: 'Fox cub' },
    { need: 91, emoji: '🐨', name: 'Koala' },
    { need: 105, emoji: '🐼', name: 'Panda' },
    { need: 120, emoji: '🦄', name: 'Unicorn' },
  ];
  COMPANIONS.forEach((c) => { c.id = 'c' + c.need; });

  const DRAGON_TABLES = 12;   // one dragon per times table, 1s through 12s
  const DRAGON_FACTS = 12;    // t×1 .. t×12 all fluent

  /* emoji is the cute face for tiles and the sidelines; flyEmoji is the
   * full-bodied dragon, which reads far better in flight. */
  const dragonDef = (t) => ({
    id: 'd' + t, emoji: '🐲', flyEmoji: '🐉',
    name: 'Dragon of the ' + t + 's', table: t, dragon: true,
  });

  const MAX_NAME = 18;
  /* What to call an animal: whatever you named it, else its species. */
  const displayName = (def) => store.names[def.id] || def.name;

  const fluentTotal = () =>
    Object.keys(store.facts).filter((k) => isFluent(store.facts[k])).length;

  function tableFluentCount(t) {
    let n = 0;
    for (let b = 1; b <= DRAGON_FACTS; b++) if (isFluent(getRecord(key(t, b)))) n++;
    return n;
  }

  /* Returns the animals earned right now. Once earned they are kept for good —
   * a fact going stale later never takes an animal away. */
  function checkUnlocks() {
    const fresh = [];
    const total = fluentTotal();
    COMPANIONS.forEach((c) => {
      if (total >= c.need && !store.animals[c.id]) {
        store.animals[c.id] = Date.now();
        fresh.push(c);
      }
    });
    for (let t = 1; t <= DRAGON_TABLES; t++) {
      const d = dragonDef(t);
      if (!store.animals[d.id] && tableFluentCount(t) >= DRAGON_FACTS) {
        store.animals[d.id] = Date.now();
        fresh.push(d);
      }
    }
    if (fresh.length) save();
    return fresh;
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
    zooSummary: $('zooSummary'), zooNext: $('zooNext'),
    zooBarWrap: $('zooBarWrap'), zooBar: $('zooBar'),
    cheerLeft: $('cheerLeft'), cheerRight: $('cheerRight'), sky: $('sky'),
    drillReward: $('drillReward'), summaryNext: $('summaryNext'),
    zooCompanions: $('zooCompanions'), zooDragons: $('zooDragons'),
    unlockWrap: $('unlockWrap'), unlockHead: $('unlockHead'), unlockList: $('unlockList'),
    fluBar: $('fluBar'), fluFill: $('fluFill'), toast: $('toast'),
    progressSummary: $('progressSummary'), heatmap: $('heatmap'),
    focusLabel: $('focusLabel'), focusList: $('focusList'),
    btnDrillWeak: $('btnDrillWeak'), btnReset: $('btnReset'),
    drillProgress: $('drillProgress'), drillScore: $('drillScore'), drillBar: $('drillBar'),
    prompt: $('prompt'), answer: $('answer'), feedback: $('feedback'), srStatus: $('srStatus'),
    keypad: $('keypad'), btnQuit: $('btnQuit'),
    summaryTitle: $('summaryTitle'), summaryStats: $('summaryStats'), summarySched: $('summarySched'),
    summaryMissedWrap: $('summaryMissedWrap'), summaryMissed: $('summaryMissed'),
    summarySlowWrap: $('summarySlowWrap'), summarySlow: $('summarySlow'),
    summarySlowTitle: $('summarySlowTitle'),
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
    renderZoo();
    renderSky();
  }

  function petTile(def, earned, need, fresh, renamable) {
    const d = document.createElement('div');
    d.className = 'pet ' + (earned ? 'earned' : 'locked') + (fresh ? ' fresh' : '');
    const face = document.createElement('div');
    face.className = 'face';
    face.textContent = earned ? def.emoji : (def.dragon ? '🥚' : def.emoji);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = earned ? displayName(def) : def.name;
    const req = document.createElement('div');
    req.className = 'need';
    /* Once renamed, the small print reminds you what species it started as. */
    req.textContent = earned
      ? (store.names[def.id] ? def.name : (renamable ? 'tap to name' : 'earned'))
      : need;
    d.appendChild(face);
    d.appendChild(name);
    d.appendChild(req);
    d.title = displayName(def) + ' — ' + (earned ? (renamable ? 'click to rename' : 'earned') : need);

    if (earned && renamable) {
      d.classList.add('renamable');
      d.setAttribute('role', 'button');
      d.tabIndex = 0;
      d.addEventListener('click', () => startRename(def, d));
      d.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startRename(def, d); }
      });
    }
    return d;
  }

  function startRename(def, tile) {
    const nameEl = tile.querySelector('.name');
    if (!nameEl) return;                       // already editing
    tile.removeAttribute('role');
    tile.removeAttribute('tabindex');

    const input = document.createElement('input');
    input.className = 'rename';
    input.type = 'text';
    input.value = displayName(def);
    input.maxLength = MAX_NAME;
    input.setAttribute('aria-label', 'Name for your ' + def.name);
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let settled = false;
    const finish = (keep) => {
      if (settled) return;
      settled = true;
      if (keep) {
        const v = input.value.trim().replace(/\s+/g, ' ');
        if (!v || v === def.name) delete store.names[def.id];
        else store.names[def.id] = v;
        save();
      }
      renderZoo();
      renderSky();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* What the next animal is and how close it is — shown on the setup screen,
   * during the drill, and on the summary, so the reward is never a mystery. */
  function nextReward() {
    const total = fluentTotal();
    const pet = COMPANIONS.filter((c) => !store.animals[c.id])[0];
    if (pet) {
      const prev = COMPANIONS.filter((c) => c.need < pet.need).pop();
      const from = prev ? prev.need : 0;
      return {
        def: pet,
        have: total,
        need: pet.need,
        togo: Math.max(0, pet.need - total),
        pct: Math.min(100, Math.round((total - from) / (pet.need - from) * 100)),
        text: '',
      };
    }
    /* Companions all earned: point at the closest unhatched dragon egg. */
    let best = null;
    for (let t = 1; t <= DRAGON_TABLES; t++) {
      const d = dragonDef(t);
      if (store.animals[d.id]) continue;
      const have = tableFluentCount(t);
      if (!best || have > best.have) {
        best = {
          def: d, have, need: DRAGON_FACTS, togo: DRAGON_FACTS - have,
          pct: Math.round(have / DRAGON_FACTS * 100),
          text: 'in the ' + t + 's',
        };
      }
    }
    return best;
  }

  function rewardLine(next) {
    if (!next) return 'Every animal earned. The whole menagerie is yours. 🎉';
    return next.def.emoji + ' <b>' + displayName(next.def) + '</b> — ' +
      (next.togo > 0
        ? next.togo + ' more fluent fact' + (next.togo === 1 ? '' : 's') +
          (next.text ? ' ' + next.text : '')
        : 'ready to hatch!');
  }

  function renderZoo() {
    const total = fluentTotal();
    const earnedCount = Object.keys(store.animals).length;
    const all = COMPANIONS.length + DRAGON_TABLES;
    el.zooSummary.textContent = earnedCount + ' of ' + all + ' animals · ' +
      total + ' fluent fact' + (total === 1 ? '' : 's') +
      ' — a fact turns fluent after 3 quick answers in a row.';

    const next = nextReward();
    el.zooNext.innerHTML = next ? 'Next up: ' + rewardLine(next) : rewardLine(next);
    el.zooBarWrap.hidden = !next;
    el.zooBar.style.width = (next ? next.pct : 100) + '%';

    el.zooCompanions.innerHTML = '';
    COMPANIONS.forEach((c) => {
      el.zooCompanions.appendChild(
        petTile(c, !!store.animals[c.id], c.need + ' fluent facts', false, true)
      );
    });

    el.zooDragons.innerHTML = '';
    for (let t = 1; t <= DRAGON_TABLES; t++) {
      const d = dragonDef(t);
      el.zooDragons.appendChild(
        petTile(d, !!store.animals[d.id],
          tableFluentCount(t) + '/' + DRAGON_FACTS + ' fluent', false, true)
      );
    }
  }

  /* ------------------------------------------------------- cheering squad */

  /* The animals you have earned line the sides of the drill and celebrate
   * every fluent answer. Decorative only — aria-hidden, and it never reacts
   * to a miss, so the squad is encouragement and never a scold. */
  const SQUAD_MAX = 14;           // most recently earned, oldest drop off the sides
  const SQUAD_MAX_NARROW = 6;     // no room to line the sides: keep the row short
  const CHEERS = ['Yay!', 'Wow!', 'Zoom!', 'So fast!', 'Nice!', 'Whoa!', 'Go!'];
  const wideScreen = window.matchMedia('(min-width: 1000px)');

  function allDefs() {
    const defs = COMPANIONS.slice();
    for (let t = 1; t <= DRAGON_TABLES; t++) defs.push(dragonDef(t));
    return defs;
  }

  function earnedDefs() {
    return allDefs()
      .filter((d) => store.animals[d.id])
      .sort((a, b) => store.animals[b.id] - store.animals[a.id])
      .slice(0, wideScreen.matches ? SQUAD_MAX : SQUAD_MAX_NARROW);
  }

  function renderSquad(freshIds) {
    const fresh = freshIds || [];
    const pals = earnedDefs();
    el.cheerLeft.innerHTML = '';
    el.cheerRight.innerHTML = '';

    pals.forEach((def, i) => {
      const pal = document.createElement('span');
      pal.className = 'pal' + (fresh.indexOf(def.id) !== -1 ? ' newbie' : '');
      pal.dataset.id = def.id;
      const face = document.createElement('span');
      face.className = 'face';
      face.textContent = def.emoji;
      face.style.setProperty('--bob', (i * 0.18).toFixed(2) + 's');
      pal.appendChild(face);
      /* Split across both sides only when there is room to flank the question. */
      const side = (wideScreen.matches && i % 2) ? el.cheerRight : el.cheerLeft;
      side.appendChild(pal);
    });

    const on = pals.length > 0 && !el.drill.hidden;
    el.cheerLeft.classList.toggle('on', on);
    el.cheerRight.classList.toggle('on', on && wideScreen.matches);
  }

  function cheer(big) {
    const pals = document.querySelectorAll('.pal');
    if (!pals.length) return;
    pals.forEach((p, i) => {
      p.classList.remove('cheering');
      void p.offsetWidth;
      setTimeout(() => p.classList.add('cheering'), big ? i * 45 : 0);
      setTimeout(() => p.classList.remove('cheering'), (big ? i * 45 : 0) + 740);
    });
  }

  function speak(text) {
    const pals = document.querySelectorAll('.pal');
    if (!pals.length) return;
    const pal = pals[Math.floor(Math.random() * pals.length)];
    if (pal.querySelector('.bubble')) return;
    const b = document.createElement('span');
    b.className = 'bubble';
    b.textContent = text;
    pal.appendChild(b);
    setTimeout(() => b.remove(), 1600);
  }

  wideScreen.addEventListener('change', () => renderSquad());

  /* Hatched dragons drift across the top of the setup screen. */
  const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function renderSky() {
    const dragons = allDefs().filter((d) => d.dragon && store.animals[d.id]);
    el.sky.innerHTML = '';
    el.sky.classList.toggle('on', dragons.length > 0);
    if (!dragons.length) return;

    const dist = (el.sky.clientWidth || 660) + 120;
    dragons.forEach((d, i) => {
      const f = document.createElement('span');
      f.className = 'flier';
      f.textContent = d.flyEmoji || d.emoji;
      f.title = displayName(d);
      f.style.top = (2 + (i * 11) % 18) + 'px';
      if (lessMotion.matches) {
        f.style.left = (14 + i * 52) + 'px';    // no drifting: just perch them
      } else {
        f.style.setProperty('--dist', dist + 'px');
        f.style.animationDuration = (12 + (i % 4) * 3) + 's';
        f.style.animationDelay = '-' + (i * 2.5).toFixed(1) + 's';
      }
      el.sky.appendChild(f);
    });
  }

  let skyTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(skyTimer);
    skyTimer = setTimeout(() => { if (!el.setup.hidden) renderSky(); }, 200);
  });

  let toastTimer = null;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
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
      chip.innerHTML = a + ' &times; ' + b + ' <small>' +
        (acc < 100 ? acc + '%' : (rec.avgMs / 1000).toFixed(1) + 's') + '</small>';
      chip.title = a + ' × ' + b + ' = ' + (a * b) + ' — ' + rec.correct + '/' + rec.seen +
        ' correct, ' + (rec.avgMs ? (rec.avgMs / 1000).toFixed(1) + 's average, ' : '') +
        'next review ' + (rec.due ? relativeTime(rec.due - Date.now()) : 'now');
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
      if (!window.confirm('Erase all progress, including every animal you have earned?')) return;
      store.facts = {};
      store.animals = {};
      store.names = {};
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
      fluent: 0,          // correct *and* inside the fluency bar
      streak: 0,          // consecutive fluent answers
      bestStreak: 0,
      unlocked: [],
      times: [],
      missed: [],
      slow: [],
      introduced: 0,
      graduated: 0,
      lapsed: 0,
      newlyFluent: 0,
      current: null,
      typed: '',
      phase: 'idle',          // idle | answering | retry | between
      last: null,
      timer: null,
    };

    show('drill');
    el.feedback.textContent = '';
    el.feedback.className = 'feedback';
    renderSquad();
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
    startFluencyBar();
    updateHud();
  }

  /* The bar drains over exactly the fluency window, so "beat the bar" and
   * "answer fluently" are the same thing. */
  function startFluencyBar() {
    const f = el.fluFill;
    f.classList.remove('over');
    f.style.transition = 'none';
    f.style.width = '100%';
    void f.offsetWidth;                        // commit before animating
    f.style.transition = 'width ' + FLUENT_MS + 'ms linear';
    f.style.width = '0%';
  }

  function freezeFluencyBar(quick) {
    const f = el.fluFill;
    const w = getComputedStyle(f).width;
    f.style.transition = 'none';
    f.style.width = w;
    f.classList.toggle('over', !quick);
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
    el.drillScore.innerHTML = '<b>' + S.fluent + '</b>/' + S.asked + ' fluent' +
      (S.streak >= 3 ? ' · 🔥<b>' + S.streak + '</b>' : '');
    el.drillReward.innerHTML = rewardLine(nextReward());
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

    const quick = right && isQuick(ms);
    freezeFluencyBar(quick);

    const prev = getRecord(S.current.k);
    const wasLearning = !prev || !prev.seen || prev.learning;
    const wasFluent = isFluent(prev);
    if (S.current.fresh) S.introduced++;
    const outcome = recordAnswer(S.current.k, right, ms);
    if (outcome === 'review' && wasLearning) S.graduated++;
    if (!wasFluent && isFluent(getRecord(S.current.k))) S.newlyFluent++;
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
      const secs = (ms / 1000).toFixed(1) + 's';
      if (quick) {
        S.fluent++;
        S.streak++;
        S.bestStreak = Math.max(S.bestStreak, S.streak);
        el.answer.classList.add('right');
        el.feedback.className = 'feedback right';
        el.feedback.textContent = (ms <= SNAP_MS ? 'Snap! ' : 'Fluent — ') + secs;
        el.srStatus.textContent = 'Correct, ' + secs;
        cheer(ms <= SNAP_MS || S.streak >= 5);
        if (S.streak >= 3 && S.streak % 3 === 0) {
          speak(S.streak >= 9 ? S.streak + ' in a row!' : CHEERS[Math.floor(Math.random() * CHEERS.length)]);
        }
      } else {
        /* Right, but worked out. Say so plainly — this is the whole point. */
        S.streak = 0;
        S.slow.push({ k: S.current.k, ms });
        el.answer.classList.add('slowright');
        el.feedback.className = 'feedback slow';
        el.feedback.textContent = 'Right, but slow — ' + secs + ' · aim for under 3s';
        el.srStatus.textContent = 'Correct but slow, ' + secs;
      }
      S.phase = 'between';
      setTimeout(afterAnswer, quick ? 420 : 900);
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

    const fresh = checkUnlocks();
    if (fresh.length) {
      fresh.forEach((a) => {
        S.unlocked.push(a);
        toast(a.emoji + '  ' + displayName(a) + ' earned!');
      });
      /* The new friend hops onto the sideline and everyone welcomes them. */
      renderSquad(fresh.map((a) => a.id));
      cheer(true);
      speak(fresh.length > 1 ? 'Welcome!' : 'Hi ' + displayName(fresh[0]) + '!');
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
    el.answer.classList.remove('right', 'wrong', 'slowright');
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
    renderSquad();          // drill is hidden now, so the squad steps off screen
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
      [s.fluent + '/' + s.asked, 'Fluent (under 3s)'],
      [s.correct + '/' + s.asked, 'Correct'],
      [acc + '%', 'Accuracy'],
      [(median / 1000).toFixed(1) + 's', 'Median time'],
      [String(perMin), 'Per minute'],
      [String(s.bestStreak), 'Best fluent streak'],
    ].forEach(([v, k]) => el.summaryStats.appendChild(statTile(v, k)));

    el.unlockWrap.hidden = s.unlocked.length === 0;
    el.unlockList.innerHTML = '';
    if (s.unlocked.length) {
      el.unlockHead.textContent = s.unlocked.length === 1
        ? 'New animal earned!'
        : s.unlocked.length + ' new animals earned!';
      s.unlocked.forEach((a) => el.unlockList.appendChild(petTile(a, true, '', true)));
    }
    el.summaryNext.innerHTML = 'Next up: ' + rewardLine(nextReward());

    const sched = [];
    if (s.newlyFluent) sched.push(s.newlyFluent + ' fact' + (s.newlyFluent === 1 ? '' : 's') + ' turned fluent');
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
    el.summarySlowTitle.textContent = 'Right, but too slow (over 3 seconds)';
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
  checkUnlocks();          // catch up anything earned by an older build
  buildFactorControls();
  wireSetup();
  wireDrill();
  wireSummary();
  wireTheme();
  syncSetup();
})();

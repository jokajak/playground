/* WCA Scorecard Generator — render a stack of blank, official-style WCA
   scorecards for printing. Competition/Round/Event/Group/Name/ID/Time
   limit/Cutoff are editable text inputs on each card (typed on screen and
   baked into the printed page); attempt results and signatures stay blank
   for hand-writing. The structural controls (round format, extra rows,
   card count) rebuild the sheet, so typed header values are captured
   before a rebuild and restored into the matching card afterward. */
(function () {
  'use strict';

  var els = {
    format: document.getElementById('format'),
    extra:  document.getElementById('extra'),
    count:  document.getElementById('count'),
    print:  document.getElementById('print'),
    sheet:  document.getElementById('sheet')
  };

  // WCA round formats (regulation 9b): Bo1/Bo2/Bo3 (best single of N),
  // Mo3 (mean of 3, same 3-row layout as Bo3), and Ao5 (average of 5).
  // A cutoff is not its own format — it's a modifier on Ao5: everyone gets
  // attempts 1-2, and only continues to attempts 3-5 by beating the cutoff
  // in one of those, so that variant still renders all 5 rows plus a marked
  // boundary after attempt 2.
  var FORMATS = {
    bo1:          { attempts: 1, cutoffAfter: 0 },
    bo2:          { attempts: 2, cutoffAfter: 0 },
    bo3:          { attempts: 3, cutoffAfter: 0 },
    mo3:          { attempts: 3, cutoffAfter: 0 },
    ao5:          { attempts: 5, cutoffAfter: 0 },
    'ao5-cutoff': { attempts: 5, cutoffAfter: 2 }
  };

  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) { n = fallback; }
    return Math.max(min, Math.min(max, n));
  }

  // A labeled, editable field: an uppercase caption plus a text input styled
  // as an underline, so it can be typed into on screen and prints with
  // whatever value (or blank, to hand-write) it holds.
  function line(caption, field, opts) {
    var wrap = document.createElement('div');
    wrap.className = 'sc-line' + (opts && opts.fixed ? ' fixed' : '');
    var cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = caption;
    var fill = document.createElement('input');
    fill.type = 'text';
    fill.className = 'fill';
    fill.autocomplete = 'off';
    fill.spellcheck = false;
    fill.dataset.field = field;
    if (opts && opts.width) { fill.style.width = opts.width; }
    wrap.appendChild(cap);
    wrap.appendChild(fill);
    return wrap;
  }

  function buildCard(attempts, cutoffAfter, extraRows) {
    var card = document.createElement('div');
    card.className = 'scorecard';

    // Header: competition.
    var head = document.createElement('div');
    head.className = 'sc-head';
    var comp = document.createElement('div');
    comp.className = 'sc-comp';
    comp.appendChild(line('Competition', 'competition'));
    head.appendChild(comp);
    card.appendChild(head);

    // Event + round + group, all on one line.
    var eventRow = document.createElement('div');
    eventRow.className = 'sc-row';
    eventRow.appendChild(line('Event', 'event'));
    eventRow.appendChild(line('Round', 'round', { fixed: true }));
    eventRow.appendChild(line('Group', 'group', { fixed: true }));
    card.appendChild(eventRow);

    // Name + ID + WCA ID.
    var idRow = document.createElement('div');
    idRow.className = 'sc-row';
    idRow.appendChild(line('Name', 'name'));
    idRow.appendChild(line('ID', 'id', { fixed: true, width: '60px' }));
    idRow.appendChild(line('WCA ID', 'wca-id', { fixed: true, width: '100px' }));
    card.appendChild(idRow);

    // Time limit + cutoff guidance.
    var guide = document.createElement('div');
    guide.className = 'sc-guidance';
    guide.appendChild(line('Time limit', 'time-limit'));
    guide.appendChild(line('Cutoff', 'cutoff'));
    card.appendChild(guide);

    // Attempts table.
    card.appendChild(buildTable(attempts, cutoffAfter, extraRows));
    return card;
  }

  function buildTable(attempts, cutoffAfter, extraRows) {
    var table = document.createElement('table');
    table.className = 'attempts';

    var colgroup = document.createElement('colgroup');
    ['c-num', 'c-sign', 'c-result', 'c-sign', 'c-sign'].forEach(function (cls) {
      var col = document.createElement('col');
      col.className = cls;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);

    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    ['#', 'Scrambler', 'Result', 'Judge', 'Competitor'].forEach(function (label) {
      var th = document.createElement('th');
      th.textContent = label;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var i = 1; i <= attempts; i++) {
      if (cutoffAfter > 0 && i === cutoffAfter + 1) {
        var cutoffHead = document.createElement('tr');
        cutoffHead.className = 'cutoff-head';
        var ctd = document.createElement('td');
        ctd.colSpan = 5;
        ctd.textContent = 'Must beat cutoff in an attempt above to continue';
        cutoffHead.appendChild(ctd);
        tbody.appendChild(cutoffHead);
      }
      tbody.appendChild(attemptRow(String(i), 'num'));
    }
    if (extraRows > 0) {
      var extraHead = document.createElement('tr');
      extraHead.className = 'extra-head';
      var td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'Extra attempts';
      extraHead.appendChild(td);
      tbody.appendChild(extraHead);
      for (var e = 1; e <= extraRows; e++) {
        tbody.appendChild(attemptRow('E' + e, 'extra-num'));
      }
    }
    table.appendChild(tbody);
    return table;
  }

  function attemptRow(label, numClass) {
    var tr = document.createElement('tr');
    var num = document.createElement('td');
    num.className = numClass;
    num.textContent = label;
    tr.appendChild(num);
    // Scrambler, Result, Judge, Competitor: blank writable cells.
    for (var c = 0; c < 4; c++) {
      tr.appendChild(document.createElement('td'));
    }
    return tr;
  }

  // Structural changes (format/extra rows/count) rebuild every card from
  // scratch. Capture what's currently typed into each card's header fields
  // first, then restore it into the same card index afterward, so editing a
  // control doesn't erase names/IDs/etc already filled in.
  function collectValues() {
    var cards = els.sheet.querySelectorAll('.scorecard');
    var values = [];
    for (var i = 0; i < cards.length; i++) {
      var fields = {};
      var inputs = cards[i].querySelectorAll('input[data-field]');
      for (var j = 0; j < inputs.length; j++) {
        fields[inputs[j].dataset.field] = inputs[j].value;
      }
      values.push(fields);
    }
    return values;
  }

  function restoreValues(values) {
    var cards = els.sheet.querySelectorAll('.scorecard');
    for (var i = 0; i < cards.length && i < values.length; i++) {
      var inputs = cards[i].querySelectorAll('input[data-field]');
      for (var j = 0; j < inputs.length; j++) {
        var v = values[i][inputs[j].dataset.field];
        if (v) { inputs[j].value = v; }
      }
    }
  }

  var CARDS_PER_PAGE = 4;

  function render() {
    var format = FORMATS[els.format.value] || FORMATS.ao5;
    var extraRows = clampInt(els.extra.value, 0, 6, 2);
    var count = clampInt(els.count.value, 1, 200, 4);
    var saved = collectValues();

    var frag = document.createDocumentFragment();
    var page = null;
    for (var i = 0; i < count; i++) {
      if (i % CARDS_PER_PAGE === 0) {
        page = document.createElement('div');
        page.className = 'sheet-page';
        frag.appendChild(page);
      }
      page.appendChild(buildCard(format.attempts, format.cutoffAfter, extraRows));
    }
    els.sheet.innerHTML = '';
    els.sheet.appendChild(frag);
    restoreValues(saved);
  }

  els.format.addEventListener('change', render);
  els.extra.addEventListener('input', render);
  els.count.addEventListener('input', render);
  els.print.addEventListener('click', function () { window.print(); });

  render();
})();

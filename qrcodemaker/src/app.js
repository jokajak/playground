/* QR Code Maker — generate a QR code and optionally embed it into an image,
   either stamped as an opaque tile or blended into the picture.
   Uses the vendored qrcode-generator library (global `qrcode`) and the
   vendored jsQR decoder (global `jsQR`) for the live scannability check. */
(function () {
  'use strict';

  var els = {
    text:            document.getElementById('text'),
    ec:              document.getElementById('ec'),
    exportSize:      document.getElementById('export-size'),
    exportControl:   document.getElementById('export-size-control'),
    fg:              document.getElementById('fg'),
    bg:              document.getElementById('bg'),
    colorRow:        document.getElementById('color-row'),
    imageInput:      document.getElementById('image-input'),
    chooseImage:     document.getElementById('choose-image'),
    removeImage:     document.getElementById('remove-image'),
    imageHint:       document.getElementById('image-hint'),
    modeControl:     document.getElementById('mode-control'),
    modeBlend:       document.getElementById('mode-blend'),
    modeStamp:       document.getElementById('mode-stamp'),
    strengthControl: document.getElementById('strength-control'),
    strength:        document.getElementById('blend-strength'),
    strengthValue:   document.getElementById('strength-value'),
    scaleControl:    document.getElementById('scale-control'),
    scale:           document.getElementById('scale'),
    scaleValue:      document.getElementById('scale-value'),
    posControl:      document.getElementById('position-control'),
    ecHint:          document.getElementById('ec-hint'),
    error:           document.getElementById('error'),
    download:        document.getElementById('download'),
    canvas:          document.getElementById('canvas'),
    meta:            document.getElementById('meta'),
    scanBadge:       document.getElementById('scan-badge'),
  };

  var QUIET_MODULES = 4;      // standard quiet zone
  var MAX_IMAGE_DIM = 4096;   // cap huge photos so canvas work stays snappy
  var EDGE_MARGIN = 0.02;     // preset margin, as a fraction of the shorter side

  /* Blend-mode tuning. The strength slider (10–100) interpolates the luminance
     targets that module centers are pushed to; the endpoints below are
     calibrated so the default decodes with jsQR on busy test images. */
  var DOT_SUBTLE = 0.68, DOT_STRONG = 0.92; // dot coverage grows with strength
  var WASH_SUBTLE = 0.12, WASH_STRONG = 0.45; // full-cell wash alpha (damps busy
                                              // image texture between the dots)
  var L_DARK_SUBTLE = 96,  L_DARK_STRONG = 32;   // dark-module target luma range
  var L_LIGHT_SUBTLE = 168, L_LIGHT_STRONG = 224; // light-module target luma range
  var L_DARK_FN_CAP = 56;       // function modules never render weaker than this…
  var L_LIGHT_FN_FLOOR = 200;   // …regardless of the strength slider

  // Module classes for blended rendering.
  var M_DATA = 0, M_FINDER = 1, M_ALIGN = 2, M_FUNC = 3;

  /* Alignment-pattern center coordinates per version (ISO/IEC 18004; the
     vendored library keeps this table private, so it is duplicated here). */
  var ALIGNMENT_POSITIONS = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
    [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82],
    [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
  ];

  var state = {
    image: null,          // HTMLImageElement, or null for standalone QR
    imageName: '',
    mode: 'blend',        // 'blend' | 'stamp' — how the code sits on the image
    strength: 55,         // blend strength, 10–100
    scalePct: 25,         // QR footprint as % of the image's shorter side
    pos: { x: 0.5, y: 0.5 }, // normalized center of the QR on the image
  };

  var ctx = els.canvas.getContext('2d', { willReadFrequently: true });
  var qrRect = null;      // where the QR landed on the canvas, for drag hit-testing

  // ── QR building ─────────────────────────────────────────────────────────

  function buildQr() {
    var text = els.text.value;
    if (!text) return null;
    try {
      var qr = qrcode(0, els.ec.value); // type 0 = pick smallest version that fits
      qr.addData(text, 'Byte');
      qr.make();
      return qr;
    } catch (e) {
      return { error: 'Content is too long for a QR code at this error-correction level. Shorten it or lower the error correction.' };
    }
  }

  /* Render the QR (with quiet zone) onto its own canvas at a crisp integer
     number of pixels per module, close to targetSize. */
  function qrToCanvas(qr, targetSize) {
    var count = qr.getModuleCount();
    var total = count + QUIET_MODULES * 2;
    var px = Math.max(1, Math.round(targetSize / total));
    var c = document.createElement('canvas');
    c.width = c.height = px * total;
    var cctx = c.getContext('2d');
    cctx.fillStyle = els.bg.value;
    cctx.fillRect(0, 0, c.width, c.height);
    cctx.fillStyle = els.fg.value;
    for (var r = 0; r < count; r++) {
      for (var col = 0; col < count; col++) {
        if (qr.isDark(r, col)) {
          cctx.fillRect((col + QUIET_MODULES) * px, (r + QUIET_MODULES) * px, px, px);
        }
      }
    }
    return c;
  }

  // ── Module classification (for blended rendering) ───────────────────────

  var classesCache = { count: 0, classes: null };

  /* The vendored library only exposes isDark(), so the function-pattern
     layout is recomputed here from the spec. Separators are folded into
     M_FINDER: they're skipped per-module and covered by the finder halo. */
  function classifyModules(count) {
    if (classesCache.count === count) return classesCache.classes;
    var cls = new Uint8Array(count * count);
    function set(r, c, v) {
      if (r >= 0 && r < count && c >= 0 && c < count) cls[r * count + c] = v;
    }
    function setIfData(r, c, v) {
      if (r >= 0 && r < count && c >= 0 && c < count && cls[r * count + c] === M_DATA) {
        cls[r * count + c] = v;
      }
    }
    var version = (count - 17) / 4;

    // Finders (7×7) plus their one-module separator rings.
    var corners = [[0, 0], [0, count - 7], [count - 7, 0]];
    for (var f = 0; f < corners.length; f++) {
      var r0 = corners[f][0], c0 = corners[f][1];
      for (var r = -1; r <= 7; r++) {
        for (var c = -1; c <= 7; c++) {
          set(r0 + r, c0 + c, M_FINDER);
        }
      }
    }

    // Timing patterns.
    for (var i = 0; i < count; i++) {
      setIfData(6, i, M_FUNC);
      setIfData(i, 6, M_FUNC);
    }

    // Format info around the finders, plus the fixed dark module.
    for (i = 0; i <= 8; i++) {
      setIfData(8, i, M_FUNC);
      setIfData(i, 8, M_FUNC);
      if (i < 8) setIfData(8, count - 1 - i, M_FUNC); // second copy: 8 cells…
      if (i < 7) setIfData(count - 1 - i, 8, M_FUNC); // …and 7 cells
    }
    set(count - 8, 8, M_FUNC);

    // Version info blocks (versions 7+).
    if (version >= 7) {
      for (r = 0; r < 6; r++) {
        for (c = count - 11; c <= count - 9; c++) {
          set(r, c, M_FUNC);
          set(c, r, M_FUNC);
        }
      }
    }

    // Alignment patterns (5×5), skipping the three finder-overlapping spots.
    var pos = ALIGNMENT_POSITIONS[version - 1] || [];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var ar = pos[a], ac = pos[b];
        if ((ar === 6 && ac === 6) ||
            (ar === 6 && ac === count - 7) ||
            (ar === count - 7 && ac === 6)) continue;
        for (r = -2; r <= 2; r++) {
          for (c = -2; c <= 2; c++) {
            set(ar + r, ac + c, M_ALIGN);
          }
        }
      }
    }

    classesCache = { count: count, classes: cls };
    return cls;
  }

  // ── Luminance-push color math ────────────────────────────────────────────

  function lerp(a, b, t) { return a + (b - a) * t; }

  function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

  /* Push a sampled color's luminance to at least/at most targetY, preserving
     hue: darkening multiplies channels; lightening lerps toward white. Colors
     that already satisfy the target come back unchanged — that's what makes
     modules "the image already agrees with" invisible. */
  function pushLuminance(r, g, b, targetY, dark) {
    var y = luma(r, g, b);
    if (dark) {
      if (y <= targetY) return [r, g, b];
      var k = targetY / (y || 1);
      return [r * k, g * k, b * k];
    }
    if (y >= targetY) return [r, g, b];
    var t = (targetY - y) / (255 - y || 1);
    return [lerp(r, 255, t), lerp(g, 255, t), lerp(b, 255, t)];
  }

  function rgb(c) {
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }

  // ── Underlying-image sampling ────────────────────────────────────────────

  var sampleMid = document.createElement('canvas');   // 4 px per cell
  var sampleOut = document.createElement('canvas');   // 1 px per cell

  /* Average color of the image under each grid cell (total×total cells
     covering the code + quiet zone). Two-step downscale: a single huge-ratio
     drawImage undersamples in Chromium. Must be called after the photo is
     drawn and before any QR marks. */
  function sampleModules(x, y, sizePx, total) {
    var mid = total * 4;
    if (sampleMid.width !== mid) sampleMid.width = sampleMid.height = mid;
    if (sampleOut.width !== total) sampleOut.width = sampleOut.height = total;
    var mctx = sampleMid.getContext('2d');
    var octx = sampleOut.getContext('2d', { willReadFrequently: true });
    mctx.drawImage(els.canvas, x, y, sizePx, sizePx, 0, 0, mid, mid);
    octx.drawImage(sampleMid, 0, 0, mid, mid, 0, 0, total, total);
    return octx.getImageData(0, 0, total, total).data;
  }

  // ── Blended renderer ─────────────────────────────────────────────────────

  // Appends a rounded-rect subpath (no beginPath), so callers can combine
  // subpaths for even-odd ring fills without depending on ctx.roundRect.
  function roundRectSubpath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    roundRectSubpath(x, y, w, h, r);
  }

  /* Finder/alignment mark in the reference style: a soft light halo, then a
     rounded semi-transparent near-black ring and center, so the picture's
     texture stays visible inside the dark shapes. gx/gy are code-relative
     module coords of the mark's top-left; size is 7 (finder) or 5 (align). */
  function drawLocatorMark(originX, originY, px, gx, gy, size) {
    var x = originX + (QUIET_MODULES + gx) * px;
    var y = originY + (QUIET_MODULES + gy) * px;
    var s = size * px;

    // The halo must lift the mark's light ring to ~200 luma even over a
    // near-black image, or finder-ratio detection fails there.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRectPath(x - 2 * px, y - 2 * px, s + 4 * px, s + 4 * px, 1.6 * px);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    roundRectPath(x - px, y - px, s + 2 * px, s + 2 * px, 1.2 * px);
    ctx.fill();

    ctx.fillStyle = 'rgba(17,20,26,0.85)';
    ctx.beginPath();
    roundRectSubpath(x, y, s, s, 0.75 * px);
    roundRectSubpath(x + px, y + px, s - 2 * px, s - 2 * px, 0.5 * px);
    ctx.fill('evenodd');

    var center = size === 7 ? 3 : 1.35; // spec center is 3×3 / 1×1
    var cs = center * px;
    ctx.fillStyle = 'rgba(17,20,26,0.85)';
    roundRectPath(x + (s - cs) / 2, y + (s - cs) / 2, cs, cs, 0.35 * cs);
    ctx.fill();
  }

  function drawBlendedQr(qr, x, y, px, total) {
    var count = qr.getModuleCount();
    var classes = classifyModules(count);
    var samples = sampleModules(x, y, px * total, total);
    var s = state.strength / 100;
    var lDark = lerp(L_DARK_SUBTLE, L_DARK_STRONG, s);
    var lLight = lerp(L_LIGHT_SUBTLE, L_LIGHT_STRONG, s);
    var lDarkFn = Math.min(lDark, L_DARK_FN_CAP);
    var lLightFn = Math.max(lLight, L_LIGHT_FN_FLOOR);
    var r, c, i, sr, sg, sb, color;

    // Quiet zone: a light wash, strong beside the code and fading outward.
    for (r = 0; r < total; r++) {
      for (c = 0; c < total; c++) {
        var d = Math.max(
          QUIET_MODULES - r, r - (total - QUIET_MODULES - 1),
          QUIET_MODULES - c, c - (total - QUIET_MODULES - 1));
        if (d <= 0) continue; // inside the code area
        i = (r * total + c) * 4;
        sr = samples[i]; sg = samples[i + 1]; sb = samples[i + 2];
        color = pushLuminance(sr, sg, sb, lLight, false);
        if (d > 2) { // outer rings: half push for a soft fade
          color = [(color[0] + sr) / 2, (color[1] + sg) / 2, (color[2] + sb) / 2];
        }
        ctx.fillStyle = rgb(color);
        ctx.fillRect(x + c * px, y + r * px, px + 0.5, px + 0.5);
      }
    }

    // Data + auxiliary function modules: a partial-alpha wash over the whole
    // cell (quiets busy image texture between dots) plus a solid centered dot.
    var dataFrac = lerp(DOT_SUBTLE, DOT_STRONG, s);
    var fnFrac = Math.min(0.95, dataFrac + 0.08);
    var wash = lerp(WASH_SUBTLE, WASH_STRONG, s).toFixed(3);
    for (r = 0; r < count; r++) {
      for (c = 0; c < count; c++) {
        var cls = classes[r * count + c];
        if (cls === M_FINDER || cls === M_ALIGN) continue; // vector marks below
        var dark = qr.isDark(r, c);
        var fn = cls === M_FUNC;
        var target = fn ? (dark ? lDarkFn : lLightFn) : (dark ? lDark : lLight);
        i = ((r + QUIET_MODULES) * total + (c + QUIET_MODULES)) * 4;
        color = pushLuminance(samples[i], samples[i + 1], samples[i + 2], target, dark);
        var cr = Math.round(color[0]), cg = Math.round(color[1]), cb = Math.round(color[2]);
        var cellX = x + (c + QUIET_MODULES) * px;
        var cellY = y + (r + QUIET_MODULES) * px;
        ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + wash + ')';
        ctx.fillRect(cellX, cellY, px + 0.5, px + 0.5);
        var dot = Math.max(2, Math.round(px * (fn ? fnFrac : dataFrac)));
        var off = (px - dot) / 2;
        ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
        if (dot >= 5) {
          roundRectPath(cellX + off, cellY + off, dot, dot, 0.3 * dot);
          ctx.fill();
        } else {
          ctx.fillRect(cellX + off, cellY + off, dot, dot);
        }
      }
    }

    // Finder and alignment marks.
    drawLocatorMark(x, y, px, 0, 0, 7);
    drawLocatorMark(x, y, px, 0, count - 7, 7);
    drawLocatorMark(x, y, px, count - 7, 0, 7);
    var version = (count - 17) / 4;
    var pos = ALIGNMENT_POSITIONS[version - 1] || [];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var ar = pos[a], ac = pos[b];
        if ((ar === 6 && ac === 6) ||
            (ar === 6 && ac === count - 7) ||
            (ar === count - 7 && ac === 6)) continue;
        drawLocatorMark(x, y, px, ar - 2, ac - 2, 5);
      }
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  var renderQueued = false;

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      render();
    });
  }

  function render() {
    var qr = buildQr();

    if (qr && qr.error) {
      showError(qr.error);
      qr = null;
    } else {
      showError('');
    }

    if (state.image) {
      renderComposite(qr);
    } else {
      renderStandalone(qr);
    }

    els.download.disabled = !qr;
    els.canvas.classList.toggle('draggable', !!(state.image && qr));
    scheduleScanCheck(qr);
  }

  function renderStandalone(qr) {
    var size = parseInt(els.exportSize.value, 10);
    if (!qr) {
      els.canvas.width = els.canvas.height = 512;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Type something to generate a QR code', 256, 256);
      els.meta.textContent = '';
      qrRect = null;
      return;
    }
    var c = qrToCanvas(qr, size);
    els.canvas.width = els.canvas.height = c.width;
    ctx.drawImage(c, 0, 0);
    qrRect = null;
    els.meta.textContent = qr.getModuleCount() + '×' + qr.getModuleCount() +
      ' modules · exports at ' + c.width + '×' + c.height + ' px';
  }

  function renderComposite(qr) {
    var img = state.image;
    var w = img.naturalWidth, h = img.naturalHeight;
    var cap = Math.max(w, h);
    if (cap > MAX_IMAGE_DIM) {
      var k = MAX_IMAGE_DIM / cap;
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    els.canvas.width = w;
    els.canvas.height = h;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, w, h);

    if (!qr) {
      qrRect = null;
      els.meta.textContent = w + '×' + h + ' px — enter content to add the QR code';
      return;
    }

    var target = Math.min(w, h) * (state.scalePct / 100);
    var count = qr.getModuleCount();
    var total = count + QUIET_MODULES * 2;
    var px = Math.max(1, Math.round(target / total));
    var qw = px * total;

    // Clamp the center so the code stays fully inside the picture.
    var half = qw / 2;
    var cx = clamp(state.pos.x * w, half, w - half);
    var cy = clamp(state.pos.y * h, half, h - half);
    state.pos.x = cx / w;
    state.pos.y = cy / h;

    var x = Math.round(cx - half);
    var y = Math.round(cy - half);

    if (state.mode === 'blend') {
      drawBlendedQr(qr, x, y, px, total);
    } else {
      var c = qrToCanvas(qr, target);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, x, y);
      ctx.imageSmoothingEnabled = true;
    }

    qrRect = { x: x, y: y, w: qw, h: qw };
    els.meta.textContent = w + '×' + h + ' px · QR ' + qw + '×' + qw + ' px · ' +
      (state.mode === 'blend' ? 'blended (strength ' + state.strength + ')' : 'stamped') +
      ' — drag the code to reposition it';
  }

  function showError(msg) {
    els.error.textContent = msg;
    els.error.classList.toggle('show', !!msg);
  }

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi);
  }

  // ── Live scannability check ──────────────────────────────────────────────

  var scanTimer = null;
  var scanCanvas = document.createElement('canvas');
  // Decode is attempted at several sizes, the way a phone camera effectively
  // retries across frames (jsQR's fixed-size binarizer blocks can alias
  // against particular module sizes at any single scale). Requiring two
  // successes separates robust output from a single-scale fluke.
  var SCAN_DIMS = [300, 450, 550, 700, 1000];
  var SCAN_MIN_HITS = 2;

  function scheduleScanCheck(qr) {
    if (scanTimer) clearTimeout(scanTimer);
    if (!state.image || !qr || typeof jsQR === 'undefined') {
      els.scanBadge.hidden = true;
      return;
    }
    var expected = els.text.value;
    els.scanBadge.hidden = false;
    els.scanBadge.className = 'checking';
    els.scanBadge.textContent = 'checking scannability…';
    scanTimer = setTimeout(function () {
      var w = els.canvas.width, h = els.canvas.height;
      var sctx = scanCanvas.getContext('2d', { willReadFrequently: true });
      var hits = 0;
      for (var d = 0; d < SCAN_DIMS.length && hits < SCAN_MIN_HITS; d++) {
        var k = Math.min(1, SCAN_DIMS[d] / Math.max(w, h));
        var sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
        scanCanvas.width = sw; scanCanvas.height = sh;
        sctx.drawImage(els.canvas, 0, 0, sw, sh);
        var data = sctx.getImageData(0, 0, sw, sh);
        var hit = jsQR(data.data, sw, sh);
        if (hit && hit.data === expected) hits++;
        if (k === 1) break; // larger dims would just repeat the same pixels
      }
      var ok = hits >= SCAN_MIN_HITS;
      els.scanBadge.className = ok ? 'ok' : 'warn';
      els.scanBadge.textContent = ok
        ? '✓ scans OK'
        : '✗ may not scan — increase strength or size, or move to a calmer area';
    }, 400);
  }

  // ── Image handling ───────────────────────────────────────────────────────

  function setImage(file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      state.image = img;
      state.imageName = file.name.replace(/\.[^.]+$/, '');
      state.pos = { x: 0.5, y: 0.5 };

      // A code on a busy photo needs headroom — bump to the strongest level.
      if (els.ec.value !== 'H') {
        els.ec.value = 'H';
        els.ecHint.hidden = false;
      }

      els.imageHint.textContent = file.name;
      syncControlVisibility();
      render();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      showError('That file could not be read as an image.');
    };
    img.src = url;
  }

  function clearImage() {
    state.image = null;
    state.imageName = '';
    els.imageInput.value = '';
    els.ecHint.hidden = true;
    els.imageHint.textContent = 'Pick a photo or graphic and the QR code is woven into it. Drag the code on the preview to reposition it.';
    syncControlVisibility();
    render();
  }

  function syncControlVisibility() {
    var hasImage = !!state.image;
    var blending = hasImage && state.mode === 'blend';
    els.removeImage.hidden = !hasImage;
    els.modeControl.hidden = !hasImage;
    els.strengthControl.hidden = !blending;
    els.scaleControl.hidden = !hasImage;
    els.posControl.hidden = !hasImage;
    els.exportControl.style.display = hasImage ? 'none' : '';
    els.colorRow.hidden = blending; // blend takes its colors from the photo
    els.modeBlend.classList.toggle('active', state.mode === 'blend');
    els.modeStamp.classList.toggle('active', state.mode === 'stamp');
    if (!hasImage) els.scanBadge.hidden = true;
  }

  // ── Dragging ─────────────────────────────────────────────────────────────

  var dragging = false;
  var dragOffset = { x: 0, y: 0 };

  function canvasPoint(evt) {
    var rect = els.canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (els.canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (els.canvas.height / rect.height),
    };
  }

  els.canvas.addEventListener('pointerdown', function (evt) {
    if (!state.image || !qrRect) return;
    var p = canvasPoint(evt);
    if (p.x < qrRect.x || p.x > qrRect.x + qrRect.w ||
        p.y < qrRect.y || p.y > qrRect.y + qrRect.h) return;
    dragging = true;
    dragOffset.x = p.x - (qrRect.x + qrRect.w / 2);
    dragOffset.y = p.y - (qrRect.y + qrRect.h / 2);
    els.canvas.setPointerCapture(evt.pointerId);
    els.canvas.classList.add('dragging');
    evt.preventDefault();
  });

  els.canvas.addEventListener('pointermove', function (evt) {
    if (!dragging) return;
    var p = canvasPoint(evt);
    state.pos.x = (p.x - dragOffset.x) / els.canvas.width;
    state.pos.y = (p.y - dragOffset.y) / els.canvas.height;
    scheduleRender();
  });

  function endDrag(evt) {
    if (!dragging) return;
    dragging = false;
    els.canvas.classList.remove('dragging');
    if (els.canvas.hasPointerCapture && els.canvas.hasPointerCapture(evt.pointerId)) {
      els.canvas.releasePointerCapture(evt.pointerId);
    }
  }
  els.canvas.addEventListener('pointerup', endDrag);
  els.canvas.addEventListener('pointercancel', endDrag);

  // Dragging the QR should not scroll the page on touch screens.
  els.canvas.style.touchAction = 'none';

  // ── Controls ─────────────────────────────────────────────────────────────

  els.text.addEventListener('input', render);
  els.ec.addEventListener('change', function () {
    els.ecHint.hidden = true;
    render();
  });
  els.exportSize.addEventListener('change', render);
  els.fg.addEventListener('input', render);
  els.bg.addEventListener('input', render);

  els.chooseImage.addEventListener('click', function () {
    els.imageInput.click();
  });
  els.imageInput.addEventListener('change', function () {
    if (els.imageInput.files && els.imageInput.files[0]) {
      setImage(els.imageInput.files[0]);
    }
  });
  els.removeImage.addEventListener('click', clearImage);

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    syncControlVisibility();
    render();
  }
  els.modeBlend.addEventListener('click', function () { setMode('blend'); });
  els.modeStamp.addEventListener('click', function () { setMode('stamp'); });

  els.strength.addEventListener('input', function () {
    state.strength = parseInt(els.strength.value, 10);
    els.strengthValue.textContent = state.strength + ' — subtler ↔ stronger scan';
    scheduleRender();
  });

  els.scale.addEventListener('input', function () {
    state.scalePct = parseInt(els.scale.value, 10);
    els.scaleValue.textContent = state.scalePct + '% of the shorter side';
    scheduleRender();
  });

  els.posControl.addEventListener('click', function (evt) {
    var btn = evt.target.closest('button[data-pos]');
    if (!btn || !state.image) return;
    var w = els.canvas.width, h = els.canvas.height;
    var target = Math.min(w, h) * (state.scalePct / 100);
    var m = Math.min(w, h) * EDGE_MARGIN;
    var half = target / 2;
    var lo = { x: (m + half) / w, y: (m + half) / h };
    var hi = { x: (w - m - half) / w, y: (h - m - half) / h };
    switch (btn.dataset.pos) {
      case 'tl': state.pos = { x: lo.x, y: lo.y }; break;
      case 'tr': state.pos = { x: hi.x, y: lo.y }; break;
      case 'bl': state.pos = { x: lo.x, y: hi.y }; break;
      case 'br': state.pos = { x: hi.x, y: hi.y }; break;
      default:   state.pos = { x: 0.5, y: 0.5 };
    }
    render();
  });

  // Drag-and-drop an image anywhere on the page.
  document.addEventListener('dragover', function (evt) { evt.preventDefault(); });
  document.addEventListener('drop', function (evt) {
    evt.preventDefault();
    var file = evt.dataTransfer && evt.dataTransfer.files && evt.dataTransfer.files[0];
    if (file && file.type.indexOf('image/') === 0) setImage(file);
  });

  // ── Download ─────────────────────────────────────────────────────────────

  els.download.addEventListener('click', function () {
    els.canvas.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = state.imageName ? state.imageName + '-qr.png' : 'qr-code.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, 'image/png');
  });

  // ── Init ─────────────────────────────────────────────────────────────────

  els.scaleValue.textContent = state.scalePct + '% of the shorter side';
  els.strengthValue.textContent = state.strength + ' — subtler ↔ stronger scan';
  syncControlVisibility();
  render();

  // Test hook (used by the scratchpad verification harness).
  window.__qrmDebug = { classifyModules: classifyModules, render: render };
})();

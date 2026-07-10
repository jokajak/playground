/* QR Code Maker — generate a QR code and optionally embed it into an image,
   either merged into the picture's own pixels or stamped as an opaque tile.
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
    modeMerge:       document.getElementById('mode-merge'),
    modeCenter:      document.getElementById('mode-center'),
    modeStamp:       document.getElementById('mode-stamp'),
    strengthControl: document.getElementById('strength-control'),
    strength:        document.getElementById('merge-strength'),
    strengthValue:   document.getElementById('strength-value'),
    scaleControl:    document.getElementById('scale-control'),
    scale:           document.getElementById('scale'),
    scaleValue:      document.getElementById('scale-value'),
    logoSizeControl: document.getElementById('logo-size-control'),
    logoSize:        document.getElementById('logo-size'),
    logoSizeValue:   document.getElementById('logo-size-value'),
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

  /* Merge-mode tuning. The strength slider (10–100) interpolates the luminance
     targets that module centers are pushed to; the endpoints below are
     calibrated so the default decodes with jsQR on busy test images. */
  var L_DARK_SUBTLE = 96,  L_DARK_STRONG = 32;   // dark-module target luma range
  var L_LIGHT_SUBTLE = 168, L_LIGHT_STRONG = 224; // light-module target luma range
  var L_DARK_FN_CAP = 56;       // function modules never render weaker than this…
  var L_LIGHT_FN_FLOOR = 200;   // …regardless of the strength slider
  var W_MIN_SUBTLE = 0.16, W_MIN_STRONG = 0.42; // cell-edge push floor vs strength
  var CORE_D2 = 0.35; // full-push core radius² — a solid heart in every module
  var FALL_LO = 0.35, FALL_HI = 0.55; // radial falloff steepness (jittered per module)
  /* Interior texture allowance: no pixel may end up further than this from
     its module's luma target. Block-threshold binarizers (jsQR, ZXing on
     phones) sample in ~8 px blocks and expect module interiors to be flat,
     so the allowance shrinks once modules render larger than 8 px. */
  var BAND_SUBTLE = 85, BAND_STRONG = 40; // allowance at ≤8 px/module, vs strength
  var QUIET_W = 0.8;            // flat lightening weight across the quiet zone

  // Module classes for merged rendering.
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
    mode: 'merge',        // 'merge' | 'center' | 'stamp' — how the code and image combine
    strength: 55,         // merge strength, 10–100
    scalePct: 25,         // QR footprint as % of the image's shorter side
    logoPct: 22,          // 'center' mode: logo footprint as % of the code
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

  // ── Module classification (for merged rendering) ────────────────────────

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

  // Cheap deterministic per-module jitter in [0, 1), for organic patch sizes.
  function hash2(r, c) {
    var h = ((r * 73856093) ^ (c * 19349663)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ── Merged renderer ──────────────────────────────────────────────────────

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

  /* Merge the code into the photo's own pixels. One pass over the QR's
     rectangle pushes each pixel's luminance toward its module's target,
     preserving hue (darkening multiplies the channels, lightening lerps
     toward white). Pixels that already satisfy their target are untouched —
     modules the photo already agrees with are invisible. The push weight is
     1 at the module center (where decoders sample) and falls off radially to
     a strength-dependent floor at the cell edge, jittered per module, so
     modules read as organic patches of shading rather than a grid of dots. */
  function drawMergedQr(qr, x, y, px, total) {
    var count = qr.getModuleCount();
    var classes = classifyModules(count);
    var s = state.strength / 100;
    var lDark = lerp(L_DARK_SUBTLE, L_DARK_STRONG, s);
    var lLight = lerp(L_LIGHT_SUBTLE, L_LIGHT_STRONG, s);
    var lDarkFn = Math.min(lDark, L_DARK_FN_CAP);
    var lLightFn = Math.max(lLight, L_LIGHT_FN_FLOOR);
    var wMin = lerp(W_MIN_SUBTLE, W_MIN_STRONG, s);
    var band = lerp(BAND_SUBTLE, BAND_STRONG, s);
    var tex = px > 8 ? band * 8 / px : band; // flatter interiors as modules grow

    /* Per-cell plan across the total×total grid (code + quiet zone).
       Finder/alignment cells are skipped — the photo shows through there and
       the semi-transparent vector marks are drawn on top afterwards. */
    var cells = total * total;
    var target = new Float32Array(cells);
    var dark = new Uint8Array(cells);
    var wmin = new Float32Array(cells);
    var wcap = new Float32Array(cells);
    var fall = new Float32Array(cells);
    var skip = new Uint8Array(cells);
    for (var r = 0; r < total; r++) {
      for (var c = 0; c < total; c++) {
        var i = r * total + c;
        var mr = r - QUIET_MODULES, mc = c - QUIET_MODULES;
        if (mr < 0 || mc < 0 || mr >= count || mc >= count) {
          // Quiet zone: a flat, soft lightening of the photo itself.
          target[i] = lLight; wmin[i] = QUIET_W; wcap[i] = QUIET_W;
          continue;
        }
        var cls = classes[mr * count + mc];
        if (cls === M_FINDER || cls === M_ALIGN) { skip[i] = 1; continue; }
        var fn = cls === M_FUNC;
        dark[i] = qr.isDark(mr, mc) ? 1 : 0;
        target[i] = fn ? (dark[i] ? lDarkFn : lLightFn) : (dark[i] ? lDark : lLight);
        wmin[i] = fn ? Math.min(0.9, wMin + 0.18) : wMin; // timing/format need more
        wcap[i] = 1;
        fall[i] = lerp(FALL_LO, FALL_HI, hash2(mr, mc));
      }
    }

    var size = px * total;
    var imgData = ctx.getImageData(x, y, size, size);
    var d = imgData.data;
    for (var Y = 0; Y < size; Y++) {
      var row = (Y / px) | 0;
      if (row >= total) row = total - 1;
      var v = ((Y - row * px) + 0.5) / px * 2 - 1; // -1..1 within the cell
      var rowBase = row * total;
      for (var X = 0; X < size; X++) {
        var col = (X / px) | 0;
        if (col >= total) col = total - 1;
        var ci = rowBase + col;
        if (skip[ci]) { X = (col + 1) * px - 1; continue; }
        var p = (Y * size + X) * 4;
        var pr = d[p], pg = d[p + 1], pb = d[p + 2];
        var yl = luma(pr, pg, pb);
        var t = target[ci];
        var eff;
        if (dark[ci] ? yl <= t : yl >= t) {
          eff = yl; // photo already agrees — touched only if beyond the band
        } else {
          var u = ((X - col * px) + 0.5) / px * 2 - 1;
          var d2 = u * u + v * v - CORE_D2;
          var w = d2 <= 0 ? wcap[ci]
                : Math.min(wcap[ci], Math.max(wmin[ci], 1 - fall[ci] * d2));
          eff = yl + (t - yl) * w;
        }
        // Two-sided clamp: outliers in either direction skew block thresholds.
        if (eff > t + tex) eff = t + tex;
        else if (eff < t - tex) eff = t - tex;
        if (eff === yl) continue;
        if (eff < yl) {
          var k = eff / (yl || 1);
          d[p] = pr * k; d[p + 1] = pg * k; d[p + 2] = pb * k;
        } else {
          var tt = (eff - yl) / (255 - yl || 1);
          d[p]     = pr + (255 - pr) * tt;
          d[p + 1] = pg + (255 - pg) * tt;
          d[p + 2] = pb + (255 - pb) * tt;
        }
      }
    }
    ctx.putImageData(imgData, x, y);

    // Finder and alignment marks.
    drawAllLocatorMarks(x, y, px, count);
  }

  function drawAllLocatorMarks(x, y, px, count) {
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

    if (state.image && state.mode === 'center') {
      renderCenterLogo(qr);
    } else if (state.image) {
      renderComposite(qr);
    } else {
      renderStandalone(qr);
    }

    els.download.disabled = !qr;
    els.canvas.classList.toggle('draggable',
      !!(state.image && qr && state.mode !== 'center'));
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

  /* Center-logo mode: a clean QR code (in the chosen colors) with the loaded
     image sitting in its middle, over a rounded knockout of the background so
     the logo reads crisply. The high error-correction level set on image load
     recovers the modules the logo covers. */
  function renderCenterLogo(qr) {
    var size = parseInt(els.exportSize.value, 10);
    if (!qr) {
      var s0 = Math.max(256, size);
      els.canvas.width = els.canvas.height = s0;
      ctx.fillStyle = els.bg.value;
      ctx.fillRect(0, 0, s0, s0);
      drawCenteredLogo(s0);
      qrRect = null;
      els.meta.textContent = 'Enter content to build the code around the logo';
      return;
    }
    var c = qrToCanvas(qr, size);
    els.canvas.width = els.canvas.height = c.width;
    ctx.drawImage(c, 0, 0);
    drawCenteredLogo(c.width);
    qrRect = null;
    els.meta.textContent = qr.getModuleCount() + '×' + qr.getModuleCount() +
      ' modules · logo ' + state.logoPct + '% · exports at ' + c.width + '×' + c.width + ' px';
  }

  // Draw the loaded image centered inside a `full`-px square canvas, fit to
  // state.logoPct of the width (aspect preserved), over a padded knockout.
  function drawCenteredLogo(full) {
    var img = state.image;
    var box = full * (state.logoPct / 100);
    var k = box / Math.max(img.naturalWidth, img.naturalHeight);
    var lw = img.naturalWidth * k, lh = img.naturalHeight * k;
    var lx = (full - lw) / 2, ly = (full - lh) / 2;
    var pad = Math.round(full * 0.015);
    ctx.fillStyle = els.bg.value;
    roundRectPath(lx - pad, ly - pad, lw + 2 * pad, lh + 2 * pad,
                  Math.min(lw, lh) * 0.12 + pad);
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, lx, ly, lw, lh);
  }

  /* Dominant vivid color of the image, for auto-tinting the code to match the
     logo. Colorful pixels (skipping white/black/gray) are binned by hue; the
     busiest hue's average color is returned, darkened if needed so it keeps
     enough contrast against a white background to stay scannable. */
  function pickLogoColor(img) {
    var m = 120;
    var k = Math.min(1, m / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    var d = g.getImageData(0, 0, c.width, c.height).data;
    var BINS = 12;
    var acc = [];
    for (var i = 0; i < BINS; i++) acc.push({ n: 0, r: 0, g: 0, b: 0 });
    for (var p = 0; p < d.length; p += 4) {
      var r = d[p], gg = d[p + 1], b = d[p + 2];
      if (d[p + 3] < 128) continue;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
      if (l > 235 || l < 25) continue;               // skip near-white / near-black
      if (mx === 0 || (mx - mn) / mx < 0.28) continue; // skip greys
      var o = acc[Math.min(BINS - 1, (rgbHue(r, gg, b) / 360 * BINS) | 0)];
      o.n++; o.r += r; o.g += gg; o.b += b;
    }
    var best = acc[0];
    for (i = 1; i < BINS; i++) if (acc[i].n > best.n) best = acc[i];
    if (best.n === 0) return null;
    var R = best.r / best.n, G = best.g / best.n, B = best.b / best.n;
    var y = luma(R, G, B);
    if (y > 150) { var f = 150 / y; R *= f; G *= f; B *= f; } // ensure contrast
    return '#' + [R, G, B].map(function (v) {
      return ('0' + Math.round(v).toString(16)).slice(-2);
    }).join('');
  }

  function rgbHue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d === 0) h = 0;
    else if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
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
    // At 100% scale, rounding up must not push the code past the image edge.
    if (px * total > Math.min(w, h)) px = Math.max(1, Math.floor(target / total));
    var qw = px * total;

    // Clamp the center so the code stays fully inside the picture.
    var half = qw / 2;
    var cx = clamp(state.pos.x * w, half, w - half);
    var cy = clamp(state.pos.y * h, half, h - half);
    state.pos.x = cx / w;
    state.pos.y = cy / h;

    var x = Math.round(cx - half);
    var y = Math.round(cy - half);

    if (state.mode === 'merge') {
      drawMergedQr(qr, x, y, px, total);
    } else {
      var c = qrToCanvas(qr, target);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, x, y);
      ctx.imageSmoothingEnabled = true;
    }

    qrRect = { x: x, y: y, w: qw, h: qw };
    els.meta.textContent = w + '×' + h + ' px · QR ' + qw + '×' + qw + ' px · ' +
      (state.mode === 'merge' ? 'merged (strength ' + state.strength + ')' : 'stamped') +
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
  // against particular module sizes at any single scale), and — when the
  // code doesn't already fill the picture — also on a frame cropped to the
  // code region, the view scanners steer users toward. Requiring two
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
      var views = [{ x: 0, y: 0, w: w, h: h }];
      if (qrRect && qrRect.w < 0.9 * w) {
        var m = Math.round(qrRect.w * 0.05);
        var vx = Math.max(0, qrRect.x - m), vy = Math.max(0, qrRect.y - m);
        views.push({
          x: vx, y: vy,
          w: Math.min(w - vx, qrRect.w + 2 * m),
          h: Math.min(h - vy, qrRect.h + 2 * m),
        });
      }
      var hits = 0;
      outer:
      for (var vi = 0; vi < views.length; vi++) {
        var vw = views[vi];
        for (var d = 0; d < SCAN_DIMS.length; d++) {
          var k = Math.min(1, SCAN_DIMS[d] / Math.max(vw.w, vw.h));
          var sw = Math.max(1, Math.round(vw.w * k)), sh = Math.max(1, Math.round(vw.h * k));
          scanCanvas.width = sw; scanCanvas.height = sh;
          sctx.drawImage(els.canvas, vw.x, vw.y, vw.w, vw.h, 0, 0, sw, sh);
          var data = sctx.getImageData(0, 0, sw, sh);
          var hit = jsQR(data.data, sw, sh);
          if (hit && hit.data === expected) hits++;
          if (hits >= SCAN_MIN_HITS) break outer;
          if (k === 1) break; // larger dims would just repeat the same pixels
        }
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

      // A code on a busy photo — or covered by a centered logo — needs
      // headroom, so bump to the strongest error-correction level.
      if (els.ec.value !== 'H') {
        els.ec.value = 'H';
        els.ecHint.hidden = false;
      }

      if (state.mode === 'center') applyLogoColor();
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
    els.imageHint.textContent = 'Pick a photo or graphic and the QR code is merged into it. Drag the code on the preview to reposition it.';
    syncControlVisibility();
    render();
  }

  function syncControlVisibility() {
    var hasImage = !!state.image;
    var merging = hasImage && state.mode === 'merge';
    var centering = hasImage && state.mode === 'center';
    els.removeImage.hidden = !hasImage;
    els.modeControl.hidden = !hasImage;
    els.strengthControl.hidden = !merging;
    els.scaleControl.hidden = !hasImage || centering; // "size on image" is N/A when
    els.posControl.hidden = !hasImage || centering;   // the image sits in the code
    els.logoSizeControl.hidden = !centering;
    // Center mode is a standalone-style square, so it keeps the export-size
    // and color pickers; merge takes its colors from the photo.
    els.exportControl.style.display = (!hasImage || centering) ? '' : 'none';
    els.colorRow.hidden = merging;
    els.modeMerge.classList.toggle('active', state.mode === 'merge');
    els.modeCenter.classList.toggle('active', state.mode === 'center');
    els.modeStamp.classList.toggle('active', state.mode === 'stamp');
    if (!hasImage) els.scanBadge.hidden = true;
  }

  // Tint the code to the logo's dominant color (center mode). No-op if the
  // image has no vivid color to pick.
  function applyLogoColor() {
    if (!state.image) return;
    var hex = pickLogoColor(state.image);
    if (hex) els.fg.value = hex;
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
    var was = state.mode;
    state.mode = mode;
    // Entering center mode tints the code to the logo; leaving it restores the
    // default ink so a hand-picked photo tint doesn't linger on other modes.
    if (mode === 'center') applyLogoColor();
    else if (was === 'center') els.fg.value = '#111827';
    syncControlVisibility();
    render();
  }
  els.modeMerge.addEventListener('click', function () { setMode('merge'); });
  els.modeCenter.addEventListener('click', function () { setMode('center'); });
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

  els.logoSize.addEventListener('input', function () {
    state.logoPct = parseInt(els.logoSize.value, 10);
    els.logoSizeValue.textContent = state.logoPct + '% of the code';
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
  els.logoSizeValue.textContent = state.logoPct + '% of the code';
  syncControlVisibility();
  render();

  // Test hook (used by the scratchpad verification harness).
  window.__qrmDebug = { classifyModules: classifyModules, render: render };
})();

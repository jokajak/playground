/* QR Code Maker — generate a QR code and optionally stamp it onto an image.
   Uses the vendored qrcode-generator library (global `qrcode`). */
(function () {
  'use strict';

  var els = {
    text:          document.getElementById('text'),
    ec:            document.getElementById('ec'),
    exportSize:    document.getElementById('export-size'),
    exportControl: document.getElementById('export-size-control'),
    fg:            document.getElementById('fg'),
    bg:            document.getElementById('bg'),
    imageInput:    document.getElementById('image-input'),
    chooseImage:   document.getElementById('choose-image'),
    removeImage:   document.getElementById('remove-image'),
    imageHint:     document.getElementById('image-hint'),
    scaleControl:  document.getElementById('scale-control'),
    scale:         document.getElementById('scale'),
    scaleValue:    document.getElementById('scale-value'),
    posControl:    document.getElementById('position-control'),
    ecHint:        document.getElementById('ec-hint'),
    error:         document.getElementById('error'),
    download:      document.getElementById('download'),
    canvas:        document.getElementById('canvas'),
    meta:          document.getElementById('meta'),
  };

  var QUIET_MODULES = 4;      // standard quiet zone, drawn in the background color
  var MAX_IMAGE_DIM = 4096;   // cap huge photos so canvas work stays snappy
  var EDGE_MARGIN = 0.02;     // preset margin, as a fraction of the shorter side

  var state = {
    image: null,          // HTMLImageElement, or null for standalone QR
    imageName: '',
    scalePct: 25,         // QR footprint as % of the image's shorter side
    pos: { x: 0.5, y: 0.5 }, // normalized center of the QR on the image
  };

  var ctx = els.canvas.getContext('2d');
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

  // ── Rendering ────────────────────────────────────────────────────────────

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
    ctx.drawImage(img, 0, 0, w, h);

    if (!qr) {
      qrRect = null;
      els.meta.textContent = w + '×' + h + ' px — enter content to add the QR code';
      return;
    }

    var target = Math.min(w, h) * (state.scalePct / 100);
    var c = qrToCanvas(qr, target);
    var qw = c.width;

    // Clamp the center so the code stays fully inside the picture.
    var half = qw / 2;
    var cx = clamp(state.pos.x * w, half, w - half);
    var cy = clamp(state.pos.y * h, half, h - half);
    state.pos.x = cx / w;
    state.pos.y = cy / h;

    var x = Math.round(cx - half);
    var y = Math.round(cy - half);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, x, y);
    qrRect = { x: x, y: y, w: qw, h: qw };
    els.meta.textContent = w + '×' + h + ' px · QR ' + qw + '×' + qw +
      ' px — drag the code to reposition it';
  }

  function showError(msg) {
    els.error.textContent = msg;
    els.error.classList.toggle('show', !!msg);
  }

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi);
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

      els.removeImage.hidden = false;
      els.scaleControl.hidden = false;
      els.posControl.hidden = false;
      els.exportControl.style.display = 'none';
      els.imageHint.textContent = file.name;
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
    els.removeImage.hidden = true;
    els.scaleControl.hidden = true;
    els.posControl.hidden = true;
    els.ecHint.hidden = true;
    els.exportControl.style.display = '';
    els.imageHint.textContent = 'Pick a photo or graphic and the QR code is stamped onto it. Drag the code on the preview to reposition it.';
    render();
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
    render();
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

  els.scale.addEventListener('input', function () {
    state.scalePct = parseInt(els.scale.value, 10);
    els.scaleValue.textContent = state.scalePct + '% of the shorter side';
    render();
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
  render();
})();

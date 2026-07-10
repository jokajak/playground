# QR Code Maker

Generate QR codes in the browser, and optionally embed one into a picture of
your choosing — either merged into the image itself (the picture's own pixels
are reshaped to carry the code's dark and light modules; nothing is drawn on
top) or stamped on as a solid tile. No server, no build step, no accounts —
nothing you type or upload ever leaves your machine.

## Use it

**https://jokajak.github.io/playground/qrcodemaker/**

## How to run locally

The page uses plain scripts (no ES modules), so you can open `index.html`
directly, or serve it like the other utilities:

```sh
cd qrcodemaker
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## How to use

1. Type the **content** — a URL or any text. The QR code updates live.
2. Pick an **error correction** level and colors if you like. Higher levels
   survive more damage/obstruction but make a denser code.
3. Choose an **export size** and hit **Download PNG**.

### Embedding the code in a picture

1. Click **Choose image…** (or drag a picture anywhere onto the page).
2. Pick a **style**:
   - **Merge** (default) reshapes the picture's own pixels to carry the code:
     each pixel under a module is gently darkened or lightened toward the
     level a scanner needs — strongest at the module's center, fading toward
     the cell edge — and pixels the photo already agrees with are left
     untouched, so texture, color, and detail survive everywhere. Nothing is
     pasted on top except the corner finder marks every scannable QR must
     show (drawn semi-transparent, the image shows through). The **Merge
     strength** slider trades subtlety (lower) against scanning reliability
     (higher).
   - **Center logo** makes a clean, full QR code with the image sitting in its
     middle — the classic "logo in a QR code" look, best for logos and graphics
     that shouldn't be broken up. The code's module color is auto-tinted to the
     image's dominant color (e.g. a blue logo yields a blue code), which you can
     override with the color pickers, and the **Logo size** slider sets how much
     of the code the logo covers. Error correction is kept at **H** so the code
     still scans with the middle covered.
   - **Stamp** places the code as a solid tile — less pretty, most scannable.
3. In **Merge**/**Stamp**, **drag** the code on the preview to reposition it,
   use the arrow buttons for corner/center presets, and the **QR size** slider
   to resize it. (In **Center logo** the code fills the frame, so those don't
   apply — use **Logo size** instead.)
4. Watch the **scannability badge** under the preview: after every change the
   page decodes its own output with a real QR reader (jsQR) and reports
   "scans OK" or "may not scan".
5. **Download PNG** exports the result. Merge/Stamp export at the picture's
   native resolution (very large photos are capped at 4096 px on the long
   side); Center logo exports a square at the chosen **Export size**.

When you load an image, error correction is automatically raised to **H**
(30% recoverable) — merged codes rely on that headroom.

### Scannability tips

- Keep the code at least ~25% of the image's shorter side, and don't shrink
  the final image so much that individual modules blur together.
- Merged codes read best over calm, mid-tone image areas; on very dark or
  very busy regions, raise the merge strength until the badge turns green.
- The light "quiet zone" border around the code is drawn automatically —
  don't crop it off.
- The badge is a good proxy, but test with a phone camera before printing —
  print + distance adds blur the badge can't simulate.

## Credits

QR encoding by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
by Kazuhiko Arase (MIT), vendored in `src/vendor/qrcode.js`. Scannability
checking by [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0), vendored in
`src/vendor/jsqr.js`. The merged style is inspired by
[infuse-qr.com](https://infuse-qr.com).
"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

### Updating the vendored libraries

The vendored copies are tracked through `package.json` so Dependabot can open
bump PRs. After a bump, regenerate the vendored files and commit them:

```sh
cd qrcodemaker
npm install
npm run sync-vendor
```

The `vendor-sync` GitHub Actions check fails until the vendored file matches
the version locked in `package-lock.json`.

## License

Apache-2.0 (see [LICENSE](LICENSE)).

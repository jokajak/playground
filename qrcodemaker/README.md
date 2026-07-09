# QR Code Maker

Generate QR codes in the browser, and optionally stamp one onto a picture of
your choosing. No server, no build step, no accounts — nothing you type or
upload ever leaves your machine.

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
2. The QR code is stamped onto the image. **Drag it** on the preview to
   reposition it, use the arrow buttons for corner/center presets, and the
   **QR size** slider to resize it.
3. **Download PNG** exports the combined image at the picture's native
   resolution (very large photos are capped at 4096 px on the long side).

When you load an image, error correction is automatically raised to **H**
(30% recoverable) — recommended whenever the code sits on a busy background.

### Scannability tips

- Keep the code at least ~20% of the image's shorter side, and don't shrink
  the final image so much that individual modules blur together.
- Keep good contrast: dark code color, light background. The light "quiet
  zone" border around the code is drawn automatically — don't crop it off.
- Test with a phone camera before printing.

## Credits

QR encoding by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
by Kazuhiko Arase (MIT), vendored in `src/vendor/qrcode.js`.
"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

### Updating the vendored library

The vendored copy is tracked through `package.json` so Dependabot can open
bump PRs. After a bump, regenerate the vendored file and commit it:

```sh
cd qrcodemaker
npm install
npm run sync-vendor
```

The `vendor-sync` GitHub Actions check fails until the vendored file matches
the version locked in `package-lock.json`.

## License

Apache-2.0 (see [LICENSE](LICENSE)).

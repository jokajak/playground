# OpenGrid Planner

Plan an [OpenGrid](https://www.opengrid.us/) wall/surface layout: enter a
surface size and it works out how many 28mm-grid tiles you need (auto-picking
an efficient tile size, or let you set one manually), broken down into main,
edge, and corner tiles plus Multiconnect connectors, with a print-time
estimate and a visual preview. No server, no build step, no accounts.

## Use it

**https://jokajak.github.io/playground/opengridplanner/**

## How to run locally

Single static file, no build step — open `index.html` directly, or serve it
like the other utilities:

```sh
cd opengridplanner
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## How to use

1. Pick your **printer** (or "Custom / Other") — this constrains the maximum
   tile size the auto-optimal search considers to what fits on one bed.
2. Enter the **surface or wall size** you're covering, in mm or inches.
3. Leave **Auto Optimal** on to get ranked tile-size recommendations (click
   one to select it), or switch to **Manual Size** to fix your own tile
   dimensions in grids.
4. Pick **Regular** or **Lite** tiles for the print-time estimate.
5. **Calculate Layout** shows total tiles, coverage %, estimated print time,
   a scaled preview, and the bill of materials (hover an item to highlight
   its tiles in the preview).
6. **Export Results** gives a plain-text summary plus an ASCII layout diagram
   you can copy.

### Supported printers

| Printer | Bed size |
|---|---|
| A1 Mini | 180×180×180mm |
| A1 | 256×256×256mm |
| P1P | 256×256×256mm |
| P1S | 256×256×256mm |
| P2S | 256×256×256mm |
| X1 Carbon | 256×256×256mm |
| Custom / Other | unconstrained |

## License

Apache-2.0 (see [LICENSE](LICENSE)).

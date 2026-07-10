# Playground

A collection of small, self-contained web utilities — no build step, no
backend, no accounts. Each one lives in its own subdirectory and is playable
directly from GitHub Pages.

**https://jokajak.github.io/playground/**

## Utilities

| Utility | Description | Live |
|---|---|---|
| [Jeopardy Maker](jeopardymaker/) | A Jeopardy clone for 2–6 players on a shared screen, with a built-in board editor. | [Play](https://jokajak.github.io/playground/jeopardymaker/) |
| [Bracket Maker](bracketmaker/) | Generates printable single-elimination tournament brackets (2–64 participants). | [Use it](https://jokajak.github.io/playground/bracketmaker/) |
| [QR Code Maker](qrcodemaker/) | Generates QR codes, with optional embedding onto an uploaded picture. | [Use it](https://jokajak.github.io/playground/qrcodemaker/) |

### Cubing

| Utility | Description | Live |
|---|---|---|
| [1×2×3 Character Cube Scrambler](cubing/1x2x3-scrambler/) | Uniform random-state scrambles for the 1×2×3 puzzle, rendered as a character cube. | [Use it](https://jokajak.github.io/playground/cubing/1x2x3-scrambler/) |
| [2-Look CFOP Cheat Sheet](cubing/2look-cfop-cheatsheet/) | Printable OLL/PLL algorithm reference with a finger-trick trigger table. | [Use it](https://jokajak.github.io/playground/cubing/2look-cfop-cheatsheet/) |
| [WCA Scorecard Generator](cubing/wca-scorecard-generator/) | Prints blank, official-style WCA competition scorecards to fill in by hand. | [Use it](https://jokajak.github.io/playground/cubing/wca-scorecard-generator/) |

Each utility has its own README with usage instructions and details.

## Adding a new utility

Each utility is a self-contained directory (its own `index.html`, `src/`,
and `README.md`) that works when served from a subpath, so it can be dropped
in here and linked from the table above and from the [landing page](index.html).

## License

Playground itself is licensed under AGPL-3.0 (see [LICENSE](LICENSE)). Each
utility subdirectory carries its own license — check the `LICENSE` file
inside it.

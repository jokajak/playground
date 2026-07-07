# Jeopardy Maker

A Jeopardy clone for 2–6 players on a shared screen. Author custom boards with
text and images using the built-in editor, save them to your browser via
IndexedDB, and export/import as self-contained JSON files. No server, no build
step, no accounts.

## Play now

**https://jokajak.github.io/playground/jeopardymaker/**

## How to run locally

Open `index.html` directly in your browser (Chrome, Firefox, Safari, Edge).
No install, no server required.

## How to play

1. Create a board on the Home screen (or import a JSON file).
2. Click **New Game**, choose the number of players, then click **Play**.
3. Click a cell to reveal the prompt. The host taps a player button to buzz
   them in, then **Correct** or **Wrong** to score.
4. Press **?** during play to see all keyboard shortcuts.

## Keyboard shortcuts (Play screen)

| Key     | Action                                        |
|---------|-----------------------------------------------|
| `1`–`6` | Buzz in Player 1–6                            |
| `Y`     | Award buzzed player                           |
| `N`     | Deduct buzzed player, reopen buzzers          |
| Space   | Reveal answer / close cell                    |
| Esc     | Close without resolving                       |
| `?`     | Toggle keyboard shortcut overlay              |

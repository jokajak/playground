# Jeopardy Maker — Design Doc

## Overview

A local-web Jeopardy clone for two players on a shared screen. Content is
authored via a built-in editor and persisted locally (IndexedDB + JSON export).
No server, no build step — open `index.html` and play.

---

## Data Model

```
Board {
  schema: 1
  id: UUID
  name: string
  createdAt: ISO8601
  rounds: [Round]           // only rounds[0] in v1; rounds[1] reserved for future Final Jeopardy
}

Round {
  categories: [Category]   // length = N, configurable per board
  values: [100, 200, 300, 400, 500]  // rows always 5
}

Category {
  title: string
  cells: [Cell]             // length always 5
}

Cell {
  prompt: CellPart
  answer: CellPart
}

CellPart {
  text: string | null
  imageDataUrl: string | null   // base64 data URL, long-edge ≤ 1200px
}

GameState {
  boardId: UUID
  p1Score: number
  p2Score: number
  revealedCells: string[]   // ["row,col", ...]
}
```

---

## Persistence

- **IndexedDB** via `idb-keyval` (CDN). Keys: `board:<id>`, `gamestate:<id>`.
  Auto-save on every edit and state change.
- **JSON file** — Export downloads pretty-printed JSON. Import reads it back.
  Round-trip is lossless; IndexedDB is a cache of the canonical file.

---

## Screens

### Home
Lists all saved boards. Actions: New, Import, Play, Export, Delete.

### Editor
- Set category count N for the board.
- N×5 grid of cells. Click cell → modal with Prompt/Answer tabs.
- Each tab: textarea + image dropzone (paste, drag-drop, file picker).
- Live thumbnails. `Cmd/Ctrl-S` exports JSON.

### Play
- Full-screen board, scores in top corners (P1 red, P2 green).
- Click cell → prompt modal. Space → reveal answer. Space/Esc → close and mark revealed.
- Revealed cells dim on the board.

---

## Buzzer & Scoring (Step 4)

Host-arbitrated; no timer.

| Key   | Action                                                   |
|-------|----------------------------------------------------------|
| `A`   | P1 buzz in                                               |
| `L`   | P2 buzz in                                               |
| `Y`   | Award buzzed player (+value), mark cell revealed         |
| `N`   | Deduct buzzed player (−value), reopen buzzers            |
| Space | Reveal answer / close cell                               |
| Esc   | Close without resolving                                  |

Lockout: first keydown wins; board border turns P1-red or P2-green while locked.

---

## Image Handling

- Accept paste, drag-drop, file picker in editor.
- On load/import: canvas-resize so long edge ≤ 1200px, then base64-encode.
- Reject files > 5MB pre-resize with a user-visible error.
- Thumbnails in editor; full-size in play modal.

---

## Build Order

1. **Skeleton + data model** — hardcoded board, click → prompt → answer.
2. **Editor** — N-configurable, text-only cells, IndexedDB auto-save.
3. **Image cells** — paste/drag/file handlers, canvas resize, thumbnails.
4. **Buzzer + scoring** — keyboard handlers, lockout state machine, score UI.
5. **Export / Import JSON** — home screen buttons, round-trip verified.
6. **Polish** — dim revealed cells, `?` shortcuts overlay, reset-game, new-game-from-board.

---

## Out of Scope (v1)

- Daily Doubles / wagering
- Round 2 / Final Jeopardy (data model leaves room)
- More than two players
- Cloud sync (JSON export is the sharing mechanism)
- Authentication

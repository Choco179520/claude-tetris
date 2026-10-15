# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Classic Tetris in vanilla JavaScript + HTML5 Canvas. No dependencies, no `package.json`, no build step, no tests, no linter. UI text and the README are in Spanish; keep user-facing strings in Spanish.

## Running

Serve the directory statically and open `http://localhost:8000`:

```bash
python3 -m http.server 8000
```

(Opening `index.html` directly also works.)

## Architecture

Three files: `index.html` (DOM: `#board` canvas, side panel with `#score`/`#lines`/`#level`, `#next-canvas`, and a shared `#overlay` used for both PAUSA and GAME OVER), `style.css`, and `game.js` (all logic, loaded as a plain classic script — globals, no modules).

Key conventions in `game.js`:

- **Cell value = piece type = color index.** `PIECES[t]` matrices are filled with the value `t` (1–7), which is merged into `board` as-is and used to index `COLORS`. Index 0 is empty/null in both arrays. Adding or reordering pieces requires keeping `PIECES` and `COLORS` aligned.
- **All game state is module-level `let` variables** (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …), reset in `init()`. `init()` is also the restart handler.
- **Piece flow:** `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current`, and calls `endGame()` if the new piece collides immediately.
- **`collide(shape, x, y)`** is the single source of truth for movement, rotation (`tryRotate` tries kicks `[0, -1, 1, -2, 2]`), gravity, and the ghost piece (`ghostY`). Cells with `y < 0` are allowed (above the board).
- **Game loop** is `requestAnimationFrame`-driven, accumulating `dt` into `dropAccum` until it reaches `dropInterval`. Pause/game-over stop it via `cancelAnimationFrame(animId)`.
- **Level/speed:** `level = floor(lines / 10) + 1`, `dropInterval = max(100, 1000 - (level - 1) * 90)`, recomputed in `clearLines()`.
- HUD is only updated through `updateHUD()`; call it after any score/lines/level change.

Changing `COLS`, `ROWS`, or `BLOCK` requires updating the `#board` canvas `width`/`height` in `index.html` to `COLS*BLOCK` × `ROWS*BLOCK`. The next-piece preview assumes a 4×4 grid of 30px cells (`#next-canvas` is 120×120).

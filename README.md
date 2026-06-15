# Spellcave (HTML/React)

Pure HTML/React port of [Spellcave](https://github.com/itayke/spellcave) — no Phaser, no canvas.
The game renders as DOM + CSS (mask-image tints, transforms, Web Animations API). See
`../spellcave/MIGRATION_PLAN.md` for the full migration plan and rationale.

## Status

Phases 1–4 complete — the engine is ported and Phaser-free, a Zustand store drives the view from
engine snapshots, and the cave now renders with faithful CSS-masked sprite components (squares,
connector path, level lines, dig/hint/spellstone buttons, game-over screen).

- `src/store/` — **(Phase 3)** the Zustand bridge replacing the Phaser EventBus. `gameStore.js`
  boots the engine in the browser (loads language data over `fetch`, sizes the 7-column grid to the
  viewport, constructs the `Cave` with `window.localStorage` and a real `ui`, and runs `startGame()`
  so the available-words search runs and `readyForInput` flips), holds the immutable `snapshot`, and
  exposes intents (`tapSquare`, `clearSelection`, `digWord`, `showHint`, `restart`) that call the
  engine then republish. `uiBridge.js` is the object installed as `cave.ui` (replacing the engine's
  internal no-op proxy): a recursive proxy that absorbs the engine's imperative view calls and
  coalesces them into one snapshot publish per microtask, covering the async engine→view flows.
- `src/view/` — **(Phase 4)** the faithful DOM/CSS view, driven entirely by the snapshot:
  - `Sprite.jsx` — the CSS-mask tint primitive (`mask-image` PNG + `background-color`, replacing
    Phaser `setTint`) and `ColoredText` (per-character `{COLOR=n}` coloring via
    `GameManager.parseColorTags`, replacing `setCharacterTint`).
  - `Square.jsx` — one cell: tinted `squareBg3.png`, the token glyph, the selected outline + scale.
  - `Connectors.jsx` — the selection/hint "tunnel" path (line segments, dots, diagonal-lead corner
    pieces) computed from grid-center geometry.
  - `LevelLines.jsx` — depth/level boundary bars with dug-column overlays.
  - `Chrome.jsx` — the fixed UI: depth/level stats, the typed-word + bonus message, and the bottom
    dig / hint / spellstone button bar (positions from the `*GridRatio` constants).
  - `GameOver.jsx` — skull + stats + replay overlay (shown on the snapshot's `gameOver`).
  - `CaveView.jsx` — composes the scrolling cave + chrome + overlay.
- `src/App.jsx` — boots the store on mount and renders `CaveView`.
- Fonts: Pathway Gothic One (the `SquareToken` grid/word font) and Poppins (the Daikon-Medium
  `UIText` substitute) load as web fonts via `index.html`.
- `src/engine/` — pure-logic engine + de-Phasered model, ported from the Phaser repo:
  - `LanguageTree.js`, `HashManager.js`, `CaveData.js` — copied verbatim.
  - `GameConstants.js` — Phaser `Color.ValueToColor(...)` objects rewritten as CSS hex strings.
  - `GameManager.js` — locale loading + `{COLOR=n}` tag parser; Phaser asset-loading and
    Cave/UI construction removed (those return in the store + view phases).
  - `Color.js` — small hex parse / blend helper replacing the bits of `Phaser.Display.Color`
    the engine used.
  - `Square.js` — **(Phase 2)** the cell state machine as a plain class: state masks, token
    logic, color-from-state, and line/diagonal connector *geometry*. No Phaser container/image/
    tween. Exposes `getSnapshot()` — a serializable render descriptor for the view.
  - `Cave.js` — **(Phase 2)** the board model as a plain class: seed-deterministic grid
    generation, square pool, levels, selection/typing state machine, bonus calc, async hint
    search, dig, scroll, save/load. The three Phaser/browser couplings are routed through hooks:
    `cave.ui` (a recursive no-op proxy until the real UI lands), `cave.storage` (injectable,
    in-memory by default, replacing `localStorage`), and `cave.scrollY` (plain state replacing
    the Phaser container offset; animation moves to the view). Exposes `getSnapshot()`.
  - `LanguageTree.js` — its Node-only `fs/promises` use (offline reads + dev tree export) is now a
    lazy dynamic import, so the engine bundles cleanly for the browser (the browser only runs the
    `fetch` path).
**Deferred on purpose** (tracked in the migration plan): raw pointer/wheel input + swipe
hit-testing → Phase 5; sprite enter/exit/scale tweens → Phase 6; the spellstone-placement and
in-progress score/message animations → Phase 5/6.

**Next: Phase 5 — input.** Add pointer/swipe drag-to-type and wheel/touch scrolling on top of the
Phase 4 view (tap selection already works); wire the spellstone-placement flow.

## Scripts

```bash
npm run dev       # Vite dev server (live cave)
npm run build     # production build
npm run harness   # parity test (see below)
```

## Parity harness

`npm run harness` runs three checks and is green when all pass:

1. **PARITY PASS** (`harness/golden.mjs`) — cross-engine: proves the ported engine produces
   **byte-identical** seed-driven output to the current Phaser engine in `../spellcave`. Both run
   headless under Node on the fixed `CaveData.Default.Seed`, deep-comparing random word
   generation, validation, trie traversal, wildcard expansion, and the token-randomization chains.
2. **SQUARE GOLDEN PASS** (`harness/square-golden.mjs` + `square-golden.json`) — new-engine
   self-golden for the de-Phasered `Square`. There is no cross-engine diff here: the *old* Square
   extends `Phaser.GameObjects.Container` and can't run headless, so this drives the ported Square
   through a fixed state-machine + geometry script and locks it against a committed baseline.
3. **CAVE GOLDEN PASS** (`harness/cave-golden.mjs` + `cave-golden.json`) — same idea for `Cave`.
   Locks **seeded grid generation** (the centerpiece — it rides the same RNG + LanguageTree that
   check 1 already proved identical) plus a scripted select / deselect / dig.

To intentionally change a self-golden: delete its `.json`, re-run to regenerate it, and commit.

> Requires the original `../spellcave` repo checked out next to this one (checks 1 imports it).

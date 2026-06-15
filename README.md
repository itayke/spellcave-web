# Spellcave (HTML/React)

Pure HTML/React port of [Spellcave](https://github.com/itayke/spellcave) — no Phaser, no canvas.
The game renders as DOM + CSS (mask-image tints, transforms, Web Animations API). See
`../spellcave/MIGRATION_PLAN.md` for the full migration plan and rationale.

## Status

Phases 1–3 complete — the engine is ported and Phaser-free, and a Zustand store now drives a live
(provisional) React view from engine snapshots in the browser.

- `src/store/` — **(Phase 3)** the Zustand bridge replacing the Phaser EventBus. `gameStore.js`
  boots the engine in the browser (loads language data over `fetch`, sizes the 7-column grid to the
  viewport, constructs the `Cave` with `window.localStorage` and a real `ui`), holds the immutable
  `snapshot`, and exposes intents (`tapSquare`, `clearSelection`) that call the engine then
  republish. `uiBridge.js` is the object installed as `cave.ui` (replacing the engine's internal
  no-op proxy): a recursive proxy that absorbs the engine's imperative view calls and coalesces them
  into one snapshot publish per microtask, covering the async engine→view flows.
- `src/App.jsx` — **(Phase 3)** a provisional React view: boots the store on mount and renders the
  generated cave (positioned `<div>`s, level lines, HUD) straight from `snapshot`; tapping a square
  routes an intent back through the store. Plain inline styles — the faithful CSS-masked components
  move to `src/view/` in Phase 4.
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
- `src/view/` — empty until Phase 4 (the provisional view currently lives in `App.jsx`).

**Deferred on purpose** (tracked in the migration plan): raw pointer/wheel input + swipe
hit-testing → Phase 5; CSS-masked sprite rendering + tweens → Phase 4/6; `{COLOR=n}` word
styling → Phase 4.

**Next: Phase 4 — view components.** Replace the provisional `App.jsx` rendering with real
`<Square>` / `<Connector>` / UI-screen components as CSS-masked DOM in `src/view/`, plus `{COLOR=n}`
word styling.

## Scripts

```bash
npm run dev       # Vite dev server (placeholder shell for now)
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

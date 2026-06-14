# Spellcave (HTML/React)

Pure HTML/React port of [Spellcave](https://github.com/itayke/spellcave) — no Phaser, no canvas.
The game renders as DOM + CSS (mask-image tints, transforms, Web Animations API). See
`../spellcave/MIGRATION_PLAN.md` for the full migration plan and rationale.

## Status

Phases 1–2 complete — the entire engine + model are ported and Phaser-free.

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
- `src/view/`, `src/store/` — empty, filled in later phases.

**Deferred on purpose** (tracked in the migration plan): raw pointer/wheel input + swipe
hit-testing → Phase 5; image/tween rendering → Phase 4/6; `{COLOR=n}` word styling → Phase 4.

**Next: Phase 3** — Zustand store bridging engine ↔ React (replacing the Phaser EventBus), a React
root rendering the cave from `cave.getSnapshot()`, a real `ui` object + `window.localStorage`
wired onto the Cave. (Also pending from Phase 1: make `LanguageTree.js`'s top-level
`import fs from 'fs/promises'` a dynamic import before the engine is imported in the browser build.)

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

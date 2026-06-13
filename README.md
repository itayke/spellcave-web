# Spellcave (HTML/React)

Pure HTML/React port of [Spellcave](https://github.com/itayke/spellcave) — no Phaser, no canvas.
The game renders as DOM + CSS (mask-image tints, transforms, Web Animations API). See
`../spellcave/MIGRATION_PLAN.md` for the full migration plan and rationale.

## Status

Phase 1 (logic core) complete:

- `src/engine/` — pure-logic engine, ported from the Phaser repo:
  - `LanguageTree.js`, `HashManager.js`, `CaveData.js` — copied verbatim.
  - `GameConstants.js` — Phaser `Color.ValueToColor(...)` objects rewritten as CSS hex strings.
  - `GameManager.js` — locale loading + `{COLOR=n}` tag parser; Phaser asset-loading and
    Cave/UI construction removed (those return in the store + view phases).
  - `Color.js` — small hex parse / blend helper replacing the bits of `Phaser.Display.Color`
    the engine used.
- `src/view/`, `src/store/` — empty, filled in later phases.

The `Cave` and `Square` model/state machines still live (Phaser-coupled) in the original repo;
de-Phasering them is the next phase.

## Scripts

```bash
npm run dev       # Vite dev server (placeholder shell for now)
npm run build     # production build
npm run harness   # parity test (see below)
```

## Parity harness

`npm run harness` proves the ported engine produces **byte-identical** seed-driven output to the
current Phaser engine in `../spellcave`. It runs both engines headless under Node, feeds them the
fixed `CaveData.Default.Seed`, and deep-compares random word generation, word validation, trie
traversal, wildcard expansion, and the token-randomization chains the cave generator uses.

This is the regression net for the upcoming de-Phasering of `Cave`/`Square`: extend the battery
in `harness/golden.mjs` as model logic moves over, and keep it green.

> Requires the original `../spellcave` repo checked out next to this one.

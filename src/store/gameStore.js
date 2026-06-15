// Zustand store — the bridge between the pure-logic engine and React, replacing the Phaser EventBus.
//
// The contract (see ../spellcave/MIGRATION_PLAN.md, "Target architecture"):
//   engine (mutable Cave/Square)  --getSnapshot()-->  store.snapshot  -->  React view
//   React view  --intents (tap/scroll)-->  store actions  -->  engine methods  -->  publish()
//
// React renders ONLY from immutable snapshots, never from the live model. The Cave instance is held
// module-scoped (not in reactive state) so components can't accidentally subscribe to the mutable
// object — every render goes through `publish()`, the single funnel that re-reads getSnapshot().
import { create } from 'zustand';
import LanguageTree from '../engine/LanguageTree.js';
import GameConstants from '../engine/GameConstants.js';
import GameManager from '../engine/GameManager.js';
import Cave from '../engine/Cave.js';
import { createUIBridge } from './uiBridge.js';

// The live engine instance. Intentionally outside the store's reactive state.
let cave = null;

// The Phaser build derived SquareSize from the viewport (calcZoomGameSize). We do the same: fit the
// 7-column grid to the viewport width, clamped so squares stay legible on phones and don't balloon
// on desktop.
function computeSquareSize(viewportWidth) {
  const { GridColumns, Padding } = GameConstants.Cave;
  const usable = viewportWidth - Padding.left - Padding.right;
  return Math.max(36, Math.min(96, Math.floor(usable / GridColumns)));
}

export const useGameStore = create((set, get) => ({
  status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  error: null,
  snapshot: null,
  squareSize: 0,
  viewWidth: 0,
  viewHeight: 0,

  // The single update funnel: re-read the engine's render descriptor into reactive state. Called by
  // store actions (synchronously) and by the UI bridge (coalesced, for async engine→view flows).
  publish: () => {
    if (cave) set({ snapshot: cave.getSnapshot() });
  },

  // Boot the engine in the browser: load the language data over fetch (offline=false), size the
  // grid to the viewport, construct the Cave with a real UI bridge + localStorage, and publish the
  // first snapshot. Idempotent — guards against React StrictMode's double-invoke in dev.
  async init({ langCode = 'en', viewportWidth, viewportHeight } = {}) {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });
    try {
      // The engine logs verbosely at Debug>=1 (a full caveData dump per init); keep the browser
      // console usable. Flip to 1 when tracing engine behavior.
      GameManager.Debug = 0;

      const lang = LanguageTree.GetInstance();
      const ok = await lang.initialize(langCode, false); // false → fetch from /assets/langData
      if (!ok) throw new Error('LanguageTree failed to initialize');

      const width = viewportWidth ?? window.innerWidth;
      const height = viewportHeight ?? window.innerHeight;
      const squareSize = computeSquareSize(width);
      GameConstants.SquareSize = squareSize;
      GameConstants.CaveWidth = squareSize * GameConstants.Cave.GridColumns;

      const ui = createUIBridge(() => get().publish());
      cave = new Cave({
        width: GameConstants.CaveWidth,
        height,
        ui,
        storage: window.localStorage,
      });
      cave.initialize(ui, false);

      set({
        status: 'ready',
        squareSize,
        viewWidth: GameConstants.CaveWidth,
        viewHeight: height,
        snapshot: cave.getSnapshot(),
      });
    } catch (err) {
      console.error('[spellcave] init failed', err);
      set({ status: 'error', error: String(err?.message ?? err) });
    }
  },

  // --- intents -------------------------------------------------------------
  // Phase 3 keeps these minimal: just enough to prove the engine→store→view loop is live and
  // bidirectional. Full pointer/swipe input is Phase 5.

  // Tap toggles a square: extend the word if it's selectable; if it's already in the word, pop it
  // (when it's the tail) or truncate back to it (when it's mid-word).
  tapSquare(row, column) {
    if (!cave) return;
    const sq = cave.getSquareAt(row, column);
    if (!sq) return;

    if (sq.isSelectable()) {
      cave.selectSquare(sq, true);
    } else if (sq.isSelected()) {
      const typed = cave.typedWordSquares ?? [];
      if (typed[typed.length - 1] === sq) cave.selectSquare(sq, false);
      else cave.deselectAfterSquare(sq);
    }
    get().publish();
  },

  // Clear the whole typed word back to empty (tail-truncate, then pop the head).
  clearSelection() {
    if (!cave) return;
    const typed = cave.typedWordSquares ?? [];
    if (typed.length) {
      const head = typed[0];
      cave.deselectAfterSquare(head); // removes everything after the head
      cave.selectSquare(head, false); // pop the head itself
    }
    get().publish();
  },
}));

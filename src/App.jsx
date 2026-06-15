// Phase 3 shell: a real React view driven entirely by the engine snapshot through the Zustand store.
//
// This is deliberately provisional rendering — plain absolutely-positioned <div>s, inline styles, no
// sprites/masks/animations. Its job is to prove the vertical slice is live: the engine boots in the
// browser, generates the seeded cave, and React renders it from `store.snapshot`; tapping a square
// routes an intent back through the store into the engine and the view updates. The faithful
// CSS-masked <Square>/<Connector>/UI components land in Phase 4.
import { useEffect, useRef } from 'react';
import { useGameStore } from './store/gameStore.js';

export default function App() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const init = useGameStore((s) => s.init);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return; // belt-and-suspenders vs StrictMode double-mount (store also guards)
    didInit.current = true;
    init({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
  }, [init]);

  if (status === 'error') return <Centered>Failed to load: {error}</Centered>;
  if (status !== 'ready') return <Centered>Loading cave…</Centered>;
  return <CaveView />;
}

function Centered({ children }) {
  return (
    <div style={{ color: '#d7d6d3', fontFamily: 'sans-serif', display: 'flex',
      height: '100%', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {children}
    </div>
  );
}

function CaveView() {
  const snapshot = useGameStore((s) => s.snapshot);
  const squareSize = useGameStore((s) => s.squareSize);
  const viewWidth = useGameStore((s) => s.viewWidth);
  const viewHeight = useGameStore((s) => s.viewHeight);
  const tapSquare = useGameStore((s) => s.tapSquare);
  const clearSelection = useGameStore((s) => s.clearSelection);

  const { scrollY, squares, levelLines, typedWord } = snapshot;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, sans-serif', color: '#d7d6d3', background: '#0a0a0c' }}>
      <Hud snapshot={snapshot} onClear={clearSelection} />

      {/* The cave viewport: fixed grid width, clips the scrolling layer. */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden',
        width: viewWidth, margin: '0 auto', borderLeft: '1px solid #1c1c22', borderRight: '1px solid #1c1c22' }}>
        {/* Scroll layer: the whole cave translated by the engine's scrollY. */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${scrollY}px)` }}>
          {levelLines.map((l) => (
            <div key={`level-${l.row}`} style={{
              position: 'absolute', left: 0, top: l.row * squareSize, width: viewWidth, height: 2,
              background: l.isComplete ? '#ff7011' : '#3a3a44' }} />
          ))}
          {squares.map((sq) => (
            <SquareCell key={sq.key} sq={sq} size={squareSize} onTap={tapSquare} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SquareCell({ sq, size, onTap }) {
  const inset = Math.round(size * 0.04);
  return (
    <button
      onClick={() => onTap(sq.row, sq.column)}
      style={{
        position: 'absolute',
        left: sq.column * size + inset,
        top: sq.row * size + inset,
        width: size - inset * 2,
        height: size - inset * 2,
        padding: 0,
        borderRadius: Math.round(size * 0.18),
        border: sq.selectable ? '2px solid #ffd28a' : '2px solid transparent',
        background: sq.bgColor ?? '#222',
        color: sq.fgColor ?? '#fff',
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        lineHeight: 1,
        cursor: sq.selectable || sq.selected ? 'pointer' : 'default',
        opacity: sq.dug ? 0.25 : 1,
        outline: sq.selected ? '3px solid #ffffff' : 'none',
        outlineOffset: -3,
        transform: sq.selected ? `scale(${sq.scale ?? 1.1})` : 'none',
        transition: 'transform 120ms ease, outline-color 120ms ease',
        zIndex: sq.selected ? 2 : 1,
      }}
    >
      {sq.readableToken ?? sq.token ?? ''}
    </button>
  );
}

function Hud({ snapshot, onClear }) {
  const { movesLeft, hintsLeft, spellstonesLeft, currentLevel, typedWord } = snapshot;
  const word = typedWord?.formatted || typedWord?.serialized || '';
  const bonus = typedWord?.bonus?.bonusTotal ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px',
      borderBottom: '1px solid #1c1c22', background: '#111114', fontSize: 14 }}>
      <strong style={{ color: '#ff7011' }}>Spellcave</strong>
      <span>L{currentLevel ?? 0}</span>
      <span title="moves">⛏ {movesLeft ?? 0}</span>
      <span title="hints">💡 {hintsLeft ?? 0}</span>
      <span title="spellstones">✦ {spellstonesLeft ?? 0}</span>
      <span style={{ flex: 1, textAlign: 'center', fontSize: 18, letterSpacing: 2, fontWeight: 700 }}>
        {word || <em style={{ opacity: 0.4, fontWeight: 400 }}>tap to spell</em>}
        {bonus ? <span style={{ color: '#c4ff80', marginLeft: 8 }}>+{bonus}</span> : null}
      </span>
      <button onClick={onClear} disabled={!word}
        style={{ background: '#26262e', color: '#d7d6d3', border: '1px solid #3a3a44',
          borderRadius: 6, padding: '4px 10px', cursor: word ? 'pointer' : 'default', opacity: word ? 1 : 0.4 }}>
        clear
      </button>
    </div>
  );
}

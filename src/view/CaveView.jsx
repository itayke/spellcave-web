// The composed cave view: a clipped viewport containing the scrolling cave (level lines, connector
// path, square tiles), with the fixed UI chrome and the game-over overlay on top. Everything is
// driven from the engine snapshot in the store; taps/dig/hint route back through store intents.

import { useGameStore } from '../store/gameStore.js';
import Square from './Square.jsx';
import Connectors from './Connectors.jsx';
import LevelLines from './LevelLines.jsx';
import Chrome from './Chrome.jsx';
import GameOver from './GameOver.jsx';

export default function CaveView() {
  const snapshot = useGameStore((s) => s.snapshot);
  const size = useGameStore((s) => s.squareSize);
  const width = useGameStore((s) => s.viewWidth);
  const height = useGameStore((s) => s.viewHeight);
  const tapSquare = useGameStore((s) => s.tapSquare);
  const digWord = useGameStore((s) => s.digWord);
  const showHint = useGameStore((s) => s.showHint);
  const restart = useGameStore((s) => s.restart);

  const { scrollY, squares, levelLines } = snapshot;

  return (
    <div style={{ position: 'relative', height: '100%', width, margin: '0 auto', overflow: 'hidden', background: '#0a0a0c' }}>
      {/* Scrolling cave. */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${scrollY}px)`, willChange: 'transform' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <LevelLines levelLines={levelLines} size={size} width={width} />
        </div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
          <Connectors squares={squares} size={size} />
        </div>
        {squares.map((sq) => (
          <Square key={sq.key} sq={sq} size={size} onTap={tapSquare} />
        ))}
      </div>

      {/* Fixed chrome. */}
      <Chrome snapshot={snapshot} width={width} height={height} onDig={digWord} onHint={showHint} />

      {snapshot.gameOver && <GameOver snapshot={snapshot} width={width} height={height} onReplay={restart} />}
    </div>
  );
}

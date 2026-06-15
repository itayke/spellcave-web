// Horizontal level/depth boundary lines drawn across the cave (inside the scroll layer).
//
// Each entry is { row, isComplete, overlaidColumns }: a full-width bar at the row boundary, tinted
// reached/unreached, with dark blocks painted over the columns that have been dug through (so the
// line reads as broken where the player tunneled past it) — matching the Phaser overlay behavior.

import GameConstants from '../engine/GameConstants.js';

const LL = GameConstants.LevelLine;

export default function LevelLines({ levelLines, size, width }) {
  const h = Math.max(3, size * LL.HeightRatio * 1.5); // 0.04 -> a touch thicker so it's legible
  return (
    <>
      {levelLines.map((l) => {
        const top = l.row * size - h / 2;
        const color = l.isComplete ? LL.ColorReached : LL.ColorUnreached;
        return (
          <div key={`ll-${l.row}`}>
            <div style={{ position: 'absolute', left: 0, top, width, height: h, background: color, opacity: 0.95 }} />
            {l.overlaidColumns?.map((col) => (
              <div
                key={`llo-${l.row}-${col}`}
                style={{
                  position: 'absolute',
                  left: col * size - size * 0.05,
                  top: top - h * 0.05,
                  width: size * 1.1,
                  height: h * 1.1,
                  background: '#000',
                }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

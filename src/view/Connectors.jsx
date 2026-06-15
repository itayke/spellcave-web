// The "tunnel" path drawn through selected (and hinted) squares.
//
// Each square snapshot carries a `line` descriptor from the engine (Square.computeLine): a `dot` on
// the square, an optional `connector` from the previous square in the chain, and an optional
// `diagonalLead` corner piece. The engine gives us colors + which squares connect; the view computes
// the pixel geometry from the two grid centers (more robust than threading Phaser's anchored angle
// through). This whole layer sits just under the squares so the path threads between the tiles.

import GameConstants from '../engine/GameConstants.js';
import { Sprite } from './Sprite.jsx';

const LINE = GameConstants.SquareLine;

// "12c" -> { row: 12, column: 2 }
const deKey = (k) => ({ row: parseInt(k.slice(0, -1), 10), column: k.charCodeAt(k.length - 1) - 97 });
const center = (row, column, size) => ({ x: (column + 0.5) * size, y: (row + 0.5) * size });

export default function Connectors({ squares, size }) {
  const lineW = Math.max(2, size * LINE.LineWidthScale); // 0.2
  const dotSize = size * LINE.LineDotScale; // 0.65

  const lines = [];
  const leads = [];
  const dots = [];

  for (const sq of squares) {
    const line = sq.line;
    if (!line) continue;
    const here = center(sq.row, sq.column, size);

    // Segment from the previous square in the chain to this one.
    if (line.connector) {
      const prev = deKey(line.connector.fromKey);
      const p = center(prev.row, prev.column, size);
      const dx = here.x - p.x;
      const dy = here.y - p.y;
      const dist = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      lines.push(
        <div
          key={`c-${sq.key}`}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y - lineW / 2,
            width: dist,
            height: lineW,
            background: line.connector.color,
            borderRadius: lineW / 2,
            transformOrigin: '0 50%',
            transform: `rotate(${angle}deg)`,
          }}
        />
      );
    }

    // Corner piece bridging two diagonally-adjacent selected squares (sits behind the tiles).
    if (line.diagonalLead) {
      const lead = line.diagonalLead;
      const lx = here.x + lead.offsetColFactor * size;
      const ly = here.y + lead.offsetRowFactor * size;
      leads.push(
        <Sprite
          key={`d-${sq.key}`}
          file={GameConstants.Square.ConnectorSelectedImage.file}
          w={size * 0.5}
          h={size * 0.5}
          color={sq.bgColor}
          style={{
            position: 'absolute',
            left: lx,
            top: ly,
            transform: `translate(-50%, -50%) rotate(${lead.angleDeg}deg)`,
          }}
        />
      );
    }

    // Connection dot on the square itself.
    if (line.dot) {
      dots.push(
        <Sprite
          key={`o-${sq.key}`}
          file={LINE.LineDotImage.file}
          w={dotSize}
          h={dotSize}
          color={line.dot.color}
          style={{ position: 'absolute', left: here.x, top: here.y, transform: 'translate(-50%, -50%)' }}
        />
      );
    }
  }

  return (
    <>
      {leads}
      {lines}
      {dots}
    </>
  );
}

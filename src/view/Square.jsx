// One cave cell, rendered from a square snapshot (see Square.getSnapshot in the engine).
//
// Composition mirrors the Phaser version: a tinted background sprite (squareBg3.png), the readable
// token centered on top, an outline sprite when selected, and a scale-up when selected. Spellstone
// squares swap in the spellstone sprite + wildcard glyph. Geometry is expressed as factors of the
// runtime square `size`, matching GameConstants.Square.

import GameConstants from '../engine/GameConstants.js';
import LanguageTree from '../engine/LanguageTree.js';
import { Sprite } from './Sprite.jsx';

const SQ = GameConstants.Square;

export default function Square({ sq, size, onTap }) {
  const bg = SQ.ColorUnselectable; // (unused fallback; bgColor comes from the snapshot)
  const imgSize = size * SQ.ImageSquareSizeFactor; // 1.11 — slightly oversized, like the original
  const scale = sq.selected ? SQ.SquareScaleSelected : 1; // 1.25 when selected
  const fontSize = Math.round(size * SQ.TextSizeRatio); // 0.55

  const spellstone = sq.spellstone;
  const bgFile = spellstone ? GameConstants.SpellstoneSquare.Image.file : SQ.BgImage.file;
  const glyph = spellstone
    ? (sq.spellstoneReadableToken || LanguageTree.WildcardToken)
    : (sq.readableToken ?? '');

  // The visual (bg + text + outline) sits centered in the cell and scales as a unit; the cell's grid
  // slot itself never moves.
  return (
    <div
      onPointerDown={onTap ? (e) => { e.preventDefault(); onTap(sq.row, sq.column); } : undefined}
      style={{
        position: 'absolute',
        left: sq.column * size,
        top: sq.row * size,
        width: size,
        height: size,
        // Selected/hinted tiles ride above the connector layer (z 3) so their glyph stays visible
        // (the dot/line paints behind them); plain tiles sit below it so the path segments show in
        // the gaps between the highlighted tiles.
        zIndex: sq.selected || sq.hinted ? 4 : 2,
        cursor: sq.selectable || sq.selected ? 'pointer' : 'default',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${scale})`,
          transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Background tile */}
        <Sprite
          file={bgFile}
          w={imgSize}
          h={imgSize}
          color={sq.bgColor ?? bg}
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        />
        {/* Outline: matches the tile color when selected; orange hint ring when hinted. */}
        {(sq.selected || sq.hinted) && (
          <Sprite
            file={SQ.OutlineImage.file}
            w={imgSize}
            h={imgSize}
            color={sq.selected ? (sq.bgColor ?? bg) : SQ.ColorHinted}
            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
          />
        )}
        {/* Token glyph */}
        <span
          style={{
            position: 'relative',
            fontFamily: 'var(--font-token)',
            fontSize,
            lineHeight: 1,
            color: spellstone ? GameConstants.SpellstoneSquare.TextColor : (sq.fgColor ?? '#000'),
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          {glyph}
        </span>
      </div>
    </div>
  );
}

// The fixed UI chrome overlaid on the (scrolling) cave: depth/level stats, the typed-word + bonus
// message, and the bottom button bar (dig / hint / spellstone). Positions follow the Phaser
// *GridRatio constants, applied against the cave's pixel width/height. This layer does not scroll.

import GameConstants from '../engine/GameConstants.js';
import { Sprite, ColoredText } from './Sprite.jsx';

const DIG = GameConstants.DigButton;
const HINT = GameConstants.HintButton;
const STONE = GameConstants.SpellstoneButton;
const STATS = GameConstants.Stats;
const MSG = GameConstants.DigButton.Message;

// Build the per-character colored segments for the typed word straight from the selected squares
// (spellstone letters get their own color), instead of round-tripping a {COLOR=n} string.
function typedWordSegments(squares, valid) {
  const wordColor = valid ? MSG.TextColorWordValid : MSG.TextColorWordInvalid;
  const stoneColor = valid ? MSG.TextColorWordValidSpellstone : MSG.TextColorWordInvalidSpellstone;
  return squares
    .filter((s) => s.selected)
    .sort((a, b) => a.selectedIndex - b.selectedIndex)
    .map((s) => ({
      text: (s.spellstone ? (s.spellstoneReadableToken || '?') : s.readableToken) || '',
      color: s.spellstone ? stoneColor : wordColor,
    }));
}

function bonusTags(bonus, valid) {
  if (!valid) return [];
  const tags = [];
  if (bonus.bonusLong) tags.push(`LENGTH +${bonus.bonusLong}`);
  if (bonus.bonusRare) tags.push(`RARE +${bonus.bonusRare}`);
  return tags;
}

function IconButton({ file, size, color, disabled, value, valueColor, valueSize, onClick, title }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'auto', // re-enable inside the pointer-transparent bar wrapper
      }}
    >
      <Sprite file={file} w={size} h={size} color={color} style={{ position: 'absolute', inset: 0 }} />
      {value != null && (
        <span
          style={{
            position: 'relative',
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            fontSize: valueSize,
            color: valueColor,
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {value}
        </span>
      )}
    </button>
  );
}

export default function Chrome({ snapshot, width, height, onDig, onHint }) {
  const { typedWord, squares, movesLeft, hintsLeft, spellstonesLeft, currentLevel, maxDugRow } = snapshot;
  const valid = !!typedWord?.valid;
  const hasWord = (typedWord?.keys?.length ?? 0) > 0;

  const canDig = valid && snapshot.readyForInput;
  const canHint = (hintsLeft ?? 0) > 0 && snapshot.readyForInput;

  const wordSegments = typedWordSegments(squares, valid);
  const tags = bonusTags(typedWord?.bonus ?? {}, valid);

  // Anchor points (px) from the grid ratios.
  const digX = DIG.XPositionGridRatio * width;
  const digY = DIG.YPositionGridRatio * height;
  const wordY = digY + MSG.TextYOffsetWord * width;
  const tagY = digY + MSG.TextYOffsetTag * width;

  const statColor = STATS.TextColors[1];
  const statSize = Math.round(STATS.TextSize * width);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Bottom darkening gradient so the chrome reads over the cave. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: height * GameConstants.Gradient.VerticalRatioBottom,
          background: 'linear-gradient(to top, rgba(8,8,10,0.96) 30%, rgba(8,8,10,0))',
        }}
      />

      {/* Stats: level + depth, bottom-left. */}
      <div
        style={{
          position: 'absolute',
          left: STATS.XPositionGridRatio * width,
          top: STATS.YPositionGridRatioLevel * height,
          fontFamily: 'var(--font-ui)',
          fontWeight: 600,
          fontSize: statSize,
          color: statColor,
          letterSpacing: 1,
          lineHeight: 1.25,
        }}
      >
        <div>LEVEL {(currentLevel ?? 0) + 1}</div>
        <div style={{ color: STATS.TextColors[0] }}>DEPTH {Math.max(0, maxDugRow ?? 0)}</div>
      </div>

      {/* Typed word + bonus tags, above the dig button. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: tagY,
          textAlign: 'center',
          fontFamily: 'var(--font-ui)',
          fontWeight: 600,
          fontSize: Math.round(MSG.TextSizeTag * width),
          color: valid ? MSG.TextColorTagValid : MSG.TextColorTagInvalid,
          lineHeight: 1.2,
          letterSpacing: 1,
        }}
      >
        {tags.map((t, i) => (
          <div key={i}>{t}</div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: wordY,
          textAlign: 'center',
          fontFamily: 'var(--font-token)',
          fontSize: Math.round(MSG.TextSizeWord * width),
          lineHeight: 1,
          textTransform: 'uppercase',
          letterSpacing: 2,
          transform: `scale(${valid ? MSG.TextScaleWordValid : MSG.TextScaleWordInvalid})`,
          transformOrigin: 'center bottom',
          transition: 'transform 120ms ease',
        }}
      >
        {hasWord && <ColoredText segments={wordSegments} />}
      </div>

      {/* Bottom button bar. The wrapper stays pointer-transparent (it spans the whole screen and
          would otherwise swallow taps meant for the cave); each button re-enables its own events. */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: digX, top: digY }}>
          <IconButton
            file={DIG.Image.file}
            size={DIG.Scale * width}
            color={canDig ? DIG.Color : DIG.ColorDisabled}
            disabled={!canDig}
            value={movesLeft}
            valueColor={DIG.TextColor}
            valueSize={Math.round(DIG.TextSize * width * 0.5)}
            onClick={onDig}
            title="Dig"
          />
        </div>
        <div style={{ position: 'absolute', left: HINT.XPositionGridRatio * width, top: HINT.YPositionGridRatio * height }}>
          <IconButton
            file={HINT.Image.file}
            size={HINT.Scale * width}
            color={canHint ? HINT.Color : HINT.ColorDisabled}
            disabled={!canHint}
            value={hintsLeft}
            valueColor={HINT.TextColor}
            valueSize={Math.round(HINT.TextSize * width * 0.6)}
            onClick={onHint}
            title="Hint"
          />
        </div>
        <div style={{ position: 'absolute', left: STONE.XPositionGridRatio * width, top: STONE.YPositionGridRatio * height }}>
          <IconButton
            file={STONE.Image.file}
            size={STONE.Scale * width}
            color={(spellstonesLeft ?? 0) > 0 ? STONE.Color : STONE.ColorDisabled}
            disabled
            value={spellstonesLeft}
            valueColor={STONE.TextColor}
            valueSize={Math.round(STONE.TextSize * width * 0.6)}
            title="Spellstone (coming soon)"
          />
        </div>
      </div>
    </div>
  );
}

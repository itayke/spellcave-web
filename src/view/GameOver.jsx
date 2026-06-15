// Game-over overlay: dimmer + skull + "GAME OVER" + run stats + replay. Shown when the engine's
// snapshot reports gameOver. Animations (the Phaser slide/scale-in sequence) are deferred to the
// animation phase; this is the faithful static composition.

import GameConstants from '../engine/GameConstants.js';
import { Sprite } from './Sprite.jsx';

const GO = GameConstants.GameOverScreen;

function Stat({ label, value, width }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: width * 0.02, alignItems: 'baseline' }}>
      <span style={{ color: GO.TextStatsColorKey, fontSize: GO.TextStatsSizeKeyGridRatio * width, fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ color: GO.TextStatsColorValue, fontSize: GO.TextStatsSizeValueGridRatio * width, fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
        {value}
      </span>
    </div>
  );
}

export default function GameOver({ snapshot, width, height, onReplay }) {
  const { currentLevel, maxDugRow, numWords, bestWord } = snapshot;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `rgba(0,0,0,${GO.BlockerAlpha})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: height * 0.03,
        pointerEvents: 'auto',
        zIndex: 50,
      }}
    >
      <Sprite file={GO.SkullImage.file} w={GO.SkullSizeGridRatio * width} h={GO.SkullSizeGridRatio * width} color={GO.SkullColor} />
      <div
        style={{
          fontFamily: 'var(--font-ui)',
          fontWeight: 800,
          fontSize: GO.TextGameOverSizeGridRatio * width,
          color: GO.TextGameOverColor,
          letterSpacing: 2,
          textAlign: 'center',
          lineHeight: 1.1,
        }}
      >
        GAME OVER
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: height * 0.012 }}>
        <Stat label="LEVEL" value={(currentLevel ?? 0) + 1} width={width} />
        <Stat label="DEPTH" value={Math.max(0, maxDugRow ?? 0)} width={width} />
        <Stat label="WORDS" value={numWords ?? 0} width={width} />
        {bestWord && <Stat label="BEST" value={String(bestWord).toUpperCase()} width={width} />}
      </div>
      <button
        onClick={onReplay}
        style={{
          marginTop: height * 0.02,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-token)',
          fontSize: GO.ReplayButtonFontSizeGridRatio * width,
          color: GO.ReplayButtonTextColor,
          textTransform: 'uppercase',
          letterSpacing: 3,
        }}
      >
        Replay
      </button>
    </div>
  );
}

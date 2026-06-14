// New-engine self-golden for the de-Phasered Square (Phase 2).
//
// Unlike golden.mjs, this is NOT a cross-engine parity check: the old `src/game/Square.js`
// extends `Phaser.GameObjects.Container` and can't run headless, so there's no old-side
// instance to diff against. Instead this drives the *ported* Square through a fixed script of
// state transitions and captures its render snapshots, locking the state machine + connector
// geometry + color-from-state against a committed baseline. It is the regression net that keeps
// the upcoming Cave port from silently changing Square semantics.
//
// Deterministic by construction: fixed tokens, fixed positions, fixed SquareSize — no RNG.

const SQUARE_SIZE = 100; // fixed runtime square size so pixel-factor geometry is stable

export async function generateSquareGolden(engineDir, repoRoot) {
  const { default: LanguageTree } = await import(`${engineDir}/LanguageTree.js`);
  const { default: GameConstants } = await import(`${engineDir}/GameConstants.js`);
  const { default: Square } = await import(`${engineDir}/Square.js`);

  LanguageTree.OfflineFileRootPath = `${repoRoot}/public/`;
  LanguageTree.Debug = 0;
  const lang = LanguageTree.GetInstance();
  const ok = await lang.initialize('en', true);
  if (!ok) throw new Error(`engine at ${engineDir} failed to initialize`);

  GameConstants.SquareSize = SQUARE_SIZE;

  // Minimal logical cave: provides the language tree and the selection/hint chains Square reads.
  const cave = {
    languageTree: lang,
    typedWordSquares: [],
    hintedSquares: [],
    deleteSquare() {},
  };

  // 3x3 grid of squares with fixed tokens.
  const tokens = [
    ['C', 'A', 'T'],
    ['S', 'E', 'R'],
    ['O', 'L', 'I'],
  ];
  const grid = [];
  for (let row = 0; row < 3; row++) {
    grid[row] = [];
    for (let col = 0; col < 3; col++) {
      const sq = new Square(cave);
      sq.initialize(tokens[row][col], row, col, 0);
      grid[row][col] = sq;
    }
  }
  const flat = () => grid.flat().map(s => s.getSnapshot());

  const out = {};

  // 1. Initial state — all unselectable.
  out.initial = flat();

  // 2. Mark the diagonal + a vertical neighbour selectable.
  for (const [r, c] of [[0, 0], [1, 1], [2, 1], [0, 2], [1, 2]])
    grid[r][c].setSelectable(true);
  for (const row of grid) for (const sq of row) sq.updateVisualState(false);
  out.selectable = flat();

  // 3. Build a selection chain: (0,0) -> (1,1) diagonal -> (2,1) vertical.
  const chain = [grid[0][0], grid[1][1], grid[2][1]];
  cave.typedWordSquares = chain;
  chain.forEach((sq, i) => sq.selectSquare(true, 0, i));
  out.selectedChain = chain.map(s => s.getSnapshot());

  // 4. Validate the selection.
  chain.forEach(sq => sq.setValidToken(sq.token));
  chain.forEach(sq => sq.updateVisualState(false));
  out.selectedValid = chain.map(s => s.getSnapshot());

  // 5. Deselect the chain.
  chain.forEach(sq => { sq.setValidToken(null); sq.selectSquare(false); });
  cave.typedWordSquares = [];
  out.deselected = chain.map(s => s.getSnapshot());

  // 6. Hint chain on the right column: (0,2) -> (1,2).
  const hints = [grid[0][2], grid[1][2]];
  cave.hintedSquares = hints;
  hints.forEach((sq, i) => { sq.setHasHint(true, i); sq.setHintLongest(3 + i); sq.updateVisualState(false); });
  out.hinted = hints.map(s => s.getSnapshot());

  // 7. Spellstone: mark (2,2)-ish (use (0,1)), select it, give it a wildcard token, validate.
  const stone = grid[0][1];
  stone.setSpellstone(true);
  cave.typedWordSquares = [stone];
  stone.selectSquare(true, 0, 0);
  stone.setValidToken('A');
  stone.updateVisualState(false);
  out.spellstone = [stone.getSnapshot()];

  // 8. Dig a square — becomes inactive/dug.
  const dug = grid[2][0];
  dug.digSquare();
  out.dug = [dug.getSnapshot()];

  // Static color-math determinism (verbatim from the Phaser version).
  out.colorMath = {
    saturateSelected: Square.SaturateHex('#ff7011', GameConstants.SquareLine.ColorSaturate),
    saturateValid: Square.SaturateHex('#88ff00', GameConstants.SquareLine.ColorSaturateValid),
    desaturate: Square.SaturateHex('#d7d6d3', -0.5),
    rgb256: Square.GetRGB256FromColor(0xff7011),
    fromRgb: Square.GetColorFromRGB256(255, 112, 17),
    easeOutBack: [0, 0.25, 0.5, 0.75, 1].map(Square.EaseOutBackExtreme),
  };

  // Serialize/deserialize round trip.
  out.serialize = [[0, 0], [12, 2], [3, 25]].map(([r, c]) => {
    const name = Square.SerializeFromRowColumn(r, c);
    return { name, back: Square.DeserializeToRowColumn(name) };
  });

  return out;
}

// New-engine self-golden for the de-Phasered Cave (Phase 2).
//
// Like square-golden.mjs (and unlike the cross-engine golden.mjs), there is no headless old-side
// counterpart: the original Cave extends Phaser.GameObjects.Container and needs a scene. So this
// locks the *ported* Cave against a committed baseline. The high-value piece is **seeded grid
// generation**: Cave drives the same seeded RNG + LanguageTree the cross-engine harness already
// proved byte-identical, so a correct port yields one specific grid for CaveData.Default.Seed.
// This snapshots that grid plus a scripted selection / deselection / dig to exercise the state
// machine end to end.
//
// Fully deterministic: fixed SquareSize + view height fix the generated row range; generation
// uses only the seeded RNG (never Math.random). We deliberately do NOT call startGame() /
// checkAvailableWords() / calcShowHint(), whose hint shuffling uses Math.random.

const SQUARE_SIZE = 50;
const VIEW_HEIGHT = 700; // 14 visible rows at this square size

export async function generateCaveGolden(engineDir, repoRoot) {
  const { default: LanguageTree } = await import(`${engineDir}/LanguageTree.js`);
  const { default: GameConstants } = await import(`${engineDir}/GameConstants.js`);
  const { default: GameManager } = await import(`${engineDir}/GameManager.js`);
  const { default: Cave } = await import(`${engineDir}/Cave.js`);

  LanguageTree.OfflineFileRootPath = `${repoRoot}/public/`;
  LanguageTree.Debug = 0;
  GameManager.Debug = 0; // Cave logs verbosely at Debug>=1; keep the harness quiet + deterministic
  const lang = LanguageTree.GetInstance();
  const ok = await lang.initialize('en', true);
  if (!ok) throw new Error(`engine at ${engineDir} failed to initialize`);

  // Fixed runtime sizing so the generated row range is deterministic.
  GameConstants.SquareSize = SQUARE_SIZE;

  const cave = new Cave({ width: GameConstants.Cave.GridColumns * SQUARE_SIZE, height: VIEW_HEIGHT });
  // resetSavedGame=true → build fresh from CaveData.Default (ignore any in-memory saved state).
  cave.initialize(null, true);

  const out = {};

  // 1. Seeded grid generation — the parity centerpiece. Tokens for every populated row.
  out.grid = cave.getTokenGrid(0, cave.maxPopulatedRow);

  // 2. Generation bookkeeping.
  out.generation = {
    minRow: cave.minRow,
    minScreenRow: cave.minScreenRow,
    maxRow: cave.maxRow,
    maxPopulatedRow: cave.maxPopulatedRow,
    actualRowsOnScreen: cave.actualRowsOnScreen,
    scrollY: cave.scrollY,
    levelLineRows: Array.from(cave.levelEndImageDataPerRow.keys()).sort((a, b) => a - b),
  };

  // 3. Selectable squares after init (no word typed) — first row should be fully open.
  out.selectableAfterInit = Array.from(cave.selectableSquares)
    .map(sq => sq.serializedRowColumn).sort();

  // 4. Scripted selection of a vertical path down column 0 (rows 0,1,2 are fully populated).
  const path = [[0, 0], [1, 0], [2, 0]];
  for (const [r, c] of path)
    cave.selectSquare(cave.getSquareAt(r, c), true);

  out.afterSelect = {
    typedWord: cave.getSnapshot().typedWord,
    selectedSquares: path.map(([r, c]) => cave.getSquareAt(r, c).getSnapshot()),
    selectableNext: Array.from(cave.selectableSquares).map(sq => sq.serializedRowColumn).sort(),
  };

  // 5. Deselect everything after the first square (tail removal).
  cave.deselectAfterSquare(cave.getSquareAt(0, 0));
  out.afterDeselect = {
    typedWord: cave.getSnapshot().typedWord,
    selected: [0, 1, 2].map(r => cave.getSquareAt(r, 0)?.isSelected() ?? null),
  };

  // 6. Dig the path (synchronous grid mutation core, no async finalize). Squares leave the grid.
  const digKeys = path.map(([r, c]) => cave.getSquareAt(r, c)).filter(Boolean)
    .map(sq => sq.serializedRowColumn);
  cave.digWordSquares(path.map(([r, c]) => cave.getSquareAt(r, c)).filter(Boolean));
  out.afterDig = {
    requestedKeys: digKeys,
    dugSquares: Array.from(cave.dugSerializedSquares).sort(),
    gridCleared: path.map(([r, c]) => cave.getSquareAt(r, c) === null),
  };

  // 7. Static helpers (verbatim from the Phaser version).
  out.helpers = {
    parseColor: ['#ff7011', '#abc', 'nope'].map(s => Cave.ParseColorFromString(s)),
    curveQuad: [0, 0.25, 0.5, 0.75, 1].map(t => Cave.CurveQuad(t, 0.35, 1.6)),
    levelFromRow: [0, 9, 10, 19, 20, 25].map(r => cave.getLevelFromRow(r)),
  };

  return out;
}

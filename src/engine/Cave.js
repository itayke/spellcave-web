// Cave — the board of Squares: grid generation, selection/typing state machine, hint search,
// digging, scrolling, and save/load.
//
// MIGRATION NOTE (Phaser -> HTML/React): this is the de-Phasered model. The original
// `src/game/Cave.js` extended `Phaser.GameObjects.Container` and fused the game model with the
// Phaser scene graph (nested containers + images), tween animations, pointer/wheel/keyboard
// input, and direct CaveUI mutation. This version is a plain class. What changed:
//
//   - No `extends Phaser.GameObjects.Container`; constructor takes a plain options object, not a
//     scene. All `scene.add.*` image/container creation is gone — squares live only in the
//     `squareLines` grid, and the view renders from `getSnapshot()`.
//   - The Phaser container's `this.y` scroll offset became plain `this.scrollY` (pixels). Scroll
//     methods update state synchronously; tweens move to the view (WAAPI/CSS) — Phase 6.
//   - Every `this.caveUI.*` call goes through `this.ui`, a recursive no-op proxy by default. The
//     Zustand store / React UI installs a real implementation in Phase 3/4. The engine runs
//     headless against the no-op.
//   - `localStorage` became the injectable `this.storage` (in-memory by default).
//   - Raw pointer/wheel/keyboard handlers (`onPointerDown/Move/Up`, hit-testing, swipe diamond
//     math) are NOT ported here — input is Phase 5. The decision logic they fed (select /
//     deselect / scroll) is reachable via `selectSquare`, `deselectAfterSquare`, `scrollCave`,
//     `finalizeMouseUp`, which the input layer will drive with resolved grid coordinates.
//
// Grid generation is fully seed-deterministic (uses the seeded `#randomTokenFunction`, never
// `Math.random`), so it is the high-value, harness-verifiable core (see harness/cave-golden.mjs).

import Square from './Square.js';
import GameManager from './GameManager.js';
import HashManager from './HashManager.js';
import LanguageTree from './LanguageTree.js';
import GameConstants from './GameConstants.js';
import CaveData from './CaveData.js';

// Recursive no-op stand-in for the not-yet-ported CaveUI. Any property access returns the same
// callable, and any call returns undefined — so `this.ui.digStateScreen.digButton?.setX(...)`
// is safe and inert. The store/UI layer replaces `cave.ui` with a real object in a later phase.
const NULL_UI = new Proxy(function () {}, {
  get: () => NULL_UI,
  apply: () => undefined,
});

// Minimal in-memory localStorage stand-in (getItem/setItem/removeItem) for headless use.
function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// A board of Squares
export default class Cave {

  caveName = 'Default';

  // Function that returns a deterministic random number based on provided seed4
  #randomTokenFunction;

  // Data related to available/hint words (see calculateAvailableWords)
  #availableWordsData;

  // Number of rows that have been dug
  actualRowsOnScreen = 0;
  // Minimum (top) row held in squareLines
  minRow = -GameConstants.Cave.ScrollAboveMaxDugRow - GameConstants.Cave.ScrollSpringOver;
  // Top visible (scroll) row presented on screen
  minScreenRow = 0;
  // Maximum row fully ready to use on the grid
  maxRow = 0;
  // Maximum row that has been populated with squares (follows maxRow)
  maxPopulatedRow = -1;

  // Level of the cave
  currentLevel = 0;

  // Serializeable object with current state
  currentStateObject = {};

  // Input actions allowed
  readyForInput = false;

  // Spellstone choice state. If null, not in choice. If in choice: { chosenSquare: <square>|null }
  spellstoneChoice = null;

  // Hints currently being calculated
  hintsCalculated = false;

  // Lowest row that has been dug (-1 if none)
  maxDugRow = -1;

  // max/min selected (typed) row
  maxSelectedRow = -1;
  minSelectedRow = Number.MAX_SAFE_INTEGER;

  // Vertical scroll offset in pixels (was the Phaser container's `this.y`). Negative scrolls down.
  scrollY = 0;

  // Map of square lines by row. Each line is an array of squares: { <row>: [ sq0, sq1, ... ] }
  squareLines = new Map();
  // Set of dug squares in serialized notation (e.g. 12c)
  dugSerializedSquares = new Set();
  // Selectable squares (Set of Square objs)
  selectableSquares = new Set();
  // Current hint or hinted squares
  hintedSquares = [];
  // Square updated and pending visual update. Map of square to delay in ms.
  squaresPendingUpdate = new Map();
  // Current word (list of Square objs)
  typedWordSquares = [];
  // String representation of the typed word square positions, e.g. '12c13c14c'
  typedWordSerializedSquares;
  // Information about bonuses in this word
  bonusData = {};
  // Currently typed word, formatted with colors if needed
  typedFormattedWord = '';

  // Hinted word maps (see original docs)
  hintedWordMap = null;
  hintedWordPresentedMap = null;

  // Whether the decorative top line exists (logical; the view renders it)
  hasTopLine = false;

  // languageTree reference
  languageTree;

  // For each level end: row -> { isComplete, overlaidColumns: bool[] }
  levelEndImageDataPerRow = new Map();
  nextLevelEndLineCreateIndex = 0;
  nextLevelEndLineCreate = 0;

  // options: { width, height, ui, storage }
  constructor(options = {}) {
    this.viewWidth = options.width ?? GameConstants.CaveWidth;
    this.viewHeight = options.height ?? (GameConstants.SquareSize * GameConstants.Cave.GridMinVisibleRows);
    this.ui = options.ui ?? NULL_UI;
    this.storage = options.storage ?? createMemoryStorage();

    this.languageTree = LanguageTree.GetInstance();

    this.actualRowsOnScreen = Math.ceil(
      (this.viewHeight - GameConstants.Cave.Padding.top - GameConstants.Cave.Padding.bottom) / GameConstants.SquareSize);
    this.maxRow = this.actualRowsOnScreen + GameConstants.Cave.ExtraRowsAfter;
  }

  initialize(ui = null, resetSavedGame = false) {
    if (ui)
      this.ui = ui;

    this.caveName = this.storage.getItem('CaveName') || this.caveName;
    let stateLoaded = resetSavedGame ? false : this.loadSavedState(this.caveName);

    resetSavedGame && this.removeSavedState(this.caveName);

    // Check for saved state or initialize new one
    if (!stateLoaded) {
      let caveData = CaveData[this.caveName];
      this.currentStateObject = {
        caveName: this.caveName,
        movesLeft: caveData.StartMoves ?? 10,
        hintsLeft: caveData.StartHints ?? 10,
        spellstonesLeft: caveData.StartSpellstones ?? 10,
        dugWords: [],
        spellstoneSquares: null,
        bestWordLength: 0,
        bestWord: null,
        numWords: 0,
        caveData: JSON.parse(JSON.stringify(caveData))
      };
    }

    let seed4 = this.currentStateObject.caveData?.Seed;

    if (!(seed4 && Array.isArray(seed4) && seed4.length == 4)) {
      seed4 = seed4 ? HashManager.GetSeed4FromString(seed4) : HashManager.GetRandomSeed4();
      this.currentStateObject.Seed = seed4;
    }

    this.#randomTokenFunction = HashManager.GetRandomFunction(seed4);

    if (GameManager.Debug)
      console.log(`Cave seed ${seed4}, square size ${GameConstants.SquareSize}`, this.currentStateObject.caveData);

    this.createTopLine();
    this.nextLevelEndLineCreateIndex = 0;
    this.nextLevelEndLineCreate = this.currentStateObject.caveData.LevelLengths?.[this.nextLevelEndLineCreateIndex++] ?? 10;

    const rowToScroll = this.maxDugRow - GameConstants.Cave.ScrollAboveMaxDugRow + 1;

    this.poolSquareExtend();
    this.scrollToRow(rowToScroll, 0, 0, true);

    stateLoaded && this.loadSavedStateFinalize();

    this.removeSquaresAboveTop();
    this.resetTyping();
    this.updateSelectableSquares();
    this.updatePendingSquares(false);
  }

  startGame() {
    this.ui.startGame();
    this.startMove(false);
    this.checkAvailableWords().then(() => {
      this.readyForInput = true;
    });
    this.updatePendingSquares(false);
  }

  startMove(animate = true) {
    this.updateTypedWord(animate);
    this.ui.startMove(animate);
  }

  async checkAvailableWords() {
    this.#availableWordsData = null;
    return new Promise((resolve) => {
      if (this.hintedWordMap?.has('')) {
        if (GameManager.Debug) console.log('Already have hints', this.hintedWordMap);
        resolve();
        return;
      }

      this.getAllAvailableWords('', [], // No prefix
        this.selectableSquares,
        1, // Ensuring at least 1 word exists
        () => { if (GameManager.Debug) console.log('No words available'); resolve(); },
        () => { if (GameManager.Debug) console.log('Words available'); resolve(); }
      );
    });
  }

  resetTyping() {
    this.typedWordSquares = [];
    this.typedWordSerializedSquares = '';
    this.maxSelectedRow = -1;
    this.minSelectedRow = Number.MAX_SAFE_INTEGER;

    this.bonusData = { bonusLong: 0, bonusRare: 0, bonusTotal: 0, topLength: 0 };
  }

  destroy() {
    this.squareLines = null;
    this.dugSerializedSquares = null;
  }

  getSquareAt = (row, column) => this.squareLines.get(row)?.[column] ?? null;
  getSquareBySerializedPosition = (pos) => {
    const { row, column } = Square.DeserializeToRowColumn(pos);
    return this.getSquareAt(row, column);
  }
  getTokenAt = (row, column) => this.getSquareAt(row, column)?.getToken() ?? null;

  // Create a new word of specified token length on grid starting at the specified row, going down
  createRandomVerticalWordOnGrid(row, length, randomFunc) {
    let word = this.languageTree.getRandomWord(length, randomFunc);
    if (!word)
      return null;

    let tokensLeft = word;
    let column = 0;

    for (let tokenIndex = 0; tokensLeft.length; tokenIndex++, row++) {
      let token = this.languageTree.getNextGameToken(tokensLeft);
      if (!token)
        break;

      tokensLeft = tokensLeft.substring(token.length);

      if (row < 0)
        continue;

      let level = this.getLevelFromRow(row);
      let lineSquares = this.getOrCreateSquareLine(row);

      let minCol = tokenIndex ? Math.max(0, column - 1) : 0;
      let maxCol = tokenIndex ? Math.min(GameConstants.Cave.GridColumns - 1, column + 1) : (GameConstants.Cave.GridColumns - 1);

      let found = false;
      let limit = maxCol - minCol + 1;

      let randomColOffset = Math.floor(randomFunc() * limit);

      // First attempt to find a column already populated with this token to reuse it
      for (let attempt = 0; attempt < limit; attempt++) {
        let newColumn = minCol + (randomColOffset + attempt) % limit;
        if (lineSquares[newColumn]?.getToken() == token) {
          column = newColumn;
          found = true;
          break;
        }
      }

      // If not found, find an empty square
      if (!found) {
        for (let attempt = 0; attempt < limit; attempt++) {
          let newColumn = minCol + (randomColOffset + attempt) % limit;
          if (!lineSquares[newColumn]) {
            column = newColumn;
            break;
          }
        }
      }

      if (column < 0) {
        console.log(`No column found for token ${token} (${tokenIndex})`);
        return null;
      }

      if (!lineSquares[column]) {
        let newSquare = this.poolSquareGet();
        if (!newSquare) {
          console.error('No square in pool');
          return null;
        }
        newSquare.initialize(token, row, column, level);
        lineSquares[column] = newSquare;
        if (GameManager.Debug >= 2)
          console.log(`${row},${column} WORD token ${token} word ${word}`);
      }
    }
    return word;
  }

  getLevelFromRow(row) {
    const arr = this.currentStateObject.caveData.LevelLengths;
    for (let index = 0, len = arr.length; index < len; index++) {
      const length = arr[index];
      if (row < length)
        return index;
      row -= length;
    }
    return 0;
  }

  // Returns a list of rows that are incomplete (not yet passed) up to the specified row
  getIncompleteLevelLinesAtRow(row) {
    const incompleteLevels = [];
    for (const [levelRow, data] of this.levelEndImageDataPerRow)
      if (levelRow <= row && !data.isComplete)
        incompleteLevels.push(levelRow);
    return incompleteLevels;
  }

  // Logical only — the decorative grass top line is rendered by the view.
  createTopLine() {
    this.hasTopLine = true;
  }

  // Create squares from the max populated row to the max row
  createSquares() {
    if (this.maxPopulatedRow >= this.maxRow)
      return;

    if (GameManager.Debug) console.time('createRandomVerticalWordOnGrid');

    // If this is the first row, go back to negative word length
    let row = this.maxPopulatedRow > 0 ?
      (this.maxPopulatedRow + 1) :
      ((1 - (Array.isArray(GameConstants.Cave.PopulateWordsLength) ? GameConstants.Cave.PopulateWordsLength[0] : GameConstants.Cave.PopulateWordsLength)));

    for (; row <= this.maxRow; row++) {

      // Check if this is an end-level line
      if (row == this.nextLevelEndLineCreate) {
        this.createLevelEnd(row);
        if (this.nextLevelEndLineCreateIndex < this.currentStateObject.caveData.LevelLengths.length)
          this.nextLevelEndLineCreate += this.currentStateObject.caveData.LevelLengths[this.nextLevelEndLineCreateIndex++];
      }

      // populateWordsPerRow: number as-is, or rotate first element of array
      let populateWordsPerRow = GameConstants.Cave.PopulateWordsPerRow ?? 0;
      if (Array.isArray(GameConstants.Cave.PopulateWordsPerRow)) {
        populateWordsPerRow = GameConstants.Cave.PopulateWordsPerRow.shift();
        GameConstants.Cave.PopulateWordsPerRow.push(populateWordsPerRow);
      }

      // Create random words of the specified length
      for (let i = 0; i < populateWordsPerRow; i++) {
        let wordLength = GameConstants.Cave.PopulateWordsLength;
        if (Array.isArray(GameConstants.Cave.PopulateWordsLength)) {
          wordLength = GameConstants.Cave.PopulateWordsLength.shift();
          GameConstants.Cave.PopulateWordsLength.push(wordLength);
        }

        if (row + wordLength <= 0)
          continue;

        let word = this.createRandomVerticalWordOnGrid(row, wordLength, this.#randomTokenFunction);
        if (GameManager.Debug >= 2)
          console.log(`Random word at row ${row} #${i}: ${word}`);
      }

      if (row < 0)
        continue;

      let level = this.getLevelFromRow(row);
      let squareLine = this.getOrCreateSquareLine(row);

      // Add random tokens to the empty cells in the row
      for (let col = 0; col < GameConstants.Cave.GridColumns; col++) {
        if (squareLine[col])
          continue;

        // Get all existing tokens around the square
        let prevTokensList = [];
        let tok;
        (tok = this.getTokenAt(row - 1, col - 1)) && prevTokensList.push(tok);
        (tok = this.getTokenAt(row - 1, col)) && prevTokensList.push(tok);
        (tok = this.getTokenAt(row - 1, col + 1)) && prevTokensList.push(tok);
        (tok = this.getTokenAt(row, col - 1)) && prevTokensList.push(tok);
        (tok = this.getTokenAt(row, col + 1)) && prevTokensList.push(tok);
        (tok = this.getTokenAt(row + 1, col - 1)) && prevTokensList.push(tok);
        (tok = this.getTokenAt(row + 1, col)) && prevTokensList.push(tok);
        (tok = this.getTokenAt(row + 1, col + 1)) && prevTokensList.push(tok);

        let token = this.languageTree.randomizeTokenExtraProbs(
          prevTokensList,
          GameConstants.Cave.AdjacentTokenRepeatWeight,
          GameConstants.Cave.LanguageTokenVsRandomProbabilityScale,
          this.#randomTokenFunction
        );

        if (GameManager.Debug >= 2)
          console.log(`${row},${col} filler token ${token}`);

        let square = this.poolSquareGet();
        if (!square) {
          console.error('No square in pool');
          return;
        }
        square.initialize(token, row, col, level);
        squareLine[col] = square;
      }
    }

    if (GameManager.Debug) console.timeEnd('createRandomVerticalWordOnGrid');
    this.maxPopulatedRow = this.maxRow;

    if (GameManager.Debug >= 2)
      this.traceCaveTokens();
  }

  removeSquaresAboveTop() {
    const row = this.minScreenRow - GameConstants.Cave.ExtraRowsBefore - GameConstants.Cave.ScrollSpringOver;
    if (row <= this.minRow)
      return;

    for (let i = this.minRow; i < row; i++) {
      let line = this.squareLines.get(i);
      if (line) {
        line.forEach(sq => {
          if (sq) {
            this.squaresPendingUpdate.delete(sq);
            this.dugSerializedSquares.delete(sq.serializedRowColumn);
            sq.destruct();
          }
        });
        this.squareLines.delete(i);
      }
      this.removeLevelEnd(i);
    }

    // Remove top line
    if (row > 0 && this.minRow <= 0 && this.hasTopLine) {
      if (GameManager.Debug) console.log(`Removing top line`, this.minRow, row);
      this.hasTopLine = false;
    }

    if (GameManager.Debug) console.log(`Removed ${row - this.minRow} squares before row ${row}`);
    this.minRow = row;
  }

  //
  //  Level-end lines (logical; the view renders them from levelEndImageDataPerRow)
  //

  createLevelEnd(row) {
    if (GameManager.Debug) console.log(`---- level end at row ${row}`);
    this.levelEndImageDataPerRow.set(row, {
      isComplete: false,
      overlaidColumns: new Array(GameConstants.Cave.GridColumns).fill(false)
    });
  }

  removeLevelEnd(row) {
    this.levelEndImageDataPerRow.delete(row);
  }

  overlayLevelEndColumn(row, column) {
    let data = this.levelEndImageDataPerRow.get(row);
    if (!data || data.overlaidColumns[column])
      return;
    data.overlaidColumns[column] = true;
  }

  levelEndComplete(row) {
    let data = this.levelEndImageDataPerRow.get(row);
    if (!data)
      return;
    data.isComplete = true;
  }

  updateCompletedLevels() {
    const incompleteLevels = this.getIncompleteLevelLinesAtRow(this.maxDugRow + 1);
    incompleteLevels?.forEach(line => this.levelEndComplete(line));
  }

  //
  //  Selectable squares
  //

  updateSelectableSquares() {
    if (this.typedWordSquares.length) {
      const lastSq = this.typedWordSquares[this.typedWordSquares.length - 1];
      this.updateSelectableSquaresAround(lastSq);
    }
    else {
      this.updateSelectableSquaresNoWord();
    }
  }

  setSquareSelectable(row, column) {
    if (row < this.minScreenRow - GameConstants.Cave.ScrollSpringOver)
      return;
    let sq = this.getSquareAt(row, column);
    if (!sq || sq.isSelected() || sq.isDug())
      return;

    sq.setSelectable() &&
      !this.squaresPendingUpdate.has(sq) &&
      this.squaresPendingUpdate.set(sq, 0);

    this.selectableSquares.add(sq);
  }

  updateSelectableSquaresNoWord() {
    this.selectableSquares.clear();

    // First row always open
    for (let i = 0; i < GameConstants.Cave.GridColumns; ++i)
      this.setSquareSelectable(0, i);

    const minRow = Math.max(this.minScreenRow - GameConstants.Cave.ExtraRowsBefore - GameConstants.Cave.ScrollSpringOver, 0);

    // And around dug squares
    this.dugSerializedSquares.forEach(serializedRowColumn => {
      const { row, column } = Square.DeserializeToRowColumn(serializedRowColumn);
      if (row < minRow - 1)
        return;

      this.setSquareSelectable(row - 1, column - 1);
      this.setSquareSelectable(row - 1, column);
      this.setSquareSelectable(row - 1, column + 1);
      this.setSquareSelectable(row, column - 1);
      this.setSquareSelectable(row, column + 1);
      this.setSquareSelectable(row + 1, column - 1);
      this.setSquareSelectable(row + 1, column);
      this.setSquareSelectable(row + 1, column + 1);
    });
  }

  updateSelectableSquaresAround(sq) {
    this.selectableSquares.clear();

    const row = sq.row;
    const column = sq.column;

    this.setSquareSelectable(row - 1, column - 1);
    this.setSquareSelectable(row - 1, column);
    this.setSquareSelectable(row - 1, column + 1);
    this.setSquareSelectable(row, column - 1);
    this.setSquareSelectable(row, column + 1);
    this.setSquareSelectable(row + 1, column - 1);
    this.setSquareSelectable(row + 1, column);
    this.setSquareSelectable(row + 1, column + 1);
  }

  updateSelectableSquaresSpellstone() {
    const minRow = Math.max(this.minRow + GameConstants.Cave.ScrollSpringOver, 0);
    const maxRow = Math.max(this.maxDugRow, 0) - GameConstants.Cave.ExtraRowsBefore + this.actualRowsOnScreen - 1 - GameConstants.Cave.SpellstoneSelectionRowsFromBottom;

    const delayFreqMs = 20;
    let delay = 0;
    for (let row = minRow; row <= maxRow; row++) {
      let lineSquares = this.squareLines.get(row);
      if (!lineSquares)
        continue;

      for (let column = 0; column < GameConstants.Cave.GridColumns; column++) {
        let sq = lineSquares[column];
        if (!sq || sq.isDug() || sq.isSelectable())
          continue;

        sq.setSelectable(true) &&
          !this.squaresPendingUpdate.has(sq) &&
          this.squaresPendingUpdate.set(sq, delay + delayFreqMs * column);
        this.selectableSquares.add(sq);
      }
      delay += delayFreqMs;
    }
  }

  updatePendingSquares(animate = true, delay = 0) {
    for (const [sq, sqDelay] of this.squaresPendingUpdate)
      sq.updateVisualState(animate, delay + sqDelay);
    this.squaresPendingUpdate.clear();
  }

  traceCaveTokens() {
    console.log('Cave:');
    for (let row = this.minRow; row < this.maxPopulatedRow; row++) {
      let line = `${row}: `;
      for (let column = 0; column < GameConstants.Cave.GridColumns; column++)
        line += `${this.getTokenAt(row, column)} `;
      console.log(line);
    }
  }

  //
  //  Typing/selection
  //

  selectSquare(sq, select) {
    this.clearSelectableSquares();

    if (this.spellstoneChoice) {
      this.selectSpellstonePlacement(sq);
      return;
    }

    let lastTypedSquareIndex = this.typedWordSquares?.length ?? -1;
    if (sq.selectSquare(select, 0, lastTypedSquareIndex)) {
      if (select) {
        this.typedWordSquares.push(sq);
        if (sq.row > this.maxSelectedRow)
          this.maxSelectedRow = sq.row;
        if (sq.row < this.minSelectedRow)
          this.minSelectedRow = sq.row;

        this.typedWordSquares.forEach(sq =>
          this.squaresPendingUpdate.has(sq) || this.squaresPendingUpdate.set(sq, 0));
      }
      else if (this.typedWordSquares[this.typedWordSquares.length - 1] === sq) {
        this.typedWordSquares.forEach(sq =>
          this.squaresPendingUpdate.has(sq) || this.squaresPendingUpdate.set(sq, 0));

        this.typedWordSquares.pop();

        if (this.typedWordSquares.length === 0) {
          this.maxSelectedRow = -1;
          this.minSelectedRow = Number.MAX_SAFE_INTEGER;
        }
        else {
          if (this.maxSelectedRow === sq.row)
            this.maxSelectedRow = this.typedWordSquares.reduce((max, sq) => Math.max(max, sq.row), -1);
          if (this.minSelectedRow === sq.row)
            this.minSelectedRow = this.typedWordSquares.reduce((min, sq) => Math.min(min, sq.row), Number.MAX_SAFE_INTEGER);
        }
      }
    }

    this.updateSelectableSquares();
    this.updateTypedWord(true, 0); // no delay
    this.updatePendingSquares();
  }

  // Deselect all squares in the word after the specified one
  deselectAfterSquare(sq) {
    const index = this.typedWordSquares.indexOf(sq);
    if (index === -1) {
      console.error('Square not found in typed word squares');
      return -1;
    }

    if (index === this.typedWordSquares.length - 1)
      return 0;

    this.clearSelectableSquares();

    let numDeselect = this.typedWordSquares.length - index - 1;
    if (numDeselect) {
      let delayFreqMs = GameConstants.Cave.DelayFrequencyDeselect;
      for (let i = index + 1, delay = 0;
        i < this.typedWordSquares.length;
        i++, delayFreqMs *= GameConstants.Cave.DelayFrequencyDeselectFactor)
        this.typedWordSquares[i].selectSquare(false, delay += delayFreqMs);

      this.typedWordSquares.splice(index + 1);

      this.maxSelectedRow = this.typedWordSquares.reduce((max, sq) => Math.max(max, sq.row), -1);
      this.minSelectedRow = this.typedWordSquares.reduce((min, sq) => Math.min(min, sq.row), Number.MAX_SAFE_INTEGER);
    }

    this.updateSelectableSquares();
    this.updateTypedWord(0); // Immediate
    this.updatePendingSquares();

    return numDeselect;
  }

  clearSelectableSquares() {
    this.selectableSquares.forEach(sq =>
      sq.setSelectable(false) && this.squaresPendingUpdate.set(sq, 0));
    this.selectableSquares.clear();
  }

  clearHintedSquares() {
    this.hintedSquares.forEach(sq =>
      sq.setHasHint(false) && this.squaresPendingUpdate.set(sq, 0));
    this.hintedSquares.length = 0;
  }

  clearCalculatedHints() {
    this.hintedWordPresentedMap = null;
    this.hintedWordMap = null;
  }

  updateTypedWord(animate = true, delay = GameConstants.DigButton.Message.UpdateDelayInitial) {
    this.typedWordSerializedSquares = this.typedWordSquares.map(sq => sq.serializedRowColumn).join('');

    let tokenList = this.typedWordSquares.map(sq => sq.getToken());
    let validWordTokens = this.languageTree.getValidWildcardWordFromTokenList(tokenList);
    let valid = !!validWordTokens;
    if (GameManager.Debug && this.typedWordSquares.length)
      console.log(this.typedWordSquares.map(sq => sq.getToken()).join('-'), '->', validWordTokens);

    this.typedWordSquares.forEach((sq, index) =>
      sq.setValidToken(validWordTokens?.[index]) &&
      !this.squaresPendingUpdate.has(sq) &&
      this.squaresPendingUpdate.set(sq, 0));

    this.calculateBonusData();

    // The {COLOR=n}-tagged display string is a UI concern (Phase 4). The engine keeps the raw
    // readable word, which is what save state (bestWord / dugWords) records.
    this.typedFormattedWord = this.typedWordSquares.map(sq => sq.getReadableToken()).join('');
    this.ui.digStateScreen.updateTypedWord(this.typedWordSquares, valid, delay);

    if (!this.spellstoneChoice) {
      this.clearHintedSquares();

      if (GameConstants.Cave.HintNextLetters) {
        let presentedHintLetters = this.hintedWordMap?.get(this.typedWordSerializedSquares);
        if (presentedHintLetters)
          this.showHintNextSquares(presentedHintLetters);
        else
          this.clearHintMessage();
      }
      else {
        let presentedHint = this.hintedWordPresentedMap?.get(this.typedWordSerializedSquares);
        if (presentedHint)
          this.showHint(presentedHint, GameConstants.Cave.HintDisplayFrequencyPreShown);
        else
          this.updateHintMessageWord();
      }
    }

    this.ui.digStateScreen.hintButton?.setButtonEnabled(this.currentStateObject.hintsLeft > 0, animate, delay);
  }

  updateHintMessageNumHints(count, animate = true, delay = 0) {
    const message = !count ? null :
      count == 1 ? GameManager.FormatLocaleString('WORDS_AVAILABLE_1') :
        GameManager.FormatLocaleString('WORDS_AVAILABLE_FMT', { COUNT: count });
    this.ui.digStateScreen.updateHintMessage(message, GameConstants.HintButton.Message.TextColorHint, animate, delay);
  }

  updateHintMessageCalculating(frameNum, animate = false, delay = 0) {
    let framesPerChange = 5;
    let key = `WORDS_CALCULATING_${Math.floor(frameNum % (framesPerChange * 3) / framesPerChange)}`;
    const message = GameManager.FormatLocaleString(key);
    this.ui.digStateScreen.updateHintMessage(message, GameConstants.HintButton.Message.TextColorHint, animate, delay);
  }

  updateHintMessageWord(word, animate = true, delay = 0) {
    this.ui.digStateScreen.updateHintMessage(word, GameConstants.HintButton.Message.TextColorHint, animate, delay);
  }

  updateHintMessageNoWordsAvailable(animate = true, delay = 0) {
    const message = GameManager.FormatLocaleString('WORDS_NOT_AVAILABLE');
    this.ui.digStateScreen.updateHintMessage(message, GameConstants.HintButton.Message.TextColorNoHint, animate, delay);
  }

  clearHintMessage(animate = true, delay = 0) {
    this.ui.digStateScreen.updateHintMessage(null, null, animate, delay);
  }

  // Asynchronous processing of all available words. (Pure search; no rendering.)
  async calculateAvailableWords(key, prefixSquaresList, nextSquaresSet, maxWords, onComplete, onIncomplete, onFrame, maxTimePerFrame = 50) {

    if (!this.#availableWordsData || this.#availableWordsData.key !== key) {
      this.#availableWordsData = {
        key: key,
        wordMap: new Map(),
        squarePositionsToWords: new Map(),
        processingStack: []
      };
    }

    maxWords = maxWords || Number.MAX_SAFE_INTEGER;

    const getAdjacentSquares = (sq, sqVisitedSet) => {
      let row = sq.row;
      let column = sq.column;
      let adjacentSquares = new Set();
      let adjSq;
      adjSq = this.getSquareAt(row - 1, column - 1); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      adjSq = this.getSquareAt(row - 1, column); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      adjSq = this.getSquareAt(row - 1, column + 1); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      adjSq = this.getSquareAt(row, column - 1); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      adjSq = this.getSquareAt(row, column + 1); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      adjSq = this.getSquareAt(row + 1, column - 1); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      adjSq = this.getSquareAt(row + 1, column); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      adjSq = this.getSquareAt(row + 1, column + 1); if (adjSq && !sqVisitedSet?.has(adjSq)) adjacentSquares.add(adjSq);
      return adjacentSquares;
    }

    const processAvailableWords = () => {
      const startTime = performance.now();
      while (this.#availableWordsData.processingStack.length > 0) {
        const { prevSquares, newSquare, sqVisitedSet } = this.#availableWordsData.processingStack.pop();

        let newSquareList = [...prevSquares, newSquare];
        let newStr = newSquareList?.map(sq => sq.getToken()).join('');
        let partialWords = this.languageTree.getAllPartialWildcardWords(newStr);

        if (!partialWords || partialWords.size === 0)
          continue;

        let serializedRowColumns = newSquareList.map(sq => sq.serializedRowColumn).join('');

        partialWords?.forEach((partialOrValid, word) => {
          if (partialOrValid < 2)
            return;

          if (this.#availableWordsData.squarePositionsToWords.has(serializedRowColumns))
            return;

          let newMaxRow = -1;
          let anyBonus = false;
          newSquareList.forEach(sq => {
            newMaxRow = Math.max(newMaxRow, sq.row);
            if (sq.getTokenGroup())
              anyBonus = true;
          });

          // Word that doesn't dig down or carry a bonus
          if (newMaxRow <= this.maxDugRow && !anyBonus)
            return;

          let addWord = true;
          if (this.#availableWordsData.wordMap.has(word)) {
            let existingSqList = this.#availableWordsData.wordMap.get(word);
            let maxRow = Math.max(...existingSqList.map(sq => sq.row));
            if (newMaxRow > maxRow)
              this.#availableWordsData.wordMap.delete(word);
            else
              addWord = false;
          }
          if (addWord) {
            this.#availableWordsData.wordMap.set(word, newSquareList);
            this.#availableWordsData.squarePositionsToWords.set(serializedRowColumns, word);

            for (let i = 1; i <= GameConstants.Cave.HintExtendLetters && i < word.length; i++) {
              let shorterWord = word.slice(0, -i);
              if (this.#availableWordsData.wordMap.has(shorterWord)) {
                this.#availableWordsData.wordMap.delete(shorterWord);
                break;
              }
            }
          }
        });

        let adjacentSquares = getAdjacentSquares(newSquare, sqVisitedSet);
        adjacentSquares.forEach(adjSq => {
          const sqVisitedSetPlusNewSq = new Set(sqVisitedSet);
          sqVisitedSetPlusNewSq.add(adjSq);
          this.#availableWordsData.processingStack.push({
            prevSquares: newSquareList,
            newSquare: adjSq,
            sqVisitedSet: sqVisitedSetPlusNewSq
          });
        });

        if (this.#availableWordsData.wordMap.size >= maxWords)
          return false;

        const curTime = performance.now();
        if (curTime - startTime >= maxTimePerFrame)
          break;
      }
      return this.#availableWordsData.processingStack.length > 0;
    }

    nextSquaresSet.forEach(sq => {
      let sqVisitedSetPlusNewSq = new Set(prefixSquaresList);
      if (sqVisitedSetPlusNewSq.has(sq))
        return;
      sqVisitedSetPlusNewSq.add(sq);
      this.#availableWordsData.processingStack.push({
        prevSquares: prefixSquaresList,
        newSquare: sq,
        sqVisitedSet: sqVisitedSetPlusNewSq
      });
    });

    let frameNum = 0;
    while (processAvailableWords()) {
      onFrame?.(this.#availableWordsData.wordMap, frameNum);
      await new Promise(resolve => setTimeout(resolve, 0));
      frameNum++;
    }

    if (!this.#availableWordsData.processingStack.length) {
      onComplete?.(this.#availableWordsData.wordMap);
      this.#availableWordsData = null;
    }
    else {
      onIncomplete?.(this.#availableWordsData.wordMap);
    }
  }

  // Asynchronously calculate all available words and prepare them for hints
  getAllAvailableWords(key, prefixSquaresList, nextSquaresSet, maxWords, onComplete, onIncomplete) {
    if (this.hintedWordMap?.has(key)) {
      console.log(`Error: Key '${key}' already has hints`, this.hintedWordMap.get(key));
      return;
    }

    this.hintsCalculated = true;

    this.calculateAvailableWords(
      key, prefixSquaresList, nextSquaresSet, maxWords,
      // On complete without hitting maxWords
      (wordMap) => {
        if (GameConstants.Cave.HintNextLetters) {
          let nextSquareMap = new Map();
          for (const [word, squares] of wordMap) {
            if (!squares?.length) continue;
            let nextSq = squares[prefixSquaresList?.length ?? 0];
            let entry = nextSquareMap.get(nextSq);
            if (!entry)
              nextSquareMap.set(nextSq, { words: [{ word, squares }], longest: squares.length });
            else {
              entry.words.push({ word, squares });
              entry.longest = Math.max(entry.longest, squares.length);
            }
          }
          const lists = [nextSquareMap, null];
          (this.hintedWordMap ??= new Map()).set(key, lists);
          onComplete?.(lists);
        }
        else {
          let hintsList = Array.from(wordMap.entries()).map(([word, squares]) => ({
            word,
            squares,
            lastRow: Math.max(...squares.map(sq => sq.row)),
            fudge: Math.random()
          }));

          hintsList.sort((a, b) => (b.lastRow - a.lastRow) || (b.fudge - a.fudge));

          const lists = [hintsList, null];
          (this.hintedWordMap ??= new Map()).set(key, lists);
          onComplete?.(lists);
        }

        this.hintsCalculated = false;
      },
      // On incomplete: maxWords reached
      (wordMap) => {
        onIncomplete?.();
        this.hintsCalculated = false;
      },
      // On frame, update calculating message
      (wordMap, frame) => {
        this.updateHintMessageCalculating(frame);
      }
    );
  }

  // Hint button clicked - calculate hints (if not already present) and show next hint
  calcShowHint() {
    if (this.hintsCalculated) {
      console.log(`Hints are already being calculated for ${this.typedWordSerializedSquares}`);
      return;
    }

    const finalize = async (hintButtonEnabled = false, delay = 0) => {
      this.saveState();
      if (delay > 0)
        await new Promise(resolve => setTimeout(resolve, delay));
      this.ui.digStateScreen.hintButton?.setButtonEnabled(hintButtonEnabled && this.currentStateObject.hintsLeft > 0);
      this.updateSelectableSquares();
      this.updatePendingSquares();
      this.readyForInput = true;
    };

    const setShowHint = (maps) =>
      GameConstants.Cave.HintNextLetters ? setShowHintNextLetters(maps) : setShowNextHint(maps);

    const setShowHintNextLetters = (nextSquareMaps) => {
      this.showHintNextSquares(nextSquareMaps[0]);
      finalize();
    };

    const setShowNextHint = (hintsLists) => {
      if (!(hintsLists?.length === 2)) {
        console.log(`Error getting hints for ${this.typedWordSerializedSquares}`, hintsLists);
        finalize();
        return;
      }

      let [unshownHints, shownHints] = hintsLists;

      if (!(unshownHints?.length) && !(shownHints?.length)) {
        this.updateHintMessageNoWordsAvailable();
        finalize();
        return;
      }

      let selectedHint = null;
      shownHints ??= (hintsLists[1] = []);

      if (unshownHints.length > 0) {
        const pos = Math.min(Math.floor(unshownHints.length * (1 - GameConstants.Cave.HintShowTopPercent)), unshownHints.length - 1);
        selectedHint = unshownHints.splice(pos, 1)[0];
        shownHints.push(selectedHint);
        this.ui.digStateScreen.hintButton?.setButtonTextValue(--this.currentStateObject.hintsLeft, true);
      }
      else {
        selectedHint = shownHints.shift();
        shownHints.push(selectedHint);
      }

      this.showHint(selectedHint);
      finalize(true);
    };

    if (this.hintedSquares?.length) {
      this.clearHintedSquares();
      this.updatePendingSquares(false);
    }

    if (this.hintedWordMap?.has(this.typedWordSerializedSquares)) {
      let hintsLists = this.hintedWordMap.get(this.typedWordSerializedSquares);
      setShowHint(hintsLists);
      return;
    }

    const nextSquaresSet = new Set(this.selectableSquares);
    this.clearSelectableSquares();
    this.readyForInput = false;

    this.getAllAvailableWords(
      this.typedWordSerializedSquares,
      [...this.typedWordSquares],
      nextSquaresSet,
      0, // No limit
      setShowHint
    );
  }

  // Set the presented hint with object { word, squares }
  setPresentedHint(selectedHint, startAt = 0) {
    this.hintedWordPresentedMap ??= new Map();
    let prefixPositions = '';
    selectedHint.squares.forEach((sq) => {
      this.hintedWordPresentedMap.set(prefixPositions, selectedHint);
      prefixPositions += sq.serializedRowColumn;
    });
  }

  // Show the hint for the selected word, object { word, squares }
  showHint(selectedHint, showFreq = GameConstants.Cave.HintDisplayFrequency, delay = 0) {
    this.updateHintMessageWord(selectedHint.word);
    this.setPresentedHint(selectedHint);

    selectedHint?.squares.forEach((sq, index) => {
      if (sq.setHasHint(true, index)) {
        this.hintedSquares.push(sq);
        this.squaresPendingUpdate.set(sq, delay);
        if (showFreq && !sq.isSelected())
          delay += showFreq;
      }
    });
  }

  showHintNextSquares(nextSquareMap, delay = 0) {
    let totalWords = 0;
    nextSquareMap.forEach((entry, sq) => {
      if (!sq.isSelected() && sq.setHasHint(true)) {
        sq.setHintLongest(entry.longest);
        this.hintedSquares.push(sq);
        this.squaresPendingUpdate.set(sq, delay);
        delay += GameConstants.Cave.HintDisplayNextFrequency;
        totalWords += entry.words.length;
      }
    });

    if (totalWords)
      this.updateHintMessageNumHints(totalWords);
    else
      this.updateHintMessageNoWordsAvailable();
  }

  getWordLengthThresholdIndex(length) {
    for (let i = 0; i < this.currentStateObject.caveData.WordLengthExtraMoves.length; i++) {
      if (length < this.currentStateObject.caveData.WordLengthExtraMoves[i])
        return i - 1;
    }
    return this.currentStateObject.caveData.WordLengthExtraMoves.length - 1;
  }

  //
  //  Spellstone
  //

  useSpellstone() {
    if (this.currentStateObject.spellstonesLeft <= 0)
      return;

    this.ui.setUIState('SPELLSTONE');
    this.spellstoneChoice = { chosenSquare: null };

    this.clearHintedSquares();
    this.updateSelectableSquaresSpellstone();
    this.updatePendingSquares();
  }

  selectSpellstonePlacement(sq) {
    if (!this.spellstoneChoice || !sq)
      return;

    this.spellstoneChoice.chosenSquare?.setSpellstone(false) &&
      this.squaresPendingUpdate.set(this.spellstoneChoice.chosenSquare, 0);

    sq.setSpellstone() &&
      this.squaresPendingUpdate.set(sq, 0);

    this.spellstoneChoice.chosenSquare = sq;
    this.ui.spellstoneSquareChosen(sq);

    this.updateTypedWord();
    this.updateSelectableSquaresSpellstone();
    this.updatePendingSquares();
  }

  confirmSpellstoneChoice() {
    this.ui.digStateScreen.spellstoneButton?.setButtonTextValue(--this.currentStateObject.spellstonesLeft, true, 600);
    if (this.currentStateObject.spellstonesLeft <= 0)
      this.ui.digStateScreen.spellstoneButton?.setButtonEnabled(false, true, 600);

    (this.currentStateObject.spellstoneSquares ??= []).push(this.spellstoneChoice.chosenSquare.serializedRowColumn);

    this.readyForInput = false;
    this.ui.setUIState('DIG');
    this.spellstoneChoice = null;

    this.clearCalculatedHints();
    this.clearSelectableSquares();
    this.updateTypedWord();
    this.updateSelectableSquares();
    this.updatePendingSquares();

    this.saveState();

    this.checkAvailableWords().then(() => {
      this.readyForInput = true;
    });
  }

  cancelSpellstoneChoice() {
    this.spellstoneChoice.chosenSquare?.setSpellstone(false) &&
      this.squaresPendingUpdate.set(this.spellstoneChoice.chosenSquare, 0);

    this.ui.setUIState('DIG');
    this.spellstoneChoice = null;

    this.clearSelectableSquares();
    this.updateTypedWord();
    this.updateSelectableSquares();
    this.updatePendingSquares();
  }

  //
  //  Bonus + digging
  //

  calculateBonusData() {
    this.bonusData = this.calculateBonusDataForSquares(this.typedWordSquares);
  }

  calculateBonusDataForSquares(squares) {
    let bonusData = { bonusLong: 0, bonusRare: 0, topLength: 0, length: squares.length };

    let thresholdIndex = this.getWordLengthThresholdIndex(squares.length);
    if (thresholdIndex >= 0) {
      bonusData.bonusLong = thresholdIndex + 1;
      bonusData.topLength = this.currentStateObject.caveData.WordLengthExtraMoves[thresholdIndex];
    }

    squares.forEach(sq => this.languageTree.getTokenGroup(sq.getToken()) > 0 && bonusData.bonusRare++);

    let maxRow = Math.max(...squares.map(sq => sq.row), this.maxDugRow);

    bonusData.depthIncrease = Math.max(0, maxRow - this.maxDugRow);
    bonusData.maxLevel = this.getLevelFromRow(maxRow + 1);
    bonusData.levelsCompleted = bonusData.maxLevel - this.currentLevel;
    bonusData.bonusLevel = bonusData.levelsCompleted * this.currentStateObject.caveData.LevelBonusMoves;

    bonusData.bonusTotal = bonusData.bonusLong + bonusData.bonusRare + bonusData.bonusLevel;

    return bonusData;
  }

  digWord() {
    if (!this.typedWordSquares.length)
      return;

    this.clearSelectableSquares();
    this.clearHintedSquares();
    this.clearCalculatedHints();

    let valid = true;
    this.typedWordSquares.forEach(sq => {
      const token = sq.getValidToken();
      if (!token)
        valid = false;
    });
    if (!valid)
      return;

    this.currentStateObject.numWords++;

    if (this.bonusData.length > this.currentStateObject.bestWordLength) {
      this.currentStateObject.bestWordLength = this.bonusData.length;
      this.currentStateObject.bestWord = this.typedFormattedWord;
    }

    this.digWordSquares(this.typedWordSquares);

    let wordData = { word: this.typedFormattedWord, squares: [] };
    this.typedWordSquares.forEach(sq => {
      this.maxDugRow = Math.max(sq.row, this.maxDugRow);
      wordData.squares.push(sq.serializedRowColumn);
    });
    this.currentStateObject.dugWords.push(wordData);

    this.ui.digStateScreen.digButton?.setButtonTextValue(--this.currentStateObject.movesLeft);

    this.currentLevel = this.bonusData.maxLevel;

    this.updatePendingSquares();
    this.readyForInput = false;

    this.asyncFinalizeDig(200, 400);
  }

  async asyncFinalizeDig(delay = 0, delayBonus = 400) {
    const bonusMoves = this.bonusData.bonusTotal ?? 0;
    this.currentStateObject.movesLeft += bonusMoves;

    if (this.currentStateObject.movesLeft <= 0) {
      this.gameOver();
      return;
    }

    await new Promise(resolve => setTimeout(resolve, delay));

    this.ui.cleanup();

    if (bonusMoves) {
      this.ui.digStateScreen.digButton?.animateScoreUp(`+${bonusMoves}`, delayBonus);
      this.ui.digStateScreen.digButton?.setButtonTextValue(this.currentStateObject.movesLeft, true, delayBonus);
    }

    const spellstoneRewards = this.bonusData.levelsCompleted * this.currentStateObject.caveData.LevelBonusSpellstones;
    if (spellstoneRewards) {
      this.currentStateObject.spellstonesLeft += spellstoneRewards;
      this.ui.digStateScreen.spellstoneButton?.animateScoreUp(`+${spellstoneRewards}`, delayBonus);
      this.ui.digStateScreen.spellstoneButton?.setButtonTextValue(this.currentStateObject.spellstonesLeft, true, delayBonus);
      this.ui.digStateScreen.spellstoneButton?.setButtonEnabled(this.currentStateObject.spellstonesLeft > 0, true, delayBonus);
    }

    this.scrollToCaveEnd();

    await new Promise(resolve => setTimeout(resolve, delayBonus));

    this.ui.digStateScreen.updateLevelDepth(this.currentLevel, this.maxDugRow, this.bonusData?.levelsCompleted);

    this.updateCompletedLevels();

    this.resetTyping();
    this.startMove();

    this.updateSelectableSquares();
    this.updatePendingSquares();

    await new Promise(resolve => setTimeout(resolve, 250));

    this.removeSquaresAboveTop();
    this.saveState();

    this.checkAvailableWords().then(() => {
      this.readyForInput = true;
    });
  }

  saveStateSfx = "_______ (C) 2025 Untame, Itay Keren";

  saveState() {
    if (!this.currentStateObject)
      return;

    const payload = { ...this.currentStateObject };
    if (this.hintedWordMap) {
      payload.hintedWords = {};
      this.hintedWordMap.forEach((hints, key) => {
        if (!(hints?.length === 2))
          return;
        let convertedLists = [null, null];
        for (let i = 0; i < 2; i++) {
          hints[i]?.forEach((hint) => {
            let data = { word: hint.word, squares: hint.squares.map(sq => sq.serializedRowColumn) };
            (convertedLists[i] ??= []).push(data);
          });
        }
        payload.hintedWords[key] = convertedLists;
      });
    }

    const saveData = {
      state: payload,
      hash: HashManager.HashString(JSON.stringify(payload) + GameConstants.SaveDataVersion + this.saveStateSfx)
    };

    this.storage.setItem(`CaveState.${this.currentStateObject.caveName}`, JSON.stringify(saveData));
    this.storage.setItem('CaveName', this.currentStateObject.caveName);
  }

  loadSavedState(caveName) {
    const savedStr = this.storage.getItem(`CaveState.${caveName}`);
    if (!savedStr)
      return false;

    let saveData = null;
    try {
      saveData = JSON.parse(savedStr);
    } catch (e) {
      console.error('Error parsing saved cave state', e);
      return false;
    }

    if (!saveData?.state || !saveData?.hash) {
      console.error('Invalid saved cave state', saveData);
      return false;
    }

    const expectedHash = HashManager.HashString(JSON.stringify(saveData.state) + GameConstants.SaveDataVersion + this.saveStateSfx);
    if (saveData.hash !== expectedHash) {
      console.error('Saved cave state hash mismatch', { expected: expectedHash, actual: saveData.hash });
      return false;
    }

    this.currentStateObject = { ...saveData.state };

    this.maxDugRow = -1;
    this.currentStateObject.dugWords.forEach(wordData => {
      wordData?.squares?.forEach(sqStr => {
        let row = Square.DeserializeToRowColumn(sqStr)?.row;
        this.maxDugRow = Math.max(this.maxDugRow, row);
      });
    });

    this.currentLevel = this.getLevelFromRow(this.maxDugRow + 1);

    return true;
  }

  loadSavedStateFinalize() {
    if (!this.currentStateObject)
      return;

    this.currentStateObject.dugWords.forEach(wordData => {
      let curWordSquares = wordData?.squares?.map(sqStr => this.getSquareBySerializedPosition(sqStr));
      curWordSquares && this.digWordSquares(curWordSquares);
    });

    this.currentStateObject.spellstoneSquares?.forEach(sqStr =>
      this.getSquareBySerializedPosition(sqStr)?.setSpellstone(true));

    if (this.currentStateObject.hintedWords) {
      this.hintedWordMap = new Map();
      for (const key in this.currentStateObject.hintedWords) {
        const hintLists = this.currentStateObject.hintedWords[key];
        if (!(hintLists?.length === 2)) {
          console.warn('Invalid hintedWords entry', key, hintLists);
          continue;
        }
        let inGridHints = [null, null];
        for (let i = 0; i < 2; i++) {
          const hints = hintLists[i]?.map(hint => ({
            word: hint.word,
            squares: hint.squares.map(sqStr => this.getSquareBySerializedPosition(sqStr)),
          }));
          inGridHints[i] = hints;
        }
        this.hintedWordMap.set(key, inGridHints);
        inGridHints[1]?.forEach(hint => this.setPresentedHint(hint));
      }
      delete this.currentStateObject.hintedWords;
    }
  }

  removeSavedState(caveName) {
    this.storage.removeItem(`CaveState.${caveName}`);
    this.storage.removeItem('CaveName');
  }

  gameOver() {
    this.removeSavedState(this.caveName);
    this.readyForInput = false;
    this.ui.gameOver();
  }

  // Dig the given squares out of the grid. The tunnel/connector sprites the original drew here
  // are now derived by the view from dug-square adjacency; this keeps only the model mutation.
  digWordSquares(squares) {
    squares.forEach(sq => {
      this.overlayLevelEndColumn(sq.row + 1, sq.column);
      this.overlayLevelEndColumn(sq.row, sq.column);

      if (sq.digSquare()) {
        this.removeSquareFromGrid(sq);
        this.dugSerializedSquares.add(sq.serializedRowColumn);
      }
    });
  }

  //
  //  Scrolling (state only; the view animates from scrollY changes)
  //

  scrollToRow(row, time = 750, delay = 0, force = false) {
    row = Math.max(row, GameConstants.Cave.MinRowForScroll, this.minRow + GameConstants.Cave.ScrollSpringOver);
    let targetY = -row * GameConstants.SquareSize;
    if (!force && targetY === this.scrollY)
      return;

    this.minScreenRow = row;
    this.maxRow = row + this.actualRowsOnScreen + GameConstants.Cave.ExtraRowsAfter;

    // Populate new squares as needed
    this.createSquares();

    // The view tweens from its previous scrollY toward this target (time/delay are hints it reads
    // off the snapshot); the model just commits the target.
    this.scrollY = targetY;
  }

  scrollToCaveEnd(time = 500, delay = 0) {
    this.scrollToRow(this.maxDugRow - GameConstants.Cave.ScrollAboveMaxDugRow + 1, time, delay);
  }

  scrollToShowRange(minRow, maxRow, time = 500, delay = 0, force = false) {
    if (this.minScreenRow > minRow) {
      this.scrollToRow(minRow, time, delay, force);
      return true;
    }
    if (this.minScreenRow + this.actualRowsOnScreen - 1 < maxRow) {
      let scrollUp = Math.min(minRow - this.minScreenRow,
        maxRow - (this.minScreenRow + this.actualRowsOnScreen - 1));
      this.scrollToRow(this.minScreenRow + scrollUp, time, delay, force);
      return true;
    }
    if (force)
      this.scrollToRow(this.minScreenRow, time, delay, force);
    return false;
  }

  scrollCave(distY) {
    let minAllowedRow = Math.max(this.minRow + GameConstants.Cave.ScrollSpringOver, -GameConstants.Cave.ScrollAboveMaxDugRow);
    let maxAllowedRow = Math.max(this.maxRow - GameConstants.Cave.ScrollSpringOver - this.actualRowsOnScreen, minAllowedRow);

    let minAllowed = GameConstants.SquareSize * minAllowedRow;
    let maxAllowed = GameConstants.SquareSize * maxAllowedRow;
    let curY = -this.scrollY;

    let overEdgeY = curY < minAllowed ? minAllowed - curY :
      curY > maxAllowed ? curY - maxAllowed : 0;

    let overEdgeYFactor = overEdgeY / (GameConstants.SquareSize * GameConstants.Cave.ScrollSpringOver);

    if (overEdgeY > 0)
      distY *= 1 - overEdgeYFactor;

    this.scrollY += distY;
  }

  // End of a scroll/swipe interaction: snap the screen row and ensure relevant rows are visible.
  finalizeMouseUp(time = 250, force = false) {
    let forceScroll = false;
    if (force) {
      let curRow = Math.round(-this.scrollY / GameConstants.SquareSize);
      this.minScreenRow = Math.max(curRow, -GameConstants.Cave.ScrollAboveMaxDugRow);
      forceScroll = true;
    }

    if (this.maxSelectedRow >= 0)
      this.scrollToShowRange(this.minSelectedRow, Math.max(this.maxSelectedRow, this.maxDugRow) + GameConstants.Cave.ClearLinesFromBottom, time, 0, forceScroll);
    else
      this.scrollToShowRange(this.maxDugRow - GameConstants.Cave.ScrollAboveMaxDugRow + 1, this.maxDugRow + GameConstants.Cave.ClearLinesFromBottom, time, 0, forceScroll);
  }

  //
  //  Grid lines / square bookkeeping
  //

  getOrCreateSquareLine(row) {
    let lineSquares = this.squareLines.get(row);
    if (lineSquares)
      return lineSquares;
    lineSquares = new Array(GameConstants.Cave.GridColumns);
    this.squareLines.set(row, lineSquares);
    return lineSquares;
  }

  removeSquareFromGrid(sq) {
    const line = this.squareLines.get(sq.row);
    if (line)
      line[sq.column] = null;
  }

  deleteSquare(sq) {
    this.squaresPendingUpdate.delete(sq);
    this.selectableSquares.delete(sq);
    this.poolSquareReturn(sq);
  }

  //
  //  Pool
  //

  static PoolExtendSize = 350;
  #squarePool = [];

  poolSquareExtend() {
    for (let i = 0; i < Cave.PoolExtendSize; i++) {
      let sq = new Square(this);
      sq.visible = false;
      sq.active = false;
      this.#squarePool.push(sq);
    }
  }

  poolSquareGet() {
    if (this.#squarePool.length === 0)
      this.poolSquareExtend();
    return this.#squarePool.pop();
  }

  poolSquareReturn(sq) {
    this.#squarePool.push(sq);
  }

  //
  //  Render snapshot
  //

  // Serializable description of the whole board for the view. Pure data — no engine objects.
  getSnapshot() {
    const squares = [];
    for (const line of this.squareLines.values()) {
      if (!line) continue;
      for (const sq of line)
        if (sq && sq.visible)
          squares.push(sq.getSnapshot());
    }

    const levelLines = [];
    for (const [row, data] of this.levelEndImageDataPerRow)
      levelLines.push({
        row,
        isComplete: data.isComplete,
        overlaidColumns: data.overlaidColumns.slice(),
      });
    levelLines.sort((a, b) => a.row - b.row);

    return {
      caveName: this.caveName,
      scrollY: this.scrollY,
      minRow: this.minRow,
      minScreenRow: this.minScreenRow,
      maxRow: this.maxRow,
      maxPopulatedRow: this.maxPopulatedRow,
      maxDugRow: this.maxDugRow,
      actualRowsOnScreen: this.actualRowsOnScreen,
      currentLevel: this.currentLevel,
      hasTopLine: this.hasTopLine,
      readyForInput: this.readyForInput,
      spellstoneChoiceActive: !!this.spellstoneChoice,
      movesLeft: this.currentStateObject?.movesLeft,
      hintsLeft: this.currentStateObject?.hintsLeft,
      spellstonesLeft: this.currentStateObject?.spellstonesLeft,
      numWords: this.currentStateObject?.numWords,
      bestWord: this.currentStateObject?.bestWord ?? null,
      bestWordLength: this.currentStateObject?.bestWordLength ?? 0,
      typedWord: {
        serialized: this.typedWordSerializedSquares ?? '',
        formatted: this.typedFormattedWord ?? '',
        keys: this.typedWordSquares.map(sq => sq.serializedRowColumn),
        bonus: { ...this.bonusData },
      },
      levelLines,
      dugSquares: Array.from(this.dugSerializedSquares).sort(),
      squares,
    };
  }

  // Debug/harness helper: the token grid as `{ row, tokens: [...] }` rows over a range.
  getTokenGrid(fromRow = this.minRow, toRow = this.maxPopulatedRow) {
    const rows = [];
    for (let row = fromRow; row <= toRow; row++) {
      const tokens = [];
      for (let column = 0; column < GameConstants.Cave.GridColumns; column++)
        tokens.push(this.getTokenAt(row, column));
      rows.push({ row, tokens });
    }
    return rows;
  }

  //
  //  Helper functions
  //

  static ParseColorFromString(colorStr) {
    var match = colorStr.match(/^#?([0-9a-f]{6})$/i);
    if (match) {
      const m = match[1];
      return (parseInt(m.slice(0, 2), 16) << 16) |
        (parseInt(m.slice(2, 4), 16) << 8) |
        parseInt(m.slice(4, 6), 16);
    }
    match = colorStr.match(/^#?([0-9a-f]{3})$/i);
    if (match) {
      const m = match[1];
      return (
        ((parseInt(m.charAt(0), 16) * 0x11) << 16) |
        ((parseInt(m.charAt(1), 16) * 0x11) << 8) |
        (parseInt(m.charAt(2), 16) * 0x11)
      );
    }
    return 0;
  }

  static CurveQuad = (t, cx, cy) => {
    if (t <= cx) {
      const qt = 1 - t / cx;
      return cy * (1 - qt * qt);
    } else {
      const qt = 1 - (t - cx) / (1 - cx);
      return cy + (1 - cy) * (1 - (2 * qt - qt * qt));
    }
  };

}

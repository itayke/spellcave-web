// Square — one cell in the cave.
//
// MIGRATION NOTE (Phaser -> HTML/React): this is the de-Phasered model. The original
// `src/game/Square.js` extended `Phaser.GameObjects.Container` and mixed the cell state
// machine with sprite/tween/container plumbing. This version is a plain class: it keeps the
// state machine, token logic, color-from-state, and the line/diagonal connector *geometry*,
// and exposes a serializable render snapshot via `getSnapshot()`. All image creation, tints,
// tweens, and scene-graph wiring are gone — the React/CSS view renders from the snapshot, and
// animations move to WAAPI/CSS in a later phase.
//
// Pixel geometry is expressed as factors of `GameConstants.SquareSize` so the view can scale
// to the runtime square size. `get x()/get y()` return the grid-center pixel position (matching
// the old Phaser positions Cave relied on) given the current `SquareSize`.

import GameManager from './GameManager.js';
import LanguageTree from './LanguageTree.js';
import GameConstants from './GameConstants.js';
import { toInt } from './Color.js';

// Square in the cave, with origin at the top-left corner
export default class Square {

  static StateMask_Selectable = 1;
  static StateMask_Selected = 1 << 1;
  static StateMask_SelectedValid = 1 << 2;
  static StateMask_HasHint = 1 << 3;

  static StateMask_Spellstone = 1 << 7;

  static StateMask_Dug = 1 << 8;

  // Desired mask state (use updateState to make the change)
  state = 0;
  // Currently updated state
  currentState = 0;

  // Position
  row;
  column;
  level;
  serializedRowColumn;

  // Previous/next selected squares (when selected), -1 if not selected
  selectedIndex = -1;

  // If hinted, index of the hint square
  hintIndex = -1;

  // Returns a serialized name for the square based on row and column, e.g. 12c for row 12 col 2 (0 based)
  static SerializeFromRowColumn = (row, column) => `${row}${String.fromCharCode(97 + column)}`
  // Convert 12c notation to numeric { row:, column: }
  static DeserializeToRowColumn = (name) => ({
    row: parseInt(name.slice(0, -1)),
    column: name.charCodeAt(name.length - 1) - 97
  });

  // Letter(s)
  token;
  // Spellstone wildcard (autocompleted token)
  spellstoneToken;

  // Cave object (logical reference only — provides languageTree + selection/hint chains)
  cave;

  // Max hint length
  hintLongest = 0;

  // Underline
  tokenGroup = 0; // Is token in a special (non-zero) token group

  // Active/visible flags (were Phaser GameObject flags; kept as plain state for the snapshot)
  active = false;
  visible = false;

  // Desired colors after the last visual-state commit (hex strings)
  #desiredBgColor = GameConstants.Square.ColorUnselectable;
  #desiredFgColor = GameConstants.Square.TextColorUnselectable;

  constructor(cave) {
    this.cave = cave;
  }

  // Grid-center pixel position, derived from the runtime square size.
  get x() {
    return Math.round((this.column + 0.5) * GameConstants.SquareSize);
  }
  get y() {
    return Math.round((this.row + 0.5) * GameConstants.SquareSize);
  }

  // Set square to a token and position
  initialize(token, row, column, level) {
    this.row = row;
    this.column = column;
    this.level = level;
    this.serializedRowColumn = Square.SerializeFromRowColumn(this.row, this.column);
    this.state = 0;
    this.currentState = 0;

    this.setToken(token);

    this.spellstoneToken = null;

    this.active = true;
    this.visible = true;
    this.updateVisualState(false);

    if (GameManager.Debug >= 2)
      console.log(`Square ${this.serializedRowColumn} set to token ${token}`);
  }

  // Back to pool
  destruct() {
    this.setSpellstone(false);
    this.selectedIndex = -1;
    this.hintIndex = -1;

    // Hide
    this.visible = false;
    this.active = false;

    // Cleanup tokens
    this.token = null;
    this.spellstoneToken = null;

    // Remove cave references
    this.cave?.deleteSquare(this);
  }

  //
  //  Square states
  //

  // Returns the desired [bgColor, fgColor] hex strings for a given state mask.
  getBgFgColorsFromState = (state) => {
    let hinted = this.hasHint(state);
    let selected = this.isSelected(state);
    let selectable = this.isSelectable(state);
    let valid = this.isSelectedValid(state);

    const bgColor = valid ? GameConstants.Square.ColorSelectedValid :
      selected ? GameConstants.Square.ColorSelected :
        selectable ?
          GameConstants.Square.ColorSelectable :
          GameConstants.Square.ColorUnselectable;

    const fgColor = valid ? GameConstants.Square.TextColorSelectedValid :
      selected ? GameConstants.Square.TextColorSelected :
        hinted ? GameConstants.Square.TextColorHinted :
          selectable ? GameConstants.Square.TextColorSelectable :
            GameConstants.Square.TextColorUnselectable;

    if (GameManager.Debug >= 2)
      console.log(`Square ${this.serializedRowColumn} (${this.token}) colors: bg=${bgColor}, fg=${fgColor}`);

    return [bgColor, fgColor];
  }

  // Commit the desired state into the current state and recompute the render-relevant fields
  // (desired colors). Returns true if there was anything to update. The `animate`/`delay`
  // arguments are preserved for caller compatibility but no longer drive tweens — the view
  // animates from snapshot changes.
  updateVisualState(animate = true, delay = 0) {
    if (this.isDug())
      return false;

    // Update new state
    this.currentState = this.state;

    // Get desired colors
    [this.#desiredBgColor, this.#desiredFgColor] = this.getBgFgColorsFromState(this.currentState);

    if (GameManager.Debug >= 2)
      console.log(`${this.serializedRowColumn} (${this.token}): -> ${this.state} (anim: ${animate}, delay: ${delay})`);

    return true;
  }

  setStateMask(flagMask, on = true) {
    let prevState = this.state;
    if (on)
      this.state |= flagMask;
    else
      this.state &= ~flagMask
    return this.state !== prevState;
  }

  getStateMask = (flagMask, state = this.state) => (state & flagMask) === flagMask;

  setDug = (flag = true) => this.setStateMask(Square.StateMask_Dug, flag);
  isDug = (state = this.state) => this.getStateMask(Square.StateMask_Dug, state);

  setSelectable = (flag = true) => this.setStateMask(Square.StateMask_Selectable, flag);
  isSelectable = (state = this.state) => this.getStateMask(Square.StateMask_Selectable, state);

  setSelected = (flag = true, index = -1) => {
    this.selectedIndex = flag ? index : -1;
    return this.setStateMask(Square.StateMask_Selected, flag);
  };
  isSelected = (state = this.state) => this.getStateMask(Square.StateMask_Selected, state);

  setSelectedValid = (flag = true) => this.setStateMask(Square.StateMask_SelectedValid, flag);
  isSelectedValid = (state = this.state) => this.getStateMask(Square.StateMask_SelectedValid | Square.StateMask_Selected, state);

  setHasHint = (flag = true, index = -1) => {
    this.hintIndex = flag ? index : -1;
    return this.setStateMask(Square.StateMask_HasHint, flag);
  };
  hasHint = (state = this.state) => this.getStateMask(Square.StateMask_HasHint, state);

  setHintLongest = (length) => this.hintLongest = length;

  setSpellstone(flag = true) {
    if (!this.setStateMask(Square.StateMask_Spellstone, flag))
      return false; // State did not change
    if (!flag)
      this.spellstoneToken = null;
    return true;
  }
  isSpellstone = (state = this.state) => this.getStateMask(Square.StateMask_Spellstone, state);

  // Change flags and visualize (possibly delayed)
  selectSquare(select = true, delay = 0, selectedIndex = -1) {
    // Early return if no change
    if (!this.setSelected(select, selectedIndex))
      return false;

    if (!select && this.isSpellstone())
      this.setSpellstoneToken(null);

    this.updateVisualState(true, delay);
    return true;
  }

  setToken(token) {
    this.token = token;
    this.tokenGroup = this.cave.languageTree.getTokenGroup(token);

    if (GameManager.Debug >= 2)
      console.log(`Square ${this.serializedRowColumn} set to token ${token} (${this.getReadableToken()})`);
  }

  getToken = () =>
    this.isSpellstone() ?
      LanguageTree.WildcardToken :
      this.token;

  // Get the token group, 0 if none. Spellstone always 0.
  getTokenGroup = () =>
    this.isSpellstone() ? 0 : this.tokenGroup;

  setValidToken(token) {
    if (this.isSpellstone())
      this.setSpellstoneToken(token);
    else if (token && token != this.token)
      console.error(`Invalid token: new ${token} != original ${this.token}`);

    return this.setSelectedValid(!!token);
  }

  getValidToken = () =>
    !this.isSelectedValid() ? null :
      this.isSpellstone() ? this.spellstoneToken :
        this.token;

  getReadableToken = () =>
    !this.isSpellstone() ?
      LanguageTree.GetInstance().getReadableToken(this.token) :
      this.isSelectedValid() ?
        LanguageTree.GetInstance().getReadableToken(this.spellstoneToken) :
        LanguageTree.WildcardToken;

  setSpellstoneToken(token) {
    if (token === this.spellstoneToken)
      return;
    this.spellstoneToken = token;

    if (GameManager.Debug >= 2)
      console.log(`Square ${this.serializedRowColumn} set spellstone token to ${token}`);
  }

  // Change flags and visualize
  digSquare() {
    let ret = this.setDug(true); // Ensure it is not used until re-initialized
    this.destruct();
    return ret;
  }

  //
  // Connector / line geometry (pure — no images)
  //

  // Describe the connector line leading from the previous square in `squares` (at index-1) to
  // this square, plus the always-present dot on this square. Returns null when this square has
  // no preceding square in the chain. Lengths are factors of SquareSize so the view can scale.
  computeLine(squares, squareIndex, colorHex) {
    if (!squares?.length)
      return null;

    const dot = { color: colorHex };
    let connector = null;

    if (squareIndex > 0) {
      const prevSquare = squares[squareIndex - 1];
      const colDiff = prevSquare.column - this.column;
      const rowDiff = prevSquare.row - this.row;
      const isDiagonal = !!(colDiff && rowDiff);
      const lengthFactor = isDiagonal ? 1.4142 : 1;
      // Angle in degrees from this square toward the previous square
      const angleDeg = Math.atan2(rowDiff, colDiff) * 180 / Math.PI + 180;

      connector = {
        fromKey: prevSquare.serializedRowColumn,
        angleDeg,
        lengthFactor,
        isDiagonal,
        color: colorHex,
      };
    }

    return { dot, connector };
  }

  // Diagonal lead connector placed on this square when the previous selected square is diagonal.
  // Offsets are factors of SquareSize. Returns null when not applicable.
  computeDiagonalLead() {
    const squares = this.cave.typedWordSquares;
    if (!(squares?.length >= 2) || this.selectedIndex <= 0)
      return null;

    const prevSquare = squares[this.selectedIndex - 1];
    const colDiff = prevSquare.column - this.column;
    const rowDiff = prevSquare.row - this.row;
    if (!(colDiff && rowDiff))
      return null;

    // Placed exactly between two adjacent diagonal *selected* squares (hence the scale divisor)
    const offsetFactor = 1 / GameConstants.Square.SquareScaleSelected / 2;
    const angle = 45 * rowDiff / colDiff;
    return {
      angleDeg: angle,
      offsetColFactor: colDiff * offsetFactor,
      offsetRowFactor: rowDiff * offsetFactor,
    };
  }

  // Color of the connector lines for the target state.
  getLineColor() {
    if (this.isSelected()) {
      const [bgColor] = this.getBgFgColorsFromState(this.state);
      const saturatePct = this.isSelectedValid() ?
        GameConstants.SquareLine.ColorSaturateValid :
        GameConstants.SquareLine.ColorSaturate;
      return Square.SaturateHex(bgColor, saturatePct);
    }
    if (this.hasHint())
      return GameConstants.SquareLine.ColorHinted;
    return null;
  }

  //
  // Render snapshot
  //

  // Serializable description of everything the view needs to render this square. Pure data —
  // no DOM, no engine objects. The view diffs snapshots to drive CSS/WAAPI animations.
  getSnapshot() {
    const selected = this.isSelected();
    const valid = this.isSelectedValid();
    const hinted = this.hasHint();
    const [bgColor, fgColor] = this.getBgFgColorsFromState(this.state);

    let line = null;
    if (selected) {
      line = this.computeLine(this.cave.typedWordSquares, this.selectedIndex, this.getLineColor());
      const diagonalLead = this.computeDiagonalLead();
      if (diagonalLead) line.diagonalLead = diagonalLead;
    } else if (hinted) {
      line = this.computeLine(this.cave.hintedSquares, this.hintIndex, this.getLineColor());
    }

    return {
      key: this.serializedRowColumn,
      row: this.row,
      column: this.column,
      level: this.level,
      token: this.token,
      readableToken: this.token != null ? this.getReadableToken() : '',
      state: this.state,
      selectable: this.isSelectable(),
      selected,
      selectedValid: valid,
      hinted,
      spellstone: this.isSpellstone(),
      dug: this.isDug(),
      active: this.active,
      visible: this.visible,
      selectedIndex: this.selectedIndex,
      hintIndex: this.hintIndex,
      tokenGroup: this.tokenGroup,
      bgColor,
      fgColor,
      scale: selected ? GameConstants.Square.SquareScaleSelected : 1,
      spellstoneToken: this.spellstoneToken ?? null,
      spellstoneReadableToken: this.isSpellstone()
        ? (this.spellstoneToken
          ? LanguageTree.GetInstance().getReadableToken(this.spellstoneToken)
          : (selected ? LanguageTree.WildcardToken : ''))
        : null,
      line,
    };
  }

  //
  // Static color math (verbatim from the Phaser version, plus a hex wrapper)
  //

  static EaseOutBackExtreme = x => {
    const c1 = 6; // Increased from 1.70158 for more overshoot
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  // Convert color to RGB256
  static GetRGB256FromColor = (color) => [
    (color >> 16) & 0xff,
    (color >> 8) & 0xff,
    color & 0xff
  ];

  // Convert RGB256 to color
  static GetColorFromRGB256 = (r, g, b) => (r << 16) | (g << 8) | b;

  // Saturate (positive val 0..1) or desaturate (negative val) hex color (24-bit int)
  static SaturateColor(color, val) {
    if (!val) return color;
    var r = (color >> 16) & 0xff;
    var g = (color >> 8) & 0xff;
    var b = color & 0xff;

    if (val > 0) {
      r = Math.floor(r + (256 - r) * val);
      g = Math.floor(g + (256 - g) * val);
      b = Math.floor(b + (256 - b) * val);
    }
    else {
      val += 1; // Make it positive complement to 1
      r = Math.floor(r * val);
      g = Math.floor(g * val);
      b = Math.floor(b * val);
    }
    return (r << 16) | (g << 8) | b;
  }

  // Saturate a CSS hex string ('#rrggbb'), returning a CSS hex string.
  static SaturateHex(hex, val) {
    const sat = Square.SaturateColor(toInt(hex), val);
    return `#${(sat >>> 0).toString(16).padStart(6, '0')}`;
  }

}

// Main configuration for spellcave. Some additional global params are added here on runtime.
//
// MIGRATION NOTE (Phaser -> HTML/React): every color here is now a plain CSS hex string
// (e.g. '#ff7011'), replacing the old `Phaser.Display.Color.ValueToColor(...)` objects.
// Consumers that need numeric channels or color-lerp should parse via src/engine/Color.js.
const GameConstants = {

  Version: '0.7',
  SaveDataVersion: 1,

  // Global size refs
  SquareSize: 0,
  CaveWidth: 0,

  Cave: {
    // window padding
    Padding: { left: 12, right: 12, top: 24, bottom: 12 },

    // game grid size
    GridColumns: 7,
    // Minimum visible rows, depends on the screen ratio
    GridMinVisibleRows: 14,
    
    // grid initialization with random downwards words:
    // Number of words to be placed in the grid per line, could be number or array of numbers, e.g. 1 or [1, 1, 2]
    PopulateWordsPerRow: 1,
    // Length of words to be placed. Number or array of numbers, e.g. 4 or [3, 3, 4, 5]
    PopulateWordsLength: 4,

    // Prevents the same token from appearing in adjacent squares. 
    // The closer the value to 0, the less likely it is to repeat. 
    AdjacentTokenRepeatWeight: 0.2,
    // Value 0..1 representing the use of random (0.0) through language probabilites (1.0)
    LanguageTokenVsRandomProbabilityScale: 0.75,

    ScrollAboveMaxDugRow: 3,
    // If below 0, will show a gap between the top row and the top of the screen
    MinRowForScroll: -2,
    // Extra rows before the visible ones, allowing scroll up. Prior to the top row, squares can be destroyed to save memory.
    ExtraRowsBefore: 2,
    // Extra rows after the visible ones, allowing scroll down
    ExtraRowsAfter: 8,
    // Length of spring effect in squares
    ScrollSpringOver: 2,
    // Number of rows from bottom that are not selectable for spellstone placement
    SpellstoneSelectionRowsFromBottom: 0,

    // As letters are typed, scroll down to clear from the bottom
    ClearLinesFromBottom: 4,
    
    // Pixel distance to trigger swipe
    SwipeMoveThresholdDistSq: 5 * 5,

    // How permissive the diamond size is for swiping. 0.5 is a perfect center diamond, larger cuts into the corners.
    SwipeDiamondThreshold: 0.5,
    // How straight (degrees) the swipe must be to be considered a straight line and allow for using the full square vs diamond
    StraightAngleDegsThreshold: 12.5,

    // Frequency in ms between deselects in chain
    DelayFrequencyDeselect: 0,
    // Factor to reduce the delay frequency for each subsequent deselect
    DelayFrequencyDeselectFactor: 0.95,

    DelayShowMessagesAfterMove: 750,
    DelayShowMessagesAfterBonusMove: 1500,

    // Is hinting the next letters only, or whole words (TODO remove the other choice when decided)
    HintNextLetters: false,

    // Start with the top percent of hints in the list (e.g. 1 would show the best, 0.5 show an average one)
    HintShowTopPercent: 0.75,
    
    HintDisplayFrequency: 75,
    HintDisplayFrequencyPreShown: 25,
    HintDisplayNextFrequency: 10,

    // Number of steps to extend hints, e.g. 1 allows FLOOR -> FLOORS, 2 allows FLOORS -> FLOORED, 0 allows no extension
    HintExtendLetters: 0,

    Block: { name: 'block', file: 'white.png' },
  },
  
  // Square data
  Square: {
    TextFont: 'SquareToken',
    TextSizeRatio: 0.55,
    ImageSquareSizeFactor: 1.11,
    SquareScaleSelected: 1.25,
    TextPosition: { x: 0, y: 0 },

    SquareTagsAlpha: 0.85, // Alpha for underline and hint text

    UnderlineImageHeightPct: 0.07,
    UnderlineImageMinWidthPct: 0.25,
    UnderlineImagePositionPctY: 0.3125,

    SpellstoneIconImageSizeRatio: 0.75,
    SpellstoneIconTextSizeRatio: 0.5,

    ColorDug: '#000000',
    ColorUnselectable: '#3d3e43',
    ColorSelected: '#ff7011',
    ColorSelectedValid: '#88ff00',
    ColorSelectable: '#d7d6d3',
    ColorHinted: '#ffbb00',
    ColorHintedShort: '#ffd86d',

    // ColorSelected: '#FFdd00',
    // ColorHinted: '#c94700',
    TextColorUnselectable: '#f6f7f9',
    TextColorSelected: '#000000',
    TextColorSelectedValid: '#000000',
    TextColorSelectable: '#000000',
    TextColorHinted: '#000000',

    BgImage: { name: 'square', file: 'squareBg3.png' },
    ConnectorImage: { name: 'tunnelConnector', file: 'tunnelConnector.png' },
    ConnectorSelectedImage: { name: 'tunnelConnectorSelected', file: 'tunnelConnectorSelected.png' },
    OutlineImage: { name: 'squareBgOutline', file: 'squareBgOutline.png' },
    DotImage: { name: 'squareDot', file: 'squareSm.png' },
  },

  // Line between squares
  SquareLine: {
    LineWidthScale: 0.2,
    LineDotScale: 0.65,
    LineImage: { name: 'block' },
    LineDotImage: { name: 'lineDot', file: 'circle.png' },

    LineDotAnimationDuration: 75,
    LineAnimationDuration: 150,

    // Saturated bg when not hinted
    ColorSaturate: 0.2,
    ColorSaturateValid: 0.5,
    // Specific color for hinted squares
    ColorHinted: '#ffbb00',
  },

  // Level/depth etc.
  Stats: {
    TextColors: [
      '#b3b3b3',
      '#ebebeb',
    ],
    TextFont: 'UIText',
    TextSize: 0.035,
    XPositionGridRatio: 0.13,
    YPositionGridRatioDepth: 0.94,
    YPositionGridRatioLevel: 0.91
  },
  // Progress level lines
  ProgressButton: {
    Scale: { x: 0.043, y: 0.115 },
    LineHeightRatio: 0.6,
    XPositionGridRatio: 0.085,
    YPositionGridRatio: 0.925,
    LineImage: { name: 'block' },
    Alpha: 0.9,
    ColorUnreached: '#d05300',
    ColorReached: '#81f300',
  },
  // Next level line
  LevelLine: {
    HeightRatio: 0.04,
    OverlayWidthRatio: 1.1,
    OverlayHeightRatio: 1.1,  // Ensure covering the line completely
    ColorUnreached: '#ff7011',
    ColorReached: '#81f300',
    EndLevelImage: { name: 'block' },
    TopLevelImage: { name: 'levelTopLine', file: 'grassLine.png' },
    TopLevelOverlayHeightRatio: 0.75, // Shrink height

    // ColorUnreached: '#ffdd00',
    // ColorReached: '#81f300',
  },
  MenuButton: {
    Scale: 0.1,
    XPositionGridRatio: 0.4 / 7,
    YPositionGridRatio: 0.925,
    ImageYOffset: 0,
    TextYOffset: 0,
    TextSize: 0.04,
    Color: '#dedede',
    Alpha: 0.8,
    Image: { name: 'menu', file: 'dotsMenu.png' },
    ImageRatio: 0.333,
  },  
  DigButton: {
    Alpha: 1,
    Scale: 0.25,
    ScaleEnabled: 1.1,
    XPositionGridRatio: 0.5,
    YPositionGridRatio: 0.885,
    ImageYOffset: 0.08,
    TextYOffset: 0.015,
    TextSize: 0.1,
    Color: '#88ff00',
    ColorDisabled: '#747474',
    TextColor: '#151515',
    TextColorLast: '#ff3e17',
    TextColorYoyoDuration: 200,
    Image: { name: 'shovel', file: 'shovel.png' },
    Message: {
      TextFontTag: 'UIText',
      TextFontWord: 'SquareToken',
      CollapseIfWordIsAbsent: true, // If true, tags will move down if no word is shown
      TextSizeTag: 0.032,
      TextSizeWord: 0.09,
      TextXOriginTag: 0.5,
      TextXOffsetTag: 0,
      TextYOffsetTag: -0.165,
      TextXOriginWord: 0.5,
      TextXOffsetWord: 0,
      TextYOffsetWord: -0.095,
      LineHeight: 0.045,
      UpdateFreq: 50,
      UpdateDelayInitial: 200,
      UpdateDelayRemoveWord: 125,
      TextScaleWordValid: 1.2,
      TextScaleWordInvalid: 1,
      TextScaleTagValid: 1,
      TextScaleTagInvalid: 1,
      TextColorWordInvalid: '#cccccc',
      TextColorWordValid: '#88ff00',
      TextColorWordInvalidSpellstone: '#2296c0',
      TextColorWordValidSpellstone: '#00bbff',
      TextColorTagInvalid: '#a4a4a4',
      TextColorTagValid: '#80d61e',
      TextColorLast: '#ff3c00',
    },
  },
  HintButton: {
    Scale: 0.13,
    XPositionGridRatio: 4.75 / 7,
    YPositionGridRatio: 0.925,
    ImageYOffset: 0,
    TextYOffset: 0.01,
    TextSize: 0.05,
    // Color: '#ff5900',
    Color: '#ffffff',
    ColorDisabled: '#592f18',
    TextColor: '#000000',
    Image: { name: 'torch', file: 'torch3b.png' },
    Message: {
      TextSize: 0.05,
      TextYOffset: -0.08,
      TextScale: 1,
      TextFont: 'SquareToken',
      TextColor: '#a4a4a4',
      TextColorNoHint: '#a4a4a4',
      TextColorHint: '#ffa200',
    }
  },
  SpellstoneButton: {
    Scale: 0.14,
    ScaleEnabled: 1.1,
    XPositionGridRatio: 5.97 / 7,
    YPositionGridRatio: 0.925,
    ImageYOffset: 0,
    TextYOffset: 0,
    TextSize: 0.07,
    Color: '#78dbff',
    ColorDisabled: '#334e59',
    TextColor: '#000000',
    Image: { name: 'spellstone', file: 'spellstone3.png' }
  },
  
  SpellstoneSquare: {
    Color: '#1dc3ff',
    TextColor: '#dcf2ff',
    Image: { name: 'spellstoneSquare', file: 'spellstoneSquare.png' }
  },
  SpellstoneScreen: {
    TextColor: '#ffffff',
    TextSize: 0.4,
    TextYDistFromBottom: 0.8,
    ButtonScale: 1,
    ButtonYDistFromBottom: 0.8,
    ButtonXDistFromSides: 0.9,
    Accept: {
      Image: { name: 'accept', file: 'accept.png' },
      // Color: '#00ff59',
      // ColorDisabled: '#0f4120'
      Color: '#ffffff',
      ColorDisabled: '#6c6c6c'
    },
    Cancel: {
      Image: { name: 'cancel', file: 'cancel.png' },
      Color: '#ffffff',
    }
  },
  GameOverScreen: {
    BlockerAnimateDelay: 200,
    BlockerAnimateTime: 300,
    BlockerColor: '#000000',
    BlockerAlpha: 0.6,
    BlockerImage: { name: 'block' },

    AnimateDelay: 500,
    SkullYPositionGridRatio: 0.3,    
    SkullImage: { name: 'skull', file: 'skull.png' },
    SkullColor: '#ff7011',
    SkullAlpha: 1,
    SkullSizeGridRatio: 0.76,
    SkullAnimateDelay: 350,
    SkullAnimateTime: 150,

    StripYOffsetGridRatio: 0.36,
    StripColor: '#000000',
    StripAlpha: 1,
    StripHeightGridRatio: 0.2,
    StripAngle: 20,
    StripAnimateDelay: 0,
    Strip2AnimateDelay: 150,
    StripAnimateTime: 200,

    TextGameOverYOffsetGridRatio: -0.005,
    TextGameOverColor: '#ff7011',
    TextGameOverFont: 'UIText',
    TextGameOverSizeGridRatio: 0.1,
    TextGameOverAnimateTime: 200,
    TextGameOverAnimateTimeOpen: 75,
    TextGameOverAnimateTimeOpenTimes: 2,
    TextGameOverAnimateDelay: 500,
    TextGameOverAnimateDelayOpen: 100,
    TextGameOverLineSpacing: 0,
    TextGameOverLineSpacingOpen: 0.2,

    TextStatsFontKey: 'UIText',
    TextStatsFontValue: 'UIText',
    TextStatsFontValueWord: 'SquareToken',
    TextStatsXCenterGridRatio: 0.53,
    TextStatsXSpaceGridRatio: 0.0125,
    TextStatsColorKey: '#b3b3b3',
    TextStatsColorValue: '#d5d5d5',
    TextStatsSizeKeyGridRatio: 0.05,
    TextStatsSizeValueGridRatio: 0.06,
    TextStatsSizeValueWordGridRatio: 0.075,
    TextStatsYPositionGridRatio: 0.625,
    TextStatsYSpacingGridRatio: 0.09,
    TextStatsAnimateYOffsetGridRatio: 0.075,
    TextStatsAnimateTime: 300,
    TextStatsAnimateDelay: 1000,
    TextStatsAnimateDelayIncrement: 100,

    ReplayButtonAnimateTime: 200,
    ReplayButtonAnimateDelay: 1600,
    ReplayButtonYPositionGridRatio: 0.85,
    ReplayButtonPaddingGridRatio: 0.1,
    ReplayButtonFont: 'SquareToken',
    ReplayButtonFontSizeGridRatio: 0.12,
    ReplayButtonTextColor: '#ff7011',
    ReplayButtonTextColorHover: '#ff6600',
    ReplayButtonFontScaleHover: 1.025,

    RemovalAnimateTime: 400,
    RemovalAnimateTimeFadeOut: 300,
    RemovalAnimateTimeFadeIn: 50,
  },
  ScoreUp: {
    TextSize: 0.06,
    YPositionOffset: -0.042,
    MovementY: 0.042,
    Alpha1At: 0.4,
    DurationMS: 2000,
    TextColor: '#ffffff'
  },
  Gradient: {
    // Span of the gradient overlay from the bottom (1.0 is full height)
    VerticalRatioBottom: 0.5,
    VerticalRatioTop: 0, // No top gradient
    // Alpha of the gradient overlay
    Alpha: 0.9,
    Image: { name: 'overlayGradient', file: 'darkenGradient.png' }
  },
  Fonts: {
    SquareToken: { name: 'SquareToken', png: 'fonts/PathwayGothicOne-Regular.png', xml: 'fonts/PathwayGothicOne-Regular.xml', sizeFactor: 0.55 },
    UIText: { name: 'UIText', png: 'fonts/Daikon-Medium.png', xml: 'fonts/Daikon-Medium.xml' }
  },
  UIButton: {
    ScaleAnimateTime: 150,
    ColorAnimateTime: 100
  },
  States: {
    AnimateDistanceScale: 0.35,
    AnimateTime: 300,
    AppearDelay: 100
  }
};

export default GameConstants;

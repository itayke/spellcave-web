import LanguageTree from './LanguageTree.js';

// Singleton coordinator. Ported from the Phaser version, stripped of:
//   - preload(scene) / Phaser asset loading  -> assets now load via <img>/fetch in the View layer
//   - Cave / CaveUI construction (initialize/createCaveAndUI/restartCave) -> moves to the Zustand
//     store + React shell phase (see MIGRATION_PLAN Phase 3)
// What remains here is pure logic: localization + the {COLOR=n} tag parser.
export default class GameManager {

  static Debug = 1;
  static LanguageCode = 'en';

  static LocaleStringsFilePrefix = 'locale-';

  static #Instance;
  static GetInstance = () => GameManager.#Instance ?? new GameManager();

  // Localized strings from 'locale-<langcode>.json' file
  localeStrings = null;

  constructor() {
    GameManager.#Instance = this;
  }

  async loadAssetsAsync() {
    await Promise.all([
      LanguageTree.GetInstance().initialize(GameManager.LanguageCode),  // Language tree
      this.readLocaleStrings(GameManager.LanguageCode)                  // Localization strings
    ]);
  }

  //
  //  Localization strings + helpers
  //

  // Read the locale strings from the JSON file
  async readLocaleStrings(langCode) {
    const filepath = `${LanguageTree.LangDataFilePath}${GameManager.LocaleStringsFilePrefix}${langCode}.json`;
    const response = await fetch(filepath);
    if (!response.ok)
      throw new Error(`${filepath} file missing`);
    this.localeStrings = await response.json();
    if (GameManager.Debug)
      console.log(`Locale strings loaded from ${filepath}`, this.localeStrings);
    return this.localeStrings;
  }

  // Get a localized string by key
  getLocaleString(key) {
    if (this.localeStrings === null ||
      !(key in this.localeStrings))
      return `*${key}*`;
    return this.localeStrings[key];
  }

  // Format a localized string with parameters formatted as {param}
  // e.g. formatLocaleString('hello {name}', { name: 'John' }) -> 'hello John'
  formatLocaleString = (key, data = null) =>
    this.getLocaleString(key)?.replace(/{(\w+)}/g, (_, param) => data?.[param] ?? `*${param}*`);

  // Static helper to get a localized string by key
  static FormatLocaleString = (key, data = null) =>
    GameManager.GetInstance().formatLocaleString(key, data);

  //
  //  {COLOR=index} tag parsing
  //

  // DOM replacement for the old Phaser SetTextAndColors (which mutated a bitmapText object via
  // setText + per-character setCharacterTint). Pure function: parses the {COLOR=index} tags out of
  // `text` and returns a render model the View layer turns into per-character <span>s.
  //
  // Returns { text, colors } where:
  //   text   = the string with all {COLOR=n} tags removed
  //   colors = array of one CSS color per character of `text` (or null if the input had no tags,
  //            meaning "render the whole string in the default color").
  // `colorList` is an array of CSS color strings; index 0 is the default color.
  static parseColorTags(text, colorList) {
    const colorTagRegex = /\{COLOR=(\d+)\}/g;
    let lastIndex = 0;
    let curColorIndex = 0;
    let stripped = '';
    let charColorIndexes = null;

    let match;
    while ((match = colorTagRegex.exec(text))) {
      const chunk = text.substring(lastIndex, match.index);
      stripped += chunk;
      charColorIndexes ??= [];
      for (let i = 0; i < chunk.length; i++)
        charColorIndexes.push(curColorIndex);

      curColorIndex = parseInt(match[1], 10);
      lastIndex = match.index + match[0].length;
    }

    if (charColorIndexes) {
      const chunk = text.substring(lastIndex);
      stripped += chunk;
      for (let i = 0; i < chunk.length; i++)
        charColorIndexes.push(curColorIndex);
    } else {
      stripped = text;
    }

    // Resolve to actual colors. No tags (or single-color list) -> default color for whole string.
    let colors = null;
    if (colorList?.length > 1 && charColorIndexes) {
      colors = charColorIndexes.map(idx => idx < colorList.length ? colorList[idx] : colorList[0]);
    }

    return { text: stripped, colors };
  }
}
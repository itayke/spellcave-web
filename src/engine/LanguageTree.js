// `fs/promises` is only touched by the Node-side paths: the offline file reads used by the parity
// harness and the dev-only tree export. It is imported lazily so this module can be bundled for the
// browser (Vite), where only the `fetch` code path runs and a top-level node builtin would break.
let _fsPromise;
// The specifier is held in a variable + @vite-ignore so Vite skips static analysis of this import
// and won't externalize the Node builtin (which would warn) — the browser bundle never reaches it;
// only the offline/export paths, run under Node, call loadFs().
const FS_MODULE = 'node:fs/promises';
const loadFs = () => (_fsPromise ??= import(/* @vite-ignore */ FS_MODULE));

export default class LanguageTree {

  static Debug = 1;

  // Constants
  static OfflineFileRootPath = 'public/';
  static LangDataFilePath = 'assets/langData/';
  static LangWordsFilePrefix = 'words-';
  static LangConfigFilePrefix = 'config-';
  static LangTreeFilePrefix = 'tree-';
  static LangProbFilePrefix = 'prob-';
  static WildcardToken = '?';
  static MaxTokenLen = 1;
  static MinWordLength = 2;

  // Utility data, e.g. number of words, size of the tree, etc.
  static GeneralData;

  // Tokens in the language (actual letters e.g. P, Q, R, etc.)
  langTokensUpper = new Set();
  // Game tokens in uppsercase form (e.g. P, QU, R)
  tokensUpper = new Set();
  // Game only tokens (e.g. QU)
  gameOnlyTokensUpper = new Set();
  // Uppercase all tokens (e.g. P, Q, QU, R, etc.)
  allTokensUpper = new Set();
  // Map of tokens to their readable form (e.g. 'QU' -> 'Qu')
  tokensUpperToReadable = new Map();
  // Map of token groups to their group (e.g. 'A' -> 1, 'Z' -> 4, etc.)
  tokenGroups = new Map(); 

  #initialized = false;
  #tokenTree = null;

  // Object with Token frequencies by themselves, and per each token pair: {
  //   '_': { 'A': 44, 'B': 5, 'C': 3, '#': 52 },  // Frequencies for each token, with # is frequencies total
  //   'A': { 'A': 1, 'B': 6, 'C': 3, '#': 10 },  // Frequencies for A paired with other tokens
  //   'B': { 'A': 3, 'B': 3, 'C': 8, '#': 14 },  // Frequencies for B paired with other tokens
  // }
  tokenProbabilities = null;
  langConfigJSON = null;

  static #Instance = null;

  constructor() {
    if (LanguageTree.#Instance) {
      throw new Error('LanguageTree instance already exists');
    }
    LanguageTree.#Instance = this;

    LanguageTree.GeneralData = {
      numWords: 0,
      numTokens: 0,
      letterTreeSize: 0
    };
  }

  static GetInstance = () => LanguageTree.#Instance ??= new LanguageTree();
  isInitialized = () => this.#initialized;

  async initialize(langCode, offline) {
    if (this.#initialized)
      return true;

    try {
      await this.readLangConfig(langCode, offline);
      await this.readProbData(langCode, offline);
      await this.readLetterTree(langCode, offline);
      this.#initialized = true;
      return true;
    } catch (error) {
      console.error('Initialization error:', error);
      return false;
    }
  }

  async readLangConfig(langCode, offline) {
    try {
      this.langConfigJSON = await LanguageTree.readFileJSON(`${LanguageTree.LangConfigFilePrefix}${langCode}.json`, offline);
      await this.processLangConfig(this.langConfigJSON);

      if (LanguageTree.Debug)
        console.log('LanguageTree config:', this.langConfigJSON);

    } catch (error) {
      console.error('Error reading language data:', error);
      throw error;
    }
  }

  async processLangConfig(langConfigJSON) {
    this.langTokensUpper.clear();
    this.tokensUpper.clear();
    this.allTokensUpper.clear();
    this.gameOnlyTokensUpper.clear();
    this.tokensUpperToReadable.clear();
    this.tokenGroups.clear();

    // Process tokens
    for (const token of langConfigJSON.Tokens) {
      const tok = token.toUpperCase();
      this.langTokensUpper.add(tok);
      this.allTokensUpper.add(tok);      
    }

    // Process token groups
    langConfigJSON.TokenGroups.forEach((group, idx) =>
      group.forEach(token => this.tokenGroups.set(token.toUpperCase(), idx))
    );
    if (LanguageTree.Debug >= 2) console.log('Token groups:', this.tokenGroups);

    // Process game tokens
    let gameTokens = langConfigJSON.GameTokens ?? langConfigJSON.Tokens;
    for (const token of gameTokens) {
      const up = token.toUpperCase();
      this.tokensUpper.add(up);

      if (up !== token) {
        this.tokensUpperToReadable.set(up, token);
      }

      if (token.length > LanguageTree.MaxTokenLen) {
        LanguageTree.MaxTokenLen = token.length;
      }

      if (!this.langTokensUpper.has(up)) {
        this.gameOnlyTokensUpper.add(up);
        this.allTokensUpper.add(up);
      }
    }

    // Process parameters
    if (langConfigJSON.MinimumWord) {
      LanguageTree.MinWordLength = langConfigJSON.MinimumWord;
    }

    if (langConfigJSON.WildcardToken) {
      LanguageTree.WildcardToken = langConfigJSON.WildcardToken;
    }

    // console.log('Tokens upper:', Array.from(this.tokensUpper));
  }

  async readProbData(langCode, offline) {
    try {
      this.tokenProbabilities = await LanguageTree.readFileJSON(`${LanguageTree.LangProbFilePrefix}${langCode}.json`, offline);
      if (LanguageTree.Debug >= 2)
        console.log('LetterTree Base frequencies:', this.tokenProbabilities);
    } catch (error) {
      console.error('Error reading probability data:', error);
      throw error;
    }
  }

  async readLetterTree(langCode, offline) {
    try {
      const text = await LanguageTree.readFile(`${LanguageTree.LangTreeFilePrefix}${langCode}.txt`, offline);
      LanguageTree.GeneralData.letterTreeSize = text.length;

      if (LanguageTree.Debug)
        console.log('LetterTree data:', LanguageTree.GeneralData);

      this.#tokenTree = new TokenNode();
      this.#tokenTree.deserialize(text);
    } catch (error) {
      console.error('Error reading words:', error);
      throw error;
    }
  }

  // finalizeProbs(extraProbs) {
  //   this.#frequencies = new Map(this.#frequenciesBase);
  //   let totalFreq = 1.0;

  //   for (const [key, value] of Object.entries(extraProbs)) {
  //     this.#frequencies.set(key, value);
  //     totalFreq += value;
  //   }

  //   // Normalize all frequencies
  //   for (const [key, value] of this.#frequencies) {
  //     this.#frequencies.set(key, value / totalFreq);
  //   }

  //   // Initialize temporary frequencies
  //   this.#frequenciesTemp = new Map();
  //   for (const [key, value] of this.#frequencies) {
  //     this.#frequenciesTemp.set(key, 0);
  //   }
  // }

  /**
   * Randomizes a token based on the provided random function or the default random function.
   *
   * @param {Function} randomFunc - A function that generates a random number between 0 and 1. If not provided, the default random function is used.
   * @returns {string|null} - The selected token based on the random value, or null if no token is selected.
   */
  randomizeToken(randomFunc) {
    randomFunc ??= LanguageTree.defaultRandomFunc;
    let tokenProbabilitiesBase = this.tokenProbabilities['_'];
    let rando = randomFunc() * tokenProbabilitiesBase.total;
    for (const [key, value] of Object.entries(tokenProbabilitiesBase.probs)) {
      if (rando < value) return key;
      rando -= value;
    }
    return null;
  }

  /**
   * Randomizes a token based on a scale between language and random probabilities.
   * 
   * @param {number} languageTokenVsRandomProbabilityScale - A scale between 0 and 1, where 0 is random and 1 is language probabilities.
   * @param {Function} randomFunc - A function that generates a random number between 0 and 1. If not provided, the default random function is used.
   * @returns {string|null} - The selected token based on the random value, or null if no token is selected.
   */
  randomizeTokenRandomToLanguageProbabilities(languageTokenVsRandomProbabilityScale = 1, randomFunc = null) {
    randomFunc ??= LanguageTree.defaultRandomFunc;
    let tokenProbabilitiesBase = this.tokenProbabilities['_'];
    let entries = Object.entries(tokenProbabilitiesBase.probs);
    let averageProb = tokenProbabilitiesBase.total / entries.length;
    let rando = randomFunc() * tokenProbabilitiesBase.total;    
    for (let [key, value] of entries) {
      value = averageProb + (value - averageProb) * languageTokenVsRandomProbabilityScale;
      if (rando < value) return key;
      rando -= value;
    }
    return null;
  }

  /**
   * Randomizes a token based on previous tokens and various probability weights.
   *
   * @param {string[]} prevTokens - The array of previous tokens.
   * @param {number} [standardProbabilityWeight=1] - The weight for standard probability.
   * @param {number} [tokenRepeatWeight=1] - The weight for repeating tokens.
   * @param {number} [languageTokenVsRandomProbabilityScale=1] - 1 for language probabilities, 0 for random.
   * @param {function} [randomFunc=null] - The custom random function to use. Defaults to LanguageTree.defaultRandomFunc.
   * @returns {string|null} - The randomized token or null if no token is found.
   */
  randomizeTokenFromPrevious(prevTokens, standardProbabilityWeight = 1, tokenRepeatWeight = 1, languageTokenVsRandomProbabilityScale = 1, randomFunc = null) {
    if (!(prevTokens?.length))
      return this.randomizeToken(randomFunc);

    randomFunc ??= LanguageTree.defaultRandomFunc;

    let tokenProbabilitiesBase = this.tokenProbabilities['_'];
    let total = 0;
    let probs = {};

    let entries = Object.entries(tokenProbabilitiesBase.probs);
    let averageProb = tokenProbabilitiesBase.total / entries.length;
    // Set probabilities for base tokens
    for (let [tok, prob] of entries) {
      let val = (averageProb + (prob - averageProb) * languageTokenVsRandomProbabilityScale) * standardProbabilityWeight;
      probs[tok] = val;
      total += val;
    }

    // Add tokens pair lookup probs
    prevTokens.forEach(token => {
      for (let [pairTok, pairProb] of Object.entries(this.tokenProbabilities[token].probs)) {
        probs[pairTok] += pairProb;
        total += pairProb;
      }
    });
    // Remove probabilities from same tokens
    prevTokens.forEach(token => {
      let oldValue = probs[token];
      if (!oldValue) return;
      let newValue = oldValue * tokenRepeatWeight;
      let delta = newValue - oldValue;
      probs[token] = newValue;
      total += delta;
    });

    // Randomize
    let rando = randomFunc() * total;
    for (const [key, value] of Object.entries(probs)) {
      if (rando < value) return key;
      rando -= value;
    }
    return null;
  }

  /**
   * Randomizes token probabilities modified by extra probabilities and a factor.
   *
   * @param {Map<string, number>} extraProbs - A map of tokens to their extra probability factors.
   * @param {number} factor - A factor to scale probabilities -1..1
   * @param {function} [randomFunc] - An optional random function to use. Defaults to LanguageTree.defaultRandomFunc.
   * @returns {string|null} - The selected token based on the randomized probabilities, or null if no token is selected.
   */
  randomizeTokenExtraProbMap(extraProbs, factor, randomFunc) {
    randomFunc ??= LanguageTree.defaultRandomFunc;

    let freqCopy = new Map(this.tokenProbabilities);
    let totalFreq = 1.0;
    for (const [token, extraProb] of extraProbs) {
      let oldValue = freqCopy.get(token);
      if (!oldValue) continue;
      let newValue = oldValue * Math.max(1 + extraProb * factor, 0);
      // console.log(token, extraProb, oldValue, newValue);
      totalFreq += newValue - oldValue;
      freqCopy.set(token, newValue);
    }
    // console.log('Total freq:', totalFreq);
    if (totalFreq) {
      let rando = randomFunc() * totalFreq;
      for (const [key, value] of freqCopy) {
        if (rando < value) return key;
        rando -= value;
      }
    }
    // Fall back to default randomization
    return this.randomizeToken(randomFunc);
  }

  /**
 * Randomizes token probabilities modified by extra probabilities and a factor.
 *
 * @param {List<string>} extraProbs - A list of tokens to inform the extra probabilities. Tokens can repeat.
 * @param {number} factor - A factor to scale probabilities, e.g. 0.2 for 80% decrease.
 * @param {number} [languageTokenVsRandomProbabilityScale=1] - A scale between 0 and 1, where 0 is random and 1 is language probabilities.
 * @param {function} [randomFunc] - An optional random function to use. Defaults to LanguageTree.defaultRandomFunc.
 * @returns {string|null} - The selected token based on the randomized probabilities, or null if no token is selected.
 */
  randomizeTokenExtraProbs(extraProbs, factor, languageTokenVsRandomProbabilityScale = 1, randomFunc = null) {
    randomFunc ??= LanguageTree.defaultRandomFunc;

    let tokenProbabilitiesBase = this.tokenProbabilities['_'];
    let total = 0;
    let probs = {};

    let entries = Object.entries(tokenProbabilitiesBase.probs);
    let averageProb = tokenProbabilitiesBase.total / entries.length;
    // Set probabilities for base tokens
    for (let [tok, prob] of entries) {
      let val = averageProb + (prob - averageProb) * languageTokenVsRandomProbabilityScale;
      probs[tok] = val;
      total += val;
    }

    for (const token of extraProbs) {
      let oldValue = probs[token];
      if (!oldValue) continue;
      let newValue = oldValue * factor;
      // console.log(token, extraProb, oldValue, newValue);
      total += newValue - oldValue;
      probs[token] = newValue;
    }
    // console.log('Total freq:', total);
    if (total) {
      let rando = randomFunc() * total;
      for (const [key, value] of Object.entries(probs)) {
        if (rando < value) return key;
        rando -= value;
      }
    }
    // Fall back to default randomization
    return this.randomizeToken(randomFunc);
  }

  // #addTempTokens(probs, negProbs, totalTmpProbs, mul = 1.0, tokenRandom = 0.0) {
  //   for (const [key, value] of Object.entries(probs)) {
  //     let negProb = 0;
  //     let prob = value === 0 ? 0 : (lerp(value, 1, tokenRandom) * mul);

  //     if (negProbs?.has(key)) {
  //       negProb = negProbs.get(key);
  //       prob *= (1 - negProb);
  //     }

  //     totalTmpProbs += prob;
  //     this.#frequenciesTemp.set(key, prob);
  //   }
  //   return totalTmpProbs;
  // }

  // Queries

  // randomizeTokenWithProbabilities(negProbs, addlTokens, baseTokensOnly = false, tokenRandom = 0.0, randomFunc) {
  //   randomFunc ??= LanguageTree.defaultRandomFunc;

  //   let totalTmpProbs = 0;
  //   this.#frequenciesTemp.clear();

  //   totalTmpProbs = this.#addTempTokens(
  //     baseTokensOnly ? this.#frequenciesBase : this.#frequencies,
  //     negProbs,
  //     totalTmpProbs,
  //     1.0,
  //     tokenRandom
  //   );

  //   if (!baseTokensOnly && addlTokens) {
  //     totalTmpProbs = this.#addTempTokens(
  //       addlTokens,
  //       negProbs,
  //       totalTmpProbs,
  //       totalTmpProbs,
  //       tokenRandom
  //     );
  //   }

  //   let rando = randomFunc() * totalTmpProbs;
  //   for (const [key, prob] of this.#frequenciesTemp) {
  //     if (rando < prob) return key;
  //     rando -= prob;
  //   }

  //   throw new Error('No letters available');
  // }

  /**
   * Returns a list of all possible *partial* words by replacing wildcard tokens in the given word.
   *
   * @param {string} word - The word containing zero or more wildcard tokens to be replaced.
   * @param {Map<string, number>} results - A dictionary to store the valid partial words, with
   * an integer value representing the validity (1: partial, 2: full).
   * @returns {Map<string, number>} resulting dictionary.
   */
  getAllPartialWildcardWords(word, results = new Map()) {
    const wildIdx = word.indexOf(LanguageTree.WildcardToken);
    if (wildIdx < 0) {
      const partialOrValid = this.isPartialOrFullWord(word);
      if (partialOrValid)
        results.set(word, partialOrValid);
      return results;
    }

    const part = wildIdx === 0 ? '' : word.slice(0, wildIdx);
    const wildcardOptions = wildIdx === 0 ?
      this.allTokensUpper :
      this.nextTokensInPartialWord(part);

    if (!wildcardOptions) return results;

    const rest = word.slice(wildIdx + 1);
    for (const option of wildcardOptions) {
      this.getAllPartialWildcardWords(part + option + rest, results);
    }
    return results;
  }

  /**
   * Retrieves all partial wildcard words from the given token list.
   * @param {Array<string>} tokenList - The list of tokens to process.
   * @param {Map<string, number>} results - A dictionary to store the valid partial words, with
   * an integer value representing the validity (1: partial, 2: full).
   * @returns {Map<string, number>} resulting dictionary.
   */
  getAllPartialWildcardWordsFromTokenList(tokenList, results = new Map()) {
    const wildIdx = tokenList.indexOf(LanguageTree.WildcardToken);
    if (wildIdx < 0) {
      const partialOrValid = this.isPartialOrFullWordFromTokenList(tokenList);
      if (partialOrValid)
        results.set(tokenList.join(''), partialOrValid);
      return results;
    }

    const part = wildIdx === 0 ? [] : tokenList.slice(0, wildIdx);
    const wildcardOptions = wildIdx === 0 ?
      this.allTokensUpper :
      this.nextTokensInPartialWordFromTokenList(part);

    if (!wildcardOptions) return results;

    const rest = tokenList.slice(wildIdx + 1);
    for (const option of wildcardOptions) {
      this.getAllPartialWildcardWordsFromTokenList(part.concat(option, rest), results);
    }
    return results;
  }

  /**
   * Recursively finds all valid words by replacing wildcard tokens in the given word.
   *
   * @param {string} word - The word containing wildcard tokens to be replaced.
   * @param {Set<string>} results - A set of all valid words.
   * @returns {Set<string>} resulting set.
   */
  getAllValidWildcardWords(word, results = new Set()) {
    const wildIdx = word.indexOf(LanguageTree.WildcardToken);
    if (wildIdx < 0) {
      if (this.isValidWord(word)) {
        results.add(word);
      }
      return results;
    }

    const part = wildIdx === 0 ? '' : word.slice(0, wildIdx);
    const wildcardOptions = wildIdx === 0 ?
      this.allTokensUpper :
      this.nextTokensInPartialWord(part);

    if (!wildcardOptions) return results;

    const rest = word.slice(wildIdx + 1);
    for (const option of wildcardOptions) {
      this.getAllValidWildcardWords(part + option + rest, results);
    }
    return results;
  }

  /**
   * Retrieves all valid wildcard words from the given token list.
   * @param {Array<string>} tokenList - The list of tokens to process.
   * @param {Set<string>} [results=new Set()] - A set to store the valid words found.
   * @returns {Set<string>} Resulting set of valid words.
   */
  getAllValidWildcardWordsFromTokenList(tokenList, results = new Set()) {
    const wildIdx = tokenList.indexOf(LanguageTree.WildcardToken);
    if (wildIdx < 0) {
      if (this.isValidWordFromTokenList(tokenList)) {
        results.add(tokenList.join(''));
      }
      return results;
    }

    const part = wildIdx === 0 ? [] : tokenList.slice(0, wildIdx);
    const wildcardOptions = wildIdx === 0 ?
      this.allTokensUpper :
      this.nextTokensInPartialWordFromTokenList(part);

    if (!wildcardOptions) return results;

    const rest = tokenList.slice(wildIdx + 1);
    for (const option of wildcardOptions) {
      this.getAllValidWildcardWordsFromTokenList(part.concat(option, rest), results);
    }
    return results;
  }

  /**
   * Finds and returns a valid word by replacing a wildcard token in the given word.
   * Returns null if no wildcards words are available, or if word is invalid.
   *
   * @param {string} word - The word containing a wildcard token to be replaced.
   * @returns {string|null} - The valid word with the wildcard replaced, or null if no valid word is found.
   */
  getValidWildcardWord(word) {
    const wildIdx = word.indexOf(LanguageTree.WildcardToken);
    if (wildIdx < 0)
      return this.isValidWord(word) ? word : null;
    
    const part = wildIdx === 0 ? '' : word.slice(0, wildIdx);
    const wildcardOptions = wildIdx === 0 ?
      this.allTokensUpper :
      this.nextTokensInPartialWord(part);

    const rest = word.slice(wildIdx + 1);
    console.log(wildIdx, part, wildcardOptions);
    for (const option of wildcardOptions) {
      let wildcardWord = this.getValidWildcardWord(part + option + rest);
      if (wildcardWord)
        return wildcardWord;
    }
    return null;
  }

  /**
   * Retrieves a valid wildcard word from the given token list.
   *
   * @param {Array<string>} tokenList - The list of tokens to check.
   * @returns {Array<string>|null} - The valid wildcard word, or null if not found.
   */
  getValidWildcardWordFromTokenList(tokenList) {
    const wildIdx = tokenList.indexOf(LanguageTree.WildcardToken);
    if (wildIdx < 0)
      return this.isValidWordFromTokenList(tokenList) ? tokenList : null;

    const part = wildIdx === 0 ? [] : tokenList.slice(0, wildIdx);
    const wildcardOptions = wildIdx === 0 ?
      this.allTokensUpper :
      this.nextTokensInPartialWordFromTokenList(part);

    if (wildcardOptions) {
      for (const option of wildcardOptions) {
        let wildcardWord = this.getValidWildcardWordFromTokenList(part.concat(option, tokenList.slice(wildIdx + 1)));
        if (wildcardWord)
          return wildcardWord;
      }
    }
    return null;
  }

  /**
   * Checks if the given word is a valid partial word.
   *
   * @param {string} word - The word to check.
   * @returns {boolean} True if the word is a valid partial word, false otherwise.
   */
  isValidPartialWord(word) {
    return !word.length ?
      false :
      !!this.#tokenTree.isPartialOrFullWord(word.toUpperCase(), this.allTokensUpper);
  }

  /**
   * Checks if the given token list is a valid partial word.
   *
   * @param {Array<string>} tokenList - The list of tokens to check.
   * @returns {boolean} True if the token list is a valid partial word, false otherwise.
   */
  isValidPartialWordFromTokenList(tokenList) {
    return !tokenList?.length ?
      false :
      !!this.#tokenTree.isPartialOrFullWordFromTokenList(tokenList);
  }

  /**
   * Checks if the given word is a valid word according to the language tree.
   *
   * @param {string} word - The word to validate.
   * @returns {boolean} - Returns true if the word is a valid full word, otherwise false.
   */
  isValidWord(word) {
    return word.length < LanguageTree.MinWordLength ?
      false :
      this.#tokenTree.isPartialOrFullWord(word.toUpperCase(), this.allTokensUpper) == 2;
  }

  /**
   * Checks if the given token list is a valid word according to the language tree.
   *
   * @param {Array<string>} tokenList - The list of tokens to validate.
   * @returns {boolean} - Returns true if the token list is a valid full word, otherwise false.
   */
  isValidWordFromTokenList(tokenList) {
    return !tokenList?.length ?
      false :
      this.#tokenTree.isPartialOrFullWordFromTokenList(tokenList) == 2;
  }

  /**
   * Checks if the given word is a valid partial or full word according to the language tree.
   *
   * @param {string} word - The word to check.
   * @returns {int} - 0 if not a word, 1 if partial word, 2 if full word
   */
  isPartialOrFullWord(word) {
    return !word.length ?
      0 :
      this.#tokenTree.isPartialOrFullWord(word.toUpperCase(), this.allTokensUpper);
  }

  /**
   * Checks if the given token list is a valid partial or full word according to the language tree.
   *
   * @param {Array<string>} tokenList - The list of tokens to check.
   * @returns {int} - 0 if not a word, 1 if partial word, 2 if full word
   */
  isPartialOrFullWordFromTokenList(tokenList) {
    return this.#tokenTree.isPartialOrFullWordFromTokenList(tokenList);
  }

  /**
   * Retrieves the next possible letters in a partially completed word.
   *
   * @param {string} word - The partially completed word.
   * @returns {Array<string>|null} An array of next possible letters if available, otherwise null.
   */
  nextTokensInPartialWord(word) {
    if (!word.length) return null;
    const partial = this.#tokenTree.getPartialWordNode(word.toUpperCase(), this.allTokensUpper);
    return partial?.nextTokens ? Array.from(partial.nextTokens.keys()) : null;
  }

  /**
   * Retrieves the next possible letters in a partially completed word from a token list.
   *
   * @param {Array<string>} tokenList - The list of tokens representing the partially completed word.
   * @returns {Array<string>|null} An array of next possible letters if available, otherwise null.
   */
  nextTokensInPartialWordFromTokenList(tokenList) {
    if (!Array.isArray(tokenList) || tokenList.length === 0) return null;
    const partial = this.#tokenTree.getPartialWordNodeFromTokenList(tokenList);
    return partial?.nextTokens ? Array.from(partial.nextTokens.keys()) : null;
  }

  // Retrieves a random word of the specified length from the token tree.
  getRandomWord = (length, randomFunc = null) => this.#tokenTree.getRandomWordFromNode(length, this.tokensUpper, randomFunc);

  // Generates a random word starting with the given prefix and extending it by the specified additional length.
  getRandomWordCompletion(prefix, additionalLength, randomFunc = null) {
    prefix = prefix.toUpperCase();
    const randSuffix = this.#tokenTree.getPartialWordNode(prefix, this.tokensUpper)?.
      getRandomWordFromNode(additionalLength, this.tokensUpper, randomFunc);
    return randSuffix ? (prefix + randSuffix) : null;
  }

  // Retrieves the next game token for a given word.
  getNextGameToken = (word) => LanguageTree.getNextToken(word, this.tokensUpper);

  // Retrieves a readable token from the tokensUpperToReadable map.
  // If the token is not found in the map, it returns the original token.
  getReadableToken = (tok) => this.tokensUpperToReadable.get(tok) || tok;

  /// Retrieves the group of a given token from the TokenGroups map.
  getTokenGroup = (tok) => this.tokenGroups.get(tok) ?? 0;

  //
  // Static functions
  //

  // Read text file as JSON, online (default) or offline
  static async readFileJSON(filepath, offline) {
    if (offline) {
      const fs = await loadFs();
      const configContent = await fs.readFile(`${LanguageTree.OfflineFileRootPath}${LanguageTree.LangDataFilePath}${filepath}`, 'utf-8');
      return JSON.parse(LanguageTree.stripBOM(configContent));
    }

    const response = await fetch(`${LanguageTree.LangDataFilePath}${filepath}`);
    if (!response.ok) {
      throw new Error(`${filepath} file missing`);
    }
    return await response.json();
  }

    // Read text file, online (default) or offline
  static async readFile(filepath, offline) {
    if (offline) {
      const fs = await loadFs();
      const configContent = await fs.readFile(`${LanguageTree.OfflineFileRootPath}${LanguageTree.LangDataFilePath}${filepath}`, 'utf-8');
      return LanguageTree.stripBOM(configContent);
    }

    const response = await fetch(`${LanguageTree.LangDataFilePath}${filepath}`);
    if (!response.ok) {
      throw new Error(`${filepath} file missing`);
    }
    return await response.text();
  }


  static defaultRandomFunc = () => Math.random();

  static getRandomRange(min, max, randomFunc) {
    randomFunc ??= LanguageTree.defaultRandomFunc;

    if (Number.isInteger(min) && Number.isInteger(max)) {
      return Math.floor(randomFunc() * (max - min)) + min;
    }
    return randomFunc() * (max - min) + min;
  }

  static getNextToken(word, tokenSet) {
    if (word.length === 0) return null;

    for (let tokLen = 1; tokLen <= LanguageTree.MaxTokenLen && tokLen <= word.length; tokLen++) {
      const token = word.slice(0, tokLen);
      if (tokenSet.has(token)) return token;
    }
    return null;
  }

  static lerp = (start, end, amt) => ((1 - amt) * start + amt * end);

  static getAveragedRandom01(avg, randomFunc) {
    randomFunc ??= LanguageTree.defaultRandomFunc;
    const rand = randomFunc();
    return rand < 0.5 ?
      LanguageTree.lerp(0, avg, rand * 2) :
      LanguageTree.lerp(avg, 1, (rand - 0.5) * 2);
  }

  static getAveragedRandomRange(min, avg, max) {
    const rand = LanguageTree.getAveragedRandom01((avg - min) / (max - min));
    return LanguageTree.lerp(min, max, rand);
  }

  // Remove first character (byte order mark) if available
  static stripBOM = (data) => data.charCodeAt(0) === 0xFEFF ? data.slice(1) : data;


  static replaceRandomLetters(str, numToReplace, replacementChar, randomFunc) {
    randomFunc ??= LanguageTree.defaultRandomFunc;
    let chars = str.split('');
    let availableIndices = [...Array(str.length).keys()]; // [0,1,2,...,length-1]

    // Ensure we don't try to replace more characters than available
    numToReplace = Math.min(numToReplace, str.length);

    for (let i = 0; i < numToReplace; i++) {
        // Get random index from remaining available positions
        const randomPos = Math.floor(randomFunc() * availableIndices.length);
        const indexToReplace = availableIndices[randomPos];

        // Replace the character
        chars[indexToReplace] = replacementChar;

        // Remove this index from available positions
        availableIndices.splice(randomPos, 1);
    }

    return chars.join('');
}

  //
  //  Offline processing (menu items)
  //

  static async exportTree(langCode) {
    try {

      const langInstance = LanguageTree.GetInstance();

      // Configuration
      langInstance.readLangConfig(langCode, true);

      // Read words file
      const wordsContent = await LanguageTree.readFile(`${LanguageTree.LangWordsFilePrefix}${langCode}.txt`, true);

      // Process words and create tree
      const { numWords, treeData, probabilities } = await LanguageTree.processWords(LanguageTree.stripBOM(wordsContent), langInstance);

      const fs = await loadFs();

      // Save tree file
      await fs.writeFile(`${LanguageTree.OfflineFileRootPath}${LanguageTree.LangDataFilePath}${LanguageTree.LangTreeFilePrefix}${langCode}.txt`, treeData);

      // Save probabilities file
      await fs.writeFile(`${LanguageTree.OfflineFileRootPath}${LanguageTree.LangDataFilePath}${LanguageTree.LangProbFilePrefix}${langCode}.json`, JSON.stringify(probabilities, null, 2));

      LanguageTree.GeneralData.letterTreeSize = treeData.length;

      console.log(`#words: ${numWords}`, LanguageTree.GeneralData);

    } catch (error) {
      console.error('Error exporting tree:', error);
    }
  }

  /**
   * Process words to create tree and probability data
   * @param {string} content - Raw words content
   * @returns {Promise<{treeData: string, probabilities: Object, numWords: Number}>}
   */
  static async processWords(content, langInstance) {
    const words = content.split('\n')
      .map(word => word.trim().toUpperCase())
      .filter(word => word.length >= LanguageTree.MinWordLength);

    // Initialize probabilities, with '_' for all tokens by themselves

    const initializeProbabilities = () => {
      const probabilitiesDict = {};
      const probabilitiesData = { total: 0, probs: probabilitiesDict };
      for (let token of langInstance.tokensUpper)
        probabilitiesDict[token] = 0;
      return probabilitiesData;
    };

    // Initialize with all sorted tokens at 0
    const probabilitiesBase = initializeProbabilities();
    langInstance.tokenProbabilities = { '_': probabilitiesBase };
    for (let token of langInstance.tokensUpper)
      langInstance.tokenProbabilities[token] = initializeProbabilities();

    const tree = new TokenNode();

    words.forEach(word => {
      let prevToken;
      // Create words for all tokens, e.g QUEST would become Q-U-E-S-T and QU-E-S-T
      tree.addWord(word, [ langInstance.langTokensUpper, langInstance.gameOnlyTokensUpper ]);

      // Probabilities for game tokens only
      for (let i = 0, tok;
        tok = LanguageTree.getNextToken(word.slice(i), langInstance.tokensUpper);
        i += tok.length) {
        ++probabilitiesBase.probs[tok];
        ++probabilitiesBase.total;

        if (prevToken) {
          let probsPrevToken = langInstance.tokenProbabilities[prevToken];
          ++probsPrevToken.probs[tok];
          ++probsPrevToken.total;

          // Also do reverse
          // if (prevToken !== tok) {
          //   let probsTok = langInstance.tokenProbabilities[tok];
          //   ++probsTok.probs[prevToken];
          //   ++probsTok.total;
          // }
        }
        prevToken = tok;
      }
    });

    return {
      numWords: words.length,
      treeData: tree.serialize(),
      probabilities: langInstance.tokenProbabilities
    };
  }

  static async testTree(langCode) {
    const langInstance = LanguageTree.GetInstance();
    await langInstance.initialize(langCode, true);  // Offline initialization

    console.log('Random words:');
    for (let i = LanguageTree.MinWordLength; i < 20; ++i) {
      let word = langInstance.getRandomWord(i);
      if (!word)
        break;
      console.log(i, word);
    }

    let word = langInstance.getRandomWord(LanguageTree.MinWordLength);
    console.log(`\nCompletion: (random word '${word}')`);
    while (word) {
      let tokenOptions = langInstance.nextTokensInPartialWord(word);
      console.log(`Possible letters after '${word}':`, tokenOptions);
      if (tokenOptions?.length)
        word += tokenOptions[0];
      else
        word = null;
    }

    // word = 'FL*W**';
    let baseWord = langInstance.getRandomWord(7);
    word = LanguageTree.replaceRandomLetters(baseWord, 3, LanguageTree.WildcardToken);
    console.log(`'${baseWord}' with wildcards -> '${word}' completion:`, langInstance.getAllValidWildcardWords(word));

    word = langInstance.getRandomWord(2); // 'it';
    console.log(`\nRandom words from '${word}':`);

    //console.log(langInstance.isValidWord('its'));

    for (let i = 1; i < 10; i++) {
      let randWord = langInstance.getRandomWordCompletion(word, i);
      console.log(`${word.length + i} letters`, randWord ?? 'N/A');
    }
  }
}

class TokenNode {
  // Map of next tokens token(string) -> TokenNode
  nextTokens = null;
  // Is a complete word (along with previous tree TokenNode's)
  isWord = false;

  addWord(word, tokenSets) {
    tokenSets.forEach(tokenSet => {
      const token = LanguageTree.getNextToken(word, tokenSet);
      if (token) {
        let tokenNode = this.#addWordToken(token);
        let restStr = word.slice(token.length);
        if (restStr.length > 0) {
          tokenNode.addWord(restStr, tokenSets);
        } else {
          tokenNode.isWord = true;
          ++LanguageTree.GeneralData.numWords;
        }
      }
    });
  }

  #addWordToken(token) {
    this.nextTokens ??= new Map();

    let wordTokenNode = this.nextTokens.get(token);
    if (!wordTokenNode) {
      wordTokenNode = new TokenNode();
      ++LanguageTree.GeneralData.numTokens;
      this.nextTokens.set(token, wordTokenNode);
    }
    return wordTokenNode;
  }

  /**
   * Checks if the given word is a partial or full word in the language tree.
   *
   * @param {string} word - The word to check.
   * @param {Set<string>} tokenSet - The set of valid tokens.
   * @returns {int} - 0 if not a word, 1 if partial word, 2 if full word.
   */
  isPartialOrFullWord(word, tokenSet) {
    let currentNode = this;
    while (word.length > 0) {
      const token = LanguageTree.getNextToken(word, tokenSet);
      if (!token || !currentNode.nextTokens || !currentNode.nextTokens.has(token)) {
        return 0;
      }
      currentNode = currentNode.nextTokens.get(token);
      word = word.slice(token.length);
    }
    return currentNode.isWord ? 2 : 1;
  }

  /**
   * Checks if the given token list is a partial or full word in the language tree.
   *
   * @param {Array<string>} tokenList - The list of tokens to check.
   * @returns {int} - 0 if not found, 1 if partial, 2 if full valid word
   */
  isPartialOrFullWordFromTokenList(tokenList) {
    let currentNode = this;
    for (const token of tokenList) {
      if (!currentNode.nextTokens || !currentNode.nextTokens.has(token)) {
        return 0;
      }
      currentNode = currentNode.nextTokens.get(token);
    }
    return currentNode.isWord ? 2 : 1;
  }

  /**
   * Retrieves the node in the language tree that corresponds to the given partial word.
   *
   * @param {string} word - The partial word to search for in the language tree.
   * @param {Set<string>} tokenSet - The set of valid tokens to use for parsing the word.
   * @returns {LanguageTree|null} The node corresponding to the partial word, or null if the word cannot be matched.
   */
  getPartialWordNode(word, tokenSet) {
    let currentNode = this;
    while (word.length > 0) {
      const token = LanguageTree.getNextToken(word, tokenSet);
      if (!token || !currentNode.nextTokens || !currentNode.nextTokens.has(token)) {
        return null;
      }
      currentNode = currentNode.nextTokens.get(token);
      word = word.slice(token.length);
    }
    return currentNode;
  }

  /**
   * Retrieves the node in the language tree that corresponds to the given partial word.
   *
   * @param {string} word - The partial word to search for in the language tree.
   * @param {Set<string>} tokenSet - The set of valid tokens to use for parsing the word.
   * @returns {LanguageTree|null} The node corresponding to the partial word, or null if the word cannot be matched.
   */
  getPartialWordNodeFromTokenList(tokenList) {
    if (!Array.isArray(tokenList) || tokenList.length === 0) return null;
    let currentNode = this;
    for (const token of tokenList) {
      if (!currentNode.nextTokens || !currentNode.nextTokens.has(token)) {
        return null;
      }
      currentNode = currentNode.nextTokens.get(token);
    }
    return currentNode;
  }

  // Cache for words of a specific length and token set
  // This is a map of (token set, length) -> words
  cachedWordsOfTokenSetLength = new Map(); 

  // Retrieves all words of a specified length from the language tree node.
  getAllWordsOfLengthRecursive(numTokens, tokenSet, word = '', resultWords = []) {
    if (!this.nextTokens || this.nextTokens.size === 0) return null;
    for (const [token, node] of this.nextTokens) {
      if (!tokenSet.has(token))
        continue;

      if (numTokens <= 1) {
        if (node.isWord)
          resultWords.push(word + token);
      }
      else {
        node.getAllWordsOfLengthRecursive(numTokens - 1, tokenSet, word + token, resultWords);
      }
    }
    return resultWords;
  }

  getAllWordsOfLength(numTokens, tokenSet) {
    // Cache check
    let resultWords = this.cachedWordsOfTokenSetLength.get((tokenSet, numTokens));
    if (resultWords) {
      // console.log('Cache hit:', resultWords.length);
      return resultWords;
    }

    // Calculate words of length numTokens
    resultWords = this.getAllWordsOfLengthRecursive(numTokens, tokenSet);

    // Cache the result
    this.cachedWordsOfTokenSetLength.set((tokenSet, numTokens), resultWords);
    // console.log('Cache miss:', resultWords.length);
    return resultWords;
  }

  // Retrieves a random word of a specified length from the language tree node.
  // If no word is found, returns null.
  getRandomWordFromNode(numTokens, tokenSet, randomFunc = null) {
    const resultWordSet = this.getAllWordsOfLength(numTokens, tokenSet);
    const rand = LanguageTree.getRandomRange(0, resultWordSet.length, randomFunc);
    return resultWordSet[rand];
  }
  
  serialize() {
    if (!this.nextTokens) return '';

    let result = this.isWord ? '[' : '(';
    let first = true;

    for (const [token, nextLetter] of this.nextTokens) {
      if (first) {
        first = false;
      }
      result += token.length === 1 ? token : `{${token}}`;
      result += nextLetter.serialize();
    }

    return result + (this.isWord ? ']' : ')');
  }

  deserialize(text, posRef = { value: 0 }) {

    this.isWord = true;
    const peek = () => text[posRef.value] || '';
    const read = () => text[posRef.value++] || '';
    const incWordCount = () => this.isWord && ++LanguageTree.GeneralData.numWords;

    switch (peek()) {
      case '':
        return;

      case ']':
      case ')':
        incWordCount();
        return;

      case '(':
        this.isWord = false;
        break;

      case '[':
        break;

      default:
        incWordCount();
        return;
    }

    incWordCount();

    posRef.value++;

    while (posRef.value < text.length) {
      const c = read();
      if (c === ')' || c === ']') return;

      let token;
      if (c === '{') {
        token = '';
        while (posRef.value < text.length) {
          const nextChar = read();
          if (!nextChar || nextChar === '}') break;
          token += nextChar;
        }
      } else {
        token = c;
      }

      const nl = this.#addWordToken(token);
      nl.deserialize(text, posRef);
    }
  }
}

// Language module usage example:
/*
// Initialize the language system
const lang = Lang.GetInstance();
await lang.initialize();

// Get a random word of length 5
const word = lang.getRandomWord(5);

// Check if a word is valid
const isValid = lang.isValidWord('HELLO');

// Get next possible letters for a partial word
const nextLetters = lang.nextTokensInPartialWord('HE');

// Get a random token based on frequencies
const token = lang.randomizeToken();

// Add extra probabilities and get a token
lang.finalizeProbs({
  'A': 0.1,
  'B': 0.2
});
const tokenWithProb = lang.randomizeTokenWithProbabilities(
  new Map([['X', 0.5]]),  // negative probabilities
  { 'Y': 0.3 },          // additional tokens
  false,                 // use base tokens only
  0.2                    // token randomness
);
*/
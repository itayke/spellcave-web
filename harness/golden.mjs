// Deterministic golden-output battery for the pure-logic engine.
//
// Given an engine directory + its repo root (for offline langData), this exercises the
// seed-driven primitives the cave generator depends on and returns a JSON-serializable
// snapshot. Running it against the current Phaser engine and the new ported engine must
// produce byte-identical output — that proves the logic layer survived the port intact.
//
// The seed comes from CaveData.Default.Seed, the same fixed seed the game ships with.

// Config constants the cave generator feeds into token randomization. Both engines ship the
// same values; hardcoding them here keeps the parity test about engine *logic*, and avoids
// importing the current GameConstants.js (which references the `Phaser` global and would throw
// when evaluated under Node).
const ADJACENT_TOKEN_REPEAT_WEIGHT = 0.2;            // GameConstants.Cave.AdjacentTokenRepeatWeight
const LANGUAGE_TOKEN_VS_RANDOM_SCALE = 0.75;         // GameConstants.Cave.LanguageTokenVsRandomProbabilityScale

export async function generateGolden(engineDir, repoRoot) {
  const { default: LanguageTree } = await import(`${engineDir}/LanguageTree.js`);
  const { default: HashManager } = await import(`${engineDir}/HashManager.js`);
  const { default: CaveData } = await import(`${engineDir}/CaveData.js`);

  // Point offline file loading at this engine's own repo (absolute, so it's cwd-independent).
  LanguageTree.OfflineFileRootPath = `${repoRoot}/public/`;
  LanguageTree.Debug = 0;

  const lang = LanguageTree.GetInstance();
  const ok = await lang.initialize('en', true); // offline = read from public/assets/langData
  if (!ok) throw new Error(`engine at ${engineDir} failed to initialize`);

  const seed4 = CaveData.Default.Seed;
  const out = {};

  // 1. Raw RNG determinism (sfc32 from the fixed seed)
  const rfRaw = HashManager.GetRandomFunction(seed4);
  out.rngSequence = Array.from({ length: 24 }, () => rfRaw());

  // 2. String hashing determinism (used for save-state integrity)
  out.hashStrings = ['HELLO', 'spellcave', 'QUEST', 'FISHMONGER', '12345', '']
    .map(s => HashManager.HashString(s));

  // 3. Random words of each length, sharing one seeded function (order-sensitive)
  const rfWords = HashManager.GetRandomFunction(seed4);
  out.randomWords = [];
  for (let len = 2; len <= 14; len++)
    out.randomWords.push(lang.getRandomWord(len, rfWords) ?? null);

  // 4. Word validation + partial/full classification
  const testWords = ['QUEST', 'HELLO', 'ZZZZZ', 'FISHMONGER', 'RECHARGER', 'QUERY',
                     'QUERNS', 'ANGERED', 'CLOSETS', 'RUSHEE', 'CAT', 'A', 'XQ', 'QU'];
  out.isValidWord = testWords.map(w => lang.isValidWord(w));
  out.isPartialOrFull = testWords.map(w => lang.isPartialOrFullWord(w));

  // 5. Next possible tokens for partial words (trie traversal)
  out.nextTokens = ['QU', 'HEL', 'FIS', 'REC', 'ZZ', 'A']
    .map(w => lang.nextTokensInPartialWord(w));

  // 6. Wildcard expansion (Set -> sorted array for stable comparison)
  out.wildcards = ['CA?', 'QU??T', '?AT', 'FIS?']
    .map(w => Array.from(lang.getAllValidWildcardWords(w)).sort());

  // 7. Token-chain randomization (mirrors createRandomVerticalWordOnGrid filler at Cave.js:748)
  const rfChain = HashManager.GetRandomFunction(seed4);
  const chain = [];
  for (let i = 0; i < 40; i++) {
    const prev = chain.slice(Math.max(0, i - 3)); // up to 3 prior tokens, like grid neighbors
    chain.push(lang.randomizeTokenExtraProbs(
      prev,
      ADJACENT_TOKEN_REPEAT_WEIGHT,
      LANGUAGE_TOKEN_VS_RANDOM_SCALE,
      rfChain
    ));
  }
  out.extraProbChain = chain;

  // 8. randomizeTokenFromPrevious chain (alternate generation path)
  const rfPrev = HashManager.GetRandomFunction(seed4);
  const prevChain = [];
  for (let i = 0; i < 40; i++) {
    prevChain.push(lang.randomizeTokenFromPrevious(
      i ? [prevChain[i - 1]] : null, 1,
      ADJACENT_TOKEN_REPEAT_WEIGHT,
      LANGUAGE_TOKEN_VS_RANDOM_SCALE,
      rfPrev
    ));
  }
  out.prevChain = prevChain;

  // 9. Random word completions from a seeded prefix
  const rfComp = HashManager.GetRandomFunction(seed4);
  const prefix = lang.getRandomWord(2, rfComp);
  out.completions = [];
  for (let i = 1; i < 8; i++)
    out.completions.push(lang.getRandomWordCompletion(prefix, i, rfComp) ?? null);

  // Metadata snapshot
  out.meta = {
    numWords: LanguageTree.GeneralData.numWords,
    numTokens: LanguageTree.GeneralData.numTokens,
    letterTreeSize: LanguageTree.GeneralData.letterTreeSize,
    maxTokenLen: LanguageTree.MaxTokenLen,
    minWordLength: LanguageTree.MinWordLength,
  };

  return out;
}
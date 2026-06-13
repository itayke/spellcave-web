const CaveData = {

  Default: {
    MaxLevel: 10,

    MaxSpellstones: 3,

    // number of moves to start with
    StartMoves: 3,
    // number of hints to start with
    StartHints: 5,
    // number of spellstones to start with
    StartSpellstones: 3,
    
    // number of moves to award for each level completed
    LevelBonusMoves: 1,
    // number of spellstones to award for each level completed
    LevelBonusSpellstones: 0,

    // word lengths awarding extra moves
    WordLengthExtraMoves: [7, 10, 13, 16],
    // level row lengths
    //levelLengths: [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40],
    //LevelLengths: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
    LevelLengths: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
    // Test seed int*4, word to test: FISHMONGER/RECHARGER/QUERY/QUERNS, ANGERED, CLOSETS, RUSHEE, AIREHEAD
    // Left undefined for random seed
    Seed: [411365061, 4114016079, 99756496, 286630851]    
  }
}

export default CaveData;

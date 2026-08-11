// computerAuditSystem: The computer will audit all game settings, configurations, stats, and battle activity
// to create Computer Intelligence during all 'Single Player' game modes.
export const computerAuditSystem = {
    gameDifficulty: null, 

    playerMove: null,
    compMove: null,

    currentCompSp: null,
    currentPlayerSp: null,

    activePlayerCard: null,
    activePlayerCardDeck: [],
    activeCompCard: null, 
    activeCompCardDeck: [],

    previousCompMove: null,
    previousCompAttkPt: null,
    previousCompAttkMultiplier: null, 
    previousCompAttkPtWithMultiplier: null,

    previousPlayerMove: null,
    previousPlayerAttkPt: null,
    previousPlayerAttkMultiplier: null, 
    previousPlayerAttkPtWithMultiplier: null, 
    
    playerCardDeckEsse: {},
    compCardDeckEsse: [], 

    playerTotalCardSwaps: 0,
    playerPatternCardSwaps: {},
    compTotalCardSwaps: 0,
    compPatternCardSwaps: {}, 

    attksWithSupra: 0,
    supraAttked: 0,

    attksWithFere: 0,
    fereAttked: 0,

    attksWithBonum: 0,
    bonumAttked: 0, 
}; 
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

    playerAttksWithSupraTotal: 0,
    playerSupraAttkedTotal: 0,

    playerAttksWithFereTotal: 0,
    playerFereAttkedTotal: 0, 

    playerAttksWithBonumTotal: 0,
    playerBonumAttkedTotal: 0, 
}; 
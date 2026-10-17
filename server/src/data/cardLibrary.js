/**
 * The SERVER's source of truth for card stats.
 * The client sends card IDs only - never stats.
 * 
 * TODO: Move to a 'cards' table and cache in Redis.  
 */

export const CARD_LIBRARY = [
    // ---- Supra ----
    {
        id: 1,
        name: "Tobo The Fighter",
        shortName: "Tobo",
        cate: "Supra",
        atk: 45,
        def: 12,
        esse: 100,
        selected: false, 
        cardSprite: null,
    },

    {
        id: 2,
        name: "The One From System",
        shortName: "Jace",
        cate: "Supra",
        atk: 44,
        def: 14,
        esse: 100,
        selected: false,
        cardSprite: null,
    },

    {
        id: 3, 
        name: "Spunky With The Funky Draco",
        shortName: "Spunky",
        cate: "Supra",
        atk: 39, 
        def: 17,
        esse: 100,
        selected: false, 
        cardSprite: null,  
    },

    // ---- Fere ----
    {
        id: 4, 
        name: "Allybelle",
        shortName: "Ally",
        cate: "Fere",
        atk: 27,
        def: 15,
        esse: 100,
        selected: false, 
        cardSprite: null, 
    },

    {
        id: 5,
        name: "The Experiment",
        shortName: "Mason",
        cate: "Fere",
        atk: 24,
        def: 13,
        esse: 100,
        selected: false, 
        cardSprite: null, 
    },

    {
        id: 6,
        name: "The Trendsetter Rotao",
        shortName: "Rotao",
        cate: "Fere",
        atk: 25,
        def: 18, 
        esse: 100, 
        selected: false, 
        cardSprite: null, 
    },

    // ---- Bonum -----
    {
        id: 7,
        name: "Dan The Prol", 
        shortName: "Dan",
        cate: "Bonum",
        atk: 19,
        def: 22,
        esse: 100,
        selected: false,
        cardSprite: null, 
    },

    {
        id: 8,
        name: "Mac The Rat",
        shortName: "Mac",
        cate: "Bonum",
        atk: 16,
        def: 33,
        esse: 100,
        selected: false, 
        cardSprite: null, 
    },

    {
        id: 9,
        name: "A Karen",
        shortName: "Karen",
        cate: "Bonum", 
        atk: 15,
        def: 26,
        esse: 100, 
        selected: false, 
        cardSprite: null, 
    },

    {
        id: 10,
        name: "The Office Worker Ken",
        shortName: "Ken",
        cate: "Bonum", 
        atk: 16,
        def: 25,
        esse: 100,
        selected: false, 
        cardSprite: null, 
    }
];

const BY_ID = new Map(CARD_LIBRARY.map(c => [c.id, c]));

export function getCard(id){
    return BY_ID.get(Number(id)) || null;
}

/** 
 * Takes whatever the client sent and returns clean, server-owned card data. 
 * @returns {{ok: true, deck: Array} | {ok: false, error: string }} 
 */
export function buildCanonicalDeck(rawDeck){    
    // Check if the deck is actually an array:
    if (!Array.isArray(rawDeck) || rawDeck.length !== 4)
    {
        return { ok: false, error: 'A deck must contain exactly 4 Initiator cards' };
    }

    // Check if the deck id is a legit integer value:
    const ids = rawDeck.map(c => Number(c?.id));
    if (ids.some(id => !Number.isInteger(id)))
    {
        return { ok: false, error: 'Malformed deck data' };
    }

    // Check if the deck has four cards only:
    if (new Set(ids).size !== ids.length)
    {
        return { ok: false, error: 'Duplicate cards are not allowed' };
    }

    // Check if there actual card objects in the deck: 
    const cards = ids.map(getCard);
    if (cards.some(c => !c))
    {
        return { ok: false, error: 'Unknown card in deck' };
    }

    // 1 Supra / 1 Fere / 2 Bonum 
    const counts = { Supra: 0, Fere: 0, Bonum: 0 };
    cards.forEach(c => counts[c.cate]++);

    if (counts.Supra !== 1)     return { ok: false, error: 'Deck needs exactly 1 Supra card' };
    if (counts.Fere !== 1)      return { ok: false, error: 'Deck needs exactly 1 Fere card' };
    if (counts.Bonum !== 2)     return { ok: false, error: 'Deck needs exactly 2 Bonum card' };

    // Deep copy so a match can never mutate the library:
    return { ok: true, deck: cards.map(c => JSON.parse(JSON.stringify(c))) };
}
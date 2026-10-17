/**
 * --- The Battle Engine ---
 *
 * The authoritative rules of a Strive: We Are Zonis duel. The client sends
 * intents ('I attack', 'I defend', 'I swap to Mac'); this decides what actually
 * happened. Nothing here trusts a number that came off the wire - the decks are
 * the canonical ones cardLibrary.js built, and the dice are rolled on this side.
 *
 * Deliberately free of timers, sockets and I/O. It is a pure state machine:
 * feed it actions, read back state and events. MatchManager owns the clock and
 * the broadcasting; that split is what makes the rules testable without a server.
 *
 * The mechanics mirror GameBattleScene.js so a multiplayer duel feels like the
 * single-player one - same multiplier ladder, same damage formula, same SP.
 */

import { SINGULARITY_BY_ID } from '../data/singularityLibrary.js';

/** Every tunable number in one place - balance passes start here. */
export const RULES = {
    /** 0 = miss, 1 = critical. Rolled uniformly, exactly as in GameBattleScene. */
    ATTACK_MULTIPLIERS: [0, 1 / 2, 2 / 3, 3 / 4, 1],

    /** Singularity Points awarded per multiplier index (parallel to the ladder). */
    SP_PER_MULTIPLIER: [0, 20, 30, 40, 50],

    /** Repositioning is a sub-move: allowed on either side's turn, once each. */

    SP_CAP: 999,

    /** A defended hit is halved, but never fully absorbed. */
    DEFEND_DIVISOR: 2,

    SWAPS_PER_TURN: 1,

    /** How long a player has to act before the turn is passed for them. */
    TURN_MS: 30000,

    /** Consecutive auto-passes before the silent player loses the match. */
    MAX_CONSECUTIVE_TIMEOUTS: 3,

    /** Pattern Bonus Points needed to fill the meter and enter Pattern Bonus Mode. */
    PBM_THRESHOLD: 120,

    /** Attack base moves a player gets in Pattern Bonus Mode before it ends. */
    PBM_ATTACKS: 6,

    /** Extra SP per multiplier index while in Pattern Bonus Mode, on top of SP_PER_MULTIPLIER. */
    PBM_BONUS_SP: [0, 10, 15, 20, 25],

    /** Singularity Card slots each player holds. */
    SINGULARITY_SLOTS: 3,

    /**
     * Added to the next turn's clock after a Singularity attack, so the
     * opponent's 30s are not eaten by the cinematic the clients play first.
     * Keep it near the client's NOVA_BURST_TIMING total. A card whose
     * cinematic runs longer carries its own GRACE_MS - see AN_ARTIFACT.
     */
    SINGULARITY_ATTACK_GRACE_MS: 4500,

    /**
     * The same for a Singularity defence - the opponent's clock waits out the
     * field forming. Keep it near the client's CONTAINMENT_FIELD_TIMING.HOLD_MS.
     */
    SINGULARITY_DEFENCE_GRACE_MS: 3000,

    /**
     * A Healing card spends no turn, so this is added to the healer's own
     * clock instead - the mend plays out without eating into it. Keep it near
     * the client's LIGHT_MEND_TIMING.HOLD_MS. A card whose cinematic runs
     * longer carries its own GRACE_MS - see HEAVY_MEND_ATT.
     */
    SINGULARITY_HEAL_GRACE_MS: 3000,

    /**
     * The same for an Affliction card - it is a base move, so the turn passes
     * and the opponent's clock waits out the cast. Keep it near the client's
     * DARK_DISTURBANCE_TIMING.HOLD_MS.
     */
    SINGULARITY_AFFLICTION_GRACE_MS: 4300,
};

/** -- SINGULARITY CARD ATTRIBUTES -- */
// ---------------------------------------- NOVA BURST---------
const NOVA_BURST_ATT = {
    ATTACK_MULTIPLIERS: [2/3, 3/4, 1],
    SP_PER_MULTIPLIER: [2, 5, 10],
    PBM_BONUS_SP: 0,
    STRIKES: 2,
}

// ---------------------------------------- CONTAINMENT FIELD---------
// Raised on the active card by DEFEND. It stands until that card is next
// attacked, and takes the whole of that attack - both Nova Burst strikes.
const CONTAINMENT_FIELD_ATT = {
    EVADE_99_PERCENT_DAMAGE_FROM_ATTACKS: 0.99,
    // Singularity attacks it covers, by card id. One not listed here goes
    // straight through the field - and still breaks it.
    EVADE_99_PERCENT_DAMAGE_FROM_SINGULARITY_ATTACKS: ['nova_burst', 'an_artifact'],
}

// ---------------------------------------- LIGHT MEND---------
const LIGHT_MEND_ATT = {
    RESTORES_ESSE: 30,
}

// ---------------------------------------- DARK DISTURBANCE---------
// Cast on the opponent's active card. The card carries COSMIC DARKNESS with it
// through a swap, and bleeds ESSE after each attack it attempts - a miss
// included - until the attacks run out.
const DARK_DISTURBANCE_ATT = {
    AFFLICTION: 'COSMIC DARKNESS',
    ESSE_LOSS_AFTER_BASE_ATTACK: 10,
    NUMBER_OF_ATTACKS_IT_WILL_LAST: 8,
}

// ---------------------------------------- AN ARTIFACT---------
// One strike, always a critical. A plain brace cannot halve it - the
// Containment Field is the only thing that can - and the brace is spent by it
// all the same. The ADDITIONAL_ATTACK_ADDED lands on top of whatever the
// critical did, field or no field.
const AN_ARTIFACT = {
    CRITICAL_HIT: true,
    ADDITIONAL_ATTACK_ADDED: 5,
    ATTACK_MULTIPLIERS: [1],
    SP_PER_MULTIPLIER: [10],
    PBM_BONUS_SP: 0,
    STRIKES: 1,
    // The opponent's clock waits out the cinematic. Keep it near the client's
    // AN_ARTIFACT_TIMING total (CHARGE + FLIGHT + SETTLE).
    GRACE_MS: 4600,
}

// ---------------------------------------- HEAVY MEND---------
const HEAVY_MEND_ATT = {
    RESTORES_ESSE: 75,
    // The healer's clock waits out the cinematic. Keep it near the client's
    // HEAVY_MEND_TIMING.HOLD_MS.
    GRACE_MS: 4300,
}

// ---------------------------------------- PATTERN INTERRUPTION---------
// Played on the player's own side. Every affliction listed here is cured off
// every card they hold - the one in the arena and any carried to the bench
// through a swap. With nothing to cure it is refused and kept in its slot.
const PATTERN_INTERRUPTION_ATT = {
    CLEANSE_AFFLICTIONS: ['dark_disturbance'],
    // The cleanser's clock waits out the cinematic. Keep it near the client's
    // PATTERN_INTERRUPTION_TIMING.HOLD_MS.
    GRACE_MS: 4600,
}

/** Attack attribute cards, by id -> the strike table their base attack uses. */
const SINGULARITY_ATTACKS = {
    nova_burst: NOVA_BURST_ATT,
    an_artifact: AN_ARTIFACT,
};

/** Defence attribute cards, by id -> the field their DEFEND raises. */
const SINGULARITY_DEFENCES = {
    containment_field: CONTAINMENT_FIELD_ATT,
};

/** Healing attribute cards, by id -> what they restore to the active card. */
const SINGULARITY_HEALS = {
    light_mend: LIGHT_MEND_ATT,
    heavy_mend: HEAVY_MEND_ATT,
};

/** Cleanse attribute cards, by id -> the afflictions they cure off the player's own cards. */
const SINGULARITY_CLEANSES = {
    pattern_interruption: PATTERN_INTERRUPTION_ATT,
};

/** Affliction attribute cards, by id -> the affliction they lay on the opponent's card. */
const SINGULARITY_AFFLICTIONS = {
    dark_disturbance: DARK_DISTURBANCE_ATT,
};

/** -- PATTERN BONUS MODE -- */
// ---------------------------------------- 4 CARDS ALIVE---------
/** One Base Move - 4 Cards Alive */
const ONE_BASE_MOVE_4_CARDS_ALIVE = {
    swap: 8,
    attack: 5,
    defend: 3, 
};

/** Two Base Move - 4 Cards Alive */
const TWO_BASE_MOVE_4_CARDS_ALIVE = {
    swap_swap: 16,
    swap_attack: 13,
    attack_swap: 10,
    swap_defend: 11,
    defend_swap: 9,
    attack_defend: 4,
    defend_attack: 4,
}

/** Three Base Move - 4 Cards Alive */
const THREE_BASE_MOVE_4_CARDS_ALIVE = {
    swap_swap_swap: 24,

    swap_swap_attack: 21,
    swap_attack_swap: 18,
    attack_swap_swap: 17,
    attack_attack_swap: 12,
    attack_swap_attack: 11,
    swap_attack_attack: 10,
    attack_attack_attack: 8,

    swap_swap_defend: 19,
    swap_defend_swap: 18,
    defend_swap_swap: 17,
    defend_defend_swap: 11,
    defend_swap_defend: 10,
    swap_defend_defend: 8,
    defend_defend_defend: 3,

    swap_attack_defend: 16,
    swap_defend_attack: 16,
    attack_swap_defend: 14,
    attack_defend_swap: 12,
    defend_attack_swap: 10,
    defend_swap_attack: 9,
}

// ---------------------------------------- 3 CARDS ALIVE---------
/** One Base Move - 3 Cards Alive */
const ONE_BASE_MOVE_3_CARDS_ALIVE = {
    swap: 10,
    attack: 7,
    defend: 5,
}

/** Two Base Move - 3 Cards Alive */
const TWO_BASE_MOVE_3_CARDS_ALIVE = {
    swap_swap: 20,
    swap_attack: 17,
    attack_swap: 16,
    swap_defend: 15,
    defend_swap: 14,
    attack_defend: 10,
    defend_attack: 10,
}

/** Three Base Move - 3 Cards Alive */
const THREE_BASE_MOVE_3_CARDS_ALIVE = {
    swap_swap_swap: 30,

    swap_swap_attack: 27,
    swap_attack_swap: 25,
    attack_swap_swap: 24,
    attack_attack_swap: 17,
    attack_swap_attack: 16,
    swap_attack_attack: 15,
    attack_attack_attack: 12,

    swap_swap_defend: 25,
    swap_defend_swap: 22,
    defend_swap_swap: 19,
    defend_swap_defend: 12,
    defend_defend_swap: 10, 
    swap_defend_defend: 13,
    defend_defend_defend: 3,

    swap_attack_defend: 17,
    swap_defend_attack: 13,
    attack_swap_defend: 12,
    attack_defend_swap: 11,
    defend_attack_swap: 11,
    defend_swap_attack: 12,
}

// ---------------------------------------- 2 CARDS ALIVE---------
/** One Base Move - 2 Cards Alive */
const ONE_BASE_MOVE_2_CARDS_ALIVE = {
    swap: 12,
    attack: 9,
    defend: 7,
}

/** Two Base Move - 2 Cards Alive */
const TWO_BASE_MOVE_2_CARDS_ALIVE = {
    swap_swap: 24,
    swap_attack: 21,
    swap_defend: 19,
    attack_swap: 18,
    attack_defend: 11,
    attack_attack: 11,
    defend_swap: 14,
    defend_attack: 9, 
    defend_defend: 5,
}

/** Three Base Move - 2 Cards Alive  */
const THREE_BASE_MOVE_2_CARDS_ALIVE = {
    swap_swap_swap: 36,

    swap_swap_attack: 33,
    swap_attack_swap: 30,
    swap_attack_attack: 23,
    attack_swap_swap: 24,
    attack_swap_attack: 19,
    attack_attack_swap: 17,
    attack_attack_attack: 12,

    swap_swap_defend: 31,
    swap_defend_defend: 21,
    swap_defend_swap: 28,
    defend_swap_swap: 25,
    defend_swap_defend: 18,
    defend_defend_swap: 16,
    defend_defend_defend: 9,

    swap_attack_defend: 22,
    swap_defend_attack: 21,
    attack_defend_swap: 15,
    attack_swap_defend: 17,
    defend_attack_swap: 18,
    defend_swap_attack: 20,
}

// ---------------------------------------- 1 CARD ALIVE---------
// Note: No Swap so the Attack and Defend PATTERN BONUS POINTS is higher.
/** One Base Move - 1 Card Alive  */
const ONE_BASE_MOVE_1_CARD_ALIVE = {
    attack: 15,
    defend: 10,
}

/**
 * Every pattern table, keyed by cards alive, then indexed by chain length - 0
 * is the One Base Move table, 2 the Three Base Move one. The number of tables
 * a tier has is also how long its chains run before they are scored.
 */
const PATTERN_TABLES = {
    4: [ONE_BASE_MOVE_4_CARDS_ALIVE, TWO_BASE_MOVE_4_CARDS_ALIVE, THREE_BASE_MOVE_4_CARDS_ALIVE],
    3: [ONE_BASE_MOVE_3_CARDS_ALIVE, TWO_BASE_MOVE_3_CARDS_ALIVE, THREE_BASE_MOVE_3_CARDS_ALIVE],
    2: [ONE_BASE_MOVE_2_CARDS_ALIVE, TWO_BASE_MOVE_2_CARDS_ALIVE, THREE_BASE_MOVE_2_CARDS_ALIVE],
    1: [ONE_BASE_MOVE_1_CARD_ALIVE],
};

/** How many base moves a chain runs to before it is scored, for a cards-alive tier. */
export function patternLength(cardsAlive){
    return (PATTERN_TABLES[cardsAlive] ?? PATTERN_TABLES[1]).length;
}

/**
 * The PBP a finished chain is worth: ['swap', 'swap', 'attack'] is looked up
 * as 'swap_swap_attack' in the table for its length. A pattern the table does
 * not list scores that table's lowest value, so a gap never pays better than
 * the worst pattern that was balanced on purpose.
 */
export function scorePattern(moves, cardsAlive){
    const tables = PATTERN_TABLES[cardsAlive] ?? PATTERN_TABLES[1];
    const table  = tables[Math.min(moves.length, tables.length) - 1];
    if (!table) return 0;

    const key = moves.join('_');
    return Object.hasOwn(table, key) ? table[key] : Math.min(...Object.values(table));
}

const CARD_SLOTS = 4;

/** Match-ending reasons, so the client can word the result screen properly. */
export const END_REASON = {
    DEFEAT:     'defeat',       // all four cards knocked out
    FORFEIT:    'forfeit',      // quit, or a disconnect that ran out its grace
    TIMEOUT:    'timeout',      // stopped taking turns
};

export class BattleEngine {
    /**
     * @param {object}   opts
     * @param {string}   opts.matchId
     * @param {Array<{id: string, name: string, deck: Array}>} opts.players - exactly two
     * @param {Function} [opts.rng]   - injectable for deterministic tests
     * @param {Function} [opts.now]   - injectable clock
     */
    constructor({ matchId, players, rng = Math.random, now = () => Date.now() }){
        if (!Array.isArray(players) || players.length !== 2)
        {
            throw new Error('BattleEngine needs exactly two players');
        }

        this.matchId = matchId;
        this._rng    = rng;
        this._now    = now;

        this.playerIds = players.map(p => String(p.id));

        if (this.playerIds[0] === this.playerIds[1])
        {
            throw new Error('BattleEngine needs two distinct players');
        }

        /** @type {Map<string, object>} playerId => side state */
        this.sides = new Map();
        for (const p of players)
        {
            this.sides.set(String(p.id), this._buildSide(p));
        }

        this.status  = 'active';
        this.result  = null;        // { winnerId, loserId, reason } once finished
        this.seq     = 0;           // monotonic event counter - the client can spot gaps
        this.history = [];          // every event, oldest first

        // The coin flip. Single-player gives the player the call; online there is
        // nobody to ask, so the server flips for both and says who won.
        const firstId = this.playerIds[this._roll(2)];

        this.turn = {
            playerId:  firstId,
            number:    1,
            startedAt: this._now(),
            deadline:  this._now() + RULES.TURN_MS,
        };

        this._emit('match:start', {
            firstPlayerId: firstId,
            turnMs:        RULES.TURN_MS,
        });
        this._emit('turn:start', {
            playerId: firstId,
            turn:     1,
            deadline: this.turn.deadline,
        });
    }

    // ---------------------------------------------------------------- setup --

    /** Turn a queue entry into the mutable battle side the engine works on. */
    _buildSide(p){
        const deck = Array.isArray(p.deck) ? p.deck : [];

        if (deck.length !== CARD_SLOTS)
        {
            throw new Error(`Player ${p.id} must bring exactly ${CARD_SLOTS} cards`);
        }

        return {
            playerId: String(p.id),
            name:     p.name,

            // Copies, not references: a match must never write back into the library.
            cards: deck.map(c => ({
                id:        c.id,
                name:      c.name,
                shortName: c.shortName,
                cate:      c.cate,
                atk:       c.atk,
                def:       c.def,
                esse:      c.esse,
                maxEsse:   c.esse,
                defeated:  false,
                // An Affliction laid on this card - see _doAfflict(). It is
                // the card's, not the side's, so it follows the card through
                // a swap. null while the card is clean.
                affliction: null,
            })),

            activeIndex:    0,
            sp:             0,
            defending:      false,
            swapsThisTurn:  0,
            timeouts:       0,

            // Pattern Bonus. `pattern` is the chain being built; its tier is the
            // cards-alive count it started under, and it is scored on that
            // tier's tables however many cards fall before it finishes.
            pbp:      0,
            pattern:  { moves: [], tier: CARD_SLOTS },
            pbm:      { active: false, attacksLeft: 0 },

            // Singularity Cards: one card id per slot, null while it is open.
            singularityCards: new Array(RULES.SINGULARITY_SLOTS).fill(null),

            // A raised Defence card: { singularity, cardId } - the card id is
            // the battle card it stands round, which it stays with through
            // a swap. null while there is none.
            field: null,
        };
    }

    // ------------------------------------------------------------ accessors --

    isFinished(){ return this.status === 'finished'; }

    /** Wall-clock moment the current turn expires - MatchManager arms its timer off this. */
    get deadline(){ return this.turn?.deadline ?? null; }

    _side(playerId){ return this.sides.get(String(playerId)) || null; }

    _opponentIdOf(playerId){
        return this.playerIds.find(id => id !== String(playerId)) || null;
    }

    _activeCard(side){ return side.cards[side.activeIndex] || null; }

    _cardsAlive(side){ return side.cards.filter(c => !c.defeated).length; }

    /**
     * State framed from one player's seat: 'you' is always the asker.
     *
     * Both decks are already public - FindMatchScene shows the full versus panel
     * before the first turn - so nothing is redacted here. The split exists so a
     * scene never has to work out which half of the payload belongs to it.
     */
    getStateFor(playerId){
        const you = this._side(playerId);
        if (!you) return null;

        const opponent = this._side(this._opponentIdOf(playerId));

        return {
            matchId:   this.matchId,
            status:    this.status,
            seq:       this.seq,
            turn: {
                playerId: this.turn.playerId,
                number:   this.turn.number,
                deadline: this.turn.deadline,
                yours:    this.turn.playerId === String(playerId),
            },
            you:      this._publicSide(you),
            opponent: this._publicSide(opponent),
            result:   this.result,
        };
    }

    /** Spectator/log view - no seat, no 'you'. */
    getPublicState(){
        return {
            matchId: this.matchId,
            status:  this.status,
            seq:     this.seq,
            turn:    { ...this.turn },
            sides:   this.playerIds.map(id => this._publicSide(this._side(id))),
            result:  this.result,
        };
    }

    _publicSide(side){
        if (!side) return null;

        return {
            playerId:    side.playerId,
            name:        side.name,
            sp:          side.sp,
            defending:   side.defending,
            activeIndex: side.activeIndex,
            activeCardId: this._activeCard(side)?.id ?? null,
            swapsLeft:   Math.max(0, RULES.SWAPS_PER_TURN - side.swapsThisTurn),
            cards:       side.cards.map(c => ({ ...c, affliction: c.affliction ? { ...c.affliction } : null })),
            pattern:     this._publicPattern(side),
            singularityCards: [...side.singularityCards],
            field:       side.field ? { ...side.field } : null,
        };
    }

    _publicPattern(side){
        // An empty chain has not locked a tier yet - it will start under
        // whatever is alive when the next move lands.
        const tier = side.pattern.moves.length ? side.pattern.tier : this._cardsAlive(side);

        return {
            pbp:        side.pbp,
            pbpMax:     RULES.PBM_THRESHOLD,
            moves:      [...side.pattern.moves],
            length:     patternLength(tier),
            cardsAlive: tier,
            mode: {
                active:       side.pbm.active,
                attacksLeft:  side.pbm.attacksLeft,
                attacksTotal: RULES.PBM_ATTACKS,
            },
        };
    }

    // --------------------------------------------------------------- events --

    _emit(type, payload){
        const event = { seq: ++this.seq, type, at: this._now(), ...payload };
        this.history.push(event);
        return event;
    }

    // ----------------------------------------------------------------- dice --

    /** Integer in [0, n). Routed through the injected rng so tests can pin it. */
    _roll(n){
        return Math.floor(this._rng() * n) % n;
    }

    // --------------------------------------------------------------- actions --

    /**
     * The one door into the engine. Validates, resolves, advances the turn.
     *
     * @param {string} playerId
     * @param {{type: 'attack'|'defend'|'afflict'|'swap'|'buySingularity'|'useSingularity',
     *          cardId?: number|string, singularitySlot?: number}} action
     *          singularitySlot - the armed card an attack fires, a defend raises
     *                            or an afflict casts
     * @returns {{ok: true, events: Array, state: object} | {ok: false, error: string}}
     */
    submitAction(playerId, action){
        const from = this.seq;

        const side = this._side(playerId);
        if (!side)                    return this._reject('You are not in this match');
        if (this.status !== 'active') return this._reject('This match is already over');

        const type = action?.type;

        // Base moves are the ones that advance the match, and they are the only
        // ones the turn order gates. A swap is a sub-move: it costs no turn and
        // does not need one, so a player may reposition on either side's clock.
        // The budget still holds it to one per turn - _passTurn refreshes that
        // for both players, so each of them gets exactly one per turn either way.
        // An Affliction card is cast as a base move of its own.
        const isBaseMove = type === 'attack' || type === 'defend' || type === 'afflict';

        if (isBaseMove && this.turn.playerId !== side.playerId)
        {
            return this._reject('It is not your turn');
        }

        // Showing up resets the patience counter - only unbroken silence
        // forfeits. Only a base move counts as showing up: repositioning on the
        // opponent's turn must not buy a player out of answering on their own.
        if (isBaseMove) side.timeouts = 0;

        switch (type)
        {
            case 'attack': {
                // An armed Attack attribute card rides on the attack. It is
                // checked before anything moves, so a bad slot costs nothing.
                let charge = null;
                if (action.singularitySlot != null)
                {
                    charge = this._chargeFor(side, action.singularitySlot);
                    if (typeof charge === 'string') return this._reject(charge);
                }
                this._doAttack(side, charge);
                break;
            }
            case 'defend': {
                // An armed Defence attribute card rides on the defend, checked
                // the same way an attack's charge is.
                let guard = null;
                if (action.singularitySlot != null)
                {
                    guard = this._guardFor(side, action.singularitySlot);
                    if (typeof guard === 'string') return this._reject(guard);
                }
                this._doDefend(side, guard);
                break;
            }
            case 'afflict': {
                // Checked before anything moves, like a charge or a guard.
                const hex = this._hexFor(side, action?.singularitySlot);
                if (typeof hex === 'string') return this._reject(hex);
                this._doAfflict(side, hex);
                break;
            }
            case 'buySingularity': {
                // Like a swap, the store is open on either player's clock and
                // costs no turn.
                const err = this._buySingularity(side, action.cardId);
                if (err) return this._reject(err);
                return this._accept(playerId, from);
            }
            case 'useSingularity': {
                // A Healing card is a sub-move like a swap - it costs no turn -
                // but it is played on the healer's own clock only.
                if (this.turn.playerId !== side.playerId) return this._reject('It is not your turn');

                const err = this._useSingularity(side, action.cardId, action.singularitySlot);
                if (err) return this._reject(err);
                break;
            }
            case 'swap': {
                const err = this._doSwap(side, action.cardId);
                if (err) return this._reject(err);
                // A swap is a free action: the player still owes an attack or a
                // defend this turn, so the turn is NOT passed here.
                return this._accept(playerId, from);
            }
            default: return this._reject('Unknown action');
        }

        return this._accept(playerId, from);
    }

    _reject(error){
        return { ok: false, error };
    }

    /** Package everything that happened since `from` plus the caller's fresh state. */
    _accept(playerId, from){
        return {
            ok:     true,
            events: this.history.filter(e => e.seq > from),
            state:  this.getStateFor(playerId),
        };
    }

    // --- attack ------------------------------------------------------------

    /**
     * One ATTACK base move. Plain, it is a single strike on the standard
     * ladder. With a Singularity charge it is whatever the card's table says -
     * Nova Burst strikes twice on its own, miss-free ladder.
     *
     * Either way it is one base move: one turn, one entry in the pattern chain
     * and one of Pattern Bonus Mode's attacks, however many strikes it holds.
     */
    _doAttack(side, charge = null){
        const foe   = this._side(this._opponentIdOf(side.playerId));
        const table = charge?.table ?? null;
        const inPbm = side.pbm.active;

        // The card making the attempt - an affliction it carries bleeds it
        // once the move is over, however many strikes the move held.
        const atkerCard = this._activeCard(side);

        if (inPbm) side.pbm.attacksLeft -= 1;

        if (charge)
        {
            side.singularityCards[charge.slot] = null;

            this._emit('singularity:used', {
                playerId:  side.playerId,
                cardId:    charge.card.id,
                slotIndex: charge.slot,
                attribute: charge.card.attribute,
                strikes:   table.STRIKES,
            });
        }

        const strikes = table?.STRIKES ?? 1;

        // A field round the card this is aimed at takes the whole move, and
        // is spent by it whether it covered the attack or not.
        const field = foe.field?.cardId === this._activeCard(foe)?.id ? foe.field : null;
        const cover = field && this._fieldCovers(field, charge?.card.id ?? null) ? field : null;

        for (let n = 1; n <= strikes; n++)
        {
            const dfdrCard = this._activeCard(foe);
            const esse     = this._strike(side, foe, {
                table, inPbm, strike: n, strikes, singularity: charge?.card.id ?? null, field: cover,
            });

            // A strike that empties the card ends the move: the next card up
            // was not the one this attack was aimed at.
            if (esse === 0)
            {
                this._knockOut(foe, dfdrCard);
                break;
            }
        }

        if (field)
        {
            foe.field = null;

            this._emit('field:broken', {
                playerId:    foe.playerId,
                cardId:      field.cardId,
                singularity: field.singularity,
                covered:     !!cover,
            });
        }

        if (atkerCard?.affliction && this.status === 'active') this._bleedAffliction(side, atkerCard);

        if (inPbm && side.pbm.attacksLeft <= 0) this._endPbm(side);

        // An attack made in Pattern Bonus Mode belongs to the mode, not to a
        // chain - even the one that ends it.
        if (!inPbm) this._recordPattern(side, 'attack');

        if (this.status === 'active') this._passTurn(charge ? (table.GRACE_MS ?? RULES.SINGULARITY_ATTACK_GRACE_MS) : 0);
    }

    /** One blow from the side's active card. @returns the defender's ESSE after it. */
    _strike(side, foe, { table, inPbm, strike, strikes, singularity, field = null }){
        const atkerCard = this._activeCard(side);
        const dfdrCard  = this._activeCard(foe);

        // The multiplier ladder: a miss, three partials, or a clean critical -
        // or the card's own ladder when one is charged.
        const ladder     = table?.ATTACK_MULTIPLIERS ?? RULES.ATTACK_MULTIPLIERS;
        const roll       = this._roll(ladder.length);
        const multiplier = Number(ladder[roll].toFixed(2));

        // The rung on the standard ladder this multiplier sits on. SP and the
        // client's hit force are both read off that ladder, so a card's 3/4
        // pays and lands exactly like a plain 3/4.
        const index = table
            ? RULES.ATTACK_MULTIPLIERS.findIndex(m => Number(m.toFixed(2)) === multiplier)
            : roll;

        const raw = Math.round(atkerCard.atk * multiplier);

        // Same three-way formula GameBattleScene uses: a miss does nothing, an
        // attack that exactly matches DEF scrapes 1 through, and anything else is
        // the gap between them - which is why a weak hit into heavy armour still
        // stings. Never less than 1 on a connected hit.
        let damage = raw === 0            ? 0
                   : raw === dfdrCard.def ? 1
                   : Math.max(1, Math.abs(raw - dfdrCard.def));

        // A field outranks a plain brace: it takes the strike and the brace
        // is left standing for the next one. Like the brace, it never
        // absorbs a connected hit entirely.
        const evade    = field ? SINGULARITY_DEFENCES[field.singularity] : null;
        const shielded = !!evade && damage > 0;
        const evaded   = shielded
            ? damage - Math.max(1, Math.round(damage * (1 - evade.EVADE_99_PERCENT_DAMAGE_FROM_ATTACKS)))
            : 0;
        damage -= evaded;

        // A guaranteed critical goes straight through a plain brace - and
        // breaks it on the way.
        const pierced  = foe.defending && !field && !!table?.CRITICAL_HIT;
        const defended = foe.defending && !field && !pierced;
        if (defended) damage = Math.max(1, Math.floor(damage / RULES.DEFEND_DIVISOR));

        // The card's extra attack, after every reduction - nothing stops it.
        const bonusDamage = table?.ADDITIONAL_ATTACK_ADDED ?? 0;
        damage += bonusDamage;

        // SP comes off the card's own tables when one is charged - per rung
        // of its ladder, or one flat figure for every rung. In Pattern Bonus
        // Mode a charged strike earns its PBM_BONUS_SP and nothing else, so
        // Nova Burst's PBM_BONUS_SP: 0 earns no SP at all in the mode.
        const sp    = table ? (inPbm ? 0 : this._spFrom(table.SP_PER_MULTIPLIER, roll))
                            : (RULES.SP_PER_MULTIPLIER[index] ?? 0);
        const bonus = inPbm ? this._spFrom(table?.PBM_BONUS_SP ?? RULES.PBM_BONUS_SP, roll) : 0;

        side.sp = Math.min(RULES.SP_CAP, side.sp + sp + bonus);

        const esseBefore = dfdrCard.esse;
        dfdrCard.esse    = Math.max(0, dfdrCard.esse - damage);

        this._emit('attack', {
            attackerId:     side.playerId,
            defenderId:     foe.playerId,
            attackerCardId: atkerCard.id,
            defenderCardId: dfdrCard.id,
            multiplier,
            multiplierIndex: index,
            raw,
            damage,
            defended,
            pierced,
            bonusDamage,
            field:          field?.singularity ?? null,
            evaded,
            esseBefore,
            esseAfter:      dfdrCard.esse,
            spGained:       sp,
            pbm:            inPbm,
            pbmBonusSp:     bonus,
            pbmAttacksLeft: side.pbm.attacksLeft,
            // Only the first strike of a move spends a Pattern Bonus attack.
            pbmSpent:       inPbm && strike === 1,
            attackerSp:     side.sp,
            singularity,
            strike,
            strikes,
        });

        // The shield covers exactly one incoming strike.
        if (defended || pierced) foe.defending = false;

        return dfdrCard.esse;
    }

    /** An SP table entry: a per-rung array, or a flat number for every rung. */
    _spFrom(table, roll){
        if (Array.isArray(table)) return table[roll] ?? 0;
        return Number.isFinite(table) ? table : 0;
    }

    /** Retire a spent card and bring up the next one, or end the match. */
    _knockOut(side, card){
        card.defeated = true;

        const nextIndex = side.cards.findIndex(c => !c.defeated);

        this._emit('card:defeated', {
            playerId:   side.playerId,
            cardId:     card.id,
            nextCardId: nextIndex === -1 ? null : side.cards[nextIndex].id,
        });

        if (nextIndex === -1)
        {
            return this._finish(this._opponentIdOf(side.playerId), side.playerId, END_REASON.DEFEAT);
        }

        side.activeIndex = nextIndex;
    }

    // --- defend ------------------------------------------------------------

    /**
     * One DEFEND base move. Plain, it braces for the next strike. With a
     * Defence card it raises that card's field round the active card instead,
     * which stands until the card is attacked - see _doAttack().
     */
    _doDefend(side, guard = null){
        const card = this._activeCard(side);

        if (guard)
        {
            side.singularityCards[guard.slot] = null;
            side.field = { singularity: guard.card.id, cardId: card?.id ?? null };

            this._emit('singularity:used', {
                playerId:  side.playerId,
                cardId:    guard.card.id,
                slotIndex: guard.slot,
                attribute: guard.card.attribute,
                fieldCardId: side.field.cardId,
            });
        }
        else
        {
            side.defending = true;
        }

        this._emit('defend', {
            playerId: side.playerId,
            cardId:   card?.id ?? null,
            field:    guard?.card.id ?? null,
        });

        this._recordPattern(side, 'defend');

        this._passTurn(guard ? RULES.SINGULARITY_DEFENCE_GRACE_MS : 0);
    }

    // --- swap --------------------------------------------------------------

    /** @returns {string|null} an error message, or null when the swap went through. */
    _doSwap(side, cardId){
        if (side.swapsThisTurn >= RULES.SWAPS_PER_TURN)
        {
            return 'You have already repositioned this turn';
        }

        const index = side.cards.findIndex(c => c.id === Number(cardId));
        if (index === -1)              return 'That card is not in your deck';
        if (side.cards[index].defeated) return 'That card has been defeated';
        if (index === side.activeIndex) return 'That card is already in the arena';

        const fromCard = this._activeCard(side);
        side.activeIndex   = index;
        side.swapsThisTurn += 1;

        this._emit('swap', {
            playerId:   side.playerId,
            fromCardId: fromCard?.id ?? null,
            toCardId:   side.cards[index].id,
        });

        this._recordPattern(side, 'swap');

        return null;
    }

    // ---------------------------------------------------- singularity --

    /** @returns {string|null} an error message, or null when the card was bought. */
    _buySingularity(side, cardId){
        const card = SINGULARITY_BY_ID[String(cardId)];
        if (!card)          return 'That is not a Singularity Card';
        if (!card.playable) return `${card.name} is not in the store yet`;

        const slot = side.singularityCards.indexOf(null);
        if (slot === -1)         return 'All three Singularity slots are full';
        if (side.sp < card.cost) return `Not enough Singularity Points - ${card.cost - side.sp} more needed`;

        side.sp -= card.cost;
        side.singularityCards[slot] = card.id;

        this._emit('singularity:bought', {
            playerId:  side.playerId,
            cardId:    card.id,
            slotIndex: slot,
            cost:      card.cost,
            sp:        side.sp,
        });

        return null;
    }

    /**
     * Resolve an armed slot into the charge an attack carries.
     * @returns {{slot: number, card: object, table: object} | string} the charge, or why not
     */
    _chargeFor(side, slotIndex){
        const slot = Number(slotIndex);
        if (!Number.isInteger(slot) || slot < 0 || slot >= side.singularityCards.length)
        {
            return 'That is not a Singularity slot';
        }

        const card = SINGULARITY_BY_ID[side.singularityCards[slot]];
        if (!card) return 'That Singularity slot is empty';

        const table = SINGULARITY_ATTACKS[card.id];
        if (card.attribute !== 'attack' || !table) return `${card.name} is not an Attack card`;

        return { slot, card, table };
    }

    /**
     * Resolve an armed slot into the field a defend raises.
     * @returns {{slot: number, card: object, field: object} | string} the guard, or why not
     */
    _guardFor(side, slotIndex){
        const slot = Number(slotIndex);
        if (!Number.isInteger(slot) || slot < 0 || slot >= side.singularityCards.length)
        {
            return 'That is not a Singularity slot';
        }

        const card = SINGULARITY_BY_ID[side.singularityCards[slot]];
        if (!card) return 'That Singularity slot is empty';

        const field = SINGULARITY_DEFENCES[card.id];
        if (card.attribute !== 'defence' || !field) return `${card.name} is not a Defence card`;

        // One field a side. A second would only be thrown away.
        if (side.field) return `Your ${SINGULARITY_BY_ID[side.field.singularity]?.name ?? 'field'} is still up`;

        return { slot, card, field };
    }

    /** Whether a field takes an attack - a plain one, or the Singularity attack it lists. */
    _fieldCovers(field, singularity){
        if (!singularity) return true;

        const covered = SINGULARITY_DEFENCES[field.singularity]?.EVADE_99_PERCENT_DAMAGE_FROM_SINGULARITY_ATTACKS;
        return Array.isArray(covered) && covered.includes(singularity);
    }

    /**
     * Resolve an armed slot into the affliction it casts.
     * @returns {{slot: number, card: object, table: object, target: object} | string} the hex, or why not
     */
    _hexFor(side, slotIndex){
        const slot = Number(slotIndex);
        if (slotIndex == null || !Number.isInteger(slot) || slot < 0 || slot >= side.singularityCards.length)
        {
            return 'That is not a Singularity slot';
        }

        const card = SINGULARITY_BY_ID[side.singularityCards[slot]];
        if (!card) return 'That Singularity slot is empty';

        const table = SINGULARITY_AFFLICTIONS[card.id];
        if (card.attribute !== 'affliction' || !table) return `${card.name} is not an Affliction card`;

        const foe    = this._side(this._opponentIdOf(side.playerId));
        const target = this._activeCard(foe);
        if (!target || target.defeated) return 'There is no card in the arena to afflict';

        // One affliction a card. A second would only be thrown away.
        if (target.affliction) return `${target.name} is already under ${target.affliction.name}`;

        return { slot, card, table, target };
    }

    /**
     * An Affliction card cast on the opponent's active card. It is a base move:
     * the turn passes, and it takes an 'attack' place in the pattern chain -
     * it is the caster's move against the opponent. In Pattern Bonus Mode it
     * spends none of the mode's attacks; it is not one.
     */
    _doAfflict(side, { slot, card, table, target }){
        const foe = this._side(this._opponentIdOf(side.playerId));

        side.singularityCards[slot] = null;

        target.affliction = {
            singularity:  card.id,
            name:         table.AFFLICTION,
            esseLoss:     table.ESSE_LOSS_AFTER_BASE_ATTACK,
            attacksLeft:  table.NUMBER_OF_ATTACKS_IT_WILL_LAST,
            attacksTotal: table.NUMBER_OF_ATTACKS_IT_WILL_LAST,
        };

        this._emit('singularity:used', {
            playerId:       side.playerId,
            cardId:         card.id,
            slotIndex:      slot,
            attribute:      card.attribute,
            targetPlayerId: foe.playerId,
            targetCardId:   target.id,
            affliction:     { ...target.affliction },
        });

        this._recordPattern(side, 'attack');

        this._passTurn(RULES.SINGULARITY_AFFLICTION_GRACE_MS);
    }

    /**
     * One attempted attack by an afflicted card: it loses the affliction's
     * ESSE, and one of its attacks is spent. A card bled to nothing is knocked
     * out like any other - by its own hand, so the attacker can lose the match
     * on its own move.
     */
    _bleedAffliction(side, card){
        const hex = card.affliction;

        const esseBefore = card.esse;
        card.esse        = Math.max(0, card.esse - hex.esseLoss);
        hex.attacksLeft -= 1;

        this._emit('affliction:tick', {
            playerId:     side.playerId,
            cardId:       card.id,
            singularity:  hex.singularity,
            name:         hex.name,
            esseLoss:     esseBefore - card.esse,
            esseBefore,
            esseAfter:    card.esse,
            attacksLeft:  hex.attacksLeft,
            attacksTotal: hex.attacksTotal,
        });

        if (hex.attacksLeft <= 0 || card.esse === 0)
        {
            card.affliction = null;

            this._emit('affliction:ended', {
                playerId:    side.playerId,
                cardId:      card.id,
                singularity: hex.singularity,
                name:        hex.name,
                expired:     hex.attacksLeft <= 0,
            });
        }

        if (card.esse === 0) this._knockOut(side, card);
    }

    /**
     * Play a card straight out of its slot. Attack, Defence and Affliction
     * cards never come through here - they are armed and fired by the ATTACK,
     * DEFEND or AFFLICT base move. A Healing card mends the active card; a
     * Cleanse card cures the player's afflicted cards.
     *
     * The slot is optional: without one, the first slot holding the card is
     * played.
     */
    _useSingularity(side, cardId, slotIndex = null){
        const card = SINGULARITY_BY_ID[String(cardId)];
        if (!card || !side.singularityCards.includes(card.id)) return 'You do not hold that card';
        if (card.attribute === 'attack')  return `Arm ${card.name} in its slot, then press ATTACK`;
        if (card.attribute === 'defence') return `Arm ${card.name} in its slot, then press DEFEND`;
        if (card.attribute === 'affliction'){
            return `Arm ${card.name} in its slot, then press USE ${SINGULARITY_AFFLICTIONS[card.id]?.AFFLICTION ?? card.name}`;
        }

        const heal = SINGULARITY_HEALS[card.id];
        if (card.attribute === 'healing' && heal) return this._doMend(side, card, heal, slotIndex);

        const cleanse = SINGULARITY_CLEANSES[card.id];
        if (card.attribute === 'cleanse' && cleanse) return this._doCleanse(side, card, cleanse, slotIndex);

        return `${card.name} cannot be played yet`;
    }

    /**
     * A Healing card restores ESSE to the active card, up to its maximum. A
     * card already at full ESSE is refused and the Healing card kept, so it is
     * still there for whichever card needs it next.
     *
     * @returns {string|null} an error message, or null when the card was played
     */
    _doMend(side, card, heal, slotIndex){
        const slot = slotIndex == null ? side.singularityCards.indexOf(card.id) : Number(slotIndex);
        if (!Number.isInteger(slot) || slot < 0 || slot >= side.singularityCards.length)
        {
            return 'That is not a Singularity slot';
        }
        if (side.singularityCards[slot] !== card.id) return `That slot does not hold ${card.name}`;

        const target = this._activeCard(side);
        if (!target || target.defeated) return 'There is no card in the arena to heal';
        if (target.esse >= target.maxEsse) return `${target.name} is already at full ESSE`;

        const esseBefore = target.esse;
        target.esse = Math.min(target.maxEsse, target.esse + heal.RESTORES_ESSE);

        side.singularityCards[slot] = null;

        this._emit('singularity:used', {
            playerId:     side.playerId,
            cardId:       card.id,
            slotIndex:    slot,
            attribute:    card.attribute,
            targetCardId: target.id,
            esseBefore,
            esseAfter:    target.esse,
            maxEsse:      target.maxEsse,
            healed:       target.esse - esseBefore,
        });

        // The turn is not passed - the healer still owes a base move - so the
        // cinematic is paid for out of a longer clock instead.
        this.turn.deadline += heal.GRACE_MS ?? RULES.SINGULARITY_HEAL_GRACE_MS;

        return null;
    }

    /**
     * A Cleanse card cures every affliction it covers off the player's own
     * cards - the active card and any benched card still carrying one. With
     * nothing to cure it is refused and the Cleanse card kept, so it is still
     * there when an affliction lands. Like a Healing card it costs no turn.
     *
     * @returns {string|null} an error message, or null when the card was played
     */
    _doCleanse(side, card, cleanse, slotIndex){
        const slot = slotIndex == null ? side.singularityCards.indexOf(card.id) : Number(slotIndex);
        if (!Number.isInteger(slot) || slot < 0 || slot >= side.singularityCards.length)
        {
            return 'That is not a Singularity slot';
        }
        if (side.singularityCards[slot] !== card.id) return `That slot does not hold ${card.name}`;

        const active = this._activeCard(side);
        if (!active || active.defeated) return 'There is no card in the arena to cleanse';

        const afflicted = side.cards.filter(c => !c.defeated && c.affliction
            && cleanse.CLEANSE_AFFLICTIONS.includes(c.affliction.singularity));
        if (!afflicted.length) return `None of your cards carry an affliction - ${card.name} is kept`;

        const cleansed = afflicted.map(c => {
            const hex = c.affliction;
            c.affliction = null;
            return { cardId: c.id, singularity: hex.singularity, name: hex.name, attacksLeft: hex.attacksLeft };
        });

        side.singularityCards[slot] = null;

        this._emit('singularity:used', {
            playerId:     side.playerId,
            cardId:       card.id,
            slotIndex:    slot,
            attribute:    card.attribute,
            targetCardId: active.id,
            cleansed,
        });

        // The turn is not passed - the cleanser still owes a base move.
        this.turn.deadline += cleanse.GRACE_MS ?? RULES.SINGULARITY_HEAL_GRACE_MS;

        return null;
    }

    // ------------------------------------------------------- pattern bonus --

    /**
     * Add one base move to a player's chain, and score the chain once it runs
     * to its tier's length. Nothing is gained while Pattern Bonus Mode is on:
     * the meter only starts filling again after the mode has ended.
     */
    _recordPattern(side, move){
        if (side.pbm.active || this.status !== 'active') return;

        const chain = side.pattern;
        if (!chain.moves.length) chain.tier = this._cardsAlive(side);

        chain.moves.push(move);
        if (chain.moves.length < patternLength(chain.tier)) return;

        const moves  = chain.moves;
        const points = scorePattern(moves, chain.tier);
        chain.moves  = [];

        side.pbp = Math.min(RULES.PBM_THRESHOLD, side.pbp + points);

        this._emit('pattern:scored', {
            playerId:   side.playerId,
            moves,
            pattern:    moves.join('_'),
            cardsAlive: chain.tier,
            points,
            pbp:        side.pbp,
            pbpMax:     RULES.PBM_THRESHOLD,
        });

        if (side.pbp >= RULES.PBM_THRESHOLD) this._startPbm(side);
    }

    _startPbm(side){
        side.pbm = { active: true, attacksLeft: RULES.PBM_ATTACKS };
        side.pattern.moves = [];

        this._emit('pbm:start', {
            playerId: side.playerId,
            attacks:  RULES.PBM_ATTACKS,
        });
    }

    /** The last attack base move is spent: the meter empties and chains resume. */
    _endPbm(side){
        side.pbm = { active: false, attacksLeft: 0 };
        side.pbp = 0;
        side.pattern.moves = [];

        this._emit('pbm:end', { playerId: side.playerId });
    }

    // ----------------------------------------------------------------- turns --

    /** @param {number} [graceMs] extra time on the next player's clock */
    _passTurn(graceMs = 0){
        if (this.status !== 'active') return;

        const nextId   = this._opponentIdOf(this.turn.playerId);
        const finished = this._side(this.turn.playerId);
        const next     = this._side(nextId);

        finished.swapsThisTurn = 0;
        next.swapsThisTurn     = 0;

        const at = this._now();
        this.turn = {
            playerId:  nextId,
            number:    this.turn.number + 1,
            startedAt: at,
            deadline:  at + RULES.TURN_MS + graceMs,
        };

        this._emit('turn:start', {
            playerId: nextId,
            turn:     this.turn.number,
            deadline: this.turn.deadline,
        });
    }

    /**
     * The clock ran out. MatchManager calls this; the engine passes the turn so
     * the match cannot deadlock on someone who walked away from the keyboard,
     * and awards it to the opponent once the silence becomes a pattern.
     *
     * @returns {{ok: boolean, events: Array}}
     */
    timeoutTurn(){
        const from = this.seq;
        if (this.status !== 'active') return { ok: false, events: [] };

        const side = this._side(this.turn.playerId);
        side.timeouts += 1;

        this._emit('turn:timeout', {
            playerId:    side.playerId,
            consecutive: side.timeouts,
        });

        // Standing still is not a pattern: a turn lost to the clock throws
        // away the chain in progress rather than scoring what it had.
        if (side.pattern.moves.length && !side.pbm.active)
        {
            const moves = side.pattern.moves;
            side.pattern.moves = [];
            this._emit('pattern:broken', { playerId: side.playerId, moves });
        }

        if (side.timeouts >= RULES.MAX_CONSECUTIVE_TIMEOUTS)
        {
            this._finish(this._opponentIdOf(side.playerId), side.playerId, END_REASON.TIMEOUT);
        }
        else
        {
            this._passTurn();
        }

        return { ok: true, events: this.history.filter(e => e.seq > from) };
    }

    // ------------------------------------------------------------- finishing --

    /**
     * Concede - a quit, or a disconnect whose grace window expired.
     * @returns {{ok: boolean, events: Array}}
     */
    forfeit(playerId, reason = END_REASON.FORFEIT){
        const from = this.seq;
        if (this.status !== 'active')  return { ok: false, events: [] };

        const side = this._side(playerId);
        if (!side)                     return { ok: false, events: [] };

        this._finish(this._opponentIdOf(side.playerId), side.playerId, reason);

        return { ok: true, events: this.history.filter(e => e.seq > from) };
    }

    _finish(winnerId, loserId, reason){
        this.status = 'finished';
        this.result = { winnerId, loserId, reason };

        this._emit('match:end', {
            winnerId,
            loserId,
            reason,
            // Survivors are the obvious input to a post-match rating change.
            summary: this.playerIds.map(id => {
                const s = this._side(id);
                return {
                    playerId:  id,
                    name:      s.name,
                    sp:        s.sp,
                    cardsLeft: s.cards.filter(c => !c.defeated).length,
                    esseLeft:  s.cards.reduce((sum, c) => sum + c.esse, 0),
                };
            }),
        });
    }
}

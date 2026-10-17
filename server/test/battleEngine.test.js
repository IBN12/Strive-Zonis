/**
 * BattleEngine rules tests.
 *
 * Run with:  npm test
 *
 * The engine takes an injectable rng and clock precisely so these can pin the
 * multiplier roll and the coin flip instead of hoping for the right dice.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { BattleEngine, RULES, END_REASON, scorePattern, patternLength } from '../src/game/BattleEngine.js';
import { buildCanonicalDeck } from '../src/data/cardLibrary.js';

const DECK_A = [{ id: 1 }, { id: 4 }, { id: 7 }, { id: 8 }];   // Tobo / Ally / Dan / Mac
const DECK_B = [{ id: 2 }, { id: 5 }, { id: 9 }, { id: 10 }];  // Jace / Mason / Karen / Ken

/** A rng that hands back a scripted queue of values, then holds the last one. */
function scriptedRng(values){
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
}

/** Turn a multiplier index into the rng value that selects it. */
const pick = i => i / RULES.ATTACK_MULTIPLIERS.length;

function makeEngine({ rng = () => 0, firstPlayer = 'p1' } = {}){
    const a = buildCanonicalDeck(DECK_A);
    const b = buildCanonicalDeck(DECK_B);
    assert.ok(a.ok && b.ok, 'test decks must be legal');

    // The constructor's first roll is the coin flip over playerIds[0..1].
    const flip = firstPlayer === 'p1' ? 0 : 0.99;
    const inner = typeof rng === 'function' ? rng : scriptedRng(rng);
    let first = true;

    return new BattleEngine({
        matchId: 'test',
        players: [
            { id: 'p1', name: 'Alpha', deck: a.deck },
            { id: 'p2', name: 'Beta',  deck: b.deck },
        ],
        rng: () => {
            if (first) { first = false; return flip; }
            return inner();
        },
    });
}

test('the coin flip decides who moves first', () => {
    assert.equal(makeEngine({ firstPlayer: 'p1' }).turn.playerId, 'p1');
    assert.equal(makeEngine({ firstPlayer: 'p2' }).turn.playerId, 'p2');
});

test('both sides start with four full cards and no points', () => {
    const e = makeEngine();
    const s = e.getStateFor('p1');

    assert.equal(s.you.cards.length, 4);
    assert.equal(s.opponent.cards.length, 4);
    assert.ok(s.you.cards.every(c => c.esse === 100 && c.esse === c.maxEsse && !c.defeated));
    assert.equal(s.you.sp, 0);
    assert.equal(s.turn.yours, true);
});

test('the engine never writes back into the card library', () => {
    const e = makeEngine({ rng: scriptedRng([pick(4)]) });
    e.submitAction('p1', { type: 'attack' });

    const fresh = buildCanonicalDeck(DECK_B);
    assert.equal(fresh.deck.find(c => c.id === 2).esse, 100);
});

test('a miss deals no damage but still passes the turn', () => {
    const e = makeEngine({ rng: scriptedRng([pick(0)]) });   // multiplier 0
    const r = e.submitAction('p1', { type: 'attack' });

    const hit = r.events.find(ev => ev.type === 'attack');
    assert.equal(hit.multiplier, 0);
    assert.equal(hit.damage, 0);
    assert.equal(hit.esseAfter, 100);
    assert.equal(e.turn.playerId, 'p2');
});

test('a critical deals |atk - def| damage', () => {
    // Tobo atk 45 at multiplier 1 into Jace def 14 => 31.
    const e = makeEngine({ rng: scriptedRng([pick(4)]) });
    const hit = e.submitAction('p1', { type: 'attack' }).events.find(ev => ev.type === 'attack');

    assert.equal(hit.raw, 45);
    assert.equal(hit.damage, 31);
    assert.equal(hit.esseAfter, 69);
});

test('an attack that exactly matches DEF scrapes 1 through', () => {
    // Mac atk 16 at multiplier 1 into Ken def 25 is not equal; use a crafted pair instead:
    // Ally atk 27 * 1/2 = 14 (rounded) into Jace def 14 => exactly-equal rule => 1 damage.
    const e = makeEngine({ rng: scriptedRng([pick(1)]) });
    e.submitAction('p1', { type: 'swap', cardId: 4 });      // bring in Allybelle

    const hit = e.submitAction('p1', { type: 'attack' }).events.find(ev => ev.type === 'attack');
    assert.equal(hit.raw, 14);
    assert.equal(hit.defenderCardId, 2);                    // Jace, def 14
    assert.equal(hit.damage, 1);
});

test('defending halves the next hit and then wears off', () => {
    const e = makeEngine({ firstPlayer: 'p2', rng: scriptedRng([pick(4)]) });

    e.submitAction('p2', { type: 'defend' });
    assert.equal(e.getStateFor('p2').you.defending, true);

    // Tobo 45 crit into Jace def 14 => 31, halved => 15.
    const hit = e.submitAction('p1', { type: 'attack' }).events.find(ev => ev.type === 'attack');
    assert.equal(hit.defended, true);
    assert.equal(hit.damage, 15);

    // The shield covered one strike only.
    assert.equal(e.getStateFor('p2').you.defending, false);
});

test('Singularity Points track the multiplier ladder', () => {
    for (let i = 0; i < RULES.ATTACK_MULTIPLIERS.length; i++){
        const e = makeEngine({ rng: scriptedRng([pick(i)]) });
        e.submitAction('p1', { type: 'attack' });
        assert.equal(e.getStateFor('p1').you.sp, RULES.SP_PER_MULTIPLIER[i]);
    }
});

test('acting out of turn is rejected without changing anything', () => {
    const e = makeEngine();
    const before = e.seq;

    const r = e.submitAction('p2', { type: 'attack' });
    assert.equal(r.ok, false);
    assert.match(r.error, /not your turn/);
    assert.equal(e.seq, before, 'a rejected action must not emit events');
});

test('a stranger cannot act on the match', () => {
    const r = makeEngine().submitAction('p9', { type: 'attack' });
    assert.equal(r.ok, false);
});

test('swap is free but capped at one per turn', () => {
    const e = makeEngine();

    const first = e.submitAction('p1', { type: 'swap', cardId: 7 });
    assert.equal(first.ok, true);
    assert.equal(e.turn.playerId, 'p1', 'a swap must not end the turn');
    assert.equal(e.getStateFor('p1').you.activeCardId, 7);

    const second = e.submitAction('p1', { type: 'swap', cardId: 8 });
    assert.equal(second.ok, false);
    assert.match(second.error, /already repositioned/);
});

test('swap is a sub-move: it needs no turn, a base move still does', () => {
    const e = makeEngine();                       // p1 to move

    // p2 repositions on their opponent's clock. Allowed, and it must not take
    // the turn away from the player who actually holds it.
    const off = e.submitAction('p2', { type: 'swap', cardId: 9 });
    assert.equal(off.ok, true, 'a swap must not be gated on the turn order');
    assert.equal(e.turn.playerId, 'p1', 'an off-turn swap must not steal the turn');
    assert.equal(e.getStateFor('p2').you.activeCardId, 9);

    // The budget still holds, even off-turn.
    assert.equal(e.submitAction('p2', { type: 'swap', cardId: 10 }).ok, false);

    // Base moves stay gated.
    const base = e.submitAction('p2', { type: 'attack' });
    assert.equal(base.ok, false);
    assert.match(base.error, /not your turn/);
});

test('swap rejects cards outside the deck, and the card already in the arena', () => {
    const e = makeEngine();
    assert.equal(e.submitAction('p1', { type: 'swap', cardId: 2 }).ok, false);   // opponent's card
    assert.equal(e.submitAction('p1', { type: 'swap', cardId: 1 }).ok, false);   // already active
});

test('the swap budget refreshes each turn', () => {
    const e = makeEngine({ rng: scriptedRng([pick(0)]) });

    e.submitAction('p1', { type: 'swap', cardId: 7 });
    e.submitAction('p1', { type: 'attack' });
    e.submitAction('p2', { type: 'attack' });

    assert.equal(e.turn.playerId, 'p1');
    assert.equal(e.submitAction('p1', { type: 'swap', cardId: 8 }).ok, true);
});

test('a spent card is retired and the next one steps up', () => {
    // Always crit: Tobo 45 into Jace def 14 => 31 a hit, so 4 hits clear 100 esse.
    const e = makeEngine({ rng: () => pick(4) });

    // Both trade crits; p1 moves first, so Jace (100 esse, 31 a hit) drops first.
    let defeat = null;
    for (let i = 0; i < 8 && !defeat; i++){
        const r = e.submitAction(e.turn.playerId, { type: 'attack' });
        defeat = r.events.find(ev => ev.type === 'card:defeated');
    }

    assert.ok(defeat, 'Jace should have fallen');
    assert.equal(defeat.cardId, 2);
    assert.equal(defeat.nextCardId, 5);

    const s = e.getStateFor('p2');
    assert.equal(s.you.cards.find(c => c.id === 2).defeated, true);
    assert.equal(s.you.activeCardId, 5);
});

test('clearing all four cards wins the match', () => {
    const e = makeEngine({ rng: () => pick(4) });

    // p1 always crits; p2 always misses, so p1 grinds the whole deck down.
    let guard = 0;
    while (!e.isFinished() && guard++ < 500){
        const actor = e.turn.playerId;
        e.submitAction(actor, { type: 'attack' });
    }

    assert.ok(e.isFinished(), 'the match should have ended');
    assert.equal(e.result.reason, END_REASON.DEFEAT);
    assert.ok(['p1', 'p2'].includes(e.result.winnerId));

    const loser = e.getStateFor(e.result.loserId);
    assert.ok(loser.you.cards.every(c => c.defeated));

    const end = e.history.at(-1);
    assert.equal(end.type, 'match:end');
    assert.equal(end.summary.length, 2);
});

test('no action is accepted once the match is finished', () => {
    const e = makeEngine();
    e.forfeit('p1');

    const r = e.submitAction('p2', { type: 'attack' });
    assert.equal(r.ok, false);
    assert.match(r.error, /already over/);
});

test('a forfeit hands the win to the other seat', () => {
    const e = makeEngine();
    const { ok, events } = e.forfeit('p1');

    assert.equal(ok, true);
    assert.equal(e.result.winnerId, 'p2');
    assert.equal(e.result.reason, END_REASON.FORFEIT);
    assert.ok(events.some(ev => ev.type === 'match:end'));

    assert.equal(e.forfeit('p2').ok, false, 'a second forfeit is a no-op');
});

test('timing out passes the turn, and repeated silence loses the match', () => {
    const e = makeEngine();

    e.timeoutTurn();
    assert.equal(e.turn.playerId, 'p2', 'a missed slot passes the turn');
    assert.equal(e.isFinished(), false);

    // Neither side comes back. The streak is counted per seat, so p1 - who was
    // handed the first turn - runs out of chances first.
    let guard = 0;
    while (!e.isFinished() && guard++ < 20) e.timeoutTurn();

    assert.equal(e.isFinished(), true);
    assert.equal(e.result.reason, END_REASON.TIMEOUT);
    assert.equal(e.result.loserId, 'p1');
});

test('acting resets the timeout streak', () => {
    const e = makeEngine({ rng: () => pick(0) });    // every attack is a miss

    // p1 idles one turn short of the limit while p2 keeps answering, so only
    // p1's counter is climbing.
    for (let i = 0; i < RULES.MAX_CONSECUTIVE_TIMEOUTS - 1; i++){
        e.timeoutTurn();                             // p1's slot lapses
        e.submitAction('p2', { type: 'attack' });    // p2 hands the turn straight back
    }
    assert.equal(e.isFinished(), false);

    // p1 finally plays, which should wipe the strikes against them.
    e.submitAction('p1', { type: 'attack' });
    e.submitAction('p2', { type: 'attack' });

    e.timeoutTurn();
    assert.equal(e.isFinished(), false, 'the streak should have restarted');
});

test('event sequence numbers are gapless and monotonic', () => {
    const e = makeEngine({ rng: () => pick(2) });

    e.submitAction('p1', { type: 'swap', cardId: 7 });
    e.submitAction('p1', { type: 'attack' });
    e.submitAction('p2', { type: 'defend' });
    e.submitAction('p1', { type: 'attack' });

    e.history.forEach((ev, i) => assert.equal(ev.seq, i + 1));
    assert.equal(e.seq, e.history.length);
});

test('a malformed roster is refused outright', () => {
    const one = buildCanonicalDeck(DECK_A);

    assert.throws(() => new BattleEngine({ matchId: 'x', players: [] }), /exactly two/);

    assert.throws(() => new BattleEngine({
        matchId: 'x',
        players: [
            { id: 'p1', name: 'A', deck: one.deck },
            { id: 'p1', name: 'B', deck: one.deck },
        ],
    }), /distinct/);

    assert.throws(() => new BattleEngine({
        matchId: 'x',
        players: [
            { id: 'p1', name: 'A', deck: one.deck },
            { id: 'p2', name: 'B', deck: one.deck.slice(0, 3) },
        ],
    }), /exactly 4 cards/);
});

// ------------------------------------------------------------ pattern bonus --

test('pattern tables score a finished chain by its joined key', () => {
    assert.equal(scorePattern(['swap'], 4), 8);
    assert.equal(scorePattern(['swap', 'swap'], 4), 16);
    assert.equal(scorePattern(['swap', 'swap', 'swap'], 4), 24);
    assert.equal(scorePattern(['swap', 'swap', 'swap'], 2), 36);
    assert.equal(scorePattern(['attack'], 1), 15);
    assert.equal(patternLength(4), 3);
    assert.equal(patternLength(1), 1);

    // Unlisted pattern => that table's floor, never better than a balanced one.
    assert.equal(scorePattern(['attack', 'attack', 'defend'], 4), 3);
});

test('a three-move chain is scored once, when it completes', () => {
    // p2 moves first so p1 can swap on p2's clock, then swap and attack on its own.
    const e = makeEngine({ firstPlayer: 'p2', rng: () => pick(0) });

    e.submitAction('p1', { type: 'swap', cardId: 4 });
    e.submitAction('p2', { type: 'defend' });
    e.submitAction('p1', { type: 'swap', cardId: 7 });

    assert.deepEqual(e.getStateFor('p1').you.pattern.moves, ['swap', 'swap']);
    assert.equal(e.getStateFor('p1').you.pattern.pbp, 0);

    const r = e.submitAction('p1', { type: 'attack' });
    const scored = r.events.find(ev => ev.type === 'pattern:scored');

    assert.equal(scored.pattern, 'swap_swap_attack');
    assert.equal(scored.points, 21);

    const you = e.getStateFor('p1').you.pattern;
    assert.equal(you.pbp, 21);
    assert.deepEqual(you.moves, []);
});

test('filling the meter enters PBM: six attacks, bonus SP, no PBP, then it ends', () => {
    const e  = makeEngine({ rng: () => pick(4) });            // every attack a critical
    const p1 = e.sides.get('p1');
    p1.pbp = RULES.PBM_THRESHOLD - 1;
    p1.cards.forEach(c => { c.esse = c.maxEsse = 10_000; });
    e.sides.get('p2').cards.forEach(c => { c.esse = c.maxEsse = 10_000; });

    // defend, defend, defend => the chain completes and tips the meter over.
    e.submitAction('p1', { type: 'defend' }); e.submitAction('p2', { type: 'defend' });
    e.submitAction('p1', { type: 'defend' }); e.submitAction('p2', { type: 'defend' });
    const tip = e.submitAction('p1', { type: 'defend' });

    assert.ok(tip.events.some(ev => ev.type === 'pbm:start' && ev.playerId === 'p1'));
    assert.equal(e.getStateFor('p1').you.pattern.mode.active, true);
    assert.equal(e.getStateFor('p1').you.pattern.pbp, RULES.PBM_THRESHOLD);

    for (let i = 0; i < RULES.PBM_ATTACKS; i++){
        e.submitAction('p2', { type: 'defend' });

        // Swaps and defends inside the mode neither build a chain nor spend it.
        if (i === 0) e.submitAction('p1', { type: 'swap', cardId: 4 });

        const spBefore = p1.sp;
        const r   = e.submitAction('p1', { type: 'attack' });
        const hit = r.events.find(ev => ev.type === 'attack');

        assert.equal(hit.pbm, true);
        assert.equal(hit.pbmBonusSp, RULES.PBM_BONUS_SP[4]);
        assert.equal(hit.pbmAttacksLeft, RULES.PBM_ATTACKS - 1 - i);
        assert.equal(p1.sp - spBefore, RULES.SP_PER_MULTIPLIER[4] + RULES.PBM_BONUS_SP[4]);
        assert.ok(!r.events.some(ev => ev.type === 'pattern:scored'));

        const ended = r.events.some(ev => ev.type === 'pbm:end');
        assert.equal(ended, i === RULES.PBM_ATTACKS - 1);
    }

    const after = e.getStateFor('p1').you.pattern;
    assert.equal(after.mode.active, false);
    assert.equal(after.pbp, 0);
    assert.deepEqual(after.moves, []);

    // Chains resume once the mode is over.
    e.submitAction('p2', { type: 'defend' });
    e.submitAction('p1', { type: 'attack' });
    assert.deepEqual(e.getStateFor('p1').you.pattern.moves, ['attack']);
});

test('a timed-out turn breaks the chain without scoring it', () => {
    const e = makeEngine();
    e.submitAction('p1', { type: 'swap', cardId: 4 });

    const { events } = e.timeoutTurn();
    assert.ok(events.some(ev => ev.type === 'pattern:broken' && ev.playerId === 'p1'));
    assert.deepEqual(e.getStateFor('p1').you.pattern.moves, []);
    assert.equal(e.getStateFor('p1').you.pattern.pbp, 0);
});

// ------------------------------------------------------------ singularity --

/** Give a side SP directly - earning 200 through attacks is not what these test. */
function grantSp(engine, playerId, sp){
    engine._side(playerId).sp = sp;
}

test('buying a Singularity Card spends SP and fills the first open slot', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 250);

    const r = e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' });
    assert.equal(r.ok, true);
    assert.equal(r.state.you.sp, 50);
    assert.deepEqual(r.state.you.singularityCards, ['nova_burst', null, null]);
    assert.equal(e.turn.playerId, 'p1', 'a purchase must not end the turn');

    const bought = r.events.find(ev => ev.type === 'singularity:bought');
    assert.equal(bought.slotIndex, 0);
});

test('the store refuses a short bank, a full hand and unknown cards', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 150);
    assert.match(e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' }).error, /50 more/);
    assert.match(e.submitAction('p1', { type: 'buySingularity', cardId: 'nope' }).error, /not a Singularity/);

    grantSp(e, 'p1', 999);
    for (let i = 0; i < RULES.SINGULARITY_SLOTS; i++){
        assert.equal(e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' }).ok, true);
    }
    assert.match(e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' }).error, /full/);
});

test('Nova Burst strikes twice on its own ladder and empties its slot', () => {
    // Nova's ladder is [2/3, 3/4, 1]: roll 0 then roll 2.
    const e = makeEngine({ rng: scriptedRng([0, 0.99]) });
    grantSp(e, 'p1', 200);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' });

    const r = e.submitAction('p1', { type: 'attack', singularitySlot: 0 });
    assert.equal(r.ok, true);

    const used = r.events.find(ev => ev.type === 'singularity:used');
    assert.equal(used.cardId, 'nova_burst');

    const hits = r.events.filter(ev => ev.type === 'attack');
    assert.equal(hits.length, 2);
    assert.deepEqual(hits.map(h => h.multiplier), [0.67, 1]);
    assert.deepEqual(hits.map(h => h.multiplierIndex), [2, 4], 'rungs map onto the standard ladder');
    assert.deepEqual(hits.map(h => h.strike), [1, 2]);
    assert.ok(r.events.indexOf(used) < r.events.indexOf(hits[0]), 'the card is announced before it strikes');

    // Tobo (45 ATK) into Jace (14 DEF): round(45*0.67)=30 -> 16, then 45 -> 31.
    assert.equal(hits[1].esseAfter, 100 - 16 - 31);
    // Nova pays its own SP_PER_MULTIPLIER [2, 5, 10]: rung 0 then rung 2.
    assert.deepEqual(hits.map(h => h.spGained), [2, 10]);
    assert.equal(e.getStateFor('p1').you.sp, 12);
    assert.deepEqual(e.getStateFor('p1').you.singularityCards, [null, null, null]);
    assert.equal(e.turn.playerId, 'p2', 'it is still one base move');
});

test('a Nova Burst gives the next player extra clock for the cinematic', () => {
    let now = 1000;
    const a = buildCanonicalDeck(DECK_A).deck;
    const b = buildCanonicalDeck(DECK_B).deck;
    const e = new BattleEngine({
        matchId: 't', rng: () => 0, now: () => now,
        players: [{ id: 'p1', name: 'A', deck: a }, { id: 'p2', name: 'B', deck: b }],
    });

    grantSp(e, 'p1', 200);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' });
    e.submitAction('p1', { type: 'attack', singularitySlot: 0 });

    assert.equal(e.turn.deadline, now + RULES.TURN_MS + RULES.SINGULARITY_ATTACK_GRACE_MS);
});

test('a defend covers only the first Nova Burst strike', () => {
    const e = makeEngine({ rng: () => 0, firstPlayer: 'p2' });
    e.submitAction('p2', { type: 'defend' });

    grantSp(e, 'p1', 200);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' });
    const hits = e.submitAction('p1', { type: 'attack', singularitySlot: 0 })
        .events.filter(ev => ev.type === 'attack');

    assert.deepEqual(hits.map(h => h.defended), [true, false]);
});

test('a Nova Burst that knocks a card out forfeits its second strike', () => {
    const e = makeEngine({ rng: () => 0.99 });
    e._side('p2').cards[0].esse = 10;

    grantSp(e, 'p1', 200);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' });
    const r = e.submitAction('p1', { type: 'attack', singularitySlot: 0 });

    assert.equal(r.events.filter(ev => ev.type === 'attack').length, 1);
    assert.ok(r.events.some(ev => ev.type === 'card:defeated'));
});

test('Nova Burst in Pattern Bonus Mode earns no SP and spends one PBM attack', () => {
    const e = makeEngine({ rng: () => 0 });       // Nova roll 0 = 2/3 on both strikes
    const side = e._side('p1');
    side.pbm = { active: true, attacksLeft: RULES.PBM_ATTACKS };

    grantSp(e, 'p1', 200);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' });
    const hits = e.submitAction('p1', { type: 'attack', singularitySlot: 0 })
        .events.filter(ev => ev.type === 'attack');

    assert.deepEqual(hits.map(h => h.spGained),   [0, 0]);
    assert.deepEqual(hits.map(h => h.pbmBonusSp), [0, 0]);
    assert.deepEqual(hits.map(h => h.pbmSpent),   [true, false]);
    assert.equal(side.pbm.attacksLeft, RULES.PBM_ATTACKS - 1);
    assert.equal(side.sp, 0, 'the purchase spent the bank and the strikes added nothing');
});

// ------------------------------------------------------------- an artifact --

test('An Artifact is one guaranteed critical with +5 on top', () => {
    const e = makeEngine({ rng: () => 0 });       // a miss on the standard ladder
    grantSp(e, 'p1', 400);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'an_artifact' });

    const r    = e.submitAction('p1', { type: 'attack', singularitySlot: 0 });
    const hits = r.events.filter(ev => ev.type === 'attack');

    assert.equal(r.events.find(ev => ev.type === 'singularity:used').cardId, 'an_artifact');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].multiplier, 1);
    assert.equal(hits[0].multiplierIndex, 4, 'it lands as a critical on the standard ladder');

    // Tobo (45 ATK) crits Jace (14 DEF) for 31, and +5.
    assert.equal(hits[0].bonusDamage, 5);
    assert.equal(hits[0].damage, 36);
    assert.equal(hits[0].esseAfter, 64);
    assert.equal(hits[0].spGained, 10);
    assert.equal(e.turn.playerId, 'p2', 'it is one base move');
});

test('An Artifact goes through a plain brace and breaks it', () => {
    const e = makeEngine({ rng: () => 0, firstPlayer: 'p2' });
    e.submitAction('p2', { type: 'defend' });

    grantSp(e, 'p1', 400);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'an_artifact' });
    const hit = e.submitAction('p1', { type: 'attack', singularitySlot: 0 })
        .events.find(ev => ev.type === 'attack');

    assert.equal(hit.defended, false);
    assert.equal(hit.pierced, true);
    assert.equal(hit.damage, 36, 'not halved');
    assert.equal(e._side('p2').defending, false);
});

test('a Containment Field evades An Artifact\'s critical, but not the +5', () => {
    const e = makeEngine({ rng: () => 0 });
    raiseField(e);

    grantSp(e, 'p2', 400);
    e.submitAction('p2', { type: 'buySingularity', cardId: 'an_artifact' });
    const r   = e.submitAction('p2', { type: 'attack', singularitySlot: 0 });
    const hit = r.events.find(ev => ev.type === 'attack');

    // Jace (44 ATK) crits Tobo (12 DEF) for 32: 31 evaded, 1 through, +5.
    assert.equal(hit.field, 'containment_field');
    assert.equal(hit.evaded, 31);
    assert.equal(hit.damage, 6);
    assert.equal(hit.esseAfter, 94);
    assert.equal(r.events.find(ev => ev.type === 'field:broken').covered, true);
});

test('An Artifact gives the next player its own longer grace', () => {
    let now = 1000;
    const a = buildCanonicalDeck(DECK_A).deck;
    const b = buildCanonicalDeck(DECK_B).deck;
    const e = new BattleEngine({
        matchId: 't', rng: () => 0, now: () => now,
        players: [{ id: 'p1', name: 'A', deck: a }, { id: 'p2', name: 'B', deck: b }],
    });

    grantSp(e, 'p1', 400);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'an_artifact' });
    e.submitAction('p1', { type: 'attack', singularitySlot: 0 });

    assert.ok(e.turn.deadline > now + RULES.TURN_MS + RULES.SINGULARITY_ATTACK_GRACE_MS);
});

test('arming a bad slot is rejected before anything happens', () => {
    const e = makeEngine();
    const before = e.seq;

    assert.match(e.submitAction('p1', { type: 'attack', singularitySlot: 0 }).error, /empty/);
    assert.match(e.submitAction('p1', { type: 'attack', singularitySlot: 7 }).error, /not a Singularity slot/);
    assert.equal(e.seq, before);
});

// ------------------------------------------------------- containment field --

/** p1 buys a Containment Field and raises it with DEFEND. */
function raiseField(e, playerId = 'p1'){
    grantSp(e, playerId, 250);
    e.submitAction(playerId, { type: 'buySingularity', cardId: 'containment_field' });
    return e.submitAction(playerId, { type: 'defend', singularitySlot: 0 });
}

test('DEFEND with an armed Containment Field raises it round the active card', () => {
    let now = 1000;
    const a = buildCanonicalDeck(DECK_A).deck;
    const b = buildCanonicalDeck(DECK_B).deck;
    const e = new BattleEngine({
        matchId: 't', rng: () => 0, now: () => now,
        players: [{ id: 'p1', name: 'A', deck: a }, { id: 'p2', name: 'B', deck: b }],
    });

    const r = raiseField(e);
    assert.equal(r.ok, true);

    const used = r.events.find(ev => ev.type === 'singularity:used');
    assert.equal(used.cardId, 'containment_field');
    assert.equal(used.attribute, 'defence');
    assert.equal(used.fieldCardId, 1);
    assert.ok(r.events.indexOf(used) < r.events.findIndex(ev => ev.type === 'defend'));

    assert.deepEqual(r.state.you.field, { singularity: 'containment_field', cardId: 1 });
    assert.equal(r.state.you.defending, false, 'the field replaces the plain brace');
    assert.deepEqual(r.state.you.singularityCards, [null, null, null]);
    assert.equal(e.turn.playerId, 'p2', 'it is one base move');
    assert.equal(e.turn.deadline, now + RULES.TURN_MS + RULES.SINGULARITY_DEFENCE_GRACE_MS);
});

test('a Containment Field evades 99% of an attack, then breaks', () => {
    const e = makeEngine({ rng: () => 0.99 });   // critical
    raiseField(e);

    const r   = e.submitAction('p2', { type: 'attack' });
    const hit = r.events.find(ev => ev.type === 'attack');

    // Jace (44 ATK) crits Tobo (12 DEF) for 32. 1% of it rounds to 0, but
    // a connected hit is never fully absorbed.
    assert.equal(hit.field, 'containment_field');
    assert.equal(hit.damage, 1);
    assert.equal(hit.evaded, 31);
    assert.equal(hit.esseAfter, 99);
    assert.equal(hit.defended, false);

    const broken = r.events.find(ev => ev.type === 'field:broken');
    assert.deepEqual([broken.playerId, broken.cardId, broken.covered], ['p1', 1, true]);
    assert.equal(e.getStateFor('p1').you.field, null);

    // The next attack lands in full.
    e.submitAction('p1', { type: 'defend' });
    e._side('p1').defending = false;
    const next = e.submitAction('p2', { type: 'attack' }).events.find(ev => ev.type === 'attack');
    assert.equal(next.field, null);
    assert.ok(next.damage > 1);
});

test('a Containment Field takes both Nova Burst strikes', () => {
    const e = makeEngine({ rng: () => 0.99 });
    raiseField(e);

    grantSp(e, 'p2', 200);
    e.submitAction('p2', { type: 'buySingularity', cardId: 'nova_burst' });
    const r    = e.submitAction('p2', { type: 'attack', singularitySlot: 0 });
    const hits = r.events.filter(ev => ev.type === 'attack');

    assert.equal(hits.length, 2);
    assert.deepEqual(hits.map(h => h.field),  ['containment_field', 'containment_field']);
    assert.deepEqual(hits.map(h => h.damage), [1, 1]);
    assert.equal(r.events.filter(ev => ev.type === 'field:broken').length, 1);
    assert.ok(r.events.findIndex(ev => ev.type === 'field:broken') > r.events.indexOf(hits[1]));
});

test('a missed attack still spends the field', () => {
    const e = makeEngine({ rng: () => 0 });      // a miss
    raiseField(e);

    const r = e.submitAction('p2', { type: 'attack' });
    assert.equal(r.events.find(ev => ev.type === 'attack').damage, 0);
    assert.ok(r.events.some(ev => ev.type === 'field:broken'));
});

test('the field stays with its card through a swap', () => {
    const e = makeEngine({ rng: () => 0.99 });
    raiseField(e);

    // p1 repositions on p2's turn; the card now in the arena is unshielded.
    e.submitAction('p1', { type: 'swap', cardId: 4 });
    const r = e.submitAction('p2', { type: 'attack' });

    assert.equal(r.events.find(ev => ev.type === 'attack').field, null);
    assert.ok(!r.events.some(ev => ev.type === 'field:broken'));
    assert.deepEqual(e.getStateFor('p1').you.field, { singularity: 'containment_field', cardId: 1 });
});

test('a plain brace left standing is kept for the hit after the field', () => {
    const e = makeEngine({ rng: () => 0.99, firstPlayer: 'p1' });
    e._side('p1').defending = true;
    raiseField(e);

    const first = e.submitAction('p2', { type: 'attack' }).events.find(ev => ev.type === 'attack');
    assert.equal(first.defended, false);
    assert.equal(e._side('p1').defending, true);
});

test('Defence cards are refused anywhere but DEFEND, and one field a side', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 999);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'containment_field' });
    e.submitAction('p1', { type: 'buySingularity', cardId: 'containment_field' });
    e.submitAction('p1', { type: 'buySingularity', cardId: 'nova_burst' });

    const before = e.seq;
    assert.match(e.submitAction('p1', { type: 'attack', singularitySlot: 0 }).error, /not an Attack card/);
    assert.match(e.submitAction('p1', { type: 'defend', singularitySlot: 2 }).error, /not a Defence card/);
    assert.match(e.submitAction('p1', { type: 'useSingularity', cardId: 'containment_field' }).error, /press DEFEND/);
    assert.equal(e.seq, before);

    e.submitAction('p1', { type: 'defend', singularitySlot: 0 });
    e.submitAction('p2', { type: 'defend' });
    assert.match(e.submitAction('p1', { type: 'defend', singularitySlot: 1 }).error, /still up/);
});

test('Light Mend heals the active card +30 ESSE without spending the turn', () => {
    let now = 1000;
    const a = buildCanonicalDeck(DECK_A).deck;
    const b = buildCanonicalDeck(DECK_B).deck;
    const e = new BattleEngine({
        matchId: 't', rng: () => 0, now: () => now,
        players: [{ id: 'p1', name: 'A', deck: a }, { id: 'p2', name: 'B', deck: b }],
    });

    grantSp(e, 'p1', 300);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'light_mend' });

    const card = e._activeCard(e._side('p1'));
    card.esse = 50;
    const deadline = e.turn.deadline;

    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'light_mend', singularitySlot: 0 });
    assert.equal(r.ok, true);

    const used = r.events.find(ev => ev.type === 'singularity:used');
    assert.equal(used.attribute, 'healing');
    assert.equal(used.targetCardId, card.id);
    assert.equal(used.esseBefore, 50);
    assert.equal(used.esseAfter, 80);
    assert.equal(used.healed, 30);

    assert.equal(card.esse, 80);
    assert.deepEqual(r.state.you.singularityCards, [null, null, null]);
    assert.equal(e.turn.playerId, 'p1', 'a mend must not end the turn');
    assert.equal(e.turn.deadline, deadline + RULES.SINGULARITY_HEAL_GRACE_MS);
});

test('Light Mend never heals past the card\'s maximum ESSE', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 300);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'light_mend' });

    const card = e._activeCard(e._side('p1'));
    card.esse = card.maxEsse - 10;

    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'light_mend', singularitySlot: 0 });
    assert.equal(r.ok, true);
    assert.equal(card.esse, card.maxEsse);
    assert.equal(r.events.find(ev => ev.type === 'singularity:used').healed, 10);
});

test('Light Mend is refused on a full ESSE meter and stays in its slot', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 300);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'light_mend' });

    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'light_mend', singularitySlot: 0 });
    assert.match(r.error, /full ESSE/);
    assert.deepEqual(e.getStateFor('p1').you.singularityCards, ['light_mend', null, null]);

    // Swapped to a hurt card, the same Light Mend goes through.
    const side = e._side('p1');
    side.cards[1].esse = 40;
    assert.equal(e.submitAction('p1', { type: 'swap', cardId: side.cards[1].id }).ok, true);
    assert.equal(e.submitAction('p1', { type: 'useSingularity', cardId: 'light_mend', singularitySlot: 0 }).ok, true);
    assert.equal(side.cards[1].esse, 70);
});

test('Light Mend is played on the healer\'s own turn, from a slot that holds it', () => {
    const e = makeEngine();
    grantSp(e, 'p2', 300);
    e.submitAction('p2', { type: 'buySingularity', cardId: 'light_mend' });
    e._activeCard(e._side('p2')).esse = 10;

    assert.match(e.submitAction('p2', { type: 'useSingularity', cardId: 'light_mend', singularitySlot: 0 }).error, /not your turn/);

    e.submitAction('p1', { type: 'attack' });
    assert.match(e.submitAction('p2', { type: 'useSingularity', cardId: 'light_mend', singularitySlot: 1 }).error, /does not hold/);
    assert.equal(e.submitAction('p2', { type: 'useSingularity', cardId: 'light_mend', singularitySlot: 0 }).ok, true);
});

test('Heavy Mend heals the active card +75 ESSE without spending the turn', () => {
    let now = 1000;
    const a = buildCanonicalDeck(DECK_A).deck;
    const b = buildCanonicalDeck(DECK_B).deck;
    const e = new BattleEngine({
        matchId: 't', rng: () => 0, now: () => now,
        players: [{ id: 'p1', name: 'A', deck: a }, { id: 'p2', name: 'B', deck: b }],
    });

    grantSp(e, 'p1', 500);
    assert.equal(e.submitAction('p1', { type: 'buySingularity', cardId: 'heavy_mend' }).ok, true);

    const card = e._activeCard(e._side('p1'));
    card.esse = 10;
    const deadline = e.turn.deadline;

    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'heavy_mend', singularitySlot: 0 });
    assert.equal(r.ok, true);

    const used = r.events.find(ev => ev.type === 'singularity:used');
    assert.equal(used.attribute, 'healing');
    assert.equal(used.esseBefore, 10);
    assert.equal(used.esseAfter, 85);
    assert.equal(used.healed, 75);

    assert.equal(card.esse, 85);
    assert.deepEqual(r.state.you.singularityCards, [null, null, null], 'one use, then it is gone');
    assert.equal(e.turn.playerId, 'p1', 'a mend must not end the turn');
    assert.ok(e.turn.deadline > deadline + RULES.SINGULARITY_HEAL_GRACE_MS, 'its longer cinematic gets a longer grace');

    // Gone means gone: it cannot be played again without buying another.
    card.esse = 10;
    assert.match(e.submitAction('p1', { type: 'useSingularity', cardId: 'heavy_mend', singularitySlot: 0 }).error, /do not hold/);
});

test('Heavy Mend never heals past the card\'s maximum ESSE', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 500);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'heavy_mend' });

    const card = e._activeCard(e._side('p1'));
    card.esse = card.maxEsse - 20;

    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'heavy_mend', singularitySlot: 0 });
    assert.equal(r.ok, true);
    assert.equal(card.esse, card.maxEsse);
    assert.equal(r.events.find(ev => ev.type === 'singularity:used').healed, 20);
});

test('Heavy Mend is refused on a full ESSE meter and stays in its slot', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 500);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'heavy_mend' });

    const before = e.seq;
    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'heavy_mend', singularitySlot: 0 });
    assert.match(r.error, /full ESSE/);
    assert.equal(e.seq, before);
    assert.deepEqual(e.getStateFor('p1').you.singularityCards, ['heavy_mend', null, null]);

    // Swapped to a hurt card, the same Heavy Mend goes through.
    const side = e._side('p1');
    side.cards[1].esse = 5;
    assert.equal(e.submitAction('p1', { type: 'swap', cardId: side.cards[1].id }).ok, true);
    assert.equal(e.submitAction('p1', { type: 'useSingularity', cardId: 'heavy_mend', singularitySlot: 0 }).ok, true);
    assert.equal(side.cards[1].esse, 80);
});

/** p1 buys Dark Disturbance into slot 0. */
function armDarkDisturbance(e, playerId = 'p1'){
    grantSp(e, playerId, 400);
    assert.equal(e.submitAction(playerId, { type: 'buySingularity', cardId: 'dark_disturbance' }).ok, true);
}

test('Dark Disturbance lays Cosmic Darkness on the opponent\'s card as a base move', () => {
    let now = 1000;
    const a = buildCanonicalDeck(DECK_A).deck;
    const b = buildCanonicalDeck(DECK_B).deck;
    const e = new BattleEngine({
        matchId: 't', rng: () => 0, now: () => now,
        players: [{ id: 'p1', name: 'A', deck: a }, { id: 'p2', name: 'B', deck: b }],
    });
    armDarkDisturbance(e);

    const target = e._activeCard(e._side('p2'));
    const r = e.submitAction('p1', { type: 'afflict', singularitySlot: 0 });
    assert.equal(r.ok, true);

    const used = r.events.find(ev => ev.type === 'singularity:used');
    assert.equal(used.attribute, 'affliction');
    assert.equal(used.targetPlayerId, 'p2');
    assert.equal(used.targetCardId, target.id);
    assert.equal(used.affliction.name, 'COSMIC DARKNESS');

    assert.deepEqual(r.state.you.singularityCards, [null, null, null]);
    const shown = r.state.opponent.cards.find(c => c.id === target.id);
    assert.equal(shown.affliction.attacksLeft, 8);
    assert.equal(shown.affliction.esseLoss, 10);

    assert.equal(e.turn.playerId, 'p2', 'an affliction is a base move and passes the turn');
    assert.equal(e.turn.deadline, now + RULES.TURN_MS + RULES.SINGULARITY_AFFLICTION_GRACE_MS);
    assert.deepEqual(e._side('p1').pattern.moves, ['attack']);
});

test('an afflicted card loses 10 ESSE after every attempted attack, a miss included', () => {
    // rng 0 = a miss on the standard ladder.
    const e = makeEngine({ rng: () => 0 });
    armDarkDisturbance(e);
    e.submitAction('p1', { type: 'afflict', singularitySlot: 0 });

    const card = e._activeCard(e._side('p2'));
    const before = card.esse;

    const r = e.submitAction('p2', { type: 'attack' });
    assert.equal(r.ok, true);
    assert.equal(r.events.find(ev => ev.type === 'attack').damage, 0);

    const tick = r.events.find(ev => ev.type === 'affliction:tick');
    assert.equal(tick.cardId, card.id);
    assert.equal(tick.esseLoss, 10);
    assert.equal(tick.attacksLeft, 7);
    assert.equal(card.esse, before - 10);

    // Defending is not an attack - nothing bleeds.
    e.submitAction('p1', { type: 'defend' });
    const d = e.submitAction('p2', { type: 'defend' });
    assert.equal(d.events.some(ev => ev.type === 'affliction:tick'), false);
    assert.equal(card.esse, before - 10);
});

test('Cosmic Darkness lasts eight attacks, then lifts', () => {
    const e = makeEngine({ rng: () => 0 });
    armDarkDisturbance(e);
    e.submitAction('p1', { type: 'afflict', singularitySlot: 0 });

    const card = e._activeCard(e._side('p2'));
    card.esse = card.maxEsse = 500;

    let last = null;
    for (let i = 0; i < 8; i++){
        last = e.submitAction('p2', { type: 'attack' });
        e.submitAction('p1', { type: 'defend' });
    }

    assert.equal(card.esse, 500 - 80);
    assert.equal(card.affliction, null);
    const ended = last.events.find(ev => ev.type === 'affliction:ended');
    assert.equal(ended.expired, true);

    e.submitAction('p2', { type: 'attack' });
    assert.equal(card.esse, 420, 'a lifted affliction bleeds no more');
});

test('Cosmic Darkness follows its card through a swap, and a Nova Burst is one attempt', () => {
    const e = makeEngine({ rng: () => 0 });
    armDarkDisturbance(e);
    e.submitAction('p1', { type: 'afflict', singularitySlot: 0 });

    const p2 = e._side('p2');
    const cursed = e._activeCard(p2);

    e.submitAction('p2', { type: 'swap', cardId: p2.cards[1].id });
    const clean = e._activeCard(p2);
    const r = e.submitAction('p2', { type: 'attack' });
    assert.equal(r.events.some(ev => ev.type === 'affliction:tick'), false, 'the card swapped in is clean');
    assert.equal(cursed.affliction.attacksLeft, 8);
    assert.equal(clean.affliction, null);

    // Back in, it bleeds once for a two-strike Nova Burst.
    e.submitAction('p1', { type: 'defend' });
    e.submitAction('p2', { type: 'swap', cardId: cursed.id });
    grantSp(e, 'p2', 200);
    e.submitAction('p2', { type: 'buySingularity', cardId: 'nova_burst' });
    const nova = e.submitAction('p2', { type: 'attack', singularitySlot: 0 });
    assert.equal(nova.events.filter(ev => ev.type === 'affliction:tick').length, 1);
    assert.equal(cursed.affliction.attacksLeft, 7);
});

test('a card bled to nothing by Cosmic Darkness is knocked out on its own move', () => {
    const e = makeEngine({ rng: () => 0 });
    armDarkDisturbance(e);
    e.submitAction('p1', { type: 'afflict', singularitySlot: 0 });

    const p2   = e._side('p2');
    const card = e._activeCard(p2);
    card.esse  = 5;

    const r = e.submitAction('p2', { type: 'attack' });
    assert.equal(r.ok, true);
    assert.equal(card.defeated, true);
    assert.equal(card.affliction, null);
    assert.ok(r.events.find(ev => ev.type === 'card:defeated' && ev.cardId === card.id));
    assert.notEqual(e._activeCard(p2).id, card.id);
    assert.equal(e.turn.playerId, 'p1');

    // Bled out on the last card, the attacker loses.
    p2.cards.forEach(c => { if (c !== e._activeCard(p2)) c.defeated = true; });
    const last = e._activeCard(p2);
    last.esse = 3;
    last.affliction = { singularity: 'dark_disturbance', name: 'COSMIC DARKNESS', esseLoss: 10, attacksLeft: 4, attacksTotal: 8 };
    e.submitAction('p1', { type: 'defend' });
    e.submitAction('p2', { type: 'attack' });
    assert.equal(e.status, 'finished');
    assert.equal(e.result.winnerId, 'p1');
});

test('Dark Disturbance is refused off-turn, on an afflicted card, and anywhere but AFFLICT', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 800);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'dark_disturbance' });
    e.submitAction('p1', { type: 'buySingularity', cardId: 'dark_disturbance' });

    assert.match(e.submitAction('p1', { type: 'useSingularity', cardId: 'dark_disturbance' }).error, /COSMIC DARKNESS/);
    assert.match(e.submitAction('p1', { type: 'attack', singularitySlot: 0 }).error, /not an Attack/);
    assert.match(e.submitAction('p1', { type: 'afflict', singularitySlot: 2 }).error, /empty/);
    assert.match(e.submitAction('p1', { type: 'afflict' }).error, /not a Singularity slot/);
    assert.match(e.submitAction('p2', { type: 'afflict', singularitySlot: 0 }).error, /not your turn/);

    assert.equal(e.submitAction('p1', { type: 'afflict', singularitySlot: 0 }).ok, true);
    e.submitAction('p2', { type: 'defend' });
    assert.match(e.submitAction('p1', { type: 'afflict', singularitySlot: 1 }).error, /already under COSMIC DARKNESS/);
    assert.deepEqual(e.getStateFor('p1').you.singularityCards, [null, 'dark_disturbance', null]);
});

/** Lay Cosmic Darkness straight on a card, as Dark Disturbance would. */
function hexCard(card, attacksLeft = 8){
    card.affliction = { singularity: 'dark_disturbance', name: 'COSMIC DARKNESS', esseLoss: 10, attacksLeft, attacksTotal: 8 };
}

test('Pattern Interruption cures every afflicted card without spending the turn', () => {
    let now = 1000;
    const a = buildCanonicalDeck(DECK_A).deck;
    const b = buildCanonicalDeck(DECK_B).deck;
    const e = new BattleEngine({
        matchId: 't', rng: () => 0, now: () => now,
        players: [{ id: 'p1', name: 'A', deck: a }, { id: 'p2', name: 'B', deck: b }],
    });

    grantSp(e, 'p1', 500);
    assert.equal(e.submitAction('p1', { type: 'buySingularity', cardId: 'pattern_interruption' }).ok, true);

    // One in the arena, one carried to the bench through a swap.
    const side   = e._side('p1');
    const active = e._activeCard(side);
    const bench  = side.cards.find(c => c !== active);
    hexCard(active, 5);
    hexCard(bench, 2);
    const deadline = e.turn.deadline;

    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'pattern_interruption', singularitySlot: 0 });
    assert.equal(r.ok, true);

    const used = r.events.find(ev => ev.type === 'singularity:used');
    assert.equal(used.attribute, 'cleanse');
    assert.equal(used.targetCardId, active.id);
    assert.deepEqual(used.cleansed.map(c => c.cardId).sort(), [active.id, bench.id].sort());
    assert.equal(used.cleansed.find(c => c.cardId === active.id).name, 'COSMIC DARKNESS');

    assert.equal(active.affliction, null);
    assert.equal(bench.affliction, null);
    assert.ok(r.state.you.cards.every(c => c.affliction === null));
    assert.deepEqual(r.state.you.singularityCards, [null, null, null]);
    assert.equal(e.turn.playerId, 'p1', 'a cleanse must not end the turn');
    assert.ok(e.turn.deadline > deadline, 'the cleanser\'s clock waits out the cinematic');

    // Cured means it bleeds no more.
    const esse = active.esse;
    const a2 = e.submitAction('p1', { type: 'attack' });
    assert.equal(a2.events.some(ev => ev.type === 'affliction:tick'), false);
    assert.equal(active.esse, esse);
});

test('Pattern Interruption is refused with nothing to cure and stays in its slot', () => {
    const e = makeEngine();
    grantSp(e, 'p1', 500);
    e.submitAction('p1', { type: 'buySingularity', cardId: 'pattern_interruption' });

    const before = e.seq;
    const r = e.submitAction('p1', { type: 'useSingularity', cardId: 'pattern_interruption', singularitySlot: 0 });
    assert.match(r.error, /kept/);
    assert.equal(e.seq, before);
    assert.deepEqual(e.getStateFor('p1').you.singularityCards, ['pattern_interruption', null, null]);

    // A defeated card's old affliction does not count.
    const side = e._side('p1');
    const fallen = side.cards.find(c => c !== e._activeCard(side));
    hexCard(fallen);
    fallen.defeated = true;
    assert.match(e.submitAction('p1', { type: 'useSingularity', cardId: 'pattern_interruption', singularitySlot: 0 }).error, /kept/);

    // Once an affliction lands, the same card goes through.
    hexCard(e._activeCard(side));
    assert.equal(e.submitAction('p1', { type: 'useSingularity', cardId: 'pattern_interruption', singularitySlot: 0 }).ok, true);
});

test('Pattern Interruption is played on the cleanser\'s own turn, from a slot that holds it', () => {
    const e = makeEngine();
    grantSp(e, 'p2', 500);
    e.submitAction('p2', { type: 'buySingularity', cardId: 'pattern_interruption' });
    hexCard(e._activeCard(e._side('p2')));

    assert.match(e.submitAction('p2', { type: 'useSingularity', cardId: 'pattern_interruption', singularitySlot: 0 }).error, /not your turn/);

    e.submitAction('p1', { type: 'defend' });
    assert.match(e.submitAction('p2', { type: 'useSingularity', cardId: 'pattern_interruption', singularitySlot: 1 }).error, /does not hold/);
    assert.equal(e.submitAction('p2', { type: 'useSingularity', cardId: 'pattern_interruption', singularitySlot: 0 }).ok, true);
});

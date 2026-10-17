/**
 * End-to-end match flow over real sockets.
 *
 * Boots a bare Socket.io server with only registerSocketHandlers() attached - no
 * database, no session store - so the queue => pairing => BattleEngine => result
 * chain can be exercised on its own. Guest auth is the way in.
 *
 * Run with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

import { registerSocketHandlers } from '../src/sockets/index.js';

const DECK_A = [{ id: 1 }, { id: 4 }, { id: 7 }, { id: 8 }];
const DECK_B = [{ id: 2 }, { id: 5 }, { id: 9 }, { id: 10 }];

/** Resolve on the next occurrence of an event, or reject if it never lands. */
function once(socket, event, ms = 8000){
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for '${event}'`)), ms);
        socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
    });
}

function emit(socket, event, payload){
    return new Promise(resolve => socket.emit(event, payload, resolve));
}

async function bootServer(){
    process.env.ALLOW_GUEST = 'true';

    const http = createServer();
    const io   = new Server(http, { cors: { origin: '*' } });
    const { matchmaker } = registerSocketHandlers(io);

    await new Promise(resolve => http.listen(0, resolve));

    const url = `http://localhost:${http.address().port}`;

    return {
        url,
        async close(){
            matchmaker.stop();
            io.close();
            await new Promise(resolve => http.close(resolve));
        },
    };
}

function guest(url, name){
    return connect(url, { auth: { guestId: name, name }, transports: ['websocket'] });
}

test('two guests queue, get paired and receive an opening board', async (t) => {
    const server = await bootServer();
    const a = guest(server.url, 'Alpha');
    const b = guest(server.url, 'Beta');

    t.after(async () => { a.close(); b.close(); await server.close(); });

    await Promise.all([once(a, 'connected'), once(b, 'connected')]);

    const foundA = once(a, 'match:found');
    const foundB = once(b, 'match:found');

    assert.equal((await emit(a, 'queue:join', { deck: DECK_A })).ok, true);
    assert.equal((await emit(b, 'queue:join', { deck: DECK_B })).ok, true);

    const [fa, fb] = await Promise.all([foundA, foundB]);
    assert.equal(fa.matchId, fb.matchId);
    assert.equal(fa.you.name, 'Alpha');
    assert.equal(fa.opponent.name, 'Beta');
    assert.equal(fa.opponent.deck.length, 4);

    // The VS countdown runs before the engine exists.
    const [ba, bb] = await Promise.all([once(a, 'match:begin'), once(b, 'match:begin')]);

    assert.equal(ba.state.status, 'active');
    assert.equal(ba.state.you.cards.length, 4);
    assert.equal(ba.state.opponent.cards.length, 4);
    assert.ok(ba.state.turn.deadline > Date.now());

    // Exactly one of them holds the first turn.
    assert.equal(ba.state.turn.yours !== bb.state.turn.yours, true);
});

test('an illegal deck never reaches the queue', async (t) => {
    const server = await bootServer();
    const a = guest(server.url, 'Cheater');

    t.after(async () => { a.close(); await server.close(); });
    await once(a, 'connected');

    const res = await emit(a, 'queue:join', { deck: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });
    assert.equal(res.ok, false);        // three Supra cards
    assert.match(res.error, /Supra|Bonum|Fere/);
});

test('a full match plays out to a winner over the wire', async (t) => {
    const server = await bootServer();
    const a = guest(server.url, 'Alpha');
    const b = guest(server.url, 'Beta');

    t.after(async () => { a.close(); b.close(); await server.close(); });
    await Promise.all([once(a, 'connected'), once(b, 'connected')]);

    await emit(a, 'queue:join', { deck: DECK_A });
    await emit(b, 'queue:join', { deck: DECK_B });

    const [ba, bb] = await Promise.all([once(a, 'match:begin'), once(b, 'match:begin')]);

    const seats = {
        [ba.state.you.playerId]: a,
        [bb.state.you.playerId]: b,
    };

    const overA = once(a, 'match:over', 30000);
    const overB = once(b, 'match:over', 30000);

    // Whoever holds the turn attacks, until the engine calls it.
    let state = ba.state.turn.yours ? ba.state : bb.state;
    let guard = 0;

    while (state.status === 'active' && guard++ < 400){
        const socket = seats[state.turn.playerId];
        const res    = await emit(socket, 'battle:action', { type: 'attack' });

        assert.equal(res.ok, true, res.error);
        state = res.state;

        // The acting seat's own state shows the turn has moved on.
        if (state.status === 'active') assert.equal(state.turn.yours, false);
    }

    const [oa, ob] = await Promise.all([overA, overB]);

    assert.equal(oa.result.reason, 'defeat');
    assert.equal(oa.result.winnerId, ob.result.winnerId);
    assert.equal(oa.won !== ob.won, true, 'exactly one winner');

    // The loser really is wiped out.
    const loser = oa.won ? ob : oa;
    assert.ok(loser.state.you.cards.every(c => c.defeated));
});

test('the server refuses a move made out of turn', async (t) => {
    const server = await bootServer();
    const a = guest(server.url, 'Alpha');
    const b = guest(server.url, 'Beta');

    t.after(async () => { a.close(); b.close(); await server.close(); });
    await Promise.all([once(a, 'connected'), once(b, 'connected')]);

    await emit(a, 'queue:join', { deck: DECK_A });
    await emit(b, 'queue:join', { deck: DECK_B });

    const [ba, bb] = await Promise.all([once(a, 'match:begin'), once(b, 'match:begin')]);
    const waiting = ba.state.turn.yours ? b : a;

    const res = await emit(waiting, 'battle:action', { type: 'attack' });
    assert.equal(res.ok, false);
    assert.match(res.error, /not your turn/);
});

test('a junk action is rejected before it reaches the engine', async (t) => {
    const server = await bootServer();
    const a = guest(server.url, 'Alpha');
    const b = guest(server.url, 'Beta');

    t.after(async () => { a.close(); b.close(); await server.close(); });
    await Promise.all([once(a, 'connected'), once(b, 'connected')]);

    await emit(a, 'queue:join', { deck: DECK_A });
    await emit(b, 'queue:join', { deck: DECK_B });

    const [ba] = await Promise.all([once(a, 'match:begin'), once(b, 'match:begin')]);
    const mover = ba.state.turn.yours ? a : b;

    assert.equal((await emit(mover, 'battle:action', { type: 'nuke' })).ok, false);
    assert.equal((await emit(mover, 'battle:action', {})).ok, false);
});

test('both seats are told when a battle ends in a forfeit', async (t) => {
    const server = await bootServer();
    const a = guest(server.url, 'Alpha');
    const b = guest(server.url, 'Beta');

    t.after(async () => { a.close(); b.close(); await server.close(); });
    await Promise.all([once(a, 'connected'), once(b, 'connected')]);

    await emit(a, 'queue:join', { deck: DECK_A });
    await emit(b, 'queue:join', { deck: DECK_B });

    const [ba] = await Promise.all([once(a, 'match:begin'), once(b, 'match:begin')]);

    const overA = once(a, 'match:over');
    const overB = once(b, 'match:over');

    assert.equal((await emit(a, 'battle:forfeit')).ok, true);

    const [oa, ob] = await Promise.all([overA, overB]);
    assert.equal(oa.won, false);
    assert.equal(ob.won, true);
    assert.equal(oa.result.reason, 'forfeit');
    assert.equal(ob.result.winnerId, ba.state.opponent.playerId);
});

test('battle:state resyncs a player who lost the board', async (t) => {
    const server = await bootServer();
    const a = guest(server.url, 'Alpha');
    const b = guest(server.url, 'Beta');

    t.after(async () => { a.close(); b.close(); await server.close(); });
    await Promise.all([once(a, 'connected'), once(b, 'connected')]);

    await emit(a, 'queue:join', { deck: DECK_A });
    await emit(b, 'queue:join', { deck: DECK_B });

    const [ba] = await Promise.all([once(a, 'match:begin'), once(b, 'match:begin')]);

    const res = await emit(a, 'battle:state');
    assert.equal(res.ok, true);
    assert.equal(res.state.matchId, ba.matchId);
    assert.equal(res.state.you.playerId, ba.state.you.playerId);
});

/** 
 * --- The Match Manager ---
 *
 * The room, the roster and the clock. It owns everything the BattleEngine
 * deliberately does not: sockets, timers, disconnect grace windows and cleanup.
 * The engine decides what happened; this decides who hears about it and when.
 */

import { nanoid } from "nanoid";
import { BattleEngine, END_REASON, RULES } from "./BattleEngine.js";

const COUNTDOWN_MS = 3000;      // VS screen duration before battle starts
const RECONNECT_MS = 30000;     // grace period before a dropped player forfeits
const TURN_GRACE_MS = 750;      // latency cushion before the server calls a turn late

export class MatchManager {
    constructor(io){
        this.io = io;
        this.matches = new Map();           // matchId => match record
        this.playerMatch = new Map();       // playerId => matchId
    }

    // createMatch(): ....
    createMatch(a, b){
        const matchId = nanoid(10);
        const room = `match:${matchId}`;

        // THE TRUE MATCH OBJECT FOR EACH PLAYER:
        const match = {
            matchId,
            room,
            createdAt: Date.now(),
            status: 'starting',                     // 'starting' | 'active' | 'finished'
            players: {
                [a.playerId]: { ...a, connected: true },
                [b.playerId]: { ...b, connected: true },
            },
            playerIds: [a.playerId, b.playerId],

            // Built in _beginBattle(), not here: the engine starts its turn clock the
            // moment it is constructed, and nobody should be burning turn time while
            // the VS screen is still counting down.
            engine: null,

            turnTimer: null,
            dropTimers: new Map(),          // playerId => reconnect grace timer
        }; 

        this.matches.set(matchId, match);
        this.playerMatch.set(a.playerId, matchId);
        this.playerMatch.set(b.playerId, matchId);

        // Put both sockets in the room
        // Note: The players will be put in the same room here:
        for (const p of [a, b]){
            const socket = this.io.sockets.sockets.get(p.socketId);
            if (socket) socket.join(room);
        }

        console.log(`⚔️ Match ${matchId}: ${a.name} vs ${b.name}`); // Testing

        this._announce(match, a, b);
        return match;
    }

    /**
     * Each player gets a payload framed from their own perspective.
     *
     * Both decks ride along: FindMatchScene's versus panel shows the full four-card
     * loadout for each side, and these are the server's canonical cards, so the
     * client never has to trust - or even know - what the opponent claimed to hold.
     */
    _announce(match, a, b){
        const pairs = [[a, b], [b, a]];

        // Public view of a player - safe to hand to the other side.
        const profileOf = p => ({
            playerId: p.playerId,
            name:     p.name,
            elo:      p.elo,
            rank:     p.rank,
            deck:     (p.deck || []).map(c => ({
                id: c.id, name: c.name, shortName: c.shortName,
                cate: c.cate, atk: c.atk, def: c.def, esse: c.esse,
            })),
        });

        for (const [self, opponent] of pairs){
            const socket = this.io.sockets.sockets.get(self.socketId);
            if (!socket) continue;

            socket.emit('match:found', {
                matchId:  match.matchId,
                startsIn: COUNTDOWN_MS,
                you:      profileOf(self),
                opponent: profileOf(opponent)
            });
        }

        setTimeout(() => this._beginBattle(match.matchId), COUNTDOWN_MS);
    }

    //_beginBattle(): ... 
    _beginBattle(matchId){
        const match = this.matches.get(matchId); 
        if (!match || match.status !== 'starting') return;

        match.status = 'active';

        // The engine takes over the rules from here. It flips for first turn in its
        // constructor, so the clock starts the instant this line runs.
        match.engine = new BattleEngine({
            matchId,
            players: match.playerIds.map(id => ({
                id, name: match.players[id].name, deck: match.players[id].deck
            }))
        });

        for (const id of match.playerIds){
            const socket = this.io.sockets.sockets.get(match.players[id].socketId);
            socket?.emit('match:begin', {
                matchId,
                state:  match.engine.getStateFor(id),
                events: match.engine.history,
                rules:  {
                    turnMs:       RULES.TURN_MS,
                    swapsPerTurn: RULES.SWAPS_PER_TURN,
                    pbpMax:       RULES.PBM_THRESHOLD,
                    pbmAttacks:   RULES.PBM_ATTACKS,
                },
            });
        }

        this._armTurnTimer(match);

        console.log(`▶️ Match ${matchId} started`); // Testing
    }

    /**
     * handleAction(): A player's move arrives here, gets ruled on by the engine and
     * the result goes out to both seats.
     *
     * @returns {{ok: true, state: object} | {ok: false, error: string}} for the ack
     */
    handleAction(playerId, action){
        const match = this.getMatchForPlayer(playerId);
        if (!match)         return { ok: false, error: 'You are not in a match' };
        if (!match.engine)  return { ok: false, error: 'The battle has not started yet' };

        const result = match.engine.submitAction(playerId, action);
        if (!result.ok) return result;      // rejected: nobody else needs to know

        this._broadcast(match, result.events);

        return { ok: true, state: result.state };
    }

    /** handleForfeit(): A player is conceding on purpose - no grace window. */
    handleForfeit(playerId){
        const match = this.getMatchForPlayer(playerId);
        if (!match)         return { ok: false, error: 'You are not in a match' };
        if (!match.engine)  return { ok: false, error: 'The battle has not started yet' };

        const { ok, events } = match.engine.forfeit(playerId, END_REASON.FORFEIT);
        if (!ok) return { ok: false, error: 'This match is already over' };

        this._broadcast(match, events);
        return { ok: true };
    }

    /** Push an engine event batch to both players, each with their own state view. */
    _broadcast(match, events){
        if (!events?.length) return;

        for (const id of match.playerIds){
            const socket = this.io.sockets.sockets.get(match.players[id].socketId);
            socket?.emit('battle:events', {
                matchId: match.matchId,
                events,
                state:   match.engine.getStateFor(id),
            });
        }

        if (match.engine.isFinished()) this._settle(match);
        else                           this._armTurnTimer(match);
    }

    /**
     * _armTurnTimer(): Nobody should be able to freeze a match by walking away, so
     * the server keeps its own copy of the turn clock. The small grace on top of the
     * engine's deadline keeps an honest-but-laggy action from being thrown out.
     */
    _armTurnTimer(match){
        this._clearTurnTimer(match);
        if (!match.engine || match.engine.isFinished()) return;

        const wait = Math.max(0, match.engine.deadline - Date.now()) + TURN_GRACE_MS;

        match.turnTimer = setTimeout(() => {
            match.turnTimer = null;
            if (!match.engine || match.engine.isFinished()) return;

            const { ok, events } = match.engine.timeoutTurn();
            if (ok) this._broadcast(match, events);
        }, wait);
    }

    _clearTurnTimer(match){
        if (match.turnTimer)
        {
            clearTimeout(match.turnTimer);
            match.turnTimer = null;
        }
    }

    /** The engine has declared a winner: tell the room and tear the match down. */
    _settle(match){
        if (match.status === 'finished') return;

        match.status = 'finished';
        this._clearTurnTimer(match);
        for (const t of match.dropTimers.values()) clearTimeout(t);
        match.dropTimers.clear();

        const result = match.engine.result;

        for (const id of match.playerIds){
            const socket = this.io.sockets.sockets.get(match.players[id].socketId);
            socket?.emit('match:over', {
                matchId: match.matchId,
                won:     result.winnerId === id,
                result,
                state:   match.engine.getStateFor(id),
            });
        }

        console.log(`🏁 Match ${match.matchId} over - ${result.winnerId} wins (${result.reason})`); // Testing

        // TODO: persist the result and apply the ELO change before the record is dropped.
        this.endMatch(match.matchId);
    }

    // getMatchForPlayer(): ...
    getMatchForPlayer(playerId){
        const id = this.playerMatch.get(playerId);
        return id ? this.matches.get(id) : null;
    }

    // handleDisconnect(): ...
    handleDisconnect(playerId){
        const match = this.getMatchForPlayer(playerId);
        if (!match) return;

        const player = match.players[playerId];
        if (player) player.connected = false;

        this.io.to(match.room).emit('match:opponent_disconnected', {
            playerId,
            reconnectedWindowMs: RECONNECT_MS
        });

        // A match that never started has no engine to forfeit through - drop it so the
        // survivor is not stranded in a room waiting on a VS screen that will not resolve.
        if (!match.engine)
        {
            this.io.to(match.room).emit('match:aborted', { matchId: match.matchId });
            this.endMatch(match.matchId);
            return;
        }

        // 30s to get back in the chair; after that the engine hands the win over.
        const existing = match.dropTimers.get(playerId);
        if (existing) clearTimeout(existing);

        match.dropTimers.set(playerId, setTimeout(() => {
            match.dropTimers.delete(playerId);
            if (match.status === 'finished' || match.players[playerId]?.connected) return;

            const { ok, events } = match.engine.forfeit(playerId, END_REASON.FORFEIT);
            if (ok) this._broadcast(match, events);
        }, RECONNECT_MS));
    }

    // handleReconnect(): ....
    handleReconnect(playerId, socketId){
        const match = this.getMatchForPlayer(playerId);
        if (!match) return false;

        match.players[playerId].connected = true;
        match.players[playerId].socketId = socketId;

        const drop = match.dropTimers.get(playerId);
        if (drop)
        {
            clearTimeout(drop);
            match.dropTimers.delete(playerId);
        }

        const socket = this.io.sockets.sockets.get(socketId);
        socket?.join(match.room);

        // Hand back the live board, not just the match id - they have been away and
        // their scene has nothing to draw from.
        socket?.emit('match:rejoined', {
            matchId: match.matchId,
            state:   match.engine?.getStateFor(playerId) ?? null,
            events:  match.engine?.history ?? [],
        });

        this.io.to(match.room).emit('match:opponent_reconnected', { playerId });
        return true; 
    }

    // endMatch(): ....
    endMatch(matchId){
        const match = this.matches.get(matchId);
        if (!match) return;

        this._clearTurnTimer(match);
        for (const t of match.dropTimers.values()) clearTimeout(t);
        match.dropTimers.clear();

        for (const id of match.playerIds) this.playerMatch.delete(id);
        this.matches.delete(matchId);
    }
}

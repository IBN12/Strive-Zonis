import { buildCanonicalDeck } from "../../data/cardLibrary.js";

export function registerMatchmakingHandlers(io, socket, { matchmaker, matchManager }){
    const { playerId, name, elo, rank } = socket.data; 
    
    socket.on('queue:join', ({ deck } = {}, ack) => {
        if (matchManager.getMatchForPlayer(playerId))
        {
            return ack?.({ ok: false, error: 'You are already in a match' });
        }

        if (matchmaker.isQueued(playerId))
        {
            return ack?.({ ok: false, error: 'Already searching' });
        }

        // 🔒 Client sends IDs. Server owns the stats:
        const built = buildCanonicalDeck(deck);
        if (!built.ok) return ack?.({ ok: false, error: built.error });

        const result = matchmaker.enqueue({
            playerId,
            socketId: socket.id,
            name, elo, rank,
            deck: built.deck
        });

        if (!result.ok) return ack?.({ ok: false, error: result.error });

        ack?.({ ok: true, position: result.position });

        // Tell everyone still waiting how many are in the pool:
        io.emit('queue:status', matchmaker.getStatus());
    });

    socket.on('queue:leave', (_payload, ack) => {
        matchmaker.dequeue(playerId);
        ack?.({ ok: true });
        io.emit('queue:status', matchmaker.getStatus());
    });

    socket.on('queue:status', (_payload, ack) => {
        ack?.(matchmaker.getStatus());
    });
}
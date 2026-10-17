/**
 * Battle socket handlers.
 *
 * Thin on purpose. Every rule lives in the BattleEngine; this only carries the
 * intent across the wire and hands back whatever the engine ruled. Note that the
 * playerId comes from socket.data - set during the io.use() auth pass - and never
 * from the payload, so a client cannot act on somebody else's behalf.
 */

const ACTIONS = new Set(['attack', 'defend', 'afflict', 'swap', 'buySingularity', 'useSingularity']);

export function registerBattleHandlers(io, socket, { matchManager }){
    const { playerId } = socket.data;

    socket.on('battle:action', (payload = {}, ack) => {
        const type = payload?.type;

        if (!ACTIONS.has(type))
        {
            return ack?.({ ok: false, error: 'Unknown action' });
        }

        // Note: All Actions will be handled here in the MatchManager:
        const result = matchManager.handleAction(playerId, {
            type,
            cardId:          payload.cardId,
            singularitySlot: payload.singularitySlot,
        });

        ack?.(result);
    });

    /** Resync after a tab switch, a reconnect, or a dropped event batch. */
    socket.on('battle:state', (_payload, ack) => {
        const match = matchManager.getMatchForPlayer(playerId);

        if (!match?.engine)
        {
            return ack?.({ ok: false, error: 'You are not in a battle' });
        }

        ack?.({ ok: true, state: match.engine.getStateFor(playerId) });
    });

    socket.on('battle:forfeit', (_payload, ack) => {
        const result = matchManager.handleForfeit(playerId);
        ack?.(result);
    });
}

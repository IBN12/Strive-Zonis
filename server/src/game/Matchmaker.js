/**
 * In-memory FIFO queue with widening ELO window.
 * 
 * Single-process only. When you scale to multiple Node processes,
 * this movess to a Redis list with an atomic Lua pop.
 */

const ELO_START_WINDOW = 100;       // initial acceptable ELO gap
const ELO_WIDEN_PER_SEC = 25;       // gap grow while waiting
const ELO_MAX_WINDOW = 1000;

export class Matchmaker {
    constructor(matchManager){
        this.matchManager = matchManager;
        this.queue = [];        // [{ playerId, socketId, name, elo, deck, joinedAt }]
        this._tickTimer = null;
    }

    start(){
        // Re-check every second so the ELO window can widen over time:
        this._tickTimer = setInterval(() => this.tryMatch(), 1000);
    }

    stop(){
        clearInterval(this._tickTimer);
    }

    isQueued(playerId){
        return this.queue.some(e => e.playerId === playerId);
    }

    enqueue(entry){
        // Check if the player is already queued: 
        if (this.isQueued(entry.playerId))
        {
            return { ok: false, error: 'ALREADY_QUEUED' };
        }

        this.queue.push({ ...entry, joinedAt: Date.now() });

        if (process.env.MIN_QUEUE_LOG === 'true')
        {
            console.log(`🎯 ${entry.name} joined queue (${this.queue.length} waiting)`);
        }

        this.tryMatch();
        return { ok: true, position: this.queue.length };
    }

    dequeue(playerId){
        const before = this.queue.length;
        this.queue = this.queue.filter(e => e.playerId !== playerId);
        return this.queue.length !== before;
    }

    /** How wide this player's ELO window has grown. */
    _windowFor(entry, now){
        const waitedSec = (now - entry.joinedAt) / 1000;
        return Math.min(
            ELO_START_WINDOW + waitedSec * ELO_WIDEN_PER_SEC,
            ELO_MAX_WINDOW
        ); 
    }

    tryMatch(){
        if (this.queue.length < 2) return;

        const now = Date.now();

        // Oldest first, so nobody waits forever:
        const sorted = [...this.queue].sort((a, b) => a.joinedAt - b.joinedAt);

        for (let i = 0; i < sorted.length; i++){
            const a = sorted[i];
            if (!this.isQueued(a.playerId)) continue;

            for (let j = i + 1; j < sorted.length; j++){
                const b = sorted[j];
                if (!this.isQueued(b.playerId)) continue;

                const gap = Math.abs(a.elo - b.elo);
                const allowed = Math.max(this._windowFor(a, now), this._windowFor(b, now));

                // If the elo gap is to small then the allowed figure, keep searching 
                if (gap <= allowed)
                {
                    this.dequeue(a.playerId);
                    this.dequeue(b.playerId);
                    this.matchManager.createMatch(a, b);
                    return this.tryMatch(); // Keep pairing if more are waiting
                }
            }
        }
    }

    /** For the "N players searching" readout. */
    getStatus(){
        return { queued: this.queue.length };
    }
}
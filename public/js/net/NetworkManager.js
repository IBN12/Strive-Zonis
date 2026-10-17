/**
 * NetworkManager.js
 * 
 * Singleton wrapper around Socket.io. Scenes listen to this,
 * never to the raw socket.
 */

// Talk to whichever server served the page (keeps the session cookie first-party):
const SERVER_URL = location.protocol.startsWith('http') ? location.origin : 'http://localhost:3000';

class NetworkManagerClass extends Phaser.Events.EventEmitter {
    constructor(){
        super();
        this.socket         = null;
        this.playerId       = null;
        this.profile        = null;
        this.connected      = false;
    }

    connect(){
        if (this.socket)
        {
            if (this.socket.connected) this.emit('net:ready', this.profile);
            else this.socket.connect();
            return;
        }

        // Create the global socket for the client:
        this.socket = io(SERVER_URL, {
            withCredentials: true,          // Sends the session cookie
            reconnection: true,
            reconnectionAttempts: 8,
            reconnectionDelay: 1000,
            timeout: 8000
        });

        // Socket Server on the connect event:
        this.socket.on('connect', () => {
            this.connected = true;
        });

        // Socket Server on the 'connected' event: 
        this.socket.on('connected', (profile) => {
            this.playerId = profile.playerId;
            this.profile = profile;
            this.emit('net:ready', profile);
        });

        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            this.emit('net:disconnect', reason);
        });

        this.socket.on('connect_error', (err) => {
            this.connected = false;
            const msg = err.message === 'UNAUTHENTICATED'
                ? 'You must be logged in to play online'
                : 'Could not reach the server';
            this.emit('net:error', msg);
        }); 

        // Forward game events to whichever scene is listenin:
        // Note: This is where everything gets initiated for the
        // Players payload. 
        [
            'queue:status',
            'match:found',
            'match:begin',
            'match:rejoined',
            'match:over',
            'match:aborted',
            'match:opponent_disconnected',
            'match:opponent_reconnected', 
            'battle:events',
        ].forEach(evt => {
            this.socket.on(evt, (payload) => this.emit(evt, payload)); 
        });
    }

    disconnect(){
        this.socket?.disconnect();
        this.socket = null;
        this.connected = false;
    }

    /** Promise-wrapped emit using Socket.io acknowledgements. */
    request(event, payload = {}){
        return new Promise((resolve) => {
            if (!this.socket?.connected)
            {
                return resolve({ ok: false, error: 'Not connected to server' });
            }
            
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled)
                {
                    settled = true;
                    resolve({ ok: false, error: 'Server did not respond' });
                }
            }, 8000);

            // Note: This is sending a custom event with data from the server: 
            this.socket.emit(event, payload, (res) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(res || { ok: false, error: 'Empty response' });
            });
        });
    }

    joinQueue(deck) { return this.request('queue:join', { deck }); }
    leaveQueue()   { return this.request('queue:leave'); }

    // ---- Battle ----
    // The server rules on all three; the ack carries either the fresh state or
    // the reason it was refused. The board only moves on 'battle:events'.
    // An armed Attack attribute Singularity Card rides on the attack by slot.
    attack(singularitySlot = null) {
        return this.request('battle:action', singularitySlot == null
            ? { type: 'attack' }
            : { type: 'attack', singularitySlot });
    }
    // An armed Defence attribute Singularity Card rides on the defend the same way.
    defend(singularitySlot = null) {
        return this.request('battle:action', singularitySlot == null ? { type: 'defend' } : { type: 'defend', singularitySlot });
    }
    /** Cast the Affliction card armed in a slot on the opponent's card - a base move. */
    afflict(singularitySlot) {
        return this.request('battle:action', { type: 'afflict', singularitySlot });
    }

    swapCard(cardId)     { return this.request('battle:action', { type: 'swap', cardId }); }
    forfeitMatch()       { return this.request('battle:forfeit'); }

    // Singularity cards are intents like any other: the server checks the bank,
    // spends the SP and reports the play as a 'singularity:used' event.
    buySingularityCard(cardId) { return this.request('battle:action', { type: 'buySingularity', cardId }); }
    // A Healing card names the slot it is played from, as an armed card does.
    useSingularityCard(cardId, singularitySlot = null) {
        return this.request('battle:action', singularitySlot == null
            ? { type: 'useSingularity', cardId }
            : { type: 'useSingularity', cardId, singularitySlot });
    }

    /** Resync the board after a reconnect or a missed event batch. */
    fetchBattleState()   { return this.request('battle:state'); }
}

export const Net = new NetworkManagerClass();
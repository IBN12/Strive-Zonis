import { MatchManager } from "../game/MatchManager.js";
import { Matchmaker } from "../game/Matchmaker.js";
import { registerMatchmakingHandlers } from "./handlers/matchmaking.js";
import { registerBattleHandlers } from "./handlers/battle.js";

// registerSocketHandlers(): Will register all socket handlers:
export function registerSocketHandlers(io){
    const matchManager = new MatchManager(io);
    const matchmaker = new Matchmaker(matchManager);

    // Phase 1: This where the 
    // Searching for a match here: 
    matchmaker.start();

    // Phase 2:
    // ---- Authentication for all the registered users ----
    // Note: This is where the sockets will take 'users' table data:
    io.use((socket, next) => {
        const user = socket.request.user;       // populated by passport.session()

        if (user)
        {
            socket.data.playerId = String(user.id);
            socket.data.name     = user.username;
            socket.data.elo      = user.elo;
            socket.data.rank     = user.rank;
            return next();
        }

        if (process.env.ALLOW_GUEST === 'true')
        {
            const gid = socket.handshake.auth?.guestId || socket.id;
            socket.data.playerId = `guest:${gid}`; 
            socket.data.name     = socket.handshake.auth?.name || 'Guest'; 
            socket.data.elo      = 1000;
            socket.data.rank     = 'Unranked';
            return next();
        }

        next(new Error('UNAUTHENTICATED')); 
    });


    // Phase 3:
    // Note: This is where the socket will receive client data when
    // the client connects to the server. 
    io.on('connection', (socket) => {
        const { playerId, name } = socket.data;
        console.log(`🔌 ${name} connected (${socket.id})`);

        // Note: Send a 'connected' event with user socket data.
        // This will only go out to all the 'connected' events 
        // on the server as a payload.
        socket.emit('connected', {
            playerId,
            name,
            elo: socket.data.elo,
            rank: socket.data.rank
        });

        // Drop them back into a match in progress:
        const existing = matchManager.getMatchForPlayer(playerId);
        if (existing) matchManager.handleReconnect(playerId, socket.id);

        registerMatchmakingHandlers(io, socket, { matchmaker, matchManager });
        registerBattleHandlers(io, socket, { matchManager });

        socket.on('disconnect', (reason) => {
            console.log(`❌ ${name} disconnected (${reason})`);
            matchmaker.dequeue(playerId);
            matchManager.handleDisconnect(playerId);
        });
    });

    return { matchManager, matchmaker }; 
}
import 'dotenv/config';
import express from 'express';
import path from 'node:path'; 

import cors from 'cors';
import helmet from 'helmet';

import http from 'http';
import { Server } from 'socket.io';


import { testConnection } from './server/src/config/db.js';
import { createSessionMiddleware } from './server/src/config/session.js';
import { initPassport } from './server/src/auth/passport.js';
import { generalLimiter } from './server/src/middleware/rateLimiters.js';
import { errorHandler, notFound } from './server/src/middleware/errorHandler.js';
import authRouter from './server/src/routes/auth.js';
import { registerSocketHandlers } from './server/src/sockets/index.js';

const server = express();
const PORT = 3000;

// Serve everything in the "public" folder:
server.use(express.static("public")); 

// start(): Will start the user athorization process:
async function start(){
    const ok = await testConnection();
    if (!ok)
    {
        console.error('Aborting: Cannot reach the database.');
        process.exit(1);
    }

    // Socket.io needs the raw server:s
    const rawServer = http.createServer(server);
    
    // Behind a reverse proxy in production, needed for secure cookies:
    if (process.env.NODE_ENV === 'production') server.set('trust proxy', 1);

    server.use(helmet());

    // Credentials: trues + explicit origin. Wildcard '*' will NOT send cookies:
    server.use(cors({
        origin: process.env.CLIENT_ORIGIN,
        credentials: true,
    }));

    server.use(express.json({ limit: '100kb' }));
    server.use(generalLimiter);

    /** --SESSION STORE-- */
    const sessionMiddleware = await createSessionMiddleware();
    server.use(sessionMiddleware);

    /** --PASSPORT INITIALIZATION-- */
    const passport = initPassport();
    server.use(passport.initialize());
    server.use(passport.session());

    server.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));
    server.use('/api/auth', authRouter);

    /** --ERROR HANDLERS-- */
    server.use(notFound);
    server.use(errorHandler);

    /** --Socket.io-- */
    const io = new Server(rawServer, {
        cors: {
            origin: process.env.CLIENT_ORIGIN,
            credentials: true                   // required for the session cookie
        },
        pingTimeout: 20000,
        pingInterval: 10000
    });

    // 🔑 This is what makes socket.request.user work
    io.engine.use(sessionMiddleware);
    io.engine.use(passport.initialize());
    io.engine.use(passport.session());  

    registerSocketHandlers(io);

    /** --LISTEN TO THE SERVER-- */
    // server.listen(PORT, () => {
    //     console.log(`Server running on port ${PORT}`);
    //     console.log(`Client  ->${process.env.CLIENT_ORIGIN}`);
    //     console.log(`Env     ->${process.env.NODE_ENV} \n`);
    // }); 

    // You want rawServer.listen, Not server.listen
    rawServer.listen(PORT, () => {  
        console.log(`\n⚔️    Server running on port ${PORT}`);
        console.log(`Client  ->${process.env.CLIENT_ORIGIN}`);
        console.log(`Env     ->${process.env.NODE_ENV} \n`);
    })
    /** Note: Two mistakes that bite here: Calling 'server.listen()' instead of 'rawServer.listen()'
     * (sockets silently never connect), and forgetting 'credentials: true' in the Socket.io
     * CORS block (the session cookie never arrives, so every connection is UNAUTHENTICATED).
     */
}

start().catch((err) => {
    console.error('Fatal startup error: ', err);
    process.exit(1);
});


import session from "express-session";

// 1. Check if the session is 'production' or 'development':
const isProd = process.env.NODE_ENV === 'production';

// 2. Build the session store in-memory: 
async function buildStore(){
    if (process.env.USE_REDIS !== 'true')
    {
        console.log('Using in-memory session store (sessions reset on restart)');
        return undefined;       // express-session falls back to MemoryStore
    }

    const { createClient } = await import('redis'); 
    const RedisStore = (await import('connect-redis')).default;

    const client = createClient({ url: process.env.REAL_REDIS_URL });
    client.on('error', (e) => console.error('Redis error: ', e.message)); 
    await client.connect();

    console.log('Redis Session store connected');
    return new RedisStore({ client, prefix: 'strive.sess:' }); 
}

// 3. Create Session Middlware: 
export async function createSessionMiddleware(){
    const store = await buildStore();

    return session({
        store,
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,                         // JS Cannot read it - that's the point 
            secure: isProd,                         // HTTPS only in production
            sameSite: isProd ? 'none' : 'lax',      
            maxAge: 1000 * 60 * 60 * 24 * 7         // 7 days
        }
    });
}



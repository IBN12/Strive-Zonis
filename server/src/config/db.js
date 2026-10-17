import PG from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Notes
 * => The query and client pool are in the same file: db.js
 * => dotenv/config resolves .env from process.cwd(), which is the repo root when
 *    you run `node server.js`. Our env file lives in server/.env, so load it by
 *    an explicit path here instead - this also covers importing db.js directly
 *    (migrations, scripts) without going through server.js.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
    throw new Error(
        "DATABASE_URL is not set. Check that server/.env exists and contains DATABASE_URL."
    );
}

const { Pool } = PG;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,                // max concurrent connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, 
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false
});

/** Let's us know there is an error just in case the Connection String doesn't work. */
pool.on('error', (err) => {
    console.error('Unexpected postgreSQL error:', err);
}); 


/** Small helper so routes don't import 'pool' directly. */
export function query(text, params){
    return pool.query(text, params); 
}

/** Fail loudly on boot instead of on the first request. */
export async function testConnection(){
    try{
        const { rows } = await pool.query('SELECT NOW() as now'); 
        console.log(`PostgreSQL connected at ${rows[0].now}`);
        return true;
    }catch (err){
        console.error('PostgreSQL connection failed: ', err.message);
        console.error('Check DATABASE_URL in .env and that Postgres is running.');
        return false;
    }
}



async function InsertUserRegistrationData(u){
    return await pool.query(`INSERT INTO users (username, username_lower, email, password_hash)
                             VALUES ($1, $2, $3, $4)
                             RETURNING id, username, elo, rank, wins, losses`,
                             [u.username, u.username.toLowerCase(), u.email, u.hash]
                            ); 
}

async function GetRowCount(u){
    return await pool.querys(`SELECT 1 FROM users WHERE username_lower = $1`, [u.toLowerCase()]);
}

export const queryDB = {
    InsertUserRegistrationData,
    GetRowCount, 
}
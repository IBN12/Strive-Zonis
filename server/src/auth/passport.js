import passport from "passport"; 
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { query } from '../config/db.js'; 
import { publicUser } from "../utils/validate.js";
/** |The Main Passport File|
 * 
 */

export function initPassport() {
    passport.use(new LocalStrategy(
        {usernameField: 'username', passwordField: 'password' },

        async (username, password, done) => {
            try {
                const { rows } = await query(
                    `SELECT id, username, password_hash, elo, rank, wins, losses, is_banned 
                     FROM users WHERE username_lower = $1`,
                    [String(username).toLowerCase()]
                );

                const user = rows[0];

                // Run a dummy hash even when the user doesn't exist, so response 
                // timing doesn't reveal which username are registered. 
                if (!user)
                {
                    await bcrypt.compare(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
                    return done(null, false, { message: 'Invalid username or password '});
                }

                if (user.is_banned)
                {
                    return done(null, false, { message: 'This account has been suspended' });   
                }

                const match = await bcrypt.compare(password, user.password_hash);
                if (!match)
                {
                    return done(null, false, { message: 'Invalid username or password' });
                }

                await query(
                    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
                    [user.id]
                );

                return done (null, publicUser(user)); 
            } catch {
                return done(err); 
            }
        }
    )); 

    // Only the id goes into the session cookie store:
    passport.serializeUser((user, done) => done(null, user.id));

    // Rehydrate on every request that has a session:
    passport.deserializeUser(async (id, done) => {
        try {
            const { rows } = await query(
                `Select id, username, elo, rank, wins, losses, is_banned
                 FROM users WHERE id = $1`,
                [id]
            );
            if (!rows[0] || rows[0].is_banned) return done(null, false);
            done(null, publicUser(rows[0])); 
        }catch{
            done(err);
        }
    });

    return passport; 
}
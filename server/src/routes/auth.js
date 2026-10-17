import express from "express";
import bcrypt from "bcryptjs";
import passport from "passport";

// import { query } from "../config/db.js"; 
import { queryDB } from "../config/db.js";

import { requireAuth } from "../middleware/requireAuth.js";
import { validateUsername, validateEmail, validatePassword, publicUser } from "../utils/validate.js";
import { loginLimiter, registerLimiter } from "../middleware/rateLimiters.js";

const authRouter = express.Router();
const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10); 

/** |API KEY|
 * => API Concept:
 * POST /api/auth/register { username, email, password } => { user }
 * POST /api/auth/login { username, password }           => { user }
 * POST /api/auth/logout                                 => { ok: true }
 * GET /api/auth/me                                      => { user } | 401 
 */

// -------------------------------------------------------------------------------
// POST /api/auth/register
// -------------------------------------------------------------------------------
authRouter.post('/register', registerLimiter, async (req, res, next) => {
    const username = String(req.body?.username || '').trim();
    const email    = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || ''); 
    console.log('Register Username: ', username); // Testing
    console.log('Register Username Length: ', username.length); // Testing
    console.log('Register Email: ', email); // Testing
    console.log('Register Password: ', password); // Testing 

    // Re-validate. The client's checks are convenience only.
    const err = validateUsername(username) || validateEmail(email) || validatePassword(password);
    console.log('Registration Error: ', err); // Testing

    if (err) return res.status(400).json({ error: err });

    try{
        const hash = await bcrypt.hash(password, ROUNDS);

        const { rows } = await queryDB.InsertUserRegistrationData({ username, email, hash });

        const user = publicUser(rows[0]);

        // Log them straight in after registering: 
        // Note: If you log them in then take them back to the 'Main Multiplayer' stage
        // and post letting the players know that they are logged in.
        // This is only taking the user to a json page.
        req.login(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            res.status(201).json({ user });
        });
    }
    catch (e)
    {
        if (e.code === '23505') // unique_violation
        {
            const field = e.constraint?.includes('email') ? 'email' : 'username'; 
            return res.status(409).json({
                error: field === 'email'
                    ? 'That email is already registered'
                    : 'That usernames is already taken'
            });
        }
        next(e); 
    }
}); 

// -------------------------------------------------------------------------------
// POST /api/auth/login 
// -------------------------------------------------------------------------------
authRouter.post('/login', loginLimiter, (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err); 
        if (!user) 
        {
            return res.status(401).json({
                error: info?.message || 'Invalid username or password'
            });
        }

        req.login(user, (loginErr) => {
            if (loginErr) return next(loginErr);

            // Prevent Session Fixation:
            req.session.regenerate((regenErr) => { 
                if (regenErr) return next(regenErr);
                req.login(user, (e2) => {
                    if (e2) return next(e2); 
                    res.json({ user });
                });
            });
        });
    })(req, res, next);
});

// -------------------------------------------------------------------------------
// POST /api/auth/logout
// -------------------------------------------------------------------------------
authRouter.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.clearCookie('strive.sid');
            res.json({ ok: true }); 
        }); 
    }); 
}); 

// -------------------------------------------------------------------------------
// GET /api/auth/me
// -------------------------------------------------------------------------------
authRouter.get('/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: req.user }); 
});

// -------------------------------------------------------------------------------
// GET /api/auth/check-username?username=foo
// Optional: Live availability feedback while typing
// -------------------------------------------------------------------------------
authRouter.get('/check-username', async (req, res, next) => {
    const username = String(req.query.username || '').trim();
    const err = validateUsername(username);
    if (err) return res.json({ available: false, reason: err });

    try {
        const { rowCount } = await queryDB.GetRowCount(username);
        res.json({ available: rowCount === 0 }); 
    }catch(e){
        next(e);
    }
});

// -------------------------------------------------------------------------------
// Example protected route
// -------------------------------------------------------------------------------
authRouter.get('/profile', requireAuth, (req, res) => {
    res.json({ user: req.user }); 
}); 

export default authRouter;
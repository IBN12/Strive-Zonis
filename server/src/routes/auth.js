import express from "express";
import bcrypt from "bcryptjs";
import passport from "passport";

const authRouter = express.Router();

/** |API KEY|
 * => API Concept:
 * POST /api/auth/register { username, email, password } => { user }
 * POST /api/auth/login { username, password }           => { user }
 * POST /api/auth/logout                                 => { ok: true }
 * GET /api/auth/me                                      => { user } | 401 
 */


authRouter.post('/register', async (req, res) => {
    
}); 
import rateLimit from "express-rate-limit";

/** Login: strict. Blocks credential-stuffing attempts. */
export const loginLimiter = rateLimit({ 
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,       // only failed attempts count
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
}); 

/** Registration: Stops mass account creation from one IP. */
export const registerLimiter = rateLimit({
    windowMs: 60 * 60 *  1000, 
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many accounts created. Try agian later.' }
});

/** Everything else: generous. */
export const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
});
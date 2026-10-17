/** |Validation|
 * These validation rules must match the 'AuthService.js' on the client.
 * Client validation is UX; this is the real gate. 
 */

export const USERNAME_RE   = /^[A-Za-z0-9_]{3,20}$/;
export const EMAIL_RE      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(v){
    if (typeof v !== 'string' || !v) return 'Username is required';
    if (!USERNAME_RE.test(v)){
        return '3-20 characters, letters, numbers and underscores only';
    }
    return null;
}

export function validateEmail(v){
    if (typeof v !== 'string' || !v) return 'Email is required';
    if (v.length > 255) return 'Email is too long';
    if (!EMAIL_RE.test(v)) return 'Enter a valid email address';
    return null; 
}

export function validatePassword(v){
    if (typeof v !== 'string' || !v) return 'Password is required';
    if (v.length < 8) return 'At least 8 characters';
    if (v.length > 128) return 'Password is too long';
    return null;
}

/** Shape sent to the client. Never include password_hash or email. */
export function publicUser(row){
    return {
        id:             row.id,
        username:       row.username,
        elo:            row.elo,
        rank:           row.rank,
        wins:           row.wins,
        losses:         row.losses,
    }
}
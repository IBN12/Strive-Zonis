/** |Authorization Services|
 * Note: The whole point of this file is that your scene never knows whether the backend exists.
 * 
 * Single point of contact for everything account-related.
 * Currently backed by an in-memory mock so the UI can be built and tested
 * before the Node/passport server exists.
 * 
 * To go live: set USE_MOCK = false and start the server. Nothing else changes.
 */

const USE_MOCK = true;
const API_BASE = 'http://localhost:3000'; 

// ----------------------------------------------------------------------
// Validation - mirror these rules on the server. Client checks are
// for fast feedbacks only; they are trivally bypassed.
// ----------------------------------------------------------------------
const RULES = {
    username: {
        min: 3,
        max: 20,
        pattern: /^[a-zA-Z0-9_]+$/,
        message: '3-20 characters, letters, numbers and underscores only',
    },
    password: {
        min: 8,
        max: 128,
        message: 'At least 8 characters minimum', 
    },
    email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Enter a valid email address'
    }
};

class AuthServiceClass {
    constructor(){
        this.user = null; // { id, username, elo, rank, wins, losses }
        this._mockUsers = new Map(); // username -> { id, email, username, profile }
        this._nextId = 1;

        this._seedMockUser(); 
    }

    get isLoggedIn(){
        return this.user !== null;
    }

    // ----------------------------------------------------------------------
    // Validation helpers (used by the scene for inline feedback) 
    // ----------------------------------------------------------------------
    validateUsername(v){
        if (!v) return 'Username is required';
        if (v.length < RULES.username.min || v.length > RULES.username.max)
        {
            return RULES.username.message;
        }
        if (!RULES.username.pattern.test(v)) return RULES.username.message; 
    }

    validatePassword(v){
        if (!v) return 'Password is required';
        if (v.length < RULES.password.min) return RULES.password.message;
        if (v.length > RULES.password.max) return "Password is too long"; 
        return null;
    }

    validateEmail(v){ 
        if (!v) return 'Email is required';
        if (!RULES.email.pattern.test(v)) return RULES.email.message;
        return null;
    }

    // ----------------------------------------------------------------------
    // PUBLIC API - the scene only ever calls these four methods
    // ----------------------------------------------------------------------
    /**
     * @returns {Promise<{ok: boolean, user?: object, error?: string}> }
     */
    async register({ username, email, password })
    {
        return USE_MOCK
            ? this._mockRegister({ username, email, password })
            : this._request('/api/auth/register', { username, email, password });
    }

    async login({ username, password })
    {
        return USE_MOCK
            ? this._mockLogin({ username, password })
            : this._request('/api/auth/login', { username, password }); 
    }

    async logout(){
        if (!USE_MOCK)
        {
            await fetch (`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            }).catch(() => {}); 
        }
        this.user = null;
        return { ok: true };
    }

    /**
     * Called on boot. With real Passport sessions the browser sends the 
     * httpOnly cookie automatically - there is no token to store yourself.
     */
    async restoreSession(){
        if (USE_MOCK) return { ok: false, error: 'NO_SESSION' }; 

        try {
            const res = await fetch (`${API_BASE}/api/auth/me`, {
                credentials: 'include'  
            });
            if (!res.ok) return { ok: false, error: 'NO_SESSION' };

            const data = await res.json();
            this.user = data.user; 
            return { ok: true, user: this.user };
        }catch{
            return { ok: false, error: 'NETWORK_ERROR' }; 
        }
    }

    // ----------------------------------------------------------------------
    // Real backend 
    // ----------------------------------------------------------------------
    async _request(path, body)
    {
        try {
            const res = await fetch (`${API_BASE}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // REQUIRED - sends the session cookie
                body: JSON.stringify(body)
            }); 

            const data = await res.json().catch(() => ({})); 

            if (!res.ok) 
            {
                return { ok: false, error: data.error || `HTTP_${res.status}` };
            }

            this.user = data.user;
            return { ok: true, user: data.user };
        }catch{
            return { ok: false, error: 'NETWORK_ERROR' };
        }
    }

    // ----------------------------------------------------------------------
    // Mock backend - deliberately simple, includes fake latency
    // so you can see and test the loading states.
    // ----------------------------------------------------------------------
    _seedMockUser(){
        this._mockUsers.set('zonis', {
            id: this._nextId++,
            email: 'test@zonis.dev',
            password: 'password123',
            profile: {
                username: 'zonis',
                elo: 1180, 
                rank: 'Bronze II',
                wins: 7,
                losses: 4,
            }
        }); 
    }

    _delay(ms = 550)
    {
        return new Promise(r => setTimeout(r, ms)); 
    }

    async _mockRegister({ username, email, password })
    {
        await this._delay();

        const uErr = this.validateUsername(username);
        if (uErr) return { ok: false, error: uErr };

        const eErr = this.validateEmail(email);
        if (eErr) return { ok: false, error: eErr };

        const pErr = this.validatePassword(password);
        if (pErr) return { ok: false, error: pErr };

        const key = username.toLowerCase();
        if (this._mockUsers.has(key))
        {
            return { ok: false, error: 'That username is already taken' };
        }

        const profile = {
            username,
            elo: 1000,
            rank: 'Unranked',
            wins: 0,
            losses: 0,
        };

        this._mockUsers.set(key, {
            id: this._nextId++,
            email,
            password,
            profile
        });


        this.user = { id: this._nextId - 1, ...profile };
        return { ok: true, user: this.user }; 
    }

    async _mockLogin({ username, password })
    {
        await this._delay();

        const record = this._mockUsers.get(String(username).toLowerCase());

        // Same message for both cases - never reveal which field was wrong.
        if (!record || record.password !== password)
        {
            return { ok: false, error: 'Invalid username or password' };
        }

        this.user = { id: record.id, ...record.profile }; 
        return { ok: true, user: this.user };
    }

}

export const AuthService = new AuthServiceClass(); 

// ----------------------------------------------------------------------
// Testing Area
// ----------------------------------------------------------------------
// console.log('...Testing the AuthService File...'); 

// console.log('Register Gary: ', await AuthService._mockRegister({ username: 'gary', email: 'Gary@gmail.com', password: 'Garyishere12' }));
// console.log('Login Gary: ', await AuthService._mockLogin({ username: 'gary', password: 'Garyishere12' }));
// console.log('\n');


// console.log('Register Zonis: ', await AuthService.register({ username: 'zonis', email: 'test@zonis.dev', password: 'password123' })); 
// console.log('Login Zonis: ', await AuthService._mockLogin({ username: 'zonis', password: 'password123' }));

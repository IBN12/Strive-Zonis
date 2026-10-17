import { AuthService } from "../services/AuthServices.js";

/** |Profile Authorization Scene|
 * Strive: We Are Zonis
 *
 * Login / Create Profile. Phaser renders the atmosphere; a DOM overlay
 * renders the form so we get real inputs, password masking, autofill,
 * mobile keyboards and CSS backdrop-filter glass.
 *
 * => In MultiplayerScene.js
 * This is where ProfileAuthScene will be called from:
 * _onLoginToProfile(){
 *  this.scene.start('ProfileAuthScene', {
 *       returnScene: 'MultiplayerScene',
 *       mode: 'login',
 *  });
 * }
 * The object going into the 'ProfileAuthScene' is { returnScene: 'MultiplayerScene', mode: 'login' }.
 * This object is 'data', and the key values wil be placed in 'ProfileAuthScene' classes this.returnScene
 * and this.mode.
 *
 */



export default class ProfileAuthScene extends Phaser.Scene{
    constructor(){
        super('ProfileAuthScene');
    }

    init(data){ 
        // That 'data' was not passed as a local object and does not contain returnScene 
        // for the (Optional Chaining):
        this.returnScene = data?.returnScene || 'MultiplayerScene';
        this.mode = data?.mode || 'login'; // 'login' | 'register'
        this.busy = false;
    }

    preload(){
        this.load.image('authHero', 'assets/backgroundImages/allybelle_con_2.png');
    }

    create(){
        this._buildBackground();
        this._buildForm();

        this.cameras.main.fadeIn(1200, 0, 0, 0);
    }

    // ==========================================================
    // Background (Phaser)
    // ==========================================================
    // _buildBackground(): Will build the entire background for the user login/register scene:
    _buildBackground(){
        const { width, height } = this.scale;

        this._drawBaseBackdrop(width, height);
        this._drawHeroArt(width, height);
        this._drawAtmosphericWash(width, height);
        this._drawAuthPulseRings(width * 0.5, height * 0.5 + 30);
        this._drawDriftingEmbers(width, height);
        this._drawSceneTitle(width);
    }

    _drawBaseBackdrop(width, height){
        this.add.rectangle(0, 0, width, height, 0x0a0f14, 1).setOrigin(0);

        // Cool slate-blue haze, top-left, echoing the artwork's shadow tones
        this.add.ellipse(width * 0.18, height * 0.14, width * 0.55, height * 0.42, 0x1b3138, 0.42);

        // Warm ember haze bleeding up from the lower-right
        this.add.ellipse(width * 0.86, height * 0.88, width * 0.55, height * 0.46, 0x2a0a0a, 0.30);
    }

    _drawHeroArt(width, height){
        const hero  = this.add.image(width * 0.5, height * 0.46, 'authHero');
        const scale = Math.max(width / hero.width, height / hero.height) * 1.08;
        hero.setScale(scale).setOrigin(0.5);

        // Slow Ken-Burns breathing so the portrait feels alive behind the glass
        this.tweens.add({
            targets:  hero,
            scale:    scale * 1.05,
            duration: 16000,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Radial darkening so the centered glass card stays legible over the art
        const veil = this.add.graphics();
        veil.fillStyle(0x05080b, 0.50);
        veil.fillRect(0, 0, width, height);

        this.add.ellipse(width * 0.5, height * 0.5 + 20, width * 0.60, height * 0.78, 0x05080b, 0.42);

        // Cinematic top/bottom vignette
        const vignetteTop = this.add.graphics();
        vignetteTop.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.60, 0.60, 0, 0);
        vignetteTop.fillRect(0, 0, width, height * 0.22);

        const vignetteBottom = this.add.graphics();
        vignetteBottom.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.60, 0.60);
        vignetteBottom.fillRect(0, height * 0.78, width, height * 0.22);
    }

    _drawAtmosphericWash(width, height){
        // Unifies the photo and vector layers under one cool-to-crimson grade
        this.add.rectangle(0, 0, width, height, 0x0a0f14, 0.10).setOrigin(0);
        this.add.rectangle(0, 0, width, height, 0x330000, 0.05).setOrigin(0);
    }

    // _drawAuthPulseRings(): Slow "authentication scan" pulses breathing outward from
    // behind the glass card, tying the atmosphere to the idea of signing in/verifying.
    _drawAuthPulseRings(cx, cy){
        const spawnPulse = () => {
            const ring = this.add.graphics().setPosition(cx, cy);
            ring.lineStyle(2, 0x5eead4, 0.40);
            ring.strokeCircle(0, 0, 95);

            this.tweens.add({
                targets:    ring,
                scaleX:     3.6,
                scaleY:     3.6,
                alpha:      0,
                duration:   3400,
                ease:       'Sine.easeOut',
                onComplete: () => ring.destroy(),
            });
        };

        this.time.addEvent({ delay: 1900, loop: true, callback: spawnPulse });
        spawnPulse();
    }

    _drawDriftingEmbers(width, height){
        // Soft bokeh glows drifting slowly, echoing the blurred highlights in the artwork
        for (let i = 0; i < 10; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, height);
            const r     = Phaser.Math.Between(18, 46);
            const color = Math.random() > 0.5 ? 0xff8080 : 0xffb199;
            const glow  = this.add.circle(x, y, r, color, Phaser.Math.FloatBetween(0.03, 0.09));

            this.tweens.add({
                targets:  glow,
                y:        y - Phaser.Math.Between(40, 120),
                alpha:    0,
                duration: Phaser.Math.Between(6000, 11000),
                repeat:   -1,
                delay:    Phaser.Math.Between(0, 5000),
                ease:     'Sine.easeInOut',
            });
        }

        // Fine ember specks rising through the whole scene
        for (let i = 0; i < 26; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, height);
            const color = Math.random() > 0.4 ? 0x5eead4 : 0xffd9c2;
            const spark = this.add.circle(x, y, Phaser.Math.Between(1, 3), color, Phaser.Math.FloatBetween(0.4, 0.85));

            this.tweens.add({
                targets:  spark,
                y:        y - Phaser.Math.Between(80, 220),
                x:        x + Phaser.Math.Between(-30, 30),
                alpha:    0,
                duration: Phaser.Math.Between(3200, 7200),
                repeat:   -1,
                delay:    Phaser.Math.Between(0, 4000),
                ease:     'Power1',
            });
        }
    }

    _drawSceneTitle(width){
        this.add.text(width * 0.5, 78, 'PROFILE ACCESS', {
            fontFamily:      'monospace',
            fontSize:        '40px',
            color:           '#f5f5f5',
            stroke:          '#dc2626',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const subtitleText = this.add.text(width * 0.5, 122, 'LOG IN  •  REGISTER  •  PLAY AS GUEST', {
            fontFamily:    'monospace',
            fontSize:      '14px',
            color:         '#5eead4',
            letterSpacing: 2,
        }).setOrigin(0.5).setAlpha(0.85);

        this.tweens.add({
            targets:  subtitleText,
            alpha:    0.45,
            duration: 1800,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // ==========================================================
    // FORM (DOM overlay)
    // ==========================================================
    // _buildForm(): Will build the login and registration forms for the user:
    _buildForm(){
        const { width, height } = this.cameras.main;

        this.formEl = this.add.dom(width/2, height/2 + 30).createFromHTML(this._formHTML());

        // Entrance animation:
        this.formEl.setAlpha(0).setScale(0.96);
        this.tweens.add({
            targets: this.formEl,
            alpha: 1,
            scale: 1,
            duration: 420,
            ease: 'Back.easeOut'
        });

        this._wireForm();
        this._setMode(this.mode);
    }

    // _formHTML(): Will contain all the HTML properties for the dom:
    _formHTML(){
        return `
            <style>
                .zn-auth-card {
                    position: relative;
                    width: 460px;
                    box-sizing: border-box;
                    padding: 34px 38px 30px;
                    border-radius: 18px;
                    background: linear-gradient(160deg, rgba(16,28,36,0.74), rgba(7,12,18,0.82));
                    backdrop-filter: blur(18px) saturate(140%);
                    -webkit-backdrop-filter: blur(18px) saturate(140%);
                    border: 1px solid rgba(94,234,212,0.35);
                    box-shadow:
                        0 0 0 1px rgba(255,107,107,0.06) inset,
                        0 30px 60px rgba(0,0,0,0.55),
                        0 0 46px rgba(94,234,212,0.10);
                    font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
                    color: #f5f5f5;
                    animation: znCardGlow 4200ms ease-in-out infinite;
                }
                @keyframes znCardGlow {
                    0%, 100% { box-shadow: 0 0 0 1px rgba(255,107,107,0.06) inset, 0 30px 60px rgba(0,0,0,0.55), 0 0 46px rgba(94,234,212,0.10); }
                    50%      { box-shadow: 0 0 0 1px rgba(255,107,107,0.06) inset, 0 30px 60px rgba(0,0,0,0.55), 0 0 64px rgba(94,234,212,0.20); }
                }
                .zn-auth-card::before, .zn-auth-card::after {
                    content: '';
                    position: absolute;
                    width: 22px;
                    height: 22px;
                    border-color: #5eead4;
                    border-style: solid;
                    opacity: 0.85;
                }
                .zn-auth-card::before {
                    top: -1px; left: -1px;
                    border-width: 2px 0 0 2px;
                    border-top-left-radius: 6px;
                }
                .zn-auth-card::after {
                    bottom: -1px; right: -1px;
                    border-width: 0 2px 2px 0;
                    border-bottom-right-radius: 6px;
                }
                .zn-back {
                    position: absolute;
                    top: 18px;
                    right: 22px;
                    font-size: 11px;
                    letter-spacing: 1.5px;
                    color: rgba(245,245,245,0.4);
                    cursor: pointer;
                    user-select: none;
                    transition: color 0.2s ease;
                }
                .zn-back:hover { color: #ffb199; }
                .zn-card-header { text-align: center; margin-bottom: 20px; }
                .zn-crest {
                    width: 46px; height: 46px;
                    margin: 0 auto 10px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(94,234,212,0.18), rgba(94,234,212,0.02));
                    border: 1px solid rgba(94,234,212,0.45);
                    color: #5eead4;
                    font-size: 20px;
                }
                .zn-card-header h1 {
                    margin: 0 0 4px;
                    font-size: 20px;
                    letter-spacing: 1px;
                    font-weight: 700;
                    color: #f5f5f5;
                }
                .zn-card-header p {
                    margin: 0;
                    font-size: 12px;
                    color: rgba(245,245,245,0.5);
                }
                .zn-tabs {
                    display: flex;
                    gap: 6px;
                    padding: 4px;
                    margin-bottom: 18px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 12px;
                }
                .zn-tab {
                    flex: 1;
                    text-align: center;
                    padding: 10px 0;
                    font-size: 12px;
                    letter-spacing: 1.5px;
                    font-weight: 600;
                    color: rgba(245,245,245,0.55);
                    border-radius: 9px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .zn-tab:hover { color: #f5f5f5; }
                .zn-tab.active {
                    background: linear-gradient(135deg, #5eead4, #22b8a8);
                    color: #04211d;
                    box-shadow: 0 6px 16px rgba(94,234,212,0.30);
                }
                .zn-field { margin-bottom: 15px; }
                .zn-field.hidden { display: none; }
                .zn-field label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 10.5px;
                    letter-spacing: 1.5px;
                    color: rgba(245,245,245,0.55);
                }
                .zn-field input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 12px 14px;
                    font-size: 14px;
                    color: #f5f5f5;
                    background: rgba(255,255,255,0.045);
                    border: 1px solid rgba(255,255,255,0.14);
                    border-radius: 10px;
                    outline: none;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
                }
                .zn-field input::placeholder { color: rgba(245,245,245,0.28); }
                .zn-field input:focus {
                    border-color: #5eead4;
                    background: rgba(94,234,212,0.06);
                    box-shadow: 0 0 0 3px rgba(94,234,212,0.14);
                }
                .zn-field input.error {
                    border-color: #ff6b6b;
                    box-shadow: 0 0 0 3px rgba(255,107,107,0.14);
                }
                .zn-hint {
                    min-height: 14px;
                    margin-top: 5px;
                    font-size: 11px;
                    color: #ff8f8f;
                }
                .zn-msg {
                    min-height: 0;
                    margin-bottom: 0;
                    max-height: 0;
                    overflow: hidden;
                    text-align: center;
                    font-size: 12.5px;
                    border-radius: 10px;
                    opacity: 0;
                    transition: all 0.25s ease;
                }
                .zn-msg.success, .zn-msg.error {
                    max-height: 60px;
                    padding: 10px;
                    margin-bottom: 16px;
                    opacity: 1;
                }
                .zn-msg.success {
                    background: rgba(94,234,212,0.12);
                    color: #5eead4;
                    border: 1px solid rgba(94,234,212,0.35);
                }
                .zn-msg.error {
                    background: rgba(255,107,107,0.12);
                    color: #ff9a9a;
                    border: 1px solid rgba(255,107,107,0.35);
                }
                .zn-submit {
                    width: 100%;
                    padding: 14px;
                    margin-top: 4px;
                    border: none;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #5eead4, #22b8a8);
                    color: #04211d;
                    font-size: 13.5px;
                    font-weight: 700;
                    letter-spacing: 1.5px;
                    cursor: pointer;
                    box-shadow: 0 10px 24px rgba(45,212,191,0.28);
                    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
                }
                .zn-submit:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 14px 30px rgba(45,212,191,0.40);
                }
                .zn-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
                .zn-divider {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin: 18px 0 14px;
                    font-size: 10.5px;
                    letter-spacing: 2px;
                    color: rgba(245,245,245,0.32);
                }
                .zn-divider::before, .zn-divider::after {
                    content: '';
                    flex: 1;
                    height: 1px;
                    background: rgba(245,245,245,0.14);
                }
                .zn-guest {
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    background: rgba(255,177,153,0.06);
                    border: 1px solid rgba(255,177,153,0.38);
                    color: #ffb199;
                    font-size: 12.5px;
                    font-weight: 600;
                    letter-spacing: 1.5px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .zn-guest:hover:not(:disabled) {
                    background: rgba(255,177,153,0.14);
                    border-color: #ffb199;
                }
                .zn-guest:disabled { opacity: 0.55; cursor: not-allowed; }
            </style>

            <div class="zn-auth-card" id="znAuthCard">
                <div class="zn-back" id="backBtn">‹ BACK</div>

                <div class="zn-card-header">
                    <div class="zn-crest">◈</div>
                    <h1>ZONIS ACCESS</h1>
                    <p>Sync your ranked profile, or jump in as a guest</p>
                </div>

                <div class="zn-tabs">
                    <div class="zn-tab" id="tabLogin">LOG IN</div>
                    <div class="zn-tab" id="tabRegister">REGISTER</div>
                </div>

                <div class="zn-msg" id="msg"></div>

                <div class="zn-field" id="fieldUsername">
                    <label>USERNAME</label>
                    <input id="username" type="text" maxlength="20" autocomplete="username" placeholder="Enter your username" />
                    <div class="zn-hint" id="hintUsername"></div>
                </div>

                <div class="zn-field hidden" id="fieldEmail">
                    <label>EMAIL</label>
                    <input id="email" type="email" autocomplete="email" placeholder="you@example.com" />
                    <div class="zn-hint" id="hintEmail"></div>
                </div>

                <div class="zn-field" id="fieldPassword">
                    <label>PASSWORD</label>
                    <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />
                    <div class="zn-hint" id="hintPassword"></div>
                </div>

                <div class="zn-field hidden" id="fieldConfirm">
                    <label>CONFIRM PASSWORD</label>
                    <input id="confirm" type="password" autocomplete="new-password" placeholder="••••••••" />
                    <div class="zn-hint" id="hintConfirm"></div>
                </div>

                <button class="zn-submit" id="submitBtn">LOG IN</button>

                <div class="zn-divider">OR</div>

                <button class="zn-guest" id="guestBtn">PLAY AS GUEST</button>
            </div>
        `
    }

    // _wireForm(): Will contain all the wire form properties:
    _wireForm(){
        const el = (id) => this.formEl.getChildByID(id);

        this.ui = {
            tabLogin:           el('tabLogin'),
            tabRegister:        el('tabRegister'),
            backBtn:            el('backBtn'),
            msg:                el('msg'),
            username:           el('username'),
            email:              el('email'),
            password:           el('password'),
            confirm:            el('confirm'),
            fieldEmail:         el('fieldEmail'),
            fieldConfirm:       el('fieldConfirm'),
            hintUsername:       el('hintUsername'),
            hintEmail:          el('hintEmail'),
            hintPassword:       el('hintPassword'),
            hintConfirm:        el('hintConfirm'),
            submitBtn:          el('submitBtn'),
            guestBtn:           el('guestBtn'),
        }

        this.ui.tabLogin.addEventListener('click', () => this._setMode('login'));         // User Login with Username and Password
        this.ui.tabRegister.addEventListener('click', () => this._setMode('register'));   // User Registration: Username, Email, Password
        this.ui.submitBtn.addEventListener('click', () => this._submit());                // User Submit Button.
        this.ui.guestBtn.addEventListener('click', () => this._continueAsGuest());        // Continue on as guest instead of playing with a user profile.
        this.ui.backBtn.addEventListener('click', () => this._onBack());                  // Cancel authorization, return to the previous scene.

        // Enter submits from any field, and Phaser's keyboard capture is paused
        // while a field is focused so the browser handles native text editing.
        ['username', 'email', 'password', 'confirm'].forEach(id => {
            this.ui[id].addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._submit();
            });
            this.ui[id].addEventListener('focus', () => {
                this.input.keyboard.enabled = false;
            });
            this.ui[id].addEventListener('blur', () => {
                this.input.keyboard.enabled = true;
            });
        });

        this.ui.username.focus();
    }

    // _setMode(): Will set either the 'Login' or 'Registration' mode:
    _setMode(mode){
        if (this.busy) return;
        this.mode = mode;

        const isRegister = mode === 'register';

        this.ui.tabLogin.classList.toggle('active', !isRegister);
        this.ui.tabRegister.classList.toggle('active', isRegister);
        this.ui.fieldEmail.classList.toggle('hidden', !isRegister);
        this.ui.fieldConfirm.classList.toggle('hidden', !isRegister);

        this.ui.submitBtn.textContent = isRegister ? 'CREATE PROFILE' : 'LOG IN';
        this.ui.password.setAttribute(
            'autocomplete',
            isRegister ? 'new-password' : 'current-password'
        );

        this._clearHints();
        this._hideMessage();
        this.ui.username.focus();
    }

    // ==========================================================
    // SUBMIT
    // ==========================================================
    // _submit(): Will send the data over for authorization:
    async _submit(){
        if (this.busy) return;

        const username = this.ui.username.value.trim();
        const password = this.ui.password.value;
        const email = this.ui.email.value.trim();
        const confirm = this.ui.confirm.value;

        // Validate the username, password, and email:
        if (!this._validateClientSide({ username, password, email, confirm })) return;

        this._setBusy(true);  // Authorization is busy at this point
        this._hideMessage();  // Hide the message at this point

        const result = this.mode === 'register'
            ? await AuthService.register({ username, email, password })
            : await AuthService.login({ username, password });

        // Scene may have been shut down mid-request:
        if (!this.scene.isActive()) return;

        if (!result.ok)
        {
            this._setBusy(false);
            this._showMessage(result.error, 'error');
            this._shakeForm();
            return;
        }

        this._showMessage(
            this.mode === 'register'
            ? `Profile created. Welcome, ${result.user.username}.`
            : `Welcome back, ${result.user.username}.`,
            'success'
        );

        this.time.delayedCall(700, () => this._onAuthSuccess(result.user));
    }

    // _validateClientSide(): Validate on the client side:
    _validateClientSide({ username, password, email, confirm }){
        this._clearHints();
        let valid = true;

        const uErr = AuthService.validateUsername(username);
        if (uErr) { this._setHint('username', uErr); valid = false; };

        const pErr = AuthService.validatePassword(password);
        if (pErr) { this._setHint('password', pErr); valid = false; };

        if (this.mode === 'register')
        {
            const eErr = AuthService.validateEmail(email);
            if (eErr) { this._setHint('email', eErr); valid = false; };

            if (password !== confirm)
            {
                this._setHint('confirm', 'Passwords do not match');
                valid = false;
            }
        }

        if (!valid) this._shakeForm();
        return valid;
    }

    // _onAuthSuccess(): Successful Authorization:
    _onAuthSuccess(user){
        // Registry makes the profile available to every other scene:
        this.registry.set('profile', {
            name:       user.username,
            rank:       user.rank,
            elo:        user.elo,
            wins:       user.wins,
            losses:     user.losses,
        });
        this.registry.set('isGuest', false);

        this._leaveTo(this.returnScene);
    }

    // _continueAsGuest(): User will play as a guest:
    _continueAsGuest(){
        if (this.busy) return;

        this.registry.set('profile', {
            name: 'Guest', rank: 'Unranked', elo: 1000, wins: 0, losses: 0,
        });
        this.registry.set('isGuest', true);

        this._leaveTo(this.returnScene);
    }

    // _onBack(): Cancel authorization and return to the previous scene untouched:
    _onBack(){
        if (this.busy) return;
        this._leaveTo(this.returnScene);
    }

    // _leaveTo(): Fades out and hands control to the given scene:
    _leaveTo(sceneKey){
        this.cameras.main.fadeOut(700, 0, 0, 0);
        this.time.delayedCall(700, () => this.scene.start(sceneKey));
    }

    // ==========================================================
    // UI STATE
    // ==========================================================
    // _setBusy(): Determine if the entire 'Profile Authorization' is busy:
    _setBusy(busy){
        this.busy = busy;
        this.ui.submitBtn.disabled = busy;
        this.ui.guestBtn.disabled = busy;

        if (busy)
        {
            this._prevLabel = this.ui.submitBtn.textContent;
            this.ui.submitBtn.textContent = 'PLEASE WAIT...';
        }
        else if (this._prevLabel)
        {
            this.ui.submitBtn.textContent = this._prevLabel;
        }
    }

    // _setHint(): Set a hint for the user using the form:
    _setHint(field, message){
        const cap = field.charAt(0).toUpperCase() + field.slice(1);
        this.ui[`hint${cap}`].textContent = message;
        this.ui[field].classList.add('error');
    }

    // _clearHints(): Clear the hint for the user:
    _clearHints(){
        ['username', 'email', 'password', 'confirm'].forEach(f => {
            const cap = f.charAt(0).toUpperCase() + f.slice(1);
            this.ui[`hint${cap}`].textContent = '';
            this.ui[f].classList.remove('error');
        });
    }

    // _showMessage(): Show the message for the user:
    _showMessage(text, type){
        this.ui.msg.textContent = text;
        this.ui.msg.className = `zn-msg ${type}`;
    }

    // _hideMessage(): Hide the message from the user:
    _hideMessage(){
        this.ui.msg.className = 'zn-msg';
        this.ui.msg.textContent = '';
    }

    // _shakeForm(): Shake the form when there is an error:
    _shakeForm(){
        const baseX = this.formEl.x;
        this.tweens.add({
            targets: this.formEl,
            x: baseX + 8,
            duration: 60,
            yoyo: true,
            repeat: 3,
            onComplete: () => this.formEl.setX(baseX),
        });
    }


}

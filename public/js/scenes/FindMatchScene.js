/** |FindMatchScene.js|
 *
 * Strive: We are Zonis
 *
 * Matchmaking. The player lands here from the Multiplayer hub's FIND MATCH
 * button. The scene drops them into the server's queue and holds them on a
 * "scanning the network" screen - a pulsing energy core ringed by their own
 * loadout and an as-yet-unknown opponent - until the Matchmaker pairs them off.
 * When a pairing lands the search collapses and the VERSUS panel takes the
 * screen, dealing both four-card decks in from either side before handing off
 * to the battle scene.
 *
 * The visual language is the one MultiplayerScene and CardSelectScene share:
 * teal glass frames with corner ticks over a scrimmed character backdrop,
 * crimson accents, drifting embers, and nothing that pops in without easing.
 *
 * States: CONNECTING => SEARCHING => FOUND => (MultiplayerBattleScene)
 *              else  => ERROR
 */

import { Net } from "../net/NetworkManager.js";
import SingularityCardAnimations from "../gameTools/singularityCardAnimations.js";

const MMState = {
    CONNECTING:     'CONNECTING',
    SEARCHING:      'SEARCHING',
    FOUND:          'FOUND',
    ERROR:          'ERROR',
};

// Shared palette - the same teal / crimson / amber the rest of the hub uses.
const TEAL        = 0x5eead4;
const TEAL_HEX    = '#5eead4';
const CRIMSON     = 0xff6b6b;
const CRIMSON_HEX = '#ff8f8f';
const MUTED_HEX   = '#9fb4b0';

// Card category accents, matching the Card Deck Panel over in the hub.
const CATEGORY = {
    Supra: { accent: 0xff6b6b, hex: '#ff8f8f', label: 'SUPRA' },
    Fere:  { accent: 0xffd93d, hex: '#ffe27a', label: 'FERE'  },
    Bonum: { accent: 0x5eead4, hex: '#5eead4', label: 'BONUM' },
};

// Centre of the scanning core, and how far its pulses travel.
const CORE_X = 960;
const CORE_Y = 512;
const CORE_R = 168;

// How long the queue may sit in CONNECTING before we call it a failure.
const CONNECT_TIMEOUT_MS = 12000;

export default class FindMatchScene extends Phaser.Scene{
    constructor(){
        super('FindMatchScene');
    }

    init(data){
        // The hub passes 'playerDeck'; a direct start may pass 'deck'. Either way
        // the registry copy CardSelectScene wrote is the fallback.
        this.deckRaw = data?.deck || data?.playerDeck || this.registry.get('pvpDeck') || {};
        this.deck    = this._normalizeDeck(this.deckRaw);

        this.profile = this.registry.get('profile') || null;

        this.state           = MMState.CONNECTING;
        this.searchStartedAt = 0;
        this.queuedCount     = 0;
        this.matchData       = null;
        this.matchFound      = false;        // suppresses leaveQueue on shutdown
        this._leaving        = false;
        this._joining        = false;        // a 'queue:join' is awaiting its ack
        this._longWaitShown  = false;
    }

    preload(){
        this.load.image('findMatchBg', 'assets/backgroundImages/find_a_match_scene_con_1.png');

        // Initiator art is keyed by card.name so both decks can look a texture up
        // directly; anything without art falls back to a monogram disc.
        const deckArt = {
            'Tobo The Fighter':            'assets/characterImages/tobo_the_fighter_con_1_Re.png',
            'Spunky With The Funky Draco': 'assets/characterImages/spunky_with_the_funky_draco_con_1_Re.png',
            'Allybelle':                   'assets/characterImages/allybelle_con_1_Re.png',
        };
        Object.entries(deckArt).forEach(([key, path]) => {
            if (!this.textures.exists(key)) this.load.image(key, path);
        });
    }

    create(){
        this._buildBackground();
        this._buildSearchVisuals();
        this._buildStatusText();
        this._buildCancelButton();

        // The beginning of the network foundation:
        this._wireNetwork();

        // --- This is where the main connection takes place ---:
        // An already-open socket re-emits 'net:ready' straight away, so _onReady
        // covers both the first visit and a return trip - no second join here.
        Net.connect();

        // If the handshake never lands, don't leave the player staring at a
        // spinning ring forever.
        this._connectWatchdog = this.time.delayedCall(CONNECT_TIMEOUT_MS, () => {
            if (this.state === MMState.CONNECTING) this._setError('Could not reach the server');
        });

        this.cameras.main.fadeIn(300, 0, 0, 0);

        // Warm the battle scene's card art while the player waits in the queue,
        // so its preload() finds the textures cached and the hand-off is
        // immediate. Anything not finished by then is simply fetched there.
        SingularityCardAnimations.preload(this);
        this.load.start();
    }


    // ===================================================================
    // NETWORK
    // ===================================================================
    _wireNetwork(){
        // JOINING QUEUE: Player will join the queue when ready here:
        this._onReady = () => this._joinQueue();

        this._onStatus = ({ queued }) => {
            this.queuedCount = queued;
            this._refreshStatusLine();
        };

        // HANDLES THE MATCH THAT WAS FOUND: Will take care of players match that was found.
        this._onFound = (payload) => this._handleMatchFound(payload);

        // GO TO THE BATTLE: Will go the battle once the match is found and set.
        this._onBegin = (payload) => {
            this.matchFound = true;
            this._goToBattle(payload);
        };

        this._onError = (msg) => this._setError(msg);

        this._onDisconnect = () => {
            if (this.state !== MMState.FOUND)
            {
                this._setError('Lost connection to the server');
            }
        };

        // The server may also tell us the opponent dropped during the VS screen -
        // better to say so here than to hand a dead match to the battle scene.
        this._onOpponentLeft = () => {
            if (this.matchFound) return;
            this._setError('Your opponent disconnected');
        };

        Net.on('net:ready', this._onReady);
        Net.on('net:error', this._onError);
        Net.on('net:disconnect', this._onDisconnect);
        Net.on('queue:status', this._onStatus);
        Net.on('match:found', this._onFound);
        Net.on('match:begin', this._onBegin);
        Net.on('match:opponent_disconnected', this._onOpponentLeft);

        this.events.once('shutdown', () => {
            Net.off('net:ready', this._onReady);
            Net.off('net:error', this._onError);
            Net.off('net:disconnect', this._onDisconnect);
            Net.off('queue:status', this._onStatus);
            Net.off('match:found', this._onFound);
            Net.off('match:begin', this._onBegin);
            Net.off('match:opponent_disconnected', this._onOpponentLeft);

            // Leave the queue only if we're bailing out, not if we matched: 
            if (!this.matchFound) Net.leaveQueue().catch(() => {});
        });
    }

    // _joinQueue(): Determine if the player can join the queue (FIFO):
    async _joinQueue(){
        if (this._joining || this.state === MMState.SEARCHING || this.state === MMState.FOUND) return;

        // The server rejects anything that isn't 1 Supra / 1 Fere / 2 Bonum, but
        // catching it here gives the player a useful sentence instead of a code.
        if (this.deck.length !== 4)
        {
            return this._setError('Your deck is incomplete - pick 1 Supra, 1 Fere and 2 Bonum');
        }

        this._setState(MMState.CONNECTING);
        this.statusTitle.setText('JOINING QUEUE');

        const deckIds = (this.deck || []).map(c => ({ id: c.id }));
        this._joining = true;
        const res = await Net.joinQueue(deckIds); // Place in the Event Emitter 'Net'
        this._joining = false;

        if (!this.scene.isActive()) return;

        // The join that completes a pair gets 'match:found' before its own ack, so
        // the VS screen may already be up - don't knock it back to SEARCHING.
        if (this.state === MMState.FOUND) return;

        if (!res.ok) return this._setError(res.error);

        this._connectWatchdog?.remove(false);
        this.searchStartedAt = this.time.now;
        this.queuedCount = res.position ?? 1;
        this._setState(MMState.SEARCHING);
    }

    // _handleMatchFound(): Will handle the match that is found.
    _handleMatchFound(payload){
        if (this.state === MMState.FOUND) return;

        this.matchData = payload;
        this._setState(MMState.FOUND);
        this._showVersusPanel(payload);
    }

    // _goToBattle(): Will take the player to the battle once the match is found.
    // 'match:begin' carries the engine's opening state; the profiles (elo, rank)
    // came earlier on 'match:found', so both halves are handed over together.
    _goToBattle(payload){
        const found = this.matchData || {};

        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('MultiplayerBattleScene', {
                matchId:  payload.matchId ?? found.matchId,
                you:      found.you,
                opponent: found.opponent,
                state:    payload.state  ?? null,
                events:   payload.events ?? [],
                rules:    payload.rules  ?? null,
            });
        });
    }

    // _normalizeDeck(): CardSelectScene stores the deck as a keyed object; the
    // queue wants an ordered list. Tolerates a Bonum array or a flat card list
    // too, so an older save shape still boards.
    _normalizeDeck(raw){
        if (Array.isArray(raw)) return raw.filter(Boolean).slice(0, 4);

        const bonum = Array.isArray(raw.Bonum || raw.bonum) ? (raw.Bonum || raw.bonum) : [];
        const ordered = [
            raw.Supra ?? raw.supra ?? null,
            raw.Fere  ?? raw.fere  ?? null,
            raw.Bonum1 ?? bonum[0] ?? null,
            raw.Bonum2 ?? bonum[1] ?? null,
        ];

        if (ordered.every(c => !c) && Array.isArray(raw.cards)) return raw.cards.filter(Boolean).slice(0, 4);
        return ordered.filter(Boolean);
    }


    // ===================================================================
    // STATE
    // ===================================================================
    // _setState(): Set the current state of the network:
    _setState(next){
        this.state = next;

        const searching = next === MMState.SEARCHING;
        const found = next === MMState.FOUND;
        const errored = next === MMState.ERROR;

        // Rings keep turning while we're connecting or searching; they stand down
        // the moment there's a result to show, good or bad.
        const scanning = !found && !errored;

        this.searchRingOuter.setVisible(scanning);
        this.searchRingInner.setVisible(scanning);
        this.timerText.setVisible(searching);
        this.cancelBtn.setVisible(!found);

        if (this.sweepGraphic)  this.sweepGraphic.setVisible(scanning);
        if (this.pulseTimer)    this.pulseTimer.paused = !scanning;
        if (this.coreLabel)     this.coreLabel.setText(searching ? 'SCANNING' : (errored ? 'OFFLINE' : 'LINKING'));

        if (errored)
        {
            this._tintCore(CRIMSON);
        }

        this._refreshStatusLine();
    }

    // _setError(): Drop out of the search and explain why, recolouring the core
    // so the failure reads at a glance rather than only in the status line.
    _setError(message){
        this._setState(MMState.ERROR);
        this.statusTitle.setText('SEARCH FAILED').setColor('#ff6b6b');
        this.statusLine.setText(message);
        this.cancelLabel.setText('BACK TO HUB');
    }

    // _refreshStatusLine(): ...
    _refreshStatusLine(){
        if (!this.statusLine) return;

        if (this.state === MMState.CONNECTING)
        {
            this.statusTitle.setText('CONNECTING').setColor(TEAL_HEX);
            this.statusLine.setText('Opening a link to the Zonis network...');
        }
        // if the state is still searching:
        else if (this.state === MMState.SEARCHING){
            this.statusTitle.setText('SEARCHING FOR OPPONENT').setColor('#4ecdc4');
            const n = this.queuedCount || 1;
            this.statusLine.setText(
                n > 1 ? `${n} players in queue` : 'Waiting for another player...'
            );
        }
        else if (this.state === MMState.FOUND) // When the opponent has been found. 
        {
            this.statusTitle.setText('OPPONENT FOUND').setColor('#00ff88');
            this.statusLine.setText('');
        }

        this._refreshQueuePips();
    }


    // ===================================================================
    // UPDATE - timer + ring rotation
    // ===================================================================
    update(time, delta){
        if (this.state === MMState.SEARCHING){
            const elapsed = Math.floor((time - this.searchStartedAt) / 1000);
            const m = Math.floor(elapsed / 60);
            const s = String(elapsed % 60).padStart(2, '0');
            this.timerText.setText(`${m}:${s}`);

            // Reassure them after a long wait
            if (elapsed >= 30 && !this._longWaitShown)
            {
                this._longWaitShown = true;
                this.statusLine.setText('Still searching - widening the skill range...');
            }
        }

        if (this.searchRingOuter.visible)
        {
            this.searchRingOuter.angle += delta * 0.06;
            this.searchRingInner.angle -= delta * 0.09;
            if (this.searchRingMid)  this.searchRingMid.angle  += delta * 0.022;
            if (this.sweepGraphic)   this.sweepGraphic.angle   += delta * 0.11;
        }
    }


    // ===================================================================
    // VISUALS
    // ===================================================================
    // _buildBackground(): The find-a-match key art pushed down under a cool/warm
    // haze, a flat scrim and a cinematic vignette, then a faint scan grid and
    // drifting embers on top - the same atmosphere as the hub and deck builder.
    _buildBackground(){
        const { width, height } = this.scale;

        this.add.rectangle(0, 0, width, height, 0x0a0f14, 1).setOrigin(0);

        const bg    = this.add.image(width * 0.5, height * 0.46, 'findMatchBg');
        const cover = Math.max(width / bg.width, height / bg.height) * 1.05;
        bg.setScale(cover).setOrigin(0.5).setAlpha(0.52);

        // A very slow push-in keeps the still image from feeling frozen.
        this.tweens.add({
            targets:  bg,
            scale:    cover * 1.06,
            duration: 26000,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Cool slate haze upper-left, warm ember haze lower-right
        this.add.ellipse(width * 0.18, height * 0.20, width * 0.52, height * 0.42, 0x1b3138, 0.40);
        this.add.ellipse(width * 0.85, height * 0.82, width * 0.52, height * 0.52, 0x2a0a0a, 0.32);

        // Flat scrim so the glass panels stay legible over the art
        const scrim = this.add.graphics();
        scrim.fillStyle(0x070c12, 0.56);
        scrim.fillRect(0, 0, width, height);

        // Top / bottom vignette
        const vTop = this.add.graphics();
        vTop.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.62, 0.62, 0, 0);
        vTop.fillRect(0, 0, width, height * 0.24);

        const vBottom = this.add.graphics();
        vBottom.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.68, 0.68);
        vBottom.fillRect(0, height * 0.76, width, height * 0.24);

        this._drawScanGrid(width, height);

        // Faint crimson grade to tie the layers together
        this.add.rectangle(0, 0, width, height, 0x330000, 0.05).setOrigin(0);

        this._drawEmbers(width, height);
        this._drawSceneTitle(width);
    }

    // _drawScanGrid(): Hairline lattice with a teal band sliding down it, so the
    // whole backdrop reads as a surface being swept for an opponent.
    _drawScanGrid(width, height){
        const grid = this.add.graphics().setAlpha(0.16);
        grid.lineStyle(1, TEAL, 0.22);
        for (let x = 0; x <= width; x += 96){
            grid.beginPath(); grid.moveTo(x, 0); grid.lineTo(x, height); grid.strokePath();
        }
        for (let y = 0; y <= height; y += 96){
            grid.beginPath(); grid.moveTo(0, y); grid.lineTo(width, y); grid.strokePath();
        }

        const band = this.add.rectangle(width / 2, -60, width, 120, TEAL, 0.05).setOrigin(0.5);
        this.tweens.add({
            targets:     band,
            y:           height + 60,
            duration:    7000,
            repeat:      -1,
            repeatDelay: 2200,
            ease:        'Sine.easeInOut',
        });
    }

    // _drawEmbers(): Soft bokeh glows plus fine rising specks, ported from the hub.
    _drawEmbers(width, height){
        for (let i = 0; i < 9; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, height);
            const r     = Phaser.Math.Between(18, 44);
            const color = Math.random() > 0.5 ? 0xff8080 : 0xffb199;
            const glow  = this.add.circle(x, y, r, color, Phaser.Math.FloatBetween(0.03, 0.08));

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

        for (let i = 0; i < 24; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, height);
            const color = Math.random() > 0.4 ? CRIMSON : 0xffd9c2;
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
        this.add.text(width * 0.5, 74, 'FINDING MATCH', {
            fontFamily:      'monospace',
            fontSize:        '40px',
            color:           '#f5f5f5',
            stroke:          '#dc2626',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const sub = this.add.text(width * 0.5, 118, 'SCAN  •  PAIR  •  STRIVE', {
            fontFamily:    'monospace',
            fontSize:      '14px',
            color:         TEAL_HEX,
            letterSpacing: 2,
        }).setOrigin(0.5).setAlpha(0.85);

        this.tweens.add({
            targets:  sub,
            alpha:    0.45,
            duration: 1800,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // _buildSearchVisuals(): Everything that belongs to the hunt - the energy
    // core at centre stage, the player's loadout on the left, the unknown
    // opponent on the right. All of it lives in one layer so the VERSUS reveal
    // can dissolve the whole search in a single tween.
    _buildSearchVisuals(){
        this.searchLayer = this.add.container(0, 0);

        this._buildEnergyCore();
        this._buildLoadoutPanel();
        this._buildUnknownPanel();
    }

    // _buildEnergyCore(): The giant pulsing circle. A still halo and glass disc
    // underneath, three counter-rotating dashed rings (spun in update()), a radar
    // wedge sweeping the face, orbiting nodes, and - the piece that carries the
    // scene - rings that bloom out of the centre and wash across the whole frame.
    _buildEnergyCore(){
        const core = this.add.container(CORE_X, CORE_Y);
        this.coreContainer = core;
        this.searchLayer.add(core);

        // Layered halo: wide crimson bloom, tighter teal bloom, glass disc.
        this.coreHaloOuter = this.add.circle(0, 0, CORE_R + 168, CRIMSON, 0.07).setAlpha(0.5);
        this.coreHaloInner = this.add.circle(0, 0, CORE_R + 74,  TEAL,    0.055);
        this.coreDisc      = this.add.circle(0, 0, CORE_R,       0x0b1a1e, 0.42);
        core.add([this.coreHaloOuter, this.coreHaloInner, this.coreDisc]);

        // The core "breathes" the whole time the scene is up.
        this.tweens.add({
            targets:  [this.coreHaloInner, this.coreDisc],
            scale:    1.06,
            duration: 2100,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
        this.tweens.add({
            targets:  this.coreHaloOuter,
            scale:    1.12,
            alpha:    1,
            duration: 3200,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Fixed hairline rings for depth.
        const statics = this.add.graphics();
        statics.lineStyle(1, TEAL, 0.22);
        statics.strokeCircle(0, 0, CORE_R);
        statics.strokeCircle(0, 0, CORE_R * 0.62);
        statics.lineStyle(1, CRIMSON, 0.16);
        statics.strokeCircle(0, 0, CORE_R + 74);
        core.add(statics);

        // Radar wedge - a soft slice of light chasing around the disc.
        const sweep = this.add.graphics();
        sweep.fillStyle(TEAL, 0.10);
        sweep.slice(0, 0, CORE_R - 6, Phaser.Math.DegToRad(-32), Phaser.Math.DegToRad(0), true);
        sweep.fillPath();
        sweep.lineStyle(2, TEAL, 0.5);
        sweep.beginPath();
        sweep.moveTo(0, 0);
        sweep.lineTo(CORE_R - 6, 0);
        sweep.strokePath();
        core.add(sweep);
        this.sweepGraphic = sweep;

        // Three dashed rings at different radii; update() counter-rotates them.
        this.searchRingOuter = this._dashedRing(CORE_R + 42, 22, 9, 2.5, TEAL,    0.75);
        this.searchRingMid   = this._dashedRing(CORE_R + 16, 44, 4, 1.5, 0xffb199, 0.45);
        this.searchRingInner = this._dashedRing(CORE_R - 34, 14, 13, 3,  CRIMSON, 0.60);
        core.add([this.searchRingOuter, this.searchRingMid, this.searchRingInner]);

        // Orbiting signal nodes - other players out on the network.
        [TEAL, 0xffb199, CRIMSON].forEach((color, i) => {
            const orbit  = this.add.container(0, 0);
            const radius = CORE_R + 42 + i * 26;
            const start  = (Math.PI * 2 / 3) * i;
            const node   = this.add.circle(Math.cos(start) * radius, Math.sin(start) * radius, 5, color, 0.95);
            const trail  = this.add.circle(node.x, node.y, 12, color, 0.12);
            orbit.add([trail, node]);
            core.add(orbit);

            this.tweens.add({
                targets:  orbit,
                angle:    360,
                duration: 9000 + i * 3000,
                repeat:   -1,
                ease:     'Linear',
            });
            this.tweens.add({
                targets:  node,
                alpha:    0.3,
                duration: 780 + i * 160,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });
        });

        // Readouts inside the core: the elapsed timer and a state word under it.
        this.timerText = this.add.text(0, -6, '0:00', {
            fontFamily:      'monospace',
            fontSize:        '58px',
            color:           '#f5f5f5',
            stroke:          '#04252a',
            strokeThickness: 4,
        }).setOrigin(0.5);

        this.coreLabel = this.add.text(0, 42, 'LINKING', {
            fontFamily: 'monospace', fontSize: '13px', color: TEAL_HEX,
        }).setOrigin(0.5).setAlpha(0.8);

        core.add([this.timerText, this.coreLabel]);
        this.tweens.add({
            targets:  this.coreLabel,
            alpha:    0.3,
            duration: 1100,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // The pulse that crosses the scene. Rings are spawned into the root (not
        // the core container) so they can grow past the panels on either side.
        this.pulseTimer = this.time.addEvent({
            delay:    1200,
            loop:     true,
            callback: () => this._spawnCorePulse(),
        });
        this._spawnCorePulse();

        // Entrance: the core irises open behind the camera fade.
        core.setScale(0.6).setAlpha(0);
        this.tweens.add({
            targets:  core,
            scale:    1,
            alpha:    1,
            duration: 900,
            ease:     'Back.easeOut',
        });
    }

    // _dashedRing(): A ring drawn as evenly spaced arc segments, returned as its
    // own Graphics object so update() can just nudge its angle.
    _dashedRing(radius, segments, gapDegrees, weight, color, alpha){
        const ring = this.add.graphics({ x: 0, y: 0 });
        const step = 360 / segments;

        ring.lineStyle(weight, color, alpha);
        for (let i = 0; i < segments; i++){
            const from = Phaser.Math.DegToRad(i * step);
            const to   = Phaser.Math.DegToRad(i * step + (step - gapDegrees));
            ring.beginPath();
            ring.arc(0, 0, radius, from, to, false);
            ring.strokePath();
        }
        return ring;
    }

    // _spawnCorePulse(): One energy ring blooming out of the core and washing
    // across the frame before it fades. Two rings stagger out per beat so the
    // sweep reads as a pulse rather than a single expanding circle.
    _spawnCorePulse(){
        const emit = (delay, color, weight, alpha, target) => {
            this.time.delayedCall(delay, () => {
                if (!this.scene.isActive() || this.state === MMState.FOUND) return;

                const ring = this.add.graphics({ x: CORE_X, y: CORE_Y });
                ring.lineStyle(weight, color, alpha);
                ring.strokeCircle(0, 0, CORE_R);
                this.searchLayer.add(ring);

                this.tweens.add({
                    targets:    ring,
                    scale:      target,
                    alpha:      0,
                    duration:   2600,
                    ease:       'Cubic.easeOut',
                    onComplete: () => ring.destroy(),
                });
            });
        };

        emit(0,   TEAL,    3, 0.55, 6.2);
        emit(260, CRIMSON, 2, 0.30, 5.0);
    }

    // _tintCore(): Recolour the core when the search ends badly, so the centre of
    // the screen agrees with the status line.
    _tintCore(color){
        this.coreHaloInner?.setFillStyle(color, 0.05);
        this.coreDisc?.setFillStyle(0x1a0b0b, 0.42);
        this.coreLabel?.setColor(CRIMSON_HEX);
    }

    // _buildLoadoutPanel(): The player's four Initiators, stacked two-by-two in a
    // glass frame on the left. This is the "you" half of the confrontation the
    // scene is setting up, and it's on screen the whole time they wait.
    _buildLoadoutPanel(){
        const panelW = 372;
        const panelH = 496;
        const panelX = 252;
        const panelY = CORE_Y + 36;

        const container = this.add.container(panelX - 70, panelY).setAlpha(0);
        this.searchLayer.add(container);

        container.add(this.add.rectangle(0, 0, panelW - 2, panelH - 2, 0x05090e, 0.5).setOrigin(0.5));
        this._drawGlassFrame(container, panelW, panelH, TEAL);
        this._drawPanelHeader(container, panelW, panelH, 'YOUR LOADOUT',
            (this.profile?.name || this.profile?.username || 'You').toUpperCase(), TEAL, TEAL_HEX);

        // 2 x 2 grid of the deck's cards.
        const cellW = 156, cellH = 182, gap = 16;
        const gridTop = -panelH / 2 + 104;
        const cols = [-(cellW + gap) / 2, (cellW + gap) / 2];

        for (let i = 0; i < 4; i++){
            const card = this.deck[i] || null;
            const cx   = cols[i % 2];
            const cy   = gridTop + cellH / 2 + Math.floor(i / 2) * (cellH + gap);
            const cell = card
                ? this._drawMiniCard(cx, cy, cellW, cellH, card, i)
                : this._drawEmptyMiniCard(cx, cy, cellW, cellH);
            container.add(cell);
        }

        this.tweens.add({
            targets:  container,
            x:        panelX,
            alpha:    1,
            duration: 780,
            delay:    260,
            ease:     'Back.easeOut',
        });
    }

    // _buildUnknownPanel(): The opponent's side while they're still unknown -
    // four redacted slots cycling glyphs behind a crimson frame. It mirrors the
    // loadout panel exactly, so the found-a-match moment is the silhouette
    // resolving into a real deck.
    _buildUnknownPanel(){
        const panelW = 372;
        const panelH = 496;
        const panelX = 1668;
        const panelY = CORE_Y + 36;

        const container = this.add.container(panelX + 70, panelY).setAlpha(0);
        this.searchLayer.add(container);

        container.add(this.add.rectangle(0, 0, panelW - 2, panelH - 2, 0x0e0507, 0.5).setOrigin(0.5));
        this._drawGlassFrame(container, panelW, panelH, CRIMSON);
        this._drawPanelHeader(container, panelW, panelH, 'OPPONENT', 'SEARCHING...', CRIMSON, CRIMSON_HEX);

        const cellW = 156, cellH = 182, gap = 16;
        const gridTop = -panelH / 2 + 104;
        const cols = [-(cellW + gap) / 2, (cellW + gap) / 2];

        this.unknownGlyphs = [];

        for (let i = 0; i < 4; i++){
            const cx   = cols[i % 2];
            const cy   = gridTop + cellH / 2 + Math.floor(i / 2) * (cellH + gap);
            const cell = this.add.container(cx, cy);

            const body = this.add.graphics();
            body.fillStyle(0x140a0c, 0.5);
            body.fillRoundedRect(-cellW / 2, -cellH / 2, cellW, cellH, 10);
            body.lineStyle(1.5, CRIMSON, 0.3);
            body.strokeRoundedRect(-cellW / 2, -cellH / 2, cellW, cellH, 10);
            cell.add(body);

            const glyph = this.add.text(0, -10, '?', {
                fontFamily: 'monospace', fontSize: '52px', color: CRIMSON_HEX,
            }).setOrigin(0.5).setAlpha(0.45);

            const redacted = this.add.text(0, cellH / 2 - 30, '████ ███', {
                fontFamily: 'monospace', fontSize: '12px', color: '#5a3a3f',
            }).setOrigin(0.5);

            cell.add([glyph, redacted]);
            container.add(cell);
            this.unknownGlyphs.push(glyph);

            this.tweens.add({
                targets:  glyph,
                alpha:    0.9,
                scale:    1.1,
                duration: 1300,
                yoyo:     true,
                repeat:   -1,
                delay:    i * 220,
                ease:     'Sine.easeInOut',
            });
        }

        // Scramble the glyphs on a slow tick so the panel feels like it's decoding.
        const pool = '?◆◇▣▤△▽※✦⌁';
        this.glyphTimer = this.time.addEvent({
            delay: 420,
            loop:  true,
            callback: () => {
                if (this.state === MMState.FOUND) return;
                const g = Phaser.Utils.Array.GetRandom(this.unknownGlyphs);
                g?.setText(pool.charAt(Phaser.Math.Between(0, pool.length - 1)));
            },
        });

        this.tweens.add({
            targets:  container,
            x:        panelX,
            alpha:    1,
            duration: 780,
            delay:    380,
            ease:     'Back.easeOut',
        });
    }

    // _buildStatusText(): The readout under the core - state headline, detail
    // line, and a row of pips showing how deep the queue currently is.
    _buildStatusText(){
        const panelW = 760;
        const panelH = 150;
        const panelY = 852;

        const container = this.add.container(960, panelY + 26).setAlpha(0);
        this.statusPanel = container;

        container.add(this.add.rectangle(0, 0, panelW - 2, panelH - 2, 0x05090e, 0.5).setOrigin(0.5));
        this._drawGlassFrame(container, panelW, panelH, TEAL);

        this.statusTitle = this.add.text(0, -34, 'CONNECTING', {
            fontFamily:      'monospace',
            fontSize:        '26px',
            color:           TEAL_HEX,
            stroke:          '#04252a',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.statusLine = this.add.text(0, 2, 'Opening a link to the Zonis network...', {
            fontFamily: 'monospace', fontSize: '14px', color: MUTED_HEX,
        }).setOrigin(0.5).setAlpha(0.85);

        container.add([this.statusTitle, this.statusLine]);

        // Queue depth pips - filled teal for every player waiting, capped at six.
        this.queuePips = [];
        const pipCount = 6;
        const pipGap   = 26;
        for (let i = 0; i < pipCount; i++){
            const pip = this.add.circle((i - (pipCount - 1) / 2) * pipGap, 38, 4, TEAL, 0.18);
            container.add(pip);
            this.queuePips.push(pip);
        }

        // A hairline that slides back and forth like a loading indicator.
        const track = this.add.rectangle(0, 56, panelW - 72, 1, TEAL, 0.14).setOrigin(0.5);
        const head  = this.add.rectangle(-(panelW - 72) / 2, 56, 120, 2, TEAL, 0.7).setOrigin(0.5);
        container.add([track, head]);
        this.tweens.add({
            targets:  head,
            x:        (panelW - 72) / 2,
            duration: 1700,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
        this.tweens.add({
            targets:  container,
            y:        panelY,
            alpha:    1,
            duration: 700,
            delay:    420,
            ease:     'Back.easeOut',
        });
    }

    // _refreshQueuePips(): Light one pip per player currently in the pool.
    _refreshQueuePips(){
        if (!this.queuePips) return;
        const lit = Math.min(this.queuePips.length, Math.max(0, this.queuedCount || 0));
        this.queuePips.forEach((pip, i) => {
            const on = i < lit;
            pip.setFillStyle(TEAL, on ? 0.95 : 0.18);
            pip.setScale(on ? 1.25 : 1);
        });
    }

    // _buildCancelButton(): Leaves the queue and walks back to the hub. Doubles
    // as the "back to hub" exit when the search errors out, so _setError only has
    // to swap its label.
    _buildCancelButton(){
        const w = 300, h = 56;
        const btn = this.add.container(960, 984);
        this.cancelBtn = btn;

        // Child order matters - _setError reaches for the label.
        const bg = this.add.rectangle(0, 0, w, h, 0x0b141c, 0.6).setOrigin(0.5);

        const border = this.add.graphics();
        const stroke = (weight, alpha) => {
            border.clear();
            border.lineStyle(weight, CRIMSON, alpha);
            border.strokeRect(-w / 2, -h / 2, w, h);
        };
        stroke(1.5, 0.5);

        const label = this.add.text(0, 0, 'CANCEL SEARCH', {
            fontFamily: 'monospace', fontSize: '16px', color: CRIMSON_HEX,
        }).setOrigin(0.5);
        this.cancelLabel = label;

        btn.add([bg, border, label]);

        bg.setInteractive({ useHandCursor: true });

        bg.on('pointerover', () => {
            bg.setFillStyle(0x1c1014, 0.85);
            stroke(2, 0.9);
            this.tweens.add({ targets: btn, scaleX: 1.04, scaleY: 1.04, duration: 140, ease: 'Sine.easeOut' });
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x0b141c, 0.6);
            stroke(1.5, 0.5);
            this.tweens.add({ targets: btn, scaleX: 1, scaleY: 1, duration: 140, ease: 'Sine.easeOut' });
        });

        bg.on('pointerdown', () => {
            if (this._leaving) return;
            this._leaving = true;
            this.tweens.add({
                targets:    btn,
                scaleX:     0.96,
                scaleY:     0.96,
                duration:   80,
                yoyo:       true,
                ease:       'Sine.easeOut',
                onComplete: () => this._cancel(),
            });
        });

        // Esc gets you out too - faster than hunting for the button.
        this.input.keyboard?.once('keydown-ESC', () => {
            if (this.state !== MMState.FOUND && !this._leaving){
                this._leaving = true;
                this._cancel();
            }
        });

        btn.setAlpha(0);
        this.tweens.add({ targets: btn, alpha: 1, duration: 500, delay: 700, ease: 'Sine.easeOut' });
    }

    async _cancel(){
        await Net.leaveQueue().catch(() => {});
        this.cameras.main.fadeOut(250, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('MultiplayerScene');
        });
    }


    // ===================================================================
    // SHARED CHROME - glass frames, headers, cards
    // ===================================================================
    // _drawGlassFrame(): The hub's frame, with the accent colour parameterised so
    // the player's side reads teal and the opponent's crimson.
    _drawGlassFrame(container, w, h, accent = TEAL){
        const counter   = accent === TEAL ? CRIMSON : TEAL;
        const glowOuter = this.add.rectangle(0, 0, w + 20, h + 20, accent, 0.11).setOrigin(0.5).setAlpha(0.35);
        const panelBody = this.add.rectangle(0, 0, w, h, 0x070c12, 0.45).setOrigin(0.5);
        const innerGlow = this.add.ellipse(0, 0, w * 0.85, h * 0.70, 0x14232b, 0.25);
        const sheen     = this.add.rectangle(0, -h / 2 + 10, w - 24, 16, 0xaaffee, 0.06).setOrigin(0.5);

        const borderG = this.add.graphics();
        borderG.lineStyle(2, accent, 0.55);
        borderG.strokeRect(-w / 2, -h / 2, w, h);
        borderG.lineStyle(1, counter, 0.25);
        borderG.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);

        const cornerG = this.add.graphics();
        const cLen = 16;
        [
            [-w / 2, -h / 2,  1,  1],
            [ w / 2, -h / 2, -1,  1],
            [-w / 2,  h / 2,  1, -1],
            [ w / 2,  h / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(3, accent, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(accent, 1.0);
            cornerG.fillCircle(x, y, 3.5);
        });

        container.add([glowOuter, panelBody, innerGlow, sheen, borderG, cornerG]);

        // Slow breathing glow, the same one the hub's profile card uses.
        this.tweens.add({
            targets:  glowOuter,
            alpha:    1,
            scaleX:   1.01,
            scaleY:   1.02,
            duration: 2000,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // _drawPanelHeader(): Title / subtitle pair over a hairline divider.
    _drawPanelHeader(container, w, panelH, title, subtitle, accent, accentHex){
        const top = -panelH / 2;

        const label = this.add.text(0, top + 32, title, {
            fontFamily:      'monospace',
            fontSize:        '19px',
            color:           '#f5f5f5',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        const sub = this.add.text(0, top + 58, subtitle, {
            fontFamily: 'monospace', fontSize: '11px', color: accentHex,
        }).setOrigin(0.5).setAlpha(0.7);

        const divider = this.add.graphics();
        divider.lineStyle(1, accent, 0.22);
        divider.beginPath();
        divider.moveTo(-w / 2 + 24, top + 80);
        divider.lineTo( w / 2 - 24, top + 80);
        divider.strokePath();

        container.add([label, sub, divider]);
        return sub;
    }

    // _drawMiniCard(): One Initiator at loadout-panel size - category pill, art
    // (or a monogram when the texture is missing), name, and a tight stat strip.
    _drawMiniCard(x, y, w, h, card, index){
        const cat  = CATEGORY[card.cate] || CATEGORY.Bonum;
        const cell = this.add.container(x, y);

        const body = this.add.graphics();
        body.fillStyle(0x0b141c, 0.62);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
        body.lineStyle(1.5, cat.accent, 0.5);
        body.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
        cell.add(body);

        // Category pill, sized to its own label.
        const pill = this.add.text(-w / 2 + 13, -h / 2 + 17, cat.label, {
            fontFamily: 'monospace', fontSize: '9px', color: cat.hex,
        }).setOrigin(0, 0.5);
        const pillBg = this.add.graphics();
        pillBg.fillStyle(cat.accent, 0.10);
        pillBg.lineStyle(1, cat.accent, 0.4);
        pillBg.fillRoundedRect(-w / 2 + 7, -h / 2 + 8, pill.width + 14, 18, 4);
        pillBg.strokeRoundedRect(-w / 2 + 7, -h / 2 + 8, pill.width + 14, 18, 4);
        cell.add([pillBg, pill]);

        this._drawCardArt(cell, card, cat, -6, w - 30, 84, index);

        cell.add(this.add.text(0, h / 2 - 44, String(card.shortName || card.name).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '12px', color: '#f0f0f0',
        }).setOrigin(0.5));

        const dv = this.add.graphics();
        dv.lineStyle(1, cat.accent, 0.2);
        dv.beginPath();
        dv.moveTo(-w / 2 + 14, h / 2 - 32);
        dv.lineTo( w / 2 - 14, h / 2 - 32);
        dv.strokePath();
        cell.add(dv);

        const step = (w - 28) / 3;
        [
            ['ATK', card.atk,  '#ff8f8f'],
            ['DEF', card.def,  '#9be7c4'],
            ['ESS', card.esse, TEAL_HEX],
        ].forEach(([lbl, val, colr], i) => {
            const sx = -w / 2 + 14 + step * (i + 0.5);
            cell.add(this.add.text(sx, h / 2 - 20, String(val ?? '—'), {
                fontFamily: 'monospace', fontSize: '12px', color: colr,
            }).setOrigin(0.5));
            cell.add(this.add.text(sx, h / 2 - 8, lbl, {
                fontFamily: 'monospace', fontSize: '7px', color: MUTED_HEX,
            }).setOrigin(0.5).setAlpha(0.8));
        });

        return cell;
    }

    // _drawEmptyMiniCard(): Placeholder for a deck that arrived short.
    _drawEmptyMiniCard(x, y, w, h){
        const cell = this.add.container(x, y);

        const body = this.add.graphics();
        body.fillStyle(0x0b141c, 0.38);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
        body.lineStyle(1.5, 0x64748b, 0.4);
        body.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);

        const plus = this.add.text(0, -8, '+', {
            fontFamily: 'monospace', fontSize: '38px', color: '#64748b',
        }).setOrigin(0.5).setAlpha(0.5);

        cell.add([body, plus, this.add.text(0, h / 2 - 22, 'EMPTY SLOT', {
            fontFamily: 'monospace', fontSize: '9px', color: '#6b7f7c',
        }).setOrigin(0.5)]);

        this.tweens.add({
            targets: plus, alpha: 0.9, scale: 1.08,
            duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        return cell;
    }

    // _drawCardArt(): Shared by both card sizes - the real texture when it's
    // loaded, otherwise the "artwork pending" monogram disc.
    _drawCardArt(cell, card, cat, centerY, maxW, maxH, index){
        if (card.name && this.textures.exists(card.name)){
            const src   = this.textures.get(card.name).getSourceImage();
            const scale = Math.min(maxW / src.width, maxH / src.height);
            const img   = this.add.image(0, centerY, card.name).setScale(scale);
            cell.add(img);

            this.tweens.add({
                targets:  img,
                scale:    scale * 1.04,
                duration: 3200,
                yoyo:     true,
                repeat:   -1,
                delay:    index * 260,
                ease:     'Sine.easeInOut',
            });
            return img;
        }

        const r    = Math.min(maxH / 2.4, 34);
        const disc = this.add.circle(0, centerY, r, 0x0b1a1e, 0.9).setStrokeStyle(2, cat.accent, 0.7);
        const mono = this.add.text(0, centerY, String(card.shortName || card.name || '?').charAt(0).toUpperCase(), {
            fontFamily: 'monospace', fontSize: `${Math.round(r * 1.1)}px`, color: cat.hex,
        }).setOrigin(0.5);
        cell.add([disc, mono]);

        this.tweens.add({
            targets:  disc,
            scale:    1.07,
            duration: 1800,
            yoyo:     true,
            repeat:   -1,
            delay:    index * 260,
            ease:     'Sine.easeInOut',
        });
        return disc;
    }


    // ===================================================================
    // VERSUS PANEL
    // ===================================================================
    // _showVersusPanel(): The payoff. The search dissolves, a veil drops, and the
    // two decks are dealt in from opposite edges - yours from the left in teal,
    // theirs from the right in crimson - before the VS emblem slams down between
    // them. Both decks come straight off the server, so what's drawn here is the
    // same data the battle will run on.
    _showVersusPanel(payload){
        this.glyphTimer?.remove(false);
        this.pulseTimer?.remove(false);

        const { width, height } = this.scale;

        // Collapse the search: the core implodes, the panels slide back out.
        this.tweens.add({
            targets:  this.searchLayer,
            alpha:    0,
            duration: 420,
            ease:     'Sine.easeIn',
        });
        this.tweens.add({
            targets:  this.coreContainer,
            scale:    0.2,
            duration: 420,
            ease:     'Back.easeIn',
        });
        this.tweens.add({
            targets:  this.statusPanel,
            alpha:    0,
            y:        this.statusPanel.y + 40,
            duration: 380,
            ease:     'Sine.easeIn',
        });

        const layer = this.add.container(0, 0).setDepth(100);
        this.versusLayer = layer;

        // Veil, so the arena reads as its own space rather than an overlay.
        const veil = this.add.rectangle(0, 0, width, height, 0x03070b, 0.78).setOrigin(0).setAlpha(0);
        layer.add(veil);
        this.tweens.add({ targets: veil, alpha: 1, duration: 450, ease: 'Sine.easeOut' });

        // Charged bands racing in from both edges toward the centre line.
        this._drawClashBands(layer, width, height);

        const you = payload?.you || {};
        const opp = payload?.opponent || {};

        const panelW = 760;
        const panelH = 452;
        const panelY = 600;

        this.time.delayedCall(320, () => {
            if (!this.scene.isActive()) return;

            this._buildVersusBanner(layer, width);
            this._buildVersusSide(layer, 470,  panelY, panelW, panelH, you, you.deck || this.deck, TEAL,    TEAL_HEX,    -1);
            this._buildVersusSide(layer, 1450, panelY, panelW, panelH, opp, opp.deck,              CRIMSON, CRIMSON_HEX,  1);
        });

        // The emblem lands once both sides are seated.
        this.time.delayedCall(1180, () => {
            if (!this.scene.isActive()) return;
            this._buildVersusEmblem(layer, 960, panelY);
        });

        // Countdown mirrors the server's COUNTDOWN_MS, so the bar empties exactly
        // as 'match:begin' arrives.
        this.time.delayedCall(1420, () => {
            if (!this.scene.isActive()) return;
            this._buildVersusCountdown(layer, 960, 952, payload?.startsIn ?? 3000);
        });
    }

    // _drawClashBands(): Light streaks charging in from either edge, meeting on
    // the centre line - the visual promise of the collision to come.
    _drawClashBands(layer, width, height){
        for (let i = 0; i < 7; i++){
            const y     = Phaser.Math.Between(height * 0.18, height * 0.88);
            const left  = Math.random() > 0.5;
            const color = left ? TEAL : CRIMSON;
            const band  = this.add.rectangle(left ? -240 : width + 240, y, 220, Phaser.Math.Between(2, 5), color, 0.5)
                .setOrigin(0.5);
            layer.add(band);

            this.tweens.add({
                targets:    band,
                x:          width / 2,
                alpha:      0,
                duration:   Phaser.Math.Between(520, 900),
                delay:      i * 70,
                ease:       'Cubic.easeIn',
                onComplete: () => band.destroy(),
            });
        }
    }

    // _buildVersusBanner(): "MATCH FOUND" headline over the two decks.
    _buildVersusBanner(layer, width){
        const banner = this.add.container(width / 2, 236).setAlpha(0).setScale(0.9);
        layer.add(banner);

        const glow = this.add.rectangle(0, 0, 560, 74, TEAL, 0.16).setOrigin(0.5).setAlpha(0.3);

        const title = this.add.text(0, -8, 'MATCH FOUND', {
            fontFamily:      'monospace',
            fontSize:        '46px',
            color:           '#f5f5f5',
            stroke:          '#dc2626',
            strokeThickness: 5,
        }).setOrigin(0.5);

        const sub = this.add.text(0, 30, 'LOADOUTS LOCKED  •  PREPARE TO STRIVE', {
            fontFamily: 'monospace', fontSize: '13px', color: TEAL_HEX,
        }).setOrigin(0.5).setAlpha(0.8);

        // Hairlines reaching out from the headline toward both panels.
        const rule = this.add.graphics();
        rule.lineStyle(1, TEAL, 0.35);
        rule.beginPath(); rule.moveTo(-340, 0); rule.lineTo(-210, 0); rule.strokePath();
        rule.lineStyle(1, CRIMSON, 0.35);
        rule.beginPath(); rule.moveTo( 210, 0); rule.lineTo( 340, 0); rule.strokePath();

        banner.add([glow, rule, title, sub]);

        this.tweens.add({
            targets:  banner,
            alpha:    1,
            scale:    1,
            duration: 560,
            ease:     'Back.easeOut',
        });
        this.tweens.add({
            targets:  glow,
            alpha:    1,
            duration: 1300,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
        this.tweens.add({
            targets:  sub,
            alpha:    0.4,
            duration: 1500,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // _buildVersusSide(): One combatant - identity header, their four Initiators
    // dealt in with a stagger, and the deck's combined ATK / DEF / ESSE counting
    // up underneath. 'dir' is -1 for the left side, +1 for the right, and decides
    // which edge the panel and its cards fly in from.
    _buildVersusSide(layer, cx, cy, w, h, player, deck, accent, accentHex, dir){
        const cards = Array.isArray(deck) ? deck.slice(0, 4) : [];

        const panel = this.add.container(cx + dir * 480, cy).setAlpha(0);
        layer.add(panel);

        panel.add(this.add.rectangle(0, 0, w - 2, h - 2, dir < 0 ? 0x05090e : 0x0e0507, 0.72).setOrigin(0.5));
        this._drawGlassFrame(panel, w, h, accent);

        this._buildVersusIdentity(panel, w, h, player, accent, accentHex, dir);

        // Card row: four cards across, dealt from the outside in.
        const cardW = 168, cardH = 246, gap = 14;
        const rowY  = -h / 2 + 128 + cardH / 2;
        const startX = -((cardW * 4 + gap * 3) / 2) + cardW / 2;

        const dealt = [];
        for (let i = 0; i < 4; i++){
            const card = cards[i];
            const x    = startX + i * (cardW + gap);
            const cell = card
                ? this._drawVersusCard(x, rowY, cardW, cardH, card, i)
                : this._drawEmptyMiniCard(x, rowY, cardW, cardH);

            cell.setAlpha(0).setScale(0.8);
            cell.x = x + dir * 220;
            panel.add(cell);
            dealt.push({ cell, x });
        }

        // Totals strip - the deck's combined numbers, ticked up rather than shown.
        const totals = this._deckTotals(cards);
        const totalY = h / 2 - 34;
        const tStep  = (w - 120) / 3;
        const counters = [];

        [
            ['TOTAL ATK', totals.atk,  '#ff8f8f'],
            ['TOTAL DEF', totals.def,  '#9be7c4'],
            ['TOTAL ESS', totals.esse, TEAL_HEX],
        ].forEach(([lbl, value, colr], i) => {
            const sx = -((w - 120) / 2) + tStep * (i + 0.5);
            const valueText = this.add.text(sx, totalY - 8, '0', {
                fontFamily: 'monospace', fontSize: '22px', color: colr,
            }).setOrigin(0.5);
            const labelText = this.add.text(sx, totalY + 14, lbl, {
                fontFamily: 'monospace', fontSize: '9px', color: MUTED_HEX,
            }).setOrigin(0.5).setAlpha(0.8);
            panel.add([valueText, labelText]);
            counters.push({ valueText, value });
        });

        // Panel flies in, then deals its cards, then rolls the totals.
        this.tweens.add({
            targets:  panel,
            x:        cx,
            alpha:    1,
            duration: 640,
            ease:     'Back.easeOut',
            onComplete: () => {
                dealt.forEach(({ cell, x }, i) => {
                    this.tweens.add({
                        targets:  cell,
                        x, alpha: 1, scaleX: 1, scaleY: 1,
                        duration: 420,
                        delay:    i * 90,
                        ease:     'Back.easeOut',
                        onStart:  () => this._spawnCardFlash(panel, x, rowY, accent),
                    });
                });

                counters.forEach(({ valueText, value }) => {
                    const roll = { n: 0 };
                    this.tweens.add({
                        targets:  roll,
                        n:        value,
                        duration: 900,
                        delay:    540,
                        ease:     'Cubic.easeOut',
                        onUpdate: () => valueText.setText(String(Math.round(roll.n))),
                    });
                });
            },
        });

        return panel;
    }

    // _buildVersusIdentity(): Avatar disc, name, and the rank / elo pills that
    // sit above a combatant's cards.
    _buildVersusIdentity(panel, w, h, player, accent, accentHex, dir){
        const top     = -h / 2;
        const name    = player?.name || player?.username || (dir < 0 ? 'You' : 'Opponent');
        const rank    = player?.rank || 'Unranked';
        const elo     = player?.elo ?? '—';
        const initial = String(name).charAt(0).toUpperCase() || '?';

        // Avatar hugs the outer edge so both headers read outside-in.
        const avX = dir < 0 ? -w / 2 + 52 : w / 2 - 52;
        const avY = top + 50;

        const avatarGlow = this.add.circle(avX, avY, 40, accent, 0.18).setAlpha(0.4);
        const avatar     = this.add.circle(avX, avY, 32, 0x0b1a1e, 0.9).setStrokeStyle(2, accent, 0.75);
        const avatarText = this.add.text(avX, avY, initial, {
            fontFamily: 'monospace', fontSize: '28px', color: accentHex,
        }).setOrigin(0.5);
        panel.add([avatarGlow, avatar, avatarText]);

        this.tweens.add({
            targets: avatarGlow, scale: 1.14, alpha: 1,
            duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        // Name + side tag, anchored away from the avatar.
        const tx     = dir < 0 ? avX + 52 : avX - 52;
        const origin = dir < 0 ? 0 : 1;

        panel.add(this.add.text(tx, top + 30, dir < 0 ? 'YOUR DECK' : 'OPPONENT DECK', {
            fontFamily: 'monospace', fontSize: '11px', color: accentHex,
        }).setOrigin(origin, 0.5).setAlpha(0.8));

        panel.add(this.add.text(tx, top + 58, String(name).toUpperCase(), {
            fontFamily:      'monospace',
            fontSize:        '26px',
            color:           '#f5f5f5',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(origin, 0.5));

        // Rank / elo pills, laid out from the same edge as the name.
        let cursor = tx;
        [
            [`◆  ${String(rank).toUpperCase()}`, 0xffb199, '#ffb199'],
            [`ELO  ${elo}`,                      accent,   accentHex],
        ].forEach(([text, pillAccent, pillHex]) => {
            const label = this.add.text(0, 0, text, {
                fontFamily: 'monospace', fontSize: '11px', color: pillHex,
            }).setOrigin(0, 0.5);

            const pw = label.width + 24;
            const px = dir < 0 ? cursor : cursor - pw;
            label.setPosition(px + 12, top + 90);

            const bg = this.add.graphics();
            bg.fillStyle(pillAccent, 0.10);
            bg.lineStyle(1, pillAccent, 0.4);
            bg.fillRoundedRect(px, top + 78, pw, 24, 5);
            bg.strokeRoundedRect(px, top + 78, pw, 24, 5);

            // The right-hand header is laid out edge-inward, so the cursor walks
            // against 'dir' rather than with it.
            panel.add([bg, label]);
            cursor -= dir * (pw + 10);
        });

        const divider = this.add.graphics();
        divider.lineStyle(1, accent, 0.22);
        divider.beginPath();
        divider.moveTo(-w / 2 + 24, top + 116);
        divider.lineTo( w / 2 - 24, top + 116);
        divider.strokePath();
        panel.add(divider);
    }

    // _drawVersusCard(): Full-size Initiator for the versus panel - category pill,
    // large art, name, stat strip, corner ticks and a sheen that sweeps the face.
    _drawVersusCard(x, y, w, h, card, index){
        const cat  = CATEGORY[card.cate] || CATEGORY.Bonum;
        const cell = this.add.container(x, y);
        const r    = 12;

        // Breathing outline behind the frame.
        const glow = this.add.graphics().setAlpha(0);
        glow.lineStyle(6, cat.accent, 0.14);
        glow.strokeRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, r + 2);
        cell.add(glow);
        this.tweens.add({
            targets: glow, alpha: 1,
            duration: 1700, yoyo: true, repeat: -1, delay: index * 380, ease: 'Sine.easeInOut',
        });

        const body = this.add.graphics();
        body.fillStyle(0x0b141c, 0.72);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, r);
        body.lineStyle(2, cat.accent, 0.6);
        body.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
        cell.add(body);

        cell.add(this.add.rectangle(0, -h / 2 + 10, w - 20, 12, 0xaaffee, 0.06).setOrigin(0.5));

        // Corner ticks, echoing the scene's frame motif.
        const ticks = this.add.graphics();
        ticks.lineStyle(2, cat.accent, 0.9);
        const tl = 12;
        [
            [-w / 2 + 4, -h / 2 + 4,  1,  1],
            [ w / 2 - 4, -h / 2 + 4, -1,  1],
            [-w / 2 + 4,  h / 2 - 4,  1, -1],
            [ w / 2 - 4,  h / 2 - 4, -1, -1],
        ].forEach(([tx, ty, hd, vd]) => {
            ticks.beginPath();
            ticks.moveTo(tx + hd * tl, ty);
            ticks.lineTo(tx, ty);
            ticks.lineTo(tx, ty + vd * tl);
            ticks.strokePath();
        });
        cell.add(ticks);

        const pill = this.add.text(-w / 2 + 15, -h / 2 + 20, cat.label, {
            fontFamily: 'monospace', fontSize: '10px', color: cat.hex,
        }).setOrigin(0, 0.5);
        const pillBg = this.add.graphics();
        pillBg.fillStyle(cat.accent, 0.10);
        pillBg.lineStyle(1, cat.accent, 0.4);
        pillBg.fillRoundedRect(-w / 2 + 7, -h / 2 + 11, pill.width + 16, 18, 4);
        pillBg.strokeRoundedRect(-w / 2 + 7, -h / 2 + 11, pill.width + 16, 18, 4);
        cell.add([pillBg, pill]);

        this._drawCardArt(cell, card, cat, -18, w - 34, 120, index);

        cell.add(this.add.text(0, h / 2 - 58, String(card.shortName || card.name).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '14px', color: '#f0f0f0',
        }).setOrigin(0.5));

        const dv = this.add.graphics();
        dv.lineStyle(1, cat.accent, 0.2);
        dv.beginPath();
        dv.moveTo(-w / 2 + 16, h / 2 - 44);
        dv.lineTo( w / 2 - 16, h / 2 - 44);
        dv.strokePath();
        cell.add(dv);

        const step = (w - 34) / 3;
        [
            ['ATK', card.atk,  '#ff8f8f'],
            ['DEF', card.def,  '#9be7c4'],
            ['ESS', card.esse, TEAL_HEX],
        ].forEach(([lbl, val, colr], i) => {
            const sx = -w / 2 + 17 + step * (i + 0.5);
            cell.add(this.add.text(sx, h / 2 - 30, String(val ?? '—'), {
                fontFamily: 'monospace', fontSize: '14px', color: colr,
            }).setOrigin(0.5));
            cell.add(this.add.text(sx, h / 2 - 14, lbl, {
                fontFamily: 'monospace', fontSize: '8px', color: MUTED_HEX,
            }).setOrigin(0.5).setAlpha(0.8));
        });

        // Sheen bar sweeping the length of the card on a long loop.
        const sheen = this.add.rectangle(0, -h / 2 + 6, w - 14, 10, 0xffffff, 0.05).setOrigin(0.5);
        cell.add(sheen);
        this.tweens.add({
            targets:     sheen,
            y:           h / 2 - 6,
            duration:    2400,
            ease:        'Sine.easeInOut',
            repeat:      -1,
            repeatDelay: 3000,
            delay:       1200 + index * 420,
        });

        return cell;
    }

    // _spawnCardFlash(): A quick accent bloom where a card lands, so dealing the
    // deck has some weight behind it.
    _spawnCardFlash(panel, x, y, accent){
        const flash = this.add.circle(x, y, 10, accent, 0.5);
        panel.add(flash);
        this.tweens.add({
            targets:    flash,
            scale:      9,
            alpha:      0,
            duration:   480,
            ease:       'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });
    }

    // _deckTotals(): Combined ATK / DEF / ESSE for a four-card deck.
    _deckTotals(cards){
        return (cards || []).reduce((acc, c) => ({
            atk:  acc.atk  + (Number(c?.atk)  || 0),
            def:  acc.def  + (Number(c?.def)  || 0),
            esse: acc.esse + (Number(c?.esse) || 0),
        }), { atk: 0, def: 0, esse: 0 });
    }

    // _buildVersusEmblem(): The VS mark landing between the two decks - it drops
    // in hard, kicks the camera, and throws a shockwave out through both panels.
    _buildVersusEmblem(layer, x, y){
        const emblem = this.add.container(x, y).setScale(5).setAlpha(0);
        layer.add(emblem);

        const halo   = this.add.circle(0, 0, 96, CRIMSON, 0.2).setAlpha(0.35);
        const disc   = this.add.circle(0, 0, 62, 0x0b1017, 0.9);

        const rings = this.add.graphics();
        rings.lineStyle(3, TEAL, 0.7);
        rings.strokeCircle(0, 0, 62);
        rings.lineStyle(1.5, CRIMSON, 0.5);
        rings.strokeCircle(0, 0, 74);

        const vs = this.add.text(0, 0, 'VS', {
            fontFamily:      'monospace',
            fontSize:        '58px',
            color:           '#f5f5f5',
            stroke:          '#dc2626',
            strokeThickness: 6,
        }).setOrigin(0.5);

        emblem.add([halo, disc, rings, vs]);

        this.tweens.add({
            targets:  emblem,
            scale:    1,
            alpha:    1,
            duration: 380,
            ease:     'Back.easeIn',
            onComplete: () => {
                this.cameras.main.shake(240, 0.006);
                this.cameras.main.flash(180, 94, 234, 212, false);

                // Shockwave rings washing out through both decks.
                [TEAL, CRIMSON].forEach((color, i) => {
                    const wave = this.add.graphics({ x, y });
                    wave.lineStyle(4 - i, color, 0.6);
                    wave.strokeCircle(0, 0, 62);
                    layer.add(wave);
                    this.tweens.add({
                        targets:    wave,
                        scale:      14,
                        alpha:      0,
                        duration:   900,
                        delay:      i * 110,
                        ease:       'Cubic.easeOut',
                        onComplete: () => wave.destroy(),
                    });
                });

                // Settles into a slow heartbeat until the battle starts.
                this.tweens.add({
                    targets:  emblem,
                    scale:    1.06,
                    duration: 780,
                    yoyo:     true,
                    repeat:   -1,
                    ease:     'Sine.easeInOut',
                });
                this.tweens.add({
                    targets:  halo,
                    alpha:    1,
                    scale:    1.2,
                    duration: 900,
                    yoyo:     true,
                    repeat:   -1,
                    ease:     'Sine.easeInOut',
                });
            },
        });
    }

    // _buildVersusCountdown(): Draining bar plus the seconds ticking down, timed
    // off the server's own countdown so it empties as 'match:begin' lands.
    _buildVersusCountdown(layer, x, y, startsIn){
        const barW = 520;

        const holder = this.add.container(x, y).setAlpha(0);
        layer.add(holder);

        const label = this.add.text(0, -26, 'BATTLE BEGINS IN', {
            fontFamily: 'monospace', fontSize: '12px', color: MUTED_HEX,
        }).setOrigin(0.5).setAlpha(0.85);

        const seconds = this.add.text(0, 6, String(Math.ceil(startsIn / 1000)), {
            fontFamily:      'monospace',
            fontSize:        '34px',
            color:           TEAL_HEX,
            stroke:          '#04252a',
            strokeThickness: 3,
        }).setOrigin(0.5);

        const track = this.add.rectangle(0, 34, barW, 4, 0xffffff, 0.12).setOrigin(0.5);
        const fill  = this.add.rectangle(-barW / 2, 34, barW, 4, TEAL, 0.9).setOrigin(0, 0.5);

        holder.add([label, seconds, track, fill]);
        this.tweens.add({ targets: holder, alpha: 1, duration: 320, ease: 'Sine.easeOut' });

        this.tweens.add({
            targets:  fill,
            scaleX:   0,
            duration: startsIn,
            ease:     'Linear',
        });

        // One tick per second, each with a small pop so the count reads clearly.
        this.time.addEvent({
            delay:  1000,
            repeat: Math.max(0, Math.ceil(startsIn / 1000) - 1),
            callback: () => {
                if (!seconds.active) return;
                const next = Math.max(0, Number(seconds.text) - 1);
                seconds.setText(String(next));
                seconds.setColor(next <= 1 ? CRIMSON_HEX : TEAL_HEX);
                this.tweens.add({
                    targets: seconds, scale: 1.35,
                    duration: 160, yoyo: true, ease: 'Sine.easeOut',
                });
            },
        });
    }
}

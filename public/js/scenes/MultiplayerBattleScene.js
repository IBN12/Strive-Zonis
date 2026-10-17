/** |Multiplayer Battle Scene|
 * Strive: We Are Zonis
 *
 * The client half of the BattleEngine. It renders what the server says the board
 * is and sends intents back - it never computes damage, never decides whose turn
 * it is and never advances the clock on its own. Every visible number arrives in
 * a 'battle:events' payload.
 *
 * Buttons lock the moment an action is sent and unlock only when the server's
 * state says it is this player's turn again, so a double-click cannot desync the
 * board or spend a turn twice.
 */

import { Net } from '../net/NetworkManager.js';
import { SINGULARITY_CARDS, STORE_CARDS } from '../models/singularityCards.js';
import SingularityCardAnimations from '../gameTools/singularityCardAnimations.js';

const TURN_WARN_MS = 8000;      // countdown turns red under this

// --- backdrop ---------------------------------------------------------------
// The looping arena plate. load.video() does not actually download the file -
// it only registers the URL, and the Video Game Object streams it - so parking
// a 10MB clip in preload() costs the scene nothing on the way in.
const VIDEO_KEY      = 'mpBattleBg';
const VIDEO_SRC      = 'assets/backgroundVideos/multiplayer_battle_scene_con_vid_1.mp4';
const VIDEO_ALPHA    = 0.60;   // how far the plate is allowed to come forward
const VIDEO_OVERSCAN = 1.06;   // cover margin, so the drift never shows an edge
const VIDEO_ANCHOR_Y = 0.46;   // framed slightly high - the deck row sits low
const VIDEO_FIT_RETRIES = 25;  // ~2s of waiting on a first frame before giving up

// The two players' accents, reused as the arena's stage lighting: the opponent
// is lit crimson from above, the player teal from below.
const OPP_ACCENT = 0xff4466;
const YOU_ACCENT = 0x00ffcc;
const OPP_ACCENT_HEX = '#ff8fa0';
const YOU_ACCENT_HEX = '#7fffe4';

// --- header -----------------------------------------------------------------
// The PvP nameplate bar. It is laid out around its own centre so the whole slab
// can be dropped in from off-camera with one tween, which makes HEADER_Y the
// resting position of that centre rather than the top of the bar.
const HEADER_MAX_W = 1080;     // capped, so an ultrawide canvas doesn't stretch it
const HEADER_H     = 152;
const HEADER_Y     = 108;      // must stay clear of the row _buildArena() lays out

// --- singularity points -----------------------------------------------------
// The attack ladder, mirroring gameTools/singularityPointStore.js and the
// server's RULES.SP_PER_MULTIPLIER - same indices, same numbers, so the panel
// can still name a roll if an event ever arrives without its SP figure:
//
//   0  miss  x0.00  ->   0 SP       3  3/4  x0.75  ->  40 SP
//   1  1/2   x0.50  ->  20 SP       4  1    x1.00  ->  50 SP (critical hit)
//   2  2/3   x0.67  ->  30 SP
//
// The server stays the authority: a credit spends the event's own spGained
// whenever it carries one, and the state's sp totals settle any drift.
const SP_MULTIPLIERS = [0, 1 / 2, 2 / 3, 3 / 4, 1];
const SP_LADDER      = [0, 20, 30, 40, 50];
const SP_DECIMALS    = 2;      // every multiplier is shown fixed to 2 places
const SP_PIP_R       = 6;
const SP_PIP_GAP     = 30;
const SP_PIP_INSET   = 210;    // where the ladder starts, in from the slab edge

const SP_PANEL_W = 1080;       // matched to the header, so the two slabs stack
const SP_PANEL_H = 80;
const SP_PANEL_Y = 238;        // between the header's underside and the arena

// --- arena ------------------------------------------------------------------
// The two cards stand far apart, because the gap between them is the stage the
// attacks are played on. CARD_GAP is centre to centre, which leaves roughly 680
// clear pixels between their facing edges for a lunge and its sparks.
const CARD_W    = 300;
const CARD_H    = 330;
const CARD_GAP  = 980;
const CARD_DROP = 20;          // below ARENA_CENTER_Y, clearing the SP panel

// The bench under the arena. A swap is a sub-move, so these cells stay live on
// either player's turn - see _buildDeckRow(). The shelf is sized to drop into
// the valley between the two arena cards rather than run under their corners.
const DECK_CELL_W   = 140;
const DECK_CELL_H   = 144;
const DECK_CELL_GAP = 18;
const DECK_PAD      = 14;
const DECK_ROW_Y    = 718;     // between the arena's footing and the controls

const ATTACK_REACH   = 150;    // how far a lunge carries toward the opponent
const CAST_BTN_W     = 260;    // HEAL, CLEANSE and the Affliction button, on the row under the base moves
const ATTACK_LAND_MS = 200;    // lunge time before contact - the hit's timing

// What a hit does to the card it lands on, per multiplier rung. The ladder is
// the one the SP panel reads, so the force of a blow and the points it pays out
// can never disagree: index 0 is a miss, index 4 a critical.
const HIT_FORCE = [
    { push:  0, shake:  0, sparks:  0, ms: 260 },   // x0.00  miss
    { push: 14, shake:  4, sparks:  7, ms: 300 },   // x0.50
    { push: 22, shake:  7, sparks: 11, ms: 340 },   // x0.67
    { push: 30, shake: 10, sparks: 15, ms: 380 },   // x0.75
    { push: 46, shake: 20, sparks: 26, ms: 520 },   // x1.00  critical hit
];

// Category colours, matching the find-match panels so a card keeps its identity
// from the loadout screen into the arena.
const CATEGORY = {
    Supra: { accent: 0xff6b6b, hex: '#ff8f8f', label: 'SUPRA' },
    Fere:  { accent: 0xffd93d, hex: '#ffe27a', label: 'FERE'  },
    Bonum: { accent: 0x5eead4, hex: '#5eead4', label: 'BONUM' },
};

// Initiator art, keyed by card.name exactly as FindMatchScene keys it, so a
// texture either scene loaded serves both. Only three of the ten cards have
// art; the rest fall back to a monogram disc.
const DECK_ART = {
    'Tobo The Fighter':            'assets/characterImages/tobo_the_fighter_con_1_Re.png',
    'Spunky With The Funky Draco': 'assets/characterImages/spunky_with_the_funky_draco_con_1_Re.png',
    'Allybelle':                   'assets/characterImages/allybelle_con_1_Re.png',
};

const ARENA_CENTER_Y = 0.40;   // must track the value _buildArena() lays out on

// --- singularity cards ------------------------------------------------------
// The station under the player's card. It is the one panel that belongs to
// neither player's accent - violet glass with a gold hairline - so it reads as
// the special instrument on the board rather than another readout.
//
// It sits bottom-left because that is the only room big enough for it: the
// middle of the stage is the attack lane and the deck shelf holds the centre
// below it. SC_PANEL_X keeps its right edge clear of the shelf's bloom.
const SC_ACCENT     = 0xb57bff;
const SC_ACCENT_HEX = '#d9c2ff';
const SC_GOLD       = 0xffd98a;
const SC_GOLD_HEX   = '#ffe3a8';
const SC_DIM_HEX    = '#5d5480';

// Attributes whose cards are armed in their slot and played by a button,
// rather than played straight from the slot.
const ARMED_ATTRIBUTES = ['attack', 'defence', 'healing', 'affliction', 'cleanse'];

const SC_SLOTS    = 3;
const SC_PANEL_W  = 540;
const SC_PANEL_H  = 330;
const SC_PANEL_X  = 340;
const SC_PANEL_Y  = 850;       // top edge sits just under the player card's footing
const SC_SLOT_W   = 136;
const SC_SLOT_H   = 176;
const SC_SLOT_GAP = 22;
const SC_SLOT_Y   = -8;
const SC_BUY_W    = SC_SLOTS * SC_SLOT_W + (SC_SLOTS - 1) * SC_SLOT_GAP;
const SC_BUY_H    = 46;
const SC_BUY_Y    = 124;
const SC_TIP_W    = 270;

// The store overlay BUY opens - every card, two rows.
const SC_SHOP_W        = 1100;
const SC_SHOP_H        = 660;
const SC_SHOP_CARD_W   = 152;
const SC_SHOP_CARD_H   = 236;
const SC_SHOP_GAP      = 18;
const SC_SHOP_PER_ROW  = 6;

// --- pattern bonus ----------------------------------------------------------
// The Pattern Bonus Meter. It has its own colour - a smoked ice blue - so it
// reads as a third instrument beside the teal/crimson sides and the violet
// card station. Each meter stands on the outside edge of the stage next to the
// card it belongs to, because that edge is where Pattern Bonus Mode's wave
// rolls in from.
//
// The server owns every number: it builds the chains, scores them against the
// BattleEngine's pattern tables and says when a mode starts and ends. The
// meter only animates toward what the state and the events report.
const PB_BLUE      = 0x4fb4ff;
const PB_BLUE_HEX  = '#7cc8ff';
const PB_DEEP      = 0x1d4fd6;
const PB_ICE       = 0xd6eeff;
const PB_ICE_HEX   = '#e2f3ff';
const PB_BONUS_HEX = '#56b8ff';     // bonus SP, wherever it is shown

const PB_PANEL_W     = 176;
const PB_PANEL_H     = 468;
const PB_PANEL_INSET = 150;         // panel centre, in from its screen edge
const PB_PANEL_Y     = 440;         // bottom edge clears the card station
const PB_TUBE_W      = 50;
const PB_TUBE_H      = 250;
const PB_TUBE_Y      = -44;         // tube centre, inside the panel
const PB_TUBE_INSET  = 6;
const PB_CHIP_R      = 17;
const PB_CHIP_GAP    = 48;
const PB_CHIP_Y      = 186;
const PB_TRACKER_Y   = 652;         // the PBM tracker hangs under each card

const PB_DEFAULT_MAX     = 120;     // RULES.PBM_THRESHOLD - the state overrides it
const PB_DEFAULT_ATTACKS = 6;       // RULES.PBM_ATTACKS

const PB_START_DELAY_MS = 650;      // lets the hit that tipped the meter land first
const PB_END_DELAY_MS   = 900;      // lets the last PBM attack land first

const PB_MOVES = {
    swap:   { glyph: 'S', label: 'SWAP',   color: 0x6fd3ff, hex: '#9be4ff' },
    attack: { glyph: 'A', label: 'ATTACK', color: 0xff7a8a, hex: '#ff9fab' },
    defend: { glyph: 'D', label: 'DEFEND', color: 0xffd35c, hex: '#ffe08a' },
};

const PB_SMOKE_TINTS = [0x1b3fa8, 0x2c67e8, 0x4fa6ff, 0x7cc8ff];
const PB_GLASS_TINTS = [PB_ICE, 0xa8d8ff, 0xffffff, PB_BLUE];

const SC_BY_ID    = Object.fromEntries(SINGULARITY_CARDS.map(c => [c.id, c]));
const SC_MIN_COST = Math.min(...STORE_CARDS.map(c => c.cost));

/** 0xb57bff -> '#b57bff', for Text colours. */
const hexOf = (n) => '#' + n.toString(16).padStart(6, '0');

/** The card descriptions are template literals with source indentation in them. */
const cleanDesc = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export default class MultiplayerBattleScene extends Phaser.Scene {
    constructor(){
        super('MultiplayerBattleScene');
    }

    preload(){
        // Phaser keeps one instance of a Scene and re-runs preload on every
        // start, so re-registering the same key would only log a cache warning.
        if (!this.cache.video.exists(VIDEO_KEY)){
            this.load.video(VIDEO_KEY, VIDEO_SRC, true);   // noAudio: lets it autoplay
        }

        Object.entries(DECK_ART).forEach(([key, path]) => {
            if (!this.textures.exists(key)) this.load.image(key, path);
        });

        SingularityCardAnimations.preload(this);
    }

    init(d){
        this.data_    = d || {};
        this.state    = d?.state || null;
        this.rules    = d?.rules || { turnMs: 30000, swapsPerTurn: 1 };
        this.busy     = false;      // an action is in flight
        this.finished = false;
        this.logLines = [];

        // The scene renders while preload() is still fetching, and with nothing
        // drawn yet the canvas shows the game's grey clear colour. Paint the
        // camera black so the load reads as a continuation of FindMatchScene's
        // fade-out; create() fades up from it.
        this.cameras.main.setBackgroundColor(0x000000);

        // Backdrop state. Cleared here and not in create(), because the Scene
        // instance is reused between matches and these would otherwise carry
        // over - a stale _videoFitted would leave the next match's plate
        // sitting unscaled in the corner.
        this.bgVideo        = null;
        this.staticBackdrop = null;
        this._videoFitted   = false;

        // Singularity point objects and properties. A is the player on this
        // client (the header's left, teal half), B the opponent (right,
        // crimson) - the panel reads the batch, it never keeps its own total.
        // A swap in flight. Base moves use `busy`; a sub-move needs its own flag
        // because the two are not mutually exclusive any more.
        this.swapBusy = false;

        this.singularityPointBatch = {
            playerAPts: 0,
            playerBPts: 0,
        }

        // Singularity card station. singularityHand is this client's copy of
        // the three slots, used until the server's state carries its own
        // (you.singularityCards) - see _singularityHand().
        this.singularityHand = new Array(SC_SLOTS).fill(null);
        this.singularityFx   = null;
        this.scBusy          = false;   // a buy or a play in flight
        this.scLanded        = false;   // the panel has finished its entrance
        this.scShop          = null;    // the open store overlay, if any
        this.scBankShown     = 0;
        this.scBankTarget    = 0;
        this.scBankTween     = null;
        this.scArmed         = null;    // slot index of the Attack card ATTACK will fire
        this.scGuard         = null;    // slot index of the Defence card DEFEND will raise
        this.scMend          = null;    // slot index of the Healing card HEAL will play
        this.scHex           = null;    // slot index of the Affliction card its button will cast
        this.scCleanse       = null;    // slot index of the Cleanse card CLEANSE will play

        // Event batches play one after another. Most finish the instant they
        // are narrated; a Singularity attack holds the board for its cinematic,
        // and anything arriving meanwhile waits its turn - see _playBatch().
        this.eventChain  = Promise.resolve();
        this.sequencing  = false;

        // Pattern Bonus: one view per side, plus the two layers the mode's
        // aura is drawn on - see _buildPatternLayers().
        this.pbViews    = null;
        this.pbUnderlay = null;
        this.pbOverlay  = null;
    }

    create(){
        const { width, height } = this.cameras.main;
        this.add.rectangle(0, 0, width, height, 0x0b0b18).setOrigin(0);

        this._buildBackground();
        this._buildPatternLayers();

        this.singularityFx = new SingularityCardAnimations(this);

        this._buildHeader(width);
        this._singularityPointPanel();
        this._patternBonusPanel();
        this._buildArena(width, height);
        this._buildDeckRow(width, height);
        this._buildSingularityCardPanel(); 
        this._buildControls(width, height);
        this._buildLog(width, height);

        this._bindNet();

        // The scene may have been handed a state already; if not (a reload, or a
        // dropped begin payload) ask the server for the board.
        if (this.state) this._render();
        else            this._resync();

        this.cameras.main.fadeIn(300, 0, 0, 0);
    }

    // ------------------------------------------------------------ networking --

    _bindNet(){
        this._onEvents   = (p) => this._applyEvents(p);
        this._onOver     = (p) => this._applyOver(p);
        this._onRejoined = (p) => { if (p?.state) { this.state = p.state; this._render(); } };
        this._onOppLeft  = () => this._log('Opponent disconnected - waiting...');
        this._onOppBack  = () => this._log('Opponent reconnected.');
        this._onAborted  = () => this._bail('Match aborted');
        this._onDropped  = () => this._log('Connection lost - reconnecting...');

        Net.on('battle:events', this._onEvents);
        Net.on('match:over', this._onOver);
        Net.on('match:rejoined', this._onRejoined);
        Net.on('match:opponent_disconnected', this._onOppLeft);
        Net.on('match:opponent_reconnected', this._onOppBack);
        Net.on('match:aborted', this._onAborted);
        Net.on('net:disconnect', this._onDropped);

        this.events.once('shutdown', () => {
            Net.off('battle:events', this._onEvents);
            Net.off('match:over', this._onOver);
            Net.off('match:rejoined', this._onRejoined);
            Net.off('match:opponent_disconnected', this._onOppLeft);
            Net.off('match:opponent_reconnected', this._onOppBack);
            Net.off('match:aborted', this._onAborted);
            Net.off('net:disconnect', this._onDropped);
        });
    }

    async _resync(){
        const res = await Net.fetchBattleState();
        if (!this.scene.isActive()) return;

        if (!res.ok) return this._bail(res.error);

        this.state = res.state;
        this._render();
    }

    /** Queue the server's event batch behind whatever is still playing. */
    _applyEvents(payload){
        // Flagged now, not when the batch plays: the attack's ack lands right
        // behind its events and must not jump the board ahead of the cinematic.
        if (this._singularityStrikeOf(payload?.events) || this._singularityFieldOf(payload?.events)
            || this._singularityMendOf(payload?.events) || this._singularityHexOf(payload?.events)
            || this._singularityCleanseOf(payload?.events)){
            this.sequencing = true;
        }

        this._enqueue(() => this._playBatch(payload));
    }

    _applyOver(payload){
        this._enqueue(() => {
            const { result, state } = payload ?? {};

            if (state) this.state = state;
            this.finished = true;
            this._closeSingularityShop(true);
            this._render();
            this._showResult(result);
        });
    }

    _enqueue(job){
        this.eventChain = this.eventChain
            .then(() => (this.scene.isActive() ? job() : null))
            .catch(err => console.error('[battle] event playback failed', err));
    }

    /** Narrate a batch, then snap to the state it produced. */
    _playBatch({ events = [], state }){
        if (this._singularityStrikeOf(events)) return this._playSingularitySequence(events, state);
        if (this._singularityFieldOf(events))  return this._playSingularityField(events, state);
        if (this._singularityMendOf(events))   return this._playSingularityMend(events, state);
        if (this._singularityHexOf(events))    return this._playSingularityHex(events, state);
        if (this._singularityCleanseOf(events)) return this._playSingularityCleanse(events, state);

        for (const ev of events) this._narrate(ev);
        this._settleBatch(state);
    }

    _settleBatch(state){
        if (state) this.state = state;
        this.busy = false;
        this._render();
    }

    // ----------------------------------------------------------------- intent --

    async _send(fn){
        if (this.busy || this.finished || !this._isMyTurn()) return;

        this.busy = true;
        this._setControlsEnabled(false);

        const res = await fn();
        if (!this.scene.isActive()) return;

        if (!res.ok)
        {
            // The server refused it - unlock and say why rather than leaving the
            // player staring at dead buttons.
            this.busy = false;
            this._log(res.error);
            this._render();
            return;
        }

        // On success the authoritative update arrives on 'battle:events', which is
        // what clears busy. A swap does not end the turn, so its ack re-enables.
        // While a Singularity attack is playing, the sequence owns the board and
        // hands it the same state when the last strike has landed.
        if (this.sequencing) return;

        if (res.state) this.state = res.state;
        this.busy = false;
        this._render();
    }

    /** Swaps take their own door. _send() holds an action to the turn because a
     *  base move is held to it; a sub-move is not. The only guard here is one
     *  swap in flight at a time, so a double click cannot spend the budget
     *  twice - the server would reject the second, but the board should not ask.
     */
    async _sendSwap(cardId){
        if (this.finished || this.swapBusy) return;

        this.swapBusy = true;
        this._render();

        const res = await Net.swapCard(cardId);
        if (!this.scene.isActive()) return;

        this.swapBusy = false;

        if (!res.ok)
        {
            this._log(res.error);
            this._render();
            return;
        }

        // The authoritative board also arrives on 'battle:events' for both
        // players; this just stops the cell sitting dead until it does.
        if (res.state) this.state = res.state;
        this._render();
    }

    _isMyTurn(){
        return !!this.state?.turn?.yours && this.state.status === 'active';
    }

    // ------------------------------------------------------------------- view --

    // ================================================================ backdrop --
    // The arena backdrop is built in four passes, bottom to top:
    //
    //   1. _buildBackdropVideo  the looping MP4 plate, cover-fit and drifting
    //   2. _buildAtmosphere     haze pools, scrim and vignette over the plate
    //   3. _buildArenaStage     corner lighting, floor glow and the VS seam
    //   4. _buildAmbientFx      scan grid, sweep band, embers and scanlines
    //
    // Nothing here sets a depth. _buildBackground() runs first in create(), so
    // insertion order alone keeps every layer under the HUD - the same way the
    // hub and matchmaking screens are put together.
    _buildBackground(){
        const { width, height } = this.scale;

        this._buildBackdropVideo(width, height);
        this._buildAtmosphere(width, height);
        this._buildArenaStage(width, height);
        this._buildAmbientFx(width, height);

        // Stop the element on the way out. Phaser destroys the Game Object for
        // us, but a still-decoding <video> left behind burns a core on the way
        // back to the hub.
        this.events.once('shutdown', () => {
            this.bgVideo?.stop();
            this.bgVideo = null;
        });
    }

    // _buildBackdropVideo(): The key art plate. It is muted (so the browser will
    // autoplay it) and natively looping, with a VIDEO_COMPLETE catch in case the
    // encoding will not seam - either way it never stops.
    _buildBackdropVideo(width, height){
        const video = this.add.video(width * 0.5, height * VIDEO_ANCHOR_Y, VIDEO_KEY);
        video.setOrigin(0.5).setAlpha(0);   // faded up once the first frame lands

        this.bgVideo = video;

        video.setMute(true);
        video.setLoop(true);

        // The texture only exists once a frame has been decoded, and Phaser sizes
        // the object to that frame immediately afterwards - so fit on the next
        // tick rather than fighting it in the handler.
        video.on('textureready', () => {
            this.time.delayedCall(0, () => this._fitBackdropVideo(width, height));
        });

        // Native loop=true handles the normal case; this is the belt and braces
        // for a browser that fires 'complete' anyway.
        video.on('complete', () => {
            if (!this.bgVideo) return;
            this.bgVideo.setLoop(true);
            this.bgVideo.play(true);
        });

        // Autoplay refused (NotAllowedError). Muted video is almost never
        // blocked, but if it is, the first tap in the scene starts it.
        video.on('locked', () => {
            this.input.once('pointerdown', () => {
                this.bgVideo?.setMute(true);
                this.bgVideo?.play(true);
            });
        });

        // A missing or undecodable file must not leave the match on a black
        // screen - deepen the painted layers instead and carry on.
        const fallback = () => this._useStaticBackdrop();
        video.on('error', fallback);
        video.on('unsupported', fallback);

        video.play(true);
    }

    // _fitBackdropVideo(): Cover-fit the plate, then hand it a pair of very slow
    // opposed tweens - a breathing push-in and a lateral drift - so the loop
    // never lands on the same framing twice and its seam is hard to spot.
    _fitBackdropVideo(width, height, attempt = 0){
        const video = this.bgVideo;
        if (!video || this._videoFitted) return;

        // Scale multiplies the Game Object's own width, so that - not the
        // element's videoWidth - has to be the basis for the cover maths.
        const vw = video.width  || 0;
        const vh = video.height || 0;

        // Phaser sizes the object from the first decoded frame. If that has not
        // landed yet, come back for it rather than dividing by zero. The cap
        // stops a video that never decodes from retrying for the whole match.
        if (!vw || !vh){
            if (attempt < VIDEO_FIT_RETRIES){
                this.time.delayedCall(80, () => this._fitBackdropVideo(width, height, attempt + 1));
            } else {
                this._useStaticBackdrop();
            }
            return;
        }

        this._videoFitted = true;

        // OVERSCAN buys the drift and push-in room to move without ever
        // exposing an edge of the plate.
        const cover = Math.max(width / vw, height / vh) * VIDEO_OVERSCAN;
        video.setScale(cover);

        const base = cover;
        const x0   = video.x;

        this.tweens.add({
            targets:  video,
            alpha:    VIDEO_ALPHA,
            duration: 1600,
            ease:     'Sine.easeOut',
        });

        this.tweens.add({
            targets:  video,
            scale:    base * 1.07,
            duration: 24000,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Deliberately not a multiple of the zoom period - the two drift in and
        // out of phase, which is what keeps it from reading as a loop.
        this.tweens.add({
            targets:  video,
            x:        x0 + width * 0.018,
            duration: 17000,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // _useStaticBackdrop(): The no-video path. Drops the dead plate and lays in
    // a painted gradient so every layer above it still has something to sit on.
    _useStaticBackdrop(){
        this.bgVideo?.destroy();
        this.bgVideo = null;

        if (this.staticBackdrop) return;

        const { width, height } = this.scale;

        const g = this.add.graphics();
        g.fillGradientStyle(0x14243a, 0x1c1430, 0x070b14, 0x0b0710, 1, 1, 1, 1);
        g.fillRect(0, 0, width, height);

        this.staticBackdrop = g;
    }

    // _buildAtmosphere(): The grade over the plate. Two opposed haze pools tint
    // the corners toward each player's accent, then a flat scrim and a vignette
    // push the whole thing back so the HUD reads cleanly on top of it.
    _buildAtmosphere(width, height){
        // Opponent's crimson wash up top, the player's teal below - the same
        // pairing the arena slots and the deck row use.
        const oppHaze = this.add.ellipse(width * 0.22, height * 0.14, width * 0.70, height * 0.46, OPP_ACCENT, 0.10);
        const youHaze = this.add.ellipse(width * 0.80, height * 0.86, width * 0.70, height * 0.52, YOU_ACCENT, 0.09);

        // Counter-phased so the room looks lit by something alive.
        this.tweens.add({
            targets: oppHaze, alpha: 0.19, scaleX: 1.08, scaleY: 1.05,
            duration: 6400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.tweens.add({
            targets: youHaze, alpha: 0.17, scaleX: 1.08, scaleY: 1.05,
            duration: 6400, yoyo: true, repeat: -1, delay: 3200, ease: 'Sine.easeInOut',
        });

        // Flat scrim - the single layer doing most of the work for legibility.
        const scrim = this.add.graphics();
        scrim.fillStyle(0x060912, 0.46);
        scrim.fillRect(0, 0, width, height);

        // Vignette. Heavier at the bottom, where the deck row and log sit.
        const vTop = this.add.graphics();
        vTop.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.72, 0.72, 0, 0);
        vTop.fillRect(0, 0, width, height * 0.26);

        const vBottom = this.add.graphics();
        vBottom.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.80, 0.80);
        vBottom.fillRect(0, height * 0.70, width, height * 0.30);

        const vLeft = this.add.graphics();
        vLeft.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0, 0.55, 0);
        vLeft.fillRect(0, 0, width * 0.16, height);

        const vRight = this.add.graphics();
        vRight.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.55, 0, 0.55);
        vRight.fillRect(width * 0.84, 0, width * 0.16, height);
    }

    // _buildArenaStage(): The stage dressing proper - corner spotlights in each
    // player's colour, a lit floor under the slots, the seam where the two sides
    // meet, and a VS glyph sunk far enough back to read as architecture.
    _buildArenaStage(width, height){
        const cy = Math.round(height * ARENA_CENTER_Y);

        this._drawLightShafts(width, height);

        // Floor pool under the arena - the "both fighters are standing here"
        // light. Two ellipses so the core is brighter than the falloff.
        const floorWide = this.add.ellipse(width * 0.5, cy + 150, width * 0.78, height * 0.26, 0x7fd8ff, 0.05);
        const floorCore = this.add.ellipse(width * 0.5, cy + 150, width * 0.44, height * 0.15, 0xbfeaff, 0.05);

        this.tweens.add({
            targets: [floorWide, floorCore], scaleX: 1.06, scaleY: 1.12, alpha: '+=0.035',
            duration: 3800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        this._drawVersusMark(width, cy);
        this._drawArenaSeam(width, cy);
    }

    // _drawLightShafts(): Four house lights raking the arena, teal down the
    // player's side and crimson down the opponent's, each on its own slow sway.
    // They follow the halves the cards stand on rather than the corners. Thin
    // triangles rather than a gradient fill, which keeps them cheap and lets
    // every shaft carry an independent tween.
    _drawLightShafts(width, height){
        const SHAFTS = [
            { x: width * 0.06, y: -80,          spread: 340, reach: height * 1.10, color: YOU_ACCENT, tilt:  0.05 },
            { x: width * 0.94, y: -80,          spread: 340, reach: height * 1.10, color: OPP_ACCENT, tilt: -0.05 },
            { x: width * 0.10, y: height + 80,  spread: 300, reach: -height * 0.95, color: YOU_ACCENT, tilt: -0.04 },
            { x: width * 0.90, y: height + 80,  spread: 300, reach: -height * 0.95, color: OPP_ACCENT, tilt:  0.04 },
        ];

        SHAFTS.forEach((s, i) => {
            // Two triangles per shaft - a wide, barely-there spill with a
            // narrower, brighter core inside it. A single triangle reads as a
            // flat panel over the plate; the pair fakes a falloff at the edges.
            const halo = this.add.triangle(
                s.x, s.y,
                0, 0,
                -s.spread / 2, s.reach,
                 s.spread / 2, s.reach,
                s.color, 0.028,
            ).setOrigin(0, 0);

            const core = this.add.triangle(
                s.x, s.y,
                0, 0,
                -s.spread / 5, s.reach,
                 s.spread / 5, s.reach,
                s.color, 0.045,
            ).setOrigin(0, 0);

            halo.rotation = core.rotation = s.tilt;

            // Sway and breathe. Staggered delays stop the four from pulsing as
            // one block, which would read as a flicker rather than as lighting.
            this.tweens.add({
                targets:  [halo, core],
                rotation: s.tilt * -1,
                duration: 9000 + i * 1400,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });

            this.tweens.add({
                targets:  [halo, core],
                alpha:    '+=0.03',
                duration: 4200 + i * 900,
                yoyo:     true,
                repeat:   -1,
                delay:    i * 700,
                ease:     'Sine.easeInOut',
            });
        });
    }

    // _drawVersusMark(): An oversized VS behind the slots. It sits at a few
    // percent alpha - present as structure, never as something you read.
    _drawVersusMark(width, cy){
        // Sized to run well past the 460px card slots on either side - at the
        // slots' own width the glyph sits entirely behind them and may as well
        // not be there.
        const vs = this.add.text(width * 0.5, cy + 8, 'VS', {
            fontFamily:      'monospace',
            fontSize:        '560px',
            color:           '#ffffff',
            stroke:          '#000000',
            strokeThickness: 14,
        }).setOrigin(0.5).setAlpha(0.05);

        this.tweens.add({
            targets: vs, alpha: 0.10, scale: 1.03,
            duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
    }

    // _drawArenaSeam(): The dividing line between the two halves of the board.
    // The halves are left and right now, so the seam stands upright between the
    // two cards: teal down the player's edge, crimson down the opponent's, and a
    // hot sliver falling through it on a loop to keep the centre of the stage
    // alive while nobody is attacking.
    _drawArenaSeam(width, cy){
        const seamX  = width * 0.5;
        const reach  = 420;                 // how far the seam runs either way
        const top    = cy - reach;
        const bottom = cy + reach;

        const glow = this.add.rectangle(seamX, cy, 26, reach * 1.9, 0xffffff, 0.035);

        const edgeLeft  = this.add.rectangle(seamX - 2, cy, 2, reach * 1.8, YOU_ACCENT, 0.32);
        const edgeRight = this.add.rectangle(seamX + 2, cy, 2, reach * 1.8, OPP_ACCENT, 0.32);

        this.tweens.add({
            targets: [edgeLeft, edgeRight], alpha: 0.6, scaleY: 1.02,
            duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        this.tweens.add({
            targets: glow, alpha: 0.09,
            duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        // The runner. Starts above the seam, falls through it, waits, repeats.
        const runner = this.add.rectangle(seamX, top, 3, 190, 0xffffff, 0.55);

        this.tweens.add({
            targets:     runner,
            y:           bottom,
            duration:    2600,
            repeat:      -1,
            repeatDelay: 3200,
            ease:        'Cubic.easeInOut',
        });

        this.tweens.add({
            targets:     runner,
            alpha:       0,
            duration:    2600,
            repeat:      -1,
            repeatDelay: 3200,
            ease:        'Quad.easeIn',
        });
    }

    // _buildAmbientFx(): The top coat - grid, sweep, embers and scanlines. All
    // of it is low-alpha texture; pull it and the scene still works, which is
    // the test for anything at this layer.
    _buildAmbientFx(width, height){
        this._drawScanGrid(width, height);
        this._drawEmbers(width, height);
        this._drawScanlines(width, height);
    }

    // _drawScanGrid(): Hairline lattice with a broad band sweeping down it, the
    // same device the matchmaking screen uses - it ties the two scenes together.
    _drawScanGrid(width, height){
        const grid = this.add.graphics().setAlpha(0.12);
        grid.lineStyle(1, YOU_ACCENT, 0.18);

        for (let x = 0; x <= width; x += 120){
            grid.beginPath(); grid.moveTo(x, 0); grid.lineTo(x, height); grid.strokePath();
        }
        for (let y = 0; y <= height; y += 120){
            grid.beginPath(); grid.moveTo(0, y); grid.lineTo(width, y); grid.strokePath();
        }

        const band = this.add.rectangle(width / 2, -90, width, 180, YOU_ACCENT, 0.04).setOrigin(0.5);

        this.tweens.add({
            targets:     band,
            y:           height + 90,
            duration:    8000,
            repeat:      -1,
            repeatDelay: 3400,
            ease:        'Sine.easeInOut',
        });
    }

    // _drawEmbers(): Soft bokeh plus fine rising sparks, carried over from the
    // hub so the whole multiplayer flow shares one particle vocabulary. Each
    // one gets its own delay and duration - a shared clock would look mechanical.
    _drawEmbers(width, height){
        for (let i = 0; i < 10; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, height);
            const r     = Phaser.Math.Between(26, 62);
            const color = Math.random() > 0.5 ? OPP_ACCENT : 0xffb199;
            const glow  = this.add.circle(x, y, r, color, Phaser.Math.FloatBetween(0.025, 0.06));

            this.tweens.add({
                targets:  glow,
                y:        y - Phaser.Math.Between(60, 160),
                alpha:    0,
                duration: Phaser.Math.Between(7000, 12000),
                repeat:   -1,
                delay:    Phaser.Math.Between(0, 6000),
                ease:     'Sine.easeInOut',
            });
        }

        for (let i = 0; i < 26; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, height);
            const color = Math.random() > 0.45 ? YOU_ACCENT : 0xffd9c2;
            const spark = this.add.circle(x, y, Phaser.Math.Between(1, 3), color, Phaser.Math.FloatBetween(0.3, 0.7));

            this.tweens.add({
                targets:  spark,
                y:        y - Phaser.Math.Between(120, 300),
                x:        x + Phaser.Math.Between(-40, 40),
                alpha:    0,
                duration: Phaser.Math.Between(4000, 9000),
                repeat:   -1,
                delay:    Phaser.Math.Between(0, 5000),
                ease:     'Power1',
            });
        }
    }

    // _drawScanlines(): One static graphics layer of hairlines, drifting by
    // exactly its own line spacing on a loop - so it reads as a rolling CRT
    // signal while never actually leaving its start position.
    _drawScanlines(width, height){
        const SPACING = 4;

        const lines = this.add.graphics();
        lines.fillStyle(0x000000, 0.16);

        for (let y = -SPACING; y < height + SPACING; y += SPACING){
            lines.fillRect(0, y, width, 1);
        }

        this.tweens.add({
            targets:  lines,
            y:        SPACING,
            duration: 4200,
            repeat:   -1,
            ease:     'Linear',
        });
    }


    // --------------------------------------------------------------- header --
    // The PvP bar: a glass slab carrying both players' names, ranks and ELO
    // either side of a VS mark, with the turn banner and clock down the middle.
    //
    // Layout is built around the container's own centre, so _dropInHeader() can
    // fly the whole assembly in from above the camera with one tween. Children
    // that animate separately (each nameplate, the VS mark) get their own
    // sub-container, because a container's alpha multiplies into its children -
    // that keeps a faded label faded while the group it sits in fades up.
    //
    // turnText and clockText stay on the scene under their existing names: the
    // render pass and update() write to them every frame and neither cares that
    // they now live inside the bar.
    _buildHeader(width){
        const w = Math.min(HEADER_MAX_W, width - 140);
        const h = HEADER_H;

        const bar = this.add.container(width / 2, -h).setAlpha(0);
        this.headerLayer = bar;

        this.headerFlash = this._drawGlassSlab(bar, w, h);
        this._drawMatchTab(bar, h);

        this.youPlate = this._drawNameplate(bar, w, -1, 'YOU',
            this.data_.you, 'You', YOU_ACCENT, YOU_ACCENT_HEX);
        this.oppPlate = this._drawNameplate(bar, w, +1, 'OPPONENT',
            this.data_.opponent, 'Opponent', OPP_ACCENT, OPP_ACCENT_HEX);

        this.vsEmblem = this._drawVsEmblem(bar);

        this.turnText = this.add.text(0, 26, '', {
            fontFamily: 'monospace', fontSize: '19px', color: '#00ffcc',
            stroke: '#04121a', strokeThickness: 3,
        }).setOrigin(0.5);

        this.clockText = this.add.text(0, 52, '', {
            fontFamily: 'monospace', fontSize: '14px', color: '#888899',
        }).setOrigin(0.5);

        bar.add([this.turnText, this.clockText]);

        this._dropInHeader(bar, w, h);
    }

    // _drawGlassSlab(): The slab both HUD panels are built on - outer bloom,
    // smoked body, inner highlight, a double hairline border and corner
    // brackets. Same frame language as the find-match panels, flattened into a
    // bar and lit by the two stage accents.
    //
    // Returns the additive flash rect laid over the glass, which is invisible
    // until the panel's own code lights it.
    _drawGlassSlab(bar, w, h){
        const bloom = this.add.rectangle(0, 0, w + 26, h + 22, 0x8fd8ff, 0.05).setAlpha(0.45);
        const body  = this.add.rectangle(0, 0, w, h, 0x070c12, 0.62);

        // Each half washed in its own accent, so the bar agrees with the arena
        // lighting: teal below for the player, crimson above for the opponent.
        const youWash = this.add.rectangle(-w / 4, 0, w / 2 - 8, h - 14, YOU_ACCENT, 0.05);
        const oppWash = this.add.rectangle( w / 4, 0, w / 2 - 8, h - 14, OPP_ACCENT, 0.05);

        const inner = this.add.ellipse(0, 6, w * 0.82, h * 0.86, 0x14232b, 0.28);
        const sheen = this.add.rectangle(0, -h / 2 + 9, w - 28, 12, 0xaaffee, 0.07);

        const border = this.add.graphics();
        border.lineStyle(2, 0x9fe8ff, 0.30);
        border.strokeRect(-w / 2, -h / 2, w, h);
        border.lineStyle(1, 0xffffff, 0.10);
        border.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);

        // Two ticks on the centre line - the seam the halves meet on, kept out
        // of the middle so it never runs through the turn banner.
        const seam = this.add.graphics();
        seam.lineStyle(1, 0xffffff, 0.14);
        [[-h / 2 + 10, -h / 2 + 28], [h / 2 - 28, h / 2 - 10]].forEach(([y1, y2]) => {
            seam.beginPath();
            seam.moveTo(0, y1);
            seam.lineTo(0, y2);
            seam.strokePath();
        });

        const corners = this.add.graphics();
        const cLen = 18;
        [
            [-w / 2, -h / 2,  1,  1, YOU_ACCENT],
            [-w / 2,  h / 2,  1, -1, YOU_ACCENT],
            [ w / 2, -h / 2, -1,  1, OPP_ACCENT],
            [ w / 2,  h / 2, -1, -1, OPP_ACCENT],
        ].forEach(([x, y, hd, vd, accent]) => {
            corners.lineStyle(3, accent, 0.95);
            corners.beginPath();
            corners.moveTo(x + hd * cLen, y);
            corners.lineTo(x, y);
            corners.lineTo(x, y + vd * cLen);
            corners.strokePath();
            corners.fillStyle(accent, 1);
            corners.fillCircle(x, y, 3.5);
        });

        // A narrow highlight crossing the glass on a long cycle. Its travel ends
        // well inside the border, so the bar needs no mask to contain it, and it
        // rests at zero alpha so it is never parked on the glass as a block.
        //
        // Three bands of falling width stand in for a gradient, which a
        // rectangle cannot carry: hard edges at this size read as a grey slab
        // sliding over the panel rather than light moving through it.
        const glint = this.add.container(-w / 2 + 44, 0).setAlpha(0);
        [[86, 0.02], [54, 0.025], [24, 0.03]].forEach(([bw, a]) => {
            glint.add(this.add.rectangle(0, 0, bw, h - 16, 0xffffff, a)
                .setBlendMode(Phaser.BlendModes.ADD));
        });

        const flash = this.add.rectangle(0, 0, w, h, 0xffffff, 0.30).setAlpha(0);

        bar.add([bloom, body, youWash, oppWash, inner, sheen, seam, glint,
                 border, corners, flash]);

        this.tweens.add({
            targets:  bloom,
            alpha:    0.9,
            scaleX:   1.012,
            scaleY:   1.05,
            duration: 2400,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Both halves of the sweep share a 2600ms pass and a 2800ms rest, so the
        // fade stays locked to the travel without a timeline to hold them.
        this.tweens.add({
            targets:     glint,
            x:           w / 2 - 44,
            duration:    2600,
            repeat:      -1,
            repeatDelay: 2800,
            ease:        'Sine.easeInOut',
        });

        this.tweens.add({
            targets:     glint,
            alpha:       { from: 0, to: 1 },
            duration:    1300,
            yoyo:        true,
            repeat:      -1,
            repeatDelay: 2800,
            ease:        'Sine.easeInOut',
        });

        return flash;
    }

    // _drawMatchTab(): The match id, hung off the bar's top edge as a tab so it
    // labels the slab instead of adding another line of HUD text inside it.
    _drawMatchTab(bar, h){
        const id    = String(this.data_.matchId ?? '').slice(-8) || '----';
        const label = this.add.text(0, -h / 2, `MATCH ${id}`.toUpperCase(), {
            fontFamily: 'monospace', fontSize: '11px', color: '#7f97a8',
        }).setOrigin(0.5);

        const tabW = label.width + 28;
        const tab  = this.add.graphics();
        tab.fillStyle(0x07121a, 0.92);
        tab.fillRoundedRect(-tabW / 2, -h / 2 - 11, tabW, 22, 11);
        tab.lineStyle(1, 0x9fe8ff, 0.28);
        tab.strokeRoundedRect(-tabW / 2, -h / 2 - 11, tabW, 22, 11);

        bar.add([tab, label]);
    }

    // _drawNameplate(): One player's half - monogram disc, side label, name and a
    // rank chip carrying rank and ELO. `side` is -1 for the left (player) half
    // and +1 for the right (opponent) half, and the whole layout mirrors on it.
    //
    // Returns the sub-container, parked outboard and transparent; _headerImpact()
    // slides it home once the slab has landed.
    _drawNameplate(bar, w, side, label, profile, fallback, accent, accentHex){
        const name = String(profile?.name ?? fallback);
        const rank = String(profile?.rank ?? 'Unranked').toUpperCase();
        const elo  = Number.isFinite(profile?.elo) ? profile.elo : null;

        const hw      = w / 2;
        const discX   = side * (hw - 60);
        const textX   = side * (hw - 108);
        const originX = side < 0 ? 0 : 1;      // text grows away from the edge

        const plate = this.add.container(side * 34, 0).setAlpha(0);

        // Monogram disc - the first letter of the name over the side's accent.
        const disc = this.add.circle(discX, -8, 28, 0x081016, 0.9);

        const ring = this.add.graphics();
        ring.lineStyle(2, accent, 0.70);
        ring.strokeCircle(discX, -8, 28);
        ring.lineStyle(1, accent, 0.25);
        ring.strokeCircle(discX, -8, 34);

        const initial = this.add.text(discX, -8, name.charAt(0).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: accentHex,
        }).setOrigin(0.5);

        const side_ = this.add.text(textX, -46, label, {
            fontFamily: 'monospace', fontSize: '12px', color: accentHex,
        }).setOrigin(originX, 0.5).setAlpha(0.65);

        const nameText = this.add.text(textX, -14, this._clipName(name), {
            fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: '#f2f6f8',
            stroke: '#04121a', strokeThickness: 4,
        }).setOrigin(originX, 0.5);

        // Rank chip, drawn around the text's measured width - 'UNRANKED' and
        // 'BRONZE II · 1180' are nowhere near the same length.
        const chipText = this.add.text(textX, 26, elo == null ? rank : `${rank}  ·  ${elo}`, {
            fontFamily: 'monospace', fontSize: '13px', color: accentHex,
        }).setOrigin(originX, 0.5);

        const pad   = 12;
        const chipW = chipText.width + pad * 2;
        const chipX = side < 0 ? textX - pad : textX - chipText.width - pad;

        const chip = this.add.graphics();
        chip.fillStyle(accent, 0.10);
        chip.fillRoundedRect(chipX, 13, chipW, 26, 13);
        chip.lineStyle(1, accent, 0.45);
        chip.strokeRoundedRect(chipX, 13, chipW, 26, 13);

        plate.add([disc, ring, initial, side_, nameText, chip, chipText]);
        bar.add(plate);

        // The disc keeps a slow pulse of its own once everything has settled.
        this.tweens.add({
            targets:  ring,
            alpha:    0.45,
            duration: 2200,
            yoyo:     true,
            repeat:   -1,
            delay:    side < 0 ? 0 : 400,
            ease:     'Sine.easeInOut',
        });

        return plate;
    }

    // _drawVsEmblem(): The centre mark - a breathing halo, a slowly turning
    // diamond frame and the VS glyph, with a feeder tick out to each half.
    _drawVsEmblem(bar){
        const vs = this.add.container(0, -26).setAlpha(0);

        const halo = this.add.circle(0, 0, 40, 0xffffff, 0.10).setAlpha(0.45);

        const feeders = this.add.graphics();
        [[-46, -98, YOU_ACCENT], [46, 98, OPP_ACCENT]].forEach(([from, to, accent]) => {
            feeders.lineStyle(1, accent, 0.5);
            feeders.beginPath();
            feeders.moveTo(from, 0);
            feeders.lineTo(to, 0);
            feeders.strokePath();
        });

        // A square rotated onto its corner. Graphics cannot stroke a rotated
        // rect, so the object itself carries the 45 degrees. It is held there -
        // a spinning diamond only ever reads as a crooked box.
        const frame = this.add.graphics();
        frame.lineStyle(2, 0xd8f4ff, 0.55);
        frame.strokeRect(-23, -23, 46, 46);
        frame.lineStyle(1, 0xd8f4ff, 0.18);
        frame.strokeRect(-29, -29, 58, 58);
        frame.setAngle(45);

        // Four ticks orbiting the mark instead, which turns without ever looking
        // tilted, and carries the motion the frame gives up.
        const ticks = this.add.graphics();
        ticks.lineStyle(2, 0xd8f4ff, 0.45);
        for (let i = 0; i < 4; i++){
            const a = Phaser.Math.DegToRad(i * 90);
            ticks.beginPath();
            ticks.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
            ticks.lineTo(Math.cos(a) * 42, Math.sin(a) * 42);
            ticks.strokePath();
        }

        const glyph = this.add.text(0, 0, 'VS', {
            fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold',
            color: '#ffffff', stroke: '#04121a', strokeThickness: 4,
        }).setOrigin(0.5);

        vs.add([halo, feeders, ticks, frame, glyph]);
        bar.add(vs);

        this.tweens.add({
            targets:  halo,
            alpha:    1,
            scale:    1.22,
            duration: 1500,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // One endless turn. The ticks sit on a 90 degree pattern, so ending on 90
        // lands them back on themselves and the repeat never shows a jump.
        this.tweens.add({
            targets:  ticks,
            angle:    90,
            duration: 5200,
            repeat:   -1,
            ease:     'Linear',
        });

        return vs;
    }

    // _dropInHeader(): The entrance. The slab falls from above the camera and
    // overshoots on 'Back.easeOut', so it reads as landing rather than sliding.
    _dropInHeader(bar, w, h){
        this.tweens.add({
            targets:    bar,
            y:          HEADER_Y,
            alpha:      1,
            duration:   820,
            delay:      120,
            ease:       'Back.easeOut',
            onComplete: () => this._headerImpact(bar, w, h),
        });
    }

    // _headerImpact(): The landing - a flash through the glass, a short knock on
    // the camera and a shock line spreading along the underside. Then the two
    // halves slide home and the VS mark punches down onto the seam between them,
    // which is the beat the match actually starts on.
    _headerImpact(bar, w, h){
        if (!this.scene.isActive()) return;

        this.cameras.main.shake(140, 0.0025);

        this.tweens.add({
            targets:  this.headerFlash,
            alpha:    { from: 0.9, to: 0 },
            duration: 340,
            ease:     'Cubic.easeOut',
        });

        const shock = this.add.rectangle(0, h / 2, w * 0.3, 2, 0xffffff, 0.8)
            .setBlendMode(Phaser.BlendModes.ADD);
        bar.add(shock);

        this.tweens.add({
            targets:    shock,
            scaleX:     3.4,
            alpha:      0,
            duration:   620,
            ease:       'Cubic.easeOut',
            onComplete: () => shock.destroy(),
        });

        [this.youPlate, this.oppPlate].forEach((plate, i) => {
            this.tweens.add({
                targets:  plate,
                x:        0,
                alpha:    1,
                duration: 460,
                delay:    i * 90,
                ease:     'Cubic.easeOut',
            });
        });

        this.vsEmblem.setScale(2.3);
        this.tweens.add({
            targets:  this.vsEmblem,
            scale:    1,
            alpha:    1,
            duration: 520,
            delay:    180,
            ease:     'Back.easeOut',
        });
    }

    /** Long names are clipped rather than allowed to run into the VS mark. */
    _clipName(name){
        const MAX = 13;
        return name.length > MAX ? `${name.slice(0, MAX - 1)}…` : name;
    }

    // ------------------------------------------------- singularity points --
    // _singularityPointPanel(): The SP bank - the same glass slab the header is
    // built on, stacked directly under it, with a player's total on each side
    // and the attack ladder between them.
    //
    // Points are banked in this.singularityPointBatch (playerAPts for this
    // client, playerBPts for the opponent) and every gain is animated:
    // _creditSingularityPoints() rolls the total up rather than snapping it,
    // lights the rung the attack rolled and flies the award out of the core.
    _singularityPointPanel(){
        const { width } = this.cameras.main;

        const w = Math.min(SP_PANEL_W, width - 140);
        const h = SP_PANEL_H;

        const panel = this.add.container(width / 2, -h).setAlpha(0);
        this.spPanel = panel;

        this.spFlash = this._drawGlassSlab(panel, w, h);

        this.spCore = this._drawSpCore(panel);
        this.spYou  = this._drawSpSide(panel, w, -1, 'YOUR SP',     YOU_ACCENT, YOU_ACCENT_HEX);
        this.spOpp  = this._drawSpSide(panel, w, +1, 'OPPONENT SP', OPP_ACCENT, OPP_ACCENT_HEX);

        // Lands after the header has, so the two slabs read as one assembly
        // settling rather than two panels racing each other down.
        this.tweens.add({
            targets:  panel,
            y:        SP_PANEL_Y,
            alpha:    1,
            duration: 760,
            delay:    620,
            ease:     'Back.easeOut',
        });
    }

    // _drawSpCore(): The middle of the slab - the last roll's multiplier over a
    // breathing core. This is where an award is born before it flies out to the
    // side that earned it.
    _drawSpCore(panel){
        const label = this.add.text(0, -22, 'LAST ROLL', {
            fontFamily: 'monospace', fontSize: '10px', color: '#8fb4c4',
        }).setOrigin(0.5).setAlpha(0.55);

        const halo = this.add.circle(0, 8, 26, 0xffffff, 0.07).setAlpha(0.5);

        const ring = this.add.graphics();
        ring.lineStyle(1, 0xd8f4ff, 0.30);
        ring.strokeCircle(0, 8, 20);

        const value = this.add.text(0, 8, `x${(0).toFixed(SP_DECIMALS)}`, {
            fontFamily: 'monospace', fontSize: '19px', fontStyle: 'bold',
            color: '#dff6ff', stroke: '#04121a', strokeThickness: 4,
        }).setOrigin(0.5);

        panel.add([label, halo, ring, value]);

        this.tweens.add({
            targets:  halo,
            alpha:    1,
            scale:    1.18,
            duration: 1700,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        return { halo, ring, value };
    }

    // _drawSpSide(): One side's bank - caption, running total and the five rung
    // ladder. `side` is -1 for this client's half and +1 for the opponent's, and
    // the layout mirrors on it exactly as the nameplates do.
    //
    // `shown` is what the number currently reads, which is not the banked total
    // while a roll-up is in flight; `counter` holds that tween so a second
    // award landing mid-count can take the number over cleanly.
    _drawSpSide(panel, w, side, caption, accent, accentHex){
        const hw      = w / 2;
        const edgeX   = side * (hw - 34);
        const originX = side < 0 ? 0 : 1;

        const label = this.add.text(edgeX, -22, caption, {
            fontFamily: 'monospace', fontSize: '11px', color: accentHex,
        }).setOrigin(originX, 0.5).setAlpha(0.65);

        const value = this.add.text(edgeX, 10, '0 SP', {
            fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold',
            color: '#f2f6f8', stroke: '#04121a', strokeThickness: 4,
        }).setOrigin(originX, 0.5);

        panel.add([label, value]);

        // The ladder: one pip per rung, ordered outward-in so the rung nearest
        // the core is always the critical - both sides climb toward the middle.
        const pips = [];

        for (let i = 0; i < SP_MULTIPLIERS.length; i++){
            const x   = side * (hw - SP_PIP_INSET - i * SP_PIP_GAP);
            const pip = this.add.circle(x, 0, SP_PIP_R, 0x0c1620, 0.9);
            pip.setStrokeStyle(1.5, accent, 0.35);
            panel.add(pip);
            pips.push(pip);
        }

        return { value, pips, accent, accentHex, side, shown: 0, target: 0, counter: null };
    }

    // _creditSingularityPoints(): Bank one attack's SP and play it.
    //
    // The award is the event's own spGained - the server has already walked the
    // same ladder - and SP_LADDER only stands in if that field is missing. A
    // miss banks nothing but still plays: the panel should show a dry roll, not
    // sit silent and leave the player wondering whether the attack registered.
    _creditSingularityPoints(ev){
        if (!this.spPanel) return;

        const index = this._spRungOf(ev);
        const mul   = Number(SP_MULTIPLIERS[index] ?? ev.multiplier ?? 0).toFixed(SP_DECIMALS);
        const sp    = Number.isFinite(ev.spGained) ? ev.spGained : (SP_LADDER[index] ?? 0);

        const you  = this._isYou(ev.attackerId);
        const view = you ? this.spYou : this.spOpp;
        const key  = you ? 'playerAPts' : 'playerBPts';

        // Pattern Bonus Mode's extra SP rides on top of the ladder's, and is
        // flown in its own blue a beat behind the regular award.
        const bonus = Number.isFinite(ev.pbmBonusSp) ? ev.pbmBonusSp : 0;

        this.singularityPointBatch[key] += sp + bonus;

        this._showSpRoll(view, index, mul, sp);
        this._countSpTo(view, this.singularityPointBatch[key]);

        if (sp > 0) this._flySpAward(view, sp, index === SP_MULTIPLIERS.length - 1);

        if (bonus > 0){
            this.time.delayedCall(220, () => {
                if (this.scene.isActive()) this._flySpAward(view, bonus, false, PB_BONUS_HEX);
            });
        }
    }

    /** Which rung an attack landed on, by index if the server sent one and by
     *  its fixed multiplier if it did not. -1 means neither could be read. */
    _spRungOf(ev){
        if (Number.isInteger(ev.multiplierIndex)) return ev.multiplierIndex;

        const mul = Number(ev.multiplier ?? -1).toFixed(SP_DECIMALS);
        return SP_MULTIPLIERS.findIndex(m => m.toFixed(SP_DECIMALS) === mul);
    }

    // _showSpRoll(): Light the rung this attack rolled and put its multiplier in
    // the core. A critical takes the whole slab with it.
    _showSpRoll(view, index, mul, sp){
        // A miss is the bottom rung, not an empty award: a Nova Burst strike in
        // Pattern Bonus Mode lands for 0 SP and must not light up as a miss.
        const critical = index === SP_MULTIPLIERS.length - 1;
        const miss     = index === 0;
        const lit      = critical ? 0xffe066 : miss ? 0xff5544 : view.accent;

        view.pips.forEach((pip, i) => {
            const on = i === index;
            pip.setFillStyle(on ? lit : 0x0c1620, on ? 1 : 0.9);
            pip.setStrokeStyle(1.5, on ? lit : view.accent, on ? 1 : 0.35);

            if (!on) return;

            this.tweens.add({
                targets:  pip,
                scale:    2.1,
                duration: 170,
                yoyo:     true,
                ease:     'Back.easeOut',
            });

            // A ring thrown off the rung as it lights.
            const burst = this.add.circle(pip.x, pip.y, SP_PIP_R, lit, 0)
                .setStrokeStyle(2, lit, 0.9);
            this.spPanel.add(burst);

            this.tweens.add({
                targets:    burst,
                scale:      3.4,
                alpha:      0,
                duration:   560,
                ease:       'Cubic.easeOut',
                onComplete: () => burst.destroy(),
            });
        });

        this.spCore.value.setText(`x${mul}`);
        this.spCore.value.setColor(critical ? '#ffe066' : miss ? '#ff8a7a' : '#dff6ff');

        this.tweens.add({
            targets:  this.spCore.value,
            scale:    { from: critical ? 1.9 : 1.45, to: 1 },
            duration: critical ? 520 : 320,
            ease:     'Back.easeOut',
        });

        this.tweens.add({
            targets:  this.spCore.ring,
            scale:    { from: 1, to: critical ? 2.2 : 1.5 },
            alpha:    { from: 0.9, to: 0.3 },
            duration: 520,
            ease:     'Cubic.easeOut',
        });

        if (critical){
            this.tweens.add({
                targets:  this.spFlash,
                alpha:    { from: 0.55, to: 0 },
                duration: 420,
                ease:     'Cubic.easeOut',
            });
        }
    }

    // _flySpAward(): The award itself - '+30 SP' lifted out of the core and
    // carried to the total it is about to be added to.
    _flySpAward(view, sp, critical, color = null){
        // Stop in the gap inboard of the number rather than on it - an award
        // parked over the digits reads as one garbled figure.
        const inboard = view.value.x + view.side * -view.value.width;
        const target  = inboard - view.side * 42;

        const award = this.add.text(0, 10, `+${sp} SP`, {
            fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold',
            color: color ?? (critical ? '#ffe066' : view.accentHex),
            stroke: '#04121a', strokeThickness: 4,
        }).setOrigin(0.5).setScale(0.6);

        this.spPanel.add(award);

        this.tweens.add({
            targets:  award,
            x:        target,
            scale:    1.05,
            duration: 560,
            ease:     'Cubic.easeOut',
        });

        // Arced over the ladder it has to cross - flown flat, it collides with
        // the rung flaring underneath it. The climb is quick and the height is
        // held, because the critical rung sits closest to the core and is
        // crossed within the first hundred milliseconds; a slow arc is still on
        // the way up by then. Up, hold and down come to the same 520ms as the
        // travel, so the two stay in step without a timeline to hold them.
        this.tweens.add({
            targets:  award,
            y:        -26,
            duration: 120,
            hold:     280,
            yoyo:     true,
            ease:     'Sine.easeOut',
        });

        this.tweens.add({
            targets:    award,
            alpha:      0,
            delay:      340,
            duration:   260,
            onComplete: () => award.destroy(),
        });
    }

    // _countSpTo(): Roll a side's number up to its banked total. The count is
    // the only thing allowed to write that text, so a reconcile knows to keep
    // its hands off while one is running.
    _countSpTo(view, to){
        // Stopped before anything else: a count left running toward a figure
        // this one supersedes would keep writing the number after this returns.
        view.counter?.stop();
        view.counter = null;
        view.target  = to;

        if (view.shown === to){
            view.value.setText(`${to} SP`);
            return;
        }

        view.counter = this.tweens.addCounter({
            from:     view.shown,
            to,
            duration: 560,
            delay:    380,              // lets the award land on the number first
            ease:     'Cubic.easeOut',
            onUpdate: (tw) => {
                view.shown = Math.round(tw.getValue());
                view.value.setText(`${view.shown} SP`);
            },
            onComplete: () => {
                view.counter = null;
                view.shown   = to;
                view.value.setText(`${to} SP`);
            },
        });

        this.tweens.add({
            targets:  view.value,
            scale:    { from: 1, to: 1.3 },
            duration: 190,
            delay:    380,
            yoyo:     true,
            ease:     'Back.easeOut',
        });
    }

    // _syncSingularityPoints(): Settle the bank against the server's totals.
    //
    // Events drive the animation, but a rejoin or a resync arrives with no
    // events at all, so the state's sp is what the panel ultimately answers to.
    // A number mid-roll is left alone: its count is already heading for the
    // value this would set.
    _syncSingularityPoints(){
        const s = this.state;
        if (!s || !this.spPanel) return;

        [[this.spYou, 'playerAPts', s.you?.sp], [this.spOpp, 'playerBPts', s.opponent?.sp]]
            .forEach(([view, key, sp]) => {
                if (!Number.isFinite(sp)) return;

                this.singularityPointBatch[key] = sp;

                // A count already heading for this figure is left to land. One
                // heading somewhere else is taken over - the server has the
                // final word on a total, not the roll-up that was in flight.
                if (view.counter) {
                    if (view.target !== sp) this._countSpTo(view, sp);
                    return;
                }

                if (view.shown === sp) return;

                view.shown = sp;
                view.value.setText(`${sp} SP`);
            });
    }

    /** Whether a player id belongs to the player sitting at this client. */
    _isYou(id){
        return id === this.state?.you?.playerId
            || id === this.data_.you?.playerId
            || id === Net.playerId;
    }


    // ========================================================= pattern bonus --
    // Every base move a player commits (swap, attack, defend) is added to a
    // chain on the server. When the chain reaches its length - three moves, or
    // one with a single card left - it is scored against the BattleEngine's
    // pattern tables and the PBP is poured into that player's meter. A full
    // meter starts Pattern Bonus Mode: six attack base moves that each pay
    // extra SP, after which the meter empties and chains resume.
    //
    // Per side, the view is built from three pieces:
    //
    //   _patternBonusPanel()  the glass meter on the outside edge of the stage
    //   _buildPbTracker()     the attacks-left pill under the side's card
    //   _startPbmAura()       the smoke wave rolling in from that edge

    // _buildPatternLayers(): The two layers the mode's aura is drawn on. The
    // underlay goes straight onto the backdrop, so the wave rolls in behind
    // the HUD without ever covering a number; the overlay carries only the
    // brief burst and shatter, which are allowed to cross in front of it.
    _buildPatternLayers(){
        this.pbUnderlay = this.add.layer();
        this.pbOverlay  = this.add.layer().setDepth(50);   // under the store's 60
    }

    // _patternBonusPanel(): The Pattern Bonus Meter for each player - this
    // client's on the left edge, the opponent's mirrored on the right.
    _patternBonusPanel(){
        const { width, height } = this.cameras.main;

        this._ensurePbTextures();

        const cardY = Math.round(height * ARENA_CENTER_Y) + CARD_DROP;

        this.pbViews = {
            you: this._buildPbPanel(-1, 'YOU', YOU_ACCENT, YOU_ACCENT_HEX,
                PB_PANEL_INSET, width / 2 - CARD_GAP / 2, cardY, 1500),
            opp: this._buildPbPanel(+1, 'OPPONENT', OPP_ACCENT, OPP_ACCENT_HEX,
                width - PB_PANEL_INSET, width / 2 + CARD_GAP / 2, cardY, 1580),
        };
    }

    // _buildPbPanel(): One side's meter - title, glass tube, readout and the
    // chain being built. `side` is -1 for the left edge and +1 for the right,
    // and the panel slides in from whichever edge it belongs to.
    _buildPbPanel(side, caption, accent, accentHex, x, cardX, cardY, delay){
        const { width } = this.cameras.main;
        const w = PB_PANEL_W;
        const h = PB_PANEL_H;

        const offX  = side < 0 ? -w : width + w;
        const panel = this.add.container(offX, PB_PANEL_Y).setAlpha(0);

        const glass = this._drawPbGlass(panel, w, h, accent);

        const title = this.add.text(0, -h / 2 + 26, 'PATTERN BONUS', {
            fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold',
            color: PB_ICE_HEX, stroke: '#04101f', strokeThickness: 3,
        }).setOrigin(0.5);

        const who = this.add.text(0, -h / 2 + 44, caption, {
            fontFamily: 'monospace', fontSize: '10px', color: accentHex,
        }).setOrigin(0.5).setAlpha(0.7);

        panel.add([title, who]);
        this._fxGlow(title, PB_BLUE, 1.4);

        const tube = this._drawPbTube(panel);

        // Readout: the PBP banked, or the attacks left while the mode is on.
        const value = this.add.text(0, 106, '0', {
            fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold',
            color: '#f2f8ff', stroke: '#04101f', strokeThickness: 4,
        }).setOrigin(0.5);

        const unit = this.add.text(0, 128, `/ ${PB_DEFAULT_MAX} PBP`, {
            fontFamily: 'monospace', fontSize: '10px', color: PB_BLUE_HEX,
        }).setOrigin(0.5).setAlpha(0.8);

        const chainLabel = this.add.text(0, 156, '', {
            fontFamily: 'monospace', fontSize: '10px', color: '#8fb4d4',
        }).setOrigin(0.5).setAlpha(0.8);

        panel.add([value, unit, chainLabel]);

        const view = {
            side, accent, accentHex, panel, glass, tube,
            value, unit, chainLabel,
            cardX, cardY,
            homeX:   x,
            max:     PB_DEFAULT_MAX,
            total:   PB_DEFAULT_ATTACKS,
            left:    0,
            shown:   0,
            target:  0,
            counter: null,
            mode:        false,     // whether the mode is being shown
            modePending: 0,         // start/end calls still waiting to play
            chainHoldUntil: 0,      // a scored chain is on show until then
            aura:    null,
        };

        view.chips   = this._buildPbChips(view);
        view.modeRow = this._buildPbModeRow(view);
        view.tracker = this._buildPbTracker(view);

        this._paintPbLevel(view, 0);
        this._paintPbChain(view, [], 3, 4);

        // Bubbles rising through the liquid - more of them, faster, the
        // fuller the tube gets.
        this.time.addEvent({
            delay:    170,
            loop:     true,
            callback: () => this._pbBubble(view),
        });

        this.tweens.add({
            targets:  panel,
            x,
            alpha:    1,
            duration: 820,
            delay,
            ease:     'Back.easeOut',
        });

        return view;
    }

    // _drawPbGlass(): The meter's shell. The HUD's frame language - bloom,
    // smoked body, sheen, double border, corner brackets, travelling glint -
    // rebuilt as frosted ice: a body that clears toward the bottom, light
    // caught in two refraction streaks across the top corner, and a diamond
    // keystone on the top edge. The corner brackets keep the side's accent so
    // the two meters still say whose they are.
    _drawPbGlass(panel, w, h, accent){
        const bloom = this.add.rectangle(0, 0, w + 26, h + 26, PB_BLUE, 0.07).setAlpha(0.5);

        const body = this.add.graphics();
        body.fillStyle(0x040a15, 0.5);
        body.fillRect(-w / 2, -h / 2, w, h);
        // Frost: lit from above, clearing toward the base.
        body.fillGradientStyle(0x1d4a86, 0x1d4a86, 0x050b16, 0x050b16, 0.42, 0.42, 0.04, 0.04);
        body.fillRect(-w / 2, -h / 2, w, h);

        // Light caught in the glass - two streaks across the top-left corner.
        const streaks = this.add.graphics();
        streaks.fillStyle(0xffffff, 0.05);
        streaks.fillTriangle(-w / 2, -h / 2, -w / 2 + 74, -h / 2, -w / 2, -h / 2 + 150);
        streaks.fillStyle(0xffffff, 0.035);
        streaks.fillPoints([
            { x: -w / 2 + 96,  y: -h / 2 },
            { x: -w / 2 + 112, y: -h / 2 },
            { x: -w / 2,       y: -h / 2 + 228 },
            { x: -w / 2,       y: -h / 2 + 196 },
        ], true);

        const sheen = this.add.rectangle(0, -h / 2 + 8, w - 22, 10, PB_ICE, 0.09);

        const border = this.add.graphics();
        border.lineStyle(1.5, PB_BLUE, 0.5);
        border.strokeRect(-w / 2, -h / 2, w, h);
        border.lineStyle(1, 0xffffff, 0.11);
        border.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);

        const corners = this.add.graphics();
        const cLen = 16;
        [
            [-w / 2, -h / 2,  1,  1],
            [ w / 2, -h / 2, -1,  1],
            [-w / 2,  h / 2,  1, -1],
            [ w / 2,  h / 2, -1, -1],
        ].forEach(([cx, cy, hd, vd]) => {
            corners.lineStyle(3, accent, 0.9);
            corners.beginPath();
            corners.moveTo(cx + hd * cLen, cy);
            corners.lineTo(cx, cy);
            corners.lineTo(cx, cy + vd * cLen);
            corners.strokePath();
            corners.fillStyle(accent, 1);
            corners.fillCircle(cx, cy, 3);
        });

        // Keystone - an ice diamond set into the top edge.
        const key = this.add.graphics();
        key.fillStyle(0x061224, 1);
        key.fillPoints([{ x: 0, y: -h / 2 - 8 }, { x: 8, y: -h / 2 }, { x: 0, y: -h / 2 + 8 }, { x: -8, y: -h / 2 }], true);
        key.lineStyle(1.5, PB_ICE, 0.9);
        key.strokePoints([{ x: 0, y: -h / 2 - 8 }, { x: 8, y: -h / 2 }, { x: 0, y: -h / 2 + 8 }, { x: -8, y: -h / 2 }], true);

        // A tilted glint drifting down the glass. Three bands of falling
        // width stand in for the gradient a rectangle cannot carry.
        const glint = this.add.container(0, -h / 2 + 50).setAlpha(0).setAngle(-12);
        [[56, 0.025], [32, 0.03], [12, 0.04]].forEach(([bh, a]) => {
            glint.add(this.add.rectangle(0, 0, w - 26, bh, 0xffffff, a)
                .setBlendMode(Phaser.BlendModes.ADD));
        });

        // Lit only in Pattern Bonus Mode - the whole frame running hot.
        const modeGlow = this.add.graphics().setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
        [[3, 0.9], [7, 0.35], [12, 0.15]].forEach(([pad, a]) => {
            modeGlow.lineStyle(pad === 3 ? 2 : 4, PB_BLUE, a);
            modeGlow.strokeRect(-w / 2 - pad + 3, -h / 2 - pad + 3, w + (pad - 3) * 2, h + (pad - 3) * 2);
        });

        const flash = this.add.rectangle(0, 0, w, h, PB_ICE, 0.35).setAlpha(0)
            .setBlendMode(Phaser.BlendModes.ADD);

        panel.add([bloom, body, streaks, sheen, glint, border, corners, key, modeGlow, flash]);

        this.tweens.add({
            targets:  bloom,
            alpha:    1,
            scaleX:   1.03,
            scaleY:   1.012,
            duration: 2300,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        this.tweens.add({
            targets:     glint,
            y:           h / 2 - 50,
            duration:    3000,
            repeat:      -1,
            repeatDelay: 3400,
            ease:        'Sine.easeInOut',
        });

        this.tweens.add({
            targets:     glint,
            alpha:       { from: 0, to: 1 },
            duration:    1500,
            yoyo:        true,
            repeat:      -1,
            repeatDelay: 3400,
            ease:        'Sine.easeInOut',
        });

        return { bloom, modeGlow, flash };
    }

    // _drawPbTube(): The glass column the PBP is poured into. The liquid is a
    // gradient drawn at full height and scaled from its base, so filling it is
    // one number - the surface line and the bubbles are placed off the same
    // level and never have to be told the tube's geometry twice.
    _drawPbTube(panel){
        const tw = PB_TUBE_W;
        const th = PB_TUBE_H;
        const iw = tw - PB_TUBE_INSET * 2;
        const ih = th - PB_TUBE_INSET * 2;

        const tube   = this.add.container(0, PB_TUBE_Y);
        const bottom = th / 2 - PB_TUBE_INSET;

        const halo = this.add.rectangle(0, 0, tw + 30, th + 30, PB_BLUE, 0.12)
            .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.15);

        const back = this.add.graphics();
        back.fillStyle(0x030914, 0.82);
        back.fillRoundedRect(-tw / 2, -th / 2, tw, th, 10);

        // Graduations every quarter, so a half-full tube reads as half without
        // anyone having to look at the number.
        const ticks = this.add.graphics();
        for (let i = 1; i < 4; i++){
            const ty = bottom - (ih * i) / 4;
            ticks.lineStyle(1, PB_ICE, i === 2 ? 0.35 : 0.2);
            ticks.beginPath();
            ticks.moveTo(tw / 2 - (i === 2 ? 14 : 9), ty);
            ticks.lineTo(tw / 2 - 2, ty);
            ticks.strokePath();
        }

        const liquid = this.add.graphics({ x: 0, y: bottom });
        liquid.fillGradientStyle(0x7cc8ff, 0x7cc8ff, PB_DEEP, PB_DEEP, 0.95, 0.95, 0.95, 0.95);
        liquid.fillRect(-iw / 2, -ih, iw, ih);

        const core = this.add.rectangle(0, bottom, iw * 0.42, ih, PB_ICE, 0.22)
            .setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);

        const surface = this.add.rectangle(0, bottom, iw, 3, PB_ICE, 0.95)
            .setBlendMode(Phaser.BlendModes.ADD);
        const meniscus = this.add.ellipse(0, bottom, iw + 6, 10, PB_ICE, 0.25)
            .setBlendMode(Phaser.BlendModes.ADD);

        const bubbles = this.add.container(0, 0);

        // The glass in front of the liquid: a long highlight down the left, a
        // short one on the right, and a double outline.
        const front = this.add.graphics();
        front.fillStyle(0xffffff, 0.16);
        front.fillRoundedRect(-tw / 2 + 5, -th / 2 + 12, 5, th - 24, 2);
        front.fillStyle(0xffffff, 0.08);
        front.fillRoundedRect(tw / 2 - 9, -th / 2 + 16, 3, th * 0.3, 1.5);
        front.lineStyle(2, PB_BLUE, 0.6);
        front.strokeRoundedRect(-tw / 2, -th / 2, tw, th, 10);
        front.lineStyle(1, 0xffffff, 0.14);
        front.strokeRoundedRect(-tw / 2 + 3, -th / 2 + 3, tw - 6, th - 6, 8);

        // Caps top and bottom, so the column reads as a vessel set in the
        // panel rather than a bar drawn on it.
        const caps = this.add.graphics();
        [-th / 2 - 3, th / 2 - 3].forEach((cy) => {
            caps.fillStyle(0x0a1a30, 1);
            caps.fillRoundedRect(-tw / 2 - 6, cy, tw + 12, 6, 3);
            caps.lineStyle(1, PB_BLUE, 0.7);
            caps.strokeRoundedRect(-tw / 2 - 6, cy, tw + 12, 6, 3);
        });

        tube.add([halo, back, liquid, core, meniscus, surface, bubbles, ticks, front, caps]);
        panel.add(tube);

        this.tweens.add({
            targets:  meniscus,
            scaleX:   0.8,
            alpha:    0.5,
            duration: 900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        this.tweens.add({
            targets:  halo,
            scaleX:   1.12,
            scaleY:   1.03,
            duration: 1300,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        return { root: tube, halo, liquid, core, surface, meniscus, bubbles, bottom, iw, ih };
    }

    /** The level's y inside the tube for a PBP figure. */
    _pbLevelY(view, value){
        const pct = Phaser.Math.Clamp(value / (view.max || 1), 0, 1);
        return view.tube.bottom - view.tube.ih * pct;
    }

    // _paintPbLevel(): Put the liquid, the surface and the readout at one PBP
    // figure. The only thing that moves the level - a fill is a counter tween
    // calling this.
    _paintPbLevel(view, value){
        const t   = view.tube;
        const pct = Phaser.Math.Clamp(value / (view.max || 1), 0, 1);
        const y   = t.bottom - t.ih * pct;

        t.liquid.scaleY = Math.max(pct, 0.0001);
        t.core.scaleY   = Math.max(pct, 0.0001);
        t.surface.y     = y;
        t.meniscus.y    = y;
        t.surface.setVisible(pct > 0.005);
        t.meniscus.setVisible(pct > 0.005);

        // The column glows harder the closer it gets to tipping over.
        t.halo.setAlpha(view.mode ? 0.95 : 0.1 + pct * pct * 0.7);

        if (!view.mode){
            view.value.setText(String(Math.round(value)));
            view.value.setColor(pct >= 0.75 ? PB_ICE_HEX : '#f2f8ff');
        }
    }

    // _fillPbTo(): Pour (or drain) the meter to a figure. Same contract as
    // _countSpTo(): a fill heading elsewhere is taken over, never left to
    // finish on a stale number.
    _fillPbTo(view, to, { delay = 0, duration = 720 } = {}){
        view.counter?.stop();
        view.counter = null;
        view.target  = to;

        if (view.shown === to){
            this._paintPbLevel(view, to);
            return;
        }

        view.counter = this.tweens.addCounter({
            from:     view.shown,
            to,
            duration,
            delay,
            ease:     to > view.shown ? 'Cubic.easeOut' : 'Sine.easeInOut',
            onUpdate: (tw) => {
                view.shown = tw.getValue();
                this._paintPbLevel(view, view.shown);
            },
            onComplete: () => {
                view.counter = null;
                view.shown   = to;
                this._paintPbLevel(view, to);
            },
        });
    }

    // _pbBubble(): One bubble up through whatever liquid is in the tube.
    _pbBubble(view){
        if (!this.scene.isActive() || !view.panel.active) return;

        const pct = Phaser.Math.Clamp(view.shown / (view.max || 1), 0, 1);
        if (pct < 0.03 || Math.random() > 0.25 + pct * 0.6) return;

        const t    = view.tube;
        const top  = t.surface.y + 4;
        const x    = Phaser.Math.FloatBetween(-t.iw / 2 + 5, t.iw / 2 - 5);
        const r    = Phaser.Math.FloatBetween(1.2, 3.2);
        const fast = view.mode ? 0.55 : 1;

        const bubble = this.add.circle(x, t.bottom - 3, r, PB_ICE, 0.55)
            .setBlendMode(Phaser.BlendModes.ADD);
        t.bubbles.add(bubble);

        this.tweens.add({
            targets:    bubble,
            y:          top,
            x:          x + Phaser.Math.FloatBetween(-4, 4),
            alpha:      { from: 0.55, to: 0.1 },
            duration:   Phaser.Math.Between(900, 1700) * fast * Math.max(0.35, pct),
            ease:       'Sine.easeIn',
            onComplete: () => bubble.destroy(),
        });
    }

    // _buildPbChips(): The chain being built - one diamond per base move in
    // it. A cursor breathes on the next empty one, so the panel always says
    // where the player's next move is going to land.
    _buildPbChips(view){
        const row = this.add.container(0, PB_CHIP_Y);
        view.panel.add(row);

        const diamond = (r) => [{ x: 0, y: -r }, { x: r, y: 0 }, { x: 0, y: r }, { x: -r, y: 0 }];

        const chips = [];
        for (let i = 0; i < 3; i++){
            const root  = this.add.container(0, 0);
            const bg    = this.add.graphics();
            const glyph = this.add.text(0, 0, '', {
                fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#ffffff',
            }).setOrigin(0.5);

            root.add([bg, glyph]);
            row.add(root);
            chips.push({ root, bg, glyph, move: null });
        }

        const cursor = this.add.graphics();
        cursor.lineStyle(2, PB_ICE, 0.9);
        cursor.strokePoints(diamond(PB_CHIP_R + 5), true);
        row.add(cursor);

        this.tweens.add({
            targets:  cursor,
            alpha:    { from: 0.95, to: 0.2 },
            scale:    { from: 1, to: 1.12 },
            duration: 760,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        return { row, chips, cursor, diamond };
    }

    // _paintPbChip(): One chip, empty or holding a move.
    _paintPbChip(view, chip, move){
        const d   = view.chips.diamond(PB_CHIP_R);
        const def = PB_MOVES[move];

        chip.move = move ?? null;
        chip.bg.clear();

        if (!def){
            chip.bg.fillStyle(0x061222, 0.75);
            chip.bg.fillPoints(d, true);
            chip.bg.lineStyle(1.5, PB_BLUE, 0.32);
            chip.bg.strokePoints(d, true);
            chip.bg.fillStyle(PB_BLUE, 0.35);
            chip.bg.fillCircle(0, 0, 2);
            chip.glyph.setText('');
            return;
        }

        chip.bg.fillStyle(def.color, 0.22);
        chip.bg.fillPoints(d, true);
        chip.bg.lineStyle(2, def.color, 0.95);
        chip.bg.strokePoints(d, true);
        chip.glyph.setText(def.glyph).setColor(def.hex);
    }

    // _paintPbChain(): Lay the chip row out for a chain's length and fill it
    // with the moves made so far.
    _paintPbChain(view, moves, length, cardsAlive){
        const len = Math.max(1, Math.min(3, length || 3));
        const { chips, cursor, row } = view.chips;

        chips.forEach((chip, i) => {
            const on = i < len;
            chip.root.setVisible(on);
            if (!on) return;

            chip.root.x = (i - (len - 1) / 2) * PB_CHIP_GAP;
            this._paintPbChip(view, chip, moves[i]);
        });

        const next = moves.length;
        cursor.setVisible(next < len);
        if (next < len) cursor.x = chips[next].root.x;

        row.setVisible(!view.mode);

        if (!view.mode){
            view.chainLabel.setText(`CHAIN ${moves.length}/${len}  ·  ${cardsAlive ?? 4} ALIVE`);
            view.chainLabel.setColor('#8fb4d4');
        }
    }

    /** Repaint a side's chain from the latest state, once any hold is over. */
    _paintPbChainFromState(view){
        const side = view === this.pbViews?.you ? this.state?.you : this.state?.opponent;
        const p    = side?.pattern;
        if (!p) return;

        this._paintPbChain(view, p.moves ?? [], p.length, p.cardsAlive);
    }

    _pbViewOf(playerId){
        if (!this.pbViews) return null;
        return this._isYou(playerId) ? this.pbViews.you : this.pbViews.opp;
    }

    // _playPatternScored(): A chain completed. The chips light up in the order
    // they were played, the award lifts out of them into the tube, and the
    // liquid rises to take it.
    _playPatternScored(ev){
        const view = this._pbViewOf(ev.playerId);
        if (!view) return;

        const moves = ev.moves ?? String(ev.pattern ?? '').split('_').filter(Boolean);
        const hold  = 1000;

        view.chainHoldUntil = this.time.now + hold;
        if (Number.isFinite(ev.pbpMax)) view.max = ev.pbpMax;

        this._paintPbChain(view, moves, moves.length, ev.cardsAlive);
        view.chips.cursor.setVisible(false);

        view.chips.chips.slice(0, moves.length).forEach((chip, i) => {
            this.tweens.add({
                targets:  chip.root,
                scale:    { from: 1, to: 1.35 },
                duration: 150,
                delay:    i * 90,
                yoyo:     true,
                ease:     'Back.easeOut',
            });
        });

        // The award itself, flown from the chips up to the surface it raises.
        const surfaceY = PB_TUBE_Y + this._pbLevelY(view, ev.pbp ?? view.target);
        const award = this.add.text(0, PB_CHIP_Y - 30, `+${ev.points ?? 0}`, {
            fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold',
            color: PB_ICE_HEX, stroke: '#04101f', strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0).setScale(0.6);
        view.panel.add(award);
        this._fxGlow(award, PB_BLUE, 2);

        this.tweens.add({
            targets:  award,
            alpha:    1,
            scale:    1.15,
            duration: 220,
            delay:    moves.length * 90,
            ease:     'Back.easeOut',
        });

        this.tweens.add({
            targets:    award,
            y:          surfaceY,
            scale:      0.7,
            alpha:      0,
            duration:   520,
            delay:      moves.length * 90 + 380,
            ease:       'Cubic.easeIn',
            onComplete: () => award.destroy(),
        });

        const pourAt = moves.length * 90 + 820;

        this._fillPbTo(view, ev.pbp ?? view.target, { delay: pourAt, duration: 720 });

        // A ring off the surface as the award lands in it, and the glass lit.
        this.time.delayedCall(pourAt, () => {
            if (!this.scene.isActive()) return;

            const ring = this.add.ellipse(0, surfaceY, view.tube.iw, 8, PB_ICE, 0)
                .setStrokeStyle(2, PB_ICE, 0.9).setBlendMode(Phaser.BlendModes.ADD);
            view.panel.add(ring);

            this.tweens.add({
                targets:    ring,
                scaleX:     2.4,
                scaleY:     2.8,
                alpha:      0,
                duration:   560,
                ease:       'Cubic.easeOut',
                onComplete: () => ring.destroy(),
            });

            this.tweens.add({
                targets:  view.glass.flash,
                alpha:    { from: 0.35, to: 0 },
                duration: 420,
                ease:     'Cubic.easeOut',
            });
        });

        this.time.delayedCall(hold, () => {
            if (this.scene.isActive() && !view.mode) this._paintPbChainFromState(view);
        });
    }

    // _playPatternBroken(): A turn lost to the clock threw the chain away -
    // the chips flush red and empty.
    _playPatternBroken(ev){
        const view = this._pbViewOf(ev.playerId);
        if (!view) return;

        view.chainHoldUntil = this.time.now + 600;

        view.chips.chips.forEach((chip) => {
            if (!chip.move) return;

            const d = view.chips.diamond(PB_CHIP_R);
            chip.bg.lineStyle(2, 0xff5566, 1);
            chip.bg.strokePoints(d, true);

            this.tweens.add({
                targets:  chip.root,
                x:        chip.root.x + 4,
                duration: 50,
                yoyo:     true,
                repeat:   3,
            });
        });

        view.chainLabel.setText('PATTERN BROKEN').setColor('#ff8a8a');

        this.time.delayedCall(600, () => {
            if (this.scene.isActive() && !view.mode) this._paintPbChainFromState(view);
        });
    }

    // _buildPbModeRow(): What replaces the chain in the panel while the mode
    // is on - one ice diamond per attack base move left.
    _buildPbModeRow(view){
        const row = this.add.container(0, PB_CHIP_Y).setVisible(false);
        view.panel.add(row);

        const pips = this._buildPbPips(row, PB_DEFAULT_ATTACKS, 24, 8);
        return { row, pips };
    }

    /** A row of diamond pips, centred on the container - the mode's counter. */
    _buildPbPips(parent, count, gap, r){
        const pips = [];

        for (let i = 0; i < count; i++){
            const g = this.add.graphics({ x: (i - (count - 1) / 2) * gap, y: 0 });
            parent.add(g);
            pips.push(g);
        }

        pips.r = r;
        return pips;
    }

    _paintPbPips(pips, left){
        const r = pips.r;
        const d = [{ x: 0, y: -r }, { x: r, y: 0 }, { x: 0, y: r }, { x: -r, y: 0 }];

        pips.forEach((g, i) => {
            const on = i < left;
            g.clear();
            g.fillStyle(on ? PB_BLUE : 0x071426, on ? 0.9 : 0.8);
            g.fillPoints(d, true);
            g.lineStyle(1.5, on ? PB_ICE : PB_BLUE, on ? 1 : 0.3);
            g.strokePoints(d, true);
            if (on){
                g.fillStyle(0xffffff, 0.6);
                g.fillTriangle(0, -r + 2, r * 0.45, -r * 0.35, -r * 0.45, -r * 0.35);
            }
        });
    }

    // _buildPbTracker(): The attacks-left pill hung under the side's card, so
    // the count sits where the player is already looking when they attack.
    _buildPbTracker(view){
        const w = 272;
        const h = 36;

        const root = this.add.container(view.cardX, PB_TRACKER_Y).setAlpha(0).setVisible(false);

        const glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
        this._paintSoftGlow(glow, w, h, h / 2, PB_BLUE, 0.35);

        const body = this.add.graphics();
        body.fillStyle(0x050d1c, 0.86);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        body.fillStyle(PB_ICE, 0.08);
        body.fillRoundedRect(-w / 2 + 10, -h / 2 + 3, w - 20, 6, 3);
        body.lineStyle(1.5, PB_BLUE, 0.8);
        body.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);

        const tag = this.add.text(-w / 2 + 18, 0, 'PBM', {
            fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold',
            color: PB_ICE_HEX, stroke: '#04101f', strokeThickness: 3,
        }).setOrigin(0, 0.5);

        const count = this.add.text(w / 2 - 18, 0, '', {
            fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: PB_BLUE_HEX,
        }).setOrigin(1, 0.5);

        const pipRow = this.add.container(-6, 0);
        root.add([glow, body, tag, count, pipRow]);

        const pips = this._buildPbPips(pipRow, PB_DEFAULT_ATTACKS, 21, 7);

        this.tweens.add({
            targets:  glow,
            alpha:    { from: 1, to: 0.35 },
            duration: 900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        return { root, count, pips, pipRow };
    }

    /** Write attacks-left into both counters - the panel's and the card's. */
    _paintPbAttacks(view){
        const left  = Math.max(0, view.left);
        const total = view.total || PB_DEFAULT_ATTACKS;

        this._paintPbPips(view.modeRow.pips, left);
        this._paintPbPips(view.tracker.pips, left);

        view.tracker.count.setText(`${left} LEFT`);

        if (view.mode){
            view.value.setText(String(left)).setColor(left <= 2 ? '#ffb3c0' : PB_ICE_HEX);
            view.unit.setText(`OF ${total} ATTACKS`);
            view.chainLabel.setText('PATTERN BONUS MODE').setColor(PB_ICE_HEX);
        }
    }

    // _notePbmAttack(): An attack made in the mode spends one of its moves -
    // the pip it came off shatters as the blow lands, and a hit pays its blue
    // bonus over the attacking card.
    _notePbmAttack(ev){
        if (!ev.pbm) return;

        const view = this._pbViewOf(ev.attackerId);
        if (!view) return;

        // A Singularity attack's later strikes ride on the move the first one
        // spent - they pay their bonus but have no pip of their own to break.
        const spends = ev.pbmSpent !== false;
        if (spends) view.left = Number.isFinite(ev.pbmAttacksLeft) ? ev.pbmAttacksLeft : Math.max(0, view.left - 1);

        const spent = view.left;
        if (spends) this.time.delayedCall(ATTACK_LAND_MS, () => {
            if (!this.scene.isActive()) return;

            this._paintPbAttacks(view);
            this._shatterPip(view.tracker.pipRow, view.tracker.pips[spent]);
            this._shatterPip(view.modeRow.row,   view.modeRow.pips[spent]);

            this.tweens.add({
                targets:  view.value,
                scale:    { from: 1.45, to: 1 },
                duration: 320,
                ease:     'Back.easeOut',
            });
        });

        if (ev.damage > 0 && ev.pbmBonusSp > 0){
            const slot = this._isYou(ev.attackerId) ? this.playerSlot : this.oppSlot;
            this.time.delayedCall(ATTACK_LAND_MS + 80, () => {
                if (this.scene.isActive()) this._floatPbmBonus(slot, ev.pbmBonusSp);
            });
        }
    }

    /** A spent pip bursting into a few glass flakes. */
    _shatterPip(parent, pip){
        if (!pip || !parent) return;

        for (let i = 0; i < 6; i++){
            const a     = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const flake = this.add.image(pip.x, pip.y, 'pbShards', Phaser.Utils.Array.GetRandom(['tri', 'sliver']))
                .setScale(0.14).setTint(PB_ICE).setBlendMode(Phaser.BlendModes.ADD);
            parent.add(flake);

            this.tweens.add({
                targets:    flake,
                x:          pip.x + Math.cos(a) * Phaser.Math.Between(14, 30),
                y:          pip.y + Math.sin(a) * Phaser.Math.Between(14, 30) + 8,
                angle:      Phaser.Math.Between(-200, 200),
                alpha:      0,
                duration:   Phaser.Math.Between(380, 620),
                ease:       'Cubic.easeOut',
                onComplete: () => flake.destroy(),
            });
        }
    }

    // _floatPbmBonus(): The mode's extra SP, in blue, lifted off the attacker.
    _floatPbmBonus(slot, bonus){
        if (!slot) return;

        const x = slot.homeX;
        const y = slot.homeY - CARD_H / 2 + 36;

        const text = this.add.text(x, y, `+${bonus} SP`, {
            fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold',
            color: PB_BONUS_HEX, stroke: '#030a18', strokeThickness: 6,
        }).setOrigin(0.5).setScale(1.6).setAlpha(0);
        this.pbOverlay.add(text);
        this._fxGlow(text, PB_BLUE, 2.5);

        this.tweens.add({
            targets:  text,
            alpha:    1,
            scale:    1,
            duration: 240,
            ease:     'Back.easeOut',
        });

        this.tweens.add({
            targets:    text,
            y:          y - 70,
            alpha:      0,
            delay:      520,
            duration:   720,
            ease:       'Cubic.easeIn',
            onComplete: () => text.destroy(),
        });
    }

    // _schedulePbMode(): Queue a mode change behind the blow that caused it.
    // The pending count keeps _renderPatternBonus() from playing the change
    // early off the state, which already has it.
    _schedulePbMode(playerId, on, delay){
        const view = this._pbViewOf(playerId);
        if (!view) return;

        view.modePending += 1;

        this.time.delayedCall(delay, () => {
            view.modePending = Math.max(0, view.modePending - 1);
            if (!this.scene.isActive()) return;

            this._setPbMode(view, on, { burst: true });
        });
    }

    // _setPbMode(): Put a side's panel, tracker and aura in or out of Pattern
    // Bonus Mode. `burst` plays the full entrance or break-up; without it (a
    // rejoin landing mid-mode) the aura simply fades up.
    _setPbMode(view, on, { burst = false } = {}){
        if (view.mode === on) return;
        view.mode = on;

        const { modeGlow } = view.glass;
        this.tweens.killTweensOf(modeGlow);

        if (on){
            if (!Number.isFinite(view.left) || view.left <= 0) view.left = view.total;

            view.chips.row.setVisible(false);
            view.modeRow.row.setVisible(true).setAlpha(0);
            this.tweens.add({ targets: view.modeRow.row, alpha: 1, duration: 300 });

            this._fillPbTo(view, view.max, { duration: burst ? 420 : 0 });
            this._paintPbAttacks(view);

            modeGlow.setAlpha(0.5);
            this.tweens.add({
                targets:  modeGlow,
                alpha:    1,
                duration: 700,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });

            const t = view.tracker.root;
            this.tweens.killTweensOf(t);
            t.setVisible(true).setAlpha(0).setY(PB_TRACKER_Y + 18);
            this.tweens.add({
                targets:  t,
                alpha:    1,
                y:        PB_TRACKER_Y,
                duration: 480,
                delay:    burst ? 260 : 0,
                ease:     'Back.easeOut',
            });

            if (burst){
                this.tweens.add({
                    targets:  view.glass.flash,
                    alpha:    { from: 0.8, to: 0 },
                    duration: 620,
                    ease:     'Cubic.easeOut',
                });
                this.tweens.add({
                    targets:  view.panel,
                    scale:    { from: 1.06, to: 1 },
                    duration: 420,
                    ease:     'Back.easeOut',
                });
            }

            this._startPbmAura(view, burst);
            return;
        }

        modeGlow.setAlpha(0);
        view.left = 0;

        view.modeRow.row.setVisible(false);
        view.unit.setText(`/ ${view.max} PBP`);
        this._paintPbChainFromState(view);

        // The meter drains back to empty - chains start filling it again now.
        this._fillPbTo(view, 0, { duration: burst ? 1100 : 0 });

        const t = view.tracker.root;
        this.tweens.killTweensOf(t);
        this.tweens.add({
            targets:    t,
            alpha:      0,
            y:          PB_TRACKER_Y + 18,
            duration:   360,
            ease:       'Cubic.easeIn',
            onComplete: () => t.setVisible(false),
        });

        this._breakPbmAura(view, burst);
    }

    // _renderPatternBonus(): Settle both meters against the server's state.
    // Events drive the animation; this is what a rejoin or resync answers to.
    _renderPatternBonus(){
        const s = this.state;
        if (!s || !this.pbViews) return;

        [[this.pbViews.you, s.you], [this.pbViews.opp, s.opponent]].forEach(([view, side]) => {
            const p = side?.pattern;
            if (!p) return;

            if (Number.isFinite(p.pbpMax) && p.pbpMax !== view.max){
                view.max = p.pbpMax;
                if (!view.mode) view.unit.setText(`/ ${view.max} PBP`);
            }
            if (Number.isFinite(p.mode?.attacksTotal)) view.total = p.mode.attacksTotal;

            // A change an event has queued is left to that event to play.
            if (view.modePending) return;

            const active = !!p.mode?.active;
            if (active) view.left = p.mode.attacksLeft;

            if (view.mode !== active) this._setPbMode(view, active, { burst: false });

            if (view.mode){
                this._paintPbAttacks(view);
                return;
            }

            if (view.target !== p.pbp && this.time.now >= view.chainHoldUntil) this._fillPbTo(view, p.pbp);
            if (this.time.now >= view.chainHoldUntil) this._paintPbChain(view, p.moves ?? [], p.length, p.cardsAlive);
        });
    }

    // ---------------------------------------------------- pattern bonus aura --
    // The mode's wave. Everything lives on the underlay, behind the HUD:
    //
    //   veil     a soft gradient off the side's screen edge
    //   lobes    blobs strung down that edge, each breathing on its own
    //            period, so the front of the wave simmers instead of standing
    //   corners  blooms in the two corners of that side
    //   smoke    two emitters off the edge and one off each corner
    //   glass    shards of ice drifting and turning in the smoke
    //
    // It bursts in on the overlay - a light sweep, a shard storm, a ring off
    // the card and the mode's title - and shatters out the same way.

    /** Runtime textures for the aura and the glass - built once, kept across matches. */
    _ensurePbTextures(){
        const tex = this.textures;

        if (!tex.exists('pbSmoke')){
            const t   = tex.createCanvas('pbSmoke', 128, 128);
            const ctx = t.getContext();

            // Three offset puffs, so a particle reads as smoke and not a disc.
            [[64, 64, 62, 0.5], [46, 54, 40, 0.34], [82, 76, 38, 0.3]].forEach(([x, y, r, a]) => {
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0,   `rgba(255,255,255,${a})`);
                g.addColorStop(0.5, `rgba(255,255,255,${a * 0.42})`);
                g.addColorStop(1,   'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, 128, 128);
            });
            t.refresh();
        }

        if (!tex.exists('pbGlow')){
            const t   = tex.createCanvas('pbGlow', 256, 256);
            const ctx = t.getContext();
            const g   = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
            g.addColorStop(0,    'rgba(255,255,255,0.9)');
            g.addColorStop(0.35, 'rgba(255,255,255,0.4)');
            g.addColorStop(1,    'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 256, 256);
            t.refresh();
        }

        if (!tex.exists('pbVeil')){
            const t   = tex.createCanvas('pbVeil', 512, 8);
            const ctx = t.getContext();
            const g   = ctx.createLinearGradient(0, 0, 512, 0);
            g.addColorStop(0,    'rgba(255,255,255,0.95)');
            g.addColorStop(0.3,  'rgba(255,255,255,0.4)');
            g.addColorStop(0.65, 'rgba(255,255,255,0.1)');
            g.addColorStop(1,    'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 512, 8);
            t.refresh();
        }

        if (!tex.exists('pbShards')){
            // Four glass shapes on one sheet, as frames, so a single emitter
            // can scatter all of them.
            const S   = 64;
            const t   = tex.createCanvas('pbShards', S * 4, S);
            const ctx = t.getContext();

            const shapes = {
                tri:    [[32, 6], [58, 54], [8, 46]],
                dia:    [[32, 4], [52, 32], [32, 60], [12, 32]],
                hex:    [[32, 6], [55, 19], [55, 45], [32, 58], [9, 45], [9, 19]],
                sliver: [[26, 4], [40, 10], [36, 60], [24, 54]],
            };

            Object.entries(shapes).forEach(([name, pts], i) => {
                const ox = i * S;

                ctx.beginPath();
                pts.forEach(([x, y], j) => (j ? ctx.lineTo(ox + x, y) : ctx.moveTo(ox + x, y)));
                ctx.closePath();

                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fill();
                ctx.lineWidth   = 2;
                ctx.strokeStyle = 'rgba(255,255,255,0.95)';
                ctx.stroke();

                // A highlight caught along one face.
                const [a, b] = pts;
                ctx.beginPath();
                ctx.moveTo(ox + a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15 + 4);
                ctx.lineTo(ox + a[0] + (b[0] - a[0]) * 0.7,  a[1] + (b[1] - a[1]) * 0.7 + 4);
                ctx.lineWidth   = 1.5;
                ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                ctx.stroke();

                t.add(name, 0, ox, 0, S, S);
            });

            t.refresh();
        }
    }

    _startPbmAura(view, burst){
        if (view.aura) this._breakPbmAura(view, false);

        const { width, height } = this.scale;
        const s      = view.side;
        const edge   = s < 0 ? 0 : width;
        const inward = -s;                          // +1 on the left edge
        const ADD    = Phaser.BlendModes.ADD;
        const under  = this.pbUnderlay;

        const aura = { objects: [], emitters: [] };
        view.aura = aura;

        const keep = (obj) => { under.add(obj); aura.objects.push(obj); return obj; };

        // --- veil ---
        const veil = keep(this.add.image(edge, height / 2, 'pbVeil')
            .setOrigin(s < 0 ? 0 : 1, 0.5).setFlipX(s > 0)
            .setDisplaySize(620, height + 60).setTint(PB_DEEP).setBlendMode(ADD).setAlpha(0));
        const veilScale = veil.scaleX;

        const inner = keep(this.add.image(edge, height / 2, 'pbVeil')
            .setOrigin(s < 0 ? 0 : 1, 0.5).setFlipX(s > 0)
            .setDisplaySize(280, height + 60).setTint(PB_BLUE).setBlendMode(ADD).setAlpha(0));
        const innerScale = inner.scaleX;

        veil.scaleX  = 0;
        inner.scaleX = 0;

        this.tweens.add({
            targets:  veil,
            alpha:    0.55,
            scaleX:   veilScale,
            duration: burst ? 900 : 1200,
            ease:     burst ? 'Back.easeOut' : 'Sine.easeOut',
            onComplete: () => this.tweens.add({
                targets:  veil,
                scaleX:   veilScale * 1.14,
                alpha:    0.42,
                duration: 2600,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            }),
        });

        this.tweens.add({
            targets:  inner,
            alpha:    0.4,
            scaleX:   innerScale,
            duration: burst ? 700 : 1200,
            ease:     burst ? 'Back.easeOut' : 'Sine.easeOut',
            onComplete: () => this.tweens.add({
                targets:  inner,
                scaleX:   innerScale * 1.25,
                alpha:    0.32,
                duration: 1700,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            }),
        });

        // --- lobes: the simmering front ---
        const lobes = 8;
        for (let i = 0; i < lobes; i++){
            const y    = (height / (lobes - 1)) * i + Phaser.Math.Between(-30, 30);
            const size = Phaser.Math.Between(300, 480);
            const x    = edge + inward * Phaser.Math.Between(10, 90);

            const lobe = keep(this.add.image(x, y, 'pbGlow').setDisplaySize(size, size * 1.2)
                .setTint(Phaser.Utils.Array.GetRandom([PB_DEEP, 0x2c67e8, PB_BLUE]))
                .setBlendMode(ADD).setAlpha(0));
            const base = lobe.scaleX;
            lobe.setScale(base * 0.2);

            this.tweens.add({
                targets:  lobe,
                alpha:    Phaser.Math.FloatBetween(0.3, 0.46),
                scale:    base,
                duration: burst ? 700 : 1100,
                delay:    burst ? i * 35 : 0,
                ease:     burst ? 'Back.easeOut' : 'Sine.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets:  lobe,
                        x:        x + inward * Phaser.Math.Between(40, 110),
                        y:        y + Phaser.Math.Between(-40, 40),
                        scaleX:   base * Phaser.Math.FloatBetween(1.1, 1.35),
                        alpha:    Phaser.Math.FloatBetween(0.18, 0.36),
                        duration: Phaser.Math.Between(1800, 3200),
                        yoyo:     true,
                        repeat:   -1,
                        ease:     'Sine.easeInOut',
                    });
                },
            });
        }

        // --- corners ---
        [0, height].forEach((cy, i) => {
            const bloom = keep(this.add.image(edge, cy, 'pbGlow').setDisplaySize(760, 760)
                .setTint(0x2c67e8).setBlendMode(ADD).setAlpha(0));
            const base = bloom.scaleX;
            bloom.setScale(base * 0.3);

            this.tweens.add({
                targets:  bloom,
                alpha:    0.34,
                scale:    base,
                duration: burst ? 800 : 1100,
                ease:     burst ? 'Back.easeOut' : 'Sine.easeOut',
                onComplete: () => this.tweens.add({
                    targets:  bloom,
                    alpha:    0.2,
                    scale:    base * 1.12,
                    duration: 2200 + i * 500,
                    yoyo:     true,
                    repeat:   -1,
                    ease:     'Sine.easeInOut',
                }),
            });
        });

        // --- smoke ---
        const edgeZone = new Phaser.Geom.Rectangle(s < 0 ? -50 : width - 70, -60, 120, height + 120);
        const drift    = (lo, hi) => (s < 0 ? { min: lo, max: hi } : { min: -hi, max: -lo });

        const emit = (x, y, key, config) => {
            const e = this.add.particles(x, y, key, config);
            under.add(e);
            aura.emitters.push(e);
            return e;
        };

        // Glow: the luminous body of the wave.
        const glowSmoke = emit(0, 0, 'pbSmoke', {
            emitZone:  { type: 'random', source: edgeZone },
            speedX:    drift(30, 130),
            speedY:    { min: -22, max: 22 },
            scale:     { start: 1.1, end: 3.4 },
            alpha:     { start: 0.2, end: 0 },
            rotate:    { min: 0, max: 360 },
            lifespan:  { min: 2600, max: 4800 },
            frequency: 45,
            tint:      PB_SMOKE_TINTS,
            blendMode: 'ADD',
        });

        // Haze: slower, darker smoke that gives the glow its depth.
        emit(0, 0, 'pbSmoke', {
            emitZone:  { type: 'random', source: edgeZone },
            speedX:    drift(15, 70),
            speedY:    { min: -14, max: 14 },
            scale:     { start: 1.6, end: 4.2 },
            alpha:     { start: 0.2, end: 0 },
            rotate:    { min: 0, max: 360 },
            lifespan:  { min: 3600, max: 5600 },
            frequency: 110,
            tint:      [0x0b1f5c, 0x13307e, PB_DEEP],
        });

        // The corners roll smoke inward along both edges.
        [[0, s < 0 ? { min: 5, max: 85 } : { min: 95, max: 175 }],
         [height, s < 0 ? { min: 275, max: 355 } : { min: 185, max: 265 }]].forEach(([cy, angle]) => {
            emit(edge, cy, 'pbSmoke', {
                angle,
                speed:     { min: 40, max: 150 },
                scale:     { start: 1.3, end: 4.4 },
                alpha:     { start: 0.24, end: 0 },
                rotate:    { min: 0, max: 360 },
                lifespan:  { min: 2800, max: 4800 },
                frequency: 80,
                tint:      PB_SMOKE_TINTS,
                blendMode: 'ADD',
            });
        });

        // --- glass ---
        const glassZone = new Phaser.Geom.Rectangle(s < 0 ? 0 : width - 460, 0, 460, height);
        emit(0, 0, 'pbShards', {
            frame:     ['tri', 'dia', 'hex', 'sliver'],
            emitZone:  { type: 'random', source: glassZone },
            speedX:    drift(4, 26),
            speedY:    { min: -30, max: -6 },
            scale:     { min: 0.18, max: 0.55 },
            rotate:    {
                onEmit:   () => Phaser.Math.Between(0, 360),
                onUpdate: (p, key, t, value) => value + 0.5,
            },
            alpha:     {
                onEmit:   () => 0,
                onUpdate: (p, key, t) => Math.sin(Math.PI * t) * 0.75,
            },
            lifespan:  { min: 3200, max: 6400 },
            frequency: 120,
            tint:      PB_GLASS_TINTS,
            blendMode: 'ADD',
        });

        if (burst){
            glowSmoke.explode(46);
            this._burstPbmAura(view);
        }
    }

    // _burstPbmAura(): The entrance - energy slamming in off the side's edge.
    _burstPbmAura(view){
        const { width, height } = this.scale;
        const s      = view.side;
        const edge   = s < 0 ? 0 : width;
        const inward = -s;
        const ADD    = Phaser.BlendModes.ADD;
        const over   = this.pbOverlay;

        // A sheet of light thrown off the edge and across the stage.
        const sweep = this.add.image(edge, height / 2, 'pbVeil')
            .setOrigin(s < 0 ? 0 : 1, 0.5).setFlipX(s > 0)
            .setDisplaySize(160, height).setTint(PB_ICE).setBlendMode(ADD).setAlpha(0.95);
        over.add(sweep);
        const sweepScale = sweep.scaleX;

        this.tweens.add({
            targets:    sweep,
            scaleX:     sweepScale * 7,
            alpha:      0,
            duration:   760,
            ease:       'Cubic.easeOut',
            onComplete: () => sweep.destroy(),
        });

        const line = this.add.rectangle(edge + inward * 6, height / 2, 14, height, PB_ICE, 1)
            .setBlendMode(ADD);
        over.add(line);
        this.tweens.add({
            targets:    line,
            scaleX:     4,
            alpha:      0,
            duration:   520,
            ease:       'Cubic.easeOut',
            onComplete: () => line.destroy(),
        });

        // A storm of glass off the edge.
        const storm = this.add.particles(0, 0, 'pbShards', {
            frame:     ['tri', 'dia', 'hex', 'sliver'],
            emitZone:  { type: 'random', source: new Phaser.Geom.Rectangle(s < 0 ? -10 : width - 10, 0, 20, height) },
            angle:     s < 0 ? { min: -65, max: 65 } : { min: 115, max: 245 },
            speed:     { min: 260, max: 900 },
            scale:     { start: 0.6, end: 0.08 },
            alpha:     { start: 1, end: 0 },
            rotate:    { start: 0, end: 540 },
            lifespan:  { min: 700, max: 1400 },
            tint:      PB_GLASS_TINTS,
            blendMode: 'ADD',
            emitting:  false,
        });
        over.add(storm);
        storm.explode(80);
        this.time.delayedCall(1600, () => storm.destroy());

        // Rings off the side's card - the energy arriving where it will be spent.
        [0, 160].forEach((delay, i) => {
            const ring = this.add.circle(view.cardX, view.cardY, 60, PB_BLUE, 0)
                .setStrokeStyle(i ? 2 : 5, i ? PB_ICE : PB_BLUE, 0.95).setBlendMode(ADD).setAlpha(0);
            over.add(ring);

            this.tweens.add({
                targets:    ring,
                scale:      { from: 0.6, to: 7 },
                alpha:      { from: 1, to: 0 },
                duration:   900,
                delay,
                ease:       'Cubic.easeOut',
                onComplete: () => ring.destroy(),
            });
        });

        this.cameras.main.shake(260, 0.005);

        // The title, slammed over the card on a smoked banner and lifted away.
        // The banner keeps it legible over whatever art the card is showing.
        const banner = this.add.container(view.cardX, view.cardY - 4).setAlpha(0);
        const plate  = this.add.graphics();
        plate.fillStyle(0x030a18, 0.8);
        plate.fillRect(-230, -48, 460, 96);
        plate.fillGradientStyle(PB_DEEP, PB_DEEP, 0x030a18, 0x030a18, 0.35, 0.35, 0, 0);
        plate.fillRect(-230, -48, 460, 48);
        plate.lineStyle(2, PB_BLUE, 0.9);
        plate.lineBetween(-230, -48, 230, -48);
        plate.lineBetween(-230,  48, 230,  48);
        plate.lineStyle(1, PB_ICE, 0.35);
        plate.lineBetween(-214, -42, 214, -42);
        plate.lineBetween(-214,  42, 214,  42);
        banner.add(plate);
        over.add(banner);

        this.tweens.add({
            targets:  banner,
            alpha:    1,
            scaleX:   { from: 0.2, to: 1 },
            duration: 300,
            ease:     'Cubic.easeOut',
        });

        this.tweens.add({
            targets:    banner,
            alpha:      0,
            scaleY:     0.2,
            delay:      1800,
            duration:   420,
            ease:       'Cubic.easeIn',
            onComplete: () => banner.destroy(),
        });

        const title = this.add.text(view.cardX, view.cardY - 24, 'PATTERN BONUS MODE', {
            fontFamily: 'monospace', fontSize: '34px', fontStyle: 'bold',
            color: PB_ICE_HEX, stroke: '#061a48', strokeThickness: 7,
        }).setOrigin(0.5).setAlpha(0).setScale(1.9);

        const sub = this.add.text(view.cardX, view.cardY + 18, `${view.total} ATTACK BASE MOVES`, {
            fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold',
            color: PB_BLUE_HEX, stroke: '#04101f', strokeThickness: 4,
        }).setOrigin(0.5).setAlpha(0);

        over.add([title, sub]);
        this._fxGlow(title, PB_BLUE, 3);

        this.tweens.add({
            targets:  title,
            alpha:    1,
            scale:    1,
            duration: 360,
            ease:     'Back.easeOut',
        });

        this.tweens.add({
            targets:  sub,
            alpha:    1,
            y:        { from: view.cardY + 34, to: view.cardY + 18 },
            duration: 320,
            delay:    220,
            ease:     'Cubic.easeOut',
        });

        this.tweens.add({
            targets:    [title, sub],
            alpha:      0,
            y:          `-=40`,
            delay:      1700,
            duration:   520,
            ease:       'Cubic.easeIn',
            onComplete: () => { title.destroy(); sub.destroy(); },
        });
    }

    // _breakPbmAura(): The mode's moves are spent. The wave flickers, cracks
    // and falls apart as glass; the smoke is cut off at the source and left to
    // thin out on its own. `burst` false just fades it (a resync).
    _breakPbmAura(view, burst){
        const aura = view.aura;
        if (!aura) return;
        view.aura = null;

        aura.emitters.forEach((e) => e.stop());
        this.time.delayedCall(6000, () => aura.emitters.forEach((e) => e.destroy()));

        aura.objects.forEach((obj) => {
            this.tweens.killTweensOf(obj);

            if (!burst){
                this.tweens.add({
                    targets:    obj,
                    alpha:      0,
                    duration:   600,
                    onComplete: () => obj.destroy(),
                });
                return;
            }

            // One flare, then the collapse back into the edge.
            this.tweens.chain({
                targets: obj,
                tweens: [
                    { alpha: Math.min(1, obj.alpha * 2.2 + 0.1), duration: 90, yoyo: true, repeat: 1 },
                    { alpha: 0, scaleX: obj.scaleX * 0.15, duration: 520, ease: 'Cubic.easeIn' },
                ],
                onComplete: () => obj.destroy(),
            });
        });

        if (!burst) return;

        const { width, height } = this.scale;
        const s      = view.side;
        const edge   = s < 0 ? 0 : width;
        const inward = -s;
        const ADD    = Phaser.BlendModes.ADD;
        const over   = this.pbOverlay;

        // Cracks racing across the wave just before it goes.
        const cracks = this.add.graphics().setBlendMode(ADD);
        over.add(cracks);

        for (let c = 0; c < 7; c++){
            let x = edge;
            let y = Phaser.Math.Between(40, height - 40);

            cracks.lineStyle(c % 2 ? 1.5 : 2.5, PB_ICE, 0.95);
            cracks.beginPath();
            cracks.moveTo(x, y);

            const steps = Phaser.Math.Between(4, 7);
            for (let k = 0; k < steps; k++){
                x += inward * Phaser.Math.Between(36, 80);
                y += Phaser.Math.Between(-46, 46);
                cracks.lineTo(x, y);
            }
            cracks.strokePath();
        }

        this.tweens.add({
            targets:    cracks,
            alpha:      { from: 1, to: 0 },
            duration:   620,
            delay:      120,
            ease:       'Cubic.easeIn',
            onComplete: () => cracks.destroy(),
        });

        // The wave breaking into glass - shards fall away and turn as they go.
        for (let i = 0; i < 70; i++){
            const depth = Math.pow(Math.random(), 1.6) * 420;     // denser near the edge
            const x     = edge + inward * depth;
            const y     = Phaser.Math.Between(0, height);

            const shard = this.add.image(x, y, 'pbShards',
                Phaser.Utils.Array.GetRandom(['tri', 'dia', 'hex', 'sliver']))
                .setScale(Phaser.Math.FloatBetween(0.25, 0.8))
                .setAngle(Phaser.Math.Between(0, 360))
                .setTint(Phaser.Utils.Array.GetRandom(PB_GLASS_TINTS))
                .setBlendMode(ADD).setAlpha(0);
            over.add(shard);

            const delay = 140 + (depth / 420) * 220 + Phaser.Math.Between(0, 120);

            this.tweens.add({
                targets:  shard,
                alpha:    { from: 0, to: 0.95 },
                duration: 80,
                delay,
            });

            this.tweens.add({
                targets:    shard,
                x:          x + inward * Phaser.Math.Between(-40, 140),
                y:          y + Phaser.Math.Between(140, 420),
                angle:      shard.angle + Phaser.Math.Between(-320, 320),
                scale:      shard.scale * 0.3,
                alpha:      0,
                duration:   Phaser.Math.Between(900, 1500),
                delay:      delay + 80,
                ease:       'Quad.easeIn',
                onComplete: () => shard.destroy(),
            });
        }

        const spent = this.add.text(view.cardX, view.cardY - 24, 'PATTERN BONUS SPENT', {
            fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
            color: PB_BLUE_HEX, stroke: '#04101f', strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0);
        over.add(spent);

        this.tweens.add({
            targets:  spent,
            alpha:    1,
            duration: 200,
            delay:    200,
        });

        this.tweens.add({
            targets:    spent,
            alpha:      0,
            y:          view.cardY - 60,
            delay:      1200,
            duration:   500,
            ease:       'Cubic.easeIn',
            onComplete: () => spent.destroy(),
        });
    }

    // ------------------------------------------------------------- the arena --
    // _buildArena(): The two Initiators, facing each other across the stage -
    // the player on the left and the opponent on the right, the sides the
    // header and the SP panel already put them on.
    //
    // They are set far apart on purpose. Everything an attack has to say
    // happens in the gap between them: the lunge out, the sparks off the hit
    // edge, the recoil and the walk back. Crowd the cards together and the
    // whole exchange collapses into a twitch.
    _buildArena(width, height){
        const cy = Math.round(height * ARENA_CENTER_Y) + CARD_DROP;

        this.playerSlot = this._buildSlot(width / 2 - CARD_GAP / 2, cy, YOU_ACCENT, YOU_ACCENT_HEX, -1, 'YOU',      1180);
        this.oppSlot    = this._buildSlot(width / 2 + CARD_GAP / 2, cy, OPP_ACCENT, OPP_ACCENT_HEX, +1, 'OPPONENT', 1320);
    }

    // _buildSlot(): One fighter's station. `side` is which half of the stage it
    // stands on (-1 left, +1 right) and `facing` is the way it attacks, which
    // is simply the other one - every lunge, recoil and spark direction in the
    // arena is derived from it rather than from another left/right conditional.
    //
    // The furniture built here lasts the whole match; only the face inside it
    // (art, name, category) is redrawn, and only when the active card changes.
    _buildSlot(x, y, accent, accentHex, side, tag, delay){
        const w = CARD_W;
        const h = CARD_H;

        const root = this.add.container(x, y).setAlpha(0);

        const flash = this._drawCardGlass(root, w, h, accent);

        // Side tag, always on the top right opposite the category pill. It does
        // not mirror with `side`: mirrored, it lands on top of the pill on the
        // opponent's card and the two labels overprint each other.
        const tagText = this.add.text(w / 2 - 16, -h / 2 + 17, tag, {
            fontFamily: 'monospace', fontSize: '10px', color: accentHex,
        }).setOrigin(1, 0.5).setAlpha(0.6);

        const face = this.add.container(0, 0);
        root.add([face, tagText]);

        // --- ESSE ---
        const barW = w - 60;

        const barBg = this.add.rectangle(-barW / 2, 70, barW, 14, 0x16202c, 0.95).setOrigin(0, 0.5);
        barBg.setStrokeStyle(1, accent, 0.25);

        // Scaled, never resized: assigning .width on a Shape updates the number
        // but not the geometry it draws from, so the bar would never move.
        const barFill = this.add.rectangle(-barW / 2, 70, barW, 14, accent, 1).setOrigin(0, 0.5);

        const ticks = this.add.graphics();
        ticks.lineStyle(1, 0x070c12, 0.8);
        for (let i = 1; i < 10; i++){
            const tx = -barW / 2 + (barW / 10) * i;
            ticks.beginPath();
            ticks.moveTo(tx, 63);
            ticks.lineTo(tx, 77);
            ticks.strokePath();
        }

        const esseText = this.add.text(0, 92, '', {
            fontFamily: 'monospace', fontSize: '12px', color: '#93a7b8',
        }).setOrigin(0.5);

        root.add([barBg, barFill, ticks, esseText]);

        // --- stat strip ---
        const stats = {};
        const step  = (w - 48) / 3;

        [['ATK', 'atk', '#ff8f8f'], ['DEF', 'def', '#9be7c4'], ['SP', 'sp', accentHex]]
            .forEach(([label, key, hex], i) => {
                const sx = -w / 2 + 24 + step * (i + 0.5);

                stats[key] = this.add.text(sx, 124, '—', {
                    fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: hex,
                }).setOrigin(0.5);

                root.add([stats[key], this.add.text(sx, 142, label, {
                    fontFamily: 'monospace', fontSize: '8px', color: '#7f97a8',
                }).setOrigin(0.5).setAlpha(0.75)]);
            });

        // --- defending ---
        // A gold ring around the whole card plus a badge on the divider line,
        // so a braced fighter is legible from the shape of the card alone.
        const defendRing = this.add.graphics();
        defendRing.lineStyle(2, 0xffdd55, 0.85);
        defendRing.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
        defendRing.setVisible(false);

        const defendBadge = this.add.container(0, 48).setVisible(false);
        const badgeText   = this.add.text(0, 0, 'DEFENDING', {
            fontFamily: 'monospace', fontSize: '10px', color: '#ffdd55',
        }).setOrigin(0.5);
        const badgeBg = this.add.graphics();
        badgeBg.fillStyle(0x2a2208, 0.95);
        badgeBg.fillRoundedRect(-badgeText.width / 2 - 10, -9, badgeText.width + 20, 18, 9);
        badgeBg.lineStyle(1, 0xffdd55, 0.6);
        badgeBg.strokeRoundedRect(-badgeText.width / 2 - 10, -9, badgeText.width + 20, 18, 9);
        defendBadge.add([badgeBg, badgeText]);

        root.add([defendRing, defendBadge]);

        this.tweens.add({
            targets:  defendRing,
            alpha:    0.3,
            duration: 900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        const slot = {
            root, face, flash, accent, accentHex, side,
            facing:  -side,            // the way this card attacks
            homeX:   x,
            homeY:   y,
            barW, barFill, esseText, stats, defendRing, defendBadge,
            cardId:    null,
            esseShown: 0,
            esseTween: null,
            shake:     null,
            motion:    null,
        };

        // Walks on after the two panels have landed.
        this.tweens.add({
            targets:  root,
            alpha:    1,
            y:        { from: y + 48, to: y },
            duration: 720,
            delay,
            ease:     'Back.easeOut',
        });

        return slot;
    }

    // _drawCardGlass(): The card's shell, in the language the header and the SP
    // panel are built in - bloom, smoked body, inner highlight, a double
    // hairline border and corner brackets, all in this side's accent. Returns
    // the additive flash laid over it, which a hit lights.
    _drawCardGlass(card, w, h, accent){
        const bloom = this.add.rectangle(0, 0, w + 26, h + 26, accent, 0.06).setAlpha(0.5);
        const body  = this.add.rectangle(0, 0, w, h, 0x070c12, 0.76);
        const inner = this.add.ellipse(0, -24, w * 0.86, h * 0.62, 0x14232b, 0.26);

        // Lit from the base, so the card sits in the floor pool behind it
        // instead of floating over the plate.
        const footing = this.add.rectangle(0, h / 2 - 54, w - 12, 108, accent, 0.05);
        const sheen   = this.add.rectangle(0, -h / 2 + 9, w - 26, 12, 0xaaffee, 0.07);

        const border = this.add.graphics();
        border.lineStyle(2, accent, 0.45);
        border.strokeRect(-w / 2, -h / 2, w, h);
        border.lineStyle(1, 0xffffff, 0.09);
        border.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);

        const corners = this.add.graphics();
        const cLen = 20;
        [
            [-w / 2, -h / 2,  1,  1],
            [ w / 2, -h / 2, -1,  1],
            [-w / 2,  h / 2,  1, -1],
            [ w / 2,  h / 2, -1, -1],
        ].forEach(([cx, cy, hd, vd]) => {
            corners.lineStyle(3, accent, 0.9);
            corners.beginPath();
            corners.moveTo(cx + hd * cLen, cy);
            corners.lineTo(cx, cy);
            corners.lineTo(cx, cy + vd * cLen);
            corners.strokePath();
            corners.fillStyle(accent, 1);
            corners.fillCircle(cx, cy, 3.5);
        });

        const flash = this.add.rectangle(0, 0, w, h, 0xffffff, 0.35).setAlpha(0);

        card.add([bloom, body, footing, inner, sheen, border, corners, flash]);

        this.tweens.add({
            targets:  bloom,
            alpha:    0.95,
            scaleX:   1.02,
            scaleY:   1.015,
            duration: 2600,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        return flash;
    }

    // _drawCardFace(): Category, art and name for whichever card is currently in
    // the arena. Torn down and redrawn on a swap or a knockout, which is the one
    // time the card in front of the player actually changes.
    _drawCardFace(slot, card){
        const cat = CATEGORY[card.cate] || CATEGORY.Bonum;
        const w   = CARD_W;
        const h   = CARD_H;

        slot.face.removeAll(true);

        // Category pill, sized to its own label.
        const pill = this.add.text(-w / 2 + 20, -h / 2 + 17, cat.label, {
            fontFamily: 'monospace', fontSize: '9px', color: cat.hex,
        }).setOrigin(0, 0.5);

        const pillBg = this.add.graphics();
        pillBg.fillStyle(cat.accent, 0.10);
        pillBg.lineStyle(1, cat.accent, 0.4);
        pillBg.fillRoundedRect(-w / 2 + 14, -h / 2 + 8, pill.width + 14, 18, 4);
        pillBg.strokeRoundedRect(-w / 2 + 14, -h / 2 + 8, pill.width + 14, 18, 4);

        slot.face.add([pillBg, pill]);

        this._drawArenaArt(slot, card, cat);

        slot.face.add(this.add.text(0, 28, String(card.shortName || card.name).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold',
            color: '#f2f6f8', stroke: '#04121a', strokeThickness: 4,
        }).setOrigin(0.5));

        const divider = this.add.graphics();
        divider.lineStyle(1, slot.accent, 0.22);
        divider.beginPath();
        divider.moveTo(-w / 2 + 24, 48);
        divider.lineTo( w / 2 - 24, 48);
        divider.strokePath();
        slot.face.add(divider);

        slot.cardId = card.id;

        // The new face rises into the frame rather than appearing in it.
        this.tweens.add({
            targets:  slot.face,
            alpha:    { from: 0, to: 1 },
            y:        { from: 14, to: 0 },
            duration: 340,
            ease:     'Cubic.easeOut',
        });
    }

    // _drawArenaArt(): The Initiator itself - its texture when one is loaded,
    // and the monogram disc the find-match panels fall back to when it is not.
    // Only three of the ten cards have art, so the fallback is the common path.
    _drawArenaArt(slot, card, cat){
        const maxW = CARD_W - 68;
        const maxH = 142;
        const cy   = -56;

        if (card.name && this.textures.exists(card.name)){
            const src   = this.textures.get(card.name).getSourceImage();
            const scale = Math.min(maxW / src.width, maxH / src.height);
            const art   = this.add.image(0, cy, card.name).setScale(scale);

            slot.face.add(art);

            this.tweens.add({
                targets:  art,
                scale:    scale * 1.05,
                duration: 3000,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });
            return;
        }

        const r    = 54;
        const disc = this.add.circle(0, cy, r, 0x0b1a1e, 0.9).setStrokeStyle(2, cat.accent, 0.7);
        const halo = this.add.circle(0, cy, r + 12, cat.accent, 0.06);
        const mono = this.add.text(0, cy, String(card.shortName || card.name || '?').charAt(0).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '58px', fontStyle: 'bold', color: cat.hex,
        }).setOrigin(0.5);

        slot.face.add([halo, disc, mono]);

        this.tweens.add({
            targets:  [disc, halo],
            scale:    1.06,
            duration: 2000,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // ------------------------------------------------------------- deck row --
    // _buildDeckRow(): The player's four Initiators on a glass shelf under the
    // arena, each one showing its own art.
    //
    // Repositioning is a sub-move, so these stay live on the opponent's turn
    // too - the only things that close them are the budget, a defeated card,
    // the card already standing in the arena, and the end of the match. The
    // turn order has no say here, which is why the cells go through _sendSwap()
    // rather than _send(); _send() exists to hold base moves to the turn.
    _buildDeckRow(width, height){
        const panelW = DECK_PAD * 2 + DECK_CELL_W * 4 + DECK_CELL_GAP * 3;
        const panelH = DECK_PAD * 2 + DECK_CELL_H;

        const panel = this.add.container(width / 2, height + panelH).setAlpha(0);
        this.deckPanel = panel;

        this._drawCardGlass(panel, panelW, panelH, YOU_ACCENT);
        this._drawDeckTab(panel, panelH);

        this.deckSlots = [];

        const firstX = -panelW / 2 + DECK_PAD + DECK_CELL_W / 2;

        for (let i = 0; i < 4; i++){
            const cx = firstX + i * (DECK_CELL_W + DECK_CELL_GAP);
            this.deckSlots.push(this._buildDeckCell(panel, cx, i));
        }

        this.tweens.add({
            targets:  panel,
            y:        DECK_ROW_Y,
            alpha:    1,
            duration: 780,
            delay:    1460,          // last of the four panels to arrive
            ease:     'Back.easeOut',
        });
    }

    // _drawDeckTab(): 'YOUR DECK' on the shelf's bottom edge, with the swap
    // budget beside it - the one reading that says whether these cells will
    // answer at all. It hangs off the bottom because a hovered cell lifts clear
    // of the top edge, and would sit on a tab that was up there.
    _drawDeckTab(panel, panelH){
        const edge = panelH / 2;

        const label = this.add.text(0, edge, 'YOUR DECK', {
            fontFamily: 'monospace', fontSize: '11px', color: '#7f97a8',
        }).setOrigin(0, 0.5);

        // Sized against the longest reading it will ever hold, so the pill does
        // not change width under the text as the budget is spent and refreshed.
        this.swapStatus = this.add.text(0, edge, 'SWAP READY', {
            fontFamily: 'monospace', fontSize: '10px', color: YOU_ACCENT_HEX,
        }).setOrigin(1, 0.5);

        const tabW = label.width + this.swapStatus.width + 44;

        label.x           = -tabW / 2 + 14;
        this.swapStatus.x =  tabW / 2 - 14;

        const tab = this.add.graphics();
        tab.fillStyle(0x07121a, 0.92);
        tab.fillRoundedRect(-tabW / 2, edge - 11, tabW, 22, 11);
        tab.lineStyle(1, YOU_ACCENT, 0.28);
        tab.strokeRoundedRect(-tabW / 2, edge - 11, tabW, 22, 11);

        const split = this.add.graphics();
        split.lineStyle(1, YOU_ACCENT, 0.2);
        split.beginPath();
        split.moveTo(label.x + label.width + 8, edge - 7);
        split.lineTo(label.x + label.width + 8, edge + 7);
        split.strokePath();

        panel.add([tab, split, label, this.swapStatus]);
    }

    // _buildDeckCell(): One bench slot. The furniture is permanent; the face
    // inside it is redrawn whenever the card in this position changes, which is
    // the only time any of it moves.
    _buildDeckCell(panel, cx, index){
        const w = DECK_CELL_W;
        const h = DECK_CELL_H;

        const cell = this.add.container(cx, 0);
        panel.add(cell);

        const glow = this.add.rectangle(0, 0, w + 16, h + 16, YOU_ACCENT, 0.18).setAlpha(0);

        const body = this.add.graphics();
        body.fillStyle(0x0b141c, 0.72);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, 10);

        const frame = this.add.graphics();

        const face = this.add.container(0, 0);

        // Sits over the face and carries the state word: IN ARENA, DOWN, or the
        // reason a cell will not answer right now.
        const veil = this.add.graphics();
        veil.fillStyle(0x04080c, 0.62);
        veil.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
        veil.setVisible(false);

        const state = this.add.text(0, -h / 2 + 9, '', {
            fontFamily: 'monospace', fontSize: '9px', color: '#7f97a8',
        }).setOrigin(0.5);

        cell.add([glow, body, frame, face, veil, state]);

        // The hit area is a plain rectangle over the whole cell rather than the
        // rounded body: Graphics carries no input shape of its own.
        const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0);
        cell.add(hit);

        const slot = {
            cell, face, glow, frame, veil, state, hit, index,
            cardId: null, selectable: false, hovering: false,
        };

        hit.on('pointerover', () => this._hoverDeckCell(slot, true));
        hit.on('pointerout',  () => this._hoverDeckCell(slot, false));
        hit.on('pointerdown', () => this._chooseDeckCell(slot));

        return slot;
    }

    // _hoverDeckCell(): The lift. Only a cell that would actually answer is
    // allowed to rise - a dead cell that animates under the cursor is a promise
    // the board cannot keep.
    _hoverDeckCell(slot, over){
        if (over && !slot.selectable) return;

        slot.hovering = over;

        this.tweens.add({
            targets:  slot.cell,
            y:        over ? -12 : 0,
            scale:    over ? 1.06 : 1,
            duration: over ? 220 : 260,
            ease:     over ? 'Back.easeOut' : 'Cubic.easeOut',
        });

        this.tweens.add({
            targets:  slot.glow,
            alpha:    over ? 1 : 0,
            duration: 220,
            ease:     'Sine.easeOut',
        });
    }

    // _chooseDeckCell(): Send the card in. The cell punches, a ring leaves it,
    // and a ghost of the card flies up to the arena frame it is about to fill,
    // so the swap reads as this card going in rather than the arena simply
    // changing its mind.
    _chooseDeckCell(slot){
        if (!slot.selectable || slot.cardId == null) return;

        slot.hovering = false;
        this.tweens.killTweensOf(slot.cell);

        this.tweens.add({
            targets:  slot.cell,
            y:        0,
            scale:    { from: 1.16, to: 1 },
            duration: 320,
            ease:     'Back.easeOut',
        });

        this.tweens.add({ targets: slot.glow, alpha: 0, duration: 260 });

        const originX = this.deckPanel.x + slot.cell.x;
        const originY = this.deckPanel.y;

        const ring = this.add.circle(originX, originY, DECK_CELL_W / 2, YOU_ACCENT, 0)
            .setStrokeStyle(2, YOU_ACCENT, 0.9);

        this.tweens.add({
            targets:    ring,
            scale:      1.9,
            alpha:      0,
            duration:   480,
            ease:       'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });

        const ghost = this.add.rectangle(originX, originY, DECK_CELL_W, DECK_CELL_H, YOU_ACCENT, 0.12)
            .setStrokeStyle(2, YOU_ACCENT, 0.8);

        this.tweens.add({
            targets:    ghost,
            x:          this.playerSlot?.homeX ?? originX,
            y:          this.playerSlot?.homeY ?? originY,
            scaleX:     CARD_W / DECK_CELL_W,
            scaleY:     CARD_H / DECK_CELL_H,
            alpha:      0,
            duration:   520,
            ease:       'Cubic.easeIn',
            onComplete: () => ghost.destroy(),
        });

        this._sendSwap(slot.cardId);
    }

    // _renderDeck(): Put the player's bench on the shelf.
    //
    // Nothing here consults the turn: a swap is a sub-move, so the only things
    // that can close a cell are the budget, the card being down, the card
    // already being in the arena, and the match being over.
    _renderDeck(you){
        if (!you || !this.deckSlots) return;

        const swapsLeft = you.swapsLeft ?? 0;
        const spent     = swapsLeft <= 0;

        this.swapStatus?.setText(this.finished ? '' : spent ? 'SWAP USED' : 'SWAP READY');
        this.swapStatus?.setColor(spent ? '#7f97a8' : YOU_ACCENT_HEX);

        you.cards.forEach((card, i) => {
            const slot = this.deckSlots[i];
            if (!slot) return;

            if (card.id !== slot.cardId) this._drawDeckFace(slot, card);

            const active     = card.id === you.activeCardId;
            const selectable = !card.defeated && !active && !spent
                            && !this.finished && !this.swapBusy;

            slot.selectable = selectable;

            slot.state.setText(card.defeated ? 'DOWN' : active ? 'IN ARENA' : selectable ? 'SWAP IN' : 'HELD');
            slot.state.setColor(card.defeated ? '#aa4466' : active ? YOU_ACCENT_HEX : selectable ? '#cfe8f5' : '#5d7180');

            slot.veil.setVisible(card.defeated || active);
            slot.face.setAlpha(card.defeated ? 0.35 : 1);

            slot.frame.clear();
            slot.frame.lineStyle(
                active ? 2 : 1.5,
                card.defeated ? 0x442233 : active ? YOU_ACCENT : selectable ? 0x5f8fa8 : 0x2b3947,
                active ? 0.95 : selectable ? 0.75 : 0.5,
            );
            slot.frame.strokeRoundedRect(-DECK_CELL_W / 2, -DECK_CELL_H / 2, DECK_CELL_W, DECK_CELL_H, 10);

            if (selectable) slot.hit.setInteractive({ useHandCursor: true });
            else {
                slot.hit.disableInteractive();
                if (slot.hovering) this._hoverDeckCell(slot, false);
            }
        });
    }

    // _drawDeckFace(): Art, name and stats for whichever card sits in this cell.
    _drawDeckFace(slot, card){
        const cat = CATEGORY[card.cate] || CATEGORY.Bonum;
        const w   = DECK_CELL_W;
        const h   = DECK_CELL_H;

        slot.face.removeAll(true);
        slot.cardId = card.id;

        // Art, on the same keys the arena and the find-match panels use.
        if (card.name && this.textures.exists(card.name)){
            const src   = this.textures.get(card.name).getSourceImage();
            const scale = Math.min((w - 34) / src.width, 66 / src.height);

            slot.face.add(this.add.image(0, -24, card.name).setScale(scale));
        }
        else {
            const disc = this.add.circle(0, -24, 27, 0x0b1a1e, 0.9).setStrokeStyle(2, cat.accent, 0.7);
            const mono = this.add.text(0, -24, String(card.shortName || card.name || '?').charAt(0).toUpperCase(), {
                fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: cat.hex,
            }).setOrigin(0.5);

            slot.face.add([disc, mono]);
        }

        // Category stripe down the outboard edge - enough to tell the three
        // apart at a glance without spending room on another pill.
        const stripe = this.add.rectangle(-w / 2 + 5, -24, 3, 66, cat.accent, 0.75);

        const name = this.add.text(0, 22, String(card.shortName || card.name).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '11px', color: '#e8f1f6',
        }).setOrigin(0.5);

        // ESSE, as a bar rather than a number - four of these are read at a
        // glance, and a bar answers 'which of my cards is hurt' fastest.
        const barW = w - 32;
        const pct  = Phaser.Math.Clamp(card.esse / (card.maxEsse || 100), 0, 1);

        const barBg = this.add.rectangle(-barW / 2, 40, barW, 7, 0x16202c, 0.95).setOrigin(0, 0.5);
        const bar   = this.add.rectangle(-barW / 2, 40, barW, 7, YOU_ACCENT, 1).setOrigin(0, 0.5);
        bar.scaleX  = pct;
        bar.setFillStyle(pct > 0.5 ? YOU_ACCENT : pct > 0.25 ? 0xffaa00 : 0xff3344);

        const stats = this.add.text(0, 55, `${card.atk} / ${card.def}`, {
            fontFamily: 'monospace', fontSize: '10px', color: '#8fa8bb',
        }).setOrigin(0.5);

        slot.face.add([stripe, name, barBg, bar, stats]);

        this.tweens.add({
            targets:  slot.face,
            alpha:    { from: 0, to: 1 },
            duration: 280,
            ease:     'Cubic.easeOut',
        });
    }

    // ---------------------------------------------------- singularity cards --
    // _buildSingularityCardPanel(): The Singularity Card station - three slots
    // for the cards this player has bought and the BUY button that opens the
    // store. It is built to outrank the other panels: a deeper glass with a
    // nebula lit through it, a gold hairline inside the violet frame, a field
    // of stars and a turning event-horizon mark in its header.
    //
    // It slides in from the left edge once every other panel has landed, then
    // ignites - the frame flashes and the slots light one after another.
    //
    // The rules stay the server's. A purchase and a play are intents
    // (Net.buySingularityCard / Net.useSingularityCard), and the card's effect is
    // only ever played off a 'singularity:used' event, so both players see it at
    // the same beat - see _playSingularityCard().
    _buildSingularityCardPanel(){
        const w = SC_PANEL_W;
        const h = SC_PANEL_H;

        const panel = this.add.container(-w, SC_PANEL_Y).setAlpha(0);
        this.scPanel = panel;

        this.scFlash  = this._drawSingularityGlass(panel, w, h);
        this.scEmblem = this._drawSingularityHeader(panel, w, h);

        const step = SC_SLOT_W + SC_SLOT_GAP;

        this.scSlots = [];
        for (let i = 0; i < SC_SLOTS; i++){
            this.scSlots.push(this._buildSingularitySlot(panel, (i - (SC_SLOTS - 1) / 2) * step, i));
        }

        this.scBuy = this._buildSingularityBuy(panel);
        this.scTip = this._buildSingularityTip(panel, h);

        this.tweens.add({
            targets:    panel,
            x:          SC_PANEL_X,
            alpha:      1,
            duration:   860,
            delay:      1640,        // after the deck shelf, the last of the others
            ease:       'Back.easeOut',
            onComplete: () => this._igniteSingularityPanel(),
        });
    }

    // _drawSingularityGlass(): The station's shell, also used for the store. The
    // frame language is the header's - bloom, smoked body, sheen, double border,
    // corner brackets, a travelling glint - pushed further: two blooms breathing
    // out of step, a drifting nebula under the glass and a star field in it.
    //
    // Returns the additive flash laid over it. `opacity` is the body's - the
    // store sits over the whole HUD, and needs more of it than the station.
    _drawSingularityGlass(panel, w, h, opacity = 0.76){
        const outer = this.add.rectangle(0, 0, w + 38, h + 38, SC_ACCENT, 0.07).setAlpha(0.5);
        const bloom = this.add.rectangle(0, 0, w + 14, h + 14, SC_GOLD, 0.05).setAlpha(0.35);
        const body  = this.add.rectangle(0, 0, w, h, 0x07051a, opacity);

        // Two haze pools drifting against each other. Additive, so they lift the
        // glass toward violet and blue rather than greying it; each is three
        // nested ellipses so it falls off rather than ending on a hard edge.
        // Sized so that neither can drift past the frame.
        const haze = (x, y, hw, hh, color, a) => {
            const pool = this.add.container(x, y);
            [[1, 0.35], [0.72, 0.35], [0.45, 0.3]].forEach(([k, share]) => {
                pool.add(this.add.ellipse(0, 0, hw * k, hh * k, color, a * share)
                    .setBlendMode(Phaser.BlendModes.ADD));
            });
            return pool;
        };

        const hazeA = haze(-w * 0.2, -h * 0.08, w * 0.5, h * 0.72, 0x7a3cff, 0.2);
        const hazeB = haze( w * 0.22, h * 0.14, w * 0.42, h * 0.6, 0x2f7bff, 0.16);

        const sheen = this.add.rectangle(0, -h / 2 + 9, w - 28, 12, 0xe6d6ff, 0.07);

        // The star field. Each one twinkles on its own clock, so the field never
        // pulses as a block.
        const stars = this.add.container(0, 0);
        const count = Math.round((w * h) / 9000);

        for (let i = 0; i < count; i++){
            const star = this.add.circle(
                Phaser.Math.Between(-w / 2 + 12, w / 2 - 12),
                Phaser.Math.Between(-h / 2 + 12, h / 2 - 12),
                Phaser.Math.FloatBetween(0.6, 1.5), 0xffffff, 1,
            ).setAlpha(Phaser.Math.FloatBetween(0.08, 0.3));

            stars.add(star);

            this.tweens.add({
                targets:  star,
                alpha:    Phaser.Math.FloatBetween(0.45, 0.8),
                duration: Phaser.Math.Between(900, 2400),
                delay:    Phaser.Math.Between(0, 2400),
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });
        }

        const border = this.add.graphics();
        border.lineStyle(2, SC_ACCENT, 0.55);
        border.strokeRect(-w / 2, -h / 2, w, h);
        border.lineStyle(1, SC_GOLD, 0.22);
        border.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);

        // Gold brackets set on violet studs - the corners are where the station
        // spends its gold, so the frame reads as premium without going brassy.
        const corners = this.add.graphics();
        const cLen = 24;
        [
            [-w / 2, -h / 2,  1,  1],
            [ w / 2, -h / 2, -1,  1],
            [-w / 2,  h / 2,  1, -1],
            [ w / 2,  h / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            corners.fillStyle(SC_ACCENT, 0.25);
            corners.fillCircle(x, y, 9);
            corners.lineStyle(3, SC_GOLD, 0.95);
            corners.beginPath();
            corners.moveTo(x + hd * cLen, y);
            corners.lineTo(x, y);
            corners.lineTo(x, y + vd * cLen);
            corners.strokePath();
            corners.fillStyle(0xffffff, 1);
            corners.fillCircle(x, y, 3.5);
        });

        // The same banded glint the header carries, on a slower clock.
        const glint = this.add.container(-w / 2 + 50, 0).setAlpha(0);
        [[96, 0.02], [60, 0.028], [26, 0.035]].forEach(([bw, a]) => {
            glint.add(this.add.rectangle(0, 0, bw, h - 18, 0xf0e4ff, a)
                .setBlendMode(Phaser.BlendModes.ADD));
        });

        const flash = this.add.rectangle(0, 0, w, h, 0xf3eaff, 0.35).setAlpha(0);

        panel.add([outer, bloom, body, hazeA, hazeB, stars, sheen, glint, border, corners, flash]);

        // The two blooms breathe out of step - one violet, one gold - so the
        // edge of the panel shimmers instead of simply pulsing.
        this.tweens.add({
            targets:  outer,
            alpha:    1,
            scaleX:   1.018,
            scaleY:   1.03,
            duration: 2200,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        this.tweens.add({
            targets:  bloom,
            alpha:    0.9,
            duration: 1700,
            delay:    600,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        [[hazeA, w * 0.04], [hazeB, -w * 0.04]].forEach(([pool, dx], i) => {
            this.tweens.add({
                targets:  pool,
                x:        pool.x + dx,
                scaleX:   1.06,
                duration: 5200 + i * 1400,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });
        });

        this.tweens.add({
            targets:     glint,
            x:           w / 2 - 50,
            duration:    3000,
            repeat:      -1,
            repeatDelay: 3400,
            ease:        'Sine.easeInOut',
        });

        this.tweens.add({
            targets:     glint,
            alpha:       { from: 0, to: 1 },
            duration:    1500,
            yoyo:        true,
            repeat:      -1,
            repeatDelay: 3400,
            ease:        'Sine.easeInOut',
        });

        return flash;
    }

    // _drawSingularityHeader(): The event-horizon mark, the station's name and
    // the SP bank the BUY button spends from, over a hairline divider.
    _drawSingularityHeader(panel, w, h){
        const y = -h / 2 + 30;

        // --- the mark: a black core, a tilted accretion disk and a photon
        // ring turning around it ---
        const mark = this.add.container(-w / 2 + 42, y);

        const halo = this.add.circle(0, 0, 20, SC_ACCENT, 0.1)
            .setBlendMode(Phaser.BlendModes.ADD);

        const disk = this.add.graphics();
        disk.lineStyle(2, SC_GOLD, 0.6);
        disk.strokeEllipse(0, 0, 48, 13);
        disk.lineStyle(1, SC_GOLD, 0.2);
        disk.strokeEllipse(0, 0, 58, 17);
        disk.setAngle(-18);

        const core = this.add.circle(0, 0, 8, 0x000000, 1).setStrokeStyle(1.5, 0xe6d6ff, 0.9);

        const ring = this.add.graphics();
        ring.lineStyle(2, 0xe6d6ff, 0.8);
        [0, Math.PI].forEach((a) => {
            ring.beginPath();
            ring.arc(0, 0, 14, a, a + 1.3);
            ring.strokePath();
        });

        mark.add([halo, disk, core, ring]);

        // --- the name ---
        const titleX = -w / 2 + 88;

        const title = this.add.text(titleX, y - 8, 'SINGULARITY', {
            fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
            color: '#f3eaff', stroke: '#0a0620', strokeThickness: 4,
        }).setOrigin(0, 0.5).setLetterSpacing(4);

        this._fxGlow(title, SC_ACCENT, 1.5);

        const subtitle = this.add.text(titleX, y + 13, 'CARD STATION  ·  3 SLOTS', {
            fontFamily: 'monospace', fontSize: '10px', color: '#8f7fb8',
        }).setOrigin(0, 0.5).setLetterSpacing(1);

        // --- the bank ---
        const bankX = w / 2 - 26;

        const bankLabel = this.add.text(bankX, y - 10, 'BANK', {
            fontFamily: 'monospace', fontSize: '10px', color: '#8f7fb8',
        }).setOrigin(1, 0.5).setLetterSpacing(2);

        this.scBankText = this.add.text(bankX, y + 10, '0 SP', {
            fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
            color: SC_GOLD_HEX, stroke: '#0a0620', strokeThickness: 4,
        }).setOrigin(1, 0.5);

        // --- the divider: faint across, gold at the centre, a diamond on it ---
        const dy = -h / 2 + 60;

        const divider = this.add.graphics();
        divider.lineStyle(1, SC_ACCENT, 0.2);
        divider.beginPath();
        divider.moveTo(-w / 2 + 22, dy);
        divider.lineTo( w / 2 - 22, dy);
        divider.strokePath();
        divider.lineStyle(1, SC_GOLD, 0.5);
        divider.beginPath();
        divider.moveTo(-70, dy);
        divider.lineTo( 70, dy);
        divider.strokePath();
        divider.fillStyle(SC_GOLD, 0.9);
        divider.fillPoints([
            { x: 0, y: dy - 4 }, { x: 4, y: dy }, { x: 0, y: dy + 4 }, { x: -4, y: dy },
        ], true);

        panel.add([mark, title, subtitle, bankLabel, this.scBankText, divider]);

        this.tweens.add({
            targets:  halo,
            alpha:    0.5,
            scale:    1.3,
            duration: 1600,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Two arcs on a half-turn pattern, so ending on 180 lands the ring back
        // on itself and the repeat never shows a jump.
        this.tweens.add({
            targets:  ring,
            angle:    180,
            duration: 2600,
            repeat:   -1,
            ease:     'Linear',
        });

        return { mark, halo, ring };
    }

    // _buildSingularitySlot(): One card slot. As with the deck cells, the
    // furniture is permanent and only the face inside it is redrawn - when a
    // card is bought into the slot or played out of it.
    _buildSingularitySlot(panel, x, index){
        const w = SC_SLOT_W;
        const h = SC_SLOT_H;

        const cell = this.add.container(x, SC_SLOT_Y);
        panel.add(cell);

        // Tinted to the card that fills the slot; dark while the slot is empty.
        const aura = this.add.graphics().setAlpha(0);

        const body = this.add.graphics();
        body.fillStyle(0x0a0818, 0.8);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, 12);

        const frame = this.add.graphics();
        const face  = this.add.container(0, 0);

        const numeral = this.add.text(-w / 2 + 12, -h / 2 + 12, ['I', 'II', 'III'][index] ?? String(index + 1), {
            fontFamily: 'monospace', fontSize: '9px', color: '#6f5f98',
        }).setOrigin(0, 0.5);

        // The state word under the card: USE, or when it can be.
        const hint = this.add.text(0, h / 2 - 14, '', {
            fontFamily: 'monospace', fontSize: '9px', color: SC_DIM_HEX,
        }).setOrigin(0.5).setLetterSpacing(2);

        const flash = this.add.graphics();
        flash.fillStyle(0xffffff, 0.5);
        flash.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
        flash.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

        const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0);

        cell.add([aura, body, frame, face, numeral, hint, flash, hit]);

        const slot = {
            cell, aura, frame, face, hint, flash, hit, index,
            cardId: null, usable: false, hovering: false, lifted: false, auraTween: null,
        };

        hit.on('pointerover', () => this._hoverSingularitySlot(slot, true));
        hit.on('pointerout',  () => this._hoverSingularitySlot(slot, false));
        hit.on('pointerdown', () => this._pressSingularitySlot(slot));

        this._drawSingularityEmpty(slot);
        this._paintSingularityFrame(slot, 0x2c2548, 0.55, 1.5);

        return slot;
    }

    // _paintSingularityFrame(): The slot's border plus four brackets set just
    // outside its rounded corners, like a frame locked around the card.
    _paintSingularityFrame(slot, color, alpha, lineW){
        const w = SC_SLOT_W;
        const h = SC_SLOT_H;
        const g = slot.frame;
        const o = 4;
        const c = 14;

        g.clear();
        g.lineStyle(lineW, color, alpha);
        g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);

        g.lineStyle(2, color, Math.min(1, alpha + 0.2));
        [
            [-w / 2 - o, -h / 2 - o,  1,  1],
            [ w / 2 + o, -h / 2 - o, -1,  1],
            [-w / 2 - o,  h / 2 + o,  1, -1],
            [ w / 2 + o,  h / 2 + o, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            g.beginPath();
            g.moveTo(x + hd * c, y);
            g.lineTo(x, y);
            g.lineTo(x, y + vd * c);
            g.strokePath();
        });
    }

    // _drawSingularityEmpty(): An open slot - a faint well with a hollow mark
    // breathing in it.
    _drawSingularityEmpty(slot){
        this._clearSingularityFace(slot);

        const well = this.add.circle(0, -12, 34, SC_ACCENT, 0.04).setStrokeStyle(1, SC_ACCENT, 0.18);

        const glyph = this.add.text(0, -12, '◇', {
            fontFamily: 'monospace', fontSize: '26px', color: '#4d3f78',
        }).setOrigin(0.5);

        const word = this.add.text(0, 42, 'EMPTY', {
            fontFamily: 'monospace', fontSize: '10px', color: '#4d3f78',
        }).setOrigin(0.5).setLetterSpacing(3);

        slot.face.add([well, glyph, word]);

        this.tweens.add({
            targets:  [glyph, well],
            alpha:    0.45,
            duration: 1600,
            delay:    slot.index * 300,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        this.tweens.add({
            targets:  slot.face,
            alpha:    { from: 0, to: 1 },
            duration: 280,
            ease:     'Cubic.easeOut',
        });
    }

    // _drawSingularityFace(): A bought card - its colour band, its glyph (lit by
    // a preFX glow where WebGL is available), its name and its cost.
    _drawSingularityFace(slot, card){
        const w   = SC_SLOT_W;
        const h   = SC_SLOT_H;
        const hex = hexOf(card.color);

        this._clearSingularityFace(slot);
        slot.cardId = card.id;

        const band = this.add.graphics();
        band.fillStyle(card.color, 0.2);
        band.fillRoundedRect(-w / 2, -h / 2, w, 70, { tl: 12, tr: 12, bl: 0, br: 0 });

        const halo = this.add.circle(0, -h / 2 + 40, 26, card.glow, 0.16)
            .setBlendMode(Phaser.BlendModes.ADD);

        const icon = this.add.text(0, -h / 2 + 40, card.icon, {
            fontFamily: 'monospace', fontSize: '34px', color: hex,
        }).setOrigin(0.5);

        this._fxGlow(icon, card.glow, 2.5);

        const name = this.add.text(0, 6, card.name, {
            fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#f1e9ff',
            align: 'center', wordWrap: { width: w - 18 },
        }).setOrigin(0.5);

        const divider = this.add.graphics();
        divider.lineStyle(1, card.color, 0.3);
        divider.beginPath();
        divider.moveTo(-w / 2 + 16, 30);
        divider.lineTo( w / 2 - 16, 30);
        divider.strokePath();

        const cost = this.add.text(0, 46, `${card.cost} SP`, {
            fontFamily: 'monospace', fontSize: '10px', color: SC_GOLD_HEX,
        }).setOrigin(0.5).setAlpha(0.8);

        slot.face.add([band, halo, icon, name, divider, cost]);

        this._paintSoftGlow(slot.aura, w, h, 12, card.glow, 0.5);
        slot.aura.setAlpha(0.35);
        slot.auraTween = this.tweens.add({
            targets:  slot.aura,
            alpha:    0.9,
            scaleX:   1.04,
            scaleY:   1.03,
            duration: 1300,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        this.tweens.add({
            targets:  halo,
            scale:    1.2,
            alpha:    0.4,
            duration: 1500,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        this.tweens.add({
            targets:  slot.face,
            alpha:    { from: 0, to: 1 },
            y:        { from: 10, to: 0 },
            duration: 340,
            ease:     'Cubic.easeOut',
        });
    }

    /** Tear a slot's face down, and stop everything that was animating in it. */
    _clearSingularityFace(slot){
        slot.auraTween?.stop();
        slot.auraTween = null;
        this.tweens.killTweensOf(slot.aura);
        slot.aura.setAlpha(0).setScale(1);

        slot.face.list.forEach(o => this.tweens.killTweensOf(o));
        slot.face.removeAll(true);
        slot.cardId = null;
    }

    // _hoverSingularitySlot(): Any bought card shows its tip. Only a card that
    // can be played right now lifts - the same promise the deck cells keep.
    _hoverSingularitySlot(slot, over){
        slot.hovering = over && slot.cardId != null;

        if (slot.hovering) this._showSingularityTip(slot);
        else               this._hideSingularityTip();

        this._liftSingularitySlot(slot, slot.hovering && slot.usable);
    }

    _liftSingularitySlot(slot, lift){
        if (lift === slot.lifted) return;

        slot.lifted = lift;

        this.tweens.add({
            targets:  slot.cell,
            y:        SC_SLOT_Y + (lift ? -10 : 0),
            scale:    lift ? 1.06 : 1,
            duration: lift ? 220 : 260,
            ease:     lift ? 'Back.easeOut' : 'Cubic.easeOut',
        });
    }

    // _buildSingularityTip(): The card's full text, floated above the panel
    // over whichever slot is hovered. One tip, re-laid for each card.
    _buildSingularityTip(panel, h){
        const anchorY = -h / 2 - 16;
        const root    = this.add.container(0, anchorY).setAlpha(0);

        const bg = this.add.graphics();

        const title = this.add.text(0, 0, '', {
            fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#f3eaff',
        }).setOrigin(0, 0);

        const cost = this.add.text(0, 0, '', {
            fontFamily: 'monospace', fontSize: '11px', color: SC_GOLD_HEX,
        }).setOrigin(1, 0);

        const body = this.add.text(0, 0, '', {
            fontFamily: 'monospace', fontSize: '10px', color: '#cbbfe8',
            wordWrap: { width: SC_TIP_W - 28 }, lineSpacing: 3,
        }).setOrigin(0, 0);

        root.add([bg, title, cost, body]);
        panel.add(root);

        return { root, bg, title, cost, body, anchorY };
    }

    _showSingularityTip(slot){
        const card = SC_BY_ID[slot.cardId];
        const tip  = this.scTip;
        if (!card || !tip) return;

        const w = SC_TIP_W;

        tip.title.setText(`${card.icon}  ${card.name}`).setColor(hexOf(card.glow));
        tip.cost.setText(`${card.cost} SP`);
        tip.body.setText(cleanDesc(card.desc));

        // Laid out upward from the anchor, so a long description grows the tip
        // away from the panel instead of down into it.
        const h = 14 + tip.title.height + 8 + tip.body.height + 14;

        tip.title.setPosition(-w / 2 + 14, -h + 14);
        tip.cost.setPosition(w / 2 - 14, -h + 14);
        tip.body.setPosition(-w / 2 + 14, -h + 14 + tip.title.height + 8);

        // Kept inside the panel's width; the pointer still finds its slot.
        tip.root.x = Phaser.Math.Clamp(slot.cell.x, -SC_PANEL_W / 2 + w / 2, SC_PANEL_W / 2 - w / 2);
        const px   = slot.cell.x - tip.root.x;

        tip.bg.clear();
        tip.bg.fillStyle(0x0a0818, 0.95);
        tip.bg.fillRoundedRect(-w / 2, -h, w, h, 10);
        tip.bg.fillTriangle(px - 7, 0, px + 7, 0, px, 8);
        tip.bg.lineStyle(1, card.color, 0.6);
        tip.bg.strokeRoundedRect(-w / 2, -h, w, h, 10);

        this.tweens.killTweensOf(tip.root);
        tip.root.y = tip.anchorY + 6;

        this.tweens.add({
            targets:  tip.root,
            alpha:    1,
            y:        tip.anchorY,
            duration: 160,
            ease:     'Cubic.easeOut',
        });
    }

    _hideSingularityTip(){
        const tip = this.scTip;
        if (!tip) return;

        this.tweens.killTweensOf(tip.root);
        this.tweens.add({ targets: tip.root, alpha: 0, duration: 120 });
    }

    // _buildSingularityBuy(): The BUY bar under the slots. Its body is redrawn
    // per state by _paintSingularityBuy(); everything that moves while it is
    // ready - the breathing glow, the sweep and the preFX shine on the label -
    // is started and stopped there as it gains and loses that state.
    _buildSingularityBuy(panel){
        const w = SC_BUY_W;
        const h = SC_BUY_H;

        const root = this.add.container(0, SC_BUY_Y);

        const glow = this.add.graphics().setAlpha(0);
        this._paintSoftGlow(glow, w, h, h / 2, SC_ACCENT, 0.55);

        const body = this.add.graphics();

        const sweep = this.add.container(-w / 2 + 40, 0).setAlpha(0);
        [[72, 0.05], [40, 0.07], [16, 0.09]].forEach(([bw, a]) => {
            sweep.add(this.add.rectangle(0, 0, bw, h - 10, 0xffffff, a)
                .setBlendMode(Phaser.BlendModes.ADD));
        });

        const icon = this.add.text(-w / 2 + 28, 0, '◆', {
            fontFamily: 'monospace', fontSize: '15px', color: SC_DIM_HEX,
        }).setOrigin(0.5);

        const label = this.add.text(0, 0, 'BUY', {
            fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: SC_DIM_HEX,
        }).setOrigin(0.5).setLetterSpacing(8);

        const sub = this.add.text(w / 2 - 22, 0, '', {
            fontFamily: 'monospace', fontSize: '10px', color: SC_DIM_HEX,
        }).setOrigin(1, 0.5).setLetterSpacing(1);

        const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive();

        root.add([glow, body, sweep, icon, label, sub, hit]);
        panel.add(root);

        const buy = { root, glow, body, sweep, icon, label, sub, hit, state: null, need: 0, loops: [], shine: null };

        hit.on('pointerover', () => this._hoverSingularityBuy(buy, true));
        hit.on('pointerout',  () => this._hoverSingularityBuy(buy, false));
        hit.on('pointerdown', () => this._pressSingularityBuy(buy));

        this._paintSingularityBuy(buy, 'locked', SC_MIN_COST);

        return buy;
    }

    // _paintSingularityBuy(): One of five states -
    //   ready   the bank covers the cheapest card and a slot is open
    //   locked  not enough SP yet            full    all three slots hold a card
    //   busy    a purchase is in flight      closed  the match is over
    _paintSingularityBuy(buy, state, need = 0){
        const w     = SC_BUY_W;
        const h     = SC_BUY_H;
        const ready = state === 'ready';

        buy.body.clear();
        buy.body.fillStyle(ready ? 0x22103f : 0x0d0b1a, ready ? 0.95 : 0.86);
        buy.body.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        buy.body.lineStyle(2, ready ? SC_ACCENT : 0x3a3158, ready ? 0.9 : 0.55);
        buy.body.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);

        if (ready){
            buy.body.lineStyle(1, SC_GOLD, 0.35);
            buy.body.strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, (h - 8) / 2);
        }

        buy.label.setColor(ready ? '#f5eeff' : SC_DIM_HEX);
        buy.icon.setColor(ready ? SC_GOLD_HEX : '#4a4166');
        buy.sub.setColor(ready ? SC_ACCENT_HEX : SC_DIM_HEX);
        buy.sub.setText({
            ready:  `FROM ${SC_MIN_COST} SP`,
            locked: `NEED ${need} MORE SP`,
            full:   'SLOTS FULL',
            busy:   'WORKING…',
            closed: '',
        }[state] ?? '');

        buy.hit.input.cursor = ready ? 'pointer' : 'default';

        const was = buy.state;
        buy.state = state;
        buy.need  = need;

        if (ready && was !== 'ready'){
            this._chargeSingularityBuy(buy);
            if (this.scLanded) this._burstSingularityBuy(buy);
        }
        else if (!ready && was === 'ready'){
            this._dimSingularityBuy(buy);
        }
    }

    // _chargeSingularityBuy(): The ready loops - the glow breathing, a band of
    // light crossing the bar and a preFX shine running through the label.
    _chargeSingularityBuy(buy){
        if (buy.loops.length) return;

        const w = SC_BUY_W;

        buy.loops.push(this.tweens.add({
            targets:  buy.glow,
            alpha:    { from: 0.3, to: 1 },
            duration: 1100,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        }));

        buy.sweep.x = -w / 2 + 40;
        buy.loops.push(this.tweens.add({
            targets:     buy.sweep,
            x:           w / 2 - 40,
            duration:    1400,
            repeat:      -1,
            repeatDelay: 1600,
            ease:        'Sine.easeInOut',
        }));

        buy.loops.push(this.tweens.add({
            targets:     buy.sweep,
            alpha:       { from: 0, to: 1 },
            duration:    700,
            yoyo:        true,
            repeat:      -1,
            repeatDelay: 1600,
            ease:        'Sine.easeInOut',
        }));

        // WebGL only; under Canvas preFX is null and the label simply stays lit.
        buy.shine = buy.label.preFX?.addShine(0.8, 0.35, 4) ?? null;
    }

    _dimSingularityBuy(buy){
        buy.loops.forEach(t => t.stop());
        buy.loops = [];

        if (buy.shine){
            buy.label.preFX?.remove(buy.shine);
            buy.shine = null;
        }

        this.tweens.add({ targets: [buy.glow, buy.sweep], alpha: 0, duration: 220 });
        this.tweens.add({ targets: buy.root, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
    }

    // _burstSingularityBuy(): The moment the bar becomes affordable - a flare
    // through it, a ring thrown off its outline and a punch on the label, so
    // the player notices the store opening without having to watch for it.
    _burstSingularityBuy(buy){
        const w = SC_BUY_W;
        const h = SC_BUY_H;

        const ring = this.add.graphics();
        ring.lineStyle(2, SC_GOLD, 0.9);
        ring.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        ring.setBlendMode(Phaser.BlendModes.ADD);
        buy.root.add(ring);

        this.tweens.add({
            targets:    ring,
            scaleX:     1.08,
            scaleY:     1.6,
            alpha:      0,
            duration:   620,
            ease:       'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });

        this.tweens.add({
            targets:  buy.label,
            scale:    { from: 1.35, to: 1 },
            duration: 460,
            ease:     'Back.easeOut',
        });

        this.tweens.add({
            targets:  this.scFlash,
            alpha:    { from: 0.25, to: 0 },
            duration: 380,
            ease:     'Cubic.easeOut',
        });
    }

    _hoverSingularityBuy(buy, over){
        if (over && buy.state !== 'ready') return;

        this.tweens.add({
            targets:  buy.root,
            scale:    over ? 1.03 : 1,
            duration: over ? 200 : 240,
            ease:     over ? 'Back.easeOut' : 'Cubic.easeOut',
        });
    }

    // _pressSingularityBuy(): Open the store - or, when the bar is not ready,
    // say why with a shake rather than ignore the click.
    _pressSingularityBuy(buy){
        if (buy.state === 'ready'){
            this.tweens.add({
                targets:  buy.root,
                scale:    { from: 0.96, to: 1.03 },
                duration: 200,
                ease:     'Back.easeOut',
            });
            this._openSingularityShop();
            return;
        }

        if (buy.state === 'locked') this._log(`Not enough Singularity Points - ${buy.need} more needed.`);
        if (buy.state === 'full')   this._log('All three Singularity slots are full.');

        if (buy.state !== 'closed') this._denySingularity(buy.root);
    }

    // _igniteSingularityPanel(): The landing - the glass flashes, the mark
    // throws a ring, and the three slots light one after another.
    _igniteSingularityPanel(){
        if (!this.scene.isActive()) return;

        this.scLanded = true;

        this.tweens.add({
            targets:  this.scFlash,
            alpha:    { from: 0.6, to: 0 },
            duration: 420,
            ease:     'Cubic.easeOut',
        });

        const { mark } = this.scEmblem;
        const ring = this.add.circle(mark.x, mark.y, 16, SC_ACCENT, 0)
            .setStrokeStyle(2, 0xe6d6ff, 0.9)
            .setBlendMode(Phaser.BlendModes.ADD);
        this.scPanel.add(ring);

        this.tweens.add({
            targets:    ring,
            scale:      3.6,
            alpha:      0,
            duration:   640,
            ease:       'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });

        this.scSlots.forEach((slot, i) => {
            this.tweens.add({
                targets:  slot.flash,
                alpha:    { from: 0.5, to: 0 },
                duration: 360,
                delay:    120 + i * 110,
                ease:     'Cubic.easeOut',
            });

            this.tweens.add({
                targets:  slot.cell,
                scale:    { from: 0.94, to: 1 },
                duration: 420,
                delay:    120 + i * 110,
                ease:     'Back.easeOut',
            });
        });

        this._renderSingularityPanel(this.state?.you);
        if (this.scBuy.state === 'ready') this._burstSingularityBuy(this.scBuy);
    }

    // _renderSingularityPanel(): Put the hand in the slots, and set the BUY bar
    // and the bank from the SP the panel above has banked.
    //
    // A card can be played on this player's turn only; the store is open on
    // either turn, as a swap is. Both are still the server's to allow.
    _renderSingularityPanel(you){
        if (!this.scSlots) return;

        const hand = this._singularityHand(you);
        const bank = this.singularityPointBatch.playerAPts;
        const turn = this._isMyTurn();

        this.scSlots.forEach((slot, i) => {
            const card = SC_BY_ID[hand[i]] ?? null;

            if ((card?.id ?? null) !== slot.cardId){
                if (card) this._drawSingularityFace(slot, card);
                else      this._drawSingularityEmpty(slot);
            }

            // One field a side: a second Defence card waits until the first is down.
            const fieldUp = card?.attribute === 'defence' && !!you?.field;

            // One affliction a card: the opposing card must be clean to be cast on.
            const hexed = card?.attribute === 'affliction' && !!this._opponentActiveCard()?.affliction;

            const usable = !!card && turn && !fieldUp && !hexed && !this.finished && !this.scBusy && !this.busy;
            slot.usable  = usable;

            // An armed card stays armed only while it can still be fired.
            if (this.scArmed === i && !usable) this.scArmed = null;
            if (this.scGuard === i && !usable) this.scGuard = null;
            if (this.scMend  === i && !usable) this.scMend  = null;
            if (this.scHex   === i && !usable) this.scHex   = null;
            if (this.scCleanse === i && !usable) this.scCleanse = null;
            const armed = this.scArmed === i || this.scGuard === i || this.scMend === i || this.scHex === i
                || this.scCleanse === i;

            const ready = ARMED_ATTRIBUTES.includes(card?.attribute) ? 'ARM' : 'USE';
            slot.hint.setText(!card || this.finished || this.scBusy ? ''
                : armed   ? 'ARMED'
                : fieldUp ? 'FIELD UP'
                : hexed   ? 'AFFLICTED'
                : usable  ? ready
                :           'ON YOUR TURN');
            slot.hint.setColor(armed ? '#ffffff' : usable ? hexOf(card.glow) : SC_DIM_HEX);

            this._paintSingularityFrame(slot,
                card ? (armed ? card.glow : usable ? card.color : 0x4a3f70) : 0x2c2548,
                card ? (usable ? 0.9 : 0.6) : 0.55,
                armed ? 3 : usable ? 2 : 1.5);

            this._showSingularityArmed(slot, armed, card);

            if (card){
                slot.hit.setInteractive();
                slot.hit.input.cursor = usable ? 'pointer' : 'default';
            }
            else {
                slot.hit.disableInteractive();
            }

            // A slot emptied under the cursor never gets its pointerout, and a
            // card that stops being playable must not stay lifted.
            if (!card && slot.hovering){
                slot.hovering = false;
                this._hideSingularityTip();
            }
            this._liftSingularitySlot(slot, slot.hovering && usable);
        });

        this._countSingularityBank(bank);

        const open  = hand.filter(id => !SC_BY_ID[id]).length;
        const need  = Math.max(0, SC_MIN_COST - bank);
        const state = this.finished ? 'closed'
                    : this.scBusy   ? 'busy'
                    : open === 0    ? 'full'
                    : need > 0      ? 'locked'
                    :                 'ready';

        this._paintSingularityBuy(this.scBuy, state, need);
        this._paintAttackButton();
        this._paintDefendButton();
        this._paintHealButton();
        this._paintAfflictButton();
        this._paintCleanseButton();
        this._placeCastButtons();
    }

    /** The opposing card in the arena, as the state has it. */
    _opponentActiveCard(){
        const opp = this.state?.opponent;
        return opp?.cards?.find(c => c.id === opp.activeCardId) ?? opp?.cards?.[opp?.activeIndex] ?? null;
    }

    /** The three slots as card ids. The server's copy wins once it sends one
     *  (ids or { id } objects); until then this client's own is used. */
    _singularityHand(you){
        const served = you?.singularityCards;
        const hand   = Array.isArray(served) ? served : this.singularityHand;

        return Array.from({ length: SC_SLOTS }, (_, i) => {
            const c = hand[i];
            return (c && typeof c === 'object') ? (c.id ?? null) : (c ?? null);
        });
    }

    /** The server keeps the hand once its state carries one. */
    _servesSingularityHand(){
        return Array.isArray(this.state?.you?.singularityCards);
    }

    // _countSingularityBank(): Roll the bank to its total on the same beat the
    // SP panel's own count lands, so the two numbers move together.
    _countSingularityBank(to){
        if (!this.scBankText || this.scBankTarget === to) return;

        this.scBankTarget = to;
        this.scBankTween?.stop();

        this.scBankTween = this.tweens.addCounter({
            from:     this.scBankShown,
            to,
            duration: 560,
            delay:    380,
            ease:     'Cubic.easeOut',
            onUpdate: (tw) => {
                this.scBankShown = Math.round(tw.getValue());
                this.scBankText.setText(`${this.scBankShown} SP`);
            },
            onComplete: () => {
                this.scBankTween = null;
                this.scBankShown = to;
                this.scBankText.setText(`${to} SP`);
            },
        });
    }

    // ------------------------------------------------------ singularity store --
    // _openSingularityShop(): Every Singularity Card on a glass sheet over the
    // board. Cards the bank covers lift under the cursor and buy on a click;
    // the rest are dimmed with their price and shake if pressed.
    _openSingularityShop(){
        if (this.scShop || this.finished || this.scBusy) return;

        const { width, height } = this.cameras.main;
        const W = SC_SHOP_W;
        const H = SC_SHOP_H;

        const bank = this.singularityPointBatch.playerAPts;
        const open = this.scSlots.filter(s => s.cardId == null).length;

        const layer = this.add.container(0, 0).setDepth(60);

        const veil = this.add.rectangle(0, 0, width, height, 0x030210, 0.76)
            .setOrigin(0).setAlpha(0).setInteractive();
        veil.on('pointerdown', () => this._closeSingularityShop());

        const sheet = this.add.container(width / 2, height / 2).setAlpha(0).setScale(0.94);

        // Swallows clicks on the glass so they never reach the veil behind it.
        sheet.add(this.add.rectangle(0, 0, W, H, 0x000000, 0).setInteractive());

        this._drawSingularityGlass(sheet, W, H, 0.95);

        const title = this.add.text(0, -H / 2 + 42, 'SINGULARITY STORE', {
            fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold',
            color: '#f3eaff', stroke: '#0a0620', strokeThickness: 5,
        }).setOrigin(0.5).setLetterSpacing(6);

        this._fxGlow(title, SC_ACCENT, 2);

        const sub = this.add.text(0, -H / 2 + 74,
            `BANK ${bank} SP   ·   ${open} OPEN SLOT${open === 1 ? '' : 'S'}   ·   CHOOSE A CARD`, {
            fontFamily: 'monospace', fontSize: '11px', color: '#9d8cc8',
        }).setOrigin(0.5).setLetterSpacing(1);

        const divider = this.add.graphics();
        divider.lineStyle(1, SC_ACCENT, 0.2);
        divider.beginPath();
        divider.moveTo(-W / 2 + 30, -H / 2 + 94);
        divider.lineTo( W / 2 - 30, -H / 2 + 94);
        divider.strokePath();
        divider.lineStyle(1, SC_GOLD, 0.5);
        divider.beginPath();
        divider.moveTo(-110, -H / 2 + 94);
        divider.lineTo( 110, -H / 2 + 94);
        divider.strokePath();

        const close = this.add.text(W / 2 - 32, -H / 2 + 34, '✕', {
            fontFamily: 'monospace', fontSize: '20px', color: '#8f7fb8',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        close.on('pointerover', () => {
            close.setColor('#f3eaff');
            this.tweens.add({ targets: close, angle: 90, scale: 1.15, duration: 200, ease: 'Back.easeOut' });
        });
        close.on('pointerout', () => {
            close.setColor('#8f7fb8');
            this.tweens.add({ targets: close, angle: 0, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
        });
        close.on('pointerdown', () => this._closeSingularityShop());

        const foot = this.add.text(0, H / 2 - 24, 'ESC OR CLICK OUTSIDE TO CLOSE', {
            fontFamily: 'monospace', fontSize: '10px', color: SC_DIM_HEX,
        }).setOrigin(0.5).setLetterSpacing(2);

        sheet.add([title, sub, divider, close, foot]);

        // The grid - six across, the short last row centred under the first.
        const cw   = SC_SHOP_CARD_W;
        const ch   = SC_SHOP_CARD_H;
        const gap  = SC_SHOP_GAP;
        const top  = -H / 2 + 112 + ch / 2;

        STORE_CARDS.forEach((def, i) => {
            const row   = Math.floor(i / SC_SHOP_PER_ROW);
            const col   = i % SC_SHOP_PER_ROW;
            const inRow = Math.min(SC_SHOP_PER_ROW, STORE_CARDS.length - row * SC_SHOP_PER_ROW);
            const rowW  = inRow * cw + (inRow - 1) * gap;

            const x = -rowW / 2 + cw / 2 + col * (cw + gap);
            const y = top + row * (ch + gap);

            this._buildShopCard(sheet, def, x, y, i, bank, open);
        });

        layer.add([veil, sheet]);

        const onKey = () => this._closeSingularityShop();
        this.input.keyboard?.on('keydown-ESC', onKey);

        this.scShop = { layer, veil, sheet, onKey };
        this._hideSingularityTip();

        this.tweens.add({ targets: veil, alpha: 1, duration: 240, ease: 'Sine.easeOut' });
        this.tweens.add({
            targets:  sheet,
            alpha:    1,
            scale:    1,
            duration: 380,
            ease:     'Back.easeOut',
        });
    }

    // _buildShopCard(): One card in the store. `open` is the slot count, so a
    // full hand dims the store as surely as an empty bank does.
    _buildShopCard(sheet, def, x, y, i, bank, open){
        const w      = SC_SHOP_CARD_W;
        const h      = SC_SHOP_CARD_H;
        const afford = bank >= def.cost && open > 0;
        const hex    = hexOf(def.color);

        const card = this.add.container(x, y + 26).setAlpha(0);

        const glow = this.add.graphics().setAlpha(0);
        this._paintSoftGlow(glow, w, h, 12, def.glow, 0.55);

        const body = this.add.graphics();
        body.fillStyle(0x0b0920, 0.95);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
        body.lineStyle(2, def.color, afford ? 0.75 : 0.2);
        body.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
        body.fillStyle(def.color, afford ? 0.2 : 0.06);
        body.fillRoundedRect(-w / 2, -h / 2, w, 64, { tl: 12, tr: 12, bl: 0, br: 0 });

        const halo = this.add.circle(0, -h / 2 + 34, 24, def.glow, afford ? 0.16 : 0.04)
            .setBlendMode(Phaser.BlendModes.ADD);

        const icon = this.add.text(0, -h / 2 + 34, def.icon, {
            fontFamily: 'monospace', fontSize: '30px', color: afford ? hex : '#3b3552',
        }).setOrigin(0.5);

        if (afford) this._fxGlow(icon, def.glow, 2);

        const name = this.add.text(0, -h / 2 + 84, def.name, {
            fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold',
            color: afford ? '#f1e9ff' : SC_DIM_HEX,
            align: 'center', wordWrap: { width: w - 16 },
        }).setOrigin(0.5);

        const rule = this.add.graphics();
        rule.lineStyle(1, def.color, afford ? 0.35 : 0.1);
        rule.beginPath();
        rule.moveTo(-w / 2 + 14, -h / 2 + 104);
        rule.lineTo( w / 2 - 14, -h / 2 + 104);
        rule.strokePath();

        const desc = this.add.text(0, -h / 2 + 112, cleanDesc(def.desc), {
            fontFamily: 'monospace', fontSize: '10px',
            color: afford ? '#c4b6e6' : '#4a4366',
            align: 'center', wordWrap: { width: w - 18 }, lineSpacing: 2, maxLines: 6,
        }).setOrigin(0.5, 0);

        const chip = this.add.graphics();
        chip.fillStyle(afford ? SC_GOLD : def.color, afford ? 0.12 : 0.05);
        chip.fillRoundedRect(-w / 2 + 12, h / 2 - 36, w - 24, 24, 12);
        chip.lineStyle(1, afford ? SC_GOLD : def.color, afford ? 0.55 : 0.15);
        chip.strokeRoundedRect(-w / 2 + 12, h / 2 - 36, w - 24, 24, 12);

        const price = this.add.text(0, h / 2 - 24, afford ? `${def.cost} SP` : `${def.cost} SP · LOCKED`, {
            fontFamily: 'monospace', fontSize: '11px', fontStyle: afford ? 'bold' : 'normal',
            color: afford ? SC_GOLD_HEX : '#4a4366',
        }).setOrigin(0.5);

        const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: afford });

        card.add([glow, body, halo, icon, name, rule, desc, chip, price, hit]);
        sheet.add(card);

        hit.on('pointerover', () => {
            if (!afford) return;
            this.tweens.killTweensOf(card);
            card.setAlpha(1);
            this.tweens.add({ targets: card, y: y - 10, scale: 1.04, duration: 200, ease: 'Back.easeOut' });
            this.tweens.add({ targets: glow, alpha: 1, duration: 200 });
        });

        hit.on('pointerout', () => {
            if (!afford) return;
            this.tweens.add({ targets: card, y, scale: 1, duration: 240, ease: 'Cubic.easeOut' });
            this.tweens.add({ targets: glow, alpha: 0, duration: 200 });
        });

        hit.on('pointerdown', () => {
            if (afford) this._buySingularityCard(def, card);
            else {
                this._log(open === 0
                    ? 'All three Singularity slots are full.'
                    : `${def.name} needs ${def.cost - bank} more SP.`);
                this._denySingularity(card);
            }
        });

        // Staggered in, so the store deals itself rather than appearing.
        this.tweens.add({
            targets:  card,
            alpha:    afford ? 1 : 0.55,
            y,
            duration: 380,
            delay:    120 + i * 40,
            ease:     'Back.easeOut',
        });
    }

    _closeSingularityShop(instant = false){
        const shop = this.scShop;
        if (!shop) return;

        this.scShop = null;
        this.input.keyboard?.off('keydown-ESC', shop.onKey);
        shop.veil.disableInteractive();

        const done = () => {
            this._killTweensDeep(shop.layer);
            shop.layer.destroy();
        };

        if (instant) return done();

        this.tweens.add({ targets: shop.sheet, alpha: 0, scale: 0.96, duration: 200, ease: 'Cubic.easeIn' });
        this.tweens.add({ targets: shop.veil, alpha: 0, duration: 240, onComplete: done });
    }

    /** The store's glass runs endless tweens; they go with the objects. */
    _killTweensDeep(obj){
        this.tweens.killTweensOf(obj);
        obj.list?.forEach(child => this._killTweensDeep(child));
    }

    // ------------------------------------------------ singularity intents --
    // _buySingularityCard(): Ask the server for the card. It spends the SP and
    // answers with the state; the slot the card lands in is found by comparing
    // the hand before and after, and forged in.
    async _buySingularityCard(def, source){
        if (this.scBusy || this.finished) return;

        this.scBusy = true;
        this._render();

        const before = this.scSlots.map(s => s.cardId);
        const res    = await Net.buySingularityCard(def.id);
        if (!this.scene.isActive()) return;

        this.scBusy = false;

        if (!res.ok){
            this._log(res.error);
            if (source?.active) this._denySingularity(source);
            this._render();
            return;
        }

        if (res.state) this.state = res.state;

        // Until the server keeps a hand of its own, this client places the card.
        if (!this._servesSingularityHand()){
            const i = this.singularityHand.indexOf(null);
            if (i >= 0) this.singularityHand[i] = def.id;
        }

        this._closeSingularityShop();
        this._render();

        const slot = this.scSlots.find((s, i) => before[i] == null && s.cardId === def.id);
        if (slot) this._forgeSingularitySlot(slot, def);
    }

    // _pressSingularitySlot(): An Attack card is armed (or disarmed) and waits
    // for the ATTACK button, a Defence card for the DEFEND button, and a
    // Healing card for the HEAL button that arming it brings up, and an
    // Affliction card for its own USE button the same way - nothing goes to
    // the server until then. They are armed independently, so a player with a
    // Defence card ready can still choose to ATTACK instead.
    // Any other card is played straight from the slot.
    _pressSingularitySlot(slot){
        const card = SC_BY_ID[slot.cardId];
        if (!card) return;

        const key = card.attribute === 'attack'     ? 'scArmed'
                  : card.attribute === 'defence'    ? 'scGuard'
                  : card.attribute === 'healing'    ? 'scMend'
                  : card.attribute === 'affliction' ? 'scHex'
                  : card.attribute === 'cleanse'    ? 'scCleanse'
                  :                                   null;

        if (!key) return this._useSingularityCard(slot);
        if (!slot.usable) return;

        this[key] = this[key] === slot.index ? null : slot.index;

        if (this[key] != null){
            this._log(key === 'scArmed' ? `${card.name} armed - press ATTACK to unleash it.`
                    : key === 'scGuard' ? `${card.name} armed - press DEFEND to raise it.`
                    : key === 'scHex'   ? `${card.name} armed - press USE ${card.affliction ?? card.name} to cast it.`
                    : key === 'scCleanse' ? `${card.name} armed - press CLEANSE to cure your cards.`
                    :                     `${card.name} armed - press HEAL to mend your card.`);
            this.tweens.add({
                targets:  slot.flash,
                alpha:    { from: 0.8, to: 0 },
                duration: 360,
                ease:     'Cubic.easeOut',
            });
        }

        this._render();
    }

    // _showSingularityArmed(): The armed slot's charge - a ring of the card's
    // glow beating round it, and the card held lifted. Torn down the moment it
    // is disarmed, fired or emptied.
    _showSingularityArmed(slot, armed, card){
        if (!!slot.armedFx === armed) return;

        if (!armed){
            this.tweens.killTweensOf(slot.armedFx);
            slot.armedFx.destroy();
            slot.armedFx = null;
            slot.cell.setScale(1);
            return;
        }

        const ring = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
        ring.lineStyle(3, card.glow, 1);
        ring.strokeRoundedRect(-SC_SLOT_W / 2 - 6, -SC_SLOT_H / 2 - 6, SC_SLOT_W + 12, SC_SLOT_H + 12, 16);
        slot.cell.addAt(ring, 1);
        slot.armedFx = ring;

        this.tweens.add({
            targets:  ring,
            alpha:    { from: 1, to: 0.25 },
            scaleX:   1.04,
            scaleY:   1.03,
            duration: 420,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // _paintAttackButton(): The ATTACK button takes the armed card's name and
    // colour, so it is plain what the next press will fire.
    _paintAttackButton(){
        const btn = this.attackBtn;
        if (!btn) return;

        const card = this.scArmed == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[this.scArmed]];

        btn.text.setText(card ? `${card.icon} ${card.name}` : 'ATTACK');
        btn.bg.setStrokeStyle(card ? 3 : 2, card ? card.glow : btn.stroke, 0.9);
        btn.bg.setFillStyle(card ? card.color : 0x001a11, card ? 0.35 : 0.9);
    }

    // _paintDefendButton(): The same for DEFEND and an armed Defence card.
    _paintDefendButton(){
        const btn = this.defendBtn;
        if (!btn) return;

        const card = this.scGuard == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[this.scGuard]];

        btn.text.setText(card ? `${card.icon} ${card.name}` : 'DEFEND');
        btn.bg.setStrokeStyle(card ? 3 : 2, card ? card.glow : btn.stroke, 0.9);
        btn.bg.setFillStyle(card ? card.color : 0x1a1400, card ? 0.35 : 0.9);
    }

    // _paintHealButton(): The HEAL button only stands while a Healing card is
    // armed, and wears that card's name and colour.
    _paintHealButton(){
        const btn = this.healBtn;
        if (!btn) return;

        const card = this.scMend == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[this.scMend]];
        const shown = !!card && !this.finished;

        btn.bg.setVisible(shown);
        btn.text.setVisible(shown);
        if (!shown) return;

        btn.text.setText(`${card.icon} HEAL +${card.restores ?? ''} ESSE`);
        btn.bg.setStrokeStyle(3, card.glow, 0.9);
    }

    // _paintAfflictButton(): The Affliction button only stands while an
    // Affliction card is armed, and wears that card's affliction and colour.
    _paintAfflictButton(){
        const btn = this.afflictBtn;
        if (!btn) return;

        const card  = this.scHex == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[this.scHex]];
        const shown = !!card && !this.finished;

        btn.bg.setVisible(shown);
        btn.text.setVisible(shown);
        if (!shown) return;

        btn.text.setText(`${card.icon} USE ${card.affliction ?? card.name}`);
        btn.bg.setStrokeStyle(3, card.glow, 0.9);
    }

    // _paintCleanseButton(): The CLEANSE button only stands while a Cleanse
    // card is armed, and wears that card's colour.
    _paintCleanseButton(){
        const btn = this.cleanseBtn;
        if (!btn) return;

        const card  = this.scCleanse == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[this.scCleanse]];
        const shown = !!card && !this.finished;

        btn.bg.setVisible(shown);
        btn.text.setVisible(shown);
        if (!shown) return;

        btn.text.setText(`${card.icon} CLEANSE`);
        btn.bg.setStrokeStyle(3, card.glow, 0.9);
    }

    // _placeCastButtons(): HEAL, CLEANSE and the Affliction button share the
    // row under the base moves - centred as a group, side by side.
    _placeCastButtons(){
        const shown = [this.healBtn, this.cleanseBtn, this.afflictBtn].filter(btn => btn?.bg.visible);
        const cx    = this.cameras.main.width / 2;
        const step  = CAST_BTN_W + 24;

        shown.forEach((btn, i) => {
            const x = cx + (i - (shown.length - 1) / 2) * step;
            btn.bg.setX(x);
            btn.text.setX(x);
        });
    }

    // _pressAfflict(): Cast the armed Affliction card on the opposing card. It
    // is a base move, so it goes through _send() like ATTACK and DEFEND. A card
    // already afflicted is turned away here, and the card stays armed.
    _pressAfflict(){
        const index = this.scHex;
        const card  = index == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[index]];
        if (!card) return;

        const target = this._opponentActiveCard();
        if (target?.affliction){
            this._log(`${target.name} is already under ${target.affliction.name} - ${card.name} is kept.`);
            this._denySingularity(this.afflictBtn.bg);
            this._denySingularity(this.afflictBtn.text);
            return;
        }

        this._send(() => Net.afflict(index));
    }

    // _pressHeal(): Play the armed Healing card on the card in the arena. A
    // card already at full ESSE is turned away here, and the Healing card stays
    // armed - swap to a card that needs it and press again.
    _pressHeal(){
        const index = this.scMend;
        const card  = index == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[index]];
        if (!card) return;

        const you    = this.state?.you;
        const target = you?.cards?.find(c => c.id === you.activeCardId) ?? you?.cards?.[you?.activeIndex];

        if (target && target.esse >= (target.maxEsse || 100)){
            this._log(`${target.name} is already at full ESSE - ${card.name} is kept for a card that needs it.`);
            this._denySingularity(this.healBtn.bg);
            this._denySingularity(this.healBtn.text);
            return;
        }

        this._send(() => Net.useSingularityCard(card.id, index));
    }

    // _pressCleanse(): Play the armed Cleanse card on this player's own cards.
    // With no affliction on any of them it is turned away here, and the card
    // stays armed in its slot until one lands.
    _pressCleanse(){
        const index = this.scCleanse;
        const card  = index == null ? null : SC_BY_ID[this._singularityHand(this.state?.you)[index]];
        if (!card) return;

        const afflicted = (this.state?.you?.cards ?? []).some(c => !c.defeated && c.affliction);
        if (!afflicted){
            this._log(`None of your cards carry an affliction - ${card.name} is kept for when one lands.`);
            this._denySingularity(this.cleanseBtn.bg);
            this._denySingularity(this.cleanseBtn.text);
            return;
        }

        this._send(() => Net.useSingularityCard(card.id, index));
    }

    // --------------------------------------------- singularity cleanse playback --
    /** The 'singularity:used' event of a Cleanse card that holds the board while it plays. */
    _singularityCleanseOf(events){
        if (!Array.isArray(events)) return null;

        const used = events.find(ev => ev.type === 'singularity:used' && ev.attribute === 'cleanse');
        return used && this.singularityFx?.cleanseOf(SC_BY_ID[used.cardId]) ? used : null;
    }

    // _playSingularityCleanse(): A Cleanse card played. Everything is narrated
    // at once - the cinematic starts on 'singularity:used' - and the
    // afflictions are torn off the card on the burst. The state is held until
    // the cinematic has played. The turn is not passed: the cleanser's
    // controls come back when it is done.
    _playSingularityCleanse(events, state){
        const used = this._singularityCleanseOf(events);
        const tl   = this.singularityFx.cleanseOf(SC_BY_ID[used.cardId]);
        const you  = this._isYou(used.playerId);
        const slot = you ? this.playerSlot : this.oppSlot;

        this.sequencing = true;
        this.busy       = true;
        if (you) this.scCleanse = null;
        this._setControlsEnabled(false);

        for (const ev of events) this._narrate(ev);

        this.time.delayedCall(tl.BEATS.cleanse, () => {
            if (!this.scene.isActive()) return;

            const sideKey = you ? 'you' : 'opponent';
            const cured   = new Set((used.cleansed ?? []).map(c => c.cardId));
            const side    = this.state?.[sideKey];

            if (side?.cards){
                const cards = side.cards.map(c => (cured.has(c.id) ? { ...c, affliction: null } : c));
                this.state  = { ...this.state, [sideKey]: { ...side, cards } };
            }

            this.singularityFx.cleanseAffliction(slot);
        });

        return new Promise(resolve => {
            this.time.delayedCall(tl.HOLD_MS, () => {
                this.sequencing = false;
                this._settleBatch(state);
                resolve();
            });
        });
    }

    // ------------------------------------------------ singularity heal playback --
    /** The 'singularity:used' event of a Healing card that holds the board while it mends. */
    _singularityMendOf(events){
        if (!Array.isArray(events)) return null;

        const used = events.find(ev => ev.type === 'singularity:used' && ev.attribute === 'healing');
        return used && this.singularityFx?.mendOf(SC_BY_ID[used.cardId]) ? used : null;
    }

    // _playSingularityMend(): A Healing card played. Everything is narrated at
    // once - the mend starts on 'singularity:used' - and the ESSE bar refills
    // on the burst. The state is held until the mend has played, so the bar
    // does not jump ahead of it. The turn is not passed: the healer's controls
    // come back when it is done.
    _playSingularityMend(events, state){
        const used = this._singularityMendOf(events);
        const tl   = this.singularityFx.mendOf(SC_BY_ID[used.cardId]);
        const you  = this._isYou(used.playerId);
        const slot = you ? this.playerSlot : this.oppSlot;

        this.sequencing = true;
        this.busy       = true;
        if (you) this.scMend = null;
        this._setControlsEnabled(false);

        for (const ev of events) this._narrate(ev);

        // _setEsse() waits ATTACK_LAND_MS before it moves - started that much
        // early, the bar fills as the burst goes off.
        this.time.delayedCall(Math.max(0, tl.BEATS.restore - ATTACK_LAND_MS), () => {
            if (!this.scene.isActive() || !Number.isFinite(used.esseAfter)) return;

            this._patchEsse(you ? 'you' : 'opponent', used.targetCardId, used.esseAfter);
            if (slot?.cardId === used.targetCardId) this._setEsse(slot, used.esseAfter, used.maxEsse || 100, false);
        });

        return new Promise(resolve => {
            this.time.delayedCall(tl.HOLD_MS, () => {
                this.sequencing = false;
                this._settleBatch(state);
                resolve();
            });
        });
    }

    /** Write one card's ESSE into the held state, so a render mid-effect keeps the refill. */
    _patchEsse(sideKey, cardId, esse){
        const side = this.state?.[sideKey];
        if (!side?.cards) return;

        const cards = side.cards.map(c => (c.id === cardId ? { ...c, esse } : c));
        this.state  = { ...this.state, [sideKey]: { ...side, cards } };
    }

    // ------------------------------------------- singularity attack playback --
    /** The 'singularity:used' event in a batch that also carries its strikes. */
    _singularityStrikeOf(events){
        if (!Array.isArray(events)) return null;

        const used = events.find(ev => ev.type === 'singularity:used');
        if (!used || !this.singularityFx?.timelineOf(SC_BY_ID[used.cardId])) return null;

        return events.some(ev => ev.type === 'attack' && ev.singularity === used.cardId) ? used : null;
    }

    // _playSingularitySequence(): A Singularity attack, played to its card's
    // clock instead of all at once:
    //
    //   singularity:used  the initiation plays (NOVA_BURST_TIMING.CHARGE_MS)
    //   attack x n        each strike leaves on its beat and lands FLIGHT_MS later
    //   the rest          knockouts, patterns, PBM - once the last strike is in
    //   state             the board snaps to the server, SETTLE_MS after that
    //
    // The state is withheld until the end - it already holds the drained ESSE,
    // the next card up and the passed turn, none of which may show early. Each
    // strike drains the bar itself from its own esseAfter.
    _playSingularitySequence(events, state){
        const used = this._singularityStrikeOf(events);
        const card = SC_BY_ID[used.cardId];
        const tl   = this.singularityFx.timelineOf(card);

        this.sequencing = true;
        this.busy       = true;
        this.scArmed    = null;
        this._setControlsEnabled(false);

        const strikes = events.filter(ev => ev.type === 'attack' && ev.singularity === used.cardId);
        const lastAt  = tl.CHARGE_MS + (strikes.length - 1) * tl.STRIKE_GAP_MS;
        const landAt  = lastAt + tl.FLIGHT_MS;

        let past = false;
        for (const ev of events){
            if (ev === used){
                past = true;
                this._narrate(ev);
                continue;
            }

            if (!past){
                this._narrate(ev);
                continue;
            }

            const n = strikes.indexOf(ev);
            if (n >= 0){
                this.time.delayedCall(tl.CHARGE_MS + n * tl.STRIKE_GAP_MS,
                    () => this._playSingularityStrike(card, used, ev, n + 1, strikes.length, tl));
            }
            else {
                this.time.delayedCall(landAt, () => this._narrate(ev));
            }
        }

        return new Promise(resolve => {
            this.time.delayedCall(landAt + tl.SETTLE_MS, () => {
                this.sequencing = false;
                this._settleBatch(state);
                resolve();
            });
        });
    }

    /** The 'singularity:used' event of a Defence card that holds the board while it forms. */
    _singularityFieldOf(events){
        if (!Array.isArray(events)) return null;

        const used = events.find(ev => ev.type === 'singularity:used' && ev.attribute === 'defence');
        return used && this.singularityFx?.holdOf(SC_BY_ID[used.cardId]) ? used : null;
    }

    // _playSingularityField(): A Defence card raised by DEFEND. Everything is
    // narrated at once - the field starts forming on 'singularity:used' - but
    // the state, which passes the turn, is held until the field has formed, so
    // the opponent cannot strike through the middle of the cinematic.
    _playSingularityField(events, state){
        const used = this._singularityFieldOf(events);
        const hold = this.singularityFx.holdOf(SC_BY_ID[used.cardId]);

        this.sequencing = true;
        this.busy       = true;
        this.scGuard    = null;
        this._setControlsEnabled(false);

        for (const ev of events) this._narrate(ev);

        return new Promise(resolve => {
            this.time.delayedCall(hold, () => {
                this.sequencing = false;
                this._settleBatch(state);
                resolve();
            });
        });
    }

    /** The 'singularity:used' event of an Affliction card that holds the board while it is cast. */
    _singularityHexOf(events){
        if (!Array.isArray(events)) return null;

        const used = events.find(ev => ev.type === 'singularity:used' && ev.attribute === 'affliction');
        return used && this.singularityFx?.hexOf(SC_BY_ID[used.cardId]) ? used : null;
    }

    // _playSingularityHex(): An Affliction card cast. Everything is narrated at
    // once - the cast starts on 'singularity:used' - but the state, which
    // passes the turn and carries the affliction, is held until the void has
    // closed over the card, so nothing on the board moves through the cinematic.
    _playSingularityHex(events, state){
        const used = this._singularityHexOf(events);
        const tl   = this.singularityFx.hexOf(SC_BY_ID[used.cardId]);

        this.sequencing = true;
        this.busy       = true;
        if (this._isYou(used.playerId)) this.scHex = null;
        this._setControlsEnabled(false);

        for (const ev of events) this._narrate(ev);

        return new Promise(resolve => {
            this.time.delayedCall(tl.HOLD_MS, () => {
                this.sequencing = false;
                this._settleBatch(state);
                resolve();
            });
        });
    }

    // _playSingularityStrike(): One strike of a Singularity attack. The card's
    // own effect flies at once; the scene's hit - lunge, shake, damage, SP and
    // the ESSE drain - is started so its contact falls as the effect arrives.
    _playSingularityStrike(card, used, ev, n, of, tl){
        if (!this.scene.isActive()) return;

        const you      = this._isYou(used.playerId);
        const defender = you ? this.oppSlot : this.playerSlot;

        this.singularityFx.strikeSingularityCard(card, {
            you,
            caster: you ? this.playerSlot : this.oppSlot,
            rival:  defender,
            event:  ev,
        }, ev, n, of);

        this.time.delayedCall(Math.max(0, tl.FLIGHT_MS - ATTACK_LAND_MS), () => {
            if (!this.scene.isActive()) return;

            this._narrate(ev);

            // The bar drains strike by strike; the final state then finds it
            // already where it should be.
            const side   = you ? this.state?.opponent : this.state?.you;
            const target = side?.cards?.find(c => c.id === ev.defenderCardId);
            if (defender && Number.isFinite(ev.esseAfter)){
                this._setEsse(defender, ev.esseAfter, target?.maxEsse || 100, false);
            }
        });
    }

    // _useSingularityCard(): Play the card. The slot releases it toward the
    // player's fighter on the ack; the effect itself waits for the server's
    // 'singularity:used' event, which both clients receive.
    async _useSingularityCard(slot){
        if (!slot.usable || this.scBusy) return;

        const card = SC_BY_ID[slot.cardId];
        if (!card) return;

        this.scBusy = true;
        this._hideSingularityTip();
        this._render();

        const res = await Net.useSingularityCard(card.id);
        if (!this.scene.isActive()) return;

        this.scBusy = false;

        if (!res.ok){
            this._log(res.error);
            this._denySingularity(slot.cell);
            this._render();
            return;
        }

        if (res.state) this.state = res.state;
        if (!this._servesSingularityHand()) this.singularityHand[slot.index] = null;

        this._releaseSingularitySlot(slot, card);
        this._render();
    }

    // _playSingularityCard(): The server says a card was played - hand it to the
    // animation class with both fighters, from the point of view of whoever
    // played it.
    _playSingularityCard(ev){
        const card = SC_BY_ID[ev.cardId];
        if (!card || !this.singularityFx) return;

        const you = this._isYou(ev.playerId);

        // An armed card leaves its slot as its effect starts - the state that
        // empties the slot is held back until the effect is done.
        if (you && Number.isInteger(ev.slotIndex) && ARMED_ATTRIBUTES.includes(card.attribute)){
            const slot = this.scSlots?.[ev.slotIndex];
            const hand = this._singularityHand(this.state?.you);
            hand[ev.slotIndex] = null;

            if (this.state?.you) this.state = { ...this.state, you: { ...this.state.you, singularityCards: hand } };
            if (!this._servesSingularityHand()) this.singularityHand[ev.slotIndex] = null;

            if (slot) this._releaseSingularitySlot(slot, card);
            this._render();
        }

        this.singularityFx.determineSingularityCard(card, {
            you,
            caster: you ? this.playerSlot : this.oppSlot,
            rival:  you ? this.oppSlot    : this.playerSlot,
            event:  ev,
        });
    }

    // _forgeSingularitySlot(): A bought card arriving - motes of its colour
    // drawn in from around the slot, then a flash and a ring as it sets.
    _forgeSingularitySlot(slot, def){
        const cx = slot.cell.x;
        const cy = SC_SLOT_Y;

        for (let i = 0; i < 12; i++){
            const a    = (i / 12) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
            const r    = Phaser.Math.Between(96, 130);
            const mote = this.add.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8,
                Phaser.Math.FloatBetween(1.8, 3.2), def.glow, 1)
                .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);

            this.scPanel.add(mote);

            this.tweens.add({
                targets:    mote,
                x:          cx,
                y:          cy,
                alpha:      { from: 1, to: 0.2 },
                scale:      0.4,
                duration:   360,
                delay:      i * 16,
                ease:       'Cubic.easeIn',
                onComplete: () => mote.destroy(),
            });
        }

        const settle = 380;

        this.tweens.add({
            targets:  slot.flash,
            alpha:    { from: 0.85, to: 0 },
            duration: 420,
            delay:    settle,
            ease:     'Cubic.easeOut',
        });

        this.tweens.add({
            targets:  slot.cell,
            scale:    { from: 1.14, to: 1 },
            duration: 460,
            delay:    settle,
            ease:     'Back.easeOut',
        });

        const ring = this.add.graphics();
        ring.lineStyle(2, def.glow, 0.9);
        ring.strokeRoundedRect(-SC_SLOT_W / 2, -SC_SLOT_H / 2, SC_SLOT_W, SC_SLOT_H, 12);
        ring.setPosition(cx, cy).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
        this.scPanel.add(ring);

        this.tweens.add({
            targets:    ring,
            alpha:      { from: 1, to: 0 },
            scale:      1.3,
            duration:   560,
            delay:      settle,
            ease:       'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });

        this.tweens.add({
            targets:  this.scFlash,
            alpha:    { from: 0.2, to: 0 },
            duration: 360,
            delay:    settle,
            ease:     'Cubic.easeOut',
        });
    }

    // _releaseSingularitySlot(): A played card leaving its slot - a ghost of
    // it thrown up to the player's fighter, where the effect will play.
    _releaseSingularitySlot(slot, card){
        const x = this.scPanel.x + slot.cell.x;
        const y = this.scPanel.y + SC_SLOT_Y;

        const ghost = this.add.container(x, y);

        const plate = this.add.rectangle(0, 0, SC_SLOT_W, SC_SLOT_H, card.color, 0.14)
            .setStrokeStyle(2, card.glow, 0.9);
        const glyph = this.add.text(0, -SC_SLOT_H / 2 + 40, card.icon, {
            fontFamily: 'monospace', fontSize: '34px', color: hexOf(card.color),
        }).setOrigin(0.5);

        ghost.add([plate, glyph]);

        this.tweens.add({
            targets:    ghost,
            x:          this.playerSlot?.homeX ?? x,
            y:          this.playerSlot?.homeY ?? y - 200,
            scale:      1.35,
            alpha:      0,
            duration:   560,
            ease:       'Cubic.easeIn',
            onComplete: () => ghost.destroy(),
        });

        this.tweens.add({
            targets:  slot.flash,
            alpha:    { from: 0.7, to: 0 },
            duration: 360,
            ease:     'Cubic.easeOut',
        });
    }

    // _denySingularity(): A refusal - a short, decaying shake on whatever was
    // pressed. The home position is taken once and reused, so a second shake
    // landing mid-shake cannot walk the object off its mark.
    _denySingularity(target){
        if (!target?.active) return;

        if (target.getData('homeX') == null) target.setData('homeX', target.x);
        const homeX = target.getData('homeX');

        target.getData('denyTween')?.stop();

        target.setData('denyTween', this.tweens.addCounter({
            from:     0,
            to:       1,
            duration: 360,
            ease:     'Linear',
            onUpdate: (tw) => {
                const t = tw.getValue();
                target.x = homeX + Math.sin(t * Math.PI * 6) * 8 * (1 - t);
            },
            onComplete: () => { target.x = homeX; },
        }));
    }

    // _paintSoftGlow(): A glow a Shape cannot give - three rounded bands
    // stepping out from the edge, each fainter than the last. It sits under an
    // opaque body, so only the falloff past the edge ever shows.
    _paintSoftGlow(g, w, h, radius, color, alpha){
        g.clear();

        [[3, 0.6], [7, 0.32], [12, 0.14]].forEach(([pad, a]) => {
            g.fillStyle(color, alpha * a);
            g.fillRoundedRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2, radius + pad);
        });
    }

    // _fxGlow(): A preFX glow on a Text or Image. preFX exists only under WebGL
    // and only on textured objects; anywhere else this does nothing, and the
    // object is drawn exactly as it would have been. The padding widens the
    // texture the shader runs on, or the glow is clipped at the glyph's edge.
    _fxGlow(obj, color, strength = 2){
        const fx = obj?.preFX;
        if (!fx) return null;

        fx.setPadding(Math.max(fx.padding ?? 0, 10));
        return fx.addGlow(color, strength, 0, false, 0.1, 12);
    }

    _buildControls(width, height){
        const y = Math.round(height * 0.79);

        // An armed Attack Singularity Card goes out with the attack. The slot is
        // read at press time, so disarming right up to the click is honoured.
        this.attackBtn = this._button(width / 2 - 110, y, 'ATTACK', 0x00ffcc, 0x001a11,
            () => this._send(() => Net.attack(this.scArmed)));

        // An armed Defence Singularity Card goes up with the defend, the same way.
        this.defendBtn = this._button(width / 2 + 110, y, 'DEFEND', 0xffdd00, 0x1a1400,
            () => this._send(() => Net.defend(this.scGuard)));

        // An armed Healing Singularity Card is played by its own button, under
        // the two base moves. It only stands while one is armed - see
        // _paintHealButton().
        this.healBtn = this._button(width / 2, y + 58, 'HEAL', 0x1dff3c, 0x00240a,
            () => this._pressHeal(), CAST_BTN_W);
        this.healBtn.bg.setVisible(false);
        this.healBtn.text.setVisible(false);

        // An armed Affliction Singularity Card is cast by its own button on the
        // same row - 'USE COSMIC DARKNESS' for Dark Disturbance. Unlike HEAL it
        // is a base move, so pressing it ends the turn. It only stands while one
        // is armed - see _paintAfflictButton().
        this.afflictBtn = this._button(width / 2, y + 58, 'USE', 0xee44ff, 0x14001f,
            () => this._pressAfflict(), CAST_BTN_W);
        this.afflictBtn.bg.setVisible(false);
        this.afflictBtn.text.setVisible(false);

        // An armed Cleanse Singularity Card is played by its own button on the
        // same row. Like HEAL it costs no turn. It only stands while one is
        // armed - see _paintCleanseButton().
        this.cleanseBtn = this._button(width / 2, y + 58, 'CLEANSE', 0xfacc15, 0x1a1200,
            () => this._pressCleanse(), CAST_BTN_W);
        this.cleanseBtn.bg.setVisible(false);
        this.cleanseBtn.text.setVisible(false);
    }

    _button(x, y, label, stroke, fill, onClick, w = 190){
        const bg = this.add.rectangle(x, y, w, 46, fill, 0.9).setOrigin(0.5);
        bg.setStrokeStyle(2, stroke, 0.85);

        const text = this.add.text(x, y, label, {
            fontSize: '17px', color: '#ffffff',
        }).setOrigin(0.5);

        bg.on('pointerdown', onClick);

        return { bg, text, stroke };
    }

    _buildLog(width, height){
        this.logText = this.add.text(width / 2, Math.round(height * 0.88), '', {
            fontSize: '12px', color: '#7788aa', align: 'center',
        }).setOrigin(0.5, 0);
    }

    // ----------------------------------------------------------------- render --

    _render(){
        const s = this.state;
        if (!s) return;

        this._renderSlot(this.oppSlot,    s.opponent);
        this._renderSlot(this.playerSlot, s.you);
        this.singularityFx?.syncField(this.oppSlot,    s.opponent);
        this.singularityFx?.syncField(this.playerSlot, s.you);
        this.singularityFx?.syncAffliction(this.oppSlot,    s.opponent);
        this.singularityFx?.syncAffliction(this.playerSlot, s.you);
        this._renderDeck(s.you);
        this._syncSingularityPoints();
        this._renderSingularityPanel(s.you);
        this._renderPatternBonus();

        const mine = this._isMyTurn();
        this.turnText.setText(this.finished ? '— MATCH OVER —' : mine ? '— YOUR TURN —' : '— OPPONENT\'S TURN —');
        this.turnText.setColor(this.finished ? '#888899' : mine ? '#00ffcc' : '#ff6600');

        this._setControlsEnabled(mine && !this.busy && !this.finished);
    }

    // _renderSlot(): Put the server's view of one fighter on its card. The face
    // is only torn down when the card itself changed; everything else is a
    // value written into furniture that is already standing.
    _renderSlot(slot, side){
        if (!side) return;

        const card = side.cards.find(c => c.id === side.activeCardId) || side.cards[side.activeIndex];
        if (!card) return;

        const swapped = card.id !== slot.cardId;
        if (swapped) this._drawCardFace(slot, card);

        slot.stats.atk.setText(String(card.atk));
        slot.stats.def.setText(String(card.def));
        slot.stats.sp.setText(String(side.sp ?? 0));

        slot.defendRing.setVisible(!!side.defending);
        slot.defendBadge.setVisible(!!side.defending);

        // A fresh card arrives at whatever ESSE it has; a card that was just hit
        // drains down to it, timed to land with the blow.
        this._setEsse(slot, card.esse, card.maxEsse || 100, swapped);
    }

    // _setEsse(): Drain (or refill) the bar and its readout together. The count
    // is delayed by the same beat the lunge takes, so the bar gives way as the
    // hit lands rather than before the attacker has crossed the stage.
    _setEsse(slot, esse, max, immediate){
        slot.esseTween?.stop();
        slot.esseTween = null;

        const paint = (value) => {
            const pct = Phaser.Math.Clamp(value / max, 0, 1);

            slot.barFill.scaleX = pct;
            slot.barFill.setFillStyle(pct > 0.5 ? slot.accent : pct > 0.25 ? 0xffaa00 : 0xff3344);
            slot.esseText.setText(`ESSE  ${Math.round(value)} / ${max}`);
        };

        if (immediate || slot.esseShown === esse){
            slot.esseShown = esse;
            paint(esse);
            return;
        }

        slot.esseTween = this.tweens.addCounter({
            from:     slot.esseShown,
            to:       esse,
            duration: 420,
            delay:    ATTACK_LAND_MS,
            ease:     'Cubic.easeOut',
            onUpdate: (tw) => {
                slot.esseShown = tw.getValue();
                paint(slot.esseShown);
            },
            onComplete: () => {
                slot.esseTween = null;
                slot.esseShown = esse;
                paint(esse);
            },
        });
    }

    _setControlsEnabled(on){
        for (const btn of [this.attackBtn, this.defendBtn, this.healBtn, this.afflictBtn, this.cleanseBtn]){
            if (!btn) continue;

            btn.bg.setAlpha(on ? 1 : 0.35);
            btn.text.setAlpha(on ? 1 : 0.45);

            if (on) btn.bg.setInteractive({ useHandCursor: true });
            else    btn.bg.disableInteractive();
        }
    }

    /** The turn clock. The deadline is the server's - this only counts it down. */
    update(){
        if (!this.state || this.finished) return;

        const left = Math.max(0, (this.state.turn?.deadline ?? 0) - Date.now());
        this.clockText.setText(`${Math.ceil(left / 1000)}s`);
        this.clockText.setColor(left < TURN_WARN_MS ? '#ff5544' : '#888899');
    }

    // ------------------------------------------------------------------- feed --

    /** Turn one engine event into a line of readable battle text. */
    _narrate(ev){
        const nameOf = (id) => this._isYou(id)
            ? (this.data_.you?.name ?? 'You')
            : (this.data_.opponent?.name ?? 'Opponent');

        switch (ev.type)
        {
            case 'attack':
                this._log(ev.damage === 0
                    ? `${nameOf(ev.attackerId)} missed.`
                    : `${nameOf(ev.attackerId)} hit for ${ev.damage}${ev.field ? ' (contained)' : ev.defended ? ' (blocked)' : ev.pierced ? ' (guard pierced)' : ''}` +
                      `${ev.bonusDamage ? ` (incl. +${ev.bonusDamage})` : ''}` +
                      `${ev.multiplier === 1 ? ' - CRITICAL!' : ''}` +
                      `${ev.singularity ? ` [${SC_BY_ID[ev.singularity]?.name ?? 'SINGULARITY'} ${ev.strike}/${ev.strikes}]` : ''}`);
                this._playAttack(ev);
                this._creditSingularityPoints(ev);
                this._notePbmAttack(ev);
                break;

            case 'pattern:scored':
                this._log(`${nameOf(ev.playerId)} chained ` +
                    `${(ev.moves ?? []).map(m => PB_MOVES[m]?.label ?? m).join(' > ')} for +${ev.points} PBP.`);
                this._playPatternScored(ev);
                break;

            case 'pattern:broken':
                this._log(`${nameOf(ev.playerId)}'s pattern broke.`);
                this._playPatternBroken(ev);
                break;

            case 'pbm:start':
                this._log(`${nameOf(ev.playerId)} entered PATTERN BONUS MODE!`);
                this._schedulePbMode(ev.playerId, true, PB_START_DELAY_MS);
                break;

            case 'pbm:end':
                this._log(`${nameOf(ev.playerId)}'s Pattern Bonus Mode has ended.`);
                this._schedulePbMode(ev.playerId, false, PB_END_DELAY_MS);
                break;

            case 'defend':
                this._log(ev.field
                    ? `${nameOf(ev.playerId)} raised a ${SC_BY_ID[ev.field]?.name ?? 'field'}.`
                    : `${nameOf(ev.playerId)} braced for impact.`);
                break;

            case 'field:broken': {
                this._log(`${nameOf(ev.playerId)}'s ${SC_BY_ID[ev.singularity]?.name ?? 'field'} broke.`);

                // The blow that broke it lands first.
                const slot = this._isYou(ev.playerId) ? this.playerSlot : this.oppSlot;
                this.singularityFx?.breakField(slot, ATTACK_LAND_MS + 380);
                break;
            }

            case 'swap':
                this._log(`${nameOf(ev.playerId)} switched cards.`);
                break;

            case 'card:defeated':
                this._log(`${nameOf(ev.playerId)} lost a card!`);
                break;

            case 'turn:timeout':
                this._log(`${nameOf(ev.playerId)} ran out of time.`);
                break;

            case 'singularity:bought':
                this._log(`${nameOf(ev.playerId)} bought ${SC_BY_ID[ev.cardId]?.name ?? 'a Singularity Card'}.`);
                break;

            case 'singularity:used':
                this._log(`${nameOf(ev.playerId)} played ${SC_BY_ID[ev.cardId]?.name ?? 'a Singularity Card'}!` +
                    `${ev.attribute === 'healing' && Number.isFinite(ev.healed) ? ` (+${ev.healed} ESSE)` : ''}` +
                    `${ev.attribute === 'affliction' && ev.affliction ? ` ${this._cardNameOf(ev.targetPlayerId, ev.targetCardId)}` +
                        ` is lost to ${ev.affliction.name}.` : ''}` +
                    `${ev.attribute === 'cleanse' && Array.isArray(ev.cleansed) ? ' ' + ev.cleansed
                        .map(c => `${c.name} is broken off ${this._cardNameOf(ev.playerId, c.cardId)}.`).join(' ') : ''}`);
                this._playSingularityCard(ev);
                break;

            // An afflicted card attacked and bled for it. It lands with the
            // blow; the ESSE bar drains with the state that follows.
            case 'affliction:tick': {
                this._log(`${this._cardNameOf(ev.playerId, ev.cardId)} lost ${ev.esseLoss} ESSE to ${ev.name}` +
                    ` (${ev.attacksLeft} attack${ev.attacksLeft === 1 ? '' : 's'} left).`);

                const slot = this._isYou(ev.playerId) ? this.playerSlot : this.oppSlot;
                this.singularityFx?.afflictionTick(slot, ev, ATTACK_LAND_MS + 60);
                break;
            }

            case 'affliction:ended': {
                if (ev.expired) this._log(`${ev.name} has lifted from ${this._cardNameOf(ev.playerId, ev.cardId)}.`);

                const slot = this._isYou(ev.playerId) ? this.playerSlot : this.oppSlot;
                this.singularityFx?.liftAffliction(slot, ev, ATTACK_LAND_MS + 700);
                break;
            }

            default:
                break;
        }
    }

    /** A card's name from the state, by the side that holds it. */
    _cardNameOf(playerId, cardId){
        const side = this._isYou(playerId) ? this.state?.you : this.state?.opponent;
        return side?.cards?.find(c => c.id === cardId)?.name ?? 'The card';
    }

    /** Pop the damage number over whichever slot took it. */
    // ---------------------------------------------------------------- combat --
    // _playAttack(): One exchange, played out in the gap between the cards.
    //
    //   lunge -> land -> recoil and shake -> walk back
    //
    // How hard it lands is the same rung the SP panel reads, so the two always
    // agree: a 0.50 graze nudges the card and throws a few sparks, a critical
    // throws the card, knocks the camera and lights the whole frame. The rung
    // is the only thing that varies - the shape of the beat never does.
    _playAttack(ev){
        const youAttacked = this._isYou(ev.attackerId);
        const attacker    = youAttacked ? this.playerSlot : this.oppSlot;
        const defender    = youAttacked ? this.oppSlot    : this.playerSlot;

        if (!attacker || !defender) return;

        const index = this._spRungOf(ev);
        const force = HIT_FORCE[index] ?? HIT_FORCE[2];

        // Whatever the last exchange left running is cleared first. Two effects
        // writing this card's position would otherwise hand it back off its mark
        // when the shorter of them finished.
        this._stopSlotMotion(attacker);

        // The lunge. Held at full reach for a beat so the hit reads as landing
        // at the top of the movement rather than somewhere along the way.
        attacker.motion = this.tweens.add({
            targets:  attacker.root,
            x:        attacker.homeX + attacker.facing * ATTACK_REACH,
            duration: 170,
            hold:     90,
            yoyo:     true,
            ease:     'Back.easeIn',
        });

        this.time.delayedCall(ATTACK_LAND_MS, () => {
            if (!this.scene.isActive()) return;
            this._landHit(defender, ev, index, force);
        });
    }

    // _landHit(): The moment of contact on the defending card.
    _landHit(slot, ev, index, force){
        const critical = index === HIT_FORCE.length - 1;
        const missed   = index === 0 || ev.damage === 0;

        this._stopSlotMotion(slot);

        // The contact point is the defender's leading edge, which `facing`
        // already names - it points back at whoever is swinging.
        const hitX = slot.homeX + slot.facing * (CARD_W / 2);
        const hitY = slot.homeY - 20;

        if (missed){
            this._playDodge(slot, hitX, hitY);
            return;
        }

        this._hitSparks(hitX, hitY, slot.facing, force, critical, ev.defended);
        this._shakeSlot(slot, force);

        this.tweens.add({
            targets:  slot.flash,
            alpha:    { from: critical ? 0.9 : 0.45, to: 0 },
            duration: critical ? 420 : 240,
            ease:     'Cubic.easeOut',
        });

        // A critical is the only thing in the match allowed to touch the camera,
        // and it is kept to a knock - the board still has to be readable while
        // it happens.
        if (critical) this.cameras.main.shake(240, 0.006);

        this._floatDamage(slot, hitX, hitY, ev, critical);

        if (ev.field)         this.singularityFx?.fieldStruck(slot, hitX, hitY);
        else if (ev.defended) this._playGuard(slot, hitX, hitY);
    }

    // _shakeSlot(): Recoil and rattle in one decaying tween. Both come off the
    // same falling amplitude, so the card is thrown hardest at the instant of
    // contact and walks itself back - two tweens fighting over root.x would
    // just leave the card somewhere neither of them meant.
    _shakeSlot(slot, force){
        slot.shake?.stop();

        slot.shake = this.tweens.addCounter({
            from:     1,
            to:       0,
            duration: force.ms,
            ease:     'Cubic.easeOut',
            onUpdate: (tw) => {
                const t    = tw.getValue();
                const lean = -slot.facing * force.push * t;

                slot.root.x = slot.homeX + lean + Phaser.Math.Between(-force.shake, force.shake) * t;
                slot.root.y = slot.homeY + Phaser.Math.Between(-force.shake, force.shake) * t;
                slot.root.rotation = Phaser.Math.DegToRad(force.shake * 0.12 * t * -slot.facing);
            },
            onComplete: () => {
                slot.shake = null;
                slot.root.setPosition(slot.homeX, slot.homeY);
                slot.root.rotation = 0;
            },
        });
    }

    // _stopSlotMotion(): Put a card back on its mark and drop anything still
    // moving it. Called before a new effect takes the card over, so an exchange
    // can never inherit half of the last one.
    _stopSlotMotion(slot){
        slot.shake?.stop();
        slot.motion?.stop();
        slot.shake  = null;
        slot.motion = null;

        slot.root.setPosition(slot.homeX, slot.homeY);
        slot.root.setRotation(0);
        slot.root.setAlpha(1);
    }

    // _hitSparks(): The shower off the contact point - a flare at the centre,
    // shards thrown back along the incoming line, and a shockwave ring that only
    // a critical earns.
    _hitSparks(x, y, facing, force, critical, defended){
        const tint = defended ? 0xffdd55 : critical ? 0xffe066 : 0xfff2cc;

        const flare = this.add.circle(x, y, critical ? 34 : 20, tint, 0.85)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({
            targets:    flare,
            scale:      critical ? 2.4 : 1.6,
            alpha:      0,
            duration:   critical ? 420 : 260,
            ease:       'Cubic.easeOut',
            onComplete: () => flare.destroy(),
        });

        for (let i = 0; i < force.sparks; i++){
            // Thrown back the way the blow came in, inside a cone. `facing`
            // already sets which way that is - atan2(0, -1) is a half turn -
            // so nothing downstream may flip x again.
            const spread = Phaser.Math.FloatBetween(-0.95, 0.95);
            const angle  = Math.atan2(0, facing) + spread;
            const speed  = Phaser.Math.Between(70, 90 + force.push * 5);
            const life   = Phaser.Math.Between(260, 540);

            const shard = this.add.rectangle(
                x, y + Phaser.Math.Between(-42, 42),
                Phaser.Math.Between(7, 18), 2, tint, 1,
            ).setBlendMode(Phaser.BlendModes.ADD);

            shard.rotation = angle;

            this.tweens.add({
                targets:    shard,
                x:          x + Math.cos(angle) * speed,
                y:          shard.y + Math.sin(angle) * speed,
                scaleX:     0.2,
                alpha:      0,
                duration:   life,
                ease:       'Cubic.easeOut',
                onComplete: () => shard.destroy(),
            });
        }

        if (!critical) return;

        const wave = this.add.circle(x, y, 26, tint, 0)
            .setStrokeStyle(3, tint, 0.9)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({
            targets:    wave,
            scale:      5.5,
            alpha:      0,
            duration:   620,
            ease:       'Cubic.easeOut',
            onComplete: () => wave.destroy(),
        });
    }

    // _playDodge(): A miss. The card slips the blow instead of eating it, which
    // is the one response that must not look like damage.
    _playDodge(slot, hitX, hitY){
        slot.motion = this.tweens.add({
            targets:  slot.root,
            y:        slot.homeY - 26,
            alpha:    0.55,
            duration: 130,
            yoyo:     true,
            ease:     'Sine.easeOut',
            onComplete: () => {
                slot.motion = null;
                slot.root.setPosition(slot.homeX, slot.homeY);
                slot.root.setAlpha(1);
            },
        });

        const miss = this.add.text(hitX, hitY, 'MISS', {
            fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold',
            color: '#9fb4c4', stroke: '#04121a', strokeThickness: 5,
        }).setOrigin(0.5);

        this.tweens.add({
            targets:    miss,
            y:          hitY - 70,
            alpha:      0,
            duration:   760,
            ease:       'Cubic.easeOut',
            onComplete: () => miss.destroy(),
        });
    }

    // _playGuard(): The shield taking its one hit - a gold arc struck on the
    // contact edge, thrown outward and gone.
    _playGuard(slot, hitX, hitY){
        const arc = this.add.circle(hitX, hitY, 40, 0xffdd55, 0)
            .setStrokeStyle(4, 0xffdd55, 0.9)
            .setBlendMode(Phaser.BlendModes.ADD);

        this.tweens.add({
            targets:    arc,
            scale:      1.9,
            alpha:      0,
            duration:   520,
            ease:       'Cubic.easeOut',
            onComplete: () => arc.destroy(),
        });
    }

    // _floatDamage(): The number coming off the hit. A critical says so.
    _floatDamage(slot, hitX, hitY, ev, critical){
        const text = this.add.text(hitX, hitY, `-${ev.damage}`, {
            fontFamily: 'monospace',
            fontSize:   critical ? '44px' : '30px',
            fontStyle:  'bold',
            color:      critical ? '#ffe066' : ev.field ? '#ffd0c8' : ev.defended ? '#ffdd55' : '#ff8f8f',
            stroke:     '#04121a',
            strokeThickness: 6,
        }).setOrigin(0.5).setScale(critical ? 2.2 : 1.5);

        this.tweens.add({
            targets:  text,
            scale:    1,
            duration: critical ? 360 : 220,
            ease:     'Back.easeOut',
        });

        this.tweens.add({
            targets:    text,
            y:          hitY - 96,
            alpha:      0,
            delay:      260,
            duration:   760,
            ease:       'Cubic.easeIn',
            onComplete: () => text.destroy(),
        });

        if (!critical) return;

        const tag = this.add.text(hitX, hitY + 42, 'CRITICAL HIT', {
            fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold',
            color: '#ffe066', stroke: '#04121a', strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets:  tag,
            alpha:    { from: 0, to: 1 },
            y:        hitY + 30,
            duration: 240,
            ease:     'Back.easeOut',
        });

        this.tweens.add({
            targets:    tag,
            alpha:      0,
            delay:      700,
            duration:   360,
            onComplete: () => tag.destroy(),
        });
    }

    _log(line){
        if (!line) return;

        this.logLines.push(line);
        if (this.logLines.length > 4) this.logLines.shift();
        this.logText?.setText(this.logLines.join('\n'));
    }

    // ----------------------------------------------------------------- ending --

    _showResult(result){
        const { width, height } = this.cameras.main;
        const won = result?.winnerId === (this.state?.you?.playerId ?? Net.playerId);

        this._setControlsEnabled(false);

        const veil = this.add.rectangle(0, 0, width, height, 0x000010, 0.78).setOrigin(0);
        veil.setDepth(100);

        this.add.text(width / 2, height / 2 - 40, won ? 'VICTORY' : 'DEFEAT', {
            fontSize: '48px', color: won ? '#00ffcc' : '#ff4466',
        }).setOrigin(0.5).setDepth(101);

        const REASONS = {
            defeat:  'All cards eliminated',
            forfeit: won ? 'Opponent forfeited' : 'You forfeited',
            timeout: won ? 'Opponent ran out of time' : 'You ran out of time',
        };

        this.add.text(width / 2, height / 2 + 6, REASONS[result?.reason] ?? '', {
            fontSize: '15px', color: '#8899aa',
        }).setOrigin(0.5).setDepth(101);

        const btn = this.add.rectangle(width / 2, height / 2 + 70, 200, 44, 0x14142a, 0.95).setOrigin(0.5);
        btn.setStrokeStyle(2, 0x00ffcc, 0.85).setDepth(101);
        btn.setInteractive({ useHandCursor: true });

        this.add.text(width / 2, height / 2 + 70, 'BACK TO MENU', {
            fontSize: '15px', color: '#ffffff',
        }).setOrigin(0.5).setDepth(102);

        btn.on('pointerdown', () => this.scene.start('MultiplayerScene'));
    }

    /** No match to show - do not strand the player on a dead screen. */
    _bail(message){
        this.finished = true;
        this._log(message || 'This match is no longer available');
        this._setControlsEnabled(false);
        this.time.delayedCall(2500, () => this.scene.start('MultiplayerScene'));
    }
}

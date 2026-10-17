/** |MultiplayersScene.js|
 * Strive: We Are Zonis
 *
 * The multiplayer hub. Shows announcments, newly released Initiator Cards,
 * and the player's current PvP deck. Routes to CreateDeckScene or matchmaking.
 *
 * No networking yet - all data comes from local stubs marked with TODO,
 * so this drops straight into thes server later without touching layout.
 *
 */

import { AuthService } from "../services/AuthServices.js";

export default class MultiplayerScene extends Phaser.Scene {
    constructor(){
        super('MultiplayerScene');
    }

    init(){
        // Phasers registry is a global store shared across all scenes.
        // CardSelectScene will write to this key when the player saves a deck.
        this.playerDeck = this.registry.get('pvpDeck') || null; 
        this.profile = this.registry.get('profile') || null;
        this.isGuest = this.registry.get('isGuest') ?? true; 

        console.log('Profile: ', this.profile); // Testing
        console.log('Guest: ', this.isGuest); // Testing 
        console.log('Deck: ', this.playerDeck); // Testing

        // TODO: If you want the buttons to reflect loggeds-in state, read the registrys in init():
    }

    preload(){
        this.load.image('multiplayerHero', 'assets/backgroundImages/tobo_the_fighter_con_2.png');

        // Initiator art for the Card Deck Panel. Keys match card.name so the
        // panel can look a texture up directly; cards without art fall back to a
        // styled monogram, so this list only needs the art that actually exists.
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
        this.cameras.main.fadeIn(1200, 0, 0, 0);

        this.buildBackground();
        this.profilePanel(); 
        this.buildAnnouncementsPanel();
        this.buildAccessPanel();
        this.buildCardDeckPanel();
    }

    // buildBackground(): Will build the main background for the multiplayer lobby section.
    buildBackground(){
        const { width, height } = this.scale;

        this._drawBaseBackdrop(width, height);
        this._drawHeroArt(width, height);
        this._drawAtmosphericWash(width, height);
        this._drawGlobalNetworkGlobe(width * 0.5, height * 0.235);
        this._drawDriftingEmbers(width, height);
        this._drawSceneTitle(width);
    }

    _drawBaseBackdrop(width, height){
        this.add.rectangle(0, 0, width, height, 0x0a0f14, 1).setOrigin(0);

        // Cool slate-blue haze, echoing the tones in the artwork's shadows
        this.add.ellipse(width * 0.16, height * 0.16, width * 0.55, height * 0.42, 0x1b3138, 0.45);
        this.add.ellipse(width * 0.06, height * 0.55, width * 0.40, height * 0.55, 0x102229, 0.40);

        // Warm ember haze bleeding up from the lower half
        this.add.ellipse(width * 0.62, height * 0.92, width * 0.65, height * 0.45, 0x3a0d0d, 0.30);
        this.add.ellipse(width * 0.90, height * 0.70, width * 0.45, height * 0.50, 0x2a0a0a, 0.28);
    }

    _drawHeroArt(width, height){
        const hero  = this.add.image(width * 0.80, height * 0.50, 'multiplayerHero');
        const scale = (height / hero.height) * 1.18;
        hero.setScale(scale).setOrigin(0.5);

        // Gradient scrim blends the art into the dark backdrop on the left,
        // clearing the way for the glass access panel.
        const scrim = this.add.graphics();
        scrim.fillGradientStyle(0x0a0f14, 0x0a0f14, 0x0a0f14, 0x0a0f14, 1, 0.05, 1, 0.05);
        scrim.fillRect(0, 0, width * 0.75, height);

        // Cinematic top/bottom vignette
        const vignetteTop = this.add.graphics();
        vignetteTop.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
        vignetteTop.fillRect(0, 0, width, height * 0.22);

        const vignetteBottom = this.add.graphics();
        vignetteBottom.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.55, 0.55);
        vignetteBottom.fillRect(0, height * 0.78, width, height * 0.22);
    }

    _drawAtmosphericWash(width, height){
        // Unifies the photo and vector layers under one cool-to-crimson grade
        this.add.rectangle(0, 0, width, height, 0x0a0f14, 0.12).setOrigin(0);
        this.add.rectangle(0, 0, width, height, 0x330000, 0.06).setOrigin(0);
    }

    // _drawGlobalNetworkGlobe(): A spinning holographic globe motif for the "global" in Multiplayer.
    _drawGlobalNetworkGlobe(gx, gy){
        const R     = 105;
        const globe = this.add.container(gx, gy);

        // Ambient glow halo (teal core, crimson rim) ties the globe to the image's palette
        const glowOuter  = this.add.circle(0, 0, R + 55, 0xff6b6b, 0.05);
        const glowInner  = this.add.circle(0, 0, R + 20, 0x5eead4, 0.07);
        const sphereFill = this.add.circle(0, 0, R, 0x0f2027, 0.30);

        const outlineG = this.add.graphics();
        outlineG.lineStyle(2, 0x5eead4, 0.55);
        outlineG.strokeCircle(0, 0, R);

        globe.add([glowOuter, glowInner, sphereFill, outlineG]);

        // Latitude rings — fixed, subtle
        const latCount = 3;
        for (let i = 1; i <= latCount; i++){
            const t    = i / (latCount + 1);
            const yOff = (t - 0.5) * 2 * R * 0.82;
            const w    = Math.sqrt(Math.max(0, 1 - (yOff / R) ** 2)) * R * 2;
            const lat  = this.add.ellipse(0, yOff, w, 8, 0x5eead4, 0);
            lat.setStrokeStyle(1, 0x5eead4, 0.25);
            globe.add(lat);
        }

        // Meridian rings — squash/stretch on a stagger to fake a turning sphere
        const meridianCount = 5;
        const meridians = [];
        for (let i = 0; i < meridianCount; i++){
            const meridian = this.add.ellipse(0, 0, R * 1.85, R * 2, 0, 0);
            meridian.setStrokeStyle(1.5, i % 2 === 0 ? 0x5eead4 : 0xff8080, 0.32);
            globe.add(meridian);
            meridians.push(meridian);
        }
        meridians.forEach((meridian, i) => {
            this.tweens.add({
                targets:  meridian,
                scaleX:   0.02,
                duration: 2600,
                yoyo:     true,
                repeat:   -1,
                delay:    i * (2600 / meridianCount),
                ease:     'Sine.easeInOut',
            });
        });

        // Slow overall drift for a tilted-axis feel
        this.tweens.add({
            targets:  globe,
            angle:    360,
            duration: 48000,
            repeat:   -1,
            ease:     'Linear',
        });

        // Orbiting connection nodes — players linked in across the network
        const orbitColors = [0x5eead4, 0xffb199, 0xff6b6b];
        orbitColors.forEach((color, i) => {
            const orbit      = this.add.container(0, 0);
            const orbitR     = R + 30 + i * 18;
            const startAngle = (Math.PI * 2 / orbitColors.length) * i;
            const node = this.add.circle(
                Math.cos(startAngle) * orbitR,
                Math.sin(startAngle) * orbitR * 0.32,
                4, color, 0.95
            );
            orbit.add(node);
            globe.add(orbit);

            this.tweens.add({
                targets:  orbit,
                angle:    360,
                duration: 7000 + i * 2600,
                repeat:   -1,
                ease:     'Linear',
            });
            this.tweens.add({
                targets:  node,
                alpha:    0.35,
                duration: 850 + i * 180,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });
        });

        // Periodic outward signal pulses, like a ping sweeping the global network
        const spawnPulse = () => {
            const ring = this.add.graphics();
            ring.lineStyle(2, 0xff6b6b, 0.5);
            ring.strokeCircle(0, 0, R * 0.65);
            globe.add(ring);
            this.tweens.add({
                targets:    ring,
                scaleX:     1.9,
                scaleY:     1.9,
                alpha:      0,
                duration:   2600,
                ease:       'Power2.easeOut',
                onComplete: () => ring.destroy(),
            });
        };
        this.time.addEvent({ delay: 1500, loop: true, callback: spawnPulse });
        spawnPulse();

        return globe;
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
            const color = Math.random() > 0.4 ? 0xff6b6b : 0xffd9c2;
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
        this.add.text(width * 0.5, 78, 'GLOBAL MULTIPLAYER', {
            fontFamily:      'monospace',
            fontSize:        '40px',
            color:           '#f5f5f5',
            stroke:          '#dc2626',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const subtitleText = this.add.text(width * 0.5, 122, 'CONNECT  •  BUILD  •  COMPETE', {
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
    // Profile Panel
    // ==========================================================
    // profilePanel(): Identity card sitting above the access panel. Guests get a
    // lightweight "not tracked" badge; players signed in to a registered account
    // get their name, rank, elo and win/loss record plus a Logout control that
    // hits POST /api/auth/logout. Glass styling is shared with the access panel,
    // and the whole card fades in with a pulse each time the hub is entered.
    profilePanel(){
        const isPlayer = !this.isGuest && !!this.profile;

        const panelW      = 620;
        const panelX      = 460;                        // shares the access panel's centre line
        const panelH      = isPlayer ? 236 : 172;
        const panelBottom = 386;                        // leaves a gap above the access panel
        const panelY      = panelBottom - panelH / 2;

        const container = this.add.container(panelX, panelY).setAlpha(0).setScale(0.94);
        this.profilePanelContainer = container;
        this.profilePanelSize = { w: panelW, h: panelH };

        // Dedicated glow used for the breathing pulse - kept behind the frame.
        const pulseGlow = this.add.rectangle(0, 0, panelW + 26, panelH + 26, 0x5eead4, 0.05).setOrigin(0.5);
        container.add(pulseGlow);
        this.profilePulseGlow = pulseGlow;

        // Invisible hit area (behind the buttons) so entering the card re-pulses it.
        const hit = this.add.zone(0, 0, panelW, panelH).setOrigin(0.5);
        hit.setInteractive();
        hit.on('pointerover', () => {
            if (this._profileHoverLock) return;
            this._profileHoverLock = true;
            this._spawnProfileRing();
            this.time.delayedCall(700, () => { this._profileHoverLock = false; });
        });
        container.add(hit);

        this._drawGlassFrame(container, panelW, panelH);

        if (isPlayer)
        {
            this._buildPlayerProfile(container, panelW, panelH);
        }
        else
        {
            this._buildGuestProfile(container, panelW, panelH);
        }

        // Entrance: settle in, then hand off to the looping pulse.
        this.tweens.add({
            targets:    container,
            alpha:      1,
            scale:      1,
            duration:   620,
            delay:      160,
            ease:       'Back.easeOut',
            onComplete: () => this._pulseProfilePanel(),
        });
    }

    // _buildGuestProfile(): Compact badge for visitors who chose "Play as Guest".
    _buildGuestProfile(container, w){
        const left = -w / 2;
        const name = this.profile?.name || 'Guest';

        // Avatar disc
        const avX = left + 62;
        const avatarGlow = this.add.circle(avX, 0, 40, 0x5eead4, 0.06);
        const avatar     = this.add.circle(avX, 0, 34, 0x0b1a1e, 0.85).setStrokeStyle(2, 0x5eead4, 0.7);
        const avatarIcon = this.add.text(avX, 0, '◈', {
            fontFamily: 'monospace', fontSize: '30px', color: '#5eead4',
        }).setOrigin(0.5);

        // Text block
        const tx = avX + 58;
        const kicker = this.add.text(tx, -42, 'GUEST SESSION', {
            fontFamily: 'monospace', fontSize: '13px', color: '#5eead4',
        }).setOrigin(0, 0.5).setAlpha(0.85);

        const nameText = this.add.text(tx, -14, name, {
            fontFamily:      'monospace',
            fontSize:        '26px',
            color:           '#f5f5f5',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5);

        const note = this.add.text(tx, 20, "Stats aren't tracked in guest mode", {
            fontFamily: 'monospace', fontSize: '12px', color: '#9fb4b0',
        }).setOrigin(0, 0.5).setAlpha(0.8);

        container.add([avatarGlow, avatar, avatarIcon, kicker, nameText, note]);

        // Ghost "log in" nudge on the right - routes through the existing flow.
        this._drawProfileButton(container, {
            x: w / 2 - 96, y: 0, w: 150, h: 46,
            label: 'LOG IN  ›', accent: 0xffb199, accentHex: '#ffb199',
            onClick: () => this._onLoginToProfile(),
        });
    }

    // _buildPlayerProfile(): Full ranked identity - avatar, name, rank badge,
    // elo / wins / losses, and the Logout control.
    _buildPlayerProfile(container, w, h){
        const left = -w / 2;
        const top  = -h / 2;

        const name    = this.profile.name || this.profile.username || 'Player';
        const rank    = this.profile.rank || 'Unranked';
        const elo     = this.profile.elo ?? '—';
        const wins    = this.profile.wins ?? 0;
        const losses  = this.profile.losses ?? 0;
        const initial = String(name).charAt(0).toUpperCase() || '?';

        // Avatar with a "connected" status dot
        const avX = left + 64;
        const avY = top + 66;
        const avatarGlow    = this.add.circle(avX, avY, 44, 0x5eead4, 0.07);
        const avatar        = this.add.circle(avX, avY, 38, 0x0b1a1e, 0.9).setStrokeStyle(2, 0x5eead4, 0.75);
        const avatarInitial = this.add.text(avX, avY, initial, {
            fontFamily: 'monospace', fontSize: '32px', color: '#5eead4',
        }).setOrigin(0.5);
        const statusDot = this.add.circle(avX + 27, avY + 27, 6, 0x5eead4, 1).setStrokeStyle(2, 0x070c12, 1);

        container.add([avatarGlow, avatar, avatarInitial, statusDot]);

        // Identity text
        const tx = avX + 60;
        const kicker = this.add.text(tx, top + 34, 'RANKED PROFILE', {
            fontFamily: 'monospace', fontSize: '12px', color: '#5eead4',
        }).setOrigin(0, 0.5).setAlpha(0.85);

        const nameText = this.add.text(tx, top + 62, name, {
            fontFamily:      'monospace',
            fontSize:        '28px',
            color:           '#f5f5f5',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5);

        // Rank badge - pill sized to its label
        const badge      = this.add.container(tx, top + 96);
        const badgeLabel = this.add.text(14, 0, `◆  ${String(rank).toUpperCase()}`, {
            fontFamily: 'monospace', fontSize: '13px', color: '#ffb199',
        }).setOrigin(0, 0.5);
        const badgeW  = badgeLabel.width + 28;
        const badgeBg = this.add.graphics();
        badgeBg.fillStyle(0xffb199, 0.08);
        badgeBg.lineStyle(1, 0xffb199, 0.4);
        badgeBg.fillRoundedRect(0, -14, badgeW, 28, 6);
        badgeBg.strokeRoundedRect(0, -14, badgeW, 28, 6);
        badge.add([badgeBg, badgeLabel]);

        container.add([kicker, nameText, badge]);

        // Divider
        const divY    = top + 128;
        const divider = this.add.graphics();
        divider.lineStyle(1, 0x5eead4, 0.18);
        divider.beginPath();
        divider.moveTo(left + 26, divY);
        divider.lineTo(w / 2 - 26, divY);
        divider.strokePath();
        container.add(divider);

        // Stat row
        const statY = top + 170;
        this._drawProfileStat(container, -170, statY, 'ELO',    String(elo),    '#5eead4');
        this._drawProfileStat(container,    0, statY, 'WINS',   String(wins),   '#9be7c4');
        this._drawProfileStat(container,  170, statY, 'LOSSES', String(losses), '#ff8f8f');

        // Logout - top right, clear of the identity block
        this._drawProfileButton(container, {
            x: w / 2 - 82, y: top + 30, w: 120, h: 34,
            label: 'LOG OUT', accent: 0xff6b6b, accentHex: '#ff6b6b',
            onClick: () => this._logout(),
        });
    }

    // _drawProfileStat(): One value / label pair in the player stat row.
    _drawProfileStat(container, x, y, label, value, colorHex){
        const valueText = this.add.text(x, y, value, {
            fontFamily: 'monospace', fontSize: '22px', color: colorHex,
        }).setOrigin(0.5);

        const labelText = this.add.text(x, y + 22, label, {
            fontFamily: 'monospace', fontSize: '10px', color: '#9fb4b0',
        }).setOrigin(0.5).setAlpha(0.8);

        container.add([valueText, labelText]);
    }

    // _drawProfileButton(): Small glass action button (Login nudge / Logout),
    // mirroring the hover behaviour of the access panel buttons.
    _drawProfileButton(container, cfg){
        const { x, y, w, h, label, accent, accentHex, onClick } = cfg;
        const btn = this.add.container(x, y);

        const bg     = this.add.rectangle(0, 0, w, h, 0x0b141c, 0.55).setOrigin(0.5);
        const border = this.add.graphics();
        const stroke = (weight, alpha) => {
            border.clear();
            border.lineStyle(weight, accent, alpha);
            border.strokeRect(-w / 2, -h / 2, w, h);
        };
        stroke(1.5, 0.5);

        const text = this.add.text(0, 0, label, {
            fontFamily: 'monospace', fontSize: '13px', color: accentHex,
        }).setOrigin(0.5);

        btn.add([bg, border, text]);
        container.add(btn);

        bg.setInteractive({ useHandCursor: true });

        bg.on('pointerover', () => {
            bg.setFillStyle(0x101c26, 0.8);
            stroke(2, 0.9);
            this.tweens.add({ targets: btn, scaleX: 1.04, scaleY: 1.04, duration: 140, ease: 'Sine.easeOut' });
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x0b141c, 0.55);
            stroke(1.5, 0.5);
            this.tweens.add({ targets: btn, scaleX: 1, scaleY: 1, duration: 140, ease: 'Sine.easeOut' });
        });

        bg.on('pointerdown', () => {
            this.tweens.add({
                targets:    btn,
                scaleX:     0.96,
                scaleY:     0.96,
                duration:   80,
                yoyo:       true,
                ease:       'Sine.easeOut',
                onComplete: () => onClick(),
            });
        });

        return btn;
    }

    // _pulseProfilePanel(): Entry flourish - a couple of glow rings sweep out from
    // the card, then it settles into a slow breathing pulse.
    _pulseProfilePanel(){
        const container = this.profilePanelContainer;
        if (!container || !container.active) return;

        // Breathing glow - runs for the life of the scene.
        if (this.profilePulseGlow)
        {
            this.tweens.add({
                targets:  this.profilePulseGlow,
                alpha:    0.16,
                scaleX:   1.03,
                scaleY:   1.05,
                duration: 1600,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });
        }

        // One-shot expanding rings on entry.
        this._spawnProfileRing();
        this.time.delayedCall(240, () => this._spawnProfileRing());

        // A single soft scale bump so the whole card "breathes" once on arrival.
        this.tweens.add({
            targets:  container,
            scaleX:   1.015,
            scaleY:   1.015,
            duration: 220,
            yoyo:     true,
            ease:     'Sine.easeOut',
        });
    }

    // _spawnProfileRing(): Expanding outline that fades as it grows.
    _spawnProfileRing(){
        const container = this.profilePanelContainer;
        const size      = this.profilePanelSize;
        if (!container || !container.active || !size) return;

        const ring = this.add.rectangle(container.x, container.y, size.w, size.h, 0x000000, 0)
            .setStrokeStyle(2, 0x5eead4, 0.5);

        this.tweens.add({
            targets:    ring,
            scaleX:     1.08,
            scaleY:     1.14,
            alpha:      0,
            duration:   900,
            ease:       'Sine.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    // _logout(): Ends the registered session server-side (POST /api/auth/logout),
    // drops the local profile, and rebuilds the hub in its guest state.
    async _logout(){
        if (this._loggingOut) return;
        this._loggingOut = true;

        this._flashHubNotice('Signing out...');
        this.cameras.main.fadeOut(450, 0, 0, 0);

        // Wait for the request and the fade, whichever is slower, before rebuilding.
        await Promise.all([
            AuthService.logout(),
            new Promise(resolve => this.time.delayedCall(480, resolve)),
        ]);

        this.registry.set('profile', null);
        this.registry.set('isGuest', true);
        this.scene.restart();
    }

    // ==========================================================
    // Announcements Panel
    // ==========================================================
    // buildAnnouncementsPanel(): Studio broadcast feed that sits to the right of
    // the access panel, over the darker scrimmed side of the hero art. It shares
    // the same glass frame as the other hub cards and is split into two stacked
    // sections - "Patches & Updates" and "New Cards & Studio News" - so the whole
    // lobby reads as one system. Every entry is a local stub for now
    // (TODO: swap for a live feed, e.g. GET /api/announcements) so the layout
    // drops onto the server later without touching this code.
    buildAnnouncementsPanel(){
        const { height } = this.scale;

        const panelW       = 470;
        const panelX       = 1044;              // clears the access panel, hugs the art's shadow
        const panelCenterY = height * 0.585;

        const topPad        = 26;
        const headerH       = 66;
        const headerToBody  = 18;
        const sectionHeadH  = 28;
        const sectionGap    = 24;
        const entryH        = 60;

        // TODO: replace these stubs with the studio's live announcements feed.
        /**
         * Note: All entries are local stubs marked TODO (swap for GET /api/announcements), 
         * consistent with the rest of the file's "drops onto the server later" approach. 
         * Panel height is computed from the data, so adding/removing entries reflows automatically. 
         * node --check passes.
         */
        const patchFeed = [
            { tag: 'PATCH',  meta: 'v1.4.2 · SEP 2',    title: 'Bonum Category Rebalance',
              body: 'Tier-3 shield scaling reduced; stalemates fixed.' },
            { tag: 'UPDATE', meta: 'SEASON 3 · AUG 28', title: 'Ranked Season 3 Is Live',
              body: 'New elo floors, placements, and reward track.' },
            { tag: 'PATCH',  meta: 'v1.4.1 · AUG 21',   title: 'Battle Arena Hotfix',
              body: 'Fixed turn-one desync on double mulligan.' },
        ];

        const newsFeed = [
            { tag: 'CARD', meta: 'INITIATOR · SEP 5', title: 'Tobo of the Vaikoy',
              body: 'Adaptive counter-stance fighter, now in pool.' },
            { tag: 'CARD', meta: 'MALUM · AUG 30',    title: 'Serai, Ember Court Envoy',
              body: 'Burn-over-time support with hand disruption.' },
            { tag: 'NEWS', meta: 'STUDIO · AUG 18',   title: 'Zonis at ZoniCon Main Stage',
              body: 'Gameplay reveal and dev Q&A - VOD is live.' },
        ];

        const sectionH = feed => sectionHeadH + feed.length * entryH;
        const bodyH    = sectionH(patchFeed) + sectionGap + sectionH(newsFeed);
        const panelH   = topPad + headerH + headerToBody + bodyH + topPad;

        // Starts nudged right + transparent, then slides home like the access panel.
        const container = this.add.container(panelX + 60, panelCenterY).setAlpha(0);
        this.announcementsPanelContainer = container;

        this._drawGlassFrame(container, panelW, panelH);
        this._drawAnnouncementsHeader(container, panelW, panelH, headerH, topPad);

        let cursorY = -panelH / 2 + topPad + headerH + headerToBody;
        cursorY = this._drawAnnouncementSection(container, panelW, cursorY, 'PATCHES & UPDATES', patchFeed, entryH, sectionHeadH);

        // Hairline between the two feeds
        const midDiv = this.add.graphics();
        midDiv.lineStyle(1, 0x5eead4, 0.16);
        midDiv.beginPath();
        midDiv.moveTo(-panelW / 2 + 24, cursorY + sectionGap / 2);
        midDiv.lineTo( panelW / 2 - 24, cursorY + sectionGap / 2);
        midDiv.strokePath();
        container.add(midDiv);

        cursorY += sectionGap;
        this._drawAnnouncementSection(container, panelW, cursorY, 'NEW CARDS & STUDIO NEWS', newsFeed, entryH, sectionHeadH);

        this.tweens.add({
            targets:  container,
            x:        panelX,
            alpha:    1,
            duration: 750,
            delay:    350,
            ease:     'Back.easeOut',
        });
    }

    // _drawAnnouncementsHeader(): Title block for the broadcast card, with a
    // blinking "LIVE" tag on the right to echo the animated feel of the hub.
    _drawAnnouncementsHeader(container, w, panelH, headerH, topPad){
        const headerY = -panelH / 2 + topPad + headerH / 2 - 8;
        const left    = -w / 2 + 26;

        const title = this.add.text(left, headerY - 12, 'STUDIO BROADCAST', {
            fontFamily:      'monospace',
            fontSize:        '20px',
            color:           '#f5f5f5',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5);

        const sub = this.add.text(left, headerY + 14, 'PATCHES  •  CARDS  •  NEWS', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#5eead4',
        }).setOrigin(0, 0.5).setAlpha(0.65);

        // "LIVE" pill - crimson accent, pulsing dot
        const liveTag  = this.add.container(w / 2 - 60, headerY);
        const liveBg   = this.add.graphics();
        liveBg.fillStyle(0xff6b6b, 0.10);
        liveBg.lineStyle(1, 0xff6b6b, 0.45);
        liveBg.fillRoundedRect(-34, -12, 68, 24, 5);
        liveBg.strokeRoundedRect(-34, -12, 68, 24, 5);
        const liveDot  = this.add.circle(-16, 0, 4, 0xff6b6b, 1);
        const liveText = this.add.text(-4, 0, 'LIVE', {
            fontFamily: 'monospace', fontSize: '12px', color: '#ff8f8f',
        }).setOrigin(0, 0.5);
        liveTag.add([liveBg, liveDot, liveText]);

        this.tweens.add({
            targets:  liveDot,
            alpha:    0.2,
            duration: 900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        const dividerY = -panelH / 2 + topPad + headerH;
        const dividerG = this.add.graphics();
        dividerG.lineStyle(1, 0x5eead4, 0.22);
        dividerG.beginPath();
        dividerG.moveTo(-w / 2 + 24, dividerY);
        dividerG.lineTo( w / 2 - 24, dividerY);
        dividerG.strokePath();

        container.add([title, sub, liveTag, dividerG]);
    }

    // _drawAnnouncementSection(): Section label followed by its stack of entry
    // rows. Takes the section's top Y and returns the Y just past its last row
    // so the caller can chain the next section beneath it.
    _drawAnnouncementSection(container, w, topY, heading, feed, entryH, headH){
        const left = -w / 2 + 26;

        const headingText = this.add.text(left, topY + 8, heading, {
            fontFamily: 'monospace', fontSize: '12px', color: '#ffb199',
        }).setOrigin(0, 0.5).setAlpha(0.9);
        container.add(headingText);

        let y = topY + headH;
        feed.forEach(entry => {
            this._drawAnnouncementEntry(container, w, y, entry, entryH);
            y += entryH;
        });
        return y;
    }

    // _drawAnnouncementEntry(): One feed row - accent tick, category pill, meta
    // (version / date), headline and a one-line summary, closed by a hairline.
    _drawAnnouncementEntry(container, w, top, entry, entryH){
        const left  = -w / 2 + 26;
        const right =  w / 2 - 26;

        const accents = {
            PATCH:  { fill: 0x5eead4, hex: '#5eead4' },
            UPDATE: { fill: 0x5eead4, hex: '#5eead4' },
            CARD:   { fill: 0xffb199, hex: '#ffb199' },
            NEWS:   { fill: 0xff6b6b, hex: '#ff8f8f' },
        };
        const accent = accents[entry.tag] || accents.PATCH;

        // Accent tick + row hairline
        const rowG = this.add.graphics();
        rowG.fillStyle(accent.fill, 0.9);
        rowG.fillRect(left - 12, top + 8, 3, 34);
        rowG.lineStyle(1, 0x5eead4, 0.10);
        rowG.beginPath();
        rowG.moveTo(left - 4, top + entryH - 2);
        rowG.lineTo(right,    top + entryH - 2);
        rowG.strokePath();
        container.add(rowG);

        // Category pill - sized to its label
        const pill     = this.add.container(left + 2, top + 13);
        const pillText = this.add.text(8, 0, entry.tag, {
            fontFamily: 'monospace', fontSize: '10px', color: accent.hex,
        }).setOrigin(0, 0.5);
        const pillW  = Math.round(pillText.width) + 16;
        const pillBg = this.add.graphics();
        pillBg.fillStyle(accent.fill, 0.10);
        pillBg.lineStyle(1, accent.fill, 0.40);
        pillBg.fillRoundedRect(0, -9, pillW, 18, 4);
        pillBg.strokeRoundedRect(0, -9, pillW, 18, 4);
        pill.add([pillBg, pillText]);
        container.add(pill);

        // Meta - right-aligned on the pill row
        const meta = this.add.text(right, top + 13, entry.meta, {
            fontFamily: 'monospace', fontSize: '10px', color: '#9fb4b0',
        }).setOrigin(1, 0.5).setAlpha(0.75);

        // Headline
        const title = this.add.text(left + 2, top + 32, entry.title, {
            fontFamily: 'monospace', fontSize: '14px', color: '#f0f0f0',
        }).setOrigin(0, 0.5);

        // One-line summary
        const body = this.add.text(left + 2, top + 48, entry.body, {
            fontFamily: 'monospace', fontSize: '11px', color: '#9fb4b0',
            wordWrap: { width: w - 52 },
        }).setOrigin(0, 0.5).setAlpha(0.85);

        container.add([meta, title, body]);
    }

    // ==========================================================
    // Accesss Panel
    // ==========================================================
    // buildAccessPanel(): The access panel buttons for multiplayer.
    buildAccessPanel(){
        const { height } = this.scale;

        const panelW = 620;
        const panelX = 150 + panelW / 2;
        const panelCenterY = height * 0.60;

        const btnW      = panelW - 80;
        const btnH      = 96;
        const gap       = 24;
        const headerH   = 78;
        const topPad    = 26;
        const bottomPad = 26;
        const panelH    = topPad + headerH + gap + (btnH * 3) + (gap * 2) + bottomPad;

        const container = this.add.container(panelX - 60, panelCenterY).setAlpha(0);

        this._drawGlassFrame(container, panelW, panelH);
        this._drawPanelHeader(container, panelW, panelH, headerH, topPad);

        const buttons = [
            { label: 'LOGIN TO PROFILE', icon: '◈', accent: 0x5eead4, accentHex: '#5eead4', action: () => this._onLoginToProfile() },
            { label: 'BUILD DECK',       icon: '▣', accent: 0xffb199, accentHex: '#ffb199', action: () => this._onBuildDeck() },
            { label: 'FIND MATCH',       icon: '⌁', accent: 0xff6b6b, accentHex: '#ff6b6b', action: () => this._onFindMatch() },
        ];

        const firstBtnY = -panelH / 2 + topPad + headerH + gap + btnH / 2;
        buttons.forEach((cfg, i) => {
            const y = firstBtnY + i * (btnH + gap);
            this._drawGlassButton(container, y, btnW, btnH, cfg);
        });

        this.accessPanelContainer = container;

        // Slide the whole hub in from the left once the camera fade has settled
        this.tweens.add({
            targets:  container,
            x:        panelX,
            alpha:    1,
            duration: 750,
            delay:    250,
            ease:     'Back.easeOut',
        });
    }

    _drawGlassFrame(container, w, h){
        const glowOuter = this.add.rectangle(0, 0, w + 20, h + 20, 0x5eead4, 0.04).setOrigin(0.5);
        const panelBody = this.add.rectangle(0, 0, w, h, 0x070c12, 0.45).setOrigin(0.5);
        const innerGlow = this.add.ellipse(0, 0, w * 0.85, h * 0.70, 0x14232b, 0.25);
        const sheen     = this.add.rectangle(0, -h / 2 + 10, w - 24, 16, 0xaaffee, 0.06).setOrigin(0.5);

        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0x5eead4, 0.55);
        borderG.strokeRect(-w / 2, -h / 2, w, h);
        borderG.lineStyle(1, 0xff6b6b, 0.25);
        borderG.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);

        const cornerG = this.add.graphics();
        const cLen = 16;
        [
            [-w / 2, -h / 2,  1,  1],
            [ w / 2, -h / 2, -1,  1],
            [-w / 2,  h / 2,  1, -1],
            [ w / 2,  h / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(3, 0x5eead4, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(0x5eead4, 1.0);
            cornerG.fillCircle(x, y, 3.5);
        });

        container.add([glowOuter, panelBody, innerGlow, sheen, borderG, cornerG]);
    }

    _drawPanelHeader(container, w, panelH, headerH, topPad){
        const headerY = -panelH / 2 + topPad + headerH / 2 - 10;

        const label = this.add.text(0, headerY - 12, 'MULTIPLAYER HUB', {
            fontFamily:      'monospace',
            fontSize:        '20px',
            color:           '#f5f5f5',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        const sub = this.add.text(0, headerY + 14, 'ACCESS PANEL', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#5eead4',
        }).setOrigin(0.5).setAlpha(0.65);

        const dividerY = -panelH / 2 + topPad + headerH;
        const dividerG = this.add.graphics();
        dividerG.lineStyle(1, 0x5eead4, 0.22);
        dividerG.beginPath();
        dividerG.moveTo(-w / 2 + 24, dividerY);
        dividerG.lineTo( w / 2 - 24, dividerY);
        dividerG.strokePath();

        container.add([label, sub, dividerG]);
    }

    _drawGlassButton(container, y, w, h, cfg){
        const btn = this.add.container(0, y);

        const bg        = this.add.rectangle(0, 0, w, h, 0x0b141c, 0.55).setOrigin(0.5);
        const accentBar = this.add.rectangle(-w / 2 + 6, 0, 5, h - 20, cfg.accent, 0.9).setOrigin(0.5);

        const border = this.add.graphics();
        border.lineStyle(1.5, cfg.accent, 0.45);
        border.strokeRect(-w / 2, -h / 2, w, h);

        const iconText = this.add.text(-w / 2 + 34, 0, cfg.icon, {
            fontFamily: 'monospace',
            fontSize:   '26px',
            color:      cfg.accentHex,
        }).setOrigin(0.5);

        const labelText = this.add.text(-w / 2 + 66, 0, cfg.label, {
            fontFamily: 'monospace',
            fontSize:   '18px',
            color:      '#f0f0f0',
        }).setOrigin(0, 0.5);

        const chevron = this.add.text(w / 2 - 24, 0, '›', {
            fontFamily: 'monospace',
            fontSize:   '22px',
            color:      cfg.accentHex,
        }).setOrigin(0.5).setAlpha(0.7);

        btn.add([bg, accentBar, border, iconText, labelText, chevron]);
        container.add(btn);

        bg.setInteractive({ useHandCursor: true });

        bg.on('pointerover', () => {
            bg.setFillStyle(0x101c26, 0.75);
            border.clear();
            border.lineStyle(2, cfg.accent, 0.85);
            border.strokeRect(-w / 2, -h / 2, w, h);

            this.tweens.add({ targets: btn, scaleX: 1.02, scaleY: 1.02, duration: 150, ease: 'Sine.easeOut' });
            this.tweens.add({ targets: chevron, x: w / 2 - 16, alpha: 1, duration: 150, ease: 'Sine.easeOut' });
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x0b141c, 0.55);
            border.clear();
            border.lineStyle(1.5, cfg.accent, 0.45);
            border.strokeRect(-w / 2, -h / 2, w, h);

            this.tweens.add({ targets: btn, scaleX: 1, scaleY: 1, duration: 150, ease: 'Sine.easeOut' });
            this.tweens.add({ targets: chevron, x: w / 2 - 24, alpha: 0.7, duration: 150, ease: 'Sine.easeOut' });
        });

        bg.on('pointerdown', () => {
            this.tweens.add({
                targets:    btn,
                scaleX:     0.97,
                scaleY:     0.97,
                duration:   80,
                yoyo:       true,
                ease:       'Sine.easeOut',
                onComplete: () => cfg.action(),
            });
        });

        return btn;
    }

    // |Access Panel Button Actions|
    // Networking isn't wired up yet, so these surface clear TODOs and give the
    // player feedback instead of doing nothing when clicked.

    _onLoginToProfile(){
        // TODO: Wire up Login To Profile once the auth/networking backend exists.
        // this._flashHubNotice('Login coming soon — no networking backend yet.');
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.time.delayedCall(800, () => this.scene.start('ProfileAuthScene')); 
    }

    _onBuildDeck(){
        // Opens the deck builder in "multiplayer" mode - no START GAME, just a
        // RETURN TO HUB button that saves back to the 'pvpDeck' registry key.
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.time.delayedCall(650, () => this.scene.start('CardSelectScene', {
            mode:        'multiplayer',
            returnScene: 'MultiplayerScene',
        }));
    }

    // _onFindMatch(): Hands off to matchmaking. Both gates are checked here so
    // the player gets a sentence in the hub rather than an error screen after the
    // scene transition - the server re-checks the deck regardless.
    _onFindMatch(){
        if (!this.profile || this.isGuest)
        {
            this._flashHubNotice('Log in to your profile to play online');
            return;
        }

        if (!this.isDeckValid(this.playerDeck))
        {
            this._flashHubNotice('Build a deck first - 1 Supra, 1 Fere, 2 Bonum.');
            return;
        }

        this.cameras.main.fadeOut(250, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('FindMatchScene', { playerDeck: this.playerDeck });
        });
    }

    // isDeckValid(): A deck is ready for ranked when all four slots are filled
    // and every card carries the id matchmaking sends to the server.
    isDeckValid(deck){
        if (!deck) return false;
        const slots = [deck.Supra, deck.Fere, deck.Bonum1, deck.Bonum2];
        return slots.every(c => c && Number.isInteger(Number(c.id)));
    }

    _flashHubNotice(message){
        if (this.hubNoticeText) {
            this.tweens.killTweensOf(this.hubNoticeText);
            this.hubNoticeText.destroy();
        }

        const { width, height } = this.scale;
        const notice = this.add.text(width / 2, height - 46, message, {
            fontFamily:      'monospace',
            fontSize:        '15px',
            color:           '#ffb199',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(0.5).setAlpha(0);

        this.hubNoticeText = notice;

        this.tweens.add({
            targets:    notice,
            alpha:      1,
            duration:   220,
            yoyo:       true,
            hold:       1600,
            ease:       'Sine.easeInOut',
            onComplete: () => notice.destroy(),
        });
    }

    // ==========================================================
    // Card Deck Panel
    // ==========================================================
    // buildCardDeckPanel(): Far-right glass card that showcases the four
    // initiators the player locked in over in CardSelectScene - Supra, Fere and
    // the two Bonum slots the deck always carries. Each filled slot renders the
    // card's art (or a styled "artwork pending" monogram when the texture isn't
    // in the atlas yet) plus a compact ATK / DEF / ESSE strip; empty slots read
    // clearly as unfilled and double as a shortcut into the deck builder. The
    // deck is read from the registry key 'pvpDeck' (written by CardSelectScene),
    // so this drops onto the server later without touching layout.
    buildCardDeckPanel(){
        const { height } = this.scale;

        const panelW       = 484;
        const panelX       = 1646;                       // hugs the right margin, over the hero art
        const panelCenterY = Math.round(height * 0.585); // shares the announcements panel's centre line

        const topPad       = 26;
        const headerH      = 74;
        const headerToGrid = 18;
        const footerH      = 22;

        const slotW  = 196;
        const slotH  = 250;
        const colGap = 24;
        const rowGap = 28;

        const gridH  = slotH * 2 + rowGap;
        const panelH = topPad + headerH + headerToGrid + gridH + footerH + topPad;

        const slots  = this._resolvePvpDeck();
        const filled = slots.filter(s => s.card).length;

        this.deckSlotContainers = [];

        // Enters nudged right + transparent, then eases home like the other hub cards.
        const container = this.add.container(panelX + 70, panelCenterY).setAlpha(0);
        this.cardDeckPanelContainer = container;

        // Extra backing so the hero art behind the panel doesn't fight the slots.
        container.add(this.add.rectangle(0, 0, panelW - 2, panelH - 2, 0x05090e, 0.55).setOrigin(0.5));

        this._drawGlassFrame(container, panelW, panelH);
        this._drawCardDeckHeader(container, panelW, panelH, headerH, topPad, filled);

        const gridTop = -panelH / 2 + topPad + headerH + headerToGrid;
        const colX    = [-(slotW + colGap) / 2, (slotW + colGap) / 2];

        slots.forEach((def, i) => {
            const cx = colX[i % 2];
            const cy = gridTop + slotH / 2 + Math.floor(i / 2) * (slotH + rowGap);
            this._drawDeckSlot(container, cx, cy, slotW, slotH, def, i);
        });

        // Footer status line - copy swaps on whether the deck is complete.
        const footY    = gridTop + gridH + 14;
        const complete = filled === 4;
        const footer   = this.add.text(0, footY, complete
            ? 'DECK LOCKED IN  •  READY FOR MATCHMAKING'
            : `${4 - filled} SLOT${filled === 3 ? '' : 'S'} OPEN  •  TAP A SLOT TO BUILD`, {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      complete ? '#9be7c4' : '#ffb199',
        }).setOrigin(0.5).setAlpha(0);
        container.add(footer);
        this.tweens.add({ targets: footer, alpha: 0.85, duration: 600, delay: 1150, ease: 'Sine.easeOut' });

        this.tweens.add({
            targets:    container,
            x:          panelX,
            alpha:      1,
            duration:   780,
            delay:      450,
            ease:       'Back.easeOut',
            onComplete: () => this._revealDeckSlots(),
        });
    }

    // _drawCardDeckHeader(): Title block for the deck card with an "x / 4" fill
    // gauge on the right - crimson while the deck is short, teal once it's whole.
    _drawCardDeckHeader(container, w, panelH, headerH, topPad, filled){
        const headerY = -panelH / 2 + topPad + headerH / 2 - 8;
        const left    = -w / 2 + 26;

        const title = this.add.text(left, headerY - 12, 'BATTLE DECK', {
            fontFamily:      'monospace',
            fontSize:        '20px',
            color:           '#f5f5f5',
            stroke:          '#1a0000',
            strokeThickness: 3,
        }).setOrigin(0, 0.5);

        const sub = this.add.text(left, headerY + 14, 'RANKED PVP LOADOUT', {
            fontFamily: 'monospace', fontSize: '10px', color: '#5eead4',
        }).setOrigin(0, 0.5).setAlpha(0.65);

        // "x / 4" fill gauge - pill sized like the announcements LIVE tag.
        const complete = filled === 4;
        const accent   = complete ? 0x5eead4 : 0xff6b6b;
        const gauge    = this.add.container(w / 2 - 58, headerY);
        const gaugeBg  = this.add.graphics();
        gaugeBg.fillStyle(accent, 0.10);
        gaugeBg.lineStyle(1, accent, 0.45);
        gaugeBg.fillRoundedRect(-34, -12, 68, 24, 5);
        gaugeBg.strokeRoundedRect(-34, -12, 68, 24, 5);
        const gaugeDot  = this.add.circle(-18, 0, 4, accent, 1);
        const gaugeText = this.add.text(-6, 0, `${filled} / 4`, {
            fontFamily: 'monospace', fontSize: '12px', color: complete ? '#9be7c4' : '#ff8f8f',
        }).setOrigin(0, 0.5);
        gauge.add([gaugeBg, gaugeDot, gaugeText]);

        this.tweens.add({
            targets:  gaugeDot,
            alpha:    0.2,
            duration: 900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        const dividerY = -panelH / 2 + topPad + headerH;
        const dividerG = this.add.graphics();
        dividerG.lineStyle(1, 0x5eead4, 0.22);
        dividerG.beginPath();
        dividerG.moveTo(-w / 2 + 24, dividerY);
        dividerG.lineTo( w / 2 - 24, dividerY);
        dividerG.strokePath();

        container.add([title, sub, gauge, dividerG]);
    }

    // _resolvePvpDeck(): Normalises whatever CardSelectScene left in the
    // 'pvpDeck' registry key into a fixed four-slot list the panel can render,
    // each entry carrying its category label + accent and either a card or null.
    _resolvePvpDeck(){
        const raw  = this.playerDeck || {};
        const defs = [
            { key: 'Supra',  label: 'SUPRA',     accent: 0xff6b6b, hex: '#ff8f8f' },
            { key: 'Fere',   label: 'FERE',      accent: 0xffd93d, hex: '#ffe27a' },
            { key: 'Bonum1', label: 'BONUM  I',  accent: 0x5eead4, hex: '#5eead4' },
            { key: 'Bonum2', label: 'BONUM  II', accent: 0x5eead4, hex: '#5eead4' },
        ];
        return defs.map(def => ({ ...def, card: this._extractDeckCard(raw, def.key) }));
    }

    // _extractDeckCard(): Pull one slot's card out of the stored deck, tolerating
    // a few shapes (keyed object, Bonum array, flat card list) and stripping it
    // down to the plain display fields the panel needs.
    _extractDeckCard(raw, key){
        let hit = raw[key] ?? null;

        if (!hit && key.startsWith('Bonum')){
            const idx  = key === 'Bonum1' ? 0 : 1;
            const list = raw.Bonum || raw.bonum;
            if (Array.isArray(list)) hit = list[idx] ?? null;
        }
        if (!hit && Array.isArray(raw.cards)){
            const cat     = key.replace(/\d+$/, '');
            const matches = raw.cards.filter(c => (c.cate || c.category) === cat);
            hit = matches[key === 'Bonum2' ? 1 : 0] ?? null;
        }
        if (!hit) return null;

        return {
            id:        hit.id,
            name:      hit.name || hit.cardName || 'Unknown',
            shortName: hit.shortName || hit.short || hit.name || '???',
            cate:      hit.cate || hit.category || key.replace(/\d+$/, ''),
            atk:       hit.atk  ?? hit.attack  ?? '—',
            def:       hit.def  ?? hit.defense ?? '—',
            esse:      hit.esse ?? hit.essence ?? '—',
        };
    }

    // _drawDeckSlot(): One card cell - a glass frame in the category accent, then
    // either the card (art or monogram fallback + mini stat strip) or an
    // empty-slot prompt. Every slot is clickable and routes to the deck builder.
    _drawDeckSlot(container, cx, cy, w, h, def, index){
        const slot = this.add.container(cx, cy).setAlpha(0).setScale(0.82);
        this.deckSlotContainers.push(slot);

        const card   = def.card;
        const accent = card ? def.accent : 0x64748b;
        const r      = 12;

        // Breathing outline behind the frame - filled slots only.
        if (card){
            const glow = this.add.graphics().setAlpha(0);
            glow.lineStyle(6, def.accent, 0.12);
            glow.strokeRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, r + 2);
            slot.add(glow);
            this.tweens.add({
                targets:  glow,
                alpha:    1,
                duration: 1700,
                yoyo:     true,
                repeat:   -1,
                delay:    index * 380,
                ease:     'Sine.easeInOut',
            });
        }

        // Glass body + frame.
        const body = this.add.graphics();
        body.fillStyle(0x0b141c, card ? 0.62 : 0.42);
        body.fillRoundedRect(-w / 2, -h / 2, w, h, r);
        body.lineStyle(card ? 2 : 1.5, accent, card ? 0.6 : 0.4);
        body.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
        slot.add(body);

        // Inner top sheen.
        slot.add(this.add.rectangle(0, -h / 2 + 10, w - 20, 12, 0xaaffee, 0.06).setOrigin(0.5));

        // Corner ticks, echoing the scene's frame motif.
        const ticks = this.add.graphics();
        ticks.lineStyle(2, accent, card ? 0.9 : 0.5);
        const tl = 12;
        [
            [-w / 2 + 4, -h / 2 + 4,  1,  1],
            [ w / 2 - 4, -h / 2 + 4, -1,  1],
            [-w / 2 + 4,  h / 2 - 4,  1, -1],
            [ w / 2 - 4,  h / 2 - 4, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            ticks.beginPath();
            ticks.moveTo(x + hd * tl, y);
            ticks.lineTo(x, y);
            ticks.lineTo(x, y + vd * tl);
            ticks.strokePath();
        });
        slot.add(ticks);

        // Category label - top-left pill sized to its text.
        const capText = this.add.text(-w / 2 + 15, -h / 2 + 20, def.label, {
            fontFamily: 'monospace', fontSize: '11px', color: def.hex,
        }).setOrigin(0, 0.5);
        const capW  = Math.round(capText.width) + 16;
        const capBg = this.add.graphics();
        capBg.fillStyle(def.accent, 0.10);
        capBg.lineStyle(1, def.accent, 0.4);
        capBg.fillRoundedRect(-w / 2 + 7, -h / 2 + 11, capW, 18, 4);
        capBg.strokeRoundedRect(-w / 2 + 7, -h / 2 + 11, capW, 18, 4);
        slot.add([capBg, capText]);

        if (card) this._fillDeckSlot(slot, w, h, def, card, index);
        else      this._emptyDeckSlot(slot, w, h, def);

        // Hit zone sits on top so hover/click read across the whole cell.
        const zone = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
        slot.add(zone);

        zone.on('pointerover', () => {
            this.tweens.add({ targets: slot, scaleX: 1.045, scaleY: 1.045, y: cy - 4, duration: 160, ease: 'Sine.easeOut' });
            this._spawnDeckSlotRing(slot, w, h, accent);
        });
        zone.on('pointerout', () => {
            this.tweens.add({ targets: slot, scaleX: 1, scaleY: 1, y: cy, duration: 160, ease: 'Sine.easeOut' });
        });
        zone.on('pointerdown', () => {
            this.tweens.add({
                targets:    slot,
                scaleX:     0.97,
                scaleY:     0.97,
                duration:   80,
                yoyo:       true,
                ease:       'Sine.easeOut',
                onComplete: () => this._onBuildDeck(),
            });
        });

        container.add(slot);
        return slot;
    }

    // _fillDeckSlot(): Card art (or a monogram fallback when the texture is
    // missing), the initiator's name, and a compact ATK / DEF / ESSE strip along
    // the bottom of the cell, closed with a slow sheen sweep.
    _fillDeckSlot(slot, w, h, def, card, index){
        const artCY   = -16;
        const artMaxW = w - 34;
        const artMaxH = 128;

        if (this.textures.exists(card.name)){
            const src   = this.textures.get(card.name).getSourceImage();
            const scale = Math.min(artMaxW / src.width, artMaxH / src.height);
            const img   = this.add.image(0, artCY, card.name).setScale(scale);
            slot.add(img);

            // Slow drift so the art feels alive without pulling focus.
            this.tweens.add({
                targets:  img,
                scale:    scale * 1.035,
                duration: 3200,
                yoyo:     true,
                repeat:   -1,
                delay:    index * 300,
                ease:     'Sine.easeInOut',
            });
        } else {
            // Artwork-pending monogram disc.
            const disc = this.add.circle(0, artCY - 6, 34, 0x0b1a1e, 0.9).setStrokeStyle(2, def.accent, 0.7);
            const mono = this.add.text(0, artCY - 6, String(card.shortName).charAt(0).toUpperCase(), {
                fontFamily: 'monospace', fontSize: '34px', color: def.hex,
            }).setOrigin(0.5);
            const pend = this.add.text(0, artCY + 40, 'ARTWORK PENDING', {
                fontFamily: 'monospace', fontSize: '9px', color: '#9fb4b0',
            }).setOrigin(0.5).setAlpha(0.7);
            slot.add([disc, mono, pend]);

            this.tweens.add({
                targets:  disc,
                scale:    1.06,
                duration: 1800,
                yoyo:     true,
                repeat:   -1,
                delay:    index * 300,
                ease:     'Sine.easeInOut',
            });
        }

        // Name.
        slot.add(this.add.text(0, h / 2 - 58, String(card.shortName).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '14px', color: '#f0f0f0',
        }).setOrigin(0.5));

        // Divider above the stat strip.
        const dv = this.add.graphics();
        dv.lineStyle(1, def.accent, 0.2);
        dv.beginPath();
        dv.moveTo(-w / 2 + 16, h / 2 - 44);
        dv.lineTo( w / 2 - 16, h / 2 - 44);
        dv.strokePath();
        slot.add(dv);

        // Mini stat strip - three evenly spaced value / label pairs.
        const colStep = (w - 34) / 3;
        [
            ['ATK', card.atk,  '#ff8f8f'],
            ['DEF', card.def,  '#9be7c4'],
            ['ESS', card.esse, '#5eead4'],
        ].forEach(([label, value, colr], i) => {
            const sx = -w / 2 + 17 + colStep * (i + 0.5);
            slot.add(this.add.text(sx, h / 2 - 30, String(value), {
                fontFamily: 'monospace', fontSize: '14px', color: colr,
            }).setOrigin(0.5));
            slot.add(this.add.text(sx, h / 2 - 14, label, {
                fontFamily: 'monospace', fontSize: '8px', color: '#9fb4b0',
            }).setOrigin(0.5).setAlpha(0.8));
        });

        // Sheen bar that periodically sweeps the length of the cell.
        const sheen = this.add.rectangle(0, -h / 2 + 6, w - 14, 10, 0xffffff, 0.05).setOrigin(0.5);
        slot.add(sheen);
        this.tweens.add({
            targets:     sheen,
            y:           h / 2 - 6,
            duration:    2400,
            ease:        'Sine.easeInOut',
            repeat:      -1,
            repeatDelay: 3200,
            delay:       900 + index * 500,
        });
    }

    // _emptyDeckSlot(): Unfilled cell - a soft "+", the category name and a
    // prompt pointing at Card Select. The whole slot stays clickable.
    _emptyDeckSlot(slot, w, h, def){
        const plus = this.add.text(0, -12, '+', {
            fontFamily: 'monospace', fontSize: '46px', color: '#64748b',
        }).setOrigin(0.5).setAlpha(0.5);

        slot.add([
            plus,
            this.add.text(0, h / 2 - 62, `${def.label} SLOT`, {
                fontFamily: 'monospace', fontSize: '12px', color: '#8aa0a0',
            }).setOrigin(0.5),
            this.add.text(0, h / 2 - 40, 'EMPTY — CHOOSE IN', {
                fontFamily: 'monospace', fontSize: '9px', color: '#6b7f7c',
            }).setOrigin(0.5),
            this.add.text(0, h / 2 - 26, 'CARD SELECT', {
                fontFamily: 'monospace', fontSize: '9px', color: '#8aa0a0',
            }).setOrigin(0.5),
        ]);

        this.tweens.add({
            targets:  plus,
            alpha:    0.9,
            scale:    1.08,
            duration: 1500,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    // _revealDeckSlots(): Staggered pop-in for the four cells once the panel has
    // slid into place.
    _revealDeckSlots(){
        (this.deckSlotContainers || []).forEach((slot, i) => {
            if (!slot.active) return;
            this.tweens.add({
                targets:  slot,
                alpha:    1,
                scaleX:   1,
                scaleY:   1,
                duration: 460,
                delay:    i * 90,
                ease:     'Back.easeOut',
            });
        });
    }

    // _spawnDeckSlotRing(): Expanding outline on hover, echoing the profile card.
    _spawnDeckSlotRing(slot, w, h, accent){
        if (!slot.active) return;
        const ring = this.add.rectangle(0, 0, w, h, 0x000000, 0).setStrokeStyle(2, accent, 0.5);
        slot.add(ring);
        this.tweens.add({
            targets:    ring,
            scaleX:     1.12,
            scaleY:     1.1,
            alpha:      0,
            duration:   620,
            ease:       'Sine.easeOut',
            onComplete: () => ring.destroy(),
        });
    }
}

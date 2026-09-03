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

export default class MultiplayerScene extends Phaser.Scene {
    constructor(){
        super('MultiplayerScene');
    }

    init(){
        // Phasers registry is a global store shared across all scenes.
        // CardSelectScene will write to this key when the player saves a deck.
        this.playerDeck = this.registry.get('pvpDeck') || null; 

        // TODO: If you want the buttons to reflect loggeds-in state, read the registrys in init():
    }

    preload(){
        this.load.image('multiplayerHero', 'assets/backgroundImages/tobo_the_fighter_con_2.png');
    }

    create(){
        this.cameras.main.fadeIn(1200, 0, 0, 0);

        this.buildBackground();
        // this.buildAnnouncementsPanel();
        // this.buildFeaturedCardsPanel();
        this.buildAccessPanel();
        // this.buildCardDeckPanel();
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
        this.cameras.main.fadeOut(600, 0, 0, 0);
        this.time.delayedCall(650, () => this.scene.start('CardSelectScene'));
    }

    _onFindMatch(){
        // TODO: Wire up matchmaking once the networking backend exists.
        this._flashHubNotice('Matchmaking coming soon — no networking backend yet.');
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
}

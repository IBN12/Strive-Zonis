import { initiatorCards } from '../models/initiatorCards.js';

import { singularityPointStore } from '../gameTools/singularityPointStore.js';

export default class GameBattleScene extends Phaser.Scene {
    constructor(){
        super('GameBattleScene');
    }

    init(data){
        this.moveSelection = {
            player: false,
            comp: false,
        };

        this.coinFlipData = {
            choice: null,
            by: null,
        };

        this.singularityPointStock = {
            playerPoints: 0,
            compPoints: 0,
        }

        this.attackMultipliers = [0, 1/2, 2/3, 3/4, 1]; 

        this.playerSelectedCards  = (data && data.selectedCards) ? data.selectedCards : null;

        this.playerActiveCardKey  = null;
        this.compAllCards         = [];
        this.compActiveCardIndex  = 0;

        this.playerCardEsse       = {};
        this.compCardEsse         = [];
        this.playerDefending      = false;
        this.compDefending        = false;
        this.playerEsseText       = null;
        this.compEsseText         = null;
        this.playerBattlePortrait = null;
        this.compBattlePortrait   = null;
        this.attackBtn            = null;
        this.attackBtnLabel       = null;
        this.defendBtn            = null;
        this.defendBtnLabel       = null;
        this.turnIndicatorText    = null;
        this.controlBusy          = false;
        this.bcsCompSlotCon       = null;
        this.cdsCompDeckCon       = null;
        this.cardDefeated         = null;
    }

    preload(){
        this.load.image('Tobo The Fighter',            'assets/characterImages/tobo_the_fighter_con_1_Re.png');
        this.load.image('Spunky With The Funky Draco', 'assets/characterImages/spunky_with_the_funky_draco_con_1_Re.png');
        this.load.image('Allybelle',                   'assets/characterImages/allybelle_con_1_Re.png');
    }

    create(){
        this.cameras.main.fadeIn(1200, 0, 0, 0);
        this.createMainBattleArena();
        this.flipACoin();
    }

    // createMainBattleArena(): Will create the main battle arena.
    createMainBattleArena(){
        const { width, height } = this.cameras.main;
        const cx = width / 2;
        const cy = height / 2;
        const horizonY = Math.floor(height * 0.575);

        this._drawCosmicBackground(width, height, horizonY);
        this._drawNebulaClouds(cx, height, horizonY);
        this._drawStarfield(width, horizonY);
        this._drawGroundGrid(width, height, cx, horizonY);
        this._drawHorizonLine(width, cx, horizonY);
        this._drawCenterRing(cx, cy);
        this._drawDivisionBeam(cx, cy, width);
        this._drawEnergyPillars(width, horizonY);
        this._drawArenaBorder(width, height);
        this._drawArenaParticles(width, height, horizonY);
    }

    _drawCosmicBackground(width, height, horizonY){
        // Base deep space
        this.add.rectangle(0, 0, width, height, 0x030008).setOrigin(0);

        // Sky: stacked semi-transparent layers get lighter toward horizon
        this.add.rectangle(0, 0, width, horizonY,        0x0e0030, 0.75).setOrigin(0);
        this.add.rectangle(0, 0, width, horizonY * 0.65, 0x1a004a, 0.55).setOrigin(0);
        this.add.rectangle(0, 0, width, horizonY * 0.35, 0x220066, 0.35).setOrigin(0);

        // Ground: warm volcanic tones below horizon
        this.add.rectangle(0, horizonY, width, height - horizonY, 0x1c0500, 0.92).setOrigin(0);
        this.add.rectangle(
            0, horizonY + (height - horizonY) * 0.55,
            width, (height - horizonY) * 0.45,
            0x2f0900, 0.75
        ).setOrigin(0);
    }

    _drawNebulaClouds(cx, height, horizonY){
        // Sky nebulae (purple hues)
        this.add.ellipse(cx * 0.30, horizonY * 0.40, 360, 200, 0x5500bb, 0.12);
        this.add.ellipse(cx * 0.35, horizonY * 0.38, 190, 110, 0x7700dd, 0.09);
        this.add.ellipse(cx * 1.70, horizonY * 0.50, 320, 190, 0x4400aa, 0.13);
        this.add.ellipse(cx * 1.65, horizonY * 0.48, 170, 100, 0x6600cc, 0.09);
        this.add.ellipse(cx,        horizonY * 0.20, 330, 130, 0x0022cc, 0.08);

        // Ground nebulae (orange/red embers)
        this.add.ellipse(cx * 0.45, horizonY + (height - horizonY) * 0.35, 380, 170, 0xff3300, 0.10);
        this.add.ellipse(cx * 1.55, horizonY + (height - horizonY) * 0.40, 350, 150, 0xff5500, 0.09);
        this.add.ellipse(cx,        height - 60,                             460, 180, 0xdd2200, 0.07);
    }

    _drawStarfield(width, skyBottom){
        for(let i = 0; i < 85; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, skyBottom);
            const r     = Math.random() > 0.72 ? 2 : 1;
            const alpha = Math.random() * 0.55 + 0.25;
            const star  = this.add.circle(x, y, r, 0xffffff, alpha);

            if(Math.random() > 0.5){
                this.tweens.add({
                    targets:  star,
                    alpha:    0.04,
                    duration: Phaser.Math.Between(700, 2800),
                    yoyo:     true,
                    repeat:   -1,
                    delay:    Phaser.Math.Between(0, 2200),
                    ease:     'Sine.easeInOut',
                });
            }
        }
    }

    _drawGroundGrid(width, height, cx, horizonY){
        const g = this.add.graphics();

        // Vertical perspective lines converging at vanishing point (cx, horizonY)
        const numVLines = 14;
        for(let i = 0; i <= numVLines; i++){
            const t       = i / numVLines;
            const bottomX = t * width;
            const fade    = (t > 0.35 && t < 0.65) ? 0.5 : 0.22;
            g.lineStyle(1, 0xff4400, fade);
            g.beginPath();
            g.moveTo(cx, horizonY);
            g.lineTo(bottomX, height);
            g.strokePath();
        }

        // Horizontal grid lines with quadratic spacing for perspective depth
        const numHLines = 7;
        for(let i = 1; i <= numHLines; i++){
            const t     = i / numHLines;
            const y     = horizonY + (height - horizonY) * (t * t);
            const alpha = 0.38 * (1 - t * 0.45);
            g.lineStyle(Math.max(1, Math.floor(t * 2)), 0xff4400, alpha);
            g.beginPath();
            g.moveTo(0, y);
            g.lineTo(width, y);
            g.strokePath();
        }
    }

    _drawHorizonLine(width, cx, horizonY){
        // Bright main line
        this.add.rectangle(cx, horizonY, width, 3, 0xff6600, 1.0).setOrigin(0.5);

        // Stacked glow halos
        this.add.rectangle(cx, horizonY, width,  10, 0xff4400, 0.38).setOrigin(0.5);
        this.add.rectangle(cx, horizonY, width,  30, 0xff2200, 0.14).setOrigin(0.5);
        this.add.rectangle(cx, horizonY, width,  80, 0xdd1100, 0.05).setOrigin(0.5);

        // Pulsing highlight layer
        const pulse = this.add.rectangle(cx, horizonY, width, 10, 0xffaa00, 0.0).setOrigin(0.5);
        this.tweens.add({
            targets:  pulse,
            alpha:    0.40,
            duration: 2200,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    _drawCenterRing(cx, cy){
        const g = this.add.graphics();

        // Ambient glow halos behind rings
        this.add.circle(cx, cy, 170, 0x003388, 0.07);
        this.add.circle(cx, cy, 140, 0x0044aa, 0.09);

        // Concentric rings
        g.lineStyle(2, 0x00ffcc, 0.28);
        g.strokeCircle(cx, cy, 135);

        g.lineStyle(3, 0x00aaff, 0.52);
        g.strokeCircle(cx, cy, 105);

        g.lineStyle(2, 0x0066ff, 0.70);
        g.strokeCircle(cx, cy, 75);

        // Core glow
        this.add.circle(cx, cy, 28, 0x0033ff, 0.12);
        this.add.circle(cx, cy, 14, 0x00bbff, 0.45);

        // Rotating tick marks on the mid ring
        const tickContainer = this.add.container(cx, cy);
        for(let i = 0; i < 4; i++){
            const angle = (Math.PI / 2) * i;
            const tick  = this.add.rectangle(
                Math.cos(angle) * 105,
                Math.sin(angle) * 105,
                14, 4, 0x00ffcc, 0.95
            );
            tick.setRotation(angle);
            tickContainer.add(tick);
        }
        this.tweens.add({
            targets:  tickContainer,
            angle:    360,
            duration: 9000,
            repeat:   -1,
            ease:     'Linear',
        });

        // Continuously spawning expanding pulse rings
        const spawnPulse = () => {
            const ring = this.add.graphics();
            ring.lineStyle(3, 0x00ffcc, 0.65);
            ring.strokeCircle(cx, cy, 105);
            this.tweens.add({
                targets:    ring,
                scaleX:     1.45,
                scaleY:     1.45,
                alpha:      0,
                duration:   2400,
                ease:       'Power2.easeOut',
                onComplete: () => { ring.destroy(); spawnPulse(); },
            });
        };
        spawnPulse();
    }

    _drawDivisionBeam(cx, cy, width){
        const beam = this.add.rectangle(cx, cy, width, 2, 0x00ffff, 0.72).setOrigin(0.5);
        this.add.rectangle(cx, cy, width,  7, 0x00ddff, 0.20).setOrigin(0.5);
        this.add.rectangle(cx, cy, width, 22, 0x0077ff, 0.07).setOrigin(0.5);

        this.tweens.add({
            targets:  beam,
            alpha:    0.12,
            duration: 1900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });
    }

    _drawEnergyPillars(width, horizonY){
        const pillarMidY = horizonY / 2;

        const pillars = [
            { x: 22,          color: 0xcc00ff, glow: 0x8800cc },
            { x: 110,         color: 0xff00cc, glow: 0xcc0099 },
            { x: width - 110, color: 0xff00cc, glow: 0xcc0099 },
            { x: width - 22,  color: 0xcc00ff, glow: 0x8800cc },
        ];

        pillars.forEach((p, i) => {
            // Wide aura
            this.add.rectangle(p.x, pillarMidY, 22, horizonY, p.glow, 0.07).setOrigin(0.5);

            // Main beam
            const beam = this.add.rectangle(p.x, pillarMidY, 3, horizonY, p.color, 0.72).setOrigin(0.5);

            // Top orb
            this.add.circle(p.x, 0, 18, p.glow, 0.28);
            this.add.circle(p.x, 0,  9, p.color, 0.92);

            // Base accent at horizon
            this.add.rectangle(p.x, horizonY, 22, 6, p.color, 0.85).setOrigin(0.5);

            this.tweens.add({
                targets:  beam,
                alpha:    0.18,
                duration: Phaser.Math.Between(1300, 2100),
                yoyo:     true,
                repeat:   -1,
                delay:    i * 200,
                ease:     'Sine.easeInOut',
            });
        });
    }

    _drawArenaBorder(width, height){
        const g = this.add.graphics();

        // Outer orange frame
        g.lineStyle(5, 0xff6600, 0.92);
        g.strokeRect(2, 2, width - 4, height - 4);

        // Subtle inner frame
        g.lineStyle(1, 0xffaa00, 0.28);
        g.strokeRect(12, 12, width - 24, height - 24);

        // Corner accent bars and gem dots
        const len   = 52;
        const thick = 5;

        const corners = [
            { x: 0,     y: 0,      hDir:  1, vDir:  1 },
            { x: width, y: 0,      hDir: -1, vDir:  1 },
            { x: 0,     y: height, hDir:  1, vDir: -1 },
            { x: width, y: height, hDir: -1, vDir: -1 },
        ];

        corners.forEach(c => {
            this.add.rectangle(c.x + c.hDir * len / 2, c.y,                len,   thick, 0xff6600, 1).setOrigin(0.5);
            this.add.rectangle(c.x,                    c.y + c.vDir * len / 2, thick, len,   0xff6600, 1).setOrigin(0.5);
            this.add.circle(c.x, c.y,  9, 0xffaa00, 1.00);
            this.add.circle(c.x, c.y, 16, 0xffaa00, 0.18);
        });
    }

    _drawArenaParticles(width, height, horizonY){
        const coolPalette = [0x00ffcc, 0x0099ff, 0xaa00ff, 0x00ccff, 0xff00ee];
        const warmPalette = [0xff6600, 0xffaa00, 0xff3300, 0xffdd00, 0xff8800];

        // Cool particles drifting up through the sky
        for(let i = 0; i < 20; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(0, horizonY);
            const color = coolPalette[Math.floor(Math.random() * coolPalette.length)];
            const p     = this.add.circle(x, y, Phaser.Math.Between(1, 3), color, 0.82);

            this.tweens.add({
                targets:  p,
                y:        y - Phaser.Math.Between(70, 200),
                alpha:    0,
                duration: Phaser.Math.Between(2500, 6500),
                repeat:   -1,
                delay:    Phaser.Math.Between(0, 3500),
                ease:     'Power1',
            });
        }

        // Warm embers rising from the ground
        for(let i = 0; i < 16; i++){
            const x     = Phaser.Math.Between(0, width);
            const y     = Phaser.Math.Between(horizonY, height);
            const color = warmPalette[Math.floor(Math.random() * warmPalette.length)];
            const p     = this.add.circle(x, y, Phaser.Math.Between(1, 3), color, 0.82);

            this.tweens.add({
                targets:  p,
                y:        y - Phaser.Math.Between(90, 230),
                x:        x + Phaser.Math.Between(-25, 25),
                alpha:    0,
                duration: Phaser.Math.Between(2000, 5500),
                repeat:   -1,
                delay:    Phaser.Math.Between(0, 3000),
                ease:     'Power1',
            });
        }
    }

    // flipACoin(): User will choose heads or tails for the first preemptive move/strike.
    flipACoin(){
        const { width, height } = this.sys.game.config;
        const cx = width / 2;
        const cy = height / 2;

        // Container starts above screen and slides down to center
        const flipACoinContainer = this.add.container(cx, -350);

        const panelW = 440;
        const panelH = 270;

        // Outer ambient glow layer
        const ambientGlow = this.add.rectangle(0, 0, panelW + 24, panelH + 24, 0x00ffcc, 0.04).setOrigin(0.5);

        // Dark panel body
        const panelBody = this.add.rectangle(0, 0, panelW, panelH, 0x060014, 0.94).setOrigin(0.5);

        // Panel border: cyan outer frame, subtle orange inner inset
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0x00ffcc, 0.72);
        borderG.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
        borderG.lineStyle(1, 0xff6600, 0.35);
        borderG.strokeRect(-panelW / 2 + 5, -panelH / 2 + 5, panelW - 10, panelH - 10);

        // Corner accent marks with gem dots
        const cornerG = this.add.graphics();
        const cLen = 18;
        [
            [-panelW / 2, -panelH / 2,  1,  1],
            [ panelW / 2, -panelH / 2, -1,  1],
            [-panelW / 2,  panelH / 2,  1, -1],
            [ panelW / 2,  panelH / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(3, 0x00ffcc, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(0x00ffcc, 1.0);
            cornerG.fillCircle(x, y, 4);
        });

        // Title
        const titleText = this.add.text(0, -panelH / 2 + 28, 'COIN FLIP', {
            fontFamily: 'monospace',
            fontSize:   '22px',
            color:      '#00ffcc',
            stroke:     '#001a11',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const subtitleText = this.add.text(0, -panelH / 2 + 56, 'Choose heads or tails — winner strikes first', {
            fontFamily: 'monospace',
            fontSize:   '11px',
            color:      '#ff8800',
            align:      'center',
            wordWrap:   { width: panelW - 60 },
        }).setOrigin(0.5);

        // Thin divider under subtitle
        const dividerG = this.add.graphics();
        dividerG.lineStyle(1, 0x00ffcc, 0.25);
        dividerG.beginPath();
        dividerG.moveTo(-panelW / 2 + 20, -panelH / 2 + 74);
        dividerG.lineTo( panelW / 2 - 20, -panelH / 2 + 74);
        dividerG.strokePath();

        // Coin visual
        const coinGlowCircle = this.add.circle(0, -8, 40, 0xffaa00, 0.12);
        const coinBody       = this.add.circle(0, -8, 28, 0xffcc44, 0.22);
        const coinG = this.add.graphics();
        coinG.lineStyle(2, 0xffaa00, 0.9);
        coinG.strokeCircle(0, -8, 28);
        coinG.lineStyle(1, 0xffdd88, 0.55);
        coinG.strokeCircle(0, -8, 21);
        const coinLabel = this.add.text(0, -8, '?', {
            fontFamily: 'monospace',
            fontSize:   '24px',
            color:      '#ffdd88',
        }).setOrigin(0.5);

        // Expanding pulse ring on the coin glow
        this.tweens.add({
            targets:  coinGlowCircle,
            scaleX:   1.55,
            scaleY:   1.55,
            alpha:    0,
            duration: 1600,
            repeat:   -1,
            ease:     'Power2.easeOut',
        });

        // Subtle breathing on the coin label
        this.tweens.add({
            targets:  coinLabel,
            scaleX:   1.08,
            scaleY:   1.08,
            alpha:    0.65,
            duration: 950,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Buttons
        const btnW  = 162;
        const btnH  = 50;
        const btnY  = 92;
        const headsX = -105;
        const tailsX =  105;

        // Heads button (cyan theme)
        const headsBg = this.add.rectangle(headsX, btnY, btnW, btnH, 0x003344, 0.9).setOrigin(0.5);
        headsBg.setStrokeStyle(2, 0x00ffcc, 0.85);
        const headsLabel = this.add.text(headsX, btnY, 'HEADS', {
            fontFamily: 'monospace',
            fontSize:   '20px',
            color:      '#00ffcc',
        }).setOrigin(0.5);

        // Tails button (orange theme)
        const tailsBg = this.add.rectangle(tailsX, btnY, btnW, btnH, 0x2a0e00, 0.9).setOrigin(0.5);
        tailsBg.setStrokeStyle(2, 0xff6600, 0.85);
        const tailsLabel = this.add.text(tailsX, btnY, 'TAILS', {
            fontFamily: 'monospace',
            fontSize:   '20px',
            color:      '#ff6600',
        }).setOrigin(0.5);

        // Hover feedback
        headsBg.setInteractive({ useHandCursor: true });
        headsBg.on('pointerover', () => headsBg.setFillStyle(0x005566, 0.95));
        headsBg.on('pointerout',  () => headsBg.setFillStyle(0x003344, 0.90));

        tailsBg.setInteractive({ useHandCursor: true });
        tailsBg.on('pointerover', () => tailsBg.setFillStyle(0x551500, 0.95));
        tailsBg.on('pointerout',  () => tailsBg.setFillStyle(0x2a0e00, 0.90));

        // On choice: lock buttons, slide container off-screen right, then start battle
        const onChoose = (coin) => {
            this.coinFlipData.by = 'player';
            this.coinFlipData.choice = coin; 

            headsBg.removeInteractive();
            tailsBg.removeInteractive();

            this.tweens.add({
                targets:    flipACoinContainer,
                x:          width + 350,
                duration:   550,
                ease:       'Power2.easeIn',
                onComplete: () => {
                    flipACoinContainer.destroy();
                    this.flipACoinAnimation(); 
                },
            });
        };

        headsBg.on('pointerdown', () => onChoose('heads'));
        tailsBg.on('pointerdown', () => onChoose('tails'));

        // Assemble all children into the container
        flipACoinContainer.add([
            ambientGlow, panelBody, borderG, cornerG,
            titleText, subtitleText, dividerG,
            coinGlowCircle, coinBody, coinG, coinLabel,
            headsBg, headsLabel,
            tailsBg, tailsLabel,
        ]);

        // Slide in from above once the camera fade (1200ms) has settled
        this.tweens.add({
            targets:  flipACoinContainer,
            y:        cy,
            duration: 750,
            ease:     'Back.easeOut',
            delay:    1300,
        });
    }

    // flipAConinAnimation(): The coin flip animation will be initiated here.
    flipACoinAnimation(){
        // Todo: Add coin flip animation here: 
        // ...
        
        // Determine who gets the first move:
        this.firstMove(); 
    }

    // firstMove(): Determines the first move.
    firstMove(){
        // Temp: Temporary delay call to randomly choose
        // heads or tails. We can pretend that the
        // coin flip animation lasts 2 seconds. The
        // delay call will flip the coin.  
        this.time.delayedCall(2000, () => {
            const coinFlipNumber = Math.floor(Math.random() * 2);
            let winner = null;

            if (coinFlipNumber === 0)
            {
                winner = 'heads';
            }
            else if (coinFlipNumber === 1)
            {
                winner = 'tails'; 
            }

            // Todo: Display who gets the first move here: 
            console.log("Coin Flip Data: ", this.coinFlipData); // Testing
            console.log("Winner: ", winner); // Testing 

            // First move is determined: 
            if (this.coinFlipData.choice === winner)
            {
                this.moveSelection.player = true;
                console.log(`${this.coinFlipData.by} gets the first move.`); // Testing
            }
            else
            {
                this.moveSelection.comp = true; 
                console.log('Computer gets the first move.'); // Testing 
            }

            this.gameBattleContent(); 
        });
    }

    // gameBattleContent(): All the game battle content will be initiated here.
    gameBattleContent(){
        this._initBattleCardState();
        this.singularityPointStation();
        this.battleCardStation();
        this.cardDeckStation();
        this.battleControlStation();
    }

    _initBattleCardState(){
        if (this.playerSelectedCards) {
            if      (this.playerSelectedCards.Supra)  this.playerActiveCardKey = 'Supra';
            else if (this.playerSelectedCards.Fere)   this.playerActiveCardKey = 'Fere';
            else if (this.playerSelectedCards.Bonum1) this.playerActiveCardKey = 'Bonum1';
        }
        this.compAllCards        = this._generateCompDeck();
        this.compActiveCardIndex = 0;

        ['Supra', 'Fere', 'Bonum1', 'Bonum2'].forEach(key => {
            if (this.playerSelectedCards?.[key]) {
                this.playerCardEsse[key] = this.playerSelectedCards[key].esse;
            }
        });
        this.compCardEsse = this.compAllCards.map(c => c.esse);
    }

    _generateCompDeck(){
        const suprCards  = initiatorCards.filter(c => c.cate === 'Supra');
        const fereCards  = initiatorCards.filter(c => c.cate === 'Fere');
        const bonumCards = initiatorCards.filter(c => c.cate === 'Bonum');
        const supra      = suprCards[Phaser.Math.Between(0, suprCards.length - 1)];
        const fere       = fereCards[Phaser.Math.Between(0, fereCards.length - 1)];
        const shuffled   = Phaser.Utils.Array.Shuffle([...bonumCards]);
        return [supra, fere, shuffled[0], shuffled[1]];
    }

    // singularityPointStation(): Player and computer singularity points will be held here.
    singularityPointStation(){
        const { width } = this.cameras.main;
        const cx = width / 2;

        this.spData = { player: 0, comp: 0 };

        const panelW = 760; // Panel Width
        const panelH = 70; // Panel Height
        const finalY  = 45; // Final Y position

        const spContainer = this.add.container(cx, -(panelH + 10));
        spContainer.setName('spContainer'); // setting the name of the container. 

        // Background
        const panelBody = this.add.rectangle(0, 0, panelW, panelH, 0x060014, 0.94).setOrigin(0.5);

        // Side tint zones
        const playerGlow = this.add.rectangle(-panelW / 4, 0, panelW / 2 - 4, panelH - 8, 0x003322, 0.30).setOrigin(0.5);
        const compGlow   = this.add.rectangle( panelW / 4, 0, panelW / 2 - 4, panelH - 8, 0x331100, 0.30).setOrigin(0.5);

        // Outer cyan border + inner orange inset
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0x00ffcc, 0.72);
        borderG.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
        borderG.lineStyle(1, 0xff6600, 0.30);
        borderG.strokeRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, panelH - 8);

        // Corner accent marks
        const cornerG = this.add.graphics();
        const cLen = 14;
        [
            [-panelW / 2, -panelH / 2,  1,  1],
            [ panelW / 2, -panelH / 2, -1,  1],
            [-panelW / 2,  panelH / 2,  1, -1],
            [ panelW / 2,  panelH / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(3, 0x00ffcc, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(0x00ffcc, 1.0);
            cornerG.fillCircle(x, y, 3);
        });

        // Center vertical divider
        const dividerG = this.add.graphics();
        dividerG.lineStyle(1, 0x00ffcc, 0.28);
        dividerG.beginPath();
        dividerG.moveTo(0, -panelH / 2 + 6);
        dividerG.lineTo(0, panelH / 2 - 6);
        dividerG.strokePath();

        // Center labels
        const stationLabel = this.add.text(0, -13, 'SINGULARITY POINT STATION', {
            fontFamily: 'monospace',
            fontSize:   '9px',
            color:      '#aaffee',
        }).setOrigin(0.5).setAlpha(0.6);

        const spIcon = this.add.text(0, 8, '◈  SP  ◈', {
            fontFamily: 'monospace',
            fontSize:   '11px',
            color:      '#ffdd00',
        }).setOrigin(0.5);

        this.tweens.add({
            targets:  spIcon,
            alpha:    0.30,
            duration: 1400,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // Player (left)
        const playerLabel = this.add.text(-panelW / 4, -14, 'PLAYER', {
            fontFamily: 'monospace',
            fontSize:   '13px',
            color:      '#00ffcc',
            stroke:     '#001a11',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.playerSPText = this.add.text(-panelW / 4, 13, '0 SP', {
            fontFamily: 'monospace',
            fontSize:   '22px',
            color:      '#ffffff',
            stroke:     '#002211',
            strokeThickness: 4,
        }).setOrigin(0.5);

        // Computer (right)
        const compLabel = this.add.text(panelW / 4, -14, 'COMPUTER', {
            fontFamily: 'monospace',
            fontSize:   '13px',
            color:      '#ff6600',
            stroke:     '#1a0800',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.compSPText = this.add.text(panelW / 4, 13, '0 SP', {
            fontFamily: 'monospace',
            fontSize:   '22px',
            color:      '#ffffff',
            stroke:     '#221100',
            strokeThickness: 4,
        }).setOrigin(0.5);

        spContainer.add([
            panelBody, playerGlow, compGlow,
            borderG, cornerG, dividerG,
            stationLabel, spIcon,
            playerLabel, this.playerSPText,
            compLabel, this.compSPText,
        ]);

        // Slide in from above
        this.tweens.add({
            targets:  spContainer,
            y:        finalY,
            duration: 700,
            ease:     'Back.easeOut',
        });
    }

    // battleCardStation(): The main battle card station for the initiator cards.
    battleCardStation(){
        const { width } = this.cameras.main;
        const cx = width / 2;

        const panelW      = 760;
        const panelH      = 200;
        const finalY      = 45 + 35 + 8 + panelH / 2;          // 188 — just below SP station
        const headerY     = -panelH / 2 + 14;                   // -86
        const headerDivY  = -panelH / 2 + 34;                   // -66
        const cardCenterY = (headerDivY + panelH / 2) / 2;      //  17
        const tintH       = panelH / 2 - headerDivY - 8;        // 158

        const bcsContainer = this.add.container(cx, -(panelH + 20));

        // ── Glass body ─────────────────────────────────────────────────
        // Near-black base at low alpha lets the arena bleed through
        const panelBody  = this.add.rectangle(0, 0, panelW, panelH, 0x050012, 0.38).setOrigin(0.5);

        // Central luminous tint gives depth without blocking the background
        const innerGlow  = this.add.ellipse(0, 0, panelW * 0.75, panelH * 0.65, 0x001833, 0.18);

        // Top-edge glass sheen (simulates light reflection on frosted glass)
        const sheen      = this.add.rectangle(0, -panelH / 2 + 12, panelW - 20, 20, 0xaaffee, 0.07).setOrigin(0.5);

        // Side tint zones restricted to the card content area
        const playerTint = this.add.rectangle(-panelW / 4, cardCenterY, panelW / 2 - 8, tintH, 0x001122, 0.22).setOrigin(0.5);
        const compTint   = this.add.rectangle( panelW / 4, cardCenterY, panelW / 2 - 8, tintH, 0x110800, 0.22).setOrigin(0.5);

        // ── Border & corner accents ────────────────────────────────────
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0x00ffcc, 0.65);
        borderG.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
        borderG.lineStyle(1, 0xff6600, 0.28);
        borderG.strokeRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, panelH - 8);

        const cornerG = this.add.graphics();
        const cLen = 14;
        [
            [-panelW / 2, -panelH / 2,  1,  1],
            [ panelW / 2, -panelH / 2, -1,  1],
            [-panelW / 2,  panelH / 2,  1, -1],
            [ panelW / 2,  panelH / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(3, 0x00ffcc, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(0x00ffcc, 1.0);
            cornerG.fillCircle(x, y, 3);
        });

        // ── Header row ────────────────────────────────────────────────
        const stationLabel = this.add.text(0, headerY, 'BATTLE CARD STATION', {
            fontFamily: 'monospace',
            fontSize:   '9px',
            color:      '#aaffee',
        }).setOrigin(0.5).setAlpha(0.60);

        const bcsIcon = this.add.text(0, headerY + 14, '⚔  BCS  ⚔', {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      '#ffdd00',
        }).setOrigin(0.5);

        this.tweens.add({
            targets:  bcsIcon,
            alpha:    0.30,
            duration: 1400,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        const playerLabel = this.add.text(-panelW / 4, headerY, 'PLAYER', {
            fontFamily:      'monospace',
            fontSize:        '13px',
            color:           '#00ffcc',
            stroke:          '#001a11',
            strokeThickness: 3,
        }).setOrigin(0.5);

        const compLabel = this.add.text(panelW / 4, headerY, 'COMPUTER', {
            fontFamily:      'monospace',
            fontSize:        '13px',
            color:           '#ff6600',
            stroke:          '#1a0800',
            strokeThickness: 3,
        }).setOrigin(0.5);

        // Horizontal divider under header
        const headerDivG = this.add.graphics();
        headerDivG.lineStyle(1, 0x00ffcc, 0.20);
        headerDivG.beginPath();
        headerDivG.moveTo(-panelW / 2 + 20, headerDivY);
        headerDivG.lineTo( panelW / 2 - 20, headerDivY);
        headerDivG.strokePath();

        // Vertical center divider separating card slots
        const centerDivG = this.add.graphics();
        centerDivG.lineStyle(1, 0x00ffcc, 0.25);
        centerDivG.beginPath();
        centerDivG.moveTo(0, headerDivY + 4);
        centerDivG.lineTo(0, panelH / 2 - 8);
        centerDivG.strokePath();

        // ── VS badge ──────────────────────────────────────────────────
        const vsText = this.add.text(0, cardCenterY, 'VS', {
            fontFamily:      'monospace',
            fontSize:        '14px',
            color:           '#ffdd00',
            stroke:          '#3d2000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.tweens.add({
            targets:  vsText,
            alpha:    0.40,
            duration: 1600,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        // ── Assemble background layer first ───────────────────────────
        bcsContainer.add([
            panelBody, innerGlow, sheen,
            playerTint, compTint,
            borderG, cornerG,
            stationLabel, bcsIcon,
            playerLabel, compLabel,
            headerDivG, centerDivG,
            vsText,
        ]);

        // ── Card slots rendered on top of background ──────────────────
        const playerCard = this.playerSelectedCards && this.playerActiveCardKey
            ? this.playerSelectedCards[this.playerActiveCardKey]
            : null;
        const compCard   = this.compAllCards.length > 0 ? this.compAllCards[0] : null;

        const playerSlotCon = this.add.container(0, 0);
        const compSlotCon   = this.add.container(0, 0);
        this._drawBattleCardSlot(playerSlotCon, playerCard, 'player', panelW, cardCenterY);
        this._drawBattleCardSlot(compSlotCon,   compCard,   'comp',   panelW, cardCenterY);
        bcsContainer.add([playerSlotCon, compSlotCon]);

        this.bcsContainer     = bcsContainer;
        this.bcsPlayerSlotCon = playerSlotCon;
        this.bcsCompSlotCon   = compSlotCon;
        this.bcsPanelW        = panelW;
        this.bcsCardCenterY   = cardCenterY;

        // ── Slide in from above (slight delay after SP station) ───────
        this.tweens.add({
            targets:  bcsContainer,
            y:        finalY,
            duration: 700,
            ease:     'Back.easeOut',
            delay:    150,
        });
    }

    _getPlayerStartCard(){
        if (!this.playerSelectedCards) return null;
        return this.playerSelectedCards.Supra
            || this.playerSelectedCards.Fere
            || this.playerSelectedCards.Bonum1
            || null;
    }

    _getComputerStartCard(){
        const suprCards = initiatorCards.filter(c => c.cate === 'Supra');
        return suprCards[Phaser.Math.Between(0, suprCards.length - 1)];
    }

    _drawBattleCardSlot(container, card, side, panelW, cardCenterY, currentEsse = null){
        const isPlayer     = side === 'player';
        const accentColor  = isPlayer ? 0x00ffcc : 0xff6600;
        const portraitSize = 68;
        const sign         = isPlayer ? -1 : 1;
        const portraitX    = sign * (panelW / 2 - 100);   // ±280
        const textX        = sign * (panelW / 2 - 142);   // ±238
        const textOrigin   = isPlayer ? 0    : 1;

        const children = [];

        // Portrait slot — low alpha for glass look, colored stroke matches side theme
        const portraitBg = this.add.rectangle(portraitX, cardCenterY, portraitSize, portraitSize, 0x050018, 0.70).setOrigin(0.5);
        portraitBg.setStrokeStyle(2, accentColor, 0.80);
        children.push(portraitBg);

        // Soft ambient aura around portrait
        const portraitGlow = this.add.ellipse(portraitX, cardCenterY, portraitSize + 16, portraitSize + 16, accentColor, 0.06);
        children.push(portraitGlow);

        if (card) {
            const portrait = this.add.image(portraitX, cardCenterY, card.name);
            portrait.setDisplaySize(portraitSize - 4, portraitSize - 4);
            children.push(portrait);
            if (side === 'player') this.playerBattlePortrait = portrait;
            else                   this.compBattlePortrait   = portrait;

            if (portrait.texture.key === '__MISSING') {
                portrait.setVisible(false);
                const noImgText = this.add.text(portraitX, cardCenterY, card.shortName, {
                    fontFamily: 'monospace',
                    fontSize:   '12px',
                    color:      '#445566',
                }).setOrigin(0.5);
                children.push(noImgText);
            }

            // Short name
            const nameText = this.add.text(textX, cardCenterY - 24, card.shortName.toUpperCase(), {
                fontFamily:      'monospace',
                fontSize:        '13px',
                color:           isPlayer ? '#00ffcc' : '#ff8844',
                stroke:          '#000011',
                strokeThickness: 2,
            }).setOrigin(textOrigin, 0.5);
            children.push(nameText);

            // Category
            const catColorMap = { Supra: '#ff6b6b', Fere: '#ffd93d', Bonum: '#4ecdc4' };
            const catText = this.add.text(textX, cardCenterY - 8, card.cate.toUpperCase(), {
                fontFamily: 'monospace',
                fontSize:   '10px',
                color:      catColorMap[card.cate] || '#ffffff',
            }).setOrigin(textOrigin, 0.5);
            children.push(catText);

            // ATK / DEF
            const statsText = this.add.text(textX, cardCenterY + 8, `ATK ${card.atk}   DEF ${card.def}`, {
                fontFamily: 'monospace',
                fontSize:   '11px',
                color:      '#dddddd',
            }).setOrigin(textOrigin, 0.5);
            children.push(statsText);

            // ESSE
            const esseText = this.add.text(textX, cardCenterY + 24, `ESSE  ${currentEsse !== null ? currentEsse : card.esse}`, {
                fontFamily: 'monospace',
                fontSize:   '11px',
                color:      '#88ccff',
            }).setOrigin(textOrigin, 0.5);
            children.push(esseText);
            if (side === 'player') this.playerEsseText = esseText;
            else                   this.compEsseText   = esseText;

            // Pulsing active indicator dot below portrait
            const activeDot = this.add.circle(portraitX, cardCenterY + 42, 4, accentColor, 0.90);
            this.tweens.add({
                targets:  activeDot,
                alpha:    0.20,
                duration: 800,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });
            const activeLabel = this.add.text(portraitX, cardCenterY + 54, 'ACTIVE', {
                fontFamily: 'monospace',
                fontSize:   '8px',
                color:      isPlayer ? '#00ffcc' : '#ff6600',
            }).setOrigin(0.5).setAlpha(0.70);
            children.push(activeDot, activeLabel);

        } else {
            // No card passed — show placeholder
            const placeholder = this.add.text(portraitX, cardCenterY, '?', {
                fontFamily: 'monospace',
                fontSize:   '28px',
                color:      '#223344',
            }).setOrigin(0.5);
            const noCardText = this.add.text(textX, cardCenterY, 'NO CARD\nSELECTED', {
                fontFamily: 'monospace',
                fontSize:   '10px',
                color:      '#334455',
                align:      isPlayer ? 'left' : 'right',
            }).setOrigin(textOrigin, 0.5);
            children.push(placeholder, noCardText);
        }

        container.add(children);
    }

    // cardDeckStation(): The card deck station holds the remaining 3 initiator cards for each
    // side. The player can click a deck card to swap it with the active Battle Card Station card.
    cardDeckStation(){
        const { width } = this.cameras.main;
        const cx = width / 2;

        // Position: just below the BCS
        // SP: finalY=45, panelH=70  → bottom = 80
        // BCS: finalY=188, panelH=200 → bottom = 288
        const bcsBottom = 288;
        const panelW    = 760;
        const panelH    = 120;
        const finalY    = bcsBottom + 8 + panelH / 2;   // 356

        const headerY     = -panelH / 2 + 14;           // -46
        const headerDivY  = -panelH / 2 + 32;           // -28
        const cardAreaCY  = (headerDivY + panelH / 2) / 2; // 16

        this.cdsContainer    = this.add.container(cx, -(panelH + 20));
        this.cdsCardAreaCY   = cardAreaCY;

        // ── Glass body ─────────────────────────────────────────────
        const panelBody  = this.add.rectangle(0, 0, panelW, panelH, 0x050012, 0.32).setOrigin(0.5);
        const innerGlow  = this.add.ellipse(0, 0, panelW * 0.75, panelH * 0.65, 0x001833, 0.14);
        const sheen      = this.add.rectangle(0, -panelH / 2 + 8, panelW - 20, 14, 0xaaffee, 0.06).setOrigin(0.5);

        const tintH      = panelH - 32 - 8;
        const playerTint = this.add.rectangle(-panelW / 4, cardAreaCY, panelW / 2 - 8, tintH, 0x001122, 0.20).setOrigin(0.5);
        const compTint   = this.add.rectangle( panelW / 4, cardAreaCY, panelW / 2 - 8, tintH, 0x110800, 0.20).setOrigin(0.5);

        // ── Border & corners ───────────────────────────────────────
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0x00ffcc, 0.65);
        borderG.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
        borderG.lineStyle(1, 0xff6600, 0.28);
        borderG.strokeRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, panelH - 8);

        const cornerG = this.add.graphics();
        const cLen = 12;
        [
            [-panelW / 2, -panelH / 2,  1,  1],
            [ panelW / 2, -panelH / 2, -1,  1],
            [-panelW / 2,  panelH / 2,  1, -1],
            [ panelW / 2,  panelH / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(2, 0x00ffcc, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(0x00ffcc, 1.0);
            cornerG.fillCircle(x, y, 2.5);
        });

        // ── Header ─────────────────────────────────────────────────
        const stationLabel = this.add.text(0, headerY, 'CARD DECK STATION', {
            fontFamily: 'monospace',
            fontSize:   '9px',
            color:      '#aaffee',
        }).setOrigin(0.5).setAlpha(0.60);

        const cdsIcon = this.add.text(0, headerY + 12, '◧  CDS  ◧', {
            fontFamily: 'monospace',
            fontSize:   '9px',
            color:      '#ffdd00',
        }).setOrigin(0.5);

        this.tweens.add({
            targets:  cdsIcon,
            alpha:    0.30,
            duration: 1400,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut',
        });

        const playerLabel = this.add.text(-panelW / 4, headerY, 'PLAYER', {
            fontFamily:      'monospace',
            fontSize:        '11px',
            color:           '#00ffcc',
            stroke:          '#001a11',
            strokeThickness: 2,
        }).setOrigin(0.5);

        const compLabel = this.add.text(panelW / 4, headerY, 'COMPUTER', {
            fontFamily:      'monospace',
            fontSize:        '11px',
            color:           '#ff6600',
            stroke:          '#1a0800',
            strokeThickness: 2,
        }).setOrigin(0.5);

        const headerDivG = this.add.graphics();
        headerDivG.lineStyle(1, 0x00ffcc, 0.20);
        headerDivG.beginPath();
        headerDivG.moveTo(-panelW / 2 + 20, headerDivY);
        headerDivG.lineTo( panelW / 2 - 20, headerDivY);
        headerDivG.strokePath();

        const centerDivG = this.add.graphics();
        centerDivG.lineStyle(1, 0x00ffcc, 0.25);
        centerDivG.beginPath();
        centerDivG.moveTo(0, headerDivY + 4);
        centerDivG.lineTo(0, panelH / 2 - 6);
        centerDivG.strokePath();

        this.cdsContainer.add([
            panelBody, innerGlow, sheen,
            playerTint, compTint,
            borderG, cornerG,
            stationLabel, cdsIcon,
            playerLabel, compLabel,
            headerDivG, centerDivG,
        ]);

        // ── Deck card sub-containers ────────────────────────────────
        const playerDeckCon = this.add.container(0, 0);
        this._buildDeckCards(playerDeckCon, this._getPlayerDeckCards(), 'player', panelW, cardAreaCY);
        this.cdsContainer.add(playerDeckCon);
        this.cdsPlayerDeckCon = playerDeckCon;

        const compDeckCon = this.add.container(0, 0);
        this._buildDeckCards(compDeckCon, this._getCompDeckCards(), 'comp', panelW, cardAreaCY);
        this.cdsContainer.add(compDeckCon);
        this.cdsCompDeckCon = compDeckCon;

        // ── Slide in (slight delay after BCS) ──────────────────────
        this.tweens.add({
            targets:  this.cdsContainer,
            y:        finalY,
            duration: 700,
            ease:     'Back.easeOut',
            delay:    300,
        });
    }

    _getPlayerDeckCards(){
        if (!this.playerSelectedCards) return [];
        const activeKey = this.playerActiveCardKey;
        return ['Supra', 'Fere', 'Bonum1', 'Bonum2']
            .filter(key => key !== activeKey && this.playerSelectedCards[key])
            .map(key => ({ key, card: this.playerSelectedCards[key] }));
    }

    _getCompDeckCards(){
        return this.compAllCards
            .map((card, i) => ({ key: i, card }))
            .filter(entry => entry.key > this.compActiveCardIndex);
    }

    _buildDeckCards(container, deckEntries, side, panelW, cardAreaCY){
        const isPlayer    = side === 'player';
        const accentColor = isPlayer ? 0x00ffcc : 0xff6600;
        const labelColor  = isPlayer ? '#00ffcc' : '#ff8844';
        const pSize       = 48;

        // Spread 3 slots evenly within each half using equal outer + inter-card spacing
        const halfW    = panelW / 2;   // 380
        const eMargin  = 10;
        const gap      = (halfW - 2 * eMargin - 3 * pSize) / 4;  // 54
        const leftBase = -(halfW - eMargin - pSize / 2 - gap);    // -292

        const playerXs = [leftBase, leftBase + pSize + gap, leftBase + 2 * (pSize + gap)];
        const compXs   = playerXs.map(x => -x).reverse();
        const slotXs   = isPlayer ? playerXs : compXs;

        deckEntries.forEach((entry, i) => {
            if (!entry.card || i >= 3) return;
            const card = entry.card;
            const sx   = slotXs[i];
            const sy   = cardAreaCY - 4;  // nudge up slightly to leave room for name/dot below

            // Ambient aura
            const aura = this.add.ellipse(sx, sy, pSize + 12, pSize + 12, accentColor, 0.05);

            // Portrait background
            const portBg = this.add.rectangle(sx, sy, pSize, pSize, 0x060018, 0.72).setOrigin(0.5);
            portBg.setStrokeStyle(1.5, accentColor, 0.70);

            // Portrait image
            const portrait = this.add.image(sx, sy, card.name);
            portrait.setDisplaySize(pSize - 4, pSize - 4);
            if (portrait.texture.key === '__MISSING') {
                portrait.setVisible(false);
                container.add(this.add.text(sx, sy, card.shortName.slice(0, 4), {
                    fontFamily: 'monospace', fontSize: '9px', color: '#445566',
                }).setOrigin(0.5));
            }

            // Short name below portrait
            const nameText = this.add.text(sx, sy + pSize / 2 + 3, card.shortName.toUpperCase(), {
                fontFamily: 'monospace',
                fontSize:   '8px',
                color:      labelColor,
            }).setOrigin(0.5, 0);

            // Category dot
            const catColorMap = { Supra: 0xff6b6b, Fere: 0xffd93d, Bonum: 0x4ecdc4 };
            const catDot = this.add.circle(sx, sy + pSize / 2 + 17, 3, catColorMap[card.cate] ?? 0xffffff, 0.90);

            container.add([aura, portBg, portrait, nameText, catDot]);

            // Player cards are interactive — click to swap with the active BCS card
            if (isPlayer) {
                portBg.setInteractive({ useHandCursor: true });

                portBg.on('pointerover', () => {
                    portBg.setStrokeStyle(2, 0x00ffcc, 1.0);
                    portBg.setFillStyle(0x001a33, 0.85);
                    this.tweens.add({
                        targets: portBg, scaleX: 1.10, scaleY: 1.10,
                        duration: 120, ease: 'Power2',
                    });
                });

                portBg.on('pointerout', () => {
                    portBg.setStrokeStyle(1.5, accentColor, 0.70);
                    portBg.setFillStyle(0x060018, 0.72);
                    this.tweens.add({
                        targets: portBg, scaleX: 1, scaleY: 1,
                        duration: 120, ease: 'Power2',
                    });
                });

                portBg.on('pointerdown', () => this._swapPlayerCard(entry.key));
            }
        });
    }

    _swapPlayerCard(newActiveKey){
        console.log("Current Active Key: ", this.playerActiveCardKey); // Testing 
        console.log("New Active Swap Key: ", newActiveKey); // Testing
        console.log("\n"); // Testing  

        if (this.playerActiveCardKey === newActiveKey) return;
        this.playerActiveCardKey = newActiveKey;

        // Rebuild BCS player slot
        this.bcsPlayerSlotCon.removeAll(true);
        this.bcsPlayerSlotCon.destroy();
        const newBcsSlot = this.add.container(0, 0);
        this._drawBattleCardSlot(newBcsSlot, this.playerSelectedCards[newActiveKey], 'player', this.bcsPanelW, this.bcsCardCenterY, this.playerCardEsse[newActiveKey] ?? null);
        this.bcsContainer.add(newBcsSlot);
        this.bcsPlayerSlotCon = newBcsSlot;

        this.tweens.add({
            targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06,
            duration: 220, yoyo: true, ease: 'Back.easeOut',
        });

        // Rebuild CDS player deck
        this.cdsPlayerDeckCon.removeAll(true);
        this.cdsPlayerDeckCon.destroy();
        const newDeckCon = this.add.container(0, 0);
        this._buildDeckCards(newDeckCon, this._getPlayerDeckCards(), 'player', this.bcsPanelW, this.cdsCardAreaCY);
        this.cdsContainer.add(newDeckCon);
        this.cdsPlayerDeckCon = newDeckCon;
    }

    // battleControlStation(): Player control station with Attack and Defend buttons.
    battleControlStation(){
        const { width } = this.cameras.main;
        const cx = width / 2;

        // Positioned just below CDS (finalY=356, panelH=120 → bottom=416)
        const panelW  = 760;
        const panelH  = 100;
        const finalY  = 416 + 8 + panelH / 2;   // 474

        const headerY  = -panelH / 2 + 12;       // -38
        const dividerY = -panelH / 2 + 30;        // -20
        const btnY     = 14;

        const controlContainer = this.add.container(cx, -(panelH + 20));

        // ── Glass body ─────────────────────────────────────────────────
        const panelBody = this.add.rectangle(0, 0, panelW, panelH, 0x050012, 0.32).setOrigin(0.5);
        const sheen     = this.add.rectangle(0, -panelH / 2 + 8, panelW - 20, 14, 0xaaffee, 0.06).setOrigin(0.5);

        // ── Border & corner accents ────────────────────────────────────
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0x00ffcc, 0.65);
        borderG.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
        borderG.lineStyle(1, 0xff6600, 0.28);
        borderG.strokeRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, panelH - 8);

        const cornerG = this.add.graphics();
        const cLen    = 12;
        [
            [-panelW / 2, -panelH / 2,  1,  1],
            [ panelW / 2, -panelH / 2, -1,  1],
            [-panelW / 2,  panelH / 2,  1, -1],
            [ panelW / 2,  panelH / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(2, 0x00ffcc, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(0x00ffcc, 1.0);
            cornerG.fillCircle(x, y, 2.5);
        });

        // ── Header ─────────────────────────────────────────────────────
        const stationLabel = this.add.text(0, headerY, 'BATTLE CONTROL STATION', {
            fontFamily: 'monospace',
            fontSize:   '9px',
            color:      '#aaffee',
        }).setOrigin(0.5).setAlpha(0.60);

        const dividerG = this.add.graphics();
        dividerG.lineStyle(1, 0x00ffcc, 0.20);
        dividerG.beginPath();
        dividerG.moveTo(-panelW / 2 + 20, dividerY);
        dividerG.lineTo( panelW / 2 - 20, dividerY);
        dividerG.strokePath();

        // ── Turn indicator ─────────────────────────────────────────────
        const isTurn = this.moveSelection.player;
        this.turnIndicatorText = this.add.text(0, headerY + 13, isTurn ? '— YOUR TURN —' : "— COMPUTER'S TURN —", {
            fontFamily: 'monospace',
            fontSize:   '10px',
            color:      isTurn ? '#00ffcc' : '#ff6600',
        }).setOrigin(0.5).setAlpha(0.85);

        // ── Attack button (left, cyan) ──────────────────────────────────
        const btnW    = 230;
        const btnH    = 46;
        const attackX = -165;
        const defendX =  165;

        const attackBg = this.add.rectangle(attackX, btnY, btnW, btnH, 0x001a11, 0.90).setOrigin(0.5);
        attackBg.setStrokeStyle(2, 0x00ffcc, 0.85);
        const attackLabel = this.add.text(attackX, btnY, 'ATTACK', {
            fontFamily: 'monospace',
            fontSize:   '18px',
            color:      '#00ffcc',
            stroke:     '#001a0a',
            strokeThickness: 3,
        }).setOrigin(0.5);

        // ── Defend button (right, gold) ─────────────────────────────────
        const defendBg = this.add.rectangle(defendX, btnY, btnW, btnH, 0x1a1400, 0.90).setOrigin(0.5);
        defendBg.setStrokeStyle(2, 0xffdd00, 0.85);
        const defendLabel = this.add.text(defendX, btnY, 'DEFEND', {
            fontFamily: 'monospace',
            fontSize:   '18px',
            color:      '#ffdd00',
            stroke:     '#1a1100',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.attackBtn      = attackBg;
        this.attackBtnLabel = attackLabel;
        this.defendBtn      = defendBg;
        this.defendBtnLabel = defendLabel;

        // ── Button pointer events ───────────────────────────────────────
        attackBg.on('pointerover', () => attackBg.setFillStyle(0x003322, 0.95));
        attackBg.on('pointerout',  () => attackBg.setFillStyle(0x001a11, 0.90));
        attackBg.on('pointerdown', () => this._playerAttack());

        defendBg.on('pointerover', () => defendBg.setFillStyle(0x2a2200, 0.95));
        defendBg.on('pointerout',  () => defendBg.setFillStyle(0x1a1400, 0.90));
        defendBg.on('pointerdown', () => this._playerDefend());

        this._setControlButtonsActive(isTurn);

        controlContainer.add([
            panelBody, sheen,
            borderG, cornerG,
            stationLabel, dividerG, this.turnIndicatorText,
            attackBg, attackLabel,
            defendBg, defendLabel,
        ]);

        this.tweens.add({
            targets:  controlContainer,
            y:        finalY,
            duration: 700,
            ease:     'Back.easeOut',
            delay:    600,
            onComplete: () => {
                // If computer has first move, trigger it after the panel finishes sliding in
                if (this.moveSelection.comp) {
                    this.time.delayedCall(800, () => this._compTurn());
                }
            },
        });
    }

    _setControlButtonsActive(active){
        if (!this.attackBtn || !this.defendBtn) return;
        if (active) {
            this.attackBtn.setInteractive({ useHandCursor: true });
            this.defendBtn.setInteractive({ useHandCursor: true });
            this.attackBtn.setFillStyle(0x001a11, 0.90);
            this.defendBtn.setFillStyle(0x1a1400, 0.90);
            this.attackBtn.setAlpha(1.0);
            this.defendBtn.setAlpha(1.0);
            if (this.attackBtnLabel) this.attackBtnLabel.setAlpha(1.0);
            if (this.defendBtnLabel) this.defendBtnLabel.setAlpha(1.0);
        } else {
            this.attackBtn.removeInteractive();
            this.defendBtn.removeInteractive();
            this.attackBtn.setFillStyle(0x080808, 0.50);
            this.defendBtn.setFillStyle(0x080808, 0.50);
            this.attackBtn.setAlpha(0.40);
            this.defendBtn.setAlpha(0.40);
            if (this.attackBtnLabel) this.attackBtnLabel.setAlpha(0.30);
            if (this.defendBtnLabel) this.defendBtnLabel.setAlpha(0.30);
        }
    }

    _updateTurnIndicator(){
        if (!this.turnIndicatorText) return;
        if (this.moveSelection.player) {
            this.turnIndicatorText.setText('— YOUR TURN —');
            this.turnIndicatorText.setColor('#00ffcc');
        } else {
            this.turnIndicatorText.setText("— COMPUTER'S TURN —");
            this.turnIndicatorText.setColor('#ff6600');
        }
    }

    _playerAttack(){
        if (!this.moveSelection.player || this.controlBusy) return;
        this.controlBusy = true;
        this._setControlButtonsActive(false);
        this._resolveAttack('player');
    }

    _playerDefend(){
        if (!this.moveSelection.player || this.controlBusy) return;
        this.controlBusy  = true;
        this.playerDefending = true;
        this._setControlButtonsActive(false);

        // Brief pulse on player portrait to signal defensive stance
        if (this.playerBattlePortrait) {
            this.tweens.add({
                targets:  this.playerBattlePortrait,
                alpha:    0.35,
                duration: 130,
                yoyo:     true,
                repeat:   3,
                ease:     'Sine.easeInOut',
            });
        }

        this.moveSelection.player = false;
        this.moveSelection.comp   = true;
        this._updateTurnIndicator();
        this.time.delayedCall(1000, () => this._compTurn());
    }

    _compTurn(){
        this._resolveAttack('comp');
    }

    _resolveAttack(attackerSide){
        // Determine if the 'Player' has the attacker side move: 
        const isPlayer  = attackerSide === 'player';
        console.log("Player Move: ", isPlayer); // Testing

        // Determine which card is the 'Attacker' and which card is the 'Defender': 
        const atkerCard = isPlayer
            ? this.playerSelectedCards?.[this.playerActiveCardKey]
            : this.compAllCards[this.compActiveCardIndex];
        const dfdrCard  = isPlayer
            ? this.compAllCards[this.compActiveCardIndex]
            : this.playerSelectedCards?.[this.playerActiveCardKey];
        if (!atkerCard || !dfdrCard) return;

        const targetDefending = isPlayer ? this.compDefending : this.playerDefending;
        console.log("Player Defending: ", targetDefending); // Testing
        console.log('\n'); 


        //////////////////////////////////////////////
        ///////////////////////////////////////////////
        // Working with Ternary Operator for practice: 
        const user = { profile: { name: "Isom" } };
        const bio = user?.profile?.name;

        const userA = { profile: {name: "Noor" } }; 
        const bioA = userA?.profile?.bio;
        console.log('Bio prac 1: ', bio); // Testing 
        console.log('Bio prac 2: ', bioA); // Testing 
        console.log('\n'); // Testing 
        //////////////////////////////////////////////
        //////////////////////////////////////////////


        /** |Attack Notes|
         * => Card Attack Ratios:
         * 0. 0 = miss
         * 1. 1/2 = 0.50
         * 2. 2/3 = 0.67
         * 3. 3/4 = 0.75
         * 4. 1 = Critical Hit
         * 
         * => Singularity Point Coversion:
         * 0. 0 = miss => 0 SP
         * 1. 1/2 = 0.50 => 20 SP
         * 2. 2/3 = 0.67 => 30 SP
         * 3. 3/4 = 0.75 => 40 SP
         * 4. 1 = Critical Hit => 50 SP
         */
        const attackMultiplierIndex = Math.floor(Math.random() * this.attackMultipliers.length);
        let attackMultiplier = this.attackMultipliers[attackMultiplierIndex];
        attackMultiplier = attackMultiplier.toFixed(2); 

        let attackWithMultiplier = atkerCard.atk * attackMultiplier;
        attackWithMultiplier = attackWithMultiplier.toFixed(0);

        console.log("Attack Multipler: ", attackMultiplier); // Testing 
        console.log("Attack With Multiplier: ", attackWithMultiplier); // Testing
        console.log("Attack With Multiplier - Defender: ", attackWithMultiplier - dfdrCard.def); // Testing  

        // Call the singularity point store:
        const sp = singularityPointStore.attkMultiplierConversion[attackMultiplierIndex];
        this.addSingularityPoints(isPlayer, sp, attackWithMultiplier); 

        // let damage = Math.max(1, atkerCard.atk - dfdrCard.def);
        let damage = attackWithMultiplier === 0 ? 0
                    : attackWithMultiplier === dfdrCard.def ? 1
                    : Math.max(1, Math.abs(attackWithMultiplier - dfdrCard.def)); 
        if (targetDefending) damage = Math.max(1, Math.floor(damage / 2));

        const atkrPortrait = isPlayer ? this.playerBattlePortrait : this.compBattlePortrait;
        const dfdrPortrait = isPlayer ? this.compBattlePortrait   : this.playerBattlePortrait;
        const startX       = isPlayer ? -280 : 280;
        const lungeX       = isPlayer ? -60  : 60;
        const targetSide   = isPlayer ? 'comp' : 'player';
        console.log("Attacker Portrait: ", atkrPortrait); // Testing
        console.log("Defender Portrait: ", dfdrPortrait); // Testing
        console.log("\n"); // Testing 

        const applyAndFinish = () => {
            const defeated = this._applyDamage(targetSide, damage);
            if (defeated) this.cardDefeated = targetSide;

            // Shake the defender portrait
            if (dfdrPortrait) {
                const origX = dfdrPortrait.x;
                this.tweens.add({
                    targets:  dfdrPortrait,
                    x:        origX - 10,
                    duration: 35,
                    yoyo:     true,
                    repeat:   5,
                    ease:     'Linear',
                    onComplete: () => { dfdrPortrait.x = origX; },
                });
            }

            // Return attacker portrait to original position
            if (atkrPortrait) {
                this.tweens.add({
                    targets:  atkrPortrait,
                    x:        startX,
                    scaleX:   .1,
                    scaleY:   .1,
                    duration: 200,
                    ease:     'Power2.easeOut',
                    delay:    220,
                    onComplete: () => this._endTurn(attackerSide),
                });
            } else {
                this._endTurn(attackerSide);
            }
        };

        // WGO: If attacker portrait is not 'null' or 'undefined', then commence the 'Attack' tween.
        // The 'Attack' tween will act as the basic attack animation. 
        if (atkrPortrait) {
            this.tweens.add({
                targets:  atkrPortrait,
                x:        lungeX,
                scaleX:   .2,
                scaleY:   .2,
                duration: 200,
                ease:     'Power3.easeIn',
                onComplete: applyAndFinish,
            });
        } else {
            applyAndFinish();
        }
    }

    // addSingularityPoint(): PLayer and computer will gain singularity points from actions.
    addSingularityPoints(isPlayer, sp, attackWithMultiplier){
        let spContainer = this.children.getByName('spContainer');
        console.log("SP Container: ", spContainer); // Testing
        console.log("Attack Multipler Now: ", attackWithMultiplier); 

        const { width }  = this.cameras.main;
        const cx         = width / 2;
        const spPanelW   = 760;
        const spFinalY   = 45;
        const spLocalY   = 13;

        if (isPlayer)
        {
            console.log("Player gained singularity points: ", sp); // Testing
            this.singularityPointStock.playerPoints += sp;
            console.log("Players SP Stock: ", this.singularityPointStock.playerPoints); // Testing
            let playerSPCount= spContainer.list[9];
            playerSPCount.destroy();

            this.playerSPText = this.add.text(-spPanelW / 4, spLocalY, `${this.singularityPointStock.playerPoints} SP`, {
                fontFamily: 'monospace',
                fontSize: '22px',
                color: '#ffffff',
                stroke: '#002211',
                strokeThickness: 4,
            }).setOrigin(0.5);

            spContainer.addAt(this.playerSPText, 9);

            if (attackWithMultiplier !== 0)
            {
                this.tweens.add({
                    targets:  this.playerSPText,
                    scaleX:   1.40,
                    scaleY:   1.40,
                    duration: 190,
                    yoyo:     true,
                    ease:     'Back.easeOut',
                });

                this._spFlaresBurst(cx - spPanelW / 4, spFinalY + spLocalY, true);
            }
        }
        else
        {
            console.log("Computer gained singularity points: ", sp); // Testing
            this.singularityPointStock.compPoints += sp;
            console.log("Computers SP Stock: ", this.singularityPointStock.compPoints); // Testing
            let compSPCount = spContainer.list[11];
            compSPCount.destroy();

            this.compSPText = this.add.text(spPanelW / 4, spLocalY, `${this.singularityPointStock.compPoints} SP`, {
                fontFamily: 'monospace',
                fontSize:   '22px',
                color:      '#ffffff',
                stroke:     '#221100',
                strokeThickness: 4,
            }).setOrigin(0.5);

            spContainer.addAt(this.compSPText, 11);

            if (attackWithMultiplier !== 0)
            {
                this.tweens.add({
                    targets:  this.compSPText,
                    scaleX:   1.40,
                    scaleY:   1.40,
                    duration: 190,
                    yoyo:     true,
                    ease:     'Back.easeOut',
                });

                this._spFlaresBurst(cx + spPanelW / 4, spFinalY + spLocalY, false);
            }
        }
    }

    // _spFlaresBurst(): Spawns fiery spark particles around the SP text when points are gained.
    _spFlaresBurst(worldX, worldY, isPlayer){
        const palette = [0xff6600, 0xff8800, 0xffaa00, 0xff4400, 0xffdd00, 0xff3300];
        const count   = 14;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.6;
            const dist  = Phaser.Math.Between(28, 65);
            const r     = Phaser.Math.Between(2, 5);
            const color = palette[Math.floor(Math.random() * palette.length)];
            const spark = this.add.circle(worldX, worldY, r, color, 1.0);

            this.tweens.add({
                targets:  spark,
                x:        worldX + Math.cos(angle) * dist,
                y:        worldY + Math.sin(angle) * dist - Phaser.Math.Between(8, 32),
                scaleX:   0.1,
                scaleY:   0.1,
                alpha:    0,
                duration: Phaser.Math.Between(360, 700),
                ease:     'Power2.easeOut',
                delay:    Math.random() * 110,
                onComplete: () => spark.destroy(),
            });
        }

        // Central energy glow flash — cyan for player, orange for computer
        const glowColor = isPlayer ? 0x00ffcc : 0xff6600;
        const glow = this.add.circle(worldX, worldY, 18, glowColor, 0.55);
        this.tweens.add({
            targets:  glow,
            scaleX:   3.2,
            scaleY:   3.2,
            alpha:    0,
            duration: 460,
            ease:     'Power2.easeOut',
            onComplete: () => glow.destroy(),
        });
    }

    _applyDamage(targetSide, damage){
        let esse;
        if (targetSide === 'comp') {
            this.compCardEsse[this.compActiveCardIndex] = Math.max(0, this.compCardEsse[this.compActiveCardIndex] - damage);
            esse = this.compCardEsse[this.compActiveCardIndex];
            if (this.compEsseText) this.compEsseText.setText(`ESSE  ${esse}`);
        } else {
            this.playerCardEsse[this.playerActiveCardKey] = Math.max(0, this.playerCardEsse[this.playerActiveCardKey] - damage);
            esse = this.playerCardEsse[this.playerActiveCardKey];
            if (this.playerEsseText) this.playerEsseText.setText(`ESSE  ${esse}`);
        }
        return esse === 0;
    }

    _endTurn(completedSide){
        if (this.cardDefeated) {
            const defeatedSide = this.cardDefeated;
            this.cardDefeated  = null;
            this.time.delayedCall(500, () => this._handleCardDefeat(defeatedSide, completedSide));
            return;
        }

        if (completedSide === 'player') {
            this.moveSelection.player = false;
            this.moveSelection.comp   = true;
            this.playerBattlePortrait.setDisplaySize(64, 64); 
            this._updateTurnIndicator();
            this.time.delayedCall(900, () => this._compTurn());
        } else {
            this.compDefending        = false;
            this.playerDefending      = false;
            this.moveSelection.comp   = false;
            this.moveSelection.player = true;
            this.compBattlePortrait.setDisplaySize(64, 64); 
            this._updateTurnIndicator();
            this._setControlButtonsActive(true);
            this.controlBusy = false;
        }
    }

    _handleCardDefeat(defeatedSide, completedSide){
        if (defeatedSide === 'comp') {
            this.compActiveCardIndex++;

            if (this.compActiveCardIndex >= this.compAllCards.length) {
                console.log('PLAYER WINS — all computer cards defeated.');
                this._setControlButtonsActive(false);
                this.controlBusy = false;
                return;
            }

            // Bring in the next comp card
            const nextCard = this.compAllCards[this.compActiveCardIndex];
            this.bcsCompSlotCon.removeAll(true);
            this.bcsCompSlotCon.destroy();
            const newCompSlot = this.add.container(0, 0);
            this._drawBattleCardSlot(newCompSlot, nextCard, 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex]);
            this.bcsContainer.add(newCompSlot);
            this.bcsCompSlotCon = newCompSlot;

            // Rebuild comp deck
            this.cdsCompDeckCon.removeAll(true);
            this.cdsCompDeckCon.destroy();
            const newCompDeck = this.add.container(0, 0);
            this._buildDeckCards(newCompDeck, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY);
            this.cdsContainer.add(newCompDeck);
            this.cdsCompDeckCon = newCompDeck;

        } else {
            this.playerSelectedCards[this.playerActiveCardKey] = null;
            const remaining = ['Supra', 'Fere', 'Bonum1', 'Bonum2']
                .filter(k => this.playerSelectedCards[k]);

            if (remaining.length === 0) {
                console.log('COMPUTER WINS — all player cards defeated.');
                this._setControlButtonsActive(false);
                this.controlBusy = false;
                return;
            }

            this.playerActiveCardKey = remaining[0];

            // Bring in the next player card
            this.bcsPlayerSlotCon.removeAll(true);
            this.bcsPlayerSlotCon.destroy();
            const newPlayerSlot = this.add.container(0, 0);
            this._drawBattleCardSlot(newPlayerSlot, this.playerSelectedCards[this.playerActiveCardKey], 'player', this.bcsPanelW, this.bcsCardCenterY, this.playerCardEsse[this.playerActiveCardKey]);
            this.bcsContainer.add(newPlayerSlot);
            this.bcsPlayerSlotCon = newPlayerSlot;

            // Rebuild player deck
            this.cdsPlayerDeckCon.removeAll(true);
            this.cdsPlayerDeckCon.destroy();
            const newPlayerDeck = this.add.container(0, 0);
            this._buildDeckCards(newPlayerDeck, this._getPlayerDeckCards(), 'player', this.bcsPanelW, this.cdsCardAreaCY);
            this.cdsContainer.add(newPlayerDeck);
            this.cdsPlayerDeckCon = newPlayerDeck;
        }

        // Resume turns after card replacement
        this.time.delayedCall(600, () => {
            if (completedSide === 'player') {
                this.moveSelection.player = false;
                this.moveSelection.comp   = true;
                this._updateTurnIndicator();
                this.time.delayedCall(1200, () => this._compTurn());
            } else {
                this.compDefending        = false;
                this.playerDefending      = false;
                this.moveSelection.comp   = false;
                this.moveSelection.player = true;
                this._updateTurnIndicator();
                this._setControlButtonsActive(true);
                this.controlBusy = false;
            }
        });
    }
}

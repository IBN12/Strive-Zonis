import { initiatorCards } from '../models/initiatorCards.js';
import { SINGULARITY_CARDS, STORE_CARDS } from '../models/singularityCards.js';

import { singularityPointStore } from '../gameTools/singularityPointStore.js';
import { computerAuditSystem } from '../gameTools/computerAuditSystem.js';
import { UtilityAI } from '../gameTools/computerIntelligence.js'; 
import { SwapState } from '../gameTools/swapState.js';

export default class GameBattleScene extends Phaser.Scene {
    constructor(){
        super('GameBattleScene');
    }

    init(data){
        // Temporary Computer Intelligence Properties:
        this.cardSwitchTriggerTest = true; // For Testing purposes. 
        this.firstMoveComplete = false; 
        this.compWillAttack = false; 
        this.compWillDefend = false;
        this.decisionTreeCalled = false; 

        this.playerTotalPreviousCardSwaps = 0; 
        this.compSwapState = 'Basic Tempo';
        this.compSwapMeter = 0;

        this.playerAttksWithSupra = 0;
        this.playerSupraAttked = 0;
        this.playerAttksWithSupra = 0;
        this.playerFereAttked = 0;
        this.playerAttksWithFere = 0;
        this.playerBonumAttked = 0;
        this.playerAttksWithBonum = 0;  

        this.swapToAttackTimeFrame = {
            basicTempoTime: 900,
            protectSupraHighTime: 1100,
            timeFrame: null,
        }
        this.confidenceSwapPts = {
            mainPts: 5,
            maxPts: 5,
            minPts: 0, 
            confidence: 0,
            noConfidence: 0, 
        }
        this.compActions = {
            attack: false,
            defend: false,
            swap: false, 
        }

        // Default Properties: 
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
        this.playerSingularityCardUse = {
            cardObj: null,
            cardName: null,
            desc: null,
            turns: null,
        }
        this.compSingularityCardUse = {
            cardObj: null,
            cardName: null,
            desc: null,
            turns: null, 
        }
        this.playerSingularityCardArr = [];
        this.compSingularityCardArr = []; 

        this.attackMultipliers = [0, 1/2, 2/3, 3/4, 1]; 

        this.playerSelectedCards  = (data && data.selectedCards) ? data.selectedCards : null;

        this.playerActiveCardKey  = null;
        this.compAllCards         = [];
        this.compActiveCardIndex  = 0;
        this.compDeckIndex = []; 

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

        // In game audit system:
        this.playerPreviousMove   = null;
        this.compPreviousMove     = null;

        this.playerPreviousAttkMultiplier = null;
        this.compPreviousAttkMultiplier   = null;

        this.playerPreviousAttkPtWithMultiplier = null
        this.compPreviousAttkPtWithMultiplier   = null;

        this.allCompAttkMultipliers = [
            {
                cate: 'Supra',
                multipliers: [], 
                miss: 0,
                crit: 0,
                oneHalf: 0,
                twoThird: 0,
                threeFourth: 0,
            }, 
            {
                cate: 'Fere',
                multipliers: [],
                miss: 0,
                crit: 0,
                oneHalf: 0,
                twoThird: 0,
                threeFourth: 0,
            },
            {
                cate: 'Bonum',
                multipliers: [], 
                miss: 0,
                crit: 0,
                oneHalf: 0,
                twoThird: 0,
                threeFourth: 0,
            },
        ];
        this.allPlayerAttkMultipliers = [
            {
                cate: 'Supra', 
                multipliers: [], 
            },
            {
                cate: 'Fere',
                multipliers: [],
            },
            {
                cate: 'Bonum',
                multipliers: [], 
            }, 
        ]; 

        this.allCompAttksWithMultiplier = []; 
        this.allPlayerAttksWithMultiplier = [];
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
                    this.flipACoinAnimation(); // Performs coin fliping animation. 
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

                // -- Computer Auditing System -- 
                // Audit if the Player or Comp get the first move
                computerAuditSystem.playerMove = this.moveSelection.player;
                computerAuditSystem.compMove = false;

                console.log(`${this.coinFlipData.by} gets the first move.`); // Testing
            }
            else
            {
                this.moveSelection.comp = true; 

                // -- Computer Auditing System -- 
                // Audit if the Player or Comp get the first move 
                computerAuditSystem.compMove = this.moveSelection.comp;
                computerAuditSystem.playerMove = false;

                console.log('Computer gets the first move.'); // Testing 
            }

            this.gameBattleContent(); // Official Game Battle Content
            this.compAutoSwapCard();  // Computer Intelligence Card Swap
        });
    }

    // gameBattleContent(): All the game battle content will be initiated here.
    gameBattleContent(){
        this._initBattleCardState();
        this.singularityPointStation();
        this.battleCardStation();
        this.cardDeckStation();
        this.battleControlStation();
        this.singularityCardDeckStation(); 
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

                // |Computer Audit System for Core Concept Intelligence (CCI)|
                // -- Auditing the active card deck for the Player (One Time Audit) --
                computerAuditSystem.activePlayerCardDeck.push(this.playerSelectedCards[key]); 
            }
        });
        this.compCardEsse = this.compAllCards.map(c => c.esse);

        // |Computer Audit System for Core Concept Intelligence (CCI)|
        // -- Auditing the active card deck for the Computer (One Time Audit) --
        this.compAllCards.forEach((card) => {
            computerAuditSystem.activeCompCardDeck.push(card); 
        });
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

        // |Computer Auditing System for Core Concept Intelligence (CCI)|
        // -- Auditing the Starting Player Battle Card --
        computerAuditSystem.activePlayerCard = playerCard;
        computerAuditSystem.activeCompCard = compCard; 


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
            .map((card, i) =>  ({ key: i, card }))
            .filter(entry => entry.key !== this.compActiveCardIndex); 
    }

    _buildDeckCards(container, deckEntries, side, panelW, cardAreaCY){
        const isPlayer    = side === 'player';
        const accentColor = isPlayer ? 0x00ffcc : 0xff6600;
        const labelColor  = isPlayer ? '#00ffcc' : '#ff8844';
        const pSize       = 48;

        // Reset comp deck index:
        this.compDeckIndex.length = 0;
        this.compDeckIndex = [];  

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

            // Create Comp Deck Index:
            this.compAllCards.forEach((card, index) => {
                if (entry.card.name === card.name)
                {
                    this.compDeckIndex.push(index); 
                }
            }); 

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
        // |Computer Audit System for Core Concept Intelligence|
        // -- Card Swap Audit for the Player --
        let swapPatternObj = {
            from: this.playerSelectedCards[this.playerActiveCardKey],
            to: this.playerSelectedCards[newActiveKey],
            attkCard: 'none', 
            cardAttked: 'none', 
        }
        computerAuditSystem.playerPatternCardSwaps[computerAuditSystem.playerTotalCardSwaps] = {
            ...swapPatternObj,
        }
        computerAuditSystem.playerTotalCardSwaps++; 
        console.log('Total Player Card Swap: ', computerAuditSystem.playerTotalCardSwaps); // Testing
        console.log('The Swap: ', computerAuditSystem.playerPatternCardSwaps); // Testing 
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

        // |Computer Auditing System for Core Concept Intelligence (CCI)| 
        // -- Active Battle Card Audit --
        computerAuditSystem.activePlayerCard = this.playerSelectedCards[this.playerActiveCardKey];
        computerAuditSystem.activeCompCard = this.compAllCards[this.compActiveCardIndex];  
    }

    // compAutoSwapCard(): Computer will swap there cards automatically: 
    compAutoSwapCard(){
        // Note: Base the swaps on game difficulty.
        // The game difficulty for now will be easy.
        let tempGameDifficulty = 'easy'; 

        this.time.addEvent({
            delay: 1000, 
            callback: this._timeBasedCardSwap,
            args: [tempGameDifficulty],
            callbackScope: this,
            loop: true,
        });
    }

    // _timeBasedCardSwap(): Comp cards will be switched out on a Time-Based trigger.
    _timeBasedCardSwap(difficulty){
        // console.log('|__Time Based Card Swap__|'); // Testing

        // TB => Time Based 
        // console.log('TB-Active Comp Card: ', this.compAllCards[this.compActiveCardIndex]); // Testing
        // console.log('TB-ACtive Comp Card Esse: ', this.compCardEsse[this.compActiveCardIndex]); // Testing
        // console.log('TB-Comp Previous Attack Multiplier: ', this.compPreviousAttkMultiplier); // Testing
        // console.log('TB-Comp Previous Attack Multiplier With Attack Point: ', this.compPreviousAttkPtWithMultiplier); // Testing  
        // console.log('TB-Comp Move Selection: ', this.moveSelection.comp); // Testing
        // console.log('\n'); // Testing

        // console.log("TB-Active Player Card: ", this.playerSelectedCards[this.playerActiveCardKey]); // Testing
        // console.log('TB-Active Player Card Esse: ', this.playerCardEsse[this.playerActiveCardKey]); // Testing
        // console.log("TB-Player Previous Attack Multiplier: ", this.playerPreviousAttkMultiplier); // Testing 
        // console.log("TB-Player Previous Attack Multiplier With Attack Point: ", this.playerPreviousAttkPtWithMultiplier); // Testing
        // console.log('TB-Player Move Selection:  ', this.moveSelection.player); // Testing 
        // console.log('\n'); // Testing

        // console.log('TB-Player Pattern Card Swap: ', computerAuditSystem.playerPatternCardSwaps); // Testing 
        for (const key in computerAuditSystem.playerPatternCardSwaps)
        {
            console.log(computerAuditSystem.playerPatternCardSwaps[key]); // Testing 
        }
        console.log('\n'); // Testing 

        const esseLength = Math.abs(this.compCardEsse[this.compActiveCardIndex] - this.playerCardEsse[this.playerActiveCardKey]);

        const randomChoiceArr = [1, 2, 3]; 
        
        // Phase 1: Force the computer to protect its 'Supra' card when the Players 'Move Selection' is true.
        // The comp will switch the 'Supra' out and back in when the comps 'Move Selection' is true.
        if (this.moveSelection.player === true && !this.firstMoveComplete) // Player has first move
        {
            if (this.compAllCards[this.compActiveCardIndex].cate === 'Supra')
            {
                // this._swapCompCard(); 

                this.firstMoveComplete = true; 
            }
        }
        else if (this.moveSelection.comp === true && !this.firstMoveComplete) // comp has first move
        {
            // Phase Commencement: Will have to initiate some type of Monte Carlo Tree with actions for the first computer move.
            // Preferably allowing the computer to attack with their Supra card and switch it out 
            // for another card when the Player has the next turn. 
            this.firstMoveComplete = true;
        }


        /////////////////////////////////////////////////////////////////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // New: Phase 2 Tempo Swtiching with pattern states: 
        console.log('Decision Tree Called: ', this.decisionTreeCalled); // Testing 
        if (this.firstMoveComplete && !this.decisionTreeCalled)
        {
            // // Read the player card swap pattern: 
            // if (this.playerTotalPreviousCardSwaps < computerAuditSystem.playerTotalCardSwaps)
            // {
            //     this.playerTotalPreviousCardSwaps = computerAuditSystem.playerTotalCardSwaps; 
            //     this._readPlayerCardSwapPattern(); 
            // }

            this._compSwapIntel();

            // The comp swap card state: 
            // this._swapCompCardState(this.compSwapState); 
        }
    }

    // _compSwapIntel(): Computer will find ways to swap based on game properties:
    _compSwapIntel(){
        if (this.compSwapState === 'Basic Tempo')
        {
            if (this.playerSelectedCards[this.playerActiveCardKey].cate === 'Supra')
            {
                // WGO: The computer knows which category card is on the table.
                console.log('Supra!'); // Testing 
                if (this.compAllCards[this.compActiveCardIndex].cate === 'Supra')
                {
                    console.log('Player Supra Vs Comp Supra'); // Testing
                    // 1
                    this.confidenceSwapPts.confidence++;

                    // Logic: Compare Attk, Def, Esse, Cate => Computer has to read the stats in order to make its decision.
                    // Compare Player Atk to Comp Atk:
                    if (this.playerSelectedCards[this.playerActiveCardKey].atk > this.compAllCards[this.compActiveCardIndex].atk)
                    {
                        // -1
                        this.confidenceSwapPts.noConfidence++;
                    }
                    else if (this.playerSelectedCards[this.playerActiveCardKey].atk === this.compAllCards[this.compActiveCardIndex].atk)
                    {
                        // 1
                        this.confidenceSwapPts.confidence++;
                    }
                    else
                    {
                        // 1
                        this.confidenceSwapPts.confidence++;
                    }

                    // Compare Player Def to Comp Def:
                    if (this.playerSelectedCards[this.playerActiveCardKey].def > this.compAllCards[this.compActiveCardIndex].def)
                    {
                        // -1
                        this.confidenceSwapPts.noConfidence++;
                    }
                    else if (this.playerSelectedCards[this.playerActiveCardKey].def === this.compAllCards[this.compActiveCardIndex].def)
                    {
                        // 1
                        this.confidenceSwapPts.confidence++;
                    }
                    else
                    {
                        // 1
                        this.confidenceSwapPts.confidence++;
                    }

                    // Compare Player Esse to Comp Esse:
                    if (this.playerCardEsse[this.playerActiveCardKey] > this.compCardEsse[this.compActiveCardIndex])
                    {
                        // -1
                        this.confidenceSwapPts.noConfidence++;
                    }
                    else if (this.playerCardEsse[this.playerActiveCardKey] === this.compCardEsse[this.compActiveCardIndex])
                    {
                        // 1
                        this.confidenceSwapPts.confidence++; 
                    }
                    else
                    {
                        // 1 
                        this.confidenceSwapPts.confidence++;
                    }

                    // Logic: 1 => Confident, -1 => Not Confident 
                    /** |Confidnece/No Confidence Ratio|
                     * ==> Player Supra vs Comp Supra:
                     * => 4 Confidence / 0 No Confidence => Pure Attack
                     * => 3 Confidence / 1 No Confidence => Decision Tree Based On Stats
                     * => 2 Confidence / 2 No Confidence => Decision Tree Based On Stats
                     * => 1 Confidence / 3 No Confidence => Decision Tree Based On Stats
                    */
                    
                    // Confidence/No Confidence Ratio Calculation:
                    if (this.confidenceSwapPts.confidence === 4 && this.confidenceSwapPts.noConfidence === 0)
                    {
                        // console.log('Pure Attack!'); // Testing
                        console.log('TESTING THE DECISION TREE!'); // Testing
                        this._decisionTree(); // Testing
                        if (this.moveSelection.comp) this.compActions.attack = true; 
                    }
                    else
                    {
                        console.log('Decision Tree'); // Testing
                        this._decisionTree(); 
                    }
  
                    this.confidenceSwapPts.confidence = 0;
                    this.confidenceSwapPts.noConfidence = 0; 
                }
                else if (this.compAllCards[this.compActiveCardIndex].cate === 'Fere')
                {
                    console.log('Player Supra Vs Comp Fere'); // Testing
                    // -1
                }
                else if (this.compAllCards[this.compActiveCardIndex].cate === 'Bonum')
                {
                    console.log('Player Supra Vs Comp Bonum'); // Testing 
                    // -1 
                }
            }
            else if (this.playerSelectedCards[this.playerActiveCardKey].cate === 'Fere')
            {
                console.log('Fere!'); // Testing
            }
            else if (this.playerSelectedCards[this.playerActiveCardKey].cate === 'Bonum')
            {
                console.log('Bonum!'); // Testing 
            }
        }
    }

    // _decisionTree(): Will determine the computer swap state: 
    _decisionTree(){
        const playerEsse = this.playerCardEsse[this.playerActiveCardKey];
        const compEsse = this.compCardEsse[this.compActiveCardIndex];

        if (playerEsse >= 1 && playerEsse < 30)
        {
            if (compEsse >= 1 && compEsse < 30)
            {
                /** |BOTH BATTLE CARDS HAVE LOW ESSE|
                 * --- Player card is close to death / Comp card is close to death --- 
                 * 
                 * ==> Attack:
                 * -> Check if attack with multipliers will eliminate the player card.
                 * -> Check if Defend is needed against certain attacks to sustain esse
                 * if this card is needed or a can't be done.
                 * -> Check if a Swap to a better card with more esse is needed just in case 
                 * the other cards attacks with multipliers can't get the job done. 
                 * -> Check the Players Swap Pattern to see how the player is strategizing. 
                 */
                this._reasoning('BOTH BATTLE CARDS HAVE LOW ESSE', this.compAllCards[this.compActiveCardIndex].cate);
            }
            else if (compEsse >= 30 && compEsse < 60)
            {
                /** |COMP CARD HAS A HIGHER AMOUNT OF ESSE| 
                 * --- Player card is close to death / Comp card has the advantage in esse ---
                 * 
                 * ==> Attack: 
                 * -> Make the comp battle card attack aggressively. 
                 * -> Check the 'Players Swap Pattern' to see how the player is strategizing. 
                 */
                this._reasoning('COMP CARD HAS A HIGHER AMOUNT OF ESSE', this.compAllCards[this.compActiveCardIndex].cate); 
            }
            else if (compEsse >= 60 && compEsse <= 100)
            {
                /** |COMP CARD HAS AN EXTREME HIGH AMOUNT OF ESSE|
                 * --- Player card is close to death / Comp card has an extreme advantage in esse --- 
                 * 
                 * ==> Attack: 
                 * -> Make the comp battle card attack aggressively.
                 * -> Check the 'Players Swap Pattern' to see how the player is strategizing. 
                 */
                this._reasoning('COMP CARD HAS AN EXTREME HIGH AMOUNT OF ESSE', this.compAllCards[this.compActiveCardIndex].cate); 
            }
        }
        else if (playerEsse >= 30 && playerEsse < 60)
        {
            if (compEsse >= 1 && compEsse < 30)
            {
                /** |COMP CARD IS CLOSE TO DEFEAT WHILE THE PLAYER IS AHEAD IN ESSE|
                 * --- Player card is ahead in esse / Comp card is close to defeat ---
                 * 
                 */
                this._reasoning('COMP CARD IS CLOSE TO DEFEAT WHILE THE PLAYER CARD IS AHEAD IN ESSE', this.compAllCards[this.compActiveCardIndex].cate); 
            }
            else if (compEsse >= 30 && compEsse < 60)
            {
                /** |BOTH BATTLE CARDS HAVE THE SAME MEDIUM AMOUNT OF ESSE|
                 * --- Player card has a medium amount of esse / Comps card has a medium amount of esse ---
                 * 
                 */
                this._reasoning('BOTH BATTLE CARDS HAVE A DECENT OF ESSE', this.compAllCards[this.compActiveCardIndex].cate); 
            }
            else if (compEsse >= 60 && compEsse <= 100)
            {
                /** |COMP CARD HAS A HIGHER AMOUNT OF ESSE|
                 * --- Player card is close to death / Comp card has the advantage in esse ---
                 * 
                 */
                this._reasoning('COMP CARD HAS A HIGHER AMOUNT OF ESSE', this.compAllCards[this.compActiveCardIndex].cate); 
            }
        }
        else if (playerEsse >= 60 && playerEsse <= 100)
        {
            if (compEsse >= 1 && compEsse < 30)
            {
                /** |COMP CARD IS CLOSE TO DEFEAT WHILE THE PLAYER CARD IS EXTREMELY AHEAD IN ESSE|
                 * 
                 */
                this._reasoning('COMP CARD IS CLOSE TO DEFEAT WHILE THE PLAYER CARD IS EXTREMELY AHEAD IN ESSE', this.compAllCards[this.compActiveCardIndex].cate); 
            }
            else if (compEsse >= 30 && compEsse < 60)
            {
                /** |COMP CARD IS BEHIND IN ESSE BY AN AVERAGE AMOUNT|
                 * 
                 */
                this._reasoning('COMP CARD IS BEHIND IN ESSE BY AN AVERAGE AMOUNT', this.compAllCards[this.compActiveCardIndex].cate); 
            }
            else if (compEsse >= 60 && compEsse <=  100)
            {
                /** |BOTH BATTLE CARDS HAVE A HIGH AMOUNT OF ESSE|
                 * 
                 */
                this._reasoning('BOTH BATTLE CARDS HAVE A HIGH AMOUNT OF ESSE', this.compAllCards[this.compActiveCardIndex].cate); 
            }
        }
    }

    // _reasoning(): Compupter will develop their next strategy here: 
    _reasoning(analyzeState, compCateCard){
        this.decisionTreeCalled = true; 
        if (analyzeState === 'BOTH BATTLE CARDS HAVE A HIGH AMOUNT OF ESSE') // BASE: When Player Esse is between 60 and 100
        {
            // Note 1: May need to add the 'Player Multiplier' that the computer is getting hit with.
            // Note 2: May need to add the 'Player Swap Card Pattern' for the computer to read. 

            // PHASE 1: Read the computers current 'Attack Multipliers': 
            this.allCompAttkMultipliers.forEach((mul) => {
                if (compCateCard === 'Supra' && mul.cate === compCateCard)
                {
                    mul.multipliers.forEach((num) => {
                        if (num === Number(0))
                        {
                            mul.miss++;
                            console.log('Set up for judgement!'); // Testing 
                        }
                        else if (num === Number((1/2).toFixed(2)))
                        {
                            mul.oneHalf++;
                            console.log('Set up for judgement!'); // Testing 
                        }
                    });
                }
                else if (compCateCard === 'Fere' && mul.cate === compCateCard)
                {
                    mul.multipliers.forEach((num) => {
                        if (num === Number(0))
                        {
                            mul.miss++;
                            console.log('Set up for judgement!'); // Testing 
                        }
                        else if (num === Number((1/2).toFixed(2)))
                        {
                            mul.oneHalf++;
                            console.log('Set up for judgement!'); // Testing 
                        }
                    });
                }
                else if (compCateCard === 'Bonum' && mul.cate === compCateCard)
                {
                    mul.multipliers.forEach((num) => {
                        if (num === Number(0))
                        {
                            mul.miss++;
                            console.log('Set up for judgement!'); // Testing 
                        }
                        else if (num === Number((1/2).toFixed(2)))
                        {
                            mul.oneHalf++; 
                            console.log('Set up for judgement!'); // Testing 
                        }
                    });
                }
            });

            // Phase 2: Test which multipliers appeared the most:
            if (compCateCard === 'Supra')
            {
                if (this.allCompAttkMultipliers[0].miss >= 1)
                {
                    this.allCompAttkMultipliers[0].multipliers.length = 0;
                    this.allCompAttkMultipliers[0].miss = 0;
                    this._swapCompCard(); 
                    console.log('Switch Cards'); // Testing
                }
                else if (this.allCompAttkMultipliers[0].oneHalf >= 2)
                {
                    this.allCompAttkMultipliers[0].multipliers.length = 0;
                    this.allCompAttkMultipliers[0].oneHalf = 0; 
                    this._swapCompCard(); 
                    console.log('Switch Cards'); // Testing 
                }
            }
            else if (compCateCard === 'Fere')
            {
                if (this.allCompAttkMultipliers[1].miss >= 2)
                {
                    this.allCompAttkMultipliers[1].multipliers.length = 0;
                    this.allCompAttkMultipliers[1].miss = 0;
                    this._swapCompCard();
                    console.log('Switch Cards'); // Testing 
                }
                else if (this.allCompAttkMultipliers[1].oneHalf >= 3)
                {
                    this.allCompAttkMultipliers[1].multipliers.length = 0; 
                    this.allCompAttkMultipliers[1].oneHalf = 0; 
                    this._swapCompCard(); 
                    console.log('Switch Cards'); // Testing
                }
            }
            else if (compCateCard === 'Bonum')
            {
                if (this.allCompAttkMultipliers[2].miss >= 3)
                {
                    this.allCompAttkMultipliers[2].multipliers.length = 0; 
                    this.allCompAttkMultipliers[2].miss = 0;  
                    this._swapCompCard(); 
                    console.log('Switch Cards'); // Testing 
                }
            }
        }
        else if (analyzeState === 'COMP CARD IS BEHIND IN ESSE BY AN AVERAGE AMOUNT') // BASE: When Player Esse is between 60 and 100 
        {
            // PHASE 1:
        }
        else if (analyzeState === 'COMP CARD IS CLOSE TO DEFEAT WHILE THE PLAYER CARD IS EXTREMELY AHEAD IN ESSE') // BASE: When Player Esse is between 60 and 100
        {
            // PHASE 1: 
        }
        else if (analyzeState === 'BOTH BATTLE CARDS HAVE LOW ESSE') // When Player Esse is between 1 and 30
        {
            console.log('Comp Battle Card: ', this.compAllCards[this.compActiveCardIndex]); // Testing
            console.log('Comps Battle Card Attack: ', this.compAllCards[this.compActiveCardIndex].atk); // Testing
            console.log('Player Current Esse: ', this.playerCardEsse[this.playerActiveCardKey]); // Testing
            console.log('Comp Current Esse: ', this.compCardEsse[this.compActiveCardIndex]); // Testing
            let allEssesAfterAttack = [];
            
            // PHASE 1: Find what 'Computer Attack With Attack Multiplier' will lower the esse close to zero or to zero:
            this.attackMultipliers.forEach((mul) => {
                if (mul !== 0)
                {
                    // 1/2 - 2/3 - 3/4 - 1 -> Multipliers
                    const attackWithMultiplier = Number((mul.toFixed(2))) * this.compAllCards[this.compActiveCardIndex].atk; 
                    const damage = Math.abs(attackWithMultiplier - this.player);
                    const esseAfterAttack = Math.max(this.playerCardEsse[this.playerActiveCardKey] - damage); 
                    if (esseAfterAttack <= 0) allEssesAfterAttack.push(esseAfterAttack);
                }
            });

            // PHASE 2: Find the lowest the amount esse after the sort and analyze: 
            allEssesAfterAttack.sort((a, b) => a - b);
            if (allEssesAfterAttack[0] <= 0)
            {
                // Player card will be eliminated with
                // this attack, so there is no need to
                // swap cards during the comps base move.
                // Note: Keep in mind the computer could
                // also miss the base move - attack with
                // a 0 attack multiplier.

            }
            else if (allEssesAfterAttack[0] >= 1 && allEssesAfterAttack[0] < 25)
            {
                // Player card will not be eliminated with
                // the comps current attack, so you may 
                // need to swap your card to a better card
                // that has higher attack, or take the chance
                // with the attack. (SWAP)

                // Note: Supras will most likely be able to
                // finish the opposing card. 

                // Note: Even if you have a Supra, attacking
                // with it while having low esse might not be
                // worth it because of 0 attack multipliers. 
                
                // Note: You may want to check the 
                // 'Players Pattern Swap' so the
                // computer can understand how the player
                // is really playing the game: 
            }
        }
        this.decisionTreeCalled = false;
    }

    // _swapCompCard: Computer will swap there cards out here:
    _swapCompCard(){
        // Change the 'Active Card Index' with the'Math.random' function: 
        let randomIndex = Math.floor(Math.random() * this.compDeckIndex.length);         
        this.compActiveCardIndex = this.compDeckIndex[randomIndex];
        console.log('COMP DECK INDEX ARRAY: ', this.compDeckIndex); // Testing 

        // Rebuild the BCS comp slot: 
        this.bcsCompSlotCon.removeAll(true);
        this.bcsCompSlotCon.destroy(); 
        const newBcsSlot = this.add.container(0,0); 
        this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
        this.bcsContainer.add(newBcsSlot);
        this.bcsCompSlotCon = newBcsSlot;

        // Card changing animation: 
        this.tweens.add({
            targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
            duration: 220, yoyo: true, ease: 'Back.easeOut', 
        });

        // Rebuild CDS comp deck: 
        this.cdsCompDeckCon.removeAll(true); 
        this.cdsCompDeckCon.destroy(); 
        const newDeckCon = this.add.container(0,0); 
        this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
        this.cdsContainer.add(newDeckCon); 
        this.cdsCompDeckCon = newDeckCon; 

        console.log('--Computer Card Deck Container: ', this.cdsCompDeckCon); // Testing 
    }

    //_swapCompCardState(): Will swap the cards depending on the 'Comps Swap State':
    _swapCompCardState(swapState){

        if (swapState === 'Basic Tempo') // Basic Tempo - default comp card state 
        {
            console.log('BASIC TEMPO - COMP CONFIDENCE PTS: ', this.confidenceSwapPts.mainPts); // Testing
            // Can also place other 'Basic Tempo' swap states in here. 

            if (this.confidenceSwapPts.mainPts <= 2.5)
            {
                // Reverse the 'Confidence Swap Points' back to 5 when a new card is on deck: 
                this.confidenceSwapPts.mainPts = 5; 

                // Choose a random card from the computers deck: 
                const randomIndex = Math.floor(Math.random() * this.compDeckIndex.length); 
                this.compActiveCardIndex = this.compDeckIndex[randomIndex]; 

                // Rebuild the BCS comp slot:
                this.bcsCompSlotCon.removeAll(true);
                this.bcsCompSlotCon.destroy(); 
                const newBcsSlot = this.add.container(0,0); 
                this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
                this.bcsContainer.add(newBcsSlot);
                this.bcsCompSlotCon = newBcsSlot;

                // Card changing animation: 
                this.tweens.add({
                    targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
                    duration: 220, yoyo: true, ease: 'Back.easeOut', 
                });

                // Rebuild CDS comp deck: 
                this.cdsCompDeckCon.removeAll(true); 
                this.cdsCompDeckCon.destroy(); 
                const newDeckCon = this.add.container(0,0); 
                this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
                this.cdsContainer.add(newDeckCon); 
                this.cdsCompDeckCon = newDeckCon; 
            }

        }
        else if (swapState === 'High Protection For Supra' && this.compSwapMeter < 8)
        {
            /** |Very High Protection For Supra|
             * The Player has is preserving the esse of their Supra card by switching it out 
             * and only using it for Attacks. 
             * 
             * The Computer will follow suit with also protecting its Supra Card by switching it out and
             * also using it for attack methods. 
             */
            if (this.compAllCards[this.compActiveCardIndex].cate === 'Supra' && !this.moveSelection.comp)
            {
                const randomIndex = Math.floor(Math.random() * this.compDeckIndex.length); 
                this.compActiveCardIndex = this.compDeckIndex[randomIndex];

                // Rebuild the BCS comp slot: 
                this.bcsCompSlotCon.removeAll(true);
                this.bcsCompSlotCon.destroy(); 
                const newBcsSlot = this.add.container(0,0); 
                this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
                this.bcsContainer.add(newBcsSlot);
                this.bcsCompSlotCon = newBcsSlot;

                // Card changing animation: 
                this.tweens.add({
                    targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
                    duration: 220, yoyo: true, ease: 'Back.easeOut', 
                });

                // Rebuild CDS comp deck: 
                this.cdsCompDeckCon.removeAll(true); 
                this.cdsCompDeckCon.destroy(); 
                const newDeckCon = this.add.container(0,0); 
                this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
                this.cdsContainer.add(newDeckCon); 
                this.cdsCompDeckCon = newDeckCon; 
            }
            else if (this.compAllCards[this.compActiveCardIndex].cate !== 'Supra' && this.moveSelection.comp)
            {
                // Declare the Supra index:
                this.compActiveCardIndex = 0;

                // Rebuild the BCS comp slot: 
                this.bcsCompSlotCon.removeAll(true);
                this.bcsCompSlotCon.destroy(); 
                const newBcsSlot = this.add.container(0,0); 
                this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
                this.bcsContainer.add(newBcsSlot);
                this.bcsCompSlotCon = newBcsSlot;

                // Card changing animation:
                this.tweens.add({
                    targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
                    duration: 220, yoyo: true, ease: 'Back.easeOut', 
                });

                // Rebuild CDS comp deck:
                this.cdsCompDeckCon.removeAll(true); 
                this.cdsCompDeckCon.destroy(); 
                const newDeckCon = this.add.container(0,0); 
                this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
                this.cdsContainer.add(newDeckCon); 
                this.cdsCompDeckCon = newDeckCon; 
            }
            
            this.compSwapMeter++;
            // Check the Swap meter: 
            if (this.compSwapMeter === 8)
            {
                this.compSwapMeter = 0;
                this.compSwapState = 'Basic Tempo';
                this.confidenceSwapPts = 5; 
            }
        }
        else if (swapState === 'Average Protection For Supra' && this.compSwapMeter < 5)
        {
            // Notes: Average Protection For Supra for a decent amount of time and then back to 'Basic Tempo':
            console.log('--AVERAGE PROTECTION FOR SUPRA--') // Testing 
            console.log('Supra Esse: ', this.compCardEsse[this.compActiveCardIndex]); // Testing
            if (this.compAllCards[this.compActiveCardIndex].cate === 'Supra' && !this.moveSelection.comp)
            {
                const randomIndex = Math.floor(Math.random() * this.compDeckIndex.length);
                this.compActiveCardIndex = this.compDeckIndex[randomIndex];  

                // Rebuild the BCS comp slot: 
                this.bcsCompSlotCon.removeAll(true);
                this.bcsCompSlotCon.destroy(); 
                const newBcsSlot = this.add.container(0,0); 
                this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
                this.bcsContainer.add(newBcsSlot);
                this.bcsCompSlotCon = newBcsSlot;

                // Card changing animation:
                this.tweens.add({
                    targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
                    duration: 220, yoyo: true, ease: 'Back.easeOut', 
                });

                // Rebuild CDS comp deck:
                this.cdsCompDeckCon.removeAll(true); 
                this.cdsCompDeckCon.destroy(); 
                const newDeckCon = this.add.container(0,0); 
                this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
                this.cdsContainer.add(newDeckCon); 
                this.cdsCompDeckCon = newDeckCon; 
            }
            else if (this.compAllCards[this.compActiveCardIndex].cate !== 'Supra' && this.moveSelection.comp)
            {
                // Declare the Supra index:
                this.compActiveCardIndex = 0; 

                // Rebuild the BCS comp slot:
                this.bcsCompSlotCon.removeAll(true);
                this.bcsCompSlotCon.destroy(); 
                const newBcsSlot = this.add.container(0,0); 
                this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
                this.bcsContainer.add(newBcsSlot);
                this.bcsCompSlotCon = newBcsSlot;

                // Card changing animation: 
                this.tweens.add({
                    targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
                    duration: 220, yoyo: true, ease: 'Back.easeOut', 
                });

                // Rebuild CDS comp deck:
                this.cdsCompDeckCon.removeAll(true); 
                this.cdsCompDeckCon.destroy(); 
                const newDeckCon = this.add.container(0,0); 
                this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
                this.cdsContainer.add(newDeckCon); 
                this.cdsCompDeckCon = newDeckCon; 
            }
            
            this.compSwapMeter++;
            // Check the swap meter:
            if (this.compSwapMeter === 4)
            {
                this.compSwapMeter = 0;
                this.compSwapState = 'Basic Tempo';  
                this.confidenceSwapPts = 5;
            }
        }
        else if (swapState === 'Low Protection For Supra' && this.compSwapMeter < 2)
        {
            console.log('--LOW PROTECTION FOR SUPRA--'); // Testing
            console.log('Supra Esse: ', this.compCardEsse[this.compActiveCardIndex]); // Testing 

            if (this.compAllCards[this.compActiveCardIndex].cate === 'Supra' && !this.moveSelection.comp)
            {
                const randomIndex = Math.floor(Math.random() * this.compDeckIndex.length);
                this.compActiveCardIndex = this.compDeckIndex[randomIndex];  

                // Rebuild the BCS comp slot:
                this.bcsCompSlotCon.removeAll(true);
                this.bcsCompSlotCon.destroy(); 
                const newBcsSlot = this.add.container(0,0); 
                this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
                this.bcsContainer.add(newBcsSlot);
                this.bcsCompSlotCon = newBcsSlot;

                // Card Changing animation:
                this.tweens.add({
                    targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
                    duration: 220, yoyo: true, ease: 'Back.easeOut', 
                });

                // Rebuild CDS comp deck: 
                this.cdsCompDeckCon.removeAll(true); 
                this.cdsCompDeckCon.destroy(); 
                const newDeckCon = this.add.container(0,0); 
                this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
                this.cdsContainer.add(newDeckCon); 
                this.cdsCompDeckCon = newDeckCon; 
            }
            else if (this.compAllCards[this.compActiveCardIndex].cate !== 'Supra' && this.moveSelection.comp)
            {
                // Declare the Supra index:
                this.compActiveCardIndex = 0; 

                // Rebuild the BCS comp slot:
                this.bcsCompSlotCon.removeAll(true);
                this.bcsCompSlotCon.destroy(); 
                const newBcsSlot = this.add.container(0,0); 
                this._drawBattleCardSlot(newBcsSlot, this.compAllCards[this.compActiveCardIndex], 'comp', this.bcsPanelW, this.bcsCardCenterY, this.compCardEsse[this.compActiveCardIndex] ?? null)
                this.bcsContainer.add(newBcsSlot);
                this.bcsCompSlotCon = newBcsSlot;

                // Card Changing animation:
                this.tweens.add({
                    targets: newBcsSlot, scaleX: 1.06, scaleY: 1.06, 
                    duration: 220, yoyo: true, ease: 'Back.easeOut', 
                });

                // Rebuild CDS comp deck: 
                this.cdsCompDeckCon.removeAll(true); 
                this.cdsCompDeckCon.destroy(); 
                const newDeckCon = this.add.container(0,0); 
                this._buildDeckCards(newDeckCon, this._getCompDeckCards(), 'comp', this.bcsPanelW, this.cdsCardAreaCY); 
                this.cdsContainer.add(newDeckCon); 
                this.cdsCompDeckCon = newDeckCon; 
            }
            
            this.compSwapMeter++; 
            // Check the swap meter: 
            if (this.compSwapMeter === 2)
            {
                this.compSwapMeter = 0;
                this.compSwapState = 'Basic Tempo';  
                this.confidenceSwapPts = 5;
            }
        }
    }

    // NOTE: Will organize later. 
    // _readPlayerCardSwapPattern(): ...
    _readPlayerCardSwapPattern(){
        let cardSwapArr = [];
        let cateArr = [];
        let newCate = null;
        let testCates = [
            { from: 'Supra', to: 'Fere' },
            { from: 'Supra', to: 'Bonum' },
            { from: 'Fere', to: 'Supra' },
            { from: 'Fere', to: 'Bonum' },
            { from: 'Bonum', to: 'Supra' },
            { from: 'Bonum', to: 'Fere' },
            { from: 'Bonum', to: 'Bonum' }, 
        ];
        let patterns = [];

        // You could test these category swaps: 
        // From: Supra, to: Fere
        // From: Supra, to: Bonum
        // From: Fere, to: Supra
        // From: Fere, to: Bonum
        // From: Bonum, to: Supra
        // From: Bonum, to: Fere
        // From: Bonum, to: Bonum

        // WGO: The computer will try to find a consistent pattern:
        // Once pattern is found, reset the scan to start reading at that pattern. 
        for (const key in computerAuditSystem.playerPatternCardSwaps){

            cardSwapArr.push(computerAuditSystem.playerPatternCardSwaps[key]);

            cateArr.push({
                from: computerAuditSystem.playerPatternCardSwaps[key].from.cate,
                to: computerAuditSystem.playerPatternCardSwaps[key].to.cate,
                attkCard: computerAuditSystem.playerPatternCardSwaps[key].attkCard.cate || computerAuditSystem.playerPatternCardSwaps[key].attkCard, 
                cardAttked: computerAuditSystem.playerPatternCardSwaps[key].cardAttked.cate || computerAuditSystem.playerPatternCardSwaps[key].cardAttked,
            }); 
        }

        // Phase 2: Test out the swap cates with Player swap cates: 
        testCates.forEach((test) => {
            cateArr.forEach((cate, index) => {
                if (index % 2 === 0)
                {
                    if (cate.from === test.from && cate.to === test.to)
                    {
                        patterns.push({ from: cate.from, to: cate.to, match: true, attkCard: cate.attkCard, cardAttked: cate.cardAttked });
                    }
                }
                else
                {
                    if (cate.to === test.from && cate.from === test.to)
                    {
                        patterns.push({ from: cate.from, to: cate.to, match: true, attkCard: cate.attkCard, cardAttked: cate.cardAttked }); 
                    }
                }
            });
        });
        
        // Phase 3: Test the patterns array when the length is 9:
        if (patterns.length === 10)
        {
            // Reset the 'Swap Auditing' values:
            computerAuditSystem.playerTotalCardSwaps = 0;
            computerAuditSystem.playerPatternCardSwaps = {};  

            patterns.forEach((p) => {
                if (p.attkCard === 'Supra') // Attacks with cards
                {
                    this.playerAttksWithSupra++; 
                    computerAuditSystem.playerAttksWithSupraTotal += 1; 
                }
                else if (p.attkCard === 'Fere')
                {
                    this.playerAttksWithFere++;
                    computerAuditSystem.playerAttksWithFereTotal += 1;
                }
                else if (p.attkCard === 'Bonum')
                {
                    this.playerAttksWithBonum++;
                    computerAuditSystem.playerAttksWithBonumTotal += 1; 
                }

                if (p.cardAttked === 'Supra') // Card attacked
                {
                    this.playerSupraAttked++;
                    computerAuditSystem.playerSupraAttkedTotal += 1;
                }
                else if (p.cardAttked === 'Fere')
                {
                    this.playerFereAttked++; 
                    computerAuditSystem.playerFereAttkedTotal += 1;
                }
                else if (p.cardAttked === 'Bonum')
                {
                    this.playerBonumAttked++;
                    computerAuditSystem.playerBonumAttkedTotal += 1;
                }
            });

            if (this.playerAttksWithSupra >= 4 && this.playerSupraAttked === 0)
            {
                this.compSwapState = 'High Protection For Supra';  
                this.playerAttksWithSupra = 0;
                this.playerSupraAttked = 0;
            }
            else if (this.playerAttksWithSupra >= 3 && this.playerSupraAttked >= 2)
            {
                this.compSwapState = 'Average Protection For Supra';
                this.playerAttksWithSupra = 0; 
                this.playerSupraAttked = 0; 
            }
            else if (this.playerAttksWithSupra <= 1 && this.playerSupraAttked >= 2)
            {
                this.compSwapState = 'Low Protection For Supra'; 
                this.playerAttksWithSupra = 0;
                this.playerSupraAttked = 0;  
            }
        }
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
        attackBg.on('pointerdown', () => this._playerAttack()); // Base Move

        defendBg.on('pointerover', () => defendBg.setFillStyle(0x2a2200, 0.95));
        defendBg.on('pointerout',  () => defendBg.setFillStyle(0x1a1400, 0.90));
        defendBg.on('pointerdown', () => this._playerDefend()); // Base Move

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

        // --- Determine the style of the 'Attack' ---
        // (1) 'Basic Attack' 
        // (2) 'Basic Attack' + 'Singularity Card'
        if (this.playerSingularityCardUse.cardObj !== null)
        {
            // ... 'Basic Attack' + 'Singularity Card' ... 
            if (this.playerSingularityCardUse.cardName === 'NOVA BURST')
            {
                // NOVA BURST: +2x ATK on the next Strike: 
                this._setControlButtonsActive(false); 
                this._resolveAttack('player');

                this.time.delayedCall(800, () => this._resolveAttack('player'));
            }
        }
        else
        {
            // ... 'Basic Attack' ... 
            this._setControlButtonsActive(false); 
            this._resolveAttack('player');
        }
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

    // _compTurn(): The official 'Computer Turn'. 
    _compTurn(){
        // |Computer Auditing System for Computer Intelligence|
        /** Audits completed outside of this function:
         * -- Active Card Audit -- 
         */

        // Note: Default Difficulty will be Easy for now.
        let defaultDifficulty = 'easy';
        computerAuditSystem.gameDifficulty = defaultDifficulty;

        // -- Singularity Point Audit --
        computerAuditSystem.currentCompSp = this.singularityPointStock.compPoints;
        computerAuditSystem.currentPlayerSp = this.singularityPointStock.playerPoints; 

        // -- Previous Move Type Audit --
        computerAuditSystem.previousPlayerMove = this.playerPreviousMove; 
        computerAuditSystem.previousCompMove = this.compPreviousMove;

        // -- Essence Audit (Esse: Health Audit) by Battle Cate and Battle Card Name -- 
        // cKey => |Cate Key| such as Supra, Fere, and Bonum.
        // cValue => |Category Value| such as Initiator Card like Tobo and Spunky. 
        // eKey => |Esse Key| such as Supra, Fere, and Bonum.
        // eValue => |Esse Value| such as current number of esse. 
        computerAuditSystem.playerCardDeckEsse = {};
        for (const[cKey, cValue] of Object.entries(this.playerSelectedCards)){
            for(const[eKey, eValue] of Object.entries(this.playerCardEsse)){
                if (cKey === eKey)
                {
                    const esseCardObj = { esse: eValue, name: cValue.name };
                    computerAuditSystem.playerCardDeckEsse[cKey] = { esseCardObj };
                }
            }
        }

        computerAuditSystem.compCardDeckEsse.length = 0; 
        this.compCardEsse.forEach((esse, index) => {
            const esseCardObj = { esse: esse, name: this.compAllCards[index].name };
            computerAuditSystem.compCardDeckEsse.push(esseCardObj); 
        });

        console.log('\n'); // Testing
        console.log('--------------'); // Testing
        console.log('ESSE LOG'); // Testing
        console.log('Player Active Key: ', this.playerActiveCardKey); // Testing
        console.log('Computer Active Card Index: ', this.compActiveCardIndex); // Testing
        console.log('Comp Cards: ', this.compAllCards); // Testing 
        console.log(`Multipliers: 0:${0} 1/2:${(1/2).toFixed(2)} 2/3:${(2/3).toFixed(2)} 3/4:${(3/4).toFixed(2)} 1:${1}`); 
        console.log('--------------'); // Testing 
        console.log('\n'); // Testing

        const uAi = new UtilityAI(computerAuditSystem); 
        uAi.gather();

        // -- (Base Attack) Hit Point Audit --
        // if (this.compSwapState === null)
        // {
        //     this._resolveAttack('comp');
        // }

        this._resolveAttack('comp');
    }

    // _resolveAttack(): Will resolve thes players attack:
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
         * 
         * => Singularity Cards Point Bonus: Every Singularity Cards used will 
         * result in extra Singularity Points (SP) gained:
         * -> Nova Burst: Extra 20SP
         */
        
        const attackMultiplierIndex = Math.floor(Math.random() * this.attackMultipliers.length);
        let attackMultiplier = this.attackMultipliers[attackMultiplierIndex];
        attackMultiplier = Number(attackMultiplier.toFixed(2)); 

        let attackWithMultiplier = atkerCard.atk * attackMultiplier;
        attackWithMultiplier = Number(attackWithMultiplier.toFixed(0));

        console.log("Attack Multipler: ", attackMultiplier); // Testing 
        console.log("Attack With Multiplier: ", attackWithMultiplier); // Testing
        console.log("Attack With Multiplier - Defender: ", attackWithMultiplier - dfdrCard.def); // Testing  

        // Call the singularity point store:
        const sp = singularityPointStore.attkMultiplierConversion[attackMultiplierIndex];
        this.addSingularityPoints(isPlayer, sp); 

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

        //COLLECT: Collect attack data for the computerAuditSystem to build computer intelligence:
        if (isPlayer && computerAuditSystem.playerTotalCardSwaps !== 10)
        {
            this.playerPreviousMove = 'attack';
            this.playerPreviousAttkMultiplier = attackMultiplier;
            this.playerPreviousAttkPtWithMultiplier = attackWithMultiplier;

            const entries = Object.entries(computerAuditSystem.playerPatternCardSwaps); 
            entries.forEach((entry, index) => {
                const isLast = index === entries.length - 1; 
            
                if (isLast)
                {
                    computerAuditSystem.playerPatternCardSwaps[index].attkCard = this.playerSelectedCards[this.playerActiveCardKey]; 
                }
            });
        }
        else if (!isPlayer && !computerAuditSystem.playerTotalCardSwaps !== 10)
        {
            this.compPreviousMove = 'attack'; 
            this.compPreviousAttkMultiplier = attackMultiplier; 
            this.compPreviousAttkPtWithMultiplier = attackWithMultiplier;  

            const entries = Object.entries(computerAuditSystem.playerPatternCardSwaps); 
            entries.forEach((entry, index) => {
                const isLast = index === entries.length - 1;

                if (isLast)
                {
                    computerAuditSystem.playerPatternCardSwaps[index].cardAttked = this.playerSelectedCards[this.playerActiveCardKey]; 
                }
            });
        }

        // Reset the 'All Comp and Player Attk Multipliers Array': 
        if (this.allCompAttkMultipliers[0].multipliers.length === 3) this.allCompAttkMultipliers[0].multipliers.length = 0; 
        if (this.allCompAttkMultipliers[1].multipliers.length === 3) this.allCompAttkMultipliers[1].multipliers.length = 0; 
        if (this.allCompAttkMultipliers[2].multipliers.length === 3) this.allCompAttkMultipliers[2].multipliers.length = 0; 

        // COLLECT: ... The Player and Computer Attack Multiplier ...
        if (isPlayer)
        {
            // ... ...  ... 
        }

        if (!isPlayer)
        {
            this.allCompAttkMultipliers.forEach((mul) => {
                if (this.compAllCards[this.compActiveCardIndex].cate === mul.cate)
                {
                    mul.multipliers.push(attackMultiplier);  
                }
            }); 
        }

        // Calculate the computers confidence points:
        // this.calculateCompConfidencePoints(); 

        const applyAndFinish = () => {
            // Note: Might audit damage for the computer audit system (CCI):
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

    // calculateCompConfidencePoints(): Will calculate the computers confidence points: 
    calculateCompConfidencePoints(){
        if (this.moveSelection.player)
        {
            if (this.playerPreviousAttkMultiplier === 0)
            {
                // add .5 x3 confindence points: 
                this.confidenceSwapPts.mainPts += (.5 + .5 + .5 + .5); 
                if (this.confidenceSwapPts.mainPts > 5) this.confidenceSwapPts.mainPts = 5; 
            }
            else if (this.playerPreviousAttkMultiplier === (1/2).toFixed(2))
            {
                // subtract .5 confidence points:
                this.confidenceSwapPts.mainPts -= (.5 + .5 + .5 + .5 + .5); 
                if (this.confidenceSwapPts.mainPts < 0) this.confidenceSwapPts.mainPts = 0;
            }
            else if (this.playerPreviousAttkMultiplier === (2/3).toFixed(2))
            {
                // subtract .5 x2 confidence points:
                this.confidenceSwapPts.mainPts -= (.5 + .5 + .5 + .5 + .5 + .5); 
                if (this.confidenceSwapPts.mainPts < 0) this.confidenceSwapPts.mainPts = 0;
            }
            else if (this.playerPreviousAttkMultiplier === (3/4).toFixed(2))
            {
                // subtract .5 x3 confidence points:
                this.confidenceSwapPts.mainPts -= (.5 + .5 + .5 + .5 + .5 + .5 + .5); 
                if (this.confidenceSwapPts.mainPts < 0) this.confidenceSwapPts.mainPts = 0; 
            }
            else if (this.playerPreviousAttkMultiplier === 1)
            {
                // subtract .5 x4 confidence points:
                this.confidenceSwapPts.mainPts -= (.5 + .5 + .5 + .5 + .5 + .5 + .5 + .5);
                if (this.confidenceSwapPts.mainPts < 0) this.confidenceSwapPts.mainPts = 0; 
            }
        }
        else if (this.moveSelection.comp)
        {
            if (this.compPreviousAttkMultiplier === 0)
            {
                // subtract .5 x3 confidence points:
                this.confidenceSwapPts.mainPts -= (.5 + .5 + .5);
                if (this.confidenceSwapPts.mainPts < 0) this.confidenceSwapPts.mainPts = 0; 
            }
            else if (this.compPreviousAttkMultiplier === (1/2).toFixed(2))
            {
                // add .5 confidence points:
                this.confidenceSwapPts.mainPts += .5;
                if (this.confidenceSwapPts.mainPts > 5) this.confidenceSwapPts.mainPts = 5; 
            }
            else if (this.compPreviousAttkMultiplier === (2/3).toFixed(2))
            {
                // add .5 x2 confidence points:
                this.confidenceSwapPts.mainPts += (.5 + .5); 
                if (this.confidenceSwapPts.mainPts > 5) this.confidenceSwapPts.mainPts = 5;
            }
            else if (this.compPreviousAttkMultiplier === (3/4).toFixed(2))
            {
                // add .5 x3 confidence points:
                this.confidenceSwapPts.mainPts += (.5 + .5 + .5);
                if (this.confidenceSwapPts.mainPts > 5) this.confidenceSwapPts.mainPts = 5;
            }
            else if (this.compPreviousAttkMultiplier === 1)
            {
                // add .5 x4 confidence points:
                this.confidenceSwapPts.mainPts += (.5 + .5 + .5 + .5);
                if (this.confidenceSwapPts.mainPts > 5) this.confidenceSwapPts.mainPts = 5; 
            }
        }
    }

    // addSingularityPoint(): PLayer and computer will gain singularity points from actions.
    addSingularityPoints(isPlayer, sp){
        let spContainer = this.children.getByName('spContainer');
        console.log("SP Container: ", spContainer); // Testing

        let additionalSingularityPoints = 0; 

        const { width }  = this.cameras.main;
        const cx         = width / 2;
        const spPanelW   = 760;
        const spFinalY   = 45;
        const spLocalY   = 13;

        if (isPlayer)
        {
            // 0 sp means the attack was a miss:
            if (sp === 0) return; 

            // Base Attack + Singularity Card will give an additional SP:
            if (this.playerSingularityCardUse.cardObj !== null)
            {
                if (this.playerSingularityCardUse.cardName === 'NOVA BURST' && this.playerSingularityCardUse.turns === 2)
                {
                    additionalSingularityPoints = 20;
                    console.log("Extra Singularity Point from Singularity Card: ", additionalSingularityPoints); // Testing 
                    console.log("spAdded + SP: ", sp + additionalSingularityPoints); // Testing
                    console.log("........................"); // Testing
                    console.log(".................."); // Testing
                    console.log("...."); // Testing 
                }
            }

            console.log("Player gained singularity points: ", sp); // Testing
            this.singularityPointStock.playerPoints += (sp + additionalSingularityPoints);
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

            this.tweens.add({
                targets:  this.playerSPText,
                scaleX:   1.40,
                scaleY:   1.40,
                duration: 190,
                yoyo:     true,
                ease:     'Back.easeOut',
            });

            this._spFlaresBurst(cx - spPanelW / 4, spFinalY + spLocalY, true);
            this._updateSCDSBuyButton();
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

            // 0 sp means the attack was a miss: 
            if (sp === 0) return;

            this.tweens.add({
                targets:  this.compSPText,
                scaleX:   1.40,
                scaleY:   1.40,
                duration: 190,
                yoyo:     true,
                ease:     'Back.easeOut',
            });

            this._spFlaresBurst(cx + spPanelW / 4, spFinalY + spLocalY, false);
            this._compAutobuySingularityCard();
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
            if (this.playerSingularityCardUse.cardObj !== null)
            {
                // NOVA BURST: Will allow the player to attack twice: 
                if (this.playerSingularityCardUse.cardName === 'NOVA BURST')
                {
                    this.playerSingularityCardUse.turns -= 1;
                    if (this.playerSingularityCardUse.turns <= 0)
                    {
                        this.moveSelection.player = false;
                        this.moveSelection.comp   = true;

                        // -- Computer Auditing System --
                        // Audit if the Player or Comp has the next turn:
                        computerAuditSystem.playerMove = this.moveSelection.player;
                        computerAuditSystem.compMove   = this.moveSelection.comp;

                        this.playerSingularityCardUse.cardObj = null;
                        this.playerSingularityCardUse.cardName = null;
                        this.playerSingularityCardUse.desc = null; 
                        this.playerSingularityCardUse.turns = null; 
                        this.time.delayedCall(900, () => this._compTurn()); 
                    }
                    else
                    {
                        this.moveSelection.player = true; 
                        this.moveSelection.comp   = false; 

                    }
                    this.playerBattlePortrait.setDisplaySize(64, 64);
                    this._updateTurnIndicator(); 
                }
            }
            else
            {
                // --- Original Player Turn End Data ---
                this.moveSelection.player = false;
                this.moveSelection.comp   = true;

                // -- Computer Auditing System --
                // Audit if the Player or Comp has the next turn:
                computerAuditSystem.playerMove = this.moveSelection.player;
                computerAuditSystem.compMove   = this.moveSelection.comp;

                this.playerBattlePortrait.setDisplaySize(64, 64); 
                this._updateTurnIndicator();

                // Change the current 'Comp Swap State' if needed: 
                if (this.compSwapState === 'Basic Tempo') this.swapToAttackTimeFrame.timeFrame = this.swapToAttackTimeFrame.basicTempoTime;
                else if (this.compSwapState === 'High Protection For Supra') this.swapToAttackTimeFrame.timeFrame = this.swapToAttackTimeFrame.protectSupraHighTime;
                this.time.delayedCall(this.swapToAttackTimeFrame.timeFrame, () => this._compTurn());
            }

        } else {
            this.compDefending        = false;
            this.playerDefending      = false;
            this.moveSelection.comp   = false;
            this.moveSelection.player = true;

            // -- Computer Auditing System --
            // Audit if the Player or Comp has the next turn:
            computerAuditSystem.compMove = this.moveSelection.comp;
            computerAuditSystem.playerMove = this.moveSelection.player;

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

    // singularityCardDeckStation(): Holds up to 3 purchased Singularity Cards for each side.
    // Buy button activates at ≥ 200 SP; deactivates when all 3 slots are occupied.
    singularityCardDeckStation(){
        // Note: New 'Singularity Cards have been added in the 'singularityCard.js' file. 
        // this.SINGULARITY_CARDS = [
        //     { id: 'nova_burst',     name: 'NOVA BURST',     cost: 200, color: 0xff4400, glow: 0xff8800, desc: '+2× ATK on next strike',  icon: '★' },
        //     { id: 'void_shield',    name: 'VOID SHIELD',    cost: 250, color: 0x0055ff, glow: 0x00aaff, desc: 'Halve incoming damage',    icon: '◈' },
        //     { id: 'stellar_mend',   name: 'STELLAR MEND',   cost: 300, color: 0x00ffcc, glow: 0x88ffdd, desc: 'Restore +30 ESSE',         icon: '✦' },
        //     { id: 'quantum_strike', name: 'QUANTUM STRIKE', cost: 400, color: 0xbb00ff, glow: 0xee44ff, desc: 'Guaranteed critical hit',  icon: '⚡' },
        // ];

        this.scdsPlayerSlots    = [null, null, null];
        this.scdsCompSlots      = [null, null, null];
        this.scdsShopOpen       = false;
        this.scdsShopContainer  = null;
        this.scdsBuyBtn         = null;
        this.scdsBuyBtnIcon     = null;
        this.scdsBuyBtnLabel    = null;
        this.scdsBuyBtnTween    = null;
        this.scdsPlayerSlotCons = [];
        this.scdsCompSlotCons   = [];

        const { width }  = this.cameras.main;
        const cx         = width / 2;
        const csBottom   = 524;
        const panelW     = 760;
        const panelH     = 140;
        const finalY     = csBottom + 8 + panelH / 2;   // 602
        const headerY    = -panelH / 2 + 14;            // -56
        const headerDivY = -panelH / 2 + 32;            // -38
        const slotAreaCY = Math.round((headerDivY + panelH / 2) / 2);  // 16

        this.scdsContainer  = this.add.container(cx, -(panelH + 20));
        this.scdsPanelW     = panelW;
        this.scdsSlotAreaCY = slotAreaCY;

        // ── Glass body ─────────────────────────────────────────────────────
        const panelBody  = this.add.rectangle(0, 0, panelW, panelH, 0x060010, 0.38).setOrigin(0.5);
        const innerGlow  = this.add.ellipse(0, 0, panelW * 0.70, panelH * 0.60, 0x110022, 0.18);
        const sheen      = this.add.rectangle(0, -panelH / 2 + 8, panelW - 20, 12, 0xccaaff, 0.07).setOrigin(0.5);
        const tintH      = panelH - 44;
        const playerTint = this.add.rectangle(-panelW / 4, slotAreaCY, panelW / 2 - 8, tintH, 0x0d0022, 0.25).setOrigin(0.5);
        const compTint   = this.add.rectangle( panelW / 4, slotAreaCY, panelW / 2 - 8, tintH, 0x15000f, 0.25).setOrigin(0.5);

        // ── Border & corners (purple/gold theme) ───────────────────────────
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0xaa44ff, 0.72);
        borderG.strokeRect(-panelW / 2, -panelH / 2, panelW, panelH);
        borderG.lineStyle(1, 0xffdd00, 0.28);
        borderG.strokeRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, panelH - 8);

        const cornerG = this.add.graphics();
        const cLen = 14;
        [
            [-panelW / 2, -panelH / 2,  1,  1],
            [ panelW / 2, -panelH / 2, -1,  1],
            [-panelW / 2,  panelH / 2,  1, -1],
            [ panelW / 2,  panelH / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.lineStyle(3, 0xdd88ff, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cLen, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cLen);
            cornerG.strokePath();
            cornerG.fillStyle(0xdd88ff, 1.0);
            cornerG.fillCircle(x, y, 3);
        });

        // ── Header ─────────────────────────────────────────────────────────
        const stationLabel = this.add.text(0, headerY, 'SINGULARITY CARD DECK STATION', {
            fontFamily: 'monospace', fontSize: '9px', color: '#cc99ff',
        }).setOrigin(0.5).setAlpha(0.65);

        const scdsIcon = this.add.text(0, headerY + 12, '◆  SCDS  ◆', {
            fontFamily: 'monospace', fontSize: '9px', color: '#ffdd00',
        }).setOrigin(0.5);
        this.tweens.add({ targets: scdsIcon, alpha: 0.30, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        const playerLabel = this.add.text(-panelW / 4, headerY, 'PLAYER', {
            fontFamily: 'monospace', fontSize: '11px', color: '#cc88ff',
            stroke: '#0a0011', strokeThickness: 2,
        }).setOrigin(0.5);

        const compLabel = this.add.text(panelW / 4, headerY, 'COMPUTER', {
            fontFamily: 'monospace', fontSize: '11px', color: '#ff66cc',
            stroke: '#110008', strokeThickness: 2,
        }).setOrigin(0.5);

        const headerDivG = this.add.graphics();
        headerDivG.lineStyle(1, 0xaa44ff, 0.22);
        headerDivG.beginPath();
        headerDivG.moveTo(-panelW / 2 + 20, headerDivY);
        headerDivG.lineTo( panelW / 2 - 20, headerDivY);
        headerDivG.strokePath();

        const centerDivG = this.add.graphics();
        centerDivG.lineStyle(1, 0xaa44ff, 0.25);
        centerDivG.beginPath();
        centerDivG.moveTo(0, headerDivY + 4);
        centerDivG.lineTo(0, panelH / 2 - 6);
        centerDivG.strokePath();

        this.scdsContainer.add([
            panelBody, innerGlow, sheen, playerTint, compTint,
            borderG, cornerG,
            stationLabel, scdsIcon, playerLabel, compLabel,
            headerDivG, centerDivG,
        ]);

        this._buildSCDSSlotRow('player');
        this._buildSCDSSlotRow('comp');
        this._buildSCDSBuyButton();

        this.tweens.add({
            targets:  this.scdsContainer,
            y:        finalY,
            duration: 700,
            ease:     'Back.easeOut',
            delay:    750,
        });
    }

    // _buildSCDSSlotRow(): Renders 3 singularity card slots for the given side.
    _buildSCDSSlotRow(side){
        const isPlayer    = side === 'player';
        const panelW      = this.scdsPanelW;
        const cy          = this.scdsSlotAreaCY;
        const accentColor = isPlayer ? 0xaa44ff : 0xff44cc;
        const slots       = isPlayer ? this.scdsPlayerSlots : this.scdsCompSlots;
        const slotW       = 62;
        const slotH       = 58;

        // Destroy existing slot sub-containers
        const existing = isPlayer ? this.scdsPlayerSlotCons : this.scdsCompSlotCons;
        existing.forEach(c => { if (c?.active) { c.removeAll(true); c.destroy(); } });
        if (isPlayer) this.scdsPlayerSlotCons = [];
        else          this.scdsCompSlotCons   = [];

        // Slot X positions — player: left of center divider; comp: right
        const playerXs = [-310, -238, -166];
        const compXs   = [ 166,  238,  310];
        const slotXs   = isPlayer ? playerXs : compXs;
        const conList  = isPlayer ? this.scdsPlayerSlotCons : this.scdsCompSlotCons;

        for (let i = 0; i < 3; i++){
            const slotCon = this.add.container(0, 0);
            const card    = slots[i];
            const sx      = slotXs[i];
            const sy      = cy;

            // Slot background
            const slotBg = this.add.rectangle(sx, sy, slotW, slotH, 0x060012, 0.76).setOrigin(0.5);
            slotBg.setStrokeStyle(1.5, accentColor, card ? 0.80 : 0.28);

            // Corner dashes
            const slotG = this.add.graphics();
            const dl    = 9;
            [
                [sx - slotW / 2, sy - slotH / 2,  1,  1],
                [sx + slotW / 2, sy - slotH / 2, -1,  1],
                [sx - slotW / 2, sy + slotH / 2,  1, -1],
                [sx + slotW / 2, sy + slotH / 2, -1, -1],
            ].forEach(([cx2, cy2, hd, vd]) => {
                slotG.lineStyle(2, accentColor, card ? 0.85 : 0.30);
                slotG.beginPath();
                slotG.moveTo(cx2 + hd * dl, cy2);
                slotG.lineTo(cx2, cy2);
                slotG.lineTo(cx2, cy2 + vd * dl);
                slotG.strokePath();
            });

            slotCon.add([slotBg, slotG]);

            if (card){
                const hexC = '#' + card.color.toString(16).padStart(6, '0');

                // Pulsing aura
                const aura = this.add.ellipse(sx, sy, slotW + 14, slotH + 14, card.glow, 0.13);
                this.tweens.add({
                    targets: aura, alpha: 0.25, scaleX: 1.12, scaleY: 1.12,
                    duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                });

                const iconT = this.add.text(sx, sy - 11, card.icon, {
                    fontFamily: 'monospace', fontSize: '20px', color: hexC,
                }).setOrigin(0.5);

                const nameT = this.add.text(sx, sy + 14, card.name.split(' ')[0], {
                    fontFamily: 'monospace', fontSize: '6.5px', color: '#ddbbff',
                }).setOrigin(0.5);

                slotCon.add([aura, iconT, nameT]);

                console.log("Singularity Card Ready: ", card); // Testing
                for(const key in card){
                    console.log(card[key]); // Testing 
                }
                
                // If the ...
                if (isPlayer){
                    const clickableSlot = slotCon.list[0];
                    clickableSlot.setInteractive({ useHandCursor: true }); 
                    clickableSlot.on('pointerdown', () => {
                        this._useSingularityCard('Player', card, slotCon);
                    });
                }
                else
                {
                    // ... Computer intelligence (AI) for using their Singularity Cards ...
                    // ... Determine if the computer needs to use one of their Singularity Cards ...
                    this._useSingularityCard('Comp', card, slotCon); 
                }

            } else {
                const emptyT = this.add.text(sx, sy, '—', {
                    fontFamily: 'monospace', fontSize: '16px', color: '#2a1a44',
                }).setOrigin(0.5);
                slotCon.add(emptyT);
            }

            this.scdsContainer.add(slotCon);
            conList.push(slotCon);
        }
    }

    // _buildSCDSBuyButton(): Constructs the player-side Buy button.
    _buildSCDSBuyButton(){
        const cy     = this.scdsSlotAreaCY;
        const btnX   = -72;
        const btnW   = 74;
        const btnH   = 56;
        const canBuy = this.singularityPointStock.playerPoints >= 200
                    && this.scdsPlayerSlots.some(s => s === null);

        const btnBg = this.add.rectangle(btnX, cy, btnW, btnH, canBuy ? 0x220044 : 0x0a0010, 0.92).setOrigin(0.5);
        btnBg.setStrokeStyle(2, canBuy ? 0xaa44ff : 0x332244, canBuy ? 0.85 : 0.30);

        const btnIcon = this.add.text(btnX, cy - 13, '◆', {
            fontFamily: 'monospace', fontSize: '14px', color: canBuy ? '#dd88ff' : '#331144',
        }).setOrigin(0.5);

        const btnLabel = this.add.text(btnX, cy + 5, 'BUY', {
            fontFamily: 'monospace', fontSize: '12px', color: canBuy ? '#cc88ff' : '#331144',
        }).setOrigin(0.5);

        const costHint = this.add.text(btnX, cy + btnH / 2 + 6, '≥ 200 SP', {
            fontFamily: 'monospace', fontSize: '7px', color: '#442266',
        }).setOrigin(0.5);

        this.scdsBuyBtn      = btnBg;
        this.scdsBuyBtnIcon  = btnIcon;
        this.scdsBuyBtnLabel = btnLabel;

        if (canBuy){
            btnBg.setInteractive({ useHandCursor: true });
            btnBg.on('pointerover', () => btnBg.setFillStyle(0x3a0066, 0.95));
            btnBg.on('pointerout',  () => btnBg.setFillStyle(0x220044, 0.92));
            btnBg.on('pointerdown', () => this._openSingularityShop());
            this.scdsBuyBtnTween = this.tweens.add({
                targets: btnBg, alpha: 0.72, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            });
        }

        this.scdsContainer.add([btnBg, btnIcon, btnLabel, costHint]);
    }

    // _updateSCDSBuyButton(): Enables or disables the Buy button based on SP and available slots.
    _updateSCDSBuyButton(){
        if (!this.scdsBuyBtn) return;
        const canBuy = this.singularityPointStock.playerPoints >= 200
                    && this.scdsPlayerSlots.some(s => s === null);

        if (canBuy){
            this.scdsBuyBtn.setFillStyle(0x220044, 0.92);
            this.scdsBuyBtn.setStrokeStyle(2, 0xaa44ff, 0.85);
            this.scdsBuyBtn.setAlpha(1.0);
            this.scdsBuyBtn.setInteractive({ useHandCursor: true });
            this.scdsBuyBtn.off('pointerover').off('pointerout').off('pointerdown');
            this.scdsBuyBtn.on('pointerover', () => this.scdsBuyBtn.setFillStyle(0x3a0066, 0.95));
            this.scdsBuyBtn.on('pointerout',  () => this.scdsBuyBtn.setFillStyle(0x220044, 0.92));
            this.scdsBuyBtn.on('pointerdown', () => this._openSingularityShop());
            if (this.scdsBuyBtnIcon)  this.scdsBuyBtnIcon.setColor('#dd88ff');
            if (this.scdsBuyBtnLabel) this.scdsBuyBtnLabel.setColor('#cc88ff');
            if (!this.scdsBuyBtnTween || !this.scdsBuyBtnTween.isPlaying()){
                this.scdsBuyBtnTween = this.tweens.add({
                    targets: this.scdsBuyBtn, alpha: 0.72, duration: 1000,
                    yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                });
            }
        } else {
            this.scdsBuyBtn.removeInteractive();
            this.scdsBuyBtn.setFillStyle(0x0a0010, 0.92);
            this.scdsBuyBtn.setStrokeStyle(2, 0x332244, 0.30);
            this.scdsBuyBtn.setAlpha(0.50);
            if (this.scdsBuyBtnIcon)  this.scdsBuyBtnIcon.setColor('#331144');
            if (this.scdsBuyBtnLabel) this.scdsBuyBtnLabel.setColor('#331144');
            if (this.scdsBuyBtnTween){
                this.scdsBuyBtnTween.stop();
                this.scdsBuyBtnTween = null;
                this.scdsBuyBtn.setAlpha(0.50);
            }
        }
    }

    // _openSingularityShop(): Slides in a beautiful cosmic purchase window from the right.
    _openSingularityShop(){
        if (this.scdsShopOpen) return;
        this.scdsShopOpen = true;

        const { width, height } = this.cameras.main;
        const cx = width  / 2;
        const cy = height / 2;

        const shopW = 700;
        const shopH = 480;

        const shopCon = this.add.container(width + shopW, cy);
        this.scdsShopContainer = shopCon;

        // ── Layered cosmic background ───────────────────────────────────────
        const backdrop = this.add.rectangle(0, 0, shopW, shopH, 0x06001a, 0.97).setOrigin(0.5);
        const neb1     = this.add.ellipse(-90, -65, 430, 200, 0x4400bb, 0.09);
        const neb2     = this.add.ellipse( 70,  75, 370, 170, 0xbb0066, 0.07);
        const neb3     = this.add.ellipse(  0, -20, 210, 120, 0x0044cc, 0.06);

        // Interior starfield
        const starG = this.add.graphics();
        for (let i = 0; i < 52; i++){
            const sx    = Phaser.Math.Between(-shopW / 2 + 8, shopW / 2 - 8);
            const sy    = Phaser.Math.Between(-shopH / 2 + 8, shopH / 2 - 8);
            const alpha = Math.random() * 0.35 + 0.08;
            const r     = Math.random() > 0.78 ? 1.5 : 1;
            starG.fillStyle(0xffffff, alpha);
            starG.fillCircle(sx, sy, r);
        }

        // ── Borders & glow ─────────────────────────────────────────────────
        const ambGlow = this.add.rectangle(0, 0, shopW + 30, shopH + 30, 0xaa44ff, 0.07).setOrigin(0.5);

        const borderG = this.add.graphics();
        borderG.lineStyle(3, 0xaa44ff, 0.90);
        borderG.strokeRect(-shopW / 2, -shopH / 2, shopW, shopH);
        borderG.lineStyle(1, 0xffdd00, 0.32);
        borderG.strokeRect(-shopW / 2 + 6, -shopH / 2 + 6, shopW - 12, shopH - 12);
        borderG.lineStyle(1, 0xaa44ff, 0.14);
        borderG.strokeRect(-shopW / 2 + 11, -shopH / 2 + 11, shopW - 22, shopH - 22);

        // Gem corner accents
        const cornerG = this.add.graphics();
        const cL = 24;
        [
            [-shopW / 2, -shopH / 2,  1,  1],
            [ shopW / 2, -shopH / 2, -1,  1],
            [-shopW / 2,  shopH / 2,  1, -1],
            [ shopW / 2,  shopH / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            cornerG.fillStyle(0xaa44ff, 0.22);
            cornerG.fillCircle(x, y, 11);
            cornerG.lineStyle(4, 0xdd88ff, 1.0);
            cornerG.beginPath();
            cornerG.moveTo(x + hd * cL, y);
            cornerG.lineTo(x, y);
            cornerG.lineTo(x, y + vd * cL);
            cornerG.strokePath();
            cornerG.fillStyle(0xffffff, 1.0);
            cornerG.fillCircle(x, y, 4.5);
        });

        // ── Title bar ──────────────────────────────────────────────────────
        const titleBarBg = this.add.rectangle(0, -shopH / 2 + 30, shopW - 14, 48, 0x15003a, 0.90).setOrigin(0.5);

        const titleText = this.add.text(0, -shopH / 2 + 21, '✦  SINGULARITY CARD SHOP  ✦', {
            fontFamily: 'monospace', fontSize: '18px', color: '#ee99ff',
            stroke: '#0a001a', strokeThickness: 4,
        }).setOrigin(0.5);
        this.tweens.add({ targets: titleText, alpha: 0.72, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        const titleSub = this.add.text(0, -shopH / 2 + 41, `PLAYER SP: ${this.singularityPointStock.playerPoints}   ·   Choose a card to purchase`, {
            fontFamily: 'monospace', fontSize: '9.5px', color: '#7744aa',
        }).setOrigin(0.5);

        const titleDivG = this.add.graphics();
        titleDivG.lineStyle(1, 0xaa44ff, 0.30);
        titleDivG.beginPath();
        titleDivG.moveTo(-shopW / 2 + 18, -shopH / 2 + 57);
        titleDivG.lineTo( shopW / 2 - 18, -shopH / 2 + 57);
        titleDivG.strokePath();

        // Close button (top-right)
        const closeBtn = this.add.text(shopW / 2 - 22, -shopH / 2 + 18, '✕', {
            fontFamily: 'monospace', fontSize: '16px', color: '#773399',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerover', () => closeBtn.setColor('#ff55ff'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#773399'));
        closeBtn.on('pointerdown', () => this._closeSingularityShop());

        shopCon.add([
            backdrop, neb1, neb2, neb3, starG, ambGlow,
            borderG, cornerG,
            titleBarBg, titleText, titleSub, titleDivG,
            closeBtn,
        ]);

        // ── Card grid (scrollable, 4 per row) ──────────────────────────────
        const cardsPerRow  = 4;
        const cardW        = 130;
        const cardH        = 200;
        const colGap       = 14;
        const rowGap       = 16;

        const scrollViewTop = -shopH / 2 + 62;
        const scrollViewBot =  shopH / 2 - 30;
        const viewH         = scrollViewBot - scrollViewTop;

        const nRows      = Math.ceil(STORE_CARDS.length / cardsPerRow);
        const rowW       = cardsPerRow * cardW + (cardsPerRow - 1) * colGap;
        const totalGridH = nRows * cardH + (nRows - 1) * rowGap;
        const maxScroll  = Math.max(0, totalGridH - viewH);

        let scrollOffset = 0;

        const scrollCon = this.add.container(0, 0);

        STORE_CARDS.forEach((def, i) => {
            const col = i % cardsPerRow;
            const row = Math.floor(i / cardsPerRow);

            const lx = -rowW / 2 + cardW / 2 + col * (cardW + colGap);
            const ly = scrollViewTop + cardH / 2 + row * (cardH + rowGap);

            const canAfford = this.singularityPointStock.playerPoints >= def.cost;
            const hexC      = '#' + def.color.toString(16).padStart(6, '0');

            const cc = this.add.container(lx, ly);

            // Outer glow ellipse
            const glowE = this.add.ellipse(0, 0, cardW + 22, cardH + 22, def.glow, canAfford ? 0.13 : 0.03);
            if (canAfford){
                this.tweens.add({
                    targets: glowE, scaleX: 1.10, scaleY: 1.10, alpha: 0.24,
                    duration: 1200 + i * 160, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                });
            }

            // Card body
            const cb = this.add.rectangle(0, 0, cardW, cardH, 0x0c001f, canAfford ? 0.96 : 0.70).setOrigin(0.5);
            cb.setStrokeStyle(2, def.color, canAfford ? 0.80 : 0.22);

            // Colored top band
            const tb = this.add.rectangle(0, -cardH / 2 + 22, cardW, 40, def.color, canAfford ? 0.28 : 0.07).setOrigin(0.5);

            // Large icon
            const iconT = this.add.text(0, -cardH / 2 + 22, def.icon, {
                fontFamily: 'monospace', fontSize: '28px', color: canAfford ? hexC : '#282828',
            }).setOrigin(0.5);

            // Card name
            const nameT = this.add.text(0, -cardH / 2 + 56, def.name, {
                fontFamily: 'monospace', fontSize: '8px', color: canAfford ? '#eeddff' : '#282828',
                align: 'center', wordWrap: { width: cardW - 10 },
            }).setOrigin(0.5);

            // Thin divider
            const cdiv = this.add.graphics();
            cdiv.lineStyle(1, def.color, canAfford ? 0.35 : 0.10);
            cdiv.beginPath();
            cdiv.moveTo(-cardW / 2 + 8, -cardH / 2 + 70);
            cdiv.lineTo( cardW / 2 - 8, -cardH / 2 + 70);
            cdiv.strokePath();

            // Description
            const descT = this.add.text(0, -cardH / 2 + 108, def.desc, {
                fontFamily: 'monospace', fontSize: '7.5px', color: canAfford ? '#ccaaee' : '#1e1e1e',
                align: 'center', wordWrap: { width: cardW - 12 },
            }).setOrigin(0.5);

            // Cost badge
            const costBg = this.add.rectangle(0, cardH / 2 - 48, cardW - 20, 24, def.color, canAfford ? 0.22 : 0.07).setOrigin(0.5);
            costBg.setStrokeStyle(1, def.color, canAfford ? 0.55 : 0.12);
            const costT = this.add.text(0, cardH / 2 - 48, `${def.cost} SP`, {
                fontFamily: 'monospace', fontSize: '11px', color: canAfford ? '#ffdd00' : '#282828',
            }).setOrigin(0.5);

            // Purchase button
            const pbg = this.add.rectangle(0, cardH / 2 - 20, cardW - 20, 24, canAfford ? 0x280050 : 0x0d0d0d, canAfford ? 0.94 : 0.60).setOrigin(0.5);
            pbg.setStrokeStyle(1.5, canAfford ? 0xaa44ff : 0x1a1a1a, canAfford ? 0.85 : 0.20);
            const plabel = this.add.text(0, cardH / 2 - 20, canAfford ? 'PURCHASE' : 'LOCKED', {
                fontFamily: 'monospace', fontSize: '9px', color: canAfford ? '#cc88ff' : '#252525',
            }).setOrigin(0.5);

            if (canAfford){
                pbg.setInteractive({ useHandCursor: true });
                pbg.on('pointerover', () => {
                    pbg.setFillStyle(0x4a0088, 0.96);
                    this.tweens.add({ targets: cc, y: ly - scrollOffset - 6, duration: 100, ease: 'Power2' });
                });
                pbg.on('pointerout', () => {
                    pbg.setFillStyle(0x280050, 0.94);
                    this.tweens.add({ targets: cc, y: ly - scrollOffset, duration: 100, ease: 'Power2' });
                });
                pbg.on('pointerdown', () => this._buySingularityCard(def));
            }

            cc.add([glowE, cb, tb, iconT, nameT, cdiv, descT, costBg, costT, pbg, plabel]);
            scrollCon.add(cc);
        });

        shopCon.add(scrollCon);

        // Scroll hint arrows (visible only when content overflows)
        if (maxScroll > 0){
            const hintT = this.add.text(shopW / 2 - 14, 0, '▲\n▼', {
                fontFamily: 'monospace', fontSize: '9px', color: '#553377',
                align: 'center', lineSpacing: 10,
            }).setOrigin(0.5);
            shopCon.add(hintT);
        }

        // Mouse-wheel scrolling
        const onWheel = (pointer, gameObjects, deltaX, deltaY) => {
            if (!this.scdsShopOpen) return;
            scrollOffset = Phaser.Math.Clamp(scrollOffset + deltaY * 0.5, 0, maxScroll);
            scrollCon.list.forEach((cc, i) => {
                const col = i % cardsPerRow;
                const row = Math.floor(i / cardsPerRow);
                const lx  = -rowW / 2 + cardW / 2 + col * (cardW + colGap);
                const ly  = scrollViewTop + cardH / 2 + row * (cardH + rowGap) - scrollOffset;
                cc.setPosition(lx, ly);
            });
        };
        this.input.on('wheel', onWheel);
        this.scdsShopWheelHandler = onWheel;

        // ── Footer strip ───────────────────────────────────────────────────
        const footerBg = this.add.rectangle(0, shopH / 2 - 15, shopW - 14, 24, 0x0c0026, 0.72).setOrigin(0.5);
        const footerT  = this.add.text(0, shopH / 2 - 15, 'Cards fill deck slots — Buy button re-enables when a slot opens', {
            fontFamily: 'monospace', fontSize: '7.5px', color: '#442266',
        }).setOrigin(0.5);
        shopCon.add([footerBg, footerT]);

        this.children.bringToTop(shopCon);

        // Clip mask uses world coords (not inside any container) so Phaser's stencil aligns correctly.
        // Created off display-list so it is never rendered visually.
        const maskG = this.make.graphics({ add: false });
        maskG.fillStyle(0xffffff, 1);
        maskG.fillRect(cx - shopW / 2 + 14, cy + scrollViewTop, shopW - 28, viewH);
        this.scdsShopMaskG = maskG;

        // Slide in, then apply mask once the container is at its final world position
        this.tweens.add({
            targets:    shopCon,
            x:          cx,
            duration:   650,
            ease:       'Back.easeOut',
            onComplete: () => {
                if (scrollCon.active) {
                    scrollCon.setMask(maskG.createGeometryMask());
                }
            },
        });
    }

    // _closeSingularityShop(): Slides the shop panel back off screen to the right.
    _closeSingularityShop(){
        if (!this.scdsShopOpen || !this.scdsShopContainer) return;
        const { width } = this.cameras.main;

        if (this.scdsShopWheelHandler){
            this.input.off('wheel', this.scdsShopWheelHandler);
            this.scdsShopWheelHandler = null;
        }

        this.tweens.add({
            targets:    this.scdsShopContainer,
            x:          width + 420,
            duration:   500,
            ease:       'Power2.easeIn',
            onComplete: () => {
                if (this.scdsShopContainer){
                    this.scdsShopContainer.destroy();
                    this.scdsShopContainer = null;
                }
                if (this.scdsShopMaskG){
                    this.scdsShopMaskG.destroy();
                    this.scdsShopMaskG = null;
                }
                this.scdsShopOpen = false;
            },
        });
    }

    // _buySingularityCard(): Deducts SP, fills the first empty player slot, rebuilds UI.
    _buySingularityCard(def){
        const emptyIdx = this.scdsPlayerSlots.findIndex(s => s === null);
        if (emptyIdx === -1 || this.singularityPointStock.playerPoints < def.cost) return;

        this.singularityPointStock.playerPoints -= def.cost;

        // Update the SP display in the SP station
        const spContainer = this.children.getByName('spContainer');
        if (spContainer){
            const spPanelW = 760;
            const old = spContainer.list[9];
            if (old) old.destroy();
            const newTxt = this.add.text(-spPanelW / 4, 13, `${this.singularityPointStock.playerPoints} SP`, {
                fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
                stroke: '#002211', strokeThickness: 4,
            }).setOrigin(0.5);
            spContainer.addAt(newTxt, 9);
            this.playerSPText = newTxt;
        }

        this.scdsPlayerSlots[emptyIdx] = def;
        this._closeSingularityShop();
        this._buildSCDSSlotRow('player');
        this._updateSCDSBuyButton();
    }

    // _compAutobuySingularityCard(): AI purchases the most expensive affordable card when SP allows.
    _compAutobuySingularityCard(){
        if (!SINGULARITY_CARDS || !this.scdsCompSlots) return;

        const emptyIdx = this.scdsCompSlots.findIndex(s => s === null);
        if (emptyIdx === -1) return;

        const affordable = [...STORE_CARDS]
            .filter(def => this.singularityPointStock.compPoints >= def.cost)
            .sort((a, b) => b.cost - a.cost);

        if (affordable.length === 0) return;

        const def = affordable[0];
        this.singularityPointStock.compPoints -= def.cost;

        // Update the SP display in the SP station
        const spContainer = this.children.getByName('spContainer');
        if (spContainer){
            const spPanelW = 760;
            const old = spContainer.list[11];
            if (old) old.destroy();
            const newTxt = this.add.text(spPanelW / 4, 13, `${this.singularityPointStock.compPoints} SP`, {
                fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
                stroke: '#221100', strokeThickness: 4,
            }).setOrigin(0.5);
            spContainer.addAt(newTxt, 11);
            this.compSPText = newTxt;
        }

        this.scdsCompSlots[emptyIdx] = def;
        this._buildSCDSSlotRow('comp');
    }

    // _useSingularityCard(): Will use the singularity card in the battle arena.
    _useSingularityCard(scUser, singularityCard, slotCon){
        if (scUser === 'Player')
        {
            //--------------------------------------------------------------------
            // Empty text for when the player uses a singularity card:
            // const emptyT = this.add.text(sx, sy, '—', {
            //     fontFamily: 'monospace', fontSize: '16px', color: '#2a1a44',
            // }).setOrigin(0.5);
            //--------------------------------------------------------------------

            console.log('Singularity Card Slots Array: ', this.scdsPlayerSlotCons); // Testing 
            console.log('Singularity Card Slots Container: ', this.scdsContainer); // Testing 
            console.log('Singularity Card Slot: ', slotCon); // Testing 
            console.log('Singularity Card For Use: ', singularityCard); // Testing 
            console.log('Singularity Card Used: ', singularityCard.name); // Testing
            if (singularityCard.name === 'NOVA BURST')
            {
                // ...
                let scdsPlayerSlotIndex = 0; 

                // NOVA BURST => Battle card will attack twice for the next attack with any card:
                this.playerSingularityCardUse.cardObj = singularityCard;
                this.playerSingularityCardUse.cardName = singularityCard.name;
                this.playerSingularityCardUse.desc = singularityCard.desc;
                this.playerSingularityCardUse.turns = 2; 

                // Gather the important child objects in the 'Singularity Card Slot Container': 
                const slotBg = slotCon.list[0];
                const slotG = slotCon.list[1]; 
                const sx = slotCon.list[2].x;
                const sy = slotCon.list[2].y;
                const aura = slotCon.list[2]; 
                const iconT = slotCon.list[3];
                const nameT = slotCon.list[4];

                // Find the tween 'Aura' tween and destroy it:
                this.tweens.killTweensOf(aura); 

                // ...
                this.scdsPlayerSlotCons.forEach((slot, index) => {
                    if (slot === slotCon)
                    {
                        console.log('Found!'); // Testing 
                        this.scdsPlayerSlots[index] = null;  
                    }
                });

                // Remove all the previous 'Singularity Card' icons after it has been clicked:
                // slotCon.remove(aura, true); 
                // slotCon.remove(iconT, true);
                // slotCon.remove(nameT, true); 
                this.scdsContainer.removeBetween(16, 23, true);

                this._buildSCDSSlotRow('player');
                this._buildSCDSSlotRow('comp'); 
                
                // Add a new 'Empty' Text object to the 'Singularity Card Slot Container':
                // const emptyT = this.add.text(sx, sy, '—', {
                //     fontFamily: 'monospace', fontSize: '16px', color: '#2a1a44',
                // }).setOrigin(0.5);
                // slotCon.add(emptyT); 
            }
        }
        else if (scUser === 'Comp')
        {
            console.log('Computer might use Singularity Card'); // Testing 
        }
    }

}

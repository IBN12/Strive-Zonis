/** |CardSelectScene.js|
 * Strive: We Are Zonis
 *
 * Deck builder / initiator select. The player fills four slots - Supra, Fere and
 * two Bonum - from the card pool. Hovering a card opens a glass stat panel;
 * selecting one drops its art + a mini ATK / DEF / ESS strip into the deck panel.
 *
 * Two entry modes, passed in via scene data:
 *   - 'single'      : opened from GameSelectScene. Shows START GAME and runs the
 *                     launch cinematic straight into GameBattleScene.
 *   - 'multiplayer' : opened from the Multiplayer hub (Build Deck button or the
 *                     Card Deck Panel). No START GAME - instead a RETURN TO HUB
 *                     button that saves the deck to the 'pvpDeck' registry key
 *                     and hands control back so the hub can showcase it.
 */

import { initiatorCards } from "../models/initiatorCards.js";

export default class CardSelectScene extends Phaser.Scene{
    constructor(){
        super('CardSelectScene');
    }

    init(data){
        this.mode        = (data && data.mode) || 'single';
        this.returnScene = (data && data.returnScene) || 'MultiplayerScene';

        this.selectedCards = {
            Supra:  null,
            Fere:   null,
            Bonum1: null,
            Bonum2: null,
        };

        this.bonumSelectedCount = 0;
        this.numOfCardsSelected = 0;
        this._leaving           = false;

        // Deep copy so selecting a card never mutates the shared model.
        this.availableCards = JSON.parse(JSON.stringify(initiatorCards));
    }

    preload(){
        // Scene backdrop - a character piece, heavily scrimmed behind the glass.
        this.load.image('cardSelectBg', 'assets/backgroundImages/spunky_with_the_funky_draco_con_2.png');

        // Supra characters
        this.load.image('Tobo The Fighter',            'assets/characterImages/tobo_the_fighter_con_1_Re.png');
        this.load.image('Spunky With The Funky Draco', 'assets/characterImages/spunky_with_the_funky_draco_con_1_Re.png');

        // Fere characters
        this.load.image('Allybelle', 'assets/characterImages/allybelle_con_1_Re.png');

        // Bonum characters - art pending; cards fall back to a monogram.
    }

    create(){
        this.cameras.main.fadeIn(900, 0, 0, 0);

        this._buildBackground();
        this._buildTitle();
        this._buildDeckPanel();
        this._buildPoolPanel();
        this._prefillFromRegistry();
        this._buildNavButton();
    }

    // ==========================================================
    // Background
    // ==========================================================
    // _buildBackground(): Character backdrop pushed way down under a cool/warm
    // haze, a flat scrim and a cinematic vignette, then drifting embers on top -
    // the same atmosphere the Multiplayer hub uses.
    _buildBackground(){
        const { width, height } = this.cameras.main;

        this.add.rectangle(0, 0, width, height, 0x0a0f14, 1).setOrigin(0);

        const bg    = this.add.image(width * 0.5, height * 0.46, 'cardSelectBg');
        const cover = Math.max(width / bg.width, height / bg.height) * 1.05;
        bg.setScale(cover).setOrigin(0.5).setAlpha(0.5);

        // Cool slate haze upper-left, warm ember haze lower-right
        this.add.ellipse(width * 0.18, height * 0.20, width * 0.52, height * 0.42, 0x1b3138, 0.40);
        this.add.ellipse(width * 0.85, height * 0.82, width * 0.52, height * 0.52, 0x2a0a0a, 0.32);

        // Flat scrim so the glass panels stay legible over the art
        const scrim = this.add.graphics();
        scrim.fillStyle(0x070c12, 0.52);
        scrim.fillRect(0, 0, width, height);

        // Top / bottom vignette
        const vTop = this.add.graphics();
        vTop.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.6, 0.6, 0, 0);
        vTop.fillRect(0, 0, width, height * 0.22);

        const vBottom = this.add.graphics();
        vBottom.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.65, 0.65);
        vBottom.fillRect(0, height * 0.78, width, height * 0.22);

        // Faint crimson grade to tie the layers together
        this.add.rectangle(0, 0, width, height, 0x330000, 0.05).setOrigin(0);

        this._drawEmbers(width, height);
    }

    // _drawEmbers(): Soft bokeh glows plus fine rising specks, all on looping
    // upward drifts - ported from the Multiplayer hub.
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
            const color = Math.random() > 0.4 ? 0xff6b6b : 0xffd9c2;
            const spark = this.add.circle(x, y, Phaser.Math.Between(1, 3), color, Phaser.Math.FloatBetween(0.35, 0.8));

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

    // _buildTitle(): Scene title with a slow breathing sub-line.
    _buildTitle(){
        const { width } = this.cameras.main;

        this.add.text(width / 2, 46, 'ASSEMBLE YOUR BATTLE DECK', {
            fontFamily:      'monospace',
            fontSize:        '38px',
            color:           '#f5f5f5',
            stroke:          '#dc2626',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const sub = this.add.text(width / 2, 84, 'CHOOSE  •  REVIEW  •  DEPLOY', {
            fontFamily: 'monospace', fontSize: '13px', color: '#5eead4',
        }).setOrigin(0.5).setAlpha(0.85);

        this.tweens.add({
            targets: sub, alpha: 0.45, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
    }

    // ==========================================================
    // Shared glass helpers
    // ==========================================================
    // _categoryDef(): Accent colour + text hex for a card category.
    _categoryDef(cat){
        const map = {
            Supra: { color: 0xff6b6b, hex: '#ff8f8f' },
            Fere:  { color: 0xffd93d, hex: '#ffe27a' },
            Bonum: { color: 0x5eead4, hex: '#5eead4' },
        };
        return map[cat] || { color: 0x5eead4, hex: '#5eead4' };
    }

    // _glassPanel(): Draws a framed glass card (double border + corner brackets)
    // at an absolute centre. Matches the Multiplayer hub's panel styling.
    _glassPanel(cx, cy, w, h){
        const L = cx - w / 2;
        const T = cy - h / 2;

        this.add.rectangle(cx, cy, w + 20, h + 20, 0x5eead4, 0.04);
        this.add.rectangle(cx, cy, w, h, 0x070c12, 0.5);
        this.add.ellipse(cx, cy, w * 0.85, h * 0.7, 0x14232b, 0.25);
        this.add.rectangle(cx, T + 10, w - 24, 16, 0xaaffee, 0.06);

        const border = this.add.graphics();
        border.lineStyle(2, 0x5eead4, 0.55);
        border.strokeRect(L, T, w, h);
        border.lineStyle(1, 0xff6b6b, 0.22);
        border.strokeRect(L + 5, T + 5, w - 10, h - 10);

        const corner = this.add.graphics();
        const cLen   = 16;
        [
            [L,     T,     1,  1],
            [L + w, T,    -1,  1],
            [L,     T + h,  1, -1],
            [L + w, T + h, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            corner.lineStyle(3, 0x5eead4, 1);
            corner.beginPath();
            corner.moveTo(x + hd * cLen, y);
            corner.lineTo(x, y);
            corner.lineTo(x, y + vd * cLen);
            corner.strokePath();
            corner.fillStyle(0x5eead4, 1);
            corner.fillCircle(x, y, 3.5);
        });
    }

    // _glassButton(): Absolute-positioned glass action button with hover / press
    // feedback and an idle glow pulse. cfg = { label, accent, accentHex, onClick }.
    _glassButton(cx, cy, w, h, cfg){
        const btn = this.add.container(cx, cy).setDepth(40);

        const glow   = this.add.rectangle(0, 0, w + 20, h + 20, cfg.accent, 0).setStrokeStyle(3, cfg.accent, 0.15);
        const bg     = this.add.rectangle(0, 0, w, h, 0x0b141c, 0.6);
        const sheen  = this.add.rectangle(0, -h / 2 + 8, w - 14, 10, 0xffffff, 0.06);
        const border = this.add.graphics();
        const stroke = (weight, alpha) => {
            border.clear();
            border.lineStyle(weight, cfg.accent, alpha);
            border.strokeRect(-w / 2, -h / 2, w, h);
        };
        stroke(1.5, 0.5);

        const glowText = this.add.text(0, 0, cfg.label, {
            fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
            color: cfg.accentHex, stroke: cfg.accentHex, strokeThickness: 8,
        }).setOrigin(0.5).setAlpha(0.22);

        const text = this.add.text(0, 0, cfg.label, {
            fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
            color: '#f5f5f5', stroke: '#04121a', strokeThickness: 3,
        }).setOrigin(0.5);

        btn.add([glow, bg, sheen, border, glowText, text]);

        this.tweens.add({ targets: glowText, alpha: 0.5, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: glow,     alpha: 0.5, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        bg.setInteractive({ useHandCursor: true });

        bg.on('pointerover', () => {
            bg.setFillStyle(0x101c26, 0.85);
            stroke(2, 0.9);
            glowText.setAlpha(0.7);
            this.tweens.add({ targets: btn, scaleX: 1.05, scaleY: 1.05, duration: 150, ease: 'Sine.easeOut' });
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x0b141c, 0.6);
            stroke(1.5, 0.5);
            this.tweens.add({ targets: btn, scaleX: 1, scaleY: 1, duration: 150, ease: 'Sine.easeOut' });
        });

        bg.on('pointerdown', () => {
            this.tweens.add({
                targets: btn, scaleX: 0.96, scaleY: 0.96, duration: 80, yoyo: true, ease: 'Sine.easeOut',
                onComplete: () => cfg.onClick(bg),
            });
        });

        return { btn, bg, glowText };
    }

    // ==========================================================
    // Deck Panel (selected cards)
    // ==========================================================
    // _buildDeckPanel(): The glass card at the top holding the four deck slots,
    // a header and an "x / 4" fill gauge.
    _buildDeckPanel(){
        const cx = 960, cy = 292, w = 1180, h = 336;

        this._glassPanel(cx, cy, w, h);

        this.add.text(cx - w / 2 + 30, cy - h / 2 + 30, 'ASSEMBLE YOUR DECK', {
            fontFamily: 'monospace', fontSize: '20px', color: '#f5f5f5', stroke: '#1a0000', strokeThickness: 3,
        }).setOrigin(0, 0.5);

        this.add.text(cx - w / 2 + 30, cy - h / 2 + 54, 'SUPRA  •  FERE  •  BONUM ×2', {
            fontFamily: 'monospace', fontSize: '10px', color: '#5eead4',
        }).setOrigin(0, 0.5).setAlpha(0.65);

        this.deckGauge = this._buildDeckGauge(cx + w / 2 - 62, cy - h / 2 + 30);

        const divider = this.add.graphics();
        divider.lineStyle(1, 0x5eead4, 0.2);
        divider.beginPath();
        divider.moveTo(cx - w / 2 + 24, cy - h / 2 + 72);
        divider.lineTo(cx + w / 2 - 24, cy - h / 2 + 72);
        divider.strokePath();

        const slotW = 200, slotH = 236, gap = 40;
        const total   = slotW * 4 + gap * 3;
        const startCX = cx - total / 2 + slotW / 2;
        const slotCY  = cy + 34;

        const defs = [
            { key: 'supra',  label: 'SUPRA',     cat: 'Supra' },
            { key: 'fere',   label: 'FERE',      cat: 'Fere'  },
            { key: 'bonum1', label: 'BONUM  I',  cat: 'Bonum' },
            { key: 'bonum2', label: 'BONUM  II', cat: 'Bonum' },
        ];

        this.selectionSlots = {};
        defs.forEach((d, i) => {
            const sx = startCX + i * (slotW + gap);
            this.selectionSlots[d.key] = this._makeDeckSlot(d, sx, slotCY, slotW, slotH);
        });

        this._updateDeckGauge();
    }

    // _buildDeckGauge(): The pill that reads "0 / 4" ... "4 / 4", crimson until
    // the deck is whole then teal, with a pulsing status dot.
    _buildDeckGauge(x, y){
        const c   = this.add.container(x, y);
        const bg  = this.add.graphics();
        const dot = this.add.circle(-18, 0, 4, 0xff6b6b, 1);
        const txt = this.add.text(-6, 0, '0 / 4', {
            fontFamily: 'monospace', fontSize: '12px', color: '#ff8f8f',
        }).setOrigin(0, 0.5);

        c.add([bg, dot, txt]);
        this.tweens.add({ targets: dot, alpha: 0.2, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        return { c, bg, dot, txt };
    }

    _updateDeckGauge(){
        if (!this.deckGauge) return;

        const n    = ['Supra', 'Fere', 'Bonum1', 'Bonum2'].filter(k => this.selectedCards[k]).length;
        const done = n === 4;
        const col  = done ? 0x5eead4 : 0xff6b6b;
        const { bg, dot, txt } = this.deckGauge;

        bg.clear();
        bg.fillStyle(col, 0.1);
        bg.lineStyle(1, col, 0.45);
        bg.fillRoundedRect(-34, -12, 68, 24, 5);
        bg.strokeRoundedRect(-34, -12, 68, 24, 5);
        dot.setFillStyle(col, 1);
        txt.setText(`${n} / 4`).setColor(done ? '#9be7c4' : '#ff8f8f');
    }

    // _makeDeckSlot(): One deck slot - glass frame, category pill, empty-state
    // prompt and a hidden breathing glow used once the slot is filled. Keeps the
    // property names (bg / label / emptyText / cardImage / noImageText) the
    // selection code and launch cinematic rely on.
    _makeDeckSlot(d, x, y, w, h){
        const def = this._categoryDef(d.cat);
        const r   = 12;

        const glow = this.add.graphics().setDepth(9).setAlpha(0);
        glow.lineStyle(6, def.color, 0.5);
        glow.strokeRoundedRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, r + 2);

        const frame = this.add.graphics().setDepth(9);
        frame.fillStyle(0x0b141c, 0.45);
        frame.fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
        frame.lineStyle(1.5, def.color, 0.4);
        frame.strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);

        const ticks = this.add.graphics().setDepth(9);
        ticks.lineStyle(2, def.color, 0.6);
        const tl = 12;
        [
            [x - w / 2 + 4, y - h / 2 + 4,  1,  1],
            [x + w / 2 - 4, y - h / 2 + 4, -1,  1],
            [x - w / 2 + 4, y + h / 2 - 4,  1, -1],
            [x + w / 2 - 4, y + h / 2 - 4, -1, -1],
        ].forEach(([px, py, hd, vd]) => {
            ticks.beginPath();
            ticks.moveTo(px + hd * tl, py);
            ticks.lineTo(px, py);
            ticks.lineTo(px, py + vd * tl);
            ticks.strokePath();
        });

        const capText = this.add.text(x - w / 2 + 14, y - h / 2 + 18, d.label, {
            fontFamily: 'monospace', fontSize: '11px', color: def.hex,
        }).setOrigin(0, 0.5).setDepth(10);
        const capW  = Math.round(capText.width) + 16;
        const capBg = this.add.graphics().setDepth(9);
        capBg.fillStyle(def.color, 0.1);
        capBg.lineStyle(1, def.color, 0.4);
        capBg.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 9, capW, 18, 4);
        capBg.strokeRoundedRect(x - w / 2 + 6, y - h / 2 + 9, capW, 18, 4);

        // Invisible anchor rect - the selection code places the card art at its
        // x / y, and the launch cinematic tweens it. Floated up so the art clears
        // the stat strip along the bottom of the frame.
        const bg = this.add.rectangle(x, y - 20, w - 24, h - 70, 0x000000, 0).setDepth(10);

        const emptyPlus = this.add.text(x, y - 24, '+', {
            fontFamily: 'monospace', fontSize: '40px', color: '#64748b',
        }).setOrigin(0.5).setDepth(10).setAlpha(0.5);
        const emptyText = this.add.text(x, y + h / 2 - 34, 'EMPTY', {
            fontFamily: 'monospace', fontSize: '13px', color: '#7f8f8d', fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(10);
        const emptyHint = this.add.text(x, y + h / 2 - 18, 'PICK BELOW', {
            fontFamily: 'monospace', fontSize: '9px', color: '#5f716e',
        }).setOrigin(0.5).setDepth(10);

        this.tweens.add({
            targets: emptyPlus, alpha: 0.9, scale: 1.1, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });

        return {
            bg, label: capText, emptyText, emptyPlus, emptyHint,
            cardSprite: null, cardImage: null, noImageText: null,
            color: def.color, hex: def.hex, category: d.cat,
            frame, glow, glowTween: null, ticks, capBg,
            x, y, w, h, statObjs: [], _selected: false,
        };
    }

    // _setDeckSlotSelected(): Swap a slot between its empty and filled frame
    // treatment and start / stop its breathing glow.
    _setDeckSlotSelected(slot, on){
        if (slot._selected === on) return;
        slot._selected = on;

        slot.frame.clear();
        slot.frame.fillStyle(0x0b141c, on ? 0.62 : 0.45);
        slot.frame.fillRoundedRect(slot.x - slot.w / 2, slot.y - slot.h / 2, slot.w, slot.h, 12);
        slot.frame.lineStyle(on ? 2 : 1.5, slot.color, on ? 0.65 : 0.4);
        slot.frame.strokeRoundedRect(slot.x - slot.w / 2, slot.y - slot.h / 2, slot.w, slot.h, 12);

        if (on){
            slot.glowTween = this.tweens.add({
                targets: slot.glow, alpha: 0.6, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            });
        } else {
            if (slot.glowTween){ slot.glowTween.stop(); slot.glowTween = null; }
            slot.glow.setAlpha(0);
        }
    }

    // _refreshDeckStats(): Rebuild every filled slot's name + ATK / DEF / ESS
    // strip from this.selectedCards, and refresh the gauge. Called after each
    // pick so swaps stay in sync without tracking slot keys.
    _refreshDeckStats(){
        const map = [
            ['Supra',  'supra'],
            ['Fere',   'fere'],
            ['Bonum1', 'bonum1'],
            ['Bonum2', 'bonum2'],
        ];

        map.forEach(([logicalKey, slotKey]) => {
            const slot = this.selectionSlots[slotKey];
            if (!slot) return;

            slot.statObjs.forEach(o => o.destroy());
            slot.statObjs = [];

            const card   = this.selectedCards[logicalKey];
            const filled = !!card;

            slot.emptyPlus.setVisible(!filled);
            slot.emptyText.setVisible(!filled);
            slot.emptyHint.setVisible(!filled);
            this._setDeckSlotSelected(slot, filled);

            if (!filled) return;

            const { x, y, w, h } = slot;

            const nameText = this.add.text(x, y + h / 2 - 58, String(card.shortName).toUpperCase(), {
                fontFamily: 'monospace', fontSize: '13px', color: '#f0f0f0',
            }).setOrigin(0.5).setDepth(11);

            const dv = this.add.graphics().setDepth(11);
            dv.lineStyle(1, slot.color, 0.2);
            dv.beginPath();
            dv.moveTo(x - w / 2 + 16, y + h / 2 - 44);
            dv.lineTo(x + w / 2 - 16, y + h / 2 - 44);
            dv.strokePath();

            const strip = [];
            const step  = (w - 30) / 3;
            [
                ['ATK', card.atk,  '#ff8f8f'],
                ['DEF', card.def,  '#9be7c4'],
                ['ESS', card.esse, '#5eead4'],
            ].forEach(([label, value, hex], i) => {
                const sx = x - w / 2 + 15 + step * (i + 0.5);
                strip.push(this.add.text(sx, y + h / 2 - 30, String(value), {
                    fontFamily: 'monospace', fontSize: '13px', color: hex,
                }).setOrigin(0.5).setDepth(11));
                strip.push(this.add.text(sx, y + h / 2 - 15, label, {
                    fontFamily: 'monospace', fontSize: '8px', color: '#9fb4b0',
                }).setOrigin(0.5).setDepth(11));
            });

            slot.statObjs = [nameText, dv, ...strip];
            slot.statObjs.forEach(o => o.setAlpha(0));
            this.tweens.add({ targets: slot.statObjs, alpha: 1, duration: 260, ease: 'Sine.easeOut' });
        });

        this._updateDeckGauge();
    }

    // ==========================================================
    // Card Pool
    // ==========================================================
    // _buildPoolPanel(): The lower glass card holding the three category bands of
    // selectable cards.
    _buildPoolPanel(){
        const cx = 960, cy = 748, w = 1480, h = 516;

        this._glassPanel(cx, cy, w, h);

        this.add.text(cx, cy - h / 2 + 26, 'CARD POOL', {
            fontFamily: 'monospace', fontSize: '16px', color: '#f5f5f5', stroke: '#1a0000', strokeThickness: 3,
        }).setOrigin(0.5);

        this._poolCardCount = 0;

        const bands = [
            { category: 'Supra', label: 'SUPRA CARDS', y: cy - 122 },
            { category: 'Fere',  label: 'FERE CARDS',  y: cy + 22  },
            { category: 'Bonum', label: 'BONUM CARDS', y: cy + 166 },
        ];

        bands.forEach(band => {
            const def = this._categoryDef(band.category);

            const label = this.add.text(cx, band.y - 78, band.label, {
                fontFamily: 'monospace', fontSize: '12px', color: def.hex,
            }).setOrigin(0.5).setDepth(1);
            const pillW = Math.round(label.width) + 28;
            const pill  = this.add.graphics();
            pill.fillStyle(def.color, 0.1);
            pill.lineStyle(1, def.color, 0.45);
            pill.fillRoundedRect(cx - pillW / 2, band.y - 88, pillW, 20, 5);
            pill.strokeRoundedRect(cx - pillW / 2, band.y - 88, pillW, 20, 5);

            const cards  = this.availableCards.filter(c => c.cate === band.category);
            const step   = 152;
            const startX = cx - (cards.length - 1) * step / 2;

            cards.forEach((card, i) => {
                this.createSelectableCard(card, startX + i * step, band.y + 6, band.category);
            });
        });
    }

    // createSelectableCard(): One pool card - a glass tile with art (or a
    // monogram fallback) that lifts on hover, opens the stat panel, and drops
    // into the deck on click. The selection branching below is unchanged.
    createSelectableCard(card, x, y, category){
        const W   = 128;
        const H   = 150;
        const def = this._categoryDef(category);

        const container = this.add.container(x, y);
        card._tile = container;

        const shadow = this.add.ellipse(0, H / 2 + 12, W * 0.8, 16, 0x000000, 0.45);
        shadow.setVisible(false);

        const cardBg = this.add.rectangle(0, 0, W, H, 0x0b141c, 0.82);
        cardBg.setStrokeStyle(2, 0x5eead4, 0.5);

        const innerGlow = this.add.rectangle(0, 0, W - 6, H - 6, 0x000000, 0);
        innerGlow.setStrokeStyle(1, def.color, 0.35);

        const cardImage = this.add.image(0, -8, `${card.name}`);
        if (cardImage.texture.key !== '__MISSING'){
            const src = this.textures.get(card.name).getSourceImage();
            cardImage.setScale(Math.min((W - 20) / src.width, (H - 40) / src.height));
        } else {
            cardImage.setDisplaySize(W - 20, H - 40);
        }

        const shortNameText = this.add.text(0, H / 2 - 16, `${card.shortName}`, {
            fontFamily: 'monospace', fontSize: '12px', color: '#f0f0f0',
        }).setOrigin(0.5);

        // Child order stays [cardBg, innerGlow, cardImage, ...] for the
        // selection code (it reads list[0] and list[2]).
        if (cardImage.texture.key !== '__MISSING')
        {
            container.add([cardBg, innerGlow, cardImage, shortNameText]);
        }
        else
        {
            const noImageText = this.add.text(0, -8, String(card.shortName).charAt(0).toUpperCase(), {
                fontFamily: 'monospace', fontSize: '30px', color: def.hex,
            }).setOrigin(0.5);
            cardImage.setVisible(false);
            container.add([cardBg, innerGlow, cardImage, noImageText, shortNameText]);
        }

        // Staggered entrance
        container.setAlpha(0);
        container.y = y + 24;
        this.tweens.add({
            targets: container, alpha: 1, y,
            duration: 420, delay: 200 + (this._poolCardCount++ * 55), ease: 'Back.easeOut',
        });

        // Make interactive:
        cardBg.setInteractive({ useHandCursor: true });

        // Hover effects:
        cardBg.on('pointerover', () => {
            shadow.setVisible(false);
            container.setScale(1.05);

            if (card.selected)
            {
                cardBg.setStrokeStyle(4, 0x16a34a, 0.6);
            }
            else
            {
                cardBg.setStrokeStyle(3, this.getCategoryColor(category), 1);
            }

            // Will display the 'card stat container':
            this.cardStatContainer(card, 'over', x);

            this.tweens.add({
                targets: container,
                y: y - 5,
                duration: 200,
                ease: 'Power2',
            });
        });

        cardBg.on('pointerout', () => {
            shadow.setVisible(false);
            container.setScale(1);

            if (card.selected)
            {
                cardBg.setStrokeStyle(4, 0x16a34a, 0.6);
            }
            else
            {
                cardBg.setStrokeStyle(2, 0x5eead4, 0.5);
            }

            this.cardStatContainer(card, 'out', x);

            this.tweens.add({
                targets: container,
                y: y,
                duration: 200,
                ease: 'Power2',
            });
        });

        // Card clicked on (pointerdown):
        cardBg.on('pointerdown', () => {
            // CODE: If a Bonum card was selected:
            if (category === "Supra")
            {
                if (this.selectedCards.Supra !== null && this.selectedCards.Supra.name === card.name)
                {
                    console.log("You've already selected this card for Supra..."); // Testing
                    return;
                }
            }
            else if (category === "Fere")
            {
                if (this.selectedCards.Fere !== null && this.selectedCards.Fere.name === card.name)
                {
                    console.log("You've already selected this card for Fere..."); // Testing
                    return;
                }
            }
            else if (category === "Bonum")
            {
                if (this.selectedCards.Bonum1 !== null && this.selectedCards.Bonum1.name === card.name)
                {
                    console.log ("You've already selected this card for Bonum1..."); // Testing
                    return;
                }

                if (this.selectedCards.Bonum2 !== null && this.selectedCards.Bonum2.name === card.name)
                {
                    console.log("You've already selected this card for Bonum2..."); // Testing
                    return;
                }

                this.bonumSelectedCount++;

                if (this.bonumSelectedCount > 2)
                {
                    this.bonumSelectedCount = 1;
                }
                console.log("The Bonum Select Count: ", this.bonumSelectedCount); // Testing
            }

            if (this.selectedCards[category] !== null && category !== "Bonum")
            {
                console.log('Previous Selected Card: ', this.selectedCards[category]); // Testing
                console.log('Card Sprite: ', this.selectedCards[category].cardSprite); // Testing
                console.log('Card Sprite: ', this.selectedCards[category].cardSprite.list[0]); // Testing
                const containerChild = this.selectedCards[category].cardSprite.list[0];

                console.log('Card Sprite[0] Tween: ', this.tweens.getTweensOf(containerChild)); // Testing
                // containerChild.scene.tweens.paused = true;
                this.tweens.killTweensOf(containerChild);
                containerChild.setScale(1);

                containerChild.setStrokeStyle(2, 0x5eead4, 0.5);

                // Code: Test if the category is 'Supra' or 'Fere' to destroy the recent image in memory:
                if (category === "Supra")
                {
                    this.selectionSlots['supra'].cardImage.destroy();
                }
                else if (category === "Fere")
                {
                    this.selectionSlots['fere'].cardImage.destroy();
                }
            }
            else if (this.selectedCards[`Bonum${this.bonumSelectedCount}`] !== null && category === "Bonum")
            {
                const containerChild = this.selectedCards[`Bonum${this.bonumSelectedCount}`].cardSprite.list[0];

                this.tweens.killTweensOf(containerChild);
                containerChild.setScale(1);

                containerChild.setStrokeStyle(2, 0x5eead4, 0.5);

                // Code: Test if the category is 'Bonum1' or 'Bonum2' to destroy the recent image in memory:
                if (this.bonumSelectedCount === 1)
                {
                    this.selectionSlots[`bonum${this.bonumSelectedCount}`].cardImage.destroy();
                }
                else
                {
                    this.selectionSlots[`bonum${this.bonumSelectedCount}`].cardImage.destroy();
                }
            }

            cardBg.setStrokeStyle(4, 0x16a34a, 0.6);
            this.tweens.killTweensOf(cardBg);
            cardBg.setScale(1);

            // Tween: Will scale the card when selected by the user:
            this.tweens.add({
                targets: cardBg,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });

            this.selectCardForDeck(card, container, category);
        });
    }

    // selectCardForDeck(): Assigns the picked card to its deck slot. Selection
    // branching is unchanged; it now finishes by refreshing the slot stat strips.
    selectCardForDeck(card, container, category){
        let slotKey = null;

        if (category === "Supra") // Supra Selection
        {
            if (this.selectedCards.Supra === null)
            {
                card.selected = true;
                card.cardSprite = container;
                this.selectedCards.Supra = card;

                slotKey = "supra";
            }
            else if (this.selectedCards.Supra.name !== card.name)
            {
                card.selected = true;
                card.cardSprite = container;

                this.selectedCards.Supra.selected = false;
                this.selectedCards.Supra = card;
                slotKey = "supra";
            }
        }
        else if (category === "Fere") // Fere Selection
        {
            if (this.selectedCards.Fere === null)
            {
                card.selected = true;
                card.cardSprite = container;
                this.selectedCards.Fere = card;
                slotKey = "fere";
            }
            else if (this.selectedCards.Fere.name !== card.name)
            {
                card.selected = true;
                card.cardSprite = container;

                this.selectedCards.Fere.selected = false;
                this.selectedCards.Fere = card;
                slotKey = "fere";
            }
        }
        else if (category === "Bonum") // Bonum Selection
        {
            if (this.selectedCards.Bonum1 === null)
            {
                card.selected = true;
                card.cardSprite = container;
                this.selectedCards.Bonum1 = card;
                slotKey = "bonum1";
            }
            else if (this.selectedCards.Bonum1 !== null && this.selectedCards.Bonum2 === null)
            {
                card.selected = true;
                card.cardSprite = container;
                this.selectedCards.Bonum2 = card;
                slotKey = "bonum2";
            }
            else if (this.selectedCards.Bonum1.name !== card.name && this.bonumSelectedCount === 1)
            {
                card.selected = true;
                card.cardSprite = container;

                this.selectedCards.Bonum1.selected = false;
                this.selectedCards.Bonum1 = card;
                slotKey = "bonum1";

            }
            else if (this.selectedCards.Bonum2.name !== card.name && this.bonumSelectedCount === 2)
            {
                card.selected = true;
                card.cardSprite = container;

                this.selectedCards.Bonum2.selected = false;
                this.selectedCards.Bonum2 = card;
                slotKey = "bonum2";
            }
        }

        if (!slotKey) return;

        // Use selectionSlots:
        const slot = this.selectionSlots[slotKey];
        slot.cardSprite = card.cardSprite;

        const selectionSlotImage = this.add.image(slot.bg.x, slot.bg.y, `${card.cardSprite.list[2].texture.key}`);
        selectionSlotImage.setDisplaySize(128, 128).setDepth(10);
        slot.cardImage = selectionSlotImage;

        // If: Test if this card has an image present in the system.
        if (selectionSlotImage.texture.key === '__MISSING')
        {
            selectionSlotImage.destroy();
            if (slot.noImageText !== null) slot.noImageText.destroy();
            slot.noImageText = this.add.text(slot.bg.x, slot.bg.y, String(card.shortName).charAt(0).toUpperCase(), {
                fontFamily: 'monospace', fontSize: '40px', color: slot.hex,
            }).setOrigin(0.5).setDepth(10);
        }

        // Hide empty text:
        slot.emptyText.setVisible(false);

        this._refreshDeckStats();
    }

    // ==========================================================
    // Hover Stat Panel
    // ==========================================================
    // cardStatContainer(): Glass panel with the hovered card's art, category,
    // name and animated ATK / DEF / ESSE meters. It springs in on the opposite
    // side of the card being pointed at so it never covers it.
    cardStatContainer(card, action, cardX){
        if (action === "out")
        {
            const panel = this._statPanel;
            if (!panel) return;
            this._statPanel = null;
            this.tweens.killTweensOf(panel);
            this.tweens.add({
                targets: panel, alpha: 0, scaleX: 0.92, scaleY: 0.92,
                duration: 150, ease: 'Sine.easeIn', onComplete: () => panel.destroy(),
            });
            return;
        }

        // action === "over"
        if (this._statPanel)
        {
            this.tweens.killTweensOf(this._statPanel);
            this._statPanel.destroy();
            this._statPanel = null;
        }

        const def    = this._categoryDef(card.cate);
        const w       = 330;
        const h       = 468;
        const onLeft  = (cardX ?? 0) > this.cameras.main.width / 2;
        const targetX = onLeft ? 300 : 1620;
        const py      = 548;

        const panel = this.add.container(targetX + (onLeft ? -28 : 28), py)
            .setDepth(60).setAlpha(0).setScale(0.92);
        panel.setName('statPanel');
        this._statPanel = panel;

        // Frame
        panel.add(this.add.rectangle(0, 0, w + 16, h + 16, def.color, 0.05));
        panel.add(this.add.rectangle(0, 0, w, h, 0x070c12, 0.74));
        panel.add(this.add.ellipse(0, 0, w * 0.85, h * 0.7, 0x14232b, 0.3));
        panel.add(this.add.rectangle(0, -h / 2 + 9, w - 20, 14, 0xaaffee, 0.06));

        const border = this.add.graphics();
        border.lineStyle(2, def.color, 0.6);
        border.strokeRect(-w / 2, -h / 2, w, h);
        border.lineStyle(1, 0xff6b6b, 0.2);
        border.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
        panel.add(border);

        const corner = this.add.graphics();
        const cLen   = 15;
        [
            [-w / 2, -h / 2,  1,  1],
            [ w / 2, -h / 2, -1,  1],
            [-w / 2,  h / 2,  1, -1],
            [ w / 2,  h / 2, -1, -1],
        ].forEach(([x, y, hd, vd]) => {
            corner.lineStyle(3, def.color, 1);
            corner.beginPath();
            corner.moveTo(x + hd * cLen, y);
            corner.lineTo(x, y);
            corner.lineTo(x, y + vd * cLen);
            corner.strokePath();
        });
        panel.add(corner);

        // Category pill
        const pillText = this.add.text(0, -h / 2 + 26, String(card.cate).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '12px', color: def.hex,
        }).setOrigin(0.5);
        const pillW  = Math.round(pillText.width) + 26;
        const pillBg = this.add.graphics();
        pillBg.fillStyle(def.color, 0.1);
        pillBg.lineStyle(1, def.color, 0.45);
        pillBg.fillRoundedRect(-pillW / 2, -h / 2 + 16, pillW, 20, 5);
        pillBg.strokeRoundedRect(-pillW / 2, -h / 2 + 16, pillW, 20, 5);
        panel.add([pillBg, pillText]);

        // Name
        panel.add(this.add.text(0, -h / 2 + 56, String(card.name).toUpperCase(), {
            fontFamily: 'monospace', fontSize: '15px', color: '#f5f5f5',
            stroke: '#1a0000', strokeThickness: 3, align: 'center',
            wordWrap: { width: w - 44 },
        }).setOrigin(0.5));

        // Art
        const artCY = -h / 2 + 152;
        panel.add(this.add.rectangle(0, artCY, w - 60, 150, 0x0b1a1e, 0.5).setStrokeStyle(1, def.color, 0.35));
        if (this.textures.exists(card.name))
        {
            const src = this.textures.get(card.name).getSourceImage();
            panel.add(this.add.image(0, artCY, card.name)
                .setScale(Math.min((w - 76) / src.width, 138 / src.height)));
        }
        else
        {
            panel.add(this.add.circle(0, artCY, 40, 0x0b1a1e, 0.9).setStrokeStyle(2, def.color, 0.7));
            panel.add(this.add.text(0, artCY, String(card.shortName).charAt(0).toUpperCase(), {
                fontFamily: 'monospace', fontSize: '40px', color: def.hex,
            }).setOrigin(0.5));
            panel.add(this.add.text(0, artCY + 58, 'ARTWORK PENDING', {
                fontFamily: 'monospace', fontSize: '9px', color: '#9fb4b0',
            }).setOrigin(0.5).setAlpha(0.7));
        }

        // Divider
        const dv = this.add.graphics();
        dv.lineStyle(1, def.color, 0.2);
        dv.beginPath();
        dv.moveTo(-w / 2 + 24, artCY + 96);
        dv.lineTo( w / 2 - 24, artCY + 96);
        dv.strokePath();
        panel.add(dv);

        // Stat meters
        const barW  = w - 60;
        const stats = [
            { label: 'ATTACK',  value: card.atk,  max: 50,  colr: 0xff8f8f, hex: '#ff8f8f' },
            { label: 'DEFENSE', value: card.def,  max: 40,  colr: 0x9be7c4, hex: '#9be7c4' },
            { label: 'ESSENCE', value: card.esse, max: 100, colr: 0x5eead4, hex: '#5eead4' },
        ];
        let sy = artCY + 128;
        stats.forEach((st, i) => {
            const t = Math.max(0, Math.min(1, (Number(st.value) || 0) / st.max));

            panel.add(this.add.text(-barW / 2, sy - 14, st.label, {
                fontFamily: 'monospace', fontSize: '10px', color: '#9fb4b0',
            }).setOrigin(0, 0.5));
            panel.add(this.add.text(barW / 2, sy - 14, String(st.value), {
                fontFamily: 'monospace', fontSize: '12px', color: st.hex,
            }).setOrigin(1, 0.5));

            const track = this.add.graphics();
            track.fillStyle(0x1c2b33, 0.9);
            track.fillRoundedRect(-barW / 2, sy, barW, 8, 4);
            panel.add(track);

            const fill = this.add.graphics({ x: -barW / 2, y: 0 });
            fill.fillStyle(st.colr, 0.95);
            fill.fillRoundedRect(0, sy, Math.max(6, barW * t), 8, 4);
            fill.scaleX = 0;
            panel.add(fill);
            this.tweens.add({ targets: fill, scaleX: 1, duration: 420, delay: 120 + i * 90, ease: 'Cubic.easeOut' });

            sy += 40;
        });

        this.tweens.add({
            targets: panel, x: targetX, alpha: 1, scaleX: 1, scaleY: 1,
            duration: 300, ease: 'Back.easeOut',
        });
    }

    // ==========================================================
    // Navigation
    // ==========================================================
    // _buildNavButton(): START GAME in single-player, RETURN TO HUB when the
    // deck builder was opened from the Multiplayer hub.
    _buildNavButton(){
        const { width } = this.cameras.main;
        const single    = this.mode === 'single';

        this._glassButton(width / 2, 1044, 360, 58, {
            label:     single ? 'START GAME' : '◄  RETURN TO HUB',
            accent:    single ? 0x5eead4 : 0xffb199,
            accentHex: single ? '#5eead4' : '#ffb199',
            onClick:   (bg) => single ? this._launchSinglePlayer(bg) : this._returnToHub(),
        });

        if (!single)
        {
            this.add.text(width / 2, 1006, 'Your picks are saved to your PvP deck', {
                fontFamily: 'monospace', fontSize: '10px', color: '#9fb4b0',
            }).setOrigin(0.5).setAlpha(0.7).setDepth(40);
        }
    }

    // _persistDeck(): Write the current selection (whole or partial) to the
    // 'pvpDeck' registry key as plain data - the Multiplayer hub's Card Deck
    // Panel reads it from there.
    _persistDeck(){
        // The id travels with every card - matchmaking sends IDs only and lets
        // the server own the stats, so the deck is useless to a tampered client.
        const serialize = c => c && {
            id: c.id, name: c.name, shortName: c.shortName, cate: c.cate,
            atk: c.atk, def: c.def, esse: c.esse,
        };
        this.registry.set('pvpDeck', {
            Supra:   serialize(this.selectedCards.Supra),
            Fere:    serialize(this.selectedCards.Fere),
            Bonum1:  serialize(this.selectedCards.Bonum1),
            Bonum2:  serialize(this.selectedCards.Bonum2),
            savedAt: Date.now(),
        });
    }

    // _prefillFromRegistry(): When re-entering the builder with a deck already
    // saved, restore those picks so the deck panel isn't blank. Runs the normal
    // selection path so every slot / stat / gauge stays consistent.
    _prefillFromRegistry(){
        const saved = this.registry.get('pvpDeck');
        if (!saved) return;

        const entries = [
            ['Supra', saved.Supra],
            ['Fere',  saved.Fere],
            ['Bonum', saved.Bonum1],
            ['Bonum', saved.Bonum2],
        ];

        entries.forEach(([category, stored]) => {
            if (!stored) return;
            const card = this.availableCards.find(c => c.cate === category && c.name === stored.name && !c.selected);
            if (!card || !card._tile) return;

            this.selectCardForDeck(card, card._tile, category);

            const bgRect = card._tile.list[0];
            if (bgRect && bgRect.setStrokeStyle) bgRect.setStrokeStyle(4, 0x16a34a, 0.6);
        });
    }

    // _returnToHub(): Save the deck and hand control back to the scene that
    // opened the builder (the Multiplayer hub).
    _returnToHub(){
        if (this._leaving) return;
        this._leaving = true;

        this._persistDeck();
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.returnScene));
    }

    // _flashNotice(): Brief bottom-of-screen message.
    _flashNotice(message){
        if (this._notice)
        {
            this.tweens.killTweensOf(this._notice);
            this._notice.destroy();
        }

        const { width, height } = this.cameras.main;
        const notice = this.add.text(width / 2, height - 96, message, {
            fontFamily: 'monospace', fontSize: '15px', color: '#ffb199',
            stroke: '#1a0000', strokeThickness: 3,
        }).setOrigin(0.5).setAlpha(0).setDepth(70);

        this._notice = notice;
        this.tweens.add({
            targets: notice, alpha: 1, duration: 200, yoyo: true, hold: 1500,
            ease: 'Sine.easeInOut', onComplete: () => notice.destroy(),
        });
    }

    // _launchSinglePlayer(): Single-player only. Confirms four cards are picked,
    // then runs the showcase + gold-electric cinematic into GameBattleScene.
    _launchSinglePlayer(btnBg){
        this.numOfCardsSelected = 0;
        for (const key in this.selectedCards){
            if (this.selectedCards[key] === null)
            {
                console.log(`You need a ${key} card: ${this.selectedCards[key]}`); // Testing
            }
            else
            {
                this.numOfCardsSelected++;
            }
        }

        if (this.numOfCardsSelected !== 4)
        {
            this._flashNotice('Fill all four deck slots first');
            return;
        }

        this._persistDeck();

        const { height } = this.cameras.main;
        const centerY = height / 2;
        const slotY   = 150;
        const deltaY  = centerY - slotY;

        const newSlotSpacing = 190;
        const startX         = 100;

        btnBg.disableInteractive();

        // Build a set of every scene object that belongs to the selection slots
        const slotObjects = new Set();
        for (const key in this.selectionSlots) {
            const slot = this.selectionSlots[key];

            slotObjects.add(slot.bg);
            slotObjects.add(slot.label);
            slotObjects.add(slot.emptyText);
            if (slot.cardImage && slot.cardImage.active) slotObjects.add(slot.cardImage);
            if (slot.noImageText && slot.noImageText.active) slotObjects.add(slot.noImageText);
        }

        // Everything that is NOT a slot object gets swept off screen
        const toHide = this.children.list.filter(obj => !slotObjects.has(obj));

        toHide.forEach(obj => {
            this.tweens.killTweensOf(obj);
            if (obj.list) obj.list.forEach(child => this.tweens.killTweensOf(child));
        });

        this.tweens.add({
            targets: toHide,
            alpha: 0,
            duration: 600,
            ease: 'Power2.easeIn',
        });

        Object.keys(this.selectionSlots).forEach((key, slotIndex) => {
            const slot = this.selectionSlots[key];
            let newX = null;

            if (slotIndex === 0)      newX = startX;
            else if (slotIndex === 1) newX = startX + newSlotSpacing;
            else if (slotIndex === 2) newX = startX + newSlotSpacing * 2;
            else if (slotIndex === 3) newX = startX + newSlotSpacing * 3;

            const targets = [slot.bg, slot.label, slot.emptyText];
            if (slot.cardImage && slot.cardImage.active) targets.push(slot.cardImage);
            if (slot.noImageText && slot.noImageText.active) targets.push(slot.noImageText);

            this.tweens.add({
                targets,
                y: `+=${deltaY}`,
                x: newX,
                duration: 1000,
                delay: 250,
                ease: 'Back.easeOut',
            });
        });

        const emphasisTargets = [];
        for (const key in this.selectionSlots) {
            const slot = this.selectionSlots[key];
            emphasisTargets.push(slot.bg);
            if (slot.cardImage && slot.cardImage.active) emphasisTargets.push(slot.cardImage);
            if (slot.noImageText && slot.noImageText.active) emphasisTargets.push(slot.noImageText);
        }
        this.tweens.add({
            targets: emphasisTargets,
            scaleX: .18,
            scaleY: .18,
            duration: 1000,
            delay: 250,
            ease: 'Back.easeOut',
        });

        this.time.delayedCall(1350, () => {
            const electric = this.createGoldElectricBackground();
            this.time.delayedCall(2800, () => {
                electric.stop();
                electric.timer.remove(false);
                this.cameras.main.fadeOut(1200, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('GameBattleScene', { selectedCards: this.selectedCards });
                });
            });
        });
    }

    // createGoldElectricBackground(): Gold electric energy animation shown after all four cards
    // are centered on screen. Runs until the scene fades to black.
    createGoldElectricBackground(){
        const { width, height } = this.cameras.main;
        const cx = width / 2;
        const cy = height / 2;
        const BASE_DEPTH = 5; // Renders behind slot elements (depth 10) but above faded scene objects

        // Dark warm overlay
        const bgOverlay = this.add.rectangle(cx, cy, width, height, 0x0d0500)
            .setAlpha(0).setDepth(BASE_DEPTH);
        this.tweens.add({ targets: bgOverlay, alpha: 0.9, duration: 600, ease: 'Power2' });

        // Layered radial glow — innermost is bright gold, outermost is deep amber
        const glowConfigs = [
            { scale: 1.2, color: 0x3d1200, peak: 0.55 },
            { scale: 0.80, color: 0x8a3200, peak: 0.40 },
            { scale: 0.50, color: 0xcc6000, peak: 0.25 },
            { scale: 0.28, color: 0xffaa00, peak: 0.18 },
            { scale: 0.14, color: 0xffd700, peak: 0.14 },
        ];
        glowConfigs.forEach(({ scale, color, peak }, i) => {
            const g = this.add.ellipse(cx, cy, width * scale, height * scale, color)
                .setAlpha(0).setDepth(BASE_DEPTH);
            this.tweens.add({
                targets: g, alpha: peak,
                duration: 700, delay: i * 110, ease: 'Power2.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: g, alpha: peak * 0.45,
                        duration: 750 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                    });
                },
            });
        });

        // Expanding shockwave rings fired in sequence from the center
        for (let r = 0; r < 3; r++) {
            const ringGfx = this.add.graphics().setDepth(BASE_DEPTH + 1);
            const state = { radius: 5 };
            const maxR = Math.max(width, height) * 0.6;
            this.time.delayedCall(r * 320, () => {
                this.tweens.add({
                    targets: state, radius: maxR,
                    duration: 1000, ease: 'Cubic.easeOut',
                    onUpdate: () => {
                        const a = Math.max(0, (1 - state.radius / maxR) * 0.9);
                        ringGfx.clear();
                        ringGfx.lineStyle(3, 0xffd700, a);
                        ringGfx.strokeCircle(cx, cy, state.radius);
                    },
                    onComplete: () => ringGfx.destroy(),
                });
            });
        }

        // Crackling lightning system — redrawn every 55 ms
        const lightGfx = this.add.graphics().setDepth(BASE_DEPTH + 1);
        const palette = [0xffd700, 0xffcc00, 0xffaa00, 0xffeedd, 0xffffff, 0xff8c00];

        const drawZigzag = (x0, y0, x1, y1, segs, jitter) => {
            lightGfx.moveTo(x0, y0);
            for (let s = 1; s < segs; s++) {
                const t = s / segs;
                lightGfx.lineTo(
                    x0 + (x1 - x0) * t + Phaser.Math.Between(-jitter, jitter),
                    y0 + (y1 - y0) * t + Phaser.Math.Between(-jitter, jitter),
                );
            }
            lightGfx.lineTo(x1, y1);
        };

        const getEdgePoint = () => {
            const edge = Phaser.Math.Between(0, 3);
            if (edge === 0) return { x: Phaser.Math.Between(0, width), y: 0 };
            if (edge === 1) return { x: width, y: Phaser.Math.Between(0, height) };
            if (edge === 2) return { x: Phaser.Math.Between(0, width), y: height };
            return { x: 0, y: Phaser.Math.Between(0, height) };
        };

        let lightActive = true;
        const lightTimer = this.time.addEvent({
            delay: 55,
            loop: true,
            callback: () => {
                if (!lightActive) return;
                lightGfx.clear();
                const numBolts = Phaser.Math.Between(3, 6);
                for (let i = 0; i < numBolts; i++) {
                    const { x: sx, y: sy } = getEdgePoint();
                    const ex = cx + Phaser.Math.Between(-130, 130);
                    const ey = cy + Phaser.Math.Between(-90, 90);
                    const color = Phaser.Math.RND.pick(palette);

                    // Main bolt
                    lightGfx.lineStyle(Phaser.Math.Between(1, 3), color, Phaser.Math.FloatBetween(0.5, 1.0));
                    lightGfx.beginPath();
                    drawZigzag(sx, sy, ex, ey, Phaser.Math.Between(7, 13), 36);
                    lightGfx.strokePath();

                    // Branch bolt off the main bolt
                    if (Math.random() > 0.4) {
                        const bt = Phaser.Math.FloatBetween(0.3, 0.65);
                        const bsx = sx + (ex - sx) * bt;
                        const bsy = sy + (ey - sy) * bt;
                        lightGfx.lineStyle(1, color, Phaser.Math.FloatBetween(0.3, 0.7));
                        lightGfx.beginPath();
                        drawZigzag(
                            bsx, bsy,
                            bsx + Phaser.Math.Between(-100, 100),
                            bsy + Phaser.Math.Between(-100, 100),
                            Phaser.Math.Between(3, 6), 22,
                        );
                        lightGfx.strokePath();
                    }
                }
            },
        });

        // Spark particles scattered across the scene, repositioned each yoyo cycle
        const hw = Math.floor(width * 0.45);
        const hh = Math.floor(height * 0.45);
        const sparks = Array.from({ length: 50 }, () =>
            this.add.circle(
                cx + Phaser.Math.Between(-hw, hw),
                cy + Phaser.Math.Between(-hh, hh),
                Phaser.Math.FloatBetween(1, 3.5),
                Phaser.Math.RND.pick([0xffd700, 0xffcc00, 0xffffff, 0xffaa55, 0xffee88]),
            ).setAlpha(0).setDepth(BASE_DEPTH + 2)
        );
        sparks.forEach(spark => {
            this.tweens.add({
                targets: spark,
                alpha: Phaser.Math.FloatBetween(0.4, 1.0),
                duration: Phaser.Math.Between(100, 350),
                delay: Phaser.Math.Between(0, 700),
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                onYoyo: () => {
                    spark.x = cx + Phaser.Math.Between(-hw, hw);
                    spark.y = cy + Phaser.Math.Between(-hh, hh);
                },
            });
        });

        return {
            stop: () => { lightActive = false; lightGfx.clear(); },
            timer: lightTimer,
        };
    }

    // getCategoryColor(): Category accent as a colour int (used by the pool card
    // hover stroke).
    getCategoryColor(category){
        switch (category){
            case 'Supra': return 0xff6b6b;
            case 'Fere':  return 0xffd93d;
            case 'Bonum': return 0x4ecdc4;
            default:      return 0xffffff;
        }
    }
}

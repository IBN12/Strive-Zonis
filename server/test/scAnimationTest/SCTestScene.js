/** |Singularity Card Test Scene|
 * The arena the test loops a card in. Two cards stand where the battle scene
 * puts them - the PLAYER on the left, the OPPONENT on the right - and the
 * card's attribute picks the stage (stages/<attribute>.js) that plays it out
 * on them, the same way MultiplayerBattleScene drives the animation class.
 *
 * Each loop is a scene restart, so nothing one pass leaves standing can leak
 * into the next.
 */

import SingularityCardAnimations from '../../../public/js/gameTools/singularityCardAnimations.js';
import { SINGULARITY_CARDS } from '../../../public/js/models/singularityCards.js';

import * as attack from './stages/attack.js';
import * as defence from './stages/defence.js';
import * as healing from './stages/healing.js';
import * as affliction from './stages/affliction.js';
import * as cleanse from './stages/cleanse.js';
import * as unbuilt from './stages/unbuilt.js';

const STAGES = { attack, defence, healing, affliction, cleanse };

// The game's art paths are relative to public/ - this page is not in it.
const PUBLIC_URL = new URL('../../../public/', import.meta.url).href;

// The arena, as MultiplayerBattleScene lays it out on 1920x1080.
const CARD_W   = 300;
const CARD_H   = 330;
const CARD_Y   = 452;
const PLAYER_X = 470;
const OPP_X    = 1450;

// The pause between one loop ending and the next starting.
const LOOP_GAP_MS = 1200;

const HUD_DEPTH = 100;         // above every effect (55) and the store (60)

const cardId = new URLSearchParams(location.search).get('card');
const card   = SINGULARITY_CARDS.find(c => c.id === cardId);

// Kept across restarts.
let loop = 0;
const known = new Map();       // beat name -> ms from the card being played, seen on an earlier loop

class SCTestScene extends Phaser.Scene {
    constructor(){
        super('SCTest');
    }

    preload(){
        this.load.setBaseURL(PUBLIC_URL);
        SingularityCardAnimations.preload(this);
        if (!this.textures.exists('scTestBg')) this.load.image('scTestBg', 'assets/backgroundImages/find_a_match_scene_con_1.png');
    }

    create(){
        const { width, height } = this.cameras.main;

        if (!card){
            this.add.text(width / 2, height / 2, `Unknown Singularity Card: ${cardId}`, {
                fontFamily: 'monospace', fontSize: '32px', color: '#ff8080',
            }).setOrigin(0.5);
            return;
        }

        loop += 1;

        this.add.image(width / 2, height / 2, 'scTestBg').setDisplaySize(width, height).setAlpha(0.45);

        const stage = STAGES[card.attribute] ?? unbuilt;

        this.player   = this._buildCard(PLAYER_X, 'PLAYER',   0x38bdf8, -1);
        this.opponent = this._buildCard(OPP_X,    'OPPONENT', 0xf87171, +1);
        this.fx       = new SingularityCardAnimations(this);
        this.playedAt = null;

        this._buildHud(stage.roles);

        this.events.on('singularityfx:beat', this._onBeat, this);
        this.events.once('shutdown', () => this.events.off('singularityfx:beat', this._onBeat, this));

        this.startedAt = this.time.now;
        this.length    = stage.default(this._toolkit());
        this._drawMarks();

        console.log(`[SCTest] loop ${loop} - ${card.name} (${card.attribute ?? 'no attribute yet'})`);

        this.time.delayedCall(this.length + LOOP_GAP_MS, () => this.scene.restart());
    }

    update(){
        if (!this.hud || !this.length) return;

        const t = Math.min(1, (this.time.now - this.startedAt) / this.length);
        this.hud.head.x = this.hud.x0 + t * this.hud.w;

        const since = this.playedAt === null ? 0 : this.time.now - this.playedAt;
        this.hud.clock.setText(`${Math.max(0, Math.round(since))} ms`);
    }

    // ------------------------------------------------------------- toolkit --
    // What a stage is handed. Times given to at() are from the loop starting.
    _toolkit(){
        return {
            scene:    this,
            fx:       this.fx,
            card,
            player:   this.player,
            opponent: this.opponent,

            at: (ms, fn) => this.time.delayedCall(ms, fn),

            /** Play the card from `caster` onto `rival`, as the server's 'singularity:used' would. */
            play: (caster, rival, event = {}) => {
                this.playedAt = this.time.now;
                this.hud.played.x = this.hud.x0 + ((this.playedAt - this.startedAt) / this.length) * this.hud.w;
                this.hud.played.setVisible(true);

                this.fx.determineSingularityCard(card, {
                    you: caster === this.player, caster, rival,
                    event: { type: 'singularity:used', cardId: card.id, attribute: card.attribute, ...event },
                });
            },

            ctx: (caster, rival, event = {}) => ({ you: caster === this.player, caster, rival, event }),

            lunge:   (slot) => this._lunge(slot),
            hit:     (slot, opts) => this._hit(slot, opts),
            setEsse: (slot, esse, instant) => this._setEsse(slot, esse, instant),
        };
    }

    // ---------------------------------------------------------------- cards --
    // Just enough of an arena slot for the animation class: root, face,
    // flash, facing and its home - plus an ESSE bar to watch move.
    _buildCard(x, tag, accent, side){
        const root = this.add.container(x, CARD_Y);

        const glass = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x0b1520, 0.92).setStrokeStyle(3, accent, 0.9);
        const face  = this.add.container(0, 0);

        const name = this.add.text(0, -60, tag, {
            fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: '#e6f1ff',
        }).setOrigin(0.5);

        const barW    = CARD_W - 60;
        const barBg   = this.add.rectangle(-barW / 2, 70, barW, 14, 0x16202c, 0.95).setOrigin(0, 0.5);
        const barFill = this.add.rectangle(-barW / 2, 70, barW, 14, accent, 1).setOrigin(0, 0.5);

        const esseText = this.add.text(0, 92, '', {
            fontFamily: 'monospace', fontSize: '14px', color: '#93a7b8',
        }).setOrigin(0.5);

        // Filled solid and faded by its alpha - a fill alpha of 0 would keep
        // it invisible however far the effects tween it.
        const flash = this.add.rectangle(0, 0, CARD_W, CARD_H, 0xffffff, 1).setAlpha(0);

        face.add(name);
        root.add([glass, face, barBg, barFill, esseText, flash]);

        const slot = {
            root, face, flash, accent, side,
            facing:   -side,
            homeX:    x,
            homeY:    CARD_Y,
            barW, barFill, esseText,
            cardId:   `${tag.toLowerCase()}_card`,
            esse:     100,
            shake:    null,
            motion:   null,
        };

        this._setEsse(slot, 100, true);
        return slot;
    }

    _setEsse(slot, esse, instant = false){
        slot.esse = Phaser.Math.Clamp(esse, 0, 100);
        slot.esseText.setText(`ESSE ${slot.esse} / 100`);

        this.tweens.killTweensOf(slot.barFill);
        if (instant) slot.barFill.scaleX = slot.esse / 100;
        else this.tweens.add({ targets: slot.barFill, scaleX: slot.esse / 100, duration: 420, ease: 'Cubic.easeOut' });
    }

    // Out toward the other card and back; contact falls ATTACK_LAND_MS (arena.js) in.
    _lunge(slot){
        this.tweens.add({
            targets:  slot.root,
            x:        slot.homeX + slot.facing * 60,
            duration: 170,
            hold:     90,
            yoyo:     true,
            ease:     'Back.easeIn',
        });
    }

    // The contact on a card - flash, recoil and the damage it took.
    // Returns the contact point (the card's leading edge).
    _hit(slot, { damage = 0, critical = false } = {}){
        const x = slot.homeX + slot.facing * (CARD_W / 2);
        const y = slot.homeY - 20;

        this.tweens.add({ targets: slot.flash, alpha: { from: critical ? 0.9 : 0.45, to: 0 }, duration: critical ? 420 : 240 });

        slot.shake?.stop();
        slot.shake = this.tweens.addCounter({
            from: 1, to: 0, duration: critical ? 520 : 360, ease: 'Cubic.easeOut',
            onUpdate: (tw) => {
                const t = tw.getValue();
                slot.root.x = slot.homeX - slot.facing * 26 * t + Phaser.Math.Between(-8, 8) * t;
                slot.root.y = slot.homeY + Phaser.Math.Between(-8, 8) * t;
            },
            onComplete: () => {
                slot.shake = null;
                slot.root.setPosition(slot.homeX, slot.homeY);
            },
        });

        if (critical) this.cameras.main.shake(240, 0.006);

        if (damage){
            const tag = this.add.text(x, y, `-${damage}${critical ? '  CRITICAL' : ''}`, {
                fontFamily: 'monospace', fontSize: critical ? '34px' : '28px', fontStyle: 'bold',
                color: critical ? '#ffd166' : '#ff8f8f', stroke: '#000000', strokeThickness: 5,
            }).setOrigin(0.5).setDepth(HUD_DEPTH - 1);

            this.tweens.add({ targets: tag, y: y - 90, alpha: 0, delay: 450, duration: 600, onComplete: () => tag.destroy() });
        }

        return { x, y };
    }

    // ------------------------------------------------------------------ hud --
    _buildHud(roles = {}){
        const { width, height } = this.cameras.main;
        const glow = '#' + (card.glow ?? 0xffffff).toString(16).padStart(6, '0');
        const style = (size, color = '#e6f1ff') => ({ fontFamily: 'monospace', fontSize: `${size}px`, color });

        this.add.text(40, 30, `${card.icon ?? ''}  ${card.name}`, style(40, glow)).setDepth(HUD_DEPTH);
        this.add.text(40, 82, `${(card.attribute ?? 'no attribute yet').toUpperCase()}  ·  LOOP ${loop}` +
            `  ·  SPACE pause  R restart  ESC quit`, style(18, '#93a7b8')).setDepth(HUD_DEPTH);

        this.add.text(PLAYER_X, CARD_Y - CARD_H / 2 - 90, `PLAYER - ${roles.player ?? ''}`, style(20, '#7dd3fc'))
            .setOrigin(0.5).setDepth(HUD_DEPTH);
        this.add.text(OPP_X, CARD_Y - CARD_H / 2 - 90, `OPPONENT - ${roles.opponent ?? ''}`, style(20, '#fca5a5'))
            .setOrigin(0.5).setDepth(HUD_DEPTH);

        // The beat log: every beat this loop, with its time from the card being played.
        this.add.text(40, 700, 'BEATS  (ms from the card being played)', style(18, '#93a7b8')).setDepth(HUD_DEPTH);
        const log = this.add.text(40, 730, '', { ...style(18), lineSpacing: 4 }).setDepth(HUD_DEPTH);

        const clock = this.add.text(width - 40, 30, '0 ms', style(32)).setOrigin(1, 0).setDepth(HUD_DEPTH);

        // The loop's timeline, with every beat seen so far marked on it.
        const x0 = 160;
        const w  = width - 320;
        const y  = height - 50;

        this.add.rectangle(x0, y, w, 4, 0x334155, 1).setOrigin(0, 0.5).setDepth(HUD_DEPTH);
        const marks = this.add.container(0, 0).setDepth(HUD_DEPTH);
        const played = this.add.rectangle(x0, y, 3, 30, 0xffffff, 0.8).setDepth(HUD_DEPTH).setVisible(false);
        const head   = this.add.rectangle(x0, y, 4, 22, Phaser.Display.Color.HexStringToColor(glow).color, 1).setDepth(HUD_DEPTH + 1);

        this.hud = { log, lines: [], clock, marks, x0, w, y, head, played };
    }

    _onBeat({ card: id, beat }){
        const since = this.playedAt === null ? 0 : Math.round(this.time.now - this.playedAt);
        const label = id === card.id ? beat : `${id}:${beat}`;

        console.log(`[SCTest] +${String(since).padStart(5)} ms  ${label}`);

        const { hud } = this;
        hud.lines.push(`+${String(since).padStart(5)}  ${label}`);
        hud.log.setText(hud.lines.slice(-12).join('\n'));

        // First time this beat is seen it goes on the timeline for good.
        if (!known.has(label)) known.set(label, this.time.now - this.startedAt);
        this._drawMarks();
    }

    _drawMarks(){
        const { hud } = this;
        hud.marks.removeAll(true);

        [...known.entries()].sort((a, b) => a[1] - b[1]).forEach(([label, ms], i) => {
            const x = hud.x0 + Math.min(1, ms / this.length) * hud.w;
            hud.marks.add(this.add.rectangle(x, hud.y, 2, 16, 0xcbd5e1, 0.9));
            hud.marks.add(this.add.text(x, hud.y - 14 - (i % 3) * 18, label, {
                fontFamily: 'monospace', fontSize: '13px', color: '#cbd5e1',
            }).setOrigin(0.5, 1));
        });
    }
}

const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: '#05070b',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1920,
        height: 1080,
    },
    render: { antialias: true, roundPixels: true },
    banner: false,
    scene: SCTestScene,
});

// Window-level keys - a paused scene stops listening to its own input.
window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    const scene = game.scene.getScene('SCTest');
    if (!scene) return;

    if (e.code === 'Space'){
        if (scene.sys.isPaused()) game.scene.resume('SCTest');
        else game.scene.pause('SCTest');
    }
    else if (e.code === 'KeyR'){
        scene.scene.restart();
    }
});

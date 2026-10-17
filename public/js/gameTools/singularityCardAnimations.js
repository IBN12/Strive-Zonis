/** |Singularity Card Animations|
 * Strive: We Are Zonis
 *
 * One method per Singularity Card, each the effect that card plays in the
 * arena. The battle scene owns one instance and calls determineSingularityCard()
 * whenever the server reports a card was used - never on a click, so both
 * players see the same effect at the same beat.
 *
 * Every method receives the same context:
 *
 *   ctx.you     true when the card was played by the player at this client
 *   ctx.caster  the arena slot of whoever played it   (root, homeX, homeY, flash, face...)
 *   ctx.rival   the arena slot on the other side of the stage
 *   ctx.event   the raw server event, for anything card specific (targets, amounts)
 *
 * The objects each effect will need are declared as placeholders so the build
 * out is a fill-in rather than a redesign. Until a card has its own effect it
 * plays _cue() - a flash and ring in the card's colours - so a use is never
 * silent while the real effect is being made.
 *
 * |Shader FX (preFX / postFX)|
 * Phaser 3.60+ ships built-in shader effects. Both are WebGL only: under the
 * Canvas renderer the controllers are null, which is why every call goes
 * through pre()/post() below and is written with ?. so it degrades to plain
 * tweens instead of throwing.
 *
 *   preFX   runs on the object's own texture before it is drawn. Only textured
 *           objects have it: Image, Sprite, Text, TileSprite, RenderTexture,
 *           Video. Cheap, and the right tool for a glow on the card art or a
 *           shine across a glyph.
 *   postFX  runs on the object after it is drawn, so it also works on
 *           Containers, Shapes and Graphics - and on a camera, for a whole
 *           screen grade (cameras.main.postFX). Each one costs a render pass,
 *           so add it for the length of the effect and remove it after.
 *
 * Useful ones for these cards: addGlow, addShine, addBloom, addBlur,
 * addBarrel (lens warp), addDisplacement, addVignette, addPixelate,
 * addColorMatrix (desaturate, hue shifts), addGradient, addWipe / addReveal.
 * Each returns a controller whose properties tween like any other target:
 *
 *   const glow = this.pre(art)?.addGlow(card.glow, 0, 0, false, 0.1, 16);
 *   if (glow) scene.tweens.add({ targets: glow, outerStrength: 6, yoyo: true, duration: 300 });
 *   // ...and when the effect is over:
 *   art.preFX?.remove(glow);
 */

// --------------------------------------------------------------- shared --
// Every effect is drawn above the arena cards and the Pattern Bonus aura (50)
// and under the store (60), so opening the store mid-effect still covers it.
const FX_DEPTH = 55;

// Half an arena card's width - CARD_W / 2 in MultiplayerBattleScene. A strike
// leaves from the caster's leading edge and lands on the rival's.
const CARD_HALF_W = 150;

// Half its height - CARD_H / 2. The affliction badge sits just above the card.
const CARD_HALF_H = 165;

// A soft white disc, generated once and tinted per use - the glow every pulse,
// flare and halo is built from. Shapes have hard edges; this does not.
const RADIAL_KEY  = 'scfxRadial';
const RADIAL_SIZE = 256;

// --------------------------------------------------------- nova burst ----
/** The Nova Burst art, keyed for the texture cache. See preload(). */
const NOVA_ART = {
    novaBurstWave:  'assets/singularityImages/novaBurst/nova_burst_no_bg_1.png',  // the crescent wave
    novaBurstComet: 'assets/singularityImages/novaBurst/nova_burst_no_bg_2.png',  // the comet bolt
    novaBurstSlash: 'assets/singularityImages/novaBurst/nova_burst_no_bg_4.png',  // the slash arc
};

/** The three images flipped through as one sprite - the energy core's flicker. */
const NOVA_FLICKER = 'novaBurstFlicker';

// Where the comet art's head sits in its 1024px frame, and the way it points
// (tail -> head, in radians). Rotating by `direction - NOVA_COMET_ANGLE` aims
// the head anywhere, and the origin keeps the head on the position being moved.
const NOVA_COMET_HEAD  = { x: 130 / 1024, y: 820 / 1024 };
const NOVA_COMET_ANGLE = Math.atan2(820 - 235, 130 - 940);

const NOVA_BLUE   = 0x1e90ff;
const NOVA_CYAN   = 0x4fc3ff;
const NOVA_ICE    = 0x9be8ff;
const NOVA_WHITE  = 0xeaf9ff;
const NOVA_MOTES  = [NOVA_BLUE, NOVA_CYAN, NOVA_ICE, 0xffffff];

/**
 * The Nova Burst clock. The battle scene reads it to know when to land each
 * strike, and the server's RULES.SINGULARITY_ATTACK_GRACE_MS is sized to the
 * total (CHARGE + GAP + FLIGHT + SETTLE), so change both together.
 *
 * Every beat is announced as a scene event the moment it plays:
 *
 *   scene.events.on('singularityfx:beat', ({ card, beat, you }) => { ... });
 *
 * which is where the sound effects plug in - no timing to duplicate. The
 * initiation beats are listed below; each strike adds 'strike1:launch',
 * 'strike1:impact', 'strike2:launch', 'strike2:impact'.
 */
export const NOVA_BURST_TIMING = {
    CHARGE_MS:     2300,    // the card played -> the first strike leaving
    STRIKE_GAP_MS: 1150,    // first strike leaving -> second strike leaving
    FLIGHT_MS:     340,     // a strike leaving the caster -> landing on the rival
    SETTLE_MS:     750,     // the last strike landing -> the board catching up

    BEATS: {
        gather:  0,         // the stage dims, light starts pulling in
        pulse1:  320,       // three energy pulses, each larger than the last
        pulse2:  760,
        pulse3:  1200,
        ignite:  1720,      // the vortex collapses and the core ignites
        launch:  2300,      // = CHARGE_MS - the first strike leaves
    },
};

// -------------------------------------------------- containment field ----
/** The Containment Field art, keyed for the texture cache. See preload(). */
const FIELD_ART = {
    fieldRingFlame: 'assets/singularityImages/containmentField/containment_field_no_bg_1.png',  // flame-wrapped ring
    fieldRingBolt:  'assets/singularityImages/containmentField/containment_field_no_bg_2.png',  // the bright, banded ring
    fieldVortex:    'assets/singularityImages/containmentField/containment_field_no_bg_3.png',  // the filled vortex
    fieldRingSmoke: 'assets/singularityImages/containmentField/containment_field_no_bg_4.png',  // the smoky, crackling ring
};

/** The three ring images flipped through as one sprite - the field's living edge. */
const FIELD_FLICKER = 'containmentFieldFlicker';

// The ring art's band sits about 340px out from the centre of its 1024px
// frame. At this scale the band - and the bright edge drawn on it - runs just
// outside the arena card's corners (a 300 x 330 card reaches 223px out).
// Raise it to push the field further out.
const FIELD_SCALE = 0.68;
const FIELD_BAND  = 340;

const FIELD_RED   = 0xff1a1a;
const FIELD_HOT   = 0xff4d4d;
const FIELD_EMBER = 0xff8a70;
const FIELD_DEEP  = 0x9a0000;
const FIELD_WHITE = 0xfff1ee;
const FIELD_MOTES = [FIELD_RED, FIELD_HOT, FIELD_EMBER, FIELD_WHITE];

/**
 * The Containment Field clock. The battle scene holds the board for HOLD_MS
 * while the field forms, and the server's RULES.SINGULARITY_DEFENCE_GRACE_MS
 * is sized to it, so change both together. Every beat is announced on
 * 'singularityfx:beat' like the Nova Burst ones; the standing field adds
 * 'struck' and 'broken'.
 */
export const CONTAINMENT_FIELD_TIMING = {
    HOLD_MS: 2700,          // the card played -> the board handed back

    BEATS: {
        gather:   0,        // the stage goes dark, red light drawn in to the card
        ring1:    240,      // four red circles thrown off the card, overlapping,
        ring2:    500,      // each starting small and growing larger than the last
        ring3:    760,
        ring4:    1020,
        explode:  1500,     // the core detonates - the brightest beat of the card
        form:     1900,     // the standing field settles round the card
    },
};

// --------------------------------------------------------- light mend ----
/** The Light Mend art, keyed for the texture cache. See preload(). */
const MEND_ART = {
    mendRing:   'assets/singularityImages/lightMend/light_mend_no_bg_1.png',  // the misted ring
    mendSwirl:  'assets/singularityImages/lightMend/light_mend_no_bg_2.png',  // the crescent swirl
    mendBloom:  'assets/singularityImages/lightMend/light_mend_no_bg_3.png',  // the bloom with an open heart
    mendStreak: 'assets/singularityImages/lightMend/light_mend_no_bg_4.png',  // the diagonal flare
};

/** All four images flipped through as one sprite - the mend's living light. */
const MEND_FLICKER = 'lightMendFlicker';

// A soft-edged plus, generated once and tinted per use - the healing cross.
const CROSS_KEY  = 'scfxCross';
const CROSS_SIZE = 256;

const MEND_GREEN = 0x1dff3c;
const MEND_LIME  = 0x8dff5a;
const MEND_MINT  = 0xb8ffc8;
const MEND_DEEP  = 0x007a1c;
const MEND_WHITE = 0xf2fff4;
const MEND_MOTES = [MEND_GREEN, MEND_LIME, MEND_MINT, MEND_WHITE];

/**
 * The Light Mend clock. The battle scene holds the board for HOLD_MS and
 * refills the ESSE bar on 'restore'; the server's RULES.SINGULARITY_HEAL_GRACE_MS
 * is sized to HOLD_MS, so change both together. Every beat is announced on
 * 'singularityfx:beat' like the other cards'.
 *
 * Nothing stays on the card afterwards - a heal has no after effect.
 */
export const LIGHT_MEND_TIMING = {
    HOLD_MS: 3000,          // the card played -> the board handed back

    BEATS: {
        cross:    0,        // the stage goes black; green crosses snap onto the card
        shower:   380,      // light starts raining down onto the card
        gather:   1250,     // the shower is drawn into the cross, which burns white
        restore:  1850,     // the burst - ESSE refills; the brightest beat of the card
        fade:     2450,     // the stage comes back, the card left clean
    },
};

// --------------------------------------------------------- heavy mend ----
/** The Heavy Mend art, keyed for the texture cache. See preload(). */
const HEAVY_ART = {
    heavyRing:     'assets/singularityImages/heavyMend/heavy_mend_v2_no_bg_1.png',  // the ragged nebula ring
    heavyHalo:     'assets/singularityImages/heavyMend/heavy_mend_v2_no_bg_2.png',  // the tilted ring, its hot spot low
    heavyCrescent: 'assets/singularityImages/heavyMend/heavy_mend_v2_no_bg_3.png',  // the smoky crescent
    heavyNebula:   'assets/singularityImages/heavyMend/heavy_mend_v2_no_bg_4.png',  // the double ring round a white core
};

/** All four images flipped through as one sprite - the heavy mend's churning light. */
const HEAVY_FLICKER = 'heavyMendFlicker';

// The giant cross: four blades tapering to needle points, generated once and
// tinted per use. Drawn at HEAVY_CROSS_SIZE; its vertical blades reach
// HEAVY_CROSS_LONG from the centre, the side blades HEAVY_CROSS_SIDE.
const SHARP_CROSS_KEY  = 'scfxSharpCross';
const HEAVY_CROSS_SIZE = 512;
const HEAVY_CROSS_LONG = 240;
const HEAVY_CROSS_SIDE = 170;

// At this scale the cross stands well past the top and bottom of the arena
// card (330 tall) - it is meant to dwarf it.
const HEAVY_CROSS_SCALE = 1.25;

const HEAVY_PURPLE   = 0x8a3cff;
const HEAVY_VIOLET   = 0xa45cff;
const HEAVY_LAVENDER = 0xc9a8ff;
const HEAVY_LILAC    = 0xe2d2ff;
const HEAVY_MAGENTA  = 0xd36bff;
const HEAVY_DEEP     = 0x3d0a8c;
const HEAVY_WHITE    = 0xfaf6ff;
const HEAVY_INK      = 0x030008;
const HEAVY_MOTES    = [HEAVY_PURPLE, HEAVY_VIOLET, HEAVY_LAVENDER, HEAVY_LILAC, HEAVY_WHITE];

/**
 * The Heavy Mend clock. The battle scene holds the board for HOLD_MS and
 * refills the ESSE bar on 'restore'; the server's HEAVY_MEND_ATT.GRACE_MS is
 * sized to HOLD_MS, so change both together. Every beat is announced on
 * 'singularityfx:beat' like the other cards'.
 *
 * Nothing stays on the card afterwards - a heal has no after effect.
 */
export const HEAVY_MEND_TIMING = {
    HOLD_MS: 4300,          // the card played -> the board handed back

    BEATS: {
        dim:      0,        // the arena drains to near black; purple light pulled in to the card
        cross:    480,      // the giant sharp cross slams down onto the card
        shower:   760,      // a torrent of purple light rains onto the card
        surge:    1900,     // a pillar of light drives down through it; the cross crackles
        gather:   2700,     // everything is drawn into the cross, which burns white
        restore:  3250,     // the burst - ESSE refills; the brightest beat of the card
        fade:     3800,     // the arena comes back, the card left clean
    },
};

// --------------------------------------------------- dark disturbance ----
/** The Dark Disturbance art, keyed for the texture cache. See preload(). */
const DARK_ART = {
    darkLight1: 'assets/singularityImages/darkDisturbance/dark_disturbance_light_no_bg_1.png',  // blue star, ember sparks
    darkLight2: 'assets/singularityImages/darkDisturbance/dark_disturbance_light_no_bg_2.png',  // the spiked star
    darkLight3: 'assets/singularityImages/darkDisturbance/dark_disturbance_light_no_bg_3.png',  // star in a sphere, long flare
    darkLight4: 'assets/singularityImages/darkDisturbance/dark_disturbance_light_no_bg_4.png',  // the clean white star
    darkVoid1Raw: 'assets/singularityImages/darkDisturbance/dark_disturbance_no_bg_1.png',      // the wide, pale-rimmed void
    darkVoid2Raw: 'assets/singularityImages/darkDisturbance/dark_disturbance_no_bg_2.png',      // the spiralling void
    darkVoid3Raw: 'assets/singularityImages/darkDisturbance/dark_disturbance_no_bg_3.png',      // the void in grey smoke
    darkVoid4Raw: 'assets/singularityImages/darkDisturbance/dark_disturbance_no_bg_4.png',      // the blue-rimmed void
};

// The void art runs to the very edge of its frame, so turned it shows the
// frame's straight sides. Each is redrawn once with its edge feathered away -
// 'darkVoid1Raw' -> 'darkVoid1' - and only the feathered copies are drawn.
// See _featherVoids().
const DARK_VOID_KEYS = ['darkVoid1', 'darkVoid2', 'darkVoid3', 'darkVoid4'];

/** The four star images flipped through as one sprite - the light's flicker. */
const DARK_LIGHT_FLICKER = 'darkDisturbanceLight';

/** The four void images flipped through as one sprite - the void churning. */
const DARK_VOID_FLICKER = 'darkDisturbanceVoid';

// The void art is opaque black at its heart, so it is drawn with the NORMAL
// blend - ADD would wash the dark out to nothing. Its body fills most of the
// 1024px frame: at PEAK it swallows the whole card, at AURA (the standing
// affliction, behind the card) only its churning rim shows past the corners.
const DARK_VOID_PEAK  = 0.78;
const DARK_AURA_SCALE = 0.46;

const DARK_VIOLET = 0xbb00ff;
const DARK_PINK   = 0xee44ff;
const DARK_INDIGO = 0x5a2cff;
const DARK_DEEP   = 0x2a0040;
const DARK_SMOLDER = 0x5c14a8;   // the afflicted card's standing glow - dark, not bright
const DARK_INK    = 0x04000a;
const DARK_WHITE  = 0xf4ecff;
const DARK_STAR   = 0x9fd8ff;    // the blue-white of the light art
const DARK_STAR_MOTES = [0x4fb4ff, DARK_STAR, 0xffffff, 0xffa060];
const DARK_VOID_MOTES = [DARK_VIOLET, DARK_PINK, DARK_INDIGO, DARK_WHITE];

/**
 * The Dark Disturbance clock. The battle scene holds the board for HOLD_MS
 * while the void forms, and the server's RULES.SINGULARITY_AFFLICTION_GRACE_MS
 * is sized to it, so change both together. Every beat is announced on
 * 'singularityfx:beat' like the other cards'; the standing affliction adds
 * 'tick' (each attack it bleeds) and 'lifted'.
 */
export const DARK_DISTURBANCE_TIMING = {
    HOLD_MS: 4300,          // the card played -> the board handed back

    BEATS: {
        gather:   0,        // the stage goes dark; starlight drawn to the middle
        kindle:   260,      // a star kindles between the two cards, flickering
        blaze:    1000,     // it burns its brightest - the stage lit blue-white
        disperse: 1500,     // the light breaks apart, dragged toward the rival
        rift:     1750,     // a speck of void tears open on the rival's card
        build:    1900,     // the void grows in surges, the screen shaking harder
        consume:  3350,     // it closes over the card and collapses into it
        seal:     3800,     // the stage comes back; COSMIC DARKNESS stays on the card
    },
};

// -------------------------------------------------------- an artifact ----
/** The An Artifact art, keyed for the texture cache. See preload(). */
const ARTIFACT_ART = {
    artifactRelic1: 'assets/singularityImages/anArtifact/an_artifact_no_bg_1.png',             // the crystal, four
    artifactRelic2: 'assets/singularityImages/anArtifact/an_artifact_no_bg_2.png',             // views of it - turned
    artifactRelic3: 'assets/singularityImages/anArtifact/an_artifact_no_bg_3.png',             // through one by one,
    artifactRelic4: 'assets/singularityImages/anArtifact/an_artifact_no_bg_4.png',             // they read as a spin
    artifactBlast1: 'assets/singularityImages/anArtifact/an_artifact_new_charge_no_bg_1.png',  // the blue energy
    artifactBlast2: 'assets/singularityImages/anArtifact/an_artifact_new_charge_no_bg_2.png',  // bursts
    artifactBlast3: 'assets/singularityImages/anArtifact/an_artifact_new_charge_no_bg_3.png',
    artifactBlast4: 'assets/singularityImages/anArtifact/an_artifact_new_charge_no_bg_4.png',
};

const ARTIFACT_RELIC_KEYS = ['artifactRelic1', 'artifactRelic2', 'artifactRelic3', 'artifactRelic4'];

// The blast art runs into the corners of its frame. These are the same four
// bursts with a round, feathered edge, drawn once - see _featherBlast().
const ARTIFACT_BLAST_KEYS = ['artifactBlastSoft1', 'artifactBlastSoft2', 'artifactBlastSoft3', 'artifactBlastSoft4'];

/** The four bursts flipped as one sprite - the energy crackling. */
const ARTIFACT_BLAST = 'anArtifactBlast';

// The crystal's colours: ice and silver round a deep cosmic blue, a blush of
// pink on its facets. The blast's: cobalt and azure, sky blue and frost to a
// white-hot heart.
const ARTIFACT_ICE     = 0xbfd8ff;
const ARTIFACT_SILVER  = 0xe4e8ff;
const ARTIFACT_COSMIC  = 0x3a5cff;
const ARTIFACT_VIOLET  = 0x9b5cff;
const ARTIFACT_PINK    = 0xffb3e6;
const ARTIFACT_DEEP    = 0x0a4fc0;
const ARTIFACT_COBALT  = 0x1570e1;
const ARTIFACT_AZURE   = 0x3a9cf2;
const ARTIFACT_SKY     = 0x71c4fb;
const ARTIFACT_FROST   = 0xa9dcfb;
const ARTIFACT_WHITE   = 0xf6f4ff;
const ARTIFACT_INK     = 0x05030f;
const ARTIFACT_LIGHT_MOTES  = [ARTIFACT_ICE, ARTIFACT_SILVER, ARTIFACT_PINK, ARTIFACT_WHITE, ARTIFACT_COSMIC];
const ARTIFACT_ENERGY_MOTES = [ARTIFACT_COBALT, ARTIFACT_AZURE, ARTIFACT_SKY, ARTIFACT_FROST, ARTIFACT_WHITE];

/**
 * The An Artifact clock - one strike. The server's AN_ARTIFACT.GRACE_MS is
 * sized to the total (CHARGE + FLIGHT + SETTLE), so change both together.
 * Beats are announced like the Nova Burst's; the strike adds
 * 'strike1:launch' and 'strike1:impact'.
 */
export const AN_ARTIFACT_TIMING = {
    CHARGE_MS:     3400,    // the card played -> the critical leaving
    STRIKE_GAP_MS: 0,       // one strike only
    FLIGHT_MS:     380,     // the critical leaving the caster -> landing on the rival
    SETTLE_MS:     850,     // the critical landing -> the board catching up

    BEATS: {
        gather:   0,        // the stage goes dark
        open:     250,      // a line of light opens across the middle of the arena
        reveal:   620,      // the crystal turns out of the light, spinning
        flash:    1450,     // it flashes white
        dart:     1650,     // and darts to the caster's card
        explode:  1950,     // it hits the card and explodes - blue energy across the stage
        radiate:  2250,     // energy keeps pouring off the card; the crystal re-forms in it
        launch:   3400,     // = CHARGE_MS - the critical leaves
    },
};

// ------------------------------------------------ pattern interruption ----
/** The Pattern Interruption art, keyed for the texture cache. See preload(). */
const PATTERN_ART = {
    patternArt1: 'assets/singularityImages/patternInterruption/pattern_interruption_no_bg_1.png',
    patternArt2: 'assets/singularityImages/patternInterruption/pattern_interruption_no_bg_2.png',
    patternArt3: 'assets/singularityImages/patternInterruption/pattern_interruption_no_bg_3.png',
    patternArt4: 'assets/singularityImages/patternInterruption/pattern_interruption_no_bg_4.png',
};

// The art runs right off its frame - feathered into these, see _featherPatterns().
const PATTERN_SOFT_KEYS = ['patternSoft1', 'patternSoft2', 'patternSoft3', 'patternSoft4'];

/** The four splashes flipped through as one sprite - the colour churning. */
const PATTERN_FLICKER = 'patternInterruptionFlicker';

// Every colour of the spectrum, in order - the spirals, rings and bursts are
// dealt out of it so nothing comes out in one hue.
const PATTERN_RAINBOW = [0xff2d55, 0xff7a00, 0xffe600, 0x39ff6a, 0x00e5ff, 0x2f6bff, 0xa94dff, 0xff3df2];
const PATTERN_WHITE   = 0xfffaf2;
const PATTERN_GOLD    = 0xfacc15;
const PATTERN_INK     = 0x020006;

/**
 * The Pattern Interruption clock. The battle scene holds the board for
 * HOLD_MS and tears the afflictions off on 'cleanse'; the server's
 * PATTERN_INTERRUPTION_ATT.GRACE_MS is sized to HOLD_MS, so change both
 * together. Every beat is announced on 'singularityfx:beat' like the others.
 *
 * Nothing stays on the card afterwards - the card is left clean.
 */
export const PATTERN_INTERRUPTION_TIMING = {
    HOLD_MS: 4600,          // the card played -> the board handed back

    BEATS: {
        dim:      0,        // the arena drains to black; the card alone burns in shifting colour
        spiral:   380,      // spirals of every colour sweep in from off stage and loop the card and screen
        converge: 2400,     // the spirals tighten and race into the card; the art is sucked in after them
        cleanse:  3350,     // it all hits the card - the burst; every affliction is torn off
        fade:     3950,     // the arena comes back, the card left clean
    },
};

/** Attack attribute cards -> their clock. A card listed here holds its strikes. */
const TIMELINES = {
    nova_burst: NOVA_BURST_TIMING,
    an_artifact: AN_ARTIFACT_TIMING,
};

/** Defence attribute cards -> their clock. A card listed here holds the board while it forms. */
const DEFENCE_TIMELINES = {
    containment_field: CONTAINMENT_FIELD_TIMING,
};

/** Healing attribute cards -> their clock. A card listed here holds the board while it mends. */
const HEAL_TIMELINES = {
    light_mend: LIGHT_MEND_TIMING,
    heavy_mend: HEAVY_MEND_TIMING,
};

/** Affliction attribute cards -> their clock. A card listed here holds the board while it is cast. */
const AFFLICTION_TIMELINES = {
    dark_disturbance: DARK_DISTURBANCE_TIMING,
};

/** Cleanse attribute cards -> their clock. A card listed here holds the board while it plays. */
const CLEANSE_TIMELINES = {
    pattern_interruption: PATTERN_INTERRUPTION_TIMING,
};

/** Card id -> the method that plays it. */
const PLAYBOOK = {
    nova_burst:         'NOVA_BURST',
    containment_field:  'CONTAINMENT_FIELD',
    light_mend:         'LIGHT_MEND',
    dark_disturbance:   'DARK_DISTURBANCE',
    an_artifact:        'AN_ARTIFACT',
    heavy_mend:         'HEAVY_MEND',
    pattern_interruption: 'PATTERN_INTERRUPTION',
    el_draco:           'EL_DRACO',
    samsara_wheel:      'SAMSARA_WHEEL',
    sphere_network:     'SPHERE_NETWORK',
    my_lost_love:       'MY_LOST_LOVE',
    the_return:         'THE_RETURN',
};

/** Card id -> the method that plays each of its strikes (attack cards only). */
const STRIKEBOOK = {
    nova_burst: 'NOVA_BURST_STRIKE',
    an_artifact: 'AN_ARTIFACT_STRIKE',
};

export default class SingularityCardAnimations {
    /** Queue every card's art. Call from the owning scene's preload(). */
    static preload(scene){
        Object.entries({ ...NOVA_ART, ...FIELD_ART, ...MEND_ART, ...HEAVY_ART, ...DARK_ART, ...ARTIFACT_ART, ...PATTERN_ART }).forEach(([key, path]) => {
            if (!scene.textures.exists(key)) scene.load.image(key, path);
        });
    }

    constructor(scene){
        this.scene = scene;
        this.card  = null;          // the card currently playing
        this.webgl = scene.sys.game.renderer.type === Phaser.WEBGL;
        this.nova  = null;          // what a Nova Burst leaves standing between its beats
        this.relic = null;          // what An Artifact leaves standing until its strike
        this.fields = new Map();    // arena slot -> the field standing round it
        this.hexes  = new Map();    // arena slot -> the affliction its card carries

        this._radialTexture();
        this._crossTexture();
        this._sharpCrossTexture();
        this._buildAnims();
    }

    /** Play whichever effect belongs to this card. Unknown cards are ignored. */
    determineSingularityCard(card, ctx = {}){
        const method = this[PLAYBOOK[card?.id]];
        if (!method) return;

        this.card = card;
        method.call(this, card, ctx);
    }

    /** The clock of an attack card, or null for a card that does not strike. */
    timelineOf(card){
        return TIMELINES[card?.id] ?? null;
    }

    /** How long a Defence card holds the board while it forms, or 0. */
    holdOf(card){
        return DEFENCE_TIMELINES[card?.id]?.HOLD_MS ?? 0;
    }

    /** The clock of a Healing card, or null for a card that does not heal. */
    mendOf(card){
        return HEAL_TIMELINES[card?.id] ?? null;
    }

    /** The clock of an Affliction card, or null for a card that does not afflict. */
    hexOf(card){
        return AFFLICTION_TIMELINES[card?.id] ?? null;
    }

    /** The clock of a Cleanse card, or null for a card that does not cleanse. */
    cleanseOf(card){
        return CLEANSE_TIMELINES[card?.id] ?? null;
    }

    /**
     * Play one strike of an attack card. The battle scene calls this when the
     * strike leaves, and lands its own hit (lunge, shake, damage) FLIGHT_MS
     * later, so the two meet on the rival's card.
     *
     * @param {number} n   which strike, from 1
     * @param {number} of  how many the move holds - the last one cleans up
     */
    strikeSingularityCard(card, ctx, ev, n, of){
        const method = this[STRIKEBOOK[card?.id]];
        if (!method) return;

        method.call(this, card, ctx, ev, n, of);
    }

    /**
     * Keep a slot's field in step with the server's state for that side. The
     * field stays with the card it was raised on through a swap, so it shows
     * only while that card is the one in the arena. A field the state carries
     * that this client never saw form (a resync) is put straight up.
     */
    syncField(slot, side){
        if (!slot?.root) return;

        const want  = side?.field ?? null;
        let   field = this.fields.get(slot);

        // Forming and breaking fields run to their own clock, not the state's.
        if (field?.forming || field?.breaking) return;

        if (!want || !DEFENCE_TIMELINES[want.singularity]){
            if (field) this._fieldRemove(slot);
            return;
        }

        if (!field){
            field = this._fieldRecord(slot, { id: want.singularity }, false);
            this._fieldStand(field);
        }

        this._fieldShow(field, want.cardId === side.activeCardId);
    }

    /**
     * A blow landing on a standing field. The scene calls this at the moment of
     * contact: the field flares on the side it was struck from, ripples out
     * from there, and the blow's shards are thrown back off it.
     */
    fieldStruck(slot, x, y){
        const { scene } = this;

        const field = this.fields.get(slot);
        if (!field?.parts) return;

        scene.events.emit('singularityfx:beat', { card: field.card.id, beat: 'struck', you: field.you });

        // Where the blow meets the field - on its edge, facing the attacker.
        const R  = field.parts.radius;
        const a  = Math.atan2(y - slot.homeY, x - slot.homeX);
        const px = slot.homeX + Math.cos(a) * R;
        const py = slot.homeY + Math.sin(a) * R;

        // The arc of the field that took it, burning white then red.
        [[FIELD_RED, 30, 0.75, 520], [FIELD_WHITE, 12, 0.45, 380]].forEach(([color, width, span, ms]) => {
            const arc = scene.add.graphics().setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD);
            arc.setPosition(slot.homeX, slot.homeY);

            scene.tweens.addCounter({
                from:     0,
                to:       1,
                duration: ms,
                ease:     'Cubic.easeOut',
                onUpdate: (tw) => {
                    const t = tw.getValue();

                    arc.clear();
                    arc.lineStyle(width * (1 - t * 0.6), color, 1 - t);
                    arc.beginPath();
                    arc.arc(0, 0, R + t * 18, a - span * (0.4 + t), a + span * (0.4 + t));
                    arc.strokePath();
                },
                onComplete: () => arc.destroy(),
            });
        });

        const flare = this._glow(null, px, py, FIELD_WHITE, 0.25);
        scene.tweens.add({
            targets:    flare,
            scale:      1.6,
            alpha:      { from: 1, to: 0 },
            duration:   360,
            ease:       'Cubic.easeOut',
            onComplete: () => flare.destroy(),
        });

        this._ring(null, px, py, { from: 10, to: 150, width: 10, color: FIELD_HOT,   ms: 460 });
        this._ring(null, slot.homeX, slot.homeY, { from: R, to: R + 90, width: 8, color: FIELD_RED, ms: 620, delay: 60 });

        // The blow's shards, glancing back off the field toward whoever threw it.
        for (let i = 0; i < 14; i++){
            const out = a + Phaser.Math.FloatBetween(-1, 1);
            const len = Phaser.Math.Between(70, 170);

            const shard = scene.add.rectangle(px, py, Phaser.Math.Between(10, 24), 3,
                Phaser.Utils.Array.GetRandom(FIELD_MOTES), 1)
                .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setRotation(out);

            scene.tweens.add({
                targets:    shard,
                x:          px + Math.cos(out) * len,
                y:          py + Math.sin(out) * len,
                scaleX:     0.2,
                alpha:      0,
                duration:   Phaser.Math.Between(320, 560),
                ease:       'Cubic.easeOut',
                onComplete: () => shard.destroy(),
            });
        }

        // The whole field answers the blow.
        const { ringFx, haze } = field.parts;
        if (ringFx) scene.tweens.add({ targets: ringFx, outerStrength: 12, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        scene.tweens.add({ targets: haze, scale: 2.6, duration: 110, yoyo: true, ease: 'Quad.easeOut' });

        const tag = scene.add.text(px, py - 34, 'CONTAINED', {
            fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold',
            color: '#ffe3de', stroke: '#2a0000', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(1.6).setAlpha(0);

        this.pre(tag)?.addGlow(FIELD_RED, 3, 0, false, 0.1, 12);

        scene.tweens.add({ targets: tag, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets:    tag,
            y:          py - 70,
            alpha:      0,
            delay:      620,
            duration:   380,
            ease:       'Cubic.easeIn',
            onComplete: () => tag.destroy(),
        });

        scene.cameras.main.shake(90, 0.002);
    }

    /**
     * Bring a slot's field down - the card it stood round has been attacked.
     * It is marked at once, so a state arriving in the meantime cannot clear it
     * early, and shatters after `delay` (the scene lets the blow land first).
     */
    breakField(slot, delay = 0){
        const field = this.fields.get(slot);
        if (!field || field.breaking) return;

        // Still forming: it comes down the moment it has formed.
        if (field.forming){
            field.pendingBreak = true;
            return;
        }

        field.breaking = true;
        this.scene.time.delayedCall(delay, () => this._fieldShatter(field));
    }

    /**
     * Keep a slot's affliction in step with the server's state for that side.
     * An affliction belongs to the card it was cast on, so it shows only while
     * that card is the one in the arena - swapped out it is taken down, and
     * swapped back in it is stood straight back up. One the state carries that
     * this client never saw cast (a resync) is stood up the same way.
     */
    syncAffliction(slot, side){
        if (!slot?.root) return;

        let hex = this.hexes.get(slot);

        // Casting and lifting afflictions run to their own clock, not the state's.
        if (hex?.forming || hex?.lifting) return;

        const card = side?.cards?.find(c => c.id === side.activeCardId) ?? side?.cards?.[side?.activeIndex];
        const want = card && !card.defeated ? card.affliction ?? null : null;

        if (!want || !AFFLICTION_TIMELINES[want.singularity]){
            if (hex) this._hexRemove(slot);
            return;
        }

        if (hex && hex.cardId !== card.id){
            this._hexRemove(slot);
            hex = null;
        }

        if (!hex){
            hex = this._hexRecord(slot, { id: want.singularity }, false, card.id, want);
            this._hexStand(hex);
        }

        this._hexCount(hex, want.attacksLeft);
    }

    /**
     * An afflicted card has attacked and bled for it. The scene calls this as
     * the attack lands: the void behind the card heaves, darkness is torn off
     * the card into it, and the ESSE it cost rises off the card.
     */
    afflictionTick(slot, ev, delay = 0){
        const { scene } = this;

        scene.time.delayedCall(delay, () => {
            const hex = this.hexes.get(slot);
            if (!hex?.parts || !scene.sys.isActive()) return;

            scene.events.emit('singularityfx:beat', { card: hex.card.id, beat: 'tick', you: hex.you });

            this._hexCount(hex, ev?.attacksLeft);
            this._hexPulse(hex, ev);
        });
    }

    /**
     * An affliction coming off its card - run out of attacks, or its card
     * bled out. It is marked at once, so a state arriving in the meantime
     * cannot clear it early, and lifts after `delay`.
     */
    liftAffliction(slot, ev, delay = 0){
        const hex = this.hexes.get(slot);
        if (!hex || hex.lifting) return;

        // Still being cast: it comes off the moment it has formed.
        if (hex.forming){
            hex.pendingLift = ev ?? {};
            return;
        }

        hex.lifting = true;
        this.scene.time.delayedCall(delay, () => this._hexLift(hex, ev));
    }

    /**
     * A Cleanse card has broken a slot's affliction. Unlike a lift it is torn
     * off at once - the void is shattered outward in dark shards, and the
     * Cleanse card's own effect says what was cured, so no LIFTED tag.
     */
    cleanseAffliction(slot){
        const hex = this.hexes.get(slot);
        if (!hex || hex.lifting) return;

        if (hex.forming){
            hex.pendingLift = { expired: false };
            return;
        }

        hex.lifting = true;
        this._hexLift(hex, { expired: false });
        this._patternShatterHex(slot);
    }

    // ------------------------------------------------------------ fx access --
    // null under Canvas, so a caller writes this.pre(obj)?.addGlow(...) and
    // never has to ask which renderer it is on.
    pre(obj){  return this.webgl ? (obj?.preFX  ?? null) : null; }
    post(obj){ return this.webgl ? (obj?.postFX ?? null) : null; }

    // --------------------------------------------------------------- cards --

    // NOVA BURST: the card strikes twice, on a ladder with no miss in it.
    //
    // The initiation, before either strike leaves (NOVA_BURST_TIMING.BEATS):
    //
    //   gather  the stage dims and light is drawn in to the caster's card
    //   pulse   three large blue energy circles pulse off the card, each larger
    //           than the last, while two crescents orbit it and close in
    //   ignite  the vortex collapses into the core, which flares - rays, a
    //           shockwave, a camera knock and the card's name
    //
    // Then a charged core stays on the caster's edge until the last strike -
    // see NOVA_BURST_STRIKE().
    NOVA_BURST(card, ctx){
        const { scene } = this;
        const { caster } = ctx;
        if (!caster?.root) return;

        const B = NOVA_BURST_TIMING.BEATS;
        const x = caster.homeX;
        const y = caster.homeY;

        // A Nova that never reached its last strike is cleared before this one.
        this._novaCleanup();

        const nova = this.nova = {
            caster,
            depth:    caster.root.depth,
            objects:  [],
            casterFx: null,
            cameraFx: null,
            ember:    null,
        };

        // Lift the caster over the veil, so the card glows in a dark room.
        caster.root.setDepth(FX_DEPTH - 0.5);

        const { width, height } = scene.cameras.main;

        // Filled solid and faded in by its alpha - a zero fill alpha would keep it invisible.
        const veil = this._track(scene.add.rectangle(0, 0, width, height, 0x01040c, 1)
            .setOrigin(0).setDepth(FX_DEPTH - 1).setAlpha(0));

        const root = this._track(scene.add.container(x, y).setDepth(FX_DEPTH));

        // --- gather ---
        this._beat(card, ctx, 'gather', B.gather, () => {
            scene.tweens.add({ targets: veil, alpha: 0.45, duration: 380, ease: 'Sine.easeOut' });

            const vignette = this.post(scene.cameras.main)?.addVignette(0.5, 0.5, 0.95, 0);
            if (vignette){
                nova.cameraFx = vignette;
                scene.tweens.add({ targets: vignette, strength: 0.4, duration: 500, ease: 'Sine.easeOut' });
            }

            nova.casterFx = this.post(caster.root)?.addGlow(NOVA_CYAN, 0, 0, false, 0.1, 18) ?? null;
            if (nova.casterFx){
                scene.tweens.add({ targets: nova.casterFx, outerStrength: 3, duration: 420 });
            }

            this._novaGather(root);
        });

        // --- the core: the three images flipped as one sprite, spun two ways ---
        const halo = this._glow(root, 0, 0, NOVA_BLUE, 0).setAlpha(0);
        const core = root.add(scene.add.sprite(0, 0, 'novaBurstWave')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0).setTint(NOVA_ICE)).last;
        const counter = root.add(scene.add.sprite(0, 0, 'novaBurstSlash')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0).setFlipX(true).setAlpha(0.7)).last;

        core.play(NOVA_FLICKER);
        counter.play({ key: NOVA_FLICKER, startFrame: 1 });

        this._fxGlowOn(core, NOVA_CYAN, 3);

        scene.tweens.add({ targets: core,    angle:  360, duration: 900,  repeat: -1 });
        scene.tweens.add({ targets: counter, angle: -360, duration: 1300, repeat: -1 });

        scene.tweens.add({ targets: core,    scale: 0.2,  duration: 520, delay: 120, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: counter, scale: 0.15, duration: 520, delay: 200, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: halo,    alpha: 0.9, scale: 1.8, duration: 600, delay: 120 });

        // The halo - an energy sphere round the card - swells with each pulse.
        [B.pulse1, B.pulse2, B.pulse3].forEach((at, k) => {
            scene.tweens.add({
                targets:  halo,
                scale:    2.3 + k * 0.35,
                duration: 160,
                delay:    at,
                yoyo:     true,
                hold:     60,
                ease:     'Quad.easeOut',
            });
        });

        // --- two crescents orbiting the card, closing in until the ignite ---
        this._novaVortex(root, B.ignite - 200);

        // --- the pulses ---
        ['pulse1', 'pulse2', 'pulse3'].forEach((beat, k) => {
            this._beat(card, ctx, beat, B[beat], () => this._novaPulse(root, core, k));
        });

        // --- ignite ---
        this._beat(card, ctx, 'ignite', B.ignite, () => {
            this._novaIgnite(root, core, counter, halo);
            this._novaTitle(card, caster);

            scene.tweens.add({ targets: veil, alpha: 0, duration: 480, delay: 120 });
            if (nova.cameraFx){
                scene.tweens.add({ targets: nova.cameraFx, strength: 0, duration: 480, delay: 120 });
            }
        });

        // --- launch: the charge parks on the caster's leading edge ---
        this._beat(card, ctx, 'launch', B.launch, () => {
            nova.ember = this._track(this._novaEmber(caster));
        });

        // A strike that never comes (a dropped batch, a resync) must not
        // leave the stage dark - the strikes would have cleaned up by now.
        const T = NOVA_BURST_TIMING;
        const failsafe = T.CHARGE_MS + T.STRIKE_GAP_MS * 2 + T.FLIGHT_MS + T.SETTLE_MS + 1500;
        nova.failsafe = scene.time.delayedCall(failsafe, () => this._novaCleanup(nova));
    }

    // NOVA_BURST_STRIKE(): One strike - the comet thrown across the lane on an
    // arc (the first high, the second low), afterimages strung behind it,
    // and on contact the slash, a flipbook burst and blue rings over the hit
    // the scene lands on the rival's card at the same instant.
    NOVA_BURST_STRIKE(card, ctx, ev, n, of){
        const { scene } = this;
        const { caster, rival } = ctx;
        if (!caster?.root || !rival?.root) return;

        const T    = NOVA_BURST_TIMING;
        const last = n >= of;
        const tag  = `strike${n}`;

        // From the caster's leading edge to the rival's - the same contact
        // point the scene's _landHit() strikes.
        const x0 = caster.homeX + caster.facing * (CARD_HALF_W + 10);
        const y0 = caster.homeY - 20;
        const x1 = rival.homeX + rival.facing * CARD_HALF_W;
        const y1 = rival.homeY - 20;

        // The arc's control point, off the straight line: high, then low.
        const bend = n % 2 ? -110 : 110;
        const cx   = (x0 + x1) / 2;
        const cy   = (y0 + y1) / 2 + bend;

        this._beat(card, ctx, `${tag}:launch`, 0, () => {
            this._novaLaunchFlare(x0, y0, caster.facing);

            // The ember on the caster's edge kicks with every strike that leaves.
            const ember = this.nova?.ember;
            if (ember?.active){
                const size = ember.getData('baseScale');
                scene.tweens.add({ targets: ember, scale: { from: size * 1.8, to: size }, duration: 260, ease: 'Cubic.easeOut' });
            }
        });

        // --- the comet ---
        const flipped = n % 2 === 0;
        const comet = scene.add.image(x0, y0, 'novaBurstComet')
            .setDepth(FX_DEPTH + 1)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setFlipY(flipped)
            .setOrigin(NOVA_COMET_HEAD.x, flipped ? 1 - NOVA_COMET_HEAD.y : NOVA_COMET_HEAD.y)
            .setScale(0.22);

        const artAngle = flipped ? -NOVA_COMET_ANGLE : NOVA_COMET_ANGLE;

        this._fxGlowOn(comet, NOVA_CYAN, 4);

        const head = scene.add.image(x0, y0, RADIAL_KEY)
            .setDepth(FX_DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD)
            .setTint(NOVA_WHITE).setScale(0.45);

        let lastEcho = 0;

        scene.tweens.addCounter({
            from:     0,
            to:       1,
            duration: T.FLIGHT_MS,
            ease:     'Quad.easeIn',
            onUpdate: (tw) => {
                const t = tw.getValue();
                const u = 1 - t;

                // A quadratic bezier, and its tangent for the heading.
                const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
                const py = u * u * y0 + 2 * u * t * cy + t * t * y1;
                const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
                const dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy);

                comet.setPosition(px, py);
                comet.rotation = Math.atan2(dy, dx) - artAngle;
                comet.setScale(0.22 + 0.3 * t);
                head.setPosition(px, py);

                // Afterimages, strung out behind the comet.
                const now = tw.elapsed;
                if (now - lastEcho >= 28){
                    lastEcho = now;
                    this._novaEcho(comet);
                }
            },
            onComplete: () => {
                comet.destroy();
                head.destroy();
            },
        });

        // --- contact ---
        this._beat(card, ctx, `${tag}:impact`, T.FLIGHT_MS, () => {
            this._novaImpact(x1, y1, n, last, rival);
            if (last) scene.time.delayedCall(T.SETTLE_MS, () => this._novaCleanup());
        });
    }

    // CONTAINMENT FIELD: a Defence card. Raised by DEFEND, it evades 99% of
    // the damage of the next attack on the caster's card.
    //
    // The initiation (CONTAINMENT_FIELD_TIMING.BEATS):
    //
    //   gather   the stage goes dark and red light is drawn in to the card
    //   ring1-4  four bright red circles thrown off the card, overlapping -
    //            each starts small and grows larger than the last, while the
    //            vortex at the card's heart winds up
    //   explode  the vortex detonates: white-hot, then a red blast, rays,
    //            shockwaves and embers - the brightest beat of the card
    //   form     the standing field settles round the card - see _fieldStand()
    //
    // The field then pulses round the card until it is attacked: fieldStruck()
    // lights it where the blow lands, and breakField() brings it down.
    CONTAINMENT_FIELD(card, ctx){
        const { scene } = this;
        const { caster } = ctx;
        if (!caster?.root) return;

        const B = CONTAINMENT_FIELD_TIMING.BEATS;

        // A field this slot already had (a resync drew one) gives way to this one.
        this._fieldRemove(caster);

        const field   = this._fieldRecord(caster, card, !!ctx.you);
        field.forming = true;

        // Lift the caster over the veil, so the card burns in a dark room.
        const depth = caster.root.depth;
        caster.root.setDepth(FX_DEPTH - 0.5);

        const { width, height } = scene.cameras.main;

        // Filled solid and faded in by its alpha - a fill alpha of 0 here
        // would leave the veil invisible however far its alpha is tweened.
        const veil = scene.add.rectangle(0, 0, width, height, 0x0a0000, 1)
            .setOrigin(0).setDepth(FX_DEPTH - 1).setAlpha(0);

        const root = scene.add.container(caster.homeX, caster.homeY).setDepth(FX_DEPTH);

        let vignette = null;

        // --- gather ---
        this._beat(card, ctx, 'gather', B.gather, () => {
            scene.tweens.add({ targets: veil, alpha: 0.62, duration: 320, ease: 'Sine.easeOut' });

            vignette = this.post(scene.cameras.main)?.addVignette(0.5, 0.5, 0.9, 0) ?? null;
            if (vignette){
                scene.tweens.add({ targets: vignette, strength: 0.55, duration: 420, ease: 'Sine.easeOut' });
            }

            field.cardFx = this.post(caster.root)?.addGlow(FIELD_RED, 0, 0, false, 0.1, 18) ?? null;
            if (field.cardFx){
                scene.tweens.add({ targets: field.cardFx, outerStrength: 3, duration: 380 });
            }

            this._fieldGather(root);
        });

        // --- the core: the vortex, winding up on the card as the rings go out ---
        const halo = this._glow(root, 0, 0, FIELD_RED, 0).setAlpha(0);
        const core = root.add(scene.add.image(0, 0, 'fieldVortex')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0)).last;

        this._fxGlowOn(core, FIELD_HOT, 3);

        scene.tweens.add({ targets: core, angle: -360, duration: 1100, repeat: -1 });
        scene.tweens.add({ targets: halo, alpha: 0.85, scale: 1.4, duration: 500, delay: 120 });

        // --- the rings ---
        ['ring1', 'ring2', 'ring3', 'ring4'].forEach((beat, k) => {
            this._beat(card, ctx, beat, B[beat], () => this._fieldRing(root, core, halo, field, k));
        });

        // --- explode ---
        this._beat(card, ctx, 'explode', B.explode, () => {
            this._fieldExplode(root, core, halo, field);
            this._fieldTitle(card, caster);
        });

        // --- form ---
        this._beat(card, ctx, 'form', B.form, () => {
            scene.tweens.add({ targets: veil, alpha: 0, duration: 520, onComplete: () => veil.destroy() });

            if (vignette){
                scene.tweens.add({
                    targets:    vignette,
                    strength:   0,
                    duration:   520,
                    onComplete: () => scene.cameras.main.postFX?.remove(vignette),
                });
            }

            caster.root.setDepth(depth);

            field.forming = false;
            this._fieldStand(field, true);

            // A blow that landed while the field was still forming takes it now.
            if (field.pendingBreak) this.breakField(caster);
        });

        // The blast's debris is all gone by now.
        scene.time.delayedCall(B.form + 1000, () => root.destroy());
    }

    // LIGHT MEND: restores +30 ESSE to the caster's card in the arena.
    //
    // Played on a black stage for contrast (LIGHT_MEND_TIMING.BEATS):
    //
    //   cross    overlapping bright green crosses snap onto the card, each
    //            converging out of a speck
    //   shower   light rains down onto the card - motes and droplet streaks -
    //            while the ring and the flickering mend art sink onto it
    //   gather   the rain is drawn into the cross, which burns white-hot
    //   restore  the burst: all four images thrown open, a particle explosion,
    //            rays, rings and the amount restored - the bar refills here
    //   fade     the stage comes back and every trace is taken off the card
    LIGHT_MEND(card, ctx){
        const { scene } = this;
        const { caster } = ctx;
        if (!caster?.root) return;

        const B = LIGHT_MEND_TIMING.BEATS;

        // Lift the caster over the veil, so the card shines in a dark room.
        const depth = caster.root.depth;
        caster.root.setDepth(FX_DEPTH - 0.5);

        const { width, height } = scene.cameras.main;

        // Filled solid and faded in by its alpha, like the field's veil.
        const veil = scene.add.rectangle(0, 0, width, height, 0x000502, 1)
            .setOrigin(0).setDepth(FX_DEPTH - 1).setAlpha(0);

        // Two layers on the card: the art behind the crosses, the crosses and
        // the light over everything.
        const root  = scene.add.container(caster.homeX, caster.homeY).setDepth(FX_DEPTH);
        const front = scene.add.container(caster.homeX, caster.homeY).setDepth(FX_DEPTH + 1);

        const mend = { caster, cardFx: null, vignette: null, emitters: [] };

        // --- cross ---
        const crosses = this._mendCrosses(front);

        this._beat(card, ctx, 'cross', B.cross, () => {
            scene.tweens.add({ targets: veil, alpha: 0.78, duration: 180, ease: 'Sine.easeOut' });

            mend.vignette = this.post(scene.cameras.main)?.addVignette(0.5, 0.5, 0.9, 0) ?? null;
            if (mend.vignette){
                scene.tweens.add({ targets: mend.vignette, strength: 0.6, duration: 360, ease: 'Sine.easeOut' });
            }

            mend.cardFx = this.post(caster.root)?.addGlow(MEND_GREEN, 0, 0, false, 0.1, 18) ?? null;
            if (mend.cardFx){
                scene.tweens.add({ targets: mend.cardFx, outerStrength: 4, duration: 200, ease: 'Quad.easeOut' });
            }

            this._mendCrossIn(front, crosses);
        });

        // --- shower ---
        const art = this._mendArt(root);

        this._beat(card, ctx, 'shower', B.shower, () => {
            this._mendShower(front, mend, B.restore - B.shower);
            this._mendDescend(art, B.gather - B.shower);
        });

        // --- gather ---
        this._beat(card, ctx, 'gather', B.gather, () => {
            this._mendGather(front, crosses, art, mend);
        });

        // --- restore ---
        this._beat(card, ctx, 'restore', B.restore, () => {
            mend.emitters.forEach(e => e.stop());

            this._mendBurst(root, front, crosses, art, mend);
            this._mendAmount(caster, ctx.event);
            this._mendTitle(card, caster);
        });

        // --- fade: nothing is left on the card ---
        this._beat(card, ctx, 'fade', B.fade, () => {
            scene.tweens.add({ targets: veil, alpha: 0, duration: 480, onComplete: () => veil.destroy() });

            if (mend.vignette){
                const vignette = mend.vignette;
                scene.tweens.add({
                    targets:    vignette,
                    strength:   0,
                    duration:   480,
                    onComplete: () => scene.cameras.main.postFX?.remove(vignette),
                });
            }

            if (mend.cardFx){
                const glow = mend.cardFx;
                scene.tweens.killTweensOf(glow);
                scene.tweens.add({
                    targets:    glow,
                    outerStrength: 0,
                    duration:   480,
                    onComplete: () => caster.root.postFX?.remove(glow),
                });
            }

            caster.root.setDepth(depth);
        });

        // The burst's debris is all gone by now.
        scene.time.delayedCall(LIGHT_MEND_TIMING.HOLD_MS + 600, () => {
            [root, front].forEach(layer => {
                if (!layer.active) return;

                const kill = (obj) => {
                    scene.tweens.killTweensOf(obj);
                    obj.list?.forEach(kill);
                };
                kill(layer);
                layer.destroy();
            });
        });
    }

    // DARK DISTURBANCE: lays COSMIC DARKNESS on the rival's card - it loses
    // 10 ESSE after every attack it attempts, for 8 attacks.
    //
    // Two parts (DARK_DISTURBANCE_TIMING.BEATS). The light, in the middle of
    // the stage between the two cards:
    //
    //   gather    the stage goes dark and starlight is drawn to the middle
    //   kindle    a star kindles there - the four light images flipped as one
    //             sprite, a still star turning behind it, a shine across both
    //   blaze     it burns its brightest: rays, rings, a blue-white wash
    //   disperse  the light breaks apart, and is dragged off toward the rival
    //
    // Then the void, over the rival's card - the part that stands out most:
    //
    //   rift      a speck of void tears open on the card; the card glows violet
    //             and starts to bend into it
    //   build     the void grows from small to large in aggressive surges, the
    //             four void images churning, everything round it sucked in,
    //             and the screen shaking harder with every surge
    //   consume   it closes over the whole card and collapses into it - the
    //             darkest beat of the card
    //   seal      the stage comes back; COSMIC DARKNESS stands on the card -
    //             see _hexStand()
    DARK_DISTURBANCE(card, ctx){
        const { scene } = this;
        const { caster, rival } = ctx;
        if (!rival?.root) return;

        const B   = DARK_DISTURBANCE_TIMING.BEATS;
        const cam = scene.cameras.main;
        const { width, height } = cam;

        // An affliction this slot already showed (a resync) gives way to this one.
        this._hexRemove(rival);

        const hex   = this._hexRecord(rival, card, !!ctx.you, ctx.event?.targetCardId ?? rival.cardId, ctx.event?.affliction);
        hex.forming = true;

        // Between the two cards - the middle of the screen without a caster.
        const mx = caster?.root ? (caster.homeX + rival.homeX) / 2 : width / 2;
        const my = caster?.root ? (caster.homeY + rival.homeY) / 2 : height / 2;

        // Lift the rival over the veil, so the void opens on a card in a dark room.
        const depth = rival.root.depth;
        rival.root.setDepth(FX_DEPTH - 0.5);

        // Filled solid and faded in by its alpha, like the field's veil.
        const veil = scene.add.rectangle(0, 0, width, height, DARK_INK, 1)
            .setOrigin(0).setDepth(FX_DEPTH - 1).setAlpha(0);

        // The star sits in the open stage; the pit is drawn OVER the rival's
        // card, so the void swallows it rather than hiding behind it.
        const star = scene.add.container(mx, my).setDepth(FX_DEPTH);
        const pit  = scene.add.container(rival.homeX, rival.homeY).setDepth(FX_DEPTH + 1);

        const dark = {
            rival,
            vignette:   null,
            warpFx:     null,
            gradeFx:    null,
            gradeTween: null,
            quake:      null,
            light:      null,
            abyss:      null,
        };

        // --- gather ---
        this._beat(card, ctx, 'gather', B.gather, () => {
            scene.tweens.add({ targets: veil, alpha: 0.74, duration: 360, ease: 'Sine.easeOut' });

            dark.vignette = this.post(cam)?.addVignette(0.5, 0.5, 0.9, 0) ?? null;
            if (dark.vignette){
                scene.tweens.add({ targets: dark.vignette, strength: 0.5, duration: 420, ease: 'Sine.easeOut' });
            }

            this._darkGather(star);
        });

        // --- kindle ---
        this._beat(card, ctx, 'kindle', B.kindle, () => {
            dark.light = this._darkKindle(star, B.blaze - B.kindle);
        });

        // --- blaze ---
        this._beat(card, ctx, 'blaze', B.blaze, () => this._darkBlaze(star, dark.light));

        // --- disperse ---
        this._beat(card, ctx, 'disperse', B.disperse, () => this._darkDisperse(star, dark.light, rival));

        // --- rift ---
        this._beat(card, ctx, 'rift', B.rift, () => {
            dark.abyss = this._darkRift(pit, hex, dark);

            // The whole stage loses its colour as the void opens. The tween
            // holds its own reference - seal takes dark.gradeFx down, and a
            // late frame must not reach for it after.
            const gradeFx = this.post(cam)?.addColorMatrix() ?? null;
            dark.gradeFx  = gradeFx;
            if (gradeFx){
                const grade = { t: 0 };
                dark.gradeTween = scene.tweens.add({
                    targets:  grade,
                    t:        1,
                    duration: B.consume - B.rift,
                    ease:     'Sine.easeIn',
                    onUpdate: () => {
                        gradeFx.reset();
                        gradeFx.saturate(-0.55 * grade.t);
                        gradeFx.brightness(1 - 0.18 * grade.t, true);
                    },
                });
            }
        });

        // --- build ---
        this._beat(card, ctx, 'build', B.build, () => this._darkBuild(pit, dark.abyss, hex, dark, B.consume - B.build));

        // --- consume ---
        this._beat(card, ctx, 'consume', B.consume, () => {
            this._darkConsume(pit, dark.abyss, hex, dark);
            this._darkTitle(card, rival, ctx.event?.affliction, mx);
        });

        // --- seal ---
        this._beat(card, ctx, 'seal', B.seal, () => {
            scene.tweens.add({ targets: veil, alpha: 0, duration: 520, onComplete: () => veil.destroy() });

            if (dark.vignette){
                const vignette = dark.vignette;
                scene.tweens.add({
                    targets:    vignette,
                    strength:   0,
                    duration:   520,
                    onComplete: () => cam.postFX?.remove(vignette),
                });
            }

            dark.gradeTween?.remove();
            dark.gradeTween = null;
            if (dark.gradeFx){
                cam.postFX?.remove(dark.gradeFx);
                dark.gradeFx = null;
            }

            if (dark.warpFx){
                const warp = dark.warpFx;
                scene.tweens.killTweensOf(warp);
                scene.tweens.add({
                    targets:    warp,
                    amount:     1,
                    duration:   360,
                    ease:       'Back.easeOut',
                    onComplete: () => rival.root.postFX?.remove(warp),
                });
            }

            rival.root.setDepth(depth);

            hex.forming = false;
            this._hexStand(hex, true);

            // An attack that bled the card while it was still being cast.
            if (hex.pendingLift) this.liftAffliction(rival, hex.pendingLift);
        });

        // Everything the cast threw is gone by now.
        scene.time.delayedCall(DARK_DISTURBANCE_TIMING.HOLD_MS + 700, () => {
            dark.quake?.remove();

            [star, pit].forEach(layer => {
                if (!layer.active) return;

                const kill = (obj) => {
                    scene.tweens.killTweensOf(obj);
                    obj.list?.forEach(kill);
                };
                kill(layer);
                layer.destroy();
            });
        });
    }

    // AN ARTIFACT: an Attack card. Fired by ATTACK, its one strike is a
    // guaranteed critical with +5 on top.
    //
    // Two parts (AN_ARTIFACT_TIMING.BEATS). The crystal, in the middle of the
    // arena:
    //
    //   gather  the stage goes dark
    //   open    a line of light opens across the middle, like an eye
    //   reveal  the crystal turns out of it - spinning, glinting, its name over it
    //   flash   it flashes white and the line closes
    //   dart    it darts to the caster's card, strung with afterimages
    //
    // Then the energy, on the caster's card:
    //
    //   explode  the crystal hits the card and blows apart in blue energy -
    //            blast art, particles thrown across the whole stage, rings,
    //            a lens kick on the camera, and a short shake of the card
    //   radiate  energy keeps pouring off the card, crackling, while the
    //            crystal re-forms at its heart - that is what flies, see
    //            AN_ARTIFACT_STRIKE()
    AN_ARTIFACT(card, ctx){
        const { scene } = this;
        const { caster, rival } = ctx;
        if (!caster?.root) return;

        const B = AN_ARTIFACT_TIMING.BEATS;
        const x = caster.homeX;
        const y = caster.homeY;

        // The middle of the arena - halfway between the two cards.
        const mx = rival?.root ? (caster.homeX + rival.homeX) / 2 : scene.cameras.main.width / 2;
        const my = y;

        // An Artifact that never reached its strike is cleared before this one.
        this._relicCleanup();

        const relic = this.relic = {
            caster,
            depth:    caster.root.depth,
            objects:  [],
            emitters: [],
            casterFx: null,
            cameraFx: null,
            shake:    null,
            barrel:   null,
            aura:     [],
            core:     null,
        };

        // A beat of this artifact - skipped once a newer one has replaced it.
        const at = (beat, fn) => this._beat(card, ctx, beat, B[beat], () => { if (!relic.done) fn(); });

        caster.root.setDepth(FX_DEPTH - 0.5);

        const { width, height } = scene.cameras.main;

        // Filled solid and faded in by its alpha - a zero fill alpha would keep it invisible.
        const veil = this._relicTrack(scene.add.rectangle(0, 0, width, height, ARTIFACT_INK, 1)
            .setOrigin(0).setDepth(FX_DEPTH - 1).setAlpha(0));

        // --- gather ---
        at('gather', () => {
            scene.tweens.add({ targets: veil, alpha: 0.62, duration: 420, ease: 'Sine.easeOut' });

            const vignette = this.post(scene.cameras.main)?.addVignette(0.5, 0.5, 0.95, 0);
            if (vignette){
                relic.cameraFx = vignette;
                scene.tweens.add({ targets: vignette, strength: 0.5, duration: 600, ease: 'Sine.easeOut' });
            }
        });

        // --- the seam the crystal comes out of ---
        const seam = this._relicSeam(mx, my);

        at('open', () => {
            scene.tweens.add({ targets: seam.line, scaleX: 700, duration: 340, ease: 'Expo.easeOut' });
            scene.tweens.add({ targets: seam.lens, scaleX: 3.4, scaleY: 0.03, alpha: 1, duration: 340, ease: 'Expo.easeOut' });
            this._screenFlash(ARTIFACT_ICE, 0.12, 220);
        });

        // --- the crystal ---
        const holder  = this._relicTrack(scene.add.container(mx, my).setDepth(FX_DEPTH + 1).setScale(0));
        const crystal = holder.add(scene.add.sprite(0, 0, ARTIFACT_RELIC_KEYS[0])).last;
        const halo    = this._relicTrack(this._glow(null, mx, my, ARTIFACT_COSMIC, 0).setDepth(FX_DEPTH + 0.5));

        const crystalFx = this.pre(crystal);
        let   glint     = null;
        if (crystalFx){
            crystalFx.setPadding(32);
            glint = crystalFx.addGlow(ARTIFACT_ICE, 2, 0, false, 0.1, 16);
            crystalFx.addShine(0.9, 0.3, 5);
        }

        at('reveal', () => {
            // The lips of the light part and the crystal turns out between them.
            scene.tweens.add({ targets: seam.lens, scaleY: 0.85, duration: 520, ease: 'Sine.easeOut' });
            scene.tweens.add({ targets: seam.tint, scaleY: 0.5, alpha: 0.55, duration: 520, ease: 'Sine.easeOut' });
            scene.tweens.add({ targets: seam.line,  y: -80, scaleX: 480, alpha: 0.5, duration: 520, ease: 'Sine.easeOut' });
            scene.tweens.add({ targets: seam.lower, y:  80, scaleX: 480, alpha: 0.5, duration: 520, ease: 'Sine.easeOut' });
            scene.tweens.add({ targets: seam.rays,  alpha: 1, duration: 400 });

            scene.tweens.add({ targets: holder, scale: 0.44, angle: { from: -120, to: 0 }, duration: 620, ease: 'Back.easeOut' });
            scene.tweens.add({ targets: halo, scale: 2.2, alpha: { from: 0, to: 0.85 }, duration: 520 });
            scene.tweens.add({ targets: crystal, angle: { from: -7, to: 7 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

            relic.spin = this._relicSpin(crystal, 1500);

            this._relicTwinkles(mx, my, 16, 800);
            this._relicTitle(card, mx, my - 190);
        });

        // --- flash ---
        at('flash', () => {
            crystal.setTintFill(0xffffff);
            scene.time.delayedCall(140, () => crystal.active && crystal.clearTint());

            if (glint) scene.tweens.add({ targets: glint, outerStrength: 10, duration: 120, yoyo: true, hold: 60 });
            scene.tweens.add({ targets: holder, scale: 0.52, duration: 120, yoyo: true, ease: 'Quad.easeOut' });

            this._ring(null, mx, my, { from: 40, to: 360, width: 16, color: ARTIFACT_ICE,  ms: 520 });
            this._ring(null, mx, my, { from: 30, to: 260, width: 8,  color: ARTIFACT_PINK, ms: 440, delay: 60 });
            this._screenFlash(ARTIFACT_SILVER, 0.16, 240);

            // The light closes behind it.
            scene.tweens.add({ targets: [seam.lens, seam.tint], scaleY: 0, alpha: 0, duration: 280, ease: 'Cubic.easeIn' });
            scene.tweens.add({ targets: [seam.line, seam.lower], y: 0, alpha: 0, duration: 280, ease: 'Cubic.easeIn' });
            scene.tweens.add({ targets: seam.rays, alpha: 0, scale: 1.4, duration: 320 });

            // Spinning faster as it goes.
            relic.spin?.stop();
            relic.spin = this._relicSpin(crystal, 600);
        });

        // --- dart: straight at the caster's card ---
        at('dart', () => {
            const trail = this._relicEmitter(0, 0, RADIAL_KEY, {
                speed:     { min: 10, max: 60 },
                lifespan:  380,
                scale:     { start: 0.13, end: 0 },
                alpha:     { start: 0.9, end: 0 },
                tint:      ARTIFACT_LIGHT_MOTES,
                blendMode: 'ADD',
                frequency: 10,
                quantity:  2,
            }, FX_DEPTH + 0.5);
            trail.startFollow(holder);

            let lastEcho = 0;
            scene.tweens.add({
                targets:  [holder, halo],
                x,
                y,
                duration: B.explode - B.dart,
                ease:     'Cubic.easeIn',
                onUpdate: (tw) => {
                    if (tw.elapsed - lastEcho < 24) return;
                    lastEcho = tw.elapsed;
                    this._relicEcho(crystal, holder.x, holder.y, holder.scaleX);
                },
            });
            scene.tweens.add({ targets: holder, scale: 0.2,  duration: B.explode - B.dart, ease: 'Cubic.easeIn' });
            scene.tweens.add({ targets: halo,   scale: 1.2,  duration: B.explode - B.dart, ease: 'Cubic.easeIn' });

            scene.time.delayedCall(B.explode - B.dart, () => this._relicRetire(trail, 450));
        });

        // --- explode: the crystal hits the card ---
        at('explode', () => {
            relic.spin?.stop();
            scene.tweens.killTweensOf([holder, halo, crystal]);
            holder.destroy();
            halo.destroy();

            this._relicExplode(relic, x, y);
        });

        // --- radiate: energy pouring off the card until the strike ---
        at('radiate', () => this._relicRadiate(relic, x, y));

        // A strike that never comes (a dropped batch, a resync) must not leave
        // the stage dark - the strike would have cleaned up by now.
        const T = AN_ARTIFACT_TIMING;
        relic.failsafe = scene.time.delayedCall(T.CHARGE_MS + T.FLIGHT_MS + T.SETTLE_MS + 1500,
            () => this._relicCleanup(relic));
    }

    // AN_ARTIFACT_STRIKE(): The critical. The crystal re-formed in the card's
    // energy flies at the rival wrapped in it, strung with blue light, and
    // lands as a blast of shattered crystal and energy over the hit the scene
    // lands at the same instant.
    AN_ARTIFACT_STRIKE(card, ctx, ev, n, of){
        const { scene } = this;
        const { caster, rival } = ctx;
        if (!caster?.root || !rival?.root) return;

        const T     = AN_ARTIFACT_TIMING;
        const relic = this.relic;
        const tag   = `strike${n}`;

        // The card is put back on its mark - the scene lunges it next - and
        // the energy round it is spent into the strike.
        this._relicStopShake(relic);
        this._relicCalm(relic);

        const x1 = rival.homeX + rival.facing * CARD_HALF_W;
        const y1 = rival.homeY - 20;

        // The charge, or one made on the spot for a strike that came early.
        const core = (relic && !relic.done && relic.core?.active)
            ? relic.core
            : this._relicCore(caster.homeX, caster.homeY);
        if (relic) relic.core = null;

        const x0 = core.x;
        const y0 = core.y;
        const cx = (x0 + x1) / 2;
        const cy = Math.min(y0, y1) - 90;

        this._beat(card, ctx, `${tag}:launch`, 0, () => {
            this._screenFlash(ARTIFACT_AZURE, 0.18, 200);
            this._ring(null, x0, y0, { from: 30, to: 220, width: 14, color: ARTIFACT_AZURE, ms: 380 });
            this._ring(null, x0, y0, { from: 20, to: 160, width: 6,  color: ARTIFACT_WHITE,   ms: 320, delay: 40 });
        });

        const trail = this._relicEmitter(0, 0, RADIAL_KEY, {
            speed:     { min: 20, max: 90 },
            lifespan:  { min: 260, max: 460 },
            scale:     { start: 0.2, end: 0 },
            alpha:     { start: 0.9, end: 0 },
            tint:      ARTIFACT_ENERGY_MOTES,
            blendMode: 'ADD',
            frequency: 8,
            quantity:  3,
        }, FX_DEPTH + 1);
        trail.startFollow(core);

        let lastEcho = 0;

        scene.tweens.addCounter({
            from:     0,
            to:       1,
            duration: T.FLIGHT_MS,
            ease:     'Quad.easeIn',
            onUpdate: (tw) => {
                const t = tw.getValue();
                const u = 1 - t;

                const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
                const py = u * u * y0 + 2 * u * t * cy + t * t * y1;

                core.setPosition(px, py);
                core.setScale(1 + 0.5 * t);

                if (tw.elapsed - lastEcho >= 26){
                    lastEcho = tw.elapsed;
                    const crystal = core.getData('crystal');
                    if (crystal?.active){
                        this._relicEcho(crystal, px, py, core.scaleX * core.getData('stone').scaleX, ARTIFACT_AZURE);
                    }
                }
            },
            onComplete: () => {
                this._relicRetire(trail, 500);
                scene.tweens.killTweensOf(core);
                core.list?.forEach(child => scene.tweens.killTweensOf(child));
                core.getData('spin')?.stop();
                core.destroy();
            },
        });

        this._beat(card, ctx, `${tag}:impact`, T.FLIGHT_MS, () => {
            this._relicImpact(x1, y1, rival, ev);
            if (n >= of) scene.time.delayedCall(T.SETTLE_MS, () => this._relicCleanup(relic));
        });
    }

    // HEAVY MEND: restores +75 ESSE to the caster's card in the arena.
    //
    // The Light Mend's big sibling, played on a near-black arena with only the
    // caster's card lit (HEAVY_MEND_TIMING.BEATS):
    //
    //   dim      the arena drains dark under a heavy vignette; purple light is
    //            pulled in from the whole stage, and the art gathers overhead
    //   cross    a giant, needle-pointed cross slams down onto the card -
    //            shock rings, slivers thrown off it, the screen jolts
    //   shower   a torrent of purple light pours onto the card - motes,
    //            streaks, glints and mist, splashing off the card's top edge -
    //            while the art sinks onto it
    //   surge    a pillar of light drives down through the card, the torrent
    //            doubles and lightning crackles along the cross's blades
    //   gather   all of it is drawn into the cross, which burns white-hot
    //   restore  the burst: the cross blown apart, all four images thrown open,
    //            a particle explosion, rays, rings and the amount restored -
    //            the bar refills here
    //   fade     the arena comes back and every trace is taken off the card
    HEAVY_MEND(card, ctx){
        const { scene } = this;
        const { caster } = ctx;
        if (!caster?.root) return;

        const B = HEAVY_MEND_TIMING.BEATS;

        // Lift the caster over the veil, so the card is the only thing lit.
        const depth = caster.root.depth;
        caster.root.setDepth(FX_DEPTH - 0.5);

        const { width, height } = scene.cameras.main;

        // Filled solid and faded in by its alpha - see the field's veil.
        const veil = scene.add.rectangle(0, 0, width, height, HEAVY_INK, 1)
            .setOrigin(0).setDepth(FX_DEPTH - 1).setAlpha(0);

        // A purple pool of light on the veil behind the card, so the dark
        // reads as the mend's and the card's edges glow out of it.
        const pool = this._glow(null, caster.homeX, caster.homeY, HEAVY_PURPLE, 0)
            .setDepth(FX_DEPTH - 0.75).setAlpha(0);

        // The art behind the cross, the cross and the light over everything.
        const root  = scene.add.container(caster.homeX, caster.homeY).setDepth(FX_DEPTH);
        const front = scene.add.container(caster.homeX, caster.homeY).setDepth(FX_DEPTH + 1);

        const mend = { caster, cardFx: null, vignette: null, emitters: [], arcs: null };

        const crosses = this._heavyCrosses(front);
        const art     = this._heavyArt(root);

        // --- dim ---
        this._beat(card, ctx, 'dim', B.dim, () => {
            scene.tweens.add({ targets: veil, alpha: 0.93, duration: 420, ease: 'Sine.easeOut' });
            scene.tweens.add({ targets: pool, scale: 4.4, alpha: 0.5, duration: 700, ease: 'Sine.easeOut' });

            // Centred on the caster, not the screen - the dark closes in round
            // their card and leaves it lit. The shader's y runs bottom-up.
            mend.vignette = this.post(scene.cameras.main)
                ?.addVignette(caster.homeX / width, 1 - caster.homeY / height, 0.82, 0) ?? null;
            if (mend.vignette){
                scene.tweens.add({ targets: mend.vignette, strength: 0.85, duration: 520, ease: 'Sine.easeOut' });
            }

            mend.cardFx = this.post(caster.root)?.addGlow(HEAVY_PURPLE, 0, 0, false, 0.1, 20) ?? null;
            if (mend.cardFx){
                scene.tweens.add({ targets: mend.cardFx, outerStrength: 3, duration: 460, ease: 'Sine.easeOut' });
            }

            this._heavyDraw(front, B.cross);
            this._heavyArtIn(art);
        });

        // --- cross ---
        this._beat(card, ctx, 'cross', B.cross, () => {
            this._heavyCrossSlam(front, crosses, mend);
        });

        // --- shower ---
        this._beat(card, ctx, 'shower', B.shower, () => {
            this._heavyShower(front, mend, B.restore - B.shower);
            this._heavyDescend(art, B.gather - B.shower);
        });

        // --- surge ---
        this._beat(card, ctx, 'surge', B.surge, () => {
            this._heavySurge(root, front, crosses, mend, B.gather - B.surge);
        });

        // --- gather ---
        this._beat(card, ctx, 'gather', B.gather, () => {
            this._heavyGather(front, crosses, art, mend, B.restore - B.gather);
        });

        // --- restore ---
        this._beat(card, ctx, 'restore', B.restore, () => {
            mend.emitters.forEach(e => e.stop());

            this._heavyBurst(root, front, crosses, art, mend);

            const look = { fill: '#f6efff', stroke: '#1c0040', glow: HEAVY_PURPLE };
            this._mendAmount(caster, ctx.event, { ...look, fallback: 75, size: 58 });
            this._mendTitle(card, caster, look);
        });

        // --- fade: nothing is left on the card ---
        this._beat(card, ctx, 'fade', B.fade, () => {
            scene.tweens.add({ targets: veil, alpha: 0, duration: 520, onComplete: () => veil.destroy() });
            scene.tweens.add({ targets: pool, alpha: 0, duration: 520, onComplete: () => pool.destroy() });

            if (mend.vignette){
                const vignette = mend.vignette;
                scene.tweens.add({
                    targets:    vignette,
                    strength:   0,
                    duration:   520,
                    onComplete: () => scene.cameras.main.postFX?.remove(vignette),
                });
            }

            if (mend.cardFx){
                const glow = mend.cardFx;
                scene.tweens.killTweensOf(glow);
                scene.tweens.add({
                    targets:    glow,
                    outerStrength: 0,
                    duration:   520,
                    onComplete: () => caster.root.postFX?.remove(glow),
                });
            }

            caster.root.setDepth(depth);
        });

        // The burst's debris is all gone by now.
        scene.time.delayedCall(HEAVY_MEND_TIMING.HOLD_MS + 800, () => {
            mend.arcs?.timer.remove();

            [root, front].forEach(layer => {
                if (!layer.active) return;

                const kill = (obj) => {
                    scene.tweens.killTweensOf(obj);
                    obj.list?.forEach(kill);
                };
                kill(layer);
                layer.destroy();
            });
        });
    }

    // PATTERN INTERRUPTION: every affliction on the caster's cards is broken.
    //
    // (PATTERN_INTERRUPTION_TIMING.BEATS)
    //
    //   dim       the arena drains to black and the card alone is lit, its
    //             glow cycling through every colour; the art churns open
    //             behind it in shifting hues
    //   spiral    ribbons of colour sweep in from off stage and loop the card
    //             and the whole screen, a storm of motes spiralling with them
    //   converge  the spirals tighten and race into the card, the art is
    //             sucked in after them and the card swells with the light
    //   cleanse   it all hits the card at once - the burst: the art blown
    //             out, rings and rays in every colour, particles bursting all
    //             over the stage; the afflictions are torn off (the scene
    //             calls cleanseAffliction() on this beat)
    //   fade      the arena comes back, the card left clean
    PATTERN_INTERRUPTION(card, ctx){
        const { scene } = this;
        const { caster } = ctx;
        if (!caster?.root) return;

        const B = PATTERN_INTERRUPTION_TIMING.BEATS;

        // Lift the caster over the veil, so the card is the only thing lit.
        const depth = caster.root.depth;
        caster.root.setDepth(FX_DEPTH - 0.5);

        const { width, height } = scene.cameras.main;

        // Filled solid and faded in by its alpha - see the field's veil.
        const veil = scene.add.rectangle(0, 0, width, height, PATTERN_INK, 1)
            .setOrigin(0).setDepth(FX_DEPTH - 1).setAlpha(0);

        // The art churns behind the card; the light pooling in it over it.
        const root = scene.add.container(caster.homeX, caster.homeY).setDepth(FX_DEPTH - 0.7);
        const core = scene.add.image(caster.homeX, caster.homeY, RADIAL_KEY)
            .setBlendMode(Phaser.BlendModes.ADD).setDepth(FX_DEPTH + 1).setScale(0.3).setAlpha(0);

        const pi = {
            caster, root, core,
            hue:      0,           // the colour everything is cycling through, 0..1
            charge:   0,           // how much light has poured into the card, 0..1
            cardFx:   null,
            vignette: null,
            art:      null,
            spirals:  null,
            objects:  [],          // anything else to take down at the end
        };

        // One clock turns every colour in the effect, start to finish.
        const spin = scene.tweens.addCounter({
            from:     0,
            to:       1,
            duration: B.fade + 600,
            onUpdate: (tw) => {
                pi.hue = (tw.getValue() * 2.4) % 1;
                this._patternHueTick(pi);
            },
        });

        // --- dim ---
        this._beat(card, ctx, 'dim', B.dim, () => {
            scene.tweens.add({ targets: veil, alpha: 0.94, duration: 380, ease: 'Sine.easeOut' });

            // Centred on the caster, not the screen. The shader's y runs bottom-up.
            pi.vignette = this.post(scene.cameras.main)
                ?.addVignette(caster.homeX / width, 1 - caster.homeY / height, 0.9, 0) ?? null;
            if (pi.vignette){
                scene.tweens.add({ targets: pi.vignette, strength: 0.7, duration: 480, ease: 'Sine.easeOut' });
            }

            pi.cardFx = this.post(caster.root)?.addGlow(PATTERN_RAINBOW[0], 0, 0, false, 0.1, 20) ?? null;
            if (pi.cardFx){
                scene.tweens.add({ targets: pi.cardFx, outerStrength: 4, duration: 420, ease: 'Sine.easeOut' });
            }

            scene.tweens.add({ targets: core, alpha: 0.35, scale: 0.7, duration: 420, ease: 'Sine.easeOut' });

            pi.art = this._patternArt(root);
            this._patternArtIn(pi.art);
        });

        // --- spiral ---
        this._beat(card, ctx, 'spiral', B.spiral, () => {
            pi.spirals = this._patternSpirals(pi, B.cleanse - B.spiral, B.converge - B.spiral);
        });

        // --- converge ---
        this._beat(card, ctx, 'converge', B.converge, () => {
            const ms = B.cleanse - B.converge;

            this._patternArtCollapse(pi.art, ms);

            scene.tweens.add({ targets: core, scale: 1.7, alpha: 0.9, duration: ms, ease: 'Cubic.easeIn' });
            scene.tweens.addCounter({
                from: 0, to: 1, duration: ms, ease: 'Cubic.easeIn',
                onUpdate: (tw) => { pi.charge = tw.getValue(); },
            });

            if (pi.cardFx){
                scene.tweens.add({ targets: pi.cardFx, outerStrength: 12, duration: ms, ease: 'Cubic.easeIn' });
            }

            // The stage tightens round the card as the light pours in.
            scene.cameras.main.shake(ms, 0.0025);
        });

        // --- cleanse ---
        this._beat(card, ctx, 'cleanse', B.cleanse, () => {
            this._patternBurst(pi);
            this._patternTitle(card, caster, ctx.event);

            scene.tweens.killTweensOf(core);
            scene.tweens.add({ targets: core, scale: 0.9, alpha: 0, duration: 420, ease: 'Cubic.easeOut' });
        });

        // --- fade: nothing is left on the card ---
        this._beat(card, ctx, 'fade', B.fade, () => {
            scene.tweens.add({ targets: veil, alpha: 0, duration: 560, onComplete: () => veil.destroy() });

            if (pi.vignette){
                const vignette = pi.vignette;
                scene.tweens.add({
                    targets:    vignette,
                    strength:   0,
                    duration:   560,
                    onComplete: () => scene.cameras.main.postFX?.remove(vignette),
                });
            }

            if (pi.cardFx){
                const glow = pi.cardFx;
                scene.tweens.killTweensOf(glow);
                scene.tweens.add({
                    targets:    glow,
                    outerStrength: 0,
                    duration:   560,
                    onComplete: () => caster.root.postFX?.remove(glow),
                });
            }

            caster.root.setDepth(depth);
        });

        // The burst's debris is all gone by now.
        scene.time.delayedCall(PATTERN_INTERRUPTION_TIMING.HOLD_MS + 1200, () => {
            spin.remove();
            pi.spirals?.counter.remove();

            const kill = (obj) => {
                scene.tweens.killTweensOf(obj);
                obj.list?.forEach(kill);
            };

            [root, core, ...pi.objects].forEach(obj => {
                if (!obj?.active) return;
                kill(obj);
                obj.destroy();
            });
        });
    }

    // EL DRACO: a non supra card transforms into a supra.
    EL_DRACO(card, ctx){
        const { caster } = ctx;

        let dragonSigil = null;   // the draco mark burning in behind the card
        let flames      = null;
        let ascension   = null;   // the flash the card changes category in
        let wipeFx      = null;   // this.post(caster.face)?.addWipe(...) for the swap of faces

        this._cue(card, caster);
    }

    // SAMSARA WHEEL: debuffs built up critical, transformation and ability stats.
    SAMSARA_WHEEL(card, ctx){
        const { rival } = ctx;

        let wheel      = null;    // the wheel turning over the rival's card
        let spokes     = null;
        let drainTrail = null;    // what the wheel pulls out of the card
        let greyFx     = null;    // this.post(rival.root)?.addColorMatrix() - desaturate as it drains

        this._cue(card, rival);
    }

    // SPHERE NETWORK: +1/2 attack multiplier; Eviden abilities are nullified.
    SPHERE_NETWORK(card, ctx){
        const { caster, rival } = ctx;

        let spheres = null;       // the nodes spinning up around the caster
        let links   = null;       // the lines drawn between them
        let pulse   = null;       // what travels the network to the rival

        this._cue(card, caster);
    }

    // MY LOST LOVE: restores 100% ESSE to every card in the deck.
    MY_LOST_LOVE(card, ctx){
        const { caster } = ctx;

        let petals    = null;
        let heartGlow = null;
        let deckWash  = null;     // the light that runs along the deck shelf
        let gradeFx   = null;     // this.post(scene.cameras.main)?.addColorMatrix() - a warm grade

        this._cue(card, caster);
    }

    // THE RETURN: revives a fallen card.
    THE_RETURN(card, ctx){
        const { caster } = ctx;

        let portal     = null;
        let riseBeam   = null;
        let reviveRing = null;
        let revealFx   = null;    // this.post(revivedFace)?.addReveal(...) as the card comes back

        this._cue(card, caster);
    }

    // ------------------------------------------------------ nova burst parts --

    /** Light pulled in from all round the card to its core. */
    _novaGather(root){
        const { scene } = this;

        for (let i = 0; i < 32; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r    = Phaser.Math.Between(240, 420);
            const tint = Phaser.Utils.Array.GetRandom(NOVA_MOTES);

            const mote = root.add(scene.add.image(Math.cos(a) * r, Math.sin(a) * r, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(tint)
                .setScale(Phaser.Math.FloatBetween(0.04, 0.09)).setAlpha(0)).last;

            scene.tweens.add({
                targets:    mote,
                x:          0,
                y:          0,
                alpha:      { from: 1, to: 0.3 },
                duration:   Phaser.Math.Between(560, 900),
                delay:      Phaser.Math.Between(0, 1250),
                ease:       'Cubic.easeIn',
                onComplete: () => mote.destroy(),
            });
        }
    }

    /**
     * One energy pulse - a blue disc and two rings thrown off the card. `k`
     * is which pulse (0..2): each one is larger and brighter than the last,
     * so the three read as a charge building rather than a loop.
     */
    _novaPulse(root, core, k){
        const { scene } = this;
        const nova = this.nova;

        // Two discs: a wide blue body and a brighter cyan heart inside it.
        [[NOVA_BLUE, 3.4 + k * 0.9, 1], [NOVA_CYAN, 2 + k * 0.5, 0.9]].forEach(([tint, to, from]) => {
            const disc = this._glow(root, 0, 0, tint, 0.3);
            scene.tweens.add({
                targets:    disc,
                scale:      to,
                alpha:      { from, to: 0 },
                duration:   950 + k * 90,
                ease:       'Cubic.easeOut',
                onComplete: () => disc.destroy(),
            });
        });

        this._ring(root, 0, 0, { from: 60,  to: 400 + k * 120, width: 26 + k * 6, color: NOVA_BLUE,  ms: 900 + k * 90 });
        this._ring(root, 0, 0, { from: 50,  to: 330 + k * 100, width: 14 + k * 3, color: NOVA_CYAN,  ms: 820 + k * 80, delay: 50 });
        this._ring(root, 0, 0, { from: 30,  to: 240 + k * 80,  width: 6,          color: NOVA_WHITE, ms: 700,          delay: 110 });

        // The core and the card both beat with it.
        scene.tweens.add({
            targets:  core,
            scale:    0.2 * (1.4 + k * 0.15),
            duration: 140,
            yoyo:     true,
            ease:     'Quad.easeOut',
        });

        if (nova?.casterFx){
            scene.tweens.add({
                targets:       nova.casterFx,
                outerStrength: 6 + k * 2,
                duration:      160,
                yoyo:          true,
                ease:          'Quad.easeOut',
            });
        }

        if (k === 2) scene.cameras.main.shake(110, 0.0022);
    }

    /** Two crescents (the wave art) orbiting the card and closing in on the core. */
    _novaVortex(root, until){
        const { scene } = this;

        ['novaBurstWave', 'novaBurstSlash'].forEach((key, i) => {
            const base = i * Math.PI;
            const img  = root.add(scene.add.image(0, 0, key)
                .setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0)).last;

            this._fxGlowOn(img, NOVA_CYAN, 2);

            scene.tweens.addCounter({
                from:     0,
                to:       1,
                duration: until - 200,
                delay:    200,
                ease:     'Sine.easeIn',
                onUpdate: (tw) => {
                    const t = tw.getValue();
                    const a = base + t * Math.PI * 5;
                    const r = Phaser.Math.Linear(230, 20, t);

                    img.setPosition(Math.cos(a) * r, Math.sin(a) * r * 0.85);
                    img.rotation = a + Math.PI / 2;
                    img.setAlpha(Math.min(1, t * 6) * 0.9);
                    img.setScale(Phaser.Math.Linear(0.22, 0.08, t));
                },
                onComplete: () => img.destroy(),
            });
        });
    }

    /** The vortex collapsing: the core flares, rays and a shockwave go out. */
    _novaIgnite(root, core, counter, halo){
        const { scene } = this;

        const flash = this._glow(root, 0, 0, 0xffffff, 0.2);
        scene.tweens.add({
            targets:    flash,
            scale:      4.2,
            alpha:      { from: 1, to: 0 },
            duration:   460,
            ease:       'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });

        for (let i = 0; i < 18; i++){
            const a   = (i / 18) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
            const len = Phaser.Math.Between(180, 320);

            // Grown by scaleX: a Shape's width can be written but is not redrawn.
            const ray = root.add(scene.add.rectangle(0, 0, len, 3, i % 3 ? NOVA_CYAN : NOVA_WHITE, 1)
                .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setRotation(a).setScale(0, 1)).last;

            scene.tweens.add({
                targets:    ray,
                scaleX:     1,
                alpha:      { from: 1, to: 0 },
                duration:   Phaser.Math.Between(380, 520),
                ease:       'Cubic.easeOut',
                onComplete: () => ray.destroy(),
            });
        }

        this._ring(root, 0, 0, { from: 40, to: 560, width: 22, color: NOVA_BLUE,  ms: 620 });
        this._ring(root, 0, 0, { from: 20, to: 420, width: 8,  color: NOVA_WHITE, ms: 520, delay: 60 });

        // The core flares, then shrinks to the charge the strikes are drawn from.
        scene.tweens.add({
            targets:  core,
            scale:    0.5,
            duration: 120,
            ease:     'Quad.easeOut',
            onComplete: () => scene.tweens.add({
                targets:    [core, counter, halo],
                scale:      0,
                alpha:      0,
                duration:   460,
                ease:       'Cubic.easeIn',
            }),
        });

        scene.cameras.main.shake(200, 0.0045);
        this._screenFlash(NOVA_CYAN, 0.32, 260);
    }

    /** The card's name slammed into the lane beside the caster. */
    _novaTitle(card, caster){
        const { scene } = this;

        const x = caster.homeX + caster.facing * 330;
        const y = caster.homeY - 110;

        const title = scene.add.text(x, y, `${card.icon}  ${card.name}`, {
            fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold',
            color: '#dff6ff', stroke: '#03122a', strokeThickness: 7,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(2.4).setAlpha(0);

        const pre = this.pre(title);
        if (pre){
            pre.setPadding(16);
            pre.addGlow(NOVA_CYAN, 4, 0, false, 0.1, 16);
            pre.addShine(1.2, 0.4, 4);
        }

        scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets:    title,
            alpha:      0,
            y:          y - 40,
            delay:      1250,
            duration:   420,
            ease:       'Cubic.easeIn',
            onComplete: () => title.destroy(),
        });
    }

    /** The charge parked on the caster's leading edge until the last strike. */
    _novaEmber(caster){
        const { scene } = this;

        const ember = scene.add.sprite(caster.homeX + caster.facing * (CARD_HALF_W + 10), caster.homeY - 20, 'novaBurstWave')
            .setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(NOVA_ICE).setScale(0).setAlpha(0.9);

        // About 110px across; each launch kicks it from this size.
        const size = 110 / 1024;
        ember.setData('baseScale', size);

        ember.play(NOVA_FLICKER);
        scene.tweens.add({ targets: ember, scale: size, duration: 200, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: ember, angle: 360, duration: 700, repeat: -1 });

        return ember;
    }

    /** The flare a strike leaves the caster's edge with. */
    _novaLaunchFlare(x, y, facing){
        const { scene } = this;

        const burst = scene.add.sprite(x, y, 'novaBurstSlash')
            .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.08).setFlipX(facing < 0);
        burst.play(NOVA_FLICKER);

        scene.tweens.add({
            targets:    burst,
            scale:      0.3,
            alpha:      { from: 1, to: 0 },
            duration:   300,
            ease:       'Cubic.easeOut',
            onComplete: () => burst.destroy(),
        });

        const flare = scene.add.image(x, y, RADIAL_KEY)
            .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setTint(NOVA_CYAN).setScale(0.3);

        scene.tweens.add({
            targets:    flare,
            scale:      1.1,
            alpha:      { from: 1, to: 0 },
            duration:   280,
            ease:       'Cubic.easeOut',
            onComplete: () => flare.destroy(),
        });
    }

    /** One afterimage of the comet, left where it was and fading. */
    _novaEcho(comet){
        const { scene } = this;

        const echo = scene.add.image(comet.x, comet.y, 'novaBurstComet')
            .setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD)
            .setOrigin(comet.originX, comet.originY).setFlipY(comet.flipY)
            .setRotation(comet.rotation).setScale(comet.scaleX).setTint(NOVA_BLUE).setAlpha(0.45);

        scene.tweens.add({
            targets:    echo,
            alpha:      0,
            scale:      comet.scaleX * 0.85,
            duration:   240,
            ease:       'Quad.easeOut',
            onComplete: () => echo.destroy(),
        });
    }

    /** A strike landing - the slash, a flipbook burst, rings and shards. */
    _novaImpact(x, y, n, last, rival){
        const { scene } = this;

        const slash = scene.add.image(x, y, 'novaBurstSlash')
            .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD)
            .setFlipX(n % 2 === 0).setRotation(n % 2 ? -0.35 : 0.35).setScale(0.1);

        this._fxGlowOn(slash, NOVA_CYAN, 4);

        scene.tweens.add({ targets: slash, scale: last ? 0.5 : 0.4, duration: 160, ease: 'Cubic.easeOut' });
        scene.tweens.add({
            targets:    slash,
            alpha:      0,
            delay:      160,
            duration:   400,
            ease:       'Quad.easeIn',
            onComplete: () => slash.destroy(),
        });

        const burst = scene.add.sprite(x, y, 'novaBurstWave')
            .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.12).setTint(NOVA_ICE);
        burst.play(NOVA_FLICKER);

        scene.tweens.add({
            targets:    burst,
            scale:      last ? 0.55 : 0.42,
            angle:      n % 2 ? 160 : -160,
            alpha:      { from: 1, to: 0 },
            duration:   540,
            ease:       'Cubic.easeOut',
            onComplete: () => burst.destroy(),
        });

        const flash = scene.add.image(x, y, RADIAL_KEY)
            .setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(NOVA_CYAN).setScale(0.4);

        scene.tweens.add({
            targets:    flash,
            scale:      last ? 2.6 : 2,
            alpha:      { from: 1, to: 0 },
            duration:   420,
            ease:       'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });

        this._ring(null, x, y, { from: 30, to: last ? 300 : 220, width: 14, color: NOVA_CYAN,  ms: 520 });
        this._ring(null, x, y, { from: 20, to: last ? 200 : 150, width: 5,  color: NOVA_WHITE, ms: 420, delay: 70 });

        for (let i = 0; i < 14; i++){
            const a   = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const len = Phaser.Math.Between(60, 150);

            const shard = scene.add.rectangle(x, y, Phaser.Math.Between(10, 22), 2.5,
                Phaser.Utils.Array.GetRandom(NOVA_MOTES), 1)
                .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD).setRotation(a);

            scene.tweens.add({
                targets:    shard,
                x:          x + Math.cos(a) * len,
                y:          y + Math.sin(a) * len,
                scaleX:     0.2,
                alpha:      0,
                duration:   Phaser.Math.Between(300, 520),
                ease:       'Cubic.easeOut',
                onComplete: () => shard.destroy(),
            });
        }

        // The rival's card lights blue as the strike passes through it.
        const glow = this.post(rival.root)?.addGlow(NOVA_CYAN, 0, 0, false, 0.1, 16);
        if (glow){
            scene.tweens.add({
                targets:       glow,
                outerStrength: last ? 9 : 7,
                duration:      120,
                yoyo:          true,
                hold:          80,
                ease:          'Quad.easeOut',
                onComplete:    () => rival.root.postFX?.remove(glow),
            });
        }

        if (last){
            this._screenFlash(NOVA_BLUE, 0.26, 220);
            scene.cameras.main.shake(180, 0.004);
        }
    }

    /** Take down whatever a Nova Burst left standing. Safe to call twice. */
    _novaCleanup(nova = this.nova){
        if (!nova || nova.done) return;
        nova.done = true;
        if (this.nova === nova) this.nova = null;

        const { scene } = this;

        nova.failsafe?.remove();

        nova.objects.forEach(obj => {
            if (!obj?.active) return;

            scene.tweens.killTweensOf(obj);
            obj.list?.forEach(child => scene.tweens.killTweensOf(child));

            // The ember and anything left lit fade out rather than blink off.
            scene.tweens.add({
                targets:    obj,
                alpha:      0,
                duration:   260,
                onComplete: () => obj.destroy(),
            });
        });

        if (nova.casterFx){
            const fx = nova.casterFx;
            scene.tweens.killTweensOf(fx);
            scene.tweens.add({
                targets:       fx,
                outerStrength: 0,
                duration:      300,
                onComplete:    () => nova.caster.root?.postFX?.remove(fx),
            });
        }

        if (nova.cameraFx){
            scene.tweens.killTweensOf(nova.cameraFx);
            scene.cameras.main.postFX?.remove(nova.cameraFx);
        }

        nova.caster.root?.setDepth(nova.depth);
    }

    // ------------------------------------------------------ an artifact parts --

    /** Hold an object until the artifact's cleanup takes it down. */
    _relicTrack(obj){
        this.relic?.objects.push(obj);
        return obj;
    }

    /**
     * A particle emitter at FX depth. With `ttl` it is a one-shot: it is
     * exploded by the caller and destroys itself once its particles are out.
     */
    _relicEmitter(x, y, key, config, depth = FX_DEPTH, ttl = 0){
        const emitter = this.scene.add.particles(x, y, key, config).setDepth(depth);

        if (ttl) this.scene.time.delayedCall(ttl, () => emitter.active && emitter.destroy());
        else     this.relic?.emitters.push(emitter);

        return emitter;
    }

    /** Stop an emitter and let the particles it has out finish before it goes. */
    _relicRetire(emitter, ms){
        if (!emitter?.active) return;

        emitter.stop();
        this.scene.time.delayedCall(ms, () => emitter.active && emitter.destroy());
    }

    /**
     * The line of light the crystal comes out of: a hard white hairline (two,
     * once it parts), a soft lens round it that opens like an eye, a violet
     * wash inside, and slow god rays - all under one bloom.
     */
    _relicSeam(x, y){
        const { scene } = this;

        const root = this._relicTrack(scene.add.container(x, y).setDepth(FX_DEPTH));

        const rays = root.add(scene.add.container(0, 0).setAlpha(0)).last;
        for (let i = 0; i < 14; i++){
            const a   = (i / 14) * Math.PI * 2;
            const ray = scene.add.image(0, 0, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? ARTIFACT_ICE : ARTIFACT_PINK)
                .setOrigin(0, 0.5).setScale(Phaser.Math.FloatBetween(1.2, 1.9), 0.035)
                .setRotation(a).setAlpha(0.55);
            rays.add(ray);
        }
        scene.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });

        const tint = root.add(scene.add.image(0, 0, RADIAL_KEY)
            .setBlendMode(Phaser.BlendModes.ADD).setTint(ARTIFACT_VIOLET).setScale(3, 0).setAlpha(0)).last;
        const lens = root.add(scene.add.image(0, 0, RADIAL_KEY)
            .setBlendMode(Phaser.BlendModes.ADD).setTint(ARTIFACT_ICE).setScale(0, 0.02).setAlpha(0)).last;

        // Grown by scaleX: a Shape's width can be written but is not redrawn.
        const line  = root.add(scene.add.rectangle(0, 0, 1, 3, ARTIFACT_WHITE, 1)
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0, 1)).last;
        const lower = root.add(scene.add.rectangle(0, 0, 1, 3, ARTIFACT_WHITE, 1)
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0, 1)).last;

        // The lower lip rides along with the line until they part.
        scene.tweens.add({ targets: lower, scaleX: 700, duration: 340, delay: AN_ARTIFACT_TIMING.BEATS.open, ease: 'Expo.easeOut' });

        this.post(root)?.addBloom(ARTIFACT_ICE, 1, 1, 1, 1.3, 4);

        return { root, rays, tint, lens, line, lower };
    }

    /**
     * Turn the crystal about its upright axis: its width follows cos(angle),
     * and each time it goes edge-on the next of the four views is swapped in,
     * so the art reads as a solid stone turning. Returns the tween.
     */
    _relicSpin(img, msPerTurn){
        let view = ARTIFACT_RELIC_KEYS.indexOf(img.texture.key);
        let sign = 1;

        return this.scene.tweens.addCounter({
            from:     0,
            to:       Math.PI * 2,
            duration: msPerTurn,
            repeat:   -1,
            onUpdate: (tw) => {
                if (!img.active) return;

                const c = Math.cos(tw.getValue());
                const s = c < 0 ? -1 : 1;

                if (s !== sign){
                    sign = s;
                    view = (view + 1) % ARTIFACT_RELIC_KEYS.length;
                    img.setTexture(ARTIFACT_RELIC_KEYS[view]);
                }

                // Never fully edge-on - a hairline would read as a blink.
                img.scaleX = s * Math.max(0.2, Math.abs(c));
            },
        });
    }

    /** Four-point glints winking on and off round a point, over `ms`. */
    _relicTwinkles(x, y, count, ms){
        const { scene } = this;

        for (let i = 0; i < count; i++){
            const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r = Phaser.Math.Between(70, 220);

            const star = this._relicTrack(scene.add.image(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, CROSS_KEY)
                .setDepth(FX_DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD)
                .setTint(Phaser.Utils.Array.GetRandom([ARTIFACT_WHITE, ARTIFACT_PINK, ARTIFACT_ICE]))
                .setScale(0).setAngle(45));

            const size = Phaser.Math.FloatBetween(0.06, 0.13);

            scene.tweens.add({
                targets:    star,
                scale:      size,
                angle:      135,
                duration:   260,
                delay:      Phaser.Math.Between(0, ms),
                yoyo:       true,
                hold:       80,
                ease:       'Sine.easeOut',
                onComplete: () => star.destroy(),
            });
        }
    }

    /** The card's name over the crystal as it turns out of the light. */
    _relicTitle(card, x, y){
        const { scene } = this;

        const title = this._relicTrack(scene.add.text(x, y, `${card.icon}  ${card.name}`, {
            fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold',
            color: '#eef0ff', stroke: '#0b0624', strokeThickness: 7,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(0.6).setAlpha(0));

        const pre = this.pre(title);
        if (pre){
            pre.setPadding(16);
            pre.addGlow(ARTIFACT_AZURE, 3, 0, false, 0.1, 16);
            pre.addShine(1, 0.35, 4);
        }

        scene.tweens.add({ targets: title, scale: 1, alpha: 1, y: y - 16, duration: 380, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets:    title,
            alpha:      0,
            y:          y - 50,
            delay:      1100,
            duration:   380,
            ease:       'Cubic.easeIn',
            onComplete: () => title.destroy(),
        });
    }

    /**
     * One afterimage of the crystal, left where it was and fading. `size` is
     * the scale of whatever the crystal sits in.
     */
    _relicEcho(crystal, x, y, size, tint = ARTIFACT_ICE){
        const { scene } = this;

        const echo = scene.add.image(x, y, crystal.texture.key)
            .setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.5)
            .setScale(size * crystal.scaleX, size * crystal.scaleY)
            .setAngle(crystal.angle);

        scene.tweens.add({
            targets:    echo,
            alpha:      0,
            scaleX:     echo.scaleX * 0.8,
            scaleY:     echo.scaleY * 0.8,
            duration:   260,
            ease:       'Quad.easeOut',
            onComplete: () => echo.destroy(),
        });
    }

    /** Thin light rays thrown out from a point. */
    _relicRays(x, y, count, colors, minLen, maxLen){
        const { scene } = this;

        for (let i = 0; i < count; i++){
            const a   = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.1, 0.1);
            const len = Phaser.Math.Between(minLen, maxLen);

            const ray = scene.add.rectangle(x, y, len, 3, colors[i % colors.length], 1)
                .setOrigin(0, 0.5).setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD)
                .setRotation(a).setScale(0, 1);

            scene.tweens.add({
                targets:    ray,
                scaleX:     1,
                alpha:      { from: 1, to: 0 },
                duration:   Phaser.Math.Between(360, 540),
                ease:       'Cubic.easeOut',
                onComplete: () => ray.destroy(),
            });
        }
    }

    /**
     * The crystal exploding on the caster's card - the brightest beat of the
     * card. The blast art blows out in layers, particles are thrown across the
     * whole stage, rings and rays go out, the camera's lens kicks, and the
     * card is jolted.
     */
    _relicExplode(relic, x, y){
        const { scene } = this;
        const { caster } = relic;

        // The heart of it: a white-hot point and a wide blue light, which is
        // what tints the stage - additive blue on the veil, not a grey wash.
        const flash = this._glow(null, x, y, 0xffffff, 0.3).setDepth(FX_DEPTH + 2);
        scene.tweens.add({
            targets:    flash,
            scale:      2.8,
            alpha:      { from: 1, to: 0 },
            duration:   420,
            ease:       'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });

        const light = this._glow(null, x, y, ARTIFACT_COBALT, 0.5).setDepth(FX_DEPTH - 0.8);
        scene.tweens.add({
            targets:    light,
            scale:      7,
            alpha:      { from: 1, to: 0 },
            duration:   1100,
            ease:       'Cubic.easeOut',
            onComplete: () => light.destroy(),
        });

        // --- the blast art, in three layers turning against each other ---
        [
            // to, ms, delay, spin, flip, frame, tint
            [0.85, 900,   0,  50, false, 0, null],
            [1.05, 1050, 70, -70, true,  2, ARTIFACT_SKY],
            [0.5,  650,   0,  90, false, 1, ARTIFACT_FROST],
        ].forEach(([to, ms, delay, spin, flip, frame, tint]) => {
            const blast = scene.add.sprite(x, y, ARTIFACT_BLAST_KEYS[frame])
                .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD)
                .setFlipX(flip).setScale(0.05).setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
            if (tint) blast.setTint(tint);
            blast.play({ key: ARTIFACT_BLAST, startFrame: frame });

            scene.tweens.add({
                targets:    blast,
                scale:      to,
                angle:      blast.angle + spin,
                alpha:      { from: 1, to: 0 },
                duration:   ms,
                delay,
                ease:       'Cubic.easeOut',
                onComplete: () => blast.destroy(),
            });
        });

        // --- particles across the whole stage ---
        // Sparks fast enough to reach the screen's far edge before they fade.
        this._relicEmitter(x, y, RADIAL_KEY, {
            emitting:  false,
            speed:     { min: 500, max: 1700 },
            lifespan:  { min: 1400, max: 2200 },
            scale:     { start: 0.2, end: 0 },
            alpha:     { start: 1, end: 0.2 },
            tint:      ARTIFACT_ENERGY_MOTES,
            blendMode: 'ADD',
        }, FX_DEPTH + 2, 2300).explode(240);

        // Shards of the blast itself, tumbling out.
        this._relicEmitter(x, y, ARTIFACT_BLAST_KEYS[3], {
            emitting:  false,
            speed:     { min: 400, max: 1200 },
            lifespan:  { min: 900, max: 1400 },
            scale:     { start: 0.045, end: 0 },
            rotate:    { min: -540, max: 540 },
            alpha:     { start: 1, end: 0 },
            blendMode: 'ADD',
        }, FX_DEPTH + 1, 1500).explode(22);

        // Glints, and slow clouds of energy hanging in the air after.
        this._relicEmitter(x, y, CROSS_KEY, {
            emitting:  false,
            speed:     { min: 200, max: 900 },
            lifespan:  { min: 900, max: 1600 },
            scale:     { start: 0.16, end: 0 },
            rotate:    45,
            tint:      [ARTIFACT_WHITE, ARTIFACT_FROST, ARTIFACT_SKY],
            blendMode: 'ADD',
        }, FX_DEPTH + 2, 1700).explode(44);

        this._relicEmitter(x, y, RADIAL_KEY, {
            emitting:  false,
            speed:     { min: 60, max: 280 },
            lifespan:  { min: 1200, max: 1900 },
            scale:     { start: 0.5, end: 1.5 },
            alpha:     { start: 0.45, end: 0 },
            tint:      [ARTIFACT_DEEP, ARTIFACT_COBALT, ARTIFACT_AZURE],
            blendMode: 'ADD',
        }, FX_DEPTH - 0.8, 2000).explode(20);

        // --- shockwaves and rays ---
        this._ring(null, x, y, { from: 40, to: 980, width: 34, color: ARTIFACT_COBALT, ms: 1100 });
        this._ring(null, x, y, { from: 40, to: 700, width: 20, color: ARTIFACT_AZURE,  ms: 900, delay: 50 });
        this._ring(null, x, y, { from: 30, to: 480, width: 10, color: ARTIFACT_FROST,  ms: 700, delay: 100 });
        this._ring(null, x, y, { from: 20, to: 300, width: 5,  color: ARTIFACT_WHITE,  ms: 520, delay: 150 });

        this._relicRays(x, y, 30, [ARTIFACT_SKY, ARTIFACT_WHITE, ARTIFACT_AZURE, ARTIFACT_FROST], 360, 900);

        // --- the card: lit, glowing and jolted ---
        scene.tweens.add({ targets: caster.flash, alpha: { from: 0.95, to: 0 }, duration: 520, ease: 'Cubic.easeOut' });

        relic.casterFx = this.post(caster.root)?.addGlow(ARTIFACT_AZURE, 0, 0, false, 0.1, 18) ?? null;
        if (relic.casterFx){
            scene.tweens.add({
                targets:       relic.casterFx,
                outerStrength: { from: 12, to: 4 },
                duration:      700,
                ease:          'Cubic.easeOut',
            });
        }

        relic.shake = this._relicJolt(caster, 460, 7);

        // The camera's lens bulges with the blast and settles back.
        const barrel = this.post(scene.cameras.main)?.addBarrel(1);
        if (barrel){
            relic.barrel = barrel;
            scene.tweens.add({
                targets:    barrel,
                amount:     1.07,
                duration:   110,
                yoyo:       true,
                ease:       'Quad.easeOut',
                onComplete: () => {
                    if (relic.barrel !== barrel) return;
                    relic.barrel = null;
                    scene.cameras.main.postFX?.remove(barrel);
                },
            });
        }

        scene.cameras.main.shake(280, 0.006);
        this._screenFlash(ARTIFACT_AZURE, 0.22, 340);
    }

    /**
     * Blue energy pouring off the card until the strike: the blast art
     * churning behind and over it, sparks thrown off its edges, wisps rising,
     * and crackles of light - with the crystal re-forming at its heart.
     */
    _relicRadiate(relic, x, y){
        const { scene } = this;

        relic.aura = [
            // scale, alpha, depth, spin, frame
            [0.62, 0.9,  FX_DEPTH - 0.7,  360, 0],
            [0.5,  0.28, FX_DEPTH,       -360, 2],
        ].map(([size, alpha, depth, spin, frame], i) => {
            const aura = this._relicTrack(scene.add.sprite(x, y, ARTIFACT_BLAST_KEYS[frame])
                .setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setScale(size * 0.6).setAlpha(0));
            aura.play({ key: ARTIFACT_BLAST, startFrame: frame });

            scene.tweens.add({ targets: aura, alpha, scale: size, duration: 300, ease: 'Cubic.easeOut' });
            scene.tweens.add({ targets: aura, angle: spin, duration: 5200 + i * 1400, repeat: -1 });
            scene.tweens.add({
                targets:  aura,
                scaleX:   size * 1.08,
                scaleY:   size * 1.08,
                duration: 420 + i * 80,
                delay:    300,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut',
            });

            return aura;
        });

        // Sparks thrown off all round the card's edge.
        relic.sparks = this._relicEmitter(x, y, RADIAL_KEY, {
            x:         { min: -150, max: 150 },
            y:         { min: -165, max: 165 },
            speed:     { min: 140, max: 520 },
            lifespan:  { min: 600, max: 1100 },
            scale:     { start: 0.1, end: 0 },
            alpha:     { start: 1, end: 0 },
            tint:      ARTIFACT_ENERGY_MOTES,
            blendMode: 'ADD',
            frequency: 14,
            quantity:  3,
        }, FX_DEPTH + 0.5);

        // Wisps of energy rising off it.
        relic.wisps = this._relicEmitter(x, y + 90, RADIAL_KEY, {
            x:         { min: -140, max: 140 },
            speedY:    { min: -230, max: -90 },
            speedX:    { min: -30, max: 30 },
            lifespan:  { min: 800, max: 1200 },
            scale:     { start: 0.25, end: 0.7 },
            alpha:     { start: 0.4, end: 0 },
            tint:      [ARTIFACT_DEEP, ARTIFACT_COBALT, ARTIFACT_AZURE],
            blendMode: 'ADD',
            frequency: 50,
        }, FX_DEPTH - 0.6);

        relic.crackle = scene.time.addEvent({
            delay:    170,
            loop:     true,
            callback: () => this._relicArcs(x, y, 2),
        });

        if (relic.casterFx){
            scene.tweens.add({
                targets:       relic.casterFx,
                outerStrength: 7,
                duration:      380,
                yoyo:          true,
                repeat:        -1,
                ease:          'Sine.easeInOut',
            });
        }

        relic.core = this._relicTrack(this._relicCore(x, y));
    }

    /** The energy round the card spent into the strike: the emitters and crackle stop, the aura folds in. */
    _relicCalm(relic){
        if (!relic || relic.done) return;
        const { scene } = this;

        relic.crackle?.remove();
        relic.crackle = null;

        this._relicRetire(relic.sparks, 1200);
        this._relicRetire(relic.wisps, 1300);

        (relic.aura ?? []).forEach(aura => {
            if (!aura.active) return;
            scene.tweens.killTweensOf(aura);
            scene.tweens.add({ targets: aura, scale: 0.1, alpha: 0, duration: 240, ease: 'Cubic.easeIn' });
        });
    }

    /** A short shake of the card that dies away. It is the slot's own shake, so the scene can stop it. */
    _relicJolt(slot, ms, amp){
        const { scene } = this;

        slot.shake?.stop();
        slot.motion?.stop();

        const tween = scene.tweens.addCounter({
            from:     amp,
            to:       0,
            duration: ms,
            ease:     'Quad.easeOut',
            onUpdate: (tw) => {
                if (!slot.root?.active) return;

                const a = tw.getValue();
                slot.root.setPosition(
                    slot.homeX + Phaser.Math.FloatBetween(-a, a),
                    slot.homeY + Phaser.Math.FloatBetween(-a, a) * 0.6,
                );
                slot.root.setRotation(Phaser.Math.FloatBetween(-a, a) * 0.0016);
            },
            onComplete: () => this._relicStopShake(this.relic),
        });

        slot.shake = tween;
        return tween;
    }

    /** Stop the card's shake, and put it back on its mark. */
    _relicStopShake(relic){
        if (!relic?.shake) return;

        const { caster, shake } = relic;
        relic.shake = null;

        shake.stop();
        if (caster.shake === shake){
            caster.shake = null;
            caster.root?.setPosition(caster.homeX, caster.homeY).setRotation(0);
        }
    }

    /** Crackling arcs of blue energy thrown off the card. */
    _relicArcs(x, y, count){
        const { scene } = this;

        for (let i = 0; i < count; i++){
            const g = scene.add.graphics().setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
            const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r = Phaser.Math.Between(170, 280);
            const color = Phaser.Utils.Array.GetRandom([ARTIFACT_SKY, ARTIFACT_FROST, ARTIFACT_WHITE, ARTIFACT_AZURE]);

            const draw = () => {
                g.clear();
                g.lineStyle(3, color, 1);
                g.beginPath();
                g.moveTo(x + Math.cos(a) * 60, y + Math.sin(a) * 60);

                // A jagged walk out along the angle.
                const steps = 6;
                for (let s = 1; s <= steps; s++){
                    const d = Phaser.Math.Linear(60, r, s / steps);
                    const j = s === steps ? 0 : Phaser.Math.FloatBetween(-22, 22);
                    g.lineTo(x + Math.cos(a) * d - Math.sin(a) * j, y + Math.sin(a) * d + Math.cos(a) * j);
                }
                g.strokePath();
            };

            draw();
            scene.time.delayedCall(60, () => g.active && draw());

            scene.tweens.add({
                targets:    g,
                alpha:      { from: 1, to: 0 },
                duration:   200,
                delay:      Phaser.Math.Between(0, 100),
                onComplete: () => g.destroy(),
            });
        }
    }

    /**
     * The charge the critical flies as: the crystal small and spinning hard
     * inside a churning ball of the blast art, with a hot glow round both.
     */
    _relicCore(x, y){
        const { scene } = this;

        const core = scene.add.container(x, y).setDepth(FX_DEPTH + 1).setScale(0);

        const orb = scene.add.sprite(0, 0, ARTIFACT_BLAST_KEYS[1])
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.2);
        orb.play({ key: ARTIFACT_BLAST, startFrame: 1 });

        const glow  = this._glow(null, 0, 0, ARTIFACT_COBALT, 1.1);
        const heart = this._glow(null, 0, 0, ARTIFACT_WHITE, 0.45);

        // The spin writes the crystal's own scale, so its size lives on a wrapper.
        const crystal = scene.add.sprite(0, 0, ARTIFACT_RELIC_KEYS[2]);
        const stone   = scene.add.container(0, 0, [crystal]).setScale(0.13);

        this._fxGlowOn(crystal, ARTIFACT_SKY, 4);

        core.add([glow, orb, heart, stone]);
        core.setData('crystal', crystal);
        core.setData('stone', stone);
        core.setData('spin', this._relicSpin(crystal, 260));

        scene.tweens.add({ targets: core, scale: 1, duration: 320, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: orb,  angle: 360, duration: 900, repeat: -1 });
        scene.tweens.add({ targets: glow, scale: 1.4, duration: 220, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        return core;
    }

    /** The critical landing: the crystal shattered, the energy blown out, light everywhere. */
    _relicImpact(x, y, rival, ev){
        const { scene } = this;

        const flash = this._glow(null, x, y, 0xffffff, 0.4).setDepth(FX_DEPTH + 2);
        scene.tweens.add({
            targets:    flash,
            scale:      3.6,
            alpha:      { from: 1, to: 0 },
            duration:   440,
            ease:       'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });

        const bloom = this._glow(null, x, y, ARTIFACT_COBALT, 0.5).setDepth(FX_DEPTH + 1);
        scene.tweens.add({
            targets:    bloom,
            scale:      4,
            alpha:      { from: 0.9, to: 0 },
            duration:   680,
            ease:       'Cubic.easeOut',
            onComplete: () => bloom.destroy(),
        });

        // The energy blown out over the rival's card.
        [[0.55, 600, 0, false], [0.8, 820, 60, true]].forEach(([to, ms, delay, flip], i) => {
            const blast = scene.add.sprite(x, y, ARTIFACT_BLAST_KEYS[i * 2])
                .setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD)
                .setFlipX(flip).setScale(0.06).setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
            blast.play({ key: ARTIFACT_BLAST, startFrame: i * 2 });

            scene.tweens.add({
                targets:    blast,
                scale:      to,
                angle:      blast.angle + (flip ? -60 : 60),
                alpha:      { from: 1, to: 0 },
                duration:   ms,
                delay,
                ease:       'Cubic.easeOut',
                onComplete: () => blast.destroy(),
            });
        });

        this._relicEmitter(x, y, RADIAL_KEY, {
            emitting:  false,
            speed:     { min: 250, max: 900 },
            lifespan:  { min: 600, max: 1100 },
            scale:     { start: 0.16, end: 0 },
            alpha:     { start: 1, end: 0 },
            tint:      ARTIFACT_ENERGY_MOTES,
            blendMode: 'ADD',
        }, FX_DEPTH + 1, 1200).explode(80);

        this._relicEmitter(x, y, ARTIFACT_RELIC_KEYS[3], {
            emitting:  false,
            speed:     { min: 180, max: 480 },
            lifespan:  { min: 500, max: 900 },
            scale:     { start: 0.06, end: 0.01 },
            rotate:    { min: -480, max: 480 },
            alpha:     { start: 1, end: 0 },
            tint:      [ARTIFACT_ICE, ARTIFACT_FROST, ARTIFACT_SILVER],
        }, FX_DEPTH + 1, 1000).explode(22);

        this._ring(null, x, y, { from: 40, to: 420, width: 20, color: ARTIFACT_AZURE, ms: 620 });
        this._ring(null, x, y, { from: 30, to: 320, width: 10, color: ARTIFACT_FROST, ms: 520, delay: 60 });
        this._ring(null, x, y, { from: 20, to: 220, width: 5,  color: ARTIFACT_WHITE, ms: 420, delay: 110 });

        this._relicRays(x, y, 18, [ARTIFACT_SKY, ARTIFACT_WHITE, ARTIFACT_AZURE, ARTIFACT_FROST], 160, 340);

        // The rival's card lights up as the critical passes through it.
        const glow = this.post(rival.root)?.addGlow(ARTIFACT_AZURE, 0, 0, false, 0.1, 16);
        if (glow){
            scene.tweens.add({
                targets:       glow,
                outerStrength: 10,
                duration:      130,
                yoyo:          true,
                hold:          120,
                ease:          'Quad.easeOut',
                onComplete:    () => rival.root.postFX?.remove(glow),
            });
        }

        this._screenFlash(ARTIFACT_COBALT, 0.18, 260);
        scene.cameras.main.shake(260, 0.007);

        if (ev?.bonusDamage) this._relicBonusTag(rival, ev);
    }

    /** The +5 called out over the rival's card - it lands even through a field. */
    _relicBonusTag(rival, ev){
        const { scene } = this;

        const x = rival.homeX;
        const y = rival.homeY - CARD_HALF_H - 26;

        const tag = scene.add.text(x, y, `+${ev.bonusDamage} ARTIFACT${ev.field ? ' - THROUGH THE FIELD' : ''}`, {
            fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold',
            color: '#d8eeff', stroke: '#03122e', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(1.8).setAlpha(0);

        this.pre(tag)?.addGlow(ARTIFACT_AZURE, 2, 0, false, 0.1, 10);

        scene.tweens.add({ targets: tag, scale: 1, alpha: 1, duration: 260, delay: 120, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets:    tag,
            alpha:      0,
            y:          y - 34,
            delay:      1150,
            duration:   400,
            ease:       'Cubic.easeIn',
            onComplete: () => tag.destroy(),
        });
    }

    /** Take down whatever An Artifact left standing. Safe to call twice. */
    _relicCleanup(relic = this.relic){
        if (!relic || relic.done) return;
        relic.done = true;
        if (this.relic === relic) this.relic = null;

        const { scene } = this;

        relic.failsafe?.remove();
        relic.spin?.stop();
        relic.crackle?.remove();

        if (relic.barrel){
            scene.tweens.killTweensOf(relic.barrel);
            scene.cameras.main.postFX?.remove(relic.barrel);
            relic.barrel = null;
        }

        this._relicStopShake(relic);

        relic.emitters.forEach(emitter => this._relicRetire(emitter, 1600));

        relic.core?.getData('spin')?.stop();

        relic.objects.forEach(obj => {
            if (!obj?.active) return;

            scene.tweens.killTweensOf(obj);
            obj.list?.forEach(child => {
                scene.tweens.killTweensOf(child);
                child.list?.forEach(inner => scene.tweens.killTweensOf(inner));
            });

            scene.tweens.add({
                targets:    obj,
                alpha:      0,
                duration:   260,
                onComplete: () => obj.destroy(),
            });
        });

        if (relic.casterFx){
            const fx = relic.casterFx;
            scene.tweens.killTweensOf(fx);
            scene.tweens.add({
                targets:       fx,
                outerStrength: 0,
                duration:      300,
                onComplete:    () => relic.caster.root?.postFX?.remove(fx),
            });
        }

        if (relic.cameraFx){
            const fx = relic.cameraFx;
            scene.tweens.killTweensOf(fx);
            scene.tweens.add({
                targets:    fx,
                strength:   0,
                duration:   300,
                onComplete: () => scene.cameras.main.postFX?.remove(fx),
            });
        }

        relic.caster.root?.setDepth(relic.depth);
    }

    // ------------------------------------------------ containment field parts --

    /** A field's bookkeeping, registered on its slot before anything is drawn. */
    _fieldRecord(slot, card, you){
        const field = {
            slot,
            card,
            you,
            back:         null,     // the standing field behind the card's face...
            front:        null,     // ...and over it - see _fieldStand()
            parts:        null,     // the ring, counter-ring, edge and haze
            cardFx:       null,     // the red glow on the card itself
            timers:       [],
            counters:     [],
            forming:      false,
            breaking:     false,
            pendingBreak: false,
            shown:        true,
        };

        this.fields.set(slot, field);
        return field;
    }

    /** Red light pulled in from all round the card to its core. */
    _fieldGather(root){
        const { scene } = this;

        for (let i = 0; i < 36; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r    = Phaser.Math.Between(240, 440);
            const tint = Phaser.Utils.Array.GetRandom(FIELD_MOTES);

            const mote = root.add(scene.add.image(Math.cos(a) * r, Math.sin(a) * r, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(tint)
                .setScale(Phaser.Math.FloatBetween(0.04, 0.1)).setAlpha(0)).last;

            scene.tweens.add({
                targets:    mote,
                x:          0,
                y:          0,
                alpha:      { from: 1, to: 0.3 },
                duration:   Phaser.Math.Between(500, 820),
                delay:      Phaser.Math.Between(0, 1050),
                ease:       'Cubic.easeIn',
                onComplete: () => mote.destroy(),
            });
        }
    }

    /**
     * One of the four circles thrown off the card. `k` is which (0..3): each
     * starts a little bigger, grows larger and burns brighter than the last,
     * and each is still growing when the next goes out, so they overlap.
     */
    _fieldRing(root, core, halo, field, k){
        const { scene } = this;
        const keys = ['fieldRingFlame', 'fieldRingBolt', 'fieldRingSmoke', 'fieldRingBolt'];

        // The ring art, from a speck to wider than the field will stand.
        const ring = root.add(scene.add.image(0, 0, keys[k])
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.04 + k * 0.02).setAngle(k * 50)).last;

        this._fxGlowOn(ring, FIELD_RED, 2 + k);

        scene.tweens.add({
            targets:    ring,
            scale:      0.42 + k * 0.16,
            angle:      ring.angle + (k % 2 ? -70 : 70),
            alpha:      { from: 1, to: 0 },
            duration:   1000 + k * 120,
            ease:       'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });

        // A red disc behind it, and drawn rings to give its edge a hard line.
        const disc = this._glow(root, 0, 0, FIELD_RED, 0.2);
        scene.tweens.add({
            targets:    disc,
            scale:      2.2 + k * 0.7,
            alpha:      { from: 0.9, to: 0 },
            duration:   900 + k * 100,
            ease:       'Cubic.easeOut',
            onComplete: () => disc.destroy(),
        });

        this._ring(root, 0, 0, { from: 16 + k * 6, to: 180 + k * 70, width: 18 + k * 5, color: FIELD_RED,   ms: 900 + k * 100 });
        this._ring(root, 0, 0, { from: 10,         to: 130 + k * 55, width: 5,          color: FIELD_WHITE, ms: 700 + k * 80, delay: 60 });

        // The vortex winds up a step with every ring, and the card beats with it.
        scene.tweens.add({ targets: core, scale: 0.1 + k * 0.05, duration: 180, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: halo, scale: 1.7 + k * 0.4, duration: 140, yoyo: true, ease: 'Quad.easeOut' });

        if (field.cardFx){
            scene.tweens.add({
                targets:       field.cardFx,
                outerStrength: 5 + k * 2,
                duration:      150,
                yoyo:          true,
                ease:          'Quad.easeOut',
            });
        }

        if (k === 3) scene.cameras.main.shake(120, 0.0025);
    }

    /** The vortex detonating: white-hot, then a red blast, rays, shockwaves and embers. */
    _fieldExplode(root, core, halo, field){
        const { scene } = this;

        // White-hot first, then the red rolling out behind it.
        [[FIELD_WHITE, 4.4, 380, 1], [FIELD_RED, 7.5, 720, 0.95], [FIELD_HOT, 10, 950, 0.5]]
            .forEach(([tint, to, ms, from]) => {
                const flash = this._glow(root, 0, 0, tint, 0.3);
                scene.tweens.add({
                    targets:    flash,
                    scale:      to,
                    alpha:      { from, to: 0 },
                    duration:   ms,
                    ease:       'Cubic.easeOut',
                    onComplete: () => flash.destroy(),
                });
            });

        // The vortex blown open.
        scene.tweens.killTweensOf([core, halo]);
        scene.tweens.add({ targets: core, scale: 0.9, angle: core.angle - 160, alpha: 0, duration: 620, ease: 'Cubic.easeOut' });
        scene.tweens.add({ targets: halo, scale: 4, alpha: 0, duration: 600, ease: 'Cubic.easeOut' });

        // All three rings thrown out at once, past where the field will stand.
        ['fieldRingFlame', 'fieldRingBolt', 'fieldRingSmoke'].forEach((key, i) => {
            const ring = root.add(scene.add.image(0, 0, key)
                .setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAngle(i * 120)).last;

            this._fxGlowOn(ring, FIELD_HOT, 5);

            scene.tweens.add({
                targets:    ring,
                scale:      1.05 + i * 0.22,
                angle:      ring.angle + 90,
                alpha:      { from: 1, to: 0 },
                duration:   700 + i * 120,
                ease:       'Expo.easeOut',
                onComplete: () => ring.destroy(),
            });
        });

        for (let i = 0; i < 28; i++){
            const a   = (i / 28) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.06, 0.06);
            const len = Phaser.Math.Between(220, 420);

            // Grown by scaleX: a Shape's width can be written but is not redrawn.
            const ray = root.add(scene.add.rectangle(0, 0, len, 4, i % 3 ? FIELD_RED : FIELD_WHITE, 1)
                .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setRotation(a).setScale(0, 1)).last;

            scene.tweens.add({
                targets:    ray,
                scaleX:     1,
                alpha:      { from: 1, to: 0 },
                duration:   Phaser.Math.Between(400, 560),
                ease:       'Cubic.easeOut',
                onComplete: () => ray.destroy(),
            });
        }

        this._ring(root, 0, 0, { from: 40, to: 720, width: 34, color: FIELD_RED,   ms: 760 });
        this._ring(root, 0, 0, { from: 30, to: 540, width: 12, color: FIELD_WHITE, ms: 560, delay: 40 });
        this._ring(root, 0, 0, { from: 20, to: 380, width: 20, color: FIELD_HOT,   ms: 640, delay: 120 });

        for (let i = 0; i < 40; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dist = Phaser.Math.Between(200, 460);

            const ember = root.add(scene.add.image(0, 0, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Utils.Array.GetRandom(FIELD_MOTES))
                .setScale(Phaser.Math.FloatBetween(0.04, 0.1))).last;

            scene.tweens.add({
                targets:    ember,
                x:          Math.cos(a) * dist,
                y:          Math.sin(a) * dist,
                alpha:      0,
                duration:   Phaser.Math.Between(600, 1000),
                ease:       'Cubic.easeOut',
                onComplete: () => ember.destroy(),
            });
        }

        // The card itself flares at the heart of it.
        if (field.cardFx){
            scene.tweens.killTweensOf(field.cardFx);
            scene.tweens.add({
                targets:       field.cardFx,
                outerStrength: 14,
                duration:      90,
                hold:          120,
                yoyo:          true,
                ease:          'Quad.easeOut',
            });
        }

        scene.cameras.main.shake(280, 0.008);
        this._screenFlash(FIELD_WHITE, 0.35, 160);
        this._screenFlash(FIELD_RED,   0.5,  520);
    }

    /** The card's name slammed into the lane beside the caster. */
    _fieldTitle(card, caster){
        const { scene } = this;

        const x = caster.homeX + caster.facing * 330;
        const y = caster.homeY - 110;

        const title = scene.add.text(x, y, `${card.icon}  ${card.name}`, {
            fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold',
            color: '#ffe9e6', stroke: '#2a0000', strokeThickness: 7,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(2.4).setAlpha(0);

        const pre = this.pre(title);
        if (pre){
            pre.setPadding(16);
            pre.addGlow(FIELD_RED, 4, 0, false, 0.1, 16);
            pre.addShine(1.2, 0.4, 4);
        }

        scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets:    title,
            alpha:      0,
            y:          y - 40,
            delay:      1250,
            duration:   420,
            ease:       'Cubic.easeIn',
            onComplete: () => title.destroy(),
        });
    }

    /**
     * The standing field, built inside the card's own container so it moves
     * with the card - recoil, shake and lunge - in two layers:
     *
     *   back   behind the card's face: a red haze and the three ring images
     *          flipped as one sprite, turning two ways. The card's smoked
     *          glass lets it glow through without burying the ESSE or stats.
     *   front  over it: a hard bright edge, ripples and sparks riding the
     *          ring - all outside the card's corners, so nothing is covered.
     *
     * Everything pulses on one beat until the card is attacked.
     *
     * @param {boolean} fromBlast  settling out of the explosion, rather than
     *                             simply appearing (a resync)
     */
    _fieldStand(field, fromBlast = false){
        const { scene } = this;
        const { slot } = field;

        const back  = scene.add.container(0, 0);
        const front = scene.add.container(0, 0);
        slot.root.addAt(back, 0);
        slot.root.add(front);

        field.back  = back;
        field.front = front;

        const R = FIELD_BAND * FIELD_SCALE;

        const haze = this._glow(back, 0, 0, FIELD_RED, 2.1).setAlpha(0.32);

        const counter = back.add(scene.add.sprite(0, 0, 'fieldRingSmoke')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(FIELD_SCALE).setFlipX(true).setAlpha(0.45)).last;
        counter.play({ key: FIELD_FLICKER, startFrame: 2 });

        const ring = back.add(scene.add.sprite(0, 0, 'fieldRingFlame')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(FIELD_SCALE).setAlpha(0.95)).last;
        ring.play(FIELD_FLICKER);

        const ringFx = this._fxGlowOn(ring, FIELD_RED, 2);

        // A hard bright line the soft art does not have - the contrast that
        // makes the field read as a barrier and not a cloud.
        const edge = front.add(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD)).last;
        edge.lineStyle(3, FIELD_HOT, 0.9);
        edge.strokeCircle(0, 0, R);
        edge.lineStyle(1.5, FIELD_WHITE, 0.8);
        edge.strokeCircle(0, 0, R - 5);

        field.parts = { haze, ring, counter, edge, ringFx, radius: R };

        // Turning, two ways.
        scene.tweens.add({ targets: ring,    angle:  360, duration: 9000,  repeat: -1 });
        scene.tweens.add({ targets: counter, angle: -360, duration: 13000, repeat: -1 });

        // The pulse - one beat everything keeps time with.
        const beat = { duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' };

        scene.tweens.add({ targets: [back, front], scale: { from: 0.98, to: 1.04 }, ...beat });
        scene.tweens.add({ targets: haze, alpha: { from: 0.22, to: 0.45 }, ...beat });
        scene.tweens.add({ targets: edge, alpha: { from: 0.45, to: 1 },     ...beat });
        if (ringFx) scene.tweens.add({ targets: ringFx, outerStrength: { from: 1.5, to: 4.5 }, ...beat });

        // The card keeps its red glow, beating with the field.
        if (field.cardFx){
            scene.tweens.killTweensOf(field.cardFx);
            scene.tweens.add({ targets: field.cardFx, outerStrength: { from: 1.5, to: 4 }, ...beat });
        }
        else {
            this._fieldCardGlow(field, true);
        }

        // A ripple off the edge every other beat, and sparks riding the ring.
        field.timers.push(scene.time.addEvent({
            delay:    1520,
            loop:     true,
            callback: () => {
                if (field.shown && front.active){
                    this._ring(front, 0, 0, { from: R - 10, to: R + 70, width: 6, color: FIELD_HOT, ms: 900 });
                }
            },
        }));

        this._fieldOrbit(field, R);

        if (fromBlast){
            // Settling in from the blast, wider than it will stand.
            [ring, counter].forEach(sprite => {
                const to = sprite.scale;
                sprite.setScale(to * 1.4);
                scene.tweens.add({ targets: sprite, scale: to, duration: 560, ease: 'Back.easeOut' });
            });
        }

        back.setAlpha(0);
        front.setAlpha(0);
        scene.tweens.add({ targets: [back, front], alpha: 1, duration: fromBlast ? 220 : 360 });
    }

    /** Four sparks riding round the field's edge, at different speeds. */
    _fieldOrbit(field, R){
        const { scene } = this;

        for (let i = 0; i < 4; i++){
            const spark = field.front.add(scene.add.image(0, 0, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? FIELD_WHITE : FIELD_HOT)
                .setScale(i % 2 ? 0.07 : 0.11)).last;

            const start = (i / 4) * Math.PI * 2;
            const dir   = i % 2 ? -1 : 1;

            field.counters.push(scene.tweens.addCounter({
                from:     0,
                to:       Math.PI * 2,
                duration: 2600 + i * 700,
                repeat:   -1,
                onUpdate: (tw) => {
                    const a = start + dir * tw.getValue();
                    spark.setPosition(Math.cos(a) * R, Math.sin(a) * R);
                },
            }));
        }
    }

    /** The red glow on the card itself, beating with the field. WebGL only. */
    _fieldCardGlow(field, on){
        const { scene } = this;
        const card = field.slot.root;

        if (!on){
            if (!field.cardFx) return;

            scene.tweens.killTweensOf(field.cardFx);
            card?.postFX?.remove(field.cardFx);
            field.cardFx = null;
            return;
        }

        if (field.cardFx) return;

        field.cardFx = this.post(card)?.addGlow(FIELD_RED, 0, 0, false, 0.1, 18) ?? null;
        if (field.cardFx){
            scene.tweens.add({
                targets:       field.cardFx,
                outerStrength: { from: 1.5, to: 4 },
                duration:      760,
                yoyo:          true,
                repeat:        -1,
                ease:          'Sine.easeInOut',
            });
        }
    }

    /** Fade a standing field out (its card swapped out of the arena) or back in. */
    _fieldShow(field, shown){
        if (!field.back || field.shown === shown) return;

        field.shown = shown;

        // Alpha only - the pulse runs on the same two containers' scale.
        const layers = [field.back, field.front];
        layers.forEach(layer => {
            this.scene.tweens.getTweensOf(layer)
                .filter(tw => tw.data.some(d => d.key === 'alpha'))
                .forEach(tw => tw.remove());
        });
        this.scene.tweens.add({ targets: layers, alpha: shown ? 1 : 0, duration: 280 });

        this._fieldCardGlow(field, shown);
    }

    /** The field coming down: its ring torn into arcs and thrown off, in a red flash. */
    _fieldShatter(field){
        const { scene } = this;
        const { slot } = field;

        // A field already out of sight (its card swapped out) just goes.
        if (!field.parts || !field.shown || !scene.sys.isActive()){
            this._fieldRemove(slot, field);
            return;
        }

        scene.events.emit('singularityfx:beat', { card: field.card.id, beat: 'broken', you: field.you });

        const R  = field.parts.radius;
        const x  = slot.homeX;
        const y  = slot.homeY;

        // The ring, torn into arcs, each thrown straight out and spinning.
        for (let i = 0; i < 14; i++){
            const mid  = (i / 14) * Math.PI * 2;
            const span = Math.PI / 14 * 0.8;

            const arc = scene.add.graphics().setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setPosition(x, y);
            arc.lineStyle(7, i % 3 ? FIELD_RED : FIELD_WHITE, 1);
            arc.beginPath();
            arc.arc(0, 0, R, mid - span, mid + span);
            arc.strokePath();

            const fly = Phaser.Math.Between(90, 190);

            scene.tweens.add({
                targets:    arc,
                x:          x + Math.cos(mid) * fly,
                y:          y + Math.sin(mid) * fly,
                angle:      Phaser.Math.Between(-40, 40),
                alpha:      0,
                duration:   Phaser.Math.Between(480, 720),
                ease:       'Cubic.easeOut',
                onComplete: () => arc.destroy(),
            });
        }

        const flash = this._glow(null, x, y, FIELD_RED, 0.8);
        scene.tweens.add({
            targets:    flash,
            scale:      3.6,
            alpha:      { from: 0.85, to: 0 },
            duration:   520,
            ease:       'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });

        this._ring(null, x, y, { from: R, to: R + 220, width: 16, color: FIELD_RED,   ms: 620 });
        this._ring(null, x, y, { from: R, to: R + 140, width: 5,  color: FIELD_WHITE, ms: 480, delay: 40 });

        // The standing art blown wide and out.
        const { ring, counter } = field.parts;
        scene.tweens.killTweensOf([ring, counter]);
        scene.tweens.add({ targets: [ring, counter], scale: FIELD_SCALE * 1.5, alpha: 0, duration: 420, ease: 'Cubic.easeOut' });

        if (field.cardFx){
            const fx = field.cardFx;
            scene.tweens.killTweensOf(fx);
            scene.tweens.add({ targets: fx, outerStrength: 9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        }

        scene.time.delayedCall(440, () => this._fieldRemove(slot, field));
    }

    /** Take a slot's field down at once. Safe to call twice. */
    _fieldRemove(slot, field = this.fields.get(slot)){
        if (!field) return;
        if (this.fields.get(slot) === field) this.fields.delete(slot);

        const { scene } = this;

        field.timers.forEach(t => t.remove());
        field.counters.forEach(t => t.remove());
        field.timers   = [];
        field.counters = [];

        const kill = (obj) => {
            scene.tweens.killTweensOf(obj);
            obj.list?.forEach(kill);
        };

        [field.back, field.front].forEach(layer => {
            if (!layer?.active) return;
            kill(layer);
            layer.destroy();
        });

        if (field.parts?.ringFx) scene.tweens.killTweensOf(field.parts.ringFx);

        field.back  = null;
        field.front = null;
        field.parts = null;

        this._fieldCardGlow(field, false);
    }

    // ------------------------------------------------------ light mend parts --

    /**
     * The healing crosses, built hidden: a wide lime cross behind, the bright
     * green one, a white-hot core, and a thin one turned a few degrees so the
     * edges overlap rather than sit flush.
     */
    _mendCrosses(front){
        const { scene } = this;

        const make = (tint, alpha, angle) => front.add(scene.add.image(0, 0, CROSS_KEY)
            .setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(alpha)
            .setAngle(angle).setScale(0)).last;

        const halo  = this._glow(front, 0, 0, MEND_GREEN, 0).setAlpha(0);
        const outer = make(MEND_LIME,  0.55, 0);
        const tilt  = make(MEND_GREEN, 0.65, 7);
        const main  = make(MEND_GREEN, 1,    0);
        const core  = make(MEND_WHITE, 1,    0);

        this._fxGlowOn(main, MEND_GREEN, 4);
        this._fxGlowOn(core, MEND_LIME,  2);

        return { halo, outer, tilt, main, core };
    }

    /** The crosses converge onto the card out of a speck - fast, so they land as one snap. */
    _mendCrossIn(front, crosses){
        const { scene } = this;
        const { halo, outer, tilt, main, core } = crosses;

        [[outer, 1.25, 0], [tilt, 1.1, 30], [main, 1, 50], [core, 0.5, 80]].forEach(([obj, to, delay]) => {
            scene.tweens.add({ targets: obj, scale: to, duration: 170, delay, ease: 'Back.easeOut' });
        });

        scene.tweens.add({ targets: halo, scale: 3.2, alpha: 0.85, duration: 220, ease: 'Cubic.easeOut' });

        // A green snap off the card the instant it lands.
        this._ring(front, 0, 0, { from: 20, to: 260, width: 14, color: MEND_GREEN, ms: 460, delay: 60 });
        this._ring(front, 0, 0, { from: 10, to: 180, width: 4,  color: MEND_WHITE, ms: 360, delay: 90 });
        this._screenFlash(MEND_GREEN, 0.22, 260);

        // Then they breathe - out of step, so the overlap shimmers.
        scene.tweens.add({ targets: outer, scale: 1.4,  alpha: 0.35, duration: 520, delay: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: tilt,  angle: -7,   duration: 900, delay: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: core,  alpha: 0.6,  duration: 260, delay: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    /**
     * The mend art, waiting above the card: the ring laid flat like a halo,
     * the flipbook sprite of all four images, and the swirl turning behind it.
     */
    _mendArt(root){
        const { scene } = this;
        const top = -CARD_HALF_W - 170;

        const ring = root.add(scene.add.image(0, top, 'mendRing')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.32, 0.1).setAlpha(0)).last;

        const swirl = root.add(scene.add.image(0, top, 'mendSwirl')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.18).setAlpha(0)).last;

        const flicker = root.add(scene.add.sprite(0, top, 'mendBloom')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.16).setAlpha(0)).last;

        if (scene.anims.exists(MEND_FLICKER)) flicker.play(MEND_FLICKER);

        this._fxGlowOn(ring,    MEND_GREEN, 3);
        this._fxGlowOn(flicker, MEND_LIME,  2);

        scene.tweens.add({ targets: swirl,   angle:  360, duration: 1400, repeat: -1 });
        scene.tweens.add({ targets: flicker, angle: -360, duration: 2600, repeat: -1 });

        return { ring, swirl, flicker };
    }

    /** The art sinks down onto the card as the light rains. */
    _mendDescend(art, ms){
        const { scene } = this;
        const { ring, swirl, flicker } = art;

        scene.tweens.add({ targets: [ring, swirl, flicker], alpha: 0.95, duration: 260 });
        scene.tweens.add({ targets: [ring, swirl, flicker], y: 0, duration: ms, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: ring, scaleX: 0.5, scaleY: 0.5, duration: ms, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: swirl, scale: 0.34, duration: ms, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: flicker, scale: 0.26, duration: ms, ease: 'Sine.easeInOut' });
    }

    /**
     * Light showering down onto the card: round motes, long droplet streaks,
     * and a slow mist settling over it. Runs until the burst stops it.
     */
    _mendShower(front, mend, ms){
        const { scene } = this;

        const sky = new Phaser.Geom.Rectangle(-CARD_HALF_W - 30, -CARD_HALF_W - 260, CARD_HALF_W * 2 + 60, 60);

        const emit = (config) => {
            const e = scene.add.particles(0, 0, RADIAL_KEY, {
                emitZone:  { type: 'random', source: sky },
                blendMode: 'ADD',
                ...config,
            });
            front.add(e);
            mend.emitters.push(e);
            return e;
        };

        // Motes.
        emit({
            speedY:    { min: 260, max: 520 },
            speedX:    { min: -24, max: 24 },
            gravityY:  420,
            scale:     { start: 0.09, end: 0.01 },
            alpha:     { start: 1, end: 0.2 },
            lifespan:  { min: 700, max: 1000 },
            tint:      MEND_MOTES,
            frequency: 14,
            quantity:  2,
        });

        // Droplet streaks - stretched tall, falling faster than the motes.
        emit({
            speedY:    { min: 620, max: 900 },
            gravityY:  600,
            scaleX:    0.025,
            scaleY:    { start: 0.32, end: 0.12 },
            alpha:     { start: 0.9, end: 0 },
            lifespan:  { min: 480, max: 680 },
            tint:      [MEND_GREEN, MEND_WHITE, MEND_LIME],
            frequency: 26,
        });

        // Mist settling on the card.
        emit({
            speedY:    { min: 90, max: 160 },
            speedX:    { min: -30, max: 30 },
            scale:     { start: 0.4, end: 1.1 },
            alpha:     { start: 0.22, end: 0 },
            lifespan:  { min: 900, max: 1300 },
            tint:      [MEND_GREEN, MEND_DEEP],
            frequency: 70,
        });

        // The card brightens the longer the light falls on it.
        if (mend.cardFx){
            scene.tweens.add({ targets: mend.cardFx, outerStrength: 7, duration: ms, ease: 'Sine.easeIn' });
        }
    }

    /** The shower drawn in to the cross, which tightens and burns white. */
    _mendGather(front, crosses, art, mend){
        const { scene } = this;

        for (let i = 0; i < 40; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r    = Phaser.Math.Between(220, 420);
            const mote = front.add(scene.add.image(Math.cos(a) * r, Math.sin(a) * r, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Utils.Array.GetRandom(MEND_MOTES))
                .setScale(Phaser.Math.FloatBetween(0.04, 0.1)).setAlpha(0)).last;

            scene.tweens.add({
                targets:    mote,
                x:          0,
                y:          0,
                alpha:      { from: 1, to: 0.3 },
                duration:   Phaser.Math.Between(320, 520),
                delay:      Phaser.Math.Between(0, 120),
                ease:       'Cubic.easeIn',
                onComplete: () => mote.destroy(),
            });
        }

        const { halo, outer, tilt, main, core } = crosses;
        scene.tweens.killTweensOf([outer, tilt, core]);

        scene.tweens.add({ targets: [outer, tilt], scale: 0.85, alpha: 1, angle: 0, duration: 560, ease: 'Cubic.easeIn' });
        scene.tweens.add({ targets: main, scale: 0.9, duration: 560, ease: 'Cubic.easeIn' });
        scene.tweens.add({ targets: core, scale: 0.75, alpha: 1, duration: 560, ease: 'Cubic.easeIn' });
        scene.tweens.add({ targets: halo, scale: 2.2, alpha: 1, duration: 560, ease: 'Cubic.easeIn' });

        // The art winds in tight on the card's heart.
        scene.tweens.add({ targets: art.ring,    scaleX: 0.22, scaleY: 0.22, duration: 560, ease: 'Cubic.easeIn' });
        scene.tweens.add({ targets: art.swirl,   scale: 0.16,  duration: 560, ease: 'Cubic.easeIn' });
        scene.tweens.add({ targets: art.flicker, scale: 0.14,  duration: 560, ease: 'Cubic.easeIn' });
        if (art.flicker.anims?.isPlaying) art.flicker.anims.timeScale = 2.2;

        scene.cameras.main.shake(560, 0.0015);
    }

    /**
     * The restore: the brightest beat of the card. White-hot, then green
     * rolling out - the four images thrown open, the crosses blown outwards,
     * a particle explosion, rays and rings round the card.
     */
    _mendBurst(root, front, crosses, art, mend){
        const { scene } = this;

        // White-hot first, then the green rolling out behind it.
        [[MEND_WHITE, 4.2, 360, 1], [MEND_GREEN, 7.5, 760, 0.95], [MEND_LIME, 10, 980, 0.5]]
            .forEach(([tint, to, ms, from]) => {
                const flash = this._glow(front, 0, 0, tint, 0.3);
                scene.tweens.add({
                    targets:    flash,
                    scale:      to,
                    alpha:      { from, to: 0 },
                    duration:   ms,
                    ease:       'Cubic.easeOut',
                    onComplete: () => flash.destroy(),
                });
            });

        // The crosses blown out past the card.
        const { halo, outer, tilt, main, core } = crosses;
        scene.tweens.killTweensOf([halo, outer, tilt, main, core]);
        [[outer, 3.2, 620], [tilt, 2.7, 560], [main, 2.3, 520], [core, 1.8, 440]].forEach(([obj, to, ms]) => {
            scene.tweens.add({ targets: obj, scale: to, alpha: 0, duration: ms, ease: 'Expo.easeOut' });
        });
        scene.tweens.add({ targets: halo, scale: 5, alpha: 0, duration: 640, ease: 'Cubic.easeOut' });

        // The waiting art thrown open, the flipbook running hot.
        scene.tweens.killTweensOf([art.ring, art.swirl, art.flicker]);
        scene.tweens.add({ targets: art.ring,    scaleX: 1.3, scaleY: 1.3, alpha: 0, angle: 90, duration: 820, ease: 'Expo.easeOut' });
        scene.tweens.add({ targets: art.swirl,   scale: 1,    alpha: 0, angle: art.swirl.angle + 220, duration: 780, ease: 'Expo.easeOut' });
        scene.tweens.add({ targets: art.flicker, scale: 0.9,  alpha: 0, duration: 760, ease: 'Expo.easeOut' });

        // The bloom - the open-hearted burst - and two flares crossed through it.
        const bloom = root.add(scene.add.image(0, 0, 'mendBloom')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.12)).last;
        this._fxGlowOn(bloom, MEND_GREEN, 6);
        scene.tweens.add({ targets: bloom, scale: 1.05, angle: 40, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Expo.easeOut' });

        [0, 90].forEach((angle, i) => {
            const flare = root.add(scene.add.image(0, 0, 'mendStreak')
                .setBlendMode(Phaser.BlendModes.ADD).setScale(0.15).setAngle(angle)).last;
            this._fxGlowOn(flare, MEND_LIME, 4);
            scene.tweens.add({
                targets:  flare,
                scale:    0.95 + i * 0.15,
                angle:    angle + (i ? -25 : 25),
                alpha:    { from: 1, to: 0 },
                duration: 820 + i * 100,
                delay:    i * 40,
                ease:     'Expo.easeOut',
            });
        });

        // A second ring thrown wide behind everything.
        const wave = root.add(scene.add.image(0, 0, 'mendRing')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0.9)).last;
        scene.tweens.add({ targets: wave, scale: 1.6, alpha: 0, angle: -60, duration: 1000, delay: 60, ease: 'Expo.easeOut' });

        // Rays.
        for (let i = 0; i < 30; i++){
            const a   = (i / 30) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.05, 0.05);
            const len = Phaser.Math.Between(240, 460);

            // Grown by scaleX: a Shape's width can be written but is not redrawn.
            const ray = front.add(scene.add.rectangle(0, 0, len, i % 4 ? 4 : 6, i % 3 ? MEND_GREEN : MEND_WHITE, 1)
                .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setRotation(a).setScale(0, 1)).last;

            scene.tweens.add({
                targets:    ray,
                scaleX:     1,
                alpha:      { from: 1, to: 0 },
                duration:   Phaser.Math.Between(420, 620),
                ease:       'Cubic.easeOut',
                onComplete: () => ray.destroy(),
            });
        }

        this._ring(front, 0, 0, { from: 40, to: 760, width: 34, color: MEND_GREEN, ms: 800 });
        this._ring(front, 0, 0, { from: 30, to: 560, width: 12, color: MEND_WHITE, ms: 580, delay: 40 });
        this._ring(front, 0, 0, { from: 20, to: 400, width: 20, color: MEND_LIME,  ms: 660, delay: 120 });

        // The particle explosion - a burst out, then sparkles drifting up off
        // the mended card.
        const burst = scene.add.particles(0, 0, RADIAL_KEY, {
            emitting:  false,
            speed:     { min: 220, max: 760 },
            angle:     { min: 0, max: 360 },
            gravityY:  160,
            scale:     { start: 0.13, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 800, max: 1500 },
            tint:      MEND_MOTES,
            blendMode: 'ADD',
        });
        front.add(burst);
        burst.explode(140, 0, 0);

        const rise = scene.add.particles(0, 0, RADIAL_KEY, {
            emitZone:  { type: 'random', source: new Phaser.Geom.Rectangle(-CARD_HALF_W, -CARD_HALF_W, CARD_HALF_W * 2, CARD_HALF_W * 2 + 30) },
            speedY:    { min: -260, max: -110 },
            speedX:    { min: -40, max: 40 },
            scale:     { start: 0.07, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 700, max: 1100 },
            tint:      [MEND_LIME, MEND_MINT, MEND_WHITE],
            frequency: 10,
            quantity:  3,
            blendMode: 'ADD',
            duration:  600,
        });
        front.add(rise);

        // The card itself flares at the heart of it.
        if (mend.cardFx){
            scene.tweens.killTweensOf(mend.cardFx);
            scene.tweens.add({
                targets:       mend.cardFx,
                outerStrength: 16,
                duration:      90,
                hold:          160,
                yoyo:          true,
                ease:          'Quad.easeOut',
            });
        }

        // A short bloom over the whole stage for the contrast.
        const bloomFx = this.post(scene.cameras.main)?.addBloom(MEND_WHITE, 1, 1, 1, 1.6, 4) ?? null;
        if (bloomFx){
            scene.tweens.add({
                targets:    bloomFx,
                strength:   0,
                duration:   620,
                ease:       'Cubic.easeOut',
                onComplete: () => scene.cameras.main.postFX?.remove(bloomFx),
            });
        }

        scene.cameras.main.shake(220, 0.006);
        this._screenFlash(MEND_WHITE, 0.4, 180);
        this._screenFlash(MEND_GREEN, 0.45, 560);
    }

    /**
     * The ESSE restored, thrown up off the card. `look` dresses it for a
     * mend other than the Light one - see _heavyBurst().
     */
    _mendAmount(caster, ev, look = {}){
        const { scene } = this;
        const { fallback = 30, size = 46, fill = '#eaffef', stroke = '#003310', glow = MEND_GREEN } = look;

        const healed = Number.isFinite(ev?.healed) ? ev.healed : fallback;
        const y      = caster.homeY - 40;

        const text = scene.add.text(caster.homeX, y, `+${healed} ESSE`, {
            fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold',
            color: fill, stroke, strokeThickness: 8,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(0.3).setAlpha(0);

        const pre = this.pre(text);
        if (pre){
            pre.setPadding(16);
            pre.addGlow(glow, 4, 0, false, 0.1, 16);
        }

        scene.tweens.add({ targets: text, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets:    text,
            y:          y - 120,
            alpha:      0,
            delay:      900,
            duration:   520,
            ease:       'Cubic.easeIn',
            onComplete: () => text.destroy(),
        });
    }

    /** The card's name slammed into the lane beside the caster. `look` as _mendAmount(). */
    _mendTitle(card, caster, look = {}){
        const { scene } = this;
        const { fill = '#eaffef', stroke = '#002a0c', glow = MEND_GREEN } = look;

        const x = caster.homeX + caster.facing * 330;
        const y = caster.homeY - 110;

        const title = scene.add.text(x, y, `${card.icon}  ${card.name}`, {
            fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold',
            color: fill, stroke, strokeThickness: 7,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(2.4).setAlpha(0);

        const pre = this.pre(title);
        if (pre){
            pre.setPadding(16);
            pre.addGlow(glow, 4, 0, false, 0.1, 16);
            pre.addShine(1.2, 0.4, 4);
        }

        scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
        scene.tweens.add({
            targets:    title,
            alpha:      0,
            y:          y - 40,
            delay:      1150,
            duration:   420,
            ease:       'Cubic.easeIn',
            onComplete: () => title.destroy(),
        });
    }

    // ------------------------------------------------------ heavy mend parts --

    /**
     * The giant cross, built hidden: a deep shadow cross and a wide lavender
     * one behind, the purple body, a white-hot core with a shine across it,
     * and a smaller cross turned 45 degrees - together an eight-pointed star.
     * `to` is the scale each one lands at.
     */
    _heavyCrosses(front){
        const { scene } = this;

        const make = (tint, alpha, angle, to, blend = Phaser.BlendModes.ADD) => {
            const img = front.add(scene.add.image(0, 0, SHARP_CROSS_KEY)
                .setBlendMode(blend).setTint(tint).setAlpha(0)
                .setAngle(angle).setScale(0)).last;
            img.setData('to', to).setData('alpha', alpha);
            return img;
        };

        const halo   = this._glow(front, 0, 0, HEAVY_VIOLET, 0).setAlpha(0);
        // The body is drawn solid, not added, so its needle points stay sharp
        // through all the light piled on it. The rest is kept translucent -
        // stacked with ADD, the layers burn to white fast.
        const shadow = make(HEAVY_DEEP,     0.6,  0,  HEAVY_CROSS_SCALE * 1.18);
        const star   = make(HEAVY_VIOLET,   0.4,  45, HEAVY_CROSS_SCALE * 0.5);
        const outer  = make(HEAVY_LAVENDER, 0.25, 0,  HEAVY_CROSS_SCALE * 1.06);
        const main   = make(HEAVY_PURPLE,   0.92, 0,  HEAVY_CROSS_SCALE, Phaser.BlendModes.NORMAL);
        const core   = make(HEAVY_LILAC,    0.6,  0,  HEAVY_CROSS_SCALE * 0.55);

        const mainFx = this._fxGlowOn(main, HEAVY_VIOLET, 3);
        this._fxGlowOn(core, HEAVY_LAVENDER, 1);
        this.pre(core)?.addShine(0.9, 0.35, 4);

        return { halo, shadow, star, outer, main, core, mainFx };
    }

    /**
     * The cross slams down onto the card: it falls in out of a huge, faint
     * outline, and the instant it lands the stage jolts, rings blow off it and
     * slivers of light are thrown from the blades. Then it breathes.
     */
    _heavyCrossSlam(front, crosses, mend){
        const { scene } = this;
        const { halo, shadow, star, outer, main, core } = crosses;
        const FALL = 190;

        [shadow, outer, main, core].forEach((obj, i) => {
            obj.setScale(obj.getData('to') * 2.8);
            scene.tweens.add({
                targets:  obj,
                scale:    obj.getData('to'),
                alpha:    { from: 0, to: obj.getData('alpha') },
                duration: FALL,
                delay:    i * 12,
                ease:     'Cubic.easeIn',
            });
        });

        scene.time.delayedCall(FALL, () => {
            if (!front.active) return;

            scene.tweens.add({ targets: star, scale: star.getData('to'), alpha: star.getData('alpha'), duration: 260, ease: 'Back.easeOut' });
            scene.tweens.add({ targets: halo, scale: 3, alpha: 0.45, duration: 240, ease: 'Cubic.easeOut' });

            // The landing.
            const slam = this._glow(front, 0, 0, HEAVY_WHITE, 0.4);
            scene.tweens.add({ targets: slam, scale: 5, alpha: { from: 1, to: 0 }, duration: 380, ease: 'Cubic.easeOut', onComplete: () => slam.destroy() });

            this._ring(front, 0, 0, { from: 30, to: 520, width: 26, color: HEAVY_PURPLE,  ms: 560 });
            this._ring(front, 0, 0, { from: 20, to: 360, width: 6,  color: HEAVY_WHITE,   ms: 420, delay: 30 });
            this._ring(front, 0, 0, { from: 60, to: 760, width: 10, color: HEAVY_MAGENTA, ms: 780, delay: 90 });

            this._heavySlivers(front);

            this._screenFlash(HEAVY_WHITE,  0.4, 160);
            this._screenFlash(HEAVY_PURPLE, 0.3, 460);
            scene.cameras.main.shake(320, 0.012);

            if (mend.cardFx){
                scene.tweens.add({ targets: mend.cardFx, outerStrength: 10, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
            }

            // Then it breathes - out of step, so the layers shimmer.
            scene.tweens.add({ targets: outer, scale: outer.getData('to') * 1.12, alpha: 0.12, duration: 560, delay: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            scene.tweens.add({ targets: star,  angle: 60, duration: 1300, delay: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            scene.tweens.add({ targets: core,  alpha: 0.4,  duration: 240, delay: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            scene.tweens.add({ targets: halo,  alpha: 0.3,  duration: 700, delay: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        });
    }

    /** Slivers of light thrown off the cross as it lands, and a glint off each point. */
    _heavySlivers(front){
        const { scene } = this;

        for (let i = 0; i < 34; i++){
            const a   = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const len = Phaser.Math.Between(200, 460);

            const sliver = front.add(scene.add.rectangle(0, 0, Phaser.Math.Between(22, 52), 3,
                Phaser.Utils.Array.GetRandom(HEAVY_MOTES), 1)
                .setBlendMode(Phaser.BlendModes.ADD).setRotation(a)).last;

            scene.tweens.add({
                targets:    sliver,
                x:          Math.cos(a) * len,
                y:          Math.sin(a) * len,
                scaleX:     0.15,
                alpha:      0,
                duration:   Phaser.Math.Between(380, 640),
                ease:       'Cubic.easeOut',
                onComplete: () => sliver.destroy(),
            });
        }

        // A needle of light shot on out past each point of the cross.
        [[0, -1, HEAVY_CROSS_LONG], [1, 0, HEAVY_CROSS_SIDE], [0, 1, HEAVY_CROSS_LONG], [-1, 0, HEAVY_CROSS_SIDE]]
            .forEach(([dx, dy, reach]) => {
                const tip    = reach * HEAVY_CROSS_SCALE;
                const needle = front.add(scene.add.rectangle(dx * tip, dy * tip, 90, 4, HEAVY_WHITE, 1)
                    .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD)
                    .setRotation(Math.atan2(dy, dx)).setScale(0, 1)).last;

                scene.tweens.add({
                    targets:    needle,
                    scaleX:     { from: 0, to: 2.4 },
                    x:          dx * (tip + 140),
                    y:          dy * (tip + 140),
                    alpha:      { from: 1, to: 0 },
                    duration:   420,
                    ease:       'Expo.easeOut',
                    onComplete: () => needle.destroy(),
                });
            });
    }

    /**
     * The heavy mend art, waiting high over the card: the nebula ring laid
     * flat like a halo, the tilted ring and the crescent turning against each
     * other, and the flipbook of all four images at their heart.
     */
    _heavyArt(root){
        const { scene } = this;
        const top = -CARD_HALF_H - 160;

        const add = (key, scale) => root.add(scene.add.image(0, top, key)
            .setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(0)).last;

        const ring     = add('heavyRing', 0.5).setScale(0.5, 0.16);
        const halo     = add('heavyHalo', 0.3);
        const crescent = add('heavyCrescent', 0.26);

        const flicker = root.add(scene.add.sprite(0, top, 'heavyNebula')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.24).setAlpha(0)).last;

        if (scene.anims.exists(HEAVY_FLICKER)) flicker.play(HEAVY_FLICKER);

        // Kept low - glow on smoky art saturates fast.
        this._fxGlowOn(ring,    HEAVY_PURPLE,   2);
        this._fxGlowOn(flicker, HEAVY_LAVENDER, 1.5);

        scene.tweens.add({ targets: halo,     angle:  360, duration: 1800, repeat: -1 });
        scene.tweens.add({ targets: crescent, angle: -360, duration: 1100, repeat: -1 });
        scene.tweens.add({ targets: flicker,  angle:  360, duration: 3200, repeat: -1 });

        return { ring, halo, crescent, flicker };
    }

    /** The art gathers out of the dark over the card. */
    _heavyArtIn(art){
        const { scene } = this;

        scene.tweens.add({ targets: [art.ring, art.halo], alpha: 0.75, duration: 420, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: [art.crescent, art.flicker], alpha: 0.55, duration: 420, ease: 'Sine.easeOut' });
    }

    /** The art sinks down onto the card as the light pours. */
    _heavyDescend(art, ms){
        const { scene } = this;
        const { ring, halo, crescent, flicker } = art;
        const ease = 'Sine.easeInOut';

        scene.tweens.add({ targets: [ring, halo, crescent, flicker], y: 0, duration: ms, ease });
        scene.tweens.add({ targets: ring,     scaleX: 0.66, scaleY: 0.66, duration: ms, ease });
        scene.tweens.add({ targets: halo,     scale: 0.56, duration: ms, ease });
        scene.tweens.add({ targets: crescent, scale: 0.5,  duration: ms, ease });
        scene.tweens.add({ targets: flicker,  scale: 0.44, duration: ms, ease });
    }

    /** Purple light pulled in from all over the darkening stage to the card. */
    _heavyDraw(front, ms){
        const { scene } = this;

        for (let i = 0; i < 90; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r    = Phaser.Math.Between(380, 1000);
            const mote = front.add(scene.add.image(Math.cos(a) * r, Math.sin(a) * r, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Utils.Array.GetRandom(HEAVY_MOTES))
                .setScale(Phaser.Math.FloatBetween(0.04, 0.12)).setAlpha(0)).last;

            scene.tweens.add({
                targets:    mote,
                x:          0,
                y:          0,
                alpha:      { from: 1, to: 0.2 },
                duration:   Phaser.Math.Between(ms * 0.7, ms),
                delay:      Phaser.Math.Between(0, 140),
                ease:       'Cubic.easeIn',
                onComplete: () => mote.destroy(),
            });
        }

        // Streaks racing in alongside them, pointed at the card.
        for (let i = 0; i < 26; i++){
            const a      = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r      = Phaser.Math.Between(500, 900);
            const streak = front.add(scene.add.rectangle(Math.cos(a) * r, Math.sin(a) * r, Phaser.Math.Between(40, 90), 2,
                Phaser.Utils.Array.GetRandom(HEAVY_MOTES), 1)
                .setBlendMode(Phaser.BlendModes.ADD).setRotation(a).setAlpha(0)).last;

            scene.tweens.add({
                targets:    streak,
                x:          Math.cos(a) * 60,
                y:          Math.sin(a) * 60,
                alpha:      { from: 0.9, to: 0 },
                duration:   Phaser.Math.Between(ms * 0.6, ms * 0.9),
                delay:      Phaser.Math.Between(0, 160),
                ease:       'Cubic.easeIn',
                onComplete: () => streak.destroy(),
            });
        }
    }

    /**
     * A torrent of light pouring down onto the card: dense motes, long
     * streaks, glints and mist from above, splashes thrown up off its top
     * edge and sparkles kindling all over its face. Runs until the burst
     * stops it. The emitter maker is kept on `mend` so the surge can add to it.
     */
    _heavyShower(front, mend, ms){
        const { scene } = this;

        const sky  = new Phaser.Geom.Rectangle(-CARD_HALF_W - 90, -CARD_HALF_H - 380, CARD_HALF_W * 2 + 180, 80);
        const face = new Phaser.Geom.Rectangle(-CARD_HALF_W, -CARD_HALF_H, CARD_HALF_W * 2, CARD_HALF_H * 2);

        // Light that has fallen past the card is gone. A death zone is tested
        // against the particle's world position, not the container's.
        const floor = { type: 'onEnter', source: new Phaser.Geom.Rectangle(-2000, mend.caster.homeY + CARD_HALF_H + 30, 6000, 2000) };

        const emit = (config) => {
            const e = scene.add.particles(0, 0, RADIAL_KEY, {
                emitZone:  { type: 'random', source: sky },
                deathZone: floor,
                blendMode: 'ADD',
                ...config,
            });
            front.add(e);
            mend.emitters.push(e);
            return e;
        };
        mend.emit = emit;

        // Motes - the body of the torrent.
        emit({
            speedY:    { min: 320, max: 640 },
            speedX:    { min: -30, max: 30 },
            gravityY:  520,
            scale:     { start: 0.11, end: 0.015 },
            alpha:     { start: 1, end: 0.3 },
            lifespan:  { min: 1100, max: 1500 },
            tint:      HEAVY_MOTES,
            frequency: 6,
            quantity:  3,
        });

        // Streaks - stretched tall, falling fastest.
        emit({
            speedY:    { min: 760, max: 1100 },
            gravityY:  700,
            scaleX:    0.03,
            scaleY:    { start: 0.46, end: 0.14 },
            alpha:     { start: 0.95, end: 0.25 },
            lifespan:  { min: 700, max: 900 },
            tint:      [HEAVY_PURPLE, HEAVY_WHITE, HEAVY_LAVENDER, HEAVY_MAGENTA],
            frequency: 10,
            quantity:  2,
        });

        // Glints - small, white and slow, twinkling through the rest.
        emit({
            speedY:    { min: 200, max: 420 },
            speedX:    { min: -50, max: 50 },
            scale:     { start: 0.05, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 900, max: 1300 },
            tint:      [HEAVY_WHITE, HEAVY_LILAC],
            frequency: 18,
            quantity:  2,
        });

        // Mist settling over the card.
        emit({
            speedY:    { min: 90, max: 180 },
            speedX:    { min: -40, max: 40 },
            scale:     { start: 0.5, end: 1.4 },
            alpha:     { start: 0.2, end: 0 },
            lifespan:  { min: 1100, max: 1500 },
            tint:      [HEAVY_PURPLE, HEAVY_DEEP, HEAVY_VIOLET],
            frequency: 60,
        });

        // Splashes thrown up where the torrent meets the card's top edge.
        emit({
            emitZone:  { type: 'random', source: new Phaser.Geom.Rectangle(-CARD_HALF_W, -CARD_HALF_H - 10, CARD_HALF_W * 2, 20) },
            speed:     { min: 80, max: 260 },
            angle:     { min: 200, max: 340 },
            gravityY:  700,
            scale:     { start: 0.06, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 380, max: 560 },
            tint:      HEAVY_MOTES,
            frequency: 14,
            quantity:  2,
        });

        // The card's face kindling where the light soaks in.
        emit({
            emitZone:  { type: 'random', source: face },
            speed:     { min: 0, max: 30 },
            scale:     { start: 0.08, end: 0 },
            alpha:     { start: 0.9, end: 0 },
            lifespan:  { min: 400, max: 700 },
            tint:      [HEAVY_LAVENDER, HEAVY_WHITE, HEAVY_MAGENTA],
            frequency: 20,
            quantity:  2,
        });

        // The card brightens the longer the light falls on it.
        if (mend.cardFx){
            scene.tweens.add({ targets: mend.cardFx, outerStrength: 7, duration: ms, ease: 'Sine.easeIn' });
        }
    }

    /**
     * The surge: a pillar of light drives down through the card, the torrent
     * doubles inside it, and lightning crackles along the cross's blades.
     */
    _heavySurge(root, front, crosses, mend, ms){
        const { scene } = this;

        // Stretched far taller than the stage, so the soft disc reads as an
        // even column with feathered sides.
        const column = (tint, scaleX, alpha) => {
            const img = root.add(scene.add.image(0, -260, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0, 14).setAlpha(0)).last;

            scene.tweens.add({ targets: img, scaleX, alpha, duration: 160, ease: 'Expo.easeOut' });
            scene.tweens.add({ targets: img, alpha: alpha * 0.7, duration: 70, delay: 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            return img;
        };

        mend.pillar = [column(HEAVY_PURPLE, 1.1, 0.4), column(HEAVY_LAVENDER, 0.45, 0.3), column(HEAVY_WHITE, 0.08, 0.6)];

        // Where it strikes the card.
        const strike = this._glow(front, 0, -CARD_HALF_H, HEAVY_WHITE, 0.3);
        scene.tweens.add({ targets: strike, scale: 3.4, alpha: { from: 1, to: 0 }, duration: 420, ease: 'Cubic.easeOut', onComplete: () => strike.destroy() });

        this._ring(front, 0, 0, { from: 40, to: 640, width: 18, color: HEAVY_VIOLET, ms: 640 });
        this._screenFlash(HEAVY_VIOLET, 0.25, 360);
        scene.cameras.main.shake(ms, 0.0025);

        // The torrent doubles inside the pillar.
        mend.emit?.({
            emitZone:  { type: 'random', source: new Phaser.Geom.Rectangle(-120, -CARD_HALF_H - 420, 240, 60) },
            speedY:    { min: 900, max: 1300 },
            gravityY:  800,
            scaleX:    0.035,
            scaleY:    { start: 0.55, end: 0.16 },
            alpha:     { start: 1, end: 0.3 },
            lifespan:  { min: 600, max: 800 },
            tint:      [HEAVY_WHITE, HEAVY_LILAC, HEAVY_VIOLET],
            frequency: 8,
            quantity:  3,
        });
        mend.emit?.({
            speedY:    { min: 420, max: 760 },
            speedX:    { min: -40, max: 40 },
            gravityY:  600,
            scale:     { start: 0.13, end: 0.02 },
            alpha:     { start: 1, end: 0.3 },
            lifespan:  { min: 900, max: 1200 },
            tint:      HEAVY_MOTES,
            frequency: 8,
            quantity:  3,
        });

        // The cross answers it.
        const { main, outer, mainFx } = crosses;
        if (mainFx) scene.tweens.add({ targets: mainFx, outerStrength: 6, duration: 220, ease: 'Quad.easeOut' });
        scene.tweens.add({ targets: main, scale: main.getData('to') * 1.06, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
        scene.tweens.killTweensOf(outer);
        scene.tweens.add({ targets: outer, scale: outer.getData('to') * 1.18, alpha: 0.12, duration: 220, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        mend.arcs = this._heavyArcs(front, ms);
    }

    /**
     * Lightning crackling along the cross's blades - redrawn every few frames
     * as fresh jagged bolts, a violet glow under a white-hot line, each now
     * and then forking off the blade into the dark.
     */
    _heavyArcs(front, ms){
        const { scene } = this;

        const g = front.add(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD)).last;
        const arms = [[0, -1, HEAVY_CROSS_LONG], [1, 0, HEAVY_CROSS_SIDE], [0, 1, HEAVY_CROSS_LONG], [-1, 0, HEAVY_CROSS_SIDE]];

        const bolt = (points) => {
            [[7, HEAVY_VIOLET, 0.45], [2.5, HEAVY_WHITE, 0.95]].forEach(([width, color, alpha]) => {
                g.lineStyle(width, color, alpha);
                g.beginPath();
                g.moveTo(points[0].x, points[0].y);
                points.slice(1).forEach(p => g.lineTo(p.x, p.y));
                g.strokePath();
            });
        };

        const crackle = () => {
            g.clear();

            for (let n = 0; n < 3; n++){
                const [dx, dy, reach] = Phaser.Utils.Array.GetRandom(arms);
                const len   = reach * HEAVY_CROSS_SCALE * Phaser.Math.FloatBetween(0.7, 1.1);
                const start = Phaser.Math.FloatBetween(0, 0.25) * len;
                const steps = 7;

                const points = [];
                for (let i = 0; i <= steps; i++){
                    const along  = Phaser.Math.Linear(start, len, i / steps);
                    const across = i === 0 ? 0 : Phaser.Math.FloatBetween(-16, 16);
                    points.push({ x: dx * along - dy * across, y: dy * along + dx * across });
                }
                bolt(points);

                // A fork off the blade, into the dark.
                if (Math.random() < 0.6){
                    const from = points[Phaser.Math.Between(2, steps - 1)];
                    const side = Math.random() < 0.5 ? -1 : 1;
                    const fork = [from];
                    for (let i = 1; i <= 3; i++){
                        const prev = fork[i - 1];
                        fork.push({
                            x: prev.x + (-dy * side * 28 + dx * 14) + Phaser.Math.FloatBetween(-8, 8),
                            y: prev.y + ( dx * side * 28 + dy * 14) + Phaser.Math.FloatBetween(-8, 8),
                        });
                    }
                    bolt(fork);
                }
            }
        };

        crackle();
        const timer = scene.time.addEvent({ delay: 60, repeat: Math.max(0, Math.floor(ms / 60) - 1), callback: crackle });

        return { g, timer };
    }

    /** Everything drawn into the cross, which tightens and burns white-hot. */
    _heavyGather(front, crosses, art, mend, ms){
        const { scene } = this;

        // The lightning dies away.
        if (mend.arcs){
            mend.arcs.timer.remove();
            scene.tweens.add({ targets: mend.arcs.g, alpha: 0, duration: 160 });
        }

        // The pillar is drawn thin into the card.
        (mend.pillar ?? []).forEach(img => {
            scene.tweens.killTweensOf(img);
            scene.tweens.add({ targets: img, scaleX: 0, alpha: 1, duration: ms * 0.85, ease: 'Cubic.easeIn' });
        });

        for (let i = 0; i < 70; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r    = Phaser.Math.Between(260, 560);
            const mote = front.add(scene.add.image(Math.cos(a) * r, Math.sin(a) * r, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Utils.Array.GetRandom(HEAVY_MOTES))
                .setScale(Phaser.Math.FloatBetween(0.04, 0.11)).setAlpha(0)).last;

            scene.tweens.add({
                targets:    mote,
                x:          0,
                y:          0,
                alpha:      { from: 1, to: 0.3 },
                duration:   Phaser.Math.Between(ms * 0.55, ms * 0.95),
                delay:      Phaser.Math.Between(0, 100),
                ease:       'Cubic.easeIn',
                onComplete: () => mote.destroy(),
            });
        }

        // A ring of light closing in on the card from the edge of the stage.
        this._ring(front, 0, 0, { from: 760, to: 60, width: 12, color: HEAVY_LAVENDER, ms });

        const { halo, shadow, star, outer, main, core } = crosses;
        scene.tweens.killTweensOf([halo, shadow, star, outer, main, core]);

        const to   = (obj, k) => obj.getData('to') * k;
        const ease = 'Cubic.easeIn';
        scene.tweens.add({ targets: outer,  scale: to(outer, 0.9), alpha: 0.5, duration: ms, ease });
        scene.tweens.add({ targets: shadow, scale: to(shadow, 0.9), duration: ms, ease });
        scene.tweens.add({ targets: main,   scale: to(main, 0.92), duration: ms, ease });
        scene.tweens.add({ targets: core,   scale: to(core, 1.15), alpha: 1, duration: ms, ease });
        scene.tweens.add({ targets: star,   scale: to(star, 0.8), alpha: 1, angle: 45 + 180, duration: ms, ease });
        scene.tweens.add({ targets: halo,   scale: 2.4, alpha: 0.75, duration: ms, ease });

        // The art winds in tight on the card's heart.
        scene.tweens.add({ targets: art.ring,     scaleX: 0.3, scaleY: 0.3, duration: ms, ease });
        scene.tweens.add({ targets: art.halo,     scale: 0.26, duration: ms, ease });
        scene.tweens.add({ targets: art.crescent, scale: 0.22, duration: ms, ease });
        scene.tweens.add({ targets: art.flicker,  scale: 0.2,  duration: ms, ease });
        if (art.flicker.anims?.isPlaying) art.flicker.anims.timeScale = 2.6;

        if (mend.cardFx){
            scene.tweens.killTweensOf(mend.cardFx);
            scene.tweens.add({ targets: mend.cardFx, outerStrength: 12, duration: ms, ease });
        }

        scene.cameras.main.shake(ms, 0.003);
    }

    /**
     * The restore: the brightest beat of the card. White-hot, then purple
     * rolling out - the cross blown apart, all four images thrown open, rays
     * along the cross's lines and all round it, rings and a particle explosion.
     */
    _heavyBurst(root, front, crosses, art, mend){
        const { scene } = this;

        // White-hot first, then the purple rolling out behind it.
        [[HEAVY_WHITE, 4, 380, 1], [HEAVY_PURPLE, 8.5, 880, 0.85], [HEAVY_LAVENDER, 11, 1100, 0.3]]
            .forEach(([tint, to, ms, from]) => {
                const flash = this._glow(front, 0, 0, tint, 0.3);
                scene.tweens.add({
                    targets:    flash,
                    scale:      to,
                    alpha:      { from, to: 0 },
                    duration:   ms,
                    ease:       'Cubic.easeOut',
                    onComplete: () => flash.destroy(),
                });
            });

        // The cross blown out past the card, a white afterimage left behind.
        const { halo, shadow, star, outer, main, core } = crosses;
        scene.tweens.killTweensOf([halo, shadow, star, outer, main, core]);
        [[shadow, 3.4, 760], [outer, 3, 640], [main, 2.6, 600], [core, 2, 480]].forEach(([obj, k, ms]) => {
            scene.tweens.add({ targets: obj, scale: obj.scale * k, alpha: 0, duration: ms, ease: 'Expo.easeOut' });
        });
        scene.tweens.add({ targets: star, scale: star.scale * 2.4, angle: star.angle + 90, alpha: 0, duration: 700, ease: 'Expo.easeOut' });
        scene.tweens.add({ targets: halo, scale: 6, alpha: 0, duration: 700, ease: 'Cubic.easeOut' });

        const ghost = front.add(scene.add.image(0, 0, SHARP_CROSS_KEY)
            .setBlendMode(Phaser.BlendModes.ADD).setTint(HEAVY_WHITE).setScale(HEAVY_CROSS_SCALE)).last;
        scene.tweens.add({ targets: ghost, scale: HEAVY_CROSS_SCALE * 1.9, alpha: { from: 1, to: 0 }, duration: 320, ease: 'Cubic.easeOut', onComplete: () => ghost.destroy() });

        // The waiting art thrown open, the flipbook running hot.
        scene.tweens.killTweensOf([art.ring, art.halo, art.crescent, art.flicker]);
        scene.tweens.add({ targets: art.ring,     scaleX: 1.9, scaleY: 1.9, alpha: 0, angle: 120, duration: 900, ease: 'Expo.easeOut' });
        scene.tweens.add({ targets: art.halo,     scale: 1.6, alpha: 0, angle: art.halo.angle + 240, duration: 860, ease: 'Expo.easeOut' });
        scene.tweens.add({ targets: art.crescent, scale: 1.4, alpha: 0, angle: art.crescent.angle - 300, duration: 820, ease: 'Expo.easeOut' });
        scene.tweens.add({ targets: art.flicker,  scale: 1.3, alpha: 0, duration: 800, ease: 'Expo.easeOut' });

        // A second crescent spun out the other way, and the nebula blooming
        // open at the heart of it all.
        const crescent = root.add(scene.add.image(0, 0, 'heavyCrescent')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAngle(180)).last;
        scene.tweens.add({ targets: crescent, scale: 1.5, angle: 60, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Expo.easeOut' });

        const nebula = root.add(scene.add.image(0, 0, 'heavyNebula')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.15)).last;
        this._fxGlowOn(nebula, HEAVY_PURPLE, 3);
        scene.tweens.add({ targets: nebula, scale: 1.5, angle: 50, alpha: { from: 1, to: 0 }, duration: 1000, ease: 'Expo.easeOut' });

        const wave = root.add(scene.add.image(0, 0, 'heavyRing')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.25).setAlpha(0.9)).last;
        scene.tweens.add({ targets: wave, scale: 2.2, alpha: 0, angle: -70, duration: 1100, delay: 60, ease: 'Expo.easeOut' });

        // Rays - four long ones down the cross's own lines, the rest all round.
        [0, 90, 180, 270].forEach((deg) => {
            [[HEAVY_WHITE, 10, 520], [HEAVY_VIOLET, 22, 700]].forEach(([color, thick, ms]) => {
                const ray = front.add(scene.add.rectangle(0, 0, 960, thick, color, 1)
                    .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setAngle(deg).setScale(0, 1)).last;

                scene.tweens.add({
                    targets:    ray,
                    scaleX:     1,
                    scaleY:     0.2,
                    alpha:      { from: 1, to: 0 },
                    duration:   ms,
                    ease:       'Expo.easeOut',
                    onComplete: () => ray.destroy(),
                });
            });
        });

        for (let i = 0; i < 48; i++){
            const a   = (i / 48) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.04, 0.04);
            const len = Phaser.Math.Between(280, 620);

            // Grown by scaleX: a Shape's width can be written but is not redrawn.
            const ray = front.add(scene.add.rectangle(0, 0, len, i % 4 ? 4 : 7,
                i % 3 === 0 ? HEAVY_WHITE : i % 3 === 1 ? HEAVY_PURPLE : HEAVY_LAVENDER, 1)
                .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setRotation(a).setScale(0, 1)).last;

            scene.tweens.add({
                targets:    ray,
                scaleX:     1,
                alpha:      { from: 1, to: 0 },
                duration:   Phaser.Math.Between(460, 720),
                ease:       'Cubic.easeOut',
                onComplete: () => ray.destroy(),
            });
        }

        this._ring(front, 0, 0, { from: 40, to: 900,  width: 40, color: HEAVY_PURPLE,   ms: 900 });
        this._ring(front, 0, 0, { from: 30, to: 640,  width: 14, color: HEAVY_WHITE,    ms: 640, delay: 40 });
        this._ring(front, 0, 0, { from: 20, to: 460,  width: 22, color: HEAVY_LAVENDER, ms: 720, delay: 120 });
        this._ring(front, 0, 0, { from: 60, to: 1150, width: 8,  color: HEAVY_MAGENTA,  ms: 1100, delay: 200 });

        // The particle explosion - a hard burst out, a slower cloud of sparkles
        // floating off, and light rising off the mended card.
        const particles = (config) => {
            const e = scene.add.particles(0, 0, RADIAL_KEY, { blendMode: 'ADD', ...config });
            front.add(e);
            return e;
        };

        particles({
            emitting:  false,
            speed:     { min: 260, max: 900 },
            angle:     { min: 0, max: 360 },
            gravityY:  140,
            scale:     { start: 0.15, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 900, max: 1700 },
            tint:      HEAVY_MOTES,
        }).explode(260, 0, 0);

        particles({
            emitting:  false,
            speed:     { min: 60, max: 260 },
            angle:     { min: 0, max: 360 },
            gravityY:  -40,
            scale:     { start: 0.06, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 1400, max: 2200 },
            tint:      [HEAVY_WHITE, HEAVY_LILAC, HEAVY_LAVENDER],
        }).explode(140, 0, 0);

        particles({
            emitZone:  { type: 'random', source: new Phaser.Geom.Rectangle(-CARD_HALF_W, -CARD_HALF_H, CARD_HALF_W * 2, CARD_HALF_H * 2) },
            speedY:    { min: -300, max: -120 },
            speedX:    { min: -40, max: 40 },
            scale:     { start: 0.08, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 700, max: 1200 },
            tint:      [HEAVY_LAVENDER, HEAVY_LILAC, HEAVY_WHITE, HEAVY_MAGENTA],
            frequency: 8,
            quantity:  4,
            duration:  800,
        });

        // The card itself flares at the heart of it.
        if (mend.cardFx){
            scene.tweens.killTweensOf(mend.cardFx);
            scene.tweens.add({
                targets:       mend.cardFx,
                outerStrength: 22,
                duration:      90,
                hold:          200,
                yoyo:          true,
                ease:          'Quad.easeOut',
            });
        }

        // A short bloom over the whole stage for the contrast.
        const bloomFx = this.post(scene.cameras.main)?.addBloom(HEAVY_WHITE, 1, 1, 1, 1.5, 4) ?? null;
        if (bloomFx){
            scene.tweens.add({
                targets:    bloomFx,
                strength:   0,
                duration:   760,
                ease:       'Cubic.easeOut',
                onComplete: () => scene.cameras.main.postFX?.remove(bloomFx),
            });
        }

        scene.cameras.main.shake(320, 0.012);
        this._screenFlash(HEAVY_WHITE,  0.45, 200);
        this._screenFlash(HEAVY_PURPLE, 0.3,  700);
    }

    // ------------------------------------------------ dark disturbance parts --

    /** Starlight pulled in from all round the stage to the middle of it. */
    _darkGather(root){
        const { scene } = this;

        for (let i = 0; i < 40; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r    = Phaser.Math.Between(260, 520);
            const tint = Phaser.Utils.Array.GetRandom(DARK_STAR_MOTES);

            const mote = root.add(scene.add.image(Math.cos(a) * r, Math.sin(a) * r * 0.7, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(tint)
                .setScale(Phaser.Math.FloatBetween(0.03, 0.09)).setAlpha(0)).last;

            scene.tweens.add({
                targets:    mote,
                x:          0,
                y:          0,
                alpha:      { from: 1, to: 0.4 },
                duration:   Phaser.Math.Between(480, 800),
                delay:      Phaser.Math.Between(0, 700),
                ease:       'Cubic.easeIn',
                onComplete: () => mote.destroy(),
            });
        }
    }

    /**
     * The star, kindled out of a speck: a soft blue halo, a still star
     * turning slowly behind, and the four light images flipped as one sprite
     * in front - with a glow and a shine run across it. Grows over `ms`.
     */
    _darkKindle(root, ms){
        const { scene } = this;

        const halo = this._glow(root, 0, 0, 0x4fb4ff, 0).setAlpha(0.9);
        const back = root.add(scene.add.image(0, 0, 'darkLight3')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0).setAlpha(0.7)).last;
        const sprite = root.add(scene.add.sprite(0, 0, 'darkLight4')
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0)).last;
        const core = this._glow(root, 0, 0, 0xffffff, 0);

        sprite.play(DARK_LIGHT_FLICKER);

        const glowFx = this._fxGlowOn(sprite, DARK_STAR, 2);
        const pre    = this.pre(sprite);
        pre?.addShine(0.9, 0.35, 3);

        scene.tweens.add({ targets: sprite, scale: 0.5, duration: ms, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: back,   scale: 0.62, duration: ms, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: halo,   scale: 2.6, duration: ms, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: core,   scale: 0.9, duration: ms, ease: 'Sine.easeOut' });

        // Turning, two ways, and breathing as it grows.
        scene.tweens.add({ targets: sprite, angle:  360, duration: 7000, repeat: -1 });
        scene.tweens.add({ targets: back,   angle: -360, duration: 9000, repeat: -1 });
        scene.tweens.add({ targets: core, alpha: { from: 1, to: 0.6 }, duration: 160, yoyo: true, repeat: -1 });
        if (glowFx) scene.tweens.add({ targets: glowFx, outerStrength: 6, duration: ms, ease: 'Sine.easeIn' });

        // A ring off the star every few beats as it gathers itself.
        [0, 0.35, 0.7].forEach((at, k) => {
            this._ring(root, 0, 0, { from: 10, to: 160 + k * 60, width: 8, color: DARK_STAR, ms: 600, delay: ms * at });
        });

        return { halo, back, sprite, core, glowFx };
    }

    /** The star at its brightest: rays, rings and a blue-white wash over the stage. */
    _darkBlaze(root, light){
        const { scene } = this;
        if (!light) return;

        scene.tweens.add({ targets: light.sprite, scale: 0.72, duration: 220, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: light.back,   scale: 0.9,  duration: 260, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: light.halo,   scale: 4.4,  duration: 280, ease: 'Cubic.easeOut' });
        if (light.glowFx) scene.tweens.add({ targets: light.glowFx, outerStrength: 12, duration: 160, ease: 'Quad.easeOut' });

        // The two brightest stills thrown wide behind it, turning apart.
        ['darkLight1', 'darkLight2'].forEach((key, i) => {
            const flare = root.add(scene.add.image(0, 0, key)
                .setBlendMode(Phaser.BlendModes.ADD).setScale(0.3).setAngle(i * 45)).last;

            scene.tweens.add({
                targets:    flare,
                scale:      0.95 + i * 0.25,
                angle:      flare.angle + (i ? -40 : 40),
                alpha:      { from: 0.95, to: 0 },
                duration:   700 + i * 120,
                ease:       'Cubic.easeOut',
                onComplete: () => flare.destroy(),
            });
        });

        for (let i = 0; i < 24; i++){
            const a   = (i / 24) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
            const len = Phaser.Math.Between(240, 460);

            const ray = root.add(scene.add.rectangle(0, 0, len, i % 4 ? 3 : 6, i % 3 ? DARK_STAR : 0xffffff, 1)
                .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setRotation(a).setScale(0, 1)).last;

            scene.tweens.add({
                targets:    ray,
                scaleX:     1,
                alpha:      { from: 1, to: 0 },
                duration:   Phaser.Math.Between(420, 620),
                ease:       'Cubic.easeOut',
                onComplete: () => ray.destroy(),
            });
        }

        this._ring(root, 0, 0, { from: 30, to: 520, width: 22, color: DARK_STAR, ms: 700 });
        this._ring(root, 0, 0, { from: 20, to: 360, width: 8,  color: 0xffffff, ms: 520, delay: 50 });

        this._screenFlash(0xd8f0ff, 0.45, 420);
        scene.cameras.main.shake(140, 0.003);
    }

    /**
     * The light breaking apart. The star flares and goes out, and its motes
     * are dragged across the stage to the rival - where the void will open.
     */
    _darkDisperse(root, light, rival){
        const { scene } = this;

        if (light){
            scene.tweens.killTweensOf([light.sprite, light.back, light.halo, light.core]);
            scene.tweens.add({ targets: [light.sprite, light.back], scale: 1.15, alpha: 0, duration: 420, ease: 'Cubic.easeOut' });
            scene.tweens.add({ targets: [light.halo, light.core], scale: 0.2, alpha: 0, duration: 380, ease: 'Cubic.easeIn' });
        }

        this._ring(root, 0, 0, { from: 60, to: 620, width: 12, color: DARK_STAR, ms: 620 });

        // Where the rival's card sits, from the star's own frame.
        const tx = rival.homeX - root.x;
        const ty = rival.homeY - root.y;

        for (let i = 0; i < 46; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const out  = Phaser.Math.Between(60, 220);
            const tint = Phaser.Utils.Array.GetRandom(DARK_STAR_MOTES);

            const mote = root.add(scene.add.image(0, 0, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(tint)
                .setScale(Phaser.Math.FloatBetween(0.04, 0.1))).last;

            // Scattered first, then pulled - the light caught by something.
            scene.tweens.chain({
                targets: mote,
                tweens: [
                    { x: Math.cos(a) * out, y: Math.sin(a) * out, duration: Phaser.Math.Between(180, 300), ease: 'Cubic.easeOut' },
                    {
                        x:        tx + Phaser.Math.Between(-30, 30),
                        y:        ty + Phaser.Math.Between(-30, 30),
                        scale:    0.02,
                        alpha:    0.2,
                        duration: Phaser.Math.Between(320, 520),
                        delay:    Phaser.Math.Between(0, 160),
                        ease:     'Cubic.easeIn',
                    },
                ],
                onComplete: () => mote.destroy(),
            });
        }
    }

    /**
     * A speck of void torn open over the rival's card. Built in layers, all
     * NORMAL-blended where they are dark so they truly darken what they cover:
     *
     *   shadow  a black pool round it - the dark spilling out over the stage
     *   rim     a violet glow behind the art - the void's light-less edge
     *   under   a still void, flipped and counter-turning, alpha'd down
     *   main    the four void images churned as one sprite
     *   heart   a hard black centre the light never reaches
     */
    _darkRift(pit, hex, dark){
        const { scene } = this;
        const { rival } = dark;

        const shadow = pit.add(scene.add.image(0, 0, RADIAL_KEY)
            .setTint(0x000000).setScale(0).setAlpha(0.9)).last;
        const rim = this._glow(pit, 0, 0, DARK_VIOLET, 0).setAlpha(0.85);
        const under = pit.add(scene.add.image(0, 0, 'darkVoid4')
            .setFlipX(true).setScale(0).setAlpha(0.6)).last;
        const main = pit.add(scene.add.sprite(0, 0, 'darkVoid2').setScale(0).setTint(0xd8c2ff)).last;
        const heart = pit.add(scene.add.image(0, 0, RADIAL_KEY)
            .setTint(0x000000).setScale(0)).last;

        main.play(DARK_VOID_FLICKER);

        const mainFx = this._fxGlowOn(main, DARK_VIOLET, 2);

        // Opening: a tear, then a speck.
        scene.tweens.add({ targets: main,   scale: 0.08, duration: 160, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: under,  scale: 0.1,  duration: 200, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: rim,    scale: 0.9,  duration: 200, ease: 'Cubic.easeOut' });
        scene.tweens.add({ targets: shadow, scale: 1.2,  duration: 260, ease: 'Cubic.easeOut' });
        scene.tweens.add({ targets: heart,  scale: 0.12, duration: 200, ease: 'Cubic.easeOut' });

        // Churning - faster than anything else on the stage, two ways.
        scene.tweens.add({ targets: main,  angle: -360, duration: 1500, repeat: -1 });
        scene.tweens.add({ targets: under, angle:  360, duration: 2300, repeat: -1 });

        // The tear itself: a violet crack of light that the void eats.
        this._ring(pit, 0, 0, { from: 4, to: 120, width: 10, color: DARK_PINK,  ms: 360 });
        this._ring(pit, 0, 0, { from: 2, to: 80,  width: 4,  color: DARK_WHITE, ms: 260 });
        this._screenFlash(DARK_VIOLET, 0.3, 260);

        // The rival's card lights violet and starts to bend toward the void.
        hex.cardFx = this.post(rival.root)?.addGlow(DARK_VIOLET, 0, 0, false, 0.1, 18) ?? null;
        if (hex.cardFx){
            scene.tweens.add({ targets: hex.cardFx, outerStrength: 4, duration: 240, ease: 'Quad.easeOut' });
        }

        dark.warpFx = this.post(rival.root)?.addBarrel(1) ?? null;

        scene.cameras.main.shake(120, 0.004, true);

        return { shadow, rim, under, main, heart, mainFx };
    }

    /**
     * The void growing over the card, from a speck to the whole card, in
     * surges - each a lunge outward, each harder than the last. Everything
     * round it is sucked in, and the screen shakes harder the larger it gets.
     */
    _darkBuild(pit, abyss, hex, dark, ms){
        const { scene } = this;
        if (!abyss) return;

        const { shadow, rim, under, main, heart, mainFx } = abyss;

        const SURGES = 5;
        const gap    = Math.floor(ms / (SURGES + 0.6));

        for (let k = 0; k < SURGES; k++){
            const t = (k + 1) / SURGES;     // 0.2 .. 1

            scene.time.delayedCall(k * gap, () => {
                if (!pit.active) return;

                scene.events.emit('singularityfx:beat', { card: hex.card.id, beat: `surge${k + 1}`, you: hex.you });

                // The lunge: overshoot, then settle back a little - aggressive, not smooth.
                const to = 0.1 + 0.5 * t;
                scene.tweens.add({ targets: main,   scale: to,          duration: 190, ease: 'Back.easeOut', easeParams: [3] });
                scene.tweens.add({ targets: under,  scale: to * 1.15,   duration: 240, ease: 'Back.easeOut', easeParams: [2.4] });
                scene.tweens.add({ targets: heart,  scale: 0.2 + 0.9 * t, duration: 200, ease: 'Cubic.easeOut' });
                scene.tweens.add({ targets: shadow, scale: 1.6 + 2.6 * t, duration: 260, ease: 'Cubic.easeOut' });
                scene.tweens.add({ targets: rim,    scale: 1.2 + 2.4 * t, duration: 160, yoyo: true, hold: 60, ease: 'Quad.easeOut' });

                if (mainFx) scene.tweens.add({ targets: mainFx, outerStrength: 2 + 4 * t, duration: 140, yoyo: true, ease: 'Quad.easeOut' });

                // Each surge throws a shock off the void's edge - and bends the card further in.
                const edge = 512 * to * 0.8;
                this._ring(pit, 0, 0, { from: edge, to: edge + 90 + 60 * t, width: 10 + 10 * t, color: DARK_VIOLET, ms: 420 });
                this._ring(pit, 0, 0, { from: edge, to: edge + 40,          width: 4,            color: DARK_PINK,   ms: 300, delay: 40 });

                if (dark.warpFx){
                    scene.tweens.add({ targets: dark.warpFx, amount: 1 - 0.09 * (k + 1), duration: 200, ease: 'Back.easeOut' });
                }

                if (hex.cardFx){
                    scene.tweens.add({ targets: hex.cardFx, outerStrength: 5 + 4 * t, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
                }

                this._darkSuck(pit, 520 * to + 140, 10 + k * 4);

                scene.cameras.main.shake(200, 0.004 + 0.007 * t, true);
                if (k === SURGES - 1) this._screenFlash(DARK_VIOLET, 0.22, 240);
            });
        }

        // Between the surges the screen never settles - a rumble that grows
        // with the void, under the surges' harder kicks.
        let step = 0;
        const steps = Math.floor(ms / 110);
        dark.quake = scene.time.addEvent({
            delay:    110,
            repeat:   steps - 1,
            callback: () => {
                step += 1;
                const cam = scene.cameras.main;
                if (!cam.shakeEffect?.isRunning) cam.shake(120, 0.0015 + 0.004 * (step / steps));
            },
        });
    }

    /** Dark wisps and violet motes dragged in to the void from all round it. */
    _darkSuck(pit, reach, count){
        const { scene } = this;

        for (let i = 0; i < count; i++){
            const a    = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const r    = reach + Phaser.Math.Between(0, 160);
            const wisp = i % 3 === 0;

            const mote = pit.add(scene.add.image(Math.cos(a) * r, Math.sin(a) * r, RADIAL_KEY)
                .setTint(wisp ? DARK_DEEP : Phaser.Utils.Array.GetRandom(DARK_VOID_MOTES))
                .setBlendMode(wisp ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
                .setScale(wisp ? Phaser.Math.FloatBetween(0.18, 0.32) : Phaser.Math.FloatBetween(0.03, 0.08))
                .setAlpha(0)).last;

            // A spiral in, not a straight line - the void turns as it takes.
            const spin = { t: 0 };
            scene.tweens.add({
                targets:  spin,
                t:        1,
                duration: Phaser.Math.Between(360, 620),
                ease:     'Cubic.easeIn',
                onUpdate: () => {
                    const rr = r * (1 - spin.t);
                    const aa = a - spin.t * 1.6;
                    mote.setPosition(Math.cos(aa) * rr, Math.sin(aa) * rr);
                    mote.setAlpha(wisp ? 0.7 * Math.sin(spin.t * Math.PI) : 1 - spin.t * 0.6);
                    mote.setScale(mote.scaleX * 0.995);
                },
                onComplete: () => mote.destroy(),
            });
        }
    }

    /**
     * The void at its largest, closing over the whole card - then collapsing
     * into it. The darkest beat of the card: a black wash, an inward ring, and
     * the hardest shake.
     */
    _darkConsume(pit, abyss, hex, dark){
        const { scene } = this;
        const cam = scene.cameras.main;

        dark.quake?.remove();
        dark.quake = null;

        if (abyss){
            const { shadow, rim, under, main, heart, mainFx } = abyss;

            scene.tweens.killTweensOf([main, under, heart, shadow, rim]);

            // Swallow: the void lunges over the card...
            scene.tweens.chain({
                targets: [main, under],
                tweens: [
                    { scale: DARK_VOID_PEAK, duration: 160, ease: 'Back.easeOut', easeParams: [3] },
                    // ...and collapses into it, spinning.
                    { scale: 0, angle: '-=300', duration: 300, delay: 90, ease: 'Cubic.easeIn' },
                ],
            });
            scene.tweens.add({ targets: heart, scale: 1.8, duration: 160, ease: 'Cubic.easeOut' });
            scene.tweens.add({ targets: heart, scale: 0, delay: 250, duration: 300, ease: 'Cubic.easeIn' });
            scene.tweens.add({ targets: shadow, scale: 6.5, alpha: 0, delay: 120, duration: 640, ease: 'Cubic.easeOut' });
            scene.tweens.add({ targets: rim,    scale: 0,   delay: 160, duration: 340, ease: 'Cubic.easeIn' });

            if (mainFx) scene.tweens.add({ targets: mainFx, outerStrength: 8, duration: 140, ease: 'Quad.easeOut' });
        }

        // Light falling INTO it: rings closing rather than opening.
        this._ring(pit, 0, 0, { from: 560, to: 0, width: 26, color: DARK_VIOLET, ms: 460, delay: 120 });
        this._ring(pit, 0, 0, { from: 420, to: 0, width: 8,  color: DARK_WHITE,  ms: 380, delay: 180 });

        // The black wash - a flash of darkness, not of light.
        const { width, height } = cam;
        const blackout = scene.add.rectangle(0, 0, width, height, 0x000000, 1)
            .setOrigin(0).setDepth(FX_DEPTH + 4).setAlpha(0);
        scene.tweens.chain({
            targets: blackout,
            tweens: [
                { alpha: 0.82, duration: 120, delay: 140, ease: 'Quad.easeIn' },
                { alpha: 0,    duration: 520, ease: 'Sine.easeOut' },
            ],
            onComplete: () => blackout.destroy(),
        });

        // As it closes: the void's last violet breath out, over the card.
        scene.time.delayedCall(430, () => {
            if (!pit.active) return;

            const breath = this._glow(pit, 0, 0, DARK_VIOLET, 0.3);
            scene.tweens.add({
                targets:    breath,
                scale:      3.4,
                alpha:      { from: 0.9, to: 0 },
                duration:   520,
                ease:       'Cubic.easeOut',
                onComplete: () => breath.destroy(),
            });
            this._ring(pit, 0, 0, { from: 40, to: 300, width: 12, color: DARK_PINK, ms: 480 });
        });

        if (hex.cardFx){
            scene.tweens.killTweensOf(hex.cardFx);
            scene.tweens.add({ targets: hex.cardFx, outerStrength: 14, duration: 120, hold: 200, yoyo: true, ease: 'Quad.easeOut' });
        }

        if (dark.warpFx){
            scene.tweens.killTweensOf(dark.warpFx);
            scene.tweens.add({ targets: dark.warpFx, amount: 0.35, duration: 260, yoyo: true, ease: 'Cubic.easeIn' });
        }

        cam.shake(480, 0.018, true);
    }

    /** The card's name, and the affliction it lays, slammed into the middle of the lane. */
    _darkTitle(card, rival, affliction, x){
        const { scene } = this;

        const y = rival.homeY - 150;

        const title = scene.add.text(x, y, `${card.icon}  ${card.name}`, {
            fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold',
            color: '#f3e6ff', stroke: '#0c0016', strokeThickness: 7,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 5).setScale(2.4).setAlpha(0);

        const sub = scene.add.text(x, y + 44, `${affliction?.name ?? card.affliction ?? 'COSMIC DARKNESS'}` +
            `  ·  -${affliction?.esseLoss ?? 10} ESSE PER ATTACK  ·  ${affliction?.attacksTotal ?? 8} ATTACKS`, {
            fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold',
            color: '#e2b8ff', stroke: '#0c0016', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 5).setAlpha(0);

        const pre = this.pre(title);
        if (pre){
            pre.setPadding(16);
            pre.addGlow(DARK_VIOLET, 4, 0, false, 0.1, 16);
            pre.addShine(1.2, 0.4, 4);
        }
        this.pre(sub)?.addGlow(DARK_VIOLET, 2, 0, false, 0.1, 10);

        scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: sub, alpha: 1, y: { from: y + 64, to: y + 44 }, delay: 180, duration: 260, ease: 'Cubic.easeOut' });
        scene.tweens.add({
            targets:    [title, sub],
            alpha:      0,
            y:          '-=40',
            delay:      1500,
            duration:   420,
            ease:       'Cubic.easeIn',
            onComplete: () => { title.destroy(); sub.destroy(); },
        });
    }

    // ------------------------------------------------- the standing affliction --

    /** An affliction's bookkeeping, registered on its slot before anything is drawn. */
    _hexRecord(slot, card, you, cardId, affliction = null){
        const hex = {
            slot,
            card,
            you,
            cardId,
            back:        null,      // the void behind the card's face...
            front:       null,      // ...and the wisps and badge over it - see _hexStand()
            parts:       null,
            cardFx:      null,      // the violet glow on the card itself
            timers:      [],
            forming:     false,
            lifting:     false,
            pendingLift: null,
            attacksLeft: affliction?.attacksLeft ?? null,
            name:        affliction?.name ?? null,
        };

        this.hexes.set(slot, hex);
        return hex;
    }

    /**
     * COSMIC DARKNESS, standing on its card. Built inside the card's own
     * container so it moves with it - lunge, recoil and shake - in two layers:
     *
     *   back   behind the card's face: a black pool, a violet haze and the void
     *          churning slowly. The card's smoked glass lets the dark show
     *          through - the card reads as sunk in it - and only the void's rim
     *          shows past the corners.
     *   front  over it: dark wisps rising off the card's edges, and a badge
     *          above the card counting the attacks left.
     *
     * The card itself keeps a slow, dark violet glow - the mark that it is
     * afflicted - until the affliction lifts.
     */
    _hexStand(hex, fromCast = false){
        const { scene } = this;
        const { slot } = hex;

        const back  = scene.add.container(0, 0);
        const front = scene.add.container(0, 0);
        slot.root.addAt(back, 0);
        slot.root.add(front);

        hex.back  = back;
        hex.front = front;

        const pool = back.add(scene.add.image(0, 0, RADIAL_KEY).setTint(0x000000).setScale(2.3).setAlpha(0.6)).last;
        const haze = this._glow(back, 0, 0, DARK_VIOLET, 2.0).setAlpha(0.22);

        // Tinted down, so the void's pale rims burn a deep violet rather than white.
        const under = back.add(scene.add.image(0, 0, 'darkVoid1')
            .setScale(DARK_AURA_SCALE * 1.04).setFlipX(true).setAlpha(0.45).setTint(0x5a3c8c)).last;
        const churn = back.add(scene.add.sprite(0, 0, 'darkVoid2')
            .setScale(DARK_AURA_SCALE).setAlpha(0.9).setTint(0x8a62c8)).last;
        churn.play({ key: DARK_VOID_FLICKER, frameRate: 6 });

        const churnFx = this._fxGlowOn(churn, DARK_DEEP, 1);

        scene.tweens.add({ targets: churn, angle: -360, duration: 14000, repeat: -1 });
        scene.tweens.add({ targets: under, angle:  360, duration: 20000, repeat: -1 });

        // The badge: what the card carries, and how many attacks it has left.
        const badge = front.add(scene.add.container(0, -CARD_HALF_H - 24)).last;
        const label = scene.add.text(0, 0, '', {
            fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#efd6ff',
        }).setOrigin(0.5);
        const plate = scene.add.graphics();
        badge.add([plate, label]);
        this.pre(label)?.addGlow(DARK_VIOLET, 2, 0, false, 0.1, 8);

        hex.parts = { pool, haze, under, churn, churnFx, badge, label, plate };
        this._hexCount(hex, hex.attacksLeft);

        // The beat everything keeps time with - slower and heavier than the field's.
        const beat = { duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' };

        scene.tweens.add({ targets: back, scale: { from: 0.97, to: 1.05 }, ...beat });
        scene.tweens.add({ targets: haze, alpha: { from: 0.14, to: 0.34 }, ...beat });
        scene.tweens.add({ targets: pool, alpha: { from: 0.45, to: 0.7 },  ...beat });
        scene.tweens.add({ targets: badge, alpha: { from: 0.75, to: 1 },   ...beat });
        if (churnFx) scene.tweens.add({ targets: churnFx, outerStrength: { from: 0.5, to: 2 }, ...beat });

        this._hexCardGlow(hex, true);

        // Dark wisps rising off the card's edges, with a violet spark among them.
        hex.timers.push(scene.time.addEvent({
            delay:    240,
            loop:     true,
            callback: () => {
                if (!front.active) return;

                const side = Phaser.Math.Between(0, 1) ? 1 : -1;
                const x    = side * Phaser.Math.Between(CARD_HALF_W - 30, CARD_HALF_W + 20);
                const y    = Phaser.Math.Between(-CARD_HALF_H + 20, CARD_HALF_H - 10);
                const wisp = Phaser.Math.Between(0, 3) > 0;

                const mote = front.add(scene.add.image(x, y, RADIAL_KEY)
                    .setTint(wisp ? DARK_DEEP : DARK_PINK)
                    .setBlendMode(wisp ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
                    .setScale(wisp ? Phaser.Math.FloatBetween(0.14, 0.26) : Phaser.Math.FloatBetween(0.025, 0.05))
                    .setAlpha(0)).last;

                scene.tweens.add({
                    targets:    mote,
                    x:          x + side * Phaser.Math.Between(4, 30),
                    y:          y - Phaser.Math.Between(50, 110),
                    alpha:      { from: wisp ? 0.6 : 1, to: 0 },
                    scale:      mote.scale * (wisp ? 1.5 : 0.5),
                    duration:   Phaser.Math.Between(900, 1400),
                    ease:       'Sine.easeOut',
                    onComplete: () => mote.destroy(),
                });
            },
        }));

        if (fromCast){
            // Settling out of the collapse - wider and darker than it will stand.
            churn.setScale(DARK_AURA_SCALE * 1.6);
            scene.tweens.add({ targets: churn, scale: DARK_AURA_SCALE, duration: 640, ease: 'Back.easeOut' });
            badge.setScale(1.6);
            scene.tweens.add({ targets: badge, scale: 1, duration: 360, delay: 200, ease: 'Back.easeOut' });
        }

        back.setAlpha(0);
        front.setAlpha(0);
        scene.tweens.add({ targets: [back, front], alpha: 1, duration: fromCast ? 200 : 360 });
    }

    /** Write the attacks left onto the badge, and redraw its plate to fit. */
    _hexCount(hex, attacksLeft){
        if (Number.isFinite(attacksLeft)) hex.attacksLeft = attacksLeft;

        const parts = hex.parts;
        if (!parts) return;

        const name = hex.name ?? 'COSMIC DARKNESS';
        const left = Number.isFinite(hex.attacksLeft) ? `  ·  ${hex.attacksLeft}` : '';
        const text = `${name}${left}`;

        // Every render lands here - only a changed count redraws.
        if (parts.label.text === text) return;
        parts.label.setText(text);

        const w = parts.label.width + 24;
        parts.plate.clear();
        parts.plate.fillStyle(0x12001e, 0.92);
        parts.plate.fillRoundedRect(-w / 2, -11, w, 22, 11);
        parts.plate.lineStyle(1.5, DARK_VIOLET, 0.85);
        parts.plate.strokeRoundedRect(-w / 2, -11, w, 22, 11);
    }

    /** The slow, dark violet glow on the afflicted card itself. WebGL only. */
    _hexCardGlow(hex, on){
        const { scene } = this;
        const root = hex.slot.root;

        if (!on){
            if (!hex.cardFx) return;

            scene.tweens.killTweensOf(hex.cardFx);
            root?.postFX?.remove(hex.cardFx);
            hex.cardFx = null;
            return;
        }

        // Carried over from the cast, it only needs its colour and its beat -
        // the cast's bright violet sinks to a smoulder.
        hex.cardFx ??= this.post(root)?.addGlow(DARK_SMOLDER, 0, 0, false, 0.1, 18) ?? null;
        if (!hex.cardFx) return;

        hex.cardFx.color = DARK_SMOLDER;

        scene.tweens.killTweensOf(hex.cardFx);
        scene.tweens.add({
            targets:       hex.cardFx,
            outerStrength: { from: 1, to: 3 },
            duration:      1100,
            yoyo:          true,
            repeat:        -1,
            ease:          'Sine.easeInOut',
        });
    }

    /** One bleed: the void heaves, darkness is torn off the card, and the ESSE it cost rises. */
    _hexPulse(hex, ev){
        const { scene } = this;
        const { slot, parts } = hex;

        scene.tweens.add({ targets: parts.churn, scale: DARK_AURA_SCALE * 1.3, duration: 140, yoyo: true, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: parts.pool,  scale: 3.2, duration: 160, yoyo: true, ease: 'Quad.easeOut' });

        if (hex.cardFx){
            const fx = hex.cardFx;
            scene.tweens.add({ targets: fx, outerStrength: 10, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
        }

        // Dark shards ripped off the card's face, drawn down into the void behind it.
        for (let i = 0; i < 14; i++){
            const x = Phaser.Math.Between(-CARD_HALF_W + 20, CARD_HALF_W - 20);
            const y = Phaser.Math.Between(-CARD_HALF_H + 30, CARD_HALF_H - 30);

            const shard = hex.front.add(scene.add.image(x, y, RADIAL_KEY)
                .setTint(i % 3 ? DARK_DEEP : DARK_VIOLET)
                .setBlendMode(i % 3 ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
                .setScale(Phaser.Math.FloatBetween(0.06, 0.14))).last;

            scene.tweens.add({
                targets:    shard,
                x:          0,
                y:          0,
                scale:      0.01,
                alpha:      { from: 0.9, to: 0 },
                duration:   Phaser.Math.Between(360, 560),
                ease:       'Cubic.easeIn',
                onComplete: () => shard.destroy(),
            });
        }

        this._ring(hex.front, 0, 0, { from: 260, to: 40, width: 10, color: DARK_VIOLET, ms: 420 });

        const loss = ev?.esseLoss ?? 10;
        const tag  = scene.add.text(slot.homeX, slot.homeY - 40, `-${loss} ESSE`, {
            fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold',
            color: '#f0d0ff', stroke: '#14001f', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(1.5).setAlpha(0);

        const sub = scene.add.text(slot.homeX, slot.homeY - 12, hex.name ?? 'COSMIC DARKNESS', {
            fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold',
            color: '#c99aff', stroke: '#14001f', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setAlpha(0);

        this.pre(tag)?.addGlow(DARK_VIOLET, 3, 0, false, 0.1, 12);

        scene.tweens.add({ targets: tag, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: sub, alpha: 1, duration: 200, delay: 80 });
        scene.tweens.add({
            targets:    [tag, sub],
            y:          '-=46',
            alpha:      0,
            delay:      700,
            duration:   420,
            ease:       'Cubic.easeIn',
            onComplete: () => { tag.destroy(); sub.destroy(); },
        });

        scene.cameras.main.shake(140, 0.004, true);
    }

    /**
     * The affliction coming off its card. Run out, the void closes and the
     * light it held breaks back out of the card - a starburst, the first light
     * the card has seen since it was cast. A card that bled out just goes dark.
     */
    _hexLift(hex, ev){
        const { scene } = this;
        const { slot } = hex;

        if (!hex.parts || !scene.sys.isActive()){
            this._hexRemove(slot, hex);
            return;
        }

        scene.events.emit('singularityfx:beat', { card: hex.card.id, beat: 'lifted', you: hex.you });

        const { churn, under, pool, haze, badge } = hex.parts;
        scene.tweens.killTweensOf([churn, under, pool, haze, badge]);

        scene.tweens.add({ targets: [churn, under], scale: 0, angle: '-=180', duration: 420, ease: 'Cubic.easeIn' });
        scene.tweens.add({ targets: [pool, haze], alpha: 0, duration: 420 });
        scene.tweens.add({ targets: badge, alpha: 0, y: badge.y - 20, duration: 320 });

        if (ev?.expired !== false){
            scene.time.delayedCall(380, () => {
                if (!scene.sys.isActive()) return;

                const burst = scene.add.image(slot.homeX, slot.homeY, 'darkLight4')
                    .setBlendMode(Phaser.BlendModes.ADD).setDepth(FX_DEPTH).setScale(0.1);
                scene.tweens.add({
                    targets:    burst,
                    scale:      0.55,
                    angle:      60,
                    alpha:      { from: 1, to: 0 },
                    duration:   560,
                    ease:       'Cubic.easeOut',
                    onComplete: () => burst.destroy(),
                });

                this._ring(null, slot.homeX, slot.homeY, { from: 20, to: 260, width: 10, color: DARK_STAR, ms: 520 });

                const tag = scene.add.text(slot.homeX, slot.homeY - CARD_HALF_H - 24, `${hex.name ?? 'COSMIC DARKNESS'} LIFTED`, {
                    fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold',
                    color: '#dff2ff', stroke: '#06101a', strokeThickness: 5,
                }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setAlpha(0);

                scene.tweens.add({ targets: tag, alpha: 1, duration: 200 });
                scene.tweens.add({
                    targets:    tag,
                    y:          tag.y - 30,
                    alpha:      0,
                    delay:      900,
                    duration:   380,
                    onComplete: () => tag.destroy(),
                });
            });
        }

        scene.time.delayedCall(460, () => this._hexRemove(slot, hex));
    }

    /** Take a slot's affliction down at once. Safe to call twice. */
    _hexRemove(slot, hex = this.hexes.get(slot)){
        if (!hex) return;
        if (this.hexes.get(slot) === hex) this.hexes.delete(slot);

        const { scene } = this;

        hex.timers.forEach(t => t.remove());
        hex.timers = [];

        const kill = (obj) => {
            scene.tweens.killTweensOf(obj);
            obj.list?.forEach(kill);
        };

        [hex.back, hex.front].forEach(layer => {
            if (!layer?.active) return;
            kill(layer);
            layer.destroy();
        });

        if (hex.parts?.churnFx) scene.tweens.killTweensOf(hex.parts.churnFx);

        hex.back  = null;
        hex.front = null;
        hex.parts = null;

        this._hexCardGlow(hex, false);
    }

    // ------------------------------------------- pattern interruption parts --

    /** A colour off the spectrum - h runs 0..1 and wraps. From a table, not built per call. */
    _patternHue(h){
        if (!this._patternHues){
            this._patternHues = Array.from({ length: 96 },
                (_, i) => Phaser.Display.Color.HSVToRGB(i / 96, 0.82, 1).color);
        }

        const t = this._patternHues;
        return t[((Math.floor(h * t.length) % t.length) + t.length) % t.length];
    }

    /** Every frame: the card's glow, the core and the art all turn through the spectrum. */
    _patternHueTick(pi){
        const color = this._patternHue(pi.hue);

        if (pi.cardFx) pi.cardFx.color = color;
        if (pi.core?.active) pi.core.setTint(color);

        // The art's own colours rotated round the wheel - the splash never
        // holds one palette for long.
        pi.art?.matrices.forEach(([matrix, offset]) => matrix.hue(((pi.hue + offset) % 1) * 360));
    }

    /**
     * The art behind the card: the four splashes flipping as one great slow
     * vortex filling the stage, and two of them turning faster and smaller
     * inside it, against each other. Each one has its hue turned by the clock.
     */
    _patternArt(root){
        const { scene } = this;

        const vortex = root.add(scene.add.sprite(0, 0, PATTERN_SOFT_KEYS[0])
            .setBlendMode(Phaser.BlendModes.ADD).setScale(1.2).setAlpha(0)).last;
        if (scene.anims.exists(PATTERN_FLICKER)) vortex.play(PATTERN_FLICKER);

        const outer = root.add(scene.add.image(0, 0, PATTERN_SOFT_KEYS[1])
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.8).setAlpha(0)).last;
        const inner = root.add(scene.add.image(0, 0, PATTERN_SOFT_KEYS[3])
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.45).setAlpha(0)).last;

        scene.tweens.add({ targets: vortex, angle:  360, duration: 9000, repeat: -1 });
        scene.tweens.add({ targets: outer,  angle: -360, duration: 4200, repeat: -1 });
        scene.tweens.add({ targets: inner,  angle:  360, duration: 2400, repeat: -1 });

        // Each a third of the wheel apart, so the three never match.
        const matrices = [[vortex, 0], [outer, 1 / 3], [inner, 2 / 3]]
            .map(([img, offset]) => [this.pre(img)?.addColorMatrix(), offset])
            .filter(([matrix]) => matrix);

        return { vortex, outer, inner, matrices };
    }

    /** The art opens out of the dark behind the card. */
    _patternArtIn(art){
        const { scene } = this;

        scene.tweens.add({ targets: art.vortex, alpha: 0.38, scale: 1.7, duration: 900, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: art.outer,  alpha: 0.5,  scale: 1.0, duration: 760, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: art.inner,  alpha: 0.7,  scale: 0.55, duration: 640, ease: 'Sine.easeOut' });
    }

    /** The art drawn in after the spirals - spun hard and crushed into the card. */
    _patternArtCollapse(art, ms){
        const { scene } = this;
        const ease = 'Cubic.easeIn';

        [[art.vortex, 0.18, 540], [art.outer, 0.14, -720], [art.inner, 0.1, 900]].forEach(([img, scale, turn]) => {
            scene.tweens.killTweensOf(img);
            scene.tweens.add({ targets: img, scale, angle: img.angle + turn, alpha: 0.95, duration: ms, ease });
        });
    }

    /**
     * The spirals - the heart of the effect. Long ribbons of colour, each led
     * by a bright head shedding sparks, loop the card and sweep the stage,
     * with a storm of motes spiralling among them. All of them turn about one
     * centre: out in the stage at first, so they fill the screen, and drawn
     * onto the card as they converge.
     *
     *   swirl     `untilConverge` ms - they sweep in from off stage, then loop
     *             in breathing orbits
     *   converge  the rest of `ms` - the orbits tighten and quicken into a
     *             true spiral, and every ribbon and mote ends in the card
     *
     * One counter drives it all; the ribbons are redrawn into one Graphics.
     */
    _patternSpirals(pi, ms, untilConverge){
        const { scene } = this;
        const { caster } = pi;
        const { width, height } = scene.cameras.main;
        const R = Phaser.Math.FloatBetween;
        const TAU = Math.PI * 2;

        const trails = scene.add.graphics().setDepth(FX_DEPTH + 1).setBlendMode(Phaser.BlendModes.ADD);
        pi.objects.push(trails);

        // The centre the wide ribbons turn about - out in the middle of the
        // stage while they swirl, so they fill all of it, and onto the card as
        // they converge. The tight ones always loop the card itself.
        const off = {
            x: (width / 2 - caster.homeX) * 0.8,
            y: (height / 2 - caster.homeY) * 0.5,
        };

        // Twelve wide ribbons sweeping the stage one way, six tight ones
        // looping the card the other - each a slice of the spectrum.
        const arms = [];
        const OUTER = 12;
        const INNER = 6;

        for (let i = 0; i < OUTER + INNER; i++){
            const outer = i < OUTER;
            const hue   = (i * 0.618) % 1;           // golden steps - neighbours never share a colour
            const color = this._patternHue(hue);

            const head = scene.add.image(caster.homeX, caster.homeY, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(outer ? 0.3 : 0.22)
                .setDepth(FX_DEPTH + 2).setAlpha(0);
            const spark = scene.add.image(caster.homeX, caster.homeY, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(PATTERN_WHITE).setScale(outer ? 0.08 : 0.06)
                .setDepth(FX_DEPTH + 2).setAlpha(0);

            const shed = scene.add.particles(0, 0, RADIAL_KEY, {
                follow:    head,
                blendMode: 'ADD',
                speed:     { min: 10, max: 80 },
                scale:     { start: outer ? 0.08 : 0.06, end: 0 },
                alpha:     { start: 0.9, end: 0 },
                lifespan:  { min: 380, max: 780 },
                tint:      [color, this._patternHue(hue + 0.12), PATTERN_WHITE],
                frequency: 26,
            }).setDepth(FX_DEPTH + 1);

            pi.objects.push(head, spark, shed);

            arms.push({
                head, spark, shed, hue, outer,
                dir:    outer ? 1 : -1,
                phase:  (i / (outer ? OUTER : INNER)) * TAU + R(-0.2, 0.2),
                reach:  outer ? R(620, 1250) : R(250, 420),
                speed:  outer ? R(1.5, 1.9) : R(2.4, 2.9),
                breath: R(1.1, 1.8),
                squash: outer ? R(0.48, 0.58) : R(0.7, 0.85),  // orbits are ellipses - the stage is wide
                width:  outer ? 15 : 10,
                trail:  [],
            });
        }

        // The storm of motes spiralling with them.
        const motes = [];
        for (let i = 0; i < 160; i++){
            const img = scene.add.image(caster.homeX, caster.homeY, RADIAL_KEY)
                .setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Utils.Array.GetRandom(PATTERN_RAINBOW))
                .setScale(R(0.025, 0.07)).setDepth(FX_DEPTH + 1).setAlpha(0);
            pi.objects.push(img);

            motes.push({
                img,
                dir:   Math.random() < 0.65 ? 1 : -1,
                phase: R(0, TAU),
                reach: R(120, 1100),
                wide:  Math.random() < 0.6,     // turns about the stage's centre, or the card's
                speed: R(1.2, 3.2),
                lag:   R(0, 0.35),          // how late it starts in - they arrive one after another
                squash: R(0.5, 0.9),
            });
        }

        const total   = ms / 1000;
        const swirlAt = untilConverge / 1000;
        const span    = total - swirlAt;

        const counter = scene.tweens.addCounter({
            from:     0,
            to:       ms,
            duration: ms,
            onUpdate: (tw) => {
                const t = tw.getValue() / 1000;

                // How far through the converge, 0 until it starts.
                const k  = Phaser.Math.Clamp((t - swirlAt) / span, 0, 1);
                // They sweep in from 1.6x their reach over the first 0.8s.
                const inK  = Phaser.Math.Easing.Cubic.Out(Math.min(1, t / 0.8));
                const fade = Math.min(1, t / 0.3);

                const pull = 1 - Phaser.Math.Easing.Cubic.In(k);
                const wx   = caster.homeX + off.x * pull;
                const wy   = caster.homeY + off.y * pull;

                trails.clear();

                arms.forEach(arm => {
                    const cx = arm.outer ? wx : caster.homeX;
                    const cy = arm.outer ? wy : caster.homeY;

                    // Breathing orbits while they swirl; a tightening, quickening spiral after.
                    const swirl = arm.reach * (1.6 - 0.6 * inK) * (0.8 + 0.2 * Math.sin(t * arm.breath + arm.phase));
                    const r     = swirl * Math.pow(1 - k, 1.7);
                    const a     = arm.phase + arm.dir * (arm.speed * t + 7.5 * k * k);

                    const x = cx + Math.cos(a) * r;
                    const y = cy + Math.sin(a) * r * Phaser.Math.Linear(arm.squash, 1, k);

                    // Home in the card: dimmed out on arrival.
                    const vis = fade * Math.min(1, r / 40 + (1 - k));

                    arm.head.setPosition(x, y).setAlpha(vis);
                    arm.spark.setPosition(x, y).setAlpha(vis);

                    arm.trail.push(x, y);
                    if (arm.trail.length > 64) arm.trail.splice(0, 2);

                    this._patternRibbon(trails, arm, t, vis);
                });

                motes.forEach(m => {
                    const mk = Phaser.Math.Clamp((k - m.lag) / (1 - m.lag), 0, 1);
                    const r  = m.reach * (1.5 - 0.5 * inK) * Math.pow(1 - mk, 1.5);
                    const a  = m.phase + m.dir * (m.speed * t + 6 * mk * mk);

                    const cx = m.wide ? wx : caster.homeX;
                    const cy = m.wide ? wy : caster.homeY;

                    m.img.setPosition(cx + Math.cos(a) * r, cy + Math.sin(a) * r * Phaser.Math.Linear(m.squash, 1, mk));
                    m.img.setAlpha(fade * Math.min(1, r / 60));
                });
            },
            onComplete: () => {
                trails.clear();
                arms.forEach(arm => {
                    arm.head.setVisible(false);
                    arm.spark.setVisible(false);
                    arm.shed.stop();
                });
                motes.forEach(m => m.img.setVisible(false));
            },
        });

        return { trails, arms, motes, counter };
    }

    /**
     * One ribbon, drawn from its tail to its head: widening and brightening
     * toward the head, its colour running a slice of the spectrum along its
     * length and drifting with time, and a white-hot core down its leading half.
     */
    _patternRibbon(g, arm, t, vis){
        const pts = arm.trail;
        const n   = pts.length / 2;
        if (n < 2) return;

        for (let j = 1; j < n; j++){
            const f     = j / (n - 1);
            const color = this._patternHue(arm.hue + (1 - f) * 0.22 + t * 0.15);

            g.lineStyle(1.5 + f * arm.width, color, f * 0.55 * vis);
            g.lineBetween(pts[j * 2 - 2], pts[j * 2 - 1], pts[j * 2], pts[j * 2 + 1]);
        }

        for (let j = Math.floor(n * 0.5); j < n; j++){
            const f = j / (n - 1);

            g.lineStyle(1 + f * arm.width * 0.25, PATTERN_WHITE, (f - 0.4) * 0.9 * vis);
            g.lineBetween(pts[j * 2 - 2], pts[j * 2 - 1], pts[j * 2], pts[j * 2 + 1]);
        }
    }

    /**
     * The burst - everything that flowed into the card blown back out of it
     * at once, in every colour: a white-hot flash with the spectrum rolling
     * out behind it, the art itself flung open, rings and rays, a particle
     * explosion, and smaller bursts popping off all over the stage after it.
     */
    _patternBurst(pi){
        const { scene } = this;
        const { caster } = pi;
        const x = caster.homeX;
        const y = caster.homeY;
        const { width, height } = scene.cameras.main;
        const R = Phaser.Math.FloatBetween;

        const track = (obj) => { pi.objects.push(obj); return obj; };

        scene.tweens.add({ targets: caster.flash, alpha: { from: 0.95, to: 0 }, duration: 600, ease: 'Cubic.easeOut' });

        // The art crushed into the card goes with it.
        if (pi.art){
            const { vortex, outer, inner } = pi.art;
            scene.tweens.killTweensOf([vortex, outer, inner]);
            [vortex, outer, inner].forEach(img => scene.tweens.add({ targets: img, alpha: 0, scale: img.scale * 3, duration: 260 }));
        }

        // White-hot, then the spectrum rolling out behind it.
        // Kept small and short - stacked additive light goes white fast, and
        // this is meant to read as colour.
        const flash = track(this._glow(null, x, y, PATTERN_WHITE, 0.3).setDepth(FX_DEPTH + 2));
        scene.tweens.add({ targets: flash, scale: 3.2, alpha: { from: 0.9, to: 0 }, duration: 300, ease: 'Cubic.easeOut' });

        PATTERN_RAINBOW.forEach((tint, i) => {
            const glow = track(this._glow(null, x, y, tint, 0.6).setDepth(FX_DEPTH + 1).setAlpha(0));
            scene.tweens.add({
                targets:  glow,
                scale:    3.5 + i * 0.9,
                alpha:    { from: 0.22, to: 0 },
                delay:    i * 70,
                duration: 760 + i * 50,
                ease:     'Cubic.easeOut',
            });
        });

        // The art itself flung open - all four splashes, each turned to its
        // own hue, spinning out past the card.
        PATTERN_SOFT_KEYS.forEach((key, i) => {
            const img = track(scene.add.image(x, y, key)
                .setBlendMode(Phaser.BlendModes.ADD).setDepth(FX_DEPTH + 1).setScale(0.15).setAngle(i * 90));

            this.pre(img)?.addColorMatrix().hue(((pi.hue + i * 0.25) % 1) * 360);

            scene.tweens.add({
                targets:  img,
                scale:    [2.6, 2.0, 1.6, 1.2][i],
                angle:    img.angle + (i % 2 ? -1 : 1) * R(80, 160),
                alpha:    { from: 0.5, to: 0 },
                duration: 1000 + i * 120,
                ease:     'Expo.easeOut',
            });
        });

        // Rings in every colour, one after another.
        PATTERN_RAINBOW.forEach((color, i) => {
            this._ring(null, x, y, { from: 30, to: 520 + i * 120, width: 30 - i * 2, color, ms: 820 + i * 70, delay: i * 40 });
        });
        this._ring(null, x, y, { from: 20, to: 380, width: 16, color: PATTERN_WHITE, ms: 520 });

        // Rays all round, dealt out of the spectrum.
        for (let i = 0; i < 64; i++){
            const a   = (i / 64) * Math.PI * 2 + R(-0.03, 0.03);
            const len = Phaser.Math.Between(300, 900);

            // Grown by scaleX: a Shape's width can be written but is not redrawn.
            const ray = track(scene.add.rectangle(x, y, len, i % 4 ? 4 : 8, PATTERN_RAINBOW[i % PATTERN_RAINBOW.length], 1)
                .setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(FX_DEPTH + 1).setRotation(a).setScale(0, 1));

            scene.tweens.add({
                targets:  ray,
                scaleX:   1,
                alpha:    { from: 1, to: 0 },
                duration: Phaser.Math.Between(480, 760),
                ease:     'Cubic.easeOut',
            });
        }

        const particles = (px, py, config) => track(scene.add.particles(px, py, RADIAL_KEY, { blendMode: 'ADD', ...config })
            .setDepth(FX_DEPTH + 2));

        // The particle explosion - a hard burst out over the whole stage, a
        // slower cloud of glitter floating off, and colour rising off the card.
        particles(x, y, {
            emitting: false,
            speed:    { min: 420, max: 1500 },
            angle:    { min: 0, max: 360 },
            gravityY: 120,
            scale:    { start: 0.13, end: 0 },
            alpha:    { start: 1, end: 0 },
            lifespan: { min: 900, max: 1900 },
            tint:     PATTERN_RAINBOW,
        }).explode(360);

        particles(x, y, {
            emitting: false,
            speed:    { min: 60, max: 380 },
            angle:    { min: 0, max: 360 },
            gravityY: -30,
            scale:    { start: 0.07, end: 0 },
            alpha:    { start: 1, end: 0 },
            lifespan: { min: 1500, max: 2600 },
            tint:     [...PATTERN_RAINBOW, PATTERN_WHITE],
        }).explode(200);

        particles(x, y, {
            emitZone:  { type: 'random', source: new Phaser.Geom.Rectangle(-CARD_HALF_W, -CARD_HALF_H, CARD_HALF_W * 2, CARD_HALF_H * 2) },
            speedY:    { min: -320, max: -120 },
            speedX:    { min: -50, max: 50 },
            scale:     { start: 0.08, end: 0 },
            alpha:     { start: 1, end: 0 },
            lifespan:  { min: 700, max: 1200 },
            tint:      PATTERN_RAINBOW,
            frequency: 10,
            quantity:  4,
            duration:  900,
        });

        // Bursts popping off all over the stage after it - the colour reaching
        // every corner.
        for (let i = 0; i < 14; i++){
            const px = Phaser.Math.Between(width * 0.06, width * 0.94);
            const py = Phaser.Math.Between(height * 0.08, height * 0.85);
            const c  = Phaser.Math.Between(0, PATTERN_RAINBOW.length - 1);

            scene.time.delayedCall(Phaser.Math.Between(140, 760), () => {
                if (!scene.sys.isActive()) return;

                const pop = track(this._glow(null, px, py, PATTERN_RAINBOW[c], 0.05).setDepth(FX_DEPTH + 1));
                scene.tweens.add({ targets: pop, scale: 1.3, alpha: { from: 0.9, to: 0 }, duration: 520, ease: 'Cubic.easeOut' });

                this._ring(null, px, py, { from: 6, to: Phaser.Math.Between(80, 150), width: 6, color: PATTERN_RAINBOW[(c + 2) % PATTERN_RAINBOW.length], ms: 520 });

                particles(px, py, {
                    emitting: false,
                    speed:    { min: 80, max: 420 },
                    angle:    { min: 0, max: 360 },
                    gravityY: 160,
                    scale:    { start: 0.09, end: 0 },
                    alpha:    { start: 1, end: 0 },
                    lifespan: { min: 600, max: 1100 },
                    tint:     [PATTERN_RAINBOW[c], PATTERN_RAINBOW[(c + 1) % PATTERN_RAINBOW.length], PATTERN_WHITE],
                }).explode(40);
            });
        }

        // The card itself flares at the heart of it.
        if (pi.cardFx){
            scene.tweens.killTweensOf(pi.cardFx);
            scene.tweens.add({
                targets:       pi.cardFx,
                outerStrength: 24,
                duration:      90,
                hold:          220,
                yoyo:          true,
                ease:          'Quad.easeOut',
            });
        }

        // A short bloom over the whole stage for the contrast.
        const bloomFx = this.post(scene.cameras.main)?.addBloom(PATTERN_WHITE, 1, 1, 1, 1.1, 4) ?? null;
        if (bloomFx){
            scene.tweens.add({
                targets:    bloomFx,
                strength:   0,
                duration:   820,
                ease:       'Cubic.easeOut',
                onComplete: () => scene.cameras.main.postFX?.remove(bloomFx),
            });
        }

        // Forced - the converge's tremor may still be running.
        scene.cameras.main.shake(340, 0.013, true);
        this._screenFlash(PATTERN_WHITE, 0.35, 180);
        this._screenFlash(this._patternHue(pi.hue), 0.16, 700);
    }

    /**
     * The card's name in every colour beside the caster, and what was broken
     * under it - the afflictions named, as the event reports them.
     */
    _patternTitle(card, caster, ev){
        const { scene } = this;

        const x = caster.homeX + caster.facing * 330;
        const y = caster.homeY - 110;

        const title = scene.add.text(x, y, `${card.icon}  ${card.name}`, {
            fontFamily: 'monospace', fontSize: '40px', fontStyle: 'bold',
            color: '#ffffff', stroke: '#12001c', strokeThickness: 7,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setScale(2.4).setAlpha(0);

        // A rainbow across the letters.
        const fill = title.context.createLinearGradient(0, 0, title.width, 0);
        PATTERN_RAINBOW.forEach((c, i) => fill.addColorStop(i / (PATTERN_RAINBOW.length - 1), '#' + c.toString(16).padStart(6, '0')));
        title.setFill(fill);

        const names = [...new Set((ev?.cleansed ?? []).map(c => c.name).filter(Boolean))];
        const sub = scene.add.text(x, y + 46, names.length ? `${names.join(' + ')} BROKEN` : 'AFFLICTIONS CLEANSED', {
            fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
            color: '#fff8e0', stroke: '#12001c', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(FX_DEPTH + 3).setAlpha(0);

        const pre = this.pre(title);
        if (pre){
            pre.setPadding(16);
            pre.addGlow(PATTERN_WHITE, 3, 0, false, 0.1, 16);
            pre.addShine(1.2, 0.4, 4);
        }

        const subFx = this.pre(sub);
        if (subFx){
            subFx.setPadding(12);
            subFx.addGlow(PATTERN_GOLD, 3, 0, false, 0.1, 12);
        }

        scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: sub, alpha: 1, y: y + 54, duration: 260, delay: 180, ease: 'Sine.easeOut' });
        scene.tweens.add({
            targets:    [title, sub],
            alpha:      0,
            y:          '-=40',
            delay:      1100,
            duration:   420,
            ease:       'Cubic.easeIn',
            onComplete: () => { title.destroy(); sub.destroy(); },
        });
    }

    /** An affliction broken by a Cleanse card - its dark thrown off the card in shards. */
    _patternShatterHex(slot){
        const { scene } = this;
        const x = slot.homeX;
        const y = slot.homeY;

        const implode = this._glow(null, x, y, DARK_VIOLET, 1.4).setDepth(FX_DEPTH + 1).setAlpha(0.8);
        scene.tweens.add({
            targets:    implode,
            scale:      0.1,
            alpha:      0,
            duration:   260,
            ease:       'Cubic.easeIn',
            onComplete: () => implode.destroy(),
        });

        for (let i = 0; i < 22; i++){
            const a   = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const len = Phaser.Math.Between(220, 520);
            const sx  = x + Math.cos(a) * CARD_HALF_W * 0.6;
            const sy  = y + Math.sin(a) * CARD_HALF_H * 0.6;

            const shard = scene.add.triangle(sx, sy, 0, 0, Phaser.Math.Between(14, 30), 4, 0, 8,
                Phaser.Utils.Array.GetRandom([DARK_VIOLET, DARK_PINK, DARK_INDIGO]), 1)
                .setDepth(FX_DEPTH + 1).setRotation(a).setBlendMode(Phaser.BlendModes.ADD);

            scene.tweens.add({
                targets:    shard,
                x:          sx + Math.cos(a) * len,
                y:          sy + Math.sin(a) * len,
                angle:      shard.angle + Phaser.Math.Between(-200, 200),
                alpha:      0,
                scale:      0.3,
                duration:   Phaser.Math.Between(500, 850),
                ease:       'Cubic.easeOut',
                onComplete: () => shard.destroy(),
            });
        }
    }

    /**
     * The splashes run right off their frames - left as they are, their hard
     * edges show the square. Each is redrawn into a canvas with a radial fade,
     * so it dissolves into the dark instead.
     */
    _featherPatterns(){
        const { textures } = this.scene;

        PATTERN_SOFT_KEYS.forEach((key, i) => {
            const raw = `patternArt${i + 1}`;
            if (textures.exists(key) || !textures.exists(raw)) return;

            const src = textures.get(raw).getSourceImage();
            const w   = src.width;
            const h   = src.height;

            const tex = textures.createCanvas(key, w, h);
            const ctx = tex.getContext();
            ctx.drawImage(src, 0, 0);

            const fade = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
            fade.addColorStop(0,    'rgba(0,0,0,1)');
            fade.addColorStop(0.4,  'rgba(0,0,0,1)');
            fade.addColorStop(0.75, 'rgba(0,0,0,0.45)');
            fade.addColorStop(1,    'rgba(0,0,0,0)');

            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = fade;
            ctx.fillRect(0, 0, w, h);
            tex.refresh();
        });
    }

    // ---------------------------------------------------------------- tools --

    /**
     * Schedule one beat of an effect, and announce it - the hook sound effects
     * attach to: scene.events.on('singularityfx:beat', ({ card, beat, you }) => ...)
     */
    _beat(card, ctx, beat, at, fn){
        const { scene } = this;

        scene.time.delayedCall(at, () => {
            if (!scene.sys.isActive()) return;

            scene.events.emit('singularityfx:beat', { card: card.id, beat, you: !!ctx.you });
            fn?.();
        });
    }

    /** Hold an object until the effect's cleanup takes it down. */
    _track(obj){
        this.nova?.objects.push(obj);
        return obj;
    }

    /**
     * A tinted wash over the whole stage. The camera's own flash() starts at
     * full strength and drowns the board; this one is held to `alpha`.
     */
    _screenFlash(tint, alpha, ms){
        const { scene } = this;
        const { width, height } = scene.cameras.main;

        const wash = scene.add.rectangle(0, 0, width, height, tint, 1)
            .setOrigin(0).setDepth(FX_DEPTH + 4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha);

        scene.tweens.add({
            targets:    wash,
            alpha:      0,
            duration:   ms,
            ease:       'Quad.easeOut',
            onComplete: () => wash.destroy(),
        });
    }

    /** A soft tinted glow (the radial texture), added to `parent` when given. */
    _glow(parent, x, y, tint, scale){
        const img = this.scene.add.image(x, y, RADIAL_KEY)
            .setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale);

        if (parent) parent.add(img);
        else        img.setDepth(FX_DEPTH);

        return img;
    }

    /**
     * An expanding ring that thins as it grows - drawn, not scaled, so the
     * stroke does not fatten along with the radius.
     */
    _ring(parent, x, y, { from, to, width, color, ms, delay = 0 }){
        const { scene } = this;

        const g = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
        if (parent) parent.add(g);
        else        g.setDepth(FX_DEPTH);

        scene.tweens.addCounter({
            from:     0,
            to:       1,
            duration: ms,
            delay,
            ease:     'Cubic.easeOut',
            onUpdate: (tw) => {
                const t = tw.getValue();

                g.clear();
                g.lineStyle(Math.max(1, width * (1 - t)), color, 1 - t);
                g.strokeCircle(x, y, Phaser.Math.Linear(from, to, t));
            },
            onComplete: () => g.destroy(),
        });

        return g;
    }

    /** A preFX glow with the padding it needs to not be clipped. WebGL only. */
    _fxGlowOn(obj, color, strength){
        const fx = this.pre(obj);
        if (!fx) return null;

        fx.setPadding(Math.max(fx.padding ?? 0, 24));
        return fx.addGlow(color, strength, 0, false, 0.1, 14);
    }

    /** The soft disc every glow is built from, drawn once into the texture cache. */
    _radialTexture(){
        const { textures } = this.scene;
        if (textures.exists(RADIAL_KEY)) return;

        const size = RADIAL_SIZE;
        const tex  = textures.createCanvas(RADIAL_KEY, size, size);
        const ctx  = tex.getContext();
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

        grad.addColorStop(0,    'rgba(255,255,255,1)');
        grad.addColorStop(0.22, 'rgba(255,255,255,0.7)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.2)');
        grad.addColorStop(1,    'rgba(255,255,255,0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        tex.refresh();
    }

    /** The healing cross, drawn once into the texture cache: a white plus with a soft bloom. */
    _crossTexture(){
        const { textures } = this.scene;
        if (textures.exists(CROSS_KEY)) return;

        const size = CROSS_SIZE;
        const tex  = textures.createCanvas(CROSS_KEY, size, size);
        const ctx  = tex.getContext();

        const arm  = 54;            // the arm's thickness
        const len  = size - 72;     // tip to tip, leaving room for the bloom
        const c    = size / 2;

        const plus = () => {
            ctx.beginPath();
            ctx.roundRect(c - arm / 2, c - len / 2, arm, len, arm / 2);
            ctx.roundRect(c - len / 2, c - arm / 2, len, arm, arm / 2);
            ctx.fill();
        };

        // The bloom, then the hard white body over it.
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur  = 28;
        ctx.fillStyle   = 'rgba(255,255,255,0.55)';
        plus();

        ctx.shadowBlur = 10;
        ctx.fillStyle  = 'rgba(255,255,255,1)';
        plus();

        tex.refresh();
    }

    /**
     * The Heavy Mend's cross, drawn once into the texture cache: four blades
     * that run thick from the heart and taper to needle points, a soft bloom
     * behind them and a hotter, narrower body inside - so a tint reads
     * brightest down the spine of each blade.
     */
    _sharpCrossTexture(){
        const { textures } = this.scene;
        if (textures.exists(SHARP_CROSS_KEY)) return;

        const size = HEAVY_CROSS_SIZE;
        const tex  = textures.createCanvas(SHARP_CROSS_KEY, size, size);
        const ctx  = tex.getContext();
        const c    = size / 2;

        // One blade per direction: full width at the heart, a slight waist,
        // then a long taper to the point.
        const cross = (base, long, side) => {
            ctx.beginPath();
            [[0, -1, long], [1, 0, side], [0, 1, long], [-1, 0, side]].forEach(([dx, dy, len]) => {
                const px = -dy;     // across the blade
                const py =  dx;
                ctx.moveTo(c + px * base, c + py * base);
                ctx.lineTo(c + px * base * 0.72 + dx * len * 0.3, c + py * base * 0.72 + dy * len * 0.3);
                ctx.lineTo(c + dx * len, c + dy * len);
                ctx.lineTo(c - px * base * 0.72 + dx * len * 0.3, c - py * base * 0.72 + dy * len * 0.3);
                ctx.lineTo(c - px * base, c - py * base);
                ctx.closePath();
            });

            // A diamond over the heart, so the four blades meet without notches.
            const d = base * 1.7;
            ctx.moveTo(c, c - d);
            ctx.lineTo(c + d, c);
            ctx.lineTo(c, c + d);
            ctx.lineTo(c - d, c);
            ctx.closePath();
            ctx.fill();
        };

        ctx.shadowColor = 'rgba(255,255,255,0.85)';
        ctx.shadowBlur  = 34;
        ctx.fillStyle   = 'rgba(255,255,255,0.4)';
        cross(36, HEAVY_CROSS_LONG, HEAVY_CROSS_SIDE);

        ctx.shadowBlur = 8;
        ctx.fillStyle  = 'rgba(255,255,255,0.75)';
        cross(28, HEAVY_CROSS_LONG - 4, HEAVY_CROSS_SIDE - 4);

        ctx.shadowBlur = 4;
        ctx.fillStyle  = 'rgba(255,255,255,1)';
        cross(12, HEAVY_CROSS_LONG - 14, HEAVY_CROSS_SIDE - 14);

        tex.refresh();
    }

    /** The feathered void textures, drawn once from the raw art. See DARK_VOID_KEYS. */
    _featherVoids(){
        const { textures } = this.scene;

        DARK_VOID_KEYS.forEach(key => {
            const raw = `${key}Raw`;
            if (textures.exists(key) || !textures.exists(raw)) return;

            const src = textures.get(raw).getSourceImage();
            const w   = src.width;
            const h   = src.height;

            const tex = textures.createCanvas(key, w, h);
            const ctx = tex.getContext();
            ctx.drawImage(src, 0, 0);

            // Keep the art only inside a circle that fades out before the frame's edge.
            const fade = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
            fade.addColorStop(0,    'rgba(0,0,0,1)');
            fade.addColorStop(0.74, 'rgba(0,0,0,1)');
            fade.addColorStop(1,    'rgba(0,0,0,0)');

            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = fade;
            ctx.fillRect(0, 0, w, h);
            tex.refresh();
        });
    }

    /** The artifact's blasts with a round, feathered edge, drawn once from the raw art. */
    _featherBlast(){
        const { textures } = this.scene;

        ARTIFACT_BLAST_KEYS.forEach((key, i) => {
            const raw = `artifactBlast${i + 1}`;
            if (textures.exists(key) || !textures.exists(raw)) return;

            const src = textures.get(raw).getSourceImage();
            const w   = src.width;
            const h   = src.height;

            const tex = textures.createCanvas(key, w, h);
            const ctx = tex.getContext();
            ctx.drawImage(src, 0, 0);

            const fade = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
            fade.addColorStop(0,    'rgba(0,0,0,1)');
            fade.addColorStop(0.8,  'rgba(0,0,0,1)');
            fade.addColorStop(1,    'rgba(0,0,0,0)');

            ctx.globalCompositeOperation = 'destination-in';
            ctx.fillStyle = fade;
            ctx.fillRect(0, 0, w, h);
            tex.refresh();
        });
    }

    /** The flipbooks the card art plays as - each frame a separate image. */
    _buildAnims(){
        const { anims, textures } = this.scene;

        if (!anims.exists(NOVA_FLICKER) && Object.keys(NOVA_ART).every(key => textures.exists(key))){
            anims.create({
                key:       NOVA_FLICKER,
                frames:    [{ key: 'novaBurstWave' }, { key: 'novaBurstSlash' }, { key: 'novaBurstComet' }],
                frameRate: 14,
                repeat:    -1,
            });
        }

        // Slower than the Nova's - the field breathes rather than crackles.
        if (!anims.exists(FIELD_FLICKER) && Object.keys(FIELD_ART).every(key => textures.exists(key))){
            anims.create({
                key:       FIELD_FLICKER,
                frames:    [{ key: 'fieldRingFlame' }, { key: 'fieldRingBolt' }, { key: 'fieldRingSmoke' }],
                frameRate: 9,
                repeat:    -1,
            });
        }

        // All four mend images, at a shimmer between the two.
        if (!anims.exists(MEND_FLICKER) && Object.keys(MEND_ART).every(key => textures.exists(key))){
            anims.create({
                key:       MEND_FLICKER,
                frames:    [{ key: 'mendBloom' }, { key: 'mendSwirl' }, { key: 'mendRing' }, { key: 'mendStreak' }],
                frameRate: 11,
                repeat:    -1,
            });
        }

        // The heavy mend churns slower than the light one - it has more weight.
        if (!anims.exists(HEAVY_FLICKER) && Object.keys(HEAVY_ART).every(key => textures.exists(key))){
            anims.create({
                key:       HEAVY_FLICKER,
                frames:    [{ key: 'heavyNebula' }, { key: 'heavyHalo' }, { key: 'heavyRing' }, { key: 'heavyCrescent' }],
                frameRate: 9,
                repeat:    -1,
            });
        }

        // The artifact's energy crackles.
        this._featherBlast();
        if (!anims.exists(ARTIFACT_BLAST) && ARTIFACT_BLAST_KEYS.every(key => textures.exists(key))){
            anims.create({
                key:       ARTIFACT_BLAST,
                frames:    ARTIFACT_BLAST_KEYS.map(key => ({ key })),
                frameRate: 12,
                repeat:    -1,
            });
        }

        // The splashes churn quick - the colour never settles.
        this._featherPatterns();
        if (!anims.exists(PATTERN_FLICKER) && PATTERN_SOFT_KEYS.every(key => textures.exists(key))){
            anims.create({
                key:       PATTERN_FLICKER,
                frames:    PATTERN_SOFT_KEYS.map(key => ({ key })),
                frameRate: 10,
                repeat:    -1,
            });
        }

        // The star crackles; the void churns - slower, and heavier for it.
        this._featherVoids();
        const hasDark = Object.keys(DARK_ART).every(key => textures.exists(key))
            && DARK_VOID_KEYS.every(key => textures.exists(key));

        if (!anims.exists(DARK_LIGHT_FLICKER) && hasDark){
            anims.create({
                key:       DARK_LIGHT_FLICKER,
                frames:    [{ key: 'darkLight4' }, { key: 'darkLight2' }, { key: 'darkLight1' }, { key: 'darkLight3' }],
                frameRate: 12,
                repeat:    -1,
            });
        }

        if (!anims.exists(DARK_VOID_FLICKER) && hasDark){
            anims.create({
                key:       DARK_VOID_FLICKER,
                frames:    [{ key: 'darkVoid2' }, { key: 'darkVoid4' }, { key: 'darkVoid1' }, { key: 'darkVoid3' }],
                frameRate: 9,
                repeat:    -1,
            });
        }
    }

    // ---------------------------------------------------------- placeholder --
    // _cue(): The stand-in every card plays until it has its own effect - a
    // flash through the slot, a ring off the card and the card's name.
    _cue(card, slot){
        const { scene } = this;
        if (!slot?.root) return;

        const x = slot.homeX;
        const y = slot.homeY;

        scene.tweens.add({
            targets:  slot.flash,
            alpha:    { from: 0.55, to: 0 },
            duration: 420,
            ease:     'Cubic.easeOut',
        });

        const ring = scene.add.circle(x, y, 60, card.glow, 0)
            .setStrokeStyle(3, card.glow, 0.9)
            .setBlendMode(Phaser.BlendModes.ADD);

        scene.tweens.add({
            targets:    ring,
            scale:      3,
            alpha:      0,
            duration:   620,
            ease:       'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });

        const name = scene.add.text(x, y - 40, `${card.icon}  ${card.name}`, {
            fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold',
            color: '#' + card.glow.toString(16).padStart(6, '0'),
            stroke: '#04121a', strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0);

        this.pre(name)?.addGlow(card.glow, 2, 0, false, 0.1, 10);

        scene.tweens.add({
            targets:  name,
            alpha:    1,
            y:        y - 60,
            duration: 260,
            ease:     'Back.easeOut',
        });

        scene.tweens.add({
            targets:    name,
            alpha:      0,
            y:          y - 90,
            delay:      900,
            duration:   380,
            ease:       'Cubic.easeIn',
            onComplete: () => name.destroy(),
        });
    }
}

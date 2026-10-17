/**
 * The SERVER's source of truth for Singularity Cards.
 * The client sends a card id only - the cost and what the card does are read
 * from here, never from the wire. Mirrors public/js/models/singularityCards.js.
 *
 *   attribute  how the card is played:
 *                'attack'   armed in its slot, then fired by the ATTACK base move
 *                'defence'  armed in its slot, then raised by the DEFEND base move
 *                'healing'  armed in its slot, then played on the active card by
 *                           its own button - no base move, no turn spent
 *                'affliction' armed in its slot, then cast on the opponent's
 *                           active card by its own button - a base move
 *                'cleanse'  armed in its slot, then played by its own button -
 *                           cures every affliction on the player's own cards;
 *                           no base move, no turn spent
 *   playable   false until the card has rules in the BattleEngine. The store
 *              refuses it, so nobody can spend SP on a card that does nothing.
 */

export const SINGULARITY_LIBRARY = [
    { id: 'nova_burst',                 name: 'NOVA BURST',             cost: 200,      attribute: 'attack',        playable: true  },
    { id: 'containment_field',          name: 'CONTAINMENT FIELD',      cost: 250,      attribute: 'defence',       playable: true },
    { id: 'light_mend',                 name: 'LIGHT MEND',             cost: 300,      attribute: 'healing',       playable: true },
    { id: 'dark_disturbance',           name: 'DARK DISTURBANCE',       cost: 400,      attribute: 'affliction',    playable: true },
    { id: 'an_artifact',                name: 'AN ARTIFACT',            cost: 400,      attribute: 'attack',        playable: true  },
    { id: 'heavy_mend',                 name: 'HEAVY MEND',             cost: 500,      attribute: 'healing',       playable: true },
    { id: 'pattern_interruption',       name: 'PATTERN INTERRUPTION',   cost: 500,      attribute: 'cleanse',       playable: true },
    { id: 'el_draco',                   name: 'EL DRACO',               cost: 600,      attribute: null,            playable: false },
    { id: 'samsara_wheel',              name: 'SAMSARA WHEEL',          cost: 600,      attribute: null,            playable: false },
    { id: 'sphere_network',             name: 'SPHERE NETWORK',         cost: 700,      attribute: null,            playable: false },
    { id: 'my_lost_love',               name: 'MY LOST LOVE',           cost: 900,      attribute: null,            playable: false },
    { id: 'the_return',                 name: 'THE RETURN',             cost: 1000,     attribute: null,            playable: false },
];

export const SINGULARITY_BY_ID = Object.fromEntries(SINGULARITY_LIBRARY.map(c => [c.id, c]));

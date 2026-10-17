/** |Affliction Stage| - Dark Disturbance
 * The PLAYER casts the affliction onto the OPPONENT's card. Once it is
 * sealed, the afflicted opponent attacks twice and bleeds ESSE for each
 * ('tick'), then the affliction is lifted ('lifted') so the loop ends clean -
 * in a match it would hold for all 8 attacks.
 */

import { ATTACK_LAND_MS } from '../arena.js';

export const roles = { player: 'CASTS THE AFFLICTION', opponent: 'IS AFFLICTED' };

const LEAD_MS     = 600;    // the arena standing still before the card is played
const STANDING_MS = 900;    // the sealed affliction standing before the first attack
const ATTACKS     = 2;
const ATTACK_GAP  = 1700;
const AFTER_MS    = 1600;   // the lift playing out

export default function affliction({ fx, card, player, opponent, at, play, lunge, hit, setEsse }){
    const tl  = fx.hexOf(card);
    const aff = {
        singularity:  card.id,
        name:         card.affliction ?? 'COSMIC DARKNESS',
        esseLoss:     10,
        attacksLeft:  8,
        attacksTotal: 8,
    };

    at(LEAD_MS, () => play(player, opponent, {
        targetPlayerId: 'opponent',
        targetCardId:   opponent.cardId,
        affliction:     aff,
    }));

    let mine   = 100;
    let theirs = 100;
    let last   = 0;

    for (let i = 0; i < ATTACKS; i++){
        const swing = LEAD_MS + tl.HOLD_MS + STANDING_MS + i * ATTACK_GAP;
        const tick  = { type: 'affliction:tick', name: aff.name, esseLoss: aff.esseLoss, attacksLeft: aff.attacksLeft - (i + 1) };

        mine   -= 12;
        theirs -= aff.esseLoss;
        const myEsse    = mine;
        const theirEsse = theirs;

        at(swing, () => {
            lunge(opponent);
            fx.afflictionTick(opponent, tick, ATTACK_LAND_MS + 60);
        });
        at(swing + ATTACK_LAND_MS, () => {
            hit(player, { damage: 12 });
            setEsse(player, myEsse);
        });
        at(swing + ATTACK_LAND_MS + 60, () => setEsse(opponent, theirEsse));

        last = swing;
    }

    at(last, () => fx.liftAffliction(opponent, { type: 'affliction:ended', name: aff.name, expired: true }, ATTACK_LAND_MS + 700));

    return last + ATTACK_LAND_MS + 700 + AFTER_MS;
}

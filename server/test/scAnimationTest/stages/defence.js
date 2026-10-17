/** |Defence Stage| - Containment Field
 * The PLAYER raises the field; once it has formed the OPPONENT attacks into
 * it. The field takes the blow ('struck') and breaks after it ('broken'),
 * as it does in the battle scene's 'field:broken' handling.
 */

import { ATTACK_LAND_MS } from '../arena.js';

export const roles = { player: 'RAISES THE FIELD', opponent: 'ATTACKS INTO IT' };

const LEAD_MS     = 600;    // the arena standing still before the card is played
const STANDING_MS = 900;    // the formed field standing before it is attacked
const BREAK_MS    = 380;    // contact -> the field breaking
const AFTER_MS    = 1400;   // the shatter playing out

export default function defence({ fx, card, player, opponent, at, play, lunge, hit, setEsse }){
    const hold  = fx.holdOf(card);
    const swing = LEAD_MS + hold + STANDING_MS;
    const land  = swing + ATTACK_LAND_MS;

    at(LEAD_MS, () => play(player, opponent));

    at(swing, () => lunge(opponent));
    at(land, () => {
        // 99% of the blow evaded.
        const { x, y } = hit(player, { damage: 1 });
        setEsse(player, 99);

        fx.fieldStruck(player, x, y);
        fx.breakField(player, BREAK_MS);
    });

    return land + BREAK_MS + AFTER_MS;
}

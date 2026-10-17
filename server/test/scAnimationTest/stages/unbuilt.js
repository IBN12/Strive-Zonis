/** |Unbuilt Stage| - El Draco, Samsara Wheel, Sphere Network, My Lost Love, The Return
 * A card with no attribute yet has no effect of its own - the animation
 * class plays its placeholder cue on the PLAYER's card. Give the card an
 * attribute and it moves onto that attribute's stage.
 */

export const roles = { player: 'PLAYS THE CARD', opponent: '' };

const LEAD_MS  = 600;
const CUE_MS   = 1400;     // _cue(): the flash, ring and name fading out

export default function unbuilt({ player, opponent, at, play }){
    at(LEAD_MS, () => play(player, opponent));
    return LEAD_MS + CUE_MS;
}

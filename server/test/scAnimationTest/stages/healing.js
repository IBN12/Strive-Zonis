/** |Healing Stage| - Light Mend, Heavy Mend
 * The PLAYER's card starts the loop wounded and heals itself; the ESSE bar
 * refills on the 'restore' beat. The OPPONENT only watches.
 */

export const roles = { player: 'HEALS', opponent: 'WATCHES' };

const LEAD_MS  = 600;      // the arena standing still before the card is played
const START    = 20;       // the player's ESSE going in
const AFTER_MS = 800;

export default function healing({ fx, card, player, opponent, at, play, setEsse }){
    const tl    = fx.mendOf(card);
    const after = Math.min(100, START + (card.restores ?? 30));

    setEsse(player, START, true);

    at(LEAD_MS, () => play(player, opponent, {
        targetCardId: player.cardId,
        healed:       after - START,
        esseAfter:    after,
        maxEsse:      100,
    }));

    at(LEAD_MS + tl.BEATS.restore, () => setEsse(player, after));

    return LEAD_MS + tl.HOLD_MS + AFTER_MS;
}

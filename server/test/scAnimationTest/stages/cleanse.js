/** |Cleanse Stage| - Pattern Interruption
 * The PLAYER's card starts the loop under Cosmic Darkness. It plays the card
 * on itself and the affliction is torn off on the 'cleanse' beat, as
 * _playSingularityCleanse() does. The OPPONENT only watches.
 */

export const roles = { player: 'CLEANSES ITSELF', opponent: 'WATCHES' };

const LEAD_MS  = 1400;     // the standing affliction shown before the card is played
const AFTER_MS = 800;

export default function cleanse({ fx, card, player, opponent, at, play }){
    const tl  = fx.cleanseOf(card);
    const aff = {
        singularity:  'dark_disturbance',
        name:         'COSMIC DARKNESS',
        esseLoss:     10,
        attacksLeft:  5,
        attacksTotal: 8,
    };

    // Stood straight up, the way a resync shows an affliction already on the card.
    fx.syncAffliction(player, {
        activeCardId: player.cardId,
        cards: [{ id: player.cardId, affliction: aff }],
    });

    at(LEAD_MS, () => play(player, opponent, {
        cleansed: [{ cardId: player.cardId, name: aff.name }],
    }));

    at(LEAD_MS + tl.BEATS.cleanse, () => fx.cleanseAffliction(player));

    return LEAD_MS + tl.HOLD_MS + AFTER_MS;
}

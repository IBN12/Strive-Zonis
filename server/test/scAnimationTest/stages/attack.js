/** |Attack Stage| - Nova Burst, An Artifact
 * The PLAYER charges the card and strikes; the OPPONENT takes every strike.
 * Played to the card's own clock, like _playSingularitySequence():
 *
 *   0                          the card is played - the charge
 *   CHARGE + i * STRIKE_GAP    strike i leaves the player
 *   ... + FLIGHT               it lands on the opponent (the lunge starts ATTACK_LAND_MS before)
 *   last landing + SETTLE      the board would catch up
 */

import { ATTACK_LAND_MS } from '../arena.js';

export const roles = { player: 'CASTS THE ATTACK', opponent: 'TAKES THE ATTACK' };

const LEAD_MS = 600;       // the arena standing still before the card is played

export default function attack({ fx, card, player, opponent, at, play, ctx, lunge, hit, setEsse }){
    const tl = fx.timelineOf(card);

    // Nova Burst strikes twice; An Artifact once (its STRIKE_GAP_MS is 0).
    const strikes = tl.STRIKE_GAP_MS > 0 ? 2 : 1;
    const bonus   = card.id === 'an_artifact' ? 5 : 0;
    const damage  = card.id === 'an_artifact' ? 30 : 18;

    at(LEAD_MS, () => play(player, opponent));

    let esse = 100;
    for (let i = 0; i < strikes; i++){
        const n     = i + 1;
        const leave = LEAD_MS + tl.CHARGE_MS + i * tl.STRIKE_GAP_MS;
        const land  = leave + tl.FLIGHT_MS;

        esse -= damage + bonus;
        const ev = {
            type: 'attack', singularity: card.id,
            damage: damage + bonus, bonusDamage: bonus, critical: true,
            defenderCardId: opponent.cardId, esseAfter: esse,
        };

        at(leave, () => fx.strikeSingularityCard(card, ctx(player, opponent, ev), ev, n, strikes));
        at(Math.max(leave, land - ATTACK_LAND_MS), () => lunge(player));
        at(land, () => {
            hit(opponent, { damage: ev.damage, critical: true });
            setEsse(opponent, ev.esseAfter);
        });
    }

    const lastLand = LEAD_MS + tl.CHARGE_MS + (strikes - 1) * tl.STRIKE_GAP_MS + tl.FLIGHT_MS;
    return lastLand + tl.SETTLE_MS;
}

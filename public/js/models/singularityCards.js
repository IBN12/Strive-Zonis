export const SINGULARITY_CARDS = [
    { 
        id: 'nova_burst',
        name: 'NOVA BURST',
        cost: 200,
        color: 0x1e90ff,
        glow: 0x4fc3ff,
        desc: `Attack card. Arm it, then ATTACK: your card strikes twice,
        and neither strike can miss (2/3, 3/4 or a critical).`,
        icon: '★',
        // 'attack' cards are armed in their slot and fired by the ATTACK button.
        attribute: 'attack',
    }, 

    {
        id: 'containment_field',
        name: 'CONTAINMENT FIELD',
        cost: 250,
        color: 0xff1a1a,
        glow: 0xff4d4d,
        desc: `Defence card. Arm it, then DEFEND: a field forms round your card
        and evades 99% of the damage from the next Attack, Nova Burst or
        An Artifact critical.`,
        icon: '◈',
        // 'defence' cards are armed in their slot and raised by the DEFEND button.
        attribute: 'defence',
    },

    { 
        id: 'light_mend', 
        name: 'LIGHT MEND', 
        cost: 300, 
        color: 0x00ffcc, 
        glow: 0x88ffdd, 
        desc: `Healing card. Arm it, then press HEAL: your card in the arena
        restores +30 ESSE. Kept if that card is already at full ESSE.`,
        icon: '✦',
        // 'healing' cards are armed in their slot and played by the HEAL button.
        attribute: 'healing',
        // ESSE restored - for the HEAL button's label. The server's
        // LIGHT_MEND_ATT.RESTORES_ESSE is what is actually healed.
        restores: 30,
    },

    { 
        id: 'dark_disturbance', 
        name: 'DARK DISTURBANCE', 
        cost: 400, 
        color: 0xbb00ff, 
        glow: 0xee44ff, 
        desc: `Affliction card. Arm it, then USE COSMIC DARKNESS: the opposing
        card is trapped in a dark void and loses 10 ESSE after every attack it
        attempts, for 8 attacks. Counts as your base move.`,
        icon: '⛧',
        // 'affliction' cards are armed in their slot and cast on the opposing
        // card by their own button - a base move.
        attribute: 'affliction',
        // For the button's label. The server's DARK_DISTURBANCE_ATT is what is
        // actually laid on the card.
        affliction: 'COSMIC DARKNESS',
    },

    {
        id: 'an_artifact',
        name: 'AN ARTIFACT',
        cost: 400,
        color: 0xbbf7d0,
        glow: 0x86efac,
        desc: `Attack card. Arm it, then ATTACK: your card's strike is a
        guaranteed critical hit with +5 attack on top. Only a Containment
        Field can evade the critical - and the +5 still lands through it.`,
        icon: '⚔',
        // 'attack' cards are armed in their slot and fired by the ATTACK button.
        attribute: 'attack',
    },

    {
        id: 'heavy_mend',
        name: 'HEAVY MEND',
        cost: 500,
        color: 0x8a3cff,
        glow: 0xb98cff,
        desc: `Healing card. Arm it, then press HEAL: your card in the arena
        restores +75 ESSE. Kept if that card is already at full ESSE.`,
        icon: '✚',
        // 'healing' cards are armed in their slot and played by the HEAL button.
        attribute: 'healing',
        // ESSE restored - for the HEAL button's label. The server's
        // HEAVY_MEND_ATT.RESTORES_ESSE is what is actually healed.
        restores: 75,
    },

    {
        id: 'pattern_interruption',
        name: 'PATTERN INTERRUPTION',
        cost: 500,
        color: 0xfacc15,
        glow: 0xfde68a,
        desc: `Cleanse card. Arm it, then press CLEANSE: breaks the pattern of
        every affliction on your cards, such as Dark Disturbance's Cosmic
        Darkness, and cures them. Kept if none of your cards are afflicted.`,
        icon: '❂',
        // 'cleanse' cards are armed in their slot and played by the CLEANSE
        // button - no base move. The server's PATTERN_INTERRUPTION_ATT is what
        // decides which afflictions are cured.
        attribute: 'cleanse',
    },

    {
        id: 'el_draco',
        name: 'EL DRACO',
        cost: 600,
        color: 0xc084fc,
        glow: 0xa855f7,
        desc: `Allows any non supra card to transform into a supra.`,
        icon: '⚜',
    },

    {
        id: 'samsara_wheel',
        name: 'SAMSARA WHEEL',
        cost: 600,
        color: 0x60a5fa,
        glow: 0x3b82f6,
        desc: `Debuff critical, transformation, and ability stats that any
               initiator card has built up.`,
        icon: '☸',
    },

    {
        id: 'sphere_network',
        name: 'SPHERE NETWORK',
        cost: 700,
        color: 0x6366f1,
        glow: 0x4f46e5,
        desc: `Adds an extra 1/2 attack multiplier on top of the base attack,
        and renders all Eviden abilities ineffective.`,
        icon: '⬡',
    },

    {
        id: 'my_lost_love',
        name: 'MY LOST LOVE',
        cost: 900,
        color: 0xf43f5e,
        glow: 0xe11d48,
        desc: `Restores 100% ESSE to every card in the deck.`,
        icon: '♥',
    },

    {
        id: 'the_return',
        name: 'THE RETURN',
        cost: 1000,
        color: 0x99f6e4,
        glow: 0x5eead4, 
        desc: `Will revive any card that has fallen.`,
        icon: '↺',
    }


]

// The cards the stores offer. A card still waiting on its color, glow, icon or
// description (a placeholder like PATTERN INTERRUPTION) is left out - the
// stores draw every card they list, and a null color stops them opening.
export const STORE_CARDS = SINGULARITY_CARDS.filter(c =>
    c.color != null && c.glow != null && c.icon != null && c.desc != null);

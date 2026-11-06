/**
 * The open field's words (content/overworld.ts): signs, the grove chest, the shrine door, the hollow,
 * the Heart Vessel. Signs are whole boxes (title line, then the words). Voice and rules:
 * docs/world.md, "Writing for the player".
 */
export const O = {
  grove: {
    padlock: 'An old iron padlock. Someone in [place]Thistledown[/] may have the key.',
    keyTurns: 'The [gear]Small Key[/] turns.',
    sword: [
      '[gear]Wayfarer\'s Blade[/]. Nicked, and it still sings.',
      '[attack] swings; three in rhythm make a combo. [lock] locks on.',
      'Maren should see this, back in [place]Thistledown[/].',
    ],
  },
  door: {
    opens: 'You lay a hand on the glowing spiral. The stone groans.',
    shut: (hint: string) => `A spiral carved in cold stone. It won't budge.\n${hint}`,
    hintArmed: 'The lantern is dark. Its flame went southwest, to the [place]Gloaming Hollow[/].',
    hintUnarmed: 'Someone in [place]Thistledown[/] might know more.',
  },
  hollow: {
    unarmed: 'Something tall stands in the hollow, still, its back to you.\nNot without a weapon.',
    flameHome: 'The flame flew home. Northeast, the [place]Waking Shrine[/]\'s door is glowing.',
  },
  vessel: '[gear]Heart Vessel[/]. One more heart, and all of them full.',
  signs: {
    gorge: '[place]Hushing Gorge[/]\n"Walk soft. What guards the old bell hates noise."\nBelow, in a child\'s hand: [soft]up is over the gap[/]',
    hollow: '[place]Gloaming Hollow[/]\n"Lamps lit at dusk, snuffed at dawn."\nScratched under it, fresh: [danger]TURN BACK[/]',
    village: '[place]Thistledown Village[/]\n"Mind the windmill. Mind the thornlings more."',
    canyon: '[place]Wayfarers\' Camp[/]\n"The Waybell went over the gap. Nobody has come back with it."',
    gate: {
      open: '[place]The Northpass[/]\nThe gate has fallen. Nobody has walked this road in years.',
      shut: '[place]The Northpass[/]\nA gate of floating stone rose the night the lantern died. Nobody has gone through since.',
    },
    grove: '[place]Whispering Grove[/]\n"The trees remember every word said under them."',
    pedestal: 'Worn letters:\n"While the lantern burns, the stone shall wake. Rekindle it, and the night shall break."',
    crossroads: (arrow: string) => `${arrow} [place]Thistledown Village[/]`,
  },
};

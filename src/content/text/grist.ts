/**
 * The words of Grist, the Stonesick (content/grist.ts). A wanderer whose flesh
 * is turning to stone: the blight's dark held the stone in him asleep, and since the prism broke he crumbles. He is
 * courteous until he learns who lifted it. Voice: slow, polite, grinding; never explains more than that.
 * Rules: docs/world.md, "Writing for the player".
 */
export const G = {
  who: 'Grist',
  unarmed: 'Go home, little one. Come back with a blade, and we\'ll talk properly.',
  again: 'You again. Sit, if you like.',
  /** The blight still lies on the valley. */
  dark: {
    open: [
      'The thorns don\'t trouble me. Nor the dark. We get along.',
      'That\'s old Bram\'s blade. He\'d not have parted with it.',
    ],
    ask: 'Where are you taking it?',
    options: ['To the shrine.', 'Nowhere.', 'Leave'],
    shrine: ['To light the lantern. To lift all this.', '[shake]No.[/] The dark is all that holds me together.'],
    nowhere: ['You\'d not need a blade to go nowhere.', 'You\'re for the shrine. [danger]I can\'t allow it.[/]'],
    leave: 'Keep to the road, then.',
  },
  /** The prism is broken and the sky is back. */
  open: {
    open: 'Sit a while, if you like. I\'m in no state to chase anyone.',
    askSky: 'The sky came back. Do you like it?',
    skyOptions: ['It\'s beautiful.', 'It\'s only sky.'],
    skyYes: 'I liked the violet. While it lay here, the stone in me slept.',
    skyNo: 'Only sky. Since it came back, I [old]crumble[/] a little more each morning.',
    askWho: 'Someone broke the light in the [place]Waking Shrine[/]. You\'ve its dust on your boots. Was it you?',
    whoOptions: ['It was me.', 'Not me.', 'Leave'],
    admit: ['Honest, at least.', 'Then you\'ve ground me down to [old]grist[/]. [danger]Hold still.[/]'],
    deny: ['You lie like a [place]Thistledown[/] child.', '[danger]Hold still.[/]'],
    leave: 'Go on, then. I\'ll be here. A little less of me each day.',
  },
};

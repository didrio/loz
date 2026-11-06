/**
 * The bells' words (content/bells.ts): what each says when found and rung, and what the posts say.
 * Names, carvings and sites stay in BELLS (they are data the travel menu and the world use).
 * Voice and rules: docs/world.md, "Writing for the player".
 */
export const B = {
  /** The second line when a bell is found: which hour it rang, and a nudge toward its post. */
  found: {
    morrow: 'The keepers rang the dawn with it. Its post stands in [place]Thistledown[/].',
    lull: 'The keepers rang it at dusk, to put the stones to sleep. Its post is somewhere in these halls.',
    way: 'The keepers rang it at noon, to call travelers off the pass. Its post is at the camp, across the gap.',
  },
  /** Where a lone bell's note goes when it's rung (then "...and nothing answers"). */
  carries: {
    morrow: 'Its bright note rolls out over the roofs',
    lull: 'Its low note rolls through the sleeping halls',
    way: 'Its green note rolls down the pass',
  },
  alone: (carries: string) => `${carries}... and nothing answers.`,
  gotBell: (name: string, found: string) => `[gear]${name}[/]. ${found}`,
  hangs: (name: string) => `The [gear]${name}[/] hangs again.`,
  answers: (name: string) => `Far off, the [gear]${name}[/] answers. The notes hang together, like a road between them.`,
  howTo: 'Ring a bell with [interact], then follow an answer to travel to that bell.',
  follow: { title: 'Follow the answer', stay: 'Stay' },
  post: {
    carving: (carving: string) => `Carved on the arm: [old]${carving}[/].`,
    wrongBell: (carving: string, bell: string) => `An empty hook. ${carving}\nThe [gear]${bell}[/] doesn't belong here.`,
    another: (carving: string) => `Another empty hook. ${carving}`,
    first: (carving: string) => `A crooked post with an empty hook. Something hung here once.\n${carving}`,
  },
};

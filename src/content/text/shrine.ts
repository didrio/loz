/**
 * The Waking Shrine's words (content/shrine.ts): chest messages, door locks, hints. Signs and
 * sigils are dungeon data (world/dungeon/defs) and sigils.ts. Voice and rules: docs/world.md,
 * "Writing for the player".
 */
export const SH = {
  loot: {
    bossKey: '[gear]Boss Key[/]. Its great teeth fit the keeper\'s door.',
    tether: '[gear]Tether Glove[/]. Its glowing cord tugs toward the shrine\'s stones, as if it knows them.',
    /** A small key chest (`color` is the key's color). */
    key: (name: string, color: string) => `[gear]${name}[/]. It opens the shrine's one ${color} door.`,
    item: (name: string) => `[gear]${name}[/].`,
    gems: (n: number) => `${n} gems.`,
    /** A flask chest; `button` is the flask's button tag (`[flask1]`). */
    flask: (potion: 'life' | 'attack', button: string) => potion === 'life'
      ? `[gear]Life Potion[/], in a flask. ${button} drinks it: every heart back. Odo in [place]Thistledown[/] refills it.`
      : `[gear]Attack Potion[/], in a flask. ${button} drinks it: double sword damage for 30 seconds. Odo in [place]Thistledown[/] refills it.`,
  },
  tetherToast: '[item] throws the glove. A stone it catches comes to you.',
  heavy: {
    withGlove: 'Too heavy for a blade. Try the [item] Tether Glove.',
    plain: 'Too heavy for a blade.',
  },
  door: {
    needsKey: (name: string) => `Locked. It needs the [gear]${name}[/].`,
    needsBossKey: 'A great iron lock. It needs the [gear]Boss Key[/].',
    barred: 'Iron bars. Something here must raise them.',
  },
};

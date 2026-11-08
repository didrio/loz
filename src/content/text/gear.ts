/** The Gear tab's words (pause menu): one short line per thing Wren carries. */
export const G = {
  tab: 'Gear',
  sword: { name: 'Sword', text: 'Plain steel, kept sharp. It has never let you down.' },
  shield: { name: 'Shield', text: 'Raise it to turn a blow. Lower it to let it recover.' },
  tunic: { name: 'Stoneward Tunic', text: 'Slate-blue, woven with shrine grit. Stone hits do half damage.' },
  glove: { name: 'Tether Glove', text: 'Throw it at a stone and the cord drags the stone to you.' },
  flask: (potion: string | null) => ({
    name: potion ?? 'Empty flask',
    text: potion ? 'Drink it when it counts. Once empty, only Odo can fill it, for gems.' : 'Empty. Odo fills it for gems.',
  }),
  bell: {
    carried: (name: string) => ({ name, text: 'Carried. Hang it on its post by the water to wake it.' }),
    hung: (name: string, site: string) => ({ name, text: `Hung at ${site}.` }),
  },
  keys: { name: (n: number) => (n === 1 ? 'Small key' : `Small keys: ${n}`), text: 'Each opens one lock.' },
  colorKey: (color: string) => ({ name: `${color[0].toUpperCase()}${color.slice(1)} key`, text: 'Opens one door in this dungeon, and no other.' }),
  bossKey: { name: 'Boss key', text: 'The last door in this dungeon is made for it.' },
  doll: { name: 'Pip\'s doll', text: 'Patched, a little damp. Pip will want it back.' },
  empty: 'Nothing yet.',
} as const;

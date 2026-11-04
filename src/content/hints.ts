import type { Script } from '../game/script';
import type { Flag, GameState } from '../game/state';
import type { MurmurbudLook } from '../world/murmurbud';

/**
 * The keepers' notes, sealed in Murmurbuds around the valley (docs/world.md "Murmurbuds"). The
 * keepers wrote them for whoever came after: old-fashioned, fond, a little bossy. Each note is
 * one idea the player can act on, and its title says plainly what it helps with. The pause menu lists the found ones in this order.
 */
export const HINTS = [
  {
    id: 'tunic',
    title: 'The Stoneward tunic',
    text: 'The shrine\'s stone beasts hit hard. The [gear]Stoneward Tunic[/], from Odo by the well, halves their blows. Do not haggle.',
  },
  {
    id: 'flasks',
    title: 'Refilling your flasks',
    text: 'A flask is never empty for good, only waiting. Odo, by [place]Thistledown[/]\'s well, fills it again for 20 gems.',
  },
  {
    id: 'bells',
    title: 'Bells, posts and travel',
    text: 'Hang each bell on the post carved with its name. Ring one to travel to any other hung bell. Bells never heal; beds do.',
  },
  {
    id: 'boss',
    title: 'Fighting the stone giant',
    text: 'Jump the giant\'s shock ring. After each slam a chest plate glows loose: pull it off. With all three gone, strike.',
  },
] as const;

export type HintId = (typeof HINTS)[number]['id'];

export const hintFlag = (id: HintId): Flag => `hint.${id}`;

/** The notes found so far, in the registry's order. */
export function foundHints(state: GameState) {
  return HINTS.filter((h) => state.has(hintFlag(h.id)));
}

/**
 * Scripts for an area's Murmurbuds (`bud.<hint>`: reading the note floating over an opened bud)
 * and its restore: buds whose note was read come back open and empty. (An opened bud whose
 * note wasn't read closes again on reload: only reading is saved.)
 */
export function hintContent(buds: ReadonlyMap<string, MurmurbudLook>) {
  const scripts: Record<string, Script> = {};
  for (const hint of HINTS) {
    scripts[`bud.${hint.id}`] = async (api) => {
      const first = foundHints(api.state).length === 0;
      const bud = buds.get(`bud.${hint.id}`);
      api.state.set(hintFlag(hint.id));
      if (bud) api.particles.burst(bud.center.setY(bud.center.y + 1), 0xffe8a8, 10, 2, 0.6, false);
      bud?.take();
      api.sfx.select();
      await api.say([{ who: hint.title, text: hint.text }]);
      if (first) api.toast('Notes are kept in the pause menu ([pause]).');
    };
  }
  return {
    scripts,
    restore(state: GameState) {
      for (const hint of HINTS) {
        if (!state.has(hintFlag(hint.id))) continue;
        const bud = buds.get(`bud.${hint.id}`);
        bud?.take();
        bud?.open(true);
      }
    },
  };
}

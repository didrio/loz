import type { Script } from '../game/script';
import type { Flag, GameState } from '../game/state';
import type { MurmurbudLook } from '../world/murmurbud';

/**
 * The keepers' notes, sealed in Murmurbuds around the valley (docs/world.md "Murmurbuds"). The
 * keepers wrote them for whoever came after: old-fashioned, fond, a little bossy. Each note is
 * one idea the player can act on. The pause menu lists the found ones in this order.
 */
export const HINTS = [
  {
    id: 'tunic',
    title: 'On stone and cloth',
    text: 'Stone beasts hit like the hills they were cut from. At Thistledown\'s well they sell a cloth woven with stone, the *Stoneward*: stone strikes you half as hard through it. Buy it before you go north, and do not haggle. You will lose.',
  },
  {
    id: 'flasks',
    title: 'On empty flasks',
    text: 'A flask is never empty for good, only waiting. The peddler at Thistledown\'s well will fill a drained one for a few gems: red to mend you, amber for a keener edge. Choose before you need it, not after.',
  },
  {
    id: 'bells',
    title: 'On bells and posts',
    text: 'Every bell we cast knows its post: the post\'s arm bears the bell\'s name. Hang each where it belongs and ring it, and the others will answer. A keeper who listens can follow the answer home.',
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
      if (first) api.toast('Notes you find are kept in the pause menu ([pause]).');
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

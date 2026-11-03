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
    text: 'Stone beasts hit like the hills they were cut from, and the Waking Shrine is full of them. At Thistledown\'s well the peddler Odo sells the *Stoneward*, a cloth woven with stone: through it, stone creatures hit you half as hard. It costs 50 gems. Buy it before you go to the shrine, and do not haggle. You will lose.',
  },
  {
    id: 'flasks',
    title: 'Refilling your flasks',
    text: 'A flask is never empty for good, only waiting. Drinking one empties it, but Odo, at Thistledown\'s well, will fill it again for 20 gems: the red flask mends your hearts, the amber one sharpens your sword for a while. Refill before you set out, not after.',
  },
  {
    id: 'bells',
    title: 'Bells, posts and travel',
    text: 'Our bells were hidden at the ends of hard climbs. Carry one to the post that bears its name (the name is carved on the post\'s arm), hang it, and ring it. Hang a second one and they will answer each other: ring either, and you may travel to any other bell you have hung. Bells guide you; they never heal. Only a bed does.',
  },
  {
    id: 'boss',
    title: 'Fighting the stone giant',
    text: 'The giant in the shrine\'s depths slams the floor and sends a ring of shock across it: jump over the ring. After a slam his fists stick in the stone for a moment, and one plate on his chest glows loose. Pull the glowing plate off him. Pull all three plates and his chest lies open to your sword.',
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

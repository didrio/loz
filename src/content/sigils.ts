import type { Script } from '../game/script';
import type { Flag, GameState } from '../game/state';
import type { SigilLook } from '../world/sigil';
import { S } from './text/sigils';

/**
 * The sigils: messages written in the air by the one who waits in the shrine (docs/world.md "Story").
 * The first hangs in the Gloaming Hollow once the Lamplighter falls; three more in the shrine's fight
 * rooms once they're cleared; the last in the Keepers' Seal room, beside the stone that breaks his ward (the dungeon data's `sigil` things; ids match). Told in his own words,
 * and never his name. The pause menu's Messages page lists the ones Wren has read, in this order. `text` is its boxes, one per page.
 */
export const SIGILS = [
  { id: 'sigil.hollow', ...S.hollow },
  { id: 'sigil.cell', ...S.cell },
  { id: 'sigil.crypt', ...S.crypt },
  { id: 'sigil.gauntlet', ...S.gauntlet },
  { id: 'sigil.seal', ...S.seal },
] as const;

export type SigilId = (typeof SIGILS)[number]['id'];

/** The flag is the sigil's own id (`sigil.<name>`). */
export const sigilFlag = (id: SigilId): Flag => id;

/** The sigils read so far, in the registry's order. */
export function foundSigils(state: GameState) {
  return SIGILS.filter((s) => state.has(sigilFlag(s.id)));
}

/** Reading a sigil: its words hang in the air, and the first one explains where they're kept. */
export function readSigil(id: string): Script {
  const sigil = SIGILS.find((s) => s.id === id);
  if (!sigil) throw new Error(`No sigil "${id}"`);
  const flag = sigilFlag(sigil.id);
  return async (api) => {
    const first = foundSigils(api.state).length === 0;
    api.state.set(flag);
    api.sfx.select();
    await api.say(sigil.text.map((t) => ({ who: '', text: `[old]${t}[/]` })));
    if (first) api.toast(S.messagesKept);
  };
}

/** Scripts for the overworld's sigils (the dungeon's are bound by the shrine's content). */
export function sigilContent(looks: ReadonlyMap<string, SigilLook>) {
  const scripts: Record<string, Script> = {};
  for (const id of looks.keys()) scripts[id] = readSigil(id);
  return scripts;
}

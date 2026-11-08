import { BELLS } from '../content/bells';
import { G } from '../content/text/gear';
import { POTIONS } from './flasks';
import type { MenuRow } from './menu';
import type { GameState } from './state';

const strip = (s: string) => s.replace(/\[\/?\w*\]/g, '');

/** What the Gear tab lists (pause menu): the gear Wren has now. `icon` maps a registry id to a picture. Read-only. */
export function gearRows(state: GameState, icon: (id: string) => string): MenuRow[] {
  const rows: MenuRow[] = [];
  const add = (id: string, t: { name: string; text: string }) =>
    rows.push({ kind: 'entry', label: t.name, detail: strip(t.text), icon: icon(id) });

  if (state.has('hasSword')) add('gear-sword', G.sword);
  if (state.has('hasShield')) add('gear-shield', G.shield);
  if (state.has('village.stonewardTunic')) add('gear-tunic', G.tunic);
  if (state.items.has('tether')) add('gear-glove', G.glove);
  for (const p of state.flasks.slots) add(p ? `gear-flask-${p}` : 'gear-flask', G.flask(p ? POTIONS[p].name : null));
  for (const id of state.bells.carried) add('gear-bell', G.bell.carried(BELLS[id].name));
  for (const id of state.bells.hung) add('gear-bell', G.bell.hung(BELLS[id].name, BELLS[id].site));
  if (state.keysHere > 0) add('gear-key', { name: G.keys.name(state.keysHere), text: G.keys.text });
  for (const c of state.dungeonKeysHere) add(`gear-key-${c}`, G.colorKey(c));
  if (state.dungeons.get(state.area)?.bossKey) add('gear-key', G.bossKey);
  if (state.has('village.dollFound') && !state.has('village.dollReturned')) add('gear-doll', G.doll);
  return rows;
}

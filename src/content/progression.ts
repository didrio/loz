import { REFILL_PRICE } from '../game/flasks';
import { BLUEGEM_GEMS } from '../game/pickups';
import type { Flag } from '../game/state';
import type { BellId } from '../world/bell';
import type { DungeonDef } from '../world/dungeon';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { RUINS } from '../world/overworld/layout';
import { DOLL_REWARD, TUNIC_PRICE } from './shop';

/**
 * The world progression solver (docs/dungeons.md, "World progression"): every gate between a new game and the
 * end of what's built, as data, and a walk that proves a new save can get through them all.
 *
 * A **gate** is one thing Wren does that needs something and gives something: talk to Maren, open a chest, beat
 * a boss, buy a ware. It needs *facts* (a quest flag, an item, a hung bell, a beaten dungeon) and may spend keys
 * or gems; it gives facts and may add keys or gems. A dungeon is one gate (its own solver, `solveDungeon`,
 * covers its inside). `walk` fires whatever can fire until nothing can, required gates before optional ones.
 *
 * Deliberately not modelled: the time of day (the Lamplighter walks at night, and the clock always comes
 * round), fights and platforming (the player can always win them; courses have their own checks), gems that
 * enemies and bushes drop (random, so never counted on), and a bell lifted off its post (facts only grow).
 * To add a region: add its gates below (or build them from its data, as the jars and the shrine are), move
 * `GOAL` to its new end, and let `progression.test.ts` say what's unreachable.
 */

/** Something that holds once a gate has fired. A plain flag name, or `kind:id` for what isn't a flag. */
export type Fact = Flag | `item:${string}` | `bell:${BellId}:${'carried' | 'hung'}` | `dungeon:${string}:done` | `area:${string}`;

export interface Gate {
  id: string;
  /** Where or who, for failure messages. */
  at: string;
  needs?: Fact[];
  /** Taken from the keys or gems Wren holds when it fires (a one-time cost: it can't fire without them). */
  spends?: { keys?: number; gems?: number };
  gives?: Fact[];
  /** Added to the keys or gems Wren holds when it fires. */
  gains?: { keys?: number; gems?: number };
  /** Nothing on the way to `GOAL` waits on it (a purchase, a side errand, a bell). */
  optional?: boolean;
}

/** The end of what's built: the Waybell hangs on its post at Wayfarers' Camp. */
export const GOAL: Fact[] = ['bell:way:hung'];

/**
 * A dungeon as one gate. What Wren finds inside comes from its data: the gems in its chests, its items, its
 * flasks and its bells (hung, as the dungeon's trial is part of it). `needs` is the way in, `gives` what the
 * boss's fall gives beyond that.
 */
export function dungeonGate(def: DungeonDef, at: string, needs: Fact[], gives: Fact[]): Gate {
  const chests = def.things.flatMap((t) => (t.kind === 'chest' ? [t.loot] : []));
  const items = chests.flatMap((l) => (typeof l === 'object' && 'item' in l ? [l.item] : []));
  const gems = chests.reduce((n, l) => n + (typeof l === 'object' && 'gems' in l ? l.gems : 0), 0);
  const flasks = chests.some((l) => typeof l === 'object' && 'flask' in l);
  const bells = def.things.flatMap((t) => (t.kind === 'bell' ? [t.bell] : []));
  return {
    id: `dungeon.${def.id}`, at, needs,
    gives: [`dungeon:${def.id}:done`, ...items.map((i): Fact => `item:${i}`), ...(flasks ? ['item:flask' as const] : []), ...bells.map((b): Fact => `bell:${b}:hung`), ...gives],
    gains: { gems },
  };
}

/** Pip's doll, the tunic, and Odo's refills are the gem economy so far; every jar that holds a blue gem is a gate too. */
function jarGates(): Gate[] {
  return RUINS.flatMap((r) => r.jars.flatMap((drop, i): Gate[] => (drop === 'bluegem'
    ? [{ id: `jar.${r.id}.${i}`, at: `a jar at ${r.id}`, needs: ['hasSword'], gives: [`jar.${r.id}.${i}`], gains: { gems: BLUEGEM_GEMS }, optional: true }]
    : [])));
}

export const GATES: Gate[] = [
  // The opening: the shield and the scare, then Maren's key to Bram's chest.
  { id: 'shield', at: 'the ruined cottage north of the fence', gives: ['hasShield', 'village.scare'] },
  { id: 'marenKey', at: 'Maren, by the well', needs: ['village.scare'], gives: ['metMaren', 'gotGroveKey'], gains: { keys: 1 } },
  { id: 'groveChest', at: 'the grove chest', needs: ['gotGroveKey'], spends: { keys: 1 }, gives: ['groveChestOpened', 'hasSword'] },
  // The Lamplighter wakes a lantern ember, which wakes the shrine door.
  { id: 'lamplighter', at: 'the Gloaming Hollow, at night', needs: ['hasSword'], gives: ['lamplighterDefeated'] },
  { id: 'shrineDoor', at: 'the shrine door', needs: ['lamplighterDefeated'], gives: ['shrineOpen'] },
  // The Waking Shrine: its boss, then the prism that breaks the ward on the Northpass gate.
  dungeonGate(SHRINE, 'the Waking Shrine', ['shrineOpen', 'hasSword'], ['valleyOpen']),
  // The way north: the gate, then the canyon's Cragstalkers guard the Waybell, which hangs at the camp.
  { id: 'northpassGate', at: 'the gate in the north cliffs', needs: ['valleyOpen'], gives: ['area:northpass'] },
  { id: 'waybell', at: 'the canyon beyond Wayfarers\' Camp', needs: ['area:northpass'], gives: ['bell:way:carried'] },
  { id: 'hangWaybell', at: 'the post at Wayfarers\' Camp', needs: ['bell:way:carried'], gives: ['bell:way:hung'] },

  // Optional: things nothing waits on.
  { id: 'millKey', at: 'Tobin, by the mill', needs: ['hasSword'], gives: ['village.millKey'], optional: true },
  { id: 'morrowbell', at: 'the Hushing Gorge', gives: ['bell:morrow:carried'], optional: true },
  { id: 'hangMorrowbell', at: 'the post in Thistledown', needs: ['bell:morrow:carried'], gives: ['bell:morrow:hung'], optional: true },
  { id: 'pipDoll', at: 'the doll\'s jar at Pip\'s old home', needs: ['hasSword'], gives: ['village.dollFound'], optional: true },
  { id: 'pipReward', at: 'Pip', needs: ['village.dollFound'], gives: ['village.dollReturned'], gains: { gems: DOLL_REWARD }, optional: true },
  ...jarGates(),
  { id: 'tunic', at: 'Odo\'s stall', spends: { gems: TUNIC_PRICE }, gives: ['village.stonewardTunic'], optional: true },
  // Odo fills each flask once (more refills are the same cost again, and the same gems).
  { id: 'flaskRefills', at: 'Odo\'s stall', needs: ['item:flask'], spends: { gems: REFILL_PRICE * SHRINE.things.filter((t) => t.kind === 'chest' && typeof t.loot === 'object' && 'flask' in t.loot).length }, optional: true },
];

export interface Walk {
  facts: Set<Fact>;
  /** In the order they fired. */
  fired: Gate[];
  /** What no order of play reaches. */
  stuck: Gate[];
  keys: number;
  gems: number;
  /** Every gem the gates can add, and every gem they ask for. Asking for more than there is can't be done. */
  gemsFound: number;
  gemsWanted: number;
}

/**
 * Everything Wren can do, repeatedly, until nothing changes. A gate fires once; required gates go before
 * optional ones, so a purchase never starves the way forward. That greedy order is exact while no gate that
 * adds keys or gems waits on a gate that spends them (add a smarter order here, with a test, if one does).
 */
export function walk(gates: readonly Gate[], start: Fact[] = []): Walk {
  const w: Walk = { facts: new Set(start), fired: [], stuck: [], keys: 0, gems: 0, gemsFound: 0, gemsWanted: 0 };
  const order = [...gates.filter((g) => !g.optional), ...gates.filter((g) => g.optional)];
  const can = (g: Gate) => (g.needs ?? []).every((f) => w.facts.has(f)) && (g.spends?.keys ?? 0) <= w.keys && (g.spends?.gems ?? 0) <= w.gems;
  for (let next = order.find(can); next; next = order.find((g) => !w.fired.includes(g) && can(g))) {
    w.fired.push(next);
    w.keys += (next.gains?.keys ?? 0) - (next.spends?.keys ?? 0);
    w.gems += (next.gains?.gems ?? 0) - (next.spends?.gems ?? 0);
    for (const f of next.gives ?? []) w.facts.add(f);
  }
  w.stuck = gates.filter((g) => !w.fired.includes(g));
  w.gemsFound = gates.reduce((n, g) => n + (g.gains?.gems ?? 0), 0);
  w.gemsWanted = gates.reduce((n, g) => n + (g.spends?.gems ?? 0), 0);
  return w;
}

/** Everything wrong with the gates, readable (empty = a new save gets through, with nothing stranded). */
export function progressionProblems(gates: readonly Gate[] = GATES, goal: Fact[] = GOAL): string[] {
  const out: string[] = [];
  const ids = gates.map((g) => g.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) out.push(`Two gates are called "${id}"`);
  const w = walk(gates);
  const missing = goal.filter((f) => !w.facts.has(f));
  if (missing.length) out.push(`A new save can't reach ${missing.join(', ')}`);
  for (const g of w.stuck) out.push(`"${g.id}" (${g.at}) can never fire: needs ${[...(g.needs ?? []), ...Object.entries(g.spends ?? {}).map(([k, n]) => `${n} ${k}`)].join(', ')}`);
  if (w.gemsWanted > w.gemsFound) out.push(`The gates ask for ${w.gemsWanted} gems but only ${w.gemsFound} can be found`);
  // The required gates alone must be enough: an optional gate is never the only way on.
  const bare = walk(gates.filter((g) => !g.optional));
  if (goal.some((f) => !bare.facts.has(f)) && !missing.length) out.push('Reaching the goal depends on an optional gate');
  return out;
}

/** Facts that aren't quest flags start with one of these; flag-shaped ones are checked against `FLAGS`. */
const NOT_FLAGS = /^(item|bell|dungeon|area):/;
const COUNTED = /^(jar|sigil|thorn)\./;

/**
 * Checks the gates against the code (`use` is `scan()` from scripts/flags.mjs): a flag a gate names must be in
 * `FLAGS`, one it gives must be set somewhere, one it needs must be read somewhere. Renaming a flag in the
 * code without the data, or the other way round, fails here.
 */
export function flagProblems(gates: readonly Gate[], flags: readonly string[], use: Record<string, { sets: string[]; reads: string[]; lists: string[] }>): string[] {
  const out: string[] = [];
  const known = (f: string) => NOT_FLAGS.test(f) || COUNTED.test(f) || flags.includes(f);
  for (const g of gates) {
    for (const f of [...(g.needs ?? []), ...(g.gives ?? [])]) if (!known(f)) out.push(`"${g.id}" names "${f}", which isn't in FLAGS`);
    for (const f of g.gives ?? []) if (flags.includes(f) && !use[f].sets.length && !use[f].lists.length) out.push(`"${g.id}" gives "${f}", but nothing sets it`);
    for (const f of g.needs ?? []) if (flags.includes(f) && !use[f].reads.length) out.push(`"${g.id}" needs "${f}", but nothing reads it`);
  }
  return out;
}

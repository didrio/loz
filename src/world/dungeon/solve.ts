import { type Condition, type DoorDef, type DungeonDef, type KeyColor, type Loot } from './format';

/**
 * Proves a dungeon can be finished and that nothing in it is out of reach. With colored
 * keys (one chest and one door per color, enforced by the validator) no choice Wren makes
 * can strand them: a key is never spent on the "wrong" door, so there is no softlock to
 * search for and the check is one greedy sweep.
 *
 * The model: everything Wren can do (walk through open doors, open chests, press switches,
 * use items and keys) is done repeatedly until nothing changes. What that reaches is all
 * that can ever be reached.
 *
 * Simplifications, deliberately: switches stay pressed (a plate counts as pressed once its
 * room is reached, plus its `needs` item if any: whether the stones can actually get there
 * is a per-room puzzle question, not a key/door one), enemies can always be beaten, a
 * room counts as cleared once reached, and items work anywhere. If a dungeon needs
 * something cleverer (timed switches, a key that can be lost), extend the model here
 * first, with a test.
 */

export interface Progress {
  rooms: Set<string>;
  /** Things Wren has reached: chests opened, switches pressed, enemies and signs seen. */
  things: Set<string>;
  /** Key colors whose chests have been reached. */
  keys: Set<KeyColor>;
  bossKey: boolean;
  items: Set<string>;
  switches: Set<string>;
}

export interface SolveResult {
  completable: boolean;
  /** Rooms and things that no playthrough can reach. */
  unreachable: string[];
  /** The key doors in the order a playthrough can open them (each once its key is found), or null if the goal is out of reach. */
  route: string[] | null;
}

function applyLoot(p: Progress, loot: Loot) {
  if (typeof loot === 'string') {
    if (loot === 'bossKey') p.bossKey = true;
  } else if ('key' in loot) p.keys.add(loot.key);
  else if ('item' in loot) p.items.add(loot.item);
}

function met(c: Condition | undefined, p: Progress) {
  if (!c) return true;
  if ('switch' in c) return p.switches.has(c.switch);
  if ('switches' in c) return c.switches.every((s) => p.switches.has(s));
  return p.rooms.has(c.cleared);
}

function passable(d: DoorDef, p: Progress) {
  const l = d.lock;
  if (!l) return true;
  if (l === 'boss') return p.bossKey;
  if ('key' in l) return p.keys.has(l.key);
  if ('switch' in l) return p.switches.has(l.switch);
  if ('switches' in l) return l.switches.every((s) => p.switches.has(s));
  return p.items.has(l.item);
}

/** Everything reachable, and the key doors in the order they became passable. */
export function explore(def: DungeonDef): Progress & { route: string[] } {
  const p: Progress & { route: string[] } = { rooms: new Set([def.entrance.room]), things: new Set(), keys: new Set(), bossKey: false, items: new Set(), switches: new Set(), route: [] };
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of def.doors) {
      if (!passable(d, p)) continue;
      const crossed = p.rooms.has(d.from) && !p.rooms.has(d.to)
        ? d.to
        : !d.oneWay && d.kind !== 'drop' && p.rooms.has(d.to) && !p.rooms.has(d.from) ? d.from : null;
      if (!crossed) continue;
      p.rooms.add(crossed);
      if (d.lock && typeof d.lock === 'object' && 'key' in d.lock) p.route.push(d.id);
      changed = true;
    }
    for (const t of def.things) {
      if (p.things.has(t.id) || !p.rooms.has(t.room)) continue;
      if (t.kind === 'chest') {
        if (!met(t.appears, p)) continue;
        applyLoot(p, t.loot);
      } else if (t.kind === 'switch') {
        if (t.needs && !p.items.has(t.needs)) continue;
        p.switches.add(t.id);
      }
      p.things.add(t.id);
      changed = true;
    }
  }
  return p;
}

export function solveDungeon(def: DungeonDef): SolveResult {
  const p = explore(def);
  const completable = p.rooms.has(def.goal);
  const unreachable = [
    ...def.rooms.filter((r) => !p.rooms.has(r.id)).map((r) => r.id),
    ...def.things.filter((t) => !p.things.has(t.id)).map((t) => t.id),
  ];
  return { completable, unreachable, route: completable ? p.route : null };
}

/** The solver's findings as readable problems (empty = the dungeon is sound). */
export function logicProblems(def: DungeonDef, r: SolveResult = solveDungeon(def)): string[] {
  const out: string[] = [];
  if (!r.completable) out.push(`The goal room "${def.goal}" can't be reached in any order`);
  if (r.unreachable.length) out.push(`Never reachable: ${r.unreachable.join(', ')}`);
  return out;
}

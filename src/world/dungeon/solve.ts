import { type Condition, type DoorDef, type DungeonDef, type Loot } from './format';

/**
 * Proves a dungeon can be finished, and that it can't be *softlocked*: there's no order of
 * spending small keys that leaves Wren stuck with the boss unreachable. This is the
 * classic way hand-made dungeons break (two locked doors, one key, and one of the doors
 * leads to a dead end), and it's easy to miss by playing once. Here it's checked
 * exhaustively, every time the tests run.
 *
 * The model: everything Wren can do for free (walk through open doors, open chests, press
 * switches, use items and the boss key) is done greedily until nothing changes. The only
 * real choice is which locked door to spend a small key on, so the solver tries every
 * order of those choices (memoized by the set of opened doors, so it's 2^n at worst for n
 * small-key doors; dungeons have a handful).
 *
 * Simplifications, deliberately: switches stay pressed (a plate counts as pressed once its
 * room is reached, plus its `needs` item if any: whether the stones can actually get there
 * is a per-room puzzle question, not a key/door one), enemies can always be beaten, a
 * fight room counts as cleared once reached, and items work anywhere. If a dungeon needs
 * something cleverer (timed switches, a key that can be lost), extend the model here
 * first, with a test.
 */

export interface Progress {
  rooms: Set<string>;
  /** Things Wren has reached: chests opened, switches pressed, enemies and signs seen. */
  things: Set<string>;
  smallKeysFound: number;
  bossKey: boolean;
  items: Set<string>;
  switches: Set<string>;
}

export interface SolveResult {
  completable: boolean;
  /**
   * Ways to get stuck: each is an order of small-key doors that, once opened, leaves the
   * goal unreachable (with no keys or useful doors left). Empty means softlock-free.
   */
  softlocks: string[][];
  /** Rooms and things that no playthrough can reach. */
  unreachable: string[];
  /** One order of small-key doors that finishes the dungeon, or null. */
  route: string[] | null;
  /** How many distinct situations were checked. */
  states: number;
}

/** A dungeon this big would make the exhaustive search slow; split it or extend the solver. */
const MAX_SMALL_KEY_DOORS = 16;

function applyLoot(p: Progress, loot: Loot) {
  if (loot === 'smallKey') p.smallKeysFound++;
  else if (loot === 'bossKey') p.bossKey = true;
  else if (typeof loot === 'object' && 'item' in loot) p.items.add(loot.item);
}

function met(c: Condition | undefined, p: Progress) {
  if (!c) return true;
  if ('switch' in c) return p.switches.has(c.switch);
  if ('switches' in c) return c.switches.every((s) => p.switches.has(s));
  return p.rooms.has(c.cleared);
}

function passable(d: DoorDef, p: Progress, opened: ReadonlySet<string>) {
  const l = d.lock;
  if (!l) return true;
  if (l === 'small') return opened.has(d.id);
  if (l === 'boss') return p.bossKey;
  if ('switch' in l) return p.switches.has(l.switch);
  if ('switches' in l) return l.switches.every((s) => p.switches.has(s));
  return p.items.has(l.item);
}

/** Everything reachable for free, given which small-key doors have been opened. */
export function explore(def: DungeonDef, opened: ReadonlySet<string> = new Set()): Progress {
  const p: Progress = { rooms: new Set([def.entrance.room]), things: new Set(), smallKeysFound: 0, bossKey: false, items: new Set(), switches: new Set() };
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of def.doors) {
      if (!passable(d, p, opened)) continue;
      if (p.rooms.has(d.from) && !p.rooms.has(d.to)) {
        p.rooms.add(d.to);
        changed = true;
      } else if (!d.oneWay && d.kind !== 'drop' && p.rooms.has(d.to) && !p.rooms.has(d.from)) {
        p.rooms.add(d.from);
        changed = true;
      }
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
  const keyDoors = def.doors.filter((d) => d.lock === 'small');
  if (keyDoors.length > MAX_SMALL_KEY_DOORS) throw new Error(`${def.id}: ${keyDoors.length} small-key doors is more than the solver checks (${MAX_SMALL_KEY_DOORS})`);
  const memo = new Map<string, boolean>();
  const reachedRooms = new Set<string>();
  const reachedThings = new Set<string>();
  const softlocks: string[][] = [];
  let route: string[] | null = null;

  const canWin = (opened: string[], path: string[]): boolean => {
    const key = [...opened].sort().join('|');
    const known = memo.get(key);
    if (known !== undefined) return known;
    const p = explore(def, new Set(opened));
    for (const r of p.rooms) reachedRooms.add(r);
    for (const t of p.things) reachedThings.add(t);
    let win = false;
    if (p.rooms.has(def.goal)) {
      win = true;
      route ??= path;
    } else {
      const held = p.smallKeysFound - opened.length;
      const options = held > 0
        ? keyDoors.filter((d) => !opened.includes(d.id) && (p.rooms.has(d.from) || (!d.oneWay && d.kind !== 'drop' && p.rooms.has(d.to))))
        : [];
      // Explore every option (no short-circuit): softlocks hide in the branches not taken.
      for (const d of options) if (canWin([...opened, d.id], [...path, d.id])) win = true;
      if (!options.length) softlocks.push(path);
    }
    memo.set(key, win);
    return win;
  };

  const completable = canWin([], []);
  const unreachable = [
    ...def.rooms.filter((r) => !reachedRooms.has(r.id)).map((r) => r.id),
    ...def.things.filter((t) => !reachedThings.has(t.id)).map((t) => t.id),
  ];
  return { completable, softlocks, unreachable, route, states: memo.size };
}

/** The solver's findings as readable problems (empty = the dungeon is sound). */
export function logicProblems(def: DungeonDef, r: SolveResult = solveDungeon(def)): string[] {
  const out: string[] = [];
  if (!r.completable) out.push(`The goal room "${def.goal}" can't be reached in any order`);
  else {
    for (const s of r.softlocks.slice(0, 5)) {
      out.push(s.length
        ? `Softlock: spending small keys on ${s.map((id) => `"${id}"`).join(' then ')} leaves the goal unreachable`
        : 'Softlock: stuck right from the start');
    }
  }
  if (r.unreachable.length) out.push(`Never reachable: ${r.unreachable.join(', ')}`);
  return out;
}


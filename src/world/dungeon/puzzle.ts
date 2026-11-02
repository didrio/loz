import type { DungeonDef, RoomDef } from './format';
import { cellAt, cellKey, roomGrid, type Cell, type RoomGrid } from './grid';

/**
 * Proves a room's wakestone puzzles can be solved, by trying every sequence of moves (a
 * breadth-first search over stone arrangements, like solving a sliding-block puzzle):
 *
 * - a **push** (sword): Wren stands in the cell behind a light stone and it slides one cell
 *   away, unless something solid or another stone is in the way; pushed into a pit, it
 *   falls in and fills it (that cell becomes floor);
 * - a **bounce** (sword): a light stone struck against something solid (a wall, a pillar,
 *   another stone, a chest) pops one cell back toward Wren, who's knocked back a cell to
 *   make room, if that cell behind Wren is open floor;
 * - a **pull** (the Tether Glove, only where allowed): Wren stands anywhere in line with a
 *   stone, up to `PULL_RANGE` cells away with nothing between, and it slides one cell toward
 *   Wren (heavy stones too).
 *
 * Wren can walk anywhere connected to the room's entries (doorways, the entrance, landings)
 * through floor not blocked by stones or open pits. Goals: every floor plate can get a stone
 * on it, every stone that starts in front of a doorway can be moved out of the way, and
 * every chest (that's there from the start) can be walked up to. Chests block stones.
 * (Stones reset when Wren leaves the room, so a puzzle can't be ruined for good: this only
 * needs to prove it *can* be solved.)
 */

export const PULL_RANGE = 5;
/** Search budget per room; a room that needs more is too big a puzzle (or a bug). */
const MAX_STATES = 60000;

interface Stone {
  id: string;
  cell: Cell;
  heavy: boolean;
}

interface State {
  stones: { cell: Cell; heavy: boolean; id: string }[];
  filled: Set<string>;
}

const STEPS: Cell[] = [{ i: 1, j: 0 }, { i: -1, j: 0 }, { i: 0, j: 1 }, { i: 0, j: -1 }];

function encode(s: State) {
  return `${s.stones.map((x) => cellKey(x.cell)).sort().join(';')}|${[...s.filled].sort().join(';')}`;
}

/** Cells Wren can walk to in this arrangement (`solid`: chests and such, in the way). */
function walkable(g: RoomGrid, s: State, solid: Set<string>) {
  const stoneAt = new Set(s.stones.map((x) => cellKey(x.cell)));
  const free = (c: Cell) => c.i >= 0 && c.j >= 0 && c.i < g.cols && c.j < g.rows && !g.blocked[c.i][c.j] && (!g.pit[c.i][c.j] || s.filled.has(cellKey(c))) && !stoneAt.has(cellKey(c)) && !solid.has(cellKey(c));
  const seen = new Set<string>();
  const queue = g.entries.filter(free);
  for (const c of queue) seen.add(cellKey(c));
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of STEPS) {
      const n = { i: c.i + d.i, j: c.j + d.j };
      if (!free(n) || seen.has(cellKey(n))) continue;
      seen.add(cellKey(n));
      queue.push(n);
    }
  }
  return seen;
}

/** Moves a stone one cell to `to` (falling into an open pit), returning the new state or null. */
function slide(g: RoomGrid, s: State, index: number, to: Cell, solid: Set<string>): State | null {
  if (to.i < 0 || to.j < 0 || to.i >= g.cols || to.j >= g.rows || g.blocked[to.i][to.j] || solid.has(cellKey(to))) return null;
  if (s.stones.some((x) => x.cell.i === to.i && x.cell.j === to.j)) return null;
  const stones = s.stones.slice();
  const filled = new Set(s.filled);
  if (g.pit[to.i][to.j] && !filled.has(cellKey(to))) {
    stones.splice(index, 1);
    filled.add(cellKey(to));
  } else stones[index] = { ...stones[index], cell: to };
  return { stones, filled };
}

function neighbors(g: RoomGrid, s: State, canPull: boolean, solid: Set<string>): State[] {
  const reach = walkable(g, s, solid);
  const out: State[] = [];
  s.stones.forEach((st, k) => {
    for (const d of STEPS) {
      // Push: Wren behind the stone, the stone slides away; if it can't, it may bounce back.
      if (!st.heavy && reach.has(cellKey({ i: st.cell.i - d.i, j: st.cell.j - d.j }))) {
        const n = slide(g, s, k, { i: st.cell.i + d.i, j: st.cell.j + d.j }, solid);
        if (n) out.push(n);
        else {
          const behind = { i: st.cell.i - 2 * d.i, j: st.cell.j - 2 * d.j };
          const open = behind.i >= 0 && behind.j >= 0 && behind.i < g.cols && behind.j < g.rows && !g.blocked[behind.i][behind.j]
            && (!g.pit[behind.i][behind.j] || s.filled.has(cellKey(behind))) && !solid.has(cellKey(behind))
            && !s.stones.some((x) => x.cell.i === behind.i && x.cell.j === behind.j);
          if (open) {
            const stones = s.stones.slice();
            stones[k] = { ...st, cell: { i: st.cell.i - d.i, j: st.cell.j - d.j } };
            out.push({ stones, filled: s.filled });
          }
        }
      }
      if (!canPull) continue;
      // Pull: Wren somewhere along this side in a clear line; the stone comes one cell closer.
      for (let r = 2; r <= PULL_RANGE; r++) {
        const w = { i: st.cell.i + d.i * r, j: st.cell.j + d.j * r };
        const between = Array.from({ length: r - 1 }, (_, t) => ({ i: st.cell.i + d.i * (t + 1), j: st.cell.j + d.j * (t + 1) }));
        if (between.some((c) => c.i < 0 || c.j < 0 || c.i >= g.cols || c.j >= g.rows || g.blocked[c.i][c.j] || s.stones.some((x) => x.cell.i === c.i && x.cell.j === c.j))) break;
        if (!reach.has(cellKey(w))) continue;
        const n = slide(g, s, k, { i: st.cell.i + d.i, j: st.cell.j + d.j }, solid);
        if (n) out.push(n);
        break;
      }
    }
  });
  return out;
}

export interface PuzzleReport {
  /** Plate id → whether some sequence of moves puts a stone on it. */
  plates: Map<string, boolean>;
  /** Stones starting in front of a doorway → whether they can be moved away. */
  doorways: Map<string, boolean>;
  /** Chests → whether Wren can get next to them. */
  chests: Map<string, boolean>;
  /** Whether all of the room's hold plates can be held down at once (true if it has none). */
  held: boolean;
  states: number;
}

/** Searches one room. `canPull`: the Tether Glove is available here. */
export function solveRoomPuzzle(def: DungeonDef, room: RoomDef, canPull: boolean): PuzzleReport {
  const g = roomGrid(def, room);
  const stones: Stone[] = [];
  const plates: { id: string; cell: Cell; hold: boolean }[] = [];
  const chests: { id: string; cell: Cell }[] = [];
  for (const t of def.things) {
    if (t.room === room.id && t.kind === 'chest' && !t.appears) {
      const c = cellAt(room, room.x + t.at[0], room.z + t.at[1]);
      if (c) chests.push({ id: t.id, cell: c });
    }
    if (t.room !== room.id || (t.kind !== 'stone' && !(t.kind === 'switch' && t.style === 'plate'))) continue;
    const cell = cellAt(room, room.x + t.at[0], room.z + t.at[1]);
    if (!cell) continue;
    if (t.kind === 'stone') stones.push({ id: t.id, cell, heavy: !!t.heavy });
    else if (t.kind === 'switch') plates.push({ id: t.id, cell, hold: !!t.hold });
  }
  const entryKeys = new Set(g.entries.map(cellKey));
  const blockers = stones.filter((s) => entryKeys.has(cellKey(s.cell)));
  const solid = new Set(chests.map((c) => cellKey(c.cell)));
  const report: PuzzleReport = {
    plates: new Map(plates.map((p) => [p.id, false])),
    doorways: new Map(blockers.map((b) => [b.id, false])),
    chests: new Map(chests.map((c) => [c.id, false])),
    held: !plates.some((p) => p.hold),
    states: 0,
  };
  const holds = plates.filter((p) => p.hold);
  if (!plates.length && !blockers.length && !chests.length) return report;

  const start: State = { stones: stones.map((s) => ({ ...s })), filled: new Set() };
  const seen = new Set([encode(start)]);
  const queue = [start];
  while (queue.length && seen.size < MAX_STATES) {
    const s = queue.shift()!;
    const on = (c: Cell) => s.stones.some((x) => x.cell.i === c.i && x.cell.j === c.j);
    for (const p of plates) if (on(p.cell)) report.plates.set(p.id, true);
    if (holds.length && holds.every((p) => on(p.cell))) report.held = true;
    for (const b of blockers) {
      const now = s.stones.find((x) => x.id === b.id);
      if (!now || cellKey(now.cell) !== cellKey(b.cell)) report.doorways.set(b.id, true);
    }
    if (chests.length) {
      const reach = walkable(g, s, solid);
      for (const c of chests) {
        if (STEPS.some((d) => reach.has(cellKey({ i: c.cell.i + d.i, j: c.cell.j + d.j })))) report.chests.set(c.id, true);
      }
    }
    if ([...report.plates.values(), ...report.doorways.values(), ...report.chests.values(), report.held].every(Boolean)) break;
    for (const n of neighbors(g, s, canPull, solid)) {
      const k = encode(n);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  report.states = seen.size;
  return report;
}

/**
 * Every room's puzzles, as readable problems (empty = all solvable). The glove counts as
 * available in a room only if a plate there `needs` it or a heavy stone is involved: the
 * shrine's first puzzles must be solvable with the sword alone, before the glove.
 */
export function puzzleProblems(def: DungeonDef): string[] {
  const out: string[] = [];
  for (const room of def.rooms) {
    const things = def.things.filter((t) => t.room === room.id);
    const hasPit = (room.features ?? []).some((f) => f.kind === 'pit');
    if (!things.some((t) => t.kind === 'stone') && !hasPit) continue;
    const canPull = things.some((t) => (t.kind === 'switch' && t.needs === 'tether') || (t.kind === 'stone' && t.heavy));
    const r = solveRoomPuzzle(def, room, canPull);
    for (const [id, ok] of r.plates) if (!ok) out.push(`Room "${room.id}": no stone can be moved onto plate "${id}"${canPull ? '' : ' (with the sword alone)'}`);
    for (const [id, ok] of r.doorways) if (!ok) out.push(`Room "${room.id}": stone "${id}" blocks a doorway and can't be moved out of the way`);
    for (const [id, ok] of r.chests) if (!ok) out.push(`Room "${room.id}": chest "${id}" can't be reached${canPull ? '' : ' (with the sword alone)'}`);
    if (!r.held) out.push(`Room "${room.id}": its hold plates can't all be held down at the same time`);
    out.push(...uselessStones(def, room));
  }
  return out;
}

/** What a room's goals look like with and without the glove: a fingerprint of its puzzle. */
function fingerprint(def: DungeonDef, room: RoomDef) {
  const parts: string[] = [];
  for (const pull of [false, true]) {
    const r = solveRoomPuzzle(def, room, pull);
    for (const [id, ok] of [...r.plates, ...r.chests]) parts.push(`${pull}:${id}:${ok}`);
    parts.push(`${pull}:held:${r.held}`);
  }
  return parts.join('|');
}

/**
 * Every stone must matter: take it away, and something about the room's puzzle must change
 * (a plate or chest can no longer be reached, or stops needing the glove). Stones blocking a
 * doorway are a lesson in themselves; `role: 'bridge'` stones serve the glove's bridge.
 */
export function uselessStones(def: DungeonDef, room: RoomDef): string[] {
  const g = roomGrid(def, room);
  const entryKeys = new Set(g.entries.map(cellKey));
  const before = fingerprint(def, room);
  const out: string[] = [];
  for (const t of def.things) {
    if (t.kind !== 'stone' || t.room !== room.id || t.role === 'bridge') continue;
    const c = cellAt(room, room.x + t.at[0], room.z + t.at[1]);
    if (c && entryKeys.has(cellKey(c))) continue;
    const without: DungeonDef = { ...def, things: def.things.filter((x) => x !== t) };
    if (fingerprint(without, room) === before) out.push(`Room "${room.id}": stone "${t.id}" serves no purpose (the room works the same without it)`);
  }
  return out;
}

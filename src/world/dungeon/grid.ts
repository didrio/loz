import {
  DEFAULT_DOOR_WIDTH, DIRS, doorPlacement, dropHole, landmarkRect, roomOpenings, STAIR_LANDING, STAIR_RUN, stairPlacement, worldPos,
  type DungeonDef, type Rect, type RoomDef,
} from './format';

/**
 * A room as a grid of 2 m cells: the board wakestone puzzles are played on. Cell (i, j) is
 * column i from the west wall and row j from the north wall; its center is at the room's
 * corner + (2i + 1, 2j + 1), which is why stones and plates sit at odd coordinates. Shared by
 * the game (moving stones) and the puzzle checker (proving puzzles can be solved).
 */

export const CELL = 2;

export interface Cell {
  i: number;
  j: number;
}

export interface RoomGrid {
  room: RoomDef;
  cols: number;
  rows: number;
  /** Solid for stones and Wren: pillars, blocks, stairs, stair shafts, drop holes. */
  blocked: boolean[][];
  /** Open pit: a stone pushed in fills it; Wren falls in. */
  pit: boolean[][];
  /** Cells Wren can arrive in: inside each doorway, the entrance, stair and drop landings. */
  entries: Cell[];
}

export const cellKey = (c: Cell) => `${c.i},${c.j}`;

export function cellCenter(room: RoomDef, c: Cell): [number, number] {
  return [room.x + c.i * CELL + CELL / 2, room.z + c.j * CELL + CELL / 2];
}

/** The cell containing a world point, or null if it's outside the room. */
export function cellAt(room: RoomDef, x: number, z: number): Cell | null {
  const i = Math.floor((x - room.x) / CELL), j = Math.floor((z - room.z) / CELL);
  return i >= 0 && j >= 0 && i < room.w / CELL && j < room.d / CELL ? { i, j } : null;
}

const cellRect = (room: RoomDef, c: Cell): Rect => ({ x: room.x + c.i * CELL, z: room.z + c.j * CELL, w: CELL, d: CELL });
/** Overlap with a little tolerance, so things that merely touch a cell's edge don't count. */
const touches = (a: Rect, b: Rect, eps = 0.05) => a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.z < b.z + b.d - eps && b.z < a.z + a.d - eps;

export function roomGrid(def: DungeonDef, room: RoomDef): RoomGrid {
  const cols = Math.floor(room.w / CELL), rows = Math.floor(room.d / CELL);
  const make = () => Array.from({ length: cols }, () => Array<boolean>(rows).fill(false));
  const blocked = make(), pit = make();
  const solids: Rect[] = [];
  for (const f of room.features ?? []) {
    if (f.kind === 'pillar') {
      const r = f.r ?? 0.7;
      solids.push({ x: room.x + f.x - r, z: room.z + f.z - r, w: r * 2, d: r * 2 });
    } else if (f.kind === 'block') solids.push({ x: room.x + f.x, z: room.z + f.z, w: f.w, d: f.d });
  }
  for (const t of def.things) if (t.kind === 'landmark' && t.room === room.id) solids.push(landmarkRect(room, t.at));
  const { holes, stairs } = roomOpenings(def, room);
  for (const h of holes) if (h.kind !== 'pit') solids.push(h.rect);
  for (const s of stairs) solids.push(s.rect);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const r = cellRect(room, { i, j });
      blocked[i][j] = solids.some((s) => touches(s, r));
      const [cx, cz] = cellCenter(room, { i, j });
      pit[i][j] = !blocked[i][j] && holes.some((h) => h.kind === 'pit' && cx > h.rect.x && cx < h.rect.x + h.rect.w && cz > h.rect.z && cz < h.rect.z + h.rect.d);
    }
  }

  const entries: Cell[] = [];
  const add = (x: number, z: number) => {
    const c = cellAt(room, x, z);
    if (c && !blocked[c.i][c.j] && !entries.some((e) => e.i === c.i && e.j === c.j)) entries.push(c);
  };
  const rooms = new Map(def.rooms.map((r) => [r.id, r]));
  for (const d of def.doors) {
    const a = rooms.get(d.from), b = rooms.get(d.to);
    if (!a || !b || (a !== room && b !== room)) continue;
    if (!d.kind || d.kind === 'door') {
      const p = doorPlacement(a, b, d);
      if (!p) continue;
      // The cells just inside the doorway, across its whole width.
      const half = (d.width ?? DEFAULT_DOOR_WIDTH) / 2 - 0.1;
      const inX = p.wall === 'z' ? (p.x === room.x ? room.x + 0.5 : room.x + room.w - 0.5) : 0;
      const inZ = p.wall === 'x' ? (p.z === room.z ? room.z + 0.5 : room.z + room.d - 0.5) : 0;
      for (const t of [-half, 0, half]) {
        if (p.wall === 'z') add(inX, p.z + t);
        else add(p.x + t, inZ);
      }
    } else if (d.kind === 'stairs') {
      const s = stairPlacement(d, a, b);
      if (!s) continue;
      const [dx, dz] = DIRS[s.up];
      if (s.lower === room) add(s.foot[0] - dx * STAIR_LANDING * 0.5, s.foot[1] - dz * STAIR_LANDING * 0.5);
      if (s.upper === room) add(s.foot[0] + dx * (STAIR_RUN + STAIR_LANDING * 0.5), s.foot[1] + dz * (STAIR_RUN + STAIR_LANDING * 0.5));
    } else if (d.kind === 'drop' && b === room) {
      const h = dropHole(d, a, b);
      if (h) add(h.x + h.w / 2, h.z + h.d / 2);
    }
  }
  if (def.entrance.room === room.id) add(...worldPos(room, def.entrance.at));
  return { room, cols, rows, blocked, pit, entries };
}

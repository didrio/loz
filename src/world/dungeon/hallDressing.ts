import * as THREE from 'three';
import { kitMesh, merge } from '../../render/kit';
import {
  BANNER, buildBanner, buildLintelCarving, buildOfferingNiche, buildRubble, buildSandDrift, buildSpiralRelief, crackDecal, DRESSING, dressingGlow,
  FOOT_BAND, STONE_TOP, sunkenFlagDecal, WALL_PIECE_LOW, LINTEL, type DressingGlow,
} from '../../render/models/shrineDressing';
import { RoomDust } from '../../render/roomDust';
import { cellAt, CELL, cellCenter, roomGrid } from './grid';
import { worldPos, type DungeonDef, type RoomDef } from './format';

/**
 * The Hall of Sleepers' dressing (T56c, golden set 8; docs/shrine.md "The final look"): where the carved reliefs, lintels,
 * offering niches, banners, rubble, sand drifts and cracked flags go, and the code that puts them in the dungeon.
 *
 * The plan is pure (`planHallDressing`: a room, its doorways, its sconces and carved faces in; pieces out) so a test can hold
 * it to the rules: everything on a wall is above the tallest wakestone and the string course, clear of the doorways, the
 * corner pilasters, the sleeping faces and the sconces; everything on the floor stands in the wall's foot band (a stone
 * already sinks into the wall there) or lies flat on a flag no stone, door, bell post, tablet or Wren's first step uses.
 * A piece that does not fit is dropped (never moved), and the test fails if too many are.
 */

/** Which room of which dungeon is dressed. */
export const HALL = { dungeon: 'shrine', room: 'entry' } as const;

export type WallId = 'N' | 'S' | 'E' | 'W';
export type WallKind = 'relief' | 'niche' | 'banner' | 'rubble' | 'drift' | 'lintel';

/** A piece against a wall: where along it, how wide, how far out and between which heights. */
export interface WallPiece {
  kind: WallKind;
  wall: WallId;
  /** Along the wall: x for the north and south walls, z for the east and west ones. */
  along: number;
  half: number;
  /** How far the piece stands from the wall's face. */
  out: number;
  low: number;
  high: number;
  variant: number;
  /** A drift's length, a lintel's doorway width. */
  length?: number;
}

export interface FlatDecal {
  kind: 'crack' | 'sunken';
  cell: { i: number; j: number };
  variant: number;
}

export interface HallPlan {
  walls: WallPiece[];
  decals: FlatDecal[];
  /** The planned pieces that did not fit (so a change to the room shows up). */
  dropped: WallPiece[];
}

/** How far the dressing keeps from things (metres, along the wall unless said). */
export const CLEAR = {
  /** From a wall's corner: the pilaster is 0.6 wide and stands to the ceiling. */
  corner: 0.95,
  /** From a doorway's edge: the frame's jamb is 0.42 wide. */
  door: 0.6,
  /** Between a wall piece and a sleeping face (half 0.49) or a sconce (half 0.3): air to spare. */
  face: 0.49 + 0.35,
  sconce: 0.3 + 0.55,
} as const;

const WALL_T = 0.5;
const FACE_BAND = [2.0, 3.3] as const; // the carved faces' heights
const SCONCE_BAND = [2.8, 3.8] as const;

interface PlanRow {
  wall: WallId;
  kind: Exclude<WallKind, 'lintel'>;
  along: number;
  variant?: number;
  length?: number;
}

/**
 * What the Hall is dressed with, in the order it is tried. The east wall (straight ahead from the entrance) and the
 * west one (both have a doorway and a sleeping face to plan round) carry the reliefs and niches; the north and south
 * ones, whose sleeping faces and sconces fill them, only a banner or two between. A second layer sits at the walls' feet. Each wall's pieces are named by where along it they stand.
 */
const PLAN: readonly PlanRow[] = [
  { wall: 'E', kind: 'relief', along: 2.0 },
  { wall: 'E', kind: 'niche', along: 10.2 },
  { wall: 'W', kind: 'relief', along: 2.4 },
  { wall: 'W', kind: 'niche', along: 8.7 },
  { wall: 'W', kind: 'banner', along: 10.4, variant: 1 },
  { wall: 'N', kind: 'banner', along: 5.0, variant: 2 },
  { wall: 'N', kind: 'banner', along: 9.0, variant: 1 },
  { wall: 'S', kind: 'banner', along: 9.7, variant: 0 },
  // The walls' feet: heaps of fallen blocks near the corners, sand drifted along the wall.
  { wall: 'N', kind: 'rubble', along: 2.0, variant: 0 },
  { wall: 'E', kind: 'rubble', along: 9.6, variant: 1 },
  { wall: 'W', kind: 'rubble', along: 9.9, variant: 2 },
  { wall: 'S', kind: 'rubble', along: 11.9, variant: 3 },
  { wall: 'W', kind: 'drift', along: 2.7, length: 1.8, variant: 0 },
  { wall: 'N', kind: 'drift', along: 9.4, length: 2.0, variant: 1 },
  { wall: 'E', kind: 'drift', along: 4.4, length: 1.8, variant: 2 },
  { wall: 'S', kind: 'drift', along: 2.0, length: 1.8, variant: 3 },
];

/** Flags (cells of the 2 m grid) that are cracked or sunk, in the order they are tried. */
const CRACKED: readonly [number, number][] = [[1, 1], [3, 4], [0, 3], [5, 0], [4, 2], [1, 5]];
const SUNKEN: readonly [number, number][] = [[3, 1], [1, 4], [5, 5], [4, 0]];

/** A wall's frame: its face's line, the span it runs, its doorways' key and which way it faces. */
export function wallFrame(room: RoomDef, wall: WallId) {
  const inset = WALL_T / 2;
  switch (wall) {
    case 'N': return { axis: 'x' as const, line: room.z + inset, yaw: 0, a0: room.x, a1: room.x + room.w, key: `${room.floor}:x:${room.z}` };
    case 'S': return { axis: 'x' as const, line: room.z + room.d - inset, yaw: Math.PI, a0: room.x, a1: room.x + room.w, key: `${room.floor}:x:${room.z + room.d}` };
    case 'W': return { axis: 'z' as const, line: room.x + inset, yaw: Math.PI / 2, a0: room.z, a1: room.z + room.d, key: `${room.floor}:z:${room.x}` };
    case 'E': return { axis: 'z' as const, line: room.x + room.w - inset, yaw: -Math.PI / 2, a0: room.z, a1: room.z + room.d, key: `${room.floor}:z:${room.x + room.w}` };
  }
}

/** A point on a wall's face, `along` it, `out` into the room, in world x and z. */
export function wallPoint(room: RoomDef, wall: WallId, along: number, out = 0): { x: number; z: number } {
  const f = wallFrame(room, wall), ox = Math.sin(f.yaw) * out, oz = Math.cos(f.yaw) * out;
  return f.axis === 'x' ? { x: along + ox, z: f.line + oz } : { x: f.line + ox, z: along + oz };
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Plans the Hall's dressing. `gaps`: the doorways of each wall, by `wallFrame(...).key`; `sconces`, `faces`: their world spots. */
export function planHallDressing(
  def: DungeonDef, room: RoomDef, gaps: (key: string) => readonly (readonly [number, number])[],
  sconces: readonly { x: number; z: number }[], faces: readonly { x: number; z: number }[],
): HallPlan {
  const placed: WallPiece[] = [];
  const dropped: WallPiece[] = [];
  const onWall = (spots: readonly { x: number; z: number }[], wall: WallId) => {
    const f = wallFrame(room, wall);
    return spots.filter((s) => Math.abs((f.axis === 'x' ? s.z : s.x) - f.line) < 0.8).map((s) => (f.axis === 'x' ? s.x : s.z));
  };
  const make = (row: PlanRow): WallPiece => {
    const variant = row.variant ?? 0;
    switch (row.kind) {
      case 'relief': return { kind: 'relief', wall: row.wall, along: row.along, half: DRESSING.relief.width / 2, out: 0.18, low: WALL_PIECE_LOW, high: WALL_PIECE_LOW + DRESSING.relief.size, variant };
      case 'niche': return { kind: 'niche', wall: row.wall, along: row.along, half: DRESSING.niche.width / 2, out: 0.4, low: WALL_PIECE_LOW, high: WALL_PIECE_LOW + DRESSING.niche.height, variant };
      case 'banner': return { kind: 'banner', wall: row.wall, along: row.along, half: DRESSING.banner.width / 2, out: 0.11, low: BANNER.rod - 1.35, high: BANNER.rod + 0.05, variant };
      case 'rubble': return { kind: 'rubble', wall: row.wall, along: row.along, half: 0.95, out: FOOT_BAND, low: 0, high: 0.75, variant };
      case 'drift': return { kind: 'drift', wall: row.wall, along: row.along, half: (row.length ?? 2) / 2, out: FOOT_BAND, low: 0, high: 0.22, variant, length: row.length ?? 2 };
    }
  };
  const lintels: WallPiece[] = [];
  for (const wall of ['N', 'S', 'E', 'W'] as const) {
    for (const [g0, g1] of gaps(wallFrame(room, wall).key)) {
      lintels.push({ kind: 'lintel', wall, along: (g0 + g1) / 2, half: (g1 - g0) / 2 + DRESSING.lintelOver / 2, out: 0.12, low: LINTEL.bottom, high: LINTEL.bottom + LINTEL.height, variant: 0, length: g1 - g0 });
    }
  }
  const fits = (p: WallPiece): boolean => {
    const f = wallFrame(room, p.wall);
    const doors = gaps(f.key);
    if (p.kind !== 'lintel') {
      if (p.along - p.half < f.a0 + CLEAR.corner || p.along + p.half > f.a1 - CLEAR.corner) return false;
      if (doors.some(([g0, g1]) => overlaps(p.along - p.half, p.along + p.half, g0 - CLEAR.door, g1 + CLEAR.door))) return false;
    }
    const tall = p.low >= STONE_TOP;
    if (tall && p.kind !== 'lintel') {
      if (p.high > FACE_BAND[0] && p.low < FACE_BAND[1] && onWall(faces, p.wall).some((a) => Math.abs(a - p.along) < p.half + CLEAR.face)) return false;
      if (p.high > SCONCE_BAND[0] && p.low < SCONCE_BAND[1] && onWall(sconces, p.wall).some((a) => Math.abs(a - p.along) < p.half + CLEAR.sconce)) return false;
    }
    // No two pieces of one wall share space (a floor heap and a hanging banner do not: their heights differ).
    return !placed.some((q) => q.wall === p.wall && overlaps(q.low, q.high, p.low, p.high) && overlaps(q.along - q.half, q.along + q.half, p.along - p.half, p.along + p.half));
  };
  for (const p of [...lintels, ...PLAN.map(make)]) (fits(p) ? placed : dropped).push(p);

  // Flat decals: not on a flag a stone starts on or a door opens onto, the bell post's, the tablet's, or Wren's first.
  const grid = roomGrid(def, room);
  const used = new Set<string>();
  const use = (i: number, j: number) => used.add(`${i},${j}`);
  for (const e of grid.entries) use(e.i, e.j);
  // Every doorway of the Hall, the dungeon's entrance in the west wall too: the flags just inside it.
  for (const wall of ['N', 'S', 'E', 'W'] as const) {
    for (const [g0, g1] of gaps(wallFrame(room, wall).key)) {
      for (let a = g0 + 0.1; a < g1; a += 0.9) {
        const q = wallPoint(room, wall, a, 0.8), c = cellAt(room, q.x, q.z);
        if (c) use(c.i, c.j);
      }
    }
  }
  for (let i = 0; i < grid.cols; i++) for (let j = 0; j < grid.rows; j++) if (grid.blocked[i][j] || grid.pit[i][j]) use(i, j);
  for (const t of def.things) {
    if (t.room !== room.id || (t.kind !== 'stone' && t.kind !== 'sign' && t.kind !== 'bellPost' && t.kind !== 'chest' && t.kind !== 'switch')) continue;
    const [x, z] = worldPos(room, t.at);
    const c = cellAt(room, x, z);
    if (c) use(c.i, c.j);
  }
  const decals: FlatDecal[] = [];
  CRACKED.forEach(([i, j], k) => { if (!used.has(`${i},${j}`)) decals.push({ kind: 'crack', cell: { i, j }, variant: k }); });
  SUNKEN.forEach(([i, j], k) => { if (!used.has(`${i},${j}`)) decals.push({ kind: 'sunken', cell: { i, j }, variant: k }); });
  return { walls: placed, decals, dropped };
}

/** A crack's points across its flag, from the cell and variant (always the same). */
export function crackPoints(room: RoomDef, d: FlatDecal): [number, number][] {
  const [cx, cz] = cellCenter(room, d.cell);
  const s = (n: number) => Math.sin((d.cell.i * 7 + d.cell.j * 13 + d.variant * 5 + n) * 12.9898);
  const a = s(0) * Math.PI, len = 0.7;
  const pts: [number, number][] = [];
  for (let k = 0; k < 8; k++) {
    const t = k / 7 - 0.5, wander = s(k + 1) * 0.2;
    pts.push([cx + Math.cos(a) * t * 2 * len + Math.sin(a) * wander, cz + Math.sin(a) * t * 2 * len - Math.cos(a) * wander]);
  }
  return pts;
}

/** What `HallDressing` needs of the dungeon: the groups to put things in. */
export interface DressingTargets {
  /** The floor's static scenery (merged later). */
  solid: THREE.Group;
  /** Unmerged things that animate (the glow, the dust). */
  live: THREE.Group;
}

/**
 * Builds the plan into the dungeon: the stone parts into the merged scenery, the glows (the spirals' and the candles') merged
 * by material into four meshes in `live`, the room's dust. `update(t)` breathes the glows.
 */
export class HallDressing {
  private readonly glow: DressingGlow = dressingGlow();
  private readonly dust: RoomDust;
  private readonly meshes: THREE.Object3D[] = [];

  constructor(readonly plan: HallPlan, room: RoomDef, fy: number, height: number, targets: DressingTargets) {
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of plan.walls) {
      const model = this.model(p);
      const at = wallPoint(room, p.wall, p.along);
      const holder = new THREE.Object3D();
      holder.position.set(at.x, fy, at.z);
      holder.rotation.y = wallFrame(room, p.wall).yaw;
      holder.add(model.root);
      const glow = (model.joints as { glow?: THREE.Object3D }).glow;
      if (glow) holder.add(glow);
      holder.updateMatrixWorld(true);
      if (glow) {
        glow.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const list = buckets.get(o.material as THREE.Material) ?? [];
          list.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
          buckets.set(o.material as THREE.Material, list);
        });
        holder.remove(glow);
      }
      // The stone parts keep their place in the world (the dungeon merges its static scenery from world positions).
      holder.remove(model.root);
      model.root.applyMatrix4(holder.matrixWorld);
      targets.solid.add(model.root);
    }
    for (const d of plan.decals) {
      const geo = d.kind === 'crack' ? crackDecal(crackPoints(room, d), fy) : (() => { const [cx, cz] = cellCenter(room, d.cell); return sunkenFlagDecal(cx, cz, CELL - 0.12, fy); })();
      targets.solid.add(kitMesh(geo, 'rock'));
    }
    for (const [material, list] of buckets) {
      const mesh = new THREE.Mesh(merge(...list), material);
      mesh.frustumCulled = false;
      targets.live.add(mesh);
      this.meshes.push(mesh);
    }
    this.dust = new RoomDust({ x: room.x, z: room.z, w: room.w, d: room.d, y0: fy, y1: fy + height - 1 });
    targets.live.add(this.dust.points);
  }

  private model(p: WallPiece) {
    switch (p.kind) {
      case 'relief': return buildSpiralRelief();
      case 'niche': return buildOfferingNiche();
      case 'banner': return buildBanner(p.variant);
      case 'rubble': return buildRubble(p.variant);
      case 'drift': return buildSandDrift(p.length, p.variant);
      case 'lintel': return buildLintelCarving(p.length);
    }
  }

  update(t: number) {
    this.glow.spiral.opacity = 0.42 + Math.sin(t * 1.3) * 0.1;
    const flicker = Math.sin(t * 9) * 0.5 + Math.sin(t * 23 + 1) * 0.5;
    this.glow.halo.opacity = 0.42 + flicker * 0.05;
    this.glow.wide.opacity = 0.12 + flicker * 0.015;
    this.dust.update(t);
  }

  dispose() {
    this.dust.dispose();
    for (const m of this.meshes) (m as THREE.Mesh).geometry.dispose();
  }
}

/**
 * The dungeon data format: a dungeon described as plain data (rooms, doors, things in
 * them) instead of hand-written geometry code. Everything else reads this:
 *
 * - `validate.ts` checks the structure (rooms don't overlap, doors sit on shared walls...),
 * - `solve.ts` proves the dungeon can be finished and can't softlock (no way to waste a
 *   key so the boss becomes unreachable),
 * - `map.ts` draws a text map an agent can read,
 * - later, a builder turns it into a 3D `Area`.
 *
 * Think of it like a React component tree for a level: a declarative description that a
 * renderer turns into the real thing, so it can be checked and changed without touching
 * the renderer. Units are meters on the same axes as the rest of the game (+x east,
 * −z north). Rooms are axis-aligned rectangles; positions of things inside a room are
 * relative to the room's northwest corner, so moving a room moves its contents.
 */

import type { MusicMood } from '../../core/tracks';

export type Vec2 = readonly [x: number, z: number];
export type Dir = 'n' | 's' | 'e' | 'w';

export interface DungeonDef {
  /** Also the namespace for its flags and object ids, e.g. `shrine`. */
  id: string;
  name: string;
  /** The dungeon's theme (a song in `core/tracks.ts`). */
  music?: MusicMood;
  /** Vertical distance between floors (meters). Default `DEFAULT_FLOOR_HEIGHT`. */
  floorHeight?: number;
  /** Where Wren appears when entering from outside. `at` is relative to the room. */
  entrance: { room: string; at: Vec2; facing: Dir };
  /** The room that counts as finishing the dungeon (normally the boss room). */
  goal: string;
  rooms: RoomDef[];
  doors: DoorDef[];
  things: ThingDef[];
}

export interface RoomDef {
  id: string;
  name?: string;
  /** 0 = entrance level, 1 = upstairs, -1 = basement. */
  floor: number;
  /** Northwest corner (smallest x and z), meters. */
  x: number;
  z: number;
  /** Size along x (west → east) and z (north → south), meters. At least `MIN_ROOM`. */
  w: number;
  d: number;
  /**
   * Ceiling height (meters). Default `DEFAULT_ROOM_HEIGHT`, which puts the ceiling flush
   * against the floor above. Taller rooms are fine where nothing is built above them.
   */
  height?: number;
  /** A fight room: its doors shutter while enemies are alive, open when they're cleared. */
  fight?: boolean;
  /** The room's look: stone colors, light and decoration (see `build.ts`). Default `sandstone`. */
  theme?: RoomTheme;
  /** Shapes inside the room; they don't affect the key/door logic. */
  features?: FeatureDef[];
}

/** Room shapes, relative to the room's northwest corner. */
export type FeatureDef =
  /** A hole in the floor. Falling in costs a little health and returns you to the room's entry. */
  | { kind: 'pit'; x: number; z: number; w: number; d: number }
  /** A raised block or platform `h` meters tall. */
  | { kind: 'block'; x: number; z: number; w: number; d: number; h: number }
  /** A round column, `r` meters radius. */
  | { kind: 'pillar'; x: number; z: number; r?: number };

/**
 * What it takes to pass a door:
 * - `small`: spend one small key (the door stays open afterwards),
 * - `boss`: have the dungeon's boss key (not spent),
 * - `{ switch }`: that switch has been pressed (switches stay pressed),
 * - `{ item }`: Wren has that item (a tool found in the dungeon).
 */
export type Lock = 'small' | 'boss' | { switch: string } | { switches: string[] } | { item: string };

/** The shrine's wings each have a look: sandstone halls, marble galleries, mossy undercroft, basalt hearth. */
export type RoomTheme = 'sandstone' | 'marble' | 'moss' | 'basalt';

/** The switches a lock waits for (all of them), if it's a switch lock. */
export function lockSwitches(lock: Lock | undefined): string[] {
  if (!lock || typeof lock === 'string') return [];
  if ('switch' in lock) return [lock.switch];
  return 'switches' in lock ? lock.switches : [];
}

export interface DoorDef {
  id: string;
  from: string;
  to: string;
  lock?: Lock;
  /** Only passable from `from` to `to` (a ledge you drop off, a door that bars behind you). */
  oneWay?: boolean;
  /**
   * `door` (default): a doorway in the wall the two rooms share (same floor).
   * `stairs`: a staircase between rooms on adjacent floors whose footprints overlap.
   * `drop`: a hole from `from` down into `to` (the floor below, footprints overlapping);
   *   always one-way. Good for shortcuts back to earlier rooms.
   */
  kind?: 'door' | 'stairs' | 'drop';
  /** Where along the shared wall the door's center sits, meters from the wall's start (default: middle). */
  offset?: number;
  /** Doorway (or stair) width (meters). Default `DEFAULT_DOOR_WIDTH`. */
  width?: number;
  /**
   * Stairs only: the foot of the stairs, relative to the **lower** room's corner, and the
   * direction you walk to climb. The flight runs `STAIR_RUN` meters that way and comes out
   * through a hole in the upper room's floor. Default: centered in the overlap, climbing
   * along its longer side.
   */
  at?: Vec2;
  up?: Dir;
}

/** The single-use drinks found in dungeon chests (see `game/drinks.ts`). */
export type DrinkId = 'restore' | 'attack';

export type Loot = 'smallKey' | 'bossKey' | 'heart' | { item: string } | { gems: number } | { drink: DrinkId };

/** When something appears: after a switch (or all of several) is pressed, or once a room is cleared of enemies. */
export type Condition = { switch: string } | { switches: string[] } | { cleared: string };

/**
 * Stones and plates are on a 2 m grid inside each room: put them at odd coordinates
 * (cell centers: 1, 3, 5...) so a 2 m stone fills exactly one cell.
 */
export type ThingDef =
  | { kind: 'chest'; id: string; room: string; at: Vec2; loot: Loot; appears?: Condition }
  /**
   * `plate`: a floor plate held down by a stone; `crystal`: struck with the sword (default).
   * `needs`: an item required to press it (e.g. the stone that fits the plate can only be
   * pulled into place). Switches stay pressed once pressed, except `hold` plates: those are
   * down only while a stone rests on them, and whatever waits on them (a door, a chest)
   * needs all of its hold plates down *at the same time*; then it opens for good.
   */
  | { kind: 'switch'; id: string; room: string; at: Vec2; style?: 'crystal' | 'plate'; needs?: string; hold?: boolean }
  /**
   * A wakestone: a 2 m carved block that slides one cell away when struck with the sword
   * (and toward Wren when pulled, once there's a tool for that). `heavy` stones only move
   * with the tool. Rendering and puzzles only; the door/key logic ignores stones. `role:
   * 'bridge'`: the glove topples it across a pit (milestone 5), so the puzzle checker
   * doesn't expect it to serve a plate, chest or doorway.
   */
  | { kind: 'stone'; id: string; room: string; at: Vec2; heavy?: boolean; role?: 'bridge' }
  | { kind: 'enemy'; id: string; room: string; at: Vec2; type: string }
  | { kind: 'boss'; id: string; room: string; type: string }
  | { kind: 'sign'; id: string; room: string; at: Vec2; text: string }
  /**
   * A big, lopsided statue to orient by (one per floor's central room): `LANDMARK_SIZE` m
   * square around `at`, solid like a pillar (the grid marks its cells blocked). `facing`
   * is a yaw in radians (0 = looking south, +x = toward east); each style says what it points at.
   */
  | { kind: 'landmark'; id: string; room: string; at: Vec2; style: LandmarkStyle; facing?: number };

/** The shrine's landmark statues: the Nave's, the Long Gallery's and the Crypt's. */
export type LandmarkStyle = 'lanternKeeper' | 'watcher' | 'fallenKeeper';

export const DEFAULT_FLOOR_HEIGHT = 8;
/** Thickness of a floor slab (below the walking surface) and of a ceiling slab (above the room). */
export const FLOOR_T = 0.5;
export const CEIL_T = 0.5;
/** Floor-to-ceiling: the ceiling slab ends exactly where the next floor's slab begins. */
export const DEFAULT_ROOM_HEIGHT = DEFAULT_FLOOR_HEIGHT - FLOOR_T - CEIL_T;
export const DEFAULT_DOOR_WIDTH = 3;
export const DOOR_HEIGHT = 3.2;
export const MIN_ROOM = 4;
/** Solid wall a doorway must leave at each end of the shared wall. */
export const DOOR_MARGIN = 0.5;
/** Horizontal length of a flight of stairs (a 34° climb over the default floor height). */
export const STAIR_RUN = 12;
/** Clear floor needed at the foot and at the top of a flight of stairs. */
export const STAIR_LANDING = 1;
/** Side of the square hole a `drop` leaves in the floor. */
export const DROP_SIZE = 3;
/** How deep a pit is below its floor. */
export const PIT_DEPTH = 3;

/** Where a doorway sits: its center in world x/z, and which way the wall runs. */
export interface DoorPlacement {
  x: number;
  z: number;
  /** `x`: the wall runs east–west (rooms are north/south of it); `z`: it runs north–south. */
  wall: 'x' | 'z';
  /** Length of the wall the two rooms share. */
  shared: number;
}

/** The span two intervals share (empty when `hi <= lo`). */
function overlap(a0: number, a1: number, b0: number, b1: number) {
  return { lo: Math.max(a0, b0), hi: Math.min(a1, b1) };
}

/**
 * Where a `door` (not stairs) between two rooms on the same floor goes, or null if the
 * rooms don't share a wall. Rooms share a wall when one's edge lies exactly on the other's.
 */
export function doorPlacement(a: RoomDef, b: RoomDef, door: Pick<DoorDef, 'offset'> = {}): DoorPlacement | null {
  if (a.floor !== b.floor) return null;
  const place = (fixed: number, lo: number, hi: number, wall: 'x' | 'z'): DoorPlacement | null => {
    if (hi - lo <= 0) return null;
    const along = lo + (door.offset ?? (hi - lo) / 2);
    return wall === 'z' ? { x: fixed, z: along, wall, shared: hi - lo } : { x: along, z: fixed, wall, shared: hi - lo };
  };
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const o = overlap(a.z, a.z + a.d, b.z, b.z + b.d);
    return place(a.x + a.w === b.x ? b.x : a.x, o.lo, o.hi, 'z');
  }
  if (a.z + a.d === b.z || b.z + b.d === a.z) {
    const o = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
    return place(a.z + a.d === b.z ? b.z : a.z, o.lo, o.hi, 'x');
  }
  return null;
}

/** The footprint two rooms share in plan view (for stairs), or null. */
export function footprintOverlap(a: RoomDef, b: RoomDef) {
  const ox = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
  const oz = overlap(a.z, a.z + a.d, b.z, b.z + b.d);
  if (ox.hi - ox.lo <= 0 || oz.hi - oz.lo <= 0) return null;
  return { x: ox.lo, z: oz.lo, w: ox.hi - ox.lo, d: oz.hi - oz.lo };
}

/** A rectangle in plan view, world meters. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export function floorHeightOf(def: DungeonDef) {
  return def.floorHeight ?? DEFAULT_FLOOR_HEIGHT;
}

/** The walking surface of a floor. */
export function floorY(def: DungeonDef, floor: number) {
  return floor * floorHeightOf(def);
}

export function roomHeight(def: DungeonDef, r: RoomDef) {
  return r.height ?? floorHeightOf(def) - FLOOR_T - CEIL_T;
}

export const DIRS: Record<Dir, Vec2> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
}

export function rectContains(outer: Rect, inner: Rect, margin = 0) {
  return inner.x >= outer.x + margin && inner.z >= outer.z + margin && inner.x + inner.w <= outer.x + outer.w - margin && inner.z + inner.d <= outer.z + outer.d - margin;
}

/** A room's footprint as a `Rect`. */
export const roomRect = (r: RoomDef): Rect => ({ x: r.x, z: r.z, w: r.w, d: r.d });

/**
 * Where a flight of stairs sits: its footprint (world), the foot (world x/z), the climbing
 * direction, and which room is below/above. Null if the door isn't valid stairs.
 */
export function stairPlacement(door: DoorDef, a: RoomDef, b: RoomDef) {
  if (door.kind !== 'stairs' || Math.abs(a.floor - b.floor) !== 1) return null;
  const [lower, upper] = a.floor < b.floor ? [a, b] : [b, a];
  const o = footprintOverlap(lower, upper);
  if (!o) return null;
  const width = door.width ?? DEFAULT_DOOR_WIDTH;
  const up: Dir = door.up ?? (o.d >= o.w ? 'n' : 'e');
  const [dx, dz] = DIRS[up];
  // Default: the flight centered in the overlap.
  const foot: Vec2 = door.at
    ? [lower.x + door.at[0], lower.z + door.at[1]]
    : [o.x + o.w / 2 - (dx * STAIR_RUN) / 2, o.z + o.d / 2 - (dz * STAIR_RUN) / 2];
  const x0 = Math.min(foot[0], foot[0] + dx * STAIR_RUN), z0 = Math.min(foot[1], foot[1] + dz * STAIR_RUN);
  const rect: Rect = dx !== 0
    ? { x: x0, z: foot[1] - width / 2, w: STAIR_RUN, d: width }
    : { x: foot[0] - width / 2, z: z0, w: width, d: STAIR_RUN };
  return { rect, foot, up, lower, upper, width };
}

/** The hole a drop leaves in the upper room's floor (centered in the overlap). */
export function dropHole(door: DoorDef, a: RoomDef, b: RoomDef): Rect | null {
  if (door.kind !== 'drop') return null;
  const o = footprintOverlap(a, b);
  if (!o) return null;
  return { x: o.x + o.w / 2 - DROP_SIZE / 2, z: o.z + o.d / 2 - DROP_SIZE / 2, w: DROP_SIZE, d: DROP_SIZE };
}

/**
 * Every hole in a room's floor (pits, drops, the shafts of stairs coming up from below),
 * and every flight of stairs standing on it, in world rects.
 */
export function roomOpenings(def: DungeonDef, room: RoomDef) {
  const rooms = new Map(def.rooms.map((r) => [r.id, r]));
  const holes: { rect: Rect; kind: 'pit' | 'drop' | 'stairs'; id: string }[] = [];
  const stairs: { rect: Rect; id: string }[] = [];
  for (const f of room.features ?? []) {
    if (f.kind === 'pit') holes.push({ rect: { x: room.x + f.x, z: room.z + f.z, w: f.w, d: f.d }, kind: 'pit', id: `${room.id} pit` });
  }
  for (const d of def.doors) {
    const a = rooms.get(d.from), b = rooms.get(d.to);
    if (!a || !b || (a !== room && b !== room)) continue;
    if (d.kind === 'drop' && a === room) {
      const h = dropHole(d, a, b);
      if (h) holes.push({ rect: h, kind: 'drop', id: d.id });
    }
    const s = stairPlacement(d, a, b);
    if (s && s.upper === room) holes.push({ rect: s.rect, kind: 'stairs', id: d.id });
    if (s && s.lower === room) stairs.push({ rect: s.rect, id: d.id });
  }
  return { holes, stairs };
}

/** Side of the square a landmark statue occupies (grid cells it touches are blocked). */
export const LANDMARK_SIZE = 3;

/** A landmark's footprint in world meters. */
export function landmarkRect(room: RoomDef, at: Vec2): Rect {
  const [x, z] = worldPos(room, at);
  return { x: x - LANDMARK_SIZE / 2, z: z - LANDMARK_SIZE / 2, w: LANDMARK_SIZE, d: LANDMARK_SIZE };
}

/** A thing's world x/z (things are placed relative to their room's corner). */
export function worldPos(room: RoomDef, at: Vec2): Vec2 {
  return [room.x + at[0], room.z + at[1]];
}

/** A short label for a lock, used in error messages and the text map legend. */
export function lockName(lock: Lock | undefined) {
  if (!lock) return 'open';
  if (typeof lock === 'string') return lock === 'small' ? 'small key' : 'boss key';
  if ('switch' in lock) return `switch ${lock.switch}`;
  return 'switches' in lock ? `switches ${lock.switches.join(' + ')}` : `item ${lock.item}`;
}

import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { Layer, type Physics } from '../../core/physics';
import { disposeTree, mat, mergeStatic, surf, uniqueSurf } from '../../render/materials';
import { pal } from '../../render/palette';
import { BAKE, collectBakeSet, EVERYWHERE, queueBake } from '../../render/bakeLight';
import { kitMesh, place } from '../../render/kit';
import { ceilingBeams, cornerPiers, course, floorTiles, innerOf, pillar, plinth, roomCornice, SANDSTONE, SHELL, type WallOrient } from '../../render/models/shrine';
import { sconceIron } from '../../render/models/shrineProps';
import { SconceGlow } from '../../render/sconceGlow';
import { buildCourse } from '../platforming';
import { AreaBuilder, type Area, type AreaEnv, type Interactable, type Spot, type Trigger } from '../area';
import { BellPickup, BellPost, type BellId } from '../bell';
import { Chest } from '../objects';
import { SigilLook } from '../sigil';
import {
  CEIL_T, DEFAULT_DOOR_WIDTH, DIRS, DOOR_HEIGHT, doorPlacement, dropHole, FLOOR_T, floorHeightOf, floorY, landmarkRect, PIT_DEPTH,
  roomHeight, roomOpenings, roomRect, stairPlacement, worldPos,
  type Dir, type DungeonDef, type Rect, type RoomDef,
} from './format';
import { bellRect, CELL, cellAt, cellCenter, roomGrid, type Cell, type RoomGrid } from './grid';
import { buildLandmark } from './landmarks';
import { FallenColumn } from './bridge';
import { PULL_RANGE } from './puzzle';
import type { FogLook } from '../../render/sky';
import { decorateRoom, DUNGEON_FOG, THEMES, themeOf, type WallSpot } from './decor';
import { WardenHearth } from './hearth';
import { buildTablet, doorStyle, DungeonDoor, DungeonSwitch, Wakestone } from './pieces';

/** What happened when a stone was struck or pulled. */
export type StoneResult = 'moved' | 'sunk' | 'blocked' | 'heavy' | 'bounced' | 'bridged';

interface StoneState {
  room: RoomDef;
  cell: Cell;
  home: Cell;
  sunk: boolean;
}

/**
 * Builds a playable 3D `Area` from a `DungeonDef`: the "renderer" for the dungeon data.
 * Every room becomes a floor slab (with holes for pits, drops and stair shafts), walls on
 * its edges (shared walls built once, with gaps for doorways), a ceiling (the camera stays
 * under it), and its features and things. Floors are grouped separately, so a top-down
 * view can show one floor at a time (`showFloor`).
 *
 * Geometry rules the validator guarantees (so this code doesn't re-check them): rooms on a
 * floor don't overlap, doors sit on shared walls, stairs and holes fit their rooms and
 * don't collide, and a room under a shaft is exactly tall enough that its ceiling meets the
 * floor above.
 */

export const WALL_T = 0.5;
/** Real point lights at once in a dungeon: the nearest `LIGHTS_NEAR` glow, the rest of the pool is for fading swaps. */
const LIGHT_POOL = 8;
const LIGHTS_NEAR = 6;
const STEPS = 20;
const yawOf: Record<Dir, number> = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 };

/** Splits `base` into rectangles covering it except the `holes` (row strips; exact, not minimal). */
export function subtractRects(base: Rect, holes: Rect[]): Rect[] {
  const xs = new Set([base.x, base.x + base.w]), zs = new Set([base.z, base.z + base.d]);
  const clampX = (v: number) => Math.min(base.x + base.w, Math.max(base.x, v));
  const clampZ = (v: number) => Math.min(base.z + base.d, Math.max(base.z, v));
  for (const h of holes) {
    xs.add(clampX(h.x)).add(clampX(h.x + h.w));
    zs.add(clampZ(h.z)).add(clampZ(h.z + h.d));
  }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const inHole = (x: number, z: number) => holes.some((h) => x > h.x && x < h.x + h.w && z > h.z && z < h.z + h.d);
  const out: Rect[] = [];
  for (let j = 0; j < Z.length - 1; j++) {
    let start: number | null = null;
    for (let i = 0; i <= X.length - 1; i++) {
      const solid = i < X.length - 1 && !inHole((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2) && X[i + 1] > X[i];
      if (solid && start === null) start = X[i];
      if (!solid && start !== null) {
        out.push({ x: start, z: Z[j], w: X[i] - start, d: Z[j + 1] - Z[j] });
        start = null;
      }
    }
  }
  return out.filter((r) => r.w > 1e-6 && r.d > 1e-6);
}

interface FloorParts {
  solid: THREE.Group;
  ceiling: THREE.Group;
  dynamic: THREE.Group;
}

/** Something content spawns at a spot from the data (enemies, the boss). */
export interface Spawn {
  id: string;
  type: string;
  room: string;
  x: number;
  y: number;
  z: number;
  /** The yaw it starts in, if the data says. */
  facing?: number;
  /** An enemy on a trial platform keeps to its disc (world x, z, radius). */
  leash?: { x: number; z: number; r: number };
}

/** The exit trigger's circle: its centre's distance outside the doorway, and its radius. */
export const EXIT_OFFSET = 0.5;
export const EXIT_RADIUS = 2.2;

export class DungeonArea implements Area {
  readonly id: string;
  readonly root: THREE.Group;
  readonly spawn: { x: number; y: number; z: number; facing: number };
  readonly waterLevel = null;
  readonly voiceRoom = 'dungeon';
  readonly enemyCount = 0;
  readonly indoor = true;
  readonly portrait?: { eye: THREE.Vector3; target: THREE.Vector3 };
  readonly music: DungeonDef['music'];
  readonly interactables: Interactable[] = [];
  readonly triggers: Trigger[] = [];
  readonly doors = new Map<string, DungeonDoor>();
  readonly chests = new Map<string, Chest>();
  readonly sigils = new Map<string, SigilLook>();
  readonly switches = new Map<string, DungeonSwitch>();
  readonly stones = new Map<string, Wakestone>();
  /** Fallen columns (`role: 'bridge'` stones): the glove swings them across their pits. */
  readonly columns = new Map<string, FallenColumn>();
  /** Bell posts by the bell that fits them, and by their data id (content binds by id). */
  readonly bellPosts = new Map<BellId, BellPost>();
  readonly bellPostsById = new Map<string, BellPost>();
  /** Bells waiting at the end of their trials, by data id. */
  readonly bellPickups = new Map<string, BellPickup>();
  /** Where travelers arrive: in front of each bell post, named by its id. */
  readonly entrances: Record<string, Spot> = {};
  readonly spawns: Spawn[] = [];
  /** Gravelheart's arena, if this dungeon has it (the room with a `gravelheart` boss thing). */
  hearth: WardenHearth | null = null;
  /** Called when a switch is pressed: a crystal struck, or a plate under a stone (content decides what it opens). */
  onSwitch: ((id: string) => void) | null = null;
  /** A prism took a hit (1-based count, the last one shatters it) at this world position. */
  onPrismHit: ((hits: number, at: THREE.Vector3) => void) | null = null;
  /**
   * Called when the sword meets a stone (for sounds and effects). On `bounced`, `from` is
   * where the stone is: content knocks Wren back away from it to make room.
   */
  onStone: ((id: string, result: StoneResult, from: THREE.Vector3) => void) | null = null;
  /** The glow on heavy stones' spirals (pulses). */
  private readonly heavyGlow = uniqueSurf('stone', pal('teal', 3), { emissive: pal('teal', 1) });
  private readonly stoneState = new Map<string, StoneState>();
  private readonly grids = new Map<string, RoomGrid>();
  /** Pits filled by stones, by room: `i,j` cell keys. */
  private readonly filled = new Map<string, Set<string>>();
  private readonly floors = new Map<number, FloorParts>();
  /**
   * Every room's warm light, as data. Real point lights cost every pixel one pass each (the shrine has 34), so
   * only the `LIGHT_POOL` nearest to Wren are real: a fixed pool of lights (a constant count, so no shader
   * rebuilds) that move to the nearest sources and fade as they swap.
   */
  private readonly lightSources: { pos: THREE.Vector3; color: number; distance: number; base: number; phase: number; w: number }[] = [];
  private readonly lightPool: { light: THREE.PointLight; src: number }[] = [];
  /** In the hearth's drops: a dull ember glow far below, so the edge reads as a drop in the dark. */
  private readonly emberMat = new THREE.MeshBasicMaterial({ color: 0x8a2e0c });
  private readonly waterMat = new THREE.MeshLambertMaterial({ color: 0x2f6f74, transparent: true, opacity: 0.75, emissive: 0x0c2a2c });
  private readonly disposer: () => void;
  private t = 0;
  private platformT = 0;
  /** Platform courses of the rooms that have `platforms` (their movers are ticked in `update`). */
  private readonly courses: { update(t: number): void; dispose(): void }[] = [];
  /** The sconces' flames and their dust (render/sconceGlow.ts). */
  private readonly sconceGlow = new SconceGlow();
  /** Where each room's sconces hang (the cup's spot) and which wall spots got a carved face: kept to test that none crowds a sconce. */
  readonly sconceSpots: { room: string; x: number; z: number }[] = [];
  readonly faceSpots: { room: string; x: number; z: number }[] = [];

  constructor(physics: Physics, readonly def: DungeonDef) {
    this.id = def.id;
    this.music = def.music;
    if (def.portrait) {
      const pr = def.portrait, room = def.rooms.find((r) => r.id === pr.room)!;
      const at = (p: [number, number, number]) => {
        const [x, z] = worldPos(room, [p[0], p[1]]);
        return new THREE.Vector3(x, floorY(def, room.floor) + p[2], z);
      };
      this.portrait = { eye: at(pr.eye), target: at(pr.look) };
    }
    const b = new AreaBuilder(physics, mulberry32(7));
    const rooms = new Map(def.rooms.map((r) => [r.id, r]));
    const src = new Map<number, { solid: THREE.Group; ceiling: THREE.Group }>();
    const part = (floor: number) => {
      let p = this.floors.get(floor);
      if (!p) {
        p = { solid: new THREE.Group(), ceiling: new THREE.Group(), dynamic: new THREE.Group() };
        this.floors.set(floor, p);
        src.set(floor, { solid: new THREE.Group(), ceiling: new THREE.Group() });
      }
      return { ...p, src: src.get(floor)! };
    };
    /** A static box (merged later; stone-textured), with an optional collider. `show` false: the collider alone (a final wing draws its own). */
    const box = (group: THREE.Group, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, layer: number | null = Layer.World, show = true) => {
      if (show) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), surf('stone', color));
        m.position.set(x, y, z);
        group.add(m);
      }
      if (layer !== null) b.box(x, y, z, sx / 2, sy / 2, sz / 2, 0, layer);
    };
    /** A kit piece of a final wing's shell (render/models/shrine.ts), merged with the floor's scenery. */
    const shell = (group: THREE.Group, geo: THREE.BufferGeometry | null) => {
      if (geo) group.add(kitMesh(geo, 'stone'));
    };
    /** The sandstone wing is final (T56a): its shell comes from the kit; the other wings keep the rough boxes for now. */
    const isFinal = (r: RoomDef) => themeOf(r) === 'sandstone';

    // --- floors, ceilings, pits, features -------------------------------------------
    for (const r of def.rooms) {
      const fy = floorY(def, r.floor), h = roomHeight(def, r);
      const p = part(r.floor);
      const { holes } = roomOpenings(def, r);
      const pal = THEMES[themeOf(r)];
      const final = isFinal(r);
      for (const s of subtractRects(roomRect(r), holes.map((o) => o.rect))) {
        box(p.src.solid, pal.floor, s.x + s.w / 2, fy - FLOOR_T / 2, s.z + s.d / 2, s.w, FLOOR_T, s.d, Layer.World, !final);
        if (final) {
          // Tiles on the stones' 2 m grid, over a slab sunk by their thickness: the seams between them show its darker stone.
          const slab = new THREE.Mesh(new THREE.BoxGeometry(s.w, FLOOR_T - SHELL.tileT, s.d), surf('stone', pal.trim));
          slab.position.set(s.x + s.w / 2, fy - FLOOR_T / 2 - SHELL.tileT / 2, s.z + s.d / 2);
          p.src.solid.add(slab);
          const flags = floorTiles(s, { x: r.x, z: r.z }, fy, SANDSTONE.floor);
          if (flags) p.src.solid.add(kitMesh(flags, 'rock')); // whole stones, not the walls' coursed blocks
          continue;
        }
        // Checkered tiles (marble): every other 2 m cell a shade darker.
        if (pal.floorAlt !== null) {
          for (let cx = r.x; cx < r.x + r.w; cx += 2) {
            for (let cz = r.z; cz < r.z + r.d; cz += 2) {
              if (((cx - r.x) / 2 + (cz - r.z) / 2) % 2 === 0) continue;
              const x0 = Math.max(cx, s.x), x1 = Math.min(cx + 2, s.x + s.w), z0 = Math.max(cz, s.z), z1 = Math.min(cz + 2, s.z + s.d);
              if (x1 - x0 > 0.01 && z1 - z0 > 0.01) box(p.src.solid, pal.floorAlt, (x0 + x1) / 2, fy + 0.003, (z0 + z1) / 2, x1 - x0, 0.006, z1 - z0, null);
            }
          }
        }
        // Seams every 2 m, aligned with the room: the grid wakestones slide on.
        for (let gx = Math.ceil((s.x - r.x) / 2) * 2 + r.x; gx <= s.x + s.w; gx += 2) {
          if (gx > s.x && gx < s.x + s.w) box(p.src.solid, pal.trim, gx, fy + 0.005, s.z + s.d / 2, 0.06, 0.01, s.d, null);
        }
        for (let gz = Math.ceil((s.z - r.z) / 2) * 2 + r.z; gz <= s.z + s.d; gz += 2) {
          if (gz > s.z && gz < s.z + s.d) box(p.src.solid, pal.trim, s.x + s.w / 2, fy + 0.005, gz, s.w, 0.01, 0.06, null);
        }
      }
      for (const o of holes) {
        if (o.kind !== 'pit') continue;
        const { x, z, w, d } = o.rect;
        box(p.src.solid, pal.pitFloor, x + w / 2, fy - PIT_DEPTH - 0.25, z + d / 2, w, 0.5, d);
        // In the undercroft, the pits are channels of dark water.
        if (themeOf(r) === 'moss') {
          const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.05, d - 0.6), this.waterMat);
          water.position.set(x + w / 2, fy - 1.1, z + d / 2);
          p.src.solid.add(water);
        }
        if (themeOf(r) === 'basalt') {
          const glowPlate = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.05, d - 0.6), this.emberMat);
          glowPlate.position.set(x + w / 2, fy - PIT_DEPTH + 0.03, z + d / 2);
          p.src.solid.add(glowPlate);
        }
        const sideH = PIT_DEPTH - FLOOR_T, sy = fy - FLOOR_T - sideH / 2;
        box(p.src.solid, pal.trim, x + w / 2, sy, z + 0.15, w, sideH, 0.3);
        box(p.src.solid, pal.trim, x + w / 2, sy, z + d - 0.15, w, sideH, 0.3);
        box(p.src.solid, pal.trim, x + 0.15, sy, z + d / 2, 0.3, sideH, d);
        box(p.src.solid, pal.trim, x + w - 0.15, sy, z + d / 2, 0.3, sideH, d);
      }
      if (r.platforms?.length) this.courses.push(buildCourse(b, { platforms: r.platforms }, { x: r.x, y: fy, z: r.z }, pal.trim));
      // The ceiling, with holes where stairs or drops come up through it from this room.
      const above: Rect[] = [];
      for (const d of def.doors) {
        const a = rooms.get(d.from)!, c = rooms.get(d.to)!;
        const s = stairPlacement(d, a, c);
        if (s && s.lower === r) above.push(s.rect);
        const hole = d.to === r.id ? dropHole(d, a, c) : null;
        if (hole) above.push(hole);
      }
      for (const s of subtractRects(roomRect(r), above)) {
        box(p.src.ceiling, pal.ceiling, s.x + s.w / 2, fy + h + CEIL_T / 2, s.z + s.d / 2, s.w, CEIL_T, s.d);
      }
      if (final) shell(p.src.ceiling, ceilingBeams(r, fy + h, pal.trim, above));
      for (const f of r.features ?? []) {
        if (f.kind === 'pillar') {
          const rad = f.r ?? 0.7;
          if (final) {
            shell(p.src.solid, place(pillar(rad, h, pal.pillar, pal.trim, f.x * 7 + f.z), r.x + f.x, fy, r.z + f.z));
            b.cylinder(r.x + f.x, fy + h / 2, r.z + f.z, h / 2, rad, Layer.Prop);
            continue;
          }
          const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.1, h, 8), surf('stone', pal.pillar));
          m.position.set(r.x + f.x, fy + h / 2, r.z + f.z);
          p.src.solid.add(m);
          b.cylinder(r.x + f.x, fy + h / 2, r.z + f.z, h / 2, rad, Layer.Prop);
          box(p.src.solid, pal.trim, r.x + f.x, fy + 0.2, r.z + f.z, rad * 2.6, 0.4, rad * 2.6, null);
        } else if (f.kind === 'block') {
          box(p.src.solid, pal.wall, r.x + f.x + f.w / 2, fy + f.h / 2, r.z + f.z + f.d / 2, f.w, f.h, f.d);
        }
      }
      // Light: a warm point light in the middle of the room, and sconces you can see.
      // A tall room (a shaft) gets another light every 4.5 m up, so its upper reaches aren't black.
      const base = (10 + r.w * r.d * 0.04) * pal.lightLevel;
      for (let ly = Math.min(h - 1.2, 5); ly < h - 1.2 || ly === Math.min(h - 1.2, 5); ly += 4.5) {
        this.lightSources.push({ pos: new THREE.Vector3(r.x + r.w / 2, fy + ly, r.z + r.d / 2), color: pal.light, distance: Math.max(r.w, r.d) * 1.4, base, phase: Math.random() * 10, w: 0 });
      }
    }

    // --- walls (per floor; shared walls once; gaps for doorways) ------------------
    /** `side`: which way the room's inside lies from this wall line (+1 / -1 along the perpendicular axis). */
    type Edge = { a: number; b: number; top: number; room: RoomDef; side: 1 | -1 };
    const gapsBy = new Map<string, [number, number][]>();
    const gap = (key: string, c: number, w: number) => {
      const list = gapsBy.get(key) ?? [];
      list.push([c - w / 2, c + w / 2]);
      gapsBy.set(key, list);
    };
    for (const d of def.doors) {
      if (d.kind && d.kind !== 'door') continue;
      const a = rooms.get(d.from)!, c = rooms.get(d.to)!;
      const pl = doorPlacement(a, c, d);
      if (!pl) continue;
      const w = d.width ?? DEFAULT_DOOR_WIDTH;
      gap(pl.wall === 'x' ? `${a.floor}:x:${pl.z}` : `${a.floor}:z:${pl.x}`, pl.wall === 'x' ? pl.x : pl.z, w);
      const fy = floorY(def, a.floor);
      const door = new DungeonDoor(b, part(a.floor).dynamic, d.id, doorStyle(d.lock), pl.x, fy, pl.z, pl.wall, w, d.lock && typeof d.lock === 'object' && 'key' in d.lock ? d.lock.key : undefined, THEMES[themeOf(a)].trim);
      this.doors.set(d.id, door);
      if (d.lock && typeof d.lock === 'object' && 'cleared' in d.lock) {
        // A hidden room can be arrived in (the seal's vision ends there): just inside its door, facing in.
        const dx = pl.wall === 'z' ? Math.sign(c.x + c.w / 2 - pl.x) : 0, dz = pl.wall === 'x' ? Math.sign(c.z + c.d / 2 - pl.z) : 0;
        this.entrances[d.to] = { x: pl.x + dx * 2.5, z: pl.z + dz * 2.5, y: fy + 0.05, facing: Math.atan2(dx, dz) };
      }
      if (door.style !== 'open' && door.style !== 'hidden') {
        const label = door.style === 'bars' ? 'Check' : 'Unlock';
        this.interactables.push({ id: d.id, x: pl.x, z: pl.z, y: fy, r: 2.6, label, promptY: fy + DOOR_HEIGHT + 0.6, enabled: () => !door.open && !door.opening });
      }
    }
    // The way out: an open doorway in the wall behind the entrance spot (never closed).
    const er = rooms.get(def.entrance.room)!;
    const [ex, ez] = worldPos(er, def.entrance.at);
    const back = { n: 's', s: 'n', e: 'w', w: 'e' }[def.entrance.facing] as Dir;
    const entrance = back === 'n' ? { wall: 'x' as const, x: ex, z: er.z } : back === 's' ? { wall: 'x' as const, x: ex, z: er.z + er.d }
      : back === 'w' ? { wall: 'z' as const, x: er.x, z: ez } : { wall: 'z' as const, x: er.x + er.w, z: ez };
    gap(entrance.wall === 'x' ? `${er.floor}:x:${entrance.z}` : `${er.floor}:z:${entrance.x}`, entrance.wall === 'x' ? entrance.x : entrance.z, DEFAULT_DOOR_WIDTH);
    new DungeonDoor(b, part(er.floor).dynamic, 'entrance', 'open', entrance.x, floorY(def, er.floor), entrance.z, entrance.wall, DEFAULT_DOOR_WIDTH, undefined, THEMES[themeOf(er)].trim);
    // Beyond the doorway is nothing, so the view out would show whatever lies down there (the
    // rooms of the floor below); a black unlit panel just outside makes it read as darkness.
    {
      const [ox, oz] = DIRS[def.entrance.facing];
      const fy0 = floorY(def, er.floor), w = DEFAULT_DOOR_WIDTH + 4, h = DOOR_HEIGHT + 3.5;
      const dark = new THREE.Mesh(new THREE.BoxGeometry(entrance.wall === 'x' ? w : 0.5, h, entrance.wall === 'x' ? 0.5 : w), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      dark.position.set(entrance.x - ox * 1.3, fy0 + h / 2 - 2.5, entrance.z - oz * 1.3);
      part(er.floor).dynamic.add(dark);
    }
    // Walking back out through the open entrance leaves the dungeon (content decides where to).
    const [ix, iz] = DIRS[def.entrance.facing];
    // The circle sits just outside the doorway and reaches past both door frames and a few metres into the
    // void beyond, so hugging a frame or walking out at an angle can't slip by it (spawn is well clear of it).
    this.triggers.push({ id: 'exit', x: entrance.x - ix * EXIT_OFFSET, z: entrance.z - iz * EXIT_OFFSET, y: floorY(def, er.floor), r: EXIT_RADIUS, enabled: () => true });

    // Walls of different floors that lie on the same line at the same heights (a tall room passing the
    // floors above or below) would be two coplanar boxes z-fighting; those segments are built as one
    // half-thickness slab per room, each on its own side (see below).
    const wallLines: { orient: string; line: number; a: number; b: number; floor: number; low: number; high: number }[] = [];
    for (const r of def.rooms) {
      const fy = floorY(def, r.floor), low = fy - FLOOR_T, high = fy + roomHeight(def, r) + CEIL_T;
      wallLines.push(
        { orient: 'x', line: r.z, a: r.x, b: r.x + r.w, floor: r.floor, low, high }, { orient: 'x', line: r.z + r.d, a: r.x, b: r.x + r.w, floor: r.floor, low, high },
        { orient: 'z', line: r.x, a: r.z, b: r.z + r.d, floor: r.floor, low, high }, { orient: 'z', line: r.x + r.w, a: r.z, b: r.z + r.d, floor: r.floor, low, high },
      );
    }
    for (const [floor] of this.floors) {
      const fy = floorY(def, floor);
      const edges = new Map<string, Edge[]>();
      const add = (key: string, e: Edge) => edges.set(key, [...(edges.get(key) ?? []), e]);
      for (const r of def.rooms.filter((r) => r.floor === floor)) {
        const top = fy + roomHeight(def, r) + CEIL_T;
        add(`${floor}:x:${r.z}`, { a: r.x, b: r.x + r.w, top, room: r, side: 1 });
        add(`${floor}:x:${r.z + r.d}`, { a: r.x, b: r.x + r.w, top, room: r, side: -1 });
        add(`${floor}:z:${r.x}`, { a: r.z, b: r.z + r.d, top, room: r, side: 1 });
        add(`${floor}:z:${r.x + r.w}`, { a: r.z, b: r.z + r.d, top, room: r, side: -1 });
      }
      const p = part(floor);
      for (const [key, list] of edges) {
        const [, orient, lineS] = key.split(':');
        const line = Number(lineS);
        const gaps = gapsBy.get(key) ?? [];
        const cuts = [...new Set([...list.flatMap((e) => [e.a, e.b]), ...gaps.flat()])].sort((u, v) => u - v);
        const lo = Math.min(...list.map((e) => e.a)), hi = Math.max(...list.map((e) => e.b));
        for (let i = 0; i < cuts.length - 1; i++) {
          const u = cuts[i], v = cuts[i + 1], mid = (u + v) / 2;
          const covering = list.filter((e) => e.a <= mid && e.b >= mid);
          if (!covering.length || v - u < 1e-6) continue;
          const top = Math.max(...covering.map((e) => e.top));
          const wpal = THEMES[themeOf(covering[0].room)];
          const inGap = gaps.some(([g0, g1]) => mid > g0 && mid < g1);
          const bottom = inGap ? fy + DOOR_HEIGHT : fy - FLOOR_T;
          // Outer ends reach half a wall further so corners close.
          const u2 = u - (u === lo && !inGap ? WALL_T / 2 : 0), v2 = v + (v === hi && !inGap ? WALL_T / 2 : 0);
          const len = v2 - u2, c = (u2 + v2) / 2, hgt = top - bottom, cy = (top + bottom) / 2;
          const clash = wallLines.some((o) => o.floor !== floor && o.orient === orient && o.line === line && o.a < v && o.b > u && o.low < top && o.high > bottom);
          if (!clash) {
            if (orient === 'x') box(p.src.solid, wpal.wall, c, cy, line, len, hgt, WALL_T);
            else box(p.src.solid, wpal.wall, line, cy, c, WALL_T, hgt, len);
          } else {
            // One collider for the whole wall, and a half-thickness slab per room on its own side, in its own look and to its own height.
            if (orient === 'x') b.box(c, cy, line, len / 2, hgt / 2, WALL_T / 2, 0, Layer.World);
            else b.box(line, cy, c, WALL_T / 2, hgt / 2, len / 2, 0, Layer.World);
            for (const e of covering) {
              const ht = e.top - bottom, hy = (e.top + bottom) / 2, off = e.side * WALL_T / 4, col = THEMES[themeOf(e.room)].wall;
              if (orient === 'x') box(p.src.solid, col, c, hy, line + off, len, ht, WALL_T / 2, null);
              else box(p.src.solid, col, line + off, hy, c, WALL_T / 2, ht, len, null);
            }
          }
          if (!inGap) {
            if (isFinal(covering[0].room)) shell(p.src.solid, plinth(orient as WallOrient, line, u2, v2, fy, wpal.trim, WALL_T));
            else if (orient === 'x') box(p.src.solid, wpal.trim, c, fy + 0.2, line, len, 0.4, WALL_T + 0.12, null);
            else box(p.src.solid, wpal.trim, line, fy + 0.2, c, WALL_T + 0.12, 0.4, len, null);
            // The string course along each final room's face, kept to its inner faces (a z wall's stops short of the
            // x walls' course, so none overlap in the corners).
            for (const e of covering) {
              if (!isFinal(e.room)) continue;
              const i = innerOf(e.room, WALL_T);
              const [lo2, hi2] = orient === 'x' ? [i.x0, i.x1] : [i.z0 + SHELL.courseOut, i.z1 - SHELL.courseOut];
              const a = Math.max(u, lo2), bb = Math.min(v, hi2);
              if (bb - a > 0.05) shell(p.src.solid, course(orient as WallOrient, line, e.side, a, bb, fy, THEMES[themeOf(e.room)].trim, WALL_T));
            }
          }
        }
      }
    }

    // The final rooms' cornice under the ceiling, and a pilaster in each inner corner clear of doorways.
    for (const r of def.rooms) {
      if (!isFinal(r)) continue;
      const fy = floorY(def, r.floor), h = roomHeight(def, r), g = part(r.floor).src.solid, trim = THEMES[themeOf(r)].trim;
      shell(g, roomCornice(r, fy + h, trim, WALL_T));
      const clear = (o: WallOrient, line: number, a: number, bb: number) => !(gapsBy.get(`${r.floor}:${o}:${line}`) ?? []).some(([g0, g1]) => g0 < bb && g1 > a);
      shell(g, cornerPiers(r, fy, h, trim, clear, WALL_T));
    }

    // --- stairs, railings, drop rims ------------------------------------------------
    for (const d of def.doors) {
      const a = rooms.get(d.from)!, c = rooms.get(d.to)!;
      const s = stairPlacement(d, a, c);
      if (s) this.buildStairs(b, box, part(s.lower.floor).src.solid, part(s.upper.floor).src.solid, s, floorY(def, s.lower.floor), floorHeightOf(def));
      const hole = dropHole(d, a, c);
      if (hole) {
        const fy = floorY(def, a.floor), g = part(a.floor).src.solid;
        for (const [x, z, w, dd] of [[hole.x - 0.2, hole.z - 0.2, hole.w + 0.4, 0.2], [hole.x - 0.2, hole.z + hole.d, hole.w + 0.4, 0.2], [hole.x - 0.2, hole.z, 0.2, hole.d], [hole.x + hole.w, hole.z, 0.2, hole.d]]) {
          box(g, THEMES[themeOf(a)].trim, x + w / 2, fy + 0.04, z + dd / 2, w, 0.08, dd, null);
        }
      }
    }

    // --- things ----------------------------------------------------------------------
    for (const t of def.things) {
      const r = rooms.get(t.room)!;
      const fy = floorY(def, r.floor), p = part(r.floor);
      if (t.kind === 'boss') {
        this.spawns.push({ id: t.id, type: t.type, room: r.id, x: r.x + r.w / 2, y: fy, z: r.z + r.d / 2 });
        if (t.type === 'gravelheart') {
          const door = def.doors.find((d) => d.lock === 'boss' && (d.to === r.id || d.from === r.id));
          const seal = def.doors.find((d) => d.from === r.id && d.lock && typeof d.lock === 'object' && 'cleared' in d.lock && d.lock.cleared === r.id);
          const hearth = new WardenHearth(b, p.dynamic, r, fy, door ? this.doors.get(door.id) ?? null : null, seal ? this.doors.get(seal.id) ?? null : null);
          this.hearth = hearth;
          this.triggers.push({ id: 'trigger.heartVessel', x: hearth.vessel.x, z: hearth.vessel.z, y: fy, r: 1.4, enabled: () => hearth.vessel.visible });
          // Walking well into the room (3 m past the door) springs the fight, once content arms it.
          // (Rooms can be big: the trigger sits just inside the door, not around the room's middle.)
          const dp = door ? this.doors.get(door.id)?.group.position : undefined;
          // Straight in from the wall the door is in (the nearest one).
          const walls = dp ? ([[dp.z - r.z, 0, 1], [r.z + r.d - dp.z, 0, -1], [dp.x - r.x, 1, 0], [r.x + r.w - dp.x, -1, 0]] as const) : [];
          const inward = walls.length ? walls.reduce((m, w) => (w[0] < m[0] ? w : m)) : null;
          const tx = dp && inward ? dp.x + inward[1] * 4.5 : hearth.center.x, tz = dp && inward ? dp.z + inward[2] * 4.5 : hearth.center.z;
          this.triggers.push({ id: 'trigger.warden', x: tx, z: tz, y: fy, r: dp ? 3.5 : Math.min(r.w, r.d) / 2 - 3, enabled: () => hearth.armed && !hearth.sealed });
        }
        continue;
      }
      const [x, z] = worldPos(r, t.at);
      const faceCenter = Math.atan2(r.x + r.w / 2 - x, r.z + r.d / 2 - z);
      if (t.kind === 'chest') {
        const chest = new Chest(b, x, z, fy, faceCenter);
        p.dynamic.add(chest.group);
        if (t.appears) chest.setPresent(false);
        this.chests.set(t.id, chest);
        this.interactables.push({ id: t.id, x, z, y: fy, r: 2.4, label: 'Open', promptY: fy + 1.9, enabled: () => chest.present && !chest.opened });
      } else if (t.kind === 'switch') {
        this.switches.set(t.id, new DungeonSwitch(p.dynamic, t.id, t.style ?? 'crystal', x, fy, z, b));
        // Beyond the prism, facing away from the door (where the message it reveals is read).
        if (t.style === 'prism') this.entrances[`${t.id}.beyond`] = { x, z: z - 4, y: fy + 0.05, facing: Math.PI };
      } else if (t.kind === 'stone' && t.role === 'bridge') {
        // Lies along +z from its spot; long enough to reach 1.5 m past the pit's far lip.
        const pit = (r.features ?? []).find((f) => f.kind === 'pit');
        if (!pit) throw new Error(`Bridge stone ${t.id} has no pit in its room`);
        const lipW = r.x + pit.x, lipE = r.x + pit.x + pit.w;
        const side = lipW + pit.w / 2 > x ? 1 : -1;
        const length = (side > 0 ? lipE - x : x - lipW) + 1.5;
        this.columns.set(t.id, new FallenColumn(b, p.dynamic, t.id, x, fy, z, length, side, this.heavyGlow));
      } else if (t.kind === 'stone') {
        this.stones.set(t.id, new Wakestone(b, p.dynamic, t.id, x, fy, z, !!t.heavy, this.heavyGlow));
        const cell = cellAt(r, x, z)!;
        this.stoneState.set(t.id, { room: r, cell, home: { ...cell }, sunk: false });
      } else if (t.kind === 'sign') {
        buildTablet(b, p.dynamic, x, fy, z, faceCenter);
        this.interactables.push({ id: t.id, x, z, y: fy, r: 2.2, label: 'Read', promptY: fy + 2.1, enabled: () => true });
      } else if (t.kind === 'sigil') {
        const sigil = new SigilLook(b, t.id, x, fy, z);
        if (t.appears) sigil.setPresent(false);
        this.sigils.set(t.id, sigil);
        this.interactables.push(sigil.interactable);
      } else if (t.kind === 'landmark') {
        buildLandmark(b, p.src.solid, t.style, themeOf(r), x, fy, z, t.facing ?? 0);
      } else if (t.kind === 'bellPost') {
        const post = new BellPost(b, t.bell, x, fy, z, t.facing ?? faceCenter);
        p.dynamic.add(post.group);
        this.bellPosts.set(t.bell, post);
        this.bellPostsById.set(t.id, post);
        this.entrances[t.id] = { ...post.arrival(), y: fy + 0.05 };
        this.interactables.push({ id: t.id, x: post.front.x, z: post.front.z, y: fy, r: 2.2, get label() { return post.label; }, promptY: fy + 3.2, enabled: () => !post.hanging });
      } else if (t.kind === 'bell') {
        const by = fy + (t.up ?? 0);
        const pickup = new BellPickup(b, t.bell, x, by, z);
        p.dynamic.add(pickup.group);
        this.bellPickups.set(t.id, pickup);
        this.interactables.push({ id: t.id, x, z, y: by, r: 2, label: 'Take', promptY: by + 2.2, enabled: () => pickup.present });
      } else if (t.kind === 'enemy') {
        const ledge = t.up === undefined ? undefined : (r.platforms ?? []).find((p) => !p.move && p.top === t.up && Math.hypot(t.at[0] - p.x, t.at[1] - p.z) <= p.r);
        this.spawns.push({ id: t.id, type: t.type, room: r.id, x, y: fy + (t.up ?? 0), z, facing: t.facing, leash: ledge && { x: r.x + ledge.x, z: r.z + ledge.z, r: ledge.r } });
      }
    }
    this.placeSconces(def, gapsBy, (floor) => part(floor).src.solid);
    for (const r of def.rooms) {
      const hasStones = def.things.some((t) => t.room === r.id && (t.kind === 'stone' || (t.kind === 'switch' && t.style === 'plate')));
      const rand = mulberry32(r.x * 7919 + r.z * 104729 + r.floor * 31);
      const { faces } = decorateRoom(b, part(r.floor).src.solid, part(r.floor).src.solid, r, floorY(def, r.floor), roomHeight(def, r), (sp) => this.wallSpots(def, r, gapsBy, sp, !hasStones), hasStones, rand, this.sconceSpots.filter((c) => c.room === r.id));
      for (const f of faces) this.faceSpots.push({ room: r.id, x: f.x, z: f.z });
    }

    this.spawn = { x: ex, y: floorY(def, er.floor) + 0.05, z: ez, facing: yawOf[def.entrance.facing] };
    const done = b.finish();
    this.root = done.root;
    this.sconceGlow.finish(this.root);
    for (const [floor, p] of this.floors) {
      const s = src.get(floor)!;
      p.solid = mergeStatic(s.solid, 80, BAKE.atBuild);
      p.ceiling = mergeStatic(s.ceiling);
      disposeTree(s.solid);
      disposeTree(s.ceiling);
      // Corner shade (render/bakeLight.ts, the indoor profile): each floor alone, its ceilings left out so the open top
      // counts as sky; the lamps still do the lighting.
      if (BAKE.atBuild) queueBake(`${def.id} floor ${floor}`, collectBakeSet(p.solid), [EVERYWHERE], 'indoor');
      this.root.add(p.solid, p.ceiling, p.dynamic);
    }
    this.disposer = done.dispose;
  }

  /** Steps (solid, for looks and side collisions) plus one smooth ramp on top to walk on. */
  private buildStairs(
    b: AreaBuilder,
    box: (g: THREE.Group, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, layer?: number | null) => void,
    lowerG: THREE.Group, upperG: THREE.Group,
    s: NonNullable<ReturnType<typeof stairPlacement>>, fy: number, rise: number,
  ) {
    const [dx, dz] = DIRS[s.up];
    const run = Math.abs(dx) ? s.rect.w : s.rect.d;
    const tread = run / STEPS, stepH = rise / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const along = (i + 0.5) * tread, top = (i + 1) * stepH;
      const cx = s.foot[0] + dx * along, cz = s.foot[1] + dz * along;
      const sx = dx ? tread : s.width, sz = dz ? tread : s.width;
      box(lowerG, THEMES[themeOf(s.lower)].stair, cx, fy + top / 2, cz, sx, top, sz);
      // The nosing: a strip along each tread's front edge, 1 cm proud of the tread's top, front and sides
      // (flush faces would z-fight with it).
      box(lowerG, THEMES[themeOf(s.lower)].trim, cx + dx * (tread / 2 - 0.03), fy + top - 0.02, cz + dz * (tread / 2 - 0.03), dx ? 0.08 : s.width + 0.02, 0.06, dz ? 0.08 : s.width + 0.02, null);
    }
    // The ramp: a thin box whose top surface runs from the foot (floor) to the top (floor above).
    const L = Math.hypot(run, rise), t = 0.4;
    const xAxis = new THREE.Vector3(dx * run, rise, dz * run).normalize();
    const yAxis = new THREE.Vector3(-dx * rise, run, -dz * rise).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const mid = new THREE.Vector3(s.foot[0] + (dx * run) / 2, fy + rise / 2, s.foot[1] + (dz * run) / 2).addScaledVector(yAxis, -t / 2);
    b.orientedBox(mid.x, mid.y, mid.z, L / 2, t / 2, s.width / 2, q);
    // Railings round the shaft upstairs, except at the top where you step off.
    const uy = fy + rise, { x, z, w, d } = s.rect, rh = 1.0, rt = 0.25;
    const rails: [number, number, number, number, Dir][] = [
      [x + w / 2, z - rt / 2, w + rt * 2, rt, 'n'], [x + w / 2, z + d + rt / 2, w + rt * 2, rt, 's'],
      [x - rt / 2, z + d / 2, rt, d, 'w'], [x + w + rt / 2, z + d / 2, rt, d, 'e'],
    ];
    for (const [cx, cz, sx, sz, side] of rails) {
      if (side === s.up) continue;
      box(upperG, THEMES[themeOf(s.upper)].trim, cx, uy + rh / 2, cz, sx, rh, sz, Layer.Prop);
    }
  }

  /**
   * Evenly spaced spots along a room's walls (inner face), clear of doorways and corners;
   * with `deep` (free-standing statues), also clear of stairs (with a 2 m landing), holes,
   * pillars and blocks for the 1.5 m in front of the wall.
   */
  private wallSpots(def: DungeonDef, r: RoomDef, gapsBy: Map<string, [number, number][]>, spacing: number, deep: boolean): WallSpot[] {
    const out: WallSpot[] = [];
    const inset = WALL_T / 2;
    const { holes, stairs } = roomOpenings(def, r);
    // Stairs (and the shaft at their top) also keep a 2 m landing free, so a statue never
    // stands where Wren steps off.
    const landing = (q: Rect): Rect => ({ x: q.x - 2, z: q.z - 2, w: q.w + 4, d: q.d + 4 });
    const solids: Rect[] = [...holes.map((h) => (h.kind === 'stairs' ? landing(h.rect) : h.rect)), ...stairs.map((s) => landing(s.rect))];
    for (const f of r.features ?? []) {
      if (f.kind === 'pillar') solids.push({ x: r.x + f.x - 1, z: r.z + f.z - 1, w: 2, d: 2 });
      else solids.push({ x: r.x + f.x, z: r.z + f.z, w: f.w, d: f.d });
    }
    for (const t of def.things) {
      if (t.room !== r.id) continue;
      if (t.kind === 'landmark') solids.push(landmarkRect(r, t.at));
      // Keep wall decoration a step clear of bell posts and plinths.
      else if (t.kind === 'bellPost' || t.kind === 'bell') {
        const q = bellRect(r, t.at);
        solids.push({ x: q.x - 1, z: q.z - 1, w: q.w + 2, d: q.d + 2 });
      }
    }
    const walls: [string, number, number, number, 'x' | 'z', number][] = [
      [`${r.floor}:x:${r.z}`, r.x, r.x + r.w, r.z + inset, 'x', 0],
      [`${r.floor}:x:${r.z + r.d}`, r.x, r.x + r.w, r.z + r.d - inset, 'x', Math.PI],
      [`${r.floor}:z:${r.x}`, r.z, r.z + r.d, r.x + inset, 'z', Math.PI / 2],
      [`${r.floor}:z:${r.x + r.w}`, r.z, r.z + r.d, r.x + r.w - inset, 'z', -Math.PI / 2],
    ];
    for (const [key, a0, a1, line, axis, yaw] of walls) {
      const gaps = gapsBy.get(key) ?? [];
      const n = Math.floor((a1 - a0 - 2) / spacing);
      for (let k = 0; k < n; k++) {
        const along = a0 + 1 + spacing / 2 + k * spacing + ((a1 - a0 - 2) - n * spacing) / 2;
        if (gaps.some(([g0, g1]) => along > g0 - 1.5 && along < g1 + 1.5)) continue;
        const spot: WallSpot = axis === 'x' ? { x: along, z: line, yaw } : { x: line, z: along, yaw };
        if (deep) {
          const depth: Rect = axis === 'x'
            ? { x: along - 0.8, z: yaw === 0 ? line : line - 1.5, w: 1.6, d: 1.5 }
            : { x: yaw > 0 ? line : line - 1.5, z: along - 0.8, w: 1.5, d: 1.6 };
          if (solids.some((q) => q.x < depth.x + depth.w && depth.x < q.x + q.w && q.z < depth.z + depth.d && depth.z < q.z + q.d)) continue;
        }
        out.push(spot);
      }
    }
    return out;
  }

  /** Two sconces per room on its longer walls, kept clear of doorways: the iron merged with the floor's scenery, the flame alive. */
  private placeSconces(def: DungeonDef, gapsBy: Map<string, [number, number][]>, solidOf: (floor: number) => THREE.Group) {
    const sconce = (floor: number, parent: THREE.Object3D, x: number, y: number, z: number, yaw: number) => {
      const iron = kitMesh(sconceIron(), 'metal');
      iron.position.set(x, y, z);
      iron.rotation.y = yaw;
      solidOf(floor).add(iron);
      this.sconceGlow.add(parent, x, y, z, yaw);
    };
    for (const r of def.rooms) {
      const fy = floorY(def, r.floor), p = this.floors.get(r.floor)!;
      const alongX = r.w >= r.d;
      const walls: [string, number, number][] = alongX
        ? [[`${r.floor}:x:${r.z}`, r.z + WALL_T / 2 + 0.2, 0], [`${r.floor}:x:${r.z + r.d}`, r.z + r.d - WALL_T / 2 - 0.2, Math.PI]]
        : [[`${r.floor}:z:${r.x}`, r.x + WALL_T / 2 + 0.2, Math.PI / 2], [`${r.floor}:z:${r.x + r.w}`, r.x + r.w - WALL_T / 2 - 0.2, -Math.PI / 2]];
      for (const [key, line, yaw] of walls) {
        const gaps = gapsBy.get(key) ?? [];
        const [a0, a1] = alongX ? [r.x, r.x + r.w] : [r.z, r.z + r.d];
        const at = [0.5, 0.3, 0.7].map((f) => a0 + (a1 - a0) * f).find((v) => !gaps.some(([g0, g1]) => v > g0 - 1 && v < g1 + 1));
        if (at === undefined) continue;
        const [sx, sz] = alongX ? [at, line] : [line, at];
        sconce(r.floor, p.dynamic, sx, fy + 3.2, sz, yaw);
        this.sconceSpots.push({ room: r.id, x: sx, z: sz });
      }
    }
  }

  nameAt() {
    return this.def.name;
  }

  enemySpot() {
    return null;
  }

  cut() {
    return [];
  }

  /** Which floor a feet height is on. */
  floorAt(y: number) {
    return Math.round(y / floorHeightOf(this.def));
  }

  /** The dungeon's fog: the same in every room (see `DUNGEON_FOG`). */
  fogAt(): FogLook {
    return DUNGEON_FOG;
  }

  /**
   * The room containing a point, or null (doorways and walls belong to no room). `margin`
   * shrinks every room, e.g. to tell "well inside the room" from "still in the doorway".
   */
  roomAt(p: THREE.Vector3, margin = 0): RoomDef | null {
    const f = this.floorAt(p.y);
    return this.def.rooms.find((r) => r.floor === f && p.x > r.x + margin && p.x < r.x + r.w - margin && p.z > r.z + margin && p.z < r.z + r.d - margin) ?? null;
  }

  /**
   * The sword swings: crystal switches in reach light up, and the nearest wakestone in front
   * of Wren (on this floor) is pushed one cell away, along whichever axis Wren is more
   * squarely behind it on.
   */
  strike(x: number, y: number, z: number, dirX: number, dirZ: number, reach: number) {
    for (const s of this.switches.values()) {
      if ((s.style !== 'crystal' && s.style !== 'prism') || s.pressed) continue;
      const p = s.group.position, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (Math.abs(p.y - y) > 2.5 || d > reach + 0.5 || (d > 0.6 && (dx * dirX + dz * dirZ) / d < 0.2)) continue;
      if (s.prism) {
        // Several hits: each one is announced, the last one presses the switch.
        const hits = s.prism.hit();
        if (!hits) continue;
        this.onPrismHit?.(hits, s.prism.position);
        if (!s.prism.shattered) continue;
      }
      s.setPressed(true);
      this.onSwitch?.(s.id);
    }
    let best: string | null = null, bestD = Infinity;
    for (const [id, st] of this.stoneState) {
      if (st.sunk) continue;
      const p = this.stones.get(id)!.group.position, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (Math.abs(p.y - y) > 1.5 || d > reach + 0.9 || d < 0.01 || (dx * dirX + dz * dirZ) / d < 0.5 || d >= bestD) continue;
      best = id;
      bestD = d;
    }
    if (!best) return;
    const p = this.stones.get(best)!.group.position;
    const dx = p.x - x, dz = p.z - z;
    const dir: Cell = Math.abs(dx) >= Math.abs(dz) ? { i: Math.sign(dx), j: 0 } : { i: 0, j: Math.sign(dz) };
    const wren = new THREE.Vector3(x, y, z);
    let result: StoneResult = this.stones.get(best)!.heavy ? 'heavy' : this.moveStone(best, dir, wren);
    if (result === 'blocked' && this.canBounce(best, dir)) result = this.bounce(best, dir);
    this.onStone?.(best, result, p.clone());
  }

  /**
   * A light stone struck against something solid (a wall, a pillar, another stone, a chest)
   * bounces one cell back toward Wren, knocking Wren back out of the way (no damage). Only
   * if Wren has floor to be knocked onto: the cell behind Wren must be open, solid floor.
   * This way no stone can ever get stuck against a wall.
   */
  private canBounce(id: string, dir: Cell) {
    const s = this.stoneState.get(id)!;
    const ahead = this.cellBlocker(s, { i: s.cell.i + dir.i, j: s.cell.j + dir.j });
    if (ahead === 'free' || ahead === 'player' || ahead === 'pit') return false;
    const back = { i: s.cell.i - dir.i, j: s.cell.j - dir.j };
    const behind = { i: s.cell.i - 2 * dir.i, j: s.cell.j - 2 * dir.j };
    return this.cellBlocker(s, back) === 'free' && this.cellBlocker(s, behind) === 'free';
  }

  private bounce(id: string, dir: Cell): StoneResult {
    const s = this.stoneState.get(id)!;
    s.cell = { i: s.cell.i - dir.i, j: s.cell.j - dir.j };
    const [cx, cz] = cellCenter(s.room, s.cell);
    // Hold a beat while Wren is knocked clear, then slide into the space Wren left.
    this.stones.get(id)!.moveTo(cx, floorY(this.def, s.room.floor), cz, 0.3, 0.12, true);
    this.checkPlates(s, s.cell);
    return 'bounced';
  }

  /** What's in a cell, for a stone in `s`'s room: free floor, or what stops a stone. */
  private cellBlocker(s: StoneState, c: Cell, player?: THREE.Vector3): 'free' | 'edge' | 'solid' | 'stone' | 'chest' | 'pit' | 'player' {
    const g = this.grid(s.room);
    if (c.i < 0 || c.j < 0 || c.i >= g.cols || c.j >= g.rows) return 'edge';
    if (g.blocked[c.i][c.j]) return 'solid';
    for (const o of this.stoneState.values()) if (o !== s && !o.sunk && o.room === s.room && o.cell.i === c.i && o.cell.j === c.j) return 'stone';
    for (const t of this.def.things) {
      if (t.kind !== 'chest' || t.room !== s.room.id || !this.chests.get(t.id)!.present) continue;
      const cc = cellAt(s.room, s.room.x + t.at[0], s.room.z + t.at[1]);
      if (cc && cc.i === c.i && cc.j === c.j) return 'chest';
    }
    if (g.pit[c.i][c.j] && !(this.filled.get(s.room.id)?.has(`${c.i},${c.j}`))) return 'pit';
    if (player) {
      const [cx, cz] = cellCenter(s.room, c);
      if (Math.abs(player.x - cx) < CELL / 2 + 0.45 && Math.abs(player.z - cz) < CELL / 2 + 0.45) return 'player';
    }
    return 'free';
  }

  /**
   * After a stone moves within `s`'s room: plates under a stone press (and tell content);
   * hold plates with no stone left on them rise again.
   */
  private checkPlates(s: StoneState, _at?: Cell) {
    for (const t of this.def.things) {
      if (t.kind !== 'switch' || t.style !== 'plate' || t.room !== s.room.id) continue;
      const c = cellAt(s.room, s.room.x + t.at[0], s.room.z + t.at[1])!;
      const plate = this.switches.get(t.id)!;
      const occupied = [...this.stoneState.values()].some((o) => !o.sunk && o.room === s.room && o.cell.i === c.i && o.cell.j === c.j);
      if (occupied && !plate.pressed) {
        plate.setPressed(true);
        this.onSwitch?.(t.id);
      } else if (!occupied && plate.pressed && t.hold && !this.latched.has(t.id)) plate.setPressed(false);
    }
  }

  /** Hold plates whose door or chest has opened: they stay down now (content latches them). */
  readonly latched = new Set<string>();

  private grid(room: RoomDef) {
    let g = this.grids.get(room.id);
    if (!g) this.grids.set(room.id, (g = roomGrid(this.def, room)));
    return g;
  }

  /** Where a stone is on its room's grid, and whether it has dropped into a pit. */
  stoneCell(id: string) {
    const s = this.stoneState.get(id)!;
    return { room: s.room.id, ...s.cell, sunk: s.sunk };
  }

  /**
   * The Tether Glove, thrown from Wren's feet at (x, y, z) toward (dirX, dirZ): the stone it
   * catches slides one cell toward Wren, heavy or not, as the puzzle checker assumes (Wren in
   * line with it, up to `PULL_RANGE` cells, nothing between). A fallen column swings across
   * its pit. Returns where the cord caught something and what happened, or null on a miss.
   */
  tether(x: number, y: number, z: number, dirX: number, dirZ: number): { at: THREE.Vector3; result: StoneResult } | null {
    const range = PULL_RANGE * CELL;
    const wren = new THREE.Vector3(x, y, z);
    const aimed = (p: THREE.Vector3, maxD: number, cone: number) => {
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      return Math.abs(p.y - y) < 1.8 && d <= maxD && d > 0.5 && (dx * dirX + dz * dirZ) / d >= cone ? d : null;
    };
    // A fallen column: a big target, grabbed from anywhere across its pit.
    for (const c of this.columns.values()) {
      if (c.laid) continue;
      const g = c.grip;
      if (aimed(g, range + 6, 0.55) === null || (x - c.x) * c.side < 3) continue;
      c.swing();
      const room = this.roomAt(new THREE.Vector3(c.x, y, c.z));
      if (room) {
        // Its row of pit cells counts as filled (floor), like a stone dropped in.
        const filled = this.filled.get(room.id) ?? new Set<string>();
        const g2 = this.grid(room);
        const row = cellAt(room, c.x, c.z)!.j;
        for (let i = 0; i < g2.cols; i++) if (g2.pit[i][row]) filled.add(`${i},${row}`);
        this.filled.set(room.id, filled);
      }
      this.onStone?.(c.id, 'bridged', g);
      return { at: g, result: 'bridged' };
    }
    let best: string | null = null, bestD = Infinity;
    for (const [id, st] of this.stoneState) {
      if (st.sunk) continue;
      const d = aimed(this.stones.get(id)!.group.position, range + 0.9, 0.8);
      if (d !== null && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    if (!best) {
      // Aim assist: nothing in front, so the nearest stone Wren stands in line with (its row
      // or column), in range, wherever it is; Wren turns to it. Turning shouldn't cost a step
      // into the very cell the stone needs.
      for (const [id, st] of this.stoneState) {
        if (st.sunk) continue;
        const q = this.stones.get(id)!.group.position, dx = q.x - x, dz = q.z - z;
        const d = Math.hypot(dx, dz);
        if (Math.abs(q.y - y) > 1.8 || d > range + 0.9 || d < 0.5 || Math.min(Math.abs(dx), Math.abs(dz)) > CELL * 0.65 || d >= bestD) continue;
        best = id;
        bestD = d;
      }
    }
    if (!best) return null;
    const stone = this.stones.get(best)!, s = this.stoneState.get(best)!;
    const at = stone.group.position.clone().setY(stone.group.position.y + stone.size / 2);
    const dx = x - stone.group.position.x, dz = z - stone.group.position.z;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const dir: Cell = alongX ? { i: Math.sign(dx), j: 0 } : { i: 0, j: Math.sign(dz) };
    // In line with it (its row or column, give or take), and nothing between.
    const off = alongX ? Math.abs(dz) : Math.abs(dx);
    const cells = Math.round((alongX ? Math.abs(dx) : Math.abs(dz)) / CELL);
    let clear = off < CELL * 0.65;
    for (let k = 1; clear && k < cells; k++) {
      const what = this.cellBlocker(s, { i: s.cell.i + dir.i * k, j: s.cell.j + dir.j * k });
      if (what === 'solid' || what === 'stone' || what === 'chest') clear = false;
    }
    const result: StoneResult = clear ? this.moveStone(best, dir, wren) : 'blocked';
    this.onStone?.(best, result, at);
    return { at, result };
  }

  /**
   * Moves a stone one cell in `dir` if it can go: inside its room, not into anything solid,
   * another stone, or Wren (`player`, feet). Into an open pit it drops and fills it; onto a
   * floor plate, the plate presses. (Pushing and the glove's pull both come through here.)
   */
  moveStone(id: string, dir: Cell, player?: THREE.Vector3): StoneResult {
    const s = this.stoneState.get(id);
    const stone = this.stones.get(id);
    if (!s || !stone || s.sunk || stone.moving) return 'blocked';
    const g = this.grid(s.room);
    const to = { i: s.cell.i + dir.i, j: s.cell.j + dir.j };
    const what = this.cellBlocker(s, to, player);
    if (what !== 'free' && what !== 'pit') return 'blocked';
    const [cx, cz] = cellCenter(s.room, to);
    const fy = floorY(this.def, s.room.floor);
    const filled = this.filled.get(s.room.id) ?? new Set<string>();
    s.cell = to;
    if (g.pit[to.i][to.j] && !filled.has(`${to.i},${to.j}`)) {
      // Into the pit: slide over the edge, then settle with its top flush with the floor.
      filled.add(`${to.i},${to.j}`);
      this.filled.set(s.room.id, filled);
      s.sunk = true;
      stone.moveTo(cx, fy - stone.size, cz, 0.45);
      return 'sunk';
    }
    stone.moveTo(cx, fy, cz);
    this.checkPlates(s, to);
    return 'moved';
  }

  /**
   * Puts a room's stones back where they started (Wren left the room), except stones that
   * fell into pits or rest on pressed plates: those are progress.
   */
  resetRoom(roomId: string) {
    const plateCells = new Set<string>();
    for (const t of this.def.things) {
      if (t.kind === 'switch' && t.style === 'plate' && t.room === roomId && this.switches.get(t.id)!.pressed) {
        const r = this.def.rooms.find((x) => x.id === roomId)!;
        const c = cellAt(r, r.x + t.at[0], r.z + t.at[1]);
        if (c) plateCells.add(`${c.i},${c.j}`);
      }
    }
    for (const [id, s] of this.stoneState) {
      if (s.room.id !== roomId || s.sunk || plateCells.has(`${s.cell.i},${s.cell.j}`)) continue;
      if (s.cell.i === s.home.i && s.cell.j === s.home.j) continue;
      s.cell = { ...s.home };
      const [cx, cz] = cellCenter(s.room, s.home);
      this.stones.get(id)!.moveTo(cx, floorY(this.def, s.room.floor), cz, 0);
    }
    const any = [...this.stoneState.values()].find((s) => s.room.id === roomId);
    if (any) this.checkPlates(any);
  }

  /**
   * Whether feet at `p` are down in a pit: inside a pit's outline and below its floor.
   * (Not "below the nearest floor": halfway up a staircase the nearest floor is the other one.)
   */
  /** The `trial` room at `p` (any height inside its footprint, down to its pits), if any. */
  trialRoomAt(p: THREE.Vector3): RoomDef | null {
    for (const r of this.def.rooms) {
      if (!r.trial || p.x < r.x || p.x > r.x + r.w || p.z < r.z || p.z > r.z + r.d) continue;
      const fy = floorY(this.def, r.floor);
      if (p.y > fy - PIT_DEPTH - 1 && p.y < fy + roomHeight(this.def, r)) return r;
    }
    return null;
  }

  inPit(p: THREE.Vector3) {
    for (const r of this.def.rooms) {
      const fy = floorY(this.def, r.floor);
      if (p.y > fy - 0.8 || p.y < fy - PIT_DEPTH - 1) continue;
      for (const f of r.features ?? []) {
        if (f.kind !== 'pit') continue;
        const x = p.x - r.x, z = p.z - r.z;
        if (x > f.x && x < f.x + f.w && z > f.z && z < f.z + f.d) return true;
      }
    }
    return false;
  }

  /**
   * Whether `p` is on a flight of stairs or over the shaft at its top, on this floor
   * (enemies are kept off both; `margin` widens them).
   */
  onStairs(p: THREE.Vector3, margin = 0) {
    const f = this.floorAt(p.y);
    for (const r of this.def.rooms) {
      if (r.floor !== f) continue;
      const { holes, stairs } = roomOpenings(this.def, r);
      const rects = [...stairs.map((s) => s.rect), ...holes.filter((h) => h.kind === 'stairs').map((h) => h.rect)];
      if (rects.some((q) => p.x > q.x - margin && p.x < q.x + q.w + margin && p.z > q.z - margin && p.z < q.z + q.d + margin)) return true;
    }
    return false;
  }

  /**
   * Whether `p` is within `margin` of a pit's outline, on either side of it. Ground this close
   * to the lip can't be trusted as a place to come back to (the character can hang over the edge).
   */
  nearPit(p: THREE.Vector3, margin: number) {
    for (const r of this.def.rooms) {
      if (Math.abs(p.y - floorY(this.def, r.floor)) > 1) continue;
      for (const f of r.features ?? []) {
        if (f.kind !== 'pit') continue;
        const x = p.x - r.x, z = p.z - r.z;
        const outer = x > f.x - margin && x < f.x + f.w + margin && z > f.z - margin && z < f.z + f.d + margin;
        const inner = x > f.x + margin && x < f.x + f.w - margin && z > f.z + margin && z < f.z + f.d - margin;
        if (outer && !inner) return true;
      }
    }
    return false;
  }

  /** Shows only one floor with no ceilings (top-down views), or everything again (null). */
  showFloor(floor: number | null) {
    for (const [f, p] of this.floors) {
      const on = floor === null || f === floor;
      p.solid.visible = p.dynamic.visible = on;
      p.ceiling.visible = floor === null;
    }
  }

  movePlatforms(dt: number) {
    this.platformT += dt;
    for (const c of this.courses) c.update(this.platformT);
  }

  /** Moves the pooled lights to the sources nearest `focus`; sources fade in and out as they enter or leave the nearest few. */
  private updateLights(dt: number, focus: THREE.Vector3) {
    const src = this.lightSources;
    if (!src.length) return;
    const first = !this.lightPool.length;
    if (first) {
      for (let i = 0; i < LIGHT_POOL; i++) {
        const light = new THREE.PointLight(0xffffff, 0, 10, 1.2);
        this.root.add(light);
        this.lightPool.push({ light, src: -1 });
      }
    }
    const near = src.map((s, i) => ({ i, d: s.pos.distanceToSquared(focus) })).sort((a, b) => a.d - b.d);
    const wanted = new Set(near.slice(0, LIGHTS_NEAR).map((n) => n.i));
    if (first) for (const i of wanted) src[i].w = 1; // no fade-in on arrival
    const k = Math.min(1, dt * 4);
    src.forEach((s, i) => (s.w += ((wanted.has(i) ? 1 : 0) - s.w) * k));
    // Keep a source in its slot while it still glows; free the slots of those that have faded out.
    const held = new Set<number>();
    for (const slot of this.lightPool) {
      if (slot.src >= 0 && src[slot.src].w > 0.02) held.add(slot.src);
      else slot.src = -1;
    }
    for (const n of near.slice(0, LIGHTS_NEAR)) {
      if (held.has(n.i)) continue;
      const slot = this.lightPool.find((s) => s.src < 0);
      if (!slot) break;
      slot.src = n.i;
      held.add(n.i);
    }
    for (const slot of this.lightPool) {
      const s = slot.src >= 0 ? src[slot.src] : null;
      if (!s) {
        slot.light.intensity = 0;
        continue;
      }
      slot.light.position.copy(s.pos);
      slot.light.color.setHex(s.color);
      slot.light.distance = s.distance;
      slot.light.intensity = s.base * s.w * (0.92 + Math.sin(this.t * 7 + s.phase) * 0.04 + Math.sin(this.t * 13 + s.phase) * 0.03);
    }
  }

  update(dt: number, _env: AreaEnv) {
    this.t += dt;
    for (const d of this.doors.values()) d.update(dt);
    this.hearth?.update(dt);
    for (const c of this.chests.values()) c.update(dt);
    for (const g of this.sigils.values()) g.update(dt);
    for (const s of this.switches.values()) s.update(dt);
    for (const s of this.stones.values()) s.update(dt);
    for (const c of this.columns.values()) c.update(dt);
    for (const post of this.bellPosts.values()) post.update(dt);
    for (const bell of this.bellPickups.values()) bell.update(dt);
    this.sconceGlow.update(this.t);
    this.heavyGlow.emissive.setRGB(0.1, 0.55 + Math.sin(this.t * 2.4) * 0.2, 0.5 + Math.sin(this.t * 2.4) * 0.18);
    if (_env.playerPos) this.updateLights(dt, _env.playerPos);
  }

  dispose() {
    for (const c of this.courses) c.dispose();
    this.disposer();
  }
}

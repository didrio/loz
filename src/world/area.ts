import * as THREE from 'three';
import type { RAPIER } from '../core/physics';
import { Layer, Physics } from '../core/physics';
import type { MusicMood } from '../core/tracks';
import type { BellId, BellPost } from './bell';
import type { BrokenJar } from './jars';
import type { ThornHit } from './overworld/blight';
import type { MurmurbudLook } from './murmurbud';
import { BAKE, collectBakeSet, queueBake, type LightRegion } from '../render/bakeLight';
import { disposeTree, mergeStatic } from '../render/materials';
import type { AtmosphereId, FogLook } from '../render/atmosphere';

/**
 * An Area is one loadable place: the overworld, a dungeon, a house interior. It owns its
 * meshes and colliders, says where the player starts, and lists what can be interacted
 * with. What those things *do* lives in `src/content/`, bound by id.
 */
export interface Area {
  readonly id: string;
  readonly root: THREE.Group;
  readonly spawn: Spot;
  /** Named places to arrive at from elsewhere (e.g. `shrineDoor`: just outside the shrine). */
  readonly entrances?: Record<string, Spot>;
  /** The keepers' bell posts standing here, by the bell that fits each (docs/bells.md). */
  readonly bellPosts?: ReadonlyMap<BellId, BellPost>;
  /** Water surface height, if the area has water (for wading). */
  readonly waterLevel: number | null;
  /** The water level at (x, z) when it differs from `waterLevel` (a region with its own: Sallowmere). null: none there. */
  waterLevelAt?(x: number, z: number): number | null;
  /** Where NPC voices are heard: outdoors (dry), a house (close), a dungeon (big). Omitted = outdoors. */
  readonly voiceRoom?: 'outdoors' | 'house' | 'dungeon';
  readonly interactables: Interactable[];
  readonly triggers: Trigger[];
  /** A dungeon's iconic view (world coordinates); the HUD's corner shows a still render of it instead of the sky dial. */
  readonly portrait?: { eye: THREE.Vector3; target: THREE.Vector3 };
  /** Name shown when the player walks into a part of the area. */
  nameAt(x: number, z: number): string;
  /** A random spot where an enemy may appear, optionally in a ring around `near`. */
  enemySpot(rand: () => number, near?: THREE.Vector3, minDist?: number, maxDist?: number): { x: number; z: number } | null;
  /** How many thornlings roam here. */
  readonly enemyCount: number;
  /** Where some of them always wait instead (out of `enemyCount`; the blighted valley's guards). */
  readonly enemyPosts?: readonly { x: number; z: number; count: number }[];
  /**
   * Indoors (dungeons, interiors): no sky or sun, its own dim light and dark fog, the clock
   * stands still, no night wisps or respawning field enemies, and a closer camera.
   */
  readonly indoor?: boolean;
  /** Indoors: the fog where `p` stands (a dungeon wing's, per room); the sky eases toward it. Default dark fog if omitted. */
  fogAt?(p: THREE.Vector3): FogLook;
  /**
   * Which atmosphere (render/atmosphere.ts) applies where `x, z` is: the sky, light, fog and motes follow it, easing
   * across as Wren moves from one to the next. Omitted: the valley's outdoors, the shrine's indoors.
   */
  atmosphereAt?(x: number, z: number): AtmosphereId;
  /** This area's own theme (a dungeon's); the field's day/night themes if omitted. */
  readonly music?: MusicMood;
  /** A theme for a part of the area (the village by day), or undefined for the usual one. */
  musicAt?(x: number, z: number, night: boolean): MusicMood | undefined;
  /** Safe ground (the village): enemies never step onto it and leave Wren alone there. */
  safeGround?(x: number, z: number): boolean;
  /** Cuts grass/bushes in a sword arc; returns where things were cut. */
  cut(x: number, z: number, dirX: number, dirZ: number, reach: number): THREE.Vector3[];
  /** Breaks jars in a sword arc (same reach as `cut`); each says what it held. */
  breakJars?(x: number, z: number, dirX: number, dirZ: number, reach: number): BrokenJar[];
  /** The sword swings at (x, y, z) facing (dirX, dirZ): strike crystal switches and the like. */
  strike?(x: number, y: number, z: number, dirX: number, dirZ: number, reach: number): void;
  /** The Murmurbuds here (hint notes), by id; `strike` reports the ones a swing reached to `onBudStrike`. */
  readonly buds?: ReadonlyMap<string, MurmurbudLook>;
  onBudStrike?: ((id: string) => void) | null;
  /**
   * The Tether Glove thrown from Wren's feet toward (dirX, dirZ): pulls what it catches.
   * Returns where the cord caught something (for the cord's end), or null on a miss.
   */
  tether?(x: number, y: number, z: number, dirX: number, dirZ: number): { at: THREE.Vector3 } | null;
  /**
   * Builds and drops the parts of the area that stream in by distance (overworld regions). The game calls
   * it every frame with the player's position, and before placing her anywhere.
   */
  streamAt?(x: number, z: number): void;
  /** The sky's blight level (0–1) each frame, for scenery that grows or shrinks with it (the overworld's thorns). */
  setBlight?(level: number): void;
  /**
   * The blight's thorn clump or scar a body at (x, y, z) is touching, if any (the overworld's; see game/blight.ts):
   * the point a shove should come from.
   */
  thornAt?(x: number, y: number, z: number): { x: number; z: number } | null;
  /** A sword swing at the blight's thorn clumps (same reach as `cut`): each one reached takes a hit. */
  hitThorns?(x: number, z: number, dirX: number, dirZ: number, reach: number): ThornHit[];
  update(dt: number, env: AreaEnv): void;
  /**
   * Moves the area's moving platforms. The game calls it *before* the player updates, so a
   * rider can take the platform's step along (`Physics.carryDelta`); `update` runs after.
   */
  movePlatforms?(dt: number): void;
  dispose(): void;
}

/** Where to put Wren: feet position (y found from the ground if omitted) and facing. */
export interface Spot {
  x: number;
  y?: number;
  z: number;
  facing: number;
}

export interface AreaEnv {
  /** 0 by day, 1 at full night. */
  night: number;
  playerPos: THREE.Vector3;
}

/** Something the player can press "interact" on (talk, open, read, check). */
export interface Interactable {
  /** Content binds scripts by id, e.g. `npc.maren`, `chest.grove`, `sign.crossroads`. */
  id: string;
  x: number;
  z: number;
  r: number;
  /** Shown in the prompt over it ("Talk", "Open"...). May be a getter if it changes. */
  label: string;
  /** World height of the floating prompt (defaults to a little above the player's head). */
  promptY?: number;
  /** The floor it stands on, where floors stack (dungeons): only in reach from that height. */
  y?: number;
  enabled(): boolean;
}

/** A zone that runs a script when the player walks into it. */
export interface Trigger {
  id: string;
  x: number;
  z: number;
  r: number;
  /** The floor it's on, where floors stack (dungeons). */
  y?: number;
  enabled(): boolean;
}

/** Whether a stacked-floor spot (`y`) is on the player's level. */
export const sameLevel = (y: number | undefined, playerY: number) => y === undefined || Math.abs(playerY - y) < 2.5;

/**
 * The nearest enabled interactable within its reach of `pos`, on the same level, or null.
 * With `facing` (a yaw; touch, which has an interact button of its own) the one most in front
 * wins instead of the plain nearest: being dead ahead is worth 1.5 m of distance.
 */
export function nearestInteractable(list: readonly Interactable[], pos: { x: number; y: number; z: number }, facing?: number) {
  let best: Interactable | null = null, bestScore = Infinity;
  for (const it of list) {
    if (!it.enabled() || !sameLevel(it.y, pos.y)) continue;
    const dx = it.x - pos.x, dz = it.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d >= it.r) continue;
    let score = d;
    if (facing !== undefined && d > 0.01) score -= (Math.cos(facing) * dz + Math.sin(facing) * dx) / d * 1.5;
    if (score < bestScore) {
      best = it;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Collects an area's meshes and colliders while it's being built. Static meshes are merged
 * into a few draw calls at the end; dynamic ones (anything that moves or changes) are kept
 * as they are. Everything is tracked so the area can be disposed cleanly.
 */
export class AreaBuilder {
  readonly staticGroup = new THREE.Group();
  readonly dynamicGroup = new THREE.Group();
  private readonly colliders: RAPIER.Collider[] = [];

  constructor(readonly physics: Physics, readonly rand: () => number) {}

  /** Adds a static mesh (merged later). */
  mesh(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    this.staticGroup.add(m);
    return m;
  }

  /** Adds an object that moves or changes at runtime (not merged). */
  dynamic<T extends THREE.Object3D>(o: T) {
    this.dynamicGroup.add(o);
    return o;
  }

  track(c: RAPIER.Collider) {
    this.colliders.push(c);
    return c;
  }

  box(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY = 0, member: number = Layer.World) {
    return this.track(this.physics.box(x, y, z, hx, hy, hz, rotY, member));
  }

  orientedBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotation: THREE.Quaternion, member: number = Layer.World) {
    return this.track(this.physics.orientedBox(x, y, z, hx, hy, hz, rotation, member));
  }

  cylinder(x: number, y: number, z: number, halfHeight: number, r: number, member: number = Layer.World) {
    return this.track(this.physics.cylinder(x, y, z, halfHeight, r, member));
  }

  ball(x: number, y: number, z: number, r: number, member: number = Layer.World) {
    return this.track(this.physics.ball(x, y, z, r, member));
  }

  private readonly lightRegions: LightRegion[] = [];
  private bakeLabel = 'area';
  private shadeKept = false;

  /**
   * Asks for baked bounce light (render/bakeLight.ts) in a round region, queued at `finish` (background workers:
   * the colours land a few seconds later). Merged scenery there gets it; mark a dynamic mesh
   * `userData.bakeLight = 'receive'` (the terrain) or `'occlude'` (trees) to take part. `label` names it in `bakeStats`.
   */
  bakeLight(region: LightRegion, label?: string) {
    this.lightRegions.push(region);
    if (label) this.bakeLabel = label;
  }

  /**
   * For a builder whose output is baked later as part of something bigger (Sallowmere's strips, baked once as a
   * region): keeps the merge's `shade` for that bake instead of baking here.
   */
  keepShadeForBake() {
    this.shadeKept = true;
  }

  /** Merges the static meshes and returns the finished area root plus a disposer. */
  finish() {
    const root = new THREE.Group();
    const bake = this.lightRegions.length > 0 && BAKE.atBuild;
    const merged = mergeStatic(this.staticGroup, 80, bake || (this.shadeKept && BAKE.atBuild));
    if (bake) queueBake(this.bakeLabel, collectBakeSet(merged, this.dynamicGroup), this.lightRegions);
    root.add(merged, this.dynamicGroup);
    const dynamic = this.dynamicGroup;
    disposeTree(this.staticGroup);
    const colliders = this.colliders;
    const physics = this.physics;
    const dispose = () => {
      for (const c of colliders) physics.remove(c);
      colliders.length = 0;
      root.removeFromParent();
      disposeTree(root);
    };
    /** The merged scenery and the dynamic objects, for a bake done later over several builders (`keepShadeForBake`). */
    const bakeSet = () => collectBakeSet(merged, dynamic);
    return { root, dispose, bakeSet };
  }
}

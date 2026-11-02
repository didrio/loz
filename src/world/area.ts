import * as THREE from 'three';
import type { RAPIER } from '../core/physics';
import { Layer, Physics } from '../core/physics';
import { disposeTree, mergeStatic } from '../render/materials';

/**
 * An Area is one loadable place: the overworld, a dungeon, a house interior. It owns its
 * meshes and colliders, says where the player starts, and lists what can be interacted
 * with. What those things *do* lives in `src/content/`, bound by id.
 */
export interface Area {
  readonly id: string;
  readonly root: THREE.Group;
  readonly spawn: { x: number; y?: number; z: number; facing: number };
  /** Water surface height, if the area has water (for wading). */
  readonly waterLevel: number | null;
  readonly interactables: Interactable[];
  readonly triggers: Trigger[];
  /** Name shown when the player walks into a part of the area. */
  nameAt(x: number, z: number): string;
  /** A random spot where an enemy may appear, optionally in a ring around `near`. */
  enemySpot(rand: () => number, near?: THREE.Vector3, minDist?: number, maxDist?: number): { x: number; z: number } | null;
  /** How many thornlings roam here. */
  readonly enemyCount: number;
  /** Cuts grass/bushes in a sword arc; returns where things were cut. */
  cut(x: number, z: number, dirX: number, dirZ: number, reach: number): THREE.Vector3[];
  update(dt: number, env: AreaEnv): void;
  dispose(): void;
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
  label: string;
  enabled(): boolean;
}

/** A zone that runs a script when the player walks into it. */
export interface Trigger {
  id: string;
  x: number;
  z: number;
  r: number;
  enabled(): boolean;
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
  mesh(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = true) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
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

  cylinder(x: number, y: number, z: number, halfHeight: number, r: number, member: number = Layer.World) {
    return this.track(this.physics.cylinder(x, y, z, halfHeight, r, member));
  }

  ball(x: number, y: number, z: number, r: number, member: number = Layer.World) {
    return this.track(this.physics.ball(x, y, z, r, member));
  }

  /** Merges the static meshes and returns the finished area root plus a disposer. */
  finish() {
    const root = new THREE.Group();
    root.add(mergeStatic(this.staticGroup), this.dynamicGroup);
    disposeTree(this.staticGroup);
    const colliders = this.colliders;
    const physics = this.physics;
    const dispose = () => {
      for (const c of colliders) physics.remove(c);
      colliders.length = 0;
      root.removeFromParent();
      disposeTree(root);
    };
    return { root, dispose };
  }
}

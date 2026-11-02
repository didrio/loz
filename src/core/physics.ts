import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

/**
 * Collision layers. Every collider is a *member* of one layer and *collides with* a set of
 * layers. Queries (rays, the character controller) pick which layers they can hit.
 */
export const Layer = {
  /** Terrain, buildings, big rocks: blocks characters and the camera. */
  World: 1 << 0,
  /** Trees, fences, barrels, bushes: blocks characters but the camera passes through. */
  Prop: 1 << 1,
  /** Invisible walls at the edge of an area. */
  Bounds: 1 << 2,
  Player: 1 << 3,
  Enemy: 1 << 4,
} as const;

/** Everything a character can stand on or bump into. */
export const SOLID = Layer.World | Layer.Prop | Layer.Bounds;

/** Rapier packs membership in the high 16 bits and the filter in the low 16. */
export const groups = (member: number, filter: number) => (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;

const DEG = Math.PI / 180;

let ready: Promise<void> | null = null;

/** Loads the Rapier WASM module. Call (and await) once before creating a `Physics`. */
export function initPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

const quatY = (a: number) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

/**
 * Thin wrapper around a Rapier world. Gameplay code talks to this, not to Rapier directly,
 * so the rest of the game stays in Three.js vectors and meters.
 */
export class Physics {
  readonly world: RAPIER.World;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    const c = this.world.createCharacterController(0.02);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle(50 * DEG);
    c.setMinSlopeSlideAngle(55 * DEG);
    c.enableAutostep(0.45, 0.2, false);
    c.enableSnapToGround(0.5);
    c.setSlideEnabled(true);
    this.controller = c;
  }

  // --- static colliders -------------------------------------------------------

  add(desc: RAPIER.ColliderDesc, member: number = Layer.World) {
    desc.setCollisionGroups(groups(member, 0xffff));
    return this.world.createCollider(desc);
  }

  /** Box centered at (x, y, z) with half extents, optionally turned around the vertical axis. */
  box(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY = 0, member: number = Layer.World) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z);
    if (rotY) d.setRotation(quatY(rotY));
    return this.add(d, member);
  }

  /** Upright cylinder centered at (x, y, z). */
  cylinder(x: number, y: number, z: number, halfHeight: number, radius: number, member: number = Layer.World) {
    return this.add(RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(x, y, z), member);
  }

  ball(x: number, y: number, z: number, radius: number, member: number = Layer.World) {
    return this.add(RAPIER.ColliderDesc.ball(radius).setTranslation(x, y, z), member);
  }

  /** Triangle mesh (terrain, bridge decks). Internal edges are fixed so characters don't snag. */
  trimesh(vertices: Float32Array, indices: Uint32Array, member: number = Layer.World) {
    return this.add(RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES), member);
  }

  /** Static collider matching an indexed Three.js geometry (in world space). */
  meshCollider(geometry: THREE.BufferGeometry, member: number = Layer.World) {
    const pos = geometry.attributes.position.array as ArrayLike<number>;
    const index = geometry.index;
    if (!index) throw new Error('meshCollider needs an indexed geometry');
    return this.trimesh(Float32Array.from(pos), Uint32Array.from(index.array as ArrayLike<number>), member);
  }

  remove(collider: RAPIER.Collider) {
    this.world.removeCollider(collider, false);
  }

  // --- characters ---------------------------------------------------------------

  createCharacter(feet: THREE.Vector3, radius: number, halfHeight: number, member: number, filter: number) {
    return new Character(this.world, this.controller, feet, radius, halfHeight, member, filter);
  }

  // --- queries ------------------------------------------------------------------

  /**
   * Height of the first surface straight below (x, fromY, z), or null if there is none.
   * A ray landing within ~1e-5 m of an edge shared by two triangles can slip between them
   * (float32 precision), so a miss is retried a hair to the side before giving up.
   */
  groundY(x: number, z: number, fromY = 400, filter: number = Layer.World | Layer.Prop) {
    this.ray.dir = { x: 0, y: -1, z: 0 };
    for (const [dx, dz] of [[0, 0], [0.013, 0.007], [-0.009, -0.011]]) {
      this.ray.origin = { x: x + dx, y: fromY, z: z + dz };
      const hit = this.world.castRay(this.ray, 1000, true, undefined, groups(0xffff, filter));
      if (hit) return fromY - hit.timeOfImpact;
    }
    return null;
  }

  /** Distance from `from` along the unit vector `dir` to the first hit, or `max` if nothing is hit. */
  rayDistance(from: THREE.Vector3, dir: THREE.Vector3, max: number, filter: number = Layer.World) {
    this.ray.origin = { x: from.x, y: from.y, z: from.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRay(this.ray, max, true, undefined, groups(0xffff, filter));
    return hit ? hit.timeOfImpact : max;
  }

  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
  }

  /**
   * Rapier only answers queries (rays, ground checks) about colliders that existed at the
   * last step. Call this after building an area and before querying it.
   */
  refreshQueries() {
    this.step(1 / 600);
  }
}

/**
 * A kinematic capsule moved by Rapier's character controller: slides along walls, climbs
 * slopes up to 50°, steps over small ledges and sticks to the ground going downhill.
 * Positions are *feet* positions; the capsule center sits `offsetY` above them.
 */
export class Character {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly offsetY: number;
  grounded = false;
  private readonly queryGroups: number;
  private readonly moved = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly world: RAPIER.World,
    private readonly controller: RAPIER.KinematicCharacterController,
    feet: THREE.Vector3,
    radius: number,
    halfHeight: number,
    member: number,
    filter: number,
  ) {
    this.offsetY = halfHeight + radius;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(feet.x, feet.y + this.offsetY, feet.z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(groups(member, filter)),
      this.body,
    );
    this.queryGroups = groups(member, filter);
  }

  /**
   * Tries to move by `delta` (meters) from `feet`, which is updated to where the character
   * actually ends up. Call at most once per physics step.
   */
  move(feet: THREE.Vector3, delta: THREE.Vector3) {
    this.moved.x = delta.x;
    this.moved.y = delta.y;
    this.moved.z = delta.z;
    this.controller.computeColliderMovement(this.collider, this.moved, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    feet.x += m.x;
    feet.y += m.y;
    feet.z += m.z;
    this.body.setNextKinematicTranslation({ x: feet.x, y: feet.y + this.offsetY, z: feet.z });
    return m;
  }

  /** Jump straight to a position (respawns, cutscenes). */
  teleport(feet: THREE.Vector3) {
    const p = { x: feet.x, y: feet.y + this.offsetY, z: feet.z };
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
  }

  dispose() {
    this.world.removeRigidBody(this.body);
  }
}

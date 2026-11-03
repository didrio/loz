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

/** A box that moves (a platform). `moveTo` takes effect at the next `Physics.step`. */
export interface KinematicBody {
  /** Where it is headed (set by `moveTo`); the collider reaches it on the next step. */
  readonly pos: THREE.Vector3;
  moveTo(x: number, y: number, z: number): void;
  remove(): void;
}

class Mover implements KinematicBody {
  readonly pos: THREE.Vector3;
  /** How far it has moved since the last step (what a rider takes along this frame). */
  readonly delta = new THREE.Vector3();

  constructor(readonly body: RAPIER.RigidBody, readonly collider: RAPIER.Collider, x: number, y: number, z: number, private readonly owner: Physics) {
    this.pos = new THREE.Vector3(x, y, z);
  }

  moveTo(x: number, y: number, z: number) {
    this.delta.set(x - this.pos.x + this.delta.x, y - this.pos.y + this.delta.y, z - this.pos.z + this.delta.z);
    this.pos.set(x, y, z);
    this.body.setTranslation({ x, y, z }, true);
  }

  remove() {
    this.owner.removeMover(this);
  }
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
  private readonly movers = new Map<number, Mover>();

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

  /** Box with any orientation (ramps, tilted slabs). `rotation` is a unit quaternion. */
  orientedBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, rotation: THREE.Quaternion, member: number = Layer.World) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
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

  // --- moving platforms ---------------------------------------------------------

  /**
   * A box that moves (`moveTo`), on `layer` (Prop by default: the camera passes through). It is a *fixed*
   * Rapier body that we teleport each frame, not a kinematic one: the character controller refused to
   * walk on a kinematic body (Wren stood still, even when it wasn't moving). Riders are carried by `carryDelta`.
   */
  kinematicBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, layer: number = Layer.Prop): KinematicBody {
    return this.mover(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, layer);
  }

  /** `kinematicBox`, but a round disc: `halfHeight` thick, `r` wide. */
  kinematicCylinder(x: number, y: number, z: number, halfHeight: number, r: number, layer: number = Layer.Prop): KinematicBody {
    return this.mover(RAPIER.ColliderDesc.cylinder(halfHeight, r), x, y, z, layer);
  }

  private mover(desc: RAPIER.ColliderDesc, x: number, y: number, z: number, layer: number): KinematicBody {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const collider = this.world.createCollider(desc.setCollisionGroups(groups(layer, 0xffff)), body);
    const m = new Mover(body, collider, x, y, z, this);
    this.movers.set(collider.handle, m);
    return m;
  }

  /** @internal Used by `KinematicBody.remove`. */
  removeMover(m: Mover) {
    this.movers.delete(m.collider.handle);
    this.world.removeRigidBody(m.body);
  }

  /**
   * How far the kinematic body standing under `feet` moved in the last step (null if none).
   * A character adds this to its position before its own move, so it rides along. The delta is
   * recorded by `step`, so it is the same however many times it is asked within a frame.
   */
  carryDelta(feet: THREE.Vector3): THREE.Vector3 | null {
    if (this.movers.size === 0) return null;
    this.ray.origin = { x: feet.x, y: feet.y + 0.1, z: feet.z };
    this.ray.dir = { x: 0, y: -1, z: 0 };
    const hit = this.world.castRay(this.ray, 0.2, true, undefined, groups(0xffff, SOLID));
    const m = hit && this.movers.get(hit.collider.handle);
    return m ? m.delta : null;
  }

  // --- characters ---------------------------------------------------------------

  /** Every live character, so they can block each other (see `Character.move`). */
  private readonly characters = new Set<Character>();

  /**
   * `feet` is the owner's own position vector: it is kept up to date by the owner (and by `move`), and read by
   * other characters to keep out of this one's way.
   */
  createCharacter(feet: THREE.Vector3, radius: number, halfHeight: number, member: number, filter: number) {
    return new Character(this.world, this.controller, feet, radius, halfHeight, member, filter, this.characters);
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

  /**
   * Like `rayDistance`, but sweeps a ball of `radius`: how far its center travels before it
   * touches something. A ball doesn't slip through gaps or graze corners the way a thin ray
   * does (the follow camera uses it). A ball already touching something at the start ignores it.
   */
  sphereDistance(from: THREE.Vector3, dir: THREE.Vector3, max: number, radius: number, filter: number = Layer.World) {
    const hit = this.world.castShape(
      { x: from.x, y: from.y, z: from.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: dir.x, y: dir.y, z: dir.z },
      new RAPIER.Ball(radius), 0, max, false, undefined, groups(0xffff, filter),
    );
    return hit ? hit.time_of_impact : max;
  }

  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
    for (const m of this.movers.values()) m.delta.set(0, 0, 0);
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
/** Characters this far apart in height (feet) are on different levels and don't block each other. */
const BODY_HEIGHT = 1.4;

export class Character {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly offsetY: number;
  grounded = false;
  /** The character that stopped the last `move` (null if none did). */
  blockedBy: Character | null = null;
  private readonly queryGroups: number;
  private readonly moved = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly world: RAPIER.World,
    private readonly controller: RAPIER.KinematicCharacterController,
    private readonly feet: THREE.Vector3,
    readonly radius: number,
    halfHeight: number,
    readonly member: number,
    readonly filter: number,
    private readonly others: Set<Character>,
  ) {
    this.offsetY = halfHeight + radius;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(feet.x, feet.y + this.offsetY, feet.z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(groups(member, filter)),
      this.body,
    );
    // The controller only sees the world: characters keep out of each other in `move`, never by pushing.
    this.queryGroups = groups(member, filter & ~(Layer.Player | Layer.Enemy));
    others.add(this);
  }

  /**
   * Tries to move by `delta` (meters) from `feet`, which is updated to where the character
   * actually ends up. Call at most once per physics step.
   *
   * Characters never overlap and never push each other: a move that would end inside another character
   * (one whose layers it collides with, at about the same height) is cut short at its edge, sliding round it.
   * Only the mover is displaced; whoever it ran into is not touched. `blockedBy` says who stopped it.
   */
  move(feet: THREE.Vector3, delta: THREE.Vector3) {
    this.moved.x = delta.x;
    this.moved.y = delta.y;
    this.moved.z = delta.z;
    const x0 = feet.x, z0 = feet.z;
    this.controller.computeColliderMovement(this.collider, this.moved, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    feet.x += m.x;
    feet.y += m.y;
    feet.z += m.z;
    this.blockedBy = null;
    for (const o of this.others) {
      if (o === this || !(this.filter & o.member) || !(o.filter & this.member) || Math.abs(feet.y - o.feet.y) > BODY_HEIGHT) continue;
      const min = this.radius + o.radius + 0.02;
      const dx = feet.x - o.feet.x, dz = feet.z - o.feet.z, d = Math.hypot(dx, dz);
      if (d >= min || d < 1e-6) continue;
      // Already overlapping (a spawn, a teleport): just never get closer. Otherwise stop at its edge.
      const d0 = Math.hypot(x0 - o.feet.x, z0 - o.feet.z);
      const keep = d0 < min - 0.01 ? Math.max(d, Math.min(d0, min)) : min;
      if (keep <= d) continue;
      feet.x = o.feet.x + (dx / d) * keep;
      feet.z = o.feet.z + (dz / d) * keep;
      this.blockedBy = o;
    }
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
    this.others.delete(this);
    this.world.removeRigidBody(this.body);
  }
}

import * as THREE from 'three';
import { Layer, type RAPIER } from '../../core/physics';
import { mat, surf, uniqueMat } from '../../render/materials';
import { faceted } from '../../render/textures';
import { glow, GroundShadow } from '../../render/shapes';
import type { AreaBuilder } from '../area';
import { Prism } from './prism';
import { DOOR_HEIGHT, KEY_HEX, type KeyColor, type Lock } from './format';

/**
 * The moving and changing parts of a dungeon, built from primitives: doors with their
 * locks, wakestones, switches, signs. The builder places them; content and (later) the
 * wakestone system drive them. Static architecture (floors, walls, stairs) lives in
 * `build.ts` and is merged into a few meshes.
 */

// Cool gray-blue stone, so the warm sconce light reads as pools of warmth.
export const STONE = {
  floor: 0x5f6466,
  wall: 0x7d8487,
  trim: 0x4b5053,
  ceiling: 0x2e3234,
  stair: 0x6e7476,
  pit: 0x24211e,
  pitFloor: 0x0d0c0b,
  pillar: 0x8a9093,
  iron: 0x4a4d52,
  gold: 0xc9a227,
};

/**
 * A doorway's door. Open doorways get only a frame; locked ones get a slab (or bars) that
 * blocks the way until `open()`:
 * - key: a stone slab with a keyhole plate and a band in the key's color,
 * - boss key: a taller, darker slab with a gold spiral and studs,
 * - switch: iron bars that slide up into the lintel,
 * Item locks have no door: the obstacle is in the room (a pit, a heavy stone).
 */
/** `hidden`: a plain slab with no handle or prompt, which a script opens (a room cleared, a boss beaten). */
export type DoorStyle = 'open' | 'key' | 'boss' | 'bars' | 'hidden';

export function doorStyle(lock: Lock | undefined): DoorStyle {
  if (!lock) return 'open';
  if (lock === 'boss') return 'boss';
  if ('key' in lock) return 'key';
  if ('cleared' in lock) return 'hidden';
  return 'item' in lock ? 'open' : 'bars';
}

export class DungeonDoor {
  readonly group = new THREE.Group();
  /** The part that moves when the door opens (null for open doorways). */
  private readonly leaf: THREE.Group | null = null;
  private readonly collider: RAPIER.Collider | null = null;
  opening = false;
  closing = false;
  open = false;
  private t = 0;

  /**
   * `wall`: `x` if the wall runs east–west (the door faces north/south), `z` if north–south.
   * (x, y, z) is the center of the doorway at floor level.
   */
  constructor(b: AreaBuilder, parent: THREE.Object3D, readonly id: string, readonly style: DoorStyle, x: number, y: number, z: number, wall: 'x' | 'z', width: number, readonly keyColor?: KeyColor) {
    this.group.position.set(x, y, z);
    if (wall === 'z') this.group.rotation.y = Math.PI / 2;
    parent.add(this.group);

    // The frame: two posts and a lintel, a little proud of the wall on both sides.
    const frame = surf('stone', STONE.trim);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, DOOR_HEIGHT + 0.3, 0.8), frame);
      post.position.set(side * (width / 2 + 0.17), (DOOR_HEIGHT + 0.3) / 2, 0);
      this.group.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.35, 0.8), frame);
    lintel.position.y = DOOR_HEIGHT + 0.17;
    this.group.add(lintel);
    if (style === 'open') {
      this.open = true;
      return;
    }

    const leaf = new THREE.Group();
    this.group.add(leaf);
    this.leaf = leaf;
    if (style === 'bars') {
      const iron = surf('metal', STONE.iron);
      const n = Math.max(3, Math.round(width / 0.45));
      for (let i = 0; i < n; i++) {
        const bar = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.06, 0.06, DOOR_HEIGHT, 6)), iron);
        bar.position.set(-width / 2 + (i + 0.5) * (width / n), DOOR_HEIGHT / 2, 0);
        leaf.add(bar);
      }
      for (const h of [0.6, DOOR_HEIGHT - 0.5]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.1), iron);
        rail.position.y = h;
        leaf.add(rail);
      }
    } else {
      const color = style === 'boss' ? 0x4a4440 : style === 'hidden' ? 0x34302d : 0x847d70;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width, DOOR_HEIGHT, 0.4), surf('stone', color));
      slab.position.y = DOOR_HEIGHT / 2;
      leaf.add(slab);
      for (const face of [-1, 1]) {
        if (style === 'key') {
          const tint = surf('metal', KEY_HEX[keyColor!]);
          const band = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.06), tint);
          band.position.set(0, DOOR_HEIGHT - 0.7, face * 0.21);
          leaf.add(band);
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), tint);
          plate.position.set(0, 1.3, face * 0.22);
          const hole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.04), mat(0x111111));
          hole.position.set(0, 1.25, face * 0.26);
          leaf.add(plate, hole);
        } else if (style === 'boss') {
          const ring = new THREE.Mesh(faceted(new THREE.TorusGeometry(0.75, 0.1, 6, 18)), surf('metal', STONE.gold));
          ring.position.set(0, 1.8, face * 0.22);
          leaf.add(ring);
          for (const sx of [-1, 1]) for (const sy of [0.5, DOOR_HEIGHT - 0.5]) {
            const stud = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.1, 6, 4)), surf('metal', STONE.gold));
            stud.position.set(sx * (width / 2 - 0.3), sy, face * 0.22);
            leaf.add(stud);
          }
        }
      }
    }
    const [cx, cz] = wall === 'z' ? [x, z] : [x, z];
    this.collider = b.box(cx, y + DOOR_HEIGHT / 2, cz, wall === 'z' ? 0.25 : width / 2, DOOR_HEIGHT / 2, wall === 'z' ? width / 2 : 0.25);
  }

  /** Starts the door opening (slabs sink, bars rise). */
  startOpening() {
    if (this.open) return;
    this.opening = true;
    this.closing = false;
  }

  /** Starts it closing (a slab rises out of the floor, bars drop); it blocks at once. */
  startClosing() {
    if (!this.leaf || (!this.open && !this.opening)) return;
    this.opening = this.open = false;
    this.closing = true;
    this.collider?.setEnabled(true);
  }

  /** Opens at once (restoring a save). */
  setOpen() {
    this.opening = this.open = true;
    this.t = 1;
    this.pose();
    this.collider?.setEnabled(false);
  }

  /** Closes at once (restoring a save). */
  close() {
    this.opening = this.open = this.closing = false;
    this.t = 0;
    this.pose();
    this.collider?.setEnabled(true);
  }

  private pose() {
    if (!this.leaf) return;
    if (this.style === 'bars') this.leaf.position.y = this.t * (DOOR_HEIGHT - 0.2);
    else this.leaf.position.y = -this.t * (DOOR_HEIGHT + 0.1);
    this.leaf.visible = this.t < 0.999;
  }

  update(dt: number) {
    const speed = dt / (this.style === 'bars' ? 0.8 : 1.6);
    if (this.closing) {
      this.t = Math.max(0, this.t - speed);
      this.pose();
      if (this.t <= 0) this.closing = false;
      return;
    }
    if (!this.opening || this.open) return;
    this.t = Math.min(1, this.t + speed);
    this.pose();
    if (this.t >= 1) this.setOpen();
  }
}

/**
 * A wakestone: a carved 2 m block with the shrine's spiral on each side. Heavy ones are
 * darker, cracked, and a little bigger. The wakestone system (milestone 3) moves them;
 * for now they stand where the data puts them.
 */
export class Wakestone {
  readonly group = new THREE.Group();
  readonly collider: RAPIER.Collider;
  readonly size: number;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private moveT = 1;
  private moveDur = 0.28;
  private delay = 0;
  private colliderLater: { x: number; y: number; z: number } | null = null;
  /** A blob on the floor it is heading for: invisible while it rests, it shows when the stone slides or drops. */
  private readonly blob: GroundShadow;

  /**
   * Light stones: pale carved sandstone with green-teal spirals. Heavy ones (glove only) look
   * nothing alike: dark violet stone banded in bronze, their spirals glowing (`glowMat`,
   * shared by the area so it can pulse them all).
   */
  constructor(b: AreaBuilder, parent: THREE.Object3D, readonly id: string, x: number, y: number, z: number, readonly heavy: boolean, glowMat?: THREE.Material) {
    const size = heavy ? 1.96 : 1.84;
    this.size = size;
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), surf('stone', heavy ? 0x3a2f4f : 0x9b9486));
    body.position.y = size / 2;
    this.group.add(body);
    const glyph = heavy && glowMat ? glowMat : mat(0x4fb8a4);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 5, 14), glyph);
      ring.position.set(Math.sin(a) * (size / 2 + 0.01), size / 2, Math.cos(a) * (size / 2 + 0.01));
      ring.rotation.y = a;
      this.group.add(ring);
    }
    if (heavy) {
      // Bronze bands round the top and bottom.
      for (const by of [0.18, size - 0.18]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(size + 0.06, 0.16, size + 0.06), surf('metal', 0x9a6a2e));
        band.position.y = by;
        this.group.add(band);
      }
    }
    this.group.position.set(x, y, z);
    parent.add(this.group);
    this.collider = b.box(x, y + size / 2, z, size / 2, size / 2, size / 2, 0, Layer.Prop);
    this.blob = new GroundShadow(parent, size * 0.5); // inside the block's footprint: a resting stone hides it
    this.to.set(x, y, z);
    this.placeBlob();
  }

  private placeBlob() {
    const p = this.group.position;
    this.blob.place(p.x, p.y, p.z, this.to.y);
  }

  /**
   * Slides (or drops) to a new resting spot. The collider moves at once so nothing walks
   * into the spot, unless `colliderAtEnd` (a bounce back toward Wren: Wren is still there,
   * being knocked out of the way). `delay` holds the stone still first.
   */
  moveTo(x: number, y: number, z: number, seconds = 0.28, delay = 0, colliderAtEnd = false) {
    this.from.copy(this.group.position);
    this.to.set(x, y, z);
    this.moveT = seconds > 0 ? 0 : 1;
    this.moveDur = seconds;
    this.delay = delay;
    if (seconds <= 0) this.group.position.copy(this.to);
    this.placeBlob();
    const at = { x, y: y + this.size / 2, z };
    if (colliderAtEnd && seconds > 0) this.colliderLater = at;
    else {
      this.colliderLater = null;
      this.collider.setTranslation(at);
    }
  }

  get moving() {
    return this.moveT < 1;
  }

  update(dt: number) {
    if (this.moveT >= 1) return;
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }
    this.moveT = Math.min(1, this.moveT + dt / this.moveDur);
    const e = this.moveT * this.moveT * (3 - 2 * this.moveT);
    this.group.position.lerpVectors(this.from, this.to, e);
    this.placeBlob();
    if (this.moveT >= 1 && this.colliderLater) {
      this.collider.setTranslation(this.colliderLater);
      this.colliderLater = null;
    }
  }
}

/**
 * A switch. `plate`: a square plate set into the floor that sinks when held down.
 * `crystal`: a crystal on a short pedestal that lights up when struck.
 */
export class DungeonSwitch {
  readonly group: THREE.Group = new THREE.Group();
  pressed = false;
  private readonly top: THREE.Mesh;
  private readonly glowMat: THREE.MeshLambertMaterial;
  private t = Math.random() * 10;
  /** A 'prism' switch is a floating crystal that takes several sword hits (see prism.ts); pressed = shattered. */
  readonly prism: Prism | null = null;

  constructor(parent: THREE.Object3D, readonly id: string, readonly style: 'plate' | 'crystal' | 'prism', x: number, y: number, z: number, b: AreaBuilder) {
    this.glowMat = uniqueMat(style === 'plate' ? 0x8a7a52 : 0x6fd8ff, { emissive: 0x000000 });
    if (style === 'prism') {
      this.top = new THREE.Mesh();
      this.prism = new Prism(parent, b, x, y, z);
      this.group = this.prism.group;
      return;
    }
    if (style === 'plate') {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 1.9), surf('stone', STONE.trim));
      rim.position.y = 0.03;
      this.top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.5), this.glowMat);
      this.top.position.y = 0.09;
      this.group.add(rim, this.top);
    } else {
      const base = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 8)), surf('stone', STONE.trim));
      base.position.y = 0.45;
      this.top = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), this.glowMat);
      this.top.position.y = 1.45;
      this.group.add(base, this.top);
      b.cylinder(x, y + 0.45, z, 0.45, 0.5, Layer.Prop);
    }
    this.group.position.set(x, y, z);
    parent.add(this.group);
  }

  setPressed(on: boolean) {
    this.pressed = on;
    if (this.prism) {
      if (on) this.prism.restoreShattered();
      return;
    }
    if (this.style === 'plate') this.top.position.y = on ? 0.03 : 0.09;
  }

  update(dt: number) {
    if (this.prism) return this.prism.update(dt);
    this.t += dt;
    const k = this.pressed ? 0.9 : this.style === 'crystal' ? 0.15 + Math.sin(this.t * 2) * 0.05 : 0;
    this.glowMat.emissive.setRGB(0.3 * k, 0.75 * k, 0.7 * k);
    if (this.style === 'crystal') this.top.rotation.y += dt * (this.pressed ? 2 : 0.5);
  }
}

/** A carved stone tablet on a plinth, for dungeon signs. */
export function buildTablet(b: AreaBuilder, parent: THREE.Object3D, x: number, y: number, z: number, yaw: number) {
  const g = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.6), surf('stone', STONE.trim));
  plinth.position.y = 0.15;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.2), surf('stone', 0xa29b8d));
  slab.position.y = 0.9;
  const lines = mat(0x4a463f);
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.02), lines);
    l.position.set(0, 1.2 - i * 0.22, 0.11);
    g.add(l);
  }
  g.add(plinth, slab);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  parent.add(g);
  b.box(x, y + 0.6, z, 0.5, 0.6, 0.3, yaw, Layer.Prop);
}

/** A wall sconce: a little iron cup with a flame, for light you can see the source of. */
export function buildSconce(parent: THREE.Object3D, x: number, y: number, z: number, yaw: number) {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.18, 0.1, 0.22, 6)), surf('metal', STONE.iron));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.35), surf('metal', STONE.iron));
  arm.position.set(0, -0.05, -0.18);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), new THREE.MeshBasicMaterial({ color: 0xffb35a }));
  flame.position.y = 0.25;
  g.add(cup, arm, flame, glow(0xffa64a, 0.32, 0.4));
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  parent.add(g);
  return flame;
}

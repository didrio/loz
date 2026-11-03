import * as THREE from 'three';
import { easeInOut, mulberry32 } from '../../core/math';
import { Layer, type RAPIER } from '../../core/physics';
import { mat, uniqueMat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import type { RoomDef } from './format';
import type { DungeonDoor } from './pieces';

/** How far the ring of floor tiles rises in phase two: above Wren's ~2 m jump, so it hems her in. */
export const RING_HEIGHT = 2.4;
/** The ring's width: one 2 m cell all round the room. */
export const RING_WIDTH = 2;
const RING_RISE = 1.6;
const SOCKET_SIZE = 1.2;
/** Sockets sit this high on the walls (out of reach: decoration and the boss's ammunition). */
const SOCKET_Y = 3.1;

export interface Socket {
  /** Where its stone sits (world), and the stone itself. */
  readonly at: THREE.Vector3;
  readonly stone: THREE.Group;
  filled: boolean;
}

/**
 * Warden's Hearth, Gravelheart's arena (the room with the `gravelheart` boss thing). The
 * world half of the fight: spare wakestones set into the walls that the boss pulls out (they
 * visibly run out), the boss door, which closes behind Wren as the seal and reopens on a win
 * or a death, and the outer ring of floor tiles that rises into a wall in phase two. What
 * happens when is the boss's and content's business (docs/shrine.md, "The boss").
 */
export class WardenHearth {
  /** Ready to start the fight when Wren walks in. */
  armed = false;
  sealed = false;
  /** The boss here is beaten for good. */
  cleared = false;
  readonly center: THREE.Vector3;
  readonly sockets: Socket[] = [];
  private readonly tiles: { mesh: THREE.Mesh; collider: RAPIER.Collider; x: number; z: number; delay: number }[] = [];
  private readonly crackMat = uniqueMat(0x2a120a, { emissive: 0x000000 });
  private ringT = 0;
  private ringDir = 0;
  /** The ledge of floor Wren fights on: the room minus the drops along its edges (world rect). */
  readonly platform: { x0: number; x1: number; z0: number; z1: number };

  constructor(b: AreaBuilder, parent: THREE.Object3D, readonly room: RoomDef, readonly floorY: number, private readonly door: DungeonDoor | null) {
    this.center = new THREE.Vector3(room.x + room.w / 2, floorY, room.z + room.d / 2);
    const rand = mulberry32(31);
    // Edge drops (pits that run along a side of the room) shrink the ledge the ring sits on.
    const pits = (room.features ?? []).flatMap((f) => (f.kind === 'pit' ? [f] : []));
    const W = Math.max(0, ...pits.filter((f) => f.x === 0 && f.d >= room.d - 0.01).map((f) => f.w));
    const E = Math.max(0, ...pits.filter((f) => f.x + f.w >= room.w - 0.01 && f.d >= room.d - 0.01).map((f) => f.w));
    const N = Math.max(0, ...pits.filter((f) => f.z === 0 && f.x <= W + 0.01 && f.x + f.w >= room.w - E - 0.01).map((f) => f.d));
    const S = Math.max(0, ...pits.filter((f) => f.z + f.d >= room.d - 0.01 && f.x <= W + 0.01 && f.x + f.w >= room.w - E - 0.01).map((f) => f.d));
    this.platform = { x0: room.x + W, x1: room.x + room.w - E, z0: room.z + N, z1: room.z + room.d - S };

    // Spare stones, half sunk into the walls every few meters (none over the door).
    const stoneMat = mat(0x8f887c), glyph = mat(0x4fb8a4), niche = mat(0x0e0c0b);
    const along = (len: number) => {
      const n = Math.floor(len / 8);
      return Array.from({ length: n }, (_, i) => (i + 0.5) * (len / n));
    };
    const walls: { x: (u: number) => number; z: (u: number) => number; len: number; inward: [number, number] }[] = [
      { x: (u) => room.x + u, z: () => room.z, len: room.w, inward: [0, 1] },
      { x: (u) => room.x + u, z: () => room.z + room.d, len: room.w, inward: [0, -1] },
      { x: () => room.x, z: (u) => room.z + u, len: room.d, inward: [1, 0] },
      { x: () => room.x + room.w, z: (u) => room.z + u, len: room.d, inward: [-1, 0] },
    ];
    const doorAt = door?.group.position;
    for (const w of walls) {
      for (const u of along(w.len)) {
        const x = w.x(u) + w.inward[0] * 0.6, z = w.z(u) + w.inward[1] * 0.6;
        if (doorAt && Math.hypot(x - doorAt.x, z - doorAt.z) < 3) continue;
        const at = new THREE.Vector3(x, floorY + SOCKET_Y, z);
        const back = new THREE.Mesh(new THREE.BoxGeometry(SOCKET_SIZE + 0.3, SOCKET_SIZE + 0.3, 0.1), niche);
        back.position.set(w.x(u) + w.inward[0] * 0.27, at.y, w.z(u) + w.inward[1] * 0.27);
        back.rotation.y = Math.atan2(w.inward[0], w.inward[1]);
        parent.add(back);
        const stone = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(SOCKET_SIZE, SOCKET_SIZE, SOCKET_SIZE), stoneMat);
        body.castShadow = true;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 5, 12), glyph);
        ring.position.z = SOCKET_SIZE / 2 + 0.01;
        stone.add(body, ring);
        stone.position.copy(at);
        stone.rotation.set((rand() - 0.5) * 0.08, Math.atan2(w.inward[0], w.inward[1]), (rand() - 0.5) * 0.08);
        parent.add(stone);
        this.sockets.push({ at, stone, filled: true });
      }
    }

    // The ring: 2 m tiles all round the edge, sunk flush with the floor until phase two.
    // Prop layer, so they block Wren and the boss but the camera passes through them.
    const tileMat = mat(0x34302d);
    const pf = this.platform;
    for (let cx = pf.x0; cx < pf.x1; cx += 2) {
      for (let cz = pf.z0; cz < pf.z1; cz += 2) {
        const edge = cx < pf.x0 + RING_WIDTH || cx >= pf.x1 - RING_WIDTH || cz < pf.z0 + RING_WIDTH || cz >= pf.z1 - RING_WIDTH;
        if (!edge) continue;
        const x = cx + 1, z = cz + 1;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.96, RING_HEIGHT, 1.96), tileMat);
        const crack = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.08, 1.98), this.crackMat);
        crack.position.y = RING_HEIGHT / 2 - 0.3 - rand() * 0.6;
        mesh.add(crack);
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
        const collider = b.box(x, floorY - RING_HEIGHT / 2, z, 0.98, RING_HEIGHT / 2, 0.98, 0, Layer.Prop);
        collider.setEnabled(false);
        // The rise sweeps round the room from the door, so it reads as one wave.
        const delay = ((Math.atan2(z - this.center.z, x - this.center.x) + Math.PI) / (Math.PI * 2)) * 0.6;
        this.tiles.push({ mesh, collider, x, z, delay });
      }
    }
    this.poseRing();
  }

  get stonesLeft() {
    return this.sockets.filter((s) => s.filled).length;
  }

  /** Pulls the filled socket nearest `near` out of the wall: returns where its stone was, or null if none are left. */
  take(near: THREE.Vector3): THREE.Vector3 | null {
    let best: Socket | null = null;
    for (const s of this.sockets) if (s.filled && (!best || s.at.distanceToSquared(near) < best.at.distanceToSquared(near))) best = s;
    if (!best) return null;
    best.filled = false;
    best.stone.visible = false;
    return best.at.clone();
  }

  /** Every stone back in its socket (the fight resets). */
  refill() {
    for (const s of this.sockets) {
      s.filled = true;
      s.stone.visible = true;
    }
  }

  /** Whether `p` is inside the ring (in the shrunken arena), with `margin` to spare. */
  insideRing(p: THREE.Vector3, margin = 0) {
    const f = this.platform, m = RING_WIDTH + margin;
    return p.x > f.x0 + m && p.x < f.x1 - m && p.z > f.z0 + m && p.z < f.z1 - m;
  }

  /** Whether a body with this `margin` (its radius, say) can stand at (x, z): on the ledge, clear of the holes in it. */
  walkable(x: number, z: number, margin = 0) {
    const f = this.platform;
    if (x < f.x0 + margin || x > f.x1 - margin || z < f.z0 + margin || z > f.z1 - margin) return false;
    for (const h of this.room.features ?? []) {
      if (h.kind !== 'pit') continue;
      const hx = x - this.room.x, hz = z - this.room.z;
      if (hx > h.x - margin && hx < h.x + h.w + margin && hz > h.z - margin && hz < h.z + h.d + margin) return false;
    }
    return true;
  }

  get ringUp() {
    return this.ringT >= 1;
  }

  /** Phase two: the ring rises into a wall (its colliders turn on as it finishes). */
  raiseRing() {
    this.ringDir = 1;
  }

  /** The ring sinks back flush with the floor (at once, or over a second). */
  lowerRing(now = false) {
    this.ringDir = -1;
    if (now) {
      this.ringT = 0;
      this.ringDir = 0;
      this.poseRing();
    }
  }

  /** The door shuts behind Wren. */
  seal() {
    this.sealed = true;
    this.armed = false;
    this.door?.startClosing();
  }

  /** The fight is over (Wren died: the boss re-arms it): the door reopens, the stones come back, the ring sinks. */
  unseal() {
    this.sealed = false;
    this.door?.startOpening();
    this.refill();
    this.lowerRing();
  }

  /** The boss is beaten: open for good. `now` when restoring a save. */
  clear(now = false) {
    this.cleared = true;
    this.armed = false;
    this.sealed = false;
    if (now) this.door?.setOpen();
    else this.door?.startOpening();
    this.lowerRing(now);
  }

  update(dt: number) {
    if (this.ringDir !== 0) {
      this.ringT = Math.min(1, Math.max(0, this.ringT + (this.ringDir * dt) / RING_RISE));
      if (this.ringT === 0 || this.ringT === 1) this.ringDir = 0;
      this.poseRing();
    }
  }

  private poseRing() {
    const up = this.ringT >= 1;
    for (const t of this.tiles) {
      const k = easeInOut(Math.min(1, Math.max(0, (this.ringT * 1.6 - t.delay) / 1)));
      t.mesh.position.set(t.x, this.floorY - RING_HEIGHT / 2 - 0.01 + k * RING_HEIGHT, t.z);
      t.mesh.visible = k > 0.001;
      t.collider.setEnabled(up);
      if (up) t.collider.setTranslation({ x: t.x, y: this.floorY + RING_HEIGHT / 2, z: t.z });
    }
    // The cracks between the stones glow as the ring wakes.
    const g = Math.min(1, this.ringT * 2);
    this.crackMat.emissive.setRGB(0.9 * g, 0.32 * g, 0.08 * g);
  }
}

import * as THREE from 'three';
import { easeInOut } from '../core/math';
import { Layer } from '../core/physics';
import { fadeInFog, uniqueSurf, surf } from '../render/materials';
import { faceted } from '../render/textures';
import { glow } from '../render/shapes';
import type { AreaBuilder } from './area';

/**
 * The keepers' bells: while the great lantern burned, the shrine's keepers rang its hours
 * from bells hung on crooked posts around the valley. All were cast from one bronze, so a
 * rung bell answers the others, and the answer can carry Wren from post to post (fast
 * travel). Each bell fits one post: its name is carved on the post's arm. What ringing and
 * hanging *do* lives in `content/bells.ts`; this file is only how they look and move.
 * See docs/bells.md.
 */
export const BELL_IDS = ['morrow', 'lull', 'way'] as const;
export type BellId = (typeof BELL_IDS)[number];

export const isBellId = (v: string): v is BellId => (BELL_IDS as readonly string[]).includes(v);

/** Each bell's bronze and the color of the rings it sends out. */
const LOOKS: Record<BellId, { bronze: number; ring: number }> = {
  morrow: { bronze: 0xc9a24a, ring: 0xffe7a3 }, // dawn: pale gold
  lull: { bronze: 0x9a6a3a, ring: 0xb3b8ff }, // dusk: deep bronze, violet rings
  way: { bronze: 0x6f9a86, ring: 0xc4f5dc }, // noon, the travelers' hour: verdigris, pale green rings
};

/** How high above the post's foot the hook is, and how far out along the arm. */
const HOOK_Y = 2.55;
const ARM_OUT = 1.0;
/** Seconds for a bell to float from Wren's hands onto the hook. */
const HANG_TIME = 1.2;
const RING_LIFE = 1.8;

/** A bell model (about 0.65 m tall), its origin at the hanging loop on top. */
function bellModel(bronze: THREE.Material) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.17, 0.3, 0.42, 10)), bronze);
  body.position.y = -0.33;
  const dome = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2)), bronze);
  dome.position.y = -0.12;
  const lip = new THREE.Mesh(faceted(new THREE.TorusGeometry(0.3, 0.035, 5, 14)), bronze);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.54;
  const loop = new THREE.Mesh(faceted(new THREE.TorusGeometry(0.055, 0.02, 4, 8)), surf('metal', 0x3a3530));
  loop.position.y = -0.03;
  const clapper = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.06, 6, 4)), surf('metal', 0x3a3530));
  clapper.position.y = -0.58;
  g.add(body, dome, lip, loop, clapper);
  return g;
}

/** A unit circle in the xz plane: a ring drawn as a line stays thin however wide it grows. */
const ringGeometry = () => new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2), 0, Math.sin((i / 64) * Math.PI * 2))),
);
const RING_MAX = 4;

/** Expanding rings of light around the bell, its voice made visible. */
class RingPool {
  private readonly rings: { mesh: THREE.LineLoop; t: number }[] = [];

  constructor(parent: THREE.Object3D, color: number, x: number, y: number) {
    const geo = ringGeometry(); // one per bell: an area's dispose frees it with the rest
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.LineLoop(geo, fadeInFog(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
      mesh.position.set(x, y, 0);
      mesh.visible = false;
      parent.add(mesh);
      this.rings.push({ mesh, t: RING_LIFE });
    }
  }

  /** Sends out a ring after `delay` seconds (uses the oldest one). */
  emit(delay = 0) {
    const r = this.rings.reduce((a, b) => (b.t > a.t ? b : a));
    r.t = -delay;
  }

  update(dt: number) {
    for (const r of this.rings) {
      r.t += dt;
      const p = r.t / RING_LIFE;
      r.mesh.visible = p >= 0 && p < 1;
      if (!r.mesh.visible) continue;
      r.mesh.scale.setScalar(0.4 + easeInOut(Math.min(1, p * 1.3)) * RING_MAX);
      (r.mesh.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - p);
    }
  }
}

/**
 * A bell post: a crooked wooden post with one arm and an empty hook, the bell's name carved
 * on the arm. Content hangs the bell (`hang`, a short float-and-settle) and rings it.
 * Models face +z: the arm reaches out to the post's left (local +x), Wren stands in front.
 */
export class BellPost {
  readonly group = new THREE.Group();
  /** Where Wren stands to use it (in front of the post, under the bell). */
  readonly front: { x: number; z: number };
  hung = false;
  /** Set by content while Wren carries this post's bell (the prompt says "Hang bell"). */
  canHang = false;
  /** True while the bell is floating up to the hook. */
  hanging = false;
  private readonly pivot = new THREE.Group();
  private readonly bellMat: THREE.MeshLambertMaterial;
  private readonly halo: THREE.Mesh;
  private readonly rings: RingPool;
  private readonly hangFrom = new THREE.Vector3();
  private hangT = 0;
  private swingAmp = 0;
  private swingT = 0;
  private t = 0;

  constructor(b: AreaBuilder, readonly bell: BellId, readonly x: number, readonly y: number, readonly z: number, readonly yaw: number) {
    const wood = surf('wood', 0x5e4a36), dark = surf('wood', 0x3d3026), stone = surf('stone', 0x8d877c), iron = surf('metal', 0x34302c);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number, rz = 0, rx = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(px, py, pz);
      mesh.rotation.set(rx, 0, rz);
      this.group.add(mesh);
      return mesh;
    };
    add(faceted(new THREE.CylinderGeometry(0.4, 0.5, 0.3, 7)), stone, 0, 0.15, 0);
    // Crooked like a heron's leg: the lower post leans one way, the upper the other.
    add(new THREE.BoxGeometry(0.22, 1.5, 0.22), wood, 0.04, 1.02, 0, -0.06);
    add(new THREE.BoxGeometry(0.26, 0.16, 0.26), dark, 0.08, 1.78, 0, 0.1);
    add(new THREE.BoxGeometry(0.19, 0.95, 0.19), wood, 0.06, 2.25, 0, 0.09);
    // The arm, drooping a little, with a brace and the name plate carved into its side.
    add(new THREE.BoxGeometry(ARM_OUT + 0.35, 0.14, 0.14), wood, ARM_OUT / 2 + 0.05, HOOK_Y + 0.17, 0, -0.05);
    add(new THREE.BoxGeometry(0.1, 0.75, 0.1), dark, 0.38, 2.28, 0, -0.8);
    add(new THREE.BoxGeometry(0.46, 0.1, 0.03), surf('wood', 0x7d6650), 0.62, HOOK_Y + 0.18, 0.075, -0.05);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.03, 0.06, 0.02), dark, 0.45 + i * 0.11, HOOK_Y + 0.18, 0.09);
    const hook = add(faceted(new THREE.TorusGeometry(0.06, 0.018, 4, 8, Math.PI * 1.4)), iron, ARM_OUT, HOOK_Y + 0.04, 0);
    hook.rotation.y = Math.PI / 2;

    const look = LOOKS[bell];
    this.bellMat = uniqueSurf('metal', look.bronze, { emissive: 0x000000 });
    this.pivot.position.set(ARM_OUT, HOOK_Y, 0);
    this.pivot.add(bellModel(this.bellMat));
    this.pivot.visible = false;
    // A small, faint glow inside the bell's mouth (a big one reads as a flat disc).
    this.halo = glow(look.ring, 0.26, 0);
    this.halo.position.y = -0.42;
    this.pivot.add(this.halo);
    this.group.add(this.pivot);
    this.rings = new RingPool(this.group, look.ring, ARM_OUT, HOOK_Y - 0.35);

    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    b.cylinder(x, y + 1.3, z, 1.3, 0.3, Layer.Prop);
    this.front = this.toWorld(ARM_OUT * 0.5, 1.3);
  }

  /** The prompt's word: what using the post will do. */
  get label() {
    return this.hung ? 'Ring' : this.canHang ? 'Hang bell' : 'Check';
  }

  /** A spot `d` m in front of the post, facing away from it: where travelers arrive (find the ground there). */
  arrival(d = 2.4) {
    return { ...this.toWorld(ARM_OUT * 0.5, d), facing: this.yaw };
  }

  /** A point on the ground in the post's own frame (x along the arm, z out in front). */
  private toWorld(lx: number, lz: number) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }

  /** The bell's mouth in world space (where its rings start; a camera's look-at point). */
  bellWorld() {
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(new THREE.Vector3(ARM_OUT, HOOK_Y - 0.35, 0));
  }

  /** Shows the bell on its hook (loading a save). */
  setHung() {
    this.hung = true;
    this.hanging = false;
    this.pivot.visible = true;
    this.pivot.position.set(ARM_OUT, HOOK_Y, 0);
  }

  /** The hook is empty again (a bell taken off its post). */
  setEmpty() {
    this.hung = false;
    this.hanging = false;
    this.pivot.visible = false;
  }

  /** Floats the bell from `from` (world space, e.g. Wren's hands) up onto the hook. */
  hang(from: THREE.Vector3) {
    this.group.updateWorldMatrix(true, false);
    this.hangFrom.copy(this.group.worldToLocal(from.clone()));
    this.hangT = 0;
    this.hanging = true;
    this.pivot.visible = true;
  }

  /** Swings the bell and sends its rings out. */
  ring(strength = 1) {
    this.swingAmp = Math.max(this.swingAmp, 0.5 * strength);
    this.swingT = 0;
    this.rings.emit(0);
    this.rings.emit(0.3);
    this.rings.emit(0.6);
  }

  update(dt: number) {
    this.t += dt;
    if (this.hanging) {
      this.hangT = Math.min(1, this.hangT + dt / HANG_TIME);
      const p = easeInOut(this.hangT);
      const hook = new THREE.Vector3(ARM_OUT, HOOK_Y, 0);
      // A little lift over the top, so it settles onto the hook rather than sliding in.
      this.pivot.position.lerpVectors(this.hangFrom, hook, p);
      this.pivot.position.y += Math.sin(p * Math.PI) * 0.5;
      if (this.hangT >= 1) {
        this.setHung();
        this.swingAmp = 0.35;
        this.swingT = 0;
      }
    }
    this.swingT += dt;
    this.swingAmp *= Math.exp(-0.9 * dt);
    this.pivot.rotation.z = this.swingAmp * Math.sin(this.swingT * 5.2);
    // A hung bell keeps a faint warmth; ringing flares it.
    const glowAmt = this.hung ? 0.12 + Math.sin(this.t * 1.3) * 0.04 + this.swingAmp * 0.9 : this.hanging ? 0.3 : 0;
    (this.halo.material as THREE.MeshBasicMaterial).opacity = Math.min(0.25, glowAmt * 0.4);
    const e = Math.min(1, glowAmt * 1.6);
    const ring = new THREE.Color(LOOKS[this.bell].ring);
    this.bellMat.emissive.setRGB(ring.r * e * 0.35, ring.g * e * 0.35, ring.b * e * 0.35);
    this.rings.update(dt);
  }
}

/**
 * A bell waiting at the end of its trial, resting mouth-down on a small stone plinth, with
 * a slow ring of light now and then so it can be spotted from the climb.
 */
export class BellPickup {
  readonly group = new THREE.Group();
  present = true;
  private readonly bellGroup: THREE.Group;
  private readonly halo: THREE.Object3D;
  private readonly rings: RingPool;
  private beat = 0;

  /**
   * `ground`: no plinth, the bell stands on the earth (the one Gravelheart's fall leaves behind the mill); it starts
   * out of the world (`present` false) until `show`.
   */
  constructor(b: AreaBuilder, readonly bell: BellId, readonly x: number, readonly y: number, readonly z: number, ground = false) {
    const look = LOOKS[bell];
    this.bellGroup = bellModel(uniqueSurf('metal', look.bronze, { emissive: new THREE.Color(look.ring).multiplyScalar(0.15) }));
    this.bellGroup.position.y = ground ? 0.6 : 0.7 + 0.6;
    this.halo = glow(look.ring, 0.26, 0.12);
    this.halo.position.y = ground ? 0.3 : 0.85;
    this.group.add(this.bellGroup, this.halo);
    if (!ground) {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), surf('stone', 0x8d877c));
      plinth.position.y = 0.35;
      this.group.add(plinth);
      b.box(x, y + 0.35, z, 0.4, 0.35, 0.4, 0, Layer.Prop);
    }
    this.rings = new RingPool(this.group, look.ring, 0, ground ? 0.4 : 1.0);
    this.group.position.set(x, y, z);
    if (ground) this.take();
  }

  /** A ground bell appears (see `ground`). */
  show() {
    this.present = true;
    this.bellGroup.visible = this.halo.visible = true;
  }

  /** Wren picks it up: the bell is gone, the plinth stays. */
  take() {
    this.present = false;
    this.bellGroup.visible = this.halo.visible = false;
  }

  update(dt: number) {
    if (!this.present) return;
    this.beat += dt;
    if (this.beat > 4) {
      this.beat = 0;
      this.rings.emit();
    }
    this.rings.update(dt);
  }
}

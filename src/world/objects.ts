import * as THREE from 'three';
import { damp, lerpAngle } from '../core/math';
import { Layer, type RAPIER } from '../core/physics';
import { buildHumanoid, type Humanoid, type HumanoidColors } from '../render/characters';
import { mat, uniqueMat } from '../render/materials';
import { glow, heartGeometry, shieldModel } from '../render/shapes';
import type { AreaBuilder } from './area';

/** A villager who stands in place, breathes, and turns to face you when you come close. */
export class Npc {
  readonly h: Humanoid;
  private yaw: number;
  private t = Math.random() * 10;
  private readonly collider: RAPIER.Collider;
  /** False once the villager is gone (content decides who and when). */
  present = true;

  constructor(b: AreaBuilder, colors: HumanoidColors, readonly x: number, readonly z: number, y: number, private readonly baseYaw: number, scale = 1) {
    this.h = buildHumanoid(colors, scale);
    this.yaw = baseYaw;
    this.h.root.position.set(x, y, z);
    this.h.root.rotation.y = baseYaw;
    b.dynamic(this.h.root);
    this.collider = b.cylinder(x, y + 0.9, z, 0.9, 0.45, Layer.Prop);
  }

  setPresent(on: boolean) {
    this.present = on;
    this.h.root.visible = on;
    this.collider.setEnabled(on);
  }

  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    const near = Math.hypot(player.x - this.x, player.z - this.z) < 7;
    const target = near ? Math.atan2(player.x - this.x, player.z - this.z) : this.baseYaw;
    this.yaw = lerpAngle(this.yaw, target, damp(5, dt));
    this.h.root.rotation.y = this.yaw;
    this.h.pivot.position.y = 0.9 + Math.sin(this.t * 2) * 0.015;
    this.h.armL.rotation.x = Math.sin(this.t * 1.3) * 0.08;
    this.h.armR.rotation.x = -Math.sin(this.t * 1.3) * 0.08;
    this.h.head.rotation.z = Math.sin(this.t * 0.7) * 0.06;
  }
}

/**
 * A treasure chest with a hinged lid; its front (lock side) faces `yaw`. A locked chest
 * wears an iron padlock until it's opened.
 */
export class Chest {
  readonly group = new THREE.Group();
  private readonly lid = new THREE.Group();
  private readonly padlock = new THREE.Group();
  private readonly collider: RAPIER.Collider;
  opened = false;
  /** False while a chest waits to appear (a dungeon chest that shows up when a room is cleared). */
  present = true;
  private openT = 0;

  constructor(b: AreaBuilder, readonly x: number, readonly z: number, y: number, yaw: number, readonly locked = false) {
    const wood = mat(0x7a4a24), trim = mat(0xc9a227), dark = mat(0x3a2412);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.95), wood);
    base.position.y = 0.4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 1.0), trim);
    band.position.y = 0.7;
    this.lid.position.set(0, 0.8, -0.47);
    // A half cylinder lying along the chest's width (x), domed side up. (It used to also
    // be turned 90° about y, which stood the lid crosswise over the base.)
    const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.4, 8, 1, false, 0, Math.PI), wood);
    lidMesh.rotation.z = Math.PI / 2;
    lidMesh.position.z = 0.47;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.08), trim);
    lock.position.set(0, 0.05, 0.96);
    // The half cylinder has no flat face; close its underside so the open lid isn't see-through.
    const underside = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.96), dark);
    underside.position.set(0, -0.01, 0.47);
    this.lid.add(lidMesh, lock, underside);
    const inside = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.85), dark);
    inside.position.y = 0.78;
    for (const me of [base, band, lidMesh, lock]) me.castShadow = true;
    // The padlock hangs from the clasp on the front.
    const iron = mat(0x4a4d52);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.12), iron);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 4, 10, Math.PI), iron);
    shackle.position.y = 0.13;
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.02), dark);
    hole.position.set(0, -0.02, 0.065);
    body.castShadow = true;
    this.padlock.add(body, shackle, hole);
    this.padlock.position.set(0, 0.6, 0.56);
    this.padlock.visible = locked;
    this.group.add(base, band, inside, this.lid, this.padlock);
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    b.dynamic(this.group);
    this.collider = b.box(x, y + 0.4, z, 0.72, 0.4, 0.5, yaw, Layer.Prop);
  }

  /** Shows or hides the chest (and its collider). */
  setPresent(on: boolean) {
    this.present = on;
    this.group.visible = on;
    this.collider.setEnabled(on);
  }

  /** Starts the lid opening (or snaps it open when restoring a save). */
  open(instant = false) {
    this.opened = true;
    this.padlock.visible = false;
    if (instant) {
      this.openT = 1;
      this.lid.rotation.x = -1.9;
    }
  }

  update(dt: number) {
    if (!this.opened || this.openT >= 1) return;
    this.openT = Math.min(1, this.openT + dt * 1.2);
    this.lid.rotation.x = -this.openT * 1.9;
  }
}

/**
 * A stone slab with a carved spiral that sinks into the ground when opened. The spiral is
 * dark while the door sleeps and glows once it's `awake` (ready to open).
 */
export class StoneDoor {
  readonly mesh: THREE.Mesh;
  private readonly glyphMat = new THREE.MeshBasicMaterial({ color: 0x5ff2d6 });
  private readonly collider: RAPIER.Collider;
  opening = false;
  open = false;
  awake = false;
  private glow = 0;
  private sink = 0;
  private t = 0;

  /** Half the door's height, and how far it sinks (a little more than its height, so none of it shows). */
  private readonly half: number;
  private readonly drop: number;

  /** A slab `width` wide and `height` tall, standing on `baseY`; size it to fill its doorway (the shrine's is 4 × 6.3). */
  constructor(b: AreaBuilder, readonly x: number, readonly z: number, private readonly baseY: number, width = 4, height = 6.3) {
    this.half = height / 2;
    this.drop = height + 0.1;
    // Its bottom edge starts a hair under the ground so no gap shows on a slope.
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, width), mat(0x77736a));
    this.mesh.position.set(x, baseY + this.half - 0.1, z);
    this.mesh.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 18), this.glyphMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-0.32, 0.3, 0);
    const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), this.glyphMat);
    dot.position.set(-0.34, 0.3, 0);
    this.mesh.add(ring, dot);
    b.dynamic(this.mesh);
    this.collider = b.box(x, baseY + this.half - 0.1, z, 0.3, this.half, width / 2);
  }

  startOpening() {
    this.opening = true;
  }

  /** Restores the opened state from a save without the animation. */
  setOpen() {
    this.opening = this.open = true;
    this.sink = 1;
    this.mesh.position.y = this.baseY + this.half - 0.1 - this.drop;
    this.collider.setEnabled(false);
  }

  /** Wakes the spiral (it brightens over a couple of seconds, or at once when restoring a save). */
  wake(instant = false) {
    this.awake = true;
    if (instant) this.glow = 1;
  }

  update(dt: number) {
    this.t += dt;
    this.glow = Math.min(1, this.glow + (this.awake ? dt / 2 : 0));
    // Asleep: a cold, barely-there gray-teal. Awake: bright and pulsing.
    const pulse = 0.55 + Math.sin(this.t * 2.5) * 0.12;
    this.glyphMat.color.setHSL(0.47, 0.15 + 0.7 * this.glow, 0.08 + (pulse - 0.08) * this.glow);
    if (!this.opening || this.open) return;
    this.sink = Math.min(1, this.sink + dt / 3.2);
    this.mesh.position.y = this.baseY + this.half - 0.1 - this.sink * this.drop;
    this.mesh.position.z = this.z + Math.sin(this.t * 40) * 0.03 * (1 - this.sink);
    if (this.sink >= 1) this.setOpen();
  }
}

/** Bushes you can cut with the sword. One instanced mesh; cut bushes regrow after a while. */
export class BushField {
  private readonly mesh: THREE.InstancedMesh;
  private readonly items: { x: number; y: number; z: number; rot: number; alive: boolean; regrow: number; collider: RAPIER.Collider }[] = [];
  private readonly m = new THREE.Matrix4();

  constructor(b: AreaBuilder, spots: { x: number; y: number; z: number; rot: number }[]) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0x3f7d2e), spots.length);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    spots.forEach((s, i) => {
      this.items.push({ ...s, alive: true, regrow: 0, collider: b.ball(s.x, s.y + 0.1, s.z, 0.6, Layer.Prop) });
      this.place(i, true);
    });
    b.dynamic(this.mesh);
  }

  private place(i: number, visible: boolean) {
    const it = this.items[i];
    const s = visible ? 1 : 0;
    this.m.compose(
      new THREE.Vector3(it.x, it.y + 0.45, it.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot),
      new THREE.Vector3(s, 0.8 * s, s),
    );
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  cut(x: number, z: number, dirX: number, dirZ: number, reach: number) {
    const cut: THREE.Vector3[] = [];
    this.items.forEach((b, i) => {
      if (!b.alive) return;
      const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz);
      if (d > reach + 0.6) return;
      if (d > 0.8 && (dx * dirX + dz * dirZ) / d < 0.1) return;
      b.alive = false;
      b.regrow = 90;
      b.collider.setEnabled(false);
      this.place(i, false);
      cut.push(new THREE.Vector3(b.x, b.y + 0.45, b.z));
    });
    return cut;
  }

  update(dt: number) {
    this.items.forEach((b, i) => {
      if (b.alive) return;
      b.regrow -= dt;
      if (b.regrow > 0) return;
      b.alive = true;
      b.collider.setEnabled(true);
      this.place(i, true);
    });
  }
}

/**
 * A boss arena: a ring that seals with a wall of cold flame (and invisible walls) when the
 * fight starts, and opens again when it ends. Content arms it; the boss seals and unseals it.
 */
export class BossArena {
  /** Ready to start the fight when the player walks in. */
  armed = false;
  sealed = false;
  /** The boss here is gone for good. */
  cleared = false;
  private rise = 0;
  private t = 0;
  private readonly flames: THREE.Mesh[] = [];
  private readonly walls: RAPIER.Collider[] = [];
  private readonly flameMat = new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: 0x3fb8e0, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly lampMat = uniqueMat(0x1e2a30, { emissive: 0x000000 });
  private readonly group = new THREE.Group();

  constructor(b: AreaBuilder, readonly x: number, readonly z: number, readonly y: number, readonly radius: number, lamps: THREE.Vector3[]) {
    const n = 56;
    const geo = new THREE.ConeGeometry(0.28, 1.25, 5);
    geo.translate(0, 0.62, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const f = new THREE.Mesh(geo, this.flameMat);
      f.position.set(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius);
      f.userData.phase = Math.random() * 10;
      this.flames.push(f);
      this.group.add(f);
    }
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 2.2, 64, 1, true), this.ringMat);
    ring.position.set(x, y + 1.1, z);
    this.group.add(ring);
    this.group.visible = false;
    b.dynamic(this.group);

    // Little cage lamps on the posts around the hollow; they flare with cold fire when sealed.
    for (const p of lamps) {
      const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), this.lampMat);
      lamp.position.copy(p);
      b.dynamic(lamp);
    }

    const segs = 40;
    const half = (Math.PI * 2 * (radius + 0.6)) / segs / 2 + 0.3;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      // World layer, so once sealed the camera (and stray projectiles) stay inside too.
      const c = b.box(x + Math.cos(a) * (radius + 0.6), y + 3, z + Math.sin(a) * (radius + 0.6), 0.4, 4, half, -a, Layer.World);
      c.setEnabled(false);
      this.walls.push(c);
    }
  }

  seal() {
    this.sealed = true;
    for (const c of this.walls) c.setEnabled(true);
  }

  unseal() {
    this.sealed = false;
    for (const c of this.walls) c.setEnabled(false);
  }

  /** The fight is won: open up and never arm again. */
  clear() {
    this.cleared = true;
    this.armed = false;
    this.unseal();
  }

  /** True if a point is inside the ring. */
  contains(px: number, pz: number, margin = 0) {
    return Math.hypot(px - this.x, pz - this.z) < this.radius - margin;
  }

  update(dt: number) {
    this.t += dt;
    this.rise = Math.max(0, Math.min(1, this.rise + (this.sealed ? dt / 0.8 : -dt / 1.2)));
    this.group.visible = this.rise > 0.001;
    this.ringMat.opacity = 0.12 * this.rise;
    for (const f of this.flames) {
      const ph = f.userData.phase as number;
      const flick = 0.75 + Math.sin(this.t * 9 + ph) * 0.15 + Math.sin(this.t * 23 + ph * 2) * 0.1;
      f.scale.set(1, Math.max(0.001, this.rise * flick * (1.2 + Math.sin(ph) * 0.4)), 1);
    }
    const lamp = this.cleared ? 0 : this.sealed ? 0.8 + Math.sin(this.t * 13) * 0.2 : 0.08 + Math.sin(this.t * 2) * 0.04;
    this.lampMat.emissive.setRGB(0.25 * lamp, 0.8 * lamp, 1.0 * lamp);
  }
}

/** A floating heart container: picking it up adds a heart. */
export class HeartVessel {
  readonly group = new THREE.Group();
  visible = false;
  private t = 0;

  constructor(b: AreaBuilder, readonly x: number, readonly y: number, readonly z: number) {
    const heart = new THREE.Mesh(heartGeometry(0.22), uniqueMat(0xff3b5c, { emissive: 0x5a0d1a }));
    heart.scale.setScalar(1.6);
    heart.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 24), mat(0xe8c770));
    this.group.add(heart, rim, glow(0xff7a8a, 1.0, 0.18));
    this.group.position.set(x, y + 1.3, z);
    this.group.visible = false;
    b.dynamic(this.group);
  }

  show() {
    this.visible = this.group.visible = true;
  }

  collect() {
    this.visible = this.group.visible = false;
  }

  update(dt: number) {
    if (!this.visible) return;
    this.t += dt;
    this.group.rotation.y += dt * 1.8;
    this.group.position.y = this.y + 1.3 + Math.sin(this.t * 2) * 0.15;
  }
}

/**
 * A shield left lying somewhere (Wren's, before she has it): leaning back against a wall, with a
 * slow glint on its boss so it catches the eye from a distance. `yaw` turns its face.
 */
export class ShieldPickup {
  readonly group = new THREE.Group();
  present = true;
  private readonly glint: THREE.Mesh;
  private t = 0;

  constructor(b: AreaBuilder, readonly x: number, readonly y: number, readonly z: number, yaw: number) {
    const shield = shieldModel(mat(0x8b5a2b), mat(0x9a9fa6));
    shield.rotation.x = -0.35; // leaning back, its foot on the floor
    shield.position.y = 0.42;
    this.glint = glow(0xfff1c0, 0.16, 0.6);
    this.glint.position.set(0, 0.47, 0.12);
    this.group.add(shield, this.glint);
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    b.dynamic(this.group);
  }

  take() {
    this.present = this.group.visible = false;
  }

  update(dt: number) {
    if (!this.present) return;
    this.t += dt;
    // A glint every few seconds: a quick swell and fade, like light catching the iron.
    const k = Math.max(0, Math.sin(this.t * 1.6) ** 12);
    this.glint.scale.setScalar(0.4 + k * 1.4);
    (this.glint.material as THREE.MeshBasicMaterial).opacity = 0.15 + k * 0.7;
  }
}

/**
 * The great lantern atop the shrine. Dark when the story starts; each ember returned makes
 * it glow a little brighter.
 */
export class GreatLantern {
  readonly mesh: THREE.Mesh;
  private readonly material = uniqueMat(0x3a3a44, { emissive: 0x000000 });
  private readonly halo: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private embers = 0;
  private shown = 0;
  private flare = 0;
  private t = 0;

  constructor(b: AreaBuilder, x: number, y: number, z: number) {
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), this.material);
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = true;
    this.halo = glow(0xff9a3a, 1.3, 0);
    this.halo.position.copy(this.mesh.position);
    this.light = new THREE.PointLight(0xffa64a, 0, 26, 1.6);
    this.light.position.copy(this.mesh.position);
    b.dynamic(this.mesh);
    b.dynamic(this.halo);
    b.dynamic(this.light);
  }

  setEmbers(n: number, instant = false) {
    if (n > this.embers && !instant) this.flare = 1;
    this.embers = n;
    if (instant) this.shown = n;
  }

  update(dt: number) {
    this.t += dt;
    this.shown += (this.embers - this.shown) * Math.min(1, dt * 1.5);
    this.flare = Math.max(0, this.flare - dt * 0.6);
    const level = Math.min(1, this.shown / 4) + this.flare * 0.8;
    const pulse = 0.85 + Math.sin(this.t * 2.2) * 0.15;
    this.material.emissive.setRGB(1.0 * level * pulse, 0.55 * level * pulse, 0.2 * level * pulse);
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.22 * level * pulse;
    this.halo.scale.setScalar(1 + this.flare * 0.6);
    this.light.intensity = 6 * level * pulse;
    this.mesh.rotation.y += dt * 0.4;
  }
}

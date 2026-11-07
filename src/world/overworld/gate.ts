import * as THREE from 'three';
import { easeInOut, mulberry32 } from '../../core/math';
import { Layer, type RAPIER } from '../../core/physics';
import { fadeInFog, mat, uniqueMat, surf } from '../../render/materials';
import { glow } from '../../render/shapes';
import type { AreaBuilder } from '../area';
import { GATE, terrainHeight } from './layout';

const STONES = 9;
const STRIPS = 12;
const PILLAR_H = 7.5;
/** How far the flank walls run from the gate's centre: beyond the valley's ring wall (WORLD_RADIUS 172) at this latitude. */
const FLANK_REACH = 140;
/** How long the veil takes to unravel, and the stones to fall, once the ward breaks. */
const UNRAVEL = 2.6;
const GRAVITY = 16;

interface FloatingStone {
  mesh: THREE.Mesh;
  /** Where it hangs (arch), its bob phase, and while falling its velocity and spin. */
  home: THREE.Vector3;
  phase: number;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rest: boolean;
}

/**
 * The magic gate at the mouth of the Northpass (docs/shrine.md, "After the boss"): two pillars,
 * an arch of floating ember-lit stones and a shimmering veil across the cut. While `closed` it is a wall
 * (an invisible `Bounds` box across the opening, with flank walls from the pillars to the valley's rim, so
 * there is no way around it); `open()` lets the stones fall and the veil unravel,
 * `setOpen()` shows it already broken (restoring a save).
 */
export class Gate {
  readonly group = new THREE.Group();
  /** Where the camera looks at it: the middle of the arch. */
  readonly center: THREE.Vector3;
  private state: 'closed' | 'opening' | 'open' = 'closed';
  private t = 0;
  private clock = 0;
  private readonly stones: FloatingStone[] = [];
  private readonly strips: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; delay: number }[] = [];
  private readonly stoneGlow: THREE.MeshLambertMaterial;
  private readonly wall: RAPIER.Collider;
  private readonly groundY: number;
  /** The halo behind the veil: gone once the ward breaks. */
  private readonly lamp: THREE.Mesh;

  constructor(b: AreaBuilder) {
    const { x, z, halfOpening: h } = GATE;
    const rand = mulberry32(88);
    const gy = (this.groundY = Math.max(terrainHeight(x - h, z), terrainHeight(x + h, z), terrainHeight(x, z)));
    this.center = new THREE.Vector3(x, gy + 4.2, z);
    const stone = surf('stone', 0x8a8478), dark = surf('stone', 0x5e5a52);
    // Two squat pillars (solid) with carved caps, set into the ground.
    for (const side of [-1, 1]) {
      const px = x + side * (h + 0.8);
      b.mesh(new THREE.BoxGeometry(1.7, PILLAR_H + 2, 1.7), stone, px, gy + PILLAR_H / 2 - 1, z);
      b.mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), dark, px, gy + PILLAR_H + 0.25, z);
      b.mesh(new THREE.BoxGeometry(2.0, 0.6, 2.0), dark, px, gy + 0.3, z);
      b.box(px, gy + PILLAR_H / 2, z, 0.85, PILLAR_H / 2 + 1, 0.85, 0, Layer.Prop);
    }
    // The arch: stones hanging in a half ring over the opening, each with a glowing rune face.
    this.stoneGlow = uniqueMat(0xf0a830, { emissive: 0x5a3208 });
    const radius = h + 0.8;
    for (let i = 0; i < STONES; i++) {
      const a = Math.PI * (i / (STONES - 1));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.0, 1.1), dark);
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.12), this.stoneGlow);
      rune.position.z = 0.58;
      mesh.add(rune);
      const home = new THREE.Vector3(x + Math.cos(a) * radius, gy + PILLAR_H + 0.9 + Math.sin(a) * 3.1, z);
      mesh.position.copy(home);
      mesh.rotation.z = a - Math.PI / 2;
      this.group.add(mesh);
      this.stones.push({ mesh, home, phase: rand() * 6, vel: new THREE.Vector3(), spin: new THREE.Vector3(), rest: false });
    }
    // The veil: vertical strips of glowing ember-colored light that shimmer and then come apart.
    const w = (h * 2 + 0.4) / STRIPS;
    const veilH = PILLAR_H + 2.2;
    for (let i = 0; i < STRIPS; i++) {
      const material = fadeInFog(new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, veilH), material);
      mesh.position.set(x - h - 0.2 + (i + 0.5) * w, gy + veilH / 2 - 0.4, z);
      this.group.add(mesh);
      this.strips.push({ mesh, material, delay: (i / STRIPS) * 0.55 });
    }
    this.lamp = glow(0xffa64a, 1.6, 0.18);
    this.lamp.position.copy(this.center);
    this.group.add(this.lamp);
    b.dynamic(this.group);
    // The ward is a wall (nothing walks through, the camera stays on its side).
    this.wall = b.box(x, gy + 6, z, h + 0.2, 8, 0.6, 0, Layer.Bounds);
    // And the ground around it is no way past either: from each pillar a tall invisible wall runs out to
    // the valley's rim (past the ring of world bounds), so the pillars can't be walked around nor the
    // hills above them climbed over. These stay after the ward breaks; only the opening between the pillars does.
    for (const side of [-1, 1]) {
      const from = x + side * (h + 0.8), to = x + side * FLANK_REACH;
      b.box((from + to) / 2, 40, z, Math.abs(to - from) / 2, 80, 0.5, 0, Layer.Bounds);
    }
  }

  get isOpen() {
    return this.state !== 'closed';
  }

  /** Whether the stones have finished falling and the veil is gone. */
  get settled() {
    return this.state === 'open';
  }

  /** The ward breaks: the veil unravels, the stones fall. */
  open() {
    if (this.state !== 'closed') return;
    this.state = 'opening';
    this.t = 0;
    this.lamp.visible = false;
    this.wall.setEnabled(false);
    for (const s of this.stones) {
      s.vel.set((Math.random() - 0.5) * 2.5, 1 + Math.random() * 2, (Math.random() - 0.3) * 2.5);
      s.spin.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    }
  }

  /** Already broken: rubble on the ground, no veil (restoring a save). */
  setOpen() {
    this.state = 'open';
    this.lamp.visible = false;
    this.wall.setEnabled(false);
    const { x } = GATE;
    this.stones.forEach((s, i) => {
      const k = (i / (STONES - 1) - 0.5) * 2;
      // The rubble lies to the sides and in front of the pillars, clear of the way through.
      s.mesh.position.set(x + (k < 0 ? -1 : 1) * (GATE.halfOpening + 1.2 + (i % 3) * 0.9), this.groundY + 0.4, GATE.z + 1.4 + (i % 4) * 0.8);
      s.mesh.rotation.set((i * 0.7) % 0.5, i * 1.3, (i * 0.9) % 0.5);
      s.rest = true;
    });
    for (const v of this.strips) v.mesh.visible = false;
  }

  update(dt: number) {
    this.clock += dt;
    const glowK = this.state === 'closed' ? 0.8 + Math.sin(this.clock * 2.2) * 0.2 : 0.3;
    this.stoneGlow.emissive.setRGB(0.5 * glowK, 0.27 * glowK, 0.05 * glowK);
    if (this.state === 'closed') {
      for (const s of this.stones) {
        s.mesh.position.y = s.home.y + Math.sin(this.clock * 1.1 + s.phase) * 0.12;
      }
      this.strips.forEach((v, i) => {
        v.material.opacity = 0.36 + Math.sin(this.clock * 1.7 + i * 0.7) * 0.1;
        v.mesh.position.x += Math.sin(this.clock * 3 + i) * 0.0005;
      });
      return;
    }
    if (this.state === 'open') return;
    this.t += dt;
    for (const v of this.strips) {
      const k = Math.min(1, Math.max(0, (this.t / UNRAVEL - v.delay) / 0.45));
      v.material.opacity = (1 - easeInOut(k)) * 0.4 + (k > 0 && k < 1 ? 0.25 * Math.sin(k * Math.PI) : 0);
      v.mesh.scale.y = 1 - 0.5 * k;
      v.mesh.visible = k < 1;
    }
    let settled = true;
    for (const s of this.stones) {
      if (s.rest) continue;
      // The arch lets go in a wave from one end to the other.
      if (this.t < 0.25 + (s.home.x - (GATE.x - GATE.halfOpening)) * 0.06) {
        settled = false;
        continue;
      }
      s.vel.y -= GRAVITY * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      const floor = terrainHeight(s.mesh.position.x, s.mesh.position.z) + 0.4;
      if (s.mesh.position.y <= floor) {
        s.mesh.position.y = floor;
        s.vel.multiplyScalar(0);
        s.spin.multiplyScalar(0);
        s.rest = true;
      } else settled = false;
    }
    if (settled && this.t > UNRAVEL) this.state = 'open';
  }
}

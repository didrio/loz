import * as THREE from 'three';
import { fadeInFog } from './materials';
import { mulberry32 } from '../core/math';
import { FLAME_Y, sconceFlame } from './models/shrineProps';
import { pal } from './palette';

/** Specks of dust rising through each flame's warmth. */
const DUST_PER_SCONCE = 5;
/** How far a speck rises before it starts again under the flame (metres), and how wide it wanders. */
const DUST_RISE = 0.95, DUST_WANDER = 0.18;

/**
 * The dungeon's sconce flames, alive (T56a; docs/shrine.md "The final look"): each flame flickers on its own phase (the
 * tongue stretches, the halo breathes), and a few warm specks of dust drift up through its glow. All the dust is one
 * `Points` (one draw call for the whole dungeon). The iron is static scenery: the dungeon merges `sconceIron()` itself.
 */
export class SconceGlow {
  private readonly flames: { tongue: THREE.Mesh; glow: THREE.Object3D; phase: number }[] = [];
  private readonly spots: { x: number; y: number; z: number; ox: number; oz: number }[] = [];
  private points: THREE.Points | null = null;
  private seeds = new Float32Array(0);

  /** A flame at the cup's centre (x, y, z), facing `yaw` (into the room). */
  add(parent: THREE.Object3D, x: number, y: number, z: number, yaw: number) {
    const f = sconceFlame();
    f.group.position.set(x, y, z);
    f.group.rotation.y = yaw;
    parent.add(f.group);
    this.flames.push({ tongue: f.tongue, glow: f.glow, phase: (this.flames.length * 2.399) % (Math.PI * 2) });
    // The dust rises a hand's width in front of the flame, where the light catches it.
    this.spots.push({ x, y: y + FLAME_Y, z, ox: Math.sin(yaw) * 0.08, oz: Math.cos(yaw) * 0.08 });
  }

  /** Builds the dust once every flame is added. */
  finish(parent: THREE.Object3D) {
    const n = this.spots.length * DUST_PER_SCONCE;
    if (!n) return;
    const rand = mulberry32(91);
    this.seeds = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.seeds[i] = rand();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = fadeInFog(new THREE.PointsMaterial({ color: pal('flame', 3), size: 0.035, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points = new THREE.Points(geo, m);
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.update(0);
  }

  update(t: number) {
    for (const f of this.flames) {
      const k = Math.sin(t * 9 + f.phase) * 0.6 + Math.sin(t * 23 + f.phase * 1.7) * 0.4;
      f.tongue.scale.set(1 - k * 0.05, 1 + k * 0.14, 1 - k * 0.05);
      f.glow.scale.setScalar(1 + k * 0.06);
    }
    if (!this.points) return;
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let s = 0; s < this.spots.length; s++) {
      const p = this.spots[s];
      for (let k = 0; k < DUST_PER_SCONCE; k++) {
        const i = s * DUST_PER_SCONCE + k, a = this.seeds[i * 3], b = this.seeds[i * 3 + 1], c = this.seeds[i * 3 + 2];
        const rise = ((a + t * (0.06 + b * 0.06)) % 1) * DUST_RISE;
        const sway = Math.sin(t * (0.5 + c) + a * 10) * DUST_WANDER * (0.3 + rise);
        pos.setXYZ(i, p.x + p.ox + sway * (b - 0.5) * 2, p.y + 0.12 + rise, p.z + p.oz + sway * (c - 0.5) * 2);
      }
    }
    pos.needsUpdate = true;
  }
}

import * as THREE from 'three';
import type { MoteLook } from './atmosphere';

const SPAN = 44;
const HEIGHT = 16;

/** `v` shifted by whole multiples of `span` so it lies within `span / 2` of `center`. */
export function wrapAround(v: number, center: number, span: number) {
  const half = span / 2;
  return ((((v - center + half) % span) + span) % span) - half + center;
}

/**
 * Specks drifting through the air around the player: the blight's ash, the hollow's spirit lights, the
 * shrine's dust. What they look like is a `MotePreset` (render/atmosphere.ts); `Sky.moteLook()` says which one is
 * in the air and how strongly.
 */
export class Motes {
  private readonly pos: Float32Array;
  private readonly points: THREE.Points;
  private readonly speed: Float32Array;
  private t = 0;

  constructor(scene: THREE.Scene, private readonly count = 240) {
    this.pos = new Float32Array(count * 3);
    this.speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.pos.set([(Math.random() - 0.5) * SPAN, Math.random() * HEIGHT, (Math.random() - 0.5) * SPAN], i * 3);
      this.speed[i] = 0.5 + Math.random(); // around 1: a preset's `fall` is the average
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.11, transparent: true, opacity: 0, depthWrite: false });
    this.points = new THREE.Points(geo, m);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** `look`: what is in the air (null or level ~0: nothing drawn); `focus` is where the player is. */
  update(dt: number, focus: THREE.Vector3, look: MoteLook | null) {
    this.points.visible = !!look && look.level > 0.01;
    if (!look || !this.points.visible) return;
    const { preset, level } = look;
    const m = this.points.material as THREE.PointsMaterial;
    m.color.set(preset.color);
    m.size = preset.size;
    m.opacity = preset.opacity * level;
    this.points.geometry.setDrawRange(0, Math.round(this.count * preset.density));
    this.t += dt;
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      // Specks fall (or rise) and sway; the cloud is a box that follows the player (motes wrap around it).
      p[j] = wrapAround(p[j] + Math.sin(this.t * 0.6 + i) * dt * preset.sway + dt * preset.wind, focus.x, SPAN);
      p[j + 1] = wrapAround(p[j + 1] - dt * this.speed[i] * preset.fall, focus.y + HEIGHT / 2 - 2, HEIGHT);
      p[j + 2] = wrapAround(p[j + 2] + Math.cos(this.t * 0.5 + i * 1.7) * dt * preset.sway, focus.z, SPAN);
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

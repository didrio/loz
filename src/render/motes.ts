import * as THREE from 'three';

const SPAN = 44;
const HEIGHT = 16;

/** `v` shifted by whole multiples of `span` so it lies within `span / 2` of `center`. */
export function wrapAround(v: number, center: number, span: number) {
  const half = span / 2;
  return ((((v - center + half) % span) + span) % span) - half + center;
}

/** Ash drifting through the air around the player while the blight lies on the valley (fades with it). */
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
      this.speed[i] = 0.3 + Math.random() * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xb9a6c8, size: 0.11, transparent: true, opacity: 0, depthWrite: false });
    this.points = new THREE.Points(geo, m);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** `level` is the sky's blight (0 = none, nothing drawn); `focus` is where the player is. */
  update(dt: number, focus: THREE.Vector3, level: number) {
    this.points.visible = level > 0.01;
    if (!this.points.visible) return;
    (this.points.material as THREE.PointsMaterial).opacity = 0.75 * level;
    this.t += dt;
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      // Ash falls slowly and sways; the cloud is a box that follows the player (motes wrap around it).
      p[j] = wrapAround(p[j] + Math.sin(this.t * 0.6 + i) * dt * 0.5 + dt * 0.6, focus.x, SPAN);
      p[j + 1] = wrapAround(p[j + 1] - dt * this.speed[i], focus.y + HEIGHT / 2 - 2, HEIGHT);
      p[j + 2] = wrapAround(p[j + 2] + Math.cos(this.t * 0.5 + i * 1.7) * dt * 0.5, focus.z, SPAN);
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

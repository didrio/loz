import * as THREE from 'three';
import { mulberry32 } from '../core/math';
import { fadeInFog } from './materials';
import { pal } from './palette';

/**
 * Dust hanging in a room's air (T56c, the Hall of Sleepers' mood; docs/shrine.md "The final look"): pale warm specks
 * drifting up and sideways very slowly through the whole room, a few catching the torchlight. One `Points`, one draw call,
 * unlit (the room's own light does the lighting). The sconces have their own dust (`SconceGlow`); this is the room's.
 */
export interface DustBox {
  x: number;
  z: number;
  w: number;
  d: number;
  /** The floor's height and the height the specks rise to. */
  y0: number;
  y1: number;
}

export class RoomDust {
  readonly points: THREE.Points;
  private readonly seeds: Float32Array;

  constructor(private readonly box: DustBox, private readonly count = 28, seed = 5) {
    const rand = mulberry32(seed);
    this.seeds = new Float32Array(count * 4);
    for (let i = 0; i < this.seeds.length; i++) this.seeds[i] = rand();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const m = fadeInFog(new THREE.PointsMaterial({ color: pal('sand', 3), size: 0.03, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points = new THREE.Points(geo, m);
    this.points.frustumCulled = false;
    this.update(0);
  }

  /** Where speck `i` is at time `t` (seconds): rises slowly, wraps at the top, sways about its own spot. */
  at(i: number, t: number): [number, number, number] {
    const { x, z, w, d, y0, y1 } = this.box, s = this.seeds, a = s[i * 4], b = s[i * 4 + 1], c = s[i * 4 + 2], e = s[i * 4 + 3];
    const height = y1 - y0, rise = (e + t * (0.012 + c * 0.014)) % 1;
    const sway = (0.4 + rise) * 0.35;
    return [
      x + 0.6 + a * (w - 1.2) + Math.sin(t * (0.2 + b * 0.25) + a * 9) * sway,
      y0 + 0.4 + rise * (height - 0.4),
      z + 0.6 + b * (d - 1.2) + Math.cos(t * (0.17 + c * 0.2) + b * 9) * sway,
    ];
  }

  update(t: number) {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) pos.setXYZ(i, ...this.at(i, t));
    pos.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

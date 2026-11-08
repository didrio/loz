import * as THREE from 'three';
import { pal } from './palette';

/**
 * The game's named particle effects (art.md "Effects"): combat feedback should read the same whichever enemy,
 * weapon or hazard made it. Call sites say *what happened* (`particles.fx('hitSpark', at)`) and, where a thing
 * truly differs, override one number or the colour. Every colour is a palette colour (`Particles` snaps the rest).
 */
export interface FxPreset {
  color: number;
  count: number;
  speed: number;
  life: number;
  /** Falls back down (sparks, dust, debris) or floats (sparkles, smoke, motes). */
  gravity: boolean;
}

export const FX = {
  /** A sword lands: a few white chips. */
  hitSpark: { color: pal('chalk', 3), count: 6, speed: 6, life: 0.3, gravity: true },
  /** The sword finds a weak point: bigger, cold. */
  weakSpark: { color: pal('spirit', 3), count: 14, speed: 7, life: 0.45, gravity: true },
  /** A hit stopped by a shield (or by armour): warm gold. */
  guardSpark: { color: pal('flame', 3), count: 10, speed: 6, life: 0.35, gravity: true },
  /** Wren is hurt. */
  hurtSpark: { color: pal('crimson', 2), count: 8, speed: 4, life: 0.6, gravity: true },
  /** Something dies: the colour is the creature's. */
  deathPuff: { color: pal('stone', 3), count: 18, speed: 6, life: 0.7, gravity: true },
  /** Feet, shields and falling stone throw dust. */
  dustKick: { color: pal('earth', 2), count: 5, speed: 3, life: 0.45, gravity: true },
  /** Cut grass, thorn chips: green by default. */
  leafCut: { color: pal('grass', 2), count: 14, speed: 5, life: 0.6, gravity: true },
  /** Broken jars and shields: wooden and clay bits. */
  shards: { color: pal('wood', 2), count: 16, speed: 5, life: 0.7, gravity: true },
  /** A pickup, a chest, a thing waking: a warm shimmer that floats up. */
  itemSparkle: { color: pal('flame', 3), count: 24, speed: 3, life: 1, gravity: false },
  /** Magic in the air: cold lights (the Seal, the prism, the lanterns' spirits). */
  magicMotes: { color: pal('spirit', 3), count: 20, speed: 3, life: 1, gravity: false },
  /** Smoke and soot: dark, drifting. */
  smoke: { color: pal('stone', 0), count: 4, speed: 1.5, life: 1, gravity: false },
  /** A few embers, hot and short. */
  embers: { color: pal('flame', 2), count: 2, speed: 2, life: 0.6, gravity: false },
} as const satisfies Record<string, FxPreset>;

export type FxName = keyof typeof FX;

/** What a call site may change about a preset: a colour, or one or two of the numbers. */
export type FxOpts = Partial<FxPreset>;

/** The most particles alive at once; a burst that would pass it is trimmed, so no fight can flood a frame. */
export const MAX_PARTICLES = 320;

/** A preset with a call site's overrides applied. */
export function resolveFx(name: FxName, opts: FxOpts = {}): FxPreset {
  const p: FxPreset = FX[name];
  return {
    color: opts.color ?? p.color,
    count: opts.count ?? p.count,
    speed: opts.speed ?? p.speed,
    life: opts.life ?? p.life,
    gravity: opts.gravity ?? p.gravity,
  };
}

/** How many of `want` new particles fit with `alive` already flying. */
export function room(alive: number, want: number, cap = MAX_PARTICLES) {
  return Math.max(0, Math.min(want, cap - alive));
}

/**
 * The glowing arc behind a sword swing. One mesh, shown while a swing is in its fast part and faded out after.
 * Horizontal for the two slashes, vertical for the overhead chop.
 */
export class SlashTrail {
  readonly pivot = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({
      color: pal('chalk', 3), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.7, 2.3, 18, 1, 0, Math.PI * 0.9), this.mat);
    this.pivot.add(this.mesh);
    scene.add(this.pivot);
  }

  /** Fades a little each frame. */
  fade(dt: number) {
    this.mat.opacity = Math.max(0, this.mat.opacity - dt * 5);
  }

  /** Shows the arc at `at`, facing `facing`; `chop` is the vertical overhead one. */
  show(at: THREE.Vector3, height: number, facing: number, chop: boolean) {
    this.mat.opacity = 0.45;
    this.pivot.position.copy(at).setY(at.y + height);
    this.pivot.rotation.y = facing;
    if (chop) this.mesh.rotation.set(0, -Math.PI / 2, 0);
    else this.mesh.rotation.set(-Math.PI / 2, 0, -Math.PI * 0.95);
  }

  get opacity() {
    return this.mat.opacity;
  }
}

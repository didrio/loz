import * as THREE from 'three';
import { TrialFalls, type FallApi } from './trialFalls';

/**
 * Overworld water (docs/sallowmere.md, "Water"). There is no swimming: from the depth of the water at Wren's feet
 * a spot is dry, shallow (she wades, slower) or deep (a fall). Depth is measured against the water level of the
 * place she stands in, so a region can sit at its own height.
 */

/** Feet this far under the surface (m) and Wren wades. Shallower than this is a puddle. */
export const WADE_DEPTH = 0.35;
/** Feet this far under the surface (m) and the water is too deep to stand in: a fall. About chest height on Wren (1.8 m).
 *  The valley's deepest ford (the shrine road) is 1.1 m, so every road stays walkable. */
export const DEEP_DEPTH = 1.2;
/** Run speed while wading, m/s (dry is 8.5). */
export const WADE_SPEED = 5;

export type WaterState = 'dry' | 'shallow' | 'deep';

/** How far under the surface a point at `y` is (0 if it is above it, or there is no water). */
export function waterDepth(y: number, level: number | null | undefined): number {
  return level == null ? 0 : Math.max(0, level - y);
}

/** Dry, shallow or deep, for feet at `y` in water at `level` (null: no water here). */
export function waterState(y: number, level: number | null | undefined): WaterState {
  const d = waterDepth(y, level);
  return d >= DEEP_DEPTH ? 'deep' : d >= WADE_DEPTH ? 'shallow' : 'dry';
}

/**
 * Deep water as a fall: Wren remembers the last dry ground she stood on, and wading too deep fades out and puts her
 * back there, for what a pit costs (`TRIAL_RULES.fallDamage`). The same fall as a bell trial's, so it is `TrialFalls`
 * underneath.
 */
export class WaterFalls {
  private readonly fall: TrialFalls;

  constructor(private readonly start: THREE.Vector3) {
    this.fall = new TrialFalls([], -Infinity, start);
  }

  /** Where a fall returns to right now. */
  get dryGround() {
    return this.fall.checkpoint;
  }

  get falling() {
    return this.fall.falling;
  }

  /** Forget the last dry ground (a death sends Wren back to the start). */
  reset() {
    this.fall.mark(this.start.x, this.start.y, this.start.z);
  }

  /** Every frame. `level` is the water level where Wren stands. True on the frame a fall begins (then call `recover`). */
  check(pos: THREE.Vector3, grounded: boolean, level: number | null | undefined): boolean {
    const state = waterState(pos.y, level);
    if (state === 'dry' && grounded && !this.fall.falling) this.fall.mark(pos.x, pos.y, pos.z);
    return this.fall.check(pos, grounded, state === 'deep');
  }

  recover(api: FallApi) {
    return this.fall.recover(api);
  }
}

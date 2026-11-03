import * as THREE from 'three';
import { Layer, type Physics } from '../core/physics';
import { Gloomwisp } from './enemies';

/**
 * Anything lock-on can hold: an enemy, or a Murmurbud (world/murmurbud.ts). Lock-on, the camera,
 * Wren's facing and the glove's aim only need where it is, how high to look, and whether it's still there.
 */
export interface LockTarget {
  readonly pos: THREE.Vector3;
  readonly alive: boolean;
  readonly lockHeight: number;
  readonly targetable: boolean;
}

/** Farther than this, lock-on won't pick an enemy (and lets go of one). */
export const LOCK_RANGE = 20;
/** More height difference than this (feet to feet) means another floor: not targetable. */
const LEVEL = 4;

/**
 * Whether Wren (feet at `from`) could lock onto an enemy: on the same level (not through a
 * floor) and in plain sight (no wall between Wren's eyes and the enemy's lock point).
 */
export function canTarget(from: THREE.Vector3, e: LockTarget, physics: Physics) {
  if (!e.targetable || (e instanceof Gloomwisp && e.leaving)) return false;
  if (Math.abs(e.pos.y - from.y) > LEVEL) return false;
  const eye = from.clone().setY(from.y + 1.6);
  const to = e.pos.clone().setY(e.pos.y + e.lockHeight).sub(eye);
  const len = to.length();
  return len < 0.01 || physics.rayDistance(eye, to.divideScalar(len), len, Layer.World) >= len - 0.3;
}

/**
 * The enemy (or bud) to lock onto: close, roughly where the camera looks (anything right next to
 * Wren counts even behind), and targetable. Null if there's none.
 */
export function pickLockTarget(from: THREE.Vector3, camFwd: THREE.Vector3, enemies: readonly LockTarget[], physics: Physics) {
  let best: LockTarget | null = null, bestScore = Infinity;
  for (const e of enemies) {
    const to = e.pos.clone().sub(from).setY(0);
    const d = to.length();
    if (d > LOCK_RANGE) continue;
    const dot = d > 0 ? to.normalize().dot(camFwd) : 1;
    if (dot < 0 && d > 5) continue;
    const score = d - dot * 8;
    if (score >= bestScore || !canTarget(from, e, physics)) continue;
    best = e;
    bestScore = score;
  }
  return best;
}

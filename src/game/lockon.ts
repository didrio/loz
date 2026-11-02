import * as THREE from 'three';
import { Layer, type Physics } from '../core/physics';
import { Gloomwisp, type Enemy } from './enemies';

/** Farther than this, lock-on won't pick an enemy (and lets go of one). */
export const LOCK_RANGE = 20;
/** More height difference than this (feet to feet) means another floor: not targetable. */
const LEVEL = 4;

/**
 * Whether Wren (feet at `from`) could lock onto an enemy: on the same level (not through a
 * floor) and in plain sight (no wall between Wren's eyes and the enemy's lock point).
 */
export function canTarget(from: THREE.Vector3, e: Enemy, physics: Physics) {
  if (!e.targetable || (e instanceof Gloomwisp && e.leaving)) return false;
  if (Math.abs(e.pos.y - from.y) > LEVEL) return false;
  const eye = from.clone().setY(from.y + 1.6);
  const to = e.pos.clone().setY(e.pos.y + e.lockHeight).sub(eye);
  const len = to.length();
  return len < 0.01 || physics.rayDistance(eye, to.divideScalar(len), len, Layer.World) >= len - 0.3;
}

/**
 * The enemy to lock onto: close, roughly where the camera looks (anything right next to
 * Wren counts even behind), and targetable. Null if there's none.
 */
export function pickLockTarget(from: THREE.Vector3, camFwd: THREE.Vector3, enemies: readonly Enemy[], physics: Physics) {
  let best: Enemy | null = null, bestScore = Infinity;
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

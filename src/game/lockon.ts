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

/**
 * Touch only. The target to move lock-on to when `gone` (the one just locked) dies: the best
 * pick from Wren's spot, facing where she faces (the camera is no use: a thumb isn't steering it).
 */
export function nextLockTarget(from: THREE.Vector3, facing: number, enemies: readonly LockTarget[], gone: LockTarget, physics: Physics) {
  const fwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  return pickLockTarget(from, fwd, enemies.filter((e) => e !== gone && e.alive), physics);
}

/** An unlocked swing on touch turns toward an enemy at most this far away… */
export const AIM_RANGE = 5;
/** …and at most this far (radians) off the way Wren faces: "in front". */
export const AIM_CONE = 0.7;

/**
 * Touch only. The direction (a yaw) to turn an unlocked swing toward: the nearest enemy within
 * `AIM_RANGE` and `AIM_CONE` of `facing`, or null (swing where she faces).
 */
export function autoAimYaw(from: THREE.Vector3, facing: number, enemies: readonly LockTarget[]) {
  let best: number | null = null, bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive || !e.targetable) continue;
    const dx = e.pos.x - from.x, dz = e.pos.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > AIM_RANGE || d >= bestD || Math.abs(from.y - e.pos.y) > 2) continue;
    const yaw = Math.atan2(dx, dz);
    let off = yaw - facing;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) > AIM_CONE) continue;
    best = yaw;
    bestD = d;
  }
  return best;
}

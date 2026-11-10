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

/** Farther than this, lock-on won't pick an enemy… */
export const LOCK_RANGE = 12;
/** …and lets go of one this far away (longer, so backing off from a fight doesn't drop it). */
export const LOCK_RELEASE = 18;
/** Pickable only within this cone of where the camera looks (the dot product of the directions: 0.5 is 60° either side)… */
export const LOCK_CONE = 0.5;
/** …except anything this close, which counts even behind Wren. */
export const LOCK_CLOSE = 3;
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
 * The enemy (or bud) to lock onto: close (`LOCK_RANGE`), inside the cone the camera looks along
 * (anything within `LOCK_CLOSE` counts even behind), and targetable. Null if there's none.
 */
export function pickLockTarget(from: THREE.Vector3, camFwd: THREE.Vector3, enemies: readonly LockTarget[], physics: Physics) {
  let best: LockTarget | null = null, bestScore = Infinity;
  for (const e of enemies) {
    const to = e.pos.clone().sub(from).setY(0);
    const d = to.length();
    if (d > LOCK_RANGE) continue;
    const dot = d > 0 ? to.normalize().dot(camFwd) : 1;
    if (dot < LOCK_CONE && d > LOCK_CLOSE) continue;
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

/** Something interact can use: where it is, its reach, and whether it's still usable (world/area.ts `Interactable`). */
interface Usable {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  enabled(): boolean;
}

/** Touch: a tap up to this long (s) after the thing left reach still uses it, while Wren is within its reach plus `INTERACT_SLACK`… */
export const INTERACT_GRACE = 0.45;
/** …metres. */
export const INTERACT_SLACK = 1.2;
/** Touch: a tap with nothing in reach waits this long (s) for something to come into reach. */
export const INTERACT_BUFFER = 0.25;

/**
 * What a press of interact uses this frame. Keyboard and pad: only what's in reach right now. Touch is forgiving both ways,
 * because a thumb leaves the stick, travels and lands a beat late: a tap just after the thing slipped out of reach (an NPC
 * wandering, Wren sliding to a stop) still uses it (`INTERACT_GRACE`), and a tap just before it comes into reach waits for
 * it (`INTERACT_BUFFER`). The Interact button lingers on screen for the same grace (ui/touch.ts), so what you see is what counts.
 */
export class InteractAim<T extends Usable> {
  private recent: T | null = null;
  private recentAge = Infinity;
  private buffer = 0;

  /** Call once per frame of play. `near`: what's in reach now; `pressed`: interact pressed this frame. */
  update(near: T | null, pressed: boolean, touch: boolean, at: { x: number; z: number }, dt: number): T | null {
    if (near) {
      this.recent = near;
      this.recentAge = 0;
    } else this.recentAge += dt;
    const wanted = pressed || this.buffer > 0;
    this.buffer = Math.max(0, this.buffer - dt);
    if (!wanted) return null;
    if (near) {
      this.buffer = 0;
      return near;
    }
    if (!touch || !pressed) return null;
    const r = this.lingering(at);
    if (r) {
      this.recent = null;
      return r;
    }
    this.buffer = INTERACT_BUFFER;
    return null;
  }

  /** Touch: what a tap would still use though nothing is in reach (the thing that just left, within the grace), or null. */
  lingering(at: { x: number; z: number }): T | null {
    const r = this.recent;
    return r && this.recentAge > 0 && this.recentAge <= INTERACT_GRACE && r.enabled() && Math.hypot(r.x - at.x, r.z - at.z) < r.r + INTERACT_SLACK ? r : null;
  }

  /** Forget everything (an area change, a script took over). */
  reset() {
    this.recent = null;
    this.recentAge = Infinity;
    this.buffer = 0;
  }
}

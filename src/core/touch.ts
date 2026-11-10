/**
 * Touch controls as pure logic: fingers in, actions out. The overlay (ui/touch.ts) hit-tests each
 * finger once, when it lands, and tells this module what that finger is for; from then on the
 * finger keeps that job wherever it slides, like a held key, until it lifts.
 *
 * - **stick**: a floating stick centred where the thumb landed (analog, pad convention: y down).
 *   If the thumb slides past the rim, the centre follows it, so turning around never needs a re-grab.
 * - **look**: drags turn the camera (pixels, read once per frame like mouse movement).
 * - **button**: holds its actions while down, presses them on the frame it lands.
 */
import type { Action } from './input';

/** Stick travel in pixels: a thumb this far from the centre is full tilt. */
export const STICK_RADIUS = 56;
/** Below this fraction of full tilt the stick reads zero (a resting thumb drifts). */
export const STICK_DEADZONE = 0.12;
export type FingerRole =
  | { kind: 'stick' }
  | { kind: 'look' }
  | { kind: 'button'; actions: readonly Action[] };

/** A button's tappable circle on screen (CSS pixels): its drawn centre and radius, plus how far past the rim a tap still counts. */
export interface ButtonZone<Id extends string = string> {
  id: Id;
  x: number;
  y: number;
  r: number;
  slop: number;
}

/**
 * The button a finger landing at (x, y) is for, or null for none. A tap counts within the drawn circle plus its slop, and
 * where two zones overlap the one whose rim is nearer wins (a thumb aims at a button's middle, so "nearer rim" beats "on
 * top in the page"). This is how the overlay hit-tests: by geometry, not by which element the browser says is under the
 * finger, so a hidden fade or a stacking order never eats a tap.
 */
export function hitButton<Id extends string>(zones: readonly ButtonZone<Id>[], x: number, y: number): Id | null {
  let best: Id | null = null;
  let bestEdge = Infinity;
  for (const z of zones) {
    const edge = Math.hypot(x - z.x, y - z.y) - z.r;
    if (edge <= z.slop && edge < bestEdge) {
      best = z.id;
      bestEdge = edge;
    }
  }
  return best;
}

interface Finger {
  role: FingerRole;
  x: number;
  y: number;
  /** The stick's centre. */
  ox: number;
  oy: number;
}

export class TouchPad {
  private fingers = new Map<number, Finger>();
  private heldCount = new Map<Action, number>();
  private pressedSet = new Set<Action>();
  private lookX = 0;
  private lookY = 0;
  /**
   * While true (the game sets it each frame: Wren is surfing), a finger holding the Shield button
   * also turns the camera when it slides, so one thumb can hold the surf and steer the view.
   */
  buttonLooks = false;

  down(id: number, x: number, y: number, role: FingerRole) {
    this.up(id);
    this.fingers.set(id, { role, x, y, ox: x, oy: y });
    if (role.kind === 'button') {
      for (const a of role.actions) {
        this.heldCount.set(a, (this.heldCount.get(a) ?? 0) + 1);
        this.pressedSet.add(a);
      }
    }
  }

  move(id: number, x: number, y: number) {
    const f = this.fingers.get(id);
    if (!f) return;
    const { role } = f;
    if (role.kind === 'look' || (role.kind === 'button' && this.buttonLooks && role.actions.includes('shield'))) {
      this.lookX += x - f.x;
      this.lookY += y - f.y;
    } else if (role.kind === 'stick') {
      const dx = x - f.ox, dy = y - f.oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        f.ox = x - (dx / len) * STICK_RADIUS;
        f.oy = y - (dy / len) * STICK_RADIUS;
      }
    }
    f.x = x;
    f.y = y;
  }

  up(id: number) {
    const f = this.fingers.get(id);
    if (!f) return;
    this.fingers.delete(id);
    if (f.role.kind === 'button') {
      for (const a of f.role.actions) {
        const n = (this.heldCount.get(a) ?? 1) - 1;
        if (n > 0) this.heldCount.set(a, n);
        else this.heldCount.delete(a);
      }
    }
  }

  /** Lifts every finger (the overlay hid, the page lost focus). */
  clear() {
    for (const id of this.fingers.keys()) this.up(id);
    this.lookX = this.lookY = 0;
  }

  /** Presses an action for one frame (a tap on a HUD icon). */
  tap(a: Action) {
    this.pressedSet.add(a);
  }

  pressed(a: Action) {
    return this.pressedSet.has(a);
  }

  held(a: Action) {
    return this.heldCount.has(a);
  }

  /** The stick's tilt, pad convention (x right, y down), length at most 1. */
  get stick() {
    for (const f of this.fingers.values()) {
      if (f.role.kind !== 'stick') continue;
      const x = (f.x - f.ox) / STICK_RADIUS, y = (f.y - f.oy) / STICK_RADIUS;
      const len = Math.hypot(x, y);
      if (len < STICK_DEADZONE) return { x: 0, y: 0 };
      const scale = Math.min(1, (len - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / len;
      return { x: x * scale, y: y * scale };
    }
    return { x: 0, y: 0 };
  }

  /** Where the stick's centre and thumb are (for drawing it), or null when no thumb is on it. */
  get stickView() {
    for (const f of this.fingers.values()) if (f.role.kind === 'stick') return { cx: f.ox, cy: f.oy, x: f.x, y: f.y };
    return null;
  }

  /** Camera drag since the last frame, in pixels. */
  get look() {
    return { x: this.lookX, y: this.lookY };
  }

  endFrame() {
    this.pressedSet.clear();
    this.lookX = this.lookY = 0;
  }
}

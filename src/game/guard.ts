/**
 * The shield's guard: three slots, all up normally. Blocking an attack knocks down as many
 * slots as the attack's guard cost (1 light, 2 heavy, 3 crushing). Each knocked-down slot
 * comes back on its own after GUARD_REGEN seconds, so three knocked down at once all return
 * together, while staggered hits return one by one. **Slots only recover while the shield
 * is lowered** (the timers pause while it's up), so no attack is safe to block forever:
 * the shield is very safe in short bursts, then you back off and lower it to recover.
 *
 * Blocking with too few slots up breaks the guard: the shield still stops that hit, but
 * Wren is knocked back and staggered for GUARD_BREAK seconds: no shield, no jumping, and
 * only a crawl at a tenth of running speed (the sword still swings). There's no stamina
 * otherwise: this is the whole defense system.
 */

export const GUARD_SLOTS = 3;
export const GUARD_REGEN = 2;
export const GUARD_BREAK = 2;
/** How long the gauge stays on screen after the guard is full again. */
export const GAUGE_LINGER = 1;

export type BlockResult = 'blocked' | 'broken';

export class Guard {
  /** Seconds until each slot is back up (0 = up). */
  readonly timers: number[] = Array<number>(GUARD_SLOTS).fill(0);
  /** Seconds left of a guard break (no shield at all while > 0). */
  broken = 0;
  private gaugeT = 0;

  /** How many slots are up. */
  get slots() {
    return this.timers.filter((t) => t <= 0).length;
  }

  get canBlock() {
    return this.broken <= 0;
  }

  /** An attack lands on the raised shield. */
  block(cost: number): BlockResult {
    if (cost > this.slots) {
      for (let i = 0; i < this.timers.length; i++) if (this.timers[i] <= 0) this.timers[i] = GUARD_REGEN;
      this.broken = GUARD_BREAK;
      return 'broken';
    }
    let n = cost;
    for (let i = 0; i < this.timers.length && n > 0; i++) {
      if (this.timers[i] > 0) continue;
      this.timers[i] = GUARD_REGEN;
      n--;
    }
    return 'blocked';
  }

  /** `shieldUp`: the shield is raised this frame (slots don't recover while it is). */
  update(dt: number, shieldUp: boolean) {
    const wasDown = this.slots < GUARD_SLOTS || this.broken > 0;
    if (!shieldUp) for (let i = 0; i < this.timers.length; i++) this.timers[i] = Math.max(0, this.timers[i] - dt);
    this.broken = Math.max(0, this.broken - dt);
    // The gauge shows while anything is down, then lingers a moment once it's full again
    // (counted from the moment it filled, not eaten by the frame that filled it).
    if (wasDown || this.slots < GUARD_SLOTS || this.broken > 0) this.gaugeT = GAUGE_LINGER;
    else this.gaugeT = Math.max(0, this.gaugeT - dt);
  }

  /** Whether the HUD gauge beside Wren should be showing. */
  get gaugeVisible() {
    return this.gaugeT > 0;
  }

  reset() {
    this.timers.fill(0);
    this.broken = 0;
    this.gaugeT = 0;
  }

  /** For the HUD: each slot's fill from 0 (just knocked down) to 1 (up), fullest first. */
  fills() {
    return this.timers.map((t) => 1 - t / GUARD_REGEN).sort((a, b) => b - a);
  }
}

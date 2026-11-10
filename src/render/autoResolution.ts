/**
 * Display → Auto (T58, owner's call: the touch default): Native's sharpness when the device can hold it, a lower render
 * resolution only while frames drop. Like a limiter on a mix bus: it does nothing until the signal clips, then pulls back just
 * enough, and lets go slowly. Pure: the game feeds it each frame's timestamp and resizes when it says the ratio changed.
 *
 * - Frames are judged a second at a time. Under `AUTO_LOW_FPS` it steps down, straight to the level nearest what the drop
 *   suggests (when it's the pixels, cost ∝ ratio², so the ratio scales with √(fps / target)), at least one step.
 * - **Steps down that buy nothing are undone**: it goes on down while frames are no faster (vsync makes frame rates jump in
 *   steps), and if even the bottom is no faster the pixels weren't the bottleneck (busy game code, a phone in low-power mode
 *   capping the screen at 30 Hz): back to where it was, then it holds a while, longer each time, instead of blurring for nothing.
 * - At `AUTO_HIGH_FPS` or better for `UP_WINDOWS` seconds it tries one step up; if that drops frames it steps back and leaves
 *   that level alone for a while (longer each time), so it never sees-saws.
 * - A long gap between frames (an area loading, the page hidden) restarts the measure; after every change it waits for the
 *   new buffers to settle before judging again.
 */

/** Below this (frames per second over a second) the picture is too slow: step down. */
export const AUTO_LOW_FPS = 50;
/** At or above this, there's room: after `UP_WINDOWS` such seconds, try a step up. */
export const AUTO_HIGH_FPS = 57;
/** What a step down aims for. */
const TARGET_FPS = 58;
/** Seconds (windows) of room in a row before a step up. */
export const UP_WINDOWS = 3;
/** One judgement covers this long, ms. */
const WINDOW_MS = 1000;
/** After a change, frames are ignored this long (the resize hitch, new buffers), ms. */
const SETTLE_MS = 500;
/** After an area loads (and at the start), frames aren't judged this long, ms. */
const LOAD_REST_MS = 2500;
/** A gap between two frames this long restarts the window (a load, the page in the background), ms. */
const HITCH_MS = 250;
/** A step down must make frames at least this much faster to count as worth it. */
const PROBE_GAIN = 1.08;
/** How long a failed step up keeps that level off-limits, then doubling up to the cap, ms. */
const BAR_MS = 15000;
const MAX_BAR_MS = 240000;
/** How long a step down that bought nothing stops further steps down, then doubling up to the cap, ms. */
const HOLD_MS = 20000;
const MAX_HOLD_MS = 160000;
/** The ratio's steps. */
const STEP = 0.25;

/** The ratios Auto may use, lowest first: `min` up to `max` in quarter steps (just `max` when it's at or under `min`). */
export function autoLevels(max: number, min = 1): number[] {
  if (max <= min) return [max];
  const levels: number[] = [];
  for (let r = min; r < max - 1e-6; r += STEP) levels.push(r);
  levels.push(max);
  return levels;
}

export class AutoResolution {
  private levels: number[] = [1];
  private index = 0;
  private max = 0;
  private last = -1;
  private windowStart = -1;
  private frames = 0;
  private settleUntil = 0;
  private good = 0;
  /** After a step down: where it came from and how fast that was, to undo it if it bought nothing. */
  private downProbe: { from: number; fps: number } | null = null;
  /** After a step up: where it came from, to go back if it drops frames. */
  private upProbe: number | null = null;
  private barredUntil: number[] = [];
  private barMs: number[] = [];
  private holdUntil = 0;
  private holdMs = HOLD_MS;
  /** How many times the ratio has changed (the dev report shows it). */
  changes = 0;

  constructor(max: number, private readonly min = 1) {
    this.setMax(max);
  }

  /** The renderer's pixel ratio now. */
  get ratio() {
    return this.levels[this.index];
  }

  /** The screen's own cap (Native's ratio): on a change (another screen), Auto starts again from the top. */
  setMax(max: number) {
    if (max === this.max) return;
    this.max = max;
    this.levels = autoLevels(max, this.min);
    this.index = this.levels.length - 1;
    this.barredUntil = this.levels.map(() => 0);
    this.barMs = this.levels.map(() => BAR_MS);
    this.downProbe = null;
    this.upProbe = null;
    this.good = 0;
    this.windowStart = -1;
  }

  /** Don't judge the next `ms` (an area just loaded: its first frames build shaders and bake light, and say nothing about the pixels). */
  rest(ms = LOAD_REST_MS) {
    this.restFor = Math.max(this.restFor, ms);
  }

  private restFor = LOAD_REST_MS;

  /** One frame, at the animation frame's timestamp (ms). True when the ratio changed: resize. */
  frame(now: number): boolean {
    if (this.last >= 0 && now - this.last > HITCH_MS) this.windowStart = -1;
    this.last = now;
    if (this.restFor > 0) {
      this.settleUntil = Math.max(this.settleUntil, now + this.restFor);
      this.restFor = 0;
      this.windowStart = -1;
      this.downProbe = null;
      this.upProbe = null;
    }
    if (now < this.settleUntil) return false;
    if (this.windowStart < 0) {
      this.windowStart = now;
      this.frames = 0;
      return false;
    }
    this.frames++;
    const span = now - this.windowStart;
    if (span < WINDOW_MS) return false;
    const fps = (this.frames * 1000) / span;
    this.windowStart = now;
    this.frames = 0;
    return this.judge(fps, now);
  }

  private judge(fps: number, now: number): boolean {
    const slow = fps < AUTO_LOW_FPS;
    if (this.downProbe) {
      const p = this.downProbe;
      if (slow && fps < p.fps * PROBE_GAIN) {
        // No faster yet. A screen's vsync makes frame rates jump in steps (a frame that misses 16.7 ms waits for 33), so
        // one step may show no gain: go on down. At the bottom with still no gain, it was never the pixels: undo it all.
        if (this.index > 0) return this.set(this.index - 1, now);
        this.downProbe = null;
        this.holdUntil = now + this.holdMs;
        this.holdMs = Math.min(this.holdMs * 2, MAX_HOLD_MS);
        return this.set(p.from, now);
      }
      this.downProbe = null;
    }
    if (this.upProbe !== null) {
      const from = this.upProbe;
      this.upProbe = null;
      if (slow) {
        this.barredUntil[this.index] = now + this.barMs[this.index];
        this.barMs[this.index] = Math.min(this.barMs[this.index] * 2, MAX_BAR_MS);
        return this.set(from, now);
      }
    }
    if (slow) {
      this.good = 0;
      if (this.index === 0 || now < this.holdUntil) return false;
      const want = this.ratio * Math.sqrt(fps / TARGET_FPS);
      let i = this.index - 1;
      while (i > 0 && Math.abs(this.levels[i - 1] - want) < Math.abs(this.levels[i] - want)) i--;
      this.downProbe = { from: this.index, fps };
      return this.set(i, now);
    }
    if (fps < AUTO_HIGH_FPS) {
      this.good = 0;
      return false;
    }
    this.good++;
    const next = this.index + 1;
    if (this.good < UP_WINDOWS || next >= this.levels.length || now < this.barredUntil[next]) return false;
    this.good = 0;
    this.upProbe = this.index;
    return this.set(next, now);
  }

  private set(i: number, now: number): boolean {
    this.index = i;
    this.settleUntil = now + SETTLE_MS;
    this.windowStart = -1;
    this.changes++;
    return true;
  }
}

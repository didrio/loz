/**
 * Game-time scheduling for scripts and cutscenes. Scripts are plain `async` functions that
 * `await director.wait(1.5)` instead of using `setTimeout`, so they follow the game clock
 * (they pause when the game pauses and never fire after the state they expected is gone).
 */
export class Director {
  private waits: { left: number; resolve: () => void }[] = [];
  private conds: { test: () => boolean; resolve: () => void }[] = [];
  private tweens: { t: number; dur: number; fn: (p: number) => void; resolve: () => void }[] = [];

  /** Resolves after `seconds` of game time (at the earliest on the next update). */
  wait(seconds: number) {
    return new Promise<void>((resolve) => this.waits.push({ left: seconds, resolve }));
  }

  /** Resolves on the first update where `test()` is true. */
  until(test: () => boolean) {
    return new Promise<void>((resolve) => this.conds.push({ test, resolve }));
  }

  /** Calls `fn(progress)` every update with progress going 0 → 1 over `seconds`. */
  tween(seconds: number, fn: (p: number) => void) {
    return new Promise<void>((resolve) => this.tweens.push({ t: 0, dur: Math.max(seconds, 1e-6), fn, resolve }));
  }

  get busy() {
    return this.waits.length + this.conds.length + this.tweens.length > 0;
  }

  update(dt: number) {
    for (const w of this.waits.splice(0)) {
      w.left -= dt;
      if (w.left <= 0) w.resolve();
      else this.waits.push(w);
    }
    for (const c of this.conds.splice(0)) {
      if (c.test()) c.resolve();
      else this.conds.push(c);
    }
    for (const tw of this.tweens.splice(0)) {
      tw.t = Math.min(tw.dur, tw.t + dt);
      tw.fn(tw.t / tw.dur);
      if (tw.t >= tw.dur) tw.resolve();
      else this.tweens.push(tw);
    }
  }
}

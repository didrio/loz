/**
 * Vibration (T58, owner's call: light haptics where the browser can). Android browsers have `navigator.vibrate`; iPhone browsers
 * don't (the calls are skipped). Like a sound effect, but felt: short ticks for small things, one longer pattern for a guard break.
 */

/** What happened, felt. Durations in ms; an array alternates buzz and pause. */
export const HAPTIC_PATTERNS = {
  /** Wren takes a hit. */
  hurt: 40,
  /** A light attack stopped on the shield. */
  block: 12,
  /** A heavy one. */
  heavyBlock: 24,
  /** The guard breaks. */
  guardBreak: [45, 35, 70],
} as const;

export type HapticKind = keyof typeof HAPTIC_PATTERNS;

type Vibrate = (pattern: number | readonly number[]) => boolean;

export class Haptics {
  /** Settings → Vibration. */
  enabled = true;

  /** `vibrate`: the browser's, or a stand-in for tests. */
  constructor(private readonly vibrate: Vibrate | null = defaultVibrate()) {}

  /** Whether this device can vibrate at all (the Settings row only shows where it can). */
  get supported() {
    return !!this.vibrate;
  }

  pulse(kind: HapticKind) {
    if (!this.enabled || !this.vibrate) return;
    try {
      this.vibrate(HAPTIC_PATTERNS[kind]);
    } catch { /* a browser that refuses (no user gesture yet): nothing to feel */ }
  }
}

/** The browser's vibrate, only on a touch device that has one (a desktop Chrome has the function but nothing to shake). */
function defaultVibrate(): Vibrate | null {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return null;
  if (typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches) return null;
  return (p) => navigator.vibrate(p as number | number[]);
}

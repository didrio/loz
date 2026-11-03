/**
 * A Murmurbud's rule (pure: no Three.js). The keepers sealed notes in sleeping bulbs: strikes
 * wake one and it swells, but strike too fast and it clams up and shrinks back.
 *
 * Two numbers: the `gauge` (how stirred it is: each strike fills it, it drains on its own) and
 * `growth` (how far it has swelled). It grows while the gauge sits in the sweet band; a strike
 * that would push the gauge past full overloads it: growth back to nothing, and it sulks for a
 * moment, ignoring strikes. The rhythm that works: a few quick strikes, a beat's rest, strike again.
 *
 * Tuned against Wren's combo (~3 strikes a second when mashing): mashing overloads in ~2 s,
 * one strike every ~0.8 s holds the gauge in the band, and that opens a bud in ~5 s.
 */
export const BUD = {
  /** Gauge added per strike. */
  strike: 0.25,
  /** Gauge drained per second. */
  drain: 0.3,
  /** It grows while the gauge is at or above this. */
  band: 0.45,
  /** Growth per second in the band. */
  grow: 0.3,
  /** Growth lost per second below the band (it dozes off again, slowly). */
  wilt: 0.08,
  /** Seconds it ignores strikes after an overload. */
  sulk: 1.2,
};

export type StrikeResult = 'grew' | 'overload' | 'ignored';

export class Murmurbud {
  gauge = 0;
  growth = 0;
  /** Seconds left sulking after an overload (strikes do nothing). */
  sulk = 0;
  opened = false;

  /** A sword strike. */
  strike(): StrikeResult {
    if (this.opened || this.sulk > 0) return 'ignored';
    this.gauge += BUD.strike;
    if (this.gauge > 1 + 1e-6) {
      this.gauge = 1;
      this.growth = 0;
      this.sulk = BUD.sulk;
      return 'overload';
    }
    return 'grew';
  }

  /** One frame. Returns true on the frame it opens. */
  update(dt: number): boolean {
    if (this.opened) return false;
    if (this.sulk > 0) {
      this.sulk = Math.max(0, this.sulk - dt);
      // The gauge empties while it sulks, so it's at zero when it's ready again.
      this.gauge = (this.sulk / BUD.sulk) * this.gauge;
      return false;
    }
    if (this.gauge >= BUD.band) this.growth = Math.min(1, this.growth + BUD.grow * dt);
    else this.growth = Math.max(0, this.growth - BUD.wilt * dt);
    this.gauge = Math.max(0, this.gauge - BUD.drain * dt);
    if (this.growth >= 1) {
      this.opened = true;
      this.gauge = 0;
      return true;
    }
    return false;
  }

  /** Stirred: the gauge should show (near Wren). */
  get awake() {
    return !this.opened && (this.gauge > 0 || this.sulk > 0 || this.growth > 0);
  }
}

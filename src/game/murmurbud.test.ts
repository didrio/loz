import { describe, expect, it } from 'vitest';
import { BUD, Murmurbud } from './murmurbud';

const DT = 1 / 60;

/** Runs a bud for up to `seconds`, striking whenever `shouldStrike` says; returns when it opened (or null). */
function play(shouldStrike: (bud: Murmurbud, t: number, sinceLast: number) => boolean, seconds = 15) {
  const bud = new Murmurbud();
  let last = -Infinity;
  let overloads = 0;
  for (let t = 0; t < seconds; t += DT) {
    // Wren can't swing faster than ~0.3 s a strike.
    if (t - last >= 0.3 && shouldStrike(bud, t, t - last)) {
      last = t;
      if (bud.strike() === 'overload') overloads++;
    }
    if (bud.update(DT)) return { openedAt: t, overloads };
  }
  return { openedAt: null, overloads };
}

describe('Murmurbud', () => {
  it('overloads when mashed, within ~2 s, and never opens that way', () => {
    const bud = new Murmurbud();
    let t = 0;
    let at = -1;
    for (; t < 4 && at < 0; t += DT) {
      if (Math.round(t / DT) % 18 === 0 && bud.strike() === 'overload') at = t;
      bud.update(DT);
    }
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(2.5);
    expect(bud.growth).toBe(0);
    expect(play(() => true).openedAt).toBe(null);
  });

  it('opens in ~5 s for a strike-and-rest rhythm', () => {
    // Strike while the gauge is below three quarters; rest otherwise.
    const r = play((bud) => bud.gauge < 0.75);
    expect(r.overloads).toBe(0);
    expect(r.openedAt).not.toBe(null);
    expect(r.openedAt!).toBeGreaterThan(3);
    expect(r.openedAt!).toBeLessThan(7);
  });

  it('never opens when struck too slowly', () => {
    expect(play((_b, _t, since) => since >= 2.5).openedAt).toBe(null);
  });

  it('ignores strikes while it sulks, then can be woken again', () => {
    const bud = new Murmurbud();
    for (let i = 0; i < 5; i++) bud.strike();
    expect(bud.sulk).toBeGreaterThan(0);
    expect(bud.strike()).toBe('ignored');
    for (let t = 0; t < BUD.sulk + 0.1; t += DT) bud.update(DT);
    expect(bud.gauge).toBe(0);
    expect(bud.strike()).toBe('grew');
  });

  it('stays open and ignores strikes once open', () => {
    const bud = new Murmurbud();
    bud.opened = true;
    expect(bud.strike()).toBe('ignored');
    expect(bud.awake).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { SURF_MIN_AIR, SURF_MIN_SPEED, SURF_SPEED, surfNext, surfSpeedNext, type SurfInput } from './surf';

const base: SurfInput = {
  surfing: false, allowed: true, shield: true, landedAfter: 0, free: true, locked: false, attack: false, wading: false,
};

describe('surfNext', () => {
  it('starts only on a landing with the shield held', () => {
    expect(surfNext(base)).toBe(false);
    expect(surfNext({ ...base, landedAfter: 0.5 })).toBe(true);
    expect(surfNext({ ...base, landedAfter: 0.5, shield: false })).toBe(false);
  });

  it("doesn't start from a grounded flicker", () => {
    expect(surfNext({ ...base, landedAfter: SURF_MIN_AIR * 0.5 })).toBe(false);
  });

  it('keeps riding while the shield is held, in the air too (a hop)', () => {
    expect(surfNext({ ...base, surfing: true })).toBe(true);
  });

  it('needs the idea and the outdoors', () => {
    expect(surfNext({ ...base, landedAfter: 0.5, allowed: false })).toBe(false);
    expect(surfNext({ ...base, surfing: true, allowed: false })).toBe(false);
  });

  it('ends on letting go, lock-on, a swing, water, or losing the move state', () => {
    const on = { ...base, surfing: true };
    expect(surfNext({ ...on, shield: false })).toBe(false);
    expect(surfNext({ ...on, locked: true })).toBe(false);
    expect(surfNext({ ...on, attack: true })).toBe(false);
    expect(surfNext({ ...on, wading: true })).toBe(false);
    expect(surfNext({ ...on, free: false })).toBe(false);
  });
});

describe('surfSpeedNext', () => {
  const run = (steering: boolean, secs: number) => {
    let v = SURF_SPEED;
    for (let i = 0; i < secs * 60; i++) v = surfSpeedNext(v, 1 / 60, steering);
    return v;
  };

  it('only ever falls, even with the stick held', () => {
    let v = SURF_SPEED;
    for (let i = 0; i < 300; i++) {
      const n = surfSpeedNext(v, 1 / 60, true);
      expect(n).toBeLessThan(v);
      v = n;
    }
  });

  it('a single ride goes a decent but bounded distance', () => {
    let v = SURF_SPEED, d = 0;
    while (v > SURF_MIN_SPEED) { d += v / 60; v = surfSpeedNext(v, 1 / 60, true); }
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(25);
  });

  it('braking slows faster than steering', () => {
    expect(run(false, 1)).toBeLessThan(run(true, 1));
  });
});

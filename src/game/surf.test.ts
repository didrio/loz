import { describe, expect, it } from 'vitest';
import { SURF_MIN_AIR, surfNext, type SurfInput } from './surf';

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

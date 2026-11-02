import { describe, expect, it } from 'vitest';
import { ACTIONS, deadzone, glyph } from './input';

describe('input', () => {
  it('ignores small stick drift and still reaches full tilt', () => {
    expect(deadzone(0.1, 0.05)).toEqual({ x: 0, y: 0 });
    const full = deadzone(1, 0);
    expect(full.x).toBeCloseTo(1);
    const half = deadzone(0, 0.59);
    expect(half.y).toBeCloseTo(0.5, 1);
  });

  it('has a button label for every action on both devices', () => {
    for (const a of ACTIONS) {
      expect(glyph(a, 'keyboard')).toBeTruthy();
      expect(glyph(a, 'gamepad')).toBeTruthy();
    }
  });
});

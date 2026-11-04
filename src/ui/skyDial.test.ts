import { describe, expect, it } from 'vitest';
import { HORIZON, aboveGround, dialView } from './skyDial';

describe('dialView', () => {
  it('puts the sun near the top at noon and the moon near the top at midnight', () => {
    const noon = dialView(12), midnight = dialView(0);
    expect(noon.sun.x).toBeCloseTo(0.5);
    expect(noon.sun.y).toBeLessThan(0.25);
    expect(aboveGround(noon.moon.y)).toBe(false);
    expect(midnight.moon.x).toBeCloseTo(0.5);
    expect(midnight.moon.y).toBeLessThan(0.25);
    expect(aboveGround(midnight.sun.y)).toBe(false);
  });

  it('has the sun fully below the ground by 18:00 and up again after 6:00, rising left and setting right', () => {
    expect(aboveGround(dialView(18).sun.y)).toBe(false);
    expect(aboveGround(dialView(6).sun.y)).toBe(false);
    expect(aboveGround(dialView(7).sun.y)).toBe(true);
    expect(aboveGround(dialView(17).sun.y)).toBe(true);
    expect(dialView(8).sun.x).toBeLessThan(0.5);
    expect(dialView(16).sun.x).toBeGreaterThan(0.5);
  });

  it('never shows the sun and moon at once, and the sun is up only by day', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const v = dialView(h);
      const night = h < 6 || h >= 18;
      expect(aboveGround(v.sun.y) && aboveGround(v.moon.y)).toBe(false);
      if (night) expect(aboveGround(v.sun.y)).toBe(false);
      else expect(aboveGround(v.moon.y)).toBe(false);
    }
  });

  it('darkens sky and ground at night but keeps them apart', () => {
    expect(dialView(12).daylight).toBe(1);
    expect(dialView(0).daylight).toBe(0);
    const n = dialView(0);
    expect(n.skyLow).not.toBe(n.ground);
    expect(HORIZON).toBeGreaterThan(0.6);
  });
});

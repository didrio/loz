import { describe, expect, it } from 'vitest';
import { SWATCHES } from '../../render/palette';
import { DUNGEON_FOG, THEMES } from './decor';

describe('DUNGEON_FOG', () => {
  it('is a real fog: starts close, ends within the old default (60 m)', () => {
    expect(DUNGEON_FOG.near).toBeGreaterThan(0);
    expect(DUNGEON_FOG.near).toBeLessThan(DUNGEON_FOG.far);
    expect(DUNGEON_FOG.far).toBeLessThanOrEqual(60);
  });
});

describe("the shrine's wing palettes", () => {
  it('take every colour from the master palette', () => {
    const on = new Set(SWATCHES.map((s) => s.hex));
    for (const [wing, p] of Object.entries(THEMES)) {
      for (const [k, v] of Object.entries(p)) if (k !== 'lightLevel' && v !== null) expect(on.has(v), `${wing}.${k}`).toBe(true);
    }
    expect(on.has(DUNGEON_FOG.color)).toBe(true);
  });
});

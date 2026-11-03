import { describe, expect, it } from 'vitest';
import { GATE, GROVE, HOLLOW, LAKE, SHRINE, SPAWN, VILLAGE } from './layout';
import { signArrow, SIGNS } from './landmarks';

describe('signArrow', () => {
  it('points the way from the reader\'s side of a sign that faces the spawn', () => {
    // A sign due north of the spawn: the reader faces north, so east is to the right.
    const north = { x: SPAWN.x, z: SPAWN.z - 10 };
    expect(signArrow(north, { x: north.x, z: north.z - 50 })).toBe('↑');
    expect(signArrow(north, { x: north.x + 50, z: north.z })).toBe('→');
    expect(signArrow(north, { x: north.x - 50, z: north.z })).toBe('←');
    expect(signArrow(north, { x: north.x, z: north.z + 50 })).toBe('↓');
    expect(signArrow(north, { x: north.x - 50, z: north.z - 50 })).toBe('↖');
  });

  it('gives every place on the crossroads sign its own arrow', () => {
    const sign = SIGNS.find((s) => s.id === 'sign.crossroads')!;
    const arrows = [VILLAGE, GROVE, SHRINE, HOLLOW, LAKE, GATE].map((p) => signArrow(sign, p));
    expect(new Set(arrows).size).toBe(arrows.length);
  });
});

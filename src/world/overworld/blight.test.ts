import { describe, expect, it } from 'vitest';
import { THORN_MIN_LEVEL, thornTouch } from './blight';

describe('the thorns', () => {
  const clump = { x: 10, y: 1, z: 20, r: 3, height: 6 };

  it('catch Wren inside a clump and leave her be just outside it', () => {
    expect(thornTouch([clump], 10, 1, 22, 1)).toBe(clump);
    expect(thornTouch([clump], 10, 1, 23.2, 1)).toBe(clump); // her body brushes the edge
    expect(thornTouch([clump], 10, 1, 24, 1)).toBeNull();
  });

  it('are harmless as they shrink away, and to Wren high above them', () => {
    expect(thornTouch([clump], 10, 1, 21, THORN_MIN_LEVEL - 0.01)).toBeNull();
    expect(thornTouch([clump], 10, 1, 21, 0)).toBeNull();
    expect(thornTouch([clump], 10, 8, 21, 1)).toBeNull();
    expect(thornTouch([clump], 10, 5, 21, 1)).toBe(clump);
  });
});

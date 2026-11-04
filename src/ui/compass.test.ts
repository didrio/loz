import { describe, expect, it } from 'vitest';
import { bearing, directionName } from './compass';

describe('bearing', () => {
  it('reads -z as north and +x as east', () => {
    expect(bearing(0, -1)).toBeCloseTo(0);
    expect(bearing(1, 0)).toBeCloseTo(90);
    expect(bearing(0, 1)).toBeCloseTo(180);
    expect(bearing(-1, 0)).toBeCloseTo(270);
    expect(directionName(bearing(-1, 1))).toBe('SW');
    expect(directionName(bearing(1, -1))).toBe('NE');
  });

  it('names the nearest eighth, wrapping at north', () => {
    expect(directionName(350)).toBe('N');
    expect(directionName(-10)).toBe('N');
    expect(directionName(200)).toBe('S');
  });
});

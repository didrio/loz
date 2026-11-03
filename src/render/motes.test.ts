import { describe, expect, it } from 'vitest';
import { wrapAround } from './motes';

describe('wrapAround', () => {
  it('keeps a value within half a span of the center, in either direction', () => {
    expect(wrapAround(30, 0, 40)).toBeCloseTo(-10);
    expect(wrapAround(-30, 0, 40)).toBeCloseTo(10);
    expect(wrapAround(105, 100, 40)).toBeCloseTo(105);
    expect(wrapAround(150, 100, 40)).toBeCloseTo(110);
  });
});

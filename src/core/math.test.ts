import { describe, expect, it } from 'vitest';
import { angleDiff, clamp, fbm, lerpAngle, mulberry32, smoothstep } from './math';

describe('math', () => {
  it('clamps and smoothsteps, including reversed edges', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5);
    expect(smoothstep(10, 0, 0)).toBe(1);
    expect(smoothstep(10, 0, 10)).toBe(0);
  });

  it('takes the short way around for angles', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI);
  });

  it('has deterministic randomness and bounded noise', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
    for (let i = 0; i < 200; i++) {
      const n = fbm(i * 0.37, i * -0.21);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

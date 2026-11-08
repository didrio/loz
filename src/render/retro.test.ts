import { describe, expect, it } from 'vitest';
import { BAYER4, bayerOffset, COLOR_LEVELS, crushChannel, DISPLAY_NAMES, internalSize, N64_ROWS, pixelRatioFor } from './retro';

describe('the dither matrix', () => {
  it('holds each of 0..15 once, so every threshold is used evenly', () => {
    expect([...BAYER4].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('offsets stay inside (-0.5, 0.5) and repeat every 4 pixels, also for negative coordinates', () => {
    for (let y = -5; y < 9; y++) {
      for (let x = -5; x < 9; x++) {
        const o = bayerOffset(x, y);
        expect(o).toBeGreaterThan(-0.5);
        expect(o).toBeLessThan(0.5);
        expect(bayerOffset(x + 4, y + 8)).toBe(o);
      }
    }
  });
});

describe('the colour crush', () => {
  it('leaves black and white alone and only ever lands on a level', () => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(crushChannel(0, x, y)).toBe(0);
        expect(crushChannel(1, x, y)).toBe(1);
        for (const v of [0.1, 0.37, 0.5, 0.93]) {
          const steps = (crushChannel(v, x, y) * (COLOR_LEVELS - 1));
          expect(steps).toBeCloseTo(Math.round(steps), 9);
        }
      }
    }
  });

  it('dithers: a flat colour between two levels averages out to itself over a tile', () => {
    const v = 0.5 + 0.25 / (COLOR_LEVELS - 1); // a quarter of the way between two levels
    let sum = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) sum += crushChannel(v, x, y);
    expect(sum / 16).toBeCloseTo(v, 2);
  });
});

describe('internalSize', () => {
  it('is null for Native and Performance: they draw straight to the canvas', () => {
    expect(internalSize(0, 1920, 1080)).toBeNull();
    expect(internalSize(1, 1920, 1080)).toBeNull();
  });

  it('N64 is 240 rows tall at the window\'s aspect, with no bars', () => {
    expect(N64_ROWS).toBe(240);
    expect(internalSize(2, 1920, 1080)).toEqual({ w: 427, h: 240 });
    expect(internalSize(2, 2560, 1080)).toEqual({ w: 569, h: 240 });
    expect(internalSize(2, 800, 800)).toEqual({ w: 240, h: 240 });
  });

  it('never draws more rows than the window has', () => {
    expect(internalSize(2, 600, 200)).toEqual({ w: 600, h: 200 });
  });

  it('handles an empty window without dividing by zero', () => {
    expect(internalSize(2, 0, 0)).toBeNull();
  });
});

describe('pixelRatioFor (Display)', () => {
  it('Native is the screen\'s own density: 2 on a retina laptop, 1 on a plain monitor, capped at 3', () => {
    expect(pixelRatioFor(0, 2)).toBe(2);
    expect(pixelRatioFor(0, 1)).toBe(1);
    expect(pixelRatioFor(0, 4)).toBe(3);
    expect(pixelRatioFor(0, 0)).toBe(1);
  });
  it('on a touch screen Native stops at 2: a 3× phone costs 2.25× a 2× one', () => {
    expect(pixelRatioFor(0, 3, true)).toBe(2);
    expect(pixelRatioFor(0, 2, true)).toBe(2);
    expect(pixelRatioFor(0, 1.5, true)).toBe(1.5);
  });
  it('Performance caps the ratio at 1 and keeps a low screen as it is', () => {
    expect(pixelRatioFor(1, 3)).toBe(1);
    expect(pixelRatioFor(1, 2)).toBe(1);
    expect(pixelRatioFor(1, 0.75)).toBe(0.75);
  });
  it('N64 keeps the canvas at the screen\'s density (cap 2) for the soft upscale', () => {
    expect(pixelRatioFor(2, 3)).toBe(2);
    expect(pixelRatioFor(2, 1)).toBe(1);
  });
  it('has a name per mode', () => {
    expect(DISPLAY_NAMES).toEqual(['Native', 'Performance', 'N64']);
  });
});

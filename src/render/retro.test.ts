import { describe, expect, it } from 'vitest';
import { BAYER4, bayerOffset, COLOR_LEVELS, crushChannel, DEFAULT_LOOK, internalSize, LOOK_HEIGHTS, LOOK_NAMES, pixelRatioFor, RESOLUTION_NAMES } from './retro';

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
  it('is null for Off', () => {
    expect(internalSize(0, 1920, 1080)).toBeNull();
  });

  it('keeps the window aspect at the look\'s height', () => {
    expect(internalSize(1, 3840, 2160)).toEqual({ w: 1920, h: 1080 });
    expect(internalSize(2, 1920, 1080)).toEqual({ w: 1280, h: 720 });
    expect(internalSize(3, 1920, 1080)).toEqual({ w: 960, h: 540 });
    expect(internalSize(4, 1920, 1080)).toEqual({ w: 640, h: 360 });
    expect(internalSize(3, 844, 390)).toEqual({ w: 844, h: 390 }); // a phone's own 390 rows are fewer than 540
  });

  it('never draws more rows than the window has', () => {
    expect(internalSize(2, 800, 400)).toEqual({ w: 800, h: 400 });
  });

  it('handles an empty window without dividing by zero', () => {
    expect(internalSize(2, 0, 0)).toBeNull();
  });
});

describe('the look settings', () => {
  it('have a name for every height, and the look is off by default', () => {
    expect(LOOK_NAMES).toHaveLength(LOOK_HEIGHTS.length);
    expect(DEFAULT_LOOK).toBe(0);
  });
});

describe('pixelRatioFor (Resolution)', () => {
  it('Native is the screen\'s own density: 2 on a retina laptop, 1 on a plain monitor', () => {
    expect(pixelRatioFor(0, 2)).toBe(2);
    expect(pixelRatioFor(0, 1)).toBe(1);
  });
  it('Balanced and Performance draw 75% and 50% of it', () => {
    expect(pixelRatioFor(1, 2)).toBe(1.5);
    expect(pixelRatioFor(2, 2)).toBe(1);
    expect(pixelRatioFor(2, 1)).toBe(0.5);
  });
  it('caps very dense screens and survives a missing ratio', () => {
    expect(pixelRatioFor(0, 4)).toBe(3);
    expect(pixelRatioFor(0, 0)).toBe(1);
  });
  it('has a name per setting', () => {
    expect(RESOLUTION_NAMES).toHaveLength(3);
  });
});

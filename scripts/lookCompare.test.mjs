import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { budgetFor, compare, HEADROOM, overBudget, shrink } from './lookCompare.mjs';

const solid = (w, h, [r, g, b]) => {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) png.data.set([r, g, b, 255], i * 4);
  return png;
};
const paint = (png, x0, y0, size, [r, g, b]) => {
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) png.data.set([r, g, b, 255], (y * png.width + x) * 4);
};

describe('shrink', () => {
  it('averages each block and drops odd edges', () => {
    const png = solid(9, 5, [0, 0, 0]);
    paint(png, 0, 0, 2, [200, 100, 40]); // one whole 2x2 block
    const out = shrink(png, 2);
    expect([out.width, out.height]).toEqual([4, 2]);
    expect(Array.from(out.data.slice(0, 4))).toEqual([200, 100, 40, 255]);
    expect(Array.from(out.data.slice(4, 8))).toEqual([0, 0, 0, 255]);
  });
});

describe('compare', () => {
  it('calls identical images unchanged', () => {
    const a = solid(80, 40, [30, 60, 90]);
    expect(compare(a, solid(80, 40, [30, 60, 90])).changed).toBe(false);
  });

  it('calls a recoloured patch changed, and draws it in the diff', () => {
    const a = solid(80, 40, [30, 60, 90]);
    const b = solid(80, 40, [30, 60, 90]);
    paint(b, 10, 10, 8, [220, 40, 40]);
    const r = compare(a, b);
    expect(r.changed).toBe(true);
    expect(r.pixels).toBe(64);
    expect(r.diff).not.toBeNull();
  });

  it('ignores a one-step colour wobble', () => {
    const a = solid(80, 40, [30, 60, 90]);
    expect(compare(a, solid(80, 40, [31, 60, 90])).changed).toBe(false);
  });

  it('calls a different size changed', () => {
    expect(compare(solid(80, 40, [0, 0, 0]), solid(40, 40, [0, 0, 0])).changed).toBe(true);
  });
});

describe('budgets', () => {
  const budgets = { village: { calls: 100, triangles: 5000 } };

  it('passes within the budget and fails over it, naming what', () => {
    expect(overBudget(budgets, 'village', { calls: 100, triangles: 5000 })).toEqual([]);
    expect(overBudget(budgets, 'village', { calls: 101, triangles: 6000 })).toEqual([
      { scene: 'village', what: 'draw calls', value: 101, limit: 100 },
      { scene: 'village', what: 'triangles', value: 6000, limit: 5000 },
    ]);
  });

  it('has no limit for a scene without a budget yet', () => {
    expect(overBudget(budgets, 'camp', { calls: 1e6, triangles: 1e9 })).toEqual([]);
  });

  it('gives a measured peak headroom, rounded up', () => {
    const b = budgetFor({ calls: 584, triangles: 212522 });
    expect(b.calls).toBeGreaterThanOrEqual(584 * HEADROOM);
    expect(b.triangles).toBeGreaterThanOrEqual(212522 * HEADROOM);
    expect(b.calls).toBeLessThan(584 * HEADROOM + 10);
  });
});

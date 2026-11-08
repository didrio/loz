import { describe, expect, it } from 'vitest';
import { layoutShelves } from './contactLayout';

const item = (id: string, kind: string, w: number, h: number) => ({ id, kind, w, h });

describe('contact sheet layout', () => {
  it('puts big kinds first, wraps shelves at the max width and never overlaps', () => {
    const items = [item('chest', 'prop', 1, 1), item('boss', 'boss', 8, 10), item('wren', 'player', 1, 2), item('bush', 'prop', 2, 1.5)];
    const { items: out, width, height } = layoutShelves(items, 9, 1);
    expect(out[0].id).toBe('boss');
    expect(out.map((o) => o.id)).toEqual(['boss', 'wren', 'chest', 'bush']);
    // The boss (8) + gap + wren (1) would pass 9, so wren starts the second shelf.
    expect(out[1].y).toBeLessThan(out[0].y);
    for (const a of out) {
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y + a.h).toBeLessThanOrEqual(height + 1e-9);
      expect(a.x + a.w).toBeLessThanOrEqual(width + 1e-9);
      for (const b of out) {
        if (a === b || a.y !== b.y) continue;
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
      }
    }
  });
  it('handles an empty list', () => {
    expect(layoutShelves([], 10, 1).items).toEqual([]);
  });
});

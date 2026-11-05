import { describe, expect, it } from 'vitest';
import { lungeClear } from './lunge';

const flat = () => 0;
const pos = { x: 0, y: 0, z: 0 };
const area = (extra: Record<string, unknown> = {}) => ({ interactables: [], ...extra }) as Parameters<typeof lungeClear>[0];

describe('lungeClear', () => {
  it('steps forward on open ground', () => {
    expect(lungeClear(area(), flat, pos, 0, 1)).toBe(true);
  });
  it('does not step onto thorns or scars', () => {
    const thornAt = (x: number, _y: number, z: number) => (z > 0.8 ? { x, z } : null);
    expect(lungeClear(area({ thornAt }), flat, pos, 0, 1)).toBe(false);
    expect(lungeClear(area({ thornAt }), flat, pos, 0, -1)).toBe(true);
  });
  it('does not step off a ledge or toward a void', () => {
    expect(lungeClear(area(), (_x, z) => (z > 0.3 ? -3 : 0), pos, 0, 1)).toBe(false);
    expect(lungeClear(area(), () => null, pos, 0, 1)).toBe(false);
  });
  it('does not step while a sign, person or hint flower is in reach', () => {
    const it = { id: 'sign.x', x: 0.5, z: 1, r: 1.5, label: 'Read', enabled: () => true };
    expect(lungeClear(area({ interactables: [it] }), flat, pos, 0, 1)).toBe(false);
    expect(lungeClear(area({ interactables: [{ ...it, enabled: () => false }] }), flat, pos, 0, 1)).toBe(true);
    const bud = new Map([['b', { x: 0, z: 1.2, taken: false }]]);
    expect(lungeClear(area({ buds: bud as never }), flat, pos, 0, 1)).toBe(false);
  });
});

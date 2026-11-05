import { describe, expect, it } from 'vitest';
import { fogOf, THEMES } from './decor';
import type { RoomDef } from './format';

const room = (extra: Partial<RoomDef>) => ({ id: 'r', floor: 0, x: 0, z: 0, w: 8, d: 8, ...extra }) as RoomDef;

describe('fogOf', () => {
  it('uses the wing\'s fog, and each wing differs', () => {
    expect(fogOf(room({}))).toEqual(THEMES.sandstone.fog);
    expect(fogOf(room({ theme: 'moss' })).far).toBeLessThan(fogOf(room({ theme: 'marble' })).far);
  });

  it('lets a room override part of it', () => {
    const f = fogOf(room({ theme: 'marble', fog: { far: 30 } }));
    expect(f.far).toBe(30);
    expect(f.near).toBe(THEMES.marble.fog.near);
  });
});

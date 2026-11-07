import { describe, expect, it } from 'vitest';
import { mat, surf, uniqueMat } from './materials';
import { pal, snap } from './palette';

describe('materials', () => {
  it('snap every colour they are given to the palette', () => {
    expect(mat(0x123456).color.getHex()).toBe(snap(0x123456));
    expect(mat(0x123456, 0xff5a10).emissive.getHex()).toBe(snap(0xff5a10));
    expect(mat(0x123456).emissive.getHex()).toBe(0);
    expect(surf('stone', 0x8a7a62).color.getHex()).toBe(snap(0x8a7a62));
    const u = uniqueMat(0x7a2f4a, { emissive: 0x3f9be0 });
    expect(u.color.getHex()).toBe(snap(0x7a2f4a));
    expect(u.emissive.getHex()).toBe(snap(0x3f9be0));
  });

  it('share one material between colours that snap to the same swatch', () => {
    expect(mat(pal('grass'))).toBe(mat(pal('grass') + 1));
  });
});

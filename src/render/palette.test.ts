import { describe, expect, it } from 'vitest';
import { AREA_PALETTES, buildSwatches, HUES, nearest, pal, snap, SWATCHES } from './palette';
import { KEY_HEX } from '../world/dungeon/format';

describe('the palette', () => {
  it('has unique hue names, four valid shades each, around 24-34 hues', () => {
    const hues = Object.keys(HUES);
    expect(new Set(hues).size).toBe(hues.length);
    expect(hues.length).toBeGreaterThanOrEqual(24);
    expect(hues.length).toBeLessThanOrEqual(34);
    expect(SWATCHES).toHaveLength(hues.length * 4);
    for (const s of SWATCHES) expect(Number.isInteger(s.hex) && s.hex >= 0 && s.hex <= 0xffffff).toBe(true);
  });

  it('gets shades darker to lighter within each hue', () => {
    for (const h of Object.keys(HUES) as (keyof typeof HUES)[]) {
      const l = SWATCHES.filter((s) => s.hue === h).map((s) => s.lab[0]);
      for (let i = 1; i < 4; i++) expect(l[i], `${h} ${i}`).toBeGreaterThan(l[i - 1]);
    }
  });

  it('snaps deterministically, idempotently, and a swatch to itself', () => {
    for (const hex of [0x123456, 0x5d9c3a, 0xff00ff, 0x000001, 0xfefefe]) {
      expect(snap(hex)).toBe(snap(hex));
      expect(snap(snap(hex))).toBe(snap(hex));
      expect(SWATCHES.some((s) => s.hex === snap(hex))).toBe(true);
    }
    for (const s of SWATCHES) expect(snap(s.hex)).toBe(s.hex);
    expect(nearest(pal('grass')).distance).toBe(0);
  });

  it('keeps pure black and white, and lets the five key colours stay five', () => {
    expect(snap(0x000000)).toBe(0x000000);
    expect(snap(0xffffff)).toBe(0xffffff);
    const keys = Object.values(KEY_HEX).map(snap);
    expect(new Set(keys).size).toBe(5);
  });

  it('keeps the same names under any grade', () => {
    const sw = buildSwatches({ chroma: 0.5, warm: 2 });
    expect(sw.map((s) => `${s.hue}:${s.shade}`)).toEqual(SWATCHES.map((s) => `${s.hue}:${s.shade}`));
  });

  it("names only real swatches in each area's sub-palette", () => {
    for (const [area, list] of Object.entries(AREA_PALETTES)) {
      expect(list.length, area).toBeGreaterThan(0);
      for (const [h, s] of list) expect(pal(h, s), `${area}: ${h} ${s}`).toBeTypeOf('number');
    }
  });
});

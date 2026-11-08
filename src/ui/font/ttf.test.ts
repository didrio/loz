import { describe, expect, it } from 'vitest';
import { buildTtf, checksum, type TtGlyph } from './ttf';
import { buildUiFont } from './index';

/** Reads a font's table directory back, and enough of cmap/loca/glyf to check them. */
function parse(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint16(4);
  const tables: Record<string, { offset: number; length: number; sum: number }> = {};
  const tags: string[] = [];
  for (let i = 0; i < n; i++) {
    const at = 12 + 16 * i;
    const tag = String.fromCharCode(...bytes.slice(at, at + 4));
    tags.push(tag);
    tables[tag] = { sum: v.getUint32(at + 4), offset: v.getUint32(at + 8), length: v.getUint32(at + 12) };
  }
  const slice = (t: string) => bytes.slice(tables[t].offset, tables[t].offset + tables[t].length);
  const numGlyphs = v.getUint16(tables.maxp.offset + 4);
  const loca = Array.from({ length: numGlyphs + 1 }, (_, i) => v.getUint32(tables.loca.offset + 4 * i));
  // cmap format 4: look up a code point.
  const sub = tables.cmap.offset + v.getUint32(tables.cmap.offset + 8);
  const segs = v.getUint16(sub + 6) / 2;
  const glyphOf = (code: number) => {
    for (let i = 0; i < segs; i++) {
      const end = v.getUint16(sub + 14 + 2 * i);
      const start = v.getUint16(sub + 16 + 2 * segs + 2 * i);
      const delta = v.getUint16(sub + 16 + 4 * segs + 2 * i);
      if (code >= start && code <= end) return (code + delta) % 0x10000;
    }
    return 0;
  };
  const glyphBox = (gid: number) => {
    if (loca[gid] === loca[gid + 1]) return null;
    const at = tables.glyf.offset + loca[gid];
    return { contours: v.getInt16(at), xMin: v.getInt16(at + 2), yMin: v.getInt16(at + 4), xMax: v.getInt16(at + 6), yMax: v.getInt16(at + 8) };
  };
  return { v, tags, tables, slice, numGlyphs, loca, glyphOf, glyphBox };
}

const square = (x0: number, y0: number, s: number) => [
  { x: x0, y: y0, on: true },
  { x: x0, y: y0 + s, on: true },
  { x: x0 + s, y: y0 + s, on: true },
  { x: x0 + s, y: y0, on: true },
];

const tiny = (): TtGlyph[] => [
  { char: null, advance: 500, contours: [square(50, 0, 400)] },
  { char: ' ', advance: 250, contours: [] },
  { char: 'A', advance: 600, contours: [square(50, 0, 500)] },
  { char: 'B', advance: 700, contours: [square(60, -100, 300), square(100, 300, 400)] },
];

const font = (glyphs: TtGlyph[]) =>
  buildTtf({ family: 'Test', style: 'Regular', weight: 400, unitsPerEm: 1000, ascender: 800, descender: -200, xHeight: 500, capHeight: 700, glyphs });

describe('buildTtf', () => {
  it('writes a sorted table directory with valid checksums', () => {
    const f = parse(font(tiny()));
    expect(f.tags).toEqual([...f.tags].sort());
    expect(f.tags).toEqual(['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']);
    for (const t of f.tags) {
      if (t === 'head') continue; // its checksum is taken with checkSumAdjustment zeroed
      expect(checksum(f.slice(t)), t).toBe(f.tables[t].sum);
      expect(f.tables[t].offset % 4).toBe(0);
    }
  });

  it('sets checkSumAdjustment so the whole file sums to the magic number', () => {
    const bytes = font(tiny());
    expect(checksum(bytes)).toBe(0xb1b0afba);
    const f = parse(bytes);
    const head = f.slice('head');
    new DataView(head.buffer).setUint32(8, 0);
    expect(checksum(head)).toBe(f.tables.head.sum);
  });

  it('maps characters to their glyphs and stores their boxes', () => {
    const f = parse(font(tiny()));
    expect(f.numGlyphs).toBe(4);
    expect(f.glyphOf(65)).toBe(2);
    expect(f.glyphOf(66)).toBe(3);
    expect(f.glyphOf(32)).toBe(1);
    expect(f.glyphOf(67)).toBe(0);
    expect(f.glyphBox(1)).toBeNull(); // the space has no outline
    expect(f.glyphBox(2)).toEqual({ contours: 1, xMin: 50, yMin: 0, xMax: 550, yMax: 500 });
    expect(f.glyphBox(3)).toEqual({ contours: 2, xMin: 60, yMin: -100, xMax: 500, yMax: 700 });
    for (let i = 0; i < f.numGlyphs; i++) expect(f.loca[i + 1]).toBeGreaterThanOrEqual(f.loca[i]);
  });

  it('refuses a font whose glyph 0 is a character', () => {
    expect(() => font(tiny().slice(1))).toThrow(/notdef/);
  });
});

describe('the Embervale font', () => {
  it('builds both weights into valid files with every glyph mapped', () => {
    for (const w of [400, 700] as const) {
      const bytes = buildUiFont(w);
      expect(checksum(bytes)).toBe(0xb1b0afba);
      const f = parse(bytes);
      for (const ch of 'Embervale, 0-9! ←→') expect(f.glyphOf(ch.codePointAt(0)!), ch).toBeGreaterThan(0);
      // Everything fits between the font's ascent and descent.
      for (let g = 0; g < f.numGlyphs; g++) {
        const b = f.glyphBox(g);
        if (!b) continue;
        expect(b.yMax).toBeLessThanOrEqual(880);
        expect(b.yMin).toBeGreaterThanOrEqual(-280);
      }
    }
  });
});

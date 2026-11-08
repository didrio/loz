// A minimal TrueType writer: glyph outlines in, a font file out, loadable with `FontFace`.
// Only what a browser's font sanitizer (OTS) asks for: head, hhea, maxp, OS/2, hmtx, cmap (format 4,
// one Unicode subtable), loca (long), glyf (simple glyphs, no hinting), name, post (v3, no glyph names).
// Think of it as a serializer: the shapes are decided elsewhere (ui/font/outline.ts).

/** A point of a TrueType contour: on the curve, or the control point of a quadratic curve between two. */
export interface TtPoint {
  x: number;
  y: number;
  on: boolean;
}
export type Contour = TtPoint[];

export interface TtGlyph {
  /** The character this glyph draws (one code point), or null for .notdef. */
  char: string | null;
  advance: number;
  contours: Contour[];
}

export interface TtFont {
  family: string;
  /** "Regular", "Bold". */
  style: string;
  weight: number;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  xHeight: number;
  capHeight: number;
  /** Glyph 0 must be .notdef (char null). */
  glyphs: TtGlyph[];
}

/** The glyf flag that says contours may overlap (rasterizers then fill the union cleanly). */
export const OVERLAP_SIMPLE = 0x40;

class Writer {
  private bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  i16(v: number) {
    this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    this.u16(Math.floor(v / 0x10000) & 0xffff);
    this.u16(v & 0xffff);
  }
  tag(t: string) {
    for (let i = 0; i < 4; i++) this.u8(t.charCodeAt(i));
  }
  raw(b: Uint8Array) {
    for (const v of b) this.bytes.push(v);
  }
  pad4() {
    while (this.bytes.length % 4) this.bytes.push(0);
  }
  get length() {
    return this.bytes.length;
  }
  done() {
    return Uint8Array.from(this.bytes);
  }
}

const table = (fill: (w: Writer) => void) => {
  const w = new Writer();
  fill(w);
  return w.done();
};

/** The sum of a table's big-endian uint32 words (zero-padded to 4 bytes), mod 2^32. */
export function checksum(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) {
    const word = ((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    sum = (sum + (word >>> 0)) % 0x100000000;
  }
  return sum;
}

const log2floor = (n: number) => Math.floor(Math.log2(n));

interface Box {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

function boxOf(contours: Contour[]): Box | null {
  if (!contours.some((c) => c.length)) return null;
  const b = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };
  for (const c of contours)
    for (const p of c) {
      b.xMin = Math.min(b.xMin, p.x);
      b.yMin = Math.min(b.yMin, p.y);
      b.xMax = Math.max(b.xMax, p.x);
      b.yMax = Math.max(b.yMax, p.y);
    }
  return b;
}

/** One simple glyph's glyf record (empty glyphs have none). Coordinates must already be integers. */
function glyphRecord(contours: Contour[], box: Box): Uint8Array {
  return table((w) => {
    w.i16(contours.length);
    w.i16(box.xMin);
    w.i16(box.yMin);
    w.i16(box.xMax);
    w.i16(box.yMax);
    let end = -1;
    for (const c of contours) w.u16((end += c.length));
    w.u16(0); // no instructions
    const pts = contours.flat();
    pts.forEach((p, i) => w.u8((p.on ? 1 : 0) | (i === 0 ? OVERLAP_SIMPLE : 0)));
    let x = 0;
    for (const p of pts) {
      w.i16(p.x - x);
      x = p.x;
    }
    let y = 0;
    for (const p of pts) {
      w.i16(p.y - y);
      y = p.y;
    }
  });
}

/** cmap format 4: runs of consecutive code points mapped to consecutive glyph ids, one segment each. */
function cmapTable(codes: [number, number][]): Uint8Array {
  const sorted = [...codes].sort((a, b) => a[0] - b[0]);
  const segs: { start: number; end: number; delta: number }[] = [];
  for (const [code, gid] of sorted) {
    const last = segs[segs.length - 1];
    if (last && code === last.end + 1 && gid - code === last.delta) last.end = code;
    else segs.push({ start: code, end: code, delta: gid - code });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length;
  const searchRange = 2 * 2 ** log2floor(n);
  const sub = table((w) => {
    w.u16(4);
    w.u16(16 + 8 * n);
    w.u16(0);
    w.u16(n * 2);
    w.u16(searchRange);
    w.u16(log2floor(n));
    w.u16(n * 2 - searchRange);
    for (const s of segs) w.u16(s.end);
    w.u16(0);
    for (const s of segs) w.u16(s.start);
    for (const s of segs) w.u16((s.delta + 0x10000) % 0x10000);
    for (let i = 0; i < n; i++) w.u16(0);
  });
  return table((w) => {
    w.u16(0);
    w.u16(1);
    w.u16(3); // Windows
    w.u16(1); // Unicode BMP
    w.u32(12);
    w.raw(sub);
  });
}

function nameTable(f: TtFont): Uint8Array {
  const ps = `${f.family}-${f.style}`.replace(/[^A-Za-z0-9-]/g, '');
  const names: [number, string][] = [
    [1, f.family],
    [2, f.style],
    [3, `${ps};1.0`],
    [4, `${f.family} ${f.style}`],
    [5, 'Version 1.0'],
    [6, ps],
  ];
  const strings = names.map(([, s]) => {
    const w = new Writer();
    for (const ch of s) w.u16(ch.charCodeAt(0));
    return w.done();
  });
  return table((w) => {
    w.u16(0);
    w.u16(names.length);
    w.u16(6 + 12 * names.length);
    let off = 0;
    names.forEach(([id], i) => {
      w.u16(3);
      w.u16(1);
      w.u16(0x409);
      w.u16(id);
      w.u16(strings[i].length);
      w.u16(off);
      off += strings[i].length;
    });
    for (const s of strings) w.raw(s);
  });
}

/** Writes the font file. Coordinates are rounded to integers here. */
export function buildTtf(f: TtFont): Uint8Array {
  if (f.glyphs[0]?.char !== null) throw new Error('glyph 0 must be .notdef');
  const glyphs = f.glyphs.map((g) => ({
    ...g,
    advance: Math.round(g.advance),
    contours: g.contours.filter((c) => c.length).map((c) => c.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), on: p.on }))),
  }));
  const boxes = glyphs.map((g) => boxOf(g.contours));
  const all = boxes.filter((b): b is Box => !!b);
  const font: Box = {
    xMin: Math.min(...all.map((b) => b.xMin)),
    yMin: Math.min(...all.map((b) => b.yMin)),
    xMax: Math.max(...all.map((b) => b.xMax)),
    yMax: Math.max(...all.map((b) => b.yMax)),
  };
  const bold = f.weight >= 600;

  // glyf + loca
  const glyf = new Writer();
  const loca: number[] = [];
  glyphs.forEach((g, i) => {
    loca.push(glyf.length);
    const box = boxes[i];
    if (box) {
      glyf.raw(glyphRecord(g.contours, box));
      glyf.pad4();
    }
  });
  loca.push(glyf.length);

  const advances = glyphs.map((g) => g.advance);
  const lsbs = boxes.map((b) => (b ? b.xMin : 0));
  const rsbs = glyphs.map((g, i) => (boxes[i] ? g.advance - boxes[i]!.xMax : 0));
  const inked = boxes.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  const maxPoints = Math.max(0, ...glyphs.map((g) => g.contours.reduce((n, c) => n + c.length, 0)));
  const maxContours = Math.max(0, ...glyphs.map((g) => g.contours.length));
  const codes = glyphs.flatMap((g, i) => (g.char === null ? [] : [[g.char.codePointAt(0)!, i] as [number, number]]));
  const codeList = codes.map((c) => c[0]);
  const ascent = f.ascender;
  const descent = f.descender; // negative

  const tables: Record<string, Uint8Array> = {
    head: table((w) => {
      w.u32(0x00010000);
      w.u32(0x00010000);
      w.u32(0); // checkSumAdjustment, patched below
      w.u32(0x5f0f3cf5);
      w.u16(0x000b);
      w.u16(f.unitsPerEm);
      for (let i = 0; i < 4; i++) w.u32(0); // created, modified
      w.i16(font.xMin);
      w.i16(font.yMin);
      w.i16(font.xMax);
      w.i16(font.yMax);
      w.u16(bold ? 1 : 0);
      w.u16(8);
      w.i16(2);
      w.i16(1); // long loca
      w.i16(0);
    }),
    hhea: table((w) => {
      w.u32(0x00010000);
      w.i16(ascent);
      w.i16(descent);
      w.i16(0);
      w.u16(Math.max(...advances));
      w.i16(Math.min(...inked.map((i) => lsbs[i])));
      w.i16(Math.min(...inked.map((i) => rsbs[i])));
      w.i16(Math.max(...inked.map((i) => boxes[i]!.xMax)));
      w.i16(1);
      w.i16(0);
      w.i16(0);
      for (let i = 0; i < 4; i++) w.i16(0);
      w.i16(0);
      w.u16(glyphs.length);
    }),
    maxp: table((w) => {
      w.u32(0x00010000);
      w.u16(glyphs.length);
      w.u16(maxPoints);
      w.u16(maxContours);
      w.u16(0);
      w.u16(0);
      w.u16(2);
      for (let i = 0; i < 8; i++) w.u16(0);
    }),
    'OS/2': table((w) => {
      const em = f.unitsPerEm;
      w.u16(4);
      w.i16(Math.round(advances.reduce((a, b) => a + b, 0) / advances.length));
      w.u16(f.weight);
      w.u16(5);
      w.u16(0); // fsType: installable
      for (const v of [em * 0.65, em * 0.6, 0, em * 0.075, em * 0.65, em * 0.6, 0, em * 0.35, em * 0.05, em * 0.26]) w.i16(Math.round(v));
      w.i16(0);
      for (let i = 0; i < 10; i++) w.u8(0); // panose
      w.u32(1); // Basic Latin
      w.u32(0);
      w.u32(0);
      w.u32(0);
      w.tag('NONE');
      w.u16((bold ? 0x20 : 0x40) | 0x80); // bold/regular, USE_TYPO_METRICS
      w.u16(Math.min(...codeList));
      w.u16(Math.min(0xffff, Math.max(...codeList)));
      w.i16(ascent);
      w.i16(descent);
      w.i16(0);
      w.u16(Math.max(ascent, font.yMax));
      w.u16(Math.max(-descent, -font.yMin));
      w.u32(1); // Latin 1
      w.u32(0);
      w.i16(f.xHeight);
      w.i16(f.capHeight);
      w.u16(0);
      w.u16(32);
      w.u16(0);
    }),
    hmtx: table((w) => {
      glyphs.forEach((_, i) => {
        w.u16(advances[i]);
        w.i16(lsbs[i]);
      });
    }),
    cmap: cmapTable(codes),
    loca: table((w) => loca.forEach((o) => w.u32(o))),
    glyf: glyf.done(),
    name: nameTable(f),
    post: table((w) => {
      w.u32(0x00030000);
      w.u32(0);
      w.i16(-Math.round(f.unitsPerEm * 0.1));
      w.i16(Math.round(f.unitsPerEm * 0.05));
      for (let i = 0; i < 5; i++) w.u32(0);
    }),
  };

  // The table directory, tags in byte order, then each table 4-byte aligned.
  const tags = Object.keys(tables).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const n = tags.length;
  const out = new Writer();
  const searchRange = 16 * 2 ** log2floor(n);
  out.u32(0x00010000);
  out.u16(n);
  out.u16(searchRange);
  out.u16(log2floor(n));
  out.u16(n * 16 - searchRange);
  let offset = 12 + 16 * n;
  for (const t of tags) {
    out.tag(t);
    out.u32(checksum(tables[t]));
    out.u32(offset);
    out.u32(tables[t].length);
    offset += Math.ceil(tables[t].length / 4) * 4;
  }
  let headAt = 0;
  for (const t of tags) {
    if (t === 'head') headAt = out.length;
    out.raw(tables[t]);
    out.pad4();
  }
  const bytes = out.done();
  const adjust = (0xb1b0afba - checksum(bytes) + 0x100000000) % 0x100000000;
  new DataView(bytes.buffer).setUint32(headAt + 8, adjust);
  return bytes;
}

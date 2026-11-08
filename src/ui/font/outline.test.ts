import { describe, expect, it } from 'vitest';
import { ACTIONS, glyph } from '../../core/input';
import { GLYPHS } from './glyphs';
import { buildGlyph, WEIGHTS } from './index';
import { circle, outlineStrokes, parseSkeleton, signedArea } from './outline';

describe('parseSkeleton', () => {
  it('reads points, arcs, loops and dots into strokes', () => {
    const s = parseSkeleton('0,0 0,5 | o2,2,1,1 | 3,3');
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ pts: [[0, 0], [0, 5]], closed: false, filled: false });
    expect(s[1].closed).toBe(true);
    expect(s[2].pts).toEqual([[3, 3]]);
  });

  it('joins an arc to the point before it', () => {
    const [s] = parseSkeleton('0,0 a2,0,1,1,180,0');
    expect(s.pts[0]).toEqual([0, 0]);
    expect(s.pts[1][0]).toBeCloseTo(1);
    expect(s.pts[s.pts.length - 1][0]).toBeCloseTo(3);
  });

  it('rejects a bad token', () => {
    expect(() => parseSkeleton('0,0 1')).toThrow();
    expect(() => parseSkeleton('a1,2,3')).toThrow();
  });
});

describe('outlineStrokes', () => {
  const cw = (c: { x: number; y: number }[]) => signedArea(c) < 0;

  it('traces a straight stroke as one clockwise contour, a pen wide', () => {
    const [c] = outlineStrokes(parseSkeleton('0,0 4,0'), 0.5);
    expect(cw(c)).toBe(true);
    const ys = c.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(0.5);
    expect(Math.min(...ys)).toBeCloseTo(-0.5);
    const xs = c.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-0.5, 1); // round caps reach past the ends
    expect(Math.max(...xs)).toBeCloseTo(4.5, 1);
  });

  it('gives a sharp corner two pieces (a round join) and a gentle one a mitre', () => {
    expect(outlineStrokes(parseSkeleton('0,0 0,5 5,5'), 0.5)).toHaveLength(2);
    expect(outlineStrokes(parseSkeleton('0,0 5,0 10,1'), 0.5)).toHaveLength(1);
  });

  it('gives a loop a clockwise outside and an anticlockwise hole', () => {
    const [outer, inner] = outlineStrokes(parseSkeleton('o0,0,2,2'), 0.5);
    expect(cw(outer)).toBe(true);
    expect(cw(inner)).toBe(false);
    expect(Math.max(...outer.map((p) => p.x))).toBeCloseTo(2.5, 1);
    expect(Math.max(...inner.map((p) => p.x))).toBeCloseTo(1.5, 1);
  });

  it('draws a dot as a clockwise circle', () => {
    const c = circle([0, 0], 1);
    expect(cw(c)).toBe(true);
    expect(c[0].on).toBe(true);
    expect(c[0].x).toBeCloseTo(1);
    expect(c[0].y).toBeCloseTo(0);
  });
});

describe('the glyph table', () => {
  it('parses every glyph, and the bold is wider than the regular', () => {
    for (const [ch, def] of Object.entries(GLYPHS)) {
      const reg = buildGlyph(ch, def, WEIGHTS[400]);
      const bold = buildGlyph(ch, def, WEIGHTS[700]);
      expect(reg.advance, ch).toBeGreaterThan(0);
      if (reg.contours.length) expect(bold.advance, ch).toBeGreaterThan(reg.advance);
      for (const c of reg.contours) expect(c.length, ch).toBeGreaterThan(2);
    }
  });

  // Every character the player can read has a glyph of its own (the fallback font would show through).
  it('covers every character of the game text and the button labels', () => {
    const files = import.meta.glob('../../content/text/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(5);
    let text = '';
    // Comments dropped: the player never reads those.
    for (const src of Object.values(files)) text += src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const a of ACTIONS) for (const d of ['keyboard', 'gamepad', 'touch'] as const) text += glyph(a, d);
    const missing = [...new Set(text)].filter((ch) => ch >= ' ' && !(ch in GLYPHS));
    expect(missing).toEqual([]);
  });
});

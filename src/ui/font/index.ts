// Embervale Rounded: the game's own font, built from the skeletons in glyphs.ts at boot and handed to
// the browser as a real font (`FontFace`), so the DOM HUD keeps wrapping, selection-free layout and
// crisp text at any resolution. Two weights from one skeleton: the bold is the same path, a wider pen.

import { GLYPHS, NOTDEF, type GlyphDef } from './glyphs';
import { outlineStrokes, parseSkeleton } from './outline';
import { buildTtf, type Contour, type TtGlyph } from './ttf';

export const UI_FONT = 'Embervale';

/** Font units per design unit (1000-unit em; x-height 500, cap height 700). */
const SCALE = 100;
/** Clear space either side of the ink, in design units. */
const GAP = 0.55;

export const WEIGHTS = {
  /** The pen's half-width per weight, in design units. */
  400: 0.5,
  700: 0.7,
} as const;
export type UiWeight = keyof typeof WEIGHTS;

const scaled = (cs: Contour[], dx: number): Contour[] =>
  cs.map((c) => c.map((p) => ({ x: (p.x + dx) * SCALE, y: p.y * SCALE, on: p.on })));

/** One glyph: outlined at pen half-width `h`, shifted so the ink starts one side bearing in. */
export function buildGlyph(char: string | null, def: GlyphDef, h: number): TtGlyph {
  const s = typeof def === 'string' ? def : def.s;
  const contours = outlineStrokes(parseSkeleton(s), h);
  if (typeof def !== 'string' && !contours.length) return { char, advance: def.adv * SCALE, contours: [] };
  const xs = contours.flat().map((p) => p.x);
  const minX = Math.min(...xs);
  const width = Math.max(...xs) - minX;
  const dx = GAP - minX;
  return { char, advance: (width + 2 * GAP) * SCALE, contours: scaled(contours, dx) };
}

/** The font file for one weight. */
export function buildUiFont(weight: UiWeight): Uint8Array {
  const h = WEIGHTS[weight];
  const glyphs = [buildGlyph(null, NOTDEF, h), ...Object.entries(GLYPHS).map(([ch, def]) => buildGlyph(ch, def, h))];
  return buildTtf({
    family: UI_FONT,
    style: weight === 700 ? 'Bold' : 'Regular',
    weight,
    unitsPerEm: 1000,
    ascender: 880,
    descender: -280,
    xHeight: 500,
    capHeight: 700,
    glyphs,
  });
}

/**
 * Builds both weights and adds them to the page's fonts. CSS names `'Embervale'` first and a system
 * font after it, so if this fails (it logs) the game still reads, just in the fallback.
 */
export async function loadUiFont(): Promise<boolean> {
  try {
    const faces = ([400, 700] as const).map((w) => {
      const bytes = buildUiFont(w);
      return new FontFace(UI_FONT, bytes.buffer as ArrayBuffer, { weight: String(w), display: 'block' });
    });
    for (const f of faces) document.fonts.add(f);
    await Promise.all(faces.map((f) => f.load()));
    return true;
  } catch (err) {
    console.error('Embervale font failed to load; using the fallback font.', err);
    return false;
  }
}

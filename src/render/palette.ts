/**
 * The master palette (docs/art.md "Palette"): every authored colour in the game comes from here.
 *
 * About thirty named hues, each with four shades: 0 deep, 1 shade, 2 base, 3 light. Most hues give
 * only a base and the other shades are worked out from it in OKLCH (a colour space where equal steps
 * look equal): darker shades lean toward violet, the light one toward warm yellow, the way a painter
 * shades. A few hues (the neutrals, the sky) list all four by hand.
 *
 * `mat`, `surf` and `uniqueMat` (render/materials.ts) snap whatever colour they're given to the
 * nearest swatch, so the whole game is on palette without touching call sites. New code names its
 * colours: `pal('grass')`, `pal('stone', 1)`. Sky, fog and light keys come from here too but blend
 * freely between them.
 *
 * Pure: no imports, so `scripts/palette.mjs` (npm run palette) can load it straight from Node.
 */

export type Shade = 0 | 1 | 2 | 3;

interface HueDef {
  /** The base (shade 2); the other shades are worked out from it. */
  base?: number;
  /** All four shades by hand, deep to light, instead of `base`. */
  shades?: readonly [number, number, number, number];
  /** Glows, gems and key colours: a softer candidate never mutes them, so they always read. */
  vivid?: boolean;
}

export const HUES = {
  // Ground and growing things.
  grass: { base: 0x5d9c3a },
  leaf: { base: 0x3b6e30 },
  moss: { base: 0x5b6656 },
  olive: { base: 0x8a8a5a },
  bark: { base: 0x5e3d20 },
  wood: { base: 0x8b5a2b },
  straw: { base: 0xc9a878 },
  earth: { base: 0xb98d5a },
  sand: { base: 0xc9b48a },
  // Building stuff.
  clay: { base: 0xb4532a },
  brick: { base: 0x9c3b2b },
  plaster: { base: 0xe8dfc4 },
  // Neutrals, by hand: blacks for pits and the void, warm and cool greys for stone, whites.
  ink: { shades: [0x000000, 0x0c0b0e, 0x17151c, 0x24211e] },
  stone: { shades: [0x3a3633, 0x5e5a52, 0x8a8478, 0xb9b0a0] },
  slate: { shades: [0x2a2e36, 0x4b525c, 0x7a8290, 0xb8bec9] },
  chalk: { shades: [0xd8d2c4, 0xe9e4d4, 0xf4f0e6, 0xffffff] },
  // Water, sky and night, by hand where the sky keys need them.
  water: { base: 0x3f86b8 },
  teal: { base: 0x2aa198 },
  sky: { shades: [0x2a4f9a, 0x3f7fd2, 0x7fb0e0, 0xc8e2f0] },
  night: { shades: [0x070b24, 0x0f1538, 0x1a2350, 0x3a4689] },
  moon: { shades: [0x45619e, 0x6a7ad0, 0x8fa3ff, 0xdfe6ff] },
  blight: { shades: [0x2a1a3c, 0x3b2c5e, 0x56345f, 0x9a6aa8] },
  // People and cloth (Wren's scarf is teal).
  skin: { base: 0xd99a6c },
  rose: { shades: [0x4a2030, 0x8a3f55, 0xb5566a, 0xf28bb0] },
  plum: { base: 0x6b4c8a },
  // Light and magic.
  ember: { base: 0xff7a2a, vivid: true },
  flame: { base: 0xffb35a, vivid: true },
  spirit: { base: 0x3fb8e0, vivid: true },
  // The five small-key colours (world/dungeon/format.ts KEY_HEX), which double as cloth and gem colours.
  crimson: { base: 0xd0384a, vivid: true },
  azure: { base: 0x3d8fe0, vivid: true },
  jade: { base: 0x3cc47c, vivid: true },
  violet: { base: 0x9a58e0, vivid: true },
  amber: { base: 0xf0a830, vivid: true },
} as const satisfies Record<string, HueDef>;

export type Hue = keyof typeof HUES;

/** Each area's colours, picked from the master palette: what its final pass paints with (and T33's validator checks). */
export type AreaLook =
  | 'valley' | 'village' | 'hollow' | 'blight' | 'northpass'
  | 'shrine.sandstone' | 'shrine.marble' | 'shrine.moss' | 'shrine.basalt';

const all = (h: Hue): [Hue, Shade][] => [[h, 0], [h, 1], [h, 2], [h, 3]];

export const AREA_PALETTES: Record<AreaLook, readonly [Hue, Shade][]> = {
  valley: [...all('grass'), ...all('leaf'), ...all('earth'), ...all('stone'), ...all('water'), ['sand', 2], ['sand', 3], ['bark', 1], ['bark', 2], ['chalk', 3]],
  village: [...all('plaster'), ...all('wood'), ...all('straw'), ...all('clay'), ...all('stone'), ['bark', 1], ['bark', 2], ['grass', 1], ['grass', 2], ['grass', 3], ['leaf', 2], ['slate', 0], ['slate', 1], ['slate', 2], ['ink', 3], ['amber', 2], ['amber', 3], ['rose', 3], ['chalk', 3], ['moon', 2], ['flame', 2], ['flame', 3]],
  hollow: [...all('stone'), ...all('moss'), ['ink', 2], ['ink', 3], ['bark', 0], ['bark', 1], ['spirit', 2], ['spirit', 3], ['flame', 2]],
  blight: [...all('blight'), ...all('night'), ['moss', 0], ['moss', 1], ['stone', 0], ['stone', 1], ['violet', 2], ['violet', 3]],
  northpass: [...all('stone'), ...all('slate'), ...all('earth'), ['grass', 1], ['grass', 2], ['leaf', 1], ['chalk', 2], ['chalk', 3]],
  'shrine.sandstone': [...all('sand'), ...all('stone'), ['ink', 2], ['ink', 3], ['flame', 2], ['flame', 3], ['rose', 1]],
  'shrine.marble': [...all('slate'), ...all('chalk'), ['ink', 2], ['moon', 2], ['moon', 3], ['sky', 3]],
  'shrine.moss': [...all('moss'), ...all('leaf'), ['bark', 0], ['bark', 1], ['water', 0], ['ink', 2], ['jade', 3]],
  'shrine.basalt': [...all('ink'), ['stone', 0], ['stone', 1], ['ember', 1], ['ember', 2], ['ember', 3], ['flame', 2]],
};

/**
 * The grade over the whole palette (owner's call, 2026-11-07, tuned by eye against the old look: a
 * hair less saturated and a little warmer than before; 0.85 / 1 read too warm and too grey). `chroma` scales saturation (vivid hues are left alone); `warm` tints toward amber, most
 * in the mid-tones and not at all at pure black or white.
 */
export interface Grade {
  chroma: number;
  warm: number;
}

export const GRADE: Grade = { chroma: 0.97, warm: 0.5 };

// --- OKLab / OKLCH (Björn Ottosson's), on sRGB hex colours. ---

type Lab = [number, number, number];

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToLab(hex: number): Lab {
  const r = toLin(((hex >> 16) & 255) / 255), g = toLin(((hex >> 8) & 255) / 255), b = toLin((hex & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Linear sRGB of a Lab colour, unclamped (so a caller can tell if it's out of gamut). */
function labToLin([L, A, B]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** The hex of a Lab colour; out-of-gamut colours lose chroma (keeping lightness and hue) until they fit. */
export function labToHex(lab: Lab): number {
  let rgb = labToLin(lab);
  if (!inGamut(rgb)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const k = (lo + hi) / 2;
      if (inGamut(labToLin([lab[0], lab[1] * k, lab[2] * k]))) lo = k;
      else hi = k;
    }
    rgb = labToLin([lab[0], lab[1] * lo, lab[2] * lo]);
  }
  const [r, g, b] = rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c))))) * 255));
  return (r << 16) | (g << 8) | b;
}

const toLch = ([L, A, B]: Lab): Lab => [L, Math.hypot(A, B), Math.atan2(B, A)];
const fromLch = ([L, C, H]: Lab): Lab => [L, C * Math.cos(H), C * Math.sin(H)];

/** Turns hue angle `h` (radians) toward `target` (degrees) by at most `deg` degrees. */
function turnToward(h: number, target: number, deg: number) {
  const t = (target * Math.PI) / 180;
  const diff = Math.atan2(Math.sin(t - h), Math.cos(t - h));
  const step = (deg * Math.PI) / 180;
  return h + Math.sign(diff) * Math.min(Math.abs(diff), step);
}

/** Shade `s` worked out from a base: lightness, chroma and a hue lean (shadows violet, lights warm). */
function deriveShade(base: number, s: Shade): number {
  if (s === 2) return base;
  const [L, C, H] = toLch(hexToLab(base));
  const tinted = C > 0.02;
  if (s === 3) return labToHex(fromLch([L + (1 - L) * 0.32, C * 0.9, tinted ? turnToward(H, 80, 10) : H]));
  const k = s === 1 ? 0.7 : 0.42;
  return labToHex(fromLch([L * k, C * (s === 1 ? 0.8 : 0.6), tinted ? turnToward(H, 290, s === 1 ? 8 : 18) : H]));
}

/** The grade on one colour. */
function grade(hex: number, c: Grade, vivid: boolean): number {
  const [L, A, B] = hexToLab(hex);
  const k = vivid ? 1 : c.chroma;
  const mid = 4 * L * (1 - L); // 0 at black and white, 1 in the mid-tones
  const w = vivid ? 0 : c.warm * mid;
  return labToHex([L, A * k + 0.002 * w, B * k + 0.007 * w]);
}

export interface Swatch {
  hue: Hue;
  shade: Shade;
  hex: number;
  lab: Lab;
}

/** Every swatch under a grade, in table order (hue by hue, deep to light). */
export function buildSwatches(c: Grade = GRADE): Swatch[] {
  const out: Swatch[] = [];
  for (const hue of Object.keys(HUES) as Hue[]) {
    const def: HueDef = HUES[hue];
    for (const shade of [0, 1, 2, 3] as Shade[]) {
      const raw = def.shades ? def.shades[shade] : deriveShade(def.base!, shade);
      const hex = grade(raw, c, !!def.vivid);
      out.push({ hue, shade, hex, lab: hexToLab(hex) });
    }
  }
  return out;
}

export const SWATCHES: readonly Swatch[] = buildSwatches();

const byName = new Map(SWATCHES.map((s) => [`${s.hue}:${s.shade}`, s.hex]));

/** A palette colour by name: `pal('grass')`, `pal('stone', 1)`. */
export function pal(hue: Hue, shade: Shade = 2): number {
  return byName.get(`${hue}:${shade}`)!;
}

/** The swatch nearest `hex` (OKLab distance; ties go to the earlier swatch), and how far it is. */
export function nearest(hex: number, swatches: readonly Swatch[] = SWATCHES): { swatch: Swatch; distance: number } {
  const [L, A, B] = hexToLab(hex);
  let best = swatches[0], bestD = Infinity;
  for (const s of swatches) {
    const d = (s.lab[0] - L) ** 2 + (s.lab[1] - A) ** 2 + (s.lab[2] - B) ** 2;
    if (d < bestD) (best = s), (bestD = d);
  }
  return { swatch: best, distance: Math.sqrt(bestD) };
}

const snapped = new Map<number, number>();

/** `hex` moved to the nearest palette colour. Deterministic, and a swatch snaps to itself. */
export function snap(hex: number): number {
  let s = snapped.get(hex);
  if (s === undefined) snapped.set(hex, (s = nearest(hex).swatch.hex));
  return s;
}

/** `grass 2`: how a swatch is written in reports and on the swatch page. */
export const swatchName = (s: { hue: Hue; shade: Shade }) => `${s.hue} ${s.shade}`;

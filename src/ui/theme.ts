// The UI's surface (art.md "UI"): every colour and bevel the HUD draws with, as data on the master
// palette. `applyTheme` writes a look into CSS variables on the page (`--ui-*`), and style.css only
// ever reads those, the way a design-token file feeds a component library.

import { pal, type Hue, type Shade } from '../render/palette';
import { UI_FONT } from './font';

/** A palette colour, optionally see-through. */
type C = readonly [hue: Hue, shade: Shade, alpha?: number];

export interface UiLook {
  /** The text boxes' fill, top to bottom. */
  fill: readonly C[];
  /** The rim around a box and its width (px). */
  rim: C;
  rimW: number;
  /** The bevel inside the rim: lit top-left, shaded bottom-right, and its width (px). */
  bevelHi: C;
  bevelLo: C;
  bevel: number;
  text: C;
  /** The dark edge round every letter (px; 0 = none) and the drop shadow's offset below it (px). */
  outline: C;
  outlineW: number;
  drop: number;
  /** The speaker's name plate (and glyph chips, selected rows): fill top, fill bottom, ink. */
  plate: readonly [C, C];
  plateInk: C;
  /** Coloured words (ui/richText.ts tags) and how much they glow (px of blur; 0 = none). */
  gear: C;
  place: C;
  danger: C;
  old: C;
  glow: number;
  /** The touch buttons: fill, rim. */
  touch: C;
  touchRim: C;
}

export const UI_LOOKS = {
  /** Close to the old HUD: a dark glass box, thin gold line, soft shadow. */
  restrained: {
    fill: [['night', 1, 0.86], ['night', 0, 0.86]],
    rim: ['amber', 2, 0.75],
    rimW: 2,
    bevelHi: ['moon', 1, 0.25],
    bevelLo: ['ink', 0, 0.3],
    bevel: 1,
    text: ['chalk', 3],
    outline: ['ink', 0, 0.6],
    outlineW: 0,
    drop: 2,
    plate: [['amber', 3], ['amber', 2]],
    plateInk: ['bark', 0],
    gear: ['amber', 3],
    place: ['sky', 2],
    danger: ['ember', 2],
    old: ['violet', 3],
    glow: 0,
    touch: ['night', 1, 0.38],
    touchRim: ['chalk', 3, 0.4],
  },
  /** The owner's pick to start from (2026-11-08): saturated blue, a clear bevel, gold rim, outlined text. */
  bold: {
    fill: [['azure', 1, 0.92], ['sky', 0, 0.9], ['night', 1, 0.92]],
    rim: ['amber', 3],
    rimW: 2,
    bevelHi: ['sky', 2, 0.7],
    bevelLo: ['night', 0, 0.85],
    bevel: 2,
    text: ['chalk', 3],
    outline: ['night', 0],
    outlineW: 1.5,
    drop: 2,
    plate: [['amber', 3], ['amber', 1]],
    plateInk: ['bark', 0],
    gear: ['amber', 3],
    place: ['sky', 3],
    danger: ['ember', 3],
    old: ['violet', 3],
    glow: 0,
    touch: ['sky', 0, 0.45],
    touchRim: ['sky', 3, 0.65],
  },
  /** The loudest: a violet-blue-teal sweep, a thick chrome frame, glowing keywords. */
  full: {
    fill: [['violet', 1, 0.92], ['azure', 1, 0.9], ['teal', 1, 0.92]],
    rim: ['chalk', 1],
    rimW: 3,
    bevelHi: ['chalk', 3, 0.85],
    bevelLo: ['slate', 0, 0.9],
    bevel: 3,
    text: ['chalk', 3],
    outline: ['night', 0],
    outlineW: 2,
    drop: 3,
    plate: [['flame', 3], ['ember', 1]],
    plateInk: ['night', 0],
    gear: ['amber', 3],
    place: ['spirit', 3],
    danger: ['crimson', 3],
    old: ['violet', 3],
    glow: 6,
    touch: ['violet', 0, 0.45],
    touchRim: ['chalk', 2, 0.7],
  },
} as const satisfies Record<string, UiLook>;

export type UiLookId = keyof typeof UI_LOOKS;
export const UI_LOOK: UiLookId = 'bold';

/** The two text sizes (art.md: "two sizes"): body text (dialog, menus) and labels. */
export const UI_SIZES = { text: 21, small: 14 } as const;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** A palette colour as CSS. */
export function css([hue, shade, alpha]: C): string {
  const n = pal(hue, shade);
  if (alpha === undefined || alpha >= 1) return hex(n);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The text outline as a text-shadow stack: eight directions (or none), then the drop shadow under it. */
function inkShadow(l: UiLook): string {
  const c = css(l.outline);
  const w = l.outlineW;
  const d = +(w * 0.7).toFixed(2);
  const ring = w > 0 ? [`${w}px 0`, `-${w}px 0`, `0 ${w}px`, `0 -${w}px`, `${d}px ${d}px`, `-${d}px ${d}px`, `${d}px -${d}px`, `-${d}px -${d}px`].map((o) => `${o} 0 ${c}`) : [];
  const drop = w > 0 ? `0 ${w + l.drop}px 0 ${c}` : `0 ${l.drop}px ${l.drop}px ${c}`;
  return [...ring, drop].join(', ');
}

/** Every CSS variable a look sets. Pure, so the bench and the tests read the same thing the game does. */
export function themeVars(id: UiLookId): Record<string, string> {
  const l: UiLook = UI_LOOKS[id];
  const stops = l.fill.map(css);
  return {
    '--ui-font': `'${UI_FONT}', 'Trebuchet MS', 'Gill Sans', sans-serif`,
    '--ui-text-size': `${UI_SIZES.text}px`,
    '--ui-small-size': `${UI_SIZES.small}px`,
    '--ui-fill': `linear-gradient(${stops.join(', ')})`,
    '--ui-fill-flat': stops[stops.length - 1],
    '--ui-rim': css(l.rim),
    '--ui-rim-w': `${l.rimW}px`,
    '--ui-bevel': `${l.bevel}px`,
    '--ui-bevel-hi': css(l.bevelHi),
    '--ui-bevel-lo': css(l.bevelLo),
    '--ui-text': css(l.text),
    '--ui-outline': css(l.outline),
    '--ui-ink': inkShadow(l),
    '--ui-plate': `linear-gradient(${css(l.plate[0])}, ${css(l.plate[1])})`,
    '--ui-plate-ink': css(l.plateInk),
    '--ui-gold': css(l.plate[0]),
    '--ui-gear': css(l.gear),
    '--ui-place': css(l.place),
    '--ui-danger': css(l.danger),
    '--ui-old': css(l.old),
    '--ui-glow': l.glow ? `0 0 ${l.glow}px` : '0 0 0',
    '--ui-touch': css(l.touch),
    '--ui-touch-rim': css(l.touchRim),
  };
}

/** Writes a look onto the page (before the HUD is first drawn). */
export function applyTheme(id: UiLookId = UI_LOOK, root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(themeVars(id))) root.style.setProperty(k, v);
  root.dataset.uiLook = id;
}

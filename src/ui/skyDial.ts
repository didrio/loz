/**
 * The clock's dial: a little window onto the sky. The bottom 30% is the ground, the rest is sky; the sun
 * rises out of the ground on the left at 6:00, stands near the top at noon and has sunk out of sight on the
 * right by 18:00, and the moon does the same through the night (peaking at midnight). Day and night match
 * `GameState.isNight` (night is 18:00-6:00). Positions are fractions of the dial, so CSS can size it freely.
 */

/** Where the ground starts, from the top of the dial. */
export const HORIZON = 0.7;
/** A sun's or moon's radius, as a fraction of the dial. */
export const BODY_R = 0.12;
/** The bodies ride an ellipse around a pivot one body below the horizon, so at 6:00 and 18:00 they're just hidden. */
const PIVOT = { x: 0.5, y: HORIZON + BODY_R + 0.01 };
const ORBIT = { x: 0.34, y: PIVOT.y - 0.17 };

export interface DialView {
  sun: { x: number; y: number };
  moon: { x: number; y: number };
  /** 1 in full day, 0 in full night; it ramps over the hour either side of 6:00 and 18:00. */
  daylight: number;
  /** How much of the dusk/dawn glow tints the horizon (0-1). */
  glow: number;
  skyTop: string;
  skyLow: string;
  ground: string;
}

/** A body `angle` radians into its arc: 0 rising on the left, PI/2 overhead, PI setting on the right. */
function onArc(angle: number) {
  return { x: PIVOT.x - Math.cos(angle) * ORBIT.x, y: PIVOT.y - Math.sin(angle) * ORBIT.y };
}

/** Two 0xRRGGBB colors blended (t = 0 is `a`). */
const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function dialView(hours: number): DialView {
  const h = ((hours % 24) + 24) % 24;
  const daylight = h < 12 ? clamp01(h - 5.5) : clamp01(18.5 - h);
  const glow = Math.max(0, 1 - Math.min(Math.abs(h - 6), Math.abs(h - 18)) / 1.2);
  // The night is kept a deep blue-violet and the night ground a mossy green, so the two never blur together.
  return {
    sun: onArc(((h - 6) / 12) * Math.PI),
    moon: onArc(((h - 18) / 12) * Math.PI),
    daylight,
    glow,
    skyTop: hex(mix(0x0e1238, 0x3f9be0, daylight)),
    skyLow: hex(mix(mix(0x2a3570, 0x9fdcff, daylight), 0xf29a4a, glow * 0.75)),
    ground: hex(mix(0x24552c, 0x5fb24a, daylight)),
  };
}

/** Is a body at `y` any part above the ground line? */
export const aboveGround = (y: number) => y - BODY_R < HORIZON;

/** The dial's DOM: sky, a few stars, the sun and moon, then the ground drawn over them. */
export class SkyDial {
  readonly el: HTMLElement;
  private sky: HTMLElement;
  private stars: HTMLElement;
  private sun: HTMLElement;
  private moon: HTMLElement;
  private ground: HTMLElement;
  private shown = '';

  constructor(el: HTMLElement) {
    this.el = el;
    el.innerHTML = `<div class="dial-sky"></div><div class="dial-stars"></div><div class="dial-sun"></div>
      <div class="dial-moon"></div><div class="dial-ground"></div>`;
    const q = (s: string) => el.querySelector<HTMLElement>(s)!;
    this.sky = q('.dial-sky');
    this.stars = q('.dial-stars');
    this.sun = q('.dial-sun');
    this.moon = q('.dial-moon');
    this.ground = q('.dial-ground');
    this.ground.style.top = `${HORIZON * 100}%`;
    for (const b of [this.sun, this.moon]) b.style.width = b.style.height = `${BODY_R * 200}%`;
  }

  set(hours: number) {
    // Ten in-game minutes is a few pixels at most: no need to touch the DOM more often.
    const key = (Math.round(hours * 6) / 6).toFixed(3);
    if (key === this.shown) return;
    this.shown = key;
    const v = dialView(hours);
    this.sky.style.background = `linear-gradient(${v.skyTop}, ${v.skyLow} ${HORIZON * 100}%)`;
    this.stars.style.opacity = String(1 - v.daylight);
    this.ground.style.background = v.ground;
    const place = (el: HTMLElement, p: { x: number; y: number }) => {
      el.style.left = `${p.x * 100}%`;
      el.style.top = `${p.y * 100}%`;
    };
    place(this.sun, v.sun);
    place(this.moon, v.moon);
  }
}

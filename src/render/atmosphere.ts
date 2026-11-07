import * as THREE from 'three';
import { pal, snap, type AreaLook } from './palette';

/**
 * Each place's atmosphere as data, in one spot (docs/art.md "Rendering rules", T31): the sky and light
 * through the day, how far the fog reaches, which motes drift through the air, and which sub-palette the
 * place is painted with. The sky (`render/sky.ts`) blends between these as Wren crosses from one place
 * to the next; the blight and a boss's gloom stay modifiers on top of whatever is blended.
 *
 * To add a place: add an id, an entry in `ATMOSPHERES`, and have its area say where it applies
 * (`Area.atmosphereAt`). Fog is always the colour of the sky's horizon outdoors, so tint a place by
 * tinting its `horizon`.
 */

export type OutdoorId = 'valley' | 'village' | 'hollow';
export type IndoorId = 'shrine';
export type AtmosphereId = OutdoorId | IndoorId;

/** Fog as data: a colour (hex) and where it starts and ends (meters). */
export interface FogLook {
  color: number;
  near: number;
  far: number;
}

/** The sky and light at one moment of the day. */
export interface Phase {
  top: number;
  horizon: number;
  /** The sun's (or moon's) light colour. */
  sun: number;
  sunI: number;
  hemiI: number;
}

/** The day in six moods; `lightKeys` lays them on the clock. */
export interface PhaseSet {
  night: Phase;
  predawn: Phase;
  dawn: Phase;
  day: Phase;
  dusk: Phase;
  eve: Phase;
}

export interface LightKey extends Phase {
  h: number;
}

/** The moods on the game clock; between two keys the light is interpolated. Night wraps round midnight. */
export function lightKeys(p: PhaseSet): LightKey[] {
  return [
    { h: 0, ...p.night },
    { h: 4.8, ...p.predawn },
    { h: 6, ...p.dawn },
    { h: 8, ...p.day },
    { h: 16, ...p.day },
    { h: 18, ...p.dusk },
    { h: 19.3, ...p.eve },
    { h: 24, ...p.night },
  ];
}

/** Floating specks in the air (render/motes.ts). Speeds are metres per second. */
export interface MotePreset {
  color: number;
  /** Point size (world metres). */
  size: number;
  /** Average fall speed; negative rises. */
  fall: number;
  /** Steady drift along +x. */
  wind: number;
  /** Wobble amplitude. */
  sway: number;
  opacity: number;
  /** Share of the cloud that is drawn, 0–1. */
  density: number;
}

/** The blight's ash (game/blight.ts decides when; the sky's blight level is its strength). */
export const BLIGHT_ASH: MotePreset = { color: snap(0xb9a6c8), size: 0.11, fall: 0.55, wind: 0.6, sway: 0.5, opacity: 0.75, density: 1 };

interface Base {
  /** The sub-palette the place is painted from (`AREA_PALETTES`). */
  look: AreaLook;
  motes: MotePreset | null;
}

/** An open-air place: a sky, a sun, and fog that follows the horizon. */
export interface OutdoorAtmosphere extends Base {
  indoor?: false;
  keys: LightKey[];
  /** Where the fog starts and ends on a clear day (meters). */
  fog: { near: number; far: number };
}

/** A roofed place: no sky or sun, a fixed dim fill and one dark fog (`Sky.setIndoor`). */
export interface IndoorAtmosphere extends Base {
  indoor: true;
  fog: FogLook;
  /** The soft overhead light (no shadows), and the hemisphere's sky and ground colours. */
  fill: { sun: number; sunI: number; hemi: number; ground: number; hemiI: number };
}

export type Atmosphere = OutdoorAtmosphere | IndoorAtmosphere;

/** `a` moved `t` (0–1) of the way to `b`, as a hex colour: how a place's mood is mixed from palette swatches. */
export function mix(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

const moon = pal('moon');

export const VALLEY: OutdoorAtmosphere = {
  look: 'valley',
  motes: null,
  fog: { near: 50, far: 215 }, // a close valley haze (owner's call, 2026-11-04)
  keys: lightKeys({
    night: { top: pal('night', 0), horizon: pal('night', 2), sun: moon, sunI: 0.8, hemiI: 0.95 },
    predawn: { top: pal('night', 1), horizon: pal('night', 3), sun: moon, sunI: 0.75, hemiI: 0.95 },
    dawn: { top: pal('moon', 0), horizon: pal('ember', 3), sun: pal('ember', 3), sunI: 1.3, hemiI: 0.8 },
    day: { top: pal('sky', 1), horizon: pal('sky', 3), sun: pal('chalk', 2), sunI: 2.6, hemiI: 1.12 },
    dusk: { top: pal('night', 3), horizon: pal('ember'), sun: pal('ember', 3), sunI: 1.3, hemiI: 0.8 },
    eve: { top: pal('night', 1), horizon: pal('blight', 1), sun: moon, sunI: 0.8, hemiI: 0.95 },
  }),
};

/** Thistledown and the land round it: a warm, hazy, closer afternoon; lamplit nights. */
export const VILLAGE: OutdoorAtmosphere = {
  look: 'village',
  motes: null,
  fog: { near: 42, far: 185 },
  keys: lightKeys({
    night: { top: pal('night', 0), horizon: mix(pal('night', 2), pal('plum'), 0.25), sun: moon, sunI: 0.8, hemiI: 1.0 },
    predawn: { top: pal('night', 1), horizon: mix(pal('night', 3), pal('rose', 1), 0.25), sun: moon, sunI: 0.75, hemiI: 1.0 },
    dawn: { top: pal('moon', 0), horizon: mix(pal('ember', 3), pal('straw', 3), 0.5), sun: pal('flame', 3), sunI: 1.3, hemiI: 0.85 },
    day: { top: pal('sky', 1), horizon: mix(pal('sky', 3), pal('straw', 3), 0.4), sun: mix(pal('chalk', 2), pal('flame', 3), 0.25), sunI: 2.5, hemiI: 1.15 },
    dusk: { top: mix(pal('night', 3), pal('plum'), 0.3), horizon: mix(pal('ember'), pal('flame', 3), 0.35), sun: pal('flame', 3), sunI: 1.3, hemiI: 0.85 },
    eve: { top: pal('night', 1), horizon: mix(pal('blight', 1), pal('ember', 1), 0.3), sun: moon, sunI: 0.8, hemiI: 1.0 },
  }),
};

/** Gloaming Hollow: a mossy dell under old trees, always a little dusk. Spirit lights drift up through it. */
export const HOLLOW: OutdoorAtmosphere = {
  look: 'hollow',
  motes: { color: pal('spirit', 3), size: 0.1, fall: -0.3, wind: 0.1, sway: 0.7, opacity: 0.7, density: 0.3 },
  fog: { near: 18, far: 100 },
  keys: lightKeys({
    night: { top: pal('night', 0), horizon: mix(pal('night', 2), pal('moss', 0), 0.4), sun: moon, sunI: 0.65, hemiI: 0.9 },
    predawn: { top: pal('night', 1), horizon: mix(pal('night', 3), pal('moss', 0), 0.45), sun: moon, sunI: 0.6, hemiI: 0.9 },
    dawn: { top: mix(pal('moon', 0), pal('moss', 0), 0.4), horizon: mix(pal('ember', 3), pal('moss', 1), 0.55), sun: pal('ember', 3), sunI: 1.0, hemiI: 0.75 },
    day: { top: mix(pal('sky', 1), pal('moss', 0), 0.45), horizon: mix(pal('sky', 3), pal('moss', 1), 0.55), sun: mix(pal('chalk', 2), pal('leaf', 3), 0.2), sunI: 1.7, hemiI: 1.0 },
    dusk: { top: mix(pal('night', 3), pal('moss', 0), 0.4), horizon: mix(pal('ember'), pal('moss', 1), 0.5), sun: pal('ember', 3), sunI: 1.0, hemiI: 0.75 },
    eve: { top: pal('night', 1), horizon: mix(pal('blight', 1), pal('moss', 0), 0.45), sun: moon, sunI: 0.65, hemiI: 0.9 },
  }),
};

/** The Waking Shrine: no sky, one dark fog, a cool dim fill; each room's own lights do the rest. Dust hangs in the air. */
export const SHRINE: IndoorAtmosphere = {
  look: 'shrine.sandstone', // each wing is painted from its own (`shrine.*`), via world/dungeon/decor.ts
  indoor: true,
  motes: { color: pal('chalk', 1), size: 0.07, fall: 0.04, wind: 0.05, sway: 0.15, opacity: 0.5, density: 0.4 },
  fog: { color: pal('ink', 1), near: 12, far: 52 },
  fill: { sun: pal('slate', 3), sunI: 0.45, hemi: pal('slate', 2), ground: pal('ink', 3), hemiI: 0.9 },
};

export const ATMOSPHERES: Record<AtmosphereId, Atmosphere> = { valley: VALLEY, village: VILLAGE, hollow: HOLLOW, shrine: SHRINE };

export const isIndoor = (id: AtmosphereId): id is IndoorId => !!ATMOSPHERES[id].indoor;

/** The light at one moment: what the sky and the lights are set to. */
export interface Sampled {
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemiI: number;
  near: number;
  far: number;
}

export const newSampled = (): Sampled => ({ top: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), sunI: 0, hemiI: 0, near: 0, far: 0 });

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
const FIELDS = ['top', 'horizon', 'sun'] as const;

/** `a`'s light at `hours`, added into `out` times `weight` (so blending is a sum of weighted samples). */
function addSample(a: OutdoorAtmosphere, hours: number, weight: number, out: Sampled) {
  const keys = a.keys;
  let i = 0;
  while (i < keys.length - 2 && hours > keys[i + 1].h) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const t = Math.min(1, Math.max(0, (hours - k0.h) / (k1.h - k0.h)));
  for (const f of FIELDS) {
    tmpA.set(k0[f]).lerp(tmpB.set(k1[f]), t);
    out[f].r += tmpA.r * weight;
    out[f].g += tmpA.g * weight;
    out[f].b += tmpA.b * weight;
  }
  out.sunI += (k0.sunI + (k1.sunI - k0.sunI) * t) * weight;
  out.hemiI += (k0.hemiI + (k1.hemiI - k0.hemiI) * t) * weight;
  out.near += a.fog.near * weight;
  out.far += a.fog.far * weight;
}

export type Weights = Partial<Record<OutdoorId, number>>;

/** The outdoor light at `hours`, blended from the atmospheres in `weights` (they need not sum to 1). */
export function blendLight(weights: Weights, hours: number, out: Sampled = newSampled()): Sampled {
  for (const f of FIELDS) out[f].setRGB(0, 0, 0);
  out.sunI = out.hemiI = out.near = out.far = 0;
  let total = 0;
  for (const id of Object.keys(weights) as OutdoorId[]) {
    const w = weights[id] ?? 0;
    if (w <= 0) continue;
    total += w;
    addSample(ATMOSPHERES[id] as OutdoorAtmosphere, hours, w, out);
  }
  if (total <= 0) return blendLight({ valley: 1 }, hours, out);
  if (total !== 1) {
    for (const f of FIELDS) out[f].multiplyScalar(1 / total);
    out.sunI /= total;
    out.hemiI /= total;
    out.near /= total;
    out.far /= total;
  }
  return out;
}

/** How fast one place's look gives way to the next as Wren crosses (1/s): about two seconds end to end. */
export const ATMOSPHERE_EASE = 1.5;

/** Moves `weights` toward `target` (it gains, the others fade); they keep summing to 1. */
export function easeWeights(weights: Weights, target: OutdoorId, dt: number): Weights {
  const k = 1 - Math.exp(-ATMOSPHERE_EASE * dt);
  const next: Weights = {};
  let sum = 0;
  for (const id of new Set([...(Object.keys(weights) as OutdoorId[]), target])) {
    const w = weights[id] ?? 0;
    const v = id === target ? w + (1 - w) * k : w * (1 - k);
    if (v > 0.001) {
      next[id] = v;
      sum += v;
    }
  }
  if ((next[target] ?? 0) > 0.999) return { [target]: 1 };
  for (const id of Object.keys(next) as OutdoorId[]) next[id] = next[id]! / sum;
  return next;
}

/** What drifts through the air right now and how strongly (0–1). */
export interface MoteLook {
  preset: MotePreset;
  level: number;
}

/**
 * The blight's ash wins while it lies on the valley; otherwise the place Wren is mostly in. A preset
 * fades in over the second half of a crossing (and out over the first), so two never overlap.
 * Indoors it is the room's own. Null: clear air.
 */
export function moteLook(weights: Weights, blight: number, indoor: IndoorAtmosphere | null): MoteLook | null {
  if (indoor) return indoor.motes ? { preset: indoor.motes, level: 1 } : null;
  if (blight > 0.01) return { preset: BLIGHT_ASH, level: blight };
  let best: { preset: MotePreset; w: number } | null = null;
  for (const id of Object.keys(weights) as OutdoorId[]) {
    const w = weights[id] ?? 0;
    const motes = ATMOSPHERES[id].motes;
    if (motes && w > 0.5 && (!best || w > best.w)) best = { preset: motes, w };
  }
  return best && { preset: best.preset, level: Math.min(1, (best.w - 0.5) * 2) };
}

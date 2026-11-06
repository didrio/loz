import { centerline, fbm, mix, smoothstep } from '../../core/math';
import type { TerrainRect } from './terrain';

/**
 * Sallowmere's map (docs/sallowmere.md, "The map"), as pure functions of (x, z) like `layout.ts`, which folds it
 * into `terrainHeight` with `carveMere`. A flooded river plain in a basin of hills north of the Waybell's canyon:
 * a switchback road down from the canyon's mouth, causeways on old embankments, shallows Wren wades, and deep
 * water (the old river channel, the field ditches, the bell trial's pool) that is a fall. The sites are footprints
 * the later tickets build on. +x is east, -z is north; heights are meters, with the water at `MERE_WATER`.
 */

/** The region's ground; it abuts the Northpass's rectangle at z -330. */
export const SALLOWMERE_RECT: TerrainRect = { x0: -190, x1: 190, z0: -550, z1: -330 };
/** The mere's flat surface (its own; the valley's is `WATER_Y`). */
export const MERE_WATER = 0;
/** Dry ground at the water's edge: the shore, islands and the Weir's forecourt. */
const SHORE = MERE_WATER + 1.2;
/** The open mere's floor: about 0.6 m under, so Wren wades (game/water.ts: shallow from 0.35, deep from 1.2). */
const FLOOR = MERE_WATER - 0.6;
/** The deep water's floor (the channel, the ditches, the trial's pool): well past a fall. */
const DEEP = MERE_WATER - 2.8;
/** The causeways' tops. */
const CAUSEWAY_TOP = MERE_WATER + 0.8;

/** The basin: a rounded rectangle; its edge (`basinSdf` 0) is the shore line, and hills rise outside it. */
const BASIN = { x: 0, z: -447, hx: 170, hz: 75, r: 35 };
/** Where the invisible wall rings the basin, m outside the shore: on the hills' crest, inside the region's rectangle. */
export const RIM_BOUNDS = 18;

export const STILTWICK = { x: -60, z: -425, r: 30 };
/** The Old Weir's wall across the basin's north end, its forecourt in front, ringed by the channel (only the ferry crosses). */
export const WEIR = { x: 22, z: -522, halfWidth: 32 };
export const FORECOURT = { x: 22, z: -508, r: 15 };
/** The Lightless Cut's dry apron at the foot of the northwest hills, where the north causeway ends. */
export const CUT = { x: -128, z: -512, r: 9 };
/** The bell trial's pool (T12): deep water east of the town, its course to be built over it. */
export const BELL_TRIAL = { x: 115, z: -420, r: 18 };
export const FARM = { x: 110, z: -385, r: 14 };
export const ISLANDS = [
  { id: 'willowIsle', x: -140, z: -395, r: 12 },
  { id: 'eastIsle', x: 70, z: -450, r: 10 },
] as const;
/** Where the canyon opens and the whole mere comes into view (the dev state stands here). */
export const OVERLOOK = { x: -10, z: -343, facing: Math.PI };

/** The switchback road from the canyon's end down onto the mere: its centerline and the road's height at each point. */
export const DESCENT = {
  path: [[-10, -324], [-10, -343], [30, -346], [38, -352], [30, -358], [-44, -361], [-52, -366], [-44, -371], [-14, -376], [-10, -384]] as [number, number][],
  heights: [12, 12, 9.2, 8.6, 8.0, 3.6, 3.1, 2.6, 1.4, 1.0],
  halfWidth: 3.2,
  reach: 9,
};
const descentLine = centerline(DESCENT.path);
export const descentFrame = descentLine.frame;
const descentOffsets = descentLine.segs.reduce<number[]>((o, g) => [...o, o[o.length - 1] + g.len], [0]);

/** The road's height `s` meters down the descent. */
export function descentY(s: number) {
  for (let i = 0; i < descentLine.segs.length; i++) {
    if (s <= descentOffsets[i + 1] || i === descentLine.segs.length - 1) {
      const t = Math.max(0, Math.min(1, (s - descentOffsets[i]) / descentLine.segs[i].len));
      return mix(DESCENT.heights[i], DESCENT.heights[i + 1], t);
    }
  }
  return DESCENT.heights[DESCENT.heights.length - 1];
}

/** The causeways (dry embankments): the descent's foot to Stiltwick, Stiltwick to the Cut, the shore road east to the farm. */
export const CAUSEWAYS: Record<string, [number, number][]> = {
  town: [[-10, -380], [-22, -402], [-34, -418]],
  north: [[-70, -452], [-95, -475], [-122, -505]],
  east: [[-10, -382], [40, -386], [96, -386]],
};
const causewayLines = Object.values(CAUSEWAYS).map(centerline);
const CAUSEWAY_HALF = 2.2;

/** The old river channel before the Weir: two arms run into the north hills, so the forecourt between them is cut off. */
export const CHANNEL = {
  path: [[-36, -536], [-34, -500], [-20, -488], [60, -486], [76, -498], [80, -536]] as [number, number][],
  halfWidth: 8,
  bank: 12,
};
const channelLine = centerline(CHANNEL.path);
export const channelFrame = channelLine.frame;

/** Drowned field ditches: deep and narrow, so the shallows have routes. */
export const DITCHES: [number, number][][] = [
  [[5, -398], [95, -404]],
  [[30, -412], [38, -474]],
];
const ditchLines = DITCHES.map(centerline);
const DITCH_HALF = 1.8;

/** Signed distance to the shore line, m: negative in the mere, positive up the hills. */
export function basinSdf(x: number, z: number) {
  const qx = Math.abs(x - BASIN.x) - (BASIN.hx - BASIN.r), qz = Math.abs(z - BASIN.z) - (BASIN.hz - BASIN.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - BASIN.r;
}

/** 1 in the south rim's middle, where the canyon opens: there the hills give way to a lower, longer slope the road goes down. */
function mouthWeight(x: number, z: number) {
  return smoothstep(70, 45, Math.abs(x + 8)) * smoothstep(BASIN.z + 30, BASIN.z + 60, z); // 0 outside MOUTH_SIDES
}

/** The open south slope's sides, x: the rim's wall leaves the slope between them out, and a wall on each runs south to the Northpass's end. */
export const MOUTH_SIDES = [-78, 62] as const;

/** True on the open south slope the road goes down (the rim's wall leaves it out). */
export function inMouth(x: number, z: number) {
  return mouthWeight(x, z) > 0;
}

/** 0 south of z -326, so the canyon and the Waybell keep their ground (the road alone reaches to -324); 1 from z -340 north. */
function northOfCanyon(z: number) {
  return smoothstep(-326, -340, z);
}

/** The mere's own land before the road: the basin's floor and features, and the hills around it. */
function mereLand(x: number, z: number) {
  const sdf = basinSdf(x, z);
  let h: number;
  if (sdf > 0) {
    const w = mouthWeight(x, z);
    const top = mix(24 + 12 * fbm(x * 0.03 + 7, z * 0.03 - 2), 11.4, w);
    h = SHORE + top * smoothstep(2, 2 + mix(20, 28, w), sdf);
  } else {
    h = mix(FLOOR + (fbm(x * 0.05 + 31, z * 0.05 + 9) - 0.5) * 0.3, SHORE, smoothstep(-8, 0, sdf));
  }
  for (const line of ditchLines) h = Math.min(h, mix(DEEP, h, smoothstep(DITCH_HALF, DITCH_HALF + 1.6, line.frame(x, z).d)));
  const dp = Math.hypot(x - BELL_TRIAL.x, z - BELL_TRIAL.z);
  h = Math.min(h, mix(DEEP, h, smoothstep(BELL_TRIAL.r - 3, BELL_TRIAL.r, dp)));
  for (const m of [...ISLANDS, FARM, FORECOURT, CUT]) {
    const top = SHORE + 0.4 * smoothstep(m.r, 0, Math.hypot(x - m.x, z - m.z));
    h = Math.max(h, mix(top, h, smoothstep(m.r * 0.7, m.r, Math.hypot(x - m.x, z - m.z))));
  }
  for (const line of causewayLines) h = Math.max(h, mix(CAUSEWAY_TOP, h, smoothstep(CAUSEWAY_HALF, CAUSEWAY_HALF + 2.4, line.frame(x, z).d)));
  return Math.min(h, mix(DEEP, h, smoothstep(CHANNEL.halfWidth, CHANNEL.bank, channelFrame(x, z).d)));
}

/** The land with Sallowmere carved in: the basin replaces the mountains near it, then the descent's road is cut. */
export function carveMere(h: number, x: number, z: number) {
  if (z > -324) return h;
  const zm = northOfCanyon(z);
  const m = zm * (1 - smoothstep(30, 55, basinSdf(x, z)));
  let out = m > 0 ? mix(h, mereLand(x, z), m) : h;
  // The road cuts through the canyon's closed end, so it starts a little further south than the basin does.
  const { d, s } = descentFrame(x, z);
  if (d < DESCENT.reach) out = mix(out, mix(descentY(s), out, smoothstep(DESCENT.halfWidth, DESCENT.reach, d)), smoothstep(-324, -330, z));
  return out;
}

/** On a causeway's or the descent's tread (the paint's packed earth). */
export function onMereRoad(x: number, z: number, slack = 0) {
  if (descentFrame(x, z).d < DESCENT.halfWidth - 0.6 + slack && z < -326) return true;
  return causewayLines.some((l) => l.frame(x, z).d < CAUSEWAY_HALF - 0.4 + slack);
}

/** Which of Sallowmere's places (x, z) is in, or null outside the region (the canyon's mouth is still the Northpass). */
export function mereNameAt(x: number, z: number): string | null {
  const r = SALLOWMERE_RECT;
  if (x < r.x0 || x > r.x1 || z < r.z0 || z > -336) return null;
  if (Math.hypot(x - STILTWICK.x, z - STILTWICK.z) < STILTWICK.r + 4) return 'Stiltwick';
  if (Math.hypot(x - WEIR.x, z - (WEIR.z + 8)) < 40) return 'The Old Weir';
  if (Math.hypot(x - CUT.x, z - CUT.z) < 22) return 'The Lightless Cut';
  return 'Sallowmere';
}

/**
 * `n` points round the basin `offset` m outside its shore (a ring of rays from the middle, each cut where the
 * distance reaches `offset`): the wall's corners.
 */
export function basinRing(offset: number, n: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let lo = 0, hi = 400;
    for (let k = 0; k < 40; k++) {
      const t = (lo + hi) / 2;
      if (basinSdf(BASIN.x + dx * t, BASIN.z + dz * t) < offset) lo = t;
      else hi = t;
    }
    pts.push([BASIN.x + dx * lo, BASIN.z + dz * lo]);
  }
  return pts;
}

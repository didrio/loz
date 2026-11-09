import * as THREE from 'three';
import { bevelBox, extrudePath, lathe, lowSphere, merge, paint, paintRegion, place, taper, wobble, type Vec3 } from '../kit';
import { fadeInFog } from '../materials';
import { pal } from '../palette';
import { spiralRidge } from './shrineThings';
import { Parts } from './village';
import type { Model } from './types';

/**
 * The Hall of Sleepers' dressing, final (T56c, golden set 8; docs/shrine.md "The final look"): the carved spiral reliefs, the
 * lintel carving over a doorway, the offering niches with their candles, the faded banners, the rubble and sand drifts at the
 * walls' feet, and the cracked and sunken flags. Visual only: no colliders, nothing to interact with.
 *
 * Wall pieces are built in the wall's frame like the sleeping face: the origin on the wall's inner face at floor level,
 * +z into the room, x along the wall. `world/dungeon/hallDressing.ts` lays them out and turns them to their walls.
 *
 * Two rules keep them out of the puzzle's way (a wakestone may be anywhere on the Hall's grid, 1.96 m tall, and reaches
 * 0.17 m into a wall's face, as it does into the shell's mouldings):
 * - Everything on the wall starts above the string course (`WALL_PIECE_LOW`, above the tallest stone and the course's top).
 * - What stands on the floor never reaches more than `FOOT_BAND` (0.15 m) from the wall (`intoTheWall` pushes a heap back
 *   into the wall until it does): the rubble and drifts are part of the wall's foot, as the plinth is.
 * Flat decals (cracks, a sunken flag) lie within 2 cm of the floor, where a stone slides over them.
 */

/** The string course tops out at 2.45 + 0.09 m; wall pieces start above it, so it never cuts through a niche or a relief. */
export const WALL_PIECE_LOW = 2.62;
/** Floor-standing dressing reaches no further than this from a wall's face (a stone already sinks 0.17 m into it). */
export const FOOT_BAND = 0.15;
/** The tallest wakestone (the heavy one). */
export const STONE_TOP = 1.96;

/** Wall pieces' widths along the wall (metres), for the layout. */
export const DRESSING = {
  relief: { width: 1.3, size: 1.3 },
  niche: { width: 1.1, height: 1.2 },
  banner: { width: 0.9 },
  /** The lintel carving's band is this much wider than the doorway. */
  lintelOver: 1.3,
} as const;

/** The glow materials the dressing shares (one set for the game; `HallDressing` breathes them). Unlit and additive: no real lights. */
export interface DressingGlow {
  /** The spirals' glow in the cuts. */
  spiral: THREE.MeshBasicMaterial;
  /** The candles' tongues. */
  flame: THREE.MeshBasicMaterial;
  /** The candles' near glow and the cluster's wide one. */
  halo: THREE.MeshBasicMaterial;
  wide: THREE.MeshBasicMaterial;
}

let glowMats: DressingGlow | null = null;

export function dressingGlow(): DressingGlow {
  if (!glowMats) {
    const additive = (color: number, opacity: number) => fadeInFog(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowMats = {
      spiral: additive(pal('teal', 2), 0.5),
      flame: fadeInFog(new THREE.MeshBasicMaterial({ color: pal('flame', 3) })),
      halo: additive(pal('flame', 2), 0.42),
      wide: additive(pal('flame', 2), 0.12),
    };
  }
  return glowMats;
}

type Glowing = Model<{ glow: THREE.Object3D }>;

/** The baked stone parts plus an unbaked glow group (the world keeps those out of the merge and merges them itself). */
function withGlow(parts: Parts, glow: THREE.Object3D, animated: THREE.Material[]): Glowing {
  const m = parts.model();
  m.root.add(glow);
  return { root: m.root, joints: { glow }, flashMats: [], animated };
}

const glowMesh = (g: THREE.BufferGeometry, material: THREE.Material) => new THREE.Mesh(g, material);

/** A chunk of stone: a chamfered block, dust on its top. */
const chunk = (w: number, h: number, d: number, colour: number, x: number, y: number, z: number, rot: Vec3, seed: number) =>
  place(paintRegion(wobble(paint(bevelBox(w, h, d, Math.min(0.045, h * 0.25)), colour), 0.012, seed), (_c, n) => (n.y > 0.8 ? pal('sand', 2) : undefined)), x, y, z, rot);

// ------------------------------------------------------------------------------------------------ the reliefs

/** The relief panel: bottom edge above the string course, square. */
export const RELIEF = { bottom: WALL_PIECE_LOW, size: 1.3 } as const;

/**
 * A carved panel for a wall: a chamfered frame, a sunk field, the shrine's spiral cut into it in dark stone with a faint
 * teal glow in the cut (the same spiral as the wakestones and Gravelheart's), four studs in the corners.
 */
export function buildSpiralRelief(): Glowing {
  const S = RELIEF.size, cy = RELIEF.bottom + S / 2;
  const parts = new Parts();
  parts.add('stone',
    place(paintRegion(wobble(paint(bevelBox(S, S, 0.12, 0.035), pal('stone', 1)), 0.006, 41), (_c, n) => (n.y > 0.8 ? pal('sand', 1) : undefined)), 0, cy, 0.04),
    place(paint(bevelBox(S - 0.26, S - 0.26, 0.05, 0.02), pal('stone', 2)), 0, cy, 0.1),
    place(paint(spiralRidge(0.4, 3.3, 12, 0.032), pal('stone', 0)), 0, cy, 0.14),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => place(paint(bevelBox(0.1, 0.1, 0.05, 0.015), pal('stone', 3)), sx * (S / 2 - 0.1), cy + sy * (S / 2 - 0.1), 0.1, [0, 0, Math.PI / 4]))),
  );
  const mats = dressingGlow();
  const glow = new THREE.Group();
  glow.add(glowMesh(place(paint(spiralRidge(0.4, 3.3, 12, 0.02), pal('teal', 2)), 0, cy, 0.158), mats.spiral));
  return withGlow(parts, glow, [mats.spiral]);
}

// ------------------------------------------------------------------------------------------------ the lintel

/** The carving's band: above the door frame's keystone (the frame is 3.2 m of opening and 0.58 m of lintel and keystone). */
export const LINTEL = { bottom: 3.92, height: 0.5 } as const;

/** A band of carving over a doorway, three spirals along it, centred on the doorway (`width`: the opening's). */
export function buildLintelCarving(width = 3): Glowing {
  const W = width + DRESSING.lintelOver, cy = LINTEL.bottom + LINTEL.height / 2;
  const parts = new Parts();
  const xs = [-(W / 2 - 0.42), 0, W / 2 - 0.42];
  parts.add('stone',
    place(paintRegion(wobble(paint(bevelBox(W, LINTEL.height, 0.12, 0.035), pal('stone', 1)), 0.006, 43), (_c, n) => (n.y > 0.8 ? pal('sand', 1) : undefined)), 0, cy, 0.04),
    place(paint(bevelBox(W - 0.12, 0.34, 0.05, 0.02), pal('stone', 2)), 0, cy, 0.1),
    ...xs.map((x) => place(paint(spiralRidge(0.15, 2.8, 8, 0.022), pal('stone', 0)), x, cy, 0.14)),
    ...[-1, 1].map((s) => place(paint(bevelBox(0.07, 0.07, 0.05, 0.01), pal('stone', 3)), s * (W / 4), cy, 0.12, [0, 0, Math.PI / 4])),
  );
  const mats = dressingGlow();
  const glow = new THREE.Group();
  glow.add(glowMesh(merge(...xs.map((x) => place(paint(spiralRidge(0.15, 2.8, 8, 0.014), pal('teal', 2)), x, cy, 0.158))), mats.spiral));
  return withGlow(parts, glow, [mats.spiral]);
}

// ------------------------------------------------------------------------------------------------ the niche

/** Where a niche's candles stand (in its frame): x along the wall, the candle's height. */
const CANDLES: readonly (readonly [number, number])[] = [[-0.36, 0.2], [-0.25, 0.3], [-0.13, 0.15], [0.02, 0.24]];
/** The shelf's top. */
const SHELF_TOP = WALL_PIECE_LOW + 0.1;

/**
 * An offering niche: a stone surround with an arched head, a dark back, a shelf with a cluster of candles and a bowl of
 * offerings. The candles' flames are unlit tongues with two halos (no real light); they and the glow breathe in the world.
 */
export function buildOfferingNiche(): Glowing {
  const H = DRESSING.niche.height, W = DRESSING.niche.width, top = WALL_PIECE_LOW + H;
  const parts = new Parts();
  const stone = pal('stone', 1);
  parts.add('stone',
    ...[-1, 1].map((s) => place(paintRegion(wobble(paint(bevelBox(0.16, H, 0.2, 0.03), stone), 0.008, 51 + s), (_c, n) => (n.y > 0.8 ? pal('sand', 1) : undefined)), s * 0.47, WALL_PIECE_LOW + H / 2, 0.08)),
    place(paintRegion(wobble(paint(bevelBox(W, 0.2, 0.2, 0.035), stone), 0.008, 55), (_c, n) => (n.y > 0.8 ? pal('sand', 1) : undefined)), 0, top - 0.1, 0.08),
    place(paint(bevelBox(0.78, 0.9, 0.04, 0.01), pal('ink', 2)), 0, WALL_PIECE_LOW + 0.55, 0.03),
    // The shelf.
    place(paintRegion(wobble(paint(bevelBox(1.0, 0.1, 0.4, 0.02), pal('stone', 2)), 0.006, 57), (_c, n) => (n.y > 0.8 ? pal('sand', 2) : undefined)), 0, SHELF_TOP - 0.05, 0.18),
  );
  // The candles, with a pool of wax at each foot, and the bowl with what was left in it.
  const candles: THREE.BufferGeometry[] = [];
  for (const [x, h] of CANDLES) {
    candles.push(place(paint(taper(0.04, 0.034, h, 5), pal('sand', 3)), x, SHELF_TOP, 0.2), place(paint(taper(0.07, 0.055, 0.02, 6), pal('sand', 2)), x, SHELF_TOP, 0.2));
  }
  const bowl = place(paint(lathe([[0, 0], [0.09, 0], [0.17, 0.07], [0.19, 0.11], [0.16, 0.115], [0.12, 0.075], [0, 0.06]], 7, false), pal('sand', 2)), 0.28, SHELF_TOP, 0.2);
  const offerings = [[0.23, 0.2], [0.31, 0.22], [0.27, 0.15]].map(([x, z], i) => place(paint(lowSphere(0.035, 5, 3), i === 1 ? pal('flame', 2) : pal('sand', 3)), x, SHELF_TOP + 0.085, z));
  parts.add('stone', ...candles, bowl, ...offerings);

  const mats = dressingGlow();
  const glow = new THREE.Group();
  const tip = (h: number) => SHELF_TOP + h;
  glow.add(
    glowMesh(merge(...CANDLES.map(([x, h]) => place(paint(taper(0.024, 0, 0.085, 4), pal('flame', 3)), x, tip(h) - 0.005, 0.2))), mats.flame),
    glowMesh(merge(...CANDLES.map(([x, h]) => place(paint(new THREE.IcosahedronGeometry(0.1, 0), pal('flame', 2)), x, tip(h) + 0.05, 0.2))), mats.halo),
    glowMesh(place(paint(new THREE.IcosahedronGeometry(0.34, 1), pal('flame', 2)), -0.18, SHELF_TOP + 0.3, 0.3), mats.wide),
  );
  return withGlow(parts, glow, [mats.flame, mats.halo, mats.wide]);
}

// ------------------------------------------------------------------------------------------------ the banner

/** The banner's rod: its height above the floor, and the cloth's full length from it. */
export const BANNER = { rod: 4.45, drop: 1.4 } as const;

/**
 * A faded, torn banner on a rod: a dusty-rose cloth with a pale band at the top and at the foot, the shrine's spiral worn
 * almost away between, the foot torn into tails (`variant` 0 to 2 tears it three ways). It hangs from above the string
 * course and stays 3 cm off the wall.
 */
export function buildBanner(variant = 0): Model {
  const w = DRESSING.banner.width - 0.14, top = BANNER.rod - 0.04, drop = BANNER.drop - 0.5;
  const cloth = pal('rose', 1), band = pal('sand', 2);
  const parts = new Parts();
  const wood = pal('stone', 1);
  parts.add('wood',
    place(paint(bevelBox(DRESSING.banner.width, 0.05, 0.05, 0.01), wood), 0, BANNER.rod, 0.1),
    ...[-1, 1].map((s) => place(paint(lowSphere(0.05, 5, 3), pal('stone', 0)), s * (DRESSING.banner.width / 2 + 0.02), BANNER.rod, 0.1)),
  );
  // The cloth: a body and three tails, each a flat slab 3 cm thick, a hair apart in depth so none lies in another's plane.
  const slab = (outline: [number, number][], z: number, colour: number, seed: number) =>
    wobble(paint(extrudePath(outline, [[0, 0, z], [0, 0, z + 0.03]]), colour), 0.008, seed);
  const cut = top - drop;
  // Tail lengths by variant (the cloth's foot, left to right): a long tatter, a stub, a middling one.
  const lens = [[0.32, 0.1, 0.22], [0.12, 0.34, 0.18], [0.22, 0.2, 0.36]][variant % 3];
  const thirds = [-w / 2, -w / 6, w / 6, w / 2];
  const bodies: THREE.BufferGeometry[] = [slab([[-w / 2, top], [w / 2, top], [w / 2, cut], [-w / 2, cut]], 0.05, cloth, 61 + variant)];
  lens.forEach((len, i) => {
    bodies.push(slab([[thirds[i], cut], [thirds[i + 1], cut], [(thirds[i] + thirds[i + 1]) / 2 + (i - 1) * 0.04, cut - len]], 0.05, cloth, 65 + i + variant));
  });
  // The pale bands (top, and above the foot) and the worn spiral.
  bodies.push(
    place(paint(bevelBox(w, 0.09, 0.045, 0.01), band), 0, top - 0.07, 0.07),
    place(paint(bevelBox(w, 0.05, 0.045, 0.01), band), 0, cut + 0.12, 0.07),
    place(paint(spiralRidge(0.13, 2.6, 7, 0.012), band), 0, top - 0.5, 0.075),
  );
  parts.add('cloth', ...bodies);
  return parts.model();
}

// ------------------------------------------------------------------------------------------------ the foot of the wall

/**
 * Pushes a floor heap back into its wall until none of it stands out more than `FOOT_BAND` (the part buried in the wall is
 * hidden by it), so a wakestone that sinks into the wall's face sinks into the heap and nothing else.
 */
function intoTheWall(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const over = g.boundingBox!.max.z - FOOT_BAND;
  return over > 0 ? place(g, 0, 0, -over) : g;
}

/** How much bigger the heap is along the wall and up than its blocks were drawn (its depth is limited by the band). */
export const RUBBLE_SCALE = 1.5;

/** `g` stretched along x and y by `k` (not z, the depth). */
function scaleAlong(g: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const out = place(g);
  out.applyMatrix4(new THREE.Matrix4().makeScale(k, k, 1));
  return out;
}

/**
 * Fallen blocks against the foot of a wall: a pile of broken stone, a few strays. Up to ~0.75 m tall and 2 m along the
 * wall; its depth is `FOOT_BAND`. `variant` turns and mirrors it.
 */
export function buildRubble(variant = 0): Model {
  const flip = variant % 2 ? -1 : 1, s = 41 + variant * 7;
  const colours = [pal('stone', 2), pal('sand', 1), pal('stone', 1), pal('sand', 2)];
  const c = (i: number) => colours[(i + variant) % colours.length];
  const pieces = [
    chunk(0.34, 0.2, 0.26, c(0), -0.25 * flip, 0.1, 0.1, [0, 0.3 * flip, 0], s),
    chunk(0.3, 0.26, 0.24, c(1), 0.1 * flip, 0.13, 0.08, [0, -0.5 * flip, 0.05], s + 1),
    chunk(0.22, 0.16, 0.2, c(2), 0.42 * flip, 0.08, 0.1, [0, 0.8 * flip, 0], s + 2),
    chunk(0.26, 0.2, 0.22, c(3), -0.05 * flip, 0.34, 0.07, [0.1, 0.6 * flip, 0.25 * flip], s + 3),
    chunk(0.18, 0.14, 0.16, c(0), 0.2 * flip, 0.3, 0.06, [0, 0.2, -0.2 * flip], s + 4),
    chunk(0.16, 0.12, 0.14, c(2), -0.2 * flip, 0.46, 0.05, [0.15, -0.4 * flip, 0.1], s + 5),
    chunk(0.1, 0.08, 0.1, c(1), 0.62 * flip, 0.04, 0.12, [0, 0.5, 0], s + 6),
    chunk(0.09, 0.07, 0.09, c(2), -0.55 * flip, 0.035, 0.1, [0, -0.3, 0], s + 7),
  ];
  const parts = new Parts();
  // Bigger than a first guess: at the foot of a 7 m wall a heap of 0.3 m blocks reads as crumbs.
  parts.add('stone', intoTheWall(scaleAlong(merge(...pieces), RUBBLE_SCALE)));
  return parts.model();
}

/** A drift of sand along a wall's foot, `length` long, tapering to nothing at both ends, `FOOT_BAND` deep and about 22 cm high. */
export function buildSandDrift(length = 2, variant = 0): Model {
  // The profile's x runs to the path's right, which for a path along +x is -z: so a drift out into the room has negative x.
  const profile: [number, number][] = [[0, 0], [-FOOT_BAND, 0], [-0.13, 0.05], [-0.08, 0.13], [-0.03, 0.2], [0, 0.22]];
  const n = 6, path: Vec3[] = Array.from({ length: n + 1 }, (_v, i) => [-length / 2 + (length * i) / n, 0, 0]);
  const swell = (t: number) => Math.max(0.18, Math.sin(Math.PI * t) ** 0.7) * (0.85 + 0.15 * Math.sin(t * 9 + variant * 2));
  const drift = wobble(paint(extrudePath(profile, path, swell), pal('sand', 3)), 0.008, 71 + variant);
  const parts = new Parts();
  parts.add('ground', intoTheWall(drift));
  return parts.model();
}

// ------------------------------------------------------------------------------------------------ the floor

/** How high the flat decals lie above the flags' tops. */
export const DECAL_H = 0.012;

/** A crack across a flag: a broken line of dark strips from the first point to the last (world coordinates; y: the floor). */
export function crackDecal(points: readonly (readonly [number, number])[], floorY: number, width = 0.035): THREE.BufferGeometry {
  const strips: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    strips.push(place(paint(bevelBox(len + width * 0.6, DECAL_H, width * (1 - 0.18 * i), 0), pal('stone', 0)), (x0 + x1) / 2, floorY + DECAL_H / 2, (z0 + z1) / 2, [0, -Math.atan2(z1 - z0, x1 - x0), 0]));
  }
  return merge(...strips);
}

/** A sunken flag: a darker square with a pale lip on its far two edges and a dark one on the near, as if it had dropped a finger. */
export function sunkenFlagDecal(cx: number, cz: number, size: number, floorY: number): THREE.BufferGeometry {
  const lip = 0.05, h = 0.01;
  return merge(
    place(paint(bevelBox(size, h * 0.6, size, 0), pal('stone', 1)), cx, floorY + h * 0.3, cz),
    place(paint(bevelBox(size, h, lip, 0), pal('stone', 0)), cx, floorY + h / 2 + 0.002, cz - size / 2 + lip / 2),
    place(paint(bevelBox(lip, h, size, 0), pal('stone', 0)), cx - size / 2 + lip / 2, floorY + h / 2 + 0.002, cz),
    place(paint(bevelBox(size, h, lip * 0.7, 0), pal('stone', 3)), cx, floorY + h / 2 + 0.002, cz + size / 2 - lip * 0.35),
    place(paint(bevelBox(lip * 0.7, h, size, 0), pal('stone', 3)), cx + size / 2 - lip * 0.35, floorY + h / 2 + 0.002, cz),
  );
}

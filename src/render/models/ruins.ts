import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { bevelBox, lowSphere, merge, paint, paintRegion, place, taper, wobble } from '../kit';
import { pal } from '../palette';
import type { Model } from './types';
import { box, Parts } from './village';

/**
 * A ruined home (T51c, the entrance vignette's last part; docs/art.md "The golden set"): what is left of one of
 * Thistledown's cottages after the blight, built from the same pieces as the standing ones (stone, plaster, the shingle
 * roof, charred timber). Every ruin shares one plan, so the world's colliders and this model read the same wall list
 * (`RUIN_WALLS`); `scale` grows the plan along its length and `flip` mirrors it, as the rough did. The frame is the
 * ruin's own: the origin is the middle of its floor on y = 0, the front (and the doorway) on +z, walls buried 0.6 m.
 *
 * The jars and the shield stay the world's (`world/jars.ts`, `ShieldPickup`), and so do the colliders. Nothing here is
 * seeded from the global random numbers: a ruin's rubble and wall-tops come from its scale and flip alone.
 */

/** A wall stretch `[ax, az, bx, bz, height]` in the plan's frame (m, before scale and flip). */
export type RuinWall = readonly [number, number, number, number, number];

/** The plan: tallest at the back, the front broken down low, a breach in the east wall, a doorway a little right of centre. */
export const RUIN_WALLS: readonly RuinWall[] = [
  [-3.5, -3, -1, -3, 3.0],
  [-1, -3, 1.6, -3, 2.4],
  [1.6, -3, 3.5, -3, 1.4],
  [-3.5, -2.8, -3.5, 1, 2.8],
  [-3.5, 1, -3.5, 3, 1.2],
  [3.5, -2.8, 3.5, -0.6, 2.2],
  [3.5, 1.3, 3.5, 3, 0.7], // the breach in the east wall is between these two
  [-3.5, 3, -0.4, 3, 1.9],
  [1.2, 3, 3.5, 3, 0.9], // the doorway is between these two
];
/** The wall's thickness (m): the colliders were measured from it. */
export const RUIN_WALL_T = 0.4;

const STONES = [pal('stone', 1), pal('stone', 2), pal('stone', 2), pal('stone', 3)];

export function buildRuin(scale: number, flip: 1 | -1): Model {
  const s = scale, f = flip;
  const rnd = mulberry32(Math.round(s * 100) * 7 + (f > 0 ? 1 : 2));
  const parts = new Parts();
  /** A point in the plan (scaled, mirrored) as world x, z of the model's frame. */
  const px = (lx: number) => lx * f * s;
  const pz = (lz: number) => lz * s;
  const char = pal('ink', 3), beam = pal('bark', 2);

  // The walls: a solid stone base to below the broken top, then chunks of uneven height with pale fresh breaks; a band of old
  // plaster on the inside face of the tall stretches, patched where the weather took it.
  for (const [ax, az, bx, bz, h] of RUIN_WALLS) {
    const len = Math.hypot(bx - ax, bz - az) * s;
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
    const baseTop = h - Math.min(0.5, h * 0.4);
    const [w, d] = along ? [len, RUIN_WALL_T] : [RUIN_WALL_T, len];
    parts.add('stone', paintRegion(paint(place(bevelBox(w, baseTop + 0.6, d, 0.03), px(mx), (baseTop - 0.6) / 2, pz(mz)), pal('stone', 2)), (c) => (c.y > baseTop - 0.45 ? STONES[Math.floor(rnd() * STONES.length)] : undefined)));
    const chunks = Math.max(2, Math.round(len / 0.85)), cw = len / chunks;
    for (let i = 0; i < chunks; i++) {
      // At least one chunk stands to the wall's full height, so the silhouette keeps its tallest points.
      const top = i === Math.floor(chunks / 2) ? h : baseTop + Math.max(0.12, (h - baseTop) * (0.25 + 0.7 * rnd()));
      const at = -len / 2 + cw * (i + 0.5);
      const [cx, cz] = along ? [px(mx) + at * f, pz(mz)] : [px(mx), pz(mz) + at];
      const [cwx, cwz] = along ? [cw - 0.04, d + 0.02] : [w + 0.02, cw - 0.04];
      parts.add('stone', paint(place(bevelBox(cwx, top - baseTop, cwz, 0), cx, (top + baseTop) / 2, cz), STONES[(i + 1) % STONES.length]));
    }
    if (h > 1.2) {
      const inward = along ? -Math.sign(mz) * 0.22 : -Math.sign(mx) * f * 0.22;
      const band = len - 0.2, start = rnd() * 0.25 * band, end = rnd() * 0.25 * band;
      const cover = band - start - end, hh = h - 0.7;
      const [bw, bd] = along ? [cover, 0.06] : [0.06, cover];
      const [ox, oz] = along ? [(start - end) / 2 * f, inward] : [inward, (start - end) / 2];
      parts.add('plaster', box(bw, hh, bd, pal('plaster', 1), px(mx) + ox, hh / 2 + 0.1, pz(mz) + oz));
    }
  }

  // Pale quoins up the corners, stacked and staggered, stopping where the lower of the two walls does.
  for (const [lx, lz, top] of [[-3.5, -3, 2.7], [3.5, -3, 1.3], [-3.5, 3, 1.1], [3.5, 3, 0.6]] as const) {
    for (let k = 0; k * 0.4 + 0.4 < top + 0.01; k++) {
      parts.add('stone', box(0.5 - (k % 2) * 0.08, 0.38, 0.5 - ((k + 1) % 2) * 0.08, pal('stone', 3), px(lx), k * 0.4 + 0.19, pz(lz)));
    }
  }

  // The floorboards, half rotted away: boards 0.6 m wide, some gone, some short.
  const floorLen = 5.6 * s;
  for (let i = 0; i < 11; i++) {
    if (i % 4 === 2) continue;
    const len = i % 3 === 1 ? floorLen * (0.4 + 0.3 * rnd()) : floorLen - 0.1;
    parts.add('wood', box(0.57, 0.12, len, pal('wood', i % 2 ? 1 : 2), (-3.3 + i * 0.66) * f * s, 0.06, -floorLen / 2 + len / 2));
  }

  // The doorway: a worn stone threshold and the charred jambs (and half a lintel) of the door that stood here.
  parts.add('stone', box(1.6 * s, 0.14, 0.7, pal('stone', 3), px(0.4), 0.07, pz(3.0) + 0.1, [0, 0, 0], 0.03));
  parts.add('wood',
    box(0.16, 1.9, 0.18, char, px(-0.4), 0.95, pz(3.0)),
    box(0.16, 1.2, 0.18, char, px(1.2), 0.6, pz(3.0)),
    box(0.9, 0.16, 0.18, char, px(1.2) - f * 0.4, 1.28, pz(3.0), [0, 0, 0.1 * f]),
  );

  // The chimney: a stone stack still standing on the back wall's tallest stretch, its top jagged.
  parts.add('stone', paintRegion(place(taper(0.5, 0.36, 1.5, 4), px(-2.2), 2.9, pz(-3.0), [0, Math.PI / 4, 0]), (c) => (c.y > 4.1 ? pal('stone', 3) : pal('stone', 2))));

  // The roof that came down on the west side: shingle slabs (two courses, patched) on charred rafters, leaning off the wall onto the
  // floor. Built flat about its middle, then turned and set where the rough's slab was.
  const slabW = 2.8 * s, slabD = 4.8 * s;
  const clay = [2, 3, 2, 1] as const;
  const roofPieces: THREE.BufferGeometry[] = [];
  for (const row of [-1, 1]) {
    const segs = row < 0 ? 3 : 2;
    for (let i = 0; i < segs; i++) {
      const sw = slabD / segs;
      roofPieces.push(box(slabW / 2 - 0.02, 0.18, sw - 0.03, pal('clay', clay[(i + (row > 0 ? 2 : 0)) % 4]), (row * slabW) / 4, 0.1, -slabD / 2 + sw * (i + 0.5)));
    }
  }
  const rafters = [-1.6, -0.55, 0.55, 1.6].map((z) => box(slabW + 0.5, 0.14, 0.14, beam, 0, -0.06, z * s));
  parts.add('shingle', place(merge(...roofPieces), px(-2.2), 1.45, pz(-0.6), [0, 0, -0.75 * f]));
  parts.add('wood', place(merge(...rafters), px(-2.2), 1.45, pz(-0.6), [0, 0, -0.75 * f]));
  // Charred rafters: one still spanning the back corner, one fallen across the doorway's threshold, one on the floor.
  parts.add('wood',
    place(box(0.22, 0.22, 4.2 * s, char, 0, 0, 0), px(-1.2), 2.7, pz(-1.2), [0.25, 0, 0.1 * f]),
    place(box(3.2 * s, 0.2, 0.22, char, 0, 0, 0), px(1.6), 0.18, pz(3.9), [0, 0.35 * f, 0.06]),
    place(box(0.2, 0.2, 2.4 * s, char, 0, 0, 0), px(2.4), 0.15, pz(-1.6), [0, 0.6 * f, 0]),
  );

  // Rubble from the broken walls, inside and out, and weeds in the lee of the walls.
  const rubble: [number, number, number][] = [[3.9, 0.3, 0.4], [4.3, -1.6, 0.25], [2.6, 3.6, 0.3], [-2.4, 3.6, 0.35], [-0.6, 3.5, 0.2], [2.9, -2.2, 0.3], [-4.1, 2.2, 0.3], [3.3, 0.5, 0.2], [-3.9, 1.0, 0.22]];
  rubble.forEach(([lx, lz, r], i) => {
    const stone = paint(wobble(lowSphere(r, 5, 3), r * 0.25, i + 1), STONES[i % STONES.length]);
    parts.add('rock', place(stone, px(lx), r * 0.5, pz(lz), [i, i * 2, 0]));
  });
  for (const [lx, lz] of [[3.9, 2.4], [1.9, 3.5], [-3.9, 3.4], [-0.9, -3.5], [4.0, -2.6]] as const) {
    parts.add('foliage', paint(place(lowSphere(0.28, 5, 3), px(lx), 0.12, pz(lz)), pal('grass', rnd() < 0.5 ? 1 : 2)));
  }
  return parts.model();
}

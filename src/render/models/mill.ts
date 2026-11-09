import * as THREE from 'three';
import { bevelBox, lathe, lowSphere, merge, paint, paintRegion, place } from '../kit';
import { pal } from '../palette';
import type { Model } from './types';
import { box, Parts, slab } from './village';

/**
 * Thistledown's windmill and Odo's stall (T51c, the entrance vignette's last part; docs/art.md "The golden set").
 *
 * **The mill** is the tower's outside (a 32-sided tapering shell with the doorway cut out, a stone foot, timber bands, four
 * windows, a shingled cap), the door's stone frame and step, the lamp bracket and cage beside the door, and the axle the sails
 * turn on. Its inside (the round room, Tobin's things, the door that swings) stays the world's. **The sails** are a second
 * model because they turn: the world rotates its root about the hub. Both keep the rough's frame: the tower stands on y = 0
 * at its axis with the door on +x, and `MILL_TOWER`'s radii, height and sides are passed in (the colliders were measured
 * from them, and `colliders.test.ts` freezes them).
 *
 * **The stall** is a counter with a front of planks, four posts, a striped awning with a scalloped edge, a shelf at the back
 * and Odo's wares. Its frame is the rough's: the counter runs along z centred on the origin, customers stand on +x, the
 * awning reaches back to x = -2.35.
 */

/** The tower's dimensions (world/overworld/layout.ts `MILL_TOWER`; a test keeps them equal). */
export interface MillTower {
  outer: number;
  inner: number;
  top: number;
  height: number;
  ceiling: number;
  sides: number;
  gap: number;
}

export const MILL_DEFAULT: MillTower = { outer: 4.8, inner: 3.9, top: 3.0, height: 11, ceiling: 3.4, sides: 32, gap: (Math.PI * 2) / 32 };
/** The doorway's top, and the height of the axle the sails turn on. */
export const MILL_DOOR_TOP = 2.6;
export const MILL_AXLE_Y = 9.5;
/** How long a sail arm is, from the hub. */
export const SAIL_LENGTH = 6.8;

/** The tower's radius (at the corners) at height `y`. */
export const millRadius = (t: MillTower, y: number) => t.outer + (t.top - t.outer) * (y / t.height);
/** Where the sails' hub stands in front of the tower (m from the axis, along +x): clear of the wall at the lowest tip and of the door's lintel. */
export const millHub = (t: MillTower) => millRadius(t, MILL_AXLE_Y) + 1.25;
/** Where the world's glowing lamp core hangs: beside the door, in the tower's frame. */
export const millLamp = (t: MillTower) => ({ x: millRadius(t, 2.35) + 0.35, y: 2.35, z: 1.45 });

/** Takes the triangles of the doorway out of a lathe piece: the facets either side of +x, below `top`. */
function cutDoorway(g: THREE.BufferGeometry, gap: number, top: number): THREE.BufferGeometry {
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
  const kept: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < 3; i++) {
      cx += pos.getX(t + i) / 3;
      cy += pos.getY(t + i) / 3;
      cz += pos.getZ(t + i) / 3;
    }
    if (Math.abs(Math.atan2(cz, cx)) < gap - 1e-4 && cy < top) continue;
    kept.push(t, t + 1, t + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of [['position', pos], ['normal', nor], ['color', col]] as const) {
    const arr = new Float32Array(kept.length * 3);
    kept.forEach((v, i) => {
      arr[i * 3] = attr.getX(v);
      arr[i * 3 + 1] = attr.getY(v);
      arr[i * 3 + 2] = attr.getZ(v);
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

/** A small window on the tower's wall: a dark pane in a stone surround, muntins, and a shutter hung open. */
function millWindow(parts: Parts, t: MillTower, facet: number, y: number, shutterSide: 1 | -1) {
  const a = ((facet + 0.5) / t.sides) * Math.PI * 2;
  const apothem = millRadius(t, y) * Math.cos(Math.PI / t.sides);
  const stone = pal('stone', 3), side = pal('stone', 2), trim = pal('wood', 1);
  const local = {
    stone: merge(
      box(0.74, 0.12, 0.2, stone, 0, 0.46, 0.06),
      box(0.8, 0.1, 0.3, stone, 0, -0.45, 0.1),
      ...[-1, 1].map((s) => box(0.12, 0.8, 0.2, side, s * 0.31, 0, 0.06)),
    ),
    wood: merge(
      box(0.5, 0.78, 0.06, pal('ink', 2), 0, 0, -0.02),
      box(0.04, 0.78, 0.05, trim, 0, 0, 0.03),
      box(0.5, 0.04, 0.05, trim, 0, 0, 0.03),
      box(0.26, 0.78, 0.05, pal('leaf', 2), shutterSide * 0.48, 0, 0.12, [0, shutterSide * 0.5, 0]),
    ),
  };
  const at = [Math.cos(a) * (apothem + 0.02), y, Math.sin(a) * (apothem + 0.02)] as const;
  parts.add('stone', place(local.stone, ...at, [0, Math.PI / 2 - a, 0]));
  parts.add('wood', place(local.wood, ...at, [0, Math.PI / 2 - a, 0]));
}

/** The cap: a faceted cone of shingles with an eave all round, a fascia ring and an iron finial. */
function millCap(parts: Parts, t: MillTower) {
  const rT = t.top, y = t.height, eave = rT + 0.8;
  const cone = paint(lathe([[rT - 0.3, y - 0.02], [eave, y - 0.02], [eave, y + 0.24], [rT * 0.8, y + 1.1], [rT * 0.5, y + 2.0], [rT * 0.22, y + 2.9], [0, y + 3.5]], 16, false), pal('clay', 2));
  const shades = [2, 1, 2, 3] as const;
  parts.add('shingle', paintRegion(cone, (c) => {
    if (c.y < y + 0.26 && Math.hypot(c.x, c.z) > rT + 0.4) return pal('bark', 2);
    const sector = Math.floor(((Math.atan2(c.z, c.x) + Math.PI) / (Math.PI * 2)) * 16);
    return pal('clay', shades[sector % 4]);
  }));
  parts.add('metal', paint(lathe([[0.05, y + 3.4], [0.05, y + 4.1]], 4, false), pal('slate', 0)), paint(place(lowSphere(0.12, 5, 3), 0, y + 4.1, 0), pal('slate', 0)));
}

/** The stone frame and step of the doorway, as the rough had them (the reveal and the door itself are the world's). */
function millDoor(parts: Parts, t: MillTower) {
  const x = t.outer + 0.05, frame = pal('stone', 2);
  for (const s of [-1, 1]) parts.add('stone', box(0.3, 2.5, 0.24, frame, x, 1.25, s * 0.96, [0, 0, 0], 0.03));
  parts.add('stone',
    box(0.3, 0.3, 2.16, frame, x, MILL_DOOR_TOP, 0, [0, 0, 0], 0.03),
    box(0.9, 0.18, 2.0, pal('stone', 3), t.outer + 0.45, 0.05, 0, [0, 0, 0], 0.03),
    box(0.5, 0.12, 2.4, pal('stone', 2), t.outer + 0.95, 0.02, 0, [0, 0, 0], 0.03),
  );
}

/** The lamp beside the door: a plate on the wall, an arm, a chain and an iron cage round the world's glowing core (0.3 × 0.38 × 0.3). */
function millLampBracket(parts: Parts, t: MillTower) {
  const { x, y, z } = millLamp(t), iron = pal('slate', 0);
  // The wall at that spot is a facet turned `phi` from +x; the plate sits flat on it.
  const phi = (Math.floor(Math.atan2(z, x) / (Math.PI * 2 / t.sides)) + 0.5) * (Math.PI * 2 / t.sides);
  const apothem = millRadius(t, 2.6) * Math.cos(Math.PI / t.sides);
  const wallX = (apothem - z * Math.sin(phi)) / Math.cos(phi);
  parts.add('wood',
    place(box(0.1, 0.5, 0.24, pal('bark', 2), 0, 0, 0), wallX + 0.02, y + 0.27, z, [0, -phi, 0]),
    box(x - wallX + 0.1, 0.07, 0.07, pal('bark', 2), (wallX + x + 0.1) / 2, y + 0.3, z),
    box(0.06, 0.07, 0.07, pal('bark', 1), (wallX + x) / 2 - 0.1, y + 0.18, z, [0, 0, Math.PI / 4]),
  );
  parts.add('metal',
    box(0.02, 0.08, 0.02, iron, x, y + 0.27, z),
    box(0.4, 0.04, 0.4, iron, x, y + 0.22, z),
    box(0.4, 0.04, 0.4, iron, x, y - 0.22, z),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.035, 0.46, 0.035, iron, x + sx * 0.19, y, z + sz * 0.19))),
  );
}

/** The axle the sails turn on: a timber shaft out of the wall, an iron collar and a bearing block. */
function millAxle(parts: Parts, t: MillTower) {
  const hub = millHub(t), wall = millRadius(t, MILL_AXLE_Y);
  parts.add('wood',
    paint(place(lathe([[0.25, 0], [0.25, hub - wall + 0.9]], 8), wall - 0.9, MILL_AXLE_Y, 0, [0, 0, -Math.PI / 2]), pal('bark', 2)),
    box(0.5, 1.1, 1.3, pal('wood', 1), wall + 0.1, MILL_AXLE_Y - 0.05, 0, [0, 0, 0], 0.03),
  );
  parts.add('metal', paint(place(lathe([[0.32, 0], [0.32, 0.18]], 8), hub - 0.55, MILL_AXLE_Y, 0, [0, 0, -Math.PI / 2]), pal('slate', 1)));
}

/** The windmill's outside. */
export function buildMill(t: MillTower = MILL_DEFAULT): Model {
  const parts = new Parts();
  const r = (y: number) => millRadius(t, y);
  // The stone foot, then the plaster shell (its doorway cut), with the splash zone darker at the bottom and the top paler.
  const foot = paintRegion(paint(lathe([[t.outer + 0.3, 0], [t.outer + 0.3, 0.6], [t.outer + 0.02, 0.78]], t.sides, false), pal('stone', 2)), (c) =>
    Math.floor(((Math.atan2(c.z, c.x) + Math.PI) / (Math.PI * 2)) * t.sides) % 2 ? pal('stone', 1) : pal('stone', 2));
  parts.add('stone', cutDoorway(foot, t.gap, MILL_DOOR_TOP));
  const shell = paintRegion(paint(lathe([[r(0.5), 0.5], [r(1.6), 1.6], [r(MILL_DOOR_TOP), MILL_DOOR_TOP], [r(9.8), 9.8], [r(t.height), t.height]], t.sides, false), pal('plaster', 2)), (c) =>
    c.y < 1.5 ? pal('plaster', 1) : c.y > 9.7 ? pal('plaster', 3) : undefined);
  parts.add('plaster', cutDoorway(shell, t.gap, MILL_DOOR_TOP));
  // Timber bands round the tower: under the ceiling, mid-way and under the cap.
  for (const y of [3.7, 6.4, 9.0]) {
    const lo = y - 0.13, hi = y + 0.13;
    parts.add('wood', paint(lathe([[r(lo) - 0.02, lo], [r(lo) + 0.1, lo], [r(hi) + 0.1, hi], [r(hi) - 0.02, hi]], t.sides, false), pal('bark', 2)));
  }
  millCap(parts, t);
  millDoor(parts, t);
  millLampBracket(parts, t);
  millAxle(parts, t);
  // Windows low (facing north, west, south) and high (staggered), never over the sails or the door.
  for (const [facet, y, side] of [[8, 5.2, 1], [16, 5.2, -1], [24, 5.2, 1], [6, 8.0, -1], [14, 8.0, 1], [22, 8.0, -1]] as const) millWindow(parts, t, facet, y, side);
  return parts.model();
}

/**
 * The sails: four arms about the +x axis from the hub at the origin, each a timber stock with a lattice frame on one side and
 * canvas between its slats (the two outermost gaps left open), the whole sail twisted a little as a real one is. The world
 * rotates the root about x.
 */
export function buildMillSails(): Model {
  const parts = new Parts();
  const stock = pal('bark', 2), slat = pal('wood', 1);
  const arm = (): { wood: THREE.BufferGeometry[]; cloth: THREE.BufferGeometry[] } => {
    const wood = [box(0.2, SAIL_LENGTH - 0.5, 0.26, stock, 0, 0.5 + (SAIL_LENGTH - 0.5) / 2, 0)];
    const cloth: THREE.BufferGeometry[] = [];
    const y0 = 1.5, y1 = 6.5, gaps = 8, step = (y1 - y0) / gaps;
    // The frame: a long rail on the far edge, a slat at every gap, and the canvas between slats.
    wood.push(box(0.1, y1 - y0 + 0.1, 0.1, slat, 0, (y0 + y1) / 2, 1.65), box(0.1, y1 - y0 + 0.1, 0.1, slat, 0, (y0 + y1) / 2, 0.08));
    for (let j = 0; j <= gaps; j++) wood.push(box(0.1, 0.1, 1.7, slat, 0, y0 + j * step, 0.86));
    for (let j = 0; j < gaps - 2; j++) cloth.push(box(0.03, step - 0.1, 1.46, pal('chalk', j % 2 ? 1 : 2), 0, y0 + (j + 0.5) * step, 0.86));
    return { wood, cloth };
  };
  for (let i = 0; i < 4; i++) {
    const { wood, cloth } = arm();
    // Twist the sail about its stock, then turn the arm about the axis.
    const set = (list: THREE.BufferGeometry[]) => place(place(merge(...list), 0, 0, 0, [0, 0.16, 0]), 0, 0, 0, [(i * Math.PI) / 2, 0, 0]);
    parts.add('wood', set(wood));
    parts.add('cloth', set(cloth));
  }
  // The hub: a faceted drum on the axle with an iron cap.
  parts.add('wood', paint(lowSphere(0.6, 8, 4), pal('bark', 1)));
  parts.add('metal', paint(place(lathe([[0.3, 0], [0.34, 0.12], [0, 0.2]], 8), 0.5, 0, 0, [0, 0, -Math.PI / 2]), pal('slate', 1)));
  return parts.model();
}

// ------------------------------------------------------------------------------------------------------ the stall

/** The counter's height, and the awning's. The counter's top is at 1.07 m (the world's collider is 1.1 m). */
const COUNTER_TOP = 1.07;

/** Odo's stall. */
export function buildStall(): Model {
  const parts = new Parts();
  const plank = pal('wood', 2), plank2 = pal('wood', 1), post = pal('bark', 2);
  // The counter: a body with a front of planks and battens, a top with a lip on the customers' side.
  parts.add('wood',
    box(0.86, 0.98, 2.56, plank, 0, 0.49, 0, [0, 0, 0], 0.03),
    box(1.0, 0.1, 2.8, pal('wood', 3), 0, 1.02, 0, [0, 0, 0], 0.03),
    box(0.05, 0.06, 2.8, plank2, 0.5, COUNTER_TOP + 0.03, 0),
    ...[-1.1, -0.37, 0.37, 1.1].map((z) => box(0.06, 0.9, 0.12, plank2, 0.44, 0.5, z)),
    box(0.06, 0.1, 2.5, plank2, 0.44, 0.1, 0),
  );
  // The four posts, with cross beams along the top and braces on the back pair.
  for (const dz of [-1.35, 1.35]) for (const dx of [-1.9, 0.6]) parts.add('wood', box(0.12, 2.9, 0.12, post, dx, 1.45, dz, [0, 0, 0], 0.015));
  for (const dx of [-1.9, 0.6]) parts.add('wood', box(0.12, 0.14, 2.82, post, dx, 2.82, 0));
  for (const dz of [-1.35, 1.35]) parts.add('wood', box(2.6, 0.12, 0.12, post, -0.65, 2.76, dz));
  for (const dz of [-1, 1]) parts.add('wood', box(0.08, 0.7, 0.08, post, -1.9, 2.4, dz * 1.35 - dz * 0.0, [dz * 0.7, 0, 0]));
  // The awning: stripes of blue and cream cloth, pitched down toward the customers, with a scalloped edge hanging off the front.
  const pitch = 0.1, stripes = 8, w = 3.4, d = 3.2;
  const awning: THREE.BufferGeometry[][] = [[], []];
  for (let i = 0; i < stripes; i++) {
    const z = -d / 2 + (i + 0.5) * (d / stripes);
    awning[i % 2].push(box(w, 0.1, d / stripes - 0.01, i % 2 ? pal('chalk', 1) : pal('water', 1), 0, 0, z));
  }
  const tilt = [0, 0, -pitch] as const;
  parts.add('cloth', place(merge(...awning[0]), -0.65, 2.96, 0, tilt), place(merge(...awning[1]), -0.65, 2.96, 0, tilt));
  const frontX = -0.65 + (w / 2) * Math.cos(pitch) + 0.02, frontY = 2.96 - (w / 2) * Math.sin(pitch) - 0.1;
  for (let i = 0; i < stripes; i++) {
    const z = -d / 2 + (i + 0.5) * (d / stripes), half = d / stripes / 2;
    parts.add('cloth', slab([[z - half, frontY], [z, frontY - 0.3], [z + half, frontY]], 'x', frontX, 0.04, i % 2 ? pal('chalk', 1) : pal('water', 1)));
  }
  // A shelf on the back posts, with jars on it.
  parts.add('wood', box(0.34, 0.06, 2.5, plank2, -1.85, 1.75, 0), box(0.34, 0.06, 2.5, plank2, -1.85, 2.25, 0));
  const jar = (r: number, h: number, color: number, x: number, y: number, z: number) =>
    paint(place(lathe([[r * 0.7, 0], [r, h * 0.35], [r * 0.9, h * 0.8], [r * 0.5, h], [r * 0.55, h * 1.1]], 6), x, y, z), color);
  parts.add('stone',
    jar(0.12, 0.3, pal('clay', 2), -1.85, 1.78, -0.9), jar(0.1, 0.24, pal('leaf', 2), -1.85, 1.78, -0.5), jar(0.13, 0.32, pal('amber', 2), -1.85, 1.78, 0.2),
    jar(0.1, 0.26, pal('stone', 3), -1.85, 1.78, 0.75), jar(0.11, 0.28, pal('clay', 1), -1.85, 2.28, -0.7), jar(0.12, 0.3, pal('azure', 1), -1.85, 2.28, 0.4),
  );
  // The wares on the counter: a stack of folded cloth, three jars, a loaf, and a little board with a price scratched on it.
  parts.add('cloth', box(0.5, 0.14, 0.6, pal('slate', 2), 0, COUNTER_TOP + 0.07, -0.7, [0, 0.08, 0], 0.02), box(0.46, 0.1, 0.56, pal('slate', 3), 0, COUNTER_TOP + 0.19, -0.7, [0, -0.06, 0], 0.02));
  parts.add('stone',
    jar(0.13, 0.3, pal('clay', 2), 0, COUNTER_TOP, 0.1), jar(0.13, 0.3, pal('leaf', 2), 0, COUNTER_TOP, 0.45), jar(0.13, 0.3, pal('amber', 2), 0, COUNTER_TOP, 0.8),
  );
  parts.add('wood',
    paint(place(bevelBox(0.34, 0.14, 0.2, 0.05), 0.12, COUNTER_TOP + 0.07, 1.12, [0, 0.4, 0]), pal('earth', 3)),
    box(0.04, 0.3, 0.34, pal('wood', 3), 0.38, COUNTER_TOP + 0.15, 1.15, [0, 0, -0.3]),
  );
  return parts.model();
}

import * as THREE from 'three';
import { bevelBox, gradient, lathe, merge, paint, place, taper, wobble } from '../kit';
import { pal } from '../palette';
import { Parts } from './village';
import type { Model } from './types';

/**
 * The shrine's shell, final (T56a, golden set 8; docs/shrine.md "The final look"): the sandstone wing's floor tiles, its
 * walls' plinth, string course, cornice and corner pilasters, its ceiling beams and its pillars. The dungeon builder
 * (`world/dungeon/build.ts`) keeps every collider and the plain wall faces; these are the forms laid on and around them,
 * in world coordinates, merged with the rest of the floor's static scenery. So they carry no `crevice` and no `gradient`
 * (the merge shades and ramps them, docs/pipeline.md "Kit scenery").
 *
 * Nothing here reaches into a room more than a wall-side wakestone already does (a stone at a wall overlaps the wall's
 * face by 0.17 m) below the string course, and the course itself runs above the tallest stone, so a stone never slides
 * through a moulding.
 */

/** The dungeon's measures the shell fits (world/dungeon/format.ts and build.ts own them; `build.test.ts` keeps these equal). */
export const SHELL_DEFAULTS = { wallT: 0.5, floorT: 0.5, roomHeight: 7, cell: 2 } as const;

/** The shell's own measures (metres). */
export const SHELL = {
  /** Floor tiles' thickness: the slab under them sinks by this, so the seams between tiles show it. */
  tileT: 0.06,
  /** Half the seam between two tiles. */
  tileGap: 0.022,
  plinthH: 0.4,
  /** The string course: its height above the floor (centre), its height and how far it stands proud of the wall. */
  courseY: 2.45, courseH: 0.18, courseOut: 0.12,
  corniceH: 0.44, corniceOut: 0.26,
  /** Corner pilasters: 3 cm prouder than the course they cross, so no two faces coincide. */
  pierW: 0.6, pierOut: 0.15,
  beamH: 0.42, beamW: 0.42, beamEvery: 4,
} as const;

/** A wing's shell colours (decor.ts `THEMES` holds them; the floor gets a few tones of its own). */
export interface ShellColours {
  /** The floor's flags (each a shade darker or not, picked by its cell, never by the shared random numbers). */
  floor: number;
  wall: number;
  trim: number;
  ceiling: number;
  pillar: number;
}

/** The Sleeping Halls (floor 0): warm sandstone walls over grey-brown flags, a darker trim. */
export const SANDSTONE: ShellColours = {
  floor: pal('stone', 2),
  wall: pal('sand', 1),
  trim: pal('stone', 1),
  ceiling: pal('stone', 0),
  pillar: pal('sand', 2),
};

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Only the triangles that look up (a floor tile's top and chamfers: its sides and bottom are never seen). */
function upOnly(g: THREE.BufferGeometry, minY = 0.2): THREE.BufferGeometry {
  const pos = g.attributes.position, col = g.attributes.color;
  const keep: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    if (n.y > minY) keep.push(i, i + 1, i + 2);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of [['position', pos], ['normal', g.attributes.normal], ['color', col]] as const) {
    const arr = new Float32Array(keep.length * 3);
    keep.forEach((v, k) => arr.set([attr.getX(v), attr.getY(v), attr.getZ(v)], k * 3));
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

/** A fixed hash of a cell's corner (so the floor never changes between builds), 0 to 1. */
function cellHash(x: number, z: number, salt = 0) {
  const h = (Math.imul(Math.round(x * 10) + salt, 73856093) ^ Math.imul(Math.round(z * 10), 19349663)) >>> 0;
  return ((h >>> 7) % 1024) / 1024;
}

/** Each flag's shade: most as they are, some a step or two darker, so the floor reads as laid stones, not one sheet. */
const FLAG_SHADES = [1, 1, 0.95, 0.9, 0.86] as const;

/**
 * Floor flags on the 2 m grid that starts at `origin` (the room's corner: the wakestones' grid), clipped to `piece` (a
 * part of the floor with the pits and stair holes cut out), their tops at `y` (where Wren walks: the colliders' top).
 * Each is a chamfered slab, a few millimetres lower here and there, a shade darker here and there (`FLAG_SHADES`).
 */
export function floorTiles(piece: Rect, origin: { x: number; z: number }, y: number, colour: number, cell: number = SHELL_DEFAULTS.cell) {
  const out: THREE.BufferGeometry[] = [];
  const g = SHELL.tileGap;
  for (let cx = origin.x + Math.floor((piece.x - origin.x) / cell) * cell; cx < piece.x + piece.w - 1e-6; cx += cell) {
    for (let cz = origin.z + Math.floor((piece.z - origin.z) / cell) * cell; cz < piece.z + piece.d - 1e-6; cz += cell) {
      const x0 = Math.max(cx, piece.x), x1 = Math.min(cx + cell, piece.x + piece.w);
      const z0 = Math.max(cz, piece.z), z1 = Math.min(cz + cell, piece.z + piece.d);
      if (x1 - x0 < 0.2 || z1 - z0 < 0.2) continue;
      const shade = FLAG_SHADES[Math.floor(cellHash(cx, cz) * FLAG_SHADES.length)];
      const sink = cellHash(cx, cz, 7) < 0.3 ? 0.008 : 0;
      const w = x1 - x0 - 2 * g, d = z1 - z0 - 2 * g;
      const flag = gradient(paint(bevelBox(w, SHELL.tileT, d, 0.03), colour), shade, shade);
      out.push(place(upOnly(flag), (x0 + x1) / 2, y - SHELL.tileT / 2 - sink, (z0 + z1) / 2));
    }
  }
  return out.length ? merge(...out) : null;
}

/** Which way a wall runs: `x` along x (a north or south wall, at z = `line`), `z` along z (at x = `line`). */
export type WallOrient = 'x' | 'z';

/**
 * A moulding along a wall's face: from `a` to `b` along the wall, standing `out` proud of the face on the room's `side`
 * (+1 or -1 across the wall), from `y0` up `h`. Its back is buried 0.1 m in the wall so no crack shows.
 */
export function moulding(orient: WallOrient, line: number, side: 1 | -1, a: number, b: number, y0: number, h: number, out: number, colour: number, wallT: number = SHELL_DEFAULTS.wallT, bevel = 0.035) {
  const depth = out + 0.1, across = line + side * (wallT / 2 + out - depth / 2), along = (a + b) / 2, len = b - a;
  const geo = paint(orient === 'x' ? bevelBox(len, h, depth, bevel) : bevelBox(depth, h, len, bevel), colour);
  return orient === 'x' ? place(geo, along, y0 + h / 2, across) : place(geo, across, y0 + h / 2, along);
}

/** The plinth course at a wall's foot: the rough's trim box (both faces, 0.06 m proud), chamfered. */
export function plinth(orient: WallOrient, line: number, a: number, b: number, fy: number, colour: number, wallT: number = SHELL_DEFAULTS.wallT) {
  const len = b - a, t = wallT + 0.12;
  const geo = paint(orient === 'x' ? bevelBox(len, SHELL.plinthH, t, 0.04) : bevelBox(t, SHELL.plinthH, len, 0.04), colour);
  return orient === 'x' ? place(geo, (a + b) / 2, fy + SHELL.plinthH / 2, line) : place(geo, line, fy + SHELL.plinthH / 2, (a + b) / 2);
}

/** The string course on one face of a wall span (above every wakestone). */
export const course = (orient: WallOrient, line: number, side: 1 | -1, a: number, b: number, fy: number, colour: number, wallT?: number) =>
  moulding(orient, line, side, a, b, fy + SHELL.courseY - SHELL.courseH / 2, SHELL.courseH, SHELL.courseOut, colour, wallT, 0.03);

/**
 * The cornice under a room's ceiling along one wall, two steps deep. A room's x walls run into its corners; its z walls
 * (`butt`) stop each step where the x walls' same step stands, so no two pieces overlap (no flicker) and no notch is left.
 */
export function cornice(orient: WallOrient, line: number, side: 1 | -1, a: number, b: number, top: number, colour: number, wallT: number = SHELL_DEFAULTS.wallT, butt = false) {
  const h = SHELL.corniceH, out = SHELL.corniceOut;
  const step = (y0: number, sh: number, so: number, bevel: number) => moulding(orient, line, side, a + (butt ? so : 0), b - (butt ? so : 0), y0, sh, so, colour, wallT, bevel);
  return merge(step(top - h, h * 0.45, out * 0.55, 0.03), step(top - h * 0.55, h * 0.55, out, 0.04));
}

/** A room's inner faces: where its walls' faces stand (the wall lines sit on the room's edges). */
export const innerOf = (r: Rect, wallT: number = SHELL_DEFAULTS.wallT) => ({ x0: r.x + wallT / 2, x1: r.x + r.w - wallT / 2, z0: r.z + wallT / 2, z1: r.z + r.d - wallT / 2 });

/** The cornice round a whole room (`top`: its ceiling's underside). */
export function roomCornice(r: Rect, top: number, colour: number, wallT: number = SHELL_DEFAULTS.wallT) {
  const i = innerOf(r, wallT);
  return merge(
    cornice('x', r.z, 1, i.x0, i.x1, top, colour, wallT),
    cornice('x', r.z + r.d, -1, i.x0, i.x1, top, colour, wallT),
    cornice('z', r.x, 1, i.z0, i.z1, top, colour, wallT, true),
    cornice('z', r.x + r.w, -1, i.z0, i.z1, top, colour, wallT, true),
  );
}

/**
 * A pilaster in each inner corner, from the plinth up to the cornice: one leaf on each wall, the x wall's into the corner,
 * the z wall's beside it (they never overlap). `clear(orient, line, a, b)` says whether that stretch of wall is free (no
 * doorway); a corner whose leaves aren't both free gets none.
 */
export function cornerPiers(r: Rect, fy: number, height: number, colour: number, clear: (orient: WallOrient, line: number, a: number, b: number) => boolean, wallT: number = SHELL_DEFAULTS.wallT) {
  const i = innerOf(r, wallT), W = SHELL.pierW, out = SHELL.pierOut, y0 = fy + SHELL.plinthH - 0.02, h = height - SHELL.corniceH - SHELL.plinthH + 0.04;
  const pieces: THREE.BufferGeometry[] = [];
  for (const [zLine, zSide, zFace] of [[r.z, 1, i.z0], [r.z + r.d, -1, i.z1]] as const) {
    for (const [xLine, xSide, xFace] of [[r.x, 1, i.x0], [r.x + r.w, -1, i.x1]] as const) {
      // The x wall's leaf: from the corner along x; the z wall's: from the x leaf's face along z.
      const xa = xSide > 0 ? xFace : xFace - W, xb = xSide > 0 ? xFace + W : xFace;
      const za = zSide > 0 ? zFace + out : zFace - out - W, zb = zSide > 0 ? zFace + out + W : zFace - out;
      if (!clear('x', zLine, Math.min(xa, xb) - 0.3, Math.max(xa, xb) + 0.3) || !clear('z', xLine, Math.min(za, zb) - 0.3, Math.max(za, zb) + 0.3)) continue;
      pieces.push(moulding('x', zLine, zSide, xa, xb, y0, h, out, colour, wallT, 0.035), moulding('z', xLine, xSide, za, zb, y0, h, out, colour, wallT, 0.035));
    }
  }
  return pieces.length ? merge(...pieces) : null;
}

/**
 * Beams under a room's ceiling, across its shorter span, about every `SHELL.beamEvery` metres; a beam that would cross a
 * hole in the ceiling (a stair shaft, a drop) is left out. `top`: the ceiling's underside.
 */
export function ceilingBeams(r: Rect, top: number, colour: number, holes: readonly Rect[], wallT: number = SHELL_DEFAULTS.wallT) {
  const i = innerOf(r, wallT), alongX = r.w <= r.d; // beams run along x when the room is longer in z
  const span = alongX ? r.d : r.w, n = Math.max(1, Math.round(span / SHELL.beamEvery) - 1);
  const pieces: THREE.BufferGeometry[] = [];
  for (let k = 1; k <= n; k++) {
    const at = (alongX ? r.z : r.x) + (span * k) / (n + 1);
    const rect: Rect = alongX ? { x: r.x, z: at - SHELL.beamW / 2, w: r.w, d: SHELL.beamW } : { x: at - SHELL.beamW / 2, z: r.z, w: SHELL.beamW, d: r.d };
    if (holes.some((h) => h.x < rect.x + rect.w && rect.x < h.x + h.w && h.z < rect.z + rect.d && rect.z < h.z + h.d)) continue;
    const len = alongX ? i.x1 - i.x0 : i.z1 - i.z0;
    const g = paint(alongX ? bevelBox(len, SHELL.beamH, SHELL.beamW, 0.05) : bevelBox(SHELL.beamW, SHELL.beamH, len, 0.05), colour);
    pieces.push(alongX ? place(g, (i.x0 + i.x1) / 2, top - SHELL.beamH / 2, at) : place(g, at, top - SHELL.beamH / 2, (i.z0 + i.z1) / 2));
  }
  return pieces.length ? merge(...pieces) : null;
}

/**
 * A pillar, `h` tall on y = 0 at the origin, around the rough's octagonal shaft (radius `rad` at the top, 1.1× at the foot:
 * the collider's): a square base (the rough's trim box), a collar, the shaft, a flared capital and a square abacus under
 * the ceiling. Shaft in `colour`, base and capital in `trim`.
 */
export function pillar(rad: number, h: number, colour: number, trim: number, seed = 1) {
  const base = place(paint(bevelBox(rad * 2.6, 0.4, rad * 2.6, 0.05), trim), 0, 0.2, 0);
  const collar = place(paint(bevelBox(rad * 2.2, 0.18, rad * 2.2, 0.04), trim), 0, 0.49, 0);
  const shaftH = h - 0.58 - 0.62;
  const shaft = place(wobble(paint(taper(rad * 1.1, rad, shaftH, 8), colour), 0.015, seed), 0, 0.58, 0, [0, Math.PI / 8, 0]);
  const flare = place(paint(lathe([[rad * 0.98, 0], [rad * 1.12, 0.16], [rad * 1.4, 0.37]], 8, false), trim), 0, h - 0.62, 0, [0, Math.PI / 8, 0]);
  const abacus = place(paint(bevelBox(rad * 2.5, 0.25, rad * 2.5, 0.05), trim), 0, h - 0.125, 0);
  return merge(base, collar, shaft, flare, abacus);
}

/** A sample of the sandstone shell for the registry, the viewer and the contact sheet: a corner of a room, 6 × 4 m. */
export function buildShrineCorner(): Model {
  const r: Rect = { x: -3, z: -2, w: 6, d: 4 }, h = SHELL_DEFAULTS.roomHeight, wallT = SHELL_DEFAULTS.wallT, c = SANDSTONE;
  const parts = new Parts();
  // Two walls (the back and the left), their faces as the world builds them: plain boxes in the wall colour.
  parts.add('stone', place(paint(bevelBox(r.w + wallT, h, wallT, 0), c.wall), 0, h / 2, r.z), place(paint(bevelBox(wallT, h, r.d + wallT, 0), c.wall), r.x, h / 2, 0));
  parts.add('stone', plinth('x', r.z, r.x - wallT / 2, r.x + r.w, 0, c.trim), plinth('z', r.x, r.z, r.z + r.d, 0, c.trim));
  parts.add('stone', course('x', r.z, 1, r.x + wallT / 2, r.x + r.w, 0, c.trim), course('z', r.x, 1, r.z + wallT / 2 + SHELL.courseOut, r.z + r.d, 0, c.trim));
  const i = innerOf(r);
  parts.add('stone', cornice('x', r.z, 1, i.x0, r.x + r.w, h, c.trim), cornice('z', r.x, 1, i.z0, r.z + r.d + SHELL.corniceOut, h, c.trim, wallT, true));
  // The corner's pilaster, as `cornerPiers` makes it.
  const W = SHELL.pierW, out = SHELL.pierOut, y0 = SHELL.plinthH - 0.02, ph = h - SHELL.corniceH - SHELL.plinthH + 0.04;
  parts.add('stone', moulding('x', r.z, 1, i.x0, i.x0 + W, y0, ph, out, c.trim), moulding('z', r.x, 1, i.z0 + out, i.z0 + out + W, y0, ph, out, c.trim));
  const tiles = floorTiles(r, { x: r.x, z: r.z }, 0, c.floor);
  if (tiles) parts.add('rock', tiles);
  parts.add('stone', place(pillar(0.45, h, c.pillar, c.trim), 1.2, 0, 0.6));
  return parts.model();
}

/** A pillar alone, as the Nave's stand (radius 0.7, a room's height). */
export function buildShrinePillar(): Model {
  const parts = new Parts();
  parts.add('stone', pillar(0.7, SHELL_DEFAULTS.roomHeight, SANDSTONE.pillar, SANDSTONE.trim));
  return parts.model();
}

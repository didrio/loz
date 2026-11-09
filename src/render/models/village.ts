import * as THREE from 'three';
import { bakeRig } from '../bakeRig';
import { bevelBox, extrudePath, kitMesh, lathe, lowSphere, merge, paint, paintRegion, place, taper, type Vec3 } from '../kit';
import { pal } from '../palette';
import type { SurfaceId } from '../textures';
import { FLOWER_COLOURS } from './nature';
import type { Model } from './types';

/**
 * Thistledown's buildings and props (T51b, the entrance vignette; docs/art.md "The golden set"): the two standing cottages,
 * the well, the fence, the lantern post, the barrel and the crate. All of it is static scenery that the world merges
 * (`world/overworld/village.ts`), so it carries no `crevice` (the merge shades it like everything around it), and every
 * piece keeps the rough's frame: a cottage's walls, plinth, door and windows stand exactly where the colliders were
 * measured (`world/overworld/colliders.test.ts` freezes them), only the roof, the trim and the touches are new.
 *
 * A cottage's local frame: centred on x and z, standing on y = 0 (its plinth), the door on the +z face.
 */

/** Pieces gathered by surface; `model()` builds one kit mesh per surface and bakes them (they merge again in the world). */
export class Parts {
  private bins = new Map<SurfaceId | '', THREE.BufferGeometry[]>();

  add(surface: SurfaceId | '', ...pieces: THREE.BufferGeometry[]) {
    const list = this.bins.get(surface);
    if (list) list.push(...pieces);
    else this.bins.set(surface, [...pieces]);
  }

  model(): Model {
    const root = new THREE.Group();
    for (const [surface, pieces] of this.bins) root.add(kitMesh(merge(...pieces), surface || undefined));
    return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
  }
}

/** A painted box (`bevel` 0 is a plain 12-triangle one) at (x, y, z), optionally turned. */
export const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, rotation: Vec3 = [0, 0, 0], bevel = 0) =>
  place(paint(bevelBox(w, h, d, bevel), color), x, y, z, rotation);

/** A solid triangle (or any convex outline `[x, y]`) of thickness `depth`, standing across `axis`, centred on `at` along it. */
export function slab(outline: readonly (readonly [number, number])[], axis: 'x' | 'z', at: number, depth: number, color: number) {
  const a = at - depth / 2, b = at + depth / 2;
  return paint(extrudePath(outline, axis === 'x' ? [[a, 0, 0], [b, 0, 0]] : [[0, 0, a], [0, 0, b]]), color);
}

// ------------------------------------------------------------------------------------------------ the cottages

export type CottageStyle = 'east' | 'southwest';

/** The cottage's footprint and wall height: frozen by the colliders. */
export const COTTAGE = { w: 10.5, d: 9, h: 3.6 } as const;
/** Where the two windows are (they glow at night, so the world builds them itself, as unique meshes, at these spots). */
export const COTTAGE_WINDOW = { x: COTTAGE.w / 3.2, y: 1.9, size: 0.9 } as const;
/** The z of the front wall's face. */
export const FRONT = COTTAGE.d / 2;

const EAVE = 0.9, GABLE_OVER = 0.55, ROOF_T = 0.22;
const RUN = COTTAGE.d / 2 + EAVE;
const Y_EAVE = COTTAGE.h - 0.3, Y_RIDGE = COTTAGE.h + 2.4;
const RISE = Y_RIDGE - Y_EAVE;
const PITCH = Math.atan2(RISE, RUN);
const SLOPE = Math.hypot(RUN, RISE);

const STYLES = {
  east: { wall: pal('plaster', 2), roof: [2, 2, 3, 2, 1] as const, roofHue: 'clay' as const },
  southwest: { wall: pal('straw', 3), roof: [2, 1, 2, 2, 1] as const, roofHue: 'slate' as const },
};

/** The gable roof: two courses of shingle slabs (a few patched in a shade), a ridge cap, the fascia boards. */
function roof(parts: Parts, style: CottageStyle) {
  const { roof: shades, roofHue } = STYLES[style];
  const len = COTTAGE.w + 2 * GABLE_OVER, seg = len / shades.length;
  const cz = RUN / 2 - (ROOF_T / 2) * Math.sin(PITCH), cy = (Y_EAVE + Y_RIDGE) / 2 - (ROOF_T / 2) * Math.cos(PITCH);
  for (const side of [1, -1]) {
    shades.forEach((shade, i) => {
      parts.add('shingle', box(seg, ROOF_T, SLOPE + 0.04, pal(roofHue, shade), -len / 2 + seg * (i + 0.5), cy, side * cz, [side * PITCH, 0, 0]));
    });
    // The fascia along the eave, and a bargeboard up each gable edge.
    parts.add('wood', box(len, 0.28, 0.07, pal('bark', 2), 0, Y_EAVE - 0.1, side * (RUN + 0.02)));
    for (const end of [-1, 1]) parts.add('wood', box(0.08, ROOF_T + 0.1, SLOPE + 0.1, pal('bark', 2), end * (len / 2 + 0.02), cy, side * cz, [side * PITCH, 0, 0]));
  }
  parts.add('shingle', box(len + 0.1, 0.26, 0.26, pal(roofHue, 1), 0, Y_RIDGE - 0.02, 0, [Math.PI / 4, 0, 0]));
}

/** The timber gable ends: a plank panel under the roof with a king post, rafters, a collar and a tie beam. */
function gables(parts: Parts) {
  const base = COTTAGE.h - 0.1, apex = Y_RIDGE - ROOF_T / Math.cos(PITCH);
  const hw = (apex - base) / Math.tan(PITCH), rafter = Math.hypot(hw, apex - base);
  const beam = pal('bark', 2);
  for (const end of [-1, 1]) {
    const face = end * (COTTAGE.w / 2 + 0.12);
    parts.add('wood', slab([[-hw, base], [hw, base], [0, apex]], 'x', end * (COTTAGE.w / 2), 0.24, pal('wood', 2)));
    const x = face + end * 0.05;
    parts.add('wood',
      box(0.08, apex - base, 0.16, beam, x, (apex + base) / 2, 0),
      box(0.08, 0.16, hw * 2, beam, x, base + 0.1, 0),
      box(0.08, 0.14, hw * 2 * (1 - 1.2 / (apex - base)), beam, x, base + 1.2, 0),
      ...[1, -1].map((s) => box(0.08, 0.16, rafter, beam, x, (apex + base) / 2, (s * hw) / 2, [s * PITCH, 0, 0])),
    );
  }
}

/** The tapered stone chimney through the back slope, with a capped top. */
function chimney(parts: Parts) {
  const x = COTTAGE.w / 4, z = -COTTAGE.d / 5;
  const foot = Y_RIDGE - Math.abs(z) * Math.tan(PITCH) - 0.5;
  const stack = paintRegion(place(taper(0.5, 0.36, 7.0 - foot, 4), x, foot, z, [0, Math.PI / 4, 0]), (c) => (c.y > 6.1 ? pal('stone', 3) : pal('stone', 2)));
  parts.add('stone', stack, box(0.84, 0.16, 0.84, pal('stone', 3), x, 7.0 + 0.08, z, [0, 0, 0], 0.03));
}

/** The door: stone frame and step, plank door with iron straps and a knob. Same size and place as the rough's (1.44 × 2.26 m). */
function door(parts: Parts) {
  const z = FRONT + 0.1, frame = pal('stone', 2), strap = pal('bark', 1);
  for (const s of [-1, 1]) parts.add('stone', box(0.22, 2.5, 0.3, frame, s * 0.83, 1.25, z, [0, 0, 0], 0.03));
  parts.add('stone', box(1.88, 0.3, 0.32, frame, 0, 2.55, z, [0, 0, 0], 0.03), box(2.0, 0.18, 0.8, pal('stone', 3), 0, 0.09, z + 0.4, [0, 0, 0], 0.03));
  parts.add('wood', box(1.44, 2.26, 0.14, pal('wood', 1), 0, 1.27, z + 0.04));
  for (const px of [-0.36, 0, 0.36]) parts.add('wood', box(0.04, 2.26, 0.16, strap, px, 1.27, z + 0.05));
  for (const py of [0.5, 2.0]) parts.add('wood', box(1.2, 0.08, 0.17, strap, 0, py, z + 0.05));
  parts.add('metal', paint(place(lowSphere(0.07, 5, 3), 0.5, 1.1, z + 0.14), pal('amber', 2)));
}

/** A window's trim: head, side boards and a cross of muntins over the glass (the glass itself is the world's unique mesh). */
function windowTrim(parts: Parts, x: number, sill: boolean) {
  const { y, size } = COTTAGE_WINDOW, trim = pal('wood', 1), z = FRONT;
  parts.add('wood',
    box(size + 0.2, 0.12, 0.18, trim, x, y + size / 2 + 0.07, z + 0.09),
    ...[-1, 1].map((s) => box(0.1, size, 0.14, trim, x + s * (size / 2 + 0.05), y, z + 0.07)),
    box(0.05, size, 0.06, trim, x, y, z + 0.12),
    box(size, 0.05, 0.06, trim, x, y, z + 0.12),
  );
  if (sill) parts.add('wood', box(size + 0.3, 0.1, 0.28, trim, x, y - size / 2 - 0.05, z + 0.12));
}

/** East: a tidy, cheerful house: green shutters, flower boxes under the windows, a bench by the door. */
function eastTouches(parts: Parts) {
  const shutter = pal('leaf', 2), boxWood = pal('wood', 1);
  const { x: wx, y } = COTTAGE_WINDOW;
  for (const s of [-1, 1]) {
    for (const side of [-1, 1]) parts.add('wood', box(0.4, 1.0, 0.08, shutter, s * wx + side * 0.68, y, FRONT + 0.08, [0, 0, 0], 0.02));
    parts.add('wood', box(1.2, 0.28, 0.4, boxWood, s * wx, 1.32, FRONT + 0.22, [0, 0, 0], 0.03));
    parts.add('foliage', box(1.08, 0.12, 0.3, pal('grass', 1), s * wx, 1.5, FRONT + 0.22));
    for (let i = 0; i < 5; i++) {
      parts.add('foliage', paint(place(lowSphere(0.11, 4, 2), s * wx - 0.44 + i * 0.22, 1.6, FRONT + 0.22), [FLOWER_COLOURS[2], FLOWER_COLOURS[1], FLOWER_COLOURS[0], FLOWER_COLOURS[2], FLOWER_COLOURS[3]][i]));
    }
  }
  // Pale quoins up the corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.add('stone', box(0.34, COTTAGE.h, 0.34, pal('stone', 3), sx * (COTTAGE.w / 2), COTTAGE.h / 2, sz * (COTTAGE.d / 2), [0, 0, 0], 0.03));
  // The bench to the right of the door (its collider is 1.8 × 0.5 at 2.0, 5.05).
  const bz = 5.05;
  parts.add('wood', box(1.8, 0.1, 0.5, boxWood, 2.0, 0.5, bz, [0, 0, 0], 0.02), ...[-1, 1].map((s) => box(0.1, 0.45, 0.4, boxWood, 2.0 + s * 0.75, 0.25, bz)));
}

/** Southwest: an older, busier house: dark timber framing, a porch roof, herbs drying under it, a woodpile. */
function southwestTouches(parts: Parts) {
  const beam = pal('bark', 2), z = FRONT + 0.06;
  parts.add('wood', box(10.6, 0.2, 0.08, beam, 0, 3.0, z), box(10.6, 0.2, 0.08, beam, 0, 0.55, z));
  for (const px of [-5.1, -1.6, 1.6, 5.1]) parts.add('wood', box(0.2, 2.5, 0.08, beam, px, 1.8, z));
  for (const s of [-1, 1]) parts.add('wood', box(0.16, 2.2, 0.08, beam, s * 4.55, 1.8, z + 0.01, [0, 0, s * 0.62]));
  // The porch: a lean-to roof of slate on two posts (colliders at x ±1.3, z 6.0).
  parts.add('shingle',
    box(2.9, 0.14, 1.8, pal('slate', 2), 0, 2.95, 5.3, [0.25, 0, 0]),
    box(2.9, 0.1, 0.1, pal('slate', 1), 0, 2.83, 6.2, [0.25, 0, 0]),
  );
  for (const s of [-1, 1]) parts.add('wood', box(0.14, 2.8, 0.14, beam, s * 1.3, 1.4, 6.0, [0, 0, 0], 0.02));
  parts.add('wood', box(2.74, 0.12, 0.14, beam, 0, 2.78, 6.0));
  // Herbs drying under the porch roof.
  for (const px of [-0.9, -0.55, 0.9]) {
    parts.add('wood', box(0.03, 0.3, 0.03, beam, px, 2.58, 5.6));
    parts.add('foliage', paint(place(lathe([[0, 0], [0.12, 0.34]], 5), px, 2.2, 5.6), px < 0 ? pal('grass', 2) : pal('straw', 2)));
  }
  // A woodpile against the east side wall: three rows of logs, pale cut ends (its collider is 1.6 × 1.6 at 6.1, -0.6).
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const log = place(lathe([[0.18, -0.8], [0.18, 0.8]], 5), 6.1, 0.2 + row * 0.33, -1.2 + (i + row * 0.5) * 0.38, [0, 0, Math.PI / 2]);
      parts.add('wood', paintRegion(paint(log, pal('wood', 2)), (_c, n) => (Math.abs(n.x) > 0.9 ? pal('wood', 3) : undefined)));
    }
  }
}

/**
 * A standing cottage of Thistledown. Walls, plinth, door and windows keep the rough's size and place; the roof is a gable
 * with deep eaves and timber gable ends, a tapered stone chimney, and each house adds its own touches. The glass is not
 * part of the model: the world places the two glowing panes itself.
 */
export function buildCottage(style: CottageStyle): Model {
  const { w, d, h } = COTTAGE;
  const parts = new Parts();
  parts.add('plaster', box(w, h, d, STYLES[style].wall, 0, h / 2, 0, [0, 0, 0], 0.1));
  parts.add('stone', paintRegion(paint(place(bevelBox(w + 0.3, 0.4, d + 0.3, 0.06), 0, 0.2, 0), pal('stone', 1)), (_c, n) => (n.y > 0.7 ? pal('stone', 2) : undefined)));
  roof(parts, style);
  gables(parts);
  chimney(parts);
  door(parts);
  for (const s of [-1, 1]) windowTrim(parts, s * COTTAGE_WINDOW.x, style === 'southwest');
  if (style === 'east') eastTouches(parts);
  else southwestTouches(parts);
  return parts.model();
}

// ---------------------------------------------------------------------------------------------------- the well

/** Where the well's lid ends and its curb begins (m from its axis): the shaft, the curb's wall and the apron. */
const SHAFT_R = 1.15;

/**
 * The village well: a paved apron round a stone curb over the shaft (the world keeps the shaft's dark inside and the water),
 * two posts under a small gable roof, a windlass with a crank, and a bucket on its rope. Stands on y = 0 at the shaft's axis.
 */
export function buildWell(): Model {
  const parts = new Parts();
  const flags = (c: THREE.Vector3) => {
    const sector = Math.floor(((Math.atan2(c.z, c.x) + Math.PI) / (Math.PI * 2)) * 12);
    return (sector + (Math.hypot(c.x, c.z) > 2.2 ? 1 : 0)) % 2 ? pal('stone', 3) : pal('stone', 2);
  };
  parts.add('stone', paintRegion(lathe([[3.3, 0], [3.1, 0.07], [SHAFT_R, 0.07]], 12, false), flags));
  parts.add('stone', paintRegion(lathe([[1.5, 0.05], [1.5, 1.0], [1.6, 1.1], [1.12, 1.1]], 10, false), (_c, n) => (n.y > 0.9 ? pal('stone', 3) : pal('stone', 2))));
  // The posts, the windlass between them, the crank at one end.
  const wood = pal('bark', 2);
  for (const s of [-1, 1]) parts.add('wood', box(0.2, 2.15, 0.2, wood, s * 1.2, 2.02, 0));
  parts.add('wood',
    place(paint(lathe([[0.1, -1.25], [0.1, 1.25]], 6), pal('wood', 2)), 0, 2.2, 0, [0, 0, Math.PI / 2]),
    box(0.06, 0.5, 0.06, pal('bark', 1), 1.42, 2.0, 0),
    box(0.06, 0.06, 0.34, pal('bark', 1), 1.42, 1.76, 0.14),
    box(0.03, 0.8, 0.03, pal('straw', 2), 0, 1.8, 0),
    place(paint(lathe([[0, 1.05], [0.17, 1.05], [0.24, 1.38], [0.2, 1.38]], 6, false), pal('wood', 1)), 0, 0, 0),
  );
  // The little gable roof: ridge along z, slopes toward the posts.
  const run = 1.9, rise = 0.8, pitch = Math.atan2(rise, run), t = 0.12;
  const slope = Math.hypot(run, rise), cx = run / 2 - (t / 2) * Math.sin(pitch), cy = 3.1 + rise / 2 - (t / 2) * Math.cos(pitch);
  for (const s of [-1, 1]) parts.add('shingle', box(slope + 0.04, t, 2.5, pal('clay', 2), s * cx, cy, 0, [0, 0, -s * pitch]));
  parts.add('shingle', box(0.2, 0.2, 2.6, pal('clay', 1), 0, 3.1 + rise - 0.02, 0, [0, 0, Math.PI / 4]));
  for (const s of [-1, 1]) parts.add('wood', slab([[-1.75, 3.06], [1.75, 3.06], [0, 3.1 + rise - 0.16]], 'z', s * 1.1, 0.1, pal('wood', 2)));
  return parts.model();
}

// ------------------------------------------------------------------------------------------- fence, lantern, clutter

/** A fence post: 1.3 m of timber from 0.1 m under its ground to 1.2 m over it, a four-sided cap. */
export function fencePost(): THREE.BufferGeometry {
  const body = box(0.22, 1.3, 0.22, pal('wood', 2), 0, 0.55, 0, [0, 0, 0], 0.025);
  const cap = paint(place(lathe([[0.17, 1.2], [0, 1.34]], 4), 0, 0, 0, [0, Math.PI / 4, 0]), pal('wood', 3));
  return merge(body, cap);
}

/** A fence rail between two posts, `len` long along z, centred, its cut ends pale. */
export function fenceRail(len: number): THREE.BufferGeometry {
  return paintRegion(paint(bevelBox(0.1, 0.12, len, 0.015), pal('wood', 2)), (_c, n) => (Math.abs(n.z) > 0.9 ? pal('wood', 3) : undefined));
}

/** The rail heights above the ground between two posts (the world draws two). */
export const FENCE_RAILS = [0.5, 1.0] as const;
/** A fence panel's length (m): the gap between two posts. */
export const FENCE_SPAN = 2.6;

/** One fence section: a post and the two rails that run from it along +z. */
export function buildFenceSection(): Model {
  const parts = new Parts();
  parts.add('wood', fencePost());
  for (const y of FENCE_RAILS) parts.add('wood', place(fenceRail(FENCE_SPAN), 0, y, FENCE_SPAN / 2));
  return parts.model();
}

/**
 * A lantern post: a stone foot, a tapered timber post, an iron cage round the lantern's core and a hood over it. The glowing
 * core (a 0.45 × 0.55 × 0.45 box at 2.75 m) is the world's own mesh, because it glows at night; the cage is open around it.
 */
export function buildLanternPost(): Model {
  const parts = new Parts();
  const iron = pal('slate', 0);
  parts.add('stone', box(0.4, 0.3, 0.4, pal('stone', 2), 0, 0.15, 0, [0, 0, 0], 0.04));
  parts.add('wood', place(paint(taper(0.12, 0.085, 2.25, 6), pal('bark', 2)), 0, 0.3, 0));
  parts.add('metal',
    box(0.58, 0.06, 0.58, iron, 0, 2.45, 0),
    box(0.58, 0.06, 0.58, iron, 0, 3.05, 0),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.05, 0.62, 0.05, iron, sx * 0.265, 2.75, sz * 0.265))),
    paint(place(lowSphere(0.06, 4, 2), 0, 3.4, 0), iron),
  );
  parts.add('shingle', paint(place(lathe([[0.5, 3.03], [0, 3.38]], 4), 0, 0, 0, [0, Math.PI / 4, 0]), pal('bark', 1)));
  return parts.model();
}

/** A barrel, 1 m tall and 0.96 across at the belly: eight staves, two iron hoops, a pale lid. */
export function buildBarrel(): Model {
  const parts = new Parts();
  const belly = lathe([[0.38, 0], [0.45, 0.2], [0.48, 0.5], [0.45, 0.8], [0.38, 1.0]], 8);
  parts.add('wood', paintRegion(paint(belly, pal('wood', 2)), (_c, n) => (n.y > 0.9 ? pal('wood', 3) : undefined)));
  for (const [r, y] of [[0.455, 0.2], [0.455, 0.8]] as const) {
    parts.add('metal', paint(lathe([[r + 0.025, y - 0.05], [r + 0.025, y + 0.05]], 8, false), pal('ink', 3)));
  }
  return parts.model();
}

/** A crate, 0.9 m a side: a box of planks in a frame of battens with a diagonal brace on two faces. */
export function buildCrate(): Model {
  const parts = new Parts();
  const frame = pal('wood', 3);
  parts.add('wood', box(0.86, 0.86, 0.86, pal('wood', 2), 0, 0.45, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.add('wood', box(0.1, 0.9, 0.1, frame, sx * 0.4, 0.45, sz * 0.4));
  for (const y of [0.05, 0.85]) for (const s of [-1, 1]) {
    parts.add('wood', box(0.9, 0.1, 0.1, frame, 0, y, s * 0.4), box(0.1, 0.1, 0.9, frame, s * 0.4, y, 0));
  }
  for (const s of [-1, 1]) parts.add('wood', box(0.08, 1.0, 0.04, frame, 0, 0.45, s * 0.44, [0, 0, s * Math.PI / 4]));
  return parts.model();
}

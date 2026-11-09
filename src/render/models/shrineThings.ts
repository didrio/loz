import * as THREE from 'three';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, extrudePath, gradient, kitMesh, lathe, lowSphere, merge, mirror, paint, paintRegion, place, taper, wobble, type Vec3 } from '../kit';
import { uniqueSurf } from '../materials';
import { pal } from '../palette';
import type { SurfaceId } from '../textures';
import { Parts } from './village';
import type { Model } from './types';

/**
 * The Hall of Sleepers' things, final (T56b, golden set 8; docs/shrine.md "The final look"): the wakestone, the dungeon's
 * tablet, the bell post and its bell, and the sandstone wing's carved sleeping faces and kneeling keepers. Every one keeps
 * the rough's frame (the colliders were measured from it, `world/dungeon/colliders.test.ts` freezes them): the same footprint,
 * the same height, the same pivot. Only the look is new. The world keeps the logic (`Wakestone`, `BellPost`, `decorateRoom`).
 */

/** Stone sizes: a light block is 1.84 m, a heavy one 1.96 m (the colliders; `Wakestone` takes them from here). */
export const WAKESTONE_SIZE = { light: 1.84, heavy: 1.96 } as const;

/** Pieces gathered by surface, each surface finished as one standalone kit mesh (crevice and gradient: it is not merged with a scenery). */
class Bins {
  private bins = new Map<SurfaceId | '', THREE.BufferGeometry[]>();

  add(surface: SurfaceId | '', ...pieces: THREE.BufferGeometry[]) {
    const list = this.bins.get(surface);
    if (list) list.push(...pieces);
    else this.bins.set(surface, [...pieces]);
  }

  meshes(low = 0.84, high = 1.05, foot = 1) {
    return [...this.bins].map(([surface, pieces]) => kitMesh(crevice(gradient(merge(...pieces), low, high), foot === 1 ? {} : { foot }), surface || undefined));
  }
}

/** The shrine's spiral, a ridge in the xy plane facing +z (about `r` across, `turns` of it). */
export function spiralRidge(r: number, turns = 3.2, n = 8, ridge = 0.03) {
  const path: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * turns;
    const rr = r * (0.2 + 0.8 * (k / n));
    path.push([rr * Math.cos(a), rr * Math.sin(a), 0]);
  }
  return extrudePath([[ridge, 0], [-ridge * 0.6, ridge], [-ridge * 0.6, -ridge]], path);
}

/** A copy of `g` turned a quarter turn about y for each of the four faces of a block (`g` built on its +z face). */
const fourSides = (g: THREE.BufferGeometry) => [0, 1, 2, 3].map((i) => place(g, 0, 0, 0, [0, (i * Math.PI) / 2, 0]));

// ------------------------------------------------------------------------------------------------ the wakestone

/**
 * A wakestone: a carved cube of `WAKESTONE_SIZE`, standing on y = 0, with the shrine's spiral on each side. A light one is
 * pale sandstone with a green-teal inlay. A heavy one is dark violet stone banded in bronze, and its spirals glow:
 * `glow` is the area's shared pulsing material (it stays an unbaked mesh, so the area can still pulse it). `body` is the
 * joint `Wakestone` moves.
 */
export function buildWakestone(heavy = false, glow?: THREE.Material): Model<{ body: THREE.Group }> {
  const size = heavy ? WAKESTONE_SIZE.heavy : WAKESTONE_SIZE.light;
  const half = size / 2;
  const stone = heavy ? pal('plum', 0) : pal('stone', 3);
  const worn = heavy ? pal('ink', 2) : pal('stone', 2);
  const dust = heavy ? pal('plum', 1) : pal('sand', 2);
  const panelColour = heavy ? pal('plum', 1) : pal('sand', 1);
  const bins = new Bins();

  const cube = paintRegion(paint(wobble(bevelBox(size - 0.024, size - 0.024, size - 0.024, 0.09), 0.01, heavy ? 5 : 3), stone), (c, n) => {
    if (c.y < 0.28) return worn;
    return n.y > 0.8 ? dust : undefined;
  });
  const body = place(cube, 0, half, 0);
  // A raised panel on each side, inset from the edges and from the bronze bands, so the spiral sits on a field of its own.
  const panels = fourSides(place(paint(bevelBox(size - 0.34, size - 0.7, 0.07, 0.02), panelColour), 0, half, half + 0.02));
  bins.add('stone', body, ...panels);

  const spiral = place(spiralRidge(0.5, 3.1, 11), 0, half, half + 0.056);
  const spirals = fourSides(spiral);
  const root = new THREE.Group();
  const bodyJoint = new THREE.Group();
  root.add(bodyJoint);

  const animated: THREE.Material[] = [];
  if (heavy) {
    const bronze = pal('earth', 1);
    const bands = [0.18, size - 0.18].map((y) => place(paint(bevelBox(size + 0.07, 0.16, size + 0.07, 0.02), bronze), 0, y, 0));
    const rivets = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => place(paint(lowSphere(0.07, 4, 2), pal('earth', 2)), sx * (half + 0.03), size - 0.18, sz * (half + 0.03))));
    bins.add('metal', ...bands, ...rivets);
    const mat = glow ?? uniqueSurf('stone', pal('teal', 3), { emissive: pal('teal', 1) });
    animated.push(mat);
    bodyJoint.add(...bins.meshes(0.88, 1.05), new THREE.Mesh(merge(...spirals), mat));
  } else {
    bins.add('stone', ...spirals.map((g) => paint(g, pal('teal', 1))));
    bodyJoint.add(...bins.meshes(0.88, 1.05));
  }
  return bakeRig({ root, joints: { body: bodyJoint }, flashMats: [], animated }, { shared: true });
}

// ------------------------------------------------------------------------------------------------ the tablet

/**
 * The dungeon's carved stone tablet on a two-course plinth, standing on y = 0 and facing +z. The rough's frame: a plinth
 * 1.1 × 0.3 × 0.6, a slab 0.9 wide and 0.2 deep rising to 1.5 m (the collider is 1.0 × 1.2 × 0.6 around it). Three rows of
 * runes and a small spiral are cut into the face; the back is plain.
 */
export function buildDungeonTablet(): Model {
  const plinthColour = pal('stone', 1), slabColour = pal('stone', 3), cut = pal('stone', 1);
  const bins = new Bins();
  bins.add('stone',
    place(wobble(paint(bevelBox(1.1, 0.16, 0.6, 0.035), plinthColour), 0.01, 2), 0, 0.08, 0),
    place(wobble(paint(bevelBox(0.96, 0.16, 0.48, 0.035), pal('stone', 2)), 0.01, 4), 0, 0.24, 0),
  );
  // The slab: a tall stone with its top corners cut off, a third of a hand thick.
  const outline: [number, number][] = [[-0.45, 0.32], [0.45, 0.32], [0.45, 1.3], [0.3, 1.5], [-0.3, 1.5], [-0.45, 1.3]];
  const slab = paintRegion(wobble(paint(extrudePath(outline, [[0, 0, -0.1], [0, 0, 0.1]]), slabColour), 0.012, 6), (c, n) => (c.y < 0.55 ? pal('stone', 2) : n.y > 0.8 ? pal('sand', 2) : undefined));
  bins.add('stone', slab);
  // Rows of runes: short bars of unequal length, cut into the face (a hair proud, in the plinth's darker stone).
  const rows: [number, number][][] = [[[-0.24, 0.22], [0.1, 0.3]], [[-0.3, 0.32], [0.14, 0.14]], [[-0.18, 0.18], [0.06, 0.3]]];
  rows.forEach((row, i) => {
    for (const [x, len] of row) bins.add('stone', place(paint(bevelBox(len, 0.05, 0.026, 0), cut), x + len / 2, 1.0 - i * 0.22, 0.108));
  });
  bins.add('stone', place(paint(spiralRidge(0.1, 3, 6, 0.014), cut), 0, 1.3, 0.104));
  const root = new THREE.Group();
  root.add(...bins.meshes(0.85, 1.05));
  return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
}

// ------------------------------------------------------------------------------------------------ the bell

/** Where the post's bell hangs from: how high above the post's foot the hook is, and how far out along the arm. */
export const BELL_HOOK = { y: 2.55, out: 1.0 } as const;

export type BellModel = Model & { bellMat: THREE.MeshLambertMaterial };

/**
 * A bell, about 0.6 m tall, its origin at the hanging loop on top. The bell's own material is a unique one (the world
 * glows it when it rings: it lists it in `animated`), painted white so `bronze` is all the colour it has; the loop and clapper
 * are iron kit meshes. `emissive` is its starting glow.
 */
export function buildBell(bronze = pal('earth', 2), emissive = 0x000000): BellModel {
  // One closed profile, going counter-clockwise: the lip's underside, up the outside (a thick rim, a flare, two ridges, the
  // shoulder), over the crown, and down the inside, so nothing is double-sided and the mouth shows its inner wall.
  const profile: [number, number][] = [
    [0.27, -0.6], [0.34, -0.6], [0.34, -0.54], [0.28, -0.46], [0.27, -0.38], [0.22, -0.3], [0.21, -0.24], [0.17, -0.17], [0.09, -0.1], [0, -0.07],
    [0, -0.12], [0.11, -0.16], [0.17, -0.26], [0.21, -0.4], [0.24, -0.5], [0.24, -0.58], [0.27, -0.6],
  ];
  const shell = paintRegion(paint(lathe(profile, 7, false), pal('chalk', 3)), (c) => (c.y > -0.62 && c.y < -0.45 ? pal('chalk', 2) : undefined));
  const bellMat = uniqueSurf('metal', bronze, { emissive, vertexColors: true });
  const body = new THREE.Mesh(kitMesh(gradient(shell, 0.85, 1.08), 'metal').geometry, bellMat);

  const iron = pal('slate', 0);
  const loop = paint(extrudePath([[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02]], [[0, -0.12, -0.02], [0, -0.04, -0.07], [0, 0.02, -0.04], [0, 0.04, 0], [0, 0.02, 0.04], [0, -0.04, 0.07], [0, -0.12, 0.02]]), iron);
  const clapper = place(paint(lowSphere(0.065, 5, 3), iron), 0, -0.6, 0);
  const rod = place(paint(taper(0.014, 0.014, 0.4, 4), iron), 0, -0.6, 0);
  const root = new THREE.Group();
  root.add(body, kitMesh(gradient(merge(loop, clapper, rod), 0.9, 1.05), 'metal'));
  const model = bakeRig({ root, joints: {}, flashMats: [], animated: [bellMat] }, { shared: true });
  return Object.assign(model, { bellMat });
}

/**
 * A bell post: footing stones, a crooked wooden post (the lower post leans one way, the upper the other, bound where they
 * meet), one arm with a brace, the bell's name cut into a plate on its side, an iron hook, and a few faded cloth ties.
 * Faces +z: the arm reaches out to local +x. `pivot` is the joint the world swings the bell on, at the hook (`BELL_HOOK`);
 * `bell` hangs a bell from it (the world hangs its own, one per bell, so it passes none).
 */
export function buildBellPost(bell: number | null = pal('earth', 2)): Model<{ pivot: THREE.Group }> {
  const wood = pal('wood', 1), woodDark = pal('bark', 2), woodLight = pal('wood', 2), cloth = [pal('plaster', 1), pal('rose', 1), pal('straw', 1)];
  const bins = new Bins();
  const cyl = (bottom: number, top: number, h: number, sides: number, colour: number, seed: number) =>
    wobble(paint(taper(bottom, top, h, sides), colour), 0.012, seed);

  // The footing: two courses of laid stone, the top one 0.4 m across as the rough's was.
  bins.add('stone',
    place(cyl(0.52, 0.5, 0.17, 7, pal('stone', 1), 1), 0, 0, 0),
    place(cyl(0.46, 0.4, 0.15, 7, pal('stone', 2), 2), 0, 0.15, 0, [0, 0.3, 0]),
  );
  // The post, crooked like a heron's leg, in the same places and leans as the rough's boxes.
  const timber = (w: number, h: number, d: number, colour: number, x: number, y: number, lean: number, seed: number) =>
    place(wobble(paint(bevelBox(w, h, d, 0.03), colour), 0.012, seed), x, y, 0, [0, 0, lean]);
  bins.add('wood',
    timber(0.22, 1.5, 0.22, wood, 0.04, 1.02, -0.06, 3),
    timber(0.26, 0.16, 0.26, woodDark, 0.08, 1.78, 0.1, 4),
    timber(0.19, 0.95, 0.19, wood, 0.06, 2.25, 0.09, 5),
    // The arm, drooping a little, with an end cap, a brace and the name plate (four cuts for the bell's name).
    timber(BELL_HOOK.out + 0.35, 0.14, 0.14, wood, BELL_HOOK.out / 2 + 0.05, BELL_HOOK.y + 0.17, -0.05, 6),
    timber(0.1, 0.75, 0.1, woodDark, 0.38, 2.28, -0.8, 7),
    timber(0.46, 0.1, 0.03, woodLight, 0.62, BELL_HOOK.y + 0.18, -0.05, 8),
    ...[0, 1, 2, 3].map((i) => place(paint(bevelBox(0.03, 0.06, 0.02, 0), woodDark), 0.45 + i * 0.11, BELL_HOOK.y + 0.18, 0.09)),
  );
  // The binding where the two posts meet (rope: three turns), and at the arm's root.
  const rope = pal('straw', 1);
  bins.add('leather',
    ...[0, 1, 2].map((i) => place(paint(bevelBox(0.29, 0.035, 0.29, 0), rope), 0.075, 1.72 + i * 0.065, 0, [0, i * 0.2, 0.1])),
    ...[0, 1].map((i) => place(paint(bevelBox(0.23, 0.035, 0.23, 0), rope), 0.065, 2.6 + i * 0.07, 0, [0, i * 0.3, 0.09])),
  );
  // The iron: a hook hanging from the arm, a strap round the lower post and a ring on the brace.
  const sq: [number, number][] = [[-0.018, -0.018], [0.018, -0.018], [0.018, 0.018], [-0.018, 0.018]];
  const hook = paint(extrudePath(sq, [[BELL_HOOK.out, BELL_HOOK.y + 0.1, 0], [BELL_HOOK.out, BELL_HOOK.y + 0.04, 0], [BELL_HOOK.out, BELL_HOOK.y + 0.01, 0.04], [BELL_HOOK.out, BELL_HOOK.y + 0.06, 0.08]]), pal('slate', 0));
  bins.add('metal', hook, place(paint(bevelBox(0.25, 0.05, 0.25, 0), pal('slate', 1)), 0.045, 0.9, 0, [0, 0, -0.06]));
  // Faded ties tied to the arm, hanging still: bits of cloth that other hands left.
  cloth.forEach((colour, i) => {
    const len = 0.32 - i * 0.07, x = 0.6 + i * 0.14;
    bins.add('cloth', place(wobble(paint(taper(0.045, 0.02, len, 3, 0.2), colour), 0.008, 10 + i), x, BELL_HOOK.y + 0.1 - len, 0.09, [0, i, 0.05 * (i - 1)]));
  });

  const root = new THREE.Group();
  root.add(...bins.meshes(0.88, 1.04));
  const pivot = new THREE.Group();
  pivot.position.set(BELL_HOOK.out, BELL_HOOK.y, 0);
  root.add(pivot);
  const animated: THREE.Material[] = [];
  const model = bakeRig({ root, joints: { pivot }, flashMats: [], animated }, { shared: true });
  if (bell !== null) {
    // Hung after the bake, so the bell's meshes are not baked a second time.
    const b = buildBell(bell);
    pivot.add(b.root);
    animated.push(b.bellMat);
  }
  return model;
}

// ------------------------------------------------------------------------------------------------ the wing's carvings

/**
 * Where the carvings stand. Both are built in the wall's frame: the origin on the wall's inner face at floor level, +z into
 * the room, x along the wall. `decorateRoom` turns them to the wall.
 */
export const FACE = { bottom: 2.08, top: 3.18, width: 0.98, depth: 0.14 } as const;

/**
 * A sleeping face carved into a panel of the wall: a pale oval with a heavy brow, closed lids, a straight nose and a
 * calm mouth, framed by a darker stone arch. It begins above the tallest wakestone (1.96 m), so no stone ever slides
 * through it, and stands 14 cm proud of the wall, past the string course.
 */
export function buildSleepingFace(): Model {
  const parts = new Parts();
  const w = FACE.width / 2, top = FACE.top, bottom = FACE.bottom;
  const panel: [number, number][] = [[-w, bottom], [w, bottom], [w, top - 0.3], [w - 0.17, top], [-w + 0.17, top], [-w, top - 0.3]];
  parts.add('stone', paintRegion(wobble(paint(extrudePath(panel, [[0, 0, 0], [0, 0, FACE.depth]]), pal('stone', 1)), 0.008, 21), (c, n) => (n.y > 0.8 ? pal('sand', 1) : undefined)));
  const cy = (bottom + top) / 2 - 0.02, front = FACE.depth;
  // The face: wide at the brow, narrow at the chin, flat against the panel.
  const face = place(wobble(paint(taper(0.17, 0.27, 0.66, 6, 0.38), pal('stone', 3)), 0.006, 22), 0, cy - 0.33, front + 0.02);
  parts.add('stone', face,
    place(paint(bevelBox(0.54, 0.07, 0.07, 0.015), pal('stone', 2)), 0, cy + 0.17, front + 0.12),
    // Closed lids: two slits, sloped a little toward the nose, and the nose between them.
    ...[-1, 1].map((s) => place(paint(bevelBox(0.17, 0.035, 0.03, 0), pal('ink', 3)), s * 0.12, cy + 0.07, front + 0.1, [0, 0, -s * 0.12])),
    place(paint(taper(0.042, 0.03, 0.2, 4, 0.8), pal('stone', 2)), 0, cy - 0.12, front + 0.11),
    place(paint(bevelBox(0.15, 0.03, 0.03, 0), pal('ink', 3)), 0, cy - 0.2, front + 0.09),
    // A spiral cut in the arch above the brow, faint.
    place(paint(spiralRidge(0.07, 3, 6, 0.012), pal('stone', 2)), 0, top - 0.09, front + 0.004),
  );
  return parts.model();
}

/** The keeper's footprint, in the wall frame: it kneels 0.75 m out from the wall's face (the collider is 1.2 × 2 × 1 around it). */
export const KEEPER = { out: 0.75, alongHalf: 0.6, depthHalf: 0.5, height: 2.0 } as const;

/**
 * A kneeling keeper, asleep in stone: a low plinth, the robe pooled round folded legs, a hooded head bowed forward with its
 * eyes shut, the hands folded in the lap and the shrine's spiral on the chest. Built in the wall's frame like the face,
 * kneeling at `KEEPER.out`; the head is the only part that rises past the collider's top.
 */
export function buildKneelingKeeper(): Model {
  const parts = new Parts();
  const robe = pal('sand', 2), robeLight = pal('sand', 3), base = pal('stone', 1), dark = pal('stone', 0);
  const out = KEEPER.out;
  const piece = (g: THREE.BufferGeometry, x: number, y: number, z: number, rot: Vec3 = [0, 0, 0]) => place(g, x, y, z, rot);
  const plinth = piece(wobble(paint(bevelBox(1.2, 0.18, 0.92, 0.04), base), 0.01, 31), 0, 0.09, out);
  const hem = piece(wobble(paint(taper(0.52, 0.4, 0.5, 8, 0.82), robe), 0.014, 32), 0, 0.18, out);
  const torso = piece(wobble(paint(taper(0.36, 0.27, 0.82, 6, 0.8), robe), 0.012, 33), 0, 0.64, out - 0.03);
  const shoulders = piece(wobble(paint(bevelBox(0.84, 0.26, 0.5, 0.07), robe), 0.01, 34), 0, 1.42, out - 0.03);
  // The cowl falls over the head and down the back; the head under it is bowed forward.
  const cowl = piece(paint(lowSphere(0.36, 6, 4), robeLight), 0, 1.7, out + 0.02);
  const head = piece(paint(lowSphere(0.25, 6, 4), robeLight), 0, 1.72, out + 0.2);
  // Arms down from the shoulders, bent at the elbow, to hands folded in the lap.
  const sq: [number, number][] = [[-0.075, -0.075], [0.075, -0.075], [0.075, 0.075], [-0.075, 0.075]];
  const arm = paint(extrudePath(sq, [[0.38, 1.36, out - 0.02], [0.43, 1.08, out + 0.12], [0.12, 0.92, out + 0.36]], (t) => 1 - 0.25 * t), robe);
  const hand = piece(paint(lowSphere(0.085, 5, 3), robeLight), 0.08, 0.92, out + 0.4);
  parts.add('stone', plinth, hem, torso, shoulders, cowl, head, arm, mirror(arm), hand, mirror(hand));
  // Eyes shut on the bowed face, a cord round the waist and the spiral on the chest.
  parts.add('stone',
    ...[-0.1, 0.1].map((x) => piece(paint(bevelBox(0.14, 0.03, 0.02, 0), dark), x, 1.74, out + 0.43)),
    piece(paint(bevelBox(0.5, 0.06, 0.4, 0.015), pal('stone', 2)), 0, 0.98, out - 0.02),
    piece(paint(spiralRidge(0.1, 3, 6, 0.014), base), 0, 1.2, out + 0.2),
  );
  return parts.model();
}

import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { bakeRig } from '../bakeRig';
import { crevice, kitMesh, lathe, lowSphere, merge, paint, paintRegion, place, wobble } from '../kit';
import { pal } from '../palette';
import type { Model } from './types';

/**
 * The valley's nature (T51a, the entrance vignette's foundations; docs/art.md "The golden set"): the field tree, the pine,
 * the rock, the grass tuft and the lone oak. The first four are instanced hundreds of times across the valley
 * (`world/overworld/nature.ts`), so they are one geometry each, cheap (a tree ≤ ~120 triangles), and coloured per instance:
 * the geometry carries white paint and its own shade (`crevice`: a crown darker underneath and toward its foot), and the
 * instance colour is a palette swatch picked from the tint lists below. A rock is painted in its own stone shades.
 *
 * Each part keeps the rough's frame, because the world's instance matrices stay byte-identical: the trunk is 2.4 m tall
 * centred on its origin, a round crown fills a unit sphere (the world scales it 2.2 × 2 × 2.2), a pine crown is 5 m tall,
 * 1.6 m in radius, centred, a rock fits a unit sphere and a tuft stands 0.6 m tall centred on its origin.
 */

const WHITE = pal('chalk', 3);

/** A tree trunk: a root flare and a slight lean, bark with darker roots. */
export function treeTrunk(seed = 1): THREE.BufferGeometry {
  const g = wobble(lathe([[0.44, -1.2], [0.31, -0.95], [0.26, -0.3], [0.2, 1.2]], 6, false), 0.035, seed);
  return crevice(paintRegion(paint(g, pal('bark', 2)), (c) => (c.y < -0.85 ? pal('bark', 1) : undefined)));
}

/** A round crown: one big clump and two smaller ones, so it reads as foliage, not a gem. */
export function roundCrown(seed = 1): THREE.BufferGeometry {
  const g = merge(
    place(lowSphere(0.8, 7, 4), 0, 0.14, 0),
    place(lowSphere(0.58, 6, 3), 0.48, -0.22, 0.3, [0, 0.4, 0]),
    place(lowSphere(0.55, 6, 3), -0.46, -0.2, -0.32, [0, 1.1, 0]),
  );
  return crevice(paint(wobble(g, 0.06, seed), WHITE), { underside: 0.74, foot: 0.86, footHeight: 1.1 });
}

/** A pine crown: three skirted tiers, each a little turned from the one below, a darker underside to every skirt. */
export function pineCrown(seed = 1): THREE.BufferGeometry {
  const tier = (inner: number, innerY: number, rim: number, rimY: number, tipY: number, turn: number) =>
    place(lathe([[inner, innerY], [rim, rimY], [0, tipY]], 7), 0, 0, 0, [0, turn, 0]);
  const g = merge(
    tier(0.34, -1.95, 1.6, -2.5, -0.1, 0),
    tier(0.28, -0.75, 1.22, -1.2, 1.0, Math.PI / 7),
    tier(0.2, 0.42, 0.84, 0.08, 2.5, 0),
  );
  return crevice(paint(wobble(g, 0.05, seed), WHITE), { underside: 0.7, foot: 0.88, footHeight: 1.2 });
}

/** A field rock: a lumpy, faceted stone with its faces broken up in three greys (rocks lie turned every way). */
export function rockShape(seed = 1): THREE.BufferGeometry {
  const rnd = mulberry32(seed * 7919);
  const g = wobble(lowSphere(1, 7, 4), 0.14, seed);
  return paintRegion(g, () => {
    const r = rnd();
    return r < 0.2 ? pal('stone', 3) : r < 0.32 ? pal('stone', 1) : pal('stone', 2);
  });
}

/** A grass tuft: three blades fanned out, darker at the root. */
export function grassTuft(): THREE.BufferGeometry {
  const blade = (h: number, lean: number, turn: number, dx: number, dz: number) => place(lathe([[0.07, 0], [0, h]], 3, false), dx, -0.3, dz, [lean, turn, 0]);
  const g = merge(blade(0.62, 0.12, 0, 0, 0), blade(0.5, 0.42, 2.1, 0.05, 0.04), blade(0.46, 0.4, 4.2, -0.05, 0.03));
  return crevice(paint(g, WHITE), { foot: 0.76, footHeight: 0.4 });
}

// ---------------------------------------------------------------------------------------------- tints

/** A field tree's leaves, from the two numbers the layout already draws for it (`c1`, `c2`, each 0..1). */
export function roundTint(c1: number, c2: number) {
  return c2 > 0.75 ? pal('leaf', 3) : c1 < 0.5 ? pal('grass', 2) : pal('leaf', 2);
}

/** A pine's needles: darker and bluer than a field tree's. */
export function pineTint(c1: number, c2: number) {
  return c2 > 0.85 ? pal('leaf', 1) : c1 < 0.55 ? pal('leaf', 2) : pal('grass', 1);
}

/** A tuft's green, from its two draws (`hue`, `light`). */
export function tuftTint(hue: number, light: number) {
  return light < 0.25 ? pal('grass', 1) : light > 0.7 || hue < 0.25 ? pal('grass', 3) : pal('grass', 2);
}

/** The field flowers' petals: white, yellow, pink and a pale blue. */
export const FLOWER_COLOURS = [pal('chalk', 3), pal('amber', 3), pal('rose', 3), pal('moon', 2)] as const;

/** A copy of an instanced part with its tint multiplied in, for the registry's renders (the world tints per instance). */
function tinted(g: THREE.BufferGeometry, hex: number) {
  const out = g.clone();
  const c = new THREE.Color(hex), col = out.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
  return out;
}

// --------------------------------------------------------------------------------- whole models

/** A part as the world places it: at `y`, scaled like its instances at scale 1. */
function part(root: THREE.Group, g: THREE.BufferGeometry, surface: 'bark' | 'foliage' | 'rock', y: number, scale: [number, number, number] = [1, 1, 1]) {
  const m = kitMesh(g, surface);
  m.position.y = y;
  m.scale.set(...scale);
  root.add(m);
}

/** A field tree at scale 1, as `buildTrees` places one (trunk centre 1.2 m up, crown 3.6 m up, 2.2 × 2 × 2.2). */
export function buildRoundTree(): Model {
  const root = new THREE.Group();
  part(root, treeTrunk(), 'bark', 1.2);
  part(root, tinted(roundCrown(), roundTint(0.2, 0.2)), 'foliage', 3.6, [2.2, 2, 2.2]);
  return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
}

/** A pine at scale 1 (crown centre 4.2 m up). */
export function buildPine(): Model {
  const root = new THREE.Group();
  part(root, treeTrunk(), 'bark', 1.2);
  part(root, tinted(pineCrown(), pineTint(0.2, 0.2)), 'foliage', 4.2);
  return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
}

/** A field rock at scale 1 (the world squashes it to 0.75 tall and sinks it). */
export function buildRock(): Model {
  const root = new THREE.Group();
  part(root, rockShape(), 'rock', 0.3, [1, 0.75, 1]);
  return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
}

/** A grass tuft at scale 1. */
export function buildGrassTuft(): Model {
  const root = new THREE.Group();
  part(root, tinted(grassTuft(), tuftTint(0.5, 0.5)), 'foliage', 0.3);
  return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
}

/**
 * The lone oak at the grove road's bend: twice a field tree's size, broad and dark, so it reads from the crossroads. A
 * flared trunk with two limbs, four leaf clumps where the rough had its four (same centres and radii), lit tops. It is
 * static scenery (merged), so it carries no `crevice`: the merge shades it like everything around it.
 */
export function buildLoneOak(): Model {
  const root = new THREE.Group();
  const trunk = wobble(lathe([[1.2, 0], [0.92, 0.5], [0.66, 3], [0.55, 6.2]], 7, false), 0.06, 3);
  const limb = (x: number, z: number, lean: number, turn: number) => place(lathe([[0.3, 0], [0.16, 2.4]], 5, false), x, 4.4, z, [lean, turn, 0]);
  root.add(kitMesh(paintRegion(paint(merge(trunk, limb(0.3, 0.1, 0.8, -1.2), limb(-0.3, -0.1, 0.75, 1.9)), pal('bark', 2)), (c) => (c.y < 0.7 ? pal('bark', 1) : undefined)), 'bark'));
  const clumps = ([[0, 7.6, 0, 3.6, 1], [2.4, 6.6, 1, 2.6, 2], [-2.2, 6.9, -0.8, 2.8, 1], [0.4, 9.4, -0.4, 2.4, 2]] as const).map(([x, y, z, r, shade], i) =>
    paintRegion(paint(place(wobble(lowSphere(r, i === 0 ? 8 : 7, i === 0 ? 5 : 4), r * 0.06, 11 + i), x, y, z), pal('leaf', shade)), (_c, n) => (n.y > 0.72 ? pal('leaf', (shade + 1) as 2 | 3) : undefined)),
  );
  root.add(kitMesh(merge(...clumps), 'foliage'));
  return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
}

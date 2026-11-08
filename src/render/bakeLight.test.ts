import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BAKE, BAKE_DEFAULTS, bakedLightOn, bakeLight, EVERYWHERE, regionWeight, setBakedLight, setBakeStrength, subdivide, type LightRegion } from './bakeLight';
import { gatherPoints, occluderTree, TERM_STRIDE } from './bakeGather';
import { mat, mergeStatic } from './materials';

/** A grey 20 m ground (1 m cells, like the terrain: non-indexed, vertex-coloured) with a red 2×3×2 m block in the middle. */
function scene(region: LightRegion) {
  const groundGeo = new THREE.PlaneGeometry(20, 20, 20, 20).rotateX(-Math.PI / 2).toNonIndexed();
  groundGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(groundGeo.attributes.position.count * 3).fill(0.5), 3));
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.userData.bakeLight = 'receive';
  const dynamic = new THREE.Group().add(ground);

  const src = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), mat(0xc03020));
  block.position.set(0, 1.5, 0);
  src.add(block);
  const merged = mergeStatic(src, 80, true);
  bakeLight(merged, dynamic, [region]);
  return { ground: groundGeo, merged };
}

/** The colour at the ground's vertex nearest (x, z). */
function at(g: THREE.BufferGeometry, x: number, z: number) {
  const p = g.attributes.position, c = g.attributes.color;
  let best = 0, bd = Infinity;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - x, p.getZ(i) - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return new THREE.Color(c.getX(best), c.getY(best), c.getZ(best));
}

describe('bakeLight', () => {
  const wide: LightRegion = { x: 0, z: 0, r: 40, feather: 2 };

  it('leaves ground under open sky as it was, and shades ground at the foot of a wall', () => {
    const { ground } = scene(wide);
    const open = at(ground, 9, 9);
    expect(open.g).toBeCloseTo(0.5, 2);
    const foot = at(ground, 1, 0); // where the block's east face meets the ground
    expect(foot.g).toBeLessThan(open.g * 0.85);
    expect(at(ground, 3, 0).g).toBeGreaterThan(foot.g); // the shade fades with distance from the wall
  });

  it('bleeds the wall\'s colour onto the ground beside it (one bounce)', () => {
    const { ground } = scene(wide);
    const foot = at(ground, 1, 0);
    expect(foot.r / foot.g).toBeGreaterThan(1.05); // grey ground turned reddish next to a red wall
  });

  it('touches nothing outside its region', () => {
    const { ground } = scene({ x: 0, z: 0, r: 5, feather: 1 });
    expect(at(ground, 9, 0).g).toBeCloseTo(0.5, 5);
    expect(regionWeight([{ x: 0, z: 0, r: 5, feather: 1 }], 4.5, 0)).toBeCloseTo(0.5, 5);
    // A room cut out of the region (the mill's) is left alone; just outside it, the bake applies.
    const withRoom: LightRegion[] = [{ x: 0, z: 0, r: 30, feather: 2, except: [{ x: 10, z: 0, r: 3 }] }];
    expect(regionWeight(withRoom, 11, 0)).toBe(0);
    expect(regionWeight(withRoom, 14, 0)).toBe(1);
  });

  it('drops the merge\'s shade attribute once it has replaced it', () => {
    const { merged } = scene(wide);
    for (const m of merged.children as THREE.Mesh[]) expect(m.geometry.attributes.shade).toBeUndefined();
    expect(mergeStatic(new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), mat(0x808080)))).children.every((m) => !(m as THREE.Mesh).geometry.attributes.shade)).toBe(true);
  });

  it('splits big faces in the region so a wall can hold a gradient, and leaves the rest alone', () => {
    const cell = BAKE.cell;
    BAKE.cell = 2;
    const { merged } = scene(wide);
    const tris = (merged.children as THREE.Mesh[]).reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
    expect(tris).toBeGreaterThan(12); // the block's 12 triangles, split
    const quad = new THREE.PlaneGeometry(4, 4).toNonIndexed();
    expect(subdivide(quad, new THREE.Matrix4(), [wide]).attributes.position.count).toBe(6 * 9); // diagonal 5.7 m → 3×3
    BAKE.cell = cell;
    expect(subdivide(quad, new THREE.Matrix4().makeTranslation(100, 0, 0), [wide])).toBe(quad); // outside: untouched
  });

  it('recomposes live with new strength numbers, without casting a ray', () => {
    const { ground } = scene(wide);
    const baked = at(ground, 1, 0).g;
    setBakeStrength('sky', { occlusion: 0, bleed: 0 });
    expect(at(ground, 1, 0).g).toBeCloseTo(0.5, 5); // no darkening, no tint: the plain colour
    setBakeStrength('sky', { occlusion: 2, floor: 0.6 });
    expect(at(ground, 1, 0).g).toBeCloseTo(0.5 * 0.6, 3); // pressed down to the floor
    setBakeStrength('indoor', { occlusion: 0 }); // another profile's numbers leave this one alone
    expect(at(ground, 1, 0).g).toBeCloseTo(0.5 * 0.6, 3);
    setBakeStrength('sky', BAKE_DEFAULTS.sky);
    setBakeStrength('indoor', BAKE_DEFAULTS.indoor);
    expect(at(ground, 1, 0).g).toBeCloseTo(baked, 5);
  });

  it('bakes an indoor floor with its own, gentler numbers', () => {
    const groundGeo = new THREE.PlaneGeometry(20, 20, 20, 20).rotateX(-Math.PI / 2).toNonIndexed();
    groundGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(groundGeo.attributes.position.count * 3).fill(0.5), 3));
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.userData.bakeLight = 'receive';
    const src = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), mat(0xc03020));
    block.position.set(0, 1.5, 0);
    src.add(block);
    bakeLight(mergeStatic(src, 80, true), new THREE.Group().add(ground), [EVERYWHERE], 'indoor');
    const foot = at(groundGeo, 1, 0).g;
    expect(foot).toBeLessThan(0.5);
    setBakeStrength('indoor', { occlusion: 0, bleed: 0 });
    expect(at(groundGeo, 1, 0).g).toBeCloseTo(0.5, 5);
    setBakeStrength('indoor', BAKE_DEFAULTS.indoor);
    expect(at(groundGeo, 1, 0).g).toBeCloseTo(foot, 5);
  });

  it('gathers raw terms: open sky far from anything, blocked and tinted at a wall\'s foot', () => {
    const box = new THREE.BoxGeometry(2, 3, 2).translate(0, 1.5, 0).toNonIndexed();
    const occPos = new Float32Array(box.attributes.position.array as Float32Array);
    const occAlb = new Float32Array((occPos.length / 9) * 3).fill(0).map((_, i) => (i % 3 === 0 ? 0.8 : 0.1)); // red
    const points = new Float32Array([1.05, 0, 0, 0, 1, 0, 9, 0, 9, 0, 1, 0]); // (x, y, z, normal) × 2
    const terms = gatherPoints(occluderTree(occPos), occAlb, points, 32, 8);
    expect(terms.length).toBe(2 * TERM_STRIDE);
    expect(terms[TERM_STRIDE]).toBeCloseTo(1, 5); // the far point sees all the sky
    expect(terms[TERM_STRIDE + 1]).toBe(0);
    expect(terms[0]).toBeLessThan(0.8); // the foot sees less of it
    expect(terms[1]).toBeGreaterThan(0.2);
    expect(terms[2]).toBeCloseTo(1, 5); // the hue: red at full, green and blue down
    expect(terms[3]).toBeLessThan(0.2);
  });

  it('switches live between baked and plain colours', () => {
    const { ground } = scene(wide);
    const baked = at(ground, 1, 0).g;
    setBakedLight(false);
    expect(bakedLightOn()).toBe(false);
    expect(at(ground, 1, 0).g).toBeCloseTo(0.5, 5);
    setBakedLight(true);
    expect(at(ground, 1, 0).g).toBeCloseTo(baked, 5);
  });
});

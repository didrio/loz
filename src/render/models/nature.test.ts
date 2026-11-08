import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { triangleCount } from '../kit';
import { kitMat } from '../materials';
import { snap } from '../palette';
import { buildLoneOak, FLOWER_COLOURS, grassTuft, pineCrown, pineTint, rockShape, roundCrown, roundTint, treeTrunk, tuftTint } from './nature';

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};
/** `now` is within `tol` metres of `was` on every side. */
const near = (now: THREE.Box3, was: [number[], number[]], tol: number) => {
  now.min.toArray().forEach((v, i) => expect(Math.abs(v - was[0][i])).toBeLessThan(tol));
  now.max.toArray().forEach((v, i) => expect(Math.abs(v - was[1][i])).toBeLessThan(tol));
};

describe("the valley's nature (final pass, T51a)", () => {
  it("keeps each rough part's frame, so the world's instance matrices still fit (silhouette frozen)", () => {
    near(box(treeTrunk()), [[-0.44, -1.2, -0.44], [0.44, 1.2, 0.44]], 0.12); // the rough: a 2.4 m cylinder, centred
    near(box(roundCrown()), [[-0.95, -0.95, -0.95], [0.95, 0.95, 0.95]], 0.2); // the rough: a unit icosahedron
    near(box(pineCrown()), [[-1.6, -2.5, -1.6], [1.6, 2.5, 1.6]], 0.15); // the rough: a 5 m cone, radius 1.6, centred
    near(box(rockShape()), [[-1, -1, -1], [1, 1, 1]], 0.2); // the rough: a unit dodecahedron
    const tuft = box(grassTuft());
    expect(Math.abs(tuft.min.y + 0.3)).toBeLessThan(0.04); // the rough: a 0.6 m cone, centred (leaning blades dip a little)
    expect(tuft.max.y).toBeLessThan(0.35);
  });

  it('stays cheap: hundreds of trees and thousands of tufts are instanced', () => {
    expect(triangleCount(treeTrunk()) + triangleCount(roundCrown())).toBeLessThanOrEqual(130);
    expect(triangleCount(treeTrunk()) + triangleCount(pineCrown())).toBeLessThanOrEqual(130);
    expect(triangleCount(rockShape())).toBeLessThanOrEqual(60);
    expect(triangleCount(grassTuft())).toBeLessThanOrEqual(12);
  });

  it('is the same for a seed, and a different seed gives a different tree', () => {
    const pos = (g: THREE.BufferGeometry) => Array.from(g.attributes.position.array as Float32Array);
    expect(pos(roundCrown(4))).toEqual(pos(roundCrown(4)));
    expect(pos(roundCrown(4))).not.toEqual(pos(roundCrown(5)));
    expect(Array.from(rockShape(2).attributes.color.array as Float32Array)).toEqual(Array.from(rockShape(2).attributes.color.array as Float32Array));
  });

  it('every tint is a palette swatch, whatever the draws', () => {
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      for (const hex of [roundTint(i / 10, j / 10), pineTint(i / 10, j / 10), tuftTint(i / 10, j / 10)]) expect(snap(hex)).toBe(hex);
    }
    for (const hex of FLOWER_COLOURS) expect(snap(hex)).toBe(hex);
  });

  it('crowns are painted white and darker underneath, so the instance colour is the leaf colour', () => {
    const g = roundCrown(), col = g.attributes.color, nor = g.attributes.normal;
    let top = 0, under = 1;
    for (let i = 0; i < col.count; i++) {
      if (nor.getY(i) > 0.7) top = Math.max(top, col.getX(i));
      if (nor.getY(i) < -0.5) under = Math.min(under, col.getX(i));
    }
    expect(top).toBe(1);
    expect(under).toBeLessThan(0.8);
  });

  it('the lone oak is kit pieces in the shared materials, so the merge keeps its paint and adds no draw calls', () => {
    const meshes: THREE.Mesh[] = [];
    buildLoneOak().root.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes.map((m) => m.material).sort()).toEqual([kitMat('bark'), kitMat('foliage')].sort());
    for (const m of meshes) expect(m.geometry.attributes.color).toBeDefined();
    // The rough oak stood 6 m of trunk with its top clump reaching 9.4 + 2.4 m.
    const b = new THREE.Box3().setFromObject(buildLoneOak().root);
    expect(b.max.y).toBeGreaterThan(11);
    expect(b.max.y).toBeLessThan(12.5);
  });
});

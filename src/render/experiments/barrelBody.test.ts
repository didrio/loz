import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATLAS, BODY, buildBarrelBody, type BarrelDetail } from './barrelBody';

const tris = (g: THREE.BufferGeometry) => (g.index?.count ?? g.attributes.position.count) / 3;

describe('the game-size barrel body for the photoreal surface (T65)', () => {
  const bodies = { standard: buildBarrelBody('standard'), rich: buildBarrelBody('rich') };

  it('keeps the phone budget at standard detail (≤5k triangles) and the rich one under 15k', () => {
    const n = (d: BarrelDetail) => tris(bodies[d].wood) + tris(bodies[d].iron);
    expect(n('standard')).toBeLessThanOrEqual(5000);
    expect(n('standard')).toBeGreaterThan(3000);
    expect(n('rich')).toBeLessThanOrEqual(15000);
    expect(n('rich')).toBeGreaterThan(2 * n('standard'));
  });

  it("is the game barrel's size: 1 m tall, a 0.48 m belly (plus its hoops)", () => {
    for (const b of Object.values(bodies)) {
      const box = new THREE.Box3().setFromBufferAttribute(b.wood.attributes.position as THREE.BufferAttribute);
      box.union(new THREE.Box3().setFromBufferAttribute(b.iron.attributes.position as THREE.BufferAttribute));
      expect(box.min.y).toBeCloseTo(0, 2);
      expect(box.max.y).toBeCloseTo(BODY.H, 2);
      expect(box.max.x).toBeGreaterThan(0.47);
      expect(box.max.x).toBeLessThan(0.5);
    }
  });

  it('gives every vertex the attributes the photoreal shader and the bake read', () => {
    for (const b of Object.values(bodies)) {
      for (const g of [b.wood, b.bakeWood]) for (const k of ['normal', 'uv', 'aWood', 'aInfo']) expect(g.attributes[k]?.count).toBe(g.attributes.position.count);
      for (const g of [b.iron, b.bakeIron]) for (const k of ['normal', 'uv', 'aHoop']) expect(g.attributes[k]?.count).toBe(g.attributes.position.count);
    }
  });

  it('keeps every uv inside the atlas, each part inside its own chart, and the charts apart', () => {
    const rects = Object.values(ATLAS);
    for (const [a, ra] of rects.entries()) {
      for (const rb of rects.slice(a + 1)) {
        const apart = ra[0] + ra[2] <= rb[0] || rb[0] + rb[2] <= ra[0] || ra[1] + ra[3] <= rb[1] || rb[1] + rb[3] <= ra[1];
        expect(apart).toBe(true);
      }
    }
    const inSome = (u: number, v: number) => rects.some(([u0, v0, du, dv]) => u >= u0 - 1e-6 && u <= u0 + du + 1e-6 && v >= v0 - 1e-6 && v <= v0 + dv + 1e-6);
    for (const b of Object.values(bodies)) {
      for (const g of [b.wood, b.iron]) {
        const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) expect(inSome(uv.getX(k), uv.getY(k))).toBe(true);
      }
    }
  });

  it("covers the staves' chart edge to edge in the bake, so nothing is left for dilation to guess", () => {
    const uv = bodies.standard.bakeWood.attributes.uv;
    const [, , , dv] = ATLAS.staves;
    let minU = 1, maxU = 0, maxV = 0;
    for (let k = 0; k < uv.count; k++) {
      if (uv.getY(k) > dv + 1e-6) continue;
      minU = Math.min(minU, uv.getX(k));
      maxU = Math.max(maxU, uv.getX(k));
      maxV = Math.max(maxV, uv.getY(k));
    }
    expect(minU).toBeCloseTo(0, 5);
    expect(maxU).toBeCloseTo(1, 5);
    expect(maxV).toBeCloseTo(dv, 5);
  });

  it('never shares a vertex between two staves (each keeps its own seed: no grain blending across a groove)', () => {
    const g = bodies.standard.wood;
    const info = g.attributes.aInfo, index = g.index!;
    for (let k = 0; k < index.count; k += 3) {
      const seeds = [0, 1, 2].map((o) => info.getX(index.getX(k + o)));
      expect(seeds[1]).toBe(seeds[0]);
      expect(seeds[2]).toBe(seeds[0]);
    }
  });
});

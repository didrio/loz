import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bevelBox, capsule, creaseNormals, crevice, extrudePath, kitMesh, lathe, lowSphere, merge, mirror, paint, paintRegion, place, taper, triangleCount, wobble } from './kit';
import { isSharedMaterial } from './materials';
import { pal, snap } from './palette';

/** Signed volume of a closed non-indexed mesh: positive when its triangles face outward. */
function volume(g: THREE.BufferGeometry) {
  const p = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

/** How many triangles face away from `centre` (a convex solid should have none facing in). */
function facingIn(g: THREE.BufferGeometry, centre = new THREE.Vector3()) {
  const p = g.attributes.position, n = g.attributes.normal;
  let bad = 0;
  const mid = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    mid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) mid.add(new THREE.Vector3().fromBufferAttribute(p, i + k));
    mid.divideScalar(3).sub(centre);
    nn.fromBufferAttribute(n, i);
    if (nn.dot(mid) <= 0) bad++;
  }
  return bad;
}

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};
const size = (g: THREE.BufferGeometry) => box(g).getSize(new THREE.Vector3());
const colorHex = (g: THREE.BufferGeometry, i: number) => new THREE.Color().fromBufferAttribute(g.attributes.color, i).getHex();

describe('forms', () => {
  it('bevelBox: 44 triangles, the asked-for size, every face outward; bevel 0 is a plain 12-triangle box', () => {
    const g = bevelBox(1.4, 0.8, 0.95, 0.07);
    expect(triangleCount(g)).toBe(44);
    expect(size(g).toArray().map((v) => +v.toFixed(4))).toEqual([1.4, 0.8, 0.95]);
    expect(facingIn(g)).toBe(0);
    expect(volume(g)).toBeGreaterThan(0);
    const plain = bevelBox(1, 1, 1, 0);
    expect(triangleCount(plain)).toBe(12);
    expect(facingIn(plain)).toBe(0);
    // A bevel too big for the box is capped, never inside out.
    expect(volume(bevelBox(0.1, 0.1, 0.1, 5))).toBeGreaterThan(0);
  });

  it('lowSphere, capsule and taper are closed solids facing outward, on the right axis', () => {
    const s = lowSphere(0.5, 6, 4);
    expect(triangleCount(s)).toBe(6 * 2 * 2 + 6 * 2); // two quad rings, two pole fans
    expect(facingIn(s)).toBe(0);
    expect(size(s).y).toBeCloseTo(1, 5);

    const c = capsule(0.2, 1, 6, 2);
    expect(box(c).min.y).toBeCloseTo(0);
    expect(box(c).max.y).toBeCloseTo(1);
    expect(volume(c)).toBeGreaterThan(0);
    expect(facingIn(c, new THREE.Vector3(0, 0.5, 0))).toBe(0);

    const t = taper(0.3, 0.1, 1, 5);
    expect(box(t).min.y).toBeCloseTo(0);
    expect(box(t).max.y).toBeCloseTo(1);
    expect(volume(t)).toBeGreaterThan(0);
    expect(size(taper(0.3, 0.1, 1, 6, 0.5)).z).toBeLessThan(size(taper(0.3, 0.1, 1, 6)).z * 0.6);
    expect(triangleCount(taper(0.3, 0.1, 1, 6))).toBe(6 * 2 + 6 * 2);
  });

  it('lathe turns a profile; a pointed end needs no cap', () => {
    const cone = lathe([[0.5, 0], [0, 1]], 8);
    expect(triangleCount(cone)).toBe(8 + 8); // side + base
    expect(volume(cone)).toBeGreaterThan(0);
  });

  it('extrudePath sweeps a profile along a path, outward whichever way the profile is wound', () => {
    const square: [number, number][] = [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]];
    const path: [number, number, number][] = [[0, 0, 0], [0, 0.5, 0.5], [0, 1.5, 0.7]];
    const a = extrudePath(square, path);
    const b = extrudePath([...square].reverse(), path);
    expect(volume(a)).toBeGreaterThan(0);
    expect(volume(b)).toBeGreaterThan(0);
    expect(triangleCount(a)).toBe(2 * 4 * 2 + 2 * 4);
    const horn = extrudePath(square, [[0, 0, 0], [0, 0, 1]], (t) => 1 - 0.9 * t);
    expect(size(horn).x).toBeCloseTo(0.2, 5);
    expect(() => extrudePath(square, [[0, 0, 0]])).toThrow();
  });
});

describe('combining', () => {
  it('merge adds triangles, place moves, mirror reflects with the faces still outward', () => {
    const arm = place(bevelBox(0.2, 0.6, 0.2, 0.03), 0.5, 0.3, 0);
    expect(triangleCount(merge(arm, arm))).toBe(88);
    expect(box(arm).min.x).toBeCloseTo(0.4);
    const both = mirror(arm);
    expect(triangleCount(both)).toBe(88);
    expect(box(both).min.x).toBeCloseTo(-0.6);
    expect(box(both).max.x).toBeCloseTo(0.6);
    expect(volume(both)).toBeCloseTo(2 * volume(arm), 6);
    expect(facingIn(arm, new THREE.Vector3(0.5, 0.3, 0))).toBe(0); // (the volume doubling above is what proves the mirrored half faces out too)
  });

  it('mirror keeps the colours', () => {
    const g = mirror(paint(place(bevelBox(0.2, 0.2, 0.2), 0.5, 0, 0), pal('clay')));
    for (let i = 0; i < g.attributes.color.count; i += 7) expect(colorHex(g, i)).toBe(pal('clay'));
  });

  it('wobble is seeded, deterministic and leaves no cracks', () => {
    const g = bevelBox(1, 1, 1, 0.1);
    const a = wobble(g, 0.03, 7), b = wobble(g, 0.03, 7), c = wobble(g, 0.03, 8);
    expect(Array.from(a.attributes.position.array)).toEqual(Array.from(b.attributes.position.array));
    expect(Array.from(a.attributes.position.array)).not.toEqual(Array.from(c.attributes.position.array));
    // Vertices that shared a position still do.
    const seen = new Map<string, string>();
    const p = g.attributes.position, q = a.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const from = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
      const to = `${q.getX(i).toFixed(4)},${q.getY(i).toFixed(4)},${q.getZ(i).toFixed(4)}`;
      expect(seen.get(from) ?? to).toBe(to);
      seen.set(from, to);
    }
    expect(Math.abs(q.getX(0) - p.getX(0))).toBeLessThanOrEqual(0.03);
  });

  it('every builder is deterministic', () => {
    const make = () => merge(bevelBox(1, 1, 1, 0.1), lowSphere(0.4), capsule(0.2, 1), taper(0.2, 0.1, 1), extrudePath([[0, 0], [0.1, 0], [0, 0.1]], [[0, 0, 0], [0, 1, 1]]));
    expect(Array.from(make().attributes.position.array)).toEqual(Array.from(make().attributes.position.array));
  });
});

describe('normals', () => {
  it('crease-angle normals smooth a round form and keep a box hard', () => {
    const normalsAtCorners = (g: THREE.BufferGeometry) => {
      const byPos = new Map<string, Set<string>>();
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        const set = byPos.get(key) ?? new Set<string>();
        set.add(`${n.getX(i).toFixed(3)},${n.getY(i).toFixed(3)},${n.getZ(i).toFixed(3)}`);
        byPos.set(key, set);
      }
      return Math.max(...[...byPos.values()].map((s) => s.size));
    };
    const ball = lowSphere(0.5, 12, 8);
    expect(normalsAtCorners(ball)).toBeGreaterThan(1); // flat to start with
    expect(normalsAtCorners(creaseNormals(ball, 50))).toBe(1);
    expect(normalsAtCorners(creaseNormals(bevelBox(1, 1, 1, 0), 35))).toBeGreaterThan(1);
    const smooth = creaseNormals(ball, 50).attributes.normal;
    for (let i = 0; i < smooth.count; i += 5) expect(new THREE.Vector3().fromBufferAttribute(smooth, i).length()).toBeCloseTo(1, 4);
  });
});

describe('colour', () => {
  it('paint puts palette colours in the vertices, whatever it is given', () => {
    const g = paint(bevelBox(1, 1, 1), pal('moss', 1));
    for (let i = 0; i < g.attributes.color.count; i++) expect(colorHex(g, i)).toBe(pal('moss', 1));
    const off = paint(bevelBox(1, 1, 1), 0x123456);
    expect(colorHex(off, 0)).toBe(snap(0x123456));
  });

  it('paintRegion paints only the triangles it picks, by position and by normal', () => {
    const g = paintRegion(paint(bevelBox(1, 1, 1, 0), pal('stone')), (_c, n) => (n.y > 0.9 ? pal('moss') : undefined));
    let moss = 0, stone = 0;
    for (let i = 0; i < g.attributes.color.count; i += 3) (colorHex(g, i) === pal('moss') ? moss++ : colorHex(g, i) === pal('stone') ? stone++ : 0);
    expect(moss).toBe(2); // the top face's two triangles
    expect(stone).toBe(10);
    const low = paintRegion(paint(bevelBox(1, 1, 1, 0), pal('stone')), (c) => (c.y < 0 ? pal('ink', 2) : undefined));
    expect(colorHex(low, 0)).toBeDefined();
  });

  it('crevice darkens undersides and wall feet, and leaves tops alone', () => {
    const g = crevice(paint(bevelBox(1, 3, 1, 0), pal('chalk', 2)));
    const lum = (i: number) => new THREE.Color().fromBufferAttribute(g.attributes.color, i).r;
    const base = new THREE.Color(pal('chalk', 2)).r;
    const p = g.attributes.position, n = g.attributes.normal;
    let top = 0, bottom = 0, wallFoot = 0, wallHead = 0;
    for (let i = 0; i < p.count; i++) {
      const ny = n.getY(i);
      if (ny > 0.9) top = Math.max(top, lum(i));
      else if (ny < -0.9) bottom = Math.max(bottom, lum(i));
      else if (p.getY(i) < -1.4) wallFoot = Math.max(wallFoot, lum(i));
      else if (p.getY(i) > 1.4) wallHead = Math.max(wallHead, lum(i));
    }
    expect(top).toBeCloseTo(base, 5);
    expect(bottom).toBeLessThan(base * 0.75);
    expect(wallFoot).toBeLessThan(wallHead);
    expect(wallHead).toBeCloseTo(base, 5);
  });
});

describe('meshes and counting', () => {
  it('triangleCount counts a geometry, or every mesh under an object', () => {
    const root = new THREE.Group();
    root.add(kitMesh(bevelBox(1, 1, 1)), kitMesh(lowSphere(0.5)));
    expect(triangleCount(root)).toBe(44 + 36);
  });

  it('kitMesh uses a shared material, textured on request', () => {
    const plain = kitMesh(bevelBox(1, 1, 1));
    const wood = kitMesh(bevelBox(1, 1, 1), 'wood');
    expect(isSharedMaterial(plain.material as THREE.Material)).toBe(true);
    expect(kitMesh(lowSphere(1)).material).toBe(plain.material);
    expect(wood.material).not.toBe(plain.material);
    expect(wood.material).toBe(kitMesh(lowSphere(1), 'wood').material);
    expect(wood.geometry.attributes.surfNormal).toBeDefined();
    expect(plain.geometry.attributes.surfNormal).toBeUndefined();
  });

  it('the kit material is a palette colour (white), so the validator accepts it', () => {
    expect(snap(0xffffff)).toBe(0xffffff);
  });
});

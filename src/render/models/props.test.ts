import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { assetById } from './registry';
import { inspect, TRIANGLE_BUDGET } from './validate';
import { buildChest, buildJar, buildSign } from './props';

describe('the chest (modeling kit, baked per joint)', () => {
  it('keeps the old size, hinge and joints', () => {
    const m = buildChest(true);
    m.root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(m.root).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.4);
    expect(size.x).toBeLessThan(1.6);
    expect(size.y).toBeGreaterThan(1.2); // 0.8 body + 0.48 dome
    expect(size.y).toBeLessThan(1.4);
    expect(size.z).toBeGreaterThan(0.95);
    expect(size.z).toBeLessThan(1.2); // the padlock sticks out front, the straps a hair behind
    expect(m.joints.lid.position.toArray()).toEqual([0, 0.8, -0.47]);
    expect(m.joints.padlock.position.toArray()).toEqual([0, 0.6, 0.56]);
    expect(buildChest(false).joints.padlock.visible).toBe(false);
    expect(m.joints.padlock.visible).toBe(true);
  });

  it('opens by turning the lid about its hinge, so the dome rises and swings back', () => {
    const m = buildChest(false);
    const top = () => {
      m.root.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(m.joints.lid).max;
    };
    const shut = top();
    m.joints.lid.rotation.x = -1.9;
    const open = top();
    expect(open.z).toBeLessThan(shut.z - 0.3);
    expect(open.y).toBeGreaterThan(shut.y - 0.1);
  });

  it('is a few merged meshes, inside the prop budget, and clean even as a final asset', () => {
    const m = buildChest(true);
    const meshes: THREE.Mesh[] = [];
    m.root.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes.length).toBeLessThanOrEqual(5);
    const entry = assetById('chest')!;
    const report = inspect({ ...entry, tier: 'final' });
    expect(report.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET.prop);
    expect(report.problems).toEqual([]);
    expect(m.flashMats).toEqual([]);
  });
});

describe('the jar (kit lathe, one mesh)', () => {
  it('is a 1.1 m pot that fits the collider the world gives it', () => {
    const m = buildJar();
    m.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m.root);
    expect(b.min.y).toBeGreaterThan(-0.01);
    expect(b.max.y).toBeGreaterThan(1.05);
    expect(b.max.y).toBeLessThan(1.15);
    expect(Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z)).toBeLessThan(0.43); // JarField's ball is 0.42
    expect(b.max.x - b.min.x).toBeGreaterThan(0.7);
  });

  it('is closed all round: every edge of the lathe is shared by two triangles (no seam slit)', () => {
    const meshes: THREE.Mesh[] = [];
    buildJar().root.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    const pos = meshes[0].geometry.attributes.position;
    const key = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1e4)).join(',');
    const edges = new Map<string, number>();
    for (let t = 0; t < pos.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = key(t + k), b = key(t + ((k + 1) % 3));
        if (a === b) continue;
        const e = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(e, (edges.get(e) ?? 0) + 1);
      }
    }
    expect([...edges.values()].filter((n) => n !== 2)).toEqual([]);
  });

  it('is one mesh, in the budget, and clean as a final asset', () => {
    const meshes: THREE.Mesh[] = [];
    buildJar().root.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes).toHaveLength(1);
    const report = inspect(assetById('jar')!);
    expect(report.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET.prop);
    expect(report.problems).toEqual([]);
  });
});

describe('the sign (kit posts and planks, a lit notice)', () => {
  /** The ink and seal share a mesh with the footing stones: its size says how many scribbles the seed drew. */
  const scribbles = (seed: number) => {
    const out: number[] = [];
    buildSign(seed).root.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).userData.surface === 'plaster' && !(o.material as THREE.MeshLambertMaterial).emissive.getHex()) out.push(o.geometry.attributes.position.count);
    });
    return out;
  };

  it('stands on the ground facing +z: a post under a cap, the notice on the front', () => {
    const m = buildSign(7);
    m.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m.root);
    expect(b.min.y).toBeGreaterThan(-0.08); // the footing stones sit a little into the ground
    expect(b.max.y).toBeGreaterThan(2.2);
    expect(b.max.y).toBeLessThan(2.6);
    expect(b.max.x - b.min.x).toBeLessThan(2.1);
    const paper = m.root.children.find((o) => o instanceof THREE.Mesh && (o.material as THREE.MeshLambertMaterial).emissive.getHex() !== 0) as THREE.Mesh;
    expect(paper).toBeDefined();
    expect(paper.position.z).toBeGreaterThan(0.06); // in front of the planks
    expect(m.animated).toContain(paper.material);
  });

  it('scribbles the same for a seed and differently for another', () => {
    expect(scribbles(40)).toEqual(scribbles(40));
    expect(scribbles(40)).not.toEqual(scribbles(1234));
  });

  it('is three meshes, in the budget, and clean as a final asset', () => {
    const meshes: THREE.Mesh[] = [];
    buildSign(7).root.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes).toHaveLength(3);
    const report = inspect(assetById('sign')!);
    expect(report.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET.prop);
    expect(report.problems).toEqual([]);
  });
});

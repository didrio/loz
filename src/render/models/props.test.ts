import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { assetById } from './registry';
import { inspect, TRIANGLE_BUDGET } from './validate';
import { buildChest } from './props';

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

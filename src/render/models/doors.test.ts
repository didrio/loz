import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildHingedDoor, buildStoneDoor } from './doors';
import { assetById } from './registry';
import { inspect, TRIANGLE_BUDGET } from './validate';

const boxOf = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};
const meshesOf = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((m) => m instanceof THREE.Mesh && out.push(m));
  return out;
};

describe('the hinged door (kit, baked on its pivot)', () => {
  it('keeps the rough\'s size, hinge and facing', () => {
    const m = buildHingedDoor();
    const b = boxOf(m.root);
    expect(m.joints.pivot.position.toArray()).toEqual([-0.72, 0, 0]);
    expect(b.min.x).toBeGreaterThan(-0.8);
    expect(b.max.x).toBeLessThan(0.75);
    expect(b.min.y).toBeGreaterThan(-0.01); // stands on its bottom edge
    expect(b.max.y).toBeGreaterThan(2.2);
    expect(b.max.y).toBeLessThan(2.35);
    expect(b.max.z).toBeLessThan(0.2);
    expect(b.min.z).toBeGreaterThan(-0.2);
  });

  it('swings about the hinge: opening carries the free edge across to the other side', () => {
    const m = buildHingedDoor();
    const free = () => boxOf(m.joints.pivot).max;
    expect(free().x).toBeGreaterThan(0.6);
    m.joints.pivot.rotation.y = 1.75;
    const b = boxOf(m.joints.pivot);
    expect(b.max.x).toBeLessThan(-0.55); // the far edge now stands almost on the hinge's side
    expect(Math.abs(b.max.z - b.min.z)).toBeGreaterThan(1.3);
  });

  it('takes any size, is two meshes, and is clean as a final asset', () => {
    const wide = buildHingedDoor(2, 2.6);
    expect(boxOf(wide.root).max.y).toBeGreaterThan(2.5);
    const meshes = meshesOf(buildHingedDoor().root);
    expect(meshes.length).toBeLessThanOrEqual(2);
    const report = inspect(assetById('hinged-door')!);
    expect(report.tier).toBe('final');
    expect(report.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET.prop);
    expect(report.problems).toEqual([]);
  });
});

describe('the stone door (kit slab, an unbaked glyph)', () => {
  it('is the shrine\'s slab: 0.6 thick, 6.3 tall, 4 wide, centred on the origin', () => {
    const m = buildStoneDoor();
    const b = boxOf(m.joints.slab);
    expect(b.min.y).toBeCloseTo(-3.15, 1);
    expect(b.max.y).toBeCloseTo(3.15, 1);
    expect(b.min.z).toBeCloseTo(-2, 1);
    expect(b.max.z).toBeCloseTo(2, 1);
    expect(b.max.x).toBeCloseTo(0.3, 1); // the back is flat
    expect(b.min.x).toBeLessThan(-0.3); // the glyph and border stand proud of the front
  });

  it('moves as one: the world sets the slab joint\'s position to sink it', () => {
    const m = buildStoneDoor();
    m.joints.slab.position.set(10, 5, -3);
    expect(boxOf(m.root).max.y).toBeCloseTo(8.15, 1);
  });

  it('keeps the glyph on its own material, for the world to recolour', () => {
    const m = buildStoneDoor();
    const glyph = meshesOf(m.root).filter((x) => x.material === m.glyphMat);
    expect(glyph).toHaveLength(1);
    expect(m.animated).toContain(m.glyphMat);
    // The glyph sits on the -x face and inside the border, so it reads from the front of the doorway.
    const b = boxOf(glyph[0]);
    expect(b.max.x).toBeLessThan(0);
    expect(b.min.z).toBeGreaterThan(-1.2);
    expect(b.max.z).toBeLessThan(1.2);
    expect(meshesOf(m.root)).toHaveLength(2);
  });

  it('is inside the prop budget and clean as a final asset', () => {
    const report = inspect(assetById('stone-door')!);
    expect(report.tier).toBe('final');
    expect(report.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET.prop);
    expect(report.problems).toEqual([]);
  });
});

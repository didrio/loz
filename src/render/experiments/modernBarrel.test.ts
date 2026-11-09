import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildModernBarrel, triangles } from './modernBarrel';

describe('the modern-stylized barrel (T62)', () => {
  const barrel = buildModernBarrel();

  it('is a modern prop budget: 1-3k triangles', () => {
    const n = triangles(barrel);
    expect(n).toBeGreaterThanOrEqual(1000);
    expect(n).toBeLessThanOrEqual(3000);
  });

  it("is today's barrel's size: 1 m tall, a 0.48 m belly (plus its hoops)", () => {
    const box = new THREE.Box3().setFromObject(barrel);
    const size = box.getSize(new THREE.Vector3());
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(size.y).toBeCloseTo(1, 2);
    expect(size.x / 2).toBeGreaterThan(0.47);
    expect(size.x / 2).toBeLessThan(0.5);
  });

  it('is smooth-shaded with clean materials: matte wood, metal iron', () => {
    const mats = new Set<THREE.MeshStandardMaterial>();
    barrel.traverse((o) => { if (o instanceof THREE.Mesh) mats.add(o.material as THREE.MeshStandardMaterial); });
    const list = [...mats];
    expect(list.every((m) => m instanceof THREE.MeshStandardMaterial && !m.flatShading)).toBe(true);
    expect(list.some((m) => m.metalness > 0.5)).toBe(true);
    expect(list.some((m) => m.metalness === 0 && m.roughness > 0.6)).toBe(true);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GroundShadow } from './shapes';

describe('GroundShadow', () => {
  it('sits on the ground, smaller and fainter the higher the thing above it flies', () => {
    const scene = new THREE.Scene();
    const s = new GroundShadow(scene, 1);
    s.place(2, 1, 3, 0);
    expect(s.mesh.visible).toBe(true);
    expect(s.mesh.position.y).toBeCloseTo(0.04);
    expect(s.mesh.position.x).toBe(2);
    const low = { size: s.mesh.scale.x, alpha: (s.mesh.material as THREE.MeshBasicMaterial).opacity };
    s.place(2, 6, 3, 0);
    expect(s.mesh.scale.x).toBeLessThan(low.size);
    expect((s.mesh.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(low.alpha);
    s.place(2, 40, 3, 0); // far too high to cast one
    expect(s.mesh.visible).toBe(false);
    s.place(2, 1, 3, null); // nothing below
    expect(s.mesh.visible).toBe(false);
    s.dispose();
    expect(scene.children.length).toBe(0);
  });
});

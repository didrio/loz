import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blobConfig, GroundShadow } from './shapes';

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

  it("a character's blob gives way to the sun's shadow map, a marker's stays", () => {
    const scene = new THREE.Scene();
    const character = new GroundShadow(scene, 1, 'character');
    const marker = new GroundShadow(scene, 1);
    try {
      blobConfig.realShadows = true;
      character.place(0, 0, 0, 0);
      marker.place(0, 1, 0, 0);
      expect(character.mesh.visible).toBe(false);
      expect(marker.mesh.visible).toBe(true);
      blobConfig.realShadows = false; // indoors, or Shadows off: everything as before
      character.place(0, 0, 0, 0);
      expect(character.mesh.visible).toBe(true);
    } finally {
      blobConfig.realShadows = false;
    }
  });
});

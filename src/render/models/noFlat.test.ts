import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ASSETS } from './registry';

/**
 * No object is one flat colour (owner, 2026-11-08): every mesh of a final model wears a tile. The only exceptions are glows,
 * which are unlit `MeshBasicMaterial`s: the Thornling's eyes and the stone door's glyph.
 */
function plainMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.Material;
    if (m.userData.surface || m instanceof THREE.MeshBasicMaterial) return;
    out.push(o);
  });
  return out;
}

describe('final models: nothing is one flat colour', () => {
  for (const a of ASSETS.filter((x) => x.tier === 'final')) {
    it(a.id, () => {
      const plain = plainMeshes(a.build().root).map((m) => `${m.parent?.name || 'root'}: ${m.geometry.attributes.position.count} vertices`);
      expect(plain).toEqual([]);
    });
  }
});

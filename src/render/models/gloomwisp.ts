import * as THREE from 'three';
import { fadeInFog, uniqueMat } from '../materials';
import type { Model } from './types';

/** A will-o'-wisp: a small dark core that glows violet (and flashes white when hit) inside a soft additive halo. */
export function buildGloomwisp(): Model<{ core: THREE.Mesh; halo: THREE.Mesh }> & { coreMat: THREE.MeshLambertMaterial } {
  const coreMat = uniqueMat(0x2a1840, { emissive: 0x6a2fb0 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), coreMat);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 10, 8),
    fadeInFog(new THREE.MeshBasicMaterial({ color: 0xb06aff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
  const root = new THREE.Group();
  root.add(core, halo);
  return { root, joints: { core, halo }, flashMats: [coreMat], coreMat };
}

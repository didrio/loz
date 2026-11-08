import * as THREE from 'three';
import { uniqueSurf } from '../materials';
import { faceted } from '../textures';
import type { Model } from './types';

/** A hopping ball of thorns: a faceted ball, a spike on every vertex of the back and sides, two yellow eyes. */
export function buildThornling(): Model<{ body: THREE.Group }> {
  const skin = uniqueSurf('hide', 0x7a2f4a), thorn = uniqueSurf('bark', 0xc9b27a), eye = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const root = new THREE.Group();
  const body = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 0), skin);
  body.add(ball);
  const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const seen = new Set<string>();
  const spikeGeo = faceted(new THREE.ConeGeometry(0.13, 0.5, 5));
  for (let i = 0; i < dirs.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
    const k = v.toArray().map((n) => n.toFixed(2)).join();
    if (seen.has(k) || v.z > 0.7) continue;
    seen.add(k);
    const spike = new THREE.Mesh(spikeGeo, thorn);
    spike.position.copy(v).multiplyScalar(0.7);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    body.add(spike);
  }
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), eye);
    e.position.set(s * 0.22, 0.12, 0.58);
    body.add(e);
  }
  body.position.y = 0.75;
  root.add(body);
  return { root, joints: { body }, flashMats: [skin, thorn] };
}

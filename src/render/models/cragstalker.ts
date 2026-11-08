import * as THREE from 'three';
import { uniqueSurf } from '../materials';
import { faceted } from '../textures';
import type { Model } from './types';

/**
 * The Cragstalker: a long, low body of hide with a ridge of stone plates down its back, a head hung low and forward under
 * a blunt stone brow, four long legs and a stiff tail. `eyeMat` lights for the crouch (the lunge's tell).
 */
export function buildCragstalker(): Model<{ body: THREE.Group; head: THREE.Group }> & { eyeMat: THREE.MeshBasicMaterial; legs: THREE.Mesh[] } {
  const rock = uniqueSurf('rock', 0x7a7468), slab = uniqueSurf('rock', 0x5f5a50), hide = uniqueSurf('hide', 0xa9865a), belly = uniqueSurf('hide', 0xc9a878);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x5a3a1a });
  const root = new THREE.Group();
  const body = new THREE.Group();
  const legs: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const torso = add(new THREE.BoxGeometry(0.8, 0.6, 1.7), hide, 0, 0.7, 0);
  torso.rotation.x = 0.04;
  add(new THREE.BoxGeometry(0.6, 0.25, 1.5), belly, 0, 0.45, 0);
  for (let i = 0; i < 4; i++) {
    const plate = add(new THREE.IcosahedronGeometry(0.3 - i * 0.02, 0), i % 2 ? slab : rock, 0, 1.05, -0.55 + i * 0.4);
    plate.scale.set(1.1, 0.7, 1);
  }
  // The head hangs low and forward, with a blunt stone brow.
  const head = new THREE.Group();
  head.position.set(0, 0.75, 1.0);
  body.add(head);
  add(new THREE.BoxGeometry(0.55, 0.42, 0.62), hide, 0, 0, 0.1, head);
  add(new THREE.BoxGeometry(0.62, 0.16, 0.5), rock, 0, 0.26, 0.05, head);
  for (const s of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.07, 6, 4), eyeMat, s * 0.18, 0.1, 0.4, head);
    eye.scale.set(1.3, 0.8, 0.6);
  }
  // Four long legs and a stiff tail.
  for (const [lx, lz] of [[-0.42, 0.6], [0.42, 0.6], [-0.42, -0.6], [0.42, -0.6]]) {
    legs.push(add(new THREE.BoxGeometry(0.2, 0.7, 0.24), hide, lx, 0.35, lz));
  }
  const tail = add(faceted(new THREE.ConeGeometry(0.14, 1.0, 5)), slab, 0, 0.85, -1.4);
  tail.rotation.x = -Math.PI / 2 + 0.5;
  root.add(body);
  return { root, joints: { body, head }, flashMats: [rock, slab, hide, belly], eyeMat, legs };
}

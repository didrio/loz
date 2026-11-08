import * as THREE from 'three';
import { uniqueSurf } from '../materials';
import { faceted } from '../textures';
import type { Model } from './types';

/**
 * The Shellback: a low stone dome with ridged plates, a pale soft rump and tail at the back, a visor that comes down over
 * its face with two eye holes, and four feet (the back two stick out and can be hit). `eyes` narrow when it tucks;
 * `legs` are front-left, front-right, back-left, back-right.
 */
export function buildShellback(): Model<{ body: THREE.Group }> & { eyes: THREE.Mesh[]; legs: THREE.Mesh[] } {
  const shell = uniqueSurf('scales', 0x5b6470), plate = uniqueSurf('rock', 0x76808c), skin = uniqueSurf('hide', 0xb7875a), soft = uniqueSurf('hide', 0xd9a070);
  const root = new THREE.Group();
  const body = new THREE.Group();
  const eyes: THREE.Mesh[] = [];
  const legs: THREE.Mesh[] = [];
  // A low dome with ridged plates on top; a pale, soft rump at the back.
  const dome = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.95, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)), shell);
  dome.scale.set(1, 0.7, 1.15);
  dome.position.y = 0.25;
  body.add(dome);
  for (const [px, pz] of [[0, 0.45], [0, -0.1], [0, -0.6], [-0.5, 0.15], [0.5, 0.15]]) {
    const ridge = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), plate);
    ridge.scale.set(1, 0.6, 1);
    ridge.position.set(px, 0.25 + 0.6 * Math.sqrt(Math.max(0, 1 - (px * px) / 0.9 - (pz * pz) / 1.3)), pz);
    body.add(ridge);
  }
  const rump = new THREE.Mesh(faceted(new THREE.SphereGeometry(0.42, 7, 5)), soft);
  rump.scale.set(1.2, 0.8, 0.7);
  rump.position.set(0, 0.35, -0.95);
  body.add(rump);
  const tail = new THREE.Mesh(faceted(new THREE.ConeGeometry(0.16, 0.45, 5)), soft);
  tail.rotation.x = -Math.PI / 2 - 0.3;
  tail.position.set(0, 0.3, -1.35);
  body.add(tail);
  // No soft face: the shell's front lip comes down to the floor, with two eye holes.
  const visor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.5, 0.3), plate);
  visor.position.set(0, 0.3, 0.92);
  visor.rotation.x = -0.25;
  body.add(visor);
  const hole = new THREE.MeshBasicMaterial({ color: 0x0b0a09 }), eye = new THREE.MeshBasicMaterial({ color: 0xb08a2e });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.05), hole);
    h.position.set(s * 0.22, 0.04, 0.14);
    visor.add(h);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eye);
    e.scale.set(1.3, 1, 0.6);
    e.position.set(s * 0.22, 0.04, 0.16);
    visor.add(e);
    eyes.push(e);
  }
  // Front feet tucked under the shell; the back feet stick out behind (and can be hit).
  for (const [lx, lz] of [[-0.6, 0.55], [0.6, 0.55], [-0.88, -0.45], [0.88, -0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.3), skin);
    leg.position.set(lx, 0.15, lz);
    legs.push(leg);
    body.add(leg);
  }
  root.add(body);
  return { root, joints: { body }, flashMats: [shell, plate, skin, soft], eyes, legs };
}

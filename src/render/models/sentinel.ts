import * as THREE from 'three';
import { uniqueSurf } from '../materials';
import type { Model } from './types';

/**
 * The Dozing Sentinel: a stone statue with a broad square torso, a heavy block head, and a two-handed maul held in front.
 * `arms` pivots at the shoulders and carries the maul (its armor hurtboxes ride it); `head` nods.
 */
export function buildSentinel(): Model<{ body: THREE.Group; arms: THREE.Group; head: THREE.Group }> & { eyeMat: THREE.MeshBasicMaterial } {
  const stone = uniqueSurf('stone', 0xa39880), dark = uniqueSurf('stone', 0x7d735f), maulMat = uniqueSurf('rock', 0x6b6253);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a241c });
  const root = new THREE.Group();
  const body = new THREE.Group();
  const arms = new THREE.Group();
  const head = new THREE.Group();
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, into: THREE.Object3D) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    into.add(mesh);
    return mesh;
  };
  // Legs and a broad, square torso; the head a heavy block with a brow.
  box(0.45, 0.9, 0.5, dark, -0.32, 0.45, 0, body);
  box(0.45, 0.9, 0.5, dark, 0.32, 0.45, 0, body);
  box(1.3, 1.1, 0.75, stone, 0, 1.45, 0, body);
  box(1.6, 0.3, 0.85, dark, 0, 2.05, 0, body); // shoulders
  head.position.set(0, 2.2, 0.05);
  box(0.6, 0.6, 0.6, stone, 0, 0.3, 0, head);
  box(0.7, 0.14, 0.2, dark, 0, 0.45, 0.3, head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), eyeMat);
    eye.position.set(s * 0.15, 0.3, 0.31);
    head.add(eye);
  }
  body.add(head);
  // Arms pivot at the shoulders and hold the maul together in front.
  arms.position.set(0, 1.95, 0);
  for (const s of [-1, 1]) box(0.3, 1.0, 0.32, stone, s * 0.62, -0.45, 0.25, arms);
  box(0.95, 0.2, 0.25, dark, 0, -0.95, 0.4, arms); // the hands
  box(0.16, 1.7, 0.16, dark, 0, -0.95, 1.2, arms).rotation.x = Math.PI / 2; // haft
  box(0.55, 0.55, 0.85, maulMat, 0, -0.95, 2.35, arms); // head of the maul
  body.add(arms);
  root.add(body);
  return { root, joints: { body, arms, head }, flashMats: [stone, dark, maulMat], eyeMat };
}

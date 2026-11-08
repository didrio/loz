import * as THREE from 'three';
import { uniqueMat, uniqueSurf, surf } from '../materials';
import { glow, heartGeometry, shieldModel } from '../shapes';
import { faceted } from '../textures';
import type { Model } from './types';

/**
 * The world's props as pure builders: geometry and materials only. `world/objects.ts` places them, adds colliders and
 * animates the named joints. Every builder is registered in `registry.ts`.
 */

/** A treasure chest with a hinged lid, its front (lock side) facing +z. A locked chest wears an iron padlock until it's opened. */
export function buildChest(locked = false): Model<{ lid: THREE.Group; padlock: THREE.Group }> {
  const wood = surf('wood', 0x7a4a24), trim = surf('metal', 0xc9a227), dark = surf('wood', 0x3a2412);
  const root = new THREE.Group();
  const lid = new THREE.Group();
  const padlock = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.95), wood);
  base.position.y = 0.4;
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 1.0), trim);
  band.position.y = 0.7;
  lid.position.set(0, 0.8, -0.47);
  // A half cylinder lying along the chest's width (x), domed side up.
  const lidMesh = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.48, 0.48, 1.4, 8, 1, false, 0, Math.PI)), wood);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.position.z = 0.47;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.08), trim);
  lock.position.set(0, 0.05, 0.96);
  // The half cylinder has no flat face; close its underside so the open lid isn't see-through.
  const underside = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.96), dark);
  underside.position.set(0, -0.01, 0.47);
  lid.add(lidMesh, lock, underside);
  const inside = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.85), dark);
  inside.position.y = 0.78;
  // The padlock hangs from the clasp on the front.
  const iron = surf('metal', 0x4a4d52);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.12), iron);
  const shackle = new THREE.Mesh(faceted(new THREE.TorusGeometry(0.1, 0.03, 4, 10, Math.PI)), iron);
  shackle.position.y = 0.13;
  const hole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.02), dark);
  hole.position.set(0, -0.02, 0.065);
  padlock.add(body, shackle, hole);
  padlock.position.set(0, 0.6, 0.56);
  padlock.visible = locked;
  root.add(base, band, inside, lid, padlock);
  return { root, joints: { lid, padlock }, flashMats: [] };
}

/**
 * A plank door on a hinge. It faces +z, hinged on its -x edge (`pivot` swings about it); `root` stands on the middle of the
 * door's bottom edge, so a house yaw turns it in place.
 */
export function buildHingedDoor(width = 1.44, height = 2.3, color = 0x4a2e18): Model<{ pivot: THREE.Group }> {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.x = -width / 2;
  root.add(pivot);
  const strap = surf('leather', 0x33200f);
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(px + width / 2, py, pz);
    pivot.add(me);
  };
  part(new THREE.BoxGeometry(width, height, 0.14), surf('wood', color), 0, height / 2, 0);
  for (const side of [-1, 1]) {
    for (const px of [-width / 4, 0, width / 4]) part(new THREE.BoxGeometry(0.04, height, 0.02), strap, px, height / 2, side * 0.08);
    for (const py of [0.45, height - 0.35]) part(new THREE.BoxGeometry(width - 0.24, 0.08, 0.03), strap, 0, py, side * 0.085);
    part(faceted(new THREE.SphereGeometry(0.07, 6, 5)), surf('metal', 0xc9a227), width / 2 - 0.22, 1.1, side * 0.13);
  }
  return { root, joints: { pivot }, flashMats: [] };
}

/**
 * A stone slab (a door across a doorway, `width` along z and `height` tall, centred on the origin) with a spiral glyph on its
 * -x face. `glyphMat` is the glyph's colour: dark while the door sleeps, bright once it's awake.
 */
export function buildStoneDoor(width = 4, height = 6.3): Model<{ slab: THREE.Mesh }> & { glyphMat: THREE.MeshBasicMaterial } {
  const glyphMat = new THREE.MeshBasicMaterial({ color: 0x5ff2d6 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, width), surf('stone', 0x77736a));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 18), glyphMat);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-0.32, 0.3, 0);
  const dot = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), glyphMat);
  dot.position.set(-0.34, 0.3, 0);
  slab.add(ring, dot);
  const root = new THREE.Group();
  root.add(slab);
  return { root, joints: { slab }, flashMats: [], glyphMat };
}

/** A floating heart container: a chunky heart in a gold ring, with a soft pink glow. Centred on the origin. */
export function buildHeartVessel(): Model<{ heart: THREE.Mesh }> {
  const heart = new THREE.Mesh(heartGeometry(0.22), uniqueMat(0xff3b5c, { emissive: 0x5a0d1a }));
  heart.scale.setScalar(1.6);
  const rim = new THREE.Mesh(faceted(new THREE.TorusGeometry(0.75, 0.05, 6, 24)), surf('metal', 0xe8c770));
  const root = new THREE.Group();
  root.add(heart, rim, glow(0xff7a8a, 1.0, 0.18));
  return { root, joints: { heart }, flashMats: [], animated: [heart.material as THREE.Material] };
}

/** Wren's shield lying on the floor, leaning back on its foot, with a glint on its boss (`glint`: the glow the pickup pulses). */
export function buildShieldPickup(): Model<{ glint: THREE.Mesh }> {
  const shield = shieldModel(surf('wood', 0x8b5a2b), surf('metal', 0x9a9fa6));
  shield.rotation.x = -0.35;
  shield.position.y = 0.42;
  const glint = glow(0xfff1c0, 0.16, 0.6);
  glint.position.set(0, 0.47, 0.12);
  const root = new THREE.Group();
  root.add(shield, glint);
  return { root, joints: { glint }, flashMats: [], animated: [glint.material as THREE.Material] };
}

/**
 * The great lantern atop the shrine: an octahedron of dark metal that glows from within as embers return, a halo and a
 * point light. All at the origin; the light is part of the model so the walls it lights are the model's business.
 */
export function buildGreatLantern(): Model<{ mesh: THREE.Mesh; halo: THREE.Mesh; light: THREE.PointLight }> & { material: THREE.MeshLambertMaterial } {
  const material = uniqueSurf('metal', 0x3a3a44, { emissive: 0x000000 });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), material);
  const halo = glow(0xff9a3a, 1.3, 0);
  const light = new THREE.PointLight(0xffa64a, 0, 26, 1.6);
  const root = new THREE.Group();
  root.add(mesh, halo, light);
  return { root, joints: { mesh, halo, light }, flashMats: [], animated: [material, halo.material as THREE.Material], material };
}

/** One cuttable bush: a faceted green blob, 1.5 m wide at scale 1. `BushField` draws many of its geometry as one instanced mesh. */
export function buildBush(): Model<{ blob: THREE.Mesh }> {
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), surf('foliage', 0x3f7d2e));
  blob.position.y = 0.45;
  blob.scale.set(1, 0.8, 1);
  const root = new THREE.Group();
  root.add(blob);
  return { root, joints: { blob }, flashMats: [] };
}

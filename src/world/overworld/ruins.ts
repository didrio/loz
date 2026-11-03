import * as THREE from 'three';
import { mat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { ShieldPickup } from '../objects';
import { RUINS, terrainHeight } from './layout';

/** Where a ruin's local point (front = +z) lands in the world. */
function toWorld(ruin: { x: number; z: number; yaw: number }, lx: number, lz: number) {
  const c = Math.cos(ruin.yaw), s = Math.sin(ruin.yaw);
  return { x: ruin.x + lx * c + lz * s, z: ruin.z - lx * s + lz * c };
}

/**
 * The ruined homes (`RUINS`): broken stone walls at uneven heights, a fallen roof, charred
 * rafters and rubble. Only the shield's cottage so far; it returns the shield lying inside,
 * leaning on the back wall where it shows through the doorway and over the low front wall.
 */
export function buildRuins(b: AreaBuilder) {
  const ruin = RUINS[0];
  const corners = [[0, 0], [-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]].map(([lx, lz]) => toWorld(ruin, lx, lz));
  const y = Math.max(...corners.map((p) => terrainHeight(p.x, p.z)));
  const g = new THREE.Group();
  g.position.set(ruin.x, y, ruin.z);
  g.rotation.y = ruin.yaw;
  const stone = mat(0x8f877a), plaster = mat(0xbfb399), thatch = mat(0x5a4632), char = mat(0x2e2620), plank = mat(0x6b4c30);
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, lx: number, ly: number, lz: number) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(lx, ly, lz);
    me.castShadow = me.receiveShadow = true;
    g.add(me);
    return me;
  };
  /** A wall stretch from a to b along one side, `h` tall above the floor (buried 0.6 m), with a collider. */
  const wall = (ax: number, az: number, bx: number, bz: number, h: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const [w, d] = along ? [len, 0.4] : [0.4, len];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    part(new THREE.BoxGeometry(w, h + 0.6, d), stone, mx, (h - 0.6) / 2, mz);
    // A band of old plaster on the inside face, stopping short of the broken top.
    if (h > 1.2) part(new THREE.BoxGeometry(along ? len - 0.2 : 0.06, h - 0.7, along ? 0.06 : len - 0.2), plaster, mx + (along ? 0 : -Math.sign(mx) * 0.22), (h - 0.7) / 2 + 0.1, mz + (along ? -Math.sign(mz) * 0.22 : 0));
    const p = toWorld(ruin, mx, mz);
    b.box(p.x, y + h / 2, p.z, w / 2, h / 2 + 0.3, d / 2, ruin.yaw);
  };

  // Floorboards, half rotted away, and the walls: tallest at the back, the front broken down low.
  part(new THREE.BoxGeometry(6.6, 0.12, 5.6), plank, 0, 0.06, 0);
  wall(-3.5, -3, -1, -3, 3.0);
  wall(-1, -3, 1.6, -3, 2.4);
  wall(1.6, -3, 3.5, -3, 1.4);
  wall(-3.5, -2.8, -3.5, 1, 2.8);
  wall(-3.5, 1, -3.5, 3, 1.2);
  wall(3.5, -2.8, 3.5, -0.6, 2.2);
  wall(3.5, 1.3, 3.5, 3, 0.7); // a breach in the east wall between these two
  wall(-3.5, 3, -0.4, 3, 1.9);
  wall(1.2, 3, 3.5, 3, 0.9); // the doorway between these two, a little right of center

  // The roof came down on the west side: a thatch slab leaning off the west wall onto the floor.
  const slab = part(new THREE.BoxGeometry(2.8, 0.22, 4.8), thatch, -2.2, 1.45, -0.6);
  slab.rotation.z = -0.75;
  const under = toWorld(ruin, -2.4, -0.6);
  b.box(under.x, y + 0.8, under.z, 1.0, 0.8, 2.4, ruin.yaw);
  // Charred rafters: one still spanning the back corner, one fallen across the doorway's threshold.
  part(new THREE.BoxGeometry(0.22, 0.22, 4.2), char, -1.2, 2.7, -1.2).rotation.set(0.25, 0, 0.1);
  part(new THREE.BoxGeometry(3.2, 0.2, 0.22), char, 1.6, 0.18, 3.9).rotation.set(0, 0.35, 0.06);
  part(new THREE.BoxGeometry(0.2, 0.2, 2.4), char, 2.4, 0.15, -1.6).rotation.set(0, 0.6, 0);
  // Rubble from the broken walls, inside and out.
  const rubble: [number, number, number][] = [[3.9, 0.3, 0.4], [4.3, -1.6, 0.25], [2.6, 3.6, 0.3], [-2.4, 3.6, 0.35], [-0.6, 3.5, 0.2], [2.9, -2.2, 0.3], [-4.1, 2.2, 0.3]];
  rubble.forEach(([lx, lz, r], i) => {
    part(new THREE.IcosahedronGeometry(r, 0), stone, lx, r * 0.5, lz).rotation.set(i, i * 2, 0);
  });
  b.staticGroup.add(g);

  // The shield, leaning on the back wall right of center, facing the doorway.
  const at = toWorld(ruin, 1.0, -2.45);
  return { shield: new ShieldPickup(b, at.x, y + 0.12, at.z, ruin.yaw) };
}

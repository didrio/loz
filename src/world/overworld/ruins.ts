import * as THREE from 'three';
import { mat, surf } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { JarField, type JarSpot } from '../jars';
import { ShieldPickup } from '../objects';
import { RUINS, terrainHeight } from './layout';

/** Where a ruin's local point (front = +z) lands in the world. */
function toWorld(ruin: { x: number; z: number; yaw: number }, lx: number, lz: number) {
  const c = Math.cos(ruin.yaw), s = Math.sin(ruin.yaw);
  return { x: ruin.x + lx * c + lz * s, z: ruin.z - lx * s + lz * c };
}

type Ruin = (typeof RUINS)[number];

/** Where jars stand in a ruin's local frame (scale 1, unflipped), and whether the spot is inside the walls. */
const JAR_SPOTS: [number, number, boolean][] = [
  [2.8, 0.5, true], [-0.2, -1.2, true], [-3.0, 2.2, true], [4.3, 1.4, false], [-4.0, 3.6, false], [1.0, -3.9, false],
];

/**
 * The ruined homes (`RUINS`): broken stone walls at uneven heights, a fallen roof, charred
 * rafters and rubble. Every ruin shares one plan (a 7 x 6 m shell, tallest at the back, the front
 * broken down low, a breach in one side, the roof fallen on the other); `scale` grows it, `flip`
 * mirrors it so neighbors don't look alike. Each holds a few jars (`jars`: what they hold).
 * Only the shield's cottage hides the shield, leaning on the back wall where it shows through
 * the doorway and over the low front wall.
 */
export function buildRuins(b: AreaBuilder) {
  const jars: JarSpot[] = [];
  let shield!: ShieldPickup;
  for (const ruin of RUINS) {
    jars.push(...buildRuin(b, ruin));
    if (ruin.id === 'shieldCottage') shield = new ShieldPickup(b, ...shieldSpot(ruin), ruin.yaw);
  }
  return { shield, jars: new JarField(b, jars) };
}

/** Where a ruin's local point (front = +z, scaled and mirrored) lands in the world. */
function place(ruin: Ruin, lx: number, lz: number) {
  return toWorld(ruin, lx * ruin.flip * ruin.scale, lz * ruin.scale);
}

function groundY(ruin: Ruin) {
  const corners = [[0, 0], [-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]].map(([lx, lz]) => place(ruin, lx, lz));
  return Math.max(...corners.map((p) => terrainHeight(p.x, p.z)));
}

function shieldSpot(ruin: Ruin): [number, number, number] {
  const at = place(ruin, 1.0, -2.45);
  return [at.x, groundY(ruin) + 0.12, at.z];
}

function buildRuin(b: AreaBuilder, ruin: Ruin): JarSpot[] {
  const { scale: s, flip: f } = ruin;
  const y = groundY(ruin);
  const g = new THREE.Group();
  g.position.set(ruin.x, y, ruin.z);
  g.rotation.y = ruin.yaw;
  const stone = surf('stone', 0x8f877a), plaster = surf('plaster', 0xbfb399), thatch = surf('thatch', 0x5a4632), char = mat(0x2e2620), plank = surf('wood', 0x6b4c30);
  /** A piece at a local spot (scaled, mirrored). */
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, lx: number, ly: number, lz: number) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(lx * f * s, ly, lz * s);
    g.add(me);
    return me;
  };
  /** A wall stretch from a to b along one side, `h` tall above the floor (buried 0.6 m), with a collider. */
  const wall = (ax: number, az: number, bx: number, bz: number, h: number) => {
    const len = Math.hypot(bx - ax, bz - az) * s;
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const [w, d] = along ? [len, 0.4] : [0.4, len];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    part(new THREE.BoxGeometry(w, h + 0.6, d), stone, mx, (h - 0.6) / 2, mz);
    // A band of old plaster on the inside face, stopping short of the broken top.
    if (h > 1.2) {
      const inward = along ? -Math.sign(mz) * 0.22 : -Math.sign(mx) * f * 0.22; // toward the middle of the room
      const pm = part(new THREE.BoxGeometry(along ? len - 0.2 : 0.06, h - 0.7, along ? 0.06 : len - 0.2), plaster, mx, (h - 0.7) / 2 + 0.1, mz);
      if (along) pm.position.z += inward;
      else pm.position.x += inward;
    }
    const p = place(ruin, mx, mz);
    b.box(p.x, y + h / 2, p.z, w / 2, h / 2 + 0.3, d / 2, ruin.yaw);
  };

  // Floorboards, half rotted away, and the walls: tallest at the back, the front broken down low.
  part(new THREE.BoxGeometry(6.6 * s, 0.12, 5.6 * s), plank, 0, 0.06, 0);
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
  const slab = part(new THREE.BoxGeometry(2.8 * s, 0.22, 4.8 * s), thatch, -2.2, 1.45, -0.6);
  slab.rotation.z = -0.75 * f;
  const under = place(ruin, -2.4, -0.6);
  b.box(under.x, y + 0.8, under.z, 1.0 * s, 0.8, 2.4 * s, ruin.yaw);
  // Charred rafters: one still spanning the back corner, one fallen across the doorway's threshold.
  part(new THREE.BoxGeometry(0.22, 0.22, 4.2 * s), char, -1.2, 2.7, -1.2).rotation.set(0.25, 0, 0.1 * f);
  part(new THREE.BoxGeometry(3.2 * s, 0.2, 0.22), char, 1.6, 0.18, 3.9).rotation.set(0, 0.35 * f, 0.06);
  part(new THREE.BoxGeometry(0.2, 0.2, 2.4 * s), char, 2.4, 0.15, -1.6).rotation.set(0, 0.6 * f, 0);
  // Rubble from the broken walls, inside and out.
  const rubble: [number, number, number][] = [[3.9, 0.3, 0.4], [4.3, -1.6, 0.25], [2.6, 3.6, 0.3], [-2.4, 3.6, 0.35], [-0.6, 3.5, 0.2], [2.9, -2.2, 0.3], [-4.1, 2.2, 0.3]];
  rubble.forEach(([lx, lz, r], i) => {
    part(new THREE.IcosahedronGeometry(r, 0), stone, lx, r * 0.5, lz).rotation.set(i, i * 2, 0);
  });
  b.staticGroup.add(g);

  return ruin.jars.map((drop, i) => {
    const [lx, lz, inside] = JAR_SPOTS[i];
    const p = place(ruin, lx, lz);
    return { id: `${ruin.id}.${i}`, x: p.x, y: inside ? y + 0.12 : terrainHeight(p.x, p.z), z: p.z, drop };
  });
}

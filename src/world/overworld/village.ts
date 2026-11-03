import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { mat, uniqueMat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { MILL, STALL, terrainHeight, VILLAGE } from './layout';

/** Thistledown: five cottages around a well, a windmill, a fence ring and lanterns. */
export function buildVillage(b: AreaBuilder) {
  const { x: cx, z: cz } = VILLAGE;
  const windowMat = uniqueMat(0x2a2a3a);
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0x664422 });

  const house = (x: number, z: number, wall: number, roof: number, w = 8.5, d = 7.5, h = 3.4) => {
    const y = terrainHeight(x, z) - 0.2;
    const yaw = Math.atan2(cx - x, cz - z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(px, py, pz);
      me.castShadow = me.receiveShadow = true;
      g.add(me);
      return me;
    };
    part(new THREE.BoxGeometry(w, h, d), mat(wall), 0, h / 2, 0);
    part(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), mat(0x6d6258), 0, 0.2, 0);
    part(new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.8, 4), mat(roof), 0, h + 1.4, 0).rotation.y = Math.PI / 4;
    part(new THREE.BoxGeometry(1.2, 2.1, 0.12), mat(0x4a2e18), 0, 1.05, d / 2 + 0.05);
    // Windows glow at night, so they stay out of the static merge.
    const win = (px: number) => {
      const me = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), windowMat);
      me.position.set(px, 1.9, d / 2 + 0.05);
      me.applyMatrix4(g.matrix.compose(g.position, g.quaternion, g.scale));
      b.dynamic(me);
    };
    win(-w / 3.2);
    win(w / 3.2);
    part(new THREE.BoxGeometry(0.7, 1.8, 0.7), mat(0x7d6e60), w / 4, h + 1.6, -d / 5);
    b.staticGroup.add(g);
    b.box(x, y + h / 2, z, w / 2 + 0.15, h / 2 + 0.2, d / 2 + 0.15, yaw);
  };

  const houses: [number, number, number][] = [
    [-0.15, 0xeadcbc, 0xa5452f],
    [1.55, 0xdcc8a4, 0x5b6f9a],
    [2.35, 0xeadcbc, 0x8a5a2b],
    [-2.45, 0xe4d2b0, 0xa5452f],
    [-0.95, 0xd8c09a, 0x4f7d4a],
  ];
  for (const [a, wall, roof] of houses) house(cx + Math.cos(a) * 17, cz + Math.sin(a) * 17, wall, roof);

  // Well in the square.
  const stone = mat(0x9a958c), wood = mat(0x6b4423);
  const y0 = terrainHeight(cx, cz);
  b.mesh(new THREE.CylinderGeometry(1.4, 1.5, 1, 10), stone, cx, y0 + 0.5, cz);
  b.mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.05, 10), mat(0x22445a), cx, y0 + 0.85, cz, false);
  for (const s of [-1, 1]) b.mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), wood, cx + s * 1.2, y0 + 1.7, cz);
  b.mesh(new THREE.ConeGeometry(2, 1.1, 4), mat(0xa5452f), cx, y0 + 3.3, cz).rotation.y = Math.PI / 4;
  b.cylinder(cx, y0 + 0.5, cz, 0.6, 1.55);

  // Windmill on the west side, sails facing the square.
  const wx = MILL.x, wz = MILL.z;
  const wy = terrainHeight(wx, wz);
  b.mesh(new THREE.CylinderGeometry(1.7, 2.7, 9, 8), mat(0xe2d6bf), wx, wy + 4.5, wz);
  b.mesh(new THREE.ConeGeometry(2.2, 2.4, 8), mat(0x8a3b28), wx, wy + 10.2, wz);
  // The door: a stone frame and lintel standing proud of the wall, a plank door in front of
  // it, a knob and a doorstep. (The wall is round, so the frame is deep enough to bridge it.)
  {
    const dx = wx + 2.62, dark = mat(0x4a2e18), frame = mat(0x7d6e60);
    b.mesh(new THREE.BoxGeometry(0.4, 2.5, 0.22), frame, dx, wy + 1.25, wz - 0.82);
    b.mesh(new THREE.BoxGeometry(0.4, 2.5, 0.22), frame, dx, wy + 1.25, wz + 0.82);
    b.mesh(new THREE.BoxGeometry(0.4, 0.3, 1.86), frame, dx, wy + 2.55, wz);
    b.mesh(new THREE.BoxGeometry(0.18, 2.3, 1.44), dark, dx + 0.12, wy + 1.15, wz);
    for (const pz of [-0.36, 0, 0.36]) b.mesh(new THREE.BoxGeometry(0.2, 2.3, 0.04), mat(0x33200f), dx + 0.12, wy + 1.15, wz + pz);
    b.mesh(new THREE.BoxGeometry(0.1, 0.5, 0.05), mat(0x33200f), dx + 0.22, wy + 1.9, wz);
    b.mesh(new THREE.BoxGeometry(0.1, 0.5, 0.05), mat(0x33200f), dx + 0.22, wy + 0.4, wz);
    b.mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(0xc9a227), dx + 0.26, wy + 1.1, wz + 0.5);
    b.mesh(new THREE.BoxGeometry(0.8, 0.18, 2.0), mat(0x9a958c), dx + 0.3, wy + 0.05, wz);
  }
  // Sails on an axle that clears the tower: the lowest tip passes 0.5 m in front of the wall.
  const blades = new THREE.Group();
  blades.position.set(wx + 3.1, wy + 8, wz);
  const sail = mat(0xf2ead8), frame = mat(0x5e3d20);
  const axle = b.mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 6), frame, wx + 2.3, wy + 8, wz);
  axle.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i * Math.PI) / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 5.6, 0.2), frame);
    spar.position.y = 2.8;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.2, 1.3), sail);
    cloth.position.set(0, 3.3, 0.7);
    spar.castShadow = cloth.castShadow = true;
    arm.add(spar, cloth);
    blades.add(arm);
  }
  blades.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), frame));
  b.dynamic(blades);
  b.cylinder(wx, wy + 4.5, wz, 4.5, 2.6);

  // Odo's stall: a counter with an awning, wares laid out on it.
  {
    const { x: sx, z: sz } = STALL;
    const sy = terrainHeight(sx, sz);
    const counter = mat(0x8a5a2b), cloth = mat(0x3f6f8a), stripe = mat(0xe8dfc4);
    b.mesh(new THREE.BoxGeometry(0.9, 1, 2.6), counter, sx, sy + 0.5, sz);
    b.mesh(new THREE.BoxGeometry(1.0, 0.1, 2.8), mat(0x6b4423), sx, sy + 1.02, sz);
    b.box(sx, sy + 0.55, sz, 0.5, 0.55, 1.4, 0, Layer.Prop);
    for (const dz of [-1.35, 1.35]) for (const dx of [-1.9, 0.6]) {
      b.mesh(new THREE.BoxGeometry(0.12, 2.9, 0.12), wood, sx + dx, sy + 1.45, sz + dz);
    }
    b.mesh(new THREE.BoxGeometry(3.4, 0.12, 3.2), cloth, sx - 0.65, sy + 2.95, sz);
    for (const dz of [-1.0, 0, 1.0]) b.mesh(new THREE.BoxGeometry(3.42, 0.13, 0.4), stripe, sx - 0.65, sy + 2.96, sz + dz);
    // Wares: a folded slate-blue tunic, jars and a loaf.
    b.mesh(new THREE.BoxGeometry(0.5, 0.14, 0.6), mat(0x6b8296), sx, sy + 1.14, sz - 0.7);
    b.mesh(new THREE.BoxGeometry(0.46, 0.1, 0.56), mat(0x7d93a6), sx, sy + 1.26, sz - 0.7);
    for (const [dz, c] of [[0.1, 0xb4532a], [0.45, 0x4f7d4a], [0.8, 0xd9a531]] as const) {
      b.mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.3, 7), mat(c), sx, sy + 1.2, sz + dz);
    }
  }

  // Fence ring with gaps for the two roads.
  const gaps = [Math.PI / 4, -Math.PI / 2];
  const R = VILLAGE.r - 2;
  const postMat = mat(0x7a5230);
  const step = 2.6 / R;
  let prev: THREE.Vector3 | null = null;
  for (let a = -Math.PI; a < Math.PI; a += step) {
    const inGap = gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.2);
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const y = terrainHeight(x, z);
    if (inGap) {
      prev = null;
      continue;
    }
    b.mesh(new THREE.BoxGeometry(0.22, 1.3, 0.22), postMat, x, y + 0.55, z);
    const cur = new THREE.Vector3(x, y, z);
    if (prev) {
      const mid = cur.clone().add(prev).multiplyScalar(0.5);
      const len = cur.distanceTo(prev);
      for (const hgt of [0.5, 1.0]) {
        const rail = b.mesh(new THREE.BoxGeometry(0.1, 0.12, len), postMat, mid.x, mid.y + hgt, mid.z);
        rail.lookAt(cur.x, mid.y + hgt, cur.z);
      }
      b.box(mid.x, mid.y + 0.7, mid.z, 0.12, 0.8, len / 2 + 0.1, Math.atan2(cur.x - prev.x, cur.z - prev.z), Layer.Prop);
    }
    prev = cur;
  }

  // Lanterns that glow at night, plus barrels and crates for clutter.
  for (const a of [Math.PI / 4 - 0.28, Math.PI / 4 + 0.28, -Math.PI / 2 - 0.28, -Math.PI / 2 + 0.28, 0.6, 2.9, -1.9]) {
    const r = a === 0.6 || a === 2.9 || a === -1.9 ? 9 : R - 1.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = terrainHeight(x, z);
    b.mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), wood, x, y + 1.3, z);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), lanternMat);
    lantern.position.set(x, y + 2.75, z);
    b.dynamic(lantern);
    b.mesh(new THREE.ConeGeometry(0.4, 0.3, 4), mat(0x3a2a1e), x, y + 3.15, z);
    b.cylinder(x, y + 1.3, z, 1.3, 0.2, Layer.Prop);
  }
  const barrel = mat(0x8a5a2b), crate = mat(0xa47a48);
  const clutter = [[4, 9], [5.2, 9.6], [-9, -5], [8, -8], [-4, 10], [12, 2]];
  clutter.forEach(([dx, dz], i) => {
    const x = cx + dx, z = cz + dz, y = terrainHeight(x, z);
    if (i % 2 === 0) {
      b.mesh(new THREE.CylinderGeometry(0.45, 0.4, 1, 8), barrel, x, y + 0.5, z);
      b.cylinder(x, y + 0.5, z, 0.5, 0.45, Layer.Prop);
    } else {
      b.mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), crate, x, y + 0.45, z).rotation.y = i;
      b.box(x, y + 0.45, z, 0.45, 0.45, 0.45, i, Layer.Prop);
    }
  });

  return { windowMat, lanternMat, blades };
}

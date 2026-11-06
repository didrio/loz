import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { fadeInFog, mat, surf, uniqueMat } from '../../render/materials';
import { applySurface } from '../../render/textures';
import type { AreaBuilder } from '../area';
import { HOMES, MILL, MILL_BED, MILL_TOWER, STALL, terrainHeight, VILLAGE } from './layout';
import { HingedDoor } from '../objects';

/** A door the size of the mill's (1.44 × 2.3 m): a stone frame and lintel, plank door, straps and a knob. Faces +z in `g`. */
function door(g: THREE.Group, z: number, wood: number, part: (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => THREE.Mesh) {
  const frame = surf('stone', 0x7d6e60), strap = mat(0x33200f);
  for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.22, 2.5, 0.3), frame, s * 0.83, 1.25, z);
  part(new THREE.BoxGeometry(1.88, 0.3, 0.32), frame, 0, 2.55, z);
  part(new THREE.BoxGeometry(1.44, 2.26, 0.14), surf('wood', wood), 0, 1.27, z + 0.04);
  for (const px of [-0.36, 0, 0.36]) part(new THREE.BoxGeometry(0.04, 2.26, 0.16), strap, px, 1.27, z + 0.05);
  for (const py of [0.5, 2.0]) part(new THREE.BoxGeometry(1.2, 0.08, 0.17), strap, 0, py, z + 0.05);
  part(new THREE.SphereGeometry(0.07, 6, 5), mat(0xc9a227), 0.5, 1.1, z + 0.14);
  part(new THREE.BoxGeometry(2.0, 0.18, 0.8), surf('stone', 0x9a958c), 0, 0.09, z + 0.4);
}

/** Thistledown: four cottages (two standing here, two ruined ones in `RUINS`) around a well, a windmill, a fence ring and lanterns. */
export function buildVillage(b: AreaBuilder) {
  const { x: cx, z: cz } = VILLAGE;
  const windowMat = uniqueMat(0x2a2a3a);
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0x664422 });

  /** `extra` adds the house's own touches; `at(lx, lz)` turns a spot in the house's frame (front = +z) into world x, z. */
  const house = (x: number, z: number, wall: number, roof: number, extra: (part: (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => THREE.Mesh, at: (lx: number, lz: number) => [number, number], yaw: number, y: number) => void, w = 10.5, d = 9, h = 3.6) => {
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
    part(new THREE.BoxGeometry(w, h, d), surf('plaster', wall), 0, h / 2, 0);
    part(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), surf('stone', 0x6d6258), 0, 0.2, 0);
    part(new THREE.ConeGeometry(Math.max(w, d) * 0.8, 2.8, 4), surf('shingle', roof), 0, h + 1.4, 0).rotation.y = Math.PI / 4;
    door(g, d / 2 + 0.1, 0x4a2e18, part);
    // Windows glow at night, so they stay out of the static merge.
    const win = (px: number) => {
      const me = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), windowMat);
      me.position.set(px, 1.9, d / 2 + 0.05);
      me.applyMatrix4(g.matrix.compose(g.position, g.quaternion, g.scale));
      b.dynamic(me);
    };
    win(-w / 3.2);
    win(w / 3.2);
    part(new THREE.BoxGeometry(0.7, 1.8, 0.7), surf('stone', 0x7d6e60), w / 4, h + 1.6, -d / 5);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    extra(part, (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos], yaw, y);
    b.staticGroup.add(g);
    b.box(x, y + h / 2, z, w / 2 + 0.15, h / 2 + 0.2, d / 2 + 0.15, yaw);
  };

  // The east and southwest homes still stand; the northeast and northwest ones are ruins (ruins.ts).
  // East: a tidy, cheerful house: green shutters, flower boxes under the windows, a bench by the door.
  house(HOMES[0].x, HOMES[0].z, 0xeadcbc, 0xa5452f, (part, at, yaw, y) => {
    const shutter = surf('wood', 0x4f7d4a), box = surf('wood', 0x7a5230);
    for (const s of [-1, 1]) {
      const wx = s * (10.5 / 3.2);
      for (const side of [-1, 1]) part(new THREE.BoxGeometry(0.4, 1.0, 0.08), shutter, wx + side * 0.68, 1.9, 4.58);
      part(new THREE.BoxGeometry(1.2, 0.28, 0.4), box, wx, 1.32, 4.72);
      for (let i = 0; i < 5; i++) {
        part(new THREE.OctahedronGeometry(0.11), mat([0xf28bb0, 0xffd84a, 0xffffff, 0xf28bb0, 0xa6b8ff][i]), wx - 0.44 + i * 0.22, 1.56, 4.72);
      }
    }
    // A bench to the right of the door.
    part(new THREE.BoxGeometry(1.8, 0.1, 0.5), box, 2.0, 0.5, 5.05);
    for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.1, 0.45, 0.4), box, 2.0 + s * 0.75, 0.25, 5.05);
    const [bx, bz] = at(2.0, 5.05);
    b.box(bx, y + 0.3, bz, 0.9, 0.3, 0.25, yaw, Layer.Prop);
  });
  // Southwest: an older, busier house: dark timber framing, a little porch roof, a woodpile, herbs drying.
  house(HOMES[1].x, HOMES[1].z, 0xdcc8a4, 0x5b6f9a, (part, at, yaw, y) => {
    const beam = surf('wood', 0x5e3d20);
    part(new THREE.BoxGeometry(10.6, 0.2, 0.08), beam, 0, 3.0, 4.56);
    part(new THREE.BoxGeometry(10.6, 0.2, 0.08), beam, 0, 0.55, 4.56);
    for (const px of [-5.1, -1.6, 1.6, 5.1]) part(new THREE.BoxGeometry(0.2, 2.5, 0.08), beam, px, 1.8, 4.56);
    for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.16, 2.2, 0.08), beam, s * 4.55, 1.8, 4.57).rotation.z = s * 0.62;
    // The porch: a slanted plank roof on two posts.
    part(new THREE.BoxGeometry(2.9, 0.12, 1.6), surf('wood', 0x5b6f9a), 0, 2.95, 5.3).rotation.x = 0.25;
    for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.14, 2.8, 0.14), beam, s * 1.3, 1.4, 6.0);
    for (const s of [-1, 1]) {
      const [px, pz] = at(s * 1.3, 6.0);
      b.cylinder(px, y + 1.4, pz, 1.4, 0.12, Layer.Prop);
    }
    // Herbs drying under the porch roof.
    for (const px of [-0.9, -0.55, 0.9]) {
      part(new THREE.BoxGeometry(0.03, 0.3, 0.03), beam, px, 2.55, 5.6);
      part(new THREE.ConeGeometry(0.12, 0.32, 5), mat(px < 0 ? 0x6f8f3a : 0x9a7a3a), px, 2.25, 5.6).rotation.x = Math.PI;
    }
    // A woodpile against the east side wall.
    const log = surf('wood', 0x8a5a2b);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4 - row; i++) {
        part(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 6), log, 6.1, 0.2 + row * 0.33, -1.2 + (i + row * 0.5) * 0.38).rotation.z = Math.PI / 2;
      }
    }
    const [wpx, wpz] = at(6.1, -0.6);
    b.box(wpx, y + 0.5, wpz, 0.8, 0.5, 0.8, yaw, Layer.Prop);
  });

  // Well in the square.
  const stone = surf('stone', 0x9a958c), wood = surf('wood', 0x6b4423);
  const y0 = terrainHeight(cx, cz);
  // A stone ring over a shaft (terrain.ts opens the ground under it), dark water far down, on a
  // paved apron that hides the hole's edge. The ring's collider (and the ground's) is the lid, so
  // nobody falls in yet.
  b.mesh(new THREE.RingGeometry(1.15, 3.1, 12).rotateX(-Math.PI / 2), surf('stone', 0x8a857c), cx, y0 + 0.05, cz, false);
  b.mesh(new THREE.CylinderGeometry(1.4, 1.5, 1, 12, 1, true), stone, cx, y0 + 0.5, cz);
  b.mesh(new THREE.RingGeometry(1.12, 1.42, 12).rotateX(-Math.PI / 2), stone, cx, y0 + 1, cz, false);
  b.mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.6, 12, 1, true), uniqueMat(0x4a4640, { side: THREE.BackSide }), cx, y0 - 0.8, cz, false);
  b.mesh(new THREE.CircleGeometry(1.15, 12).rotateX(-Math.PI / 2), mat(0x0e1c26), cx, y0 - 2.5, cz, false);
  for (const s of [-1, 1]) b.mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), wood, cx + s * 1.2, y0 + 1.7, cz);
  b.mesh(new THREE.ConeGeometry(2, 1.1, 4), surf('shingle', 0xa5452f), cx, y0 + 3.3, cz).rotation.y = Math.PI / 4;
  b.cylinder(cx, y0 + 0.5, cz, 0.6, 1.55);

  // Windmill on the west side, sails facing the square. Its ground floor is Tobin's room, walked
  // into straight off the square (no loading): a round room with a low ceiling, the door facing east.
  const wx = MILL.x, wz = MILL.z;
  const wy = terrainHeight(wx, wz);
  const { outer: RO, inner: RI, top: RT, height: MH, ceiling: CEIL, sides: SIDES, gap: GAP } = MILL_TOWER;
  const DOOR_TOP = 2.6;
  const outerAt = (h: number) => RO + (RT - RO) * (h / MH);
  const millWall = surf('plaster', 0xe2d6bf), inside = applySurface(uniqueMat(0xd8c8a6, { side: THREE.BackSide }), 'plaster');
  // Outside: a band with the doorway cut out, then the rest of the tower; the door faces +x (theta pi/2).
  const around = [Math.PI / 2 + GAP, Math.PI * 2 - GAP * 2] as const;
  b.mesh(new THREE.CylinderGeometry(outerAt(DOOR_TOP), RO, DOOR_TOP, SIDES - 2, 1, true, ...around), millWall, wx, wy + DOOR_TOP / 2, wz);
  b.mesh(new THREE.CylinderGeometry(RT, outerAt(DOOR_TOP), MH - DOOR_TOP, SIDES, 1, true), millWall, wx, wy + DOOR_TOP + (MH - DOOR_TOP) / 2, wz);
  b.mesh(new THREE.ConeGeometry(RT + 0.5, 3.2, 12), surf('shingle', 0x8a3b28), wx, wy + MH + 1.6, wz);
  // Inside: the same cut, the wall up to the ceiling, plank floor and ceiling, two beams.
  b.mesh(new THREE.CylinderGeometry(RI, RI, DOOR_TOP, SIDES - 2, 1, true, ...around), inside, wx, wy + DOOR_TOP / 2, wz);
  b.mesh(new THREE.CylinderGeometry(RI, RI, CEIL - DOOR_TOP, SIDES, 1, true), inside, wx, wy + (DOOR_TOP + CEIL) / 2, wz);
  b.mesh(new THREE.CircleGeometry(RI, 24).rotateX(-Math.PI / 2), surf('wood', 0x8a6a44), wx, wy + 0.03, wz, false);
  b.mesh(new THREE.CircleGeometry(RI, 24).rotateX(Math.PI / 2), surf('wood', 0x6d5236), wx, wy + CEIL, wz, false);
  for (const dz of [-1.4, 1.4]) b.mesh(new THREE.BoxGeometry(RI * 2 - 0.6, 0.25, 0.3), surf('wood', 0x5e3d20), wx, wy + CEIL - 0.13, wz + dz);
  // The doorway's reveal (the wall's thickness each side and above), a stone frame outside and a doorstep.
  const depth = RO - RI + 0.1, mid = (RO + RI) / 2;
  const frame = surf('stone', 0x7d6e60);
  for (const s of [-1, 1]) b.mesh(new THREE.BoxGeometry(depth, DOOR_TOP, 0.22), surf('plaster', 0xd8c8a6), wx + mid, wy + DOOR_TOP / 2, wz + s * 0.86);
  b.mesh(new THREE.BoxGeometry(depth, 0.26, 1.94), surf('plaster', 0xd8c8a6), wx + mid, wy + 2.47, wz);
  for (const s of [-1, 1]) b.mesh(new THREE.BoxGeometry(0.3, 2.5, 0.24), frame, wx + RO + 0.05, wy + 1.25, wz + s * 0.96);
  b.mesh(new THREE.BoxGeometry(0.3, 0.3, 2.16), frame, wx + RO + 0.05, wy + 2.6, wz);
  b.mesh(new THREE.BoxGeometry(0.9, 0.18, 2.0), surf('stone', 0x9a958c), wx + RO + 0.45, wy + 0.05, wz);
  const millDoor = new HingedDoor(b, wx + mid, wy + 0.06, wz, Math.PI / 2, 1.44, 2.32);
  // The wall's colliders: a ring of blocks with a gap at the door, and the tower above the ceiling as one solid.
  const SEGS = 22, span = Math.PI * 2 - 2 * GAP, segStep = span / SEGS;
  for (let i = 0; i < SEGS; i++) {
    const phi = GAP + segStep * (i + 0.5); // world angle in the xz plane, 0 = +x (the door)
    b.box(wx + Math.cos(phi) * mid, wy + CEIL / 2, wz + Math.sin(phi) * mid, (RO - RI) / 2, CEIL / 2, (mid * segStep) / 2 + 0.05, -phi);
  }
  b.cylinder(wx, wy + (CEIL + MH) / 2, wz, (MH - CEIL) / 2, outerAt(CEIL));
  // The doorway's inner face: the camera's pane (it stays in the room with Wren; she walks through).
  b.box(wx + RI - 0.05, wy + DOOR_TOP / 2, wz, 0.05, DOOR_TOP / 2, 1.0, 0, Layer.CameraOnly);

  // Tobin's room: the bed against the back wall, a table and stools, a hearth, a shelf, flour sacks.
  const room = (w: number, h: number, d: number, m: THREE.Material, dx: number, y: number, dz: number, collide = false) => {
    b.mesh(new THREE.BoxGeometry(w, h, d), m, wx + dx, wy + y + h / 2, wz + dz);
    if (collide) b.box(wx + dx, wy + y + h / 2, wz + dz, w / 2, h / 2, d / 2, 0, Layer.Prop);
  };
  const { x: bdx, z: bdz } = MILL_BED;
  room(1.3, 0.45, 2.4, wood, bdx, 0, bdz, true);
  room(1.1, 0.2, 2.2, mat(0xf0e8d8), bdx, 0.45, bdz);
  room(1.14, 0.24, 1.4, mat(0xa5452f), bdx, 0.45, bdz - 0.4);
  room(0.8, 0.16, 0.5, mat(0xfff8ec), bdx, 0.65, bdz + 0.8);
  room(1.3, 1.0, 0.12, wood, bdx, 0, bdz + 1.26);
  room(1.7, 0.1, 1.0, wood, 0.9, 0.85, -1.6);
  for (const [ex, ez] of [[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]]) room(0.1, 0.85, 0.1, surf('wood', 0x6d5236), 0.9 + ex, 0, -1.6 + ez);
  b.box(wx + 0.9, wy + 0.45, wz - 1.6, 0.9, 0.45, 0.55, 0, Layer.Prop);
  for (const ex of [-1.3, 1.3]) b.mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.45, 8), wood, wx + 0.9 + ex, wy + 0.23, wz - 1.6);
  room(1.4, 1.5, 1.0, surf('stone', 0x7d7468), -1.0, 0, -3.0, true);
  room(1.0, 0.1, 0.7, mat(0xe8a24a), -1.0, 1.5, -3.0);
  room(1.2, 0.08, 0.35, wood, -0.8, 1.4, 3.4);
  [0xb4532a, 0x4f7d4a, 0xd9a531].forEach((c, i) => b.mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 7), mat(c), wx - 1.2 + i * 0.4, wy + 1.6, wz + 3.4));
  for (const [ex, ez] of [[2.2, 2.4], [1.2, 2.8], [0.2, 3.2]]) {
    b.mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.8, 8), mat(0xe2d6bf), wx + ex, wy + 0.4, wz + ez);
    b.cylinder(wx + ex, wy + 0.4, wz + ez, 0.4, 0.5, Layer.Prop);
  }
  // A warm lamp: short reach, so it lights the room and not the grass outside.
  const millLight = new THREE.PointLight(0xffc27a, 7, 5.3, 1.2);
  millLight.position.set(wx, wy + CEIL - 0.6, wz);
  b.dynamic(millLight);

  // Sails on an axle that clears the tower: the lowest tip passes in front of the wall.
  const blades = new THREE.Group();
  const hub = outerAt(9.5) + 0.9;
  blades.position.set(wx + hub, wy + 9.5, wz);
  const sail = mat(0xf2ead8), sailFrame = surf('wood', 0x5e3d20);
  const axle = b.mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 6), sailFrame, wx + hub - 0.8, wy + 9.5, wz);
  axle.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i * Math.PI) / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7, 0.24), sailFrame);
    spar.position.y = 3.5;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5.2, 1.6), sail);
    cloth.position.set(0, 4.1, 0.85);
    spar.castShadow = cloth.castShadow = true;
    arm.add(spar, cloth);
    blades.add(arm);
  }
  blades.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), sailFrame));
  b.dynamic(blades);

  // Odo's stall: a counter with an awning, wares laid out on it.
  {
    const { x: sx, z: sz } = STALL;
    const sy = terrainHeight(sx, sz);
    const counter = surf('wood', 0x8a5a2b), cloth = mat(0x3f6f8a), stripe = mat(0xe8dfc4);
    b.mesh(new THREE.BoxGeometry(0.9, 1, 2.6), counter, sx, sy + 0.5, sz);
    b.mesh(new THREE.BoxGeometry(1.0, 0.1, 2.8), wood, sx, sy + 1.02, sz);
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
  const postMat = surf('wood', 0x7a5230);
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

  // Lanterns that glow at night (a bright core and a soft halo each), plus barrels and crates for clutter.
  // A few real lights do the lighting, each inside a lamp: the square's three lanterns, the four gate lanterns and the mill door's.
  const haloMat = fadeInFog(new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const haloGeo = new THREE.SphereGeometry(0.85, 10, 8);
  const halo = (x: number, y: number, z: number) => {
    const h = new THREE.Mesh(haloGeo, haloMat);
    h.position.set(x, y, z);
    b.dynamic(h);
  };
  const lights: THREE.PointLight[] = [];
  const light = (x: number, y: number, z: number, distance: number) => {
    const l = new THREE.PointLight(0xffb060, 0, distance, 1.4);
    l.position.set(x, y, z);
    l.userData.peak = distance > 12 ? 8 : 5;
    lights.push(b.dynamic(l));
  };
  {
    // A lamp on a bracket beside the mill door.
    const lx = wx + outerAt(2.35) + 0.35, lz = wz + 1.45;
    b.mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), wood, lx - 0.2, wy + 2.6, lz);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.3), lanternMat);
    lamp.position.set(lx, wy + 2.35, lz);
    b.dynamic(lamp);
    halo(lx, wy + 2.35, lz);
    light(lx, wy + 2.35, lz, 11);
  }
  for (const a of [Math.PI / 4 - 0.28, Math.PI / 4 + 0.28, -Math.PI / 2 - 0.28, -Math.PI / 2 + 0.28, 0.6, 2.9, -1.9]) {
    const inSquare = a === 0.6 || a === 2.9 || a === -1.9;
    const r = inSquare ? 9 : R - 1.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = terrainHeight(x, z);
    b.mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), wood, x, y + 1.3, z);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), lanternMat);
    lantern.position.set(x, y + 2.75, z);
    b.dynamic(lantern);
    halo(x, y + 2.75, z);
    light(x, y + 2.75, z, inSquare ? 15 : 11); // the gate lanterns too, a smaller reach
    b.mesh(new THREE.ConeGeometry(0.4, 0.3, 4), mat(0x3a2a1e), x, y + 3.15, z);
    b.cylinder(x, y + 1.3, z, 1.3, 0.2, Layer.Prop);
  }
  const barrel = surf('wood', 0x8a5a2b), crate = surf('wood', 0xa47a48);
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

  return { windowMat, lanternMat, haloMat, lights, blades, millDoor };
}

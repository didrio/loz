import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { fadeInFog, mat, surf, uniqueMat } from '../../render/materials';
import { kitMesh } from '../../render/kit';
import { buildBarrel, buildCottage, buildCrate, buildLanternPost, buildWell, COTTAGE, COTTAGE_WINDOW, fencePost, fenceRail, FENCE_RAILS, type CottageStyle } from '../../render/models/village';
import { applySurface } from '../../render/textures';
import type { AreaBuilder } from '../area';
import { HOMES, MILL, MILL_BED, MILL_TOWER, STALL, terrainHeight, VILLAGE } from './layout';
import { HingedDoor } from '../objects';

/** Thistledown: four cottages (two standing here, two ruined ones in `RUINS`) around a well, a windmill, a fence ring and lanterns. */
export function buildVillage(b: AreaBuilder) {
  const { x: cx, z: cz } = VILLAGE;
  const windowMat = uniqueMat(0x2a2a3a);
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0x664422 });

  /**
   * A standing cottage: the final model (`render/models/village.ts`) placed on its spot, facing the square. `colliders(at, yaw, y)`
   * adds the house's own touches' colliders; `at(lx, lz)` turns a spot in the house's frame (front = +z) into world x, z.
   */
  const house = (x: number, z: number, style: CottageStyle, colliders: (at: (lx: number, lz: number) => [number, number], yaw: number, y: number) => void) => {
    const { w, d, h } = COTTAGE;
    const y = terrainHeight(x, z) - 0.2;
    const yaw = Math.atan2(cx - x, cz - z);
    const model = buildCottage(style).root;
    model.position.set(x, y, z);
    model.rotation.y = yaw;
    b.staticGroup.add(model);
    // Windows glow at night, so they stay out of the static merge (the model carries only their trim).
    const frame = new THREE.Matrix4().compose(model.position, model.quaternion, model.scale);
    for (const px of [-COTTAGE_WINDOW.x, COTTAGE_WINDOW.x]) {
      const me = new THREE.Mesh(new THREE.BoxGeometry(COTTAGE_WINDOW.size, COTTAGE_WINDOW.size, 0.1), windowMat);
      me.position.set(px, COTTAGE_WINDOW.y, d / 2 + 0.05);
      me.applyMatrix4(frame);
      b.dynamic(me);
    }
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    colliders((lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos], yaw, y);
    b.box(x, y + h / 2, z, w / 2 + 0.15, h / 2 + 0.2, d / 2 + 0.15, yaw);
  };

  // The east and southwest homes still stand; the northeast and northwest ones are ruins (ruins.ts).
  house(HOMES[0].x, HOMES[0].z, 'east', (at, yaw, y) => {
    const [bx, bz] = at(2.0, 5.05); // the bench to the right of the door
    b.box(bx, y + 0.3, bz, 0.9, 0.3, 0.25, yaw, Layer.Prop);
  });
  house(HOMES[1].x, HOMES[1].z, 'southwest', (at, yaw, y) => {
    for (const s of [-1, 1]) { // the porch posts
      const [px, pz] = at(s * 1.3, 6.0);
      b.cylinder(px, y + 1.4, pz, 1.4, 0.12, Layer.Prop);
    }
    const [wpx, wpz] = at(6.1, -0.6); // the woodpile against the east side wall
    b.box(wpx, y + 0.5, wpz, 0.8, 0.5, 0.8, yaw, Layer.Prop);
  });

  // Well in the square.
  const wood = surf('wood', 0x6b4423);
  const y0 = terrainHeight(cx, cz);
  // The well's visible parts are the final model (render/models/village.ts): a paved apron, the curb, the posts and roof.
  // Under them, a shaft (terrain.ts opens the ground under it) with dark water far down. The curb's collider (and the
  // ground's) is the lid, so nobody falls in yet.
  const well = buildWell().root;
  well.position.set(cx, y0, cz);
  b.staticGroup.add(well);
  b.mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.6, 12, 1, true), applySurface(uniqueMat(0x4a4640, { side: THREE.BackSide }), 'stone'), cx, y0 - 0.8, cz);
  b.mesh(new THREE.CircleGeometry(1.15, 12).rotateX(-Math.PI / 2), mat(0x0e1c26), cx, y0 - 2.5, cz);
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
  b.mesh(new THREE.CircleGeometry(RI, 24).rotateX(-Math.PI / 2), surf('wood', 0x8a6a44), wx, wy + 0.03, wz);
  b.mesh(new THREE.CircleGeometry(RI, 24).rotateX(Math.PI / 2), surf('wood', 0x6d5236), wx, wy + CEIL, wz);
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
  room(1.1, 0.2, 2.2, surf('cloth', 0xf0e8d8), bdx, 0.45, bdz);
  room(1.14, 0.24, 1.4, surf('cloth', 0xa5452f), bdx, 0.45, bdz - 0.4);
  room(0.8, 0.16, 0.5, surf('cloth', 0xfff8ec), bdx, 0.65, bdz + 0.8);
  room(1.3, 1.0, 0.12, wood, bdx, 0, bdz + 1.26);
  room(1.7, 0.1, 1.0, wood, 0.9, 0.85, -1.6);
  for (const [ex, ez] of [[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]]) room(0.1, 0.85, 0.1, surf('wood', 0x6d5236), 0.9 + ex, 0, -1.6 + ez);
  b.box(wx + 0.9, wy + 0.45, wz - 1.6, 0.9, 0.45, 0.55, 0, Layer.Prop);
  for (const ex of [-1.3, 1.3]) b.mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.45, 8), wood, wx + 0.9 + ex, wy + 0.23, wz - 1.6);
  room(1.4, 1.5, 1.0, surf('stone', 0x7d7468), -1.0, 0, -3.0, true);
  room(1.0, 0.1, 0.7, surf('cloth', 0xe8a24a), -1.0, 1.5, -3.0);
  room(1.2, 0.08, 0.35, wood, -0.8, 1.4, 3.4);
  [0xb4532a, 0x4f7d4a, 0xd9a531].forEach((c, i) => b.mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 7), surf('plaster', c), wx - 1.2 + i * 0.4, wy + 1.6, wz + 3.4));
  for (const [ex, ez] of [[2.2, 2.4], [1.2, 2.8], [0.2, 3.2]]) {
    b.mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.8, 8), surf('cloth', 0xe2d6bf), wx + ex, wy + 0.4, wz + ez);
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
  const sail = surf('cloth', 0xf2ead8), sailFrame = surf('wood', 0x5e3d20);
  const axle = b.mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 6), sailFrame, wx + hub - 0.8, wy + 9.5, wz);
  axle.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i * Math.PI) / 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7, 0.24), sailFrame);
    spar.position.y = 3.5;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 5.2, 1.6), sail);
    cloth.position.set(0, 4.1, 0.85);
    arm.add(spar, cloth);
    blades.add(arm);
  }
  blades.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), sailFrame));
  b.dynamic(blades);

  // Odo's stall: a counter with an awning, wares laid out on it.
  {
    const { x: sx, z: sz } = STALL;
    const sy = terrainHeight(sx, sz);
    const counter = surf('wood', 0x8a5a2b), cloth = surf('cloth', 0x3f6f8a), stripe = surf('cloth', 0xe8dfc4);
    b.mesh(new THREE.BoxGeometry(0.9, 1, 2.6), counter, sx, sy + 0.5, sz);
    b.mesh(new THREE.BoxGeometry(1.0, 0.1, 2.8), wood, sx, sy + 1.02, sz);
    b.box(sx, sy + 0.55, sz, 0.5, 0.55, 1.4, 0, Layer.Prop);
    for (const dz of [-1.35, 1.35]) for (const dx of [-1.9, 0.6]) {
      b.mesh(new THREE.BoxGeometry(0.12, 2.9, 0.12), wood, sx + dx, sy + 1.45, sz + dz);
    }
    b.mesh(new THREE.BoxGeometry(3.4, 0.12, 3.2), cloth, sx - 0.65, sy + 2.95, sz);
    for (const dz of [-1.0, 0, 1.0]) b.mesh(new THREE.BoxGeometry(3.42, 0.13, 0.4), stripe, sx - 0.65, sy + 2.96, sz + dz);
    // Wares: a folded slate-blue tunic, jars and a loaf.
    b.mesh(new THREE.BoxGeometry(0.5, 0.14, 0.6), surf('cloth', 0x6b8296), sx, sy + 1.14, sz - 0.7);
    b.mesh(new THREE.BoxGeometry(0.46, 0.1, 0.56), surf('cloth', 0x7d93a6), sx, sy + 1.26, sz - 0.7);
    for (const [dz, c] of [[0.1, 0xb4532a], [0.45, 0x4f7d4a], [0.8, 0xd9a531]] as const) {
      b.mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.3, 7), surf('plaster', c), sx, sy + 1.2, sz + dz);
    }
  }

  // Fence ring with gaps for the two roads.
  const gaps = [Math.PI / 4, -Math.PI / 2];
  const R = VILLAGE.r - 2;
  const step = 2.6 / R;
  const post = fencePost();
  let prev: THREE.Vector3 | null = null;
  for (let a = -Math.PI; a < Math.PI; a += step) {
    const inGap = gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.2);
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const y = terrainHeight(x, z);
    if (inGap) {
      prev = null;
      continue;
    }
    const postMesh = kitMesh(post, 'wood');
    postMesh.position.set(x, y, z);
    b.staticGroup.add(postMesh);
    const cur = new THREE.Vector3(x, y, z);
    if (prev) {
      const mid = cur.clone().add(prev).multiplyScalar(0.5);
      const len = cur.distanceTo(prev);
      for (const hgt of FENCE_RAILS) {
        const rail = kitMesh(fenceRail(len), 'wood');
        rail.position.set(mid.x, mid.y + hgt, mid.z);
        rail.lookAt(cur.x, mid.y + hgt, cur.z);
        b.staticGroup.add(rail);
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
    const lampPost = buildLanternPost().root; // the post, its cage and hood; the glowing core is the box below
    lampPost.position.set(x, y, z);
    b.staticGroup.add(lampPost);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.45), lanternMat);
    lantern.position.set(x, y + 2.75, z);
    b.dynamic(lantern);
    halo(x, y + 2.75, z);
    light(x, y + 2.75, z, inSquare ? 15 : 11); // the gate lanterns too, a smaller reach
    b.cylinder(x, y + 1.3, z, 1.3, 0.2, Layer.Prop);
  }
  const barrel = buildBarrel().root, crate = buildCrate().root;
  const clutter = [[4, 9], [5.2, 9.6], [-9, -5], [8, -8], [-4, 10], [12, 2]];
  clutter.forEach(([dx, dz], i) => {
    const x = cx + dx, z = cz + dz, y = terrainHeight(x, z);
    const piece = (i % 2 === 0 ? barrel : crate).clone();
    piece.position.set(x, y, z);
    b.staticGroup.add(piece);
    if (i % 2 === 0) {
      b.cylinder(x, y + 0.5, z, 0.5, 0.45, Layer.Prop);
    } else {
      piece.rotation.y = i;
      b.box(x, y + 0.45, z, 0.45, 0.45, 0.45, i, Layer.Prop);
    }
  });

  return { windowMat, lanternMat, haloMat, lights, blades, millDoor };
}

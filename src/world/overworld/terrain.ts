import * as THREE from 'three';
import { fbm } from '../../core/math';
import { Layer } from '../../core/physics';
import type { AreaBuilder } from '../area';
import { GROVE, HOLLOW, passFrame, pathDist, PASS, terrainHeight, VILLAGE, WATER_Y, WORLD_RADIUS } from './layout';

const SIZE = 420;
/** Grid spacing, m. Every chunk uses the same one, so neighbouring chunks meet vertex to vertex. */
const CELL = 2;

/** A rectangle of ground, in meters. Its corners should sit on multiples of the 2 m grid. */
export interface TerrainRect { x0: number; x1: number; z0: number; z1: number }

/** The valley's chunk: the square the overworld has always had. */
export const VALLEY_RECT: TerrainRect = { x0: -SIZE / 2, x1: SIZE / 2, z0: -SIZE / 2, z1: SIZE / 2 };

/** The ground of `rect`: a flat-shaded, vertex-colored heightfield plus a matching physics trimesh. */
export function buildTerrain(b: AreaBuilder, rect: TerrainRect = VALLEY_RECT) {
  const width = rect.x1 - rect.x0, depth = rect.z1 - rect.z0;
  const grid = new THREE.PlaneGeometry(width, depth, width / CELL, depth / CELL);
  grid.rotateX(-Math.PI / 2);
  grid.translate((rect.x0 + rect.x1) / 2, 0, (rect.z0 + rect.z1) / 2);
  const p = grid.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
  b.track(b.physics.meshCollider(grid, Layer.World));

  const geo = grid.toNonIndexed();
  grid.dispose();
  wellHole(geo);
  geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), a = new THREE.Color(), d = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const x = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const z = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const ny = nor.getY(f);
    const n = fbm(x * 0.08, z * 0.08);
    if (y < -1.7) c.set(0x7f7350);
    else if (y < -0.35) c.set(0xd8c690);
    else if (y > 50) c.set(0xf0f3f6);
    else if (ny < 0.74 || y > 30) c.copy(a.set(0x8d8577)).lerp(d.set(0x67625a), n);
    else if (pathDist(x, z) < 1.9 + n * 1.4 || (z < PASS.path[0][1] && passFrame(x, z).d < 1.9 + n * 1.4)) c.copy(a.set(0xb98d5a)).lerp(d.set(0x9a7347), n);
    else {
      c.copy(a.set(0x5d9c3a)).lerp(d.set(0x8dbd4c), n);
      if (Math.hypot(x - GROVE.x, z - GROVE.z) < 40) c.lerp(d.set(0x356b2c), 0.5);
      if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r) c.lerp(d.set(0x9cc65a), 0.3);
    }
    // Gloaming Hollow: dead, ashen ground fading out past its rim.
    const dh = Math.hypot(x - HOLLOW.x, z - HOLLOW.z);
    if (dh < HOLLOW.r + 10) c.lerp(d.set(n > 0.5 ? 0x4f4a42 : 0x5d574b), Math.min(1, (HOLLOW.r + 10 - dh) / 6) * 0.85);
    // A little per-face brightness jitter gives the low-poly ground some texture.
    const jitter = 0.95 + ((((Math.sin(f * 12.9898) * 43758.5453) % 1) + 1) % 1) * 0.1;
    c.multiplyScalar(jitter);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  b.dynamic(mesh); // already one draw call; keep its vertex colors out of the merge
}

/** One big translucent water plane; the terrain dips below it for the river and lake. */
export function buildWater(b: AreaBuilder) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x3f86b8, transparent: true, opacity: 0.78 }));
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  return b.dynamic(water);
}

/** Invisible walls ringing the valley so nothing walks off the map. */
export function buildBounds(b: AreaBuilder) {
  const n = 72;
  const r = WORLD_RADIUS + 1;
  const half = (Math.PI * 2 * r) / n / 2 + 0.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // The Northpass cuts through the ring; its own rock walls hold the player in (the region adds the far end).
    if (passFrame(Math.cos(a) * r, Math.sin(a) * r).d < PASS.halfWidth + 12) continue;
    b.box(Math.cos(a) * r, 40, Math.sin(a) * r, 0.5, 80, half, -a, Layer.Bounds);
  }
}

/**
 * Opens the ground under the village well, so its shaft can be seen going down: the faces around
 * the grid point at the well's middle (within 2.9 m) collapse to nothing. Seen only; the collider
 * stays whole (the well's lid), and the well's paved apron covers the hole's ragged edge.
 */
function wellHole(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position;
  for (let f = 0; f < pos.count; f += 3) {
    let touches = false;
    for (let k = 0; k < 3; k++) touches ||= Math.hypot(pos.getX(f + k) - VILLAGE.x, pos.getZ(f + k) - VILLAGE.z) < 0.5;
    if (!touches) continue;
    for (let k = 1; k < 3; k++) pos.setXYZ(f + k, pos.getX(f), pos.getY(f), pos.getZ(f));
  }
}

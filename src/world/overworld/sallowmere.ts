import * as THREE from 'three';
import { fbm } from '../../core/math';
import { Layer, type Physics } from '../../core/physics';
import { mat } from '../../render/materials';
import { AreaBuilder } from '../area';
import { regionRng, terrainHeight } from './layout';
import {
  basinRing, basinSdf, BELL_TRIAL, channelFrame, CHANNEL, CUT, FORECOURT, inMouth, MERE_WATER, MOUTH_SIDES, onMereRoad, RIM_BOUNDS,
  SALLOWMERE_RECT, STILTWICK, WEIR,
} from './mere';
import { instanced } from './nature';
import type { BuiltRegion, RegionDef } from './region';
import { buildTerrain, type TerrainPaint, type TerrainRect } from './terrain';

/**
 * Sallowmere, the third region of the overworld (docs/sallowmere.md): its ground, water, scenery and rim. The map
 * itself is `mere.ts`; the town, the bell trial, the ferry and the Weir's door are later tickets' (their footprints
 * are empty, except the Weir's wall, which the first view looks at). It's built a step per frame (region.ts).
 */

const a = new THREE.Color(), d = new THREE.Color();

/** The mere's ground: mud under deep water, silt in the shallows, a pale shore, grey-green grass, packed-earth roads. */
const merePaint: TerrainPaint = (c, x, y, z, ny, n) => {
  // Deep water must read at a glance (it's a fall): its bed is near-black, the shallows' silt is light.
  if (y < MERE_WATER - 1.2) c.copy(a.set(0x262b22)).lerp(d.set(0x2e3328), n);
  else if (y < MERE_WATER - 0.1) c.copy(a.set(0x8c8962)).lerp(d.set(0x9a966d), n);
  else if (ny < 0.74 || y > 26) c.copy(a.set(0x86837a)).lerp(d.set(0x64615a), n);
  else if (onMereRoad(x, z, n * 0.8)) c.copy(a.set(0x9e8d68)).lerp(d.set(0x887656), n);
  else if (y < MERE_WATER + 0.7) c.copy(a.set(0xa3a184)).lerp(d.set(0x8f9373), n);
  else c.copy(a.set(0x6f8f58)).lerp(d.set(0x8aa266), n);
};

/** Terrain strips this deep (m) are one build step each. */
const STRIP = 20;

/** Where scenery stays out: the roads, the town's and the Weir's footprints, the Cut's apron, the trial's pool, the channel. */
function keepClear(x: number, z: number, margin = 0) {
  return onMereRoad(x, z, 1.5 + margin)
    || Math.hypot(x - STILTWICK.x, z - STILTWICK.z) < STILTWICK.r + 4 + margin
    || Math.hypot(x - FORECOURT.x, z - FORECOURT.z) < FORECOURT.r + 6 + margin
    || Math.hypot(x - CUT.x, z - CUT.z) < CUT.r + 3 + margin
    || Math.hypot(x - BELL_TRIAL.x, z - BELL_TRIAL.z) < BELL_TRIAL.r + 3 + margin
    || channelFrame(x, z).d < CHANNEL.bank + margin;
}

/** A random point in the basin (or `out` m up the hills). */
function anywhere(rand: () => number, out = 0) {
  const r = SALLOWMERE_RECT;
  let x = 0, z = 0;
  for (let i = 0; i < 20; i++) {
    x = r.x0 + rand() * (r.x1 - r.x0);
    z = r.z0 + rand() * (-345 - r.z0);
    if (basinSdf(x, z) < out) break;
  }
  return { x, z };
}

/** Willows on the shore, the islands and beside the causeways: a trunk, a round crown and a drooping skirt. */
function buildWillows(b: AreaBuilder) {
  const { rand } = b;
  const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [], skirts: THREE.Matrix4[] = [];
  const crownC: THREE.Color[] = [], skirtC: THREE.Color[] = [];
  for (let tries = 0, placed = 0; placed < 70 && tries < 4000; tries++) {
    const { x, z } = anywhere(rand, 8);
    const s = 0.85 + rand() * 0.5, yaw = rand() * Math.PI * 2, tint = rand();
    const y = terrainHeight(x, z);
    if (y < MERE_WATER + 0.4 || basinSdf(x, z) > 8 || keepClear(x, z) || inMouth(x, z)) continue;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.4 * s, z), q, new THREE.Vector3(s, s, s)));
    crowns.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 4.1 * s, z), q, new THREE.Vector3(2.3 * s, 1.5 * s, 2.3 * s)));
    skirts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 2.9 * s, z), q, new THREE.Vector3(s, s, s)));
    crownC.push(new THREE.Color().setHSL(0.2 + tint * 0.05, 0.28, 0.42 + tint * 0.06));
    skirtC.push(new THREE.Color().setHSL(0.21 + tint * 0.05, 0.25, 0.47 + tint * 0.06));
    b.cylinder(x, y + 1.5, z, 1.5, 0.4 * s, Layer.Prop);
    placed++;
  }
  instanced(b, new THREE.CylinderGeometry(0.22, 0.4, 2.8, 6), mat(0x5e5446), trunks);
  instanced(b, new THREE.IcosahedronGeometry(1, 0), mat(0xffffff), crowns, crownC);
  instanced(b, new THREE.ConeGeometry(2.6, 3.4, 8, 1, true), mat(0xffffff), skirts, skirtC);
}

/** Reed beds in the shallows (walked through; the thickets the lantern burns come later). */
function buildReeds(b: AreaBuilder) {
  const { rand } = b;
  const reeds: THREE.Matrix4[] = [], colors: THREE.Color[] = [];
  for (let tries = 0, clumps = 0; clumps < 260 && tries < 6000; tries++) {
    const { x, z } = anywhere(rand, 1);
    const draws = Array.from({ length: 14 }, rand);
    const depth = MERE_WATER - terrainHeight(x, z);
    if (depth < -0.2 || depth > 1 || fbm(x * 0.04 + 12, z * 0.04 - 5) < 0.5 || keepClear(x, z, -1)) continue;
    for (let k = 0; k < 7; k++) {
      const rx = x + (draws[k] - 0.5) * 2.4, rz = z + (draws[k + 7] - 0.5) * 2.4;
      const h = 1.3 + draws[(k + 3) % 14] * 0.9;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((draws[k] - 0.5) * 0.3, 0, (draws[k + 7] - 0.5) * 0.3));
      reeds.push(new THREE.Matrix4().compose(new THREE.Vector3(rx, terrainHeight(rx, rz) + h / 2, rz), q, new THREE.Vector3(1, h, 1)));
      colors.push(new THREE.Color().setHSL(0.13 + draws[k] * 0.08, 0.35, 0.42 + draws[k + 7] * 0.12));
    }
    clumps++;
  }
  instanced(b, new THREE.ConeGeometry(0.07, 1, 4), mat(0xffffff), reeds, colors, false);
}

/** Drowned field fences: post tops and a rail just above the water (the old fields under the mere). */
const FENCES: [number, number][][] = [
  [[5, -415], [60, -420]],
  [[60, -420], [62, -470]],
  [[-20, -440], [20, -446]],
  [[-122, -418], [-100, -462]],
  [[100, -452], [150, -456]],
];

function buildFences(b: AreaBuilder) {
  const wood = mat(0x6d6150), dark = mat(0x55493b);
  for (const [[ax, az], [bx, bz]] of FENCES) {
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    let run: { x: number; z: number }[] = [];
    const endRun = () => {
      if (run.length > 1) {
        const p = run[0], q = run[run.length - 1];
        const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, l = Math.hypot(q.x - p.x, q.z - p.z);
        const rail = b.mesh(new THREE.BoxGeometry(0.12, 0.12, l), dark, mx, MERE_WATER + 0.3, mz, false);
        rail.rotation.y = yaw;
        b.box(mx, MERE_WATER, mz, 0.15, 1, l / 2, yaw, Layer.Prop);
      }
      run = [];
    };
    for (let s = 0; s <= len; s += 2.5) {
      const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
      const depth = MERE_WATER - terrainHeight(x, z);
      if (depth < 0.2 || depth > 1.1 || keepClear(x, z, -1)) {
        endRun();
        continue;
      }
      const tilt = Math.sin(x * 3.1 + z * 1.7) * 0.15;
      const post = b.mesh(new THREE.BoxGeometry(0.16, depth + 0.5, 0.16), wood, x, MERE_WATER + 0.25 - depth / 2, z, false);
      post.rotation.set(tilt, yaw, -tilt);
      run.push({ x, z });
    }
    endRun();
  }
}

/** Boulders along the shore and up the hills. */
function buildRocks(b: AreaBuilder) {
  const { rand } = b;
  const rock = mat(0x857f72), rockDark = mat(0x6a655b);
  for (let tries = 0, placed = 0; placed < 60 && tries < 2000; tries++) {
    const { x, z } = anywhere(rand, 16);
    const size = 0.6 + Math.pow(rand(), 2) * 1.6, spin = [rand() * 3, rand() * 6, rand() * 3], dark = rand() < 0.5;
    const sdf = basinSdf(x, z);
    if (sdf < -2 || sdf > 16 || keepClear(x, z, 2) || (inMouth(x, z) && sdf < 30)) continue;
    const y = terrainHeight(x, z) + size * 0.3;
    const m = b.mesh(new THREE.DodecahedronGeometry(size, 0), dark ? rockDark : rock, x, y, z);
    m.rotation.set(spin[0], spin[1], spin[2]);
    m.scale.y = 0.75;
    if (size > 1) b.ball(x, y, z, size * 0.8, Layer.Prop);
    placed++;
  }
}

/**
 * The Old Weir's wall across the north end, with a tower at each end and three jammed sluice gates: a massing only,
 * so the first view has its goal (the dungeon's door and the night glow are T13's and T16's).
 */
function buildWeir(b: AreaBuilder) {
  const stone = mat(0x8e8a80), stoneDark = mat(0x6f6b63), timber = mat(0x3b3226);
  const { x, z, halfWidth } = WEIR;
  const base = MERE_WATER - 2, top = MERE_WATER + 13;
  b.mesh(new THREE.BoxGeometry(halfWidth * 2, top - base, 5), stone, x, (top + base) / 2, z);
  b.box(x, (top + base) / 2, z, halfWidth, (top - base) / 2, 2.5);
  b.mesh(new THREE.BoxGeometry(halfWidth * 2 + 1, 0.8, 5.6), stoneDark, x, top + 0.4, z);
  for (const gx of [-14, 0, 14]) b.mesh(new THREE.BoxGeometry(6, 7, 0.6), timber, x + gx, MERE_WATER + 4.5, z + 2.6);
  for (const side of [-1, 1]) {
    const tx = x + side * (halfWidth + 3);
    b.mesh(new THREE.CylinderGeometry(4, 4.6, 21, 10), stone, tx, base + 10.5, z);
    b.mesh(new THREE.ConeGeometry(5, 4, 10), stoneDark, tx, base + 23, z);
    b.cylinder(tx, base + 10.5, z, 10.5, 4.6);
  }
}

/** The invisible wall on the hills' crest all round, open only where the road comes down from the canyon. */
function buildRim(b: AreaBuilder) {
  const pts = basinRing(RIM_BOUNDS, 120);
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (inMouth(mx, mz)) continue;
    b.box(mx, 40, mz, 0.5, 80, Math.hypot(bx - ax, bz - az) / 2 + 0.5, Math.atan2(bx - ax, bz - az), Layer.Bounds);
  }
  // The open slope's sides, from the rim's crest back to the Northpass's end wall.
  const z0 = SALLOWMERE_RECT.z1 - RIM_BOUNDS * 2.2, z1 = SALLOWMERE_RECT.z1;
  for (const x of MOUTH_SIDES) b.box(x, 40, (z0 + z1) / 2, 0.5, 80, (z1 - z0) / 2, 0, Layer.Bounds);
}

/** The mere's own water: one flat plane over the region (the hills stand above it). */
function buildWater(b: AreaBuilder) {
  const r = SALLOWMERE_RECT;
  const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6f978a, transparent: true, opacity: 0.8 }));
  water.position.set((r.x0 + r.x1) / 2, MERE_WATER, (r.z0 + r.z1) / 2);
  water.receiveShadow = true;
  return b.dynamic(water);
}

/** The build, a step per frame: the terrain strip by strip, then each kind of scenery. */
function* build(physics: Physics): Generator<void, BuiltRegion, void> {
  const rand = regionRng('sallowmere');
  const root = new THREE.Group();
  const disposers: (() => void)[] = [];
  const add = (b: AreaBuilder) => {
    const done = b.finish();
    root.add(done.root);
    disposers.push(done.dispose);
  };
  const r = SALLOWMERE_RECT;
  for (let z1 = r.z1; z1 > r.z0; z1 -= STRIP) {
    const b = new AreaBuilder(physics, rand);
    const strip: TerrainRect = { x0: r.x0, x1: r.x1, z0: Math.max(r.z0, z1 - STRIP), z1 };
    buildTerrain(b, strip, merePaint);
    add(b);
    yield;
  }
  let water: THREE.Mesh | undefined;
  for (const part of [(b: AreaBuilder) => { water = buildWater(b); buildRim(b); }, buildWillows, buildReeds, buildFences, buildRocks, buildWeir]) {
    const b = new AreaBuilder(physics, rand);
    part(b);
    add(b);
    yield;
  }
  let t = 0;
  return {
    root,
    update(dt) {
      t += dt;
      if (water) water.position.y = MERE_WATER + Math.sin(t * 0.7) * 0.04;
    },
    dispose() {
      for (const dispose of disposers) dispose();
    },
  };
}

/** Out of sight inside the canyon's walls until the mouth, so it loads 150 m out (Wren is still in the Northpass) and drops at 190. */
export const SALLOWMERE: RegionDef = {
  id: 'sallowmere',
  rect: SALLOWMERE_RECT,
  loadDist: 150,
  unloadDist: 190,
  waterLevel: MERE_WATER,
  build,
};

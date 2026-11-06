import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { mat, uniqueMat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { terrainHeight } from './layout';
import { MERE_WATER, STILTWICK } from './mere';

/**
 * Stiltwick (docs/sallowmere.md, "The place"): the town on stilts above the shallows. A plaza deck in the middle, a
 * boardwalk to each causeway, four houses on their own platforms (each a spoke from the plaza), and a pier with the
 * ferry's moorings. The people, the trader and the bell post come later (T10, T12): `STILTWICK_SITES` says where.
 * Decks are World colliders (Wren walks on them); their skirts and stilts are Prop (they stop Wren wading under the
 * town and the camera passes through).
 */

/** The decks' walking surface (m): a hair above the causeways' tops (0.8), so the way on is level. */
export const DECK = MERE_WATER + 0.9;
const THICK = 0.3;
const C = STILTWICK;

/** A rectangle of deck: center, half-width (x before the yaw) and half-length (z before it), yaw about y. */
export interface Deck { x: number; z: number; hx: number; hz: number; yaw: number }

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (deg: number, r: number) => ({ x: C.x + Math.cos(rad(deg)) * r, z: C.z + Math.sin(rad(deg)) * r });
const toward = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

/** A boardwalk from (ax, az) to (bx, bz). */
function walk(ax: number, az: number, bx: number, bz: number, half = 1.2): Deck {
  return { x: (ax + bx) / 2, z: (az + bz) / 2, hx: half, hz: Math.hypot(bx - ax, bz - az) / 2, yaw: Math.atan2(bx - ax, bz - az) };
}

/** The plaza: 18 m square, the town's middle. */
export const PLAZA: Deck = { x: C.x, z: C.z, hx: 9, hz: 9, yaw: 0 };

/** A spot in a frame at (x, z) turned `yaw` (its front is +z): `at(lx, lz)` gives world x, z. */
function frame(x: number, z: number, yaw: number) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  return { x, z, yaw, at: (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos] };
}

/** The causeways' ends the boardwalks meet (mere.ts: `CAUSEWAYS.town` ends at (-34, -418), `.north` starts at (-70, -452)). */
const EAST_END = { x: -34, z: -418 };
const NORTH_END = { x: -70, z: -452 };
const NORTH_YAW = Math.atan2(NORTH_END.x - C.x, NORTH_END.z - C.z);

export interface HouseSpec {
  id: string;
  /** Degrees round the plaza (0 east, 90 south) and meters out. */
  angle: number;
  r: number;
  w: number;
  d: number;
  h: number;
  wall: number;
  roof: number;
}

export const HOUSES: readonly HouseSpec[] = [
  { id: 'saltwife', angle: 75, r: 25, w: 10, d: 8, h: 3.4, wall: 0xc9b894, roof: 0x5b6f9a },
  { id: 'netmender', angle: 140, r: 25, w: 9, d: 8, h: 3.4, wall: 0xb9c4b0, roof: 0xa5452f },
  { id: 'lampwright', angle: 200, r: 25, w: 11, d: 8, h: 3.4, wall: 0xd7c08f, roof: 0x6b5a45 },
  { id: 'tallhouse', angle: 305, r: 25, w: 8, d: 8, h: 4.8, wall: 0xa9a59a, roof: 0x4f7d4a },
];

/** A house's frame: front (the door and porch) toward the plaza, `at(lx, lz)` turns a spot in it into world x, z. */
export function houseFrame(s: HouseSpec) {
  const { x, z } = polar(s.angle, s.r);
  return frame(x, z, toward(x, z, C.x, C.z));
}

/** The porch is this deep (m) in front of the wall. */
const PORCH = 3.4;

/** A house's platform: half a meter round the walls at the back and sides, the porch in front. */
function houseDeck(s: HouseSpec): Deck {
  const back = -s.d / 2 - 0.5, front = s.d / 2 + PORCH;
  const [x, z] = houseFrame(s).at(0, (back + front) / 2);
  return { x, z, hx: s.w / 2 + 0.5, hz: (front - back) / 2, yaw: houseFrame(s).yaw };
}

/** The east boardwalk's direction and its left (north) side, and the market deck beside it (the trader's stall). */
const EAST_YAW = Math.atan2(EAST_END.x - C.x, EAST_END.z - C.z);
const eastDir = { x: Math.sin(EAST_YAW), z: Math.cos(EAST_YAW) }, north = { x: Math.cos(EAST_YAW), z: -Math.sin(EAST_YAW) };
const MARKET: Deck = { x: C.x + eastDir.x * 17 + north.x * 4.4, z: C.z + eastDir.z * 17 + north.z * 4.4, hx: 4.2, hz: 3.5, yaw: EAST_YAW };
/** The stall: its front (+z) toward the boardwalk, the trader behind the counter. */
const STALL = frame(C.x + eastDir.x * 17 + north.x * 5.2, C.z + eastDir.z * 17 + north.z * 5.2, Math.atan2(-north.x, -north.z));

/** The pier out into the mere, with the ferryman's landing at its end. */
const PIER_ANGLE = 108;
const pierStart = polar(PIER_ANGLE, 6), pierEnd = polar(PIER_ANGLE, 28.5), landing = polar(PIER_ANGLE, 30);

/** Every deck there is (the test walks them; the build lays them). */
export const DECKS: readonly Deck[] = [
  PLAZA,
  walk(C.x + eastDir.x * 7, C.z + eastDir.z * 7, EAST_END.x, EAST_END.z),
  walk(C.x + Math.sin(NORTH_YAW) * 7, C.z + Math.cos(NORTH_YAW) * 7, NORTH_END.x, NORTH_END.z),
  MARKET,
  ...HOUSES.flatMap((s) => {
    const front = houseFrame(s).at(0, s.d / 2 + PORCH); // the platform's front edge; the spoke runs from the plaza to it
    const from = polar(s.angle, 7);
    return [houseDeck(s), walk(from.x, from.z, front[0], front[1])];
  }),
  walk(pierStart.x, pierStart.z, pierEnd.x, pierEnd.z, 1.4),
  { x: landing.x, z: landing.z, hx: 3, hz: 3, yaw: toward(landing.x, landing.z, C.x, C.z) },
];

/** True on any deck. */
export function onDeck(x: number, z: number, slack = 0) {
  return DECKS.some((k) => {
    const dx = x - k.x, dz = z - k.z, c = Math.cos(k.yaw), s = Math.sin(k.yaw);
    return Math.abs(dx * c - dz * s) <= k.hx - slack && Math.abs(dx * s + dz * c) <= k.hz - slack;
  });
}

/**
 * Where the town's content goes (T10 the people, T12 the bell post). Every spot is on a deck and at least 1.5 m
 * from its edge (`stiltwick.test.ts`); `yaw` is the way a person stands.
 */
export const STILTWICK_SITES = {
  /** The bell post: a clear stretch of the plaza between the east boardwalk and the first house's. */
  bell: { x: polar(45, 5.5).x, z: polar(45, 5.5).z },
  /** The trader's stall; its trader stands behind the counter. */
  stall: { x: STALL.x, z: STALL.z },
  people: [
    { id: 'trader', x: STALL.at(0, -1.8)[0], z: STALL.at(0, -1.8)[1], yaw: STALL.yaw },
    { id: 'ferryman', x: landing.x, z: landing.z, yaw: toward(landing.x, landing.z, C.x, C.z) },
    ...HOUSES.map((s) => {
      const f = houseFrame(s), [x, z] = f.at(0, s.d / 2 + 1.8);
      return { id: s.id, x, z, yaw: f.yaw };
    }),
  ],
  /** Where the ferry's boat (T13) is moored, beside the landing. */
  ferry: polar(PIER_ANGLE + 7, 28),
} as const;

function plank(b: AreaBuilder, k: Deck, wood: THREE.Material) {
  const geo = new THREE.BoxGeometry(k.hx * 2, THICK, k.hz * 2);
  const m = b.mesh(geo, wood, k.x, DECK - THICK / 2, k.z);
  m.rotation.y = k.yaw;
  b.box(k.x, DECK - THICK / 2, k.z, k.hx, THICK / 2, k.hz, k.yaw);
}

/** The skirt (a fascia board hanging under the deck's edge, a Prop wall) and stilts under the deck's corners and every ~4 m. */
function support(b: AreaBuilder, k: Deck, beam: THREE.Material, fascia: THREE.Material) {
  const c = Math.cos(k.yaw), s = Math.sin(k.yaw);
  const world = (lx: number, lz: number): [number, number] => [k.x + lx * c + lz * s, k.z - lx * s + lz * c];
  const bottom = MERE_WATER - 0.7;
  for (const side of [-1, 1]) {
    // Long sides, then short sides (a box per side; the boards are a hand under the deck so the stilts show below them).
    const [lx, lz] = world(side * k.hx, 0);
    const m = b.mesh(new THREE.BoxGeometry(0.12, 0.5, k.hz * 2), fascia, lx, DECK - THICK - 0.25, lz);
    m.rotation.y = k.yaw;
    b.box(lx, (bottom + DECK - THICK) / 2, lz, 0.12, (DECK - THICK - bottom) / 2, k.hz, k.yaw, Layer.Prop);
    const [sx, sz] = world(0, side * k.hz);
    const e = b.mesh(new THREE.BoxGeometry(k.hx * 2, 0.5, 0.12), fascia, sx, DECK - THICK - 0.25, sz);
    e.rotation.y = k.yaw;
    b.box(sx, (bottom + DECK - THICK) / 2, sz, k.hx, (DECK - THICK - bottom) / 2, 0.12, k.yaw, Layer.Prop);
  }
  const nz = Math.max(1, Math.round((k.hz * 2) / 4)), nx = Math.max(1, Math.round((k.hx * 2) / 4));
  for (let i = 0; i <= nz; i++) {
    for (let j = 0; j <= nx; j++) {
      if (i > 0 && i < nz && j > 0 && j < nx) continue; // only the rim shows
      const [px, pz] = world(-k.hx + (j / nx) * k.hx * 2, -k.hz + (i / nz) * k.hz * 2);
      const floor = Math.min(terrainHeight(px, pz), MERE_WATER - 0.3);
      const top = DECK - THICK, len = top - floor + 0.5;
      b.mesh(new THREE.CylinderGeometry(0.17, 0.2, len, 6), beam, px, floor + len / 2 - 0.1, pz, false);
    }
  }
}

function lampPost(b: AreaBuilder, post: THREE.Material, lamp: THREE.Material, x: number, z: number) {
  b.mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), post, x, DECK + 1.2, z, false);
  b.dynamic(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34), lamp)).position.set(x, DECK + 2.55, z);
  b.cylinder(x, DECK + 1.2, z, 1.2, 0.15, Layer.Prop);
}

/** Builds the town; returns its window material so the region can make it glow at night. */
export function buildStiltwick(b: AreaBuilder) {
  const planks = mat(0x8a6f4c), beam = mat(0x4d3d2c), fascia = mat(0x5e4a36), trim = mat(0x7d6e60);
  const windowMat = uniqueMat(0x2a2a3a);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x6b4a22 });

  for (const k of DECKS) {
    plank(b, k, planks);
    support(b, k, beam, fascia);
  }

  // The houses: a body, its roof, a door and two windows toward the plaza, a chimney.
  for (const s of HOUSES) {
    const f = houseFrame(s);
    const g = new THREE.Group();
    g.position.set(f.x, DECK, f.z);
    g.rotation.y = f.yaw;
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const me = new THREE.Mesh(geo, m);
      me.position.set(px, py, pz);
      me.castShadow = me.receiveShadow = true;
      g.add(me);
      return me;
    };
    part(new THREE.BoxGeometry(s.w, s.h, s.d), mat(s.wall), 0, s.h / 2, 0);
    part(new THREE.BoxGeometry(s.w + 0.3, 0.3, s.d + 0.3), trim, 0, 0.15, 0);
    part(new THREE.ConeGeometry(Math.max(s.w, s.d) * 0.8, 2.8, 4), mat(s.roof), 0, s.h + 1.4, 0).rotation.y = Math.PI / 4;
    part(new THREE.BoxGeometry(0.7, 1.8, 0.7), trim, s.w / 4, s.h + 1.5, -s.d / 5);
    const dz = s.d / 2;
    for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.2, 2.4, 0.26), trim, sx * 0.8, 1.2, dz + 0.02);
    part(new THREE.BoxGeometry(1.8, 0.26, 0.28), trim, 0, 2.45, dz + 0.02);
    part(new THREE.BoxGeometry(1.4, 2.2, 0.14), mat(0x4a2e18), 0, 1.2, dz + 0.04);
    part(new THREE.SphereGeometry(0.07, 6, 5), mat(0xc9a227), 0.45, 1.1, dz + 0.14);
    for (const wx of [-s.w / 3.2, s.w / 3.2]) {
      const [x, z] = f.at(wx, dz + 0.05);
      const me = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), windowMat);
      me.position.set(x, DECK + (s.h > 4 ? 2.6 : 1.9), z);
      me.rotation.y = f.yaw;
      b.dynamic(me);
    }
    if (s.h > 4) for (const wx of [-s.w / 3.2, s.w / 3.2]) { // the tall house has an upper row of windows
      const [x, z] = f.at(wx, dz + 0.05);
      const me = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), windowMat);
      me.position.set(x, DECK + 3.9, z);
      me.rotation.y = f.yaw;
      b.dynamic(me);
    }
    b.box(f.x, DECK + s.h / 2, f.z, s.w / 2 + 0.15, s.h / 2 + 0.2, s.d / 2 + 0.15, f.yaw);
    b.staticGroup.add(g);
    // Porch lamps and a bench-sized crate beside the door.
    for (const sx of [-1, 1]) {
      const [x, z] = f.at(sx * (s.w / 2 - 0.2), s.d / 2 + PORCH - 0.4);
      lampPost(b, beam, lampMat, x, z);
    }
    const [cx, cz] = f.at(s.w / 2 - 1.6, s.d / 2 + 1.1);
    const crate = b.mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), mat(0x7a5230), cx, DECK + 0.35, cz);
    crate.rotation.y = f.yaw;
    b.box(cx, DECK + 0.35, cz, 0.45, 0.35, 0.35, f.yaw, Layer.Prop);
  }

  // The plaza: lamp posts at the corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lampPost(b, beam, lampMat, C.x + sx * 8.4, C.z + sz * 8.4);

  // The trader's stall on the market deck: a counter, four posts, a striped awning leaning back, wares on the counter.
  const stall = new THREE.Group();
  stall.position.set(STALL.x, DECK, STALL.z);
  stall.rotation.y = STALL.yaw;
  const sp = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
    const me = new THREE.Mesh(geo, m);
    me.position.set(px, py, pz);
    me.castShadow = me.receiveShadow = true;
    stall.add(me);
    return me;
  };
  sp(new THREE.BoxGeometry(4, 1, 1.2), mat(0x7a5230), 0, 0.5, 0);
  for (const px of [-2.05, 2.05]) for (const pz of [-1.5, 0.7]) sp(new THREE.BoxGeometry(0.14, 2.6, 0.14), beam, px, 1.3, pz);
  for (let i = 0; i < 4; i++) sp(new THREE.BoxGeometry(1.15, 0.12, 3.2), mat(i % 2 ? 0xe8dcc0 : 0xb8643a), -1.725 + i * 1.15, 2.7, -0.4).rotation.x = 0.12;
  for (const [px, py, c] of [[-1.2, 1.15, 0xd8b24a], [0.2, 1.1, 0x8aa266], [1.3, 1.2, 0xc9633d]] as const) sp(new THREE.SphereGeometry(0.2, 6, 5), mat(c), px, py, 0);
  b.staticGroup.add(stall);
  b.box(STALL.x, DECK + 0.5, STALL.z, 2, 0.5, 0.6, STALL.yaw, Layer.Prop);

  // The pier: a mooring post at each side of the landing, two boats alongside, lamps at the end.
  const lf = toward(landing.x, landing.z, C.x, C.z);
  for (const side of [-1, 1]) {
    const px = landing.x + Math.cos(lf) * 2.4 * side + Math.sin(lf) * 2.4, pz = landing.z - Math.sin(lf) * 2.4 * side + Math.cos(lf) * 2.4;
    lampPost(b, beam, lampMat, px, pz);
  }
  const boat = (x: number, z: number, yaw: number, color: number) => {
    const g = new THREE.Group();
    g.position.set(x, MERE_WATER, z);
    g.rotation.y = yaw;
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 4.6), mat(color));
    hull.position.y = 0.05;
    const inside = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 4.2), mat(0x3b2f24));
    inside.position.y = 0.42;
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 4), mat(color));
    prow.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    prow.position.set(0, 0.05, 2.9);
    prow.scale.set(1, 1, 0.5);
    for (const m of [hull, inside, prow]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    b.staticGroup.add(g);
    b.box(x, MERE_WATER + 0.05, z, 0.85, 0.4, 2.3, yaw, Layer.Prop);
  };
  const pf = toward(pierStart.x, pierStart.z, pierEnd.x, pierEnd.z);
  for (const [off, along, color] of [[-3.2, 20, 0x6e8a8c], [3.2, 16, 0xa57c52]] as const) {
    const p = polar(PIER_ANGLE, along);
    boat(p.x + Math.cos(pf) * off, p.z - Math.sin(pf) * off, pf, color);
  }

  return { windowMat, lampMat };
}

/** The night look of the town's windows and lamps (called every frame from the region). */
export function lightStiltwick(l: { windowMat: THREE.MeshLambertMaterial; lampMat: THREE.MeshBasicMaterial }, night: number) {
  l.windowMat.emissive.setRGB(0.9 * night, 0.6 * night, 0.25 * night);
  l.lampMat.color.setRGB(0.42 + 0.58 * night, 0.29 + 0.58 * night, 0.13 + 0.4 * night);
}

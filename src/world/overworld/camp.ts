import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { mat, surf } from '../../render/materials';
import { glow } from '../../render/shapes';
import type { AreaBuilder } from '../area';
import { BellPickup, BellPost } from '../bell';
import { buildCourse, COURSES, type CourseDef, type PlatformDef } from '../platforming';
import { BEYOND, beyondFrame, beyondPoint, PASS, terrainHeight } from './layout';

/**
 * Wayfarers' Camp and the canyon beyond it (docs/bells.md, shrine session D3): the third bell's site. The camp
 * (a flat circle at the end of the Northpass, `PASS.camp`) holds the Waybell's empty post; a narrow canyon leaves
 * it northward, cut by a chasm Wren crosses on rock pillars; the two Cragstalkers guard the far side, and the bell
 * waits behind it. The ground itself is carved in `layout.ts`. These objects live in the overworld proper (not in
 * the Northpass region) so their state survives the region streaming out and back in.
 */

/** A point `lat` m to the left of the canyon's centerline, `s` m from the camp's centre. */
export function beyondAt(s: number, lat = 0) {
  const p = beyondPoint(s);
  return { x: p.x + p.nx * lat, z: p.z + p.nz * lat };
}

/** The chasm's bottom; the pillars rise from it (a little deeper, so their feet are buried). */
const PIT_Y = BEYOND.floor - BEYOND.pitDepth;
const TOP = BEYOND.floor + 0.05;

/** [s, lateral, top, radius, checkpoint?] for the crossing's pillars, camp side first. */
const STEPS: [number, number, number, number, boolean?][] = [
  [19.5, 0, TOP, 2.8, true],
  [25, 1, TOP, 1.6],
  [30.5, -1, TOP + 0.5, 1.5, true],
  [41.5, 0, TOP, 3, true],
];

/** The crossing: four fixed ledges and a slider between the middle one and the far side. */
function crossing(): CourseDef {
  const platforms: PlatformDef[] = STEPS.map(([s, lat, top, r, checkpoint]) => {
    const { x, z } = beyondAt(s, lat);
    return { x, z, r, top, thickness: top - PIT_Y + 0.4, checkpoint, look: 0x7d776c };
  });
  const p = beyondPoint(36);
  const a = beyondAt(36, -2.2);
  platforms.splice(3, 0, {
    x: a.x, z: a.z, r: 1.6, top: TOP + 1, thickness: 0.8, look: 0xa39a86,
    move: { by: [p.nx * 3.6, 0, p.nz * 3.6], period: 5, phase: 0 },
  });
  const first = platforms[0], last = platforms[platforms.length - 1];
  return { platforms, start: [first.x, first.z], goal: [last.x, last.z], fallY: BEYOND.floor - 3 };
}

export const CANYON_COURSE = (COURSES.canyon = crossing());

/** Where the two Cragstalkers wait on the far side ([s from the camp's centre, lateral]), and the bell behind them. */
export const CRAGSTALKERS_AT: [number, number][] = [[52.5, -2], [57, 2]];
export const WAYBELL_AT = 64;
/** The far side's walkable ground starts here (the goal ledge ends the crossing). */
export const FAR_SIDE_FROM = 43.5;

export const WAYBELL_PICKUP = (() => {
  const { x, z } = beyondAt(WAYBELL_AT);
  return { x, z, y: terrainHeight(x, z) };
})();

/** The Waybell's post in the camp, near the canyon's mouth, facing the fire. */
export const WAYBELL_POST = { x: -4.5, z: -262.5 };
const FIRE = { x: -15.5, z: -252.5 };

/** Where the Cragstalker may walk: the canyon's far side (it never follows onto the crossing). */
export const onFarSide = (p: { x: number; z: number }) => {
  const f = beyondFrame(p.x, p.z);
  return f.s > FAR_SIDE_FROM && f.d < BEYOND.halfWidth + 1.5;
};

/** Where it notices Wren: the far side and the goal ledge. */
export const inStalkerRange = (p: { x: number; z: number }) => {
  const f = beyondFrame(p.x, p.z);
  return f.s > FAR_SIDE_FROM - 3 && f.d < BEYOND.halfWidth + 1.5;
};

/** Inside the canyon around the chasm: the only place a fall counts (the pass below is lower than the fall line). */
export const inCrossing = (x: number, z: number) => {
  const f = beyondFrame(x, z);
  return f.d < BEYOND.halfWidth + 2 && f.s > BEYOND.pitFrom - 3 && f.s < BEYOND.pitTo + 3;
};

export function buildCamp(b: AreaBuilder) {
  const stone = surf('rock', 0x8a8478), stoneDark = surf('rock', 0x6e695f), wood = surf('wood', 0x6b4c30), woodDark = surf('wood', 0x4a3322);
  const at = (x: number, z: number) => terrainHeight(x, z);

  // The fire: a ring of stones, crossed logs, a low flame (it burns by night and day: the camp is lived in).
  const fy = at(FIRE.x, FIRE.z);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const m = b.mesh(new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.04, 0), i % 2 ? stone : stoneDark, FIRE.x + Math.cos(a) * 1, fy + 0.12, FIRE.z + Math.sin(a) * 1);
    m.rotation.set(i, i * 2, 0);
    m.scale.y = 0.7;
  }
  for (const yaw of [0.5, -0.9]) {
    const log = b.mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.3, 6), woodDark, FIRE.x, fy + 0.2, FIRE.z);
    log.rotation.set(0, yaw, Math.PI / 2 - 0.15);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa03a });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 6), flameMat);
  flame.position.set(FIRE.x, fy + 0.65, FIRE.z);
  const halo = glow(0xff9a3a, 1.1, 0.16);
  halo.position.set(FIRE.x, fy + 0.7, FIRE.z);
  b.dynamic(flame);
  b.dynamic(halo);
  b.cylinder(FIRE.x, fy + 0.3, FIRE.z, 0.3, 1.1, Layer.Prop);

  // Log seats round the fire.
  for (const [a, len] of [[2.4, 1.8], [3.7, 1.6], [5.4, 2]] as const) {
    const x = FIRE.x + Math.cos(a) * 2.6, z = FIRE.z + Math.sin(a) * 2.6, y = at(x, z);
    const seat = b.mesh(new THREE.CylinderGeometry(0.24, 0.24, len, 7), wood, x, y + 0.24, z);
    seat.rotation.set(0, -a, Math.PI / 2);
    seat.rotation.order = 'YXZ';
    b.box(x, y + 0.25, z, 0.3, 0.25, len / 2, -a + Math.PI / 2, Layer.Prop);
  }

  // Two tents, their doors toward the fire.
  for (const [x, z, color] of [[-21, -259, 0xc9b48a], [-9.5, -246.5, 0x9a7f5a]] as const) {
    const y = at(x, z);
    const yaw = Math.atan2(FIRE.x - x, FIRE.z - z);
    const tent = b.mesh(new THREE.ConeGeometry(2.1, 2.3, 4), surf('cloth', color), x, y + 1.15, z);
    tent.rotation.y = yaw + Math.PI / 4;
    tent.scale.set(1, 1, 1.25);
    const door = b.mesh(new THREE.BoxGeometry(0.9, 1.3, 0.1), mat(0x2e2620), x + Math.sin(yaw) * 1.35, y + 0.65, z + Math.cos(yaw) * 1.35);
    door.rotation.y = yaw;
    b.box(x, y + 1, z, 1.4, 1, 1.4, yaw, Layer.Prop);
  }

  // Crates and a barrel by the near tent, a lantern pole at the canyon's mouth.
  for (const [x, z, s] of [[-22.8, -255.4, 0.8], [-22.2, -253.9, 0.6], [-20.2, -262.6, 0.9]] as const) {
    const y = at(x, z);
    b.mesh(new THREE.BoxGeometry(s, s, s), wood, x, y + s / 2, z).rotation.y = x + z;
    b.box(x, y + s / 2, z, s / 2, s / 2, s / 2, x + z, Layer.Prop);
  }
  const px = -10, pz = -266.5, py = at(px, pz);
  b.mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), woodDark, px, py + 1.3, pz);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), new THREE.MeshBasicMaterial({ color: 0xffd48a }));
  lamp.position.set(px, py + 2.7, pz);
  b.dynamic(lamp);
  b.cylinder(px, py + 1.3, pz, 1.3, 0.12, Layer.Prop);

  // The canyon's mouth: a few boulders where it narrows, and the chasm's lip.
  for (const [s, lat, size] of [[13, -3.6, 1.1], [14.5, 3.7, 0.8], [17, -3.8, 0.9]] as const) {
    const { x, z } = beyondAt(s, lat);
    const y = at(x, z);
    const m = b.mesh(new THREE.DodecahedronGeometry(size, 0), stone, x, y + size * 0.3, z);
    m.rotation.set(s, lat, 0);
    m.scale.y = 0.75;
    b.ball(x, y + size * 0.3, z, size * 0.8, Layer.Prop);
  }

  const post = new BellPost(b, 'way', WAYBELL_POST.x, at(WAYBELL_POST.x, WAYBELL_POST.z), WAYBELL_POST.z, Math.atan2(FIRE.x - WAYBELL_POST.x, FIRE.z - WAYBELL_POST.z));
  b.dynamic(post.group);
  const course = buildCourse(b, CANYON_COURSE, { x: 0, y: 0, z: 0 }, 0x7d776c);
  const bell = new BellPickup(b, 'way', WAYBELL_PICKUP.x, WAYBELL_PICKUP.y, WAYBELL_PICKUP.z);
  b.dynamic(bell.group);
  return { post, bell, course };
}

/** The camp's circle, for tests and look scenes. */
export const CAMP = PASS.camp;

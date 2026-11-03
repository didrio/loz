import * as THREE from 'three';
import { mat } from '../../render/materials';
import { Layer } from '../../core/physics';
import type { AreaBuilder } from '../area';
import { BellPickup } from '../bell';
import { buildCourse, COURSES, type CourseDef, type PlatformDef } from '../platforming';
import { GORGE, gorgeFrame, gorgePoint, regionRng, terrainHeight } from './layout';

/**
 * The Hushing Gorge (docs/bells.md, 3b): the Morrowbell's trial. A walk up the corridor past thornlings and a
 * sentinel, then a climb over the pit on rock pillars to the bell. The terrain itself is carved in `layout.ts`;
 * this file is the climb (a platform course in world coordinates), the rocks and the bell.
 */

/** A point `lat` m to the left of the centerline `s` m in (left looking inward). */
export function gorgeAt(s: number, lat = 0) {
  const p = gorgePoint(s);
  return { x: p.x + p.nx * lat, z: p.z + p.nz * lat };
}

/** The pit's bottom; pillars rise from it (a little deeper, so their feet are buried). */
const PIT_Y = GORGE.floor - GORGE.pitDepth;

/** [s, lateral, top, radius, checkpoint?] for the climb's rock pillars, in order. */
const STEPS: [number, number, number, number, boolean?][] = [
  [62.5, 0, GORGE.floor + 0.05, 3, true],
  [69, 1, GORGE.floor + 0.7, 2],
  [79.5, 0.5, GORGE.floor + 2, 2],
  [85, -1, GORGE.floor + 2.8, 1.8, true],
  [89.5, 0.5, GORGE.floor + 3.6, 2],
  [94.5, 0, GORGE.floor + 4.6, 2.8, true],
];

/** The climb over the pit; the platform before the last is a slider across the corridor. */
function climb(): CourseDef {
  const platforms: PlatformDef[] = STEPS.map(([s, lat, top, r, checkpoint]) => {
    const { x, z } = gorgeAt(s, lat);
    return { x, z, r, top, thickness: top - PIT_Y + 0.4, checkpoint, look: 0x7d776c };
  });
  // The slider rides between the second and third pillars, across the pit.
  const p = gorgePoint(74.2);
  const a = gorgeAt(74.2, -2.2);
  platforms.splice(2, 0, {
    x: a.x, z: a.z, r: 1.8, top: GORGE.floor + 1.35, thickness: 0.8, look: 0xa39a86,
    move: { by: [p.nx * 4.4, 0, p.nz * 4.4], period: 5, phase: 0 },
  });
  const first = platforms[0], last = platforms[platforms.length - 1];
  return { platforms, start: [first.x, first.z], goal: [last.x, last.z], fallY: GORGE.floor - 3 };
}

export const GORGE_COURSE = (COURSES.gorge = climb());

/** The bell's pillar: the last one. */
export const GORGE_BELL = (() => {
  const last = GORGE_COURSE.platforms[GORGE_COURSE.platforms.length - 1];
  return { x: last.x, z: last.z, y: last.top };
})();

/** Fixed spots for the corridor's monsters: [s, lateral]. */
export const GORGE_THORNLINGS: [number, number][] = [[34, -2], [40, 2.5], [46, -2.5], [51, 2], [57, -1]];
/** The keeper's statue guarding the way, facing the mouth. */
export const GORGE_SENTINEL: [number, number] = [53, 0];

export function sentinelFacing() {
  const p = gorgePoint(GORGE_SENTINEL[0]);
  return Math.atan2(-p.dx, -p.dz);
}

/** Where the monsters stand: on the corridor floor (the walls are steep rock). */
export const onGorgeFloor = (p: { x: number; z: number }) => gorgeFrame(p.x, p.z).d < GORGE.halfWidth + 2;

export function buildGorge(b: AreaBuilder) {
  const rand = regionRng('gorge');
  const rock = mat(0x8a8478), rockDark = mat(0x6e695f);
  // Boulders along the foot of the walls, and a few fallen at the mouth.
  for (let i = 0; i < 40; i++) {
    const s = rand() * (GORGE.pitAt - 6);
    const lat = (rand() < 0.5 ? -1 : 1) * (3.2 + rand() * 1.8); // on the flat floor, not the slope
    const size = 0.5 + Math.pow(rand(), 2) * 1.1;
    const { x, z } = gorgeAt(s, lat);
    const y = terrainHeight(x, z) + size * 0.3;
    const m = b.mesh(new THREE.DodecahedronGeometry(size, 0), rand() < 0.5 ? rock : rockDark, x, y, z);
    m.rotation.set(rand() * 3, rand() * 6, rand() * 3);
    m.scale.y = 0.75;
    if (size > 0.9) b.ball(x, y, z, size * 0.8, Layer.Prop);
  }
  // The broken plank bridge: two stubs of boards reaching out over the pit's rim.
  const plank = mat(0x7a5a38);
  for (const side of [-1, 1]) {
    const { x, z } = gorgeAt(GORGE.pitAt - 2.5, side * 3.4);
    const p = gorgePoint(GORGE.pitAt - 2.5);
    const y = terrainHeight(x, z) + 0.12;
    for (let k = 0; k < 3; k++) {
      const m = b.mesh(new THREE.BoxGeometry(1.1, 0.16, 0.9), plank, x + p.dx * (0.95 * k) + p.nx * side * 0.1, y, z + p.dz * (0.95 * k) + p.nz * side * 0.1);
      m.rotation.y = Math.atan2(p.dx, p.dz) + (k % 2 ? 0.08 : -0.06);
    }
  }
  const course = buildCourse(b, GORGE_COURSE, { x: 0, y: 0, z: 0 }, 0x7d776c);
  const bell = new BellPickup(b, 'morrow', GORGE_BELL.x, GORGE_BELL.y, GORGE_BELL.z);
  b.dynamic(bell.group);
  return { course, bell };
}

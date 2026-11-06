import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { mat } from '../../render/materials';
import { AreaBuilder } from '../area';
import { BEYOND, PASS, passFrame, passPoint, PASS_LENGTH, regionRng, terrainHeight } from './layout';
import type { BuiltRegion, RegionDef } from './region';
import { buildTerrain, type TerrainRect } from './terrain';

/** Past the valley's square (which ends at z = -210), covering the camp and the mountains around it. */
export const NORTHPASS_RECT: TerrainRect = { x0: -150, x1: 150, z0: -330, z1: -210 };

/** The pass's boulders: along both foot-walls of the corridor and scattered in the camp. */
function buildRocks(b: AreaBuilder) {
  const rand = regionRng('pass');
  const rock = mat(0x8a8478), rockDark = mat(0x6e695f);
  for (let i = 0; i < 70; i++) {
    const s = rand() * PASS_LENGTH;
    const lat = (rand() < 0.5 ? -1 : 1) * (PASS.halfWidth - 3 + rand() * 2.5);
    const size = 0.5 + Math.pow(rand(), 2) * 1.3;
    const p = passPoint(s);
    const x = p.x + p.nx * lat, z = p.z + p.nz * lat;
    // The first stretch belongs to the valley (its terrain, its chunk): only this region's own ground gets rocks.
    if (z > NORTHPASS_RECT.z1 || passFrame(x, z).d > PASS.wallTop) continue;
    const y = terrainHeight(x, z) + size * 0.3;
    const m = b.mesh(new THREE.DodecahedronGeometry(size, 0), rand() < 0.5 ? rock : rockDark, x, y, z);
    m.rotation.set(rand() * 3, rand() * 6, rand() * 3);
    m.scale.y = 0.75;
    if (size > 0.9) b.ball(x, y, z, size * 0.8, Layer.Prop);
  }
}

/** The mountain end: nothing walks over the peaks into Sallowmere; only the canyon's road goes on (`CANYON_GAP` m either side of it). */
const CANYON_GAP = 14;
function buildEnd(b: AreaBuilder) {
  const z = NORTHPASS_RECT.z0 + 2, cx = BEYOND.path[0][0];
  for (const [x0, x1] of [[NORTHPASS_RECT.x0, cx - CANYON_GAP], [cx + CANYON_GAP, NORTHPASS_RECT.x1]]) {
    b.box((x0 + x1) / 2, 40, z, (x1 - x0) / 2, 80, 0.5, 0, Layer.Bounds);
  }
}

/**
 * The Northpass: the second region of the overworld. Its mountains and canyon can be seen from the whole
 * northern valley, so it loads and drops where the fog (full at 290 m) hides it: it never pops into view.
 */
export const NORTHPASS: RegionDef = {
  id: 'northpass',
  rect: NORTHPASS_RECT,
  loadDist: 260,
  unloadDist: 300,
  build(physics): BuiltRegion {
    const b = new AreaBuilder(physics, regionRng('pass'));
    buildTerrain(b, NORTHPASS_RECT);
    buildRocks(b);
    buildEnd(b);
    const { root, dispose } = b.finish();
    return { root, dispose };
  },
};

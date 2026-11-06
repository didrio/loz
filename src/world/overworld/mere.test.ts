import { centerline } from '../../core/math';
import { describe, expect, it } from 'vitest';
import { DEEP_DEPTH, WADE_DEPTH } from '../../game/water';
import { areaNameAt, terrainHeight } from './layout';
import { NORTHPASS_RECT } from './northpass';
import {
  basinRing, basinSdf, BELL_TRIAL, CAUSEWAYS, CHANNEL, carveMere, channelFrame, CUT, DESCENT, descentFrame, descentY, FARM, FORECOURT,
  inMouth, ISLANDS, MERE_WATER, OVERLOOK, RIM_BOUNDS, SALLOWMERE_RECT, STILTWICK, WEIR,
} from './mere';

const depth = (x: number, z: number) => MERE_WATER - terrainHeight(x, z);

/** Every 2 m of the region's grid Wren can walk to from the overlook: no deep water, no slope over 50°, inside the rim's wall. */
function reachable() {
  const r = SALLOWMERE_RECT, step = 2;
  const nx = (r.x1 - r.x0) / step + 1, nz = Math.round((-322 - r.z0) / step) + 1;
  const at = (i: number, k: number) => ({ x: r.x0 + i * step, z: -322 - k * step });
  const h = new Float64Array(nx * nz), ok = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const { x, z } = at(i, k);
      const y = terrainHeight(x, z);
      h[k * nx + i] = y;
      // The Northpass's end wall (z -328) is open only at the canyon; the rim's wall stands on the crest except where the road comes down.
      ok[k * nx + i] = Number(MERE_WATER - y < DEEP_DEPTH && (basinSdf(x, z) < RIM_BOUNDS || inMouth(x, z)) && (z < NORTHPASS_RECT.z0 + 2 || Math.abs(x - OVERLOOK.x) < 14));
    }
  }
  const seen = new Uint8Array(nx * nz);
  const start = Math.round((OVERLOOK.x - r.x0) / step) + Math.round((-322 - OVERLOOK.z) / step) * nx;
  const queue = [start];
  seen[start] = 1;
  const climb = step * Math.tan((50 * Math.PI) / 180) + 0.45;
  while (queue.length) {
    const c = queue.pop()!;
    const i = c % nx, k = (c - i) / nx;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || ii >= nx || kk < 0 || kk >= nz) continue;
      const n = kk * nx + ii;
      if (seen[n] || !ok[n] || Math.abs(h[n] - h[c]) > climb) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  const can = (x: number, z: number) => seen[Math.round((x - r.x0) / step) + Math.round((-322 - z) / step) * nx] === 1;
  const edges: string[] = [];
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const { x, z } = at(i, k);
      const edge = i === 0 || i === nx - 1 || k === nz - 1;
      if (seen[k * nx + i] && edge) edges.push(`${x}, ${z}`);
    }
  }
  return { can, edges };
}

describe('Sallowmere\'s map', () => {
  it('leaves the canyon and the Waybell\'s ground alone', () => {
    for (let z = -200; z >= -324; z -= 2) {
      for (let x = -60; x <= 40; x += 4) expect(carveMere(37, x, z)).toBe(37);
    }
  });

  it('meets the canyon floor at the overlook and comes down to the shore on a gentle, level road', () => {
    expect(terrainHeight(OVERLOOK.x, OVERLOOK.z)).toBeCloseTo(12, 1);
    const line = centerline(DESCENT.path);
    let prev = descentY(0);
    for (let s = 0.5; s <= line.length; s += 0.5) {
      const y = descentY(s);
      expect(Math.abs(y - prev) / 0.5).toBeLessThan(0.12);
      prev = y;
      const p = line.point(s);
      if (p.z > -332) continue; // the canyon's closed end, which the road cuts through
      expect(Math.abs(terrainHeight(p.x, p.z) - y)).toBeLessThan(0.3);
      for (const lat of [-2, 2]) expect(Math.abs(terrainHeight(p.x + p.nx * lat, p.z + p.nz * lat) - y)).toBeLessThan(0.6);
    }
    expect(descentFrame(OVERLOOK.x, OVERLOOK.z).d).toBeLessThan(0.1);
  });

  it('keeps the road and every causeway dry', () => {
    const lines = [DESCENT.path, ...Object.values(CAUSEWAYS)].map(centerline);
    for (const line of lines) {
      for (let s = 0; s <= line.length; s += 1) {
        const p = line.point(s);
        expect(depth(p.x, p.z)).toBeLessThan(WADE_DEPTH);
      }
    }
  });

  it('puts Stiltwick in shallow water with no deep spot, and the islands, farm, forecourt and Cut on dry ground', () => {
    for (let dx = -STILTWICK.r; dx <= STILTWICK.r; dx += 2) {
      for (let dz = -STILTWICK.r; dz <= STILTWICK.r; dz += 2) {
        if (Math.hypot(dx, dz) <= STILTWICK.r) expect(depth(STILTWICK.x + dx, STILTWICK.z + dz)).toBeLessThan(DEEP_DEPTH - 0.2);
      }
    }
    expect(depth(STILTWICK.x, STILTWICK.z)).toBeGreaterThan(WADE_DEPTH);
    for (const m of [...ISLANDS, FARM, FORECOURT, CUT]) expect(depth(m.x, m.z)).toBeLessThan(-0.8);
    expect(depth(BELL_TRIAL.x, BELL_TRIAL.z)).toBeGreaterThan(DEEP_DEPTH + 1);
  });

  it('runs the channel deep all the way round the forecourt', () => {
    const line = centerline(CHANNEL.path);
    for (let s = 0; s <= line.length; s += 1) {
      const p = line.point(s);
      expect(depth(p.x, p.z)).toBeGreaterThan(DEEP_DEPTH + 1);
    }
  });

  it('lets Wren walk from the overlook to the town, the Cut, the farm and the islands, but not to the Weir without a boat, nor out over the hills', () => {
    const { can, edges } = reachable();
    expect(edges, 'the only way out is back up the canyon').toEqual([]);
    for (const m of [STILTWICK, CUT, FARM, ...ISLANDS]) expect(can(m.x, m.z), `${m.x}, ${m.z}`).toBe(true);
    expect(can(BELL_TRIAL.x - BELL_TRIAL.r - 4, BELL_TRIAL.z)).toBe(true);
    expect(can(FORECOURT.x, FORECOURT.z)).toBe(false);
    expect(can(WEIR.x, WEIR.z + 3)).toBe(false);
  });

  it('rings the basin with hills well above the water where its wall stands', () => {
    for (const [x, z] of basinRing(RIM_BOUNDS, 96)) {
      expect(x).toBeGreaterThan(SALLOWMERE_RECT.x0);
      expect(x).toBeLessThan(SALLOWMERE_RECT.x1);
      expect(z).toBeGreaterThan(SALLOWMERE_RECT.z0);
      if (!inMouth(x, z) && channelFrame(x, z).d > CHANNEL.bank) expect(terrainHeight(x, z)).toBeGreaterThan(MERE_WATER + 12);
    }
  });

  it('names its places', () => {
    expect(areaNameAt(OVERLOOK.x, OVERLOOK.z - 6)).toBe('Sallowmere');
    expect(areaNameAt(STILTWICK.x, STILTWICK.z)).toBe('Stiltwick');
    expect(areaNameAt(FORECOURT.x, FORECOURT.z)).toBe('The Old Weir');
    expect(areaNameAt(CUT.x, CUT.z)).toBe('The Lightless Cut');
    expect(areaNameAt(-10, -300)).toBe('The Northpass');
  });
});

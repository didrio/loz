import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/math';
import type { AreaBuilder } from '../area';
import { buildBlightGrowths, scarTouch, swingReaches, THORN_HP, THORN_MIN_LEVEL, thornTouch } from './blight';
import { SCARS, scarLine, terrainHeight, thornClusters } from './layout';

describe('the thorns', () => {
  const clump = { x: 10, y: 1, z: 20, r: 3, height: 6, hp: THORN_HP };

  it('catch Wren inside a clump and leave her be just outside it', () => {
    expect(thornTouch([clump], 10, 1, 22, 1)).toBe(clump);
    expect(thornTouch([clump], 10, 1, 23.2, 1)).toBe(clump); // her body brushes the edge
    expect(thornTouch([clump], 10, 1, 24, 1)).toBeNull();
  });

  it('are harmless as they shrink away, and to Wren high above them', () => {
    expect(thornTouch([clump], 10, 1, 21, THORN_MIN_LEVEL - 0.01)).toBeNull();
    expect(thornTouch([clump], 10, 1, 21, 0)).toBeNull();
    expect(thornTouch([clump], 10, 8, 21, 1)).toBeNull();
    expect(thornTouch([clump], 10, 5, 21, 1)).toBe(clump);
  });

  it('are harmless once cut down', () => {
    expect(thornTouch([{ ...clump, hp: 0 }], 10, 1, 21, 1)).toBeNull();
  });

  it('are reached by a swing from just outside, facing them, and not from behind or too far', () => {
    // Wren stands where they'd stop hurting her (r + her body), facing the clump.
    expect(swingReaches(clump, 10, 23.6, 0, -1, 2.2)).not.toBeNull();
    expect(swingReaches(clump, 10, 23.6, 0, 1, 2.2)).toBeNull(); // her back to it
    expect(swingReaches(clump, 10, 25.5, 0, -1, 2.2)).toBeNull(); // out of reach
  });
});

describe('the growths', () => {
  const fakeBuilder = { dynamic() {} } as unknown as AreaBuilder;
  const grow = () => buildBlightGrowths(fakeBuilder, mulberry32(5521));

  it('stand on every clump the layout lists, each with its id and full strength', () => {
    const g = grow();
    expect(g.clusters.map((c) => c.id)).toEqual(thornClusters().map((c) => c.id));
    expect(g.clusters.every((c) => c.hp === THORN_HP)).toBe(true);
  });

  it(`fall to ${THORN_HP} sword hits, and only then`, () => {
    const g = grow();
    g.setLevel(1);
    const c = g.clusters.find((k) => k.id.startsWith('thorn.lone.'))!;
    const swing = () => g.hit(c.x, c.z + c.r + 0.6, 0, -1, 2.2).filter((h) => h.id === c.id);
    for (let i = 1; i < THORN_HP; i++) expect(swing()).toEqual([expect.objectContaining({ felled: false })]);
    expect(swing()).toEqual([expect.objectContaining({ felled: true })]);
    expect(swing()).toEqual([]);
    expect(thornTouch(g.clusters, c.x, c.y, c.z, 1)).toBeNull();
  });

  it('can\'t be cut while they shrink away', () => {
    const g = grow();
    g.setLevel(THORN_MIN_LEVEL - 0.1);
    const c = g.clusters[0];
    expect(g.hit(c.x, c.z + c.r + 0.6, 0, -1, 2.2)).toEqual([]);
  });

  it('stay cut on a save restore', () => {
    const g = grow();
    const id = g.clusters[3].id;
    g.restore((k) => k === id);
    expect(g.clusters[3].hp).toBe(0);
    expect(g.clusters[4].hp).toBe(THORN_HP);
  });
});

describe('the scars', () => {
  const line = scarLine(SCARS[0]);
  const p = line[Math.floor(line.length / 2)];
  const ground = terrainHeight(p.x, p.z);

  it('hurt Wren standing on one, and shove her out to the side she\'s on', () => {
    const hit = scarTouch(p.x + 0.2, ground, p.z, 1);
    expect(hit).not.toBeNull();
    // The shove comes from a point about a metre in from her: she's thrown out, not further in.
    expect(Math.hypot(hit!.x - (p.x + 0.2), hit!.z - p.z)).toBeCloseTo(1, 5);
  });

  it('leave her be mid-jump, beside one, and once the blight is lifting', () => {
    expect(scarTouch(p.x, ground + 0.6, p.z, 1)).toBeNull();
    expect(scarTouch(p.x + 30, terrainHeight(p.x + 30, p.z), p.z, 1)).toBeNull();
    expect(scarTouch(p.x, ground, p.z, THORN_MIN_LEVEL - 0.01)).toBeNull();
  });
});

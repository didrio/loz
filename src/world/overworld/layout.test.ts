import { mulberry32 } from '../../core/math';
import { describe, expect, it } from 'vitest';
import { areaNameAt, BRIDGE, bridgeDeck, GORGE, GORGE_LENGTH, gorgeFloor, gorgePoint, GROVE, inGorge, isEnemyGround, isOpen, LAKE, PATHS, regionRng, riverZ, SHRINE, SPAWN, terrainHeight, VILLAGE, WATER_Y, WORLD_RADIUS } from './layout';

describe('overworld layout', () => {
  it('starts the player on dry, fairly flat ground', () => {
    const h = terrainHeight(SPAWN.x, SPAWN.z);
    expect(h).toBeGreaterThan(WATER_Y + 0.5);
    expect(Math.abs(terrainHeight(SPAWN.x + 2, SPAWN.z) - h)).toBeLessThan(0.5);
  });

  it('keeps the village and grove clearing flat and dry', () => {
    for (const [dx, dz] of [[0, 0], [10, 5], [-12, -8], [15, -10]]) {
      expect(terrainHeight(VILLAGE.x + dx, VILLAGE.z + dz)).toBeCloseTo(1.2, 0);
    }
    expect(terrainHeight(GROVE.x, GROVE.z)).toBeGreaterThan(WATER_Y + 1);
  });

  it('puts the shrine on a plateau', () => {
    expect(terrainHeight(SHRINE.x, SHRINE.z)).toBeCloseTo(9, 1);
    expect(terrainHeight(SHRINE.x - 8, SHRINE.z)).toBeCloseTo(9, 0);
  });

  it('carves the river and lake below the water across the map', () => {
    for (let x = -150; x <= 120; x += 10) expect(terrainHeight(x, riverZ(x))).toBeLessThan(WATER_Y);
    expect(terrainHeight(LAKE.x, LAKE.z)).toBeLessThan(WATER_Y - 1);
  });

  it('spans the river with a bridge whose deck stays above the water', () => {
    expect(riverZ(BRIDGE.x)).toBeCloseTo(BRIDGE.z);
    for (let z = BRIDGE.z - BRIDGE.halfLen; z <= BRIDGE.z + BRIDGE.halfLen; z += 1) {
      expect(bridgeDeck(z)).toBeGreaterThan(WATER_Y + 1);
    }
  });

  it('keeps roads walkable: inside the valley and never deeper than waist-deep water', () => {
    // Two roads ford ponds: the grove road (11 m of road, up to 0.44 m deep) and the shrine
    // road (14 m, up to 1.03 m, about waist height on Wren).
    // Walkable today (no swimming yet); if swimming or drowning is added, revisit these.
    for (const path of PATHS) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i], [bx, bz] = path[i + 1];
        for (let t = 0; t <= 1; t += 0.05) {
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          expect(Math.hypot(x, z)).toBeLessThan(WORLD_RADIUS);
          const onBridge = Math.abs(x - BRIDGE.x) < 1 && Math.abs(z - BRIDGE.z) <= BRIDGE.halfLen + 2;
          if (!onBridge) expect(terrainHeight(x, z), `road at ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(WATER_Y - 1.1);
        }
      }
    }
  });

  it('never spawns scenery or enemies at the start or in the village', () => {
    expect(isOpen(SPAWN.x, SPAWN.z)).toBe(false);
    expect(isOpen(VILLAGE.x, VILLAGE.z)).toBe(false);
    expect(isEnemyGround(SPAWN.x, SPAWN.z)).toBe(false);
    expect(isEnemyGround(VILLAGE.x, VILLAGE.z)).toBe(false);
  });
});

describe('the Hushing Gorge', () => {
  it('has a floor that climbs from the field to 7 m, flat across the corridor', () => {
    const at = (s: number, lat = 0) => {
      const p = gorgePoint(s);
      return terrainHeight(p.x + p.nx * lat, p.z + p.nz * lat);
    };
    expect(at(0)).toBeLessThan(3);
    for (let s = 32; s <= GORGE.pitAt - 4; s += 4) for (const lat of [-3, 0, 3]) expect(at(s, lat)).toBeCloseTo(GORGE.floor, 0);
    for (let s = 0; s < 30; s += 2) expect(at(s + 2) - at(s)).toBeLessThan(2); // a walkable ramp
    expect(gorgeFloor(GORGE_LENGTH)).toBeCloseTo(GORGE.floor);
  });

  it('has walls that stand well above the floor, and a pit below it', () => {
    for (let s = 36; s < GORGE.pitAt; s += 6) {
      const p = gorgePoint(s);
      for (const side of [-1, 1]) expect(terrainHeight(p.x + p.nx * 11 * side, p.z + p.nz * 11 * side)).toBeGreaterThan(GORGE.floor + 8);
    }
    const p = gorgePoint(GORGE.pitAt + 10);
    expect(terrainHeight(p.x, p.z)).toBeCloseTo(GORGE.floor - GORGE.pitDepth, 0);
  });

  it('is named, keeps field enemies out, and stays inside the world', () => {
    expect(areaNameAt(gorgePoint(40).x, gorgePoint(40).z)).toBe('The Hushing Gorge');
    expect(isEnemyGround(gorgePoint(40).x, gorgePoint(40).z)).toBe(false);
    expect(inGorge(gorgePoint(40).x, gorgePoint(40).z)).toBe(true);
    for (const [x, z] of GORGE.path) expect(Math.hypot(x, z) + GORGE.halfWidth + 2).toBeLessThan(WORLD_RADIUS);
  });

  it('leaves the original seeds alone (the valley and the hollow keep their layout)', () => {
    expect(regionRng('valley')()).toBe(mulberry32(1337)());
    expect(regionRng('hollow')()).toBe(mulberry32(4242)());
    expect(regionRng('gorge')()).not.toBe(regionRng('valley')());
    expect(inGorge(0, 14)).toBe(false);
  });
});

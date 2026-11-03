import { mulberry32 } from '../../core/math';
import { describe, expect, it } from 'vitest';
import { areaNameAt, BRIDGE, bridgeDeck, GORGE, GORGE_LENGTH, gorgeFloor, gorgePoint, GROVE, inGorge, inPass, PASS, PASS_LENGTH, passFloor, passPoint, passFrame, isEnemyGround, pathDist, RUINS, BUDS, GATE, HOLLOW, isOpen, LAKE, PATHS, regionRng, riverZ, SHRINE, SPAWN, terrainHeight, VILLAGE, WATER_Y, WORLD_RADIUS } from './layout';

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

describe('the Northpass', () => {
  const at = (s: number, lat = 0) => {
    const p = passPoint(s);
    return terrainHeight(p.x + p.nx * lat, p.z + p.nz * lat);
  };

  it('has a floor that climbs gently from the field to the camp, flat across the corridor', () => {
    expect(at(0)).toBeLessThan(2);
    for (let s = 40; s <= PASS_LENGTH - 20; s += 10) for (const lat of [-4, 0, 4]) expect(at(s, lat)).toBeCloseTo(passFloor(s), 0);
    for (let s = 0; s < PASS_LENGTH; s += 2) expect(Math.abs(at(s + 2) - at(s))).toBeLessThan(1.2); // walkable all the way
    expect(passFloor(PASS_LENGTH)).toBeCloseTo(PASS.floor);
    expect(terrainHeight(PASS.camp.x, PASS.camp.z)).toBeCloseTo(PASS.floor, 0);
  });

  it('has walls too steep to climb (over 55 degrees) from the gate to the camp', () => {
    for (let s = 40; s < PASS_LENGTH - 30; s += 8) { // the camp itself opens out
      const p = passPoint(s);
      for (const side of [-1, 1]) {
        const h = (lat: number) => terrainHeight(p.x + p.nx * lat * side, p.z + p.nz * lat * side);
        const rise = h(PASS.halfWidth + 4.7) - h(PASS.halfWidth + 2.2); // the steep middle of the wall
        expect(Math.atan2(rise, 2.5), `wall at s=${s}`).toBeGreaterThan((55 * Math.PI) / 180);
      }
    }
  });

  it('opens the camp into a flat circle, wider than the corridor', () => {
    for (const [dx, dz] of [[0, 0], [12, 0], [-12, 0], [0, -12]]) expect(terrainHeight(PASS.camp.x + dx, PASS.camp.z + dz)).toBeCloseTo(PASS.floor, 0);
    expect(passFrame(PASS.camp.x + PASS.camp.r, PASS.camp.z).d).toBeCloseTo(PASS.halfWidth);
  });

  it('leaves the valley alone beyond its reach, is named, and keeps field enemies out', () => {
    expect(inPass(0, 14)).toBe(false);
    expect(inPass(-62, -58)).toBe(false);
    expect(areaNameAt(passPoint(100).x, passPoint(100).z)).toBe('The Northpass');
    expect(areaNameAt(passPoint(0).x, passPoint(0).z)).toBe('Emberfield');
    expect(isEnemyGround(passPoint(10).x, passPoint(10).z)).toBe(false);
    expect(regionRng('pass')()).not.toBe(regionRng('valley')());
  });
});

describe('ruins', () => {
  it('stand on near-flat ground (their floorboards sit on the highest corner), clear of roads and water', () => {
    for (const r of RUINS) {
      const hs = [[0, 0], [-3.5, -3], [3.5, -3], [-3.5, 3], [3.5, 3]].map(([dx, dz]) => terrainHeight(r.x + dx, r.z + dz));
      expect(Math.max(...hs) - Math.min(...hs), r.id).toBeLessThan(0.35);
      expect(pathDist(r.x, r.z), r.id).toBeGreaterThan(r.r);
      expect(Math.min(...hs), r.id).toBeGreaterThan(WATER_Y + 1);
    }
  });

  it('keep apart, and clear of the gate, the hollow, the shrine, the lake and the river', () => {
    for (const [i, a] of RUINS.entries()) {
      for (const c of RUINS.slice(i + 1)) expect(Math.hypot(a.x - c.x, a.z - c.z), `${a.id} / ${c.id}`).toBeGreaterThan(a.r + c.r);
      if (!a.id.startsWith('ring') && a.id !== 'shieldCottage') {
        expect(Math.hypot(a.x - VILLAGE.x, a.z - VILLAGE.z), a.id).toBeGreaterThan(VILLAGE.r + a.r);
      }
      expect(Math.hypot(a.x - GATE.x, a.z - GATE.z), a.id).toBeGreaterThan(25);
      expect(Math.hypot(a.x - HOLLOW.x, a.z - HOLLOW.z), a.id).toBeGreaterThan(HOLLOW.r + a.r + 6);
      expect(Math.hypot(a.x - SHRINE.x, a.z - SHRINE.z), a.id).toBeGreaterThan(40);
      expect(Math.hypot(a.x - LAKE.x, a.z - LAKE.z), a.id).toBeGreaterThan(36);
      expect(Math.abs(a.z - riverZ(a.x)), a.id).toBeGreaterThan(15);
    }
  });

  it('hide jars: one blue gem, one or two hearts and the rest empty, in every ruin', () => {
    for (const r of RUINS) {
      const n = (d: string) => r.jars.filter((j) => j === d).length;
      expect(n('bluegem'), r.id).toBe(1);
      expect(n('heart'), r.id).toBeGreaterThanOrEqual(1);
      expect(n('heart'), r.id).toBeLessThanOrEqual(2);
      expect(n('empty'), r.id).toBeGreaterThanOrEqual(2);
      expect(r.jars.length, r.id).toBeLessThanOrEqual(6);
    }
  });

  it('hide Pip\'s doll in one jar, in the lake home, far from Thistledown', () => {
    const dolls = RUINS.flatMap((r) => r.jars.map((d, i) => ({ r, d, i }))).filter((j) => j.d === 'doll');
    expect(dolls.map((j) => `${j.r.id}.${j.i}`)).toEqual(['lakeHome.5']);
    expect(Math.hypot(dolls[0].r.x - VILLAGE.x, dolls[0].r.z - VILLAGE.z)).toBeGreaterThan(120);
  });
});

describe('murmurbuds', () => {
  it('stand on dry land, spread across the valley and clear of the ruins', () => {
    for (const [i, a] of BUDS.entries()) {
      expect(terrainHeight(a.x, a.z), a.id).toBeGreaterThan(WATER_Y + 0.5);
      for (const c of BUDS.slice(i + 1)) expect(Math.hypot(a.x - c.x, a.z - c.z), `${a.id} / ${c.id}`).toBeGreaterThan(60);
      for (const r of RUINS) expect(Math.hypot(a.x - r.x, a.z - r.z), `${a.id} / ${r.id}`).toBeGreaterThan(r.r + 2);
    }
  });
});

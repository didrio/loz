import { mulberry32 } from '../../core/math';
import { describe, expect, it } from 'vitest';
import { DEEP_DEPTH } from '../../game/water';
import { areaNameAt, atmosphereAt, inVillageGuard, inVillageMusic, MILL, BRIDGE, bridgeDeck, GORGE, GORGE_LENGTH, gorgeFloor, gorgePoint, GROVE, inGorge, inPass, PASS, PASS_LENGTH, passFloor, passPoint, passFrame, isEnemyGround, pathDist, RUINS, BUDS, GATE, HOLLOW, isOpen, LAKE, PATHS, regionRng, riverZ, SHRINE, SPAWN, terrainHeight, VILLAGE, WATER_Y, WORLD_RADIUS, THICKETS, thicketClusters, THORN_SPREAD, atBearing, inGate, inHollow, SCARS, scarLine, scarClusters, scarAt, thornClusters, LONE_THORNS, FIELD_POSTS, gorgeFrame, HOLLOW_ENTRANCE, LONE_OAK, SHRINE_DOOR, inRuin } from './layout';
import { SIGNS } from './landmarks';

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
    // Walkable: wading stops at DEEP_DEPTH (game/water.ts), where deep water becomes a fall, so every road ford stays
    // shallower than that.
    for (const path of PATHS) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i], [bx, bz] = path[i + 1];
        for (let t = 0; t <= 1; t += 0.05) {
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          expect(Math.hypot(x, z)).toBeLessThan(WORLD_RADIUS);
          const onBridge = Math.abs(x - BRIDGE.x) < 1 && Math.abs(z - BRIDGE.z) <= BRIDGE.halfLen + 2;
          if (!onBridge) expect(terrainHeight(x, z), `road at ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(WATER_Y - DEEP_DEPTH);
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

  it('plays the village song around town and up to the shield\'s cottage, not out in the field', () => {
    const cottage = RUINS[0];
    expect(inVillageMusic(VILLAGE.x, VILLAGE.z)).toBe(true);
    expect(inVillageMusic(MILL.x - 8, MILL.z)).toBe(true);
    expect(inVillageMusic(cottage.x, cottage.z)).toBe(true);
    expect(inVillageMusic(cottage.x, cottage.z - 10)).toBe(true);
    expect(inVillageMusic(SPAWN.x, SPAWN.z)).toBe(false);
    expect(inVillageMusic(VILLAGE.x + 60, VILLAGE.z)).toBe(false);
  });

  it('names the village exactly where its song plays', () => {
    for (let x = -130; x <= 10; x += 2) {
      for (let z = -130; z <= 10; z += 2) expect(areaNameAt(x, z) === 'Thistledown Village').toBe(inVillageMusic(x, z));
    }
  });

  it('keeps the village safe ground, and every enemy spawn outside it', () => {
    expect(inVillageGuard(VILLAGE.x, VILLAGE.z)).toBe(true);
    expect(inVillageGuard(MILL.x, MILL.z)).toBe(true);
    for (let x = -170; x <= 170; x += 4) {
      for (let z = -170; z <= 170; z += 4) if (isEnemyGround(x, z)) expect(inVillageGuard(x, z)).toBe(false);
    }
  });
});

describe('blight thickets', () => {
  const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  };

  for (const t of THICKETS) {
    const clusters = thicketClusters(t);

    it(`${t.id}: stays off the roads, the start, the village and the passes`, () => {
      for (const c of clusters) {
        expect(pathDist(c.x, c.z)).toBeGreaterThan(THORN_SPREAD + 2);
        expect(Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z)).toBeGreaterThan(THORN_SPREAD + 10);
        expect(inVillageGuard(c.x, c.z)).toBe(false);
        expect(inGate(c.x, c.z, THORN_SPREAD + 1) || inHollow(c.x, c.z, THORN_SPREAD + 3) || inGorge(c.x, c.z, THORN_SPREAD) || inPass(c.x, c.z, THORN_SPREAD)).toBe(false);
      }
    });

    it(`${t.id}: is a real ring with a clear way in, and leaves what it guards untouched`, () => {
      expect(clusters.length).toBeGreaterThan(5);
      // The lane from the middle straight out through the gap is at least gapWidth wide.
      const out = atBearing(t.x, t.z, t.gap, t.r + THORN_SPREAD + 2);
      for (const c of clusters) expect(segDist(c.x, c.z, t.x, t.z, out.x, out.z) - THORN_SPREAD).toBeGreaterThanOrEqual(t.gapWidth / 2 - 1e-6);
      // Neighbours round the ring overlap, so there's no slipping between them.
      for (let i = 1; i < clusters.length; i++) {
        const a = clusters[i - 1], b = clusters[i];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < t.r) expect(d).toBeLessThan(THORN_SPREAD * 2);
      }
      const ruin = RUINS.find((r) => r.id === t.id);
      for (const c of clusters) expect(Math.hypot(c.x - t.x, c.z - t.z) - THORN_SPREAD).toBeGreaterThan((ruin?.r ?? 1) + 1.5);
    });
  }
});

describe('blight scars and routing', () => {
  const clear = (x: number, z: number, m: number) => {
    expect(pathDist(x, z), `road near ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(m + 1.5);
    expect(inVillageMusic(x, z), `village at ${x.toFixed(0)},${z.toFixed(0)}`).toBe(false);
    expect(Math.hypot(x - SPAWN.x, z - SPAWN.z)).toBeGreaterThan(m + 12);
    const where = `${x.toFixed(0)},${z.toFixed(0)}`;
    expect(inGate(x, z, m + 2), `gate at ${where}`).toBe(false);
    expect(inHollow(x, z, m + 3), `hollow at ${where}`).toBe(false);
    expect(inRuin(x, z, m + 1), `ruin at ${where}`).toBe(false);
    expect(gorgeFrame(x, z).d, `gorge walls near ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(GORGE.wallTop + m + 2);
    expect(z > GATE.z + 8, `south of the gate at ${where}`).toBe(true); // the pass's corridor stays clear
    for (const b of BUDS) expect(Math.hypot(b.x - x, b.z - z)).toBeGreaterThan(m + 5);
    for (const g of SIGNS) expect(Math.hypot(g.x - x, g.z - z)).toBeGreaterThan(m + 4);
    expect(Math.hypot(LONE_OAK.x - x, LONE_OAK.z - z)).toBeGreaterThan(m + 6);
  };

  it('keeps the veins off roads, the village, the start, landmarks and water', () => {
    for (const s of SCARS) {
      for (const p of scarLine(s)) {
        clear(p.x, p.z, p.w / 2);
        expect(terrainHeight(p.x, p.z), `${s.id} in water at ${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeGreaterThan(WATER_Y + 0.3);
      }
    }
  });

  it('keeps every clump of the veins and the lone ones clear in the same way, on dry land', () => {
    for (const c of [...SCARS.flatMap((s) => scarClusters(s)), ...LONE_THORNS.map(([x, z]) => ({ x, z }))]) {
      clear(c.x, c.z, THORN_SPREAD);
      expect(terrainHeight(c.x, c.z), `clump in water at ${c.x.toFixed(0)},${c.z.toFixed(0)}`).toBeGreaterThan(WATER_Y + 0.3);
    }
  });

  it('gives every clump its own id, and the veins\' clumps overlap so a stretch is a wall', () => {
    const all = thornClusters();
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const s of SCARS) {
      const cs = scarClusters(s);
      expect(cs.length).toBeGreaterThan(0);
      for (let i = 1; i < cs.length; i++) {
        const d = Math.hypot(cs[i].x - cs[i - 1].x, cs[i].z - cs[i - 1].z);
        if (d < 10) expect(d).toBeLessThan(THORN_SPREAD * 2);
      }
    }
  });

  it('keeps lone clumps apart: they never wall a way on their own', () => {
    const others = thornClusters().filter((c) => !c.id.startsWith('thorn.lone.'));
    for (const [x, z] of LONE_THORNS) {
      for (const o of others) expect(Math.hypot(o.x - x, o.z - z), `lone ${x},${z} by ${o.id}`).toBeGreaterThan(THORN_SPREAD * 4);
      for (const [x2, z2] of LONE_THORNS) if (x2 !== x || z2 !== z) expect(Math.hypot(x2 - x, z2 - z)).toBeGreaterThan(THORN_SPREAD * 4);
    }
  });

  it('finds a scar only under its line, and points the way out to the side Wren is on', () => {
    const s = SCARS[0], line = scarLine(s), p = line[Math.floor(line.length / 2)];
    const hit = scarAt(p.x, p.z);
    expect(hit?.id).toBe(s.id);
    expect(scarAt(p.x + 40, p.z)).toBeNull();
    const q = line[Math.floor(line.length / 2) + 1];
    const nx = -(q.z - p.z), nz = q.x - p.x, n = Math.hypot(nx, nz);
    const side = scarAt(p.x + (nx / n) * 0.3, p.z + (nz / n) * 0.3);
    expect(side!.out.x * nx + side!.out.z * nz).toBeGreaterThan(0);
    expect(scarAt(p.x, p.z, 0)).toBeNull(); // shrunk to nothing, it's gone
  });

  it('has thin veins Wren can jump (a jump clears ~5.5 m) and a wide pool at the gate she can\'t', () => {
    const widths = SCARS.flatMap((s) => scarLine(s).map((p) => p.w));
    expect(Math.max(...widths)).toBeGreaterThan(6);
    const wide = widths.filter((w) => w > 4.5).length;
    expect(wide / widths.length).toBeLessThan(0.15);
  });

  it('puts the guard posts on dry, open land, on the way to what they guard', () => {
    for (const p of FIELD_POSTS) {
      expect(terrainHeight(p.x, p.z)).toBeGreaterThan(WATER_Y + 0.3);
      expect(inVillageGuard(p.x, p.z)).toBe(false);
      expect(pathDist(p.x, p.z)).toBeLessThan(14); // in sight of the road
    }
    expect(Math.hypot(FIELD_POSTS[0].x - GROVE.x, FIELD_POSTS[0].z - GROVE.z)).toBeLessThan(35);
  });

  // Reachability on a 2 m grid: Wren walks where it's dry or wading-deep and not cliff-steep. Clumps are walls; thin
  // scars are jumped, so only the wide stretches block. Nothing reachable before the blight may be cut off by it,
  // and the detour stays short: the routes "take a little thought", never a maze.
  describe('routing', () => {
    const STEP = 2, N = 172;
    const W = Math.floor((2 * N) / STEP) + 1;
    const idx = (x: number, z: number) => Math.round((z + N) / STEP) * W + Math.round((x + N) / STEP);
    const at = (i: number) => ({ x: (i % W) * STEP - N, z: Math.floor(i / W) * STEP - N });
    const thorns = thornClusters();
    const free = (blight: boolean) => {
      const ok = new Uint8Array(W * W);
      for (let i = 0; i < ok.length; i++) {
        const { x, z } = at(i);
        const onRoad = pathDist(x, z) < 2;
        if (!onRoad && (terrainHeight(x, z) < WATER_Y - 1.1 || Math.hypot(x, z) > 170)) continue;
        if (blight && thorns.some((c) => Math.hypot(c.x - x, c.z - z) < THORN_SPREAD + 0.4)) continue;
        if (blight && (scarAt(x, z)?.hw ?? 0) > 2.8) continue;
        ok[i] = 1;
      }
      return ok;
    };
    const walk = (ok: Uint8Array, from: { x: number; z: number }) => {
      const dist = new Float32Array(W * W).fill(Infinity);
      const start = idx(from.x, from.z);
      dist[start] = 0;
      const queue = [start];
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q], { x, z } = at(i), h = terrainHeight(x, z);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx * STEP, nz = z + dz * STEP;
          if (Math.abs(nx) > N || Math.abs(nz) > N) continue;
          const j = idx(nx, nz);
          if (!ok[j] || dist[j] !== Infinity) continue;
          if (Math.abs(terrainHeight(nx, nz) - h) > 2.2 && pathDist(nx, nz) > 2) continue; // too steep
          dist[j] = dist[i] + STEP;
          queue.push(j);
        }
      }
      return dist;
    };
    const before = walk(free(false), SPAWN), after = walk(free(true), SPAWN);
    const near = (p: { x: number; z: number }, dist: Float32Array) => {
      let best = Infinity;
      for (let dz = -6; dz <= 6; dz += STEP) for (let dx = -6; dx <= 6; dx += STEP) best = Math.min(best, dist[idx(p.x + dx, p.z + dz)] ?? Infinity);
      return best;
    };
    const places: [string, { x: number; z: number }][] = [
      ['the village', VILLAGE], ['the grove chest', GROVE], ['the gorge mouth', { x: GORGE.path[0][0], z: GORGE.path[0][1] }],
      ['the shrine door', SHRINE_DOOR], ['the hollow', HOLLOW_ENTRANCE], ['the gate', { x: GATE.x, z: GATE.z + 6 }],
      ['the bridge', BRIDGE], ['the lone oak', LONE_OAK], ...RUINS.map((r) => [`ruin ${r.id}`, r] as [string, { x: number; z: number }]),
      ...BUDS.map((b) => [b.id, b] as [string, { x: number; z: number }]),
    ];
    for (const [name, p] of places) {
      it(`still reaches ${name} without cutting a thorn, by a short detour`, () => {
        const b = near(p, before), a = near(p, after);
        expect(b, `${name} reachable at all`).toBeLessThan(Infinity);
        expect(a, `${name} cut off by the blight`).toBeLessThan(Infinity);
        expect(a - b, `${name}: ${b} m becomes ${a} m`).toBeLessThan(40);
      });
    }
  });
});

describe('atmosphereAt', () => {
  it('puts the hollow\'s gloaming over the hollow, the village\'s haze over Thistledown, the valley\'s everywhere else', () => {
    expect(atmosphereAt(HOLLOW.x, HOLLOW.z)).toBe('hollow');
    expect(atmosphereAt(VILLAGE.x, VILLAGE.z)).toBe('village');
    expect(atmosphereAt(SHRINE.x, SHRINE.z)).toBe('valley');
    expect(atmosphereAt(0, -100)).toBe('valley');
  });

  it('starts the hollow\'s look a few steps before its rim, so the eased crossing is finished at the edge', () => {
    expect(atmosphereAt(HOLLOW.x, HOLLOW.z - HOLLOW.r - 2)).toBe('hollow');
  });
});

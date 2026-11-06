import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../../core/physics';
import type { Interactable, Trigger } from '../area';
import { FINISH_DIST, LOAD_DIST, RegionStreamer, UNLOAD_DIST, distToRect, type BuiltRegion, type RegionDef } from './region';
import { Overworld } from './index';
import { NORTHPASS, NORTHPASS_RECT } from './northpass';
import { GATE, PASS, SPAWN, terrainHeight, WATER_Y } from './layout';
import { VALLEY_RECT } from './terrain';
import { MERE_WATER, OVERLOOK, SALLOWMERE_RECT, STILTWICK } from './mere';
import { SALLOWMERE } from './sallowmere';

beforeAll(async () => {
  await initPhysics();
});

const rect = { x0: 0, x1: 20, z0: -200, z1: -100 };

function setup() {
  const log: string[] = [];
  const it1: Interactable = { id: 'npc.test', x: 0, z: -150, r: 1, label: 'Talk', enabled: () => true };
  const tr1: Trigger = { id: 'trigger.test', x: 0, z: -150, r: 1, enabled: () => true };
  const def: RegionDef = {
    id: 'test',
    rect,
    build: () => ({
      root: new THREE.Group(),
      interactables: [it1],
      triggers: [tr1],
      update: () => log.push('update'),
      dispose: () => log.push('dispose'),
    }),
  };
  const host = { root: new THREE.Group(), interactables: [] as Interactable[], triggers: [] as Trigger[] };
  return { streamer: new RegionStreamer([def], new Physics(), host), host, log, it1 };
}

describe('RegionStreamer', () => {
  it('measures distance to a rectangle', () => {
    expect(distToRect(rect, 10, -150)).toBe(0);
    expect(distToRect(rect, 10, -50)).toBe(50);
    expect(distToRect(rect, 23, -96)).toBe(5);
  });

  it('loads within the load distance, keeps it until the unload distance, then drops it', () => {
    const { streamer, host, log, it1 } = setup();
    streamer.streamAt(10, -100 + LOAD_DIST + 1);
    expect(streamer.loadedIds).toEqual([]);
    streamer.streamAt(10, -100 + LOAD_DIST - 1);
    expect(streamer.loadedIds).toEqual(['test']);
    expect(host.root.children).toHaveLength(1);
    expect(host.interactables).toEqual([it1]);
    expect(host.triggers).toHaveLength(1);
    streamer.update(0.1);
    expect(log).toEqual(['update']);
    streamer.streamAt(10, -100 + UNLOAD_DIST - 1); // between the two: stays
    expect(streamer.loadedIds).toEqual(['test']);
    streamer.streamAt(10, -100 + UNLOAD_DIST + 1);
    expect(streamer.loadedIds).toEqual([]);
    expect(host.interactables).toEqual([]);
    expect(host.triggers).toEqual([]);
    expect(log).toEqual(['update', 'dispose']);
  });

  it('knows the water level of the region a point is in (none if it has no water)', () => {
    const wet: RegionDef = { id: 'wet', rect: { x0: 100, x1: 120, z0: 0, z1: 20 }, waterLevel: 12, build: () => ({ root: new THREE.Group(), dispose() {} }) };
    const dry: RegionDef = { id: 'dry', rect, build: () => ({ root: new THREE.Group(), dispose() {} }) };
    const host = { root: new THREE.Group(), interactables: [] as Interactable[], triggers: [] as Trigger[] };
    const s = new RegionStreamer([wet, dry], new Physics(), host);
    expect(s.waterAt(110, 10)).toBe(12);
    expect(s.waterAt(10, -150)).toBeNull();
    expect(s.waterAt(500, 500)).toBeUndefined(); // outside every region: the valley's water
  });

  it('the overworld uses the valley\'s water, and none in the Northpass', async () => {
    const ow = new Overworld(new Physics());
    expect(ow.waterLevelAt(0, 0)).toBe(WATER_Y);
    expect(ow.waterLevelAt(0, (NORTHPASS_RECT.z0 + NORTHPASS_RECT.z1) / 2)).toBeNull();
    ow.dispose();
  });

  it('builds a region only once while Wren stays near, and disposes it with the area', () => {
    const { streamer, log } = setup();
    streamer.streamAt(10, -150);
    streamer.streamAt(11, -151);
    expect(streamer.loadedIds).toEqual(['test']);
    streamer.dispose();
    expect(streamer.loadedIds).toEqual([]);
    expect(log).toEqual(['dispose']);
  });
});

describe('a region built over several frames', () => {
  function stepped() {
    const log: string[] = [];
    const it1: Interactable = { id: 'npc.slow', x: 0, z: -150, r: 1, label: 'Talk', enabled: () => true };
    const def: RegionDef = {
      id: 'slow',
      rect,
      *build(): Generator<void, BuiltRegion, void> {
        for (let i = 0; i < 3; i++) {
          log.push(`step ${i}`);
          yield;
        }
        return { root: new THREE.Group(), interactables: [it1], dispose: () => log.push('dispose') };
      },
    };
    const host = { root: new THREE.Group(), interactables: [] as Interactable[], triggers: [] as Trigger[] };
    return { streamer: new RegionStreamer([def], new Physics(), host), host, log };
  }

  it('runs one step a frame from the load distance and appears only when done', () => {
    const { streamer, host, log } = stepped();
    streamer.streamAt(10, -100 + LOAD_DIST - 1);
    expect(streamer.loadedIds).toEqual([]);
    expect(log).toEqual([]);
    streamer.update(0.016);
    streamer.update(0.016);
    expect(log).toEqual(['step 0', 'step 1']);
    expect(host.root.children).toHaveLength(0);
    streamer.update(0.016);
    streamer.update(0.016);
    expect(streamer.loadedIds).toEqual(['slow']);
    expect(host.root.children).toHaveLength(1);
    expect(host.interactables).toHaveLength(1);
    expect(streamer.buildStats.slow.steps).toBe(5); // starting it, three steps, and the one that returns
  });

  it('finishes at once when Wren is close (a teleport, a save), so there is ground under her', () => {
    const { streamer, log } = stepped();
    streamer.streamAt(10, -100 + LOAD_DIST - 1);
    streamer.update(0.016);
    streamer.streamAt(10, -100 + FINISH_DIST - 1);
    expect(log).toEqual(['step 0', 'step 1', 'step 2']);
    expect(streamer.loadedIds).toEqual(['slow']);
  });

  it('a build left mid-way still finishes and is dropped by distance as usual, and the area\'s disposal finishes it first', () => {
    const { streamer, log } = stepped();
    streamer.streamAt(10, -100 + LOAD_DIST - 1);
    streamer.update(0.016);
    streamer.streamAt(10, -100 + UNLOAD_DIST + 10);
    for (let i = 0; i < 4; i++) streamer.update(0.016);
    streamer.streamAt(10, -100 + UNLOAD_DIST + 10);
    expect(streamer.loadedIds).toEqual([]);
    expect(log.at(-1)).toBe('dispose');
    const other = stepped();
    other.streamer.streamAt(10, -150 + LOAD_DIST - 1);
    other.streamer.dispose();
    expect(other.log).toEqual(['step 0', 'step 1', 'step 2', 'dispose']);
  });
});

describe('Sallowmere', () => {
  it('meets the Northpass edge to edge on the same 2 m grid', () => {
    expect(SALLOWMERE_RECT.z1).toBe(NORTHPASS_RECT.z0);
    for (const v of [SALLOWMERE_RECT.x0, SALLOWMERE_RECT.x1, SALLOWMERE_RECT.z0, SALLOWMERE_RECT.z1]) expect(Math.abs(v % 2)).toBe(0);
  });

  it('starts building inside the canyon, a step a frame, with ground under Wren at the overlook and its own water', () => {
    const physics = new Physics();
    const world = new Overworld(physics);
    world.streamAt(PASS.camp.x, PASS.camp.z);
    expect(world.loadedRegions).toEqual(['northpass']); // building, not there yet
    for (let i = 0; i < 40 && !world.loadedRegions.includes('sallowmere'); i++) world.update(0.016, { night: 0, playerPos: new THREE.Vector3(PASS.camp.x, 12, PASS.camp.z) } as never);
    expect(world.loadedRegions).toContain('sallowmere');
    expect(world.regionBuildStats.sallowmere.steps).toBeGreaterThan(12);
    expect(physics.groundY(OVERLOOK.x, OVERLOOK.z)).toBeCloseTo(12, 0);
    expect(world.waterLevelAt(STILTWICK.x, STILTWICK.z)).toBe(MERE_WATER);
    world.dispose();
  });

  it('a teleport straight into the mere finds its ground', () => {
    const physics = new Physics();
    const world = new Overworld(physics);
    world.streamAt(STILTWICK.x, STILTWICK.z);
    expect(world.loadedRegions).toContain('sallowmere');
    expect(physics.groundY(STILTWICK.x, STILTWICK.z)).toBeCloseTo(0.9, 1); // the plaza's deck
    expect(physics.groundY(-20, -430)).toBeCloseTo(MERE_WATER - 0.6, 0); // the open mere beside the town
    world.dispose();
    expect(physics.groundY(STILTWICK.x, STILTWICK.z)).toBeNull();
  });
});

describe('the Northpass region', () => {
  it('meets the valley edge to edge, on the same 2 m grid', () => {
    expect(NORTHPASS_RECT.z1).toBe(VALLEY_RECT.z0);
    for (const v of [NORTHPASS_RECT.x0, NORTHPASS_RECT.x1, NORTHPASS_RECT.z0, NORTHPASS_RECT.z1]) expect(Math.abs(v % 2)).toBe(0);
    // The seam is the same formula at the same vertices, so no step in the ground.
    for (let x = NORTHPASS_RECT.x0; x <= NORTHPASS_RECT.x1; x += 2) {
      expect(Math.abs(terrainHeight(x, NORTHPASS_RECT.z1 - 2) - terrainHeight(x, NORTHPASS_RECT.z1))).toBeLessThan(6);
    }
  });

  it('is built before the fog lets Wren see it (fog ends at 290 m), and dropped only when it is hidden again', () => {
    expect(NORTHPASS.loadDist).toBeLessThan(290);
    expect(NORTHPASS.unloadDist).toBeGreaterThan(290);
    const physics = new Physics();
    const world = new Overworld(physics);
    expect(world.loadedRegions).toEqual([]);
    world.streamAt(GATE.x, NORTHPASS_RECT.z1 + NORTHPASS.loadDist! + 5); // in the far south of the valley
    expect(world.loadedRegions).toEqual([]);
    world.streamAt(SPAWN.x, SPAWN.z);
    expect(world.loadedRegions).toEqual(['northpass']);
    // The camp has ground to stand on.
    expect(physics.groundY(PASS.camp.x, PASS.camp.z)).toBeCloseTo(PASS.floor, 0);
    world.streamAt(GATE.x, NORTHPASS_RECT.z1 + NORTHPASS.unloadDist! - 5);
    expect(world.loadedRegions).toEqual(['northpass']);
    world.streamAt(GATE.x, NORTHPASS_RECT.z1 + NORTHPASS.unloadDist! + 5);
    expect(world.loadedRegions).toEqual([]);
    expect(physics.groundY(PASS.camp.x, PASS.camp.z)).toBeNull();
    world.dispose();
  });

  it('is described by its own definition', () => {
    expect(NORTHPASS.id).toBe('northpass');
  });
});

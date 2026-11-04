import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { mulberry32 } from '../core/math';
import { DungeonArea } from '../world/dungeon/build';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { REACTION, Thornling, type EnemyEnv } from './enemies';
import { enemyEnv, runEnemy } from './enemyTestEnv';

beforeAll(async () => {
  await initPhysics();
});

const env = (physics: Physics, playerPos: THREE.Vector3) => enemyEnv(physics, playerPos);
const run = (t: Thornling, physics: Physics, e: EnemyEnv, seconds: number) => runEnemy(t, physics, e, seconds);

describe('Thornling senses', () => {
  it('can\'t reach Wren from the floor below (the shrine\'s pit hall is under the nave)', () => {
    const physics = new Physics();
    new DungeonArea(physics, SHRINE);
    physics.refreshQueries();
    // The pit hall's thornling, one floor down, and Wren standing just inside the nave.
    const spawn = SHRINE.things.find((t) => t.id === 'pitThorn' && t.kind === 'enemy') as { at: readonly [number, number] };
    const pit = SHRINE.rooms.find((r) => r.id === 'pitHall')!;
    const t = new Thornling(new THREE.Group(), physics, pit.x + spawn.at[0], pit.z + spawn.at[1], -8 + 1);
    t.rng = mulberry32(7);
    const wren = new THREE.Vector3(pit.x + spawn.at[0], 0, pit.z + spawn.at[1] - 2);
    const { env: e, hits } = env(physics, wren);
    run(t, physics, e, 8);
    expect(hits.length).toBe(0);
  });

  it('doesn\'t notice Wren through a wall, does in the open', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40); // ground
    physics.box(5, 2, 0, 0.25, 2, 10); // a wall between them
    physics.refreshQueries();
    const t = new Thornling(new THREE.Group(), physics, 0, 0);
    t.rng = mulberry32(7);
    const wren = new THREE.Vector3(10, 0, 0);
    const { env: e, hits } = env(physics, wren);
    for (let i = 0; i < 360; i++) {
      run(t, physics, e, 1 / 60);
      expect(t.alert).toBe(false);
    }
    expect(hits.length).toBe(0);
    wren.set(Math.min(t.pos.x, 4), 0, t.pos.z + 4); // same side as it (wherever it wandered), in plain view
    run(t, physics, e, 6);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('gives up a chase once Wren gets well away from its home, and heads back', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 200, 0.5, 200);
    physics.refreshQueries();
    const t = new Thornling(new THREE.Group(), physics, 0, 0);
    t.rng = mulberry32(7);
    const wren = new THREE.Vector3(0, 0, 10);
    const { env: e } = env(physics, wren);
    run(t, physics, e, REACTION + 0.5); // it spots Wren and starts the chase
    // Wren runs off much faster than a thornling: it follows a while, then turns back.
    let far = 0;
    for (let i = 0; i < 400; i++) {
      wren.z += 0.2;
      run(t, physics, e, 1 / 60);
      far = Math.max(far, t.pos.z);
    }
    run(t, physics, e, 6);
    expect(far).toBeGreaterThan(5); // it did chase
    expect(t.pos.z).toBeLessThan(far - 4); // then walked home
  });

  it('wanders only inside its territory', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40);
    physics.refreshQueries();
    const room = (p: THREE.Vector3) => p.x > -5 && p.x < 5 && p.z > -5 && p.z < 5;
    const t = new Thornling(new THREE.Group(), physics, 0, 0, 400, room);
    t.rng = mulberry32(7);
    const { env: e } = env(physics, new THREE.Vector3(100, 0, 100)); // Wren far away
    for (let i = 0; i < 60 * 40; i++) {
      run(t, physics, e, 1 / 60);
      expect(Math.abs(t.pos.x) < 6 && Math.abs(t.pos.z) < 6, `wandered to ${t.pos.x.toFixed(1)}, ${t.pos.z.toFixed(1)}`).toBe(true);
    }
  });

  it('leaves Wren alone on safe ground (the village): drops the chase at the edge and heads home', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 60, 0.5, 60);
    physics.refreshQueries();
    const t = new Thornling(new THREE.Group(), physics, 0, 0);
    t.rng = mulberry32(7);
    const wren = new THREE.Vector3(0, 0, 9);
    const { env: e, hits } = env(physics, wren);
    const safe = (p: THREE.Vector3) => p.z > 12;
    const safeEnv: EnemyEnv = { ...e, safeGround: safe };
    run(t, physics, safeEnv, REACTION + 0.8); // it spots Wren and comes for her
    const chasedTo = t.pos.z;
    expect(chasedTo).toBeGreaterThan(1);
    wren.set(0, 0, 14); // Wren steps into the village
    const before = hits.length;
    let closest = Infinity;
    for (let i = 0; i < 6 * 60; i++) {
      run(t, physics, safeEnv, 1 / 60);
      closest = Math.min(closest, wren.distanceTo(t.pos));
    }
    expect(hits.length).toBe(before);
    expect(safe(t.pos)).toBe(false);
    expect(t.pos.z).toBeLessThan(chasedTo); // walked back toward home
    expect(closest).toBeGreaterThan(1.5);
  });

  it('only notices Wren inside its territory (a dungeon room), and forgets once Wren leaves', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40);
    physics.refreshQueries();
    const room = (p: THREE.Vector3) => p.x > -8 && p.x < 8 && p.z > -8 && p.z < 8;
    const t = new Thornling(new THREE.Group(), physics, 0, 0, 400, room);
    t.rng = mulberry32(7);
    const wren = new THREE.Vector3(0, 0, 11); // in plain view, but in the next room
    const { env: e, hits } = env(physics, wren);
    run(t, physics, e, 5);
    expect(hits.length).toBe(0);
    // Steps into its room, a few meters from wherever it wandered (it notices within 15 m, and
    // the room is 16 m across: from the far corner it could miss Wren entirely).
    wren.set(Math.max(-7, Math.min(7, t.pos.x)), 0, Math.max(-7, Math.min(7, t.pos.z + 4)));
    run(t, physics, e, 4);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('keeps off ground it may not walk on (stairs) but still notices Wren standing there', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40);
    physics.refreshQueries();
    const t = new Thornling(new THREE.Group(), physics, 0, 0, 400, undefined);
    t.rng = mulberry32(7);
    t.setWalkable((p) => p.x < 3); // a flight of stairs from x = 3 on
    const wren = new THREE.Vector3(6, 0, 0);
    const { env: e, hits } = env(physics, wren);
    let reach = 0;
    for (let i = 0; i < 60 * 8; i++) {
      run(t, physics, e, 1 / 60);
      reach = Math.max(reach, t.pos.x);
    }
    expect(reach).toBeLessThan(3); // stopped at the foot
    expect(reach).toBeGreaterThan(1.5); // it did notice Wren on the stairs and come for them
    expect(hits.length).toBe(0);
  });

  it('gives Wren a moment (its reaction time) before it charges', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40);
    physics.refreshQueries();
    const t = new Thornling(new THREE.Group(), physics, 0, 0);
    t.rng = mulberry32(7);
    const wren = new THREE.Vector3(0, 0, 3.5); // right in front of it, in plain view
    const { env: e, hits } = env(physics, wren);
    run(t, physics, e, REACTION - 0.1);
    expect(t.alert).toBe(false);
    run(t, physics, e, 3);
    expect(hits.length).toBeGreaterThan(0);
  });
});

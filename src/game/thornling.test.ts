import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { DungeonArea } from '../world/dungeon/build';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { Thornling, type EnemyEnv } from './enemies';

beforeAll(async () => {
  await initPhysics();
});

/** A stand-in for the game around one thornling: counts the hits it lands on a still Wren. */
function env(physics: Physics, playerPos: THREE.Vector3) {
  const hits: unknown[] = [];
  const noop = () => {};
  const e = {
    playerPos, playerAlive: true, night: false, physics,
    hazards: {} as EnemyEnv['hazards'], sfx: new Proxy({}, { get: () => noop }) as EnemyEnv['sfx'],
    particles: { burst: noop } as unknown as EnemyEnv['particles'],
    hitPlayer: (from) => (hits.push(from.clone()), 'hit'),
    pushPlayer: noop, spawn: noop, drop: noop, shake: noop,
  } satisfies EnemyEnv;
  return { env: e, hits };
}

function run(t: Thornling, physics: Physics, e: EnemyEnv, seconds: number) {
  for (let s = 0; s < seconds; s += 1 / 60) {
    t.update(1 / 60, e);
    physics.step(1 / 60);
  }
}

describe('Thornling senses', () => {
  it('can\'t reach Wren from the floor below (the shrine\'s pit hall is under the nave)', () => {
    const physics = new Physics();
    new DungeonArea(physics, SHRINE);
    physics.refreshQueries();
    // The pit hall's thornling, one floor down, and Wren standing just inside the nave.
    const spawn = SHRINE.things.find((t) => t.id === 'pitThorn' && t.kind === 'enemy') as { at: readonly [number, number] };
    const pit = SHRINE.rooms.find((r) => r.id === 'pitHall')!;
    const t = new Thornling(new THREE.Group(), physics, pit.x + spawn.at[0], pit.z + spawn.at[1], -8 + 1);
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
    const wren = new THREE.Vector3(0, 0, 10);
    const { env: e } = env(physics, wren);
    run(t, physics, e, 0.5);
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
    const { env: e } = env(physics, new THREE.Vector3(100, 0, 100)); // Wren far away
    for (let i = 0; i < 60 * 40; i++) {
      run(t, physics, e, 1 / 60);
      expect(Math.abs(t.pos.x) < 6 && Math.abs(t.pos.z) < 6, `wandered to ${t.pos.x.toFixed(1)}, ${t.pos.z.toFixed(1)}`).toBe(true);
    }
  });

  it('only notices Wren inside its territory (a dungeon room), and forgets once Wren leaves', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40);
    physics.refreshQueries();
    const room = (p: THREE.Vector3) => p.x > -8 && p.x < 8 && p.z > -8 && p.z < 8;
    const t = new Thornling(new THREE.Group(), physics, 0, 0, 400, room);
    const wren = new THREE.Vector3(0, 0, 11); // in plain view, but in the next room
    const { env: e, hits } = env(physics, wren);
    run(t, physics, e, 5);
    expect(hits.length).toBe(0);
    wren.set(0, 0, 6); // steps into its room
    run(t, physics, e, 4);
    expect(hits.length).toBeGreaterThan(0);
  });
});

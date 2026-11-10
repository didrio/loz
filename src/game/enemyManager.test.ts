import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../core/physics';
import type { Area } from '../world/area';
import { Thornling, EnemyManager, FAR_ENEMY, FAR_EVERY, type Enemy } from './enemies';
import { enemyEnv, flatGround } from './enemyTestEnv';

beforeAll(async () => {
  await initPhysics();
});

/** An outdoor area with `count` field thornlings, all spawning at (10, 10). */
function field(count: number) {
  return { enemyCount: count, indoor: false, enemySpot: () => ({ x: 10, z: 10 }) } as unknown as Area;
}

describe('EnemyManager respawns', () => {
  it('brings back its own field thornlings after 45 s', () => {
    const physics = flatGround();
    const m = new EnemyManager(new THREE.Group(), physics, field(1));
    const { env } = enemyEnv(physics, new THREE.Vector3(0, 0, 0));
    m.list[0].gone = true;
    m.update(0.1, env);
    expect(m.list.length).toBe(0);
    m.update(46, env);
    expect(m.list.length).toBe(1);
  });

  it('does not respawn a thornling that content added (a trial or dungeon enemy)', () => {
    const physics = flatGround();
    const m = new EnemyManager(new THREE.Group(), physics, field(0));
    const { env } = enemyEnv(physics, new THREE.Vector3(0, 0, 0));
    const t = new Thornling(new THREE.Group(), physics, 0, 0);
    m.add(t);
    t.gone = true;
    m.update(0.1, env);
    m.update(60, env);
    expect(m.list.length).toBe(0);
  });
});

describe('EnemyManager population', () => {
  it('spawns the given number of thornlings instead of the area\'s', () => {
    const m = new EnemyManager(new THREE.Group(), flatGround(), field(14), { thornlings: 3, wisps: false });
    expect(m.list.length).toBe(3);
  });

  it('mans the posts first, and a posted thornling waits for the area to come back, not a timer', () => {
    const physics = flatGround();
    const m = new EnemyManager(new THREE.Group(), physics, field(14), { thornlings: 2, wisps: false, posts: [{ x: -10, z: -10, count: 3 }] });
    expect(m.list.length).toBe(5);
    const posted = m.list.slice(0, 3);
    for (const e of posted) expect(Math.hypot(e.pos.x + 10, e.pos.z + 10)).toBeLessThan(3);
    const { env } = enemyEnv(physics, new THREE.Vector3(30, 0, 30));
    posted[0].gone = true;
    m.update(0.1, env);
    m.update(60, env);
    expect(m.list.length).toBe(4);
  });

  it('spawns no night wisps when the population has none', () => {
    const physics = flatGround();
    const env = { ...enemyEnv(physics, new THREE.Vector3(0, 0, 0)).env, night: true };
    const quiet = new EnemyManager(new THREE.Group(), physics, field(0), { thornlings: 0, wisps: false });
    const usual = new EnemyManager(new THREE.Group(), physics, field(0));
    for (let i = 0; i < 200; i++) {
      quiet.update(0.5, env);
      usual.update(0.5, env);
    }
    expect(quiet.list.length).toBe(0);
    expect(usual.list.length).toBeGreaterThan(0);
  });
});

describe('EnemyManager blob shadows', () => {
  const blobs = (parent: THREE.Object3D) => parent.children.filter((c) => c instanceof THREE.Mesh && (c.geometry as THREE.CircleGeometry).type === 'CircleGeometry') as THREE.Mesh[];

  it('stands each enemy on a blob at its feet, and hides it once the enemy is dead', () => {
    const physics = flatGround();
    const parent = new THREE.Group();
    const m = new EnemyManager(parent, physics, field(0));
    const { env } = enemyEnv(physics, new THREE.Vector3(30, 0, 30));
    const t = new Thornling(parent, physics, 4, 5);
    m.add(t);
    m.update(1 / 60, env);
    const [blob] = blobs(parent);
    expect(blob.visible).toBe(true);
    expect(blob.position.x).toBeCloseTo(4);
    expect(blob.position.z).toBeCloseTo(5);
    expect(blob.position.y).toBeCloseTo(0.04, 1);
    t.alive = false;
    m.update(1 / 60, env);
    expect(blob.visible).toBe(false);
  });

  it('takes the blob away with the enemy', () => {
    const physics = flatGround();
    const parent = new THREE.Group();
    const m = new EnemyManager(parent, physics, field(0));
    const { env } = enemyEnv(physics, new THREE.Vector3(30, 0, 30));
    const t = new Thornling(parent, physics, 4, 5);
    m.add(t);
    m.update(1 / 60, env);
    expect(blobs(parent).length).toBe(1);
    m.remove(t);
    expect(blobs(parent).length).toBe(0);
  });
});

describe('EnemyManager far from Wren (T58)', () => {
  /** A stand-in enemy that records the time steps it's given. */
  const stub = (x: number, mayIdleFar = true) => ({
    pos: new THREE.Vector3(x, 0, 0), alive: true, gone: false, mayIdleFar, steps: [] as number[],
    update(dt: number) { this.steps.push(dt); }, placeShadow() {}, animatesInCutscene: () => false, dispose() {},
  });

  it('a near enemy thinks every frame; a far one every few frames, with the time it missed added up', () => {
    const physics = flatGround();
    const m = new EnemyManager(new THREE.Group(), physics, { ...field(0), indoor: true } as Area);
    const { env } = enemyEnv(physics, new THREE.Vector3(0, 0, 0));
    const near = stub(FAR_ENEMY - 5), far = stub(FAR_ENEMY + 5), boss = stub(FAR_ENEMY + 5, false);
    for (const e of [near, far, boss]) m.add(e as unknown as Enemy);
    const frames = FAR_EVERY * 10;
    for (let i = 0; i < frames; i++) m.update(1 / 60, env);
    expect(near.steps).toHaveLength(frames);
    expect(boss.steps).toHaveLength(frames);
    expect(far.steps.length).toBeLessThanOrEqual(frames / FAR_EVERY + 1);
    expect(far.steps[0]).toBeCloseTo(1 / 60); // the first far frame thinks at once
    const total = far.steps.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan((frames - FAR_EVERY) / 60); // no time lost but the last few frames still owed
  });

  it('coming back within range, it thinks every frame again', () => {
    const physics = flatGround();
    const m = new EnemyManager(new THREE.Group(), physics, { ...field(0), indoor: true } as Area);
    const { env } = enemyEnv(physics, new THREE.Vector3(0, 0, 0));
    const e = stub(FAR_ENEMY + 20);
    m.add(e as unknown as Enemy);
    for (let i = 0; i < 8; i++) m.update(1 / 60, env);
    e.pos.x = 10;
    e.steps.length = 0;
    for (let i = 0; i < 8; i++) m.update(1 / 60, env);
    expect(e.steps).toHaveLength(8);
  });
});

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../core/physics';
import type { Area } from '../world/area';
import { Thornling, EnemyManager } from './enemies';
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

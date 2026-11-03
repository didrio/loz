import * as THREE from 'three';
import { Physics } from '../core/physics';
import type { Attack, Enemy, EnemyEnv, HitResult } from './enemies';

/**
 * A stand-in for the game around one enemy, for unit tests: records every attack it lands
 * on Wren. `result` is what the shield does with them (default: they land).
 */
export function enemyEnv(physics: Physics, playerPos: THREE.Vector3, result: () => HitResult = () => 'hit') {
  const hits: { from: THREE.Vector3; attack: Attack; result: HitResult }[] = [];
  const noop = () => {};
  const env = {
    playerPos, playerAlive: true, night: false, physics,
    hazards: {} as EnemyEnv['hazards'], sfx: new Proxy({}, { get: () => noop }) as EnemyEnv['sfx'],
    particles: { burst: noop } as unknown as EnemyEnv['particles'],
    hitPlayer: (from, attack) => {
      const r = result();
      hits.push({ from: from.clone(), attack, result: r });
      return r;
    },
    pushPlayer: noop, spawn: noop, drop: noop, shake: noop,
  } satisfies EnemyEnv;
  return { env, hits };
}

/** Steps the enemy and physics for `seconds` at 60 fps; stops early once `until` is true. */
export function runEnemy(e: Enemy, physics: Physics, env: EnemyEnv, seconds: number, until?: () => boolean) {
  for (let s = 0; s < seconds; s += 1 / 60) {
    e.update(1 / 60, env);
    physics.step(1 / 60);
    if (until?.()) return true;
  }
  return false;
}

/** A flat, open floor to fight on. */
export function flatGround(size = 60) {
  const physics = new Physics();
  physics.box(0, -0.5, 0, size, 0.5, size);
  physics.refreshQueries();
  return physics;
}

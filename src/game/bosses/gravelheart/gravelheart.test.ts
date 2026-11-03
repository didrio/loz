import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../../core/physics';
import { enemyEnv, flatGround, runEnemy } from '../../enemyTestEnv';
import { Hazards } from '../../hazards';
import { swordTarget } from '../../player';
import { Gravelheart } from './index';

beforeAll(async () => {
  await initPhysics();
});

/** Gravelheart on flat ground facing +z, with Wren `dist` m in front of it. */
function setup(dist = 4) {
  const physics = flatGround();
  const scene = new THREE.Scene();
  const player = new THREE.Vector3(0, 0, dist);
  const { env, hits } = enemyEnv(physics, player);
  const hazards = new Hazards(scene);
  const e = { ...env, hazards };
  const b = new Gravelheart(scene, physics, null, 0, 0, 0, 0);
  return { physics, b, env: e, hits, hazards, player };
}

/** Wakes it and runs the intro until it fights. */
function fighting(dist = 4) {
  const s = setup(dist);
  s.b.wake();
  runEnemy(s.b, s.physics, s.env, 6, () => s.b.ready);
  s.b.engage();
  return s;
}

/** A sword swing at it from where Wren stands (the result, or 'miss'). */
function swing(b: Gravelheart, from: THREE.Vector3) {
  const box = swordTarget(b.hurtboxes(), from, b.pos.clone().sub(from).setY(0).normalize());
  return box ? b.hurt(1, from, box.part) : 'miss';
}

describe('Gravelheart', () => {
  it('sleeps until woken, then plays its intro and fights', () => {
    const { b, physics, env } = setup();
    runEnemy(b, physics, env, 2);
    expect(b.state).toBe('dormant');
    expect(b.targetable).toBe(false);
    b.wake();
    expect(runEnemy(b, physics, env, 6, () => b.ready)).toBe(true);
    b.engage();
    expect(b.targetable).toBe(true);
  });

  it('stands on its floor, wherever that is (a dungeon\'s floors stack)', () => {
    const { b } = setup();
    expect(b.pos.y).toBeCloseTo(0, 1);
  });

  it('is solid stone: the sword clanks off it while it stands', () => {
    const { b, physics, env, player } = fighting(3.2);
    runEnemy(b, physics, env, 0.3);
    expect(swing(b, player.clone().setZ(b.pos.z + 3))).toBe('guarded');
    expect(b.hp).toBe(b.maxHp);
  });

  it('hammerfall: a red-eyed, guard-crushing slam with a shockwave, then a window with its chest in reach', () => {
    const { b, physics, env, hits, hazards } = fighting(3);
    b.forceMove('hammerfall');
    expect(b.move?.timing(b).windup).toBeGreaterThanOrEqual(0.5); // fairness: a readable windup
    runEnemy(b, physics, env, 1.3, () => b.step === 'recover');
    expect(b.step).toBe('recover');
    expect(hits.map((h) => h.attack.guard)).toEqual([3]);
    expect(hazards.active).toBeGreaterThan(0);
    // Bent over its stuck fists: the chest comes down within the sword's reach.
    runEnemy(b, physics, env, 0.5);
    expect(b.chestOpen).toBe(true);
    const from = b.pos.clone().addScaledVector(b.forward, 2.6);
    expect(swing(b, from)).toBe('hit');
    expect(b.hp).toBe(b.maxHp - 1);
    // It wrenches free and the window shuts.
    runEnemy(b, physics, env, 1.5, () => !b.move);
    expect(b.chestOpen).toBe(false);
  });

  it('resets when Wren dies mid-fight: full health, asleep again', () => {
    const { b, physics, env } = fighting(3);
    b.forceMove('hammerfall');
    runEnemy(b, physics, env, 1.3, () => b.chestOpen);
    b.hurt(1, b.pos.clone().addScaledVector(b.forward, 2.6), 'chest');
    b.onPlayerRespawn();
    expect(b.hp).toBe(b.maxHp);
    expect(b.state).toBe('dormant');
    expect(b.chestOpen).toBe(false);
  });

  it('dies once and settles asleep (the defeat script waits for that)', () => {
    const { b, physics, env } = fighting(3);
    let defeated = 0;
    b.onDefeated = () => defeated++;
    b.forceMove('hammerfall');
    runEnemy(b, physics, env, 1.5, () => b.chestOpen);
    b.hurt(99, b.pos.clone().addScaledVector(b.forward, 2.6), 'chest');
    expect(defeated).toBe(1);
    expect(b.targetable).toBe(false);
    expect(runEnemy(b, physics, env, 6, () => b.asleep)).toBe(true);
    expect(b.gone).toBe(false); // it stays, asleep in its hall
  });
});

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/math';
import { initPhysics } from '../core/physics';
import { CRAGSTALKER_DAZED, CRAGSTALKER_LUNGE, CRAGSTALKER_RECOVER, CROUCH_TIME, Cragstalker } from './cragstalker';
import type { HitResult } from './enemies';
import { enemyEnv, flatGround, runEnemy } from './enemyTestEnv';

beforeAll(async () => {
  await initPhysics();
});

function setup(wren: THREE.Vector3, result?: () => HitResult) {
  const physics = flatGround();
  const c = new Cragstalker(new THREE.Group(), physics, 0, 0);
  c.rng = mulberry32(5);
  c.faceAngle(0);
  const { env, hits } = enemyEnv(physics, wren, result);
  return { c, hits, run: (sec: number, until?: () => boolean) => runEnemy(c, physics, env, sec, until) };
}

describe('Cragstalker', () => {
  it('crouches with its eyes lit for at least half a second before it lunges (a readable tell)', () => {
    const { c, hits, run } = setup(new THREE.Vector3(0, 0, 8));
    expect(run(8, () => c.crouching)).toBe(true);
    expect(hits).toHaveLength(0);
    let crouched = 0;
    run(2, () => {
      if (c.crouching) crouched += 1 / 60;
      return c.lunging;
    });
    expect(crouched + 1 / 60).toBeGreaterThanOrEqual(CROUCH_TIME - 0.1);
    expect(CROUCH_TIME).toBeGreaterThanOrEqual(0.5);
  });

  it('lunges at Wren and lands CRAGSTALKER_LUNGE (a heavy stone hit)', () => {
    const { hits, run } = setup(new THREE.Vector3(0, 0, 6));
    expect(run(10, () => hits.length > 0)).toBe(true);
    expect(hits[0].attack).toBe(CRAGSTALKER_LUNGE);
    expect(CRAGSTALKER_LUNGE.stone).toBe(true);
  });

  it('a sidestep during the crouch dodges the lunge (it is aimed where Wren stood)', () => {
    const wren = new THREE.Vector3(0, 0, 6);
    const { c, hits, run } = setup(wren);
    run(10, () => c.crouching);
    run(CROUCH_TIME + 0.05, () => c.lunging);
    wren.x += 4; // out of the line, before the lunge's strip reaches
    run(1.2);
    expect(hits).toHaveLength(0);
  });

  it('after a lunge it pants (the opening); longer when the shield stopped it', () => {
    const open = setup(new THREE.Vector3(0, 0, 6));
    open.run(10, () => open.hits.length > 0);
    let t = 0;
    open.run(3, () => {
      if (open.c.exposed) t += 1 / 60;
      return t > 0 && !open.c.exposed;
    });
    expect(t).toBeGreaterThan(CRAGSTALKER_RECOVER * 0.7);

    const blocked = setup(new THREE.Vector3(0, 0, 6), () => 'blocked');
    blocked.run(10, () => blocked.hits.length > 0);
    t = 0;
    blocked.run(4, () => {
      if (blocked.c.exposed) t += 1 / 60;
      return t > 0 && !blocked.c.exposed;
    });
    expect(t).toBeGreaterThan(CRAGSTALKER_DAZED * 0.8);
  });

  it('takes sword hits (6 HP) and dies', () => {
    const { c, run } = setup(new THREE.Vector3(0, 0, 40));
    run(0.1);
    for (let i = 0; i < 6; i++) c.hurt(1, new THREE.Vector3(0, 0, 2));
    expect(c.alive).toBe(false);
  });

  it('never leaves the ground it may walk on, however it is lured', () => {
    const wren = new THREE.Vector3(0, 0, 8);
    const { c, run } = setup(wren);
    c.setWalkable((p) => p.z < 3);
    run(6);
    wren.set(-6, 0, 12);
    run(6);
    expect(c.pos.z).toBeLessThan(3.8);
  });

  it('gives up when Wren is far away and does not notice her again at once', () => {
    const wren = new THREE.Vector3(0, 0, 8);
    const { c, run } = setup(wren);
    run(10, () => c.alert);
    expect(c.alert).toBe(true);
    wren.set(0, 0, 40);
    run(1);
    expect(c.alert).toBe(false);
    wren.set(0, 0, 8);
    run(1.5);
    expect(c.alert).toBe(false);
  });
});

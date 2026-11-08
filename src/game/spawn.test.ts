import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../core/physics';
import { ASSETS } from '../render/models/registry';
import { hurtboxRings } from './debug';
import { flatGround } from './enemyTestEnv';
import { ENEMY_SPAWNERS } from './spawn';
import { devStateId, findDevState, DEV_STATES } from '../content/devStates';

beforeAll(() => initPhysics());

describe('dev shortcuts', () => {
  it('can spawn every registered enemy, and each has a hurtbox', () => {
    const ids = ASSETS.filter((a) => a.kind === 'enemy').map((a) => a.id);
    expect(Object.keys(ENEMY_SPAWNERS).sort()).toEqual([...ids].sort());
    const physics = flatGround();
    for (const id of ids) {
      const e = ENEMY_SPAWNERS[id](new THREE.Group(), physics, 2, 2);
      expect(e.hurtboxes().length, id).toBeGreaterThan(0);
    }
  });

  it('finds Dev tab states by id or by number', () => {
    const ids = DEV_STATES.map(devStateId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findDevState(ids[3])).toBe(DEV_STATES[3]);
    expect(findDevState('4')).toBe(DEV_STATES[3]);
    expect(findDevState('nope')).toBeUndefined();
  });

  it('draws three rings of segments per hurtbox, all on the sphere', () => {
    const out: number[] = [];
    const c = new THREE.Vector3(1, 2, 3);
    hurtboxRings(c, 0.5, out, 8);
    expect(out.length / 3).toBe(3 * 8 * 2);
    for (let i = 0; i < out.length; i += 3) {
      expect(new THREE.Vector3(out[i], out[i + 1], out[i + 2]).distanceTo(c)).toBeCloseTo(0.5, 5);
    }
  });
});

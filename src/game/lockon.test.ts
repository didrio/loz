import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { Thornling } from './enemies';
import { AIM_RANGE, autoAimYaw, nextLockTarget, pickLockTarget } from './lockon';

beforeAll(async () => {
  await initPhysics();
});

describe('lock-on targets', () => {
  it('skips enemies on another floor and behind walls; picks the one in sight', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40); // this floor
    physics.box(0, -8.5, 0, 40, 0.5, 40); // the floor below
    physics.box(0, 2, -6, 10, 2, 0.25); // a wall to the north
    physics.refreshQueries();
    const below = new Thornling(new THREE.Group(), physics, 0, -2, -7.5);
    const behindWall = new Thornling(new THREE.Group(), physics, 0, -9, 1);
    const wren = new THREE.Vector3(0, 0, 0);
    const north = new THREE.Vector3(0, 0, -1);
    expect(below.pos.y).toBeCloseTo(-8, 0);
    expect(pickLockTarget(wren, north, [below, behindWall], physics)).toBeNull();
    const inSight = new Thornling(new THREE.Group(), physics, 3, -3, 1);
    expect(pickLockTarget(wren, north, [below, behindWall, inSight], physics)).toBe(inSight);
  });
});

describe('touch lock-on and aim', () => {
  const wren = new THREE.Vector3(0, 0, 0);
  const foe = (x: number, z: number, more: object = {}) => ({ pos: new THREE.Vector3(x, 0, z), alive: true, lockHeight: 1, targetable: true, ...more });

  it('a swing turns toward the nearest enemy in front, not one behind or out of reach', () => {
    const facing = 0; // +z
    expect(autoAimYaw(wren, facing, [foe(0, -2)])).toBeNull(); // behind
    expect(autoAimYaw(wren, facing, [foe(0, AIM_RANGE + 1)])).toBeNull(); // too far
    expect(autoAimYaw(wren, facing, [foe(0, 2, { alive: false })])).toBeNull();
    const yaw = autoAimYaw(wren, facing, [foe(3, 3), foe(1, 2)]);
    expect(yaw).toBeCloseTo(Math.atan2(1, 2)); // the nearer one
  });

  it('when the locked target dies, lock-on moves to the next enemy, never the dead one', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 40, 0.5, 40);
    physics.refreshQueries();
    const dead = foe(0, 3, { alive: false });
    const next = foe(2, 6);
    expect(nextLockTarget(wren, 0, [dead, next], dead, physics)).toBe(next);
    expect(nextLockTarget(wren, 0, [dead], dead, physics)).toBeNull();
  });
});

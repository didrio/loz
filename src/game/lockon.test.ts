import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { Thornling } from './enemies';
import { pickLockTarget } from './lockon';

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

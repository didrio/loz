import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { Thornling } from './enemies';
import { AIM_RANGE, autoAimYaw, INTERACT_BUFFER, INTERACT_GRACE, INTERACT_SLACK, InteractAim, LOCK_CLOSE, LOCK_RANGE, nextLockTarget, pickLockTarget } from './lockon';

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

describe('lock-on reach', () => {
  let physics: Physics;
  beforeAll(() => {
    physics = new Physics();
    physics.box(0, -0.5, 0, 80, 0.5, 80);
    physics.refreshQueries();
  });
  const wren = new THREE.Vector3(0, 0, 0);
  const north = new THREE.Vector3(0, 0, -1);
  const foe = (x: number, z: number) => ({ pos: new THREE.Vector3(x, 0, z), alive: true, lockHeight: 1, targetable: true });

  it('ignores enemies beyond LOCK_RANGE, even dead ahead', () => {
    expect(pickLockTarget(wren, north, [foe(0, -(LOCK_RANGE + 1))], physics)).toBeNull();
    const near = foe(0, -(LOCK_RANGE - 1));
    expect(pickLockTarget(wren, north, [near], physics)).toBe(near);
  });

  it('ignores enemies off to the side or behind, unless they are right next to Wren', () => {
    expect(pickLockTarget(wren, north, [foe(8, 0)], physics)).toBeNull(); // 90° off
    expect(pickLockTarget(wren, north, [foe(0, 8)], physics)).toBeNull(); // behind
    const beside = foe(LOCK_CLOSE - 0.5, 0);
    expect(pickLockTarget(wren, north, [beside], physics)).toBe(beside);
    const ahead = foe(3, -8); // about 20° off
    expect(pickLockTarget(wren, north, [ahead], physics)).toBe(ahead);
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

describe('InteractAim', () => {
  const thing = (x = 0, z = 0, r = 2, on = true) => ({ x, z, r, enabled: () => on });
  const dt = 1 / 30;

  it('keyboard and pad use only what is in reach this frame', () => {
    const aim = new InteractAim();
    const npc = thing();
    expect(aim.update(npc, true, false, { x: 1, z: 0 }, dt)).toBe(npc);
    aim.update(npc, false, false, { x: 1, z: 0 }, dt);
    expect(aim.update(null, true, false, { x: 2.5, z: 0 }, dt)).toBe(null);
    expect(aim.update(npc, false, false, { x: 1, z: 0 }, dt)).toBe(null); // no buffered press either
  });

  it('touch: a tap just after the thing slipped out of reach still uses it', () => {
    const aim = new InteractAim();
    const npc = thing();
    aim.update(npc, false, true, { x: 1.9, z: 0 }, dt);
    aim.update(null, false, true, { x: 2.1, z: 0 }, dt);
    expect(aim.update(null, true, true, { x: 2.3, z: 0 }, dt)).toBe(npc);
  });

  it('touch: not once the grace is over, too far, or the thing was switched off', () => {
    const late = new InteractAim();
    late.update(thing(), false, true, { x: 1, z: 0 }, dt);
    late.update(null, false, true, { x: 2.1, z: 0 }, INTERACT_GRACE + 0.05);
    expect(late.update(null, true, true, { x: 2.1, z: 0 }, dt)).toBe(null);

    const far = new InteractAim();
    far.update(thing(), false, true, { x: 1, z: 0 }, dt);
    expect(far.update(null, true, true, { x: 2 + INTERACT_SLACK + 0.1, z: 0 }, dt)).toBe(null);

    let on = true;
    const chest = { x: 0, z: 0, r: 2, enabled: () => on };
    const off = new InteractAim<typeof chest>();
    off.update(chest, false, true, { x: 1, z: 0 }, dt);
    on = false; // opened, say
    expect(off.update(null, true, true, { x: 1, z: 0 }, dt)).toBe(null);
  });

  it('touch: a tap just before the thing comes into reach waits for it', () => {
    const aim = new InteractAim();
    const npc = thing();
    expect(aim.update(null, true, true, { x: 5, z: 0 }, dt)).toBe(null);
    expect(aim.update(npc, false, true, { x: 1.9, z: 0 }, dt)).toBe(npc);
    const slow = new InteractAim();
    slow.update(null, true, true, { x: 5, z: 0 }, dt);
    slow.update(null, false, true, { x: 4, z: 0 }, INTERACT_BUFFER + 0.05);
    expect(slow.update(npc, false, true, { x: 1.9, z: 0 }, dt)).toBe(null);
  });
});

describe('InteractAim.lingering', () => {
  it('names the thing that just left reach for the grace, then nothing', () => {
    const aim = new InteractAim();
    const npc = { x: 0, z: 0, r: 2, enabled: () => true };
    aim.update(npc, false, true, { x: 1, z: 0 }, 1 / 30);
    expect(aim.lingering({ x: 1, z: 0 })).toBe(null); // still in reach: the button shows it anyway
    aim.update(null, false, true, { x: 2.2, z: 0 }, 0.2);
    expect(aim.lingering({ x: 2.2, z: 0 })).toBe(npc);
    aim.update(null, false, true, { x: 2.2, z: 0 }, 0.3);
    expect(aim.lingering({ x: 2.2, z: 0 })).toBe(null);
  });
});

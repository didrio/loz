import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Layer, Physics, SOLID } from './physics';

beforeAll(async () => {
  await initPhysics();
});

/** A flat floor at y = 0 plus whatever the test adds. */
function setup() {
  const p = new Physics();
  p.box(0, -0.5, 0, 50, 0.5, 50);
  return p;
}

/** Walks a character with gravity for `seconds`, like the game loop does. */
function walk(p: Physics, start: THREE.Vector3, vel: THREE.Vector3, seconds: number) {
  const ch = p.createCharacter(start, 0.4, 0.5, Layer.Player, SOLID | Layer.Enemy);
  const feet = start.clone();
  const dt = 1 / 60;
  let vy = 0;
  p.step(dt);
  for (let t = 0; t < seconds; t += dt) {
    vy = ch.grounded ? -1 : vy - 30 * dt;
    ch.move(feet, new THREE.Vector3(vel.x * dt, vy * dt, vel.z * dt));
    p.step(dt);
  }
  return { feet, ch };
}

describe('Physics character', () => {
  it('falls onto the floor and stands on it', () => {
    const { feet, ch } = walk(setup(), new THREE.Vector3(0, 3, 0), new THREE.Vector3(), 1.5);
    expect(feet.y).toBeCloseTo(0, 1);
    expect(ch.grounded).toBe(true);
  });

  it('walks on flat ground at the requested speed', () => {
    const { feet } = walk(setup(), new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0), 1);
    expect(feet.x).toBeGreaterThan(4.5);
    expect(feet.x).toBeLessThan(5.5);
  });

  it('is stopped by a wall', () => {
    const p = setup();
    p.box(3, 1, 0, 0.5, 1, 5);
    const { feet } = walk(p, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0), 2);
    expect(feet.x).toBeLessThan(2.2);
  });

  it('steps up a small ledge but not a tall one', () => {
    const low = setup();
    low.box(3, 0.15, 0, 1, 0.15, 5); // 30 cm step
    expect(walk(low, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0), 1.5).feet.x).toBeGreaterThan(4);

    const high = setup();
    high.box(3, 0.6, 0, 1, 0.6, 5); // 1.2 m wall
    expect(walk(high, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 0), 1.5).feet.x).toBeLessThan(2.2);
  });

  it('passes through layers it does not collide with', () => {
    const p = setup();
    p.box(3, 1, 0, 0.5, 1, 5, 0, Layer.Enemy);
    const ch = p.createCharacter(new THREE.Vector3(), 0.4, 0.5, Layer.Player, SOLID);
    const feet = new THREE.Vector3();
    p.step(1 / 60);
    for (let i = 0; i < 60; i++) {
      ch.move(feet, new THREE.Vector3(5 / 60, -0.01, 0));
      p.step(1 / 60);
    }
    expect(feet.x).toBeGreaterThan(4.5);
  });
});

describe('Physics queries', () => {
  it('only sees new colliders after refreshQueries()', () => {
    const p = new Physics();
    p.box(0, 0, 0, 5, 1, 5);
    expect(p.groundY(0, 0)).toBeNull();
    p.refreshQueries();
    expect(p.groundY(0, 0)).toBeCloseTo(1, 3);
  });

  it('finds the ground under a point, on a trimesh too', () => {
    const p = new Physics();
    const geo = new THREE.PlaneGeometry(20, 20, 4, 4);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 2, 0);
    p.meshCollider(geo);
    p.step(1 / 60);
    expect(p.groundY(3, -4)).toBeCloseTo(2, 3);
    expect(p.groundY(30, 30)).toBeNull();
  });

  it('never lets a ground ray slip through the crack between two triangles', () => {
    // A flat grid like the terrain (2 m cells). A ray within ~1e-5 m of a shared edge can
    // miss both triangles in float32; groundY must still find the floor.
    const p = new Physics();
    const geo = new THREE.PlaneGeometry(420, 420, 210, 210);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.6, 0);
    p.meshCollider(geo);
    p.refreshQueries();
    expect(p.groundY(-23.00006, 125.99999)).toBeCloseTo(0.6, 3);
  });

  it('measures ray distance and ignores filtered layers', () => {
    const p = new Physics();
    p.box(0, 0, -5, 1, 1, 0.5);
    p.box(0, 0, -2, 1, 1, 0.5, 0, Layer.Prop);
    p.step(1 / 60);
    const from = new THREE.Vector3(0, 0, 0), dir = new THREE.Vector3(0, 0, -1);
    expect(p.rayDistance(from, dir, 20, Layer.World)).toBeCloseTo(4.5, 3);
    expect(p.rayDistance(from, dir, 20, Layer.World | Layer.Prop)).toBeCloseTo(1.5, 3);
    expect(p.rayDistance(from, new THREE.Vector3(0, 0, 1), 20)).toBe(20);
  });
});

describe('Physics.kinematicBox', () => {
  it('moveTo shows up in queries after a step and gives a rider this frame\'s delta', () => {
    const p = setup();
    const k = p.kinematicBox(0, 1, 0, 1, 0.25, 1);
    p.refreshQueries();
    expect(p.groundY(0, 0, 10, Layer.Prop)).toBeCloseTo(1.25, 3);
    k.moveTo(0, 1.05, 0);
    expect(p.carryDelta(new THREE.Vector3(0, 1.3, 0))?.y).toBeCloseTo(0.05, 5); // however often asked
    expect(p.carryDelta(new THREE.Vector3(0, 1.3, 0))?.y).toBeCloseTo(0.05, 5);
    p.step(1 / 60);
    expect(k.pos.y).toBeCloseTo(1.05, 5);
    expect(p.groundY(0, 0, 10, Layer.Prop)).toBeCloseTo(1.3, 3);
    expect(p.carryDelta(new THREE.Vector3(0, 1.3, 0))?.y).toBe(0); // standing on a platform that didn't move
    expect(p.carryDelta(new THREE.Vector3(5, 0, 5))).toBeNull();
    k.moveTo(0, 5, 0);
    p.step(1 / 60);
    expect(p.groundY(0, 0, 10, Layer.Prop)).toBeCloseTo(5.25, 3);
    k.remove();
    p.step(1 / 60);
    expect(p.groundY(0, 0, 10, Layer.Prop)).toBeNull();
  });
});

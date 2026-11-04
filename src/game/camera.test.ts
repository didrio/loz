import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Layer, Physics, SOLID } from '../core/physics';
import { CameraRig } from './camera';

beforeAll(async () => {
  await initPhysics();
});

/** A floor and a 4 m ceiling; Wren faces +z, so the camera sits toward -z. `wallZ`: a wall behind her. */
function setup(wallZ: number | null) {
  const physics = new Physics();
  physics.box(0, -0.5, 0, 30, 0.5, 30);
  physics.box(0, 4.25, 0, 30, 0.25, 30);
  const wall = wallZ === null ? null : physics.box(0, 2, wallZ - 0.25, 10, 3, 0.25);
  physics.refreshQueries();
  const rig = new CameraRig(new THREE.PerspectiveCamera(), physics);
  rig.dist = 7;
  const wren = new THREE.Vector3(0, 0, 0);
  rig.snap(wren, 0);
  const run = (frames: number) => {
    for (let i = 0; i < frames; i++) rig.update(1 / 60, { yaw: 0, pitch: 0 }, wren, null);
  };
  run(120);
  return { rig, run, physics, wall, cam: rig.camera.position };
}

describe('CameraRig collision', () => {
  it('stops at a doorway\'s camera pane (stays in the room with Wren), which Wren walks through', () => {
    const open = setup(null);
    expect(open.cam.z).toBeLessThan(-4); // no pane: full distance behind her
    const { physics, run, cam } = setup(null);
    physics.box(0, 2, -2.05, 1, 2, 0.05, 0, Layer.CameraOnly);
    physics.refreshQueries();
    run(120);
    expect(cam.z).toBeGreaterThan(-2.05); // kept on Wren's side of the pane
    const feet = new THREE.Vector3(0, 0, -1);
    const wren = physics.createCharacter(feet, 0.35, 0.5, Layer.Player, SOLID | Layer.Enemy);
    for (let i = 0; i < 60; i++) wren.move(feet, new THREE.Vector3(0, -0.01, -0.05));
    expect(feet.z).toBeLessThan(-3); // and she walked straight through it
  });

  it('pulls in in front of a wall behind Wren, never inside it, and fades her when close', () => {
    const { cam, rig } = setup(-1);
    expect(cam.z).toBeGreaterThan(-1); // in front of the wall's face
    expect(rig.playerOpacity).toBeLessThan(1);
  });

  it('keeps clear of the ceiling and the floor', () => {
    const { cam } = setup(-1);
    expect(cam.y).toBeLessThan(4);
    expect(cam.y).toBeGreaterThan(0.3);
  });

  it('sits at its full distance with Wren solid when nothing is in the way', () => {
    const { cam, rig } = setup(null);
    expect(Math.hypot(cam.x, cam.z)).toBeGreaterThan(5);
    expect(rig.playerOpacity).toBe(1);
  });

  it('pulls in at once but eases back out', () => {
    const { rig, run, physics, wall, cam } = setup(-1);
    physics.remove(wall!);
    physics.refreshQueries();
    run(1);
    const after1 = Math.hypot(cam.x, cam.z);
    expect(after1).toBeLessThan(3); // not snapped back out
    run(240);
    expect(Math.hypot(cam.x, cam.z)).toBeGreaterThan(after1 + 2);
    expect(rig.playerOpacity).toBe(1);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { triangleCount } from '../kit';
import { BODY_Y, buildThornling, REST, ThornlingRig, type ThornlingCue, type ThornlingJoints } from './thornling';

/** Runs the rig for `seconds` of one state, the state's clock counting from `from`. */
function run(rig: ThornlingRig, cue: Omit<ThornlingCue, 't'>, seconds: number, from = 0) {
  const dt = 1 / 60;
  for (let t = from; t < from + seconds - 1e-9; t += dt) rig.update(dt, { ...cue, t: t + dt });
}

const fresh = (seed = 5) => {
  const m = buildThornling();
  return { joints: m.joints, rig: new ThornlingRig(m.joints, seed) };
};
const WINDUP = { state: 'windup', windup: 0.55, moving: false } as const;
const snapshot = (j: ThornlingJoints) =>
  Object.values(j).flatMap((o) => [...o.position.toArray(), ...o.scale.toArray(), o.rotation.x, o.rotation.y, o.rotation.z]);

describe('the Thornling model (final pass, T49)', () => {
  it('keeps the rough model\'s joint and size: body at 0.75, the face and thorns riding it', () => {
    const { joints, root } = buildThornling();
    expect(joints.body.position.y).toBe(BODY_Y);
    for (const j of [joints.shell, joints.eyes, joints.brows, joints.jaw]) expect(j.parent).toBe(joints.body);
    // The rough model's bounds were (-0.90, -0.12, -0.88) to (0.90, 1.62, 0.67): the silhouette is frozen.
    const b = new THREE.Box3().setFromObject(root);
    for (const [now, was] of [[b.min.toArray(), [-0.9, -0.123, -0.876]], [b.max.toArray(), [0.9, 1.623, 0.671]]]) {
      now.forEach((v, i) => expect(Math.abs(v - was[i])).toBeLessThan(0.1));
    }
    expect(triangleCount(root)).toBeLessThanOrEqual(1200);
  });

  it('winds up into a crouch: lower, thorns bristling, brows down, the jaw cracked, by the moment the lunge starts', () => {
    const { joints, rig } = fresh();
    run(rig, { state: 'wander', windup: 0.55, moving: false }, 0.5);
    const idleTop = joints.body.position.y + joints.body.scale.y * 0.65;
    run(rig, WINDUP, 0.55);
    expect(joints.body.position.y + joints.body.scale.y * 0.65).toBeLessThan(idleTop - 0.18);
    expect(joints.body.position.y - joints.body.scale.y * 0.65).toBeGreaterThan(-0.05); // its bottom stays on the ground
    expect(joints.shell.scale.x).toBeGreaterThan(1.1);
    expect(joints.body.rotation.x).toBeLessThan(-0.2); // reared back
    expect(joints.jaw.rotation.x).toBeGreaterThan(0.18);
  });

  it('gapes and stretches on the lunge', () => {
    const { joints, rig } = fresh();
    run(rig, WINDUP, 0.55);
    run(rig, { state: 'lunge', windup: 0.55, moving: false }, 0.1);
    expect(joints.jaw.rotation.x).toBeGreaterThan(0.6);
    expect(joints.body.scale.y).toBeGreaterThan(1.04);
    expect(joints.body.rotation.x).toBeGreaterThan(0.25);
  });

  it('wobbles back to rest inside the recover\'s 0.7 s', () => {
    const { rig } = fresh();
    run(rig, { state: 'lunge', windup: 0.55, moving: false }, 0.28);
    run(rig, { state: 'recover', windup: 0.55, moving: false }, 0.7);
    expect(Math.abs(rig.pose.squash - 1)).toBeLessThan(0.03);
    expect(Math.abs(rig.pose.pitch)).toBeLessThan(0.03);
    expect(rig.pose.jaw).toBeLessThan(0.02);
    expect(rig.pose.lift).toBeCloseTo(REST.lift, 1);
  });

  it('shuts its eyes and rocks back when hit, and comes round by the end of the stagger', () => {
    const { joints, rig } = fresh();
    run(rig, { state: 'stagger', windup: 0.55, moving: false }, 0.1);
    expect(joints.eyes.scale.y).toBeLessThan(0.3);
    expect(joints.body.scale.y).toBeLessThan(0.97);
    run(rig, { state: 'stagger', windup: 0.55, moving: false }, 0.6, 0.1);
    expect(joints.eyes.scale.y).toBeGreaterThan(0.9);
  });

  it('dies in its 0.35 s: puffs up, then the body pops and the thorns are gone', () => {
    const { joints, rig } = fresh();
    rig.die(0.25);
    expect(joints.body.scale.x).toBeGreaterThan(1.05);
    rig.die(1);
    const world = new THREE.Vector3();
    joints.body.updateWorldMatrix(true, true);
    expect(joints.body.getWorldScale(world).x).toBeLessThan(0.05);
    expect(joints.shell.getWorldScale(world).x).toBeLessThan(0.01);
  });

  it('is deterministic for a seed (the hop phase and blinks come from it)', () => {
    const a = fresh(42), b = fresh(42);
    for (const r of [a, b]) run(r.rig, { state: 'wander', windup: 0.55, moving: true }, 3);
    expect(snapshot(a.joints)).toEqual(snapshot(b.joints));
  });
});

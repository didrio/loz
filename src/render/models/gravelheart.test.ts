import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { triangleCount } from '../kit';
import { buildGravelheart, type GravelheartCue } from './gravelheart';

type GravelheartModel = ReturnType<typeof buildGravelheart>;

const cue = (over: Partial<GravelheartCue> = {}): GravelheartCue => ({
  posing: { state: 'fight', t: 0, phase: 1 }, move: null, moving: false, spin: 0, keyT: 0,
  plates: [true, true, true], loose: -1, looseT: 0, ...over,
});

/** Runs the rig for `seconds` at 60 fps with a cue that may change over time. */
function run(m: GravelheartModel, seconds: number, at: (t: number) => Partial<GravelheartCue>) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) m.rig.update(dt, cue(at(t)));
  m.root.updateMatrixWorld(true);
}

const world = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);

describe('the Gravelheart model (final, T55)', () => {
  it('keeps every joint where the rough model had it (hurtboxes and the glove ride them)', () => {
    const m = buildGravelheart();
    const { hips, torso, head, ember, keystone } = m.joints;
    expect(hips.position.toArray()).toEqual([0, 1.7, 0]);
    expect(torso.position.toArray()).toEqual([0, 0.4, 0]);
    expect(head.position.toArray()).toEqual([0, 2.25, 0.1]);
    expect(ember.position.toArray()).toEqual([0, 1.15, 0.6]);
    expect(keystone.position.toArray()).toEqual([0, 1.3, -0.85]);
    m.rig.plates.forEach((p, i) => expect(p.position.toArray()).toEqual([(i - 1) * 0.5, 1.15, 0.86]));
    for (const [a, side] of [[m.rig.armR, -1], [m.rig.armL, 1]] as const) {
      expect(a.shoulder.position.toArray()).toEqual([side * 1.7, 1.75, 0]);
      expect(a.shoulder.parent).toBe(torso);
      expect(a.elbow.position.y).toBe(-1.45);
      expect(a.fist.position.y).toBe(-1.05);
      for (const j of [a.shoulder, a.elbow, a.fist]) expect(j.rotation.order).toBe('XYZ');
    }
  });

  it('stays the rough model\'s size, inside the boss budget', () => {
    const m = buildGravelheart();
    m.root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(m.root).getSize(new THREE.Vector3());
    // The rough model at rest: 4.66 × 5.66 × 2.46 m.
    for (const [got, rough] of [[size.x, 4.66], [size.y, 5.66], [size.z, 2.46]]) {
      expect(got).toBeGreaterThan(rough * 0.9);
      expect(got).toBeLessThan(rough * 1.1);
    }
    expect(triangleCount(m.root)).toBeLessThanOrEqual(4000);
  });

  it('raises its fists overhead at the end of the Hammerfall windup, eyes red, lids slanted', () => {
    const m = buildGravelheart();
    run(m, 1.5, () => ({ move: { name: 'hammerfall', step: 'windup', t: 1, stepT: 0.9 } }));
    expect(m.rig.armR.shoulder.rotation.x).toBeCloseTo(-2.9, 2);
    expect(world(m.rig.armR.fist).y).toBeGreaterThan(world(m.rig.head).y);
    expect(m.rig.pose.red).toBeCloseTo(1, 2);
    expect(Math.abs(m.rig.lids[0].rotation.z)).toBeGreaterThan(0.25);
  });

  it('drops its jaw in the howl and closes it to fight', () => {
    const m = buildGravelheart();
    run(m, 1, () => ({ move: { name: 'howl', step: 'windup', t: 0.8, stepT: 1 } }));
    expect(m.rig.jaw.rotation.x).toBeGreaterThan(0.4);
    run(m, 1.5, () => ({}));
    expect(m.rig.jaw.rotation.x).toBeLessThan(0.02);
  });

  it('sleeps with its lids shut, and they close again as it dies', () => {
    const m = buildGravelheart();
    run(m, 0.5, () => ({ posing: { state: 'dormant', t: 0, phase: 1 } }));
    for (const lid of m.rig.lids) expect(lid.position.y).toBeCloseTo(0.95 - 0.27, 2);
    run(m, 6, (t) => ({ posing: { state: 'dying', t, phase: 2 } }));
    for (const lid of m.rig.lids) expect(lid.position.y).toBeLessThan(0.7);
    expect(m.rig.pose.eyes).toBeLessThan(0.05);
  });

  it('rattles a loose plate and the loose keystone inside their joints, which stay put for the glove', () => {
    const m = buildGravelheart();
    run(m, 0.3, () => ({ loose: 1, looseT: 2, keyT: 2 }));
    expect(m.rig.plates[1].position.toArray()).toEqual([0, 1.15, 0.86]);
    expect(m.rig.keystone.position.toArray()).toEqual([0, 1.3, -0.85]);
    expect(m.rig.rattles[1].position.length()).toBeGreaterThan(0);
    expect(m.rig.rattles[3].position.length()).toBeGreaterThan(0);
    expect(m.rig.rattles[0].position.length()).toBe(0);
  });

  it('is the same every time for a seed', () => {
    const pose = (seed: number) => {
      const m = buildGravelheart(seed);
      run(m, 2, (t) => ({ move: t < 1 ? { name: 'hammerfall', step: 'active', t, stepT: t } : null }));
      return m.rig.armR.pebbles.map((r) => `${r.rotation.y.toFixed(5)},${r.position.y.toFixed(5)}`).join(' ');
    };
    expect(pose(7)).toEqual(pose(7));
    expect(pose(7)).not.toEqual(pose(8));
  });
});

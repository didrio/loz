import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { triangleCount } from '../kit';
import { buildGravelheart, flourish, type GravelheartCue, type GravelheartMoveCue } from './gravelheart';

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

describe('Gravelheart keyed polish (T60)', () => {
  const move = (name: string, step: GravelheartMoveCue['step'], t: number, stepT = t): GravelheartMoveCue => ({ name, step, t, stepT });
  const BIG = ['hammerfall', 'sweep', 'doubleSweep', 'swipe', 'howl', 'cairnRoll'];
  const size = (o: Partial<Record<string, number>>) => Math.max(0, ...Object.values(o).map((v) => Math.abs(v ?? 0)));

  it('is zero at both ends of every windup, so the key angles stay where they were', () => {
    for (const name of BIG) {
      expect(size(flourish(move(name, 'windup', 0)))).toBeLessThan(1e-9);
      expect(size(flourish(move(name, 'windup', 1)))).toBeLessThan(1e-9);
      // ... and flat there: a frame from the end (1/60 s of a 0.65 s windup) is a few millimetres at most
      expect(size(flourish(move(name, 'windup', 0.97)))).toBeLessThan(0.01);
    }
  });

  it('does nothing in the active step, and is zero as the recover begins', () => {
    for (const name of BIG) {
      expect(flourish(move(name, 'active', 0.5))).toEqual({});
      expect(size(flourish(move(name, 'recover', 0, 0)))).toBeLessThan(1e-9);
    }
  });

  it('has rung out well before the recover ends', () => {
    expect(size(flourish(move('hammerfall', 'recover', 0.5, 0.5)))).toBeLessThan(0.01);
    expect(size(flourish(move('swipe', 'recover', 0.5, 0.5)))).toBeLessThan(0.01);
  });

  it('dips before Hammerfall rises, rebounds after the slam, and moves the body', () => {
    expect(flourish(move('hammerfall', 'windup', 0.3)).hipsY).toBeLessThan(-0.15);
    expect(flourish(move('hammerfall', 'windup', 0.7)).hipsY).toBeGreaterThan(0.1);
    expect(flourish(move('hammerfall', 'recover', 0.1, 0.08)).hipsY).toBeGreaterThan(0.05);
    const m = buildGravelheart();
    run(m, 1.5, () => ({ move: move('hammerfall', 'windup', 0.3, 0.27) }));
    const dipped = m.rig.hips.position.y;
    run(m, 1.5, () => ({ move: move('hammerfall', 'windup', 1, 0.9) }));
    expect(dipped).toBeLessThan(m.rig.hips.position.y - 0.08);
  });

  it('puts the hips exactly on the chased pose at the key frame, whatever came before', () => {
    const plain = buildGravelheart(), polished = buildGravelheart();
    run(plain, 2.4, () => ({ move: move('hammerfall', 'windup', 1, 0.9) }));
    run(polished, 0.9, (t) => ({ move: move('hammerfall', 'windup', t / 0.9, t) }));
    run(polished, 1.5, () => ({ move: move('hammerfall', 'windup', 1, 0.9) }));
    expect(polished.rig.hips.position.y).toBeCloseTo(plain.rig.hips.position.y, 2);
    expect(polished.rig.armR.shoulder.rotation.x).toBeCloseTo(plain.rig.armR.shoulder.rotation.x, 2);
  });
});

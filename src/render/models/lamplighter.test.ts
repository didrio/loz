import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { triangleCount } from '../kit';
import { buildLamplighter, SHIN, THIGH, type LamplighterCue, type LamplighterModel } from './lamplighter';

const cue = (over: Partial<LamplighterCue> = {}): LamplighterCue => ({
  posing: { state: 'fight', t: 0 }, state: 'fight', stateT: 0, move: null, turn: 0, speed: 0, yaw: 0,
  presence: 1, shattered: false, poleDropped: false, floorY: 0, ...over,
});

/** Runs the rig for `seconds` at 60 fps with a cue that may change over time. */
function run(m: LamplighterModel, seconds: number, at: (t: number) => Partial<LamplighterCue>) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) m.rig.update(dt, cue(at(t)));
  m.root.updateMatrixWorld(true);
}

const worldY = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).y;

describe('the Hollow Lamplighter model (final, T54)', () => {
  it('keeps every joint where the rough model had it (hurtboxes, the hook and the head ride them)', () => {
    const m = buildLamplighter();
    const { hips, neck, head, pole, poleTip, mask } = m.joints;
    expect(hips.position.toArray()).toEqual([0, 1.75, 0]);
    expect(neck.position.toArray()).toEqual([0, 1.62, 0.05]);
    expect(head.position.toArray()).toEqual([0, 0.62, 0]);
    expect(mask.position.toArray()).toEqual([0, 0.32, 0.13]);
    expect(pole.parent).toBe(m.armR.hand);
    expect(pole.position.toArray()).toEqual([0, -0.12, 0]);
    expect(poleTip.position.toArray()).toEqual([0, 3, 0]);
    for (const [a, side] of [[m.armR, -1], [m.armL, 1]] as const) {
      expect(a.shoulder.position.toArray()).toEqual([side * 0.5, 1.55, 0]);
      expect(a.shoulder.rotation.order).toBe('YXZ');
      expect(a.elbow.position.y).toBe(-1.15);
      expect(a.hand.position.y).toBe(-1.2);
      expect(a.fingers).toHaveLength(4);
    }
    m.legs.forEach((leg, i) => {
      expect(leg.thigh.position.x).toBe(i === 0 ? 0.3 : -0.3);
      expect(leg.knee.position.y).toBe(-THIGH);
      expect(leg.foot.position.y).toBe(-SHIN);
    });
  });

  it('is in budget and about the rough one\'s size', () => {
    const m = buildLamplighter();
    expect(triangleCount(m.root)).toBeLessThanOrEqual(2500);
    let meshes = 0;
    m.root.traverse((o) => o instanceof THREE.Mesh && meshes++);
    expect(meshes).toBeLessThanOrEqual(64);
    const size = new THREE.Box3().setFromObject(m.root).getSize(new THREE.Vector3());
    // The rough model: 1.6 × 5.5 × 1.8 m.
    expect(size.x).toBeCloseTo(1.6, 0);
    expect(size.y).toBeGreaterThan(5.3);
    expect(size.y).toBeLessThan(5.7);
    expect(size.z).toBeCloseTo(1.8, 0);
  });

  it('carries exactly three caged wisps (each frees a Gloomwisp) and a coat open at the front that the howl can tear', () => {
    const m = buildLamplighter();
    expect(m.lanterns.map((l) => +l.glow.position.y.toFixed(2))).toEqual([-0.5, -0.42, -0.54]);
    expect(m.strips.filter((s) => s.front).length).toBeGreaterThanOrEqual(4);
    expect(m.strips.every((s) => Math.abs(Math.atan2(Math.sin(s.a), Math.cos(s.a))) >= 0.3)).toBe(true);
  });

  it('the stuck slam brings the head down within reach; the skitter burns its eyes red', () => {
    const m = buildLamplighter();
    run(m, 1, () => ({}));
    const standing = worldY(m.joints.head);
    run(m, 1, (t) => ({ move: { name: 'slam', step: 'recover', t: 0.3, stepT: t } }));
    expect(standing - worldY(m.joints.head)).toBeGreaterThan(1);
    run(m, 1, () => ({ move: { name: 'skitter', step: 'windup', t: 1, stepT: 0.65 } }));
    expect(m.rig.pose.eyes).toBeCloseTo(1, 2);
    const eyes = (m.animated![0] as THREE.MeshLambertMaterial).emissive;
    expect(eyes.r).toBeGreaterThan(0.95);
    expect(eyes.g).toBeLessThan(0.1);
  });

  it('the eye-holes hold a faint cold light at rest, and none once the cage has burst', () => {
    const m = buildLamplighter();
    run(m, 1, () => ({}));
    const eyes = (m.animated![0] as THREE.MeshLambertMaterial).emissive;
    expect(eyes.b).toBeGreaterThan(0.05);
    expect(eyes.b).toBeGreaterThan(eyes.r);
    run(m, 0.1, () => ({ shattered: true }));
    expect(eyes.getHex()).toBe(0);
  });

  it('the hands: the right grips the pole, the left opens to cast and clutches in the howl', () => {
    const m = buildLamplighter();
    run(m, 1, () => ({ move: { name: 'volley', step: 'windup', t: 0.5, stepT: 0.4 } }));
    expect(m.armR.fingers[0].rotation.x).toBeLessThan(-0.8);
    expect(m.armL.fingers[0].rotation.x).toBeGreaterThan(0.1);
    run(m, 1, () => ({ move: { name: 'howl', step: 'windup', t: 0.5, stepT: 0.45 } }));
    expect(m.armL.fingers[0].rotation.x).toBeLessThan(-1.1);
  });

  it('the coat swings behind when it turns, then settles', () => {
    const m = buildLamplighter();
    run(m, 0.5, () => ({}));
    const rest = m.strips[0].g.rotation.z;
    run(m, 0.3, (t) => ({ yaw: 0.5 + t * 3 })); // turning left fast
    expect(m.strips[0].g.rotation.z - rest).toBeLessThan(-0.05);
    run(m, 3, () => ({ yaw: 0.5 + 0.9 }));
    expect(Math.abs(m.strips[0].g.rotation.z - rest)).toBeLessThan(0.08);
  });

  it('in death the dropped pole tips over and comes to rest just above the ground', () => {
    const m = buildLamplighter();
    run(m, 2, (t) => ({ state: 'dying', stateT: 1 + t, posing: { state: 'dying', t: 1 + t }, poleDropped: true, floorY: 0 }));
    expect(m.joints.pole.rotation.z).toBeCloseTo(Math.PI / 2 - 0.1, 1);
    expect(m.joints.pole.position.y).toBeCloseTo(0.1, 1);
  });

  it('is deterministic for a seed (the dormant twitch)', () => {
    const a = buildLamplighter(3), b = buildLamplighter(3);
    for (const m of [a, b]) run(m, 8, (t) => ({ state: 'dormant', posing: { state: 'dormant', t } }));
    expect(a.joints.head.rotation.z).toBe(b.joints.head.rotation.z);
    expect(a.joints.head.rotation.z).not.toBe(0);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { retargetClip, stripRootMotion } from './rigged';

/** A root with hips → arm, where each skeleton orients its bones its own way (like Mixamo vs an auto-rigger). */
function skeleton(hipsRest: THREE.Quaternion, armRest: THREE.Quaternion, hipsY: number) {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  hips.position.set(0, hipsY, 0);
  hips.quaternion.copy(hipsRest);
  const arm = new THREE.Bone();
  arm.name = 'mixamorigLeftArm';
  arm.position.set(0.2, 0.3, 0);
  arm.quaternion.copy(armRest);
  hips.add(arm);
  root.add(hips);
  return { root, hips, arm };
}

const q = (x: number, y: number, z: number, a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), a);
const worldQ = (o: THREE.Object3D) => {
  o.updateWorldMatrix(true, false);
  return o.getWorldQuaternion(new THREE.Quaternion());
};

describe('retargetClip (experiment)', () => {
  // Source: Mixamo-like, hips at 100 (cm), its own odd rest axes. Target: 1 m hips, different axes.
  const src = skeleton(q(1, 0, 0, 0.3), q(0, 0, 1, 1.4), 100);
  const dst = skeleton(q(0, 1, 0, 2.0), q(1, 1, 0, -0.9), 1);
  // The clip: the arm swings 0.8 rad about world up at t=1, the hips rise 10 cm and walk 50 cm forward.
  const srcArmRestW = worldQ(src.arm), srcHipsRestW = worldQ(src.hips);
  const armAt1 = srcHipsRestW.clone().invert().multiply(q(0, 1, 0, 0.8)).multiply(srcArmRestW);
  const clip = new THREE.AnimationClip('swing', 1, [
    new THREE.QuaternionKeyframeTrack('mixamorigLeftArm.quaternion', [0, 1], [...src.arm.quaternion.toArray(), ...armAt1.toArray()]),
    new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [...src.hips.quaternion.toArray(), ...src.hips.quaternion.toArray()]),
    new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 100, 0, 0, 110, 50]),
  ]);
  const out = retargetClip(src.root, clip, dst.root);

  it('turns the target bone by the same world rotation away from its rest', () => {
    const restW = worldQ(dst.arm);
    const mixer = new THREE.AnimationMixer(dst.root);
    const a = mixer.clipAction(out);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    mixer.setTime(1);
    const nowW = worldQ(dst.arm);
    const want = q(0, 1, 0, 0.8).multiply(restW);
    expect(nowW.angleTo(want)).toBeCloseTo(0, 4);
  });

  it('scales the hips rise to the target and drops the travel', () => {
    const mixer = new THREE.AnimationMixer(dst.root);
    const a = mixer.clipAction(out);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    mixer.setTime(1);
    expect(dst.hips.position.y).toBeCloseTo(1.1, 4);
    expect(dst.hips.position.z).toBeCloseTo(0, 4);
  });

  it('leaves the source in its rest pose', () => {
    expect(src.arm.quaternion.angleTo(q(0, 0, 1, 1.4))).toBeCloseTo(0, 5);
    expect(src.hips.position.y).toBeCloseTo(100);
  });
});

describe('stripRootMotion (experiment)', () => {
  it('pins the hips horizontally and keeps their bob', () => {
    const clip = new THREE.AnimationClip('run', 1, [new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 1, 0, 3, 1.1, 9])]);
    stripRootMotion(clip, new THREE.Vector3(0.1, 1, 0.2));
    expect(Array.from(clip.tracks[0].values)).toEqual([0.1, 1, 0.2, 0.1, expect.closeTo(1.1), 0.2].map((v) => (typeof v === 'number' ? expect.closeTo(v) : v)));
  });
});

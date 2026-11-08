import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { triangleCount } from '../kit';
import { buildWren, PIVOT_Y, SHIELD_BLOCK_POS, SHIELD_WOOD, SHIELD_BROKEN, STONEWARD_COAT, WREN_COAT, WrenRig, type WrenCue, type WrenJoints } from './wren';

const IDLE: WrenCue = {
  alive: true, action: 'move', t: 0, combo: 0, swing: 0, speed: 0, run: 0, grounded: true,
  shielding: false, surfing: false, throwing: false, broken: 0, hasSword: true,
};

/** Runs the rig for `seconds` with a cue (`t` and the swing's progress counted for it). */
function run(rig: WrenRig, cue: Partial<WrenCue>, seconds: number, swingDur = 0) {
  const dt = 1 / 60;
  for (let t = dt; t < seconds + 1e-9; t += dt) {
    rig.update(dt, { ...IDLE, ...cue, t, swing: swingDur ? Math.min(1, t / swingDur) : 0 });
  }
}

const fresh = (seed = 5) => {
  const m = buildWren(seed);
  return { ...m, rig: new WrenRig(m.joints, m.shieldMat, seed) };
};
const snapshot = (j: WrenJoints) =>
  Object.values(j).flatMap((o) => [...o.position.toArray(), ...o.scale.toArray(), o.rotation.x, o.rotation.y, o.rotation.z]);

describe('Wren\'s model (final pass, T50)', () => {
  it('keeps the humanoid\'s joints where they always were, so the player and the camera see the same body', () => {
    const { joints } = buildWren(1);
    expect(joints.pivot.position.y).toBe(PIVOT_Y);
    const body = (o: THREE.Object3D) => o.position.toArray();
    expect(body(joints.legL)).toEqual([0.14, 0.85, 0]);
    expect(body(joints.legR)).toEqual([-0.14, 0.85, 0]);
    expect(body(joints.armL)).toEqual([0.44, 1.5, 0]);
    expect(body(joints.armR)).toEqual([-0.44, 1.5, 0]);
    expect(joints.armL.rotation.order).toBe('YXZ');
    expect(body(joints.head)).toEqual([0, 1.88, 0]);
    expect(joints.sword.parent).toBe(joints.armR);
    expect(joints.sword.position.y).toBe(-0.62);
    expect(joints.shield.parent).toBe(joints.armL);
    for (const j of [joints.eyes, joints.brows]) expect(j.parent).toBe(joints.head);
  });

  it('stands as tall as before, within the player budget', () => {
    const { root, joints } = buildWren(1);
    joints.sword.visible = joints.shield.visible = false;
    const b = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverseVisible((o) => o instanceof THREE.Mesh && b.expandByObject(o));
    // The rough model stood from 0 to 2.21 m (its hair's crown): the head is bigger, its height is not.
    expect(Math.abs(b.min.y)).toBeLessThan(0.03);
    expect(Math.abs(b.max.y - 2.21)).toBeLessThan(0.05);
    expect(triangleCount(root)).toBeLessThanOrEqual(2000);
  });

  it('keeps each swing\'s key angles where the rough had them, with a pull-back before and an overshoot after', () => {
    for (const [combo, dur, key, from, to] of [[0, 0.3, 'y', -1.7, 1.4], [1, 0.3, 'y', 1.4, -1.7], [2, 0.42, 'x', -3.1, -0.5]] as const) {
      const at = (p: number) => {
        const { joints, rig } = fresh();
        rig.update(0, { ...IDLE, action: 'attack', combo, swing: p, t: p * dur });
        return joints.armR.rotation[key];
      };
      expect(at(0.12)).toBeCloseTo(from, 5);
      expect(at(0.72)).toBeCloseTo(to, 5);
      const dir = Math.sign(to - from);
      expect(dir * (at(0.06) - from)).toBeLessThan(-0.1); // drawn back first
      expect(dir * (at(0.86) - to)).toBeGreaterThan(0.1); // carries through
      expect(at(1)).toBeCloseTo(to, 5);
    }
  });

  it('holds the raised shield square in front of the chest wherever the arm is', () => {
    const { joints, rig } = fresh();
    run(rig, { run: 1, speed: 8.5 }, 0.3);
    run(rig, { shielding: true, run: 1, speed: 8.5 }, 0.05);
    const body = joints.armL.parent!;
    const centre = body.worldToLocal(joints.shield.getWorldPosition(new THREE.Vector3()));
    expect(centre.distanceTo(SHIELD_BLOCK_POS)).toBeLessThan(0.01);
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(joints.shield.getWorldQuaternion(new THREE.Quaternion()));
    const bodyFace = new THREE.Vector3(0, 0, 1).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()));
    expect(face.dot(bodyFace)).toBeGreaterThan(0.999);
  });

  it('rides the shield flat underfoot', () => {
    const { joints, rig, root } = fresh();
    run(rig, { surfing: true, run: 1, speed: 12 }, 0.5);
    root.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(joints.shield.getWorldQuaternion(new THREE.Quaternion()));
    expect(up.y).toBeGreaterThan(0.8);
    expect(joints.shield.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(0.3);
  });

  it('falls back and lies flat by half a second after dying, and stands again on a revive', () => {
    const { joints, rig } = fresh();
    run(rig, { alive: false }, 0.5);
    expect(joints.pivot.rotation.x).toBeLessThan(-1.45);
    run(rig, { alive: false }, 0.5);
    expect(Math.abs(joints.pivot.rotation.x + Math.PI / 2)).toBeLessThan(0.02);
    expect(joints.eyes.scale.y).toBeLessThan(0.2);
    rig.reset();
    run(rig, {}, 0.1);
    expect(Math.abs(joints.pivot.rotation.x)).toBeLessThan(0.02);
  });

  it('shuts their eyes and recoils when hurt', () => {
    const { joints, rig } = fresh();
    run(rig, { action: 'hurt' }, 0.1);
    expect(joints.eyes.scale.y).toBeLessThan(0.2);
    expect(joints.pivot.rotation.x).toBeLessThan(-0.3);
  });

  it('is never squashed or stretched: no joint scales but the blinking eyes', () => {
    const { joints, rig } = fresh();
    for (const cue of [{ run: 1, speed: 8.5 }, { action: 'attack', combo: 2 }, { action: 'hurt' }, { surfing: true }, { alive: false }] as Partial<WrenCue>[]) {
      run(rig, cue, 0.4, cue.action === 'attack' ? 0.42 : 0);
      for (const [name, j] of Object.entries(joints)) if (name !== 'eyes') expect(j.scale.toArray()).toEqual([1, 1, 1]);
    }
  });

  it('flashes the shield red while the guard is broken, and recolours for the Stoneward Tunic through `coatMat`', () => {
    const { rig, shieldMat, coatMat } = fresh();
    rig.update(1 / 60, { ...IDLE, broken: 1.0 });
    expect(shieldMat.color.getHex()).toBe(new THREE.Color(SHIELD_BROKEN).getHex());
    rig.update(1 / 60, { ...IDLE });
    expect(shieldMat.color.getHex()).toBe(new THREE.Color(SHIELD_WOOD).getHex());
    expect(coatMat.color.getHex()).toBe(new THREE.Color(WREN_COAT).getHex());
    expect(STONEWARD_COAT).not.toBe(WREN_COAT);
  });

  it('the rig never draws from Math.random, so it shifts no other random number (enemy AI, seeded look runs)', () => {
    const m = buildWren();
    const spy = vi.spyOn(Math, 'random');
    run(new WrenRig(m.joints, m.shieldMat), {}, 5);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('is deterministic for a seed (blinks come from it)', () => {
    const a = fresh(42), b = fresh(42);
    for (const r of [a, b]) {
      run(r.rig, { run: 1, speed: 8.5 }, 1);
      run(r.rig, {}, 4);
    }
    expect(snapshot(a.joints)).toEqual(snapshot(b.joints));
  });
});

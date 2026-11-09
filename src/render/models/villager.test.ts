import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { triangleCount } from '../kit';
import { buildVillager, CLASP, HUG, VILLAGERS, type VillagerCue, type VillagerJoints } from './villager';

const CALM: VillagerCue = { near: false, holding: false };

/** Runs a villager's rig for `seconds`. */
function run(m: ReturnType<typeof buildVillager>, cue: Partial<VillagerCue>, seconds: number) {
  const dt = 1 / 60;
  for (let t = dt; t < seconds + 1e-9; t += dt) m.rig.update(dt, { ...CALM, ...cue });
}

/** The visible meshes' bounds, in the root's space. */
function bounds(root: THREE.Object3D) {
  const b = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => o instanceof THREE.Mesh && b.expandByObject(o));
  return b;
}

const snapshot = (j: VillagerJoints) =>
  Object.values(j).flatMap((o) => [...o.position.toArray(), ...o.scale.toArray(), o.rotation.x, o.rotation.y, o.rotation.z, o.visible ? 1 : 0]);

describe('the villagers\' body (T53)', () => {
  it('keeps the old humanoid\'s joints on an adult, where the Npc always had them', () => {
    const { joints } = buildVillager(VILLAGERS.maren, 0);
    expect(joints.pivot.position.y).toBe(0.9);
    expect(joints.legL.position.toArray()).toEqual([0.14, 0.85, 0]);
    expect(joints.legR.position.toArray()).toEqual([-0.14, 0.85, 0]);
    expect(joints.armL.position.toArray()).toEqual([0.44, 1.5, 0]);
    expect(joints.armR.position.toArray()).toEqual([-0.44, 1.5, 0]);
    expect(joints.armL.rotation.order).toBe('YXZ');
    expect(joints.head.position.toArray()).toEqual([0, 1.88, 0]);
    for (const j of [joints.eyes, joints.brows]) expect(j.parent).toBe(joints.head);
  });

  it('stands as tall as the rough body, adult and child alike (a child\'s head is bigger, not the child)', () => {
    // The rough humanoid stood from 0 to 2.21 (its hair's crown) at scale 1, about 1.1 m wide with its arms.
    for (const look of Object.values(VILLAGERS)) {
      const b = bounds(buildVillager(look, 0).root);
      expect(Math.abs(b.min.y), look.frame).toBeLessThan(0.03);
      expect(Math.abs(b.max.y - 2.21), look.frame).toBeLessThan(0.06);
      expect(b.max.x - b.min.x).toBeLessThan(1.25);
    }
  });

  it('gives a child a head about 1.3× an adult\'s', () => {
    const head = (look: (typeof VILLAGERS)[keyof typeof VILLAGERS]) => {
      const { joints } = buildVillager(look, 0);
      return bounds(joints.head.children.find((c) => c instanceof THREE.Mesh)!).getSize(new THREE.Vector3()).y;
    };
    expect(head(VILLAGERS.pip) / head(VILLAGERS.maren)).toBeGreaterThan(1.2);
  });

  it('is within the NPC budget, Pip with her doll included', () => {
    for (const look of Object.values(VILLAGERS)) expect(triangleCount(buildVillager(look, 0).root)).toBeLessThanOrEqual(1200);
  });

  it('scales the whole body', () => {
    const b = bounds(buildVillager(VILLAGERS.pip, 0, 0.58).root);
    expect(b.max.y).toBeCloseTo(2.21 * 0.58, 1);
  });

  it('keeps the old idle on a calm villager: breathing, arms swaying, never squashed', () => {
    const m = buildVillager(VILLAGERS.tobin, 0);
    const lifts: number[] = [];
    for (let i = 0; i < 240; i++) {
      run(m, {}, 1 / 60);
      lifts.push(m.joints.pivot.position.y);
      for (const j of Object.values(m.joints)) if (j !== m.joints.eyes) expect(j.scale.toArray()).toEqual([1, 1, 1]);
    }
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeGreaterThan(0.02);
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeLessThan(0.035);
  });

  it('blinks every few seconds', () => {
    const m = buildVillager(VILLAGERS.odo, 0);
    let shut = 0;
    for (let i = 0; i < 60 * 8; i++) {
      run(m, {}, 1 / 60);
      if (m.joints.eyes.scale.y < 0.3) shut++;
    }
    expect(shut).toBeGreaterThan(0);
    expect(shut).toBeLessThan(60); // a blink, not a nap
  });

  it('has Pip clasp her hands and look down, then peek up at Wren when they come near', () => {
    const m = buildVillager(VILLAGERS.pip, 0);
    run(m, {}, 2);
    expect(m.joints.armL.rotation.x).toBeCloseTo(CLASP.armX, 1);
    expect(m.joints.head.rotation.x).toBeGreaterThan(0.15); // eyes down
    let up = 0;
    for (let i = 0; i < 60 * 6; i++) {
      run(m, { near: true }, 1 / 60);
      up = Math.min(up, m.joints.head.rotation.x);
    }
    expect(up).toBeLessThan(0); // looked up at Wren at least once
  });

  it('shows Button in Pip\'s arms only while she holds her, the hug folded round the doll', () => {
    const m = buildVillager(VILLAGERS.pip, 0);
    run(m, {}, 0.5);
    expect(m.joints.doll.visible).toBe(false);
    run(m, { holding: true }, 1.5);
    expect(m.joints.doll.visible).toBe(true);
    expect(m.joints.armL.rotation.x).toBeCloseTo(HUG.armX, 1);
    // Both hands sit in front of the chest, close to the doll.
    m.root.updateMatrixWorld(true);
    const doll = bounds(m.joints.doll);
    const centre = doll.getCenter(new THREE.Vector3());
    for (const arm of [m.joints.armL, m.joints.armR]) {
      const hand = bounds(arm.children.filter((c) => c instanceof THREE.Mesh)[1]).getCenter(new THREE.Vector3());
      expect(hand.z).toBeGreaterThan(0.2);
      expect(hand.distanceTo(centre)).toBeLessThan(0.35);
    }
    // A villager without a doll never shows the empty joint.
    const lark = buildVillager(VILLAGERS.lark, 0);
    run(lark, { holding: true }, 0.2);
    expect(lark.joints.doll.visible).toBe(false);
  });

  it('never draws from Math.random, and is deterministic for a phase', () => {
    const a = buildVillager(VILLAGERS.pip, 3.7), b = buildVillager(VILLAGERS.pip, 3.7);
    const spy = vi.spyOn(Math, 'random');
    run(a, { near: true }, 6);
    run(b, { near: true }, 6);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(snapshot(a.joints)).toEqual(snapshot(b.joints));
  });
});

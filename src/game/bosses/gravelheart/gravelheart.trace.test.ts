import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initPhysics } from '../../../core/physics';
import { enemyEnv, flatGround } from '../../enemyTestEnv';
import { Hazards } from '../../hazards';
import { Gravelheart } from './index';

/**
 * "Plays the same", frame by frame (T55, the final pass): Gravelheart's hurtboxes, the ember and head (the camera's shots
 * and the defeat aim there), and the three plates and the keystone (where the glove's cord aims) through the intro,
 * stalking, every move, the howl, the kneel and the death. The snapshot was recorded on the rough model's inline posing;
 * the rig and the kit model must reproduce it unedited. Random numbers are pinned (the boss's `rng` and `Math.random`).
 */

beforeAll(async () => {
  await initPhysics();
  vi.spyOn(Math, 'random').mockReturnValue(0.3);
});
afterAll(() => {
  vi.restoreAllMocks();
});

const r4 = (n: number) => {
  const s = n.toFixed(4);
  return s === '-0.0000' ? '0.0000' : s;
};
const v3 = (v: THREE.Vector3) => `${r4(v.x)},${r4(v.y)},${r4(v.z)}`;
const at = (o: THREE.Object3D) => v3(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));

describe('Gravelheart, frame by frame', () => {
  it('keeps its hurtboxes, ember, head, plates and keystone exactly where they were', () => {
    const physics = flatGround();
    const scene = new THREE.Scene();
    const playerPos = new THREE.Vector3(0, 0, 5);
    const { env: base } = enemyEnv(physics, playerPos);
    const env = { ...base, hazards: new Hazards(scene) };
    const b = new Gravelheart(scene, physics, null, 0, 0, 0, 0);
    b.rng = () => 0.3;

    const trace: string[] = [];
    let frame = 0;
    const dt = 1 / 60;
    const step = () => {
      b.update(dt, env);
      physics.step(dt);
      if (frame++ % 4 !== 0) return;
      const boxes = b.hurtboxes().map((h) => `${h.part}${h.armor ? '*' : ''} ${v3(h.center)} ${r4(h.radius)}`);
      const plates = b.rig.plates.map(at).join(' ');
      trace.push(`${frame} ${b.state} ${b.move?.name ?? '-'}:${b.move ? b.step : '-'} ember ${v3(b.emberWorldPos())} head ${v3(b.headWorldPos())} plates ${plates} key ${at(b.rig.keystone)} | ${boxes.join(' | ')}`);
    };
    const runFor = (seconds: number) => {
      for (let t = 0; t < seconds; t += dt) step();
    };
    const runUntil = (until: () => boolean, max = 8) => {
      for (let t = 0; t < max && !until(); t += dt) step();
    };
    /** Runs until it has stood without a move for a few frames (a queued follow-up starts the frame after a move ends). */
    const settle = (max = 15) => {
      let still = 0;
      for (let t = 0; t < max && still < 10; t += dt) {
        step();
        still = b.move ? 0 : still + 1;
      }
    };
    const ahead = (d: number) => b.pos.clone().addScaledVector(b.forward, d);
    const chest = () => ahead(2.6);

    // Asleep a moment, then the intro: it stirs, heaves itself up.
    runFor(0.5);
    b.wake();
    runUntil(() => b.ready);
    b.engage();
    // Stalking: Wren far off, so it walks.
    playerPos.set(0, 0, 12);
    runFor(1);
    playerPos.set(0, 0, 4);
    // Hammerfall: stuck, a plate works loose, and the glove tears it off from in front.
    settle();
    b.forceMove('hammerfall');
    runUntil(() => b.step === 'recover' && b.loose >= 0);
    runFor(0.2);
    expect(b.tetherAt(ahead(6), b.forward.clone().negate())).not.toBeNull();
    settle();
    for (const name of ['sweep', 'swipe', 'volley']) {
      settle();
      b.forceMove(name);
      settle();
    }
    // Greed: Wren hugs its back and it grinds.
    settle();
    playerPos.copy(ahead(-3));
    b.forceMove('grind');
    settle();
    playerPos.set(0, 0, 4);
    // The last plate gone: staggered, the chest open, then new plates.
    settle();
    b.interruptWith('staggered');
    runUntil(() => b.chestOpen);
    b.hurt(1, chest(), 'chest');
    settle();
    // Half health: the howl.
    b.hp = 21;
    b.hurt(2, chest(), 'chest');
    settle();
    expect(b.phase).toBe(2);
    playerPos.copy(ahead(4));
    b.forceMove('doubleSweep');
    settle();
    // Cairn Roll into a block of stone: dazed, the keystone loose; the glove pulls it from behind and it kneels.
    const wall = ahead(9);
    physics.box(wall.x, 2, wall.z, 2, 2, 2);
    physics.refreshQueries();
    playerPos.copy(ahead(13));
    b.forceMove('cairnRoll');
    runUntil(() => b.keyT > 0);
    runFor(0.3);
    expect(b.tetherAt(ahead(-6), b.forward.clone())).not.toBeNull();
    runUntil(() => b.chestOpen);
    for (let i = 0; i < 3; i++) {
      runFor(0.3);
      b.hurt(1, chest(), 'chest');
    }
    settle();
    // The death: the last kneel, the killing blow, and it sinks asleep.
    b.kneelsSpent = 2;
    b.forceMove('kneel');
    runUntil(() => b.chestOpen);
    runFor(0.3);
    b.hurt(99, chest(), 'chest');
    expect(b.state).toBe('dying');
    runFor(5);

    const names = new Set(trace.map((l) => l.split(' ')[2].split(':')[0]));
    expect([...names].sort()).toEqual(['-', 'cairnRoll', 'doubleSweep', 'grind', 'hammerfall', 'howl', 'kneel', 'staggered', 'sweep', 'swipe', 'volley']);
    expect(trace).toMatchSnapshot();
  });
});

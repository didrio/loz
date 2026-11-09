import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Sfx } from '../../core/audio';
import { initPhysics, Physics } from '../../core/physics';
import type { Particles } from '../../render/particles';
import type { EnemyEnv } from '../enemies';
import { Hazards } from '../hazards';
import { HollowLamplighter } from './lamplighter';

/**
 * "Plays the same", frame by frame (T54, the final pass): the Lamplighter's hurtboxes, the hook's tip (where the slam lands)
 * and the head (where the volley leaves and the wisps orbit) through the intro, stalking, every move, the howl and the death.
 * The snapshot was recorded on the rough model's inline posing; the rig and the kit model must reproduce it unedited.
 * Random numbers are pinned (the boss's `rng` and `Math.random`), so the run is the same every time.
 */

beforeAll(async () => {
  await initPhysics();
  vi.spyOn(Math, 'random').mockReturnValue(0.3);
});
afterAll(() => {
  vi.restoreAllMocks();
});

const noop = () => {};
const r4 = (n: number) => {
  const s = n.toFixed(4);
  return s === '-0.0000' ? '0.0000' : s;
};
const v3 = (v: THREE.Vector3) => `${r4(v.x)},${r4(v.y)},${r4(v.z)}`;

describe('the Hollow Lamplighter, frame by frame', () => {
  it('keeps its hurtboxes, hook and head exactly where they were', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 60, 0.5, 60);
    physics.refreshQueries();
    const scene = new THREE.Scene();
    const playerPos = new THREE.Vector3(3, 0, 5);
    const env: EnemyEnv = {
      playerPos,
      playerAlive: true,
      night: true,
      physics,
      hazards: new Hazards(scene),
      sfx: new Proxy({}, { get: () => noop }) as Sfx,
      particles: { burst: noop, fx: noop } as unknown as Particles,
      hitPlayer: () => 'hit',
      pushPlayer: noop,
      spawn: noop,
      drop: noop,
      shake: noop,
    };
    const b = new HollowLamplighter(scene, physics, null, 0, 0, 0);
    b.rng = () => 0.3;

    const trace: string[] = [];
    let frame = 0;
    const dt = 1 / 60;
    const step = () => {
      b.update(dt, env);
      physics.step(dt);
      if (frame++ % 4 !== 0) return;
      const boxes = b.hurtboxes().map((h) => `${h.part}${h.armor ? '*' : ''} ${v3(h.center)} ${r4(h.radius)}`);
      trace.push(`${frame} ${b.state} ${b.move?.name ?? '-'}:${b.move ? b.step : '-'} tip ${v3(b.tipWorldPos())} head ${v3(b.headWorldPos())} | ${boxes.join(' | ')}`);
    };
    const runFor = (seconds: number) => {
      for (let t = 0; t < seconds; t += dt) step();
    };
    /** Runs until it has stood without a move for a few frames (a queued follow-up starts the frame after a move ends). */
    const settle = (max = 15) => {
      let still = 0;
      for (let t = 0; t < max && still < 10; t += dt) {
        step();
        still = b.move ? 0 : still + 1;
      }
    };
    const behind = () => b.pos.clone().addScaledVector(b.forward, -3);

    // The intro: the head turns to Wren off to one side, the body follows, the shriek.
    b.wake();
    for (let t = 0; t < 8 && !b.ready; t += dt) step();
    b.engage();
    // Stalking: Wren far off, so it walks.
    playerPos.set(0, 0, 12);
    runFor(1);
    playerPos.set(0, 0, 4);
    for (const name of ['sweep', 'slam', 'volley']) {
      settle();
      b.forceMove(name);
      settle();
    }
    // Greed: two hits in the back (Wren standing behind it) earn the spin.
    settle();
    playerPos.copy(behind());
    step();
    b.hurt(1, behind());
    b.hurt(1, behind());
    settle();
    playerPos.set(0, 0, 4);
    // Half health: the howl tears the coat open.
    b.hurt(14, behind());
    settle();
    expect(b.phase).toBe(2);
    // Phase two: a sweep with its backhand, then the skitter from range.
    b.forceMove('sweep');
    settle();
    playerPos.set(0, 0, 9);
    settle();
    b.forceMove('skitter');
    settle();
    // The death: it crumbles, the cage bursts, the pole drops.
    b.hurt(99, behind());
    runFor(6.5);

    const names = new Set(trace.map((l) => l.split(' ')[2].split(':')[0]));
    expect([...names].sort()).toEqual(['-', 'backhand', 'howl', 'skitter', 'slam', 'spin', 'sweep', 'volley']);
    expect(trace).toMatchSnapshot();
  });
});

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import type { Particles } from '../render/particles';
import type { Attack, HitResult } from './enemies';
import { Hazards, type HazardEnv } from './hazards';

beforeAll(async () => {
  await initPhysics();
});

function setup(result: HitResult = 'hit') {
  const physics = new Physics();
  physics.refreshQueries();
  const calls: Attack[] = [];
  const player = new THREE.Vector3(5, 0, 0);
  const env: HazardEnv = {
    playerPos: player,
    physics,
    particles: { burst: () => {} } as unknown as Particles,
    hitPlayer: (_f, attack) => (calls.push(attack), result),
  };
  return { hazards: new Hazards(new THREE.Scene()), env, calls, player };
}

const run = (h: Hazards, env: HazardEnv, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) h.update(1 / 60, env);
};

describe('Hazards', () => {
  it('a shockwave hits a grounded player once as it passes, and can only be jumped (not blocked)', () => {
    const { hazards, env, calls } = setup();
    hazards.shockwave(new THREE.Vector3(0, 0, 0), { speed: 9, maxRadius: 10 });
    run(hazards, env, 2);
    expect(calls.length).toBe(1);
    expect(calls[0].groundOnly).toBe(true);
    expect(calls[0].unblockable).toBe(true);
    expect(hazards.active).toBe(0);
  });

  it('an orb curves toward the player and pops when it lands, is blocked or breaks the guard', () => {
    for (const result of ['hit', 'blocked', 'broken'] as const) {
      const { hazards, env, calls, player } = setup(result);
      player.set(0, 0, 8);
      // Fired off to the side; homing bends it in.
      hazards.orb(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0.5, 0, 1), { speed: 8, homing: 2 });
      run(hazards, env, 3);
      expect(calls.length).toBe(1);
      expect(hazards.active).toBe(0);
    }
  });

  it('an orb passes through a player who is briefly untouchable', () => {
    const { hazards, env, calls, player } = setup('miss');
    player.set(0, 0, 4);
    hazards.orb(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0, 0, 1), { speed: 8, homing: 0, life: 1 });
    run(hazards, env, 0.7);
    expect(calls.length).toBeGreaterThan(0);
    expect(hazards.active).toBe(1);
  });
});

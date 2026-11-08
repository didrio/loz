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
    particles: { burst: () => {}, fx: () => {} } as unknown as Particles,
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

  describe('thrown stones', () => {
    it('hover, then fly at Wren and hit her once', () => {
      const { hazards, env, calls, player } = setup();
      player.set(0, 0, 8);
      hazards.stone(new THREE.Vector3(0, 1.2, 0), { delay: 0.5 });
      run(hazards, env, 0.4);
      expect(calls.length).toBe(0); // still gathering itself
      run(hazards, env, 1.2);
      expect(calls.length).toBe(1);
      expect(calls[0].guard).toBe(1);
      expect(hazards.active).toBe(0);
    });

    it('a blocked stone lands as rubble where it hit', () => {
      const { hazards, env, player } = setup('blocked');
      player.set(0, 0, 8);
      let landed: THREE.Vector3 | null = null;
      hazards.stone(new THREE.Vector3(0, 1.2, 0), { onLand: (at) => (landed = at) });
      run(hazards, env, 1.5);
      expect(landed).not.toBeNull();
    });

    it('the glove catches one in flight and drops it harmless at Wren\'s feet', () => {
      const { hazards, env, calls, player } = setup();
      player.set(0, 0, 10);
      env.physics.box(0, -0.5, 5, 40, 0.5, 40);
      env.physics.refreshQueries();
      let landed = 0;
      hazards.stone(new THREE.Vector3(0, 1.2, 0), { speed: 6, onLand: () => landed++ });
      run(hazards, env, 0.3);
      const dir = new THREE.Vector3(0, 0, -1);
      const caught = hazards.tetherStone(player, dir);
      expect(caught).not.toBeNull();
      run(hazards, env, 3);
      expect(calls.length).toBe(0);
      expect(landed).toBe(1);
    });

    it('a homing stone bends after a Wren who sidesteps; a plain one misses', () => {
      for (const [homing, hits] of [[0, 0], [2.5, 1]] as const) {
        const { hazards, env, calls, player } = setup();
        player.set(0, 0, 9);
        hazards.stone(new THREE.Vector3(0, 1.1, 0), { speed: 12, homing });
        run(hazards, env, 0.1);
        player.x = 1.6; // a sidestep
        run(hazards, env, 1.2);
        expect(calls.length, `homing ${homing}`).toBe(hits);
      }
    });

    it('the glove ignores a stone that is still hovering or off to the side', () => {
      const { hazards, player } = setup();
      player.set(0, 0, 10);
      hazards.stone(new THREE.Vector3(0, 1.2, 0), { delay: 5 });
      expect(hazards.tetherStone(player, new THREE.Vector3(0, 0, -1))).toBeNull();
    });
  });
});

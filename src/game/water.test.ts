import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { TRIAL_RULES, type FallApi } from './trialFalls';
import { DEEP_DEPTH, WADE_DEPTH, WaterFalls, waterDepth, waterState } from './water';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('waterState', () => {
  it('is dry above the wading depth, shallow past it, deep past the deep depth', () => {
    expect(waterState(5, -1)).toBe('dry'); // above the surface
    expect(waterState(-1 - (WADE_DEPTH - 0.01), -1)).toBe('dry'); // a puddle
    expect(waterState(-1 - WADE_DEPTH, -1)).toBe('shallow');
    expect(waterState(-1 - (DEEP_DEPTH - 0.01), -1)).toBe('shallow');
    expect(waterState(-1 - DEEP_DEPTH, -1)).toBe('deep');
  });

  it('is always dry where there is no water', () => {
    expect(waterState(-100, null)).toBe('dry');
    expect(waterState(-100, undefined)).toBe('dry');
    expect(waterDepth(-100, null)).toBe(0);
  });

  it('measures against the level it is given, so a region can sit at its own height', () => {
    // The same feet are dry in the valley (surface at -1) and deep in a region whose surface is at 12.
    expect(waterState(3, -1)).toBe('dry');
    expect(waterState(3, 12)).toBe('deep');
    expect(waterState(11, 12)).toBe('shallow');
  });
});

function fakeApi() {
  const log: string[] = [];
  const api: FallApi = {
    sfx: { hurt: () => log.push('hurt') },
    state: { damage: (n) => log.push(`damage ${n}`) },
    player: { invuln: 0, teleport: (x, y, z) => log.push(`teleport ${x},${y.toFixed(2)},${z}`) },
    fade: async (to) => void log.push(`fade ${to}`),
  };
  return { api, log };
}

const SHIPPED = TRIAL_RULES.fallDamage;
beforeEach(() => {
  TRIAL_RULES.fallDamage = SHIPPED;
});

describe('WaterFalls', () => {
  const LEVEL = -1;

  it('deep water is a fall: half a heart, back to the last dry ground', async () => {
    const f = new WaterFalls(v(0, 0, 0));
    expect(f.check(v(4, 0.2, 1), true, LEVEL)).toBe(false); // dry shore: remembered
    expect(f.check(v(5, -1.8, 1), true, LEVEL)).toBe(false); // wading
    expect(f.check(v(6, -1 - DEEP_DEPTH - 0.1, 1), true, LEVEL)).toBe(true);
    expect(f.falling).toBe(true);
    const { api, log } = fakeApi();
    await f.recover(api);
    expect(TRIAL_RULES.fallDamage).toBe(1);
    expect(log).toEqual(['hurt', 'damage 1', 'fade 1', 'teleport 4,0.25,1', 'fade 0']);
    expect(f.falling).toBe(false);
  });

  it('wading never counts as dry ground, and a fall begins once', () => {
    const f = new WaterFalls(v(0, 0, 0));
    f.check(v(3, 0, 0), true, LEVEL);
    f.check(v(4, -1.5, 0), true, LEVEL); // shallow
    expect(f.dryGround.x).toBe(3);
    expect(f.check(v(5, -3, 0), true, LEVEL)).toBe(true);
    expect(f.check(v(5, -3, 0), true, LEVEL)).toBe(false); // already falling
  });

  it('falls from the air into deep water too, and ignores a spot with no water', () => {
    const f = new WaterFalls(v(0, 0, 0));
    expect(f.check(v(5, -3, 0), true, null)).toBe(false);
    expect(f.check(v(5, -3, 0), false, LEVEL)).toBe(true);
  });

  it('a dry spot does not move the return point while airborne, and reset goes back to the start', () => {
    const f = new WaterFalls(v(1, 2, 3));
    f.check(v(9, 0, 9), false, LEVEL); // mid-jump over dry ground
    expect(f.dryGround.toArray()).toEqual([1, 2, 3]);
    f.check(v(9, 0, 9), true, LEVEL);
    expect(f.dryGround.toArray()).toEqual([9, 0, 9]);
    f.reset();
    expect(f.dryGround.toArray()).toEqual([1, 2, 3]);
  });
});

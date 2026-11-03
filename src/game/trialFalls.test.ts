import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { TRIAL_RULES, TrialFalls, type FallApi } from './trialFalls';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const LEDGE = { x: 10, z: 0, hw: 2, hd: 2, top: 3 };

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

/** What the game ships with, read before any test changes it. */
const SHIPPED_FALL_DAMAGE = TRIAL_RULES.fallDamage;

beforeEach(() => {
  TRIAL_RULES.fallDamage = 0;
});

describe('TrialFalls', () => {
  it('a fall below fallY returns Wren to the last checkpoint she stood on, free of damage', async () => {
    const f = new TrialFalls([LEDGE], -5, v(0, 0, 0));
    expect(f.check(v(10.5, 3, 1), true)).toBe(false); // on the ledge: remembered
    expect(f.check(v(12, -5.1, 1), false)).toBe(true);
    const { api, log } = fakeApi();
    await f.recover(api);
    expect(log).not.toContain('damage 1');
    expect(log.find((l) => l.startsWith('teleport'))).toBe('teleport 10.5,3.05,1');
    expect(f.falling).toBe(false);
  });

  it('falls back to the start before any checkpoint was touched', async () => {
    const f = new TrialFalls([LEDGE], -5, v(1, 2, 3));
    expect(f.check(v(5, -6, 5), false)).toBe(true);
    const { api, log } = fakeApi();
    await f.recover(api);
    expect(log.find((l) => l.startsWith('teleport'))).toBe('teleport 1,2.05,3');
  });

  it('only a grounded Wren on the ledge counts, and only once per fall', () => {
    const f = new TrialFalls([LEDGE], -5, v(0, 0, 0));
    f.check(v(10, 3, 0), false); // jumping over it: not remembered
    expect(f.checkpoint.x).toBe(0);
    expect(f.check(v(0, -6, 0), false)).toBe(true);
    expect(f.check(v(0, -7, 0), false)).toBe(false); // already falling
  });

  it('a trial room pit counts as a fall', () => {
    const f = new TrialFalls([], -50, v(0, 0, 0));
    expect(f.check(v(0, 0, 0), true, true)).toBe(true);
  });

  it('ships with falls costing half a heart (the owner turned it on, 2026-11-03)', () => {
    expect(SHIPPED_FALL_DAMAGE).toBe(1);
  });

  it('the damage rule is a switch: with fallDamage 1 a fall costs half a heart', async () => {
    TRIAL_RULES.fallDamage = 1;
    const f = new TrialFalls([], -5, v(0, 0, 0));
    f.check(v(0, -6, 0), false);
    const { api, log } = fakeApi();
    await f.recover(api);
    expect(log).toContain('damage 1');
  });
});

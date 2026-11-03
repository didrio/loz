import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../core/physics';
import { enemyEnv, flatGround, runEnemy } from './enemyTestEnv';
import { swordTarget } from './player';
import { DozingSentinel, SENTINEL_RECOVER, SENTINEL_SWING, SENTINEL_WAKE_RANGE, LUNGE, SWING_HALF_WIDTH, SWING_REACH } from './sentinel';

beforeAll(async () => {
  await initPhysics();
});

/** A sentinel at the origin facing +z, on open ground. */
function setup(wren: THREE.Vector3, result?: () => 'hit' | 'blocked') {
  const physics = flatGround();
  const s = new DozingSentinel(new THREE.Group(), physics, 0, 0, 400, undefined, 0);
  const { env, hits } = enemyEnv(physics, wren, result);
  return { physics, s, env, hits, run: (sec: number, until?: () => boolean) => runEnemy(s, physics, env, sec, until) };
}

describe('Dozing Sentinel', () => {
  it('sleeps while Wren is in plain view but further than its wake range, and lock-on ignores it', () => {
    const { s, hits, run } = setup(new THREE.Vector3(0, 0, SENTINEL_WAKE_RANGE + 2));
    run(8);
    expect(s.asleep).toBe(true);
    expect(s.targetable).toBe(false);
    expect(hits.length).toBe(0);
  });

  it('wakes when Wren comes close, then swings its maul (heavy on the guard)', () => {
    const wren = new THREE.Vector3(0, 0, SENTINEL_WAKE_RANGE + 2);
    const { s, hits, run } = setup(wren);
    run(1);
    wren.z = 2.5;
    expect(run(5, () => hits.length > 0)).toBe(true);
    expect(s.asleep).toBe(false);
    expect(s.targetable).toBe(true);
    expect(hits[0].attack).toBe(SENTINEL_SWING);
    expect(SENTINEL_SWING.damage).toBe(4);
    expect(SENTINEL_SWING.guard).toBe(2);
  });

  it('its maul catches Wren straight ahead out to where it lands, not off to the side or beyond', () => {
    const swingAt = (place: (s: DozingSentinel) => THREE.Vector3) => {
      const wren = new THREE.Vector3(0, 0, 2.5);
      const { s, hits, run } = setup(wren);
      const state = () => (s as unknown as { state: string }).state;
      expect(run(8, () => state() === 'swing')).toBe(true);
      wren.copy(place(s));
      run(0.5);
      return hits.length;
    };
    const at = (d: number, side: number) => (s: DozingSentinel) =>
      new THREE.Vector3(s.pos.x + Math.sin(s.facing) * d + Math.cos(s.facing) * side, 0, s.pos.z + Math.cos(s.facing) * d - Math.sin(s.facing) * side);
    expect(swingAt(at(0.9, 0))).toBe(1); // point-blank (the old 3.1 m cone missed close in)
    expect(swingAt(at(SWING_REACH - 0.2, 0.4))).toBe(1); // near the maul head, a little off line: one blow, one hit
    // The owner's report against the 4.3 m / ±1.6 rad blow: 3.9 m out and 1.4 rad off its line.
    expect(swingAt((s) => new THREE.Vector3(s.pos.x + Math.sin(s.facing + 1.4) * 3.9, 0, s.pos.z + Math.cos(s.facing + 1.4) * 3.9))).toBe(0);
    expect(swingAt(at(1.5, SWING_HALF_WIDTH + 0.4))).toBe(0); // a step to its side
    expect(swingAt(at(SWING_REACH + LUNGE + 0.3, 0))).toBe(0); // backed off out of reach
  });

  it('doesn\'t wake for Wren on a level above it', () => {
    const { s, run } = setup(new THREE.Vector3(0, 6, 2));
    run(6);
    expect(s.asleep).toBe(true);
  });

  it('a sword hit while asleep does no harm but wakes it', () => {
    const wren = new THREE.Vector3(0, 0, 20); // far away: it wouldn't wake on its own
    const { s, run } = setup(wren);
    const hp = s.hp;
    expect(s.hurt(1, new THREE.Vector3(0, 0, -2))).toBe('guarded');
    expect(s.hp).toBe(hp);
    run(2);
    expect(s.asleep).toBe(false);
  });

  it('the sword bounces off the maul it holds out, but lands past it: from an angle, behind, raised or in the floor', () => {
    const wren = new THREE.Vector3(0, 0, 4.5);
    const { s, hits, run } = setup(wren);
    const state = () => (s as unknown as { state: string }).state;
    /** Swings at it from `d` m out, `a` radians off its facing, the way Wren's sword picks a part. */
    const swingFrom = (a: number, d = 2.5) => {
      const from = new THREE.Vector3(s.pos.x + Math.sin(s.facing + a) * d, s.pos.y, s.pos.z + Math.cos(s.facing + a) * d);
      const box = swordTarget(s.hurtboxes(), from, s.pos.clone().sub(from).setY(0).normalize());
      return box ? s.hurt(1, from, box.part) : 'miss';
    };
    expect(run(5, () => state() === 'chase')).toBe(true);
    run(0.4); // the maul comes up level in front of it
    expect(state()).toBe('chase');
    expect(swingFrom(0)).toBe('guarded'); // straight at the maul
    expect(swingFrom(0.35)).toBe('guarded'); // still the maul head first
    expect(swingFrom(1.1)).toBe('hit'); // round the maul to the body
    expect(swingFrom(Math.PI)).toBe('hit'); // the back is always open
    // Raised overhead in the windup, the maul's out of the way: a brave hit lands.
    expect(run(5, () => state() === 'windup')).toBe(true);
    run(0.6);
    expect(swingFrom(0)).toBe('hit');
    // Right after its blow, the maul's in the floor: the punish window.
    expect(run(5, () => hits.length > 0)).toBe(true);
    run(0.3);
    expect(state()).toBe('recover');
    expect(swingFrom(0)).toBe('hit');
    // It can't swing again during the recovery.
    const n = hits.length;
    run(SENTINEL_RECOVER - 0.5);
    expect(hits.length).toBe(n);
  });

  it('dies to enough hits from behind', () => {
    const { s, run } = setup(new THREE.Vector3(0, 0, 2.5));
    run(5, () => !s.asleep);
    for (let i = 0; i < 10 && s.alive; i++) {
      s.hurt(1, s.pos.clone().sub(new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing)).multiplyScalar(2)));
      run(0.3);
    }
    expect(s.alive).toBe(false);
  });
});

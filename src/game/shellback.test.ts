import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../core/physics';
import type { HitResult } from './enemies';
import { enemyEnv, flatGround, runEnemy } from './enemyTestEnv';
import { swordTarget } from './player';
import { SHELLBACK_CHARGE, SHELLBACK_SKID, Shellback } from './shellback';

beforeAll(async () => {
  await initPhysics();
});

function setup(wren: THREE.Vector3, result?: () => HitResult) {
  const physics = flatGround();
  const s = new Shellback(new THREE.Group(), physics, 0, 0);
  const { env, hits } = enemyEnv(physics, wren, result);
  return { s, hits, run: (sec: number, until?: () => boolean) => runEnemy(s, physics, env, sec, until) };
}

/** Swings at it from `d` m out, `a` radians off its facing, the way Wren's sword picks a part. */
function swingFrom(s: Shellback, a: number, d = 2.4) {
  const from = new THREE.Vector3(s.pos.x + Math.sin(s.facing + a) * d, s.pos.y, s.pos.z + Math.cos(s.facing + a) * d);
  const box = swordTarget(s.hurtboxes(), from, s.pos.clone().sub(from).setY(0).normalize());
  return box ? s.hurt(1, from, box.part) : 'miss';
}

const ahead = (s: Shellback, d: number) => s.pos.clone().add(new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing)).multiplyScalar(d));

describe('Shellback', () => {
  it('the sword bounces off its shell (front and sides); its back feet and tail take hits', () => {
    const { s, run } = setup(new THREE.Vector3(0, 0, 30));
    run(0.1);
    const hp = s.hp;
    expect(swingFrom(s, 0)).toBe('guarded'); // its face is shell, with only the eyes showing
    expect(swingFrom(s, 0.8)).toBe('guarded');
    expect(s.hp).toBe(hp);
    expect(swingFrom(s, 2.0)).toBe('hit'); // a back foot
    expect(swingFrom(s, Math.PI)).toBe('hit'); // the tail
    expect(s.hp).toBe(hp - 2);
  });

  it('tucks in and charges Wren from the front (a light hit)', () => {
    const wren = new THREE.Vector3(0, 0, 5);
    const { hits, run } = setup(wren);
    expect(run(6, () => hits.length > 0)).toBe(true);
    expect(hits[0].attack).toBe(SHELLBACK_CHARGE);
    expect(SHELLBACK_CHARGE.guard).toBe(1);
  });

  it('after a charge it skids and can\'t turn, so Wren can get behind it', () => {
    const wren = new THREE.Vector3(0, 0, 5);
    const { s, hits, run } = setup(wren);
    run(6, () => hits.length > 0);
    run(5, () => s.exposed);
    const yaw = s.facing;
    wren.copy(ahead(s, -2)); // Wren steps round behind it
    run(SHELLBACK_SKID * 0.6);
    expect(s.exposed).toBe(true);
    expect(Math.abs(s.facing - yaw)).toBeLessThan(0.01);
    expect(s.hurt(1, wren)).toBe('hit');
  });

  it('a charge stopped by the shield leaves it dazed for longer', () => {
    const wren = new THREE.Vector3(0, 0, 5);
    const { s, hits, run } = setup(wren, () => 'blocked');
    run(6, () => hits.length > 0);
    wren.set(0, 0, 40); // Wren backs well off so it doesn't charge again
    run(SHELLBACK_SKID + 0.2);
    expect(s.exposed).toBe(true);
  });

  it('turns slowly enough that Wren running a circle round it gets past its shell to its back feet or tail', () => {
    const wren = new THREE.Vector3(0, 0, 3);
    const { s, run } = setup(wren);
    run(0.5);
    let behind = false;
    // Running at full speed (8.5 m/s) on a 3 m circle.
    for (let i = 0; i < 120 && !behind; i++) {
      const a = (i / 60) * (8.5 / 3);
      wren.set(s.pos.x + Math.sin(a) * 3, 0, s.pos.z + Math.cos(a) * 3);
      run(1 / 60);
      // Would her sword reach something softer than the shell from here?
      behind = swordTarget(s.hurtboxes(), wren, s.pos.clone().sub(wren).setY(0).normalize())?.part !== 'shell';
    }
    expect(behind).toBe(true);
  });
});

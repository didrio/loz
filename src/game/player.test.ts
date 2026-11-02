import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import type { Area } from '../world/area';
import { NO_CONTROLS, Player, type PlayerEnv } from './player';

beforeAll(async () => {
  await initPhysics();
});

function setup() {
  const physics = new Physics();
  physics.box(0, -0.5, 0, 30, 0.5, 30);
  physics.refreshQueries();
  const health = { hp: 6, maxHp: 6 };
  const p = new Player(new THREE.Scene(), physics, health);
  p.teleport(0, 0, 0, 0); // facing +z
  const env = {
    area: { waterLevel: null, cut: () => [] } as unknown as Area,
    lockTarget: null, enemies: [], hasSword: true,
    onSwing() {}, onHitEnemy() {}, onCutBush() {}, onJump() {},
  } satisfies PlayerEnv;
  const step = (seconds: number, shield = false, jump = false) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      p.update(1 / 60, { ...NO_CONTROLS, shield, jump: jump && t === 0 }, env);
      physics.step(1 / 60);
    }
  };
  const settle = () => step(0.5);
  return { p, health, settle, step };
}

const front = new THREE.Vector3(0, 0, 3);
const LIGHT = { damage: 1, guard: 1 };
const HEAVY = { damage: 2, guard: 2 };
const CRUSH = { damage: 2, guard: 3 };

describe('Player.receiveHit', () => {
  it('the shield blocks frontal hits, but not unblockable ones', () => {
    const { p, health, step } = setup();
    step(0.5, true);
    expect(p.shielding).toBe(true);
    expect(p.receiveHit(front, HEAVY)).toBe('blocked');
    expect(health.hp).toBe(6);
    expect(p.receiveHit(front, { ...HEAVY, unblockable: true })).toBe('hit');
    expect(health.hp).toBe(4);
  });

  it('does not block hits from behind', () => {
    const { p, health, step } = setup();
    step(0.5, true);
    expect(p.receiveHit(new THREE.Vector3(0, 0, -3), LIGHT)).toBe('hit');
    expect(health.hp).toBe(5);
  });

  it('blocks cost guard slots; one too many breaks the guard (no damage, but no shield for a while)', () => {
    const { p, health, step } = setup();
    step(0.5, true);
    expect(p.receiveHit(front, HEAVY)).toBe('blocked');
    expect(p.guard.slots).toBe(1);
    expect(p.receiveHit(front, HEAVY)).toBe('broken');
    expect(health.hp).toBe(6);
    expect(p.guard.canBlock).toBe(false);
    step(1, true);
    expect(p.shielding).toBe(false); // holding the button does nothing while broken
    step(1.2, true);
    expect(p.shielding).toBe(true);
    expect(p.guard.slots).toBe(3);
  });

  it('a crushing attack is blockable only with a full guard', () => {
    const { p, step } = setup();
    step(0.5, true);
    expect(p.receiveHit(front, CRUSH)).toBe('blocked');
    expect(p.guard.slots).toBe(0);
    step(2.1, false); // lower the shield to recover
    step(0.1, true);
    expect(p.receiveHit(front, LIGHT)).toBe('blocked');
    expect(p.receiveHit(front, CRUSH)).toBe('broken');
  });

  it('is briefly untouchable after a hit', () => {
    const { p, settle } = setup();
    settle();
    expect(p.receiveHit(front, LIGHT)).toBe('hit');
    expect(p.receiveHit(front, LIGHT)).toBe('miss');
  });

  it('ground-only attacks miss in the air and land on the ground', () => {
    const { p, settle } = setup();
    p.teleport(0, 2, 0); // mid-air
    expect(p.grounded).toBe(false);
    expect(p.receiveHit(front, { ...LIGHT, groundOnly: true })).toBe('miss');
    settle();
    expect(p.grounded).toBe(true);
    expect(p.receiveHit(front, { ...LIGHT, groundOnly: true })).toBe('hit');
  });

  it('can jump with the shield up, and keeps blocking in the air', () => {
    const { p, health, step } = setup();
    step(0.5, true);
    step(0.2, true, true); // jump while holding the shield
    expect(p.grounded).toBe(false);
    expect(p.shielding).toBe(true);
    expect(p.receiveHit(front, LIGHT)).toBe('blocked');
    expect(health.hp).toBe(6);
  });

  it('only recovers guard while the shield is lowered', () => {
    const { p, step } = setup();
    step(0.5, true);
    p.receiveHit(front, LIGHT);
    step(5, true);
    expect(p.guard.slots).toBe(2);
    step(2.1, false);
    expect(p.guard.slots).toBe(3);
  });
});

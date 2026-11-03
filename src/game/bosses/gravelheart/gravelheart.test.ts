import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../../core/physics';
import { enemyEnv, flatGround, runEnemy } from '../../enemyTestEnv';
import { Hazards } from '../../hazards';
import { swordTarget } from '../../player';
import { mulberry32 } from '../../../core/math';
import { Gravelheart } from './index';
import { GRIND } from './moves';

beforeAll(async () => {
  await initPhysics();
});

/** Gravelheart on flat ground facing +z, with Wren `dist` m in front of it. */
function setup(dist = 4) {
  const physics = flatGround();
  const scene = new THREE.Scene();
  const player = new THREE.Vector3(0, 0, dist);
  const { env, hits } = enemyEnv(physics, player);
  const hazards = new Hazards(scene);
  const e = { ...env, hazards };
  const b = new Gravelheart(scene, physics, null, 0, 0, 0, 0);
  return { physics, b, env: e, hits, hazards, player };
}

/** Wakes it and runs the intro until it fights. */
function fighting(dist = 4) {
  const s = setup(dist);
  s.b.wake();
  runEnemy(s.b, s.physics, s.env, 6, () => s.b.ready);
  s.b.engage();
  return s;
}

/** A sword swing at it from where Wren stands (the result, or 'miss'). */
function swing(b: Gravelheart, from: THREE.Vector3) {
  const box = swordTarget(b.hurtboxes(), from, b.pos.clone().sub(from).setY(0).normalize());
  return box ? b.hurt(1, from, box.part) : 'miss';
}

describe('Gravelheart', () => {
  it('sleeps until woken, then plays its intro and fights', () => {
    const { b, physics, env } = setup();
    runEnemy(b, physics, env, 2);
    expect(b.state).toBe('dormant');
    expect(b.targetable).toBe(false);
    b.wake();
    expect(runEnemy(b, physics, env, 6, () => b.ready)).toBe(true);
    b.engage();
    expect(b.targetable).toBe(true);
  });

  it('stands on its floor, wherever that is (a dungeon\'s floors stack)', () => {
    const { b } = setup();
    expect(b.pos.y).toBeCloseTo(0, 1);
  });

  it('is solid stone: the sword clanks off it while it stands', () => {
    const { b, physics, env, player } = fighting(3.2);
    runEnemy(b, physics, env, 0.3);
    expect(swing(b, player.clone().setZ(b.pos.z + 3))).toBe('guarded');
    expect(b.hp).toBe(b.maxHp);
  });

  it('hammerfall: a red-eyed, guard-crushing slam with a shockwave, then one plate glows loose', () => {
    const { b, physics, env, hits, hazards } = fighting(3);
    b.forceMove('hammerfall');
    expect(b.move?.timing(b).windup).toBeGreaterThanOrEqual(0.5); // fairness: a readable windup
    runEnemy(b, physics, env, 1.3, () => b.step === 'recover');
    expect(b.step).toBe('recover');
    expect(hits.map((h) => h.attack.guard)).toEqual([3]);
    expect(hazards.active).toBeGreaterThan(0);
    runEnemy(b, physics, env, 0.2);
    expect(b.loose).toBeGreaterThanOrEqual(0);
    // Its chest stays shut to the sword: only the glove helps.
    expect(b.chestOpen).toBe(false);
    expect(swing(b, b.pos.clone().addScaledVector(b.forward, 2.6))).toBe('guarded');
    // It wrenches free; the plate stays loose a moment, then works itself back in.
    runEnemy(b, physics, env, 4, () => !b.move && b.looseT <= 0);
    expect(b.loose).toBe(-1);
    expect(b.platesOn).toBe(3);
  });

  it('the glove tears a loose plate off; with none left it staggers and the chest takes double', () => {
    const { b, physics, env, player } = fighting(5);
    const dir = new THREE.Vector3(0, 0, -1);
    expect(b.tetherAt(player, dir)).toBeNull(); // nothing loose yet
    for (let n = 3; n > 0; n--) {
      b.forceMove('hammerfall');
      runEnemy(b, physics, env, 1.5, () => b.loose >= 0);
      expect(b.loose).toBeGreaterThanOrEqual(0);
      // Thrown off to the side it finds nothing; straight at it, the plate comes off.
      expect(b.tetherAt(player, new THREE.Vector3(1, 0, 0))).toBeNull();
      expect(b.tetherAt(player, dir)).not.toBeNull();
      expect(b.platesOn).toBe(n - 1);
      expect(b.rubble.length).toBe(4 - n);
      runEnemy(b, physics, env, 0.1);
    }
    expect(b.move?.name).toBe('staggered');
    runEnemy(b, physics, env, 0.5, () => b.chestOpen);
    expect(b.chestOpen).toBe(true);
    expect(swing(b, b.pos.clone().addScaledVector(b.forward, 2.6))).toBe('weak');
    expect(b.hp).toBe(b.maxHp - 2);
    // Then it pulls new plates (from rubble here: the test hall has no walls) and gets up.
    runEnemy(b, physics, env, 6, () => !b.move);
    expect(b.platesOn).toBe(3);
    expect(b.rubble.length).toBe(0);
    expect(b.chestOpen).toBe(false);
  });

  it('sweep: blockable and low, so a jump clears it', () => {
    const { b, physics, env, hits } = fighting(3);
    b.forceMove('sweep');
    expect(b.move?.timing(b).windup).toBeGreaterThanOrEqual(0.5);
    runEnemy(b, physics, env, 2, () => b.step === 'recover');
    expect(hits.map((h) => h.attack.guard)).toEqual([2]);
    const j = fighting(3);
    j.player.y = 1.4;
    j.b.forceMove('sweep');
    runEnemy(j.b, j.physics, j.env, 2, () => j.b.step === 'recover');
    expect(j.hits.length).toBe(0);
  });

  it('stone volley: three stones pulled out and thrown in turn, then they lie as rubble', () => {
    const { b, physics, env, hits, hazards } = fighting(8);
    let pulled = 0;
    (b as unknown as { hearth: unknown }).hearth = { take: () => (pulled++, new THREE.Vector3(-8 + pulled, 3, 4)) };
    b.forceMove('volley');
    expect(b.move?.timing(b).windup).toBeGreaterThanOrEqual(0.5);
    runEnemy(b, physics, env, 0.1);
    expect(pulled).toBe(3);
    expect(hazards.active).toBe(3);
    for (let t = 0; t < 4; t += 1 / 60) {
      b.update(1 / 60, env);
      hazards.update(1 / 60, { ...env, onPop: undefined });
      physics.step(1 / 60);
    }
    expect(hits.length).toBe(3);
    expect(hits.every((h) => h.attack.guard === 1)).toBe(true);
    expect(b.rubble.length).toBe(3);
  });

  it('grind: only when Wren hugs its back, and it is a short ring', () => {
    const front = fighting(3);
    expect(GRIND.weight(front.b, 3)).toBe(0);
    const back = fighting(3);
    back.player.set(0, 0, -3);
    back.b.update(1 / 60, back.env);
    expect(GRIND.weight(back.b, 3)).toBeGreaterThan(0);
    back.b.forceMove('grind');
    runEnemy(back.b, back.physics, back.env, 2, () => back.b.step === 'recover');
    expect(back.hazards.active).toBeGreaterThan(0);
  });

  it('rubble crumbles away; the walls and rubble are not a permanent supply', () => {
    const { b, physics, env } = setup(4); // dormant: no volley to pick it up meanwhile
    b.addRubble(new THREE.Vector3(3, 0, 3));
    runEnemy(b, physics, env, 4);
    expect(b.rubble.length).toBe(1);
    runEnemy(b, physics, env, 5);
    expect(b.rubble.length).toBe(0);
  });

  it('stops at the edge of a ledge instead of walking off it', () => {
    const { b, physics, env, player } = fighting(4);
    b.walkable = (x) => x < 1; // a cliff 1 m to its east
    player.set(12, 0, 0);
    runEnemy(b, physics, env, 6);
    expect(b.pos.x).toBeLessThan(1.1);
  });

  it('picks moves from its injected dice, repeatably', () => {
    const run = (seed: number) => {
      const { b, physics, env } = fighting(4);
      b.rng = mulberry32(seed);
      const names: string[] = [];
      for (let t = 0; t < 12; t += 1 / 60) {
        runEnemy(b, physics, env, 1 / 60);
        if (b.move && b.move.name !== names[names.length - 1]) names.push(b.move.name);
      }
      return names;
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3).length).toBeGreaterThan(0);
  });

  it('resets when Wren dies mid-fight: full health, plates on, rubble gone, asleep again', () => {
    const { b, physics, env } = fighting(3);
    b.forceMove('staggered');
    runEnemy(b, physics, env, 1, () => b.chestOpen);
    b.hurt(1, b.pos.clone().addScaledVector(b.forward, 2.6), 'chest');
    b.plates[0] = false;
    b.addRubble(new THREE.Vector3(2, 0, 2));
    b.onPlayerRespawn();
    expect(b.hp).toBe(b.maxHp);
    expect(b.state).toBe('dormant');
    expect(b.chestOpen).toBe(false);
    expect(b.platesOn).toBe(3);
    expect(b.rubble.length).toBe(0);
  });

  it('dies once and settles asleep (the defeat script waits for that)', () => {
    const { b, physics, env } = fighting(3);
    let defeated = 0;
    b.onDefeated = () => defeated++;
    b.forceMove('staggered');
    runEnemy(b, physics, env, 1.5, () => b.chestOpen);
    b.hurt(99, b.pos.clone().addScaledVector(b.forward, 2.6), 'chest');
    expect(defeated).toBe(1);
    expect(b.targetable).toBe(false);
    expect(runEnemy(b, physics, env, 6, () => b.asleep)).toBe(true);
    expect(b.gone).toBe(false); // it stays, asleep in its hall
  });
});

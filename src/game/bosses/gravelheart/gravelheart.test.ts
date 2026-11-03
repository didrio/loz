import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../../../core/physics';
import { enemyEnv, flatGround, runEnemy } from '../../enemyTestEnv';
import { Hazards } from '../../hazards';
import { swordTarget } from '../../player';
import { mulberry32 } from '../../../core/math';
import { Gravelheart } from './index';
import { ATTACKS, DOUBLE_SWEEP, GRIND, ROLL, SWEEP, SWIPE } from './moves';

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

  it('stone volley: five stones pulled out and thrown in turn, then they lie as rubble', () => {
    const { b, physics, env, hits, hazards } = fighting(8);
    let pulled = 0;
    (b as unknown as { hearth: unknown }).hearth = { take: () => (pulled++, new THREE.Vector3(-8 + pulled, 3, 4)) };
    b.forceMove('volley');
    expect(b.move?.timing(b).windup).toBeGreaterThanOrEqual(0.5);
    runEnemy(b, physics, env, 0.1);
    expect(pulled).toBe(5);
    expect(hazards.active).toBe(5);
    for (let t = 0; t < 5; t += 1 / 60) {
      b.update(1 / 60, env);
      hazards.update(1 / 60, { ...env, onPop: undefined });
      physics.step(1 / 60);
    }
    expect(hits.length).toBe(5);
    expect(hits.every((h) => h.attack.guard === 1)).toBe(true);
    expect(b.rubble.length).toBe(5);
  });

  it('swipe: a quick close-range backhand that a jump does not clear; out of reach it misses', () => {
    const near = fighting(2.5);
    expect(SWIPE.weight(near.b, 2.5)).toBeGreaterThan(0);
    expect(SWIPE.weight(near.b, 6)).toBe(0);
    near.b.forceMove('swipe');
    expect(near.b.move?.timing(near.b).windup).toBeGreaterThanOrEqual(0.5);
    runEnemy(near.b, near.physics, near.env, 2, () => near.b.step === 'recover');
    expect(near.hits.map((h) => h.attack)).toEqual([ATTACKS.swipe]);
    const jump = fighting(2.5);
    jump.b.forceMove('swipe');
    runEnemy(jump.b, jump.physics, jump.env, 0.6);
    jump.player.y = 1.4;
    runEnemy(jump.b, jump.physics, jump.env, 2, () => jump.b.step === 'recover');
    expect(jump.hits.length).toBe(1);
    const far = fighting(2.5);
    far.b.forceMove('swipe');
    runEnemy(far.b, far.physics, far.env, 0.5);
    far.player.z = 6; // stepped back
    runEnemy(far.b, far.physics, far.env, 2, () => far.b.step === 'recover');
    expect(far.hits.length).toBe(0);
  });

  it('pulses red while it can be struck (the stagger), and only then', () => {
    const { b, physics, env } = fighting(5);
    const mat = b.rig.flashMats[0];
    runEnemy(b, physics, env, 0.2);
    expect(mat.emissive.r).toBe(0);
    b.forceMove('staggered');
    runEnemy(b, physics, env, 1, () => b.chestOpen);
    const seen: number[] = [];
    for (let i = 0; i < 40; i++) {
      runEnemy(b, physics, env, 0.05);
      seen.push(mat.emissive.r);
    }
    expect(Math.min(...seen)).toBeGreaterThan(0.05);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.2); // it pulses
    expect(mat.emissive.g).toBeLessThan(0.05); // red, not white
    runEnemy(b, physics, env, 6, () => !b.move);
    runEnemy(b, physics, env, 0.1);
    expect(mat.emissive.r).toBe(0);
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

  it('every attack is two whole hearts (four half-hearts), and stone, so the tunic halves it', () => {
    for (const a of Object.values(ATTACKS)) {
      expect(a.damage).toBe(4);
      expect(a.stone).toBe(true);
    }
    const { b, physics, env, hits } = fighting(3);
    b.forceMove('hammerfall');
    runEnemy(b, physics, env, 1.3, () => b.step === 'recover');
    expect(hits[0].attack.damage).toBe(4);
  });

  it('the ground pound ring comes out fast (15 m/s): it reaches 6 m away in under half a second, and it is stone', () => {
    const { b, physics, env, hits, hazards } = fighting(6);
    hits.length = 0;
    b.forceMove('hammerfall');
    runEnemy(b, physics, env, 1.3, () => b.step === 'recover');
    hits.length = 0; // the slam itself missed (6 m away); now the ring
    let t = 0;
    for (; t < 1 && !hits.length; t += 1 / 60) {
      hazards.update(1 / 60, { ...env, onPop: undefined });
      b.update(1 / 60, env);
    }
    expect(hits.length).toBe(1);
    expect(t).toBeLessThan(0.5);
    expect(hits[0].attack.stone).toBe(true);
    expect(hits[0].attack.damage).toBe(4);
  });

  describe('phase 2', () => {
    /** A fake hearth: the ring is a flag; the platform is 40 m square. */
    function withHearth(b: Gravelheart) {
      const log = { raised: 0 };
      (b as unknown as { hearth: unknown }).hearth = {
        raiseRing: () => log.raised++, ringUp: false, center: new THREE.Vector3(0, 0, 0), insideRing: () => true,
        platform: { x0: -20, x1: 20, z0: -20, z1: 20 }, take: () => null,
      };
      return log;
    }
    /** Fighting, with the howl played out: phase 2 proper. */
    function phaseTwo(dist = 6) {
      const s = fighting(dist);
      const log = withHearth(s.b);
      s.b.hp = 21;
      s.b.hurt(2, s.b.pos.clone().addScaledVector(s.b.forward, 2.6), 'chest');
      runEnemy(s.b, s.physics, s.env, 5, () => s.b.phase === 2 && !s.b.move);
      return { ...s, log };
    }

    it('at half health it howls (unhurtable), raises the ring, drops two hearts and loses its plates', () => {
      const s = fighting(6);
      const log = withHearth(s.b);
      const drops: string[] = [];
      const env = { ...s.env, drop: (k: string) => drops.push(k) };
      s.b.pos.x = 18; // out where the tiles will rise
      s.b.hp = 21;
      s.b.hurt(2, s.b.pos.clone().addScaledVector(s.b.forward, 2.6), 'chest');
      expect(s.b.phase).toBe(2);
      runEnemy(s.b, s.physics, env, 0.1);
      expect(s.b.move?.name).toBe('howl');
      expect(s.b.invulnerable).toBe(true);
      expect(s.b.hurt(5, s.player, 'chest')).toBe('ignored');
      runEnemy(s.b, s.physics, env, 4, () => !s.b.move);
      expect(s.b.invulnerable).toBe(false);
      expect(log.raised).toBe(1);
      expect(drops).toEqual(['heart', 'heart']);
      expect(s.b.platesOn).toBe(0);
      expect(s.b.pos.x).toBeLessThanOrEqual(16.01); // not left under a tile
    });

    it('swaps Sweep for the double sweep: two blows, each cost 2, the second one jumpable', () => {
      const { b, physics, env, hits } = phaseTwo(3);
      expect(SWEEP.weight(b, 3)).toBe(0);
      expect(DOUBLE_SWEEP.weight(b, 3)).toBeGreaterThan(0);
      b.forceMove('doubleSweep');
      expect(b.move?.timing(b).windup).toBeGreaterThanOrEqual(0.5);
      hits.length = 0;
      runEnemy(b, physics, env, 3, () => b.step === 'recover');
      expect(hits.map((h) => h.attack.guard)).toEqual([2, 2]);
      const j = phaseTwo(3);
      j.b.forceMove('doubleSweep');
      j.hits.length = 0;
      runEnemy(j.b, j.physics, j.env, 0.8, () => j.b.step === 'active');
      runEnemy(j.b, j.physics, j.env, 0.3);
      expect(j.hits.length).toBe(1);
      j.player.y = 1.4; // up for the second
      runEnemy(j.b, j.physics, j.env, 3, () => j.b.step === 'recover');
      expect(j.hits.length).toBe(1);
    });

    it('Cairn Roll: a full second of tell, then it rolls at Wren; a sidestep makes it miss', () => {
      const { b, physics, env, hits, player } = phaseTwo(6);
      expect(ROLL.weight(b, 8)).toBeGreaterThan(0);
      b.forceMove('cairnRoll');
      expect(b.move?.timing(b).windup).toBeGreaterThanOrEqual(1);
      hits.length = 0;
      runEnemy(b, physics, env, 2, () => b.step === 'active');
      player.x = 4; // a sidestep once it commits
      runEnemy(b, physics, env, 1.2);
      expect(hits.length).toBe(0);
      const s = phaseTwo(6);
      s.b.forceMove('cairnRoll');
      s.hits.length = 0;
      runEnemy(s.b, s.physics, s.env, 2.5, () => s.hits.length > 0);
      expect(s.hits.map((h) => h.attack)).toEqual([ATTACKS.roll]);
    });

    it('hitting the wall daze it: the keystone glows, the glove pulls it, it kneels and the ember takes double', () => {
      const { b, physics, env, player } = phaseTwo(6);
      const back = b.pos.clone().addScaledVector(b.forward, -6);
      expect(b.tetherAt(back, b.forward.clone())).toBeNull(); // nothing loose yet
      b.walkable = (_x, z) => z < 12; // a wall 12 m out
      b.forceMove('cairnRoll');
      player.set(0, 0, 10); // it rolls toward her, into the wall behind her
      expect(runEnemy(b, physics, env, 4, () => b.keyT > 0)).toBe(true);
      expect(b.step).toBe('recover');
      expect(b.pos.z).toBeGreaterThan(8);
      // Thrown from behind it, the glove finds the keystone (from the front or the side it doesn't).
      const from = b.pos.clone().addScaledVector(b.forward, -6);
      expect(b.tetherAt(b.pos.clone().addScaledVector(b.forward, 6), b.forward.clone().negate())).toBeNull();
      expect(b.tetherAt(from, b.forward.clone())).not.toBeNull();
      expect(b.move?.name).toBe('kneel');
      expect(b.keyT).toBe(0);
      runEnemy(b, physics, env, 1, () => b.chestOpen);
      expect(b.chestOpen).toBe(true);
      runEnemy(b, physics, env, 0.8); // the pose settles
      const hp = b.hp;
      expect(swing(b, b.pos.clone().addScaledVector(b.forward, 2.6))).toBe('weak');
      expect(b.hp).toBe(hp - 2);
      runEnemy(b, physics, env, 6, () => !b.move);
      expect(b.chestOpen).toBe(false);
    });

    it('a roll that runs into something solid (a pillar, Wren herself) is a wall hit too', () => {
      const { b, physics, env, player } = phaseTwo(6);
      physics.box(0, 2, 9, 10, 2, 0.5); // a wall of stone across its path (no walkable rule here)
      physics.refreshQueries();
      player.set(0, 0, 14);
      b.forceMove('cairnRoll');
      expect(runEnemy(b, physics, env, 5, () => b.keyT > 0)).toBe(true);
      expect(b.pos.z).toBeLessThan(8);
    });

    it('a roll that finds no wall is not dazed; the daze runs out and the keystone dims', () => {
      const { b, physics, env, player } = phaseTwo(6);
      player.set(0, 0, 10);
      b.forceMove('cairnRoll');
      runEnemy(b, physics, env, 6, () => !b.move);
      expect(b.keyT).toBe(0);
      b.walkable = (_x, z) => z < 12;
      b.forceMove('cairnRoll');
      runEnemy(b, physics, env, 4, () => b.keyT > 0);
      runEnemy(b, physics, env, 4, () => !b.move);
      expect(b.keyT).toBe(0);
      expect(b.tetherAt(b.pos.clone().addScaledVector(b.forward, -6), b.forward.clone())).toBeNull();
    });
  });
});

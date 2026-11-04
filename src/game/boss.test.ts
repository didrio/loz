import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Sfx } from '../core/audio';
import { mulberry32 } from '../core/math';
import { initPhysics, Physics } from '../core/physics';
import type { Particles } from '../render/particles';
import { AreaBuilder } from '../world/area';
import { BossArena } from '../world/objects';
import { Boss, type Move } from './boss';
import { HollowLamplighter } from './bosses/lamplighter';
import { swordTarget } from './player';
import type { Attack, Enemy, EnemyEnv } from './enemies';
import { Hazards } from './hazards';

beforeAll(async () => {
  await initPhysics();
});

const noop = () => {};

/** A flat arena and an env that records what the boss does to the player. */
function setup(playerAt = new THREE.Vector3(0, 0, 4)) {
  const physics = new Physics();
  physics.box(0, -0.5, 0, 60, 0.5, 60);
  physics.refreshQueries();
  const scene = new THREE.Scene();
  const hits: Attack[] = [];
  const spawned: Enemy[] = [];
  const hazards = new Hazards(scene);
  const env: EnemyEnv = {
    playerPos: playerAt,
    playerAlive: true,
    night: true, // the Lamplighter only fights at night (the dawn burn tests turn this off)
    physics,
    hazards,
    sfx: new Proxy({}, { get: () => noop }) as Sfx,
    particles: { burst: noop } as unknown as Particles,
    hitPlayer: (_from, attack) => (hits.push(attack), 'hit'),
    pushPlayer: noop,
    spawn: (e) => spawned.push(e),
    drop: noop,
    shake: noop,
  };
  return { physics, scene, env, hits, spawned, hazards };
}

/** Runs the boss (and its minions) like the game loop does. */
function run(b: Enemy, env: EnemyEnv, physics: Physics, seconds: number, extra: Enemy[] = []) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    b.update(dt, env);
    for (const e of extra) e.update(dt, env);
    physics.step(dt);
  }
}

function lamplighter(physics: Physics, scene: THREE.Scene, arena: BossArena | null = null) {
  // Faces +z, toward a player standing at z = 4.
  return new HollowLamplighter(scene, physics, arena, 0, 0, 0);
}

describe('Boss framework (via the Hollow Lamplighter)', () => {
  it('ignores the sword until the fight starts', () => {
    const { physics, scene } = setup();
    const b = lamplighter(physics, scene);
    expect(b.hurt(5, new THREE.Vector3(0, 0, 3))).toBe('ignored');
    expect(b.hp).toBe(b.maxHp);
  });

  it('plays its intro, then fights', () => {
    const { physics, scene, env } = setup();
    const b = lamplighter(physics, scene);
    b.wake();
    run(b, env, physics, 5);
    expect(b.ready).toBe(true);
    b.engage();
    expect(b.engaged).toBe(true);
  });

  it('its pole parries a swing that meets it while stalking; one that gets past it, or a head hit, lands', () => {
    const { physics, scene, env } = setup();
    const b = lamplighter(physics, scene);
    b.engage();
    run(b, env, physics, 0.1);
    expect(b.move).toBeNull();
    /** Swings at it from 3 m out, `deg` degrees off its facing, the way Wren's sword picks a part. */
    const swingFrom = (deg: number) => {
      const a = (deg * Math.PI) / 180 + Math.atan2(b.forward.x, b.forward.z);
      const from = new THREE.Vector3(b.pos.x + Math.sin(a) * 3, b.pos.y, b.pos.z + Math.cos(a) * 3);
      const box = swordTarget(b.hurtboxes(), from, b.pos.clone().sub(from).setY(0).normalize());
      return box ? b.hurt(1, from, box.part) : 'miss';
    };
    expect(swingFrom(0)).toBe('guarded'); // straight into the pole held out in front
    expect(swingFrom(-40)).toBe('guarded'); // the pole side
    expect(b.hp).toBe(b.maxHp);
    expect(swingFrom(60)).toBe('hit'); // round the pole (the old ±78° guard turned this)
    expect(swingFrom(180)).toBe('hit');
    expect(b.hp).toBe(b.maxHp - 2);
    b.hp = b.maxHp - 1;
    expect(b.hurt(1, new THREE.Vector3(0, 0, 3), 'head')).toBe('weak');
    expect(b.hp).toBe(b.maxHp - 3);
  });

  it('attacks a player who stands in reach', () => {
    const { physics, scene, env, hits } = setup();
    const b = lamplighter(physics, scene);
    b.engage();
    run(b, env, physics, 20);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('slam: sends a shockwave you must jump, and brings its head into reach', () => {
    const { physics, scene, env, hazards } = setup();
    const b = lamplighter(physics, scene);
    b.engage();
    run(b, env, physics, 0.1);
    b.forceMove('slam');
    const headY = () => b.hurtboxes().find((h) => h.part === 'head')!.center.y - b.pos.y;
    const standing = headY();
    for (let i = 0; i < 400 && !(b.move?.name === 'slam' && b.step === 'recover' && b.stepProgress > 0.4); i++) run(b, env, physics, 1 / 60);
    expect(hazards.active).toBeGreaterThan(0);
    // The sword reaches about 2.5 m up; the head hurtbox (radius 0.55) must come within that.
    expect(standing - 0.55).toBeGreaterThan(2.5);
    expect(headY() - 0.55).toBeLessThan(2.5);
  });

  it('its hazards end with it: no shock wave or orb survives its death', () => {
    const { physics, scene, env, hazards } = setup();
    const b = lamplighter(physics, scene);
    b.engage();
    run(b, env, physics, 0.1);
    hazards.shockwave(b.pos.clone(), {});
    hazards.orb(b.pos.clone().setY(1), new THREE.Vector3(0, 0, 1), {});
    expect(hazards.active).toBeGreaterThan(0);
    b.hurt(b.maxHp * 10, new THREE.Vector3(0, 0, -3), 'body');
    expect(b.alive).toBe(false);
    expect(hazards.active).toBe(0);
  });

  it('howls at half health: invulnerable meanwhile, then frees three wisps and turns phase two', () => {
    const { physics, scene, env, spawned } = setup();
    const b = lamplighter(physics, scene);
    b.engage();
    run(b, env, physics, 0.1);
    b.hurt(b.maxHp / 2, new THREE.Vector3(0, 0, -3), 'body');
    run(b, env, physics, 0.2);
    expect(b.move?.name).toBe('howl');
    expect(b.hurt(5, new THREE.Vector3(0, 0, -3))).toBe('ignored');
    run(b, env, physics, 3);
    expect(b.phase).toBe(2);
    expect(spawned.length).toBe(3);
    expect(b.invulnerable).toBe(false);
  });

  it('skitter crushes a whole guard (costs all three slots)', () => {
    const { physics, scene, env, hits } = setup(new THREE.Vector3(0, 0, 9));
    const b = lamplighter(physics, scene);
    b.engage();
    run(b, env, physics, 0.1);
    expect(b.forceMove('skitter')).toBe(true);
    run(b, env, physics, 2.5);
    expect(hits.some((h) => h.guard === 3 && h.damage === 2)).toBe(true);
  });

  it('declares a guard cost on every attack it lands', () => {
    const { physics, scene, env, hits } = setup();
    const b = lamplighter(physics, scene);
    b.engage();
    run(b, env, physics, 20);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.guard).toBeGreaterThanOrEqual(1);
      expect(h.guard).toBeLessThanOrEqual(3);
    }
  });

  it('dies once: calls onDefeated, shatters its cage and is removed', () => {
    const { physics, scene, env } = setup();
    const b = lamplighter(physics, scene);
    let defeated = 0;
    b.onDefeated = () => defeated++;
    b.engage();
    run(b, env, physics, 0.1);
    b.hp = 1;
    expect(b.hurt(1, new THREE.Vector3(0, 0, -3))).toBe('hit');
    expect(b.alive).toBe(false);
    expect(b.hurt(1, new THREE.Vector3(0, 0, -3))).toBe('ignored');
    run(b, env, physics, 7);
    expect(defeated).toBe(1);
    expect(b.shattered).toBe(true);
    expect(b.gone).toBe(true);
  });

  it('resets the encounter when the player dies mid-fight', () => {
    const { physics, scene, env } = setup();
    const arena = new BossArena(new AreaBuilder(physics, mulberry32(1)), 0, 0, 0, 15, []);
    const b = lamplighter(physics, scene, arena);
    arena.seal();
    b.engage();
    run(b, env, physics, 0.1);
    b.hurt(20, new THREE.Vector3(0, 0, -3));
    run(b, env, physics, 1);
    b.onPlayerRespawn();
    expect(b.hp).toBe(b.maxHp);
    expect(b.phase).toBe(1);
    expect(b.state).toBe('dormant');
    expect(arena.sealed).toBe(false);
    expect(arena.armed).toBe(true);
  });
});

/** The smallest possible boss: one move, to test the move system in isolation. */
class Dummy extends Boss {
  readonly title = 'Dummy';
  readonly epithet = '';
  protected readonly introDuration = 0;
  protected readonly dyingDuration = 0;
  readonly log: string[] = [];
  private readonly poke: Move<Dummy> = {
    name: 'poke',
    timing: () => ({ windup: 0.2, active: 0.1, recover: 0.2 }),
    weight: () => 1,
    enter: (b, step) => b.log.push(step),
  };
  constructor(physics: Physics, scene: THREE.Scene) {
    super(scene, physics, null, { x: 0, z: 0, yaw: 0, hp: 10, radius: 0.5, halfHeight: 0.5 });
  }
  protected moves(): Move<this>[] {
    return [this.poke] as Move<this>[];
  }
  protected animate() {}
  protected decideDelay() {
    return 0.1;
  }
}

describe('The Lamplighter at dawn', () => {
  it('burns in a fight that runs past dawn: phase two as usual, dead in about a minute', () => {
    const { physics, scene, env } = setup(new THREE.Vector3(0, 0, 40)); // out of its reach
    const b = lamplighter(physics, scene);
    let defeated = 0;
    b.onDefeated = () => defeated++;
    b.engage();
    run(b, env, physics, 10);
    expect(b.hp).toBe(b.maxHp); // no burn at night
    env.night = false;
    run(b, env, physics, 20);
    expect(b.hp).toBeLessThan(b.maxHp * 0.75);
    expect(b.hp).toBeGreaterThan(b.maxHp * 0.5);
    run(b, env, physics, 40);
    expect(b.phase).toBe(2);
    expect(b.alive).toBe(true); // the howl held the burn off for a moment
    run(b, env, physics, 15);
    expect(b.alive).toBe(false);
    run(b, env, physics, 8);
    expect(defeated).toBe(1);
  });

  it('only burns while fighting: dormant in daylight it gutters out instead', () => {
    const { physics, scene, env } = setup();
    env.night = false;
    const b = lamplighter(physics, scene);
    run(b, env, physics, 5);
    expect(b.hp).toBe(b.maxHp);
    expect(b.vanished).toBe(false);
    b.vanish();
    run(b, env, physics, 2);
    expect(b.vanished).toBe(true);
  });
});

describe('Boss move system', () => {
  it('runs windup → active → recover, and keeps going with its only move', () => {
    const { physics, scene, env } = setup();
    const d = new Dummy(physics, scene);
    d.engage();
    run(d, env, physics, 4);
    expect(d.log.slice(0, 3)).toEqual(['windup', 'active', 'recover']);
    expect(d.log.filter((s) => s === 'windup').length).toBeGreaterThan(3);
  });
});

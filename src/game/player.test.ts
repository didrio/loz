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
  const frame = (move: THREE.Vector3, jump: boolean) => {
    p.update(1 / 60, { ...NO_CONTROLS, move, jump }, env);
    physics.step(1 / 60);
  };
  /** Runs forward (+z) for `seconds`, optionally pressing jump on the first frame; returns the distance covered. */
  const run = (seconds: number, jump = false) => {
    const z = p.pos.z;
    for (let t = 0; t < seconds; t += 1 / 60) {
      p.update(1 / 60, { ...NO_CONTROLS, move: new THREE.Vector3(0, 0, 1), jump: jump && t === 0 }, env);
      physics.step(1 / 60);
    }
    return p.pos.z - z;
  };
  return { p, health, env, settle, step, run, frame };
}

const front = new THREE.Vector3(0, 0, 3);
const LIGHT = { damage: 1, guard: 1 };
const HEAVY = { damage: 2, guard: 2 };
const CRUSH = { damage: 2, guard: 3 };

describe('Player.receiveHit', () => {
  it('does nothing while invincible (dev menu)', () => {
    const { p, health, settle } = setup();
    settle();
    (health as { invincible?: boolean }).invincible = true;
    expect(p.receiveHit(front, HEAVY)).toBe('miss');
    expect(health.hp).toBe(6);
    (health as { invincible?: boolean }).invincible = false;
    expect(p.receiveHit(front, HEAVY)).toBe('hit');
    expect(health.hp).toBe(4);
  });

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

  it('the Stoneward Tunic halves stone hits (rounded up) and nothing else', () => {
    const { p, health, step } = setup();
    step(0.5);
    p.setStoneward(true);
    // Hits are spaced past the 1.2 s invulnerability, with health topped up between them.
    const again = () => { step(1.3); health.hp = 6; };
    expect(p.receiveHit(front, { ...HEAVY, stone: true })).toBe('hit');
    expect(health.hp).toBe(5);
    again();
    expect(p.receiveHit(front, { damage: 1, guard: 1, stone: true })).toBe('hit');
    expect(health.hp).toBe(5); // 1 rounds up to 1
    again();
    expect(p.receiveHit(front, HEAVY)).toBe('hit');
    expect(health.hp).toBe(4); // not stone: full damage
    again();
    p.setStoneward(false);
    expect(p.receiveHit(front, { ...HEAVY, stone: true })).toBe('hit');
    expect(health.hp).toBe(4);
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

  it('coyote time: a jump just after running off a ledge works, a late one does not', () => {
    for (const [late, jumps] of [[4, true], [12, false]] as const) {
      const { p, frame, settle } = setup();
      p.teleport(0, 0, 29.5, 0);
      settle();
      let off = -1, rose = false;
      for (let f = 0; f < 40; f++) {
        if (off < 0 && !p.grounded) off = f;
        const y = p.pos.y;
        frame(new THREE.Vector3(0, 0, 1), off >= 0 && f === off + late);
        if (f === off + late) rose = p.pos.y > y;
      }
      expect(off).toBeGreaterThan(0);
      expect(rose).toBe(jumps);
    }
  });

  it('coyote time does not give a second jump in the air', () => {
    const { p, step, frame } = setup();
    step(0.5);
    frame(NO_CONTROLS.move, true);
    for (let i = 0; i < 30; i++) frame(NO_CONTROLS.move, false); // past the apex, falling
    const before = p.pos.y;
    frame(NO_CONTROLS.move, true);
    frame(NO_CONTROLS.move, false);
    expect(p.pos.y).toBeLessThan(before); // a second jump would have launched upward again
  });

  it('jump buffer: a press just before landing jumps on landing', () => {
    const { p, step, frame } = setup();
    step(0.5);
    frame(NO_CONTROLS.move, true);
    let pressed = false, y2 = 0;
    for (let f = 0; f < 120; f++) {
      const falling = f > 20 && !pressed && p.pos.y < 0.6 && !p.grounded;
      frame(NO_CONTROLS.move, falling);
      if (falling) pressed = true;
      if (pressed && p.grounded) break;
    }
    expect(pressed).toBe(true);
    for (let i = 0; i < 6; i++) frame(NO_CONTROLS.move, false);
    y2 = p.pos.y;
    expect(y2).toBeGreaterThan(0.1); // airborne again instead of standing
  });

  it('an Ember Tonic doubles the sword\'s damage while it lasts', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 30, 0.5, 30);
    physics.refreshQueries();
    const p = new Player(new THREE.Scene(), physics, { hp: 6, maxHp: 6 });
    p.teleport(0, 0, 0, 0); // facing +z
    const dealt: number[] = [];
    const target = {
      alive: true, pos: new THREE.Vector3(0, 0, 1.6),
      hurtboxes: () => [{ center: new THREE.Vector3(0, 1, 1.6), radius: 0.6, part: 'body', priority: 0 }],
      hurt: (dmg: number) => (dealt.push(dmg), 'hit'),
    };
    const env = {
      area: { waterLevel: null, cut: () => [] } as unknown as Area,
      lockTarget: null, enemies: [target] as unknown as PlayerEnv['enemies'], hasSword: true,
      onSwing() {}, onHitEnemy() {}, onCutBush() {}, onJump() {},
    } satisfies PlayerEnv;
    const swing = () => {
      p.update(1 / 60, { ...NO_CONTROLS, attack: true }, env);
      for (let t = 0; t < 0.6; t += 1 / 60) p.update(1 / 60, NO_CONTROLS, env);
    };
    swing();
    p.attackBoost = 30;
    swing();
    expect(dealt).toEqual([1, 2]);
  });

  it('the sword bounces off armor (a weapon, a shell) only when it\'s nearer than the body', () => {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 30, 0.5, 30);
    physics.refreshQueries();
    const p = new Player(new THREE.Scene(), physics, { hp: 6, maxHp: 6 });
    p.teleport(0, 0, 0, 0); // facing +z
    const parts: string[] = [];
    let armorAt = new THREE.Vector3();
    const target = {
      alive: true, pos: new THREE.Vector3(0, 0, 2.2),
      hurtboxes: () => [
        { center: new THREE.Vector3(0, 1, 2.2), radius: 0.6, part: 'body', priority: 0 },
        { center: armorAt, radius: 0.3, part: 'maul', priority: 0, armor: true },
      ],
      hurt: (_dmg: number, _from: THREE.Vector3, part: string) => (parts.push(part), part === 'maul' ? 'guarded' : 'hit'),
    };
    const env = {
      area: { waterLevel: null, cut: () => [] } as unknown as Area,
      lockTarget: null, enemies: [target] as unknown as PlayerEnv['enemies'], hasSword: true,
      onSwing() {}, onHitEnemy() {}, onCutBush() {}, onJump() {},
    } satisfies PlayerEnv;
    const swing = () => {
      p.update(1 / 60, { ...NO_CONTROLS, attack: true }, env);
      for (let t = 0; t < 1.2; t += 1 / 60) p.update(1 / 60, NO_CONTROLS, env);
    };
    armorAt = new THREE.Vector3(0, 1, 1.1); // held out between Wren and the body
    swing();
    armorAt = new THREE.Vector3(1.4, 1, 2.4); // off to the side: the body is open
    swing();
    expect(parts).toEqual(['maul', 'body']);
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

  it('a guard break staggers: a crawl (6% of running speed) and no jumping until it wears off', () => {
    const { p, step, run } = setup();
    step(0.5, true);
    expect(p.receiveHit(front, CRUSH)).toBe('blocked');
    expect(p.receiveHit(front, LIGHT)).toBe('broken');
    step(0.5); // let the knockback die down
    const crawl = run(0.5);
    expect(crawl).toBeGreaterThan(0);
    expect(crawl).toBeLessThan(8.5 * 0.5 * 0.08);
    run(0.1, true);
    expect(p.grounded).toBe(true);
    step(1.2); // the break wears off
    expect(p.guard.broken).toBe(0);
    expect(run(0.5)).toBeGreaterThan(8.5 * 0.5 * 0.8);
  });

  it('no sword while the guard is broken (a swing would lunge Wren out of the stagger)', () => {
    const { p, env, step } = setup();
    let swings = 0;
    const counting = { ...env, onSwing: () => swings++ };
    step(0.5, true);
    p.receiveHit(front, CRUSH);
    expect(p.receiveHit(front, LIGHT)).toBe('broken');
    p.update(1 / 60, { ...NO_CONTROLS, attack: true }, counting);
    expect(swings).toBe(0);
    step(2.5); // the break wears off
    p.update(1 / 60, { ...NO_CONTROLS, attack: true }, counting);
    expect(swings).toBe(1);
  });
});

describe('Player dev sprint', () => {
  it('devSpeed 5 covers about five times the ground (dev builds only, toggled with G)', () => {
    const a = setup();
    a.settle();
    const normal = a.run(0.5);
    const b = setup();
    b.settle();
    b.p.devSpeed = 5;
    const fast = b.run(0.5);
    expect(fast / normal).toBeGreaterThan(4);
  });
});

describe('Player on a moving platform', () => {
  /** Wren stands on a kinematic slab (top at y = 1) that `path(t)` moves each frame; returns per-frame stats. */
  function ride(path: (t: number) => THREE.Vector3, seconds: number, startX = 0, gameOrder = false, hz = 60, move = new THREE.Vector3()) {
    const physics = new Physics();
    physics.box(0, -0.5, 0, 30, 0.5, 30);
    const k = physics.kinematicBox(startX, 0.75, 0, 2, 0.25, 2);
    physics.refreshQueries();
    const p = new Player(new THREE.Scene(), physics, { hp: 6, maxHp: 6 });
    p.teleport(startX, 1, 0, 0);
    const env = {
      area: { waterLevel: null, cut: () => [] } as unknown as Area,
      lockTarget: null, enemies: [], hasSword: true,
      onSwing() {}, onHitEnemy() {}, onCutBush() {}, onJump() {},
    } satisfies PlayerEnv;
    let walking = false;
    const frame = (t: number) => {
      const to = path(t);
      // gameOrder = true is the wrong order (the player before the platform): it exists to show the failure.
      if (gameOrder) p.update(1 / hz, { ...NO_CONTROLS, move: walking ? move : NO_CONTROLS.move }, env);
      k.moveTo(to.x, 0.75 + to.y, to.z);
      if (!gameOrder) p.update(1 / hz, { ...NO_CONTROLS, move: walking ? move : NO_CONTROLS.move }, env);
      physics.step(1 / hz);
    };
    for (let i = 0; i < hz / 2; i++) frame(0); // settle
    walking = true;
    const ys: number[] = [];
    const grounded: boolean[] = [];
    for (let i = 1; i <= seconds * hz; i++) {
      frame(i / hz);
      ys.push(p.pos.y - k.pos.y);
      grounded.push(p.grounded);
    }
    return { p, k, ys, grounded, frame };
  }

  it('rides a horizontal mover, grounded every frame and without bobbing', () => {
    const { p, k, ys, grounded } = ride((t) => new THREE.Vector3(2 * t, 0, 0), 3);
    expect(grounded.every(Boolean)).toBe(true);
    expect(Math.abs(p.pos.x - k.pos.x)).toBeLessThan(0.1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.03);
  });

  it('rides a platform rising and falling', () => {
    const { p, k, ys, grounded } = ride((t) => new THREE.Vector3(0, 1.5 * (1 - Math.cos(t * 2)), 0), 4);
    expect(grounded.every(Boolean)).toBe(true);
    // She stays within a few cm of the top while it rises and falls at up to 3 m/s.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.1);
    expect(Math.min(...ys)).toBeGreaterThan(0.25 - 0.1);
    expect(Math.abs(p.pos.x - k.pos.x)).toBeLessThan(0.01);
  });

  // Game.frame calls Area.movePlatforms before the player updates. With the player first the
  // carry is always zero (step clears it) and Wren sinks through a rising platform; that order fails this.
  it.each([60, 120, 144])('rides a slow rising and falling platform (moved before the player, as in the game) at %i Hz', (hz) => {
    const { ys, grounded } = ride((t) => new THREE.Vector3(0, 1.5 * (1 - Math.cos(t * 1.05)), 0), 6, 0, false, hz);
    expect(grounded.every(Boolean)).toBe(true);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.1);
    expect(Math.min(...ys)).toBeGreaterThan(0.15);
  });

  // A kinematic Rapier body under Wren froze her horizontal movement (even when it didn't move);
  // platforms are fixed bodies we teleport instead (core/physics.ts kinematicBox).
  it('control: walking on a platform that stays put', () => {
    const { p, k } = ride(() => new THREE.Vector3(), 0.2, 0, false, 60, new THREE.Vector3(1, 0, 0));
    expect(p.pos.x - k.pos.x).toBeGreaterThan(0.3);
  });

  it.each([['across', new THREE.Vector3(1, 0, 0)], ['with', new THREE.Vector3(0, 0, 1)], ['against', new THREE.Vector3(0, 0, -1)]] as const)(
    'can walk %s the way a sliding platform moves (it carries her, her walking still counts)', (_, dir) => {
      const { p, k } = ride((t) => new THREE.Vector3(0, 0, 1 - Math.cos(t * 1.5)), 0.2, 0, false, 60, dir);
      // 0.2 s at 8.5 m/s is ~1.7 m of walking on top of whatever the platform carried her.
      const rel = new THREE.Vector3(p.pos.x - k.pos.x, 0, p.pos.z - k.pos.z);
      expect(rel.dot(dir)).toBeGreaterThan(0.3);
    });

  it('does not carry Wren when she stands beside the platform', () => {
    const r = ride((t) => new THREE.Vector3(-3 * t, 0.5 * Math.sin(t * 3), 0), 0.1);
    r.p.teleport(10, 0, 0, 0);
    for (let i = 0; i < 60; i++) r.frame(2 + i / 60);
    expect(r.p.pos.x).toBeCloseTo(10, 2);
    expect(r.p.pos.y).toBeCloseTo(0, 1);
  });
});

describe('Edge stickiness (trial rooms)', () => {
  /** Wren on a 4 m slab (top y = 1) with a drop beyond it; walks +x from the middle, jumping on `jumpAt` seconds if given. */
  function walkOff(edgeAssist: boolean, jumpAt?: number) {
    const physics = new Physics();
    physics.box(0, -5.5, 0, 30, 0.5, 30);
    physics.box(0, 0.5, 0, 2, 0.5, 2);
    physics.refreshQueries();
    const p = new Player(new THREE.Scene(), physics, { hp: 6, maxHp: 6 });
    p.edgeAssist = edgeAssist;
    p.teleport(0, 1, 0, 0);
    const env = {
      area: { waterLevel: null, cut: () => [] } as unknown as Area,
      lockTarget: null, enemies: [], hasSword: true,
      onSwing() {}, onHitEnemy() {}, onCutBush() {}, onJump() {},
    } satisfies PlayerEnv;
    let t = 0, held = 0, leftAt = -1, maxX = 0, rose = false;
    for (let i = 0; i < 120; i++) {
      t = i / 60;
      const jump = jumpAt !== undefined && Math.abs(t - jumpAt) < 1 / 120;
      p.update(1 / 60, { ...NO_CONTROLS, move: new THREE.Vector3(1, 0, 0), jump }, env);
      physics.step(1 / 60);
      if (p.pos.x > 1.7 && p.grounded && p.pos.y > 0.9) held++;
      if (leftAt < 0 && !p.grounded && p.pos.y < 0.95 && p.pos.x > 1.5) leftAt = t;
      if (p.pos.y > 1.5) rose = true;
      if (maxX === 0 && p.pos.y < 0.9 && p.pos.x > 1.5 && (jumpAt === undefined || rose)) maxX = p.pos.x; // where she comes back down past the slab's height
    }
    return { held: held / 60, leftAt, maxX, p };
  }

  it('without it Wren runs straight off a ledge', () => {
    expect(walkOff(false).held).toBeLessThan(0.1);
  });

  it('with it she stops at the lip for a moment, then walks off if she keeps pushing', () => {
    const r = walkOff(true);
    expect(r.held).toBeGreaterThan(0.03);
    expect(r.held).toBeLessThan(0.2);
    expect(r.leftAt).toBeGreaterThan(0);
  });

  it('a jump pressed during the hold still launches at full run speed (the hold never costs speed)', () => {
    const jumped = walkOff(true, 0.3);
    const plain = walkOff(false, 0.3);
    // Same jump, same input: the distance she clears must match the no-assist jump from nearly the same lip.
    expect(jumped.maxX).toBeGreaterThan(plain.maxX - 1.2);
    expect(jumped.maxX).toBeGreaterThan(4);
  });
});

describe('Player.setOpacity', () => {
  it('fades Wren without fading the shared materials other things use', async () => {
    const { mat } = await import('../render/materials');
    const physics = new Physics();
    const p = new Player(new THREE.Scene(), physics, { hp: 6, maxHp: 6 });
    p.setOpacity(0.4);
    expect(mat(0xb4532a).opacity).toBe(1); // her coat color, shared
    const faded: number[] = [];
    p['h'].root.traverse((o) => { if (o instanceof THREE.Mesh) faded.push((o.material as THREE.Material).opacity); });
    expect(faded.filter((o) => o === 0.4).length).toBeGreaterThan(5);
  });
});

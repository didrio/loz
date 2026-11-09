import * as THREE from 'three';
import { Layer } from '../../../core/physics';
import type { Move } from '../../boss';
import type { Attack, EnemyEnv } from '../../enemies';
import type { Gravelheart } from './index';
import { pal } from '../../../render/palette';

/**
 * The attack sheet: damage in half-hearts (owner's call, 2026-11-03: every hit is two whole hearts,
 * one with the Stoneward Tunic), and guard = how many of the shield's three
 * slots a block knocks down (docs/shrine.md, "The boss").
 */
export const ATTACKS = {
  /** Red eyes: crushes a whole guard. Block it with all three slots up, or get out from under it. */
  hammerfall: { damage: 4, guard: 3, knockback: 14, stone: true },
  /** One arm sweeps low across the front: block it (cost 2) or jump. */
  sweep: { damage: 4, guard: 2, knockback: 10, stone: true },
  /** A thrown wakestone: light, blockable, sidestep it or catch it with the glove. */
  stone: { damage: 4, guard: 1, knockback: 8, stone: true },
  /** The waist-turn behind it: close range. */
  grind: { damage: 4, guard: 2, knockback: 11, stone: true },
  /** A quick swipe at close range: blockable, can't be jumped, only reaches what is in front of it. */
  swipe: { damage: 4, guard: 2, knockback: 11, stone: true },
  /** Phase two: the boulder rolling over Wren. */
  roll: { damage: 4, guard: 3, knockback: 14, stone: true },
} satisfies Record<string, Attack>;

type G = Gravelheart;

/**
 * A move whose look the rig plays (render/models/gravelheart.ts `MOVES`): each frame its `update` runs, the rig is told
 * which step it is in and how far (a step can advance in the same frame, before the rig poses it).
 */
function posed(m: Move<G>): Move<G> {
  return {
    ...m,
    update(b, step, t, env, dt) {
      b.poseMove = { name: m.name, step, t, stepT: b.stepT };
      m.update?.(b, step, t, env, dt);
    },
  };
}

/** Where its fists come down: on the floor about 2.6 m in front. */
export function slamPoint(b: G, env: EnemyEnv) {
  const at = b.pos.clone().addScaledVector(b.forward, 2.6);
  at.y = env.physics.groundY(at.x, at.z, b.pos.y + 3, Layer.World) ?? b.pos.y;
  return at;
}

/**
 * Hammerfall, its main opening: both fists rise overhead (eyes red), then come down. A
 * direct hit crushes a guard; the slam sends a shockwave ring (jump it). The fists stick in
 * the floor and it's bent over, and one chest plate glows loose: tether it off. (The sword
 * can't reach the chest yet: that takes all three plates gone.)
 */
export const HAMMERFALL: Move<G> = posed({
  name: 'hammerfall',
  cooldown: 2,
  timing: (b) => ({ windup: b.phase === 1 ? 0.9 : 0.7, active: 0.18, recover: 1.5 }),
  weight: (_b, d) => (d < 5.5 ? 3 : d < 9 ? 1 : 0),
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 1.6;
      env.sfx.inhale();
    } else if (step === 'active') {
      b.turnRate = 0;
    } else {
      const at = slamPoint(b, env);
      if (env.playerPos.distanceTo(at) < 2.4 && env.playerPos.y - at.y < 1.2) env.hitPlayer(at, ATTACKS.hammerfall);
      env.hazards.shockwave(at, { speed: 15, maxRadius: 16, damage: 4, stone: true });
      env.particles.fx('smoke', at.clone().setY(at.y + 0.3), { color: pal('stone', 1), count: 22, speed: 6, life: 0.9, gravity: true });
      env.particles.fx('embers', at.clone().setY(at.y + 0.2), { color: pal('ember', 2), count: 10, speed: 4, life: 0.5, gravity: true });
      env.shake(0.9);
      env.sfx.boom();
    }
  },
  update(b, step) {
    // Stuck (the rig: fists in the floor, bent over, chest low): one plate works loose.
    if (step === 'recover' && b.phase === 1 && !b.scratch.loosened) {
      b.scratch.loosened = true;
      b.loosenPlate();
    }
  },
});

/** Is Wren behind it (the greed punish below)? */
function behind(b: G) {
  return b.forward.dot(b.toPlayer) < -0.2;
}

/** One low arm sweep from where it stands: hits what is in front of it, within reach, on the ground. */
function sweepHit(b: G, env: EnemyEnv) {
  const rel = env.playerPos.clone().sub(b.pos).setY(0);
  if (rel.length() < 4.4 && b.forward.dot(rel.normalize()) > 0.2 && env.playerPos.y - b.pos.y < 0.9) env.hitPlayer(b.pos, ATTACKS.sweep);
  env.shake(0.4);
  env.sfx.boom();
}

/**
 * Sweep: it rears one arm back and swings it low across the front. Blockable (cost 2), or
 * jump it. Only reaches what is in front of it.
 */
export const SWEEP: Move<G> = posed({
  name: 'sweep',
  cooldown: 1.5,
  timing: (b) => ({ windup: b.phase === 1 ? 0.85 : 0.65, active: 0.25, recover: 0.9 }),
  weight: (b, d) => (b.phase === 1 && d < 4.8 && !behind(b) ? 3 : 0),
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 1.4;
      env.sfx.inhale();
    } else if (step === 'active') {
      b.turnRate = 0;
      sweepHit(b, env);
    }
  },
});

/**
 * Double sweep (phase two's Sweep): the same low swing, then back again 0.75 s later. Each
 * costs 2 guard slots, so blocking both breaks a full guard: block the first, jump the second.
 */
export const DOUBLE_SWEEP: Move<G> = posed({
  name: 'doubleSweep',
  cooldown: 1.5,
  timing: () => ({ windup: 0.65, active: 1.05, recover: 0.9 }),
  weight: (b, d) => (b.phase >= 2 && d < 4.8 && !behind(b) ? 3 : 0),
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 1.5;
      env.sfx.inhale();
    } else if (step === 'active') {
      b.turnRate = 0;
      sweepHit(b, env);
      b.later(0.75, () => {
        if (b.move === DOUBLE_SWEEP && b.step === 'active') sweepHit(b, env);
      });
    }
  },
});

/**
 * Swipe (the close-range punish for crowding it): a quick backhand across its front, high, so
 * a jump doesn't clear it. Blockable (cost 2); stepping back out of its 3.8 m reach avoids it.
 */
export const SWIPE: Move<G> = posed({
  name: 'swipe',
  cooldown: 2.5,
  timing: (b) => ({ windup: b.phase === 1 ? 0.6 : 0.5, active: 0.2, recover: 0.8 }),
  weight: (_b, d) => (d < 3.8 ? 4 : 0),
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 2.2;
      env.sfx.inhale();
    } else if (step === 'active') {
      b.turnRate = 0;
      const rel = env.playerPos.clone().sub(b.pos).setY(0);
      if (rel.length() < 3.8 && b.forward.dot(rel.normalize()) > 0.3 && Math.abs(env.playerPos.y - b.pos.y) < 2) env.hitPlayer(b.pos, ATTACKS.swipe);
      env.shake(0.4);
      env.sfx.boom();
    }
  },
});

/** Wakestones in a volley (owner's call: three were too easy to block with the shield). */
export const VOLLEY_STONES = 5;

/**
 * Stone volley: it pulls five wakestones out of the walls (or up off the floor), holds them
 * floating, and throws them one after another at where Wren is. Block each (cost 1), sidestep
 * or catch one mid-air with the glove. The wall runs out of stones as the fight goes on.
 */
export const VOLLEY: Move<G> = posed({
  name: 'volley',
  cooldown: 5,
  timing: (b) => ({ windup: b.phase === 1 ? 1.15 : 0.9, active: 1.5, recover: 1.0 }),
  weight: (b, d) => (d >= 4.5 ? 3 : 0.6),
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 1.2;
      env.sfx.rumble();
      const gap = b.phase === 1 ? 0.34 : 0.28;
      const side = new THREE.Vector3(b.forward.z, 0, -b.forward.x);
      for (let i = 0; i < VOLLEY_STONES; i++) {
        const from = b.takeStone(env.playerPos) ?? b.pos.clone().add(new THREE.Vector3((i - 1) * 2.2, 5 + (i % 2) * 0.8, 0));
        const hoverAt = b.pos.clone().addScaledVector(side, (i - (VOLLEY_STONES - 1) / 2) * 2.2).addScaledVector(b.forward, 0.5).setY(b.pos.y + 5.4);
        env.hazards.stone(from, { hoverAt, delay: VOLLEY.timing(b).windup + i * gap, attack: ATTACKS.stone, speed: 18, homing: 1.3, onLand: (at) => b.addRubble(at.setY(at.y - 0.15)) });
        env.particles.fx('dustKick', from, { color: pal('stone', 2), count: 8, life: 0.5 });
      }
    } else if (step === 'active') {
      b.turnRate = 0.8;
    }
  },
});

/**
 * Grind, the greed punish: if Wren hugs its back it turns on its waist and grinds the floor
 * (close range; the ring of dust is jumpable). Nothing else threatens the space behind it.
 */
export const GRIND: Move<G> = posed({
  name: 'grind',
  cooldown: 4,
  timing: () => ({ windup: 0.8, active: 0.2, recover: 1.1 }),
  weight: (b, d) => (behind(b) && d < 6 ? 8 : 0),
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 0.4;
      env.sfx.inhale();
    } else if (step === 'active') {
      b.turnRate = 0;
      const rel = env.playerPos.clone().sub(b.pos).setY(0);
      if (rel.length() < 3.4 && env.playerPos.y - b.pos.y < 1) env.hitPlayer(b.pos, ATTACKS.grind);
      env.hazards.shockwave(b.pos.clone().setY(b.pos.y + 0.05), { speed: 10, maxRadius: 6, damage: 4, stone: true });
      env.particles.fx('smoke', b.pos.clone().setY(b.pos.y + 0.3), { color: pal('stone', 1), count: 20, speed: 5, life: 0.8, gravity: true });
      env.shake(0.6);
      env.sfx.grind();
    }
  },
});

/**
 * Staggered: the last plate is gone and the ember glows bare. It reels, drops to one knee,
 * and for about three seconds the chest is in the sword's reach (weak point, double damage).
 * Then it pulls new plates from the walls and rises. Never picked: the glove forces it.
 */
export const STAGGER: Move<G> = posed({
  name: 'staggered',
  timing: () => ({ windup: 0.3, active: 3, recover: 1.0 }),
  weight: () => 0,
  enter(b, step, env) {
    b.chestOpen = false;
    if (step === 'windup') {
      b.turnRate = 0;
      env.sfx.boom();
      env.shake(0.7);
    } else if (step === 'active') {
      b.chestOpen = true;
    } else {
      b.replate(env);
    }
  },
  update(b, step, _t, env) {
    if (step === 'active' && Math.random() < 0.15) env.particles.fx('embers', b.emberWorldPos(), { color: pal('ember', 2), speed: 2.5, life: 0.5 });
  },
  exit(b) {
    b.chestOpen = false;
  },
});



/** How fast the boulder rolls (m/s). Wren runs about 7, so she sidesteps rather than outruns it. */
export const ROLL_SPEED = 13;

/**
 * Cairn Roll (phase two): it rocks back for a full second (the tell), curls into a boulder and
 * rolls straight at where Wren was. Sidestep it. If it hits the
 * wall it's dazed for three seconds and the keystone in its back glows: tether it out.
 */
export const ROLL: Move<G> = posed({
  name: 'cairnRoll',
  cooldown: 5,
  timing: () => ({ windup: 1.0, active: 2.2, recover: 3.2 }),
  weight: (b, d) => (b.phase >= 2 ? (d > 6 ? 3 : 1.2) : 0),
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 1.8;
      env.sfx.rumble();
    } else if (step === 'active') {
      b.turnRate = 0;
      b.rollDir.copy(b.forward);
      b.rollLast.copy(b.pos);
      b.rollStall = 0;
      env.sfx.boom();
    } else if (b.scratch.wall) {
      b.keyT = 3;
      env.shake(0.9);
      env.sfx.boom();
      env.particles.fx('smoke', b.pos.clone().addScaledVector(b.rollDir, 1.6).setY(b.pos.y + 1.5), { color: pal('stone', 1), count: 20, speed: 6, life: 0.8, gravity: true });
    }
  },
  update(b, step, t, env, dt) {
    if (step === 'windup') {
      b.settleSpin(dt);
    } else if (step === 'active') {
      // Curled into a boulder (the rig): it rolls.
      b.vel.copy(b.rollDir).multiplyScalar(ROLL_SPEED);
      b.spin += (dt * ROLL_SPEED) / 1.5;
      if (!b.scratch.hit && b.distToPlayer < 2.5 && env.playerPos.y - b.pos.y < 1.6) {
        b.scratch.hit = true;
        env.hitPlayer(b.pos, ATTACKS.roll);
      }
      // Running into anything solid (a wall, a pillar, Wren herself) stops it dead: that is a wall hit too.
      const moved = b.pos.distanceTo(b.rollLast) / Math.max(dt, 1e-3);
      b.rollLast.copy(b.pos);
      b.rollStall = b.stepT > 0.25 && moved < ROLL_SPEED * 0.3 ? b.rollStall + dt : 0;
      if (b.rollStall > 0.12 || (b.walkable && !b.walkable(b.pos.x + b.rollDir.x * 0.7, b.pos.z + b.rollDir.z * 0.7))) {
        b.scratch.wall = true;
        b.skipStep();
      }
    } else {
      b.settleSpin(dt);
      // Dazed against the wall (or, if it found none, a short breather).
      if (!b.scratch.wall && t > 0.3) b.skipStep();
    }
  },
  exit(b) {
    b.keyT = 0;
    b.spin = 0;
  },
});

/**
 * Kneel: the keystone is out. It collapses to its knees facing Wren, head bowed within the
 * sword's reach, the ember bright inside it (the weak point, double damage). Then it rises.
 * Never picked: the glove forces it.
 */
export const KNEEL: Move<G> = posed({
  name: 'kneel',
  timing: () => ({ windup: 1.0, active: 2.8, recover: 1.2 }),
  weight: () => 0,
  enter(b, step, env) {
    b.chestOpen = false;
    if (step === 'windup') {
      b.turnRate = 4.2; // a heavy turn, over most of the second
      b.spin = 0;
      env.sfx.boom();
      env.shake(0.7);
    } else if (step === 'active') {
      b.turnRate = 0;
      b.chestOpen = true;
    }
  },
  update(b, step, _t, env) {
    // On its knees, head bowed (the rig): the ember sparks and the whole body pulses red (Boss.exposed).
    if (step === 'active' && Math.random() < 0.15) env.particles.fx('embers', b.emberWorldPos(), { color: pal('ember', 2), speed: 2.5, life: 0.5 });
  },
  exit(b) {
    b.chestOpen = false;
  },
});

/**
 * The phase move, at half health: it rears back and howls, then smashes the floor. The
 * ring of floor tiles rises into a wall (the arena shrinks), its ember sinks into its
 * head, out of the sword's reach, the plates fall away, and two hearts drop. It cannot be
 * hurt until it has finished.
 */
export const HOWL: Move<G> = posed({
  name: 'howl',
  timing: () => ({ windup: 1.3, active: 0.5, recover: 1.4 }),
  weight: () => 0,
  enter(b, step, env) {
    if (step === 'windup') {
      b.turnRate = 0;
      b.chestOpen = false;
      b.plates.fill(false);
      b.loose = -1;
      b.keyT = 0;
      env.sfx.howl();
    } else if (step === 'active') {
      b.keepInside();
      b.hearth?.raiseRing();
      const c = b.hearth?.center ?? b.pos;
      for (const dx of [-3, 3]) env.drop('heart', new THREE.Vector3(c.x + dx, c.y + 0.5, c.z));
      env.particles.fx('smoke', b.pos.clone().setY(b.pos.y + 0.3), { color: pal('stone', 1), count: 30, speed: 8, life: 1, gravity: true });
      env.shake(1.4);
      env.sfx.boom();
    }
  },
  update(b, step, _t, env) {
    // While the tiles rise, nobody stands where they will be.
    const h = b.hearth;
    if (h && step !== 'windup' && !h.ringUp && !h.insideRing(env.playerPos, 0.3)) {
      env.pushPlayer(env.playerPos.clone().multiplyScalar(2).sub(h.center.clone().setY(env.playerPos.y)), 9);
    }
  },
});

export const MOVES = [HAMMERFALL, SWEEP, DOUBLE_SWEEP, SWIPE, VOLLEY, GRIND, ROLL, STAGGER, KNEEL, HOWL];

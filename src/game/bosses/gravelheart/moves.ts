import * as THREE from 'three';
import { Layer } from '../../../core/physics';
import type { Move } from '../../boss';
import type { Attack, EnemyEnv } from '../../enemies';
import type { Gravelheart } from './index';

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
export const HAMMERFALL: Move<G> = {
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
      env.particles.burst(at.clone().setY(at.y + 0.3), 0x4f4a42, 22, 6, 0.9);
      env.particles.burst(at.clone().setY(at.y + 0.2), 0xff7a32, 10, 4, 0.5);
      env.shake(0.9);
      env.sfx.boom();
    }
  },
  update(b, step, t) {
    if (step === 'windup') {
      // Fists rise overhead; the eyes go red (the guard-crushing tell).
      b.pose({ rArm: 2.9, lArm: 2.9, rOut: 0.2, lOut: 0.2, rBend: 0.5, lBend: 0.5, lean: -0.15, headPitch: -0.2, lids: 0, eyes: 1, red: Math.min(1, t * 3), hipsY: 1.8 }, 7);
    } else if (step === 'active') {
      b.pose({ rArm: 0.9, lArm: 0.9, rOut: 0.12, lOut: 0.12, rBend: 0.1, lBend: 0.1, lean: 0.75, headPitch: 0.1, lids: 0.2, eyes: 1, red: 1, hipsY: 1.15 }, 30);
    } else {
      // Stuck: fists in the floor, bent over, chest low. It wrenches free at the end.
      const free = t > 0.8 ? (t - 0.8) / 0.2 : 0;
      if (b.phase === 1 && !b.scratch.loosened) {
        b.scratch.loosened = true;
        b.loosenPlate();
      }
      b.pose({ rArm: 0.95 - free * 0.6, lArm: 0.95 - free * 0.6, rOut: 0.12, lOut: 0.12, rBend: 0.05, lBend: 0.05, lean: 0.8 - free * 0.5, headPitch: 0.15, lids: 0.35, eyes: 0.7, red: 0, hipsY: 1.05 + free * 0.4 }, 10);
    }
  },
};

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
export const SWEEP: Move<G> = {
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
  update(b, step) {
    if (step === 'windup') b.pose({ twist: -1.0, rArm: 1.45, rOut: 1.5, rBend: 0.1, lArm: 0.3, hipsY: 1.55, eyes: 1, lids: 0.1 }, 6);
    else if (step === 'active') b.pose({ twist: 1.15, rArm: 1.45, rOut: 1.45, rBend: 0.05, lArm: 0.3, hipsY: 1.55, eyes: 1, lids: 0.2 }, 30);
    else b.pose({ twist: 1.1, rArm: 1.3, rOut: 1.2, hipsY: 1.6, lids: 0.4 }, 5);
  },
};

/**
 * Double sweep (phase two's Sweep): the same low swing, then back again 0.75 s later. Each
 * costs 2 guard slots, so blocking both breaks a full guard: block the first, jump the second.
 */
export const DOUBLE_SWEEP: Move<G> = {
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
  update(b, step, t) {
    if (step === 'windup') b.pose({ twist: -1.0, rArm: 1.45, rOut: 1.5, rBend: 0.1, lArm: 0.3, hipsY: 1.55, eyes: 1, lids: 0.1 }, 6);
    else if (step === 'active') b.pose({ twist: t < 0.7 ? 1.15 : -1.15, rArm: 1.45, rOut: 1.45, rBend: 0.05, lArm: 1.45, lOut: 1.45, lBend: 0.05, hipsY: 1.55, eyes: 1, lids: 0.2 }, 22);
    else b.pose({ twist: -1.1, rArm: 1.3, rOut: 1.2, hipsY: 1.6, lids: 0.4 }, 5);
  },
};

/**
 * Swipe (the close-range punish for crowding it): a quick backhand across its front, high, so
 * a jump doesn't clear it. Blockable (cost 2); stepping back out of its 3.8 m reach avoids it.
 */
export const SWIPE: Move<G> = {
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
  update(b, step) {
    if (step === 'windup') b.pose({ twist: 1.0, lArm: 1.3, lOut: 1.6, lBend: 0.2, rArm: 0.3, hipsY: 1.6, eyes: 1, lids: 0.1 }, 8);
    else if (step === 'active') b.pose({ twist: -1.2, lArm: 1.3, lOut: 0.3, lBend: 0.1, rArm: 0.3, hipsY: 1.6, eyes: 1, lids: 0.2 }, 34);
    else b.pose({ twist: -1.0, lArm: 1.2, lOut: 0.5, hipsY: 1.65, lids: 0.4 }, 5);
  },
};

/** Wakestones in a volley (owner's call: three were too easy to block with the shield). */
export const VOLLEY_STONES = 5;

/**
 * Stone volley: it pulls five wakestones out of the walls (or up off the floor), holds them
 * floating, and throws them one after another at where Wren is. Block each (cost 1), sidestep
 * or catch one mid-air with the glove. The wall runs out of stones as the fight goes on.
 */
export const VOLLEY: Move<G> = {
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
        env.particles.burst(from, 0x8f887c, 8, 3, 0.5);
      }
    } else if (step === 'active') {
      b.turnRate = 0.8;
    }
  },
  update(b, step, t) {
    if (step === 'windup') b.pose({ rArm: 2.5, lArm: 2.5, rOut: 0.9, lOut: 0.9, rBend: 0.3, lBend: 0.3, headPitch: -0.3, eyes: 1, lids: 0, lean: -0.1, hipsY: 1.75 }, 5);
    else if (step === 'active') b.pose({ rArm: 1.6 + Math.sin(t * 9) * 0.5, lArm: 1.6 - Math.sin(t * 9) * 0.5, rOut: 0.4, lOut: 0.4, headPitch: 0.05, eyes: 1, lids: 0.1 }, 12);
    else b.pose({ rArm: 0.6, lArm: 0.6, lids: 0.4 }, 5);
  },
};

/**
 * Grind, the greed punish: if Wren hugs its back it turns on its waist and grinds the floor
 * (close range; the ring of dust is jumpable). Nothing else threatens the space behind it.
 */
export const GRIND: Move<G> = {
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
      env.particles.burst(b.pos.clone().setY(b.pos.y + 0.3), 0x4f4a42, 20, 5, 0.8);
      env.shake(0.6);
      env.sfx.grind();
    }
  },
  update(b, step) {
    if (step === 'windup') b.pose({ twist: 2.4, lean: 0.25, hipsY: 1.45, rArm: 0.8, lArm: 0.8, rOut: 0.7, lOut: 0.7, eyes: 1, lids: 0.1 }, 5);
    else if (step === 'active') b.pose({ twist: -2.4, lean: 0.25, hipsY: 1.4, rArm: 0.8, lArm: 0.8, rOut: 0.7, lOut: 0.7, eyes: 1 }, 24);
    else b.pose({ twist: -2.0, hipsY: 1.6, lids: 0.45 }, 4);
  },
};

/**
 * Staggered: the last plate is gone and the ember glows bare. It reels, drops to one knee,
 * and for about three seconds the chest is in the sword's reach (weak point, double damage).
 * Then it pulls new plates from the walls and rises. Never picked: the glove forces it.
 */
export const STAGGER: Move<G> = {
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
    if (step === 'active' && Math.random() < 0.15) env.particles.burst(b.emberWorldPos(), 0xff7a32, 2, 2.5, 0.5, false);
    if (step === 'windup') b.pose({ lean: -0.35, hipsY: 1.2, rArm: 0.2, lArm: 0.2, eyes: 1, lids: 0.1, red: 0, ember: 2 }, 12);
    else if (step === 'active') b.pose({ lean: 0.1, hipsY: 0.95, headPitch: 0.45, rArm: 0.4, lArm: 0.4, rOut: 0.5, lOut: 0.5, eyes: 0.2, lids: 0.75, ember: 2 }, 6);
    else b.pose({ lean: 0.1, hipsY: 1.4, headPitch: 0.1, eyes: 0.8, lids: 0.35, ember: 1.2 }, 4);
  },
  exit(b) {
    b.chestOpen = false;
  },
};



/** How fast the boulder rolls (m/s). Wren runs about 7, so she sidesteps rather than outruns it. */
export const ROLL_SPEED = 13;

/**
 * Cairn Roll (phase two): it rocks back for a full second (the tell), curls into a boulder and
 * rolls straight at where Wren was. Sidestep it. If it hits the
 * wall it's dazed for three seconds and the keystone in its back glows: tether it out.
 */
export const ROLL: Move<G> = {
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
      env.particles.burst(b.pos.clone().addScaledVector(b.rollDir, 1.6).setY(b.pos.y + 1.5), 0x4f4a42, 20, 6, 0.8);
    }
  },
  update(b, step, t, env, dt) {
    if (step === 'windup') {
      b.settleSpin(dt);
      b.pose({ lean: -0.45 - Math.sin(t * 16) * 0.05, hipsY: 1.5, tuck: t, rArm: 0.9, lArm: 0.9, rBend: 1.0, lBend: 1.0, headPitch: 0.4, eyes: 1, lids: 0.1, red: t }, 7);
    } else if (step === 'active') {
      b.vel.copy(b.rollDir).multiplyScalar(ROLL_SPEED);
      b.spin += (dt * ROLL_SPEED) / 1.5;
      // Arms folded across the chest, head tucked, legs up: as close to a ball as stacked blocks get.
      b.pose({ lean: 1.45, hipsY: 2.1, tuck: 1, rArm: 1.7, lArm: 1.7, rOut: 0.05, lOut: 0.05, rBend: 2.2, lBend: 2.2, headPitch: 1.1, eyes: 0.6, lids: 0.6, red: 1, float: 0.2 }, 14);
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
      b.pose({ lean: 0.9, hipsY: 1.1, tuck: 0.7, headPitch: 0.6, rArm: 0.5, lArm: 0.5, lids: 0.9, eyes: 0.2, red: 0 }, 8);
    }
  },
  exit(b) {
    b.keyT = 0;
    b.spin = 0;
  },
};

/**
 * Kneel: the keystone is out. It collapses to its knees facing Wren, head bowed within the
 * sword's reach, the ember bright inside it (the weak point, double damage). Then it rises.
 * Never picked: the glove forces it.
 */
export const KNEEL: Move<G> = {
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
    // Reels back with the keystone gone, then sinks onto its knees, fists on the floor, head bowed:
    // the ember sparks and the whole body pulses red (Boss.exposed).
    if (step === 'windup') b.pose({ lean: -0.5, hipsY: 1.5, headPitch: -0.3, rArm: 0.4, lArm: 0.4, rOut: 0.9, lOut: 0.9, eyes: 1, lids: 0.1, ember: 2, float: 2 }, 5);
    else if (step === 'active') b.pose({ lean: 1.15, hipsY: 0.8, headPitch: 0.3, rArm: 0.85, lArm: 0.85, rOut: 0.3, lOut: 0.3, rBend: 0.1, lBend: 0.1, eyes: 0.3, lids: 0.7, ember: 2.4, float: 0.4 }, 4);
    else b.pose({ lean: 0.4, hipsY: 1.4, headPitch: 0.1, eyes: 0.8, lids: 0.35, ember: 1.4 }, 4);
    if (step === 'active' && Math.random() < 0.15) env.particles.burst(b.emberWorldPos(), 0xff7a32, 2, 2.5, 0.5, false);
  },
  exit(b) {
    b.chestOpen = false;
  },
};

/**
 * The phase move, at half health: it rears back and howls, then smashes the floor. The
 * ring of floor tiles rises into a wall (the arena shrinks), its ember sinks into its
 * head, out of the sword's reach, the plates fall away, and two hearts drop. It cannot be
 * hurt until it has finished.
 */
export const HOWL: Move<G> = {
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
      env.particles.burst(b.pos.clone().setY(b.pos.y + 0.3), 0x4f4a42, 30, 8, 1);
      env.shake(1.4);
      env.sfx.boom();
    }
  },
  update(b, step, _t, env) {
    if (step === 'windup') b.pose({ lean: -0.4, headPitch: -0.5, hipsY: 1.85, rArm: 1.2, lArm: 1.2, rOut: 1.0, lOut: 1.0, lids: 0, eyes: 1, red: 1, ember: 2 }, 4);
    else if (step === 'active') b.pose({ lean: 0.85, headPitch: 0.1, hipsY: 1.1, rArm: 0.9, lArm: 0.9, rOut: 0.12, lOut: 0.12, eyes: 1, red: 1, ember: 2 }, 24);
    else b.pose({ lean: 0.5, hipsY: 1.35, lids: 0.3, eyes: 0.8, red: 0 }, 5);
    // While the tiles rise, nobody stands where they will be.
    const h = b.hearth;
    if (h && step !== 'windup' && !h.ringUp && !h.insideRing(env.playerPos, 0.3)) {
      env.pushPlayer(env.playerPos.clone().multiplyScalar(2).sub(h.center.clone().setY(env.playerPos.y)), 9);
    }
  },
};

export const MOVES = [HAMMERFALL, SWEEP, DOUBLE_SWEEP, SWIPE, VOLLEY, GRIND, ROLL, STAGGER, KNEEL, HOWL];

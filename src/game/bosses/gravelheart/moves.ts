import { Layer } from '../../../core/physics';
import type { Move } from '../../boss';
import type { Attack, EnemyEnv } from '../../enemies';
import type { Gravelheart } from './index';

/**
 * The attack sheet: damage in half-hearts, and guard = how many of the shield's three
 * slots a block knocks down (docs/shrine.md, "The boss").
 */
export const ATTACKS = {
  /** Red eyes: crushes a whole guard. Block it with all three slots up, or get out from under it. */
  hammerfall: { damage: 2, guard: 3, knockback: 14 },
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
 * the floor and it's bent over, chest low: the punish window.
 * (Session A: the chest is open to the sword in the window. Session B: one plate glows loose
 * instead, for the glove.)
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
      env.hazards.shockwave(at, { speed: 8, maxRadius: 14, damage: 1 });
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
      b.pose({ rArm: 0.95 - free * 0.6, lArm: 0.95 - free * 0.6, rOut: 0.12, lOut: 0.12, rBend: 0.05, lBend: 0.05, lean: 0.8 - free * 0.5, headPitch: 0.15, lids: 0.35, eyes: 0.7, red: 0, hipsY: 1.05 + free * 0.4 }, 10);
      b.chestOpen = t < 0.85;
    }
  },
  exit(b) {
    b.chestOpen = false;
  },
};

export const MOVES = [HAMMERFALL];

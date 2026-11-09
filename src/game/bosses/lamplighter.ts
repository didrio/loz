import * as THREE from 'three';
import { clamp, easeOut } from '../../core/math';
import { Layer, type Physics } from '../../core/physics';
import { buildLamplighter, type LamplighterModel, type LamplighterMoveCue, type LamplighterRig } from '../../render/models/lamplighter';
import type { BossArena } from '../../world/objects';
import { Boss, type BossState, type Move } from '../boss';
import { Gloomwisp, type Attack, type EnemyEnv, type Hurtbox } from '../enemies';
import { pal } from '../../render/palette';

/**
 * THE HOLLOW LAMPLIGHTER, Keeper of a Stolen Flame. Mini-boss of Gloaming Hollow.
 *
 * When the shrine's great lantern went dark, its flame didn't go out: something took it.
 * A gaunt thing in a lamplighter's coat carries it now, gone cold and blue, in an iron
 * lantern cage where its face should be. It collects other lights too: wisps caged in little
 * lanterns on its belt. Beating it frees the stolen flame, which returns to the shrine as
 * its first ember.
 *
 * The fight, at a glance:
 * - Guards with its pole from the front while stalking: hit it from behind, or punish moves.
 * - Hook Sweep (2 guard): wide swing. Block, back off or jump it. Phase 2 adds a backhand (1).
 * - Snuffer Slam (3 guard): telegraphed overhead slam that sends a ring of cold fire along
 *   the ground (unblockable: jump it). The hook sticks in the earth and the head comes
 *   down: hit the lantern (×2).
 * - Cold Flame Volley (1 guard each): homing orbs at range. Phase 2 fires more than a full
 *   guard can take, so block some and strafe the rest.
 * - Spin (2 guard): if you keep hitting it from behind, it whirls around to punish greed.
 * - At half health it howls: tears its coat, frees its caged wisps (which orbit it and
 *   dive at you), the hollow goes dark, and it starts to Skitter: drops to all fours, eyes
 *   flashing red, and lunges. It crushes a whole guard (3): block it with every slot up,
 *   or jump it. Either way its head is low afterward.
 */

/**
 * The attack sheet: damage in half-hearts, and guard = how many of the shield's three slots a
 * block knocks down. A full guard can take exactly one sweep + backhand, or one slam.
 */
const ATTACKS = {
  sweep: { damage: 2, guard: 2, knockback: 13 },
  backhand: { damage: 2, guard: 1, knockback: 13 },
  spin: { damage: 2, guard: 2, knockback: 14 },
  slam: { damage: 2, guard: 3, knockback: 12 },
  orb: { damage: 1, guard: 1, knockback: 6 },
  /** Red eyes: crushes a whole guard. Block it with all three slots up, or jump it. */
  skitter: { damage: 2, guard: 3, knockback: 15 },
} satisfies Record<string, Attack>;

/** Caught in a fight past dawn, the daylight burns it from full health to nothing in about this long. */
const BURN_SECONDS = 60;
/** The burn lands in small bites this far apart, each with a puff of embers. */
const BURN_TICK = 0.4;
/** How long it takes to rise out of the dusk or gutter out at dawn. */
const FADE_SECONDS = 1.6;

export class HollowLamplighter extends Boss {
  readonly title = 'The Hollow Lamplighter';
  readonly epithet = 'Keeper of a Stolen Flame';
  protected readonly introDuration = 4.4;
  protected readonly dyingDuration = 6;
  /** The cage has burst and the flame is free (content's defeat cutscene waits for this). */
  shattered = false;
  /** It has guttered out at dawn (content removes it then). */
  vanished = false;
  /** 0..1 while it rises at dusk or gutters out at dawn (1: all here). */
  private presence = 1;
  private fading: 'in' | 'out' | null = null;
  private burnT = 0;

  // The model and its rig are render/models/lamplighter.ts; here the rig is only told what is happening.
  private readonly rig: LamplighterRig;
  private readonly hips: THREE.Group;
  private readonly torso: THREE.Group;
  private readonly head: THREE.Group;
  private readonly cage: THREE.Group;
  private readonly hand: THREE.Group;
  private readonly pole: THREE.Group;
  private readonly poleTip: THREE.Object3D;
  private readonly strips: LamplighterModel['strips'];
  private readonly lanterns: LamplighterModel['lanterns'];
  private readonly mask: THREE.Object3D;
  /** The move running this frame, as its `update` saw it (set by `posed`; the rig reads it). */
  poseMove: LamplighterMoveCue | null = null;
  /** The state and its time as this frame began (before the clock ticks): what the state's look reads. */
  private posing: { state: BossState; t: number } = { state: 'dormant', t: 0 };
  /** The intro's head turn toward Wren. */
  private turn = 0;

  private introYaw = 0;
  private torn = false;
  private poleDropped = false;
  private readonly minions: Gloomwisp[] = [];
  private backHits: number[] = [];

  constructor(parent: THREE.Object3D, physics: Physics, arena: BossArena | null, x: number, z: number, yaw: number) {
    super(parent, physics, arena, { x, z, yaw, hp: 30, radius: 0.9, halfHeight: 1.2, phases: [0.5] });
    this.lockHeight = 2.6;

    const m = buildLamplighter();
    this.rig = m.rig;
    this.hips = m.joints.hips;
    this.torso = m.joints.torso;
    this.head = m.joints.head;
    this.cage = m.joints.cage;
    this.hand = m.armR.hand;
    this.pole = m.joints.pole;
    this.poleTip = m.joints.poleTip;
    this.strips = m.strips;
    this.lanterns = m.lanterns;
    this.mask = m.joints.mask;
    this.flashMats.push(...m.flashMats);
    this.root.add(m.root);

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------

  protected moves(): Move<this>[] {
    return [SWEEP, SLAM, VOLLEY, SKITTER] as Move<this>[];
  }

  protected phaseMove(phase: number): Move<this> | null {
    return phase === 2 ? (HOWL as Move<this>) : null;
  }

  /** The sword glances off the pole (an armor hurtbox, only while it's held at the ready). */
  protected isGuarding(_toAttacker: THREE.Vector3, part: string) {
    return part === 'pole';
  }

  protected damageMultiplier(part: string) {
    return part === 'head' ? 2 : 1;
  }

  protected decideDelay() {
    return this.phase === 1 ? 0.9 + Math.random() * 0.8 : 0.45 + Math.random() * 0.55;
  }

  protected baseTurnRate() {
    return this.phase === 1 ? 1.5 : 2.3;
  }

  protected stalk(dt: number) {
    super.stalk(dt, this.phase === 1 ? 2.4 : 3.2, 3.2, 5.8);
  }

  protected onHurt() {
    // Greed check: two hits in the back within two seconds earn a spinning counter.
    if (!this.env) return;
    const behind = this.toPlayer.dot(this.forward) < -0.2;
    if (!behind || this.move) return;
    const now = this.stateT;
    this.backHits = this.backHits.filter((t) => now - t < 2);
    this.backHits.push(now);
    if (this.backHits.length >= 2) {
      this.backHits = [];
      this.queue(SPIN as Move<this>);
    }
  }

  hurtboxes(): Hurtbox[] {
    this.root.updateMatrixWorld(true);
    return [
      this.box(this.head, new THREE.Vector3(0, 0.35, 0), 0.55, 'head', 2),
      this.box(this.torso, new THREE.Vector3(0, 0.95, 0), 0.85, 'body'),
      this.box(this.hips, new THREE.Vector3(0, -0.8, 0), 0.75, 'legs'),
      ...this.poleArmor(),
    ];
  }

  /**
   * The pole parries: armor along its shaft and hook, but only while it's held at the ready
   * (not committed to a move, so a slam's punish window stays open, and not dropped). A
   * swing that meets the pole clanks; one that gets past it, from an angle, lands.
   */
  private poleArmor(): Hurtbox[] {
    if (this.move || this.poleDropped) return [];
    const boxes: Hurtbox[] = [];
    for (let y = 0.2; y <= 2.8; y += 0.45) boxes.push({ ...this.box(this.pole, new THREE.Vector3(0, y, 0), 0.24, 'pole'), armor: true });
    boxes.push({ ...this.box(this.pole, new THREE.Vector3(0.1, 3.05, 0), 0.38, 'pole'), armor: true });
    return boxes;
  }

  /** The head's world position (wisps orbit it; the freed flame starts there). */
  headWorldPos() {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0.4, 0).applyMatrix4(this.head.matrixWorld);
  }

  /** Where the pole's hook is right now (the slam lands here). */
  tipWorldPos() {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(this.poleTip.matrixWorld);
  }

  wake() {
    super.wake();
    this.introYaw = this.yaw;
  }

  // ---------------------------------------------------------------------------
  // Effects used by moves
  // ---------------------------------------------------------------------------

  /** Whether the player is inside an arc in front: range in meters, half-angle in radians. */
  inArc(range: number, halfAngle: number, maxPlayerHeight = 1.4) {
    if (!this.env) return false;
    const p = this.env.playerPos;
    if (this.distToPlayer > range || p.y - this.pos.y > maxPlayerHeight) return false;
    return Math.acos(clamp(this.toPlayer.dot(this.forward), -1, 1)) <= halfAngle;
  }

  /** Slams the hook into the ground: direct hit, shockwave(s), dust and a shake. */
  impact(env: EnemyEnv) {
    const tip = this.tipWorldPos();
    const ground = env.physics.groundY(tip.x, tip.z, tip.y + 3, Layer.World) ?? this.pos.y;
    const at = new THREE.Vector3(tip.x, ground, tip.z);
    if (env.playerPos.distanceTo(at) < 2.1) env.hitPlayer(at, ATTACKS.slam);
    env.hazards.shockwave(at, { speed: 9, maxRadius: 16, damage: 1 });
    if (this.phase >= 2) this.later(0.5, () => env.hazards.shockwave(at, { speed: 10.5, maxRadius: 16, damage: 1 }));
    env.particles.fx('magicMotes', at.clone().setY(at.y + 0.3), { color: pal('spirit', 3), count: 18, speed: 7, life: 0.6, gravity: true });
    env.particles.fx('smoke', at.clone().setY(at.y + 0.2), { count: 16, speed: 5, life: 0.8, gravity: true });
    env.shake(0.7);
    env.sfx.boom();
  }

  /** Fires a fan of homing cold-flame orbs from the lantern. */
  volley(env: EnemyEnv, count: number) {
    const from = this.headWorldPos().addScaledVector(this.forward, 0.5);
    const aim = env.playerPos.clone().setY(env.playerPos.y + 1.1).sub(from).normalize();
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.3;
      const dir = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
      env.hazards.orb(from, dir, { speed: 8.5, homing: this.phase === 1 ? 0.8 : 1.05, life: 4.5, attack: ATTACKS.orb });
    }
    env.sfx.orbFire();
  }

  /** Phase two: rip open the coat and free the caged wisps to fight for it. */
  tearOpen(env: EnemyEnv) {
    this.torn = true;
    this.root.updateMatrixWorld(true);
    for (const s of this.strips) {
      if (!s.front) continue;
      s.g.visible = false;
      env.particles.fx('smoke', new THREE.Vector3(0, 1, 0).applyMatrix4(s.g.matrixWorld), { color: pal('ink', 2), count: 6, speed: 4, life: 0.9, gravity: true });
    }
    for (const l of this.lanterns) {
      l.g.visible = false;
      const at = new THREE.Vector3().setFromMatrixPosition(l.glow.matrixWorld);
      env.particles.fx('magicMotes', at, { color: pal('violet', 2), count: 12, speed: 5, life: 0.6, gravity: true });
      const w = new Gloomwisp(this.root.parent!, env.physics, at.x, at.z, {
        nocturnal: false,
        anchor: () => (this.alive ? this.headWorldPos() : null),
        attackCooldown: 3.2,
      });
      w.pos.copy(at);
      this.minions.push(w);
      env.spawn(w);
    }
    env.pushPlayer(this.pos, 14);
    env.shake(0.9);
    env.sfx.howl();
    // A little mercy: two hearts tumble out with the wisps.
    for (const s of [-1, 1]) env.drop('heart', this.pos.clone().addScaledVector(new THREE.Vector3(-this.forward.z * s, 0, this.forward.x * s), 3));
  }

  protected onReset() {
    for (const w of this.minions) {
      w.alive = false;
      w.gone = true;
    }
    this.minions.length = 0;
    this.torn = false;
    this.shattered = false;
    for (const s of this.strips) s.g.visible = true;
    for (const l of this.lanterns) l.g.visible = true;
    if (this.poleDropped) {
      this.hand.add(this.pole);
      this.pole.position.set(0, -0.12, 0);
      this.pole.rotation.set(0, 0, 0);
      this.poleDropped = false;
    }
    this.cage.visible = this.mask.visible = true;
    this.root.scale.setScalar(1);
    this.presence = 1;
    this.fading = null;
    this.burnT = 0;
    this.backHits = [];
  }

  protected onDeath() {
    for (const w of this.minions) if (w.alive) w.hurt(99, this.pos);
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  update(dt: number, env: EnemyEnv) {
    // Each frame the rig starts from its standing pose; the state's look and the running move then bend it.
    this.poseMove = null;
    this.posing = { state: this.state, t: this.stateT };
    this.gloom = this.state === 'fight' ? (this.phase === 1 ? 0.3 : 0.8) : this.state === 'intro' ? 0.3 : 0;
    if (this.state === 'intro') this.introBeats(env, dt);
    if (this.state === 'dying') this.dyingBeats(env, dt);
    // Kept from going home by the fight, it burns in the daylight.
    if (this.state === 'fight' && !env.night) this.dawnBurn(dt, env);
    if (this.fading && this.state === 'dormant') this.fade(dt, env);
    super.update(dt, env);
  }

  /** At dusk: rises out of a swirl of embers and smoke. */
  rise() {
    this.presence = 0;
    this.fading = 'in';
    this.root.scale.set(0.7, 0.01, 0.7);
  }

  /** At dawn, outside a fight: gutters out like a snuffed lamp; `vanished` once it's gone. */
  vanish() {
    this.fading = 'out';
  }

  private fade(dt: number, env: EnemyEnv) {
    const rising = this.fading === 'in';
    this.presence = clamp(this.presence + (rising ? dt : -dt) / FADE_SECONDS, 0, 1);
    const k = easeOut(this.presence);
    this.root.scale.set(0.7 + k * 0.3, Math.max(0.01, k), 0.7 + k * 0.3);
    if (Math.random() < dt * 40) {
      const at = this.pos.clone().setY(this.pos.y - 1 + Math.random() * 3.5 * k);
      env.particles.fx(Math.random() < 0.5 ? 'embers' : 'magicMotes', at, { count: 2, gravity: true, life: 0.7 });
      env.particles.fx('smoke', at, { count: 2, speed: 1.2, life: 1.2 });
    }
    if (rising && this.presence >= 1) this.fading = null;
    if (!rising && this.presence <= 0) {
      this.fading = null;
      this.vanished = true;
    }
  }

  private dawnBurn(dt: number, env: EnemyEnv) {
    this.burnT += dt;
    while (this.burnT >= BURN_TICK) {
      this.burnT -= BURN_TICK;
      if (!this.sear((this.maxHp * BURN_TICK) / BURN_SECONDS)) continue;
      const at = this.pos.clone().setY(this.pos.y + 0.5 + Math.random() * 2.5);
      at.x += (Math.random() - 0.5) * 1.2;
      at.z += (Math.random() - 0.5) * 1.2;
      env.particles.fx('embers', at, { count: 6, speed: 3, life: 0.5, gravity: true });
      env.particles.fx('smoke', at, { count: 3, life: 0.9 });
    }
  }

  /** The intro's beats (the rig plays its look): the head turns to Wren, the body follows, the shriek. */
  private introBeats(env: EnemyEnv, dt: number) {
    const t = this.stateT;
    const toPlayer = Math.atan2(env.playerPos.x - this.pos.x, env.playerPos.z - this.pos.z);
    const turn = ((toPlayer - this.introYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.turn = turn;
    if (t < 1.3) {
      if (t < dt * 1.5) env.sfx.creak();
    } else if (t < 2.4) {
      // The body turns to match the head.
      const k = easeOut((t - 1.3) / 1.1);
      this.yaw = this.introYaw + turn * k;
    } else if (t < 3.3) {
      if (t - dt < 2.4) {
        env.sfx.shriek();
        env.shake(0.5);
      }
    }
  }

  /** The death's beats (the rig plays its look): it lets go of the pole, the cage bursts, the body crumbles. */
  private dyingBeats(env: EnemyEnv, dt: number) {
    const t = this.stateT;
    if (t >= 0.9 && t < 2.1 && !this.poleDropped) {
      // Let go of the pole: it stays behind in the hollow after the body crumbles (the rig tips it over).
      this.poleDropped = true;
      this.root.parent?.attach(this.pole);
    } else if (t >= 3.5) {
      if (!this.shattered) {
        this.shattered = true;
        const at = this.headWorldPos();
        this.cage.visible = this.mask.visible = false;
        env.particles.fx('smoke', at, { color: pal('ink', 3), count: 22, speed: 7, gravity: true });
        env.particles.fx('deathPuff', at, { color: pal('chalk', 1), count: 10, speed: 5, life: 1 });
        env.particles.fx('embers', at, { count: 24, speed: 6, life: 0.8, gravity: true });
        env.shake(0.6);
        env.sfx.shatter();
      }
      // The body crumbles into ash.
      const k = clamp((t - 3.6) / 2.2, 0, 1);
      this.root.scale.set(1 - k * 0.3, Math.max(0.01, 1 - k), 1 - k * 0.3);
      if (Math.random() < dt * 30) env.particles.fx('smoke', this.pos.clone().setY(this.pos.y + 1 + Math.random() * 2 * (1 - k)), { count: 2, life: 1.2 });
    }
  }

  protected animate(dt: number) {
    this.rig.update(dt, {
      posing: this.posing,
      state: this.state,
      stateT: this.stateT,
      move: this.poseMove,
      turn: this.turn,
      speed: Math.hypot(this.vel.x, this.vel.z),
      yaw: this.yaw,
      presence: this.presence,
      shattered: this.shattered,
      poleDropped: this.poleDropped,
      floorY: this.pos.y,
    });
  }
}

/** A move whose look the rig plays: each frame its `update` runs, the rig is told which step it is in, and how far. */
function posed(m: Move<HollowLamplighter>): Move<HollowLamplighter> {
  return {
    ...m,
    update(b, step, t, env, dt) {
      b.poseMove = { name: m.name, step, t, stepT: b.stepT };
      m.update?.(b, step, t, env, dt);
    },
  };
}

// ---------------------------------------------------------------------------
// The moveset
// ---------------------------------------------------------------------------

type L = HollowLamplighter;

/** Hook Sweep: drawn far back (glowing hook), then a wide swing in front. */
const SWEEP: Move<L> = posed({
  name: 'sweep',
  timing: (b) => ({ windup: b.phase === 1 ? 0.8 : 0.62, active: 0.24, recover: b.phase === 1 ? 0.85 : 0.6 }),
  weight: (_b, d) => (d < 5.6 ? 3 : d < 7 ? 0.8 : 0),
  enter(b, step, env) {
    if (step === 'active') env.sfx.heavySwing();
    if (step === 'active') b.scratch.hitDone = false;
    if (step === 'recover' && b.phase >= 2 && Math.random() < 0.45) b.queue(BACKHAND);
  },
  update(b, step, t, env) {
    if (step === 'windup') {
      b.turnRate = 1.4;
    } else if (step === 'active') {
      b.turnRate = 0;
      if (t > 0.3 && !b.scratch.hitDone) {
        b.scratch.hitDone = true;
        if (b.inArc(5.6, 1.95)) env.hitPlayer(b.pos, ATTACKS.sweep);
      }
    } else {
      b.turnRate = 0.5;
    }
  },
});

/** Backhand: phase two's quick return swing after a sweep. */
const BACKHAND: Move<L> = posed({
  name: 'backhand',
  timing: () => ({ windup: 0.34, active: 0.24, recover: 0.9 }),
  weight: () => 0,
  enter(b, step, env) {
    if (step === 'active') {
      env.sfx.heavySwing();
      b.scratch.hitDone = false;
    }
  },
  update(b, step, t, env) {
    if (step === 'windup') {
      b.turnRate = 2;
    } else if (step === 'active') {
      b.turnRate = 0;
      if (t > 0.3 && !b.scratch.hitDone) {
        b.scratch.hitDone = true;
        if (b.inArc(5.6, 1.95)) env.hitPlayer(b.pos, ATTACKS.backhand);
      }
    } else {
      b.turnRate = 0.5;
    }
  },
});

/**
 * Snuffer Slam: rises to full height with the pole overhead, then slams the hook down.
 * A ring of cold fire races out along the ground (two in phase two); the hook sticks and
 * the head comes down within reach.
 */
const SLAM: Move<L> = posed({
  name: 'slam',
  cooldown: 1.5,
  timing: (b) => ({ windup: b.phase === 1 ? 1.05 : 0.85, active: 0.16, recover: b.phase === 1 ? 2.1 : 1.7 }),
  weight: (b, d) => (d >= 2.5 && d <= 8.5 ? (b.phase === 1 ? 2.5 : 3) : d < 2.5 ? 0.6 : 0.3),
  enter(b, step, env) {
    if (step === 'windup') env.sfx.creak();
    if (step === 'recover') b.impact(env);
  },
  update(b, step) {
    if (step === 'windup') {
      b.turnRate = 1;
      if (b.distToPlayer > 5) b.vel.copy(b.toPlayer).multiplyScalar(1.8);
    } else {
      // Active, then stuck: tugging at the pole, head low and exposed (the rig), until it yanks free.
      b.turnRate = 0;
    }
  },
});

/** Cold Flame Volley: rears back, the flame swells, and a fan of homing orbs flies out. */
const VOLLEY: Move<L> = posed({
  name: 'volley',
  cooldown: 3.2,
  timing: (b) => ({ windup: 0.85, active: b.phase === 1 ? 0.3 : 0.9, recover: 0.7 }),
  weight: (_b, d) => (d >= 8 ? 3 : d >= 5.5 ? 1.2 : 0),
  enter(b, step, env) {
    if (step === 'windup') env.sfx.inhale();
    if (step === 'active') {
      b.volley(env, b.phase === 1 ? 3 : 4);
      b.scratch.second = false;
    }
  },
  update(b, step, t, env) {
    if (step === 'windup') {
      b.turnRate = 1.8;
    } else if (step === 'active') {
      b.turnRate = 1.2;
      if (b.phase >= 2 && t > 0.55 && !b.scratch.second) {
        b.scratch.second = true;
        b.volley(env, 4);
      }
    } else {
      b.turnRate = 1;
    }
  },
});

/** Spin: punishes standing behind it. A hiss, a crouch, then a full whirl of the pole. */
const SPIN: Move<L> = posed({
  name: 'spin',
  timing: () => ({ windup: 0.5, active: 0.38, recover: 0.75 }),
  weight: () => 0,
  enter(b, step, env) {
    if (step === 'windup') env.sfx.hiss();
    if (step === 'active') {
      env.sfx.heavySwing();
      b.scratch.hitDone = false;
    }
  },
  update(b, step, t, env, dt) {
    b.turnRate = 0;
    if (step === 'active') {
      b.yaw += (Math.PI * 2 * dt) / 0.38;
      if (t > 0.4 && !b.scratch.hitDone) {
        b.scratch.hitDone = true;
        if (b.distToPlayer < 5.4 && env.playerPos.y - b.pos.y < 1.4) env.hitPlayer(b.pos, ATTACKS.spin);
      }
    }
  },
});

/**
 * Skitter (phase two): drops onto all fours with its eyes burning red, scuttles at you in a
 * zigzag and lunges. Crushes a whole guard: block with all three slots up, or jump it.
 * Afterward it's low and open.
 */
const SKITTER: Move<L> = posed({
  name: 'skitter',
  cooldown: 5,
  timing: () => ({ windup: 0.65, active: 1.6, recover: 1.3 }),
  weight: (b, d) => (b.phase >= 2 && d >= 5.5 ? 2.2 : 0),
  enter(b, step, env) {
    if (step === 'windup') env.sfx.shriek();
    if (step === 'active') b.scratch.lunged = false;
  },
  update(b, step, t, env) {
    if (step === 'windup') {
      b.turnRate = 3;
    } else if (step === 'active') {
      b.turnRate = 5;
      const side = new THREE.Vector3(-b.toPlayer.z, 0, b.toPlayer.x);
      b.vel.copy(b.toPlayer).multiplyScalar(11).addScaledVector(side, Math.sin(b.stepT * 11) * 4);
      if (b.distToPlayer < 2.7 && !b.scratch.lunged) {
        b.scratch.lunged = true;
        env.sfx.shriek();
        if (b.inArc(3.2, 1.2)) env.hitPlayer(b.pos, ATTACKS.skitter);
        b.skipStep();
      } else if (t >= 1) b.skipStep();
    } else {
      // Panting on all fours, head low: the opening.
      b.turnRate = 0.4;
    }
  },
});

/** Howl (half health): clutches its head, then tears open its coat and frees the wisps. */
const HOWL: Move<L> = posed({
  name: 'howl',
  timing: () => ({ windup: 0.9, active: 1.1, recover: 0.7 }),
  weight: () => 0,
  enter(b, step, env) {
    if (step === 'windup') env.sfx.creak();
    if (step === 'active') b.tearOpen(env);
  },
  update(b) {
    b.turnRate = 0.5;
  },
});

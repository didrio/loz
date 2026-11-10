import * as THREE from 'three';
import { angleDiff } from '../core/math';
import { Layer, SOLID, type Character, type Physics } from '../core/physics';
import type { MusicMood } from '../core/tracks';
import { Enemy, type EnemyEnv, type Hurtbox, type HurtResult } from './enemies';

/**
 * - dormant: waiting in its arena, not fighting (walking in triggers the intro)
 * - intro: playing its entrance; `ready` turns true when done, then content calls `engage()`
 * - fight: running its moveset
 * - dying: playing its death; `gone` turns true at the end and it's removed
 */
export type BossState = 'dormant' | 'intro' | 'fight' | 'dying';

export type MoveStep = 'windup' | 'active' | 'recover';

export interface MoveTiming {
  windup: number;
  active: number;
  recover: number;
}

/**
 * One attack in a boss's moveset. Every move has the same three steps, which is what makes
 * a fight readable and fair:
 * - **windup**: the telegraph. Long enough to see coming and react to.
 * - **active**: when it can hurt.
 * - **recover**: the boss is committed and open to punishment.
 */
export interface Move<B extends Boss = Boss> {
  readonly name: string;
  /** Step durations, read when the move starts (so they can depend on the phase). */
  timing(boss: B): MoveTiming;
  /** Seconds before this move can be picked again. */
  readonly cooldown?: number;
  /** Relative chance of picking this move now, given the distance to the player (0 = not now). */
  weight(boss: B, dist: number): number;
  /** Called once as each step begins. */
  enter?(boss: B, step: MoveStep, env: EnemyEnv): void;
  /** Called every frame with the step's progress `t` (0 → 1). */
  update?(boss: B, step: MoveStep, t: number, env: EnemyEnv, dt: number): void;
  /** Called when the move ends or is interrupted. */
  exit?(boss: B): void;
}

/**
 * Where a boss fights: it seals when the fight starts (content does that), and the boss
 * unseals and re-arms it if Wren dies mid-fight (`BossArena`, `WardenHearth`).
 */
export interface ArenaSeal {
  armed: boolean;
  unseal(): void;
}

export interface BossConfig {
  x: number;
  z: number;
  /** Floor height, indoors (floors stack in a dungeon, so the ground is found just above it). */
  y?: number;
  /** Facing while dormant. */
  yaw: number;
  hp: number;
  /** Capsule size for collisions. */
  radius: number;
  halfHeight: number;
  /** Fractions of max HP where the next phase starts, e.g. [0.5]. */
  phases?: number[];
}

/**
 * Base class for mini-bosses and bosses. Handles the parts every boss fight shares: health
 * and phases, the move state machine (choose → windup → active → recover), turning and
 * moving on the physics controller, guarding and weak points, timed follow-ups, the arena,
 * and resetting cleanly if the player dies. A concrete boss supplies its body (rig and
 * animation), its moves, its hurtboxes and its guard rules.
 */
export abstract class Boss extends Enemy {
  /** A boss always thinks every frame, near or far (`EnemyManager`). */
  override readonly mayIdleFar = false;
  abstract readonly title: string;
  abstract readonly epithet: string;
  /** The song while it's engaged. */
  readonly music: MusicMood = 'boss';
  readonly maxHp: number;
  state: BossState = 'dormant';
  phase = 1;
  yaw: number;
  /** Max turn speed toward the player (rad/s). Moves set it per step; stalking resets it. */
  turnRate = 2;
  /** Horizontal velocity this frame, set by stalking and moves. */
  readonly vel = new THREE.Vector3();
  move: Move<this> | null = null;
  step: MoveStep = 'windup';
  /** Seconds into the current step. */
  stepT = 0;
  /** Seconds since the state last changed (intro and death animations use this). */
  stateT = 0;
  /** True once the intro has played; content then calls `engage()`. */
  ready = false;
  /** Ignores all damage (phase transitions, intros). */
  invulnerable = false;
  /** How dark the arena should get (0–1) while fighting. */
  gloom = 0;
  /** Set by content: called once when the boss is beaten. */
  onDefeated: (() => void) | null = null;
  /** Where it may stand (arenas with drops): it stops rather than walk where this says no. */
  walkable: ((x: number, z: number) => boolean) | null = null;
  /** Per-move notes ("already hit", "second salvo fired"), cleared when a move starts. */
  readonly scratch: Record<string, boolean> = {};
  /** Unit vector toward the player and the distance, refreshed every fight frame. */
  readonly toPlayer = new THREE.Vector3();
  distToPlayer = Infinity;

  protected readonly character: Character;
  protected readonly home: THREE.Vector3;
  protected readonly homeYaw: number;
  protected env: EnemyEnv | null = null;
  private readonly phaseAt: number[];
  private pendingPhase = 0;
  private timing: MoveTiming = { windup: 0, active: 0, recover: 0 };
  private skip = false;
  private queued: Move<this> | null = null;
  private decideT = 1;
  private readonly cooldowns = new Map<string, number>();
  private history: string[] = [];
  private timers: { t: number; fn: () => void }[] = [];
  private velY = 0;
  private phaseMoveRunning = false;

  constructor(
    parent: THREE.Object3D,
    protected readonly physics: Physics,
    protected readonly arena: ArenaSeal | null,
    cfg: BossConfig,
  ) {
    super();
    this.maxHp = this.hp = cfg.hp;
    this.phaseAt = cfg.phases ?? [];
    const y = cfg.y === undefined ? physics.groundY(cfg.x, cfg.z, 400, Layer.World) ?? 0 : physics.groundY(cfg.x, cfg.z, cfg.y + 1, Layer.World) ?? cfg.y;
    this.home = new THREE.Vector3(cfg.x, y, cfg.z);
    this.pos.copy(this.home);
    this.yaw = this.homeYaw = cfg.yaw;
    this.radius = cfg.radius;
    this.character = physics.createCharacter(this.pos, cfg.radius, cfg.halfHeight, Layer.Enemy, SOLID | Layer.Player);
    parent.add(this.root);
  }

  // --- what a concrete boss provides ---------------------------------------------

  /** Every move it can pick during the fight. */
  protected abstract moves(): Move<this>[];
  /** Poses the rig for this frame. Called after movement. */
  protected abstract animate(dt: number): void;
  /** Seconds the intro and the death take. */
  protected abstract readonly introDuration: number;
  protected abstract readonly dyingDuration: number;
  /** A move to play when a new phase starts (the boss is invulnerable during it). */
  protected phaseMove(_phase: number): Move<this> | null {
    return null;
  }
  /** Whether a hit from direction `toAttacker` on `part` is parried. */
  protected isGuarding(_toAttacker: THREE.Vector3, _part: string) {
    return false;
  }
  protected damageMultiplier(_part: string) {
    return 1;
  }
  /**
   * Open to the sword right now (a stagger, a kneel). While true, the body pulses red so the
   * player can see it: every boss with a "now!" window just returns its flag here.
   */
  protected get exposed() {
    return false;
  }
  protected applyFlash(dt: number) {
    super.applyFlash(dt);
    if (this.flash > 0 || !this.exposed || !this.alive) return;
    const k = 0.32 + 0.22 * Math.sin(this.stateT * 9);
    for (const m of this.flashMats) m.emissive.setRGB(k, k * 0.06, k * 0.06);
  }
  /** Seconds to wait between moves. */
  protected decideDelay() {
    return 1;
  }
  /** Approaches, backs off or circles between moves. Override for a different gait. */
  protected stalk(_dt: number, speed = 2.5, near = 3.5, far = 6) {
    const side = new THREE.Vector3(-this.toPlayer.z, 0, this.toPlayer.x);
    if (this.distToPlayer > far) this.vel.copy(this.toPlayer).multiplyScalar(speed);
    else if (this.distToPlayer < near) this.vel.copy(this.toPlayer).multiplyScalar(-speed * 0.6);
    else this.vel.copy(side).multiplyScalar(speed * 0.35 * (Math.sin(this.stateT * 0.5) > 0 ? 1 : -1));
  }
  /** Extra cleanup when the fight resets (restore torn cloaks, kill minions...). */
  protected onReset() {}
  /** Called once when it dies (before `onDefeated`). */
  protected onDeath() {}

  // --- control from content and the game ------------------------------------------

  get targetable() {
    return this.alive && this.state === 'fight';
  }

  /** Entrances, deaths and idling play through cutscenes; the fight itself freezes. */
  animatesInCutscene() {
    return this.state !== 'fight' || !this.alive;
  }

  /** Fighting right now (the HUD shows the health bar). */
  get engaged() {
    return this.state === 'fight';
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Starts the intro (content calls this from the encounter script). */
  wake() {
    if (this.state !== 'dormant') return;
    this.setState('intro');
    this.ready = false;
  }

  /** Starts fighting. */
  engage() {
    this.setState('fight');
    this.decideT = 1.2;
  }

  /** Forces a move by name (debugging and tests). */
  forceMove(name: string) {
    const m = this.moves().find((x) => x.name === name) ?? null;
    if (m && this.env) this.startMove(m, this.env);
    return !!m;
  }

  /** Drops whatever it's doing and plays `name` now (a stagger). */
  interruptWith(name: string) {
    const m = this.moves().find((x) => x.name === name);
    if (!m || !this.env) return false;
    this.move?.exit?.(this);
    this.move = null;
    this.queued = null;
    this.timers = [];
    this.startMove(m, this.env);
    return true;
  }

  /** Runs `fn` after `seconds` of fight time (follow-up shockwaves, delayed effects). */
  later(seconds: number, fn: () => void) {
    this.timers.push({ t: seconds, fn });
  }

  /** Plays `move` right after the current one (combos). */
  queue(move: Move<this>) {
    this.queued = move;
  }

  /** Ends the current step now (a lunge that connected early, a charge that arrived). */
  skipStep() {
    this.skip = true;
  }

  /** Progress through the current step, 0 → 1. */
  get stepProgress() {
    const d = this.timing[this.step];
    return d > 0 ? Math.min(1, this.stepT / d) : 1;
  }

  /** Health it cannot be hurt below right now (0: it can die). Bosses with several punish windows raise it between them. */
  protected hpFloor() {
    return 0;
  }

  hurt(dmg: number, from: THREE.Vector3, part = 'body'): HurtResult {
    if (!this.alive || this.state !== 'fight' || this.invulnerable) return 'ignored';
    const toAttacker = from.clone().sub(this.pos).setY(0).normalize();
    if (this.isGuarding(toAttacker, part)) return 'guarded';
    const mult = this.damageMultiplier(part);
    this.takeDamage(dmg * mult);
    this.onHurt();
    if (this.hp <= 0) this.die();
    return mult > 1 ? 'weak' : 'hit';
  }

  /**
   * Damage from nothing Wren did (the Lamplighter's dawn burn): no guard, no weak point and no
   * `onHurt` reaction, but it still respects invulnerability and moves the phases. False when ignored.
   */
  sear(dmg: number) {
    if (!this.alive || this.state !== 'fight' || this.invulnerable) return false;
    this.takeDamage(dmg);
    if (this.hp <= 0) this.die();
    return true;
  }

  private takeDamage(dmg: number) {
    this.hp = Math.max(this.hpFloor(), this.hp - dmg);
    this.flash = 0.15;
    while (this.phase - 1 < this.phaseAt.length && this.hp <= this.maxHp * this.phaseAt[this.phase - 1] && this.hp > 0) {
      this.phase++;
      this.pendingPhase = this.phase;
    }
  }

  onPlayerRespawn() {
    if (this.state === 'fight' || this.state === 'intro') this.reset();
  }

  /** Back to the start of the encounter: full health, dormant at home, arena open and armed. */
  reset() {
    this.move?.exit?.(this);
    this.move = null;
    this.queued = null;
    this.timers = [];
    this.cooldowns.clear();
    this.history = [];
    this.hp = this.maxHp;
    this.alive = true;
    this.phase = 1;
    this.pendingPhase = 0;
    this.invulnerable = false;
    this.phaseMoveRunning = false;
    this.ready = false;
    this.gloom = 0;
    this.vel.set(0, 0, 0);
    this.pos.copy(this.home);
    this.yaw = this.homeYaw;
    this.character.teleport(this.home);
    this.setState('dormant');
    if (this.arena) {
      this.arena.unseal();
      this.arena.armed = true;
    }
    this.onReset();
  }

  dispose() {
    super.dispose();
    this.character.dispose();
  }

  // --- the loop -------------------------------------------------------------------

  update(dt: number, env: EnemyEnv) {
    this.env = env;
    this.applyFlash(dt);
    this.stateT += dt;
    this.vel.set(0, 0, 0);
    this.toPlayer.copy(env.playerPos).sub(this.pos).setY(0);
    this.distToPlayer = this.toPlayer.length();
    this.toPlayer.normalize();

    if (this.state === 'intro' && this.stateT >= this.introDuration) this.ready = true;
    if (this.state === 'fight') this.fight(dt, env);
    if (this.state === 'dying' && this.stateT >= this.dyingDuration) this.gone = true;

    if (this.walkable && (this.vel.x || this.vel.z)) {
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      if (!this.walkable(nx, nz)) {
        if (this.walkable(nx, this.pos.z)) this.vel.z = 0;
        else if (this.walkable(this.pos.x, nz)) this.vel.x = 0;
        else this.vel.set(0, 0, 0);
      }
    }
    if (this.state !== 'dying') {
      this.velY = this.character.grounded ? -1 : this.velY - 30 * dt;
      this.character.move(this.pos, new THREE.Vector3(this.vel.x * dt, this.velY * dt, this.vel.z * dt));
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.animate(dt);
  }

  private fight(dt: number, env: EnemyEnv) {
    for (const t of this.timers.splice(0)) {
      t.t -= dt;
      if (t.t <= 0) t.fn();
      else this.timers.push(t);
    }
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - dt);

    if (this.pendingPhase) {
      const pm = this.phaseMove(this.pendingPhase);
      this.pendingPhase = 0;
      if (pm) {
        this.move?.exit?.(this);
        this.move = null;
        this.queued = null;
        this.phaseMoveRunning = true;
        this.invulnerable = true;
        this.startMove(pm, env);
      }
    }

    if (this.move) {
      this.stepT += dt;
      this.move.update?.(this, this.step, this.stepProgress, env, dt);
      if (this.move && (this.skip || this.stepT >= this.timing[this.step])) this.advance(env);
    } else if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.startMove(q, env);
    } else {
      this.turnRate = this.baseTurnRate();
      this.stalk(dt);
      this.decideT -= dt;
      if (this.decideT <= 0) {
        const m = this.choose();
        if (m) this.startMove(m, env);
        else this.decideT = 0.3;
      }
    }

    const want = Math.atan2(this.toPlayer.x, this.toPlayer.z);
    const d = angleDiff(this.yaw, want);
    this.yaw += Math.max(-this.turnRate * dt, Math.min(this.turnRate * dt, d));
  }

  /** Turn speed while stalking. */
  protected baseTurnRate() {
    return 2;
  }

  private choose() {
    const base = this.moves().map((m) => ({ m, w: (this.cooldowns.get(m.name) ?? 0) > 0 ? 0 : m.weight(this, this.distToPlayer) }));
    // Never the same move three times running (keeps it readable but varied), unless it's
    // the only thing it can do right now.
    const last = this.history.length >= 2 && this.history[this.history.length - 1] === this.history[this.history.length - 2] ? this.history[this.history.length - 1] : null;
    let options = base.filter((o) => o.w > 0 && o.m.name !== last);
    if (!options.length) options = base.filter((o) => o.w > 0);
    const total = options.reduce((s, o) => s + o.w, 0);
    if (total <= 0) return null;
    let r = this.rng() * total;
    for (const o of options) {
      r -= o.w;
      if (r <= 0) return o.m;
    }
    return options[options.length - 1].m;
  }

  private startMove(m: Move<this>, env: EnemyEnv) {
    this.move = m;
    this.step = 'windup';
    this.stepT = 0;
    this.skip = false;
    this.timing = m.timing(this);
    for (const k of Object.keys(this.scratch)) delete this.scratch[k];
    this.history.push(m.name);
    if (this.history.length > 4) this.history.shift();
    m.enter?.(this, 'windup', env);
  }

  private advance(env: EnemyEnv) {
    const m = this.move!;
    this.skip = false;
    this.stepT = 0;
    if (this.step === 'windup' || this.step === 'active') {
      this.step = this.step === 'windup' ? 'active' : 'recover';
      m.enter?.(this, this.step, env);
      return;
    }
    m.exit?.(this);
    this.cooldowns.set(m.name, m.cooldown ?? 0);
    this.move = null;
    this.decideT = this.decideDelay();
    if (this.phaseMoveRunning) {
      this.phaseMoveRunning = false;
      this.invulnerable = false;
    }
  }

  private die() {
    this.alive = false;
    this.move?.exit?.(this);
    this.move = null;
    this.queued = null;
    this.timers = [];
    this.env?.hazards.clear(); // what it made ends with it, so none shows in the death scene
    this.setState('dying');
    this.onDeath();
    this.onDefeated?.();
  }

  private setState(s: BossState) {
    this.state = s;
    this.stateT = 0;
  }

  /** Hurtbox helper: a sphere at a point in a rig node's local space. */
  protected box(node: THREE.Object3D, local: THREE.Vector3, radius: number, part: string, priority = 0): Hurtbox {
    return { center: local.clone().applyMatrix4(node.matrixWorld), radius, part, priority };
  }
}

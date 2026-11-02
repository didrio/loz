import * as THREE from 'three';
import { clamp, damp, easeOut, lerpAngle, mix } from '../core/math';
import { Layer, SOLID, type Character, type Physics } from '../core/physics';
import { buildHumanoid, type Humanoid } from '../render/characters';
import { mat, uniqueMat } from '../render/materials';
import type { Area } from '../world/area';
import type { Attack, Enemy, HitResult, Hurtbox, HurtResult } from './enemies';
import { Guard } from './guard';

/** What the player wants to do this frame, in world space. Built from input, or by scripts. */
export interface Controls {
  /** Desired horizontal direction, length 0–1. */
  move: THREE.Vector3;
  attack: boolean;
  shield: boolean;
  jump: boolean;
}

export const NO_CONTROLS: Controls = { move: new THREE.Vector3(), attack: false, shield: false, jump: false };

export interface PlayerEnv {
  area: Area;
  lockTarget: Enemy | null;
  enemies: readonly Enemy[];
  hasSword: boolean;
  onSwing(): void;
  /** The sword reached an enemy; `result` says whether it hurt, hit a weak point or was guarded. */
  onHitEnemy(e: Enemy, result: HurtResult, at: THREE.Vector3): void;
  onCutBush(at: THREE.Vector3): void;
  onJump(): void;
}

/** Hearts live in the save state; the player just reads and writes them. */
export interface Health {
  hp: number;
  maxHp: number;
}

type State = 'move' | 'attack' | 'hurt';

// Three-hit combo: right-to-left, left-to-right, then an overhead chop.
const SWINGS = [
  { dur: 0.3, dmg: 1 },
  { dur: 0.3, dmg: 1 },
  { dur: 0.42, dmg: 2 },
];
const RUN_SPEED = 8.5;
const GRAVITY = 30;

export class Player {
  readonly h: Humanoid;
  readonly pos = new THREE.Vector3();
  readonly radius = 0.4;
  facing = Math.PI;
  invuln = 0;
  shielding = false;
  /** The shield's three guard slots (see guard.ts). */
  readonly guard = new Guard();
  fluting = false;
  private readonly body: Character;
  private velY = 0;
  private state: State = 'move';
  private t = 0;
  private combo = 0;
  private queued = false;
  private hitSet = new Set<Enemy>();
  private bushesCut = false;
  private knock = new THREE.Vector3();
  private walkPhase = 0;
  private speedXZ = 0;
  private deathT = 0;
  private readonly sword = new THREE.Group();
  private readonly shield = new THREE.Group();
  private readonly flute: THREE.Mesh;
  private readonly trail: THREE.Mesh;
  private readonly trailPivot = new THREE.Group();
  /** The shield's wood; flashes red while the guard is broken. */
  private readonly shieldMat = uniqueMat(0x8b5a2b);

  constructor(scene: THREE.Scene, physics: Physics, private readonly health: Health) {
    this.h = buildHumanoid({ skin: 0xf0c49c, hair: 0x2e2018, coat: 0xb4532a, pants: 0x4a4038, boots: 0x5a3a22, accent: 0x2aa198 });
    scene.add(this.h.root);
    this.body = physics.createCharacter(this.pos, this.radius, 0.5, Layer.Player, SOLID | Layer.Enemy);

    // Sword in the right hand, blade continuing the line of the arm.
    const steel = mat(0xd8dde3), gold = mat(0xc9a227), grip = mat(0x3a2412);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.03), steel);
    blade.position.y = -0.78;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.057, 0.18, 4), steel);
    tip.rotation.x = Math.PI;
    tip.position.y = -1.39;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.1), gold);
    guard.position.y = -0.22;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6), grip);
    hilt.position.y = -0.08;
    for (const m of [blade, tip, guard, hilt]) m.castShadow = true;
    this.sword.add(blade, tip, guard, hilt);
    this.sword.position.y = -0.62;
    this.sword.visible = false;
    this.h.armR.add(this.sword);

    // A round wooden shield on the left arm. It counter-rotates to keep facing forward.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), this.shieldMat);
    disc.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 4, 16), mat(0x9a9fa6));
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0x9a9fa6));
    boss.position.z = 0.05;
    for (const m of [disc, rim, boss]) m.castShadow = true;
    this.shield.add(disc, rim, boss);
    this.shield.position.set(0.12, -0.42, 0.12);
    this.h.armL.add(this.shield);

    this.flute = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), mat(0xd9b77a));
    this.flute.rotation.z = Math.PI / 2;
    this.flute.position.set(0, -0.1, 0.32);
    this.flute.visible = false;
    this.h.head.add(this.flute);

    this.trail = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 2.3, 18, 1, 0, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.trailPivot.add(this.trail);
    scene.add(this.trailPivot);
  }

  get hp() {
    return this.health.hp;
  }

  get alive() {
    return this.health.hp > 0;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  get grounded() {
    return this.body.grounded;
  }

  setSword(has: boolean) {
    this.sword.visible = has;
  }

  /** Moves instantly, e.g. on spawn or when a script relocates the player. */
  teleport(x: number, y: number, z: number, facing = this.facing) {
    this.pos.set(x, y, z);
    this.facing = facing;
    this.velY = 0;
    this.knock.set(0, 0, 0);
    this.body.teleport(this.pos);
  }

  /** Back on your feet: full hearts, brief invulnerability, normal pose. */
  revive() {
    this.health.hp = this.health.maxHp;
    this.state = 'move';
    this.invuln = 2;
    this.deathT = 0;
    this.guard.reset();
    this.h.pivot.rotation.set(0, 0, 0);
  }

  /**
   * An enemy attack lands (or doesn't). Recent hits make you untouchable for a moment and
   * ground-only attacks miss while you're in the air. A raised shield stops frontal attacks
   * (unless unblockable) at the cost of guard slots; if the guard can't afford it, it breaks:
   * the hit is still stopped, but you're knocked back and lose the shield for a while.
   */
  receiveHit(from: THREE.Vector3, a: Attack): HitResult {
    if (!this.alive || this.invuln > 0) return 'miss';
    if (a.groundOnly && !this.body.grounded) return 'miss';
    const toEnemy = from.clone().sub(this.pos).setY(0).normalize();
    const knock = a.knockback ?? 12;
    if (!a.unblockable && this.shielding && toEnemy.dot(this.forward) > 0.35) {
      if (this.guard.block(a.guard) === 'blocked') {
        this.knock.copy(toEnemy).multiplyScalar(-Math.max(4, knock * 0.5));
        return 'blocked';
      }
      this.knock.copy(toEnemy).multiplyScalar(-Math.max(9, knock));
      this.shielding = false;
      return 'broken';
    }
    this.health.hp = Math.max(0, this.health.hp - a.damage);
    this.invuln = 1.2;
    this.knock.copy(toEnemy).multiplyScalar(-knock);
    this.velY = 5;
    this.state = 'hurt';
    this.t = 0;
    return 'hit';
  }

  /** Shoved away from `from` (a roar, a blast) without damage. */
  push(from: THREE.Vector3, strength: number) {
    this.knock.copy(this.pos).sub(from).setY(0).normalize().multiplyScalar(strength);
  }

  /** The sword bounced off a guard: stagger back and lose the combo. */
  recoil(from: THREE.Vector3) {
    this.knock.copy(this.pos).sub(from).setY(0).normalize().multiplyScalar(7);
    this.queued = false;
  }

  private startAttack(i: number, env: PlayerEnv) {
    this.state = 'attack';
    this.combo = i;
    this.t = 0;
    this.queued = false;
    this.hitSet.clear();
    this.bushesCut = false;
    env.onSwing();
  }

  update(dt: number, c: Controls, env: PlayerEnv) {
    this.invuln = Math.max(0, this.invuln - dt);
    // Guard slots only recover while the shield is lowered (last frame's state).
    this.guard.update(dt, this.shielding);
    const water = env.area.waterLevel;
    const wading = water !== null && this.pos.y < water - 0.35;
    const lock = env.lockTarget;
    const grounded = this.body.grounded;
    const canAct = this.alive && !this.fluting;
    const move = canAct ? c.move : NO_CONTROLS.move;
    // The shield stays up through jumps: hold it, hop, keep blocking.
    this.shielding = canAct && this.state === 'move' && c.shield && this.guard.canBlock;

    if (canAct && env.hasSword && c.attack) {
      if (this.state === 'move') this.startAttack(0, env);
      else if (this.state === 'attack' && this.t > SWINGS[this.combo].dur * 0.4 && this.combo < 2) this.queued = true;
    }
    let jumped = false;
    if (canAct && this.state === 'move' && grounded && c.jump) {
      this.velY = wading ? 8 : 11;
      jumped = true;
      env.onJump();
    }

    const vel = new THREE.Vector3();
    this.t += dt;
    switch (this.state) {
      case 'move': {
        const speed = this.shielding ? 3.2 : wading ? 5 : RUN_SPEED;
        vel.copy(move).multiplyScalar(speed);
        if (!lock && move.lengthSq() > 0.01 && !this.shielding) {
          this.facing = lerpAngle(this.facing, Math.atan2(move.x, move.z), damp(14, dt));
        }
        break;
      }
      case 'attack': {
        const sw = SWINGS[this.combo];
        vel.copy(this.forward).multiplyScalar(this.t < 0.12 ? 3 : 0);
        if (this.t > 0.07 && this.t < sw.dur * 0.75) this.swordHits(env, sw.dmg);
        if (this.t >= sw.dur) {
          if (this.queued) this.startAttack(this.combo + 1, env);
          else this.state = 'move';
        }
        break;
      }
      case 'hurt':
        if (this.t > 0.35) this.state = 'move';
        break;
    }
    if (lock && lock.alive && this.alive) {
      const to = lock.pos.clone().sub(this.pos);
      this.facing = lerpAngle(this.facing, Math.atan2(to.x, to.z), damp(16, dt));
    }

    vel.add(this.knock);
    this.knock.multiplyScalar(Math.exp(-8 * dt));

    // Gravity: a small constant push down keeps the controller's ground detection honest.
    if (grounded && !jumped && this.velY <= 0) this.velY = -1;
    else this.velY -= GRAVITY * dt;
    const before = this.pos.y;
    const want = new THREE.Vector3(vel.x * dt, this.velY * dt, vel.z * dt);
    this.body.move(this.pos, want);
    if (this.velY > 0 && this.pos.y - before < want.y * 0.5) this.velY = 0; // bumped a ceiling
    this.speedXZ = Math.hypot(vel.x, vel.z);

    this.animate(dt);
  }

  /** The hurtbox the sword can reach this swing, preferring weak points, or null. */
  private reachable(boxes: Hurtbox[]) {
    const f = this.forward;
    const reach = 2.6;
    // The blade sweeps from knee to just over the head; the overhead chop reaches higher.
    const low = 0.15, high = this.combo === 2 ? 3.1 : 2.5;
    let best: Hurtbox | null = null, bestD = Infinity;
    for (const box of boxes) {
      const to = box.center.clone().sub(this.pos);
      const y = to.y;
      if (y + box.radius < low || y - box.radius > high) continue;
      to.setY(0);
      const d = to.length() - box.radius;
      if (d > reach) continue;
      if (to.length() > 0.8 && to.normalize().dot(f) < 0.15) continue;
      if (!best || box.priority > best.priority || (box.priority === best.priority && d < bestD)) {
        best = box;
        bestD = d;
      }
    }
    return best;
  }

  private swordHits(env: PlayerEnv, dmg: number) {
    for (const e of env.enemies) {
      if (!e.alive || this.hitSet.has(e)) continue;
      const box = this.reachable(e.hurtboxes());
      if (!box) continue;
      this.hitSet.add(e);
      const result = e.hurt(dmg, this.pos, box.part);
      if (result === 'guarded') this.recoil(e.pos);
      env.onHitEnemy(e, result, box.center);
    }
    if (!this.bushesCut) {
      const f = this.forward;
      const cut = env.area.cut(this.pos.x, this.pos.z, f.x, f.z, 2.2);
      if (cut.length) this.bushesCut = true;
      for (const p of cut) env.onCutBush(p);
    }
  }

  private animate(dt: number) {
    const { h } = this;
    h.root.position.copy(this.pos);
    h.root.rotation.y = this.facing;
    const amt = clamp(this.speedXZ / RUN_SPEED, 0, 1);
    this.walkPhase += dt * (4 + this.speedXZ * 1.1) * (amt > 0.05 ? 1 : 0);
    const s = Math.sin(this.walkPhase);

    // Defaults: walk cycle.
    h.legL.rotation.x = s * 0.8 * amt;
    h.legR.rotation.x = -s * 0.8 * amt;
    h.armL.rotation.set(-s * 0.5 * amt, 0, 0.08);
    h.armR.rotation.set(s * 0.5 * amt - (this.sword.visible ? 0.35 : 0), 0, -0.08);
    h.pivot.position.y = 0.9 + Math.abs(s) * 0.07 * amt;
    h.pivot.rotation.set(0, 0, 0);
    this.sword.rotation.x = -1.1;
    this.flute.visible = this.fluting;
    const trailMat = this.trail.material as THREE.MeshBasicMaterial;
    trailMat.opacity = Math.max(0, trailMat.opacity - dt * 5);

    if (!this.body.grounded) {
      h.legL.rotation.x = -0.6;
      h.legR.rotation.x = 0.3;
    }

    if (!this.alive) {
      this.deathT += dt;
      h.pivot.rotation.x = (-Math.min(1, this.deathT * 2) * Math.PI) / 2;
      h.pivot.position.y = 0.3;
      h.legL.rotation.x = h.legR.rotation.x = 0;
    } else if (this.state === 'attack') {
      const sw = SWINGS[this.combo];
      const p = clamp(this.t / sw.dur, 0, 1);
      const e = easeOut(clamp((p - 0.12) / 0.6, 0, 1));
      this.sword.rotation.x = 0;
      if (this.combo === 2) {
        h.armR.rotation.set(mix(-3.1, -0.5, e), 0, 0);
        h.pivot.rotation.x = mix(-0.1, 0.25, e);
      } else {
        const from = this.combo === 0 ? -1.7 : 1.4;
        const to = this.combo === 0 ? 1.4 : -1.7;
        h.armR.rotation.set(-1.45, mix(from, to, e), 0);
        h.pivot.rotation.y = mix(-0.4, 0.4, this.combo === 0 ? e : 1 - e);
      }
      h.legL.rotation.x = 0.4;
      h.legR.rotation.x = -0.3;
      if (p > 0.15 && p < 0.7) {
        trailMat.opacity = 0.45;
        this.trailPivot.position.copy(this.pos).setY(this.pos.y + (this.combo === 2 ? 1.5 : 1.2));
        this.trailPivot.rotation.y = this.facing;
        // Horizontal arc centered on forward, or a vertical arc for the overhead chop.
        if (this.combo === 2) this.trail.rotation.set(0, -Math.PI / 2, 0);
        else this.trail.rotation.set(-Math.PI / 2, 0, -Math.PI * 0.95);
      }
    } else if (this.state === 'hurt') {
      h.pivot.rotation.x = -0.35;
      h.armL.rotation.x = h.armR.rotation.x = -0.8;
    }

    if (this.shielding) h.armL.rotation.set(-1.25, -0.6, 0);
    this.shield.rotation.set(-h.armL.rotation.x, 0, 0);
    // Guard broken: the shield arm hangs, the shield droops and flashes red until it recovers.
    const broken = this.guard.broken;
    if (broken > 0) {
      h.armL.rotation.set(0.35, 0, 0.45 + Math.sin(broken * 18) * 0.05);
      this.shield.rotation.set(0.5, 0.4, 0.3);
    }
    const flash = broken > 0 && Math.floor(broken * 6) % 2 === 0 ? 1 : 0;
    this.shieldMat.color.setHex(flash ? 0xc0392b : 0x8b5a2b);

    if (this.fluting) {
      h.armL.rotation.set(-2.0, -0.55, 0);
      h.armR.rotation.set(-2.0, 0.55, 0);
      h.legL.rotation.x = h.legR.rotation.x = 0;
    }

    h.root.visible = this.invuln <= 0 || Math.floor(this.invuln * 16) % 2 === 0;
  }
}

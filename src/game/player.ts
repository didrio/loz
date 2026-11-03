import * as THREE from 'three';
import { clamp, damp, easeOut, lerpAngle, mix } from '../core/math';
import { Layer, SOLID, type Character, type Physics } from '../core/physics';
import { buildHumanoid, type Humanoid } from '../render/characters';
import { isSharedMaterial, mat, uniqueMat } from '../render/materials';
import type { Area } from '../world/area';
import type { Attack, Enemy, HitResult, Hurtbox, HurtResult } from './enemies';
import { ATTACK_BOOST } from './drinks';
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
/** Wren's tunic: orange, or slate-blue once the Stoneward Tunic is bought. */
const COAT = 0xb4532a;
const STONEWARD_COAT = 0x6b8296;
const RUN_SPEED = 8.5;
/** While the guard is broken Wren staggers: a crawl at this fraction of normal speed, no jumping, no sword. */
const STAGGER_SPEED = 0.06;
/** The shield lowered: on the outside of the left forearm (arm space), face turned ~80° out to the side. */
const SHIELD_REST_POS = new THREE.Vector3(0.14, -0.4, 0.02);
const SHIELD_REST_YAW = 1.4;
/** The shield raised: its center in front of the chest (body space, before the character's scale). */
const SHIELD_BLOCK_POS = new THREE.Vector3(0.05, 1.2, 0.62);
/** How far the sword reaches (from Wren's centre to a hurtbox's surface). */
export const SWORD_REACH = 2.6;

/**
 * The hurtbox a swing from `pos` facing `forward` reaches, or null: the nearest armor if it's
 * in the way (nearer than the target), else weak points first, then the nearest part.
 */
export function swordTarget(boxes: Hurtbox[], pos: THREE.Vector3, forward: THREE.Vector3, chop = false): Hurtbox | null {
  // The blade sweeps from knee to just over the head; the overhead chop reaches higher.
  const low = 0.15, high = chop ? 3.1 : 2.5;
  let best: Hurtbox | null = null, bestD = Infinity;
  let armor: Hurtbox | null = null, armorD = Infinity;
  for (const box of boxes) {
    const to = box.center.clone().sub(pos);
    const y = to.y;
    if (y + box.radius < low || y - box.radius > high) continue;
    to.setY(0);
    const d = to.length() - box.radius;
    if (d > SWORD_REACH) continue;
    if (to.length() > 0.8 && to.normalize().dot(forward) < 0.15) continue;
    if (box.armor) {
      if (d < armorD) {
        armor = box;
        armorD = d;
      }
      continue;
    }
    if (!best || box.priority > best.priority || (box.priority === best.priority && d < bestD)) {
      best = box;
      bestD = d;
    }
  }
  return armor && armorD < bestD ? armor : best;
}

/** How long a glove throw holds the arm out (and the sword back). */
export const THROW_TIME = 0.5;
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
  private readonly body: Character;
  private velY = 0;
  private state: State = 'move';
  private t = 0;
  private combo = 0;
  private queued = false;
  private hitSet = new Set<Enemy>();
  private bushesCut = false;
  /** This swing has already struck the area (stones, crystals): once per swing. */
  private struck = false;
  private knock = new THREE.Vector3();
  private walkPhase = 0;
  private speedXZ = 0;
  private deathT = 0;
  private readonly sword = new THREE.Group();
  private readonly shield = new THREE.Group();
  private readonly trail: THREE.Mesh;
  private readonly trailPivot = new THREE.Group();
  /** The shield's wood; flashes red while the guard is broken. */
  private readonly shieldMat = uniqueMat(0x8b5a2b);
  /** The blade, its own material so it can glow while an Ember Tonic is active. */
  private readonly bladeMat = uniqueMat(0xd8dde3, { emissive: 0x000000 });
  /** Seconds left of an Ember Tonic (the sword hits harder meanwhile). */
  attackBoost = 0;
  /** Seconds left of a glove throw: the arm is out, no sword or shield until it's back. */
  throwT = 0;
  /** Dev builds only (G): multiplies run speed to cross the map quickly. Never on in the shipped game. */
  devSpeed = 1;
  private opacity = 1;
  private fadeMats: THREE.Material[] | null = null;
  private readonly coatMat = uniqueMat(COAT);
  /** Wearing the Stoneward Tunic: stone hits do half damage (rounded up). */
  private stoneward = false;

  constructor(scene: THREE.Scene, physics: Physics, private readonly health: Health) {
    this.h = buildHumanoid({ skin: 0xf0c49c, hair: 0x2e2018, coat: COAT, pants: 0x4a4038, boots: 0x5a3a22, accent: 0x2aa198 });
    // The tunic gets its own material, so buying the Stoneward Tunic can recolor it.
    const shared = mat(COAT);
    this.h.root.traverse((m) => {
      if (m instanceof THREE.Mesh && m.material === shared) m.material = this.coatMat;
    });
    scene.add(this.h.root);
    this.body = physics.createCharacter(this.pos, this.radius, 0.5, Layer.Player, SOLID | Layer.Enemy);

    // Sword in the right hand, blade continuing the line of the arm.
    const steel = mat(0xd8dde3), gold = mat(0xc9a227), grip = mat(0x3a2412);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 0.03), this.bladeMat);
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

    // A round wooden shield on the left arm (its face is local +z; `animate` sets the pose).
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), this.shieldMat);
    disc.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 4, 16), mat(0x9a9fa6));
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0x9a9fa6));
    boss.position.z = 0.05;
    for (const m of [disc, rim, boss]) m.castShadow = true;
    this.shield.add(disc, rim, boss);
    this.shield.position.copy(SHIELD_REST_POS);
    this.h.armL.add(this.shield);

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

  /**
   * Fades Wren (1 = solid, 0 = hidden) when the camera is pressed close, so she never blocks the view.
   * Dithered (`alphaHash`), not blended, so there's no sorting between her parts. The first
   * call gives her her own copies of any shared materials, so nothing else fades with her.
   */
  setOpacity(o: number) {
    if (o === this.opacity) return;
    this.opacity = o;
    if (!this.fadeMats) {
      const fadeMats: THREE.Material[] = (this.fadeMats = []);
      const copies = new Map<THREE.Material, THREE.Material>();
      this.h.root.traverse((m) => {
        if (!(m instanceof THREE.Mesh) || m === this.trail) return;
        const src = m.material as THREE.Material;
        let own = copies.get(src);
        if (!own) {
          own = isSharedMaterial(src) ? src.clone() : src;
          own.alphaHash = true;
          own.needsUpdate = true;
          copies.set(src, own);
          fadeMats.push(own);
        }
        m.material = own;
      });
    }
    for (const m of this.fadeMats) m.opacity = o;
    this.h.root.visible = o > 0.02;
  }

  setStoneward(on: boolean) {
    this.stoneward = on;
    this.coatMat.color.setHex(on ? STONEWARD_COAT : COAT);
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
  /**
   * Throws the Tether Glove toward `yaw` (turning to face it). Only from a standstill-ready
   * state: not mid-swing, hurt, staggered, or already throwing. True if it was thrown.
   */
  throwTether(yaw: number) {
    if (!this.alive || this.state !== 'move' || this.throwT > 0 || this.guard.broken > 0) return false;
    this.throwT = THROW_TIME;
    this.facing = yaw;
    return true;
  }

  /** Where the glove hand is, roughly (the cord starts here). */
  handPos() {
    const f = this.forward;
    return this.pos.clone().add(new THREE.Vector3(f.x * 0.55 + f.z * 0.3, 1.25, f.z * 0.55 - f.x * 0.3));
  }

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
    const damage = a.stone && this.stoneward ? Math.ceil(a.damage / 2) : a.damage;
    this.health.hp = Math.max(0, this.health.hp - damage);
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
    this.struck = false;
    this.bushesCut = false;
    env.onSwing();
  }

  update(dt: number, c: Controls, env: PlayerEnv) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.attackBoost = Math.max(0, this.attackBoost - dt);
    const ember = this.attackBoost > 0 ? 0.7 + Math.sin(this.attackBoost * 8) * 0.25 : 0;
    this.bladeMat.emissive.setRGB(1 * ember, 0.45 * ember, 0.1 * ember);
    // Guard slots only recover while the shield is lowered (last frame's state).
    this.guard.update(dt, this.shielding);
    const water = env.area.waterLevel;
    const wading = water !== null && this.pos.y < water - 0.35;
    const lock = env.lockTarget;
    const grounded = this.body.grounded;
    const canAct = this.alive;
    const move = canAct ? c.move : NO_CONTROLS.move;
    // The shield stays up through jumps: hold it, hop, keep blocking.
    this.shielding = canAct && this.state === 'move' && c.shield && this.guard.canBlock && this.throwT <= 0;

    // Staggered (guard broken): no sword either. A swing's lunge would carry Wren out of the crawl.
    const staggered = this.guard.broken > 0;
    if (canAct && env.hasSword && c.attack && this.throwT <= 0 && !staggered) {
      if (this.state === 'move') this.startAttack(0, env);
      else if (this.state === 'attack' && this.t > SWINGS[this.combo].dur * 0.4 && this.combo < 2) this.queued = true;
    }
    let jumped = false;
    if (canAct && this.state === 'move' && grounded && c.jump && !staggered) {
      this.velY = wading ? 8 : 11;
      jumped = true;
      env.onJump();
    }

    const vel = new THREE.Vector3();
    this.t += dt;
    switch (this.state) {
      case 'move': {
        const speed = (this.shielding ? 3.2 : wading ? 5 : RUN_SPEED) * (staggered ? STAGGER_SPEED : 1) * this.devSpeed;
        vel.copy(move).multiplyScalar(speed);
        if (!lock && move.lengthSq() > 0.01 && !this.shielding) {
          this.facing = lerpAngle(this.facing, Math.atan2(move.x, move.z), damp(40, dt)); // near-instant: turning shouldn't cost a step
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

  private swordHits(env: PlayerEnv, dmg: number) {
    for (const e of env.enemies) {
      if (!e.alive || this.hitSet.has(e)) continue;
      const box = swordTarget(e.hurtboxes(), this.pos, this.forward, this.combo === 2);
      if (!box) continue;
      this.hitSet.add(e);
      const result = e.hurt(dmg * (this.attackBoost > 0 ? ATTACK_BOOST : 1), this.pos, box.part);
      if (result === 'guarded') this.recoil(e.pos);
      env.onHitEnemy(e, result, box.center);
    }
    if (!this.struck && env.area.strike) {
      this.struck = true;
      const fw = this.forward;
      env.area.strike(this.pos.x, this.pos.y, this.pos.z, fw.x, fw.z, 2.4);
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

    // Throwing the glove: the left arm thrown straight out ahead.
    if (this.throwT > 0 && this.state === 'move') h.armL.rotation.set(-1.6, 0, 0.12);
    // Lowered, the shield rides on the outside of the forearm, its face turned out to Wren's left.
    this.shield.position.copy(SHIELD_REST_POS);
    this.shield.rotation.set(0, SHIELD_REST_YAW, 0);
    if (this.shielding) {
      // Raised: square in front of the chest, facing straight ahead whatever the arm is doing
      // (placed in body space, then expressed in the arm's frame).
      h.armL.rotation.set(-1.25, -0.6, 0);
      h.armL.updateMatrix();
      const inv = h.armL.quaternion.clone().invert();
      this.shield.quaternion.copy(inv);
      this.shield.position.copy(SHIELD_BLOCK_POS).sub(h.armL.position).applyQuaternion(inv);
    }
    // Guard broken: the shield arm hangs, the shield droops and flashes red until it recovers.
    const broken = this.guard.broken;
    if (broken > 0) {
      h.armL.rotation.set(0.35, 0, 0.45 + Math.sin(broken * 18) * 0.05);
      this.shield.rotation.set(0.5, SHIELD_REST_YAW - 0.3, 0.3);
    }
    const flash = broken > 0 && Math.floor(broken * 6) % 2 === 0 ? 1 : 0;
    this.shieldMat.color.setHex(flash ? 0xc0392b : 0x8b5a2b);

    h.root.visible = this.invuln <= 0 || Math.floor(this.invuln * 16) % 2 === 0;
  }
}

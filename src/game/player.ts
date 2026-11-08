import * as THREE from 'three';
import { clamp, damp, lerpAngle } from '../core/math';
import { Layer, SOLID, type Character, type Physics } from '../core/physics';
import type { Humanoid } from '../render/characters';
import { cloneMaterial, isSharedMaterial } from '../render/materials';
import { buildWren, STONEWARD_COAT, WREN_COAT, type WrenRig } from '../render/models/wren';
import { SlashTrail } from '../render/effects';
import { GroundShadow } from '../render/shapes';
import type { LockTarget } from './lockon';
import type { Area } from '../world/area';
import type { BrokenJar } from '../world/jars';
import type { ThornHit } from '../world/overworld/blight';
import type { Attack, Enemy, HitResult, Hurtbox, HurtResult } from './enemies';
import { ATTACK_BOOST } from './flasks';
import { Guard } from './guard';
import { LUNGE_SPEED, LUNGE_TIME, lungeClear } from './lunge';
import { WADE_SPEED, waterState } from './water';
import { SURF_MIN_SPEED, SURF_SPEED, surfNext, surfSpeedNext } from './surf';

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
  lockTarget: LockTarget | null;
  enemies: readonly Enemy[];
  hasSword: boolean;
  /** Without the shield (the opening, before the ruined cottage) there's no guard and no surfing. */
  hasShield: boolean;
  onSwing(): void;
  /** The sword reached an enemy; `result` says whether it hurt, hit a weak point or was guarded. */
  onHitEnemy(e: Enemy, result: HurtResult, at: THREE.Vector3): void;
  onCutBush(at: THREE.Vector3): void;
  /** A jar broke (the area's `breakJars`). */
  onBreakJar?(jar: BrokenJar): void;
  /** The sword struck a thorn clump (the area's `hitThorns`). */
  onHitThorn?(hit: ThornHit): void;
  onJump(): void;
  /** Shield surfing is learned and the area is outdoors (see surf.ts). Off when absent. */
  canSurf?: boolean;
  /** Each grounded frame of a ride, for the dust: where her feet are, how fast, and whether she just got on. */
  onSurf?(at: THREE.Vector3, speed: number, mounted: boolean): void;
  /** Every frame: the speed of the scrape under the shield (0 when not riding on the ground). */
  onSurfSound?(speed: number): void;
}

/** Hearts live in the save state; the player just reads and writes them. */
export interface Health {
  hp: number;
  maxHp: number;
  /** Dev menu: hits do nothing. */
  invincible?: boolean;
}

type State = 'move' | 'attack' | 'hurt';

// Three-hit combo: right-to-left, left-to-right, then an overhead chop.
const SWINGS = [
  { dur: 0.3, dmg: 1 },
  { dur: 0.3, dmg: 1 },
  { dur: 0.42, dmg: 2 },
];
const RUN_SPEED = 8.5;
/** While the guard is broken Wren staggers: a crawl at this fraction of normal speed, no jumping, no sword. */
const STAGGER_SPEED = 0.06;
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
/** Jump forgiveness (platforming): a jump still works this long after leaving a ledge, and a press this long before landing still jumps. */
export const COYOTE_TIME = 0.12;
export const JUMP_BUFFER = 0.12;
/**
 * Edge stickiness (platforming): where a walk would carry Wren's feet off a ledge, she stops for up to
 * this long unless she is still pushing; then she walks off. Only her *displacement* is held, never her
 * speed, so a jump pressed at the lip still launches at full run speed (it works with coyote time).
 */
export const EDGE_HOLD = 0.05;

export class Player {
  readonly h: Humanoid;
  readonly pos = new THREE.Vector3();
  readonly radius = 0.4;
  facing = Math.PI;
  invuln = 0;
  shielding = false;
  /** Riding the shield (surf.ts): fast, no guard, a hit knocks her off. */
  surfing = false;
  /** The ride's horizontal velocity: it eases toward the stick, so she carves and coasts. */
  private readonly surfDir = new THREE.Vector3(0, 0, 1);
  private surfSpeed = 0;
  private airT = 0;
  private wasGrounded = true;
  /** The shield's three guard slots (see guard.ts). */
  readonly guard = new Guard();
  private readonly body: Character;
  private velY = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  /** Turned on in bell trial rooms (content/shrine.ts): the lip of a ledge holds Wren briefly (`EDGE_HOLD`). */
  edgeAssist = false;
  private edgeHeld = 0;
  private state: State = 'move';
  private t = 0;
  private combo = 0;
  private queued = false;
  private hitSet = new Set<Enemy>();
  private bushesCut = false;
  /** This swing has already struck the area (stones, crystals): once per swing. */
  private struck = false;
  private knock = new THREE.Vector3();
  private speedXZ = 0;
  private readonly sword: THREE.Group;
  private readonly shield: THREE.Group;
  private readonly trail: SlashTrail;
  /** Poses her each frame from what she's doing (render/models/wren.ts; docs/pipeline.md "The rig convention"). */
  private readonly rig: WrenRig;
  /** The blade, its own material so it can glow while an Ember Tonic is active. */
  private readonly bladeMat: THREE.MeshLambertMaterial;
  /** Seconds left of an Ember Tonic (the sword hits harder meanwhile). */
  attackBoost = 0;
  /** Seconds left of a glove throw: the arm is out, no sword or shield until it's back. */
  throwT = 0;
  /** The pause menu's Dev tab (off in builds that set `VITE_DISABLE_DEV_TAB`): multiplies run speed to cross the map quickly. */
  devSpeed = 1;
  private opacity = 1;
  /** The blob under Wren's feet: how far above the ground she is matters most when platforming. */
  private readonly shadow: GroundShadow;
  private fadeMats: THREE.Material[] | null = null;
  private readonly coatMat: THREE.MeshLambertMaterial;
  /** Wearing the Stoneward Tunic: stone hits do half damage (rounded up). */
  private stoneward = false;

  constructor(scene: THREE.Scene, private readonly physics: Physics, private readonly health: Health) {
    const m = buildWren();
    this.h = { root: m.root as THREE.Group, ...m.joints };
    this.rig = m.rig;
    this.coatMat = m.coatMat;
    this.bladeMat = m.bladeMat;
    this.sword = m.joints.sword;
    this.shield = m.joints.shield;
    scene.add(this.h.root);
    this.shadow = new GroundShadow(scene, 0.4, 'character');
    this.body = physics.createCharacter(this.pos, this.radius, 0.5, Layer.Player, SOLID | Layer.Enemy);

    this.trail = new SlashTrail(scene);
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
        if (!(m instanceof THREE.Mesh) || m === this.trail.mesh) return;
        const src = m.material as THREE.Material;
        let own = copies.get(src);
        if (!own) {
          own = isSharedMaterial(src) ? cloneMaterial(src) : src;
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
    this.coatMat.color.setHex(on ? STONEWARD_COAT : WREN_COAT);
  }

  setSword(has: boolean) {
    this.sword.visible = has;
  }

  setShield(has: boolean) {
    this.shield.visible = has;
  }

  /** Moves instantly, e.g. on spawn or when a script relocates the player. */
  teleport(x: number, y: number, z: number, facing = this.facing) {
    this.pos.set(x, y, z);
    this.facing = facing;
    this.velY = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.knock.set(0, 0, 0);
    this.surfing = false;
    this.body.teleport(this.pos);
  }

  /** Back on your feet: full hearts, brief invulnerability, normal pose. */
  revive() {
    this.health.hp = this.health.maxHp;
    this.state = 'move';
    this.invuln = 2;
    this.guard.reset();
    this.rig.reset();
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
    if (this.health.invincible) return 'miss';
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

  /** This swing steps forward (see lunge.ts); not when that could carry Wren onto thorns, off a ledge or away from a sign. */
  private lunge = false;

  private startAttack(i: number, env: PlayerEnv) {
    this.state = 'attack';
    this.combo = i;
    this.t = 0;
    this.queued = false;
    this.hitSet.clear();
    this.struck = false;
    this.bushesCut = false;
    const f = this.forward;
    this.lunge = lungeClear(env.area, (x, z) => this.physics.groundY(x, z, this.pos.y + 1), this.pos, f.x, f.z);
    env.onSwing();
  }

  update(dt: number, c: Controls, env: PlayerEnv) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.attackBoost = Math.max(0, this.attackBoost - dt);
    const ember = this.attackBoost > 0 ? 0.7 + Math.sin(this.attackBoost * 8) * 0.25 : 0;
    this.bladeMat.emissive.setRGB(1 * ember, 0.45 * ember, 0.1 * ember);
    // Guard slots only recover while the shield is lowered (last frame's state); surfing freezes them.
    this.guard.update(dt, this.shielding || this.surfing);
    const water = env.area.waterLevelAt ? env.area.waterLevelAt(this.pos.x, this.pos.z) : env.area.waterLevel;
    const wading = waterState(this.pos.y, water) !== 'dry';
    const lock = env.lockTarget;
    const grounded = this.body.grounded;
    const canAct = this.alive;
    const move = canAct ? c.move : NO_CONTROLS.move;
    // Staggered (guard broken): no sword either. A swing's lunge would carry Wren out of the crawl.
    const staggered = this.guard.broken > 0;
    const landedAfter = grounded && !this.wasGrounded ? this.airT : 0;
    this.airT = grounded ? 0 : this.airT + dt;
    this.wasGrounded = grounded;
    const wasSurfing = this.surfing;
    const shield = c.shield && env.hasShield;
    this.surfing = surfNext({
      surfing: this.surfing, allowed: canAct && !!env.canSurf, shield, landedAfter,
      free: this.state === 'move' && this.throwT <= 0 && !staggered,
      locked: !!(lock && lock.alive), attack: c.attack && env.hasSword, wading,
    });
    if (this.surfing && !wasSurfing) {
      // The landing's push: full speed at once, along the stick if held, else the way she faces.
      this.surfDir.copy(move.lengthSq() > 0.01 ? move : this.forward).setY(0).normalize();
      this.surfSpeed = SURF_SPEED * this.devSpeed;
    }
    // The shield stays up through jumps: hold it, hop, keep blocking. Not while it's under her feet.
    this.shielding = !this.surfing && canAct && this.state === 'move' && shield && this.guard.canBlock && this.throwT <= 0;
    if (canAct && env.hasSword && c.attack && this.throwT <= 0 && !staggered) {
      if (this.state === 'move') this.startAttack(0, env);
      else if (this.state === 'attack' && this.t > SWINGS[this.combo].dur * 0.4 && this.combo < 2) this.queued = true;
    }
    let jumped = false;
    // Coyote time and the jump buffer: a jump a hair late or early still counts. Only a rising
    // body can't refill the coyote window, so a jump never gives a second one.
    this.coyote = grounded && this.velY <= 0 ? COYOTE_TIME : Math.max(0, this.coyote - dt);
    this.jumpBuffer = c.jump ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);
    if (canAct && this.state === 'move' && this.coyote > 0 && this.jumpBuffer > 0 && !staggered) {
      this.velY = wading ? 8 : 11;
      this.coyote = 0;
      this.jumpBuffer = 0;
      jumped = true;
      env.onJump();
    }

    const vel = new THREE.Vector3();
    this.t += dt;
    switch (this.state) {
      case 'move': {
        if (this.surfing) {
          // Steering carves the direction; the speed only glides down (surf.ts), and a stick let go brakes.
          const steering = move.lengthSq() > 0.01;
          if (steering) this.surfDir.lerp(move, damp(5, dt)).setY(0).normalize();
          this.surfSpeed = surfSpeedNext(this.surfSpeed, dt, steering);
          vel.copy(this.surfDir).multiplyScalar(this.surfSpeed);
          this.facing = Math.atan2(this.surfDir.x, this.surfDir.z);
          if (this.surfSpeed < SURF_MIN_SPEED * this.devSpeed) this.surfing = false;
          break;
        }
        // With surfing learned, raising the shield in the air doesn't slow the jump: she's getting on.
        const guardWalk = this.shielding && (grounded || !env.canSurf);
        const speed = (guardWalk ? 3.2 : wading ? WADE_SPEED : RUN_SPEED) * (staggered ? STAGGER_SPEED : 1) * this.devSpeed;
        vel.copy(move).multiplyScalar(speed);
        if (!lock && move.lengthSq() > 0.01 && !this.shielding) {
          this.facing = lerpAngle(this.facing, Math.atan2(move.x, move.z), damp(40, dt)); // near-instant: turning shouldn't cost a step
        }
        break;
      }
      case 'attack': {
        const sw = SWINGS[this.combo];
        vel.copy(this.forward).multiplyScalar(this.lunge && this.t < LUNGE_TIME ? LUNGE_SPEED : 0);
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

    this.edgeStick(vel, grounded && !jumped && this.state === 'move' && !this.shielding && !this.surfing, dt);
    vel.add(this.knock);
    this.knock.multiplyScalar(Math.exp(-8 * dt));

    // Gravity: a small constant push down keeps the controller's ground detection honest.
    if (grounded && !jumped && this.velY <= 0) this.velY = -1;
    else this.velY -= GRAVITY * dt;
    // Riding a moving platform: take its last step's displacement first (not while airborne).
    if (grounded) {
      const carry = this.physics.carryDelta(this.pos);
      if (carry) this.pos.add(carry);
    }
    const before = this.pos.y;
    const want = new THREE.Vector3(vel.x * dt, this.velY * dt, vel.z * dt);
    this.body.move(this.pos, want);
    if (this.velY > 0 && this.pos.y - before < want.y * 0.5) this.velY = 0; // bumped a ceiling
    this.speedXZ = Math.hypot(vel.x, vel.z);
    // The mounting frame always reports (it began grounded), even if the step just lifted her off a bump.
    if (this.surfing && (!wasSurfing || this.body.grounded)) env.onSurf?.(this.pos, this.speedXZ, !wasSurfing);
    env.onSurfSound?.(this.surfing && this.body.grounded ? this.speedXZ : 0);
    this.shadow.place(this.pos.x, this.pos.y, this.pos.z, this.physics.groundY(this.pos.x, this.pos.z, this.pos.y + 0.5), this.opacity);

    this.animate(dt);
  }

  /**
   * Edge stickiness: if this frame's walk would put Wren's feet over nothing, hold her at the lip for
   * `EDGE_HOLD` seconds (her speed is untouched). `vel` is the walk only, no knockback.
   */
  private edgeStick(vel: THREE.Vector3, active: boolean, dt: number) {
    const speed = Math.hypot(vel.x, vel.z);
    if (!this.edgeAssist || !active || speed < 0.5) {
      this.edgeHeld = 0;
      return;
    }
    const ahead = speed * dt + 0.05;
    const x = this.pos.x + (vel.x / speed) * ahead, z = this.pos.z + (vel.z / speed) * ahead;
    const ground = this.physics.groundY(x, z, this.pos.y + 0.4);
    if (ground !== null && ground > this.pos.y - 0.45) {
      this.edgeHeld = 0;
      return;
    }
    if (this.edgeHeld >= EDGE_HOLD) return; // she has pushed long enough: off she goes
    this.edgeHeld += dt;
    vel.x = 0;
    vel.z = 0;
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
      const jars = env.area.breakJars?.(this.pos.x, this.pos.z, f.x, f.z, 2.2) ?? [];
      const thorns = env.area.hitThorns?.(this.pos.x, this.pos.z, f.x, f.z, 2.2) ?? [];
      if (cut.length || jars.length || thorns.length) this.bushesCut = true;
      for (const p of cut) env.onCutBush(p);
      for (const j of jars) env.onBreakJar?.(j);
      for (const t of thorns) env.onHitThorn?.(t);
    }
  }

  /** Places her and hands the rig what she's doing; the rig decides how it looks (render/models/wren.ts). */
  private animate(dt: number) {
    const { h } = this;
    h.root.position.copy(this.pos);
    h.root.rotation.y = this.facing;
    this.trail.fade(dt);
    const swing = this.state === 'attack' ? clamp(this.t / SWINGS[this.combo].dur, 0, 1) : 0;
    if (this.alive && this.state === 'attack' && swing > 0.15 && swing < 0.7) {
      this.trail.show(this.pos, this.combo === 2 ? 1.5 : 1.2, this.facing, this.combo === 2);
    }
    this.rig.update(dt, {
      alive: this.alive,
      action: this.state,
      t: this.t,
      combo: this.combo,
      swing,
      speed: this.speedXZ,
      run: clamp(this.speedXZ / RUN_SPEED, 0, 1),
      grounded: this.body.grounded,
      shielding: this.shielding,
      surfing: this.surfing,
      throwing: this.throwT > 0,
      broken: this.guard.broken,
      hasSword: this.sword.visible,
    });
    h.root.visible = this.invuln <= 0 || Math.floor(this.invuln * 16) % 2 === 0;
  }
}

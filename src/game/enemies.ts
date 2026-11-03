import * as THREE from 'three';
import { damp, lerpAngle } from '../core/math';
import { Layer, SOLID, type Character, type Physics } from '../core/physics';
import { disposeTree, uniqueMat } from '../render/materials';
import { GroundShadow } from '../render/shapes';
import type { Sfx } from '../core/audio';
import type { Particles } from '../render/particles';
import type { Area } from '../world/area';
import type { Hazards } from './hazards';
import type { PickupKind } from './pickups';

/**
 * What happened when an enemy attack reached the player: it landed, the shield stopped it,
 * the shield stopped it but the guard broke, or it missed (airborne, just hit...).
 */
export type HitResult = 'hit' | 'blocked' | 'broken' | 'miss';

/** What happened when the player's sword reached an enemy. */
export type HurtResult = 'hit' | 'weak' | 'guarded' | 'ignored';

/**
 * The numbers for one attack. Every enemy move that can touch the player declares one, so
 * each enemy has an "attack sheet" in one place (see THORNLING_LUNGE, the Lamplighter's
 * ATTACKS). Guard cost is how many of the shield's three slots a block knocks down.
 */
export interface Attack {
  /** Half-hearts lost on a clean hit. */
  damage: number;
  /** Shield slots knocked down when blocked: 1 light, 2 heavy, 3 crushing (full guard only). */
  guard: number;
  /** How hard the player is knocked back (default 12). */
  knockback?: number;
  /** The shield can't stop it at all (ground shockwaves). Jump or move. */
  unblockable?: boolean;
  /** Only hits a player standing on the ground: jump over it. */
  groundOnly?: boolean;
  /** Stone strikes (statues, shells): the Stoneward Tunic halves their damage, rounded up. */
  stone?: boolean;
}

const THORNLING_LUNGE: Attack = { damage: 1, guard: 1 };
const WISP_DIVE: Attack = { damage: 1, guard: 1, knockback: 6 };

/** A sphere the sword can hit. `priority` picks weak points over the body when both are in reach. */
export interface Hurtbox {
  center: THREE.Vector3;
  radius: number;
  part: string;
  priority: number;
  /**
   * A weapon or shell: the sword bounces off it when it's nearer to Wren than the part she
   * would otherwise hit (so armor guards only where it really is, never through the body).
   */
  armor?: boolean;
}

export interface EnemyEnv {
  playerPos: THREE.Vector3;
  playerAlive: boolean;
  night: boolean;
  physics: Physics;
  hazards: Hazards;
  sfx: Sfx;
  particles: Particles;
  /** An enemy tries to hurt the player from `from`. */
  hitPlayer(from: THREE.Vector3, attack: Attack): HitResult;
  /** Shoves the player away from `from` without hurting (roars, shockwaves). */
  pushPlayer(from: THREE.Vector3, strength: number): void;
  /** Adds another enemy to the area (summons, minions). */
  spawn(e: Enemy): void;
  drop(kind: PickupKind, at: THREE.Vector3): void;
  shake(strength: number): void;
}

export abstract class Enemy {
  readonly root = new THREE.Group();
  readonly pos = new THREE.Vector3();
  protected knock = new THREE.Vector3();
  protected flash = 0;
  protected flashMats: THREE.MeshLambertMaterial[] = [];
  hp = 3;
  alive = true;
  /** Set once the death animation has finished and it can be removed. */
  gone = false;
  radius = 0.8;
  /** Height above `pos` where the lock-on marker sits. */
  lockHeight = 1;
  /** Particle color when it dies. */
  deathColor = 0x7a2f4a;
  protected deathT = 0;

  abstract update(dt: number, env: EnemyEnv): void;

  /** Whether lock-on may pick this enemy. */
  get targetable() {
    return this.alive;
  }

  /** Where the sword can hit this enemy (world space). Default: one sphere around the body. */
  hurtboxes(): Hurtbox[] {
    return [{ center: this.pos.clone().setY(this.pos.y + this.lockHeight), radius: this.radius, part: 'body', priority: 0 }];
  }

  /** The sword connects with `part`. */
  hurt(dmg: number, from: THREE.Vector3, _part = 'body'): HurtResult {
    if (!this.alive) return 'ignored';
    this.hp -= dmg;
    this.flash = 0.18;
    this.knock.copy(this.pos).sub(from).setY(0).normalize().multiplyScalar(11);
    this.onHurt();
    if (this.hp <= 0) this.alive = false;
    return 'hit';
  }

  /** The player died and respawned (bosses reset their fight here). */
  onPlayerRespawn() {}

  /** Keeps moving while a cutscene plays. Most enemies freeze, but deaths always finish. */
  animatesInCutscene() {
    return !this.alive;
  }

  /** Frees physics and GPU resources; called when the enemy is removed. */
  dispose() {
    this.root.removeFromParent();
    // Every geometry and unshared material under the root: the checkpoint rule rebuilds
    // every enemy on each death, so anything left here leaks GPU memory per death.
    disposeTree(this.root);
    for (const m of this.flashMats) m.dispose();
  }

  protected onHurt() {}

  protected applyFlash(dt: number) {
    this.flash = Math.max(0, this.flash - dt);
    const f = this.flash > 0 ? 1 : 0;
    for (const m of this.flashMats) m.emissive.setRGB(f, f, f);
  }

  /** Shrink and spin away after death. */
  protected dying(dt: number) {
    this.deathT += dt;
    this.root.scale.setScalar(Math.max(0.01, 1 - this.deathT / 0.35));
    this.root.rotation.y += dt * 20;
    if (this.deathT > 0.35) this.gone = true;
  }
}

/** How far from home a ground enemy will chase before giving up and walking back. */
const LEASH = 24;
/** Seconds without seeing Wren before a chase is dropped. */
const FORGET = 2.5;
/** Seconds a wandering enemy must see Wren before it gives chase (see `GroundEnemy.spot`). */
export const REACTION = 0.9;

/**
 * An enemy that walks on the ground and follows the notice rules every enemy shares
 * (docs/combat.md, "What enemies notice"): same level, line of sight, its territory, a leash.
 */
export abstract class GroundEnemy extends Enemy {
  protected yaw = 0;
  protected velY = 0;
  protected readonly home: THREE.Vector3;
  protected readonly character: Character;
  /** Seconds since it last saw Wren (while chasing). */
  protected unseen = 0;
  /** After giving up a chase: seconds before it will notice Wren again (no yo-yo at the leash). */
  protected calm = 0;
  /**
   * `fromY`: look for the ground below this height (indoors, under the ceilings).
   * `territory`: where Wren has to be for it to care (a dungeon room); anywhere if omitted.
   */
  constructor(physics: Physics, x: number, z: number, fromY: number, protected readonly territory: ((p: THREE.Vector3) => boolean) | undefined, capsuleRadius: number, capsuleHalf: number) {
    super();
    const y = physics.groundY(x, z, fromY, Layer.World) ?? 0;
    this.pos.set(x, y, z);
    this.home = this.pos.clone();
    this.character = physics.createCharacter(this.pos, capsuleRadius, capsuleHalf, Layer.Enemy, SOLID | Layer.Player | Layer.Enemy);
  }

  /** Where it may walk (a dungeon room minus its stairs), narrower than where it notices Wren. */
  private walkable: ((p: THREE.Vector3) => boolean) | undefined;

  /** Turns it to face `a` (radians, 0 = +z) at once: how it stands when Wren first sees it. */
  faceAngle(a: number) {
    this.yaw = a;
    this.root.rotation.y = a;
  }

  setWalkable(fn: (p: THREE.Vector3) => boolean) {
    this.walkable = fn;
  }

  /** May it walk here (inside its territory, and not on ground it's kept off)? */
  protected mayWalk(p: THREE.Vector3) {
    return (!this.territory || this.territory(p)) && (!this.walkable || this.walkable(p));
  }

  /**
   * Can it see Wren? Same level (not through a floor), inside its territory, and a clear
   * line from its eyes (`eyeHeight` above its feet) to Wren's (not through a wall).
   */
  protected sees(env: EnemyEnv, eyeHeight = 0.8) {
    const p = env.playerPos;
    if (!env.playerAlive || Math.abs(p.y - this.pos.y) > 2.2) return false;
    if (this.territory && !this.territory(p)) return false;
    const eye = this.pos.clone().setY(this.pos.y + eyeHeight);
    const to = p.clone().setY(p.y + 1).sub(eye);
    const len = to.length();
    return env.physics.rayDistance(eye, to.divideScalar(len), len, Layer.World) >= len - 0.05;
  }

  /** While chasing: true once it should give up (lost sight, Wren left its room, too far from home). */
  protected lostTrack(env: EnemyEnv, dist: number, dt: number, eyeHeight?: number) {
    this.unseen = this.sees(env, eyeHeight) ? 0 : this.unseen + dt;
    const fromHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const outOfBounds = !!this.territory && !this.territory(env.playerPos);
    return !env.playerAlive || dist > 22 || fromHome > LEASH || outOfBounds || this.unseen > FORGET;
  }

  /** Same height as Wren, so an attack can land (not through a floor). */
  private spotT = 0;
  /**
   * Reaction time: true once Wren has been in sight (`seeing`) for `REACTION` seconds in a
   * row. Walking into a room, Wren gets a moment to see it before anything charges.
   */
  protected spot(dt: number, seeing: boolean) {
    this.spotT = seeing ? this.spotT + dt : 0;
    if (this.spotT < REACTION) return false;
    this.spotT = 0;
    return true;
  }

  protected level(env: EnemyEnv) {
    return Math.abs(env.playerPos.y - this.pos.y) < 1.5;
  }

  /** Moves with `vel` plus any knockback, under gravity. */
  protected walk(vel: THREE.Vector3, dt: number, knockDecay = 7) {
    vel.add(this.knock);
    this.knock.multiplyScalar(Math.exp(-knockDecay * dt));
    // Never step onto ground it's kept off (stairs): stop at the foot, and look ahead by a body.
    if (this.walkable && (vel.x || vel.z) && this.walkable(this.pos)) {
      const len = Math.hypot(vel.x, vel.z);
      const ahead = new THREE.Vector3(this.pos.x + (vel.x / len) * 0.7, this.pos.y, this.pos.z + (vel.z / len) * 0.7);
      if (!this.walkable(ahead)) {
        vel.x = 0;
        vel.z = 0;
        this.knock.set(0, 0, 0);
      }
    }
    this.velY = this.character.grounded ? -1 : this.velY - 30 * dt;
    this.character.move(this.pos, new THREE.Vector3(vel.x * dt, this.velY * dt, vel.z * dt));
  }

  /** Which way it faces (radians, 0 = +z). */
  get facing() {
    return this.yaw;
  }

  /** Is `from` in front of it, within `halfAngle` radians of where it faces? */
  protected inFront(from: THREE.Vector3, halfAngle: number) {
    const a = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
    const d = Math.atan2(Math.sin(a - this.yaw), Math.cos(a - this.yaw));
    return Math.abs(d) < halfAngle;
  }

  dispose() {
    super.dispose();
    this.character.dispose();
  }
}

/** A hopping ball of thorns. Wanders, notices you, winds up and lunges. */
export class Thornling extends GroundEnemy {
  private state: 'wander' | 'chase' | 'windup' | 'lunge' | 'recover' | 'stagger' = 'wander';
  private t = 0;
  private hopT = Math.random() * 10;
  private readonly wanderTo = new THREE.Vector3();
  private readonly lungeDir = new THREE.Vector3();
  private hitDone = false;
  private readonly body: THREE.Group;

  constructor(parent: THREE.Object3D, physics: Physics, x: number, z: number, fromY = 400, territory?: (p: THREE.Vector3) => boolean) {
    super(physics, x, z, fromY, territory, 0.6, 0.15);
    this.wanderTo.copy(this.home);
    this.radius = 0.75;
    this.lockHeight = 1.0;

    const skin = uniqueMat(0x7a2f4a), thorn = uniqueMat(0xc9b27a), eye = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    this.flashMats.push(skin, thorn);
    this.body = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 0), skin);
    ball.castShadow = true;
    this.body.add(ball);
    const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
    const seen = new Set<string>();
    const spikeGeo = new THREE.ConeGeometry(0.13, 0.5, 5);
    for (let i = 0; i < dirs.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
      const k = v.toArray().map((n) => n.toFixed(2)).join();
      if (seen.has(k) || v.z > 0.7) continue;
      seen.add(k);
      const spike = new THREE.Mesh(spikeGeo, thorn);
      spike.position.copy(v).multiplyScalar(0.7);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      this.body.add(spike);
    }
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), eye);
      e.position.set(s * 0.22, 0.12, 0.58);
      this.body.add(e);
    }
    this.body.position.y = 0.75;
    this.root.add(this.body);
    parent.add(this.root);
  }

  protected onHurt() {
    this.state = 'stagger';
    this.t = 0;
  }

  /** Chasing or attacking (for tests and debugging). */
  get alert() {
    return this.state === 'chase' || this.state === 'windup' || this.state === 'lunge';
  }

  /** Drops the chase and heads home. */
  private giveUp() {
    this.go('wander');
    this.wanderTo.copy(this.home);
    this.calm = 3;
  }

  update(dt: number, env: EnemyEnv) {
    this.applyFlash(dt);
    if (!this.alive) {
      this.dying(dt);
      return;
    }
    this.t += dt;
    const to = env.playerPos.clone().sub(this.pos).setY(0);
    const dist = to.length();
    to.normalize();
    const speedMul = env.night ? 1.3 : 1;
    const vel = new THREE.Vector3();
    let face = this.yaw;
    let squash = 1;

    this.calm = Math.max(0, this.calm - dt);
    switch (this.state) {
      case 'wander': {
        const w = this.wanderTo.clone().sub(this.pos).setY(0);
        if (w.length() < 1 || this.t > 6) {
          // Somewhere near home, and inside its territory if it has one (dungeon enemies stay in their room).
          for (let tries = 0; tries < 8; tries++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
            this.wanderTo.set(this.home.x + Math.cos(a) * r, this.pos.y, this.home.z + Math.sin(a) * r);
            if (this.mayWalk(this.wanderTo)) break;
            this.wanderTo.copy(this.home);
          }
          this.t = 0;
        } else {
          vel.copy(w.normalize()).multiplyScalar(1.8);
          face = Math.atan2(w.x, w.z);
        }
        if (this.spot(dt, dist < 15 && this.calm <= 0 && this.sees(env))) {
          this.go('chase');
          this.unseen = 0;
        }
        break;
      }
      case 'chase': {
        vel.copy(to).multiplyScalar(4.4 * speedMul);
        face = Math.atan2(to.x, to.z);
        if (this.lostTrack(env, dist, dt)) this.giveUp();
        else if (dist < 3.2 && this.unseen === 0) this.go('windup');
        break;
      }
      case 'windup':
        face = Math.atan2(to.x, to.z);
        squash = 1 - Math.min(1, this.t / 0.5) * 0.35;
        if (this.t > 0.55 / speedMul) {
          this.go('lunge');
          this.lungeDir.copy(to);
          this.hitDone = false;
        }
        break;
      case 'lunge':
        vel.copy(this.lungeDir).multiplyScalar(13);
        squash = 1.15;
        if (!this.hitDone && dist < 1.6 && this.level(env)) {
          this.hitDone = true;
          if (env.hitPlayer(this.pos, THORNLING_LUNGE) === 'blocked') {
            this.knock.copy(this.lungeDir).multiplyScalar(-12);
            this.go('stagger');
          }
        }
        if (this.t > 0.28) this.go('recover');
        break;
      case 'recover':
      case 'stagger':
        if (this.t > 0.7) this.go('chase');
        break;
    }

    this.walk(vel, dt);

    this.yaw = lerpAngle(this.yaw, face, damp(10, dt));
    const moving = vel.lengthSq() > 0.5 && this.state !== 'stagger';
    if (moving) this.hopT += dt * 9;
    const hop = moving ? Math.abs(Math.sin(this.hopT)) * 0.45 : 0;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.body.position.y = 0.75 + hop;
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    this.body.rotation.x = this.state === 'stagger' ? Math.sin(this.t * 30) * 0.3 : 0;
  }

  private go(s: Thornling['state']) {
    this.state = s;
    this.t = 0;
  }
}

export interface WispOptions {
  /** Fades away at dawn (the field's wisps). Off for summoned ones. */
  nocturnal?: boolean;
  /** Between dives, circle this point instead of drifting off (a boss's lantern). */
  anchor?: () => THREE.Vector3 | null;
  /** Seconds between dives. */
  attackCooldown?: number;
}

/** A drifting will-o'-wisp that only comes out at night. One hit pops it. Passes through walls. */
export class Gloomwisp extends Enemy {
  private t = Math.random() * 10;
  private cooldown = 0;
  private fade = 0;
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly coreMat: THREE.MeshLambertMaterial;
  /** Its blob on the ground: a wisp hovering at night is hard to place without one. */
  private readonly shadow: GroundShadow;
  readonly nocturnal: boolean;
  private readonly anchor: (() => THREE.Vector3 | null) | null;
  private readonly attackCooldown: number;
  leaving = false;

  constructor(parent: THREE.Object3D, physics: Physics, x: number, z: number, opts: WispOptions = {}) {
    super();
    this.nocturnal = opts.nocturnal ?? true;
    this.anchor = opts.anchor ?? null;
    this.attackCooldown = opts.attackCooldown ?? 1.6;
    this.cooldown = this.anchor ? 1 + Math.random() * 2 : 0;
    this.hp = 1;
    this.radius = 0.5;
    this.deathColor = 0xb06aff;
    this.lockHeight = 0.6;
    this.pos.set(x, (physics.groundY(x, z, 400, Layer.World) ?? 0) + 1.6, z);
    this.coreMat = uniqueMat(0x2a1840, { emissive: 0x6a2fb0 });
    this.flashMats.push(this.coreMat);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), this.coreMat);
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xb06aff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.root.add(this.core, this.halo);
    this.root.scale.setScalar(0.01);
    parent.add(this.root);
    this.shadow = new GroundShadow(parent, 0.75);
  }

  dispose() {
    super.dispose();
    this.shadow.dispose();
  }

  protected applyFlash(dt: number) {
    this.flash = Math.max(0, this.flash - dt);
    this.coreMat.emissive.set(this.flash > 0 ? 0xffffff : 0x6a2fb0);
  }

  update(dt: number, env: EnemyEnv) {
    this.applyFlash(dt);
    if (!this.alive) {
      this.shadow.mesh.visible = false;
      this.dying(dt);
      return;
    }
    this.t += dt;
    this.cooldown -= dt;
    this.fade = Math.min(1, Math.max(0, this.fade + (this.leaving ? -dt : dt)));
    if (this.leaving && this.fade <= 0) this.gone = true;
    const to = env.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(this.pos);
    const dist = to.length();
    const vel = new THREE.Vector3();
    const anchor = this.anchor?.() ?? null;
    if (anchor && this.cooldown > 0) {
      // Circle the anchor until it's time to dive again.
      const a = this.t * 1.6 + this.root.id;
      const target = anchor.clone().add(new THREE.Vector3(Math.cos(a) * 2.2, Math.sin(this.t * 2.3) * 0.5, Math.sin(a) * 2.2));
      vel.copy(target.sub(this.pos)).multiplyScalar(2.5);
    } else if (dist < 22 && env.playerAlive && !this.leaving) {
      vel.copy(to).normalize().multiplyScalar(this.cooldown > 0 ? -2.5 : anchor ? 6 : 3.6);
      if (dist < 1.1 && this.cooldown <= 0) {
        env.hitPlayer(this.pos, WISP_DIVE);
        this.cooldown = this.attackCooldown;
      }
    } else {
      vel.set(Math.sin(this.t * 0.7), 0, Math.cos(this.t * 0.5)).multiplyScalar(1.2);
    }
    vel.add(this.knock);
    this.knock.multiplyScalar(Math.exp(-6 * dt));
    this.pos.addScaledVector(vel, dt);
    if (!anchor || this.cooldown <= 0) {
      const floor = (env.physics.groundY(this.pos.x, this.pos.z, this.pos.y + 4, Layer.World) ?? this.pos.y - 1.7) + 1.2;
      this.pos.y += (floor + 0.5 + Math.sin(this.t * 2) * 0.3 - this.pos.y) * damp(2, dt);
    }
    this.root.position.copy(this.pos);
    this.root.scale.setScalar(Math.max(0.01, this.fade));
    this.shadow.place(this.pos.x, this.pos.y, this.pos.z, env.physics.groundY(this.pos.x, this.pos.z, this.pos.y, Layer.World), this.fade);
    this.core.rotation.x += dt * 2;
    this.core.rotation.y += dt * 3;
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(this.t * 5) * 0.08;
  }
}

/** Keeps an area populated: thornlings day and night (respawning), wisps after dark. */
export class EnemyManager {
  readonly list: Enemy[] = [];
  private respawns: number[] = [];
  /** The thornlings this manager spawned itself: only these come back as random field spawns. */
  private readonly fieldBorn = new WeakSet<Enemy>();

  constructor(private parent: THREE.Object3D, private physics: Physics, private area: Area) {
    for (let i = 0; i < area.enemyCount; i++) this.spawnThornling(null);
  }

  add(e: Enemy) {
    this.list.push(e);
  }

  /** Takes an enemy out at once (no death animation, no drop): a respawn reset. */
  remove(e: Enemy) {
    const i = this.list.indexOf(e);
    if (i < 0) return;
    e.dispose();
    this.list.splice(i, 1);
  }

  private spawnThornling(player: THREE.Vector3 | null) {
    const s = this.area.enemySpot(Math.random, player ?? undefined, player ? 40 : 0);
    if (!s) return;
    const t = new Thornling(this.parent, this.physics, s.x, s.z);
    this.fieldBorn.add(t);
    this.list.push(t);
  }

  /** `cutscene`: only enemies that animate in cutscenes move, and nothing spawns. */
  update(dt: number, env: EnemyEnv, cutscene = false) {
    for (const e of this.list) if (!cutscene || e.animatesInCutscene()) e.update(dt, env);
    if (cutscene) {
      this.removeGone();
      return;
    }
    this.removeGone();
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      this.respawns[i] -= dt;
      if (this.respawns[i] <= 0) {
        this.respawns.splice(i, 1);
        this.spawnThornling(env.playerPos);
      }
    }
    if (this.area.indoor) return; // no wandering field enemies or night wisps indoors
    const wisps = this.list.filter((e): e is Gloomwisp => e instanceof Gloomwisp && e.nocturnal && !e.leaving);
    if (env.night && wisps.length < 5 && Math.random() < dt * 0.5) {
      const s = this.area.enemySpot(Math.random, env.playerPos, 22, 34);
      if (s) this.list.push(new Gloomwisp(this.parent, this.physics, s.x, s.z));
    }
    if (!env.night) for (const w of wisps) w.leaving = true;
  }

  private removeGone() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e.gone) continue;
      e.dispose();
      this.list.splice(i, 1);
      if (this.fieldBorn.has(e) && !this.area.indoor) this.respawns.push(45);
    }
  }

  /** Removes every enemy (area change). */
  clear() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
    this.respawns.length = 0;
  }
}


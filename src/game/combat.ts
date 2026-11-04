import * as THREE from 'three';
import type { Sfx } from '../core/audio';
import type { Physics } from '../core/physics';
import type { Particles } from '../render/particles';
import type { Hud } from '../ui/hud';
import type { Area } from '../world/area';
import { Boss } from './boss';
import type { CameraRig } from './camera';
import type { Enemy, EnemyEnv, EnemyManager, HurtResult } from './enemies';
import type { HazardEnv, Hazards } from './hazards';
import { pickLockTarget, type LockTarget } from './lockon';
import type { Pickups } from './pickups';
import type { Player, PlayerEnv } from './player';
import type { GameState } from './state';
import { TetherCord } from './tether';

/** What combat needs from the game. `area` and `enemies` change with every area load. */
export interface CombatHost {
  readonly scene: THREE.Scene;
  readonly physics: Physics;
  readonly player: Player;
  readonly state: GameState;
  readonly sfx: Sfx;
  readonly hud: Hud;
  readonly particles: Particles;
  readonly pickups: Pickups;
  readonly hazards: Hazards;
  readonly rig: CameraRig;
  readonly area: Area;
  readonly enemies: EnemyManager;
  /** Runs the loaded area's story script with this id, if it has one. */
  runScript(id: string): void;
}

/**
 * The fight, as wiring: lock-on and its marker, the Tether Glove's throw, and how every hit
 * feels both ways (sounds, sparks, hit-stop, shake, drops). The rules live in the systems
 * (`player`, `guard`, the enemies); this connects them to each other and to the senses.
 */
export class Combat {
  /** The enemy locked on to, if any. */
  lock: LockTarget | null = null;
  /** Real seconds left of hit-stop: a few frozen frames that make hits land with weight. */
  hitStop = 0;
  private readonly cord: TetherCord;
  /** Where the last puff of surf dust rose. */
  private readonly surfDust = new THREE.Vector3();
  private readonly marker = new THREE.Group();

  constructor(private readonly g: CombatHost) {
    this.cord = new TetherCord(g.scene);
    for (let i = 0; i < 3; i++) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), new THREE.MeshBasicMaterial({ color: 0xffcf3a, depthTest: false }));
      arrow.rotation.x = Math.PI;
      arrow.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.5, 0, Math.sin((i / 3) * Math.PI * 2) * 0.5);
      arrow.renderOrder = 10;
      this.marker.add(arrow);
    }
    this.marker.visible = false;
    g.scene.add(this.marker);
  }

  /**
   * Lock-on during play: lets go when the target dies, gets far away or ends up on another
   * floor; `pressed` toggles it, and with nothing to lock onto recenters the camera instead.
   */
  updateLock(pressed: boolean) {
    const { player } = this.g;
    const l = this.lock;
    if (l && (!l.alive || l.pos.distanceTo(player.pos) > 25 || Math.abs(l.pos.y - player.pos.y) > 4)) this.lock = null;
    if (!pressed) return;
    if (this.lock) {
      this.lock = null;
      return;
    }
    const camFwd = new THREE.Vector3(-Math.sin(this.g.rig.yaw), 0, -Math.cos(this.g.rig.yaw));
    // Murmurbuds can be locked onto too: they're hard to hit squarely otherwise.
    const buds = this.g.area.buds ? [...this.g.area.buds.values()] : [];
    this.lock = pickLockTarget(player.pos, camFwd, [...this.g.enemies.list, ...buds], this.g.physics);
    if (this.lock) this.g.sfx.lockOn();
    else this.g.rig.recenter(player.facing);
  }

  /** An enemy left the area: stop locking on to it. */
  forget(e: Enemy) {
    if (this.lock === e) this.lock = null;
  }

  /** During play, after the player moved: the cord, enemies, their attacks and the things they drop. */
  update(dt: number) {
    const { player, state, sfx } = this.g;
    this.cord.update(dt, player.handPos());
    this.g.enemies.update(dt, this.enemyEnv);
    this.g.hazards.update(dt, this.hazardEnv);
    this.g.pickups.update(dt, player.pos, (x, z, fromY) => this.g.physics.groundY(x, z, fromY) ?? fromY - 1, (k) => {
      if (k === 'heart') {
        state.heal(2);
        sfx.heart();
      } else {
        state.addGems(k === 'bluegem' ? 5 : 1);
        sfx.gem();
      }
    });
  }

  /** The bobbing, spinning marker over the lock-on target (every frame, any mode). */
  updateMarker(dt: number) {
    const l = this.lock;
    this.marker.visible = !!l?.alive;
    if (!l?.alive) return;
    this.marker.position.copy(l.pos).setY(l.pos.y + l.lockHeight + 1.4 + Math.sin(performance.now() / 150) * 0.1);
    this.marker.rotation.y += dt * 3;
  }

  /** Where the camera should look while locked on, or null. */
  get lockAt() {
    const l = this.lock;
    return l?.alive ? l.pos.clone().setY(l.pos.y + l.lockHeight) : null;
  }

  /**
   * The Tether Glove: thrown at the lock-on target or straight ahead. The area decides what
   * it catches (a stone, a fallen column); the cord flies there, or its full length on a miss.
   */
  throwTether() {
    const p = this.g.player;
    const aim = this.lock?.alive ? this.lock.pos.clone().sub(p.pos).setY(0) : p.forward;
    if (aim.lengthSq() < 0.01) return;
    aim.normalize();
    if (!p.throwTether(Math.atan2(aim.x, aim.z))) return;
    this.g.sfx.tetherThrow();
    const hit = this.tetherBossPart(aim) ?? this.g.hazards.tetherStone(p.pos, aim) ?? this.g.area.tether?.(p.pos.x, p.pos.y, p.pos.z, aim.x, aim.z) ?? null;
    if (hit) {
      this.g.sfx.tetherLatch();
      p.facing = Math.atan2(hit.at.x - p.pos.x, hit.at.z - p.pos.z); // aim assist may have picked one behind
    }
    this.cord.fire(hit?.at ?? p.handPos().addScaledVector(aim, 9), !!hit);
  }

  /** A boss part the cord can catch (a loose plate): the first enemy that takes it. */
  private tetherBossPart(aim: THREE.Vector3) {
    for (const e of this.g.enemies.list) {
      const hit = e.tetherAt(this.g.player.pos, aim);
      if (hit) return hit;
    }
    return null;
  }

  get playerEnv(): PlayerEnv {
    const { sfx, particles, pickups } = this.g;
    return {
      area: this.g.area,
      lockTarget: this.lock,
      enemies: this.g.enemies.list,
      hasSword: this.g.state.has('hasSword'),
      hasShield: this.g.state.has('hasShield'),
      onSwing: () => sfx.swing(),
      onJump: () => sfx.jump(),
      canSurf: this.g.state.has('village.surfIdea') && !this.g.area.indoor,
      onSurfSound: (speed) => sfx.surfScrape(speed),
      onSurf: (at, speed, mounted) => {
        if (mounted) {
          sfx.surf();
          this.g.state.set('village.surfTried'); // the kid wants to hear about it
        }
        // A light puff of earth from under the shield every ~1.5 m: dust, not a smoke trail.
        else if (speed < 3 || at.distanceToSquared(this.surfDust) < 1.5 * 1.5) return;
        this.surfDust.copy(at);
        particles.burst(at.clone().setY(at.y + 0.1), 0xa8916a, mounted ? 8 : 3, 2.5, 0.45);
      },
      onHitEnemy: (e, result, at) => this.onSwordHit(e, result, at),
      onCutBush: (at) => {
        sfx.cut();
        particles.burst(at, 0x4f9a35, 14, 5, 0.6);
        pickups.drop(at, 0.3, 0.1);
      },
      onBreakJar: (jar) => {
        this.g.state.set(`jar.${jar.id}`);
        sfx.jar();
        particles.burst(jar.at, 0xa8683a, 16, 5, 0.7);
        if (jar.drop === 'doll') this.g.runScript('jar.doll');
        else if (jar.drop !== 'empty') pickups.spawn(jar.drop, jar.at);
      },
    };
  }

  get enemyEnv(): EnemyEnv {
    const { player, state, area } = this.g;
    return {
      playerPos: player.pos,
      playerAlive: player.alive,
      night: state.isNight && !area.indoor,
      physics: this.g.physics,
      hazards: this.g.hazards,
      sfx: this.g.sfx,
      particles: this.g.particles,
      hitPlayer: this.hitPlayer,
      pushPlayer: (from, strength) => player.push(from, strength),
      spawn: (e) => this.g.enemies.add(e),
      drop: (kind, at) => this.g.pickups.spawn(kind, at),
      shake: (s) => this.g.rig.shake(s),
      safeGround: area.safeGround ? (p) => area.safeGround!(p.x, p.z) : undefined,
    };
  }

  private get hazardEnv(): HazardEnv {
    return {
      playerPos: this.g.player.pos,
      physics: this.g.physics,
      particles: this.g.particles,
      hitPlayer: this.hitPlayer,
      onPop: () => this.g.sfx.orbPop(),
    };
  }

  /** Feedback for every sword contact: sounds, sparks, hit-stop, drops. */
  private onSwordHit(e: Enemy, result: HurtResult, at: THREE.Vector3) {
    const { sfx, particles } = this.g;
    if (result === 'ignored') return;
    if (result === 'guarded') {
      sfx.clank();
      particles.burst(at, 0xffe28a, 10, 6, 0.35);
      this.hitStop = 0.05;
      return;
    }
    const isBoss = e instanceof Boss;
    if (result === 'weak') {
      sfx.weakHit();
      particles.burst(at, 0x9ff0ff, 14, 7, 0.45);
      this.hitStop = 0.11;
      this.g.rig.shake(0.25);
    } else {
      sfx.hit();
      particles.burst(at, 0xffffff, 6, 6, 0.3);
      if (isBoss) this.hitStop = 0.06;
    }
    if (e.alive || isBoss) return;
    sfx.enemyDie();
    particles.burst(at, e.deathColor, 18, 6, 0.7);
    this.g.pickups.drop(e.pos.clone(), 0.65, 0.2);
    this.forget(e);
  }

  /** Every enemy attack on Wren goes through here: the result, plus how it feels. */
  readonly hitPlayer: EnemyEnv['hitPlayer'] = (from, attack) => {
    const { player, sfx, particles, rig } = this.g;
    const r = player.receiveHit(from, attack);
    const at = player.pos.clone().setY(player.pos.y + 1.2);
    const shieldAt = at.clone().add(player.forward.multiplyScalar(0.7));
    if (r === 'hit') {
      sfx.hurt();
      particles.burst(at, 0xff4d4d, 8, 4);
      this.hitStop = Math.max(this.hitStop, 0.07);
      rig.shake(0.2);
    } else if (r === 'blocked') {
      // Heavier attacks clang harder: the cost should be felt, not just seen in the HUD.
      if (attack.guard >= 2) sfx.heavyBlock();
      else sfx.clank();
      particles.burst(shieldAt, 0xffe28a, 4 + attack.guard * 4, 5, 0.3);
      if (attack.guard >= 2) rig.shake(0.12 * attack.guard);
    } else if (r === 'broken') {
      sfx.guardBreak();
      particles.burst(shieldAt, 0x8b5a2b, 14, 6, 0.6);
      particles.burst(shieldAt, 0xffe28a, 10, 7, 0.35);
      this.hitStop = Math.max(this.hitStop, 0.09);
      rig.shake(0.4);
      this.g.hud.flashGuard();
    }
    return r;
  };
}

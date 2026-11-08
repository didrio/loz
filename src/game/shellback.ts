import * as THREE from 'three';
import { damp, lerpAngle } from '../core/math';
import { Layer, type Physics } from '../core/physics';
import { buildShellback } from '../render/models/shellback';
import { GroundEnemy, type Attack, type EnemyEnv, type HurtResult } from './enemies';

/** The charge: light, but it comes fast. */
export const SHELLBACK_CHARGE: Attack = { damage: 2, guard: 1, knockback: 14, stone: true };

/** The shell as armor: a ball over its front half (centre in its own frame, radius). */
const SHELL_ARMOR = { at: new THREE.Vector3(0, 0.4, 0.35), radius: 0.85 };
/** Tucked in, the tell before the charge. */
const TUCK_TIME = 0.6;
const CHARGE_TIME = 0.45;
const CHARGE_SPEED = 12;
/** Skidding to a stop after a charge: it can't turn, so its back is there for the taking. */
export const SHELLBACK_SKID = 1.3;
/** Longer when Wren's shield stopped the charge: it bounced off and lies dazed. */
const DAZED_TIME = 1.9;
/** Turning rate while it chases: slow, so Wren can circle round behind it. */
const TURN = 1.8;

/**
 * The Shellback (docs/shrine.md, "Enemies"): a stone-shelled crawler. Its shell comes down
 * over its face (only its eyes glint through two holes) and the sword bounces off it; the
 * soft parts are its back feet and tail, so circle round behind it. It tucks in, then
 * charges a few metres; after a charge it skids and can't turn for a moment.
 */
export class Shellback extends GroundEnemy {
  private state: 'wander' | 'chase' | 'tuck' | 'charge' | 'skid' | 'stagger' = 'wander';
  private t = 0;
  private skidFor = SHELLBACK_SKID;
  private walkT = Math.random() * 10;
  private readonly wanderTo = new THREE.Vector3();
  private readonly chargeDir = new THREE.Vector3();
  private hitDone = false;
  private readonly body: THREE.Group;
  /** The eyes in the shell's eye holes: they narrow when it tucks (the charge tell). */
  private readonly eyes: THREE.Mesh[];
  private readonly legs: THREE.Mesh[];

  constructor(parent: THREE.Object3D, physics: Physics, x: number, z: number, fromY = 400, territory?: (p: THREE.Vector3) => boolean) {
    super(physics, x, z, fromY, territory, 0.7, 0.05);
    this.wanderTo.copy(this.home);
    this.hp = 4;
    this.radius = 0.85;
    this.lockHeight = 0.7;
    this.deathColor = 0x5b6470;

    const m = buildShellback();
    this.body = m.joints.body;
    this.eyes = m.eyes;
    this.legs = m.legs;
    this.flashMats.push(...m.flashMats);
    this.root.add(m.root);
    parent.add(this.root);
  }

  /** Chasing or attacking (for tests and debugging). */
  get alert() {
    return this.state === 'chase' || this.state === 'tuck' || this.state === 'charge';
  }

  /** Can't turn: just charged, or bounced off the shield. */
  get exposed() {
    return this.state === 'skid';
  }

  /** The shell (armor), and the soft parts: the tail and, unless tucked in, the back feet. */
  hurtboxes() {
    this.root.updateMatrixWorld(true);
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(this.body.matrixWorld);
    const boxes = [
      { center: at(SHELL_ARMOR.at.x, SHELL_ARMOR.at.y, SHELL_ARMOR.at.z), radius: SHELL_ARMOR.radius, part: 'shell', priority: 0, armor: true },
      { center: at(0, 0.35, -1.05), radius: 0.45, part: 'tail', priority: 0 },
    ];
    for (const leg of this.legs.slice(2)) {
      if (leg.visible) boxes.push({ center: at(leg.position.x, leg.position.y, leg.position.z), radius: 0.25, part: 'foot', priority: 0 });
    }
    return boxes;
  }

  hurt(dmg: number, from: THREE.Vector3, part = 'body'): HurtResult {
    if (!this.alive) return 'ignored';
    if (part === 'shell') return 'guarded';
    return super.hurt(dmg, from, part);
  }

  protected onHurt() {
    this.go('stagger');
    this.knock.multiplyScalar(0.6);
  }

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
    this.calm = Math.max(0, this.calm - dt);
    const to = env.playerPos.clone().sub(this.pos).setY(0);
    const dist = to.length();
    to.normalize();
    const vel = new THREE.Vector3();
    let face = this.yaw;
    let turn = TURN;
    let tuck = 0;

    switch (this.state) {
      case 'wander': {
        const w = this.wanderTo.clone().sub(this.pos).setY(0);
        if (w.length() < 1 || this.t > 6) {
          for (let tries = 0; tries < 8; tries++) {
            const a = this.rng() * Math.PI * 2, r = this.rng() * 6;
            this.wanderTo.set(this.home.x + Math.cos(a) * r, this.pos.y, this.home.z + Math.sin(a) * r);
            if (this.mayWalk(this.wanderTo)) break;
            this.wanderTo.copy(this.home);
          }
          this.t = 0;
        } else {
          vel.copy(w.normalize()).multiplyScalar(1.2);
          face = Math.atan2(w.x, w.z);
        }
        if (this.spot(dt, dist < 14 && this.calm <= 0 && this.sees(env, 0.5))) {
          this.go('chase');
          this.unseen = 0;
        }
        break;
      }
      case 'chase':
        face = Math.atan2(to.x, to.z);
        // It closes in head-on; a charge only from roughly in front, where it can aim.
        vel.copy(to).multiplyScalar(dist > 3 ? 2.6 : 0.8);
        if (this.lostTrack(env, dist, dt, 0.5)) this.giveUp();
        else if (dist < 6 && this.t > 0.8 && this.unseen === 0 && this.inFront(env.playerPos, 0.35)) {
          this.go('tuck');
          env.sfx.shellTuck();
        }
        break;
      case 'tuck':
        face = Math.atan2(to.x, to.z);
        turn = 4;
        tuck = Math.min(1, this.t / 0.2);
        if (this.t > TUCK_TIME) {
          this.go('charge');
          this.chargeDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          this.hitDone = false;
          env.sfx.scrabble();
        }
        break;
      case 'charge':
        tuck = 1;
        turn = 0;
        vel.copy(this.chargeDir).multiplyScalar(CHARGE_SPEED);
        if (!this.hitDone && dist < 1.6 && this.level(env)) {
          this.hitDone = true;
          if (env.hitPlayer(this.pos, SHELLBACK_CHARGE) === 'blocked') {
            // Bounced off the shield: dazed for longer.
            this.knock.copy(this.chargeDir).multiplyScalar(-10);
            this.skid(DAZED_TIME);
            break;
          }
        }
        // Running into another enemy stops the charge dead (no damage to it, no shoving it): it skids in place.
        if (this.character.blockedBy?.member === Layer.Enemy) {
          this.chargeDir.set(0, 0, 0);
          this.skid(SHELLBACK_SKID);
        } else if (this.t > CHARGE_TIME) this.skid(SHELLBACK_SKID);
        break;
      case 'skid':
        turn = 0;
        tuck = Math.max(0, 1 - this.t / 0.4);
        // Slides on a little, slowing.
        vel.copy(this.chargeDir).multiplyScalar(Math.max(0, CHARGE_SPEED * 0.5 * (1 - this.t / 0.35)));
        if (this.t > this.skidFor) this.go('chase');
        break;
      case 'stagger':
        turn = 0;
        if (this.t > 0.5) this.go('chase');
        break;
    }

    this.walk(vel, dt);
    this.yaw = lerpAngle(this.yaw, face, damp(turn, dt));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;

    const moving = vel.lengthSq() > 0.3 && tuck < 0.5;
    if (moving) this.walkT += dt * 12;
    this.legs.forEach((l, i) => {
      l.position.y = 0.15 + (moving ? Math.max(0, Math.sin(this.walkT + (i % 3 === 0 ? 0 : Math.PI))) * 0.08 : 0);
      l.visible = tuck < 0.6;
    });
    for (const e of this.eyes) e.scale.y = 1 - tuck * 0.75;
    this.body.position.y = -tuck * 0.15;
    this.body.rotation.z = this.state === 'stagger' || (this.state === 'skid' && this.skidFor === DAZED_TIME) ? Math.sin(this.t * 25) * 0.08 : 0;
  }

  private skid(time: number) {
    this.go('skid');
    this.skidFor = time;
  }

  private go(s: Shellback['state']) {
    this.state = s;
    this.t = 0;
  }
}

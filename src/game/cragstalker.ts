import * as THREE from 'three';
import { damp, lerpAngle } from '../core/math';
import { Layer, type Physics } from '../core/physics';
import { buildCragstalker } from '../render/models/cragstalker';
import { GroundEnemy, type Attack, type EnemyEnv } from './enemies';

/** The lunge: stone claws, heavy (the Stoneward Tunic halves it). */
export const CRAGSTALKER_LUNGE: Attack = { damage: 3, guard: 2, knockback: 13, stone: true };

/** It circles Wren at about this distance, looking for the moment. */
const RING = 4.2;
/** The crouch is the tell: low, eyes lit, before the lunge. */
export const CROUCH_TIME = 0.55;
const LUNGE_TIME = 0.4;
const LUNGE_SPEED = 21;
/** Panting after a lunge: its flank is open. Longer when the shield stopped it. */
export const CRAGSTALKER_RECOVER = 0.6;
export const CRAGSTALKER_DAZED = 1.5;
const SPEED_CIRCLE = 4.8;
const SPEED_CLOSE = 8;
/** Chance it follows a lunge at once with another crouch when Wren is still this close (a combo). */
const COMBO_CHANCE = 0.55;
const COMBO_RANGE = 4.5;

/**
 * The Cragstalker (docs/shrine.md, "The Northpass"): a lean, stone-backed hunter that guards the Waybell. It
 * circles at a distance, then drops into a crouch with its eyes lit (the tell) and lunges about 8 m, aimed where
 * Wren stood when the crouch ended: a sidestep dodges it, the shield stops it (and leaves it dazed). It is
 * very aggressive (it closes fast, barely waits, and follows a lunge with another when Wren stays close), but fair:
 * every lunge has the same 0.55 s tell and ends in a pause that is the opening.
 */
export class Cragstalker extends GroundEnemy {
  private state: 'idle' | 'stalk' | 'crouch' | 'lunge' | 'recover' | 'stagger' = 'idle';
  private t = 0;
  private side = 1;
  private waitFor = 1;
  private recoverFor = CRAGSTALKER_RECOVER;
  private walkT = Math.random() * 10;
  private hitDone = false;
  private readonly wanderTo = new THREE.Vector3();
  private readonly lungeDir = new THREE.Vector3();
  private readonly body: THREE.Group;
  private readonly eyeMat: THREE.MeshBasicMaterial;
  private readonly legs: THREE.Mesh[];

  constructor(parent: THREE.Object3D, physics: Physics, x: number, z: number, fromY = 400, territory?: (p: THREE.Vector3) => boolean) {
    super(physics, x, z, fromY, territory, 0.6, 0.15);
    this.wanderTo.copy(this.home);
    this.hp = 6;
    this.radius = 0.95;
    this.lockHeight = 0.8;
    this.deathColor = 0x7d776c;

    const m = buildCragstalker();
    this.body = m.joints.body;
    this.eyeMat = m.eyeMat;
    this.legs = m.legs;
    this.flashMats.push(...m.flashMats);
    this.root.add(m.root);
    parent.add(this.root);
  }

  /** The tell is showing (for tests). */
  get crouching() {
    return this.state === 'crouch';
  }

  /** Mid-lunge. */
  get lunging() {
    return this.state === 'lunge';
  }

  /** Panting after a lunge, a window for the sword. */
  get exposed() {
    return this.state === 'recover';
  }

  get alert() {
    return this.state === 'stalk' || this.state === 'crouch' || this.state === 'lunge';
  }

  protected onHurt() {
    this.go('stagger');
    this.knock.multiplyScalar(0.7);
  }

  private giveUp() {
    this.go('idle');
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
    let turn = 6;
    let low = 0;

    switch (this.state) {
      case 'idle': {
        const w = this.wanderTo.clone().sub(this.pos).setY(0);
        if (w.length() < 0.8 || this.t > 5) {
          for (let tries = 0; tries < 8; tries++) {
            const a = this.rng() * Math.PI * 2, r = this.rng() * 3;
            this.wanderTo.set(this.home.x + Math.cos(a) * r, this.pos.y, this.home.z + Math.sin(a) * r);
            if (this.mayWalk(this.wanderTo)) break;
            this.wanderTo.copy(this.home);
          }
          this.t = 0;
        } else {
          vel.copy(w.normalize()).multiplyScalar(1.4);
          face = Math.atan2(w.x, w.z);
          turn = 3;
        }
        if (this.spot(dt, dist < 22 && this.calm <= 0 && this.sees(env, 0.7))) {
          this.go('stalk');
          this.unseen = 0;
        }
        break;
      }
      case 'stalk': {
        face = Math.atan2(to.x, to.z);
        // Circles at RING, drawing in when it is far and backing off when Wren crowds it.
        const tangent = new THREE.Vector3(-to.z * this.side, 0, to.x * this.side);
        const radial = Math.max(-2.2, Math.min(SPEED_CLOSE, (dist - RING) * 1.6));
        vel.copy(tangent).multiplyScalar(SPEED_CIRCLE).addScaledVector(to, radial);
        if (this.lostTrack(env, dist, dt, 0.7)) this.giveUp();
        else if (dist < 10 && this.t > this.waitFor && this.unseen === 0 && this.level(env)) {
          this.go('crouch');
          env.sfx.shellTuck();
        }
        break;
      }
      case 'crouch':
        // Eyes lit, belly to the floor, tracking Wren until the last moment.
        face = Math.atan2(to.x, to.z);
        low = Math.min(1, this.t / 0.25);
        if (this.t > CROUCH_TIME) {
          this.lungeDir.copy(to);
          this.yaw = Math.atan2(to.x, to.z);
          this.go('lunge');
          this.hitDone = false;
          env.sfx.scrabble();
        }
        break;
      case 'lunge':
        low = 0.6;
        turn = 0;
        vel.copy(this.lungeDir).multiplyScalar(LUNGE_SPEED);
        if (!this.hitDone && dist < 2 && this.level(env)) {
          this.hitDone = true;
          // It stops dead on Wren: the claws land (or the shield takes it, and it is thrown back dazed). No shoving her.
          this.stopLunge(env.hitPlayer(this.pos, CRAGSTALKER_LUNGE) === 'blocked');
          break;
        }
        // Running into another enemy (or Wren's body) stops the lunge dead too: no damage to it, no shoving it.
        if (this.character.blockedBy?.member === Layer.Enemy || this.character.blockedBy?.member === Layer.Player) this.stopLunge(false);
        else if (this.t > LUNGE_TIME) this.stopLunge(false);
        break;
      case 'recover':
        turn = 0;
        low = Math.max(0, 0.5 - this.t);
        vel.copy(this.lungeDir).multiplyScalar(Math.max(0, LUNGE_SPEED * 0.3 * (1 - this.t / 0.3)));
        if (this.t > this.recoverFor) {
          this.side = this.rng() < 0.5 ? -1 : 1;
          this.waitFor = 0.15 + this.rng() * 0.35;
          // Wren still in reach and in sight: it comes straight back at her (the tell is just as long).
          if (this.recoverFor === CRAGSTALKER_RECOVER && dist < COMBO_RANGE && this.unseen === 0 && this.level(env) && this.rng() < COMBO_CHANCE) {
            this.go('crouch');
            env.sfx.shellTuck();
          } else this.go('stalk');
        }
        break;
      case 'stagger':
        turn = 0;
        if (this.t > 0.25) this.go('stalk');
        break;
    }

    this.walk(vel, dt);
    this.yaw = lerpAngle(this.yaw, face, damp(turn, dt));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;

    const moving = vel.lengthSq() > 0.3 && low < 0.5;
    if (moving) this.walkT += dt * 11;
    this.legs.forEach((l, i) => {
      l.position.y = 0.35 - low * 0.18 + (moving ? Math.max(0, Math.sin(this.walkT + (i % 3 === 0 ? 0 : Math.PI))) * 0.1 : 0);
    });
    this.body.position.y = -low * 0.3;
    this.eyeMat.color.setHex(this.state === 'crouch' ? 0xffb347 : this.alert ? 0xc9782a : 0x5a3a1a);
  }

  /** The lunge is over (it hit something, or ran its length): panting, with no slide left in it. */
  private stopLunge(dazed: boolean) {
    if (dazed) this.knock.copy(this.lungeDir).multiplyScalar(-9);
    this.lungeDir.set(0, 0, 0);
    this.recoverFor = dazed ? CRAGSTALKER_DAZED : CRAGSTALKER_RECOVER;
    this.go('recover');
  }

  private go(s: Cragstalker['state']) {
    this.state = s;
    this.t = 0;
  }
}

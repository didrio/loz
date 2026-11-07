import * as THREE from 'three';
import { damp, lerpAngle } from '../core/math';
import type { Physics } from '../core/physics';
import { loadRig, RiggedModel } from '../render/rigged';
import { GroundEnemy, type Attack, type EnemyEnv, type HurtResult, type Hurtbox } from './enemies';
import modelUrl from '../../assets/models/grist/grist.glb?url';
import talk1Url from '../../assets/models/grist/clips/Talking 1.fbx?url';
import talk2Url from '../../assets/models/grist/clips/Talking 2.fbx?url';
import jabUrl from '../../assets/models/grist/clips/Attack Normal Punch.fbx?url';
import haymakerUrl from '../../assets/models/grist/clips/Attack Big Punch.fbx?url';
import sweepUrl from '../../assets/models/grist/clips/Attack Sweep.fbx?url';

/**
 * Grist, the Stonesick. An imported, rigged model (Meshy, Mixamo skeleton) that
 * is first a wandering NPC (talk to him: content/grist.ts) and, once offended, a field enemy with three moves.
 * The first character on `render/rigged.ts`: clips from the GLB (idle, walk, run) and Mixamo (talk, attacks).
 */

export const GRIST_SCALE = 1.3;
/** Natural ground speed of the GLB's clips at scale 1 (measured from the planted foot), so the feet don't slide. */
const WALK_NATURAL = 1.04;
const RUN_NATURAL = 3.46;
const STROLL = 1.3;
const CHASE_WALK = 1.7;
const CHASE_RUN = 4.4;

export type GristMove = 'jab' | 'haymaker' | 'sweep';

/** The attack sheet. Stone flesh: the Stoneward Tunic halves it. */
export const GRIST_ATTACKS: Record<GristMove, Attack> = {
  /** A quick left: light, his most common move up close. */
  jab: { damage: 2, guard: 1, knockback: 10, stone: true },
  /** The overhead haymaker: crushes a full guard. Its tell is long and loud (he glows, and breathes in). */
  haymaker: { damage: 4, guard: 3, knockback: 16, stone: true },
  /** A low, wide sweep round both sides: punishes circling him. Jump it, or block it. */
  sweep: { damage: 2, guard: 2, knockback: 14, stone: true, groundOnly: true },
};

interface MoveTiming {
  /** Seconds from the start of the clip to the blow landing: the tell. At least 0.5 s (combat.md fairness). */
  impact: number;
  /** How long the blow can connect, from `impact`. */
  active: number;
  /** When the move ends and he can act again: the time after the blow is the opening. */
  end: number;
  reach: number;
  /** Half-angle in front of him that the blow covers (radians). */
  arc: number;
  /** Forward step speed while the blow lands (the clips' root motion is stripped). */
  step: number;
}

/** Measured from the retargeted clips (the moment the fist is furthest forward). */
export const GRIST_TIMING: Record<GristMove, MoveTiming> = {
  jab: { impact: 0.6, active: 0.12, end: 1.25, reach: 3.0, arc: 0.6, step: 1.5 },
  haymaker: { impact: 1.3, active: 0.15, end: 2.7, reach: 3.6, arc: 0.55, step: 2.5 },
  sweep: { impact: 0.95, active: 0.45, end: 2.3, reach: 3.8, arc: 1.7, step: 0 },
};
/** A blow the shield stopped: he stands dazed this much longer. */
export const GRIST_DAZED = 1.0;
export const GRIST_HP = 10;

/**
 * Which move, if any: `dist` to Wren (m), `off` = how far she stands from straight ahead (radians, absolute),
 * `last` = his previous move, `roll` in [0, 1). Null: not in reach yet, keep closing in.
 */
export function pickMove(dist: number, off: number, last: GristMove | null, roll: number): GristMove | null {
  if (dist > 3.6) return null;
  if (off > 0.8) return dist < 3.6 ? 'sweep' : null; // circling him: the sweep finds her
  let m: GristMove;
  if (dist < 2.6) m = roll < 0.65 ? 'jab' : roll < 0.85 ? 'sweep' : 'haymaker';
  else m = roll < 0.55 ? 'haymaker' : 'sweep';
  if (m === 'haymaker' && last === 'haymaker') m = dist < 2.8 ? 'jab' : 'sweep';
  return m;
}

/** Is a point `dist` away, `off` radians from his facing, inside a move's blow? */
export function inBlow(move: GristMove, dist: number, off: number) {
  const t = GRIST_TIMING[move];
  return dist <= t.reach && off <= t.arc;
}

type State = 'npc' | 'talk' | 'offended' | 'stalk' | 'attack' | 'dazed' | 'stagger' | 'home';

const RIG_CLIPS = { talk1: talk1Url, talk2: talk2Url, jab: jabUrl, haymaker: haymakerUrl, sweep: sweepUrl };

export class Grist extends GroundEnemy {
  private state: State;
  private t = 0;
  private move: GristMove = 'jab';
  private lastMove: GristMove | null = null;
  private hitDone = false;
  private waitFor = 0.6;
  private talkClip = 0;
  private readonly wanderTo = new THREE.Vector3();
  private pause = 1.5;
  private model: RiggedModel | null = null;
  private disposed = false;
  private sinking = 0;
  private burst = false;
  /** Set by content: the sword hit him while he was peaceable. */
  onProvoked: (() => void) | null = null;
  /** Set by content: he's down (once, when the crumble starts). */
  onDefeated: (() => void) | null = null;

  constructor(parent: THREE.Object3D, physics: Physics, x: number, z: number, fromY: number, hostile: boolean) {
    super(physics, x, z, fromY, undefined, 0.7, 0.75);
    this.state = hostile ? 'home' : 'npc';
    this.hp = GRIST_HP;
    this.radius = 1.0;
    this.lockHeight = 2.2;
    this.deathColor = 0xc9a59a;
    this.wanderTo.copy(this.home);
    this.root.position.copy(this.pos);
    parent.add(this.root);
    if (typeof window === 'undefined') return; // unit tests: no files, the rules still run
    void loadRig(modelUrl, RIG_CLIPS).then((src) => {
      if (this.disposed) return;
      this.model = new RiggedModel(src, GRIST_SCALE);
      this.flashMats.push(...this.model.materials);
      this.model.onFinished = (name) => {
        if (this.state === 'talk' && name.startsWith('talk')) this.nextTalkClip();
      };
      this.root.add(this.model.object);
    }).catch((e) => console.warn('Grist: model failed to load', e));
  }

  /** Peaceable: wandering or talking. */
  get peaceful() {
    return this.state === 'npc' || this.state === 'talk';
  }

  get hostile() {
    return !this.peaceful;
  }

  get targetable() {
    return this.alive && this.hostile;
  }

  /** Mid-move, before the blow (for tests: the tell is showing). */
  get winding() {
    return this.state === 'attack' && this.t < GRIST_TIMING[this.move].impact;
  }

  get currentMove(): GristMove | null {
    return this.state === 'attack' ? this.move : null;
  }

  /** He keeps moving while Wren talks to him (dialog freezes enemies); any other cutscene (a fade, a travel) freezes him too. */
  animatesInCutscene() {
    return !this.alive || this.state === 'talk' || this.state === 'offended';
  }

  /** Content starts the conversation: he stops, turns to Wren and talks with his hands. */
  beginTalk() {
    if (!this.peaceful) return;
    this.go('talk');
    this.talkClip = 0;
    this.nextTalkClip();
  }

  /** The conversation is over: back to wandering, or (offended) to the fight. */
  endTalk(offended: boolean) {
    if (this.state !== 'talk') return;
    if (offended) {
      this.go('offended');
      this.model?.play('Idle_11', { fade: 0.3 });
    } else {
      this.go('npc');
      this.pause = 2;
    }
  }

  /** Turned hostile without a word (the sword, or a reload after the quarrel). */
  provoke() {
    if (!this.peaceful) return;
    this.go('stalk');
    this.calm = 0;
    this.unseen = 0;
    this.onProvoked?.();
  }

  private nextTalkClip() {
    this.model?.play(this.talkClip++ % 2 === 0 ? 'talk1' : 'talk2', { loop: false, fade: 0.35 });
  }

  hurtboxes(): Hurtbox[] {
    return [{ center: this.pos.clone().setY(this.pos.y + 1.45), radius: 1.0, part: 'body', priority: 0 }];
  }

  hurt(dmg: number, from: THREE.Vector3, part = 'body'): HurtResult {
    if (!this.alive) return 'ignored';
    if (this.peaceful) this.provoke();
    return super.hurt(dmg, from, part);
  }

  protected onHurt() {
    // Heavy: a blow doesn't stop his own swing (greed is punished), but staggers him otherwise.
    this.knock.multiplyScalar(this.state === 'attack' ? 0.1 : 0.35);
    if (this.state === 'stalk' || this.state === 'home') this.go('stagger');
  }

  update(dt: number, env: EnemyEnv) {
    this.applyFlash(dt);
    if (!this.alive) {
      this.crumble(dt, env);
      return;
    }
    this.t += dt;
    this.calm = Math.max(0, this.calm - dt);
    const to = env.playerPos.clone().sub(this.pos).setY(0);
    const dist = to.length();
    if (dist > 1e-4) to.divideScalar(dist);
    const toAngle = Math.atan2(to.x, to.z);
    const off = Math.abs(Math.atan2(Math.sin(toAngle - this.yaw), Math.cos(toAngle - this.yaw)));
    const vel = new THREE.Vector3();
    let face = this.yaw;
    let turn = 5;
    let look: THREE.Vector3 | null = null;
    const head = env.playerPos.clone().setY(env.playerPos.y + 1.5);
    let glow = 0;

    switch (this.state) {
      case 'npc': {
        if (dist < 8) look = head;
        if (dist < 4.5) {
          // Wren walks up: he stops and regards her (easy to talk to).
          face = toAngle;
          turn = 2.5;
          this.idle();
          break;
        }
        const w = this.wanderTo.clone().sub(this.pos).setY(0);
        if (this.pause > 0) {
          this.pause -= dt;
          this.idle();
          if (this.pause <= 0) this.pickWander();
        } else if (w.length() < 0.4) {
          this.pause = 2 + this.rng() * 3;
        } else {
          vel.copy(w.normalize()).multiplyScalar(STROLL);
          face = Math.atan2(w.x, w.z);
          turn = 3;
          this.walkClip(STROLL);
        }
        break;
      }
      case 'talk':
        face = toAngle;
        turn = 3;
        look = head;
        break;
      case 'offended':
        // A beat: he squares up before the first blow.
        face = toAngle;
        look = head;
        if (this.t > 0.8) {
          this.go('stalk');
          this.waitFor = 0.4;
        }
        break;
      case 'stalk': {
        face = toAngle;
        look = head;
        if (this.lostTrack(env, dist, dt, 2.2)) {
          this.go('home');
          this.calm = 4;
          break;
        }
        const m = this.t > this.waitFor && this.level(env) ? pickMove(dist, off, this.lastMove, this.rng()) : null;
        if (m && (off < 0.5 || m === 'sweep')) {
          this.startMove(m, env);
          break;
        }
        if (dist > 2.4) {
          const speed = dist > 7 ? CHASE_RUN : CHASE_WALK;
          vel.copy(to).multiplyScalar(speed);
          if (speed === CHASE_RUN) this.runClip(speed);
          else this.walkClip(speed);
        } else this.idle();
        break;
      }
      case 'attack': {
        const tm = GRIST_TIMING[this.move];
        // He tracks Wren through most of the tell, then commits.
        if (this.t < tm.impact * 0.7) face = toAngle;
        turn = this.t < tm.impact * 0.7 ? 4 : 0;
        if (this.move === 'haymaker' && this.t < tm.impact) glow = 0.35 + 0.35 * Math.sin(this.t * 18);
        if (this.t > tm.impact - 0.25 && this.t < tm.impact + tm.active) {
          vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(tm.step);
        }
        if (this.move !== 'haymaker' && !this.hitDone && this.t > tm.impact - 0.15 && this.t - dt <= tm.impact - 0.15) env.sfx.heavySwing();
        if (!this.hitDone && this.t >= tm.impact && this.t <= tm.impact + tm.active && this.level(env) && inBlow(this.move, dist, off)) {
          this.hitDone = true;
          const r = env.hitPlayer(this.pos, GRIST_ATTACKS[this.move]);
          if (this.move === 'haymaker') {
            env.sfx.boom();
            env.shake(0.4);
          }
          if (r === 'blocked' || r === 'broken') {
            this.go('dazed');
            this.model?.play('Idle_11', { fade: 0.25 });
            break;
          }
        }
        if (this.move === 'haymaker' && this.t >= tm.impact && this.t - dt < tm.impact && !this.hitDone) {
          env.sfx.boom();
          env.shake(0.25);
        }
        if (this.t >= tm.end) {
          this.lastMove = this.move;
          this.go('stalk');
          this.waitFor = 0.3 + this.rng() * 0.5;
        }
        break;
      }
      case 'dazed':
        // The shield stopped him: a long, open moment.
        if (this.t > GRIST_DAZED + 0.4) {
          this.lastMove = this.move;
          this.go('stalk');
          this.waitFor = 0.4;
        }
        this.idle();
        break;
      case 'stagger':
        if (this.t > 0.3) this.go('stalk');
        break;
      case 'home': {
        const w = this.home.clone().sub(this.pos).setY(0);
        if (w.length() > 0.6) {
          vel.copy(w.normalize()).multiplyScalar(CHASE_WALK);
          face = Math.atan2(w.x, w.z);
          this.walkClip(CHASE_WALK);
        } else this.idle();
        if (dist < 8) look = head;
        if (this.calm <= 0 && this.spot(dt, dist < 20 && this.sees(env, 2.2))) {
          this.go('stalk');
          this.unseen = 0;
        }
        break;
      }
    }

    this.walk(vel, dt);
    this.yaw = lerpAngle(this.yaw, face, damp(turn, dt));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (this.model) {
      this.model.update(dt, look);
      if (glow > 0 && this.flash <= 0) for (const m of this.model.materials) m.emissive.setRGB(glow, glow * 0.25, glow * 0.1);
    }
  }

  private startMove(m: GristMove, env: EnemyEnv) {
    this.move = m;
    this.hitDone = false;
    this.go('attack');
    this.model?.play(m, { loop: false, fade: 0.15 });
    if (m === 'haymaker') env.sfx.inhale();
  }

  private pickWander() {
    for (let tries = 0; tries < 8; tries++) {
      const a = this.rng() * Math.PI * 2, r = 1.5 + this.rng() * 4;
      this.wanderTo.set(this.home.x + Math.cos(a) * r, this.pos.y, this.home.z + Math.sin(a) * r);
      if (this.mayWalk(this.wanderTo)) return;
    }
    this.wanderTo.copy(this.home);
  }

  private idle() {
    this.model?.play('Idle_11', { fade: 0.3 });
  }

  private walkClip(speed: number) {
    this.model?.play('Walking', { speed: speed / (WALK_NATURAL * GRIST_SCALE), fade: 0.25 });
  }

  private runClip(speed: number) {
    this.model?.play('Running', { speed: speed / (RUN_NATURAL * GRIST_SCALE), fade: 0.25 });
  }

  /** Down: a burst of stone dust, gems, and he sinks into the ground. */
  private crumble(dt: number, env: EnemyEnv) {
    if (!this.burst) {
      this.burst = true;
      this.onDefeated?.();
      env.sfx.stoneSink();
      env.particles.burst(this.pos.clone().setY(this.pos.y + 1.5), this.deathColor, 40, 6, 1.2);
      env.drop('bluegem', this.pos.clone().add(new THREE.Vector3(0.8, 0.5, 0)));
      env.drop('bluegem', this.pos.clone().add(new THREE.Vector3(-0.8, 0.5, 0.3)));
      env.drop('heart', this.pos.clone().add(new THREE.Vector3(0, 0.5, -0.8)));
      this.model?.play('Idle_11', { fade: 0.2 });
    }
    this.sinking += dt;
    this.model?.update(dt * 0.3);
    this.root.position.y = this.pos.y - this.sinking * 1.6;
    this.root.rotation.z = Math.min(0.25, this.sinking * 0.3);
    if (this.sinking > 1.8) this.gone = true;
  }

  private go(s: State) {
    this.state = s;
    this.t = 0;
  }

  dispose() {
    this.disposed = true;
    // The model shares geometry and textures with every other instance: only its own parts go.
    this.model?.dispose();
    this.flashMats = [];
    super.dispose();
  }
}

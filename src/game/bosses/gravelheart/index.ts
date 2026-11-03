import * as THREE from 'three';
import { clamp, damp } from '../../../core/math';
import type { Physics } from '../../../core/physics';
import type { WardenHearth } from '../../../world/dungeon/hearth';
import { Boss, type Move } from '../../boss';
import type { EnemyEnv, Hurtbox } from '../../enemies';
import { MOVES } from './moves';
import { blendPose, GravelheartRig, SLEEP, STAND, type Pose } from './rig';

/**
 * GRAVELHEART, the Sleepless Warden. Boss of the Waking Shrine (docs/shrine.md, "The boss").
 *
 * The shrine's guardian was meant to sleep while the lantern burned. When the flame was
 * stolen, the thief pushed an ember into its chest, and now it can't sleep.
 *
 * Built in sessions (the build plan in docs/shrine.md). So far (A): the body, waking up,
 * a slow stalk and Hammerfall. Everything but its chest is solid stone (the sword clanks),
 * and the chest is in reach only while it's bent over a stuck slam.
 */
export class Gravelheart extends Boss {
  readonly title = 'Gravelheart';
  readonly epithet = 'the Sleepless Warden';
  protected readonly introDuration = 4.2;
  protected readonly dyingDuration = Infinity;
  /** Its chest can be struck right now (the punish window of a stuck slam). */
  chestOpen = false;
  /** It has settled, asleep at last (content's defeat script waits for this). */
  asleep = false;

  readonly rig: GravelheartRig;
  private readonly cur: Pose = { ...SLEEP };
  private target: Pose = { ...SLEEP };
  private rate = 6;
  private breath = 0;
  private stepPhase = 0;
  private ground = false;

  constructor(parent: THREE.Object3D, physics: Physics, readonly hearth: WardenHearth | null, x: number, y: number, z: number, yaw: number) {
    super(parent, physics, hearth, { x, y, z, yaw, hp: 40, radius: 1.5, halfHeight: 1.3, phases: [0.5] });
    this.lockHeight = 3;
    this.deathColor = 0x8f887c;
    this.rig = new GravelheartRig(this.root);
    this.flashMats.push(...this.rig.flashMats);
    this.rig.apply(this.cur, 0);
  }

  protected moves(): Move<this>[] {
    return MOVES as Move<this>[];
  }

  /** Stone everywhere: the sword clanks off anything but an open chest. */
  protected isGuarding(_toAttacker: THREE.Vector3, part: string) {
    return part !== 'chest';
  }

  protected decideDelay() {
    return this.phase === 1 ? 1.1 + Math.random() * 0.7 : 0.6 + Math.random() * 0.5;
  }

  protected baseTurnRate() {
    return this.phase === 1 ? 1.1 : 1.6;
  }

  protected stalk(dt: number) {
    super.stalk(dt, 1.7, 3.5, 6.5);
  }

  hurtboxes(): Hurtbox[] {
    this.root.updateMatrixWorld(true);
    const boxes: Hurtbox[] = [
      // The torso is armor, except while the chest is open: then a swing at its front finds the ember.
      { ...this.box(this.rig.torso, new THREE.Vector3(0, 1.1, 0.1), 1.35, 'body'), armor: !this.chestOpen },
      { ...this.box(this.rig.hips, new THREE.Vector3(0, -0.7, 0), 1.1, 'legs'), armor: true },
      { ...this.box(this.rig.armR.fist, new THREE.Vector3(0, -0.45, 0), 0.75, 'fist'), armor: true },
      { ...this.box(this.rig.armL.fist, new THREE.Vector3(0, -0.45, 0), 0.75, 'fist'), armor: true },
    ];
    if (this.chestOpen) boxes.push(this.box(this.rig.ember, new THREE.Vector3(0, 0, 0.25), 0.75, 'chest', 2));
    return boxes;
  }

  /** The ember's world position (the defeat cutscene starts there). */
  emberWorldPos() {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(this.rig.ember.matrixWorld);
  }

  headWorldPos() {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0.65, 0).applyMatrix4(this.rig.head.matrixWorld);
  }

  protected onReset() {
    this.chestOpen = false;
    this.asleep = false;
    this.ground = false;
    Object.assign(this.cur, SLEEP);
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  update(dt: number, env: EnemyEnv) {
    // Each frame starts from the base pose; the active move then bends it.
    this.target = this.state === 'dormant' ? { ...SLEEP } : { ...STAND };
    this.rate = this.state === 'dormant' ? 2 : 6;
    this.gloom = this.state === 'fight' ? (this.phase === 1 ? 0.25 : 0.55) : 0;
    if (this.state === 'intro') this.poseIntro(env);
    if (this.state === 'dying') this.poseDying(env);
    super.update(dt, env);
  }

  /** Lets moves bend the pose: `pose({ rArm: 2.9 }, 25)` with an optional snappier rate. */
  pose(p: Partial<Pose>, rate?: number) {
    Object.assign(this.target, p);
    if (rate !== undefined) this.rate = rate;
  }

  private poseIntro(env: EnemyEnv) {
    // Asleep in a heap, it stirs: the ember brightens, the lids crack open, and it heaves
    // itself up, block by block, with a long grinding breath.
    const t = this.stateT;
    if (t < 1.2) {
      this.pose({ ...SLEEP, ember: 0.35 + t * 0.8, float: 0.2 + t * 0.3 }, 3);
    } else if (t < 2.0) {
      this.pose({ ...SLEEP, lids: 0.55, eyes: 0.5, ember: 1.4, headPitch: 0.2, float: 0.7 }, 4);
    } else if (t < 3.4) {
      this.pose({ ...STAND, lean: 0.2, headPitch: -0.25, lids: 0.2, eyes: 1, ember: 1.6, rArm: 0.6, lArm: 0.6, rOut: 0.5, lOut: 0.5 }, 2.2);
    } else {
      this.pose({ ...STAND, headPitch: -0.1, lids: 0.35, eyes: 0.9, ember: 1.2 }, 4);
    }
    if (t > 2 && !this.ground) {
      this.ground = true;
      env.sfx.grind();
    }
    if (t > 2 && t < 3.4 && Math.random() < 0.4) env.particles.burst(this.pos.clone().setY(this.pos.y + 0.2 + Math.random() * 3), 0x6a645a, 2, 1.5, 0.9, false);
  }

  private poseDying(env: EnemyEnv) {
    // It slows, sinks to its knees, and its eyes close: asleep at last. The ember dims.
    const t = this.stateT;
    const k = clamp(t / 3.5, 0, 1);
    this.pose({ ...SLEEP, lids: Math.min(1, 0.3 + k), eyes: 1 - k, ember: 1.8 - k * 1.4, float: 1 - k * 0.8 }, 1.2);
    if (t > 3.5 && !this.asleep) {
      this.asleep = true;
      env.sfx.rumble();
      env.shake(0.4);
    }
  }

  protected animate(dt: number) {
    blendPose(this.cur, this.target, damp(this.rate, dt));
    // A slow, heavy breath; while stalking, a ponderous sway from foot to foot.
    this.breath += dt;
    const moving = this.vel.lengthSq() > 0.1;
    this.stepPhase += moving ? dt * 2.2 : 0;
    const sway = moving ? Math.sin(this.stepPhase) * 0.05 : 0;
    const p: Pose = { ...this.cur, hipsY: this.cur.hipsY + Math.sin(this.breath * 1.3) * 0.03 + (moving ? Math.abs(Math.sin(this.stepPhase)) * 0.05 : 0) };
    this.rig.apply(p, dt);
    this.rig.torso.rotation.z = sway;
  }
}

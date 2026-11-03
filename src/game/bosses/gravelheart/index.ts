import * as THREE from 'three';
import { clamp, damp } from '../../../core/math';
import { uniqueMat } from '../../../render/materials';
import type { Physics } from '../../../core/physics';
import type { WardenHearth } from '../../../world/dungeon/hearth';
import { Boss, type Move } from '../../boss';
import type { EnemyEnv, Hurtbox } from '../../enemies';
import { RING_WIDTH } from '../../../world/dungeon/hearth';
import { HOWL, KNEEL, MOVES, STAGGER } from './moves';
import { blendPose, GravelheartRig, SLEEP, STAND, type Pose } from './rig';

/**
 * GRAVELHEART, the Sleepless Warden. Boss of the Waking Shrine (docs/shrine.md, "The boss").
 *
 * The shrine's guardian was meant to sleep while the lantern burned. When the flame was
 * stolen, the thief pushed an ember into its chest, and now it can't sleep.
 *
 * Built in sessions (the build plan in docs/shrine.md). So far (B): the body, waking up and
 * phase 1: Hammerfall, Sweep, Stone volley and Grind. Everything is solid stone (the sword
 * clanks). Its ember sits behind three chest plates: a stuck Hammerfall slam works one
 * plate loose, the glove tears it off, and with all three gone it staggers with its chest
 * open (the sword's chance). It then pulls new plates from the walls, then from rubble.
 */
/** Seconds a landed stone lies about before it crumbles. */
const RUBBLE_LIFE = 7;

export class Gravelheart extends Boss {
  readonly title = 'Gravelheart';
  readonly epithet = 'the Sleepless Warden';
  protected readonly introDuration = 4.2;
  protected readonly dyingDuration = Infinity;
  /** Its chest can be struck right now (the punish window of a stuck slam). */
  chestOpen = false;
  /** It has settled, asleep at last (content's defeat script waits for this). */
  asleep = false;
  /** Which chest plates are on. */
  readonly plates = [true, true, true];
  /** Seconds the keystone in its back stays loose (Cairn Roll's daze), and the roll's angle and heading. */
  keyT = 0;
  spin = 0;
  readonly rollDir = new THREE.Vector3();
  /** Cairn Roll's stall detector: where it was last frame, and how long it has barely moved. */
  readonly rollLast = new THREE.Vector3();
  rollStall = 0;
  /** The plate glowing loose (or -1) and how long it stays loose. */
  loose = -1;
  looseT = 0;
  /** Stones that landed, lying about the hall: its next plates and ammunition. */
  readonly rubble: { at: THREE.Vector3; mesh: THREE.Mesh; age: number }[] = [];

  readonly rig: GravelheartRig;
  private readonly cur: Pose = { ...SLEEP };
  private target: Pose = { ...SLEEP };
  private rate = 6;
  private breath = 0;
  private stepPhase = 0;
  private ground = false;

  private readonly rubbleMat = uniqueMat(0x6f685d);
  private readonly rubbleGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);

  constructor(private readonly stage: THREE.Object3D, physics: Physics, readonly hearth: WardenHearth | null, x: number, y: number, z: number, yaw: number) {
    super(stage, physics, hearth, { x, y, z, yaw, hp: 40, radius: 1.5, halfHeight: 1.3, phases: [0.5] });
    this.lockHeight = 3;
    if (hearth) this.walkable = (px, pz) => hearth.walkable(px, pz, this.phase >= 2 ? 2 + RING_WIDTH : 2);
    this.deathColor = 0x8f887c;
    this.rig = new GravelheartRig(this.root);
    this.flashMats.push(...this.rig.flashMats);
    this.rig.apply(this.cur, 0);
  }

  protected moves(): Move<this>[] {
    return MOVES as Move<this>[];
  }

  protected phaseMove(phase: number): Move<this> | null {
    return phase === 2 ? (HOWL as Move<this>) : null;
  }

  /** The ring is rising (or up): it stands inside the shrunken arena, not under a tile. */
  keepInside() {
    const f = this.hearth?.platform;
    if (!f) return;
    const m = RING_WIDTH + 2;
    const x = clamp(this.pos.x, f.x0 + m, f.x1 - m), z = clamp(this.pos.z, f.z0 + m, f.z1 - m);
    if (x === this.pos.x && z === this.pos.z) return;
    this.pos.set(x, this.pos.y, z);
    this.character.teleport(this.pos);
  }

  /** Eases the roll angle to a whole turn, so the body comes to rest upright. */
  settleSpin(dt: number) {
    const turn = Math.PI * 2;
    this.spin += (Math.round(this.spin / turn) * turn - this.spin) * Math.min(1, dt * 8);
  }

  get platesOn() {
    return this.plates.filter(Boolean).length;
  }

  /** Stone everywhere: the sword clanks off anything but an open chest. */
  protected isGuarding(_toAttacker: THREE.Vector3, part: string) {
    return part !== 'chest';
  }

  protected get exposed() {
    return this.chestOpen;
  }

  protected damageMultiplier(part: string) {
    return part === 'chest' ? 2 : 1;
  }

  protected decideDelay() {
    return this.phase === 1 ? 1.1 + this.rng() * 0.7 : 0.6 + this.rng() * 0.5;
  }

  protected baseTurnRate() {
    return this.phase === 1 ? 1.1 : 1.6;
  }

  protected stalk(dt: number) {
    super.stalk(dt, 1.7, 3.5, 6.5);
  }

  // ---------------------------------------------------------------------------
  // Plates, stones, rubble
  // ---------------------------------------------------------------------------

  /** A stuck slam works one of the plates still on loose; the glove can tear it off. */
  loosenPlate() {
    const on = this.plates.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    if (!on.length) return;
    this.loose = on[Math.floor(this.rng() * on.length)];
    this.looseT = 2.4;
  }

  /** The glove, thrown from `from` along `dir`: if the loose plate is in front, it tears free. */
  tetherAt(from: THREE.Vector3, dir: THREE.Vector3) {
    if (this.state !== 'fight') return null;
    if (this.keyT > 0) return this.tetherKeystone(from, dir);
    if (this.loose < 0 || this.looseT <= 0) return null;
    this.root.updateMatrixWorld(true);
    const at = new THREE.Vector3().setFromMatrixPosition(this.rig.plates[this.loose].matrixWorld);
    const to = at.clone().sub(from).setY(0);
    const d = to.length();
    if (d > 14 || to.normalize().dot(dir) < 0.9) return null;
    const i = this.loose;
    this.plates[i] = false;
    this.loose = -1;
    this.looseT = 0;
    this.addRubble(from.clone().addScaledVector(dir, 1.8));
    this.env?.particles.burst(at, 0x9b9486, 16, 5, 0.6);
    this.env?.shake(0.5);
    this.env?.sfx.boom();
    if (!this.platesOn) this.interruptWith(STAGGER.name);
    return { at };
  }

  /** Phase two: the glove pulls the loose keystone out of its back, and it drops to its knees. */
  private tetherKeystone(from: THREE.Vector3, dir: THREE.Vector3) {
    this.root.updateMatrixWorld(true);
    const at = new THREE.Vector3().setFromMatrixPosition(this.rig.keystone.matrixWorld);
    const to = at.clone().sub(from).setY(0);
    // The keystone sits in its back: the cord only finds it from behind or the side.
    if (to.length() > 14 || to.normalize().dot(dir) < 0.9 || to.dot(this.forward) < 0.2) return null;
    this.keyT = 0;
    this.addRubble(from.clone().addScaledVector(dir, 1.8));
    this.env?.particles.burst(at, 0x9b9486, 18, 5, 0.6);
    this.env?.shake(0.6);
    this.env?.sfx.boom();
    this.interruptWith(KNEEL.name);
    return { at };
  }

  /** A stone to work with: out of a wall socket, or off the floor (null: the hall has none). */
  takeStone(near: THREE.Vector3): THREE.Vector3 | null {
    const fromWall = this.hearth?.take(near);
    if (fromWall) return fromWall;
    let best = -1;
    for (let i = 0; i < this.rubble.length; i++) {
      if (best < 0 || this.rubble[i].at.distanceToSquared(near) < this.rubble[best].at.distanceToSquared(near)) best = i;
    }
    if (best < 0) return null;
    const [r] = this.rubble.splice(best, 1);
    this.stage.remove(r.mesh);
    return r.at.clone().setY(r.at.y + 0.6);
  }

  /** A stone came to rest: it lies there until it is picked up again. */
  addRubble(at: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.rubbleGeo, this.rubbleMat);
    mesh.position.copy(at);
    mesh.rotation.y = this.rng() * 3;
    mesh.castShadow = true;
    this.stage.add(mesh);
    this.rubble.push({ at: at.clone(), mesh, age: 0 });
    if (this.rubble.length > 8) this.stage.remove(this.rubble.shift()!.mesh);
  }

  /** New plates from the walls, then from rubble (it never runs out: the last come from nowhere). */
  replate(env: EnemyEnv) {
    for (let i = 0; i < this.plates.length; i++) {
      if (this.plates[i]) continue;
      const from = this.takeStone(this.pos) ?? this.pos.clone().setY(this.pos.y + 4);
      env.particles.burst(from, 0x9b9486, 8, 3, 0.5);
      this.plates[i] = true;
    }
    env.sfx.grind();
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
    this.plates.fill(true);
    this.loose = -1;
    this.looseT = 0;
    for (const r of this.rubble.splice(0)) this.stage.remove(r.mesh);
    this.chestOpen = false;
    this.keyT = 0;
    this.spin = 0;
    this.asleep = false;
    this.ground = false;
    Object.assign(this.cur, SLEEP);
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  update(dt: number, env: EnemyEnv) {
    // Each frame starts from the base pose; the active move then bends it.
    this.target = this.state === 'dormant' ? { ...SLEEP } : { ...STAND, emberUp: this.phase >= 2 ? 1 : 0 };
    this.rate = this.state === 'dormant' ? 2 : 6;
    this.gloom = this.state === 'fight' ? (this.phase === 1 ? 0.25 : 0.55) : 0;
    if (this.state === 'intro') this.poseIntro(env);
    if (this.state === 'dying') this.poseDying(env);
    // Rubble crumbles away after a while (the walls and this are its only plates and ammunition).
    for (let i = this.rubble.length - 1; i >= 0; i--) {
      const r = this.rubble[i];
      r.age += dt;
      if (r.age > RUBBLE_LIFE) {
        this.stage.remove(r.mesh);
        this.rubble.splice(i, 1);
      } else if (r.age > RUBBLE_LIFE - 1) r.mesh.scale.setScalar(RUBBLE_LIFE - r.age);
    }
    if (this.keyT > 0) this.keyT -= dt;
    if (this.looseT > 0) {
      this.looseT -= dt;
      if (this.looseT <= 0) this.loose = -1;
    }
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
    this.rig.spin = this.spin;
    this.rig.apply(p, dt);
    this.rig.setKeystoneGlow(this.keyT > 0 ? 0.65 + Math.sin(this.breath * 14) * 0.35 : 0);
    for (let i = 0; i < this.plates.length; i++) {
      this.rig.plates[i].visible = this.plates[i];
      this.rig.setPlateGlow(i, i === this.loose && this.looseT > 0 ? 0.65 + Math.sin(this.breath * 14) * 0.35 : 0);
    }
    this.rig.torso.rotation.z = sway;
  }
}

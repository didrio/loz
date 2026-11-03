import * as THREE from 'three';
import { clamp, damp, easeOut, mix } from '../../core/math';
import { Layer, type Physics } from '../../core/physics';
import { mat, uniqueMat } from '../../render/materials';
import { glow } from '../../render/shapes';
import type { BossArena } from '../../world/objects';
import { Boss, type Move } from '../boss';
import { Gloomwisp, type Attack, type EnemyEnv, type Hurtbox } from '../enemies';

/**
 * THE HOLLOW LAMPLIGHTER, Keeper of a Stolen Flame. Mini-boss of Gloaming Hollow.
 *
 * When the shrine's great lantern went dark, its flame didn't go out: something took it.
 * A gaunt thing in a lamplighter's coat carries it now, gone cold and blue, in an iron
 * lantern cage where its face should be. It collects other lights too: wisps caged in little
 * lanterns on its belt. Beating it frees the stolen flame, which returns to the shrine as
 * its first ember.
 *
 * The fight, at a glance:
 * - Guards with its pole from the front while stalking: hit it from behind, or punish moves.
 * - Hook Sweep (2 guard): wide swing. Block, back off or jump it. Phase 2 adds a backhand (1).
 * - Snuffer Slam (3 guard): telegraphed overhead slam that sends a ring of cold fire along
 *   the ground (unblockable: jump it). The hook sticks in the earth and the head comes
 *   down: hit the lantern (×2).
 * - Cold Flame Volley (1 guard each): homing orbs at range. Phase 2 fires more than a full
 *   guard can take, so block some and strafe the rest.
 * - Spin (2 guard): if you keep hitting it from behind, it whirls around to punish greed.
 * - At half health it howls: tears its coat, frees its caged wisps (which orbit it and
 *   dive at you), the hollow goes dark, and it starts to Skitter: drops to all fours, eyes
 *   flashing red, and lunges. It crushes a whole guard (3): block it with every slot up,
 *   or jump it. Either way its head is low afterward.
 */

/**
 * The attack sheet: damage in half-hearts, and guard = how many of the shield's three slots a
 * block knocks down. A full guard can take exactly one sweep + backhand, or one slam.
 */
const ATTACKS = {
  sweep: { damage: 2, guard: 2, knockback: 13 },
  backhand: { damage: 2, guard: 1, knockback: 13 },
  spin: { damage: 2, guard: 2, knockback: 14 },
  slam: { damage: 2, guard: 3, knockback: 12 },
  orb: { damage: 1, guard: 1, knockback: 6 },
  /** Red eyes: crushes a whole guard. Block it with all three slots up, or jump it. */
  skitter: { damage: 2, guard: 3, knockback: 15 },
} satisfies Record<string, Attack>;

interface Pose {
  hipsY: number; lean: number; twist: number; roll: number;
  headPitch: number; headYaw: number; headRoll: number;
  rx: number; ry: number; rz: number; relbow: number;
  lx: number; ly: number; lz: number; lelbow: number;
  poleX: number; flame: number; eyes: number; flare: number; hook: number; stride: number;
}

const STAND: Pose = {
  hipsY: 1.75, lean: 0.28, twist: 0, roll: 0,
  headPitch: -0.2, headYaw: 0, headRoll: 0,
  rx: -0.25, ry: 0, rz: -0.12, relbow: -1.25,
  lx: 0.1, ly: 0, lz: 0.2, lelbow: -0.35,
  poleX: Math.PI / 2, flame: 1, eyes: 0, flare: 0, hook: 0, stride: 0,
};

const THIGH = 0.95, SHIN = 1.0;

/** A ragged strip of coat: narrows toward the bottom, with a few folds so it doesn't read as a plank. */
function coatStrip(width: number, len: number, seed: number) {
  const g = new THREE.BoxGeometry(width, len, 0.04, 1, 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const down = (len / 2 - p.getY(i)) / len; // 0 at the top, 1 at the bottom
    p.setX(i, p.getX(i) * (1 - down * 0.55) + Math.sin(down * 9 + seed) * 0.03 * down);
    p.setZ(i, p.getZ(i) + Math.sin(down * 7 + seed * 2) * 0.05 * down);
  }
  g.computeVertexNormals();
  return g;
}
const FLAME_COLD = new THREE.Color(0x7fdcff);
const FLAME_WARM = new THREE.Color(0xffb35a);

export class HollowLamplighter extends Boss {
  readonly title = 'The Hollow Lamplighter';
  readonly epithet = 'Keeper of a Stolen Flame';
  protected readonly introDuration = 4.4;
  protected readonly dyingDuration = 6;
  /** The cage has burst and the flame is free (content's defeat cutscene waits for this). */
  shattered = false;

  // Rig.
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly cage = new THREE.Group();
  private readonly armR: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group; fingers: THREE.Group[] };
  private readonly armL: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group; fingers: THREE.Group[] };
  private readonly legs: { thigh: THREE.Group; knee: THREE.Group; foot: THREE.Group }[] = [];
  private readonly pole = new THREE.Group();
  private readonly poleTip = new THREE.Object3D();
  private readonly strips: { g: THREE.Group; a: number; ph: number; front: boolean }[] = [];
  private readonly lanterns: { g: THREE.Group; glow: THREE.Mesh; ph: number }[] = [];
  private readonly flameOuter: THREE.Mesh;
  private readonly flameInner: THREE.Mesh;
  private readonly flameGlow: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private readonly hookGlow: THREE.Mesh;
  private readonly flameMat = new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly eyeMat = uniqueMat(0x050505, { emissive: 0x000000 });
  private readonly mask: THREE.Mesh;

  // Animation state.
  private readonly cur: Pose = { ...STAND };
  private target: Pose = { ...STAND };
  private rate = 6;
  private walkPhase = 0;
  private twitchT = 2;
  private twitch = 0;
  private introYaw = 0;
  private breath = 0;
  private torn = false;
  private poleDropped = false;
  private readonly minions: Gloomwisp[] = [];
  private backHits: number[] = [];

  constructor(parent: THREE.Object3D, physics: Physics, arena: BossArena | null, x: number, z: number, yaw: number) {
    super(parent, physics, arena, { x, z, yaw, hp: 30, radius: 0.9, halfHeight: 1.2, phases: [0.5] });
    this.lockHeight = 2.6;

    // Its own materials (not the shared palette), so the hit flash and guard tint touch only it.
    const cloth = [uniqueMat(0x1c1a22), uniqueMat(0x23202a), uniqueMat(0x17151c)];
    const bone = uniqueMat(0xd9d2bf), iron = uniqueMat(0x2a2c31), wood = uniqueMat(0x2e241c), dark = uniqueMat(0x0c0b0e);
    const maskMat = uniqueMat(0xe9e4d4);
    this.flashMats.push(...cloth, bone, iron, wood, dark, maskMat);
    const shadow = (m: THREE.Mesh) => ((m.castShadow = true), m);
    const add = (parentNode: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = shadow(new THREE.Mesh(geo, material));
      m.position.set(x, y, z);
      parentNode.add(m);
      return m;
    };

    this.root.add(this.hips);
    this.hips.position.y = STAND.hipsY;
    this.hips.add(this.torso);

    // Legs: long and digitigrade, bone-white below the coat, ending in clawed feet.
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.3, 0, 0);
      add(thigh, new THREE.BoxGeometry(0.16, THIGH, 0.16), cloth[0], 0, -THIGH / 2, 0);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      add(knee, new THREE.SphereGeometry(0.09, 6, 5), bone);
      add(knee, new THREE.CylinderGeometry(0.06, 0.04, SHIN, 6), bone, 0, -SHIN / 2, 0);
      const foot = new THREE.Group();
      foot.position.y = -SHIN;
      const sole = add(foot, new THREE.ConeGeometry(0.08, 0.55, 4), bone, 0, 0.02, 0.2);
      sole.rotation.x = Math.PI / 2;
      for (const t of [-1, 0, 1]) {
        const claw = add(foot, new THREE.ConeGeometry(0.025, 0.22, 4), dark, t * 0.06, 0, 0.48);
        claw.rotation.x = Math.PI / 2 + 0.3;
      }
      knee.add(foot);
      thigh.add(knee);
      this.hips.add(thigh);
      this.legs.push({ thigh, knee, foot });
    }

    // Ribcage, glimpsed through the gap in the coat (and laid bare in phase two).
    add(this.torso, new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), bone, 0, 0.85, -0.12);
    for (let i = 0; i < 6; i++) {
      const r = 0.3 - Math.abs(i - 2) * 0.035;
      const rib = add(this.torso, new THREE.TorusGeometry(r, 0.028, 4, 10, Math.PI * 1.1), bone, 0, 0.45 + i * 0.18, -0.12);
      rib.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05);
    }
    // A dull heart of cold light behind the ribs.
    const core = glow(0x6fe8ff, 0.22, 0.25);
    core.position.set(0, 1.0, -0.05);
    this.torso.add(core);

    // The coat: tattered strips hanging from the shoulders, open at the front.
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const front = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.95;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue; // the gap
      const len = 2.0 + ((i * 7) % 5) * 0.14 + (front ? -0.25 : 0);
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * 0.42, 1.55, Math.cos(a) * 0.42);
      g.rotation.order = 'YXZ';
      const strip = add(g, coatStrip(0.36, len, i * 1.3), cloth[i % 3], 0, -len / 2, 0);
      strip.scale.x = 0.8 + ((i * 3) % 4) * 0.12;
      // Ragged ends: a short tail on some strips.
      if (i % 3 === 0) add(g, new THREE.BoxGeometry(0.12, 0.4, 0.035), cloth[(i + 1) % 3], 0.08, -len - 0.15, 0);
      this.torso.add(g);
      this.strips.push({ g, a, ph: i * 1.7, front });
    }
    const collar = add(this.torso, new THREE.CylinderGeometry(0.52, 0.34, 0.55, 8, 1, true), cloth[1], 0, 1.72, 0);
    (collar.material as THREE.Material).side = THREE.DoubleSide;

    // Belt of caged lights: each little lantern holds a captured wisp.
    for (const [a, len] of [[0.75, 0.38], [-0.7, 0.3], [2.7, 0.42]] as const) {
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * 0.82, 0.55, Math.cos(a) * 0.82);
      add(g, new THREE.CylinderGeometry(0.012, 0.012, len, 4), iron, 0, -len / 2, 0);
      const cage = new THREE.Group();
      cage.position.y = -len - 0.12;
      add(cage, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6), iron, 0, -0.12, 0);
      add(cage, new THREE.ConeGeometry(0.12, 0.1, 6), iron, 0, 0.13, 0);
      for (let k = 0; k < 4; k++) {
        const ka = (k / 4) * Math.PI * 2;
        add(cage, new THREE.BoxGeometry(0.015, 0.24, 0.015), iron, Math.cos(ka) * 0.09, 0, Math.sin(ka) * 0.09);
      }
      const wisp = glow(0xb06aff, 0.09, 0.9);
      cage.add(wisp, glow(0xb06aff, 0.2, 0.25));
      g.add(cage);
      this.torso.add(g);
      this.lanterns.push({ g, glow: wisp, ph: a * 3 });
    }

    // Two candle stubs burning on its left shoulder: the only warm light on it.
    for (const [x, h, z] of [[0.38, 0.22, -0.12], [0.5, 0.14, 0.04]]) {
      add(this.torso, new THREE.CylinderGeometry(0.035, 0.04, h, 6), mat(0xe8dfc4), x, 1.62 + h / 2, z);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      f.position.set(x, 1.62 + h + 0.05, z);
      this.torso.add(f);
    }

    // Arms: absurdly long, ending in long curled fingers. The right one carries the pole.
    const arm = (side: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.5, 1.55, 0);
      shoulder.rotation.order = 'YXZ';
      add(shoulder, new THREE.SphereGeometry(0.12, 6, 5), cloth[2]);
      add(shoulder, new THREE.BoxGeometry(0.13, 1.15, 0.13), cloth[1], 0, -0.575, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -1.15;
      add(elbow, new THREE.CylinderGeometry(0.065, 0.05, 1.2, 6), bone, 0, -0.6, 0);
      const hand = new THREE.Group();
      hand.position.y = -1.2;
      add(hand, new THREE.BoxGeometry(0.15, 0.2, 0.06), bone, 0, -0.1, 0);
      const fingers: THREE.Group[] = [];
      for (let k = 0; k < 5; k++) {
        const fg = new THREE.Group();
        const thumb = k === 4;
        fg.position.set(thumb ? side * -0.09 : -0.06 + k * 0.04, thumb ? -0.08 : -0.2, thumb ? 0.03 : 0);
        const len = thumb ? 0.28 : 0.46 - Math.abs(k - 1.5) * 0.05;
        const seg = add(fg, new THREE.ConeGeometry(0.022, len, 4), bone, 0, -len / 2, 0);
        seg.rotation.x = Math.PI;
        if (thumb) fg.rotation.z = side * 0.6;
        hand.add(fg);
        fingers.push(fg);
      }
      elbow.add(hand);
      shoulder.add(elbow);
      this.torso.add(shoulder);
      return { shoulder, elbow, hand, fingers };
    };
    this.armR = arm(-1);
    this.armL = arm(1);

    // The lamplighter's pole: a tall shaft with a hook and a snuffer bell at the top.
    add(this.pole, new THREE.CylinderGeometry(0.045, 0.055, 4.2, 6), wood, 0, 0.9, 0);
    const hook = add(this.pole, new THREE.TorusGeometry(0.26, 0.035, 5, 12, Math.PI * 1.25), iron, 0.22, 3.05, 0);
    hook.rotation.z = -0.3;
    const bell = add(this.pole, new THREE.ConeGeometry(0.16, 0.32, 8, 1, true), iron, -0.06, 2.9, 0);
    (bell.material as THREE.Material).side = THREE.DoubleSide;
    bell.rotation.z = 0.4;
    add(this.pole, new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6), iron, 0, 2.75, 0);
    this.hookGlow = glow(0x9ff0ff, 0.45, 0);
    this.hookGlow.position.set(0.15, 3.0, 0);
    this.pole.add(this.hookGlow);
    this.poleTip.position.set(0, 3.0, 0);
    this.pole.add(this.poleTip);
    this.armR.hand.add(this.pole);
    this.pole.position.y = -0.12;

    // Neck and the lantern-cage head with a cracked porcelain mask and the stolen flame.
    this.neck.position.set(0, 1.62, 0.05);
    add(this.neck, new THREE.CylinderGeometry(0.06, 0.08, 0.62, 6), bone, 0, 0.31, 0);
    this.head.position.y = 0.62;
    this.neck.add(this.head);
    this.torso.add(this.neck);
    this.head.add(this.cage);
    add(this.cage, new THREE.CylinderGeometry(0.38, 0.3, 0.07, 6), iron, 0, 0, 0);
    add(this.cage, new THREE.ConeGeometry(0.46, 0.34, 6), iron, 0, 0.8, 0);
    add(this.cage, new THREE.TorusGeometry(0.12, 0.028, 4, 10), iron, 0, 1.03, 0);
    for (let k = 0; k < 6; k++) {
      const ka = (k / 6) * Math.PI * 2 + Math.PI / 6;
      add(this.cage, new THREE.BoxGeometry(0.035, 0.64, 0.035), iron, Math.sin(ka) * 0.34, 0.32, Math.cos(ka) * 0.34);
    }
    this.mask = add(this.head, new THREE.SphereGeometry(0.2, 10, 8), maskMat, 0, 0.32, 0.13);
    this.mask.scale.set(1, 1.3, 0.55);
    // Blank porcelain: two hollow, slightly uneven eyes, a hairline crack and a dark tear streak.
    for (const s of [-1, 1]) {
      const eye = add(this.mask, new THREE.SphereGeometry(0.045, 8, 6), this.eyeMat, s * 0.07, 0.04 + (s > 0 ? 0.008 : 0), 0.16);
      eye.scale.set(0.85, 1.25, 0.6);
    }
    const tear = add(this.mask, new THREE.BoxGeometry(0.014, 0.16, 0.06), dark, -0.072, -0.07, 0.15);
    tear.rotation.z = 0.06;
    const crack = add(this.mask, new THREE.BoxGeometry(0.008, 0.2, 0.06), dark, 0.04, 0.13, 0.155);
    crack.rotation.z = 0.45;

    this.flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.48, 6), this.flameMat);
    this.flameOuter.position.set(0, 0.42, -0.06);
    this.flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.flameInner.position.set(0, 0.36, -0.06);
    this.flameGlow = glow(0x7fdcff, 0.3, 0.16);
    this.flameGlow.position.set(0, 0.4, -0.05);
    this.light = new THREE.PointLight(0x7fdcff, 8, 18, 1.5);
    this.light.position.set(0, 0.45, 0.2);
    this.head.add(this.flameOuter, this.flameInner, this.flameGlow, this.light);

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------

  protected moves(): Move<this>[] {
    return [SWEEP, SLAM, VOLLEY, SKITTER] as Move<this>[];
  }

  protected phaseMove(phase: number): Move<this> | null {
    return phase === 2 ? (HOWL as Move<this>) : null;
  }

  /** The sword glances off the pole (an armor hurtbox, only while it's held at the ready). */
  protected isGuarding(_toAttacker: THREE.Vector3, part: string) {
    return part === 'pole';
  }

  protected damageMultiplier(part: string) {
    return part === 'head' ? 2 : 1;
  }

  protected decideDelay() {
    return this.phase === 1 ? 0.9 + Math.random() * 0.8 : 0.45 + Math.random() * 0.55;
  }

  protected baseTurnRate() {
    return this.phase === 1 ? 1.5 : 2.3;
  }

  protected stalk(dt: number) {
    super.stalk(dt, this.phase === 1 ? 2.4 : 3.2, 3.2, 5.8);
  }

  protected onHurt() {
    // Greed check: two hits in the back within two seconds earn a spinning counter.
    if (!this.env) return;
    const behind = this.toPlayer.dot(this.forward) < -0.2;
    if (!behind || this.move) return;
    const now = this.stateT;
    this.backHits = this.backHits.filter((t) => now - t < 2);
    this.backHits.push(now);
    if (this.backHits.length >= 2) {
      this.backHits = [];
      this.queue(SPIN as Move<this>);
    }
  }

  hurtboxes(): Hurtbox[] {
    this.root.updateMatrixWorld(true);
    return [
      this.box(this.head, new THREE.Vector3(0, 0.35, 0), 0.55, 'head', 2),
      this.box(this.torso, new THREE.Vector3(0, 0.95, 0), 0.85, 'body'),
      this.box(this.hips, new THREE.Vector3(0, -0.8, 0), 0.75, 'legs'),
      ...this.poleArmor(),
    ];
  }

  /**
   * The pole parries: armor along its shaft and hook, but only while it's held at the ready
   * (not committed to a move, so a slam's punish window stays open, and not dropped). A
   * swing that meets the pole clanks; one that gets past it, from an angle, lands.
   */
  private poleArmor(): Hurtbox[] {
    if (this.move || this.poleDropped) return [];
    const boxes: Hurtbox[] = [];
    for (let y = 0.2; y <= 2.8; y += 0.45) boxes.push({ ...this.box(this.pole, new THREE.Vector3(0, y, 0), 0.24, 'pole'), armor: true });
    boxes.push({ ...this.box(this.pole, new THREE.Vector3(0.1, 3.05, 0), 0.38, 'pole'), armor: true });
    return boxes;
  }

  /** The head's world position (wisps orbit it; the freed flame starts there). */
  headWorldPos() {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3(0, 0.4, 0).applyMatrix4(this.head.matrixWorld);
  }

  /** Where the pole's hook is right now (the slam lands here). */
  tipWorldPos() {
    this.root.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(this.poleTip.matrixWorld);
  }

  wake() {
    super.wake();
    this.introYaw = this.yaw;
  }

  // ---------------------------------------------------------------------------
  // Effects used by moves
  // ---------------------------------------------------------------------------

  /** Whether the player is inside an arc in front: range in meters, half-angle in radians. */
  inArc(range: number, halfAngle: number, maxPlayerHeight = 1.4) {
    if (!this.env) return false;
    const p = this.env.playerPos;
    if (this.distToPlayer > range || p.y - this.pos.y > maxPlayerHeight) return false;
    return Math.acos(clamp(this.toPlayer.dot(this.forward), -1, 1)) <= halfAngle;
  }

  /** Slams the hook into the ground: direct hit, shockwave(s), dust and a shake. */
  impact(env: EnemyEnv) {
    const tip = this.tipWorldPos();
    const ground = env.physics.groundY(tip.x, tip.z, tip.y + 3, Layer.World) ?? this.pos.y;
    const at = new THREE.Vector3(tip.x, ground, tip.z);
    if (env.playerPos.distanceTo(at) < 2.1) env.hitPlayer(at, ATTACKS.slam);
    env.hazards.shockwave(at, { speed: 9, maxRadius: 16, damage: 1 });
    if (this.phase >= 2) this.later(0.5, () => env.hazards.shockwave(at, { speed: 10.5, maxRadius: 16, damage: 1 }));
    env.particles.burst(at.clone().setY(at.y + 0.3), 0x6fe8ff, 18, 7, 0.6);
    env.particles.burst(at.clone().setY(at.y + 0.2), 0x4f4a42, 16, 5, 0.8);
    env.shake(0.7);
    env.sfx.boom();
  }

  /** Fires a fan of homing cold-flame orbs from the lantern. */
  volley(env: EnemyEnv, count: number) {
    const from = this.headWorldPos().addScaledVector(this.forward, 0.5);
    const aim = env.playerPos.clone().setY(env.playerPos.y + 1.1).sub(from).normalize();
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.3;
      const dir = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
      env.hazards.orb(from, dir, { speed: 8.5, homing: this.phase === 1 ? 0.8 : 1.05, life: 4.5, attack: ATTACKS.orb });
    }
    env.sfx.orbFire();
  }

  /** Phase two: rip open the coat and free the caged wisps to fight for it. */
  tearOpen(env: EnemyEnv) {
    this.torn = true;
    this.root.updateMatrixWorld(true);
    for (const s of this.strips) {
      if (!s.front) continue;
      s.g.visible = false;
      env.particles.burst(new THREE.Vector3(0, 1, 0).applyMatrix4(s.g.matrixWorld), 0x1c1a22, 6, 4, 0.9);
    }
    for (const l of this.lanterns) {
      l.g.visible = false;
      const at = new THREE.Vector3().setFromMatrixPosition(l.glow.matrixWorld);
      env.particles.burst(at, 0xb06aff, 12, 5, 0.6);
      const w = new Gloomwisp(this.root.parent!, env.physics, at.x, at.z, {
        nocturnal: false,
        anchor: () => (this.alive ? this.headWorldPos() : null),
        attackCooldown: 3.2,
      });
      w.pos.copy(at);
      this.minions.push(w);
      env.spawn(w);
    }
    env.pushPlayer(this.pos, 14);
    env.shake(0.9);
    env.sfx.howl();
    // A little mercy: two hearts tumble out with the wisps.
    for (const s of [-1, 1]) env.drop('heart', this.pos.clone().addScaledVector(new THREE.Vector3(-this.forward.z * s, 0, this.forward.x * s), 3));
  }

  protected onReset() {
    for (const w of this.minions) {
      w.alive = false;
      w.gone = true;
    }
    this.minions.length = 0;
    this.torn = false;
    this.shattered = false;
    for (const s of this.strips) s.g.visible = true;
    for (const l of this.lanterns) l.g.visible = true;
    if (this.poleDropped) {
      this.armR.hand.add(this.pole);
      this.pole.position.set(0, -0.12, 0);
      this.pole.rotation.set(0, 0, 0);
      this.poleDropped = false;
    }
    this.cage.visible = this.mask.visible = true;
    this.root.scale.setScalar(1);
    this.backHits = [];
  }

  protected onDeath() {
    for (const w of this.minions) if (w.alive) w.hurt(99, this.pos);
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  update(dt: number, env: EnemyEnv) {
    // Each frame starts from the base pose; the active move then bends it.
    this.target = { ...STAND };
    this.rate = 6;
    this.gloom = this.state === 'fight' ? (this.phase === 1 ? 0.3 : 0.8) : this.state === 'intro' ? 0.3 : 0;
    if (this.state === 'dormant') this.poseDormant(dt);
    if (this.state === 'intro') this.poseIntro(env, dt);
    if (this.state === 'dying') this.poseDying(env, dt);
    super.update(dt, env);
  }

  /** Lets moves bend the pose: `pose({ rx: -1.4 }, 25)` with an optional snappier rate. */
  pose(p: Partial<Pose>, rate?: number) {
    Object.assign(this.target, p);
    if (rate !== undefined) this.rate = rate;
  }

  private poseDormant(dt: number) {
    // Hunched like a dead scarecrow, back to the road, head hung. Every so often it twitches.
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = 2 + Math.random() * 4;
      this.twitch = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.3);
    }
    this.twitch *= Math.exp(-dt * 3);
    this.pose({
      lean: 0.6, hipsY: 1.7, headPitch: 0.75, headRoll: this.twitch, rx: 0.05, relbow: -1.1, lx: 0.12, lz: 0.08,
      lelbow: -0.1, flame: 0.3, poleX: Math.PI / 2 + 0.25,
    });
  }

  private poseIntro(env: EnemyEnv, dt: number) {
    const t = this.stateT;
    const toPlayer = Math.atan2(env.playerPos.x - this.pos.x, env.playerPos.z - this.pos.z);
    const turn = ((toPlayer - this.introYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (t < 1.3) {
      // The head turns all the way around first; the body doesn't move.
      const k = easeOut(t / 1.3);
      this.pose({ lean: 0.6, hipsY: 1.7, headPitch: mix(0.75, -0.1, k), headYaw: turn * k, flame: mix(0.3, 0.7, k), rx: 0.05, relbow: -1.1, lx: 0.12, lz: 0.08, lelbow: -0.1 }, 20);
      if (t < dt * 1.5) env.sfx.creak();
    } else if (t < 2.4) {
      // Then the body turns to match and unfolds to its full height.
      const k = easeOut((t - 1.3) / 1.1);
      this.yaw = this.introYaw + turn * k;
      this.pose({ headYaw: turn * (1 - k), lean: mix(0.6, -0.15, k), hipsY: mix(1.7, 1.92, k), lz: mix(0.08, 0.9, k), rz: mix(-0.12, -0.6, k), flame: 0.9 }, 10);
    } else if (t < 3.3) {
      // A shriek: head thrown back, flame flaring, eyes burning.
      this.pose({ lean: -0.25, hipsY: 1.92, headPitch: -0.65, headRoll: Math.sin(t * 40) * 0.08, lz: 1.1, lx: -0.5, rz: -0.7, flame: 2.2, eyes: 1, flare: 0.5 }, 14);
      if (t - dt < 2.4) {
        env.sfx.shriek();
        env.shake(0.5);
      }
    } else {
      this.pose({ flame: 1.2 }, 4);
    }
  }

  private poseDying(env: EnemyEnv, dt: number) {
    const t = this.stateT;
    const shake = Math.sin(t * 50) * 0.06;
    if (t < 0.9) {
      this.pose({ lean: -0.45, headPitch: -0.5, headRoll: shake * 4, lz: 1.2, rz: -1.0, lx: -1.2, flame: 1.6 + Math.sin(t * 30), eyes: 1 }, 12);
    } else if (t < 2.1) {
      this.pose({ hipsY: 0.85, lean: 0.55, headPitch: 0.3, rx: 0.2, relbow: -0.3, lx: 0.25, lelbow: -0.2, lz: 0.3, flame: 1.2 }, 5);
      if (!this.poleDropped) {
        // Let go of the pole: it stays behind in the hollow after the body crumbles.
        this.poleDropped = true;
        this.root.parent?.attach(this.pole);
      }
    } else if (t < 3.5) {
      // The cage rattles; the cold flame warms.
      this.pose({ hipsY: 0.85, lean: 0.4, headPitch: -0.4, headRoll: shake * 3, headYaw: shake * 2, flame: 1.5 + (t - 2.1) * 1.2 }, 20);
    } else {
      if (!this.shattered) {
        this.shattered = true;
        const at = this.headWorldPos();
        this.cage.visible = this.mask.visible = false;
        env.particles.burst(at, 0x2a2c31, 22, 7, 1.0);
        env.particles.burst(at, 0xe9e4d4, 10, 5, 1.0);
        env.particles.burst(at, 0xffb35a, 24, 6, 0.8);
        env.shake(0.6);
        env.sfx.shatter();
      }
      // The body crumbles into ash.
      const k = clamp((t - 3.6) / 2.2, 0, 1);
      this.root.scale.set(1 - k * 0.3, Math.max(0.01, 1 - k), 1 - k * 0.3);
      if (Math.random() < dt * 30) env.particles.burst(this.pos.clone().setY(this.pos.y + 1 + Math.random() * 2 * (1 - k)), 0x3a3633, 2, 1.5, 1.2, false);
      this.pose({ hipsY: 0.8, lean: 0.9, flame: Math.max(0, 1 - k * 3) }, 3);
    }
    if (this.poleDropped) {
      // The pole tips over and lies in the dust.
      const k = clamp((t - 0.9) / 0.8, 0, 1);
      this.pole.rotation.z = mix(this.pole.rotation.z, Math.PI / 2 - 0.1, k * 0.2);
      this.pole.position.y = mix(this.pole.position.y, this.pos.y + 0.1, k * 0.2);
    }
  }

  protected animate(dt: number) {
    const c = this.cur, tg = this.target;
    const k = damp(this.rate, dt);
    for (const key of Object.keys(tg) as (keyof Pose)[]) c[key] += (tg[key] - c[key]) * k;

    // Walking: long, slow strides, with a slight bob.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * speed * 1.6;
    const swing = Math.sin(this.walkPhase) * Math.min(1, speed / 3) * 0.45 + c.stride;
    this.breath += dt;

    this.hips.position.y = c.hipsY + Math.abs(Math.sin(this.walkPhase)) * 0.06 * Math.min(1, speed / 3) + Math.sin(this.breath * 1.3) * 0.02;
    this.torso.rotation.set(c.lean + Math.sin(this.breath * 1.3) * 0.02, c.twist, c.roll);
    this.neck.rotation.set(c.headPitch * 0.5, c.headYaw * 0.4, c.headRoll * 0.5);
    this.head.rotation.set(c.headPitch * 0.5, c.headYaw * 0.6, c.headRoll * 0.5);

    // Legs: two-bone IK keeps the feet on the ground at any hip height.
    const h = clamp(c.hipsY, 0.6, THIGH + SHIN - 0.02);
    const kneeIn = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - h * h) / (2 * THIGH * SHIN), -1, 1));
    const thighA = Math.acos(clamp((THIGH * THIGH + h * h - SHIN * SHIN) / (2 * THIGH * h), -1, 1));
    const bend = Math.PI - kneeIn;
    this.legs.forEach((leg, i) => {
      const s = (i === 0 ? 1 : -1) * swing;
      leg.thigh.rotation.x = -thighA + s - c.lean * 0.3;
      leg.knee.rotation.x = bend;
      leg.foot.rotation.x = thighA - bend - s + c.lean * 0.3;
    });

    const setArm = (a: typeof this.armR, x: number, y: number, z: number, elbow: number, curl: number) => {
      a.shoulder.rotation.set(x, y, z);
      a.elbow.rotation.x = elbow;
      a.fingers.forEach((f, i) => (f.rotation.x = -curl - (i % 2) * 0.1));
    };
    const armSwing = Math.sin(this.walkPhase) * Math.min(1, speed / 3) * 0.2;
    setArm(this.armR, c.rx, c.ry, c.rz, c.relbow, 0.9);
    setArm(this.armL, c.lx - armSwing, c.ly, c.lz, c.lelbow, 0.35 + Math.sin(this.breath * 2.1) * 0.15);
    if (!this.poleDropped) this.pole.rotation.set(c.poleX, 0, 0);

    // The coat sways, and flares out when it moves fast.
    const flare = c.flare + Math.min(0.4, speed * 0.05);
    for (const s of this.strips) {
      s.g.rotation.set(-0.24 - flare - Math.sin(this.breath * 2 + s.ph) * 0.05, s.a, Math.sin(this.breath * 1.3 + s.ph) * 0.04);
    }
    for (const l of this.lanterns) {
      l.g.rotation.set(Math.sin(this.breath * 2.5 + l.ph) * 0.25, 0, Math.cos(this.breath * 2 + l.ph) * 0.2);
      (l.glow.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.breath * 6 + l.ph) * 0.3;
    }

    // The stolen flame: flickers, swells with effort, warms as it dies.
    const flick = 0.85 + Math.sin(this.breath * 17) * 0.08 + Math.sin(this.breath * 29) * 0.07;
    const f = Math.max(0, c.flame) * flick;
    this.flameOuter.scale.set(0.8 + Math.min(f, 1.6) * 0.25, Math.max(0.01, Math.min(f, 1.8)), 0.8 + Math.min(f, 1.6) * 0.25);
    this.flameInner.scale.setScalar(Math.max(0.01, Math.min(f, 1.5) * 0.9));
    this.flameGlow.scale.setScalar(0.8 + Math.min(f, 1.6) * 0.25);
    const warmth = this.state === 'dying' ? clamp((this.stateT - 2.1) / 1.4, 0, 1) : 0;
    const color = FLAME_COLD.clone().lerp(FLAME_WARM, warmth);
    this.flameMat.color.copy(color);
    (this.flameGlow.material as THREE.MeshBasicMaterial).color.copy(color);
    this.light.color.copy(color);
    this.light.intensity = (this.shattered ? 0 : 7) * f;
    this.eyeMat.emissive.setRGB(c.eyes, 0.05 * c.eyes, 0.02 * c.eyes);
    (this.hookGlow.material as THREE.MeshBasicMaterial).opacity = c.hook * 0.6;
  }
}

// ---------------------------------------------------------------------------
// The moveset
// ---------------------------------------------------------------------------

type L = HollowLamplighter;

/** Hook Sweep: drawn far back (glowing hook), then a wide swing in front. */
const SWEEP: Move<L> = {
  name: 'sweep',
  timing: (b) => ({ windup: b.phase === 1 ? 0.8 : 0.62, active: 0.24, recover: b.phase === 1 ? 0.85 : 0.6 }),
  weight: (_b, d) => (d < 5.6 ? 3 : d < 7 ? 0.8 : 0),
  enter(b, step, env) {
    if (step === 'active') env.sfx.heavySwing();
    if (step === 'active') b.scratch.hitDone = false;
    if (step === 'recover' && b.phase >= 2 && Math.random() < 0.45) b.queue(BACKHAND);
  },
  update(b, step, t, env) {
    if (step === 'windup') {
      b.turnRate = 1.4;
      b.pose({ twist: -0.75 * t, rx: -1.25, ry: -1.9, rz: -0.2, relbow: -0.25, poleX: Math.PI, hook: t, lean: 0.15, lx: -0.4, lz: 0.6 }, 8);
    } else if (step === 'active') {
      b.turnRate = 0;
      b.pose({ twist: 0.75, rx: -1.35, ry: 1.7, rz: -0.2, relbow: -0.1, poleX: Math.PI, hook: 1, flare: 0.45, lean: 0.25, lx: -0.2, lz: 0.9 }, 28);
      if (t > 0.3 && !b.scratch.hitDone) {
        b.scratch.hitDone = true;
        if (b.inArc(5.6, 1.95)) env.hitPlayer(b.pos, ATTACKS.sweep);
      }
    } else {
      b.turnRate = 0.5;
      b.pose({ twist: 0.5 * (1 - t), rx: mix(-1.2, -0.25, t), ry: mix(1.5, 0, t), relbow: mix(-0.1, -1.25, t), poleX: mix(Math.PI, Math.PI / 2, t), hook: 0 }, 5);
    }
  },
};

/** Backhand: phase two's quick return swing after a sweep. */
const BACKHAND: Move<L> = {
  name: 'backhand',
  timing: () => ({ windup: 0.34, active: 0.24, recover: 0.9 }),
  weight: () => 0,
  enter(b, step, env) {
    if (step === 'active') {
      env.sfx.heavySwing();
      b.scratch.hitDone = false;
    }
  },
  update(b, step, t, env) {
    if (step === 'windup') {
      b.turnRate = 2;
      b.pose({ twist: 0.8, rx: -1.3, ry: 1.9, relbow: -0.2, poleX: Math.PI, hook: t }, 12);
    } else if (step === 'active') {
      b.turnRate = 0;
      b.pose({ twist: -0.8, rx: -1.35, ry: -1.7, relbow: -0.1, poleX: Math.PI, hook: 1, flare: 0.45 }, 28);
      if (t > 0.3 && !b.scratch.hitDone) {
        b.scratch.hitDone = true;
        if (b.inArc(5.6, 1.95)) env.hitPlayer(b.pos, ATTACKS.backhand);
      }
    } else {
      b.turnRate = 0.5;
      b.pose({ rx: mix(-1.2, -0.25, t), ry: mix(-1.5, 0, t), relbow: mix(-0.1, -1.25, t), poleX: mix(Math.PI, Math.PI / 2, t), hook: 0 }, 5);
    }
  },
};

/**
 * Snuffer Slam: rises to full height with the pole overhead, then slams the hook down.
 * A ring of cold fire races out along the ground (two in phase two); the hook sticks and
 * the head comes down within reach.
 */
const SLAM: Move<L> = {
  name: 'slam',
  cooldown: 1.5,
  timing: (b) => ({ windup: b.phase === 1 ? 1.05 : 0.85, active: 0.16, recover: b.phase === 1 ? 2.1 : 1.7 }),
  weight: (b, d) => (d >= 2.5 && d <= 8.5 ? (b.phase === 1 ? 2.5 : 3) : d < 2.5 ? 0.6 : 0.3),
  enter(b, step, env) {
    if (step === 'windup') env.sfx.creak();
    if (step === 'recover') b.impact(env);
  },
  update(b, step, t) {
    if (step === 'windup') {
      b.turnRate = 1;
      if (b.distToPlayer > 5) b.vel.copy(b.toPlayer).multiplyScalar(1.8);
      b.pose({ hipsY: mix(1.75, 1.95, t), lean: -0.3, rx: -3.0, ry: 0, rz: -0.25, relbow: -0.15, lx: -2.7, lz: 0.35, lelbow: -0.3, poleX: Math.PI, hook: t, headPitch: -0.35, flame: 1.4 }, 7);
    } else if (step === 'active') {
      b.turnRate = 0;
      b.pose({ hipsY: 1.3, lean: 0.95, rx: -0.55, rz: -0.15, relbow: -0.05, lx: -0.6, lz: 0.2, lelbow: -0.1, poleX: Math.PI, hook: 1, headPitch: 0.1, flare: 0.3 }, 40);
    } else {
      // Stuck: tugging at the pole, head low and exposed. Yanks free at the end.
      b.turnRate = 0;
      const free = t > 0.8;
      const tug = Math.max(0, Math.sin(t * 22)) * 0.12;
      b.pose(free
        ? { hook: 0 }
        : { hipsY: 1.25, lean: 1.12 - tug, rx: -0.5, rz: -0.15, relbow: -0.05, lx: -0.55, lz: 0.2, lelbow: -0.1, poleX: Math.PI, hook: 0.2, headPitch: 0.35, headRoll: Math.sin(t * 9) * 0.15, flame: 0.7 },
      free ? 5 : 12);
    }
  },
};

/** Cold Flame Volley: rears back, the flame swells, and a fan of homing orbs flies out. */
const VOLLEY: Move<L> = {
  name: 'volley',
  cooldown: 3.2,
  timing: (b) => ({ windup: 0.85, active: b.phase === 1 ? 0.3 : 0.9, recover: 0.7 }),
  weight: (_b, d) => (d >= 8 ? 3 : d >= 5.5 ? 1.2 : 0),
  enter(b, step, env) {
    if (step === 'windup') env.sfx.inhale();
    if (step === 'active') {
      b.volley(env, b.phase === 1 ? 3 : 4);
      b.scratch.second = false;
    }
  },
  update(b, step, t, env) {
    if (step === 'windup') {
      b.turnRate = 1.8;
      b.pose({ headPitch: -0.5, lean: -0.1, flame: 1 + t * 1.2, lx: -1.3, lz: 0.5, lelbow: -0.6 }, 7);
    } else if (step === 'active') {
      b.turnRate = 1.2;
      b.pose({ headPitch: 0.25, lean: 0.35, flame: 2.2, lx: -1.5, lz: 0.3, lelbow: -0.2 }, 18);
      if (b.phase >= 2 && t > 0.55 && !b.scratch.second) {
        b.scratch.second = true;
        b.volley(env, 4);
      }
    } else {
      b.turnRate = 1;
      b.pose({ flame: 1 }, 5);
    }
  },
};

/** Spin: punishes standing behind it. A hiss, a crouch, then a full whirl of the pole. */
const SPIN: Move<L> = {
  name: 'spin',
  timing: () => ({ windup: 0.5, active: 0.38, recover: 0.75 }),
  weight: () => 0,
  enter(b, step, env) {
    if (step === 'windup') env.sfx.hiss();
    if (step === 'active') {
      env.sfx.heavySwing();
      b.scratch.hitDone = false;
    }
  },
  update(b, step, t, env, dt) {
    b.turnRate = 0;
    if (step === 'windup') {
      b.pose({ hipsY: 1.45, lean: 0.4, rx: -1.3, ry: -1.2, relbow: -0.3, poleX: Math.PI, hook: t, twist: -0.5 }, 12);
    } else if (step === 'active') {
      b.yaw += (Math.PI * 2 * dt) / 0.38;
      b.pose({ hipsY: 1.5, lean: 0.3, rx: -1.4, ry: 0.9, relbow: -0.1, poleX: Math.PI, hook: 1, flare: 0.6 }, 25);
      if (t > 0.4 && !b.scratch.hitDone) {
        b.scratch.hitDone = true;
        if (b.distToPlayer < 5.4 && env.playerPos.y - b.pos.y < 1.4) env.hitPlayer(b.pos, ATTACKS.spin);
      }
    } else {
      b.pose({ rx: mix(-1.2, -0.25, t), ry: 0, relbow: mix(-0.1, -1.25, t), poleX: mix(Math.PI, Math.PI / 2, t), hook: 0 }, 6);
    }
  },
};

/**
 * Skitter (phase two): drops onto all fours with its eyes burning red, scuttles at you in a
 * zigzag and lunges. Crushes a whole guard: block with all three slots up, or jump it.
 * Afterward it's low and open.
 */
const SKITTER: Move<L> = {
  name: 'skitter',
  cooldown: 5,
  timing: () => ({ windup: 0.65, active: 1.6, recover: 1.3 }),
  weight: (b, d) => (b.phase >= 2 && d >= 5.5 ? 2.2 : 0),
  enter(b, step, env) {
    if (step === 'windup') env.sfx.shriek();
    if (step === 'active') b.scratch.lunged = false;
  },
  update(b, step, t, env) {
    const crawl = { hipsY: 1.05, lean: 1.38, headPitch: -1.15, rx: -1.25, rz: -0.25, relbow: -0.15, lx: -1.25, lz: 0.25, lelbow: -0.15, poleX: 0.15, eyes: 1 };
    if (step === 'windup') {
      b.turnRate = 3;
      b.pose({ ...crawl, eyes: t }, 9);
    } else if (step === 'active') {
      b.turnRate = 5;
      const side = new THREE.Vector3(-b.toPlayer.z, 0, b.toPlayer.x);
      b.vel.copy(b.toPlayer).multiplyScalar(11).addScaledVector(side, Math.sin(b.stepT * 11) * 4);
      const gallop = Math.sin(b.stepT * 18);
      b.pose({ ...crawl, rx: -1.25 + gallop * 0.5, lx: -1.25 - gallop * 0.5, stride: gallop * 0.6, flare: 0.5 }, 20);
      if (b.distToPlayer < 2.7 && !b.scratch.lunged) {
        b.scratch.lunged = true;
        env.sfx.shriek();
        if (b.inArc(3.2, 1.2)) env.hitPlayer(b.pos, ATTACKS.skitter);
        b.skipStep();
      } else if (t >= 1) b.skipStep();
    } else {
      // Panting on all fours, head low: the opening.
      b.turnRate = 0.4;
      const heave = Math.sin(b.stepT * 8) * 0.06;
      b.pose(t < 0.75 ? { ...crawl, lean: 1.38 + heave, eyes: 1 - t } : { eyes: 0 }, t < 0.75 ? 10 : 4);
    }
  },
};

/** Howl (half health): clutches its head, then tears open its coat and frees the wisps. */
const HOWL: Move<L> = {
  name: 'howl',
  timing: () => ({ windup: 0.9, active: 1.1, recover: 0.7 }),
  weight: () => 0,
  enter(b, step, env) {
    if (step === 'windup') env.sfx.creak();
    if (step === 'active') b.tearOpen(env);
  },
  update(b, step, t) {
    b.turnRate = 0.5;
    if (step === 'windup') {
      b.pose({ rx: -2.7, rz: 0.4, relbow: -1.9, lx: -2.7, lz: -0.4, lelbow: -1.9, poleX: 0.3, lean: 0.5, headPitch: 0.4, headRoll: Math.sin(t * 40) * 0.2, flame: 0.5 + Math.random() }, 10);
    } else if (step === 'active') {
      b.pose({ rx: -0.7, rz: -1.2, relbow: -0.2, lx: -0.7, lz: 1.2, lelbow: -0.2, poleX: Math.PI, lean: -0.3, hipsY: 1.95, headPitch: -0.75, flame: 2.4, eyes: 1, flare: 0.7 }, 14);
    } else {
      b.pose({ flame: 1.2 }, 5);
    }
  },
};

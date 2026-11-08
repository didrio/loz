import * as THREE from 'three';
import { damp, lerpAngle } from '../core/math';
import type { Physics } from '../core/physics';
import { uniqueSurf } from '../render/materials';
import { GroundEnemy, type Attack, type EnemyEnv, type HurtResult } from './enemies';

/** The two-handed maul: heavy on the guard (block one, then back off and lower the shield). */
export const SENTINEL_SWING: Attack = { damage: 4, guard: 2, knockback: 16, stone: true };

/** It wakes when Wren comes this close (and it can see Wren). */
export const SENTINEL_WAKE_RANGE = 5;
/** Seconds of grinding before it moves: the tell that the statue is alive. */
const WAKE_TIME = 1.1;
/** Raising the maul overhead. */
const WINDUP_TIME = 0.95;
/** The maul coming down: the only time it can hurt. */
const SWING_TIME = 0.22;
/** Stuck with the maul in the floor: the punish window, front hits land too. */
export const SENTINEL_RECOVER = 1.6;
/** Points along the haft and the maul head (in the arms' frame) and their radii: the armor. */
const MAUL_ARMOR: [number, number][] = [[0.9, 0.22], [1.5, 0.22], [2.15, 0.38], [2.55, 0.38]];
/**
 * Where the blow can catch Wren: a strip straight ahead of it, `SWING_HALF_WIDTH` either side
 * of its line, out to `SWING_REACH` (where the maul head lands, plus Wren's body). The reach
 * comes from the model, not a bigger hitbox: a long haft, the arms stretching out and a
 * short lunge (`LUNGE`) during the swing. (History: 3.1 m / ±1.2 rad missed a Wren right in
 * front of it; 4.3 m / ±1.6 rad then caught her far off to the side. Owner, 2026-11-02.)
 */
export const SWING_REACH = 3.1;
export const SWING_HALF_WIDTH = 0.8;
/** Metres it steps forward during the swing. */
export const LUNGE = 0.6;
/** Arm angle (radians) that sets the maul head down on the floor. */
const FLOOR_ARMS = 0.28;
/** How far the arms push forward during the blow (and stay while the maul is in the floor). */
const ARM_STRETCH = 0.35;

/**
 * The Dozing Sentinel (docs/shrine.md, "Enemies"): a stone statue that sleeps until Wren
 * comes within ~5 m, then wakes with a grinding tell. Slow, with a heavy two-handed swing
 * and a long recovery. The maul it holds out in front is armor: a swing that meets the
 * maul before the body glances off, one that gets past it (from an angle, or while the maul
 * is raised or in the floor) lands. Hitting it asleep only wakes it (the stone rings).
 */
export class DozingSentinel extends GroundEnemy {
  private state: 'asleep' | 'waking' | 'guard' | 'chase' | 'windup' | 'swing' | 'recover' = 'asleep';
  private t = 0;
  /** This swing already landed (or was blocked), so it can't hit twice. */
  private struck = false;
  private readonly body = new THREE.Group();
  private readonly arms = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a241c });

  constructor(parent: THREE.Object3D, physics: Physics, x: number, z: number, fromY = 400, territory?: (p: THREE.Vector3) => boolean, facing = 0) {
    super(physics, x, z, fromY, territory, 0.75, 0.6);
    this.hp = 6;
    this.radius = 1.0;
    this.lockHeight = 1.5;
    this.deathColor = 0xb3a68a;
    this.yaw = facing;

    const stone = uniqueSurf('stone', 0xa39880), dark = uniqueSurf('stone', 0x7d735f), maulMat = uniqueSurf('rock', 0x6b6253);
    this.flashMats.push(stone, dark, maulMat);
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, into: THREE.Object3D) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      into.add(mesh);
      return mesh;
    };
    // Legs and a broad, square torso; the head a heavy block with a brow.
    box(0.45, 0.9, 0.5, dark, -0.32, 0.45, 0, this.body);
    box(0.45, 0.9, 0.5, dark, 0.32, 0.45, 0, this.body);
    box(1.3, 1.1, 0.75, stone, 0, 1.45, 0, this.body);
    box(1.6, 0.3, 0.85, dark, 0, 2.05, 0, this.body); // shoulders
    this.head.position.set(0, 2.2, 0.05);
    box(0.6, 0.6, 0.6, stone, 0, 0.3, 0, this.head);
    box(0.7, 0.14, 0.2, dark, 0, 0.45, 0.3, this.head);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), this.eyeMat);
      eye.position.set(s * 0.15, 0.3, 0.31);
      this.head.add(eye);
    }
    this.body.add(this.head);
    // Arms pivot at the shoulders and hold the maul together in front.
    this.arms.position.set(0, 1.95, 0);
    for (const s of [-1, 1]) box(0.3, 1.0, 0.32, stone, s * 0.62, -0.45, 0.25, this.arms);
    box(0.95, 0.2, 0.25, dark, 0, -0.95, 0.4, this.arms); // the hands
    box(0.16, 1.7, 0.16, dark, 0, -0.95, 1.2, this.arms).rotation.x = Math.PI / 2; // haft
    box(0.55, 0.55, 0.85, maulMat, 0, -0.95, 2.35, this.arms); // head of the maul
    this.body.add(this.arms);
    this.root.add(this.body);
    parent.add(this.root);
    this.pose(0);
  }

  /** Awake and fighting (for tests and debugging). */
  get alert() {
    return this.state === 'chase' || this.state === 'windup' || this.state === 'swing';
  }

  get asleep() {
    return this.state === 'asleep' || this.state === 'waking';
  }

  /** Lock-on can't tell a sleeping sentinel from the gallery's other statues. */
  get targetable() {
    return this.alive && !this.asleep;
  }

  hurt(dmg: number, from: THREE.Vector3, part = 'body'): HurtResult {
    if (!this.alive) return 'ignored';
    if (this.asleep) {
      // The stone rings and it stirs, but a sleeping statue takes no harm.
      this.wake();
      return 'guarded';
    }
    if (part === 'maul') return 'guarded';
    const r = super.hurt(dmg, from, part);
    this.knock.multiplyScalar(0.15); // stone barely moves
    return r;
  }

  /**
   * The body, plus the maul as armor where the model holds it. Not while the maul lies in
   * the floor after a blow: it's under the blade then, and that's the punish window.
   */
  hurtboxes() {
    const boxes = super.hurtboxes();
    if (this.state === 'recover') return boxes;
    this.root.updateMatrixWorld(true);
    for (const [z, radius] of MAUL_ARMOR) {
      const center = new THREE.Vector3(0, -0.95, z).applyMatrix4(this.arms.matrixWorld);
      boxes.push({ center, radius, part: 'maul', priority: 0, armor: true });
    }
    return boxes;
  }

  private wake() {
    if (this.state === 'asleep') this.go('waking');
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
    const toYaw = Math.atan2(to.x, to.z);
    const vel = new THREE.Vector3();
    let face = this.yaw;
    let turn = 2.5;

    switch (this.state) {
      case 'asleep':
        if (dist < SENTINEL_WAKE_RANGE && this.sees(env, 2.3)) this.wake();
        break;
      case 'waking':
        if (this.t < dt * 1.5) {
          env.sfx.grind();
          env.shake(0.12);
        }
        face = toYaw;
        turn = 1.5;
        if (this.t > WAKE_TIME) {
          this.go('chase');
          this.unseen = 0;
        }
        break;
      case 'guard': {
        // Awake, back at its post: it notices Wren by sight now, no need to come close.
        const back = this.home.clone().sub(this.pos).setY(0);
        if (back.length() > 0.5) {
          vel.copy(back.normalize()).multiplyScalar(1.6);
          face = Math.atan2(back.x, back.z);
        }
        if (dist < 12 && this.calm <= 0 && this.sees(env, 2.3)) {
          this.go('chase');
          this.unseen = 0;
        }
        break;
      }
      case 'chase':
        vel.copy(to).multiplyScalar(2.3);
        face = toYaw;
        if (this.lostTrack(env, dist, dt, 2.3)) {
          this.go('guard');
          this.calm = 3;
        } else if (dist < 2.8 && this.unseen === 0) {
          this.go('windup');
          env.sfx.grind(WINDUP_TIME * 0.8); // ends before the blow, so no grinding bleeds into it
        }
        break;
      case 'windup':
        face = toYaw;
        turn = 3;
        if (this.t > WINDUP_TIME) {
          this.go('swing');
          this.struck = false;
          env.sfx.heavySwing();
        }
        break;
      case 'swing':
        // Any moment of the blow can catch Wren in front of it, not just the frame it lands.
        vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(LUNGE / SWING_TIME);
        if (!this.struck && this.inStrikeZone(env.playerPos) && this.level(env)) {
          this.struck = true;
          env.hitPlayer(this.pos, SENTINEL_SWING);
        }
        if (this.t > SWING_TIME) {
          const strike = this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(2.2 + ARM_STRETCH));
          env.sfx.stoneThunk();
          env.shake(0.2);
          env.particles.burst(strike.setY(this.pos.y + 0.2), 0xb3a68a, 10, 4, 0.5);
          this.go('recover');
        }
        break;
      case 'recover':
        turn = 0; // stuck: the maul is in the floor
        if (this.t > SENTINEL_RECOVER) this.go('chase');
        break;
    }

    this.walk(vel, dt, 10);
    this.yaw = lerpAngle(this.yaw, face, damp(turn, dt));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.pose(dt);
  }

  /** Is `p` in the strip ahead of it that the maul sweeps through? */
  private inStrikeZone(p: THREE.Vector3) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const ahead = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
    const side = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw);
    return ahead > -0.3 && ahead < SWING_REACH && Math.abs(side) < SWING_HALF_WIDTH;
  }

  /** Arms, head and eyes for the current state. */
  private pose(dt: number) {
    // Arms: 0 holds the maul out level, + lowers it to the floor, - raises it over the head.
    // 0.28 rests the maul head's lowest corner on the floor (any lower and it sinks in).
    let arms = FLOOR_ARMS, head = 0.35, bodyY = 0, glow = 0, reach = 0;
    switch (this.state) {
      case 'asleep':
        break;
      case 'waking': {
        const k = Math.min(1, this.t / WAKE_TIME);
        head = 0.35 * (1 - k);
        glow = k;
        bodyY = Math.sin(this.t * 60) * 0.03 * (1 - k); // grinding shudder
        break;
      }
      case 'windup':
        arms = -2.9 * Math.min(1, this.t / WINDUP_TIME);
        head = -0.1;
        glow = 1;
        break;
      case 'swing':
        arms = -2.9 + Math.min(1, this.t / SWING_TIME) * (2.9 + FLOOR_ARMS);
        reach = ARM_STRETCH;
        glow = 1;
        break;
      case 'recover':
        arms = FLOOR_ARMS;
        reach = ARM_STRETCH;
        head = 0.25;
        glow = 0.4;
        break;
      default:
        arms = 0;
        head = 0;
        glow = 1;
    }
    // Follow smoothly, except the swing itself, which must read as one fast blow.
    if (dt === 0 || this.state === 'swing') {
      this.arms.rotation.x = arms;
      this.arms.position.z = reach;
    } else {
      this.arms.rotation.x += (arms - this.arms.rotation.x) * damp(8, dt);
      this.arms.position.z += (reach - this.arms.position.z) * damp(8, dt);
    }
    this.head.rotation.x = head;
    this.body.position.y = bodyY;
    this.eyeMat.color.setRGB(0.16 + glow * 0.84, 0.14 + glow * 0.56, 0.11 + glow * 0.05);
  }

  dispose() {
    super.dispose();
    this.eyeMat.dispose();
  }

  private go(s: DozingSentinel['state']) {
    this.state = s;
    this.t = 0;
  }
}

import * as THREE from 'three';
import { Layer, type Physics } from '../core/physics';
import type { Particles } from '../render/particles';
import { glow, GroundShadow } from '../render/shapes';
import type { Attack, HitResult } from './enemies';

/**
 * Attacks that outlive the move that made them: expanding shockwaves (jump over them) and
 * projectiles (block with the shield or dodge). Shared by every boss and enemy.
 */

export interface HazardEnv {
  playerPos: THREE.Vector3;
  physics: Physics;
  particles: Particles;
  hitPlayer(from: THREE.Vector3, attack: Attack): HitResult;
  onPop?(at: THREE.Vector3): void;
}

export interface ShockwaveOptions {
  speed?: number;
  maxRadius?: number;
  /** Half-hearts on a hit. Shockwaves are always unblockable and ground-only: jump them. */
  damage?: number;
  /** Stone strikes: the Stoneward Tunic halves the damage (see Attack.stone). */
  stone?: boolean;
  color?: number;
  /** Height of the visible wall of fire. */
  height?: number;
}

export interface OrbOptions {
  speed?: number;
  /** How fast it turns toward the player (rad/s) during its first second and a half. */
  homing?: number;
  life?: number;
  /** What it does on contact (default: 1 damage, 1 guard slot). */
  attack?: Attack;
  color?: number;
  radius?: number;
}

export interface StoneOptions {
  /** Seconds it hovers before it flies (it aims at Wren when it launches). */
  delay?: number;
  /** Where it floats while it hovers (it drifts there from where it was pulled). */
  hoverAt?: THREE.Vector3;
  speed?: number;
  /** How fast it bends toward Wren after launch (rad/s, for its first 0.7 s in the air). */
  homing?: number;
  life?: number;
  attack?: Attack;
  /** It came to rest (hit a wall or the floor, or was caught): rubble to build with. */
  onLand?(at: THREE.Vector3): void;
}

interface Stone {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Hover time left; it flies when this runs out. */
  hold: number;
  launched: boolean;
  flightT: number;
  homing: number;
  hoverAt: THREE.Vector3 | null;
  t: number;
  speed: number;
  life: number;
  attack: Attack | null;
  mesh: THREE.Mesh;
  shadow: GroundShadow;
  onLand?(at: THREE.Vector3): void;
}

interface Wave {
  center: THREE.Vector3;
  r: number;
  speed: number;
  max: number;
  damage: number;
  stone: boolean;
  hit: boolean;
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
}

interface Orb {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  homing: number;
  life: number;
  attack: Attack;
  radius: number;
  color: number;
  mesh: THREE.Group;
  /** A dark disc on the ground below, so its distance and height read at a glance. */
  shadow: GroundShadow;
}

/** Ring half-width that counts as "touching" the wave front. */
const WAVE_BAND = 0.55;

export class Hazards {
  private waves: Wave[] = [];
  private orbs: Orb[] = [];
  private stones: Stone[] = [];
  private readonly wallGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
  private readonly ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private scene: THREE.Scene) {
    this.wallGeo.translate(0, 0.5, 0);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  get active() {
    return this.waves.length + this.orbs.length + this.stones.length;
  }

  /** A ring of fire expanding along the ground from `center`. Unblockable; jump over it. */
  shockwave(center: THREE.Vector3, o: ShockwaveOptions = {}) {
    const color = o.color ?? 0x6fe8ff;
    const material = () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.wallGeo, material());
    mesh.position.copy(center);
    mesh.scale.set(0.5, o.height ?? 0.7, 0.5);
    const ring = new THREE.Mesh(this.ringGeo, material());
    ring.position.copy(center).setY(center.y + 0.05);
    this.scene.add(mesh, ring);
    this.waves.push({ center: center.clone(), r: 0.5, speed: o.speed ?? 9, max: o.maxRadius ?? 15, damage: o.damage ?? 1, stone: !!o.stone, hit: false, mesh, ring });
  }

  /** A glowing orb fired from `from` along `dir`, curving toward the player for a while. */
  orb(from: THREE.Vector3, dir: THREE.Vector3, o: OrbOptions = {}) {
    const color = o.color ?? 0x6fe8ff;
    const radius = o.radius ?? 0.3;
    const mesh = new THREE.Group();
    mesh.add(
      new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })),
      glow(color, radius * 2.6, 0.45),
    );
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.orbs.push({
      pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(o.speed ?? 9), t: 0,
      homing: o.homing ?? 0.8, life: o.life ?? 4, attack: o.attack ?? { damage: 1, guard: 1, knockback: 6 }, radius, color, mesh,
      shadow: new GroundShadow(this.scene, radius * 2.2),
    });
  }

  /**
   * A thrown wakestone: hovers where it was pulled out of the wall, then flies at Wren
   * (blockable, light). It can be caught mid-air with the glove (`tetherStone`).
   */
  stone(from: THREE.Vector3, o: StoneOptions = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshLambertMaterial({ color: 0x8f887c, emissive: 0x0d3a33 }));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.stones.push({
      pos: from.clone(), vel: new THREE.Vector3(), hold: o.delay ?? 0, launched: false, flightT: 0, homing: o.homing ?? 0, hoverAt: o.hoverAt?.clone() ?? null, t: 0, speed: o.speed ?? 14, life: o.life ?? 3.5,
      attack: o.attack ?? { damage: 1, guard: 1, knockback: 8, stone: true }, mesh, shadow: new GroundShadow(this.scene, 1), onLand: o.onLand,
    });
  }

  /**
   * The glove thrown from `from` along `dir`: catches the nearest stone in flight in front of
   * Wren and yanks it down at her feet, harmless. Returns the latch point.
   */
  tetherStone(from: THREE.Vector3, dir: THREE.Vector3): { at: THREE.Vector3 } | null {
    let best: Stone | null = null;
    let bestD = 14;
    for (const s of this.stones) {
      if (!s.launched || !s.attack) continue;
      const to = s.pos.clone().sub(from).setY(0);
      const d = to.length();
      if (d > bestD || d < 0.3 || to.normalize().dot(dir) < 0.93) continue;
      best = s;
      bestD = d;
    }
    if (!best) return null;
    const at = best.pos.clone();
    best.attack = null;
    best.vel.copy(from).sub(best.pos).setY(0).normalize().multiplyScalar(9);
    best.vel.y = 3;
    return { at };
  }

  update(dt: number, env: HazardEnv) {
    const p = env.playerPos;
    this.updateStones(dt, env);
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.speed * dt;
      const fade = 1 - w.r / w.max;
      w.mesh.scale.set(w.r, w.mesh.scale.y, w.r);
      w.ring.scale.set(w.r, 1, w.r);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade;
      (w.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      const d = Math.hypot(p.x - w.center.x, p.z - w.center.z);
      if (!w.hit && Math.abs(d - w.r) < WAVE_BAND && p.y < w.center.y + 1.2) {
        const r = env.hitPlayer(new THREE.Vector3(w.center.x, p.y, w.center.z), { damage: w.damage, guard: 0, unblockable: true, groundOnly: true, knockback: 9, stone: w.stone });
        if (r === 'hit') w.hit = true;
      }
      if (w.r >= w.max) {
        this.removeWave(i);
      }
    }

    const chest = p.clone().setY(p.y + 1.1);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      if (o.t < 1.5 && o.homing > 0) {
        const want = chest.clone().sub(o.pos).normalize();
        const cur = o.vel.clone().normalize();
        const angle = cur.angleTo(want);
        if (angle > 1e-3) {
          const axis = cur.clone().cross(want).normalize();
          o.vel.applyAxisAngle(axis.lengthSq() > 0 ? axis : this.up, Math.min(angle, o.homing * dt));
        }
      }
      const step = o.vel.clone().multiplyScalar(dt);
      const dist = step.length();
      const wall = env.physics.rayDistance(o.pos, step.clone().normalize(), dist + o.radius, Layer.World);
      o.pos.add(step);
      o.mesh.position.copy(o.pos);
      o.mesh.rotation.y += dt * 6;
      o.shadow.place(o.pos.x, o.pos.y, o.pos.z, env.physics.groundY(o.pos.x, o.pos.z, o.pos.y, Layer.World));
      if (Math.random() < dt * 30) env.particles.burst(o.pos, o.color, 1, 0.6, 0.35, false);
      let pop = o.t > o.life || wall < dist + o.radius;
      if (!pop && o.pos.distanceTo(chest) < 0.75 + o.radius) {
        const r = env.hitPlayer(o.pos, o.attack);
        pop = r !== 'miss';
      }
      if (pop) {
        env.particles.burst(o.pos, o.color, 10, 4, 0.4);
        env.onPop?.(o.pos);
        this.removeOrb(i);
      }
    }
  }

  private updateStones(dt: number, env: HazardEnv) {
    const chest = env.playerPos.clone().setY(env.playerPos.y + 1.1);
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      s.t += dt;
      s.mesh.rotation.y += dt * (s.launched ? 7 : 1.5);
      s.mesh.rotation.x += dt * (s.launched ? 5 : 0.8);
      if (!s.launched && s.hold > 0) {
        s.hold -= dt;
        // It drifts to where it hovers (or lifts a little) as it gathers itself.
        if (s.hoverAt) s.pos.lerp(s.hoverAt, 1 - Math.exp(-3 * dt));
        else s.pos.y += dt * 0.35;
      }
      if (!s.launched && s.hold <= 0) {
        s.launched = true;
        s.vel.copy(chest).sub(s.pos).normalize().multiplyScalar(s.speed);
      } else if (s.launched) {
        // Thrown stones fly straight; a caught one drops.
        if (!s.attack) s.vel.y -= 25 * dt;
        s.flightT += dt;
        if (s.attack && s.homing > 0 && s.flightT < 0.7) {
          const want = chest.clone().sub(s.pos).normalize(), cur = s.vel.clone().normalize();
          const angle = cur.angleTo(want), axis = cur.clone().cross(want);
          if (angle > 1e-3 && axis.lengthSq() > 0) s.vel.applyAxisAngle(axis.normalize(), Math.min(angle, s.homing * dt));
        }
        const step = s.vel.clone().multiplyScalar(dt);
        const dist = step.length();
        const wall = dist > 0 ? env.physics.rayDistance(s.pos, step.clone().normalize(), dist + 0.45, Layer.World) : Infinity;
        s.pos.add(step);
        const floor = env.physics.groundY(s.pos.x, s.pos.z, s.pos.y + 0.5, Layer.World);
        let land = s.t > s.life || wall < dist + 0.45 || (floor !== null && s.pos.y < floor + 0.45);
        if (s.attack && !land && s.pos.distanceTo(chest) < 1.2) land = env.hitPlayer(s.pos, s.attack) !== 'miss';
        if (land) {
          if (floor !== null) s.pos.y = Math.max(floor + 0.45, s.pos.y);
          env.particles.burst(s.pos, 0x8f887c, 10, 4, 0.5);
          env.onPop?.(s.pos);
          s.onLand?.(s.pos.clone());
          this.removeStone(i);
          continue;
        }
      }
      s.mesh.position.copy(s.pos);
      s.shadow.place(s.pos.x, s.pos.y, s.pos.z, env.physics.groundY(s.pos.x, s.pos.z, s.pos.y, Layer.World));
    }
  }

  private removeStone(i: number) {
    const s = this.stones[i];
    this.scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    (s.mesh.material as THREE.Material).dispose();
    s.shadow.dispose();
    this.stones.splice(i, 1);
  }

  private removeWave(i: number) {
    const w = this.waves[i];
    this.scene.remove(w.mesh, w.ring);
    (w.mesh.material as THREE.Material).dispose();
    (w.ring.material as THREE.Material).dispose();
    this.waves.splice(i, 1);
  }

  private removeOrb(i: number) {
    const o = this.orbs[i];
    this.scene.remove(o.mesh);
    o.shadow.dispose();
    o.mesh.traverse((m) => {
      if (m instanceof THREE.Mesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.orbs.splice(i, 1);
  }

  clear() {
    for (let i = this.waves.length - 1; i >= 0; i--) this.removeWave(i);
    for (let i = this.orbs.length - 1; i >= 0; i--) this.removeOrb(i);
    for (let i = this.stones.length - 1; i >= 0; i--) this.removeStone(i);
  }
}

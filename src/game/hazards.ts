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

interface Wave {
  center: THREE.Vector3;
  r: number;
  speed: number;
  max: number;
  damage: number;
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
  private readonly wallGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
  private readonly ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private scene: THREE.Scene) {
    this.wallGeo.translate(0, 0.5, 0);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  get active() {
    return this.waves.length + this.orbs.length;
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
    this.waves.push({ center: center.clone(), r: 0.5, speed: o.speed ?? 9, max: o.maxRadius ?? 15, damage: o.damage ?? 1, hit: false, mesh, ring });
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

  update(dt: number, env: HazardEnv) {
    const p = env.playerPos;
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
        const r = env.hitPlayer(new THREE.Vector3(w.center.x, p.y, w.center.z), { damage: w.damage, guard: 0, unblockable: true, groundOnly: true, knockback: 9 });
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
  }
}

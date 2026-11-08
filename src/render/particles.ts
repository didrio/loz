import * as THREE from 'three';
import { snap } from './palette';
import { resolveFx, room, type FxName, type FxOpts } from './effects';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: boolean;
}

/** Little flying cubes for hits, cut grass, sparkles and poofs. */
export class Particles {
  private pool: Particle[] = [];
  private geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  private mats = new Map<number, THREE.MeshBasicMaterial>();

  constructor(private scene: THREE.Scene) {}

  private mat(color: number) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: snap(color), transparent: true });
      this.mats.set(color, m);
    }
    return m;
  }

  /** A named effect (render/effects.ts): `fx('hitSpark', at)`, or with an override: `fx('dustKick', at, { count: 8 })`. */
  fx(name: FxName, pos: THREE.Vector3, opts?: FxOpts) {
    const p = resolveFx(name, opts);
    this.burst(pos, p.color, p.count, p.speed, p.life, p.gravity);
  }

  /** How many particles are flying now. */
  get alive() {
    let n = 0;
    for (const p of this.pool) if (p.life > 0) n++;
    return n;
  }

  /** The raw emitter behind `fx`; call sites use `fx`. Trimmed so no more than MAX_PARTICLES fly at once. */
  burst(pos: THREE.Vector3, color: number, count = 10, speed = 5, life = 0.6, gravity = true) {
    count = room(this.alive, count);
    for (let i = 0; i < count; i++) {
      let p = this.pool.find((q) => q.life <= 0);
      if (!p) {
        p = { mesh: new THREE.Mesh(this.geo), vel: new THREE.Vector3(), life: 0, max: 1, gravity };
        this.scene.add(p.mesh);
        this.pool.push(p);
      }
      p.mesh.material = this.mat(color);
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.5));
      p.life = p.max = life * (0.7 + Math.random() * 0.6);
      p.gravity = gravity;
      p.mesh.scale.setScalar(1);
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.gravity) p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      p.mesh.scale.setScalar(Math.max(0.01, p.life / p.max));
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}

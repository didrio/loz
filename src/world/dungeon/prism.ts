import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { surf, uniqueMat } from '../../render/materials';
import { faceted } from '../../render/textures';
import type { AreaBuilder } from '../area';
import { STONE } from './pieces';

/**
 * The Keepers' Seal's prism: a crystal floating over a plinth, held by four beams from four pylons. The sword
 * must strike it `PRISM_HITS` times (one per beam): each hit but the last snaps a beam and sheds shards, the last
 * shatters it and the final beam dies. Hits aren't saved; only the shatter is (the seal-stone switch).
 */
export const PRISM_HITS = 4;
/** Seconds after a hit in which a second swing's strike doesn't count (one swing can reach it twice). */
export const PRISM_COOLDOWN = 0.45;

const HOVER = 2.4;
const SHARDS_PER_HIT = 5;
const GLOW = 0xbff0ff;

interface Beam {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.MeshBasicMaterial;
  /** 1 = holding, falling to 0 once it's cut. */
  life: number;
  dying: boolean;
}

interface Shard {
  readonly mesh: THREE.Mesh;
  readonly vel: THREE.Vector3;
  /** Orbiting until the shatter throws it out. */
  flying: boolean;
  angle: number;
  radius: number;
  height: number;
  fade: number;
}

export class Prism {
  readonly group = new THREE.Group();
  hits = 0;
  shattered = false;
  private readonly gem: THREE.Mesh;
  private readonly gemMat: THREE.MeshBasicMaterial;
  private readonly beams: Beam[] = [];
  private readonly shards: Shard[] = [];
  private cooldown = 0;
  private flash = 0;
  private t = Math.random() * 10;
  private readonly center = new THREE.Vector3();

  /** `pylonX`/`pylonZ`: how far the four pylons stand from the plinth, along each axis. */
  constructor(parent: THREE.Object3D, b: AreaBuilder, x: number, y: number, z: number, pylonX = 7, pylonZ = 6) {
    this.group.position.set(x, y, z);
    this.center.set(x, y + HOVER, z);

    const plinth = new THREE.Mesh(faceted(new THREE.CylinderGeometry(1.0, 1.3, 0.8, 8)), surf('stone', STONE.trim));
    plinth.position.y = 0.4;
    const cap = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.8, 1.0, 0.18, 8)), surf('stone', STONE.pillar));
    cap.position.y = 0.89;
    this.group.add(plinth, cap);
    b.cylinder(x, y + 0.45, z, 0.45, 1.2, Layer.Prop);

    this.gemMat = new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.92 });
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), this.gemMat);
    this.gem.scale.y = 1.7;
    this.gem.position.y = HOVER;
    this.group.add(this.gem);

    const up = new THREE.Vector3(0, 1, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = sx * pylonX, pz = sz * pylonZ, top = 5.2;
      const post = new THREE.Mesh(faceted(new THREE.CylinderGeometry(0.32, 0.5, top, 6)), surf('stone', STONE.pillar));
      post.position.set(px, top / 2, pz);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), uniqueMat(0x6fd8ff, { emissive: 0x2a8a8a }));
      tip.position.set(px, top + 0.4, pz);
      this.group.add(post, tip);
      b.cylinder(x + px, y + top / 2, z + pz, top / 2, 0.5, Layer.Prop);

      const from = new THREE.Vector3(px, top + 0.4, pz), to = new THREE.Vector3(0, HOVER, 0);
      const dir = to.clone().sub(from), len = dir.length();
      const beamMat = new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0.55, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6), beamMat);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(up, dir.normalize());
      this.group.add(mesh);
      this.beams.push({ mesh, mat: beamMat, life: 1, dying: false });
    }

    const shardGeo = new THREE.OctahedronGeometry(0.2);
    for (let i = 0; i < PRISM_HITS * SHARDS_PER_HIT; i++) {
      const mesh = new THREE.Mesh(shardGeo, this.gemMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.shards.push({ mesh, vel: new THREE.Vector3(), flying: false, angle: i * 2.4, radius: 1.3 + (i % 3) * 0.3, height: HOVER + ((i % 5) - 2) * 0.4, fade: 1 });
    }
    parent.add(this.group);
  }

  /** Where the prism hangs, in world space (for effects). */
  get position() {
    return this.center;
  }

  /** The sword reaches it. Returns the hit count after this strike, or 0 if it didn't count. */
  hit(): number {
    if (this.shattered || this.cooldown > 0) return 0;
    this.cooldown = PRISM_COOLDOWN;
    this.hits++;
    this.flash = 1;
    if (this.hits >= PRISM_HITS) this.shatter();
    else {
      // Every hit but the last snaps one beam and shake a handful of shards loose to orbit.
      this.beams[this.hits - 1].dying = true;
      for (let i = 0; i < SHARDS_PER_HIT; i++) this.shards[(this.hits - 1) * SHARDS_PER_HIT + i].mesh.visible = true;
    }
    return this.hits;
  }

  /** Breaks it (a hit, or a saved game restoring it): the beams die, every shard is thrown out. */
  private shatter(instant = false) {
    this.shattered = true;
    this.hits = PRISM_HITS;
    this.gem.visible = false;
    for (const b of this.beams) {
      b.dying = true;
      if (instant) b.life = 0;
    }
    for (const [i, s] of this.shards.entries()) {
      if (instant) continue;
      s.mesh.visible = true;
      s.flying = true;
      s.mesh.position.set(Math.cos(s.angle) * s.radius * 0.3, s.height, Math.sin(s.angle) * s.radius * 0.3);
      const a = i * 1.7;
      s.vel.set(Math.cos(a) * (2 + (i % 4)), 2.5 + (i % 3), Math.sin(a) * (2 + (i % 4)));
    }
    if (instant) for (const b of this.beams) b.mesh.visible = false;
  }

  /** The shatter already happened (a saved game): no beams, no prism, nothing flying. */
  restoreShattered() {
    if (!this.shattered) this.shatter(true);
  }

  update(dt: number) {
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt * 3);

    if (!this.shattered) {
      const shake = this.flash * 0.08;
      this.gem.position.set((Math.random() - 0.5) * shake, HOVER + Math.sin(this.t * 1.6) * 0.18, (Math.random() - 0.5) * shake);
      this.gem.rotation.y += dt * (0.6 + this.hits * 1.2);
      this.gem.scale.set(1 + this.flash * 0.25, 1.7 + this.flash * 0.3, 1 + this.flash * 0.25);
      // White-hot on a hit, then dimmer and more flawed with each one.
      this.gemMat.color.setHex(GLOW).lerp(new THREE.Color(0xffffff), this.flash).multiplyScalar(1 - this.hits * 0.12);
      this.gemMat.opacity = 0.92 - this.hits * 0.12;
    }

    for (const b of this.beams) {
      if (b.dying && b.life > 0) b.life = Math.max(0, b.life - dt / 0.7);
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      // Holding beams hum; a cut one stutters out.
      const flicker = b.dying ? (Math.sin(this.t * 60) > 0 ? 1 : 0.2) : 1 + Math.sin(this.t * 5 + b.mesh.id) * 0.15;
      b.mat.opacity = 0.55 * b.life * flicker;
      b.mesh.scale.x = b.mesh.scale.z = b.dying ? b.life : 1;
    }

    for (const s of this.shards) {
      if (!s.mesh.visible) continue;
      if (s.flying) {
        s.vel.y -= 9 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.fade = Math.max(0, s.fade - dt / 1.6);
        s.mesh.scale.setScalar(s.fade);
        s.mesh.rotation.x += dt * 5;
        if (s.fade <= 0) s.mesh.visible = false;
      } else {
        s.angle += dt * (0.8 + this.hits * 0.5);
        s.mesh.position.set(Math.cos(s.angle) * s.radius, s.height + Math.sin(this.t * 2 + s.angle) * 0.1, Math.sin(s.angle) * s.radius);
        s.mesh.rotation.y += dt * 3;
      }
    }
  }
}

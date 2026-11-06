import * as THREE from 'three';
import { heartGeometry } from '../render/shapes';

export type PickupKind = 'gem' | 'bluegem' | 'heart';

/** What a blue gem is worth (a plain gem is 1). */
export const BLUEGEM_GEMS = 5;

interface Pickup {
  mesh: THREE.Object3D;
  kind: PickupKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
}

/** Gems and hearts that pop out of bushes and enemies. */
export class Pickups {
  private items: Pickup[] = [];
  private gemGeo = new THREE.OctahedronGeometry(0.28);
  private heartGeo = heartGeometry();
  private mats: Record<PickupKind, THREE.MeshLambertMaterial> = {
    gem: new THREE.MeshLambertMaterial({ color: 0x3ee07a, emissive: 0x0d5a26, flatShading: true }),
    bluegem: new THREE.MeshLambertMaterial({ color: 0x4aa8ff, emissive: 0x123d7a, flatShading: true }),
    heart: new THREE.MeshLambertMaterial({ color: 0xff3b5c, emissive: 0x5a0d1a }),
  };

  constructor(private scene: THREE.Scene) {}

  spawn(kind: PickupKind, at: THREE.Vector3) {
    const mesh = new THREE.Mesh(kind === 'heart' ? this.heartGeo : this.gemGeo, this.mats[kind]);
    mesh.scale.y = kind === 'heart' ? 1 : 1.5;
    mesh.castShadow = true;
    this.scene.add(mesh);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 3, 6, (Math.random() - 0.5) * 3);
    this.items.push({ mesh, kind, pos: at.clone().setY(at.y + 0.5), vel, t: 0 });
  }

  /** Random drop from a bush or enemy. */
  drop(at: THREE.Vector3, gemChance: number, heartChance: number) {
    const r = Math.random();
    if (r < heartChance) this.spawn('heart', at);
    else if (r < heartChance + gemChance) this.spawn(Math.random() < 0.12 ? 'bluegem' : 'gem', at);
  }

  /** Removes every pickup (area change, new game). */
  clear() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
  }

  /** `groundAt` finds the floor below a point, so drops land on whatever is there. */
  update(dt: number, player: THREE.Vector3, groundAt: (x: number, z: number, fromY: number) => number, collect: (k: PickupKind) => void) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const g = groundAt(it.pos.x, it.pos.z, it.pos.y + 1) + 0.45;
      it.vel.y -= 20 * dt;
      it.pos.addScaledVector(it.vel, dt);
      if (it.pos.y < g) {
        it.pos.y = g;
        it.vel.set(0, 0, 0);
      }
      it.mesh.position.copy(it.pos);
      it.mesh.position.y += Math.sin(it.t * 3) * 0.08;
      it.mesh.rotation.y += dt * 2.5;
      it.mesh.visible = it.t < 16 || Math.floor(it.t * 10) % 2 === 0;
      const close = Math.hypot(player.x - it.pos.x, player.z - it.pos.z) < 1.2 && Math.abs(player.y + 0.8 - it.pos.y) < 1.8;
      if ((close && it.t > 0.25) || it.t > 20) {
        if (close) collect(it.kind);
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }
}

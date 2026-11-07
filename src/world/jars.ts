import * as THREE from 'three';
import { Layer } from '../core/physics';
import { mat } from '../render/materials';
import type { AreaBuilder } from './area';

/** What a jar holds: nothing, a blue gem (5 gems), a heart, or Pip's doll (a story script, `jar.doll`). */
export type JarDrop = 'empty' | 'bluegem' | 'heart' | 'doll';

export interface JarSpot {
  /** Saved as the flag `jar.<id>` once broken. */
  id: string;
  x: number;
  y: number;
  z: number;
  drop: JarDrop;
}

export interface BrokenJar {
  id: string;
  at: THREE.Vector3;
  drop: JarDrop;
}

/** The jars in ruins and nooks: clay pots a sword breaks once, for good. */
type Jar = JarSpot & { group: THREE.Group; collider: ReturnType<AreaBuilder['ball']>; broken: boolean };

export class JarField {
  private readonly items: Jar[] = [];

  constructor(b: AreaBuilder, spots: JarSpot[]) {
    const clay = mat(0xa8683a), dark = mat(0x7a4a2a);
    for (const s of spots) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), clay);
      body.scale.set(1, 1.15, 1);
      body.position.y = 0.46;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 8), clay);
      neck.position.y = 0.95;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 8), dark);
      rim.position.y = 1.08;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.07, 8), dark);
      band.position.y = 0.5;
      for (const m of [body, neck, rim, band]) {
        g.add(m);
      }
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = (s.x * 7.3 + s.z * 3.1) % 6.28;
      b.dynamic(g);
      this.items.push({ ...s, group: g, collider: b.ball(s.x, s.y + 0.5, s.z, 0.42, Layer.Prop), broken: false });
    }
  }

  /** Breaks the unbroken jars a sword swing reaches (the same arc as cutting bushes). */
  hit(x: number, z: number, dirX: number, dirZ: number, reach: number): BrokenJar[] {
    const out: BrokenJar[] = [];
    for (const j of this.items) {
      if (j.broken) continue;
      const dx = j.x - x, dz = j.z - z, d = Math.hypot(dx, dz);
      if (d > reach + 0.5) continue;
      if (d > 0.8 && (dx * dirX + dz * dirZ) / d < 0.1) continue;
      this.remove(j);
      out.push({ id: j.id, at: new THREE.Vector3(j.x, j.y + 0.5, j.z), drop: j.drop });
    }
    return out;
  }

  /** Save restore: jars already broken in an earlier visit stay gone. */
  restore(isBroken: (id: string) => boolean) {
    for (const j of this.items) if (!j.broken && isBroken(j.id)) this.remove(j);
  }

  get count() {
    return this.items.length;
  }

  private remove(j: Jar) {
    j.broken = true;
    j.group.visible = false;
    j.collider.setEnabled(false);
  }
}

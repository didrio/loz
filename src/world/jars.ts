import * as THREE from 'three';
import { Layer } from '../core/physics';
import { buildJar } from '../render/models/props';
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
type Jar = JarSpot & { group: THREE.Object3D; collider: ReturnType<AreaBuilder['ball']>; broken: boolean };

export class JarField {
  private readonly items: Jar[] = [];

  constructor(b: AreaBuilder, spots: JarSpot[]) {
    for (const s of spots) {
      const g = buildJar().root;
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

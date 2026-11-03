import * as THREE from 'three';
import { glow } from '../render/shapes';
import type { AreaBuilder, Interactable } from './area';

const PALE = 0xe2d6ff;
const GLYPHS = 12;

/**
 * A sigil: a message written in the air, a slow ring of pale glyphs around a bright core, a little
 * out of true. It hangs at head height (`y` is the floor under it) until Wren reads it. What it says
 * is content's (`content/sigils.ts`, bound by `id`); here it is only a look and an `interactable`.
 * `setPresent` shows or hides it (a sigil can appear once a room is cleared).
 */
export class SigilLook {
  readonly group = new THREE.Group();
  present = true;
  readonly interactable: Interactable;
  private readonly ring = new THREE.Group();
  private readonly core: THREE.Mesh;
  private t = Math.random() * 10;

  constructor(b: AreaBuilder, readonly id: string, readonly x: number, readonly y: number, readonly z: number) {
    const m = new THREE.MeshBasicMaterial({ color: PALE });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), m);
    // Glyphs hang in three tiers on a turning cylinder, so they read as lines of writing from any side.
    for (let i = 0; i < GLYPHS; i++) {
      const a = (i / GLYPHS) * Math.PI * 2;
      const tier = (i % 3) - 1;
      const g = new THREE.Mesh(i % 2 ? new THREE.BoxGeometry(0.07, 0.34, 0.07) : new THREE.BoxGeometry(0.26, 0.07, 0.07), m);
      g.position.set(Math.cos(a) * 0.7, tier * 0.36, Math.sin(a) * 0.7);
      g.rotation.y = -a + Math.PI / 2; // faces outward, like text on a drum
      g.rotation.z = (i % 4) * 0.25 - 0.3;
      this.ring.add(g);
    }
    this.group.add(this.core, this.ring, glow(PALE, 0.4, 0.08));
    this.group.position.set(x, y + 1.7, z);
    b.dynamic(this.group);
    this.interactable = { id, x, z, y, r: 2.4, label: 'Read', promptY: y + 2.9, enabled: () => this.present };
  }

  setPresent(on: boolean) {
    this.present = on;
    this.group.visible = on;
  }

  update(dt: number) {
    if (!this.present) return;
    this.t += dt;
    this.ring.rotation.y += dt * 0.5;
    this.core.rotation.y -= dt * 0.9;
    this.group.position.y = this.y + 1.7 + Math.sin(this.t * 1.3) * 0.08;
  }
}

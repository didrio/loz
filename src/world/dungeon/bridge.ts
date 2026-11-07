import * as THREE from 'three';
import { Layer, type RAPIER } from '../../core/physics';
import { mat, surf } from '../../render/materials';
import type { AreaBuilder } from '../area';

/** How thick the column is: lying across the pit, its top is flush with the floor. */
const THICK = 1.2;
const WIDE = 1.8;
const SWING_TIME = 1.3;

/**
 * A fallen keeper's column (a `role: 'bridge'` stone): a long, heavy beam lying along a
 * pit's far ledge. The Tether Glove pulls its free end and it swings round on its foot like
 * a drawbridge, settling into the pit with its top flush with the floor: a way across.
 * (A tall stone toppling over wouldn't do: the pits are wider than the rooms are tall.)
 *
 * It lies from its foot (`x`, `z`) along +z for `length` meters, and swings `side` (+1:
 * toward +x, -1: toward -x) until it points straight across.
 */
export class FallenColumn {
  readonly group = new THREE.Group();
  /** True once it has swung (or is swinging) across. */
  laid = false;
  private t = 0;
  private readonly lying: RAPIER.Collider;
  private readonly across: RAPIER.Collider;

  constructor(b: AreaBuilder, parent: THREE.Object3D, readonly id: string, readonly x: number, readonly y: number, readonly z: number, readonly length: number, readonly side: 1 | -1, glowMat: THREE.Material) {
    const stone = surf('stone', 0x3a2f4f), bronze = surf('metal', 0x9a6a2e);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(WIDE, THICK, length), stone);
    beam.position.set(0, THICK / 2, length / 2);
    beam.castShadow = true;
    this.group.add(beam);
    // Bronze bands and the heavy stones' glowing spirals along both sides: unmistakably
    // one of the glove's stones.
    for (let k = 1; k < 4; k++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(WIDE + 0.06, THICK + 0.06, 0.18), bronze);
      band.position.set(0, THICK / 2, (length * k) / 4);
      this.group.add(band);
    }
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 5, 14), glowMat);
        ring.position.set(sx * (WIDE / 2 + 0.01), THICK / 2, (length * (k + 0.5)) / 3.4 + 0.8);
        ring.rotation.y = Math.PI / 2;
        this.group.add(ring);
      }
    }
    // Its foot: a broken capital it fell from.
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.5, 8), stone);
    foot.position.set(0, 0.25, 0);
    this.group.add(foot);
    this.group.position.set(x, y, z);
    parent.add(this.group);

    // Lying on the ledge it's in the way like any stone; laid across, it's floor.
    this.lying = b.box(x, y + THICK / 2, z + length / 2, WIDE / 2, THICK / 2, length / 2, 0, Layer.Prop);
    this.across = b.box(x + (side * length) / 2, y - THICK / 2, z, length / 2, THICK / 2, WIDE / 2, 0, Layer.World);
    this.across.setEnabled(false);
  }

  /** Where the cord grabs it: the middle of the beam, where it lies now. */
  get grip() {
    const a = this.angle, half = this.length / 2;
    return new THREE.Vector3(this.x + Math.sin(a) * half, this.group.position.y + THICK / 2, this.z + Math.cos(a) * half);
  }

  private get angle() {
    return this.group.rotation.y;
  }

  /** Swings it across (or, `instantly`, puts it there: restoring, tests). */
  swing(instantly = false) {
    if (this.laid) return false;
    this.laid = true;
    this.t = instantly ? SWING_TIME : 0;
    this.lying.setEnabled(false);
    this.across.setEnabled(true);
    this.pose();
    return true;
  }

  get swinging() {
    return this.laid && this.t < SWING_TIME;
  }

  update(dt: number) {
    if (!this.swinging) return;
    this.t = Math.min(SWING_TIME, this.t + dt);
    this.pose();
  }

  private pose() {
    const k = this.laid ? this.t / SWING_TIME : 0;
    // Swings round fast, then drops into the pit with a thud at the end.
    const swing = 1 - Math.pow(1 - Math.min(1, k / 0.75), 3);
    const drop = Math.max(0, (k - 0.7) / 0.3);
    this.group.rotation.y = (this.side * Math.PI) / 2 * swing;
    this.group.position.y = this.y - THICK * drop * drop;
  }
}

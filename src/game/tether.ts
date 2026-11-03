import * as THREE from 'three';

const OUT = 0.14;
const HOLD = 0.12;
const BACK = 0.2;

/**
 * The Tether Glove's cord: a glowing line that shoots from Wren's hand to where it's aimed,
 * latches for a beat, and snaps back. Purely visual; what it catches is decided when it's
 * thrown (`Area.tether`).
 */
export class TetherCord {
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0x7ff7e8, transparent: true, opacity: 0.95 });
  private readonly line: THREE.Mesh;
  private readonly tip: THREE.Mesh;
  private readonly to = new THREE.Vector3();
  private t = Infinity;
  private caught = false;

  constructor(parent: THREE.Object3D) {
    // A unit-long cylinder along +y, stretched and pointed every frame.
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true);
    geo.translate(0, 0.5, 0);
    this.line = new THREE.Mesh(geo, this.mat);
    this.tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), this.mat);
    for (const m of [this.line, this.tip]) {
      m.visible = false;
      m.frustumCulled = false;
      parent.add(m);
    }
  }

  /** Throws it toward `to`; `caught`: it latches on something there (a stone). */
  fire(to: THREE.Vector3, caught: boolean) {
    this.to.copy(to);
    this.caught = caught;
    this.t = 0;
  }

  get busy() {
    return this.t < OUT + HOLD + BACK;
  }

  update(dt: number, hand: THREE.Vector3) {
    this.t += dt;
    const total = OUT + HOLD + BACK;
    const on = this.t < total;
    this.line.visible = this.tip.visible = on;
    if (!on) return;
    // Out, hold (latched: a pulse), back. A miss doesn't hold.
    const hold = this.caught ? HOLD : 0;
    let k: number;
    if (this.t < OUT) k = this.t / OUT;
    else if (this.t < OUT + hold) k = 1;
    else k = Math.max(0, 1 - (this.t - OUT - hold) / BACK);
    const end = hand.clone().lerp(this.to, k);
    const span = end.clone().sub(hand);
    const len = Math.max(0.01, span.length());
    this.line.position.copy(hand);
    this.line.scale.set(1, len, 1);
    this.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.divideScalar(len));
    this.tip.position.copy(end);
    const latched = this.caught && this.t >= OUT && this.t < OUT + hold;
    this.tip.scale.setScalar(latched ? 1.6 : 1);
  }

  dispose() {
    for (const m of [this.line, this.tip]) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.mat.dispose();
  }
}

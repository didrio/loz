import * as THREE from 'three';
import { damp } from '../core/math';
import { Layer } from '../core/physics';
import { mat, uniqueMat } from '../render/materials';
import { glow } from '../render/shapes';
import type { AreaBuilder, Interactable } from './area';

/** How far (from Wren's centre) a swing reaches a bud, past the sword's usual reach: the bulb is wide. */
const BUD_RADIUS = 0.6;
const PETALS = 5;
/** The colored motes drifting up from a closed bud's tip, so it reads as something to look at. */
const MOTES = 5;

/**
 * A Murmurbud's looks: a stubby stone-grey bulb in a collar of leaves, which swells as it's
 * struck (`setGrowth`), shivers and darkens when overworked (`sulk`), and finally peels open
 * into petals around a rolled note (`open`), which floats there until Wren reads it (its
 * `interactable`; content calls `take`). The rule that decides all that is in
 * `game/murmurbud.ts`; what the note says is content's (bound by `id`). Lock-on can hold a
 * closed bud (`pos`, `alive`, `lockHeight`: a `LockTarget`).
 */
export class MurmurbudLook {
  readonly group = new THREE.Group();
  opened = false;
  /** The note has been read and taken (only the open petals are left). */
  taken = false;
  readonly pos: THREE.Vector3;
  readonly lockHeight = 0.9;
  readonly targetable = true;
  /** "Read" on the floating note, once it's open. */
  readonly interactable: Interactable;
  private readonly motes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private readonly bulb = new THREE.Group();
  private readonly shellMat = uniqueMat(0x8a8f86, { emissive: 0x000000 });
  private readonly petals: THREE.Mesh[] = [];
  private readonly note: THREE.Group;
  private growth = 0;
  private shown = 0;
  private shiver = 0;
  private openT = 0;
  private t = Math.random() * 10;

  constructor(b: AreaBuilder, readonly id: string, readonly x: number, readonly y: number, readonly z: number) {
    // The leaf collar stays put; the bulb swells inside it.
    const leaf = mat(0x4f7d3a);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 4), leaf);
      l.position.set(Math.cos(a) * 0.38, 0.25, Math.sin(a) * 0.38);
      l.rotation.set(Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
      l.castShadow = true;
      this.group.add(l);
    }
    // The bulb: a shell of petals closed around a tip; each petal swings out when it opens.
    for (let i = 0; i < PETALS; i++) {
      const a = (i / PETALS) * Math.PI * 2;
      const hinge = new THREE.Group();
      hinge.rotation.y = a;
      // A wedge of shell centred on the hinge's -X side, so tilting the hinge about Z peels it outward.
      const w = (Math.PI * 2) / PETALS + 0.08;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5, -w / 2, w, 0, Math.PI * 0.62), this.shellMat);
      p.position.y = -0.05;
      p.castShadow = true;
      hinge.add(p);
      this.bulb.add(hinge);
      this.petals.push(p);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 5), this.shellMat);
    tip.position.y = 0.48;
    tip.name = 'tip';
    this.bulb.add(tip);
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.48, 6, 4, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), this.shellMat);
    base.position.y = -0.05;
    this.bulb.add(base);
    this.bulb.position.y = 0.45;
    this.group.add(this.bulb);

    // The rolled note inside, with a faint glow; shown when it opens.
    this.note = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 7), mat(0xeadfc0));
    roll.rotation.z = Math.PI / 2;
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 7), mat(0x9c3b2b));
    tie.rotation.z = Math.PI / 2;
    this.note.add(roll, tie, glow(0xffe8a8, 0.38, 0.14));
    this.note.position.y = 0.85;
    this.note.visible = false;
    this.group.add(this.note);

    // A thin, many-colored wisp rising from the tip while it's closed.
    const moteGeo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < MOTES; i++) {
      // Normal blending, not additive: against bright grass additive washes every hue to white.
      const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(moteGeo, m);
      this.motes.push({ mesh, mat: m });
      this.group.add(mesh);
    }

    this.group.position.set(x, y, z);
    b.dynamic(this.group);
    b.cylinder(x, y + 0.6, z, 0.6, 0.45, Layer.Prop);
    this.pos = new THREE.Vector3(x, y, z);
    const look = this;
    this.interactable = { id, x, z, r: 2.4, label: 'Read', promptY: y + 2.7, enabled: () => look.opened && !look.taken };
  }

  /** Lock-on lets go once it's open. */
  get alive() {
    return !this.opened;
  }

  /** The bulb's centre (for the gauge and particles). */
  get center() {
    return new THREE.Vector3(this.x, this.y + 0.45 + 0.5 * this.scale(), this.z);
  }

  /** Is (x, y, z) facing (dirX, dirZ) close enough to strike it with a swing of `reach`? */
  inReach(x: number, y: number, z: number, dirX: number, dirZ: number, reach: number) {
    if (this.opened || Math.abs(this.y + 0.6 - y) > 2.2) return false;
    const dx = this.x - x, dz = this.z - z, d = Math.hypot(dx, dz);
    return d <= reach + BUD_RADIUS && (d < 0.6 || (dx * dirX + dz * dirZ) / d > 0.2);
  }

  /** How swollen: 0 asleep, 1 ready to open. */
  setGrowth(g: number) {
    this.growth = g;
  }

  /** Overworked: shiver, and go dark for a moment. */
  sulk() {
    this.shiver = 1;
  }

  /** Peels open; `instant` for one already opened in an earlier session. */
  open(instant = false) {
    this.opened = true;
    this.note.visible = !this.taken;
    this.openT = instant ? 1 : 0;
    this.growth = 1;
    if (instant) this.shown = 1;
  }

  /** Wren takes the note (read it): it's gone, and the petals stay open. */
  take() {
    this.taken = true;
    this.note.visible = false;
  }

  private scale() {
    return 0.65 + 0.75 * this.shown;
  }

  update(dt: number) {
    this.t += dt;
    this.shown += (this.growth - this.shown) * damp(this.shiver > 0 ? 3 : 8, dt);
    this.shiver = Math.max(0, this.shiver - dt * 0.9);
    const s = this.scale();
    // Asleep it breathes slowly; struck, it pulses.
    const breathe = 1 + Math.sin(this.t * (this.opened ? 1.2 : 1.8 + this.shown * 4)) * (0.02 + 0.03 * this.shown);
    this.bulb.scale.set(s * breathe, s * (2 - breathe), s * breathe);
    this.bulb.position.x = this.shiver > 0 ? Math.sin(this.t * 60) * 0.07 * this.shiver : 0;
    const dark = this.shiver * 0.5;
    this.shellMat.color.setRGB(0.54 - dark * 0.3, 0.56 - dark * 0.3, 0.53 - dark * 0.25);
    this.shellMat.emissive.setRGB(0.12 * this.shown, 0.1 * this.shown, 0.04 * this.shown);
    this.updateWisp(s);
    if (this.opened) {
      this.openT = Math.min(1, this.openT + dt * 1.6);
      const e = 1 - (1 - this.openT) ** 3;
      for (const p of this.petals) p.parent!.rotation.z = e * 1.3;
      this.bulb.getObjectByName('tip')!.visible = e < 0.3;
      this.note.position.y = 0.85 + e * 0.5 * s + Math.sin(this.t * 2) * 0.06 * e;
      this.note.rotation.y += dt * 0.8;
    }
  }

  private updateWisp(s: number) {
    const tipY = 0.45 + (0.48 + 0.2) * s;
    for (let i = 0; i < MOTES; i++) {
      const { mesh, mat: m } = this.motes[i];
      mesh.visible = !this.opened;
      if (this.opened) continue;
      const p = (this.t * 0.32 + i / MOTES) % 1;
      const sway = this.t * 1.3 + i * 2.1;
      mesh.position.set(Math.sin(sway) * 0.16 * p, tipY + p * 1.9, Math.cos(sway * 0.8) * 0.16 * p);
      mesh.scale.setScalar(0.1 * (1 - p * 0.45));
      m.opacity = Math.min(1, Math.sin(p * Math.PI) * 1.3);
      m.color.setHSL((i / MOTES + this.t * 0.06) % 1, 1, 0.55);
    }
  }
}

import * as THREE from 'three';
import { uniqueMat } from '../../../render/materials';
import { glow } from '../../../render/shapes';

/**
 * Gravelheart's body: about 5.5 m of stacked wakestones. A blocky torso on two stubby stone
 * legs; arms that are chains of floating stones held together by teal spirit-light; a carved
 * spiral mask with heavy lids; the stolen ember glowing through cracks in its chest behind
 * three stone plates; a keystone set in its back. Primitives only. The pose is a flat set of
 * numbers (like the Lamplighter's) that moves blend toward.
 */
export interface Pose {
  /** Height of the hips above the feet (1.7 standing; lower to crouch or kneel). */
  hipsY: number;
  /** Torso pitch forward (rad) and twist at the waist. */
  lean: number;
  twist: number;
  headPitch: number;
  /** 0 = eyes wide, 1 = shut (it's always a little sleepy: ~0.45). */
  lids: number;
  /** Eye glow 0–1; `red` turns it red (the guard-crushing tell). */
  eyes: number;
  red: number;
  /** Arms: raised forward (rad; π lifts it overhead), out to the side, elbow bend. */
  rArm: number; rOut: number; rBend: number;
  lArm: number; lOut: number; lBend: number;
  /** The ember's glow (0–2). */
  ember: number;
  /** How loose the arm stones float (gaps between them). */
  float: number;
}

export const STAND: Pose = {
  hipsY: 1.7, lean: 0.08, twist: 0, headPitch: 0.05, lids: 0.45, eyes: 0.6, red: 0,
  rArm: 0.15, rOut: 0.18, rBend: 0.25, lArm: 0.15, lOut: 0.18, lBend: 0.25, ember: 1, float: 1,
};

/** Sleeping in a heap: kneeling low, slumped forward, head bowed, knuckles on the floor, eyes shut. */
export const SLEEP: Pose = {
  ...STAND, hipsY: 0.75, lean: 0.55, headPitch: 0.5, lids: 1, eyes: 0, rArm: 0.55, rOut: 0.1, rBend: 0.1,
  lArm: 0.55, lOut: 0.1, lBend: 0.1, ember: 0.35, float: 0.2,
};

const POSE_KEYS = Object.keys(STAND) as (keyof Pose)[];

export function blendPose(cur: Pose, target: Pose, k: number) {
  for (const key of POSE_KEYS) cur[key] += (target[key] - cur[key]) * k;
}

const LEG_STAND = 1.7;
const EMBER = 0xff7a32;
const SPIRIT = 0x6fe8d0;

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  fist: THREE.Group;
  stones: THREE.Object3D[];
  side: number;
}

export class GravelheartRig {
  readonly hips = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly ember = new THREE.Group();
  readonly keystone = new THREE.Group();
  /** The three chest plates, left to right as it faces you. */
  readonly plates: THREE.Group[] = [];
  readonly armR: Arm;
  readonly armL: Arm;
  readonly legs: { thigh: THREE.Group; shin: THREE.Group }[] = [];
  readonly light = new THREE.PointLight(EMBER, 6, 16, 1.5);
  /** Every material that should flash on a hit. */
  readonly flashMats: THREE.MeshLambertMaterial[];
  readonly eyeMat = uniqueMat(0x0a0908, { emissive: 0x000000 });
  readonly emberMat = uniqueMat(0x401206, { emissive: 0x000000 });
  readonly plateMats: THREE.MeshLambertMaterial[] = [];
  private readonly lids: THREE.Mesh[] = [];
  private readonly spiritMat = new THREE.MeshBasicMaterial({ color: SPIRIT, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly emberGlow: THREE.Mesh;
  private t = 0;

  constructor(root: THREE.Group) {
    const stone = uniqueMat(0x8f887c), dark = uniqueMat(0x5f5850), pale = uniqueMat(0xa9a293), teal = uniqueMat(0x2f8a7a, { emissive: 0x0d3a33 });
    this.flashMats = [stone, dark, pale, teal];
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const block = (sx: number, sy: number, sz: number) => new THREE.BoxGeometry(sx, sy, sz);

    root.add(this.hips);
    this.hips.position.y = LEG_STAND;
    add(this.hips, block(2.0, 0.8, 1.4), dark);

    // Legs: two stones each, stubby and wide.
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * 0.65, -0.2, 0);
      add(thigh, block(0.85, 0.75, 0.9), stone, 0, -0.35, 0);
      const shin = new THREE.Group();
      shin.position.y = -0.75;
      add(shin, block(0.95, 0.75, 1.1), dark, 0, -0.38, 0.05);
      thigh.add(shin);
      this.hips.add(thigh);
      this.legs.push({ thigh, shin });
    }

    // The torso: one great block, its front cracked open around the ember, three plates over it.
    this.hips.add(this.torso);
    this.torso.position.y = 0.4;
    add(this.torso, block(2.6, 2.0, 1.6), stone, 0, 1.1, 0);
    add(this.torso, block(2.75, 0.25, 1.7), dark, 0, 2.15, 0); // a heavy lintel for shoulders
    add(this.torso, block(1.3, 1.3, 0.3), uniqueMat(0x120806), 0, 1.15, 0.68); // the hollow behind the plates
    this.ember.position.set(0, 1.15, 0.6);
    this.torso.add(this.ember);
    add(this.ember, new THREE.IcosahedronGeometry(0.36, 0), this.emberMat);
    this.emberGlow = glow(EMBER, 0.8, 0.4);
    this.ember.add(this.emberGlow);
    this.ember.add(this.light);
    this.light.position.z = 0.6;
    // Glowing cracks that run out from the ember across the chest.
    for (const [x, y, len, rot] of [[-0.9, 1.75, 0.9, 0.5], [0.95, 0.55, 0.8, 0.4], [-1.0, 0.5, 0.6, -0.7], [0.85, 1.85, 0.7, -0.5]] as const) {
      const c = add(this.torso, block(len, 0.06, 0.04), this.emberMat, x, y, 0.81);
      c.rotation.z = rot;
    }
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Group();
      plate.position.set((i - 1) * 0.5, 1.15, 0.86);
      const m = uniqueMat(0x9b9486, { emissive: 0x000000 });
      this.plateMats.push(m);
      this.flashMats.push(m);
      const slab = add(plate, block(0.5, 1.45, 0.22), m);
      slab.rotation.z = (i - 1) * 0.05;
      add(plate, block(0.52, 0.1, 0.24), dark, 0, 0.6, 0); // a band of darker stone
      this.torso.add(plate);
      this.plates.push(plate);
    }
    // The keystone in its back: carved, with the shrine's spiral.
    this.keystone.position.set(0, 1.3, -0.85);
    this.torso.add(this.keystone);
    add(this.keystone, block(0.9, 0.9, 0.3), pale);
    const ks = add(this.keystone, new THREE.TorusGeometry(0.26, 0.05, 5, 12), teal, 0, 0, -0.16);
    ks.rotation.y = Math.PI;

    // Shoulders and arms: floating stones, the gaps lit by spirit-light.
    const arm = (side: number): Arm => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 1.7, 1.75, 0);
      add(shoulder, block(1.0, 1.0, 1.1), dark, side * 0.1, 0.05, 0);
      const s1 = add(shoulder, block(0.8, 0.8, 0.8), stone, 0, -0.85, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -1.45;
      shoulder.add(elbow);
      const s2 = add(elbow, block(0.75, 0.75, 0.75), pale, 0, -0.35, 0);
      const fist = new THREE.Group();
      fist.position.y = -1.05;
      elbow.add(fist);
      add(fist, block(1.2, 1.05, 1.25), stone, 0, -0.45, 0.05);
      add(fist, block(1.25, 0.25, 0.4), dark, 0, -0.75, 0.45); // knuckles
      for (const [parent, y] of [[shoulder, -0.42], [elbow, 0.12], [elbow, -0.78]] as const) {
        add(parent, new THREE.IcosahedronGeometry(0.16, 0), this.spiritMat, 0, y, 0);
      }
      this.torso.add(shoulder);
      return { shoulder, elbow, fist, stones: [s1, s2], side };
    };
    this.armR = arm(-1); // its right is on your left as it faces you (+z)
    this.armL = arm(1);

    // The head: a carved mask with a spiral brow, heavy lids, and eyes that glow.
    this.head.position.set(0, 2.25, 0.1);
    this.torso.add(this.head);
    add(this.head, block(1.4, 1.3, 1.1), pale, 0, 0.65, 0);
    add(this.head, block(1.5, 0.22, 0.5), dark, 0, 1.0, 0.38); // brow
    const sp = add(this.head, new THREE.TorusGeometry(0.2, 0.045, 5, 12), teal, 0, 1.0, 0.64);
    sp.rotation.y = 0;
    add(this.head, block(0.35, 0.45, 0.2), dark, 0, 0.35, 0.58); // a blunt nose
    for (const side of [1, -1]) {
      add(this.head, block(0.36, 0.12, 0.06), this.eyeMat, side * 0.33, 0.68, 0.56);
      const lid = add(this.head, block(0.44, 0.3, 0.14), pale, side * 0.33, 0.85, 0.58);
      this.lids.push(lid);
    }
  }

  /** Puts the body in `p`. */
  apply(p: Pose, dt: number) {
    this.t += dt;
    this.hips.position.y = p.hipsY;
    // Legs fold as the hips drop (a kneel at ~0.8).
    const fold = Math.max(0, Math.min(1, (LEG_STAND - p.hipsY) / 0.95));
    for (const l of this.legs) {
      l.thigh.rotation.x = -fold * 1.3;
      l.shin.rotation.x = fold * 1.9;
    }
    this.torso.rotation.set(p.lean, p.twist, 0);
    this.head.rotation.x = p.headPitch;
    for (const [a, raise, out, bend] of [[this.armR, p.rArm, p.rOut, p.rBend], [this.armL, p.lArm, p.lOut, p.lBend]] as const) {
      a.shoulder.rotation.set(-raise, 0, a.side * out);
      a.elbow.rotation.x = -bend;
      // The stones drift apart and bob a little: nothing but spirit holds them together.
      const bob = Math.sin(this.t * 2.2 + a.side) * 0.04 * p.float;
      a.stones[0].position.y = -0.85 - 0.08 * p.float + bob;
      a.stones[1].position.y = -0.35 - 0.08 * p.float - bob;
      a.elbow.position.y = -1.45 - 0.1 * p.float;
      a.fist.position.y = -1.05 - 0.12 * p.float + bob;
    }
    for (const lid of this.lids) lid.position.y = 0.95 - 0.27 * p.lids;
    this.spiritMat.opacity = 0.25 + 0.5 * p.float;
    const red = p.red, e = p.eyes;
    this.eyeMat.emissive.setRGB(e * (0.45 + red * 0.55), e * (0.9 - red * 0.8), e * (0.8 - red * 0.75));
    const flick = 1 + Math.sin(this.t * 9) * 0.06 + Math.sin(this.t * 23) * 0.04;
    this.emberMat.emissive.setRGB(1 * p.ember * flick * 0.6, 0.35 * p.ember * flick * 0.6, 0.05 * p.ember * 0.6);
    (this.emberGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.7, 0.3 * p.ember * flick);
    this.light.intensity = 5 * p.ember * flick;
  }

  /** A plate glows loose (0–1), ready to be torn off with the glove. */
  setPlateGlow(i: number, g: number) {
    this.plateMats[i].emissive.setRGB(0.2 * g, 0.75 * g, 0.65 * g);
  }
}

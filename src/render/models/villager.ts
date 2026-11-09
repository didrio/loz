import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, gradient, kitMesh, lathe, lowSphere, merge, paint, paintRegion, place, taper, wobble } from '../kit';
import { pal } from '../palette';
import { browPieces, cuffedBoot, earsAndNose, eyePieces, mittenHand, notch, skull, squeeze } from './person';
import type { Model } from './types';

/**
 * Thistledown's villagers (T53; golden set 5 is Pip): one kit body for the whole cast, made of Wren's pieces
 * (`person.ts`: the egg of a head, mitten hands, cuffed boots, the geometry face), so everyone matches. Two frames: an
 * adult (the old humanoid's joints, where they always were) and a child (a head 1.3× bigger on a shorter body, the same
 * height overall). Every surface is tiled and graded, never one flat colour (owner, 2026-11-08).
 *
 * Geometry and animation are kept apart (docs/pipeline.md "The rig convention"): `buildVillager` makes the joints, a
 * `VillagerPose` is a flat set of numbers, and `VillagerRig` turns the villager's facts (`world/objects.ts` `Npc`: is
 * Wren near, is she holding her doll) into a pose each frame. The Npc keeps turning to face Wren, its collider and its spot.
 */

export interface VillagerLook {
  /** Palette colours (`pal(...)`). */
  skin: number;
  hair: number;
  coat: number;
  pants: number;
  boots: number;
  accent: number;
  frame: 'adult' | 'child';
  hairStyle: 'cap' | 'bunches';
  outfit: 'tunic' | 'smock';
  /** How they stand: `calm` (breathing, a slow sway of the arms) or `shy` (Pip: hands clasped, eyes down, a peek at Wren). */
  manner: 'calm' | 'shy';
  /** Carries a doll (shown while held: `VillagerCue.holding`). */
  doll?: boolean;
}

/** Each villager's look (the colours they always had, by palette name). Positions and sizes: `world/overworld/index.ts`. */
export const VILLAGERS = {
  maren: { skin: pal('skin', 3), hair: pal('slate', 3), coat: pal('plum', 2), pants: pal('slate', 0), boots: pal('straw', 0), accent: pal('amber', 2), frame: 'adult', hairStyle: 'cap', outfit: 'tunic', manner: 'calm' },
  tobin: { skin: pal('skin', 2), hair: pal('flame', 1), coat: pal('sand', 1), pants: pal('plaster', 0), boots: pal('ink', 3), accent: pal('plaster', 2), frame: 'adult', hairStyle: 'cap', outfit: 'tunic', manner: 'calm' },
  odo: { skin: pal('clay', 3), hair: pal('slate', 0), coat: pal('spirit', 1), pants: pal('stone', 0), boots: pal('ink', 3), accent: pal('amber', 2), frame: 'adult', hairStyle: 'cap', outfit: 'tunic', manner: 'calm' },
  lark: { skin: pal('sand', 3), hair: pal('earth', 1), coat: pal('grass', 2), pants: pal('earth', 1), boots: pal('straw', 0), accent: pal('amber', 2), frame: 'child', hairStyle: 'cap', outfit: 'tunic', manner: 'calm' },
  // Pip (golden set 5): two short bunches tied with cream ribbons and a fringe; a rose smock with a cream apron and one
  // patched pocket, dark leggings, small boots; Button in her arms once Wren brings her back.
  pip: { skin: pal('skin', 3), hair: pal('ink', 3), coat: pal('rose', 2), pants: pal('plaster', 0), boots: pal('straw', 0), accent: pal('flame', 3), frame: 'child', hairStyle: 'bunches', outfit: 'smock', manner: 'shy', doll: true },
} as const satisfies Record<string, VillagerLook>;

/** Where the joints sit in each frame (body space, y from the feet, before the villager's scale). */
const FRAMES = {
  adult: { pivot: 0.9, hip: 0.85, legX: 0.14, shoulderY: 1.5, shoulderX: 0.44, headY: 1.88, head: 1, limb: 1, boot: -0.71, hand: -0.69 },
  child: { pivot: 0.72, hip: 0.68, legX: 0.13, shoulderY: 1.24, shoulderX: 0.33, headY: 1.72, head: 1.3, limb: 0.85, boot: -0.55, hand: -0.5 },
} as const;
type Frame = (typeof FRAMES)[keyof typeof FRAMES];

export type VillagerJoints = {
  pivot: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  eyes: THREE.Group;
  brows: THREE.Group;
  /** Button (Pip's doll), in front of the chest; hidden until held. Every villager has the joint; only a `doll` look fills it. */
  doll: THREE.Group;
};

const C = {
  eye: pal('ink', 2),
  glint: pal('chalk', 3),
  cheek: pal('rose', 3),
  nose: pal('skin', 2),
  brass: pal('amber', 1),
  patch: pal('sky', 2),
  // Button: a straw-coloured cloth face, a rose dress, amber wool hair, one ink eye and one button eye.
  dollSkin: pal('straw', 2),
  dollDress: pal('rose', 1),
  dollHair: pal('amber', 1),
  dollButton: pal('amber', 2),
};

/** The torso's profile, `[radius, y]` from the hem up to the neck. */
function torsoProfile(frame: 'adult' | 'child', outfit: 'tunic' | 'smock'): [number, number][] {
  if (frame === 'adult') return [[0.44, 0.6], [0.41, 0.8], [0.37, 0.97], [0.34, 1.2], [0.36, 1.38], [0.31, 1.53], [0.17, 1.6]];
  if (outfit === 'smock') return [[0.4, 0.42], [0.35, 0.6], [0.3, 0.85], [0.27, 1.08], [0.29, 1.18], [0.24, 1.28], [0.13, 1.34]];
  return [[0.36, 0.5], [0.33, 0.66], [0.29, 0.86], [0.27, 1.08], [0.29, 1.18], [0.24, 1.28], [0.13, 1.34]];
}

/** An open tube from `y0` up to `y1` (radii `r0`, `r1`): a sleeve, a cuff, a leg or a neck whose ends are hidden (12 triangles at 6 sides). */
const tube = (r0: number, r1: number, y0: number, y1: number, sides = 6) => lathe([[r0, y0], [r1, y1]], sides, false);

/** Button, Pip's patched doll, standing on y = 0 and facing +z (about 0.5 m before Pip's scale). */
function dollPiece() {
  const dress = paint(lathe([[0.12, 0.04], [0.075, 0.28], [0.04, 0.29]], 6), C.dollDress);
  const head = paint(place(lowSphere(0.1, 6, 4), 0, 0.28, 0), C.dollSkin);
  const hair = paint(place(squeeze(lowSphere(0.108, 6, 3), 0.9), 0, 0.33, -0.025), C.dollHair);
  const arms = [-1, 1].map((s) => paint(place(bevelBox(0.05, 0.13, 0.05, 0), s * 0.1, 0.14, 0.01, [0, 0, s * -0.5]), C.dollSkin));
  const patch = paint(place(bevelBox(0.05, 0.05, 0.012, 0), 0.035, 0.15, 0.085, [0, 0, 0.3]), C.patch);
  const eye = paint(place(bevelBox(0.022, 0.022, 0.012, 0), -0.035, 0.37, 0.092), C.eye);
  const button = paint(place(taper(0.024, 0.024, 0.012, 5), 0.035, 0.37, 0.09, [Math.PI / 2, 0, 0]), C.dollButton);
  return crevice(gradient(merge(dress, head, hair, ...arms, patch, eye, button), 0.88, 1.04), { foot: 1 });
}

/**
 * A villager: the kit model, baked per joint with the shared materials (a villager never flashes or recolours), with its
 * rig. `phase` offsets the idle (so neighbours don't breathe in step) and seeds the blinks; `scale` sizes the whole body.
 */
export function buildVillager(look: VillagerLook, phase = 0, scale = 1): Model<VillagerJoints> & { rig: VillagerRig } {
  const F: Frame = FRAMES[look.frame];
  const k = F.head, l = F.limb;
  const child = look.frame === 'child';

  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = F.pivot;
  root.add(pivot);
  const body = new THREE.Group();
  body.position.y = -F.pivot;
  pivot.add(body);

  // ---- the torso: the coat or smock (an apron on Pip's), a belt for a tunic, a collar in the accent, a neck.
  const profile = torsoProfile(look.frame, look.outfit);
  const hem = profile[0][1], top = profile[profile.length - 1][1];
  let coat = squeeze(lathe(profile, 8), 0.9);
  if (look.outfit === 'smock') coat = notch(coat, hem, 0.035, 8);
  // The apron: the two front sides of the smock below the chest, picked by the side a triangle is on (its angle round the
  // body), so both halves of each face agree.
  const apron = (c: THREE.Vector3) => (look.outfit === 'smock' && c.y < 1.02 && Math.abs(Math.atan2(c.x, c.z)) < Math.PI / 4 ? look.accent : undefined);
  const torso = [crevice(gradient(paintRegion(paint(coat, look.coat), apron), 0.8, 1.06), { foot: 0.85, footHeight: 0.6 })];
  if (look.outfit === 'tunic') {
    const b0 = child ? 0.76 : 0.91, b1 = child ? 0.84 : 1.03, r = child ? 0.315 : 0.385;
    torso.push(paint(squeeze(lathe([[r, b0], [r + 0.015, b0 + 0.02], [r + 0.015, b1 - 0.02], [r - 0.005, b1]], 8, false), 0.9), look.boots));
    torso.push(paint(place(bevelBox(0.1, 0.08, 0.03, 0), 0, (b0 + b1) / 2, r * 0.9 + 0.01), C.brass));
  } else {
    // The apron's pocket, patched with a square of blue.
    torso.push(paint(place(bevelBox(0.14, 0.12, 0.03, 0), 0.08, 0.7, 0.3, [0, 0.12, 0]), look.accent));
    torso.push(paint(place(bevelBox(0.065, 0.06, 0.012, 0), 0.1, 0.71, 0.32, [0, 0.12, 0.25]), C.patch));
  }
  const collar = lathe([[0.17 * l, top - 0.07], [0.25 * l, top - 0.02], [0.15 * l, top + 0.04]], 6, false);
  torso.push(crevice(paint(collar, look.accent), { foot: 1 }));
  torso.push(paint(tube(0.11 * l, 0.1 * l, top - 0.06, top + 0.1), look.skin));
  body.add(kitMesh(merge(...torso), 'cloth'));

  // ---- the legs: trousers or leggings, cuffed boots.
  const leg = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * F.legX, F.hip, 0);
    const len = child ? 0.5 : 0.62;
    g.add(kitMesh(crevice(gradient(paint(tube(0.09 * l, 0.11 * l, -len, 0), look.pants), 0.82, 1.02), { foot: 1 }), 'cloth'));
    g.add(kitMesh(gradient(cuffedBoot(s, { boots: look.boots, sole: pal('bark', 0), cuff: look.boots }, F.boot, child ? 0.9 : 1, 0), 0.85, 1.08), 'leather'));
    body.add(g);
    return g;
  };
  const legL = leg(1);
  const legR = leg(-1);

  // ---- the arms: a shoulder and a sleeve to the wrist, a cuff in the accent, a mitten hand.
  const arm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * F.shoulderX, F.shoulderY, 0);
    g.rotation.order = 'YXZ';
    const sleeveEnd = F.hand + 0.1 * l;
    const shoulder = place(lowSphere(0.12 * l, 6, 4), 0, -0.04, 0);
    const sleeve = tube(0.095 * l, 0.12 * l, sleeveEnd, -0.08);
    const cuff = paint(tube(0.1 * l, 0.1 * l, sleeveEnd - 0.01, sleeveEnd + 0.04), look.accent);
    g.add(kitMesh(crevice(merge(gradient(paint(merge(shoulder, sleeve), look.coat), 0.84, 1.04), cuff), { foot: 1 }), 'cloth'));
    g.add(kitMesh(mittenHand(s, look.skin, F.hand, child ? 0.85 : 1), 'skin'));
    body.add(g);
    return g;
  };
  const armL = arm(1);
  const armR = arm(-1);

  // ---- the head: the egg of a head (rosy cheeks on a child), ears and a nose; the hair; the face on its own joints.
  const head = new THREE.Group();
  head.position.y = F.headY;
  body.add(head);
  const face = paintRegion(paint(skull(k, 10), look.skin), (c, n) => {
    if (c.y > 0.15 * k || (n.z < -0.2 && c.y > -0.25 * k)) return look.hair;
    return undefined;
  });
  // A child's rosy cheeks: two flat blushes on the face, under the eyes.
  const cheeks = child ? [-1, 1].map((s) => paint(place(bevelBox(0.1, 0.055, 0.02, 0), s * 0.24, -0.19, 0.318, [0, s * 0.63, 0]), C.cheek)) : [];
  // The underside shade is gentler on a face (a full 0.7 reads as a beard on a big head).
  head.add(kitMesh(crevice(gradient(merge(face, ...earsAndNose(look.skin, C.nose, k), ...cheeks), 0.92, 1.04), { foot: 1, underside: 0.9 }), 'skin'));

  const cap = place(lathe([[0.37 * k, 0], [0.355 * k, 0.12 * k], [0.29 * k, 0.25 * k], [0.16 * k, 0.34 * k], [0, 0.37 * k]], 8, false), 0, 0, -0.03 * k, [-0.45, 0, 0]);
  const hair = [cap];
  const ribbons: THREE.BufferGeometry[] = [];
  if (look.hairStyle === 'bunches') {
    // A blunt fringe and two short bunches behind the ears, each tied with a ribbon.
    for (const [i, x] of [-0.18, -0.06, 0.06, 0.18].entries()) {
      hair.push(place(taper(0.065 * k, 0.03 * k, 0.13 * k, 4, 0.5), x * k, 0.235 * k - (i % 2) * 0.012, 0.3 * k, [Math.PI - 0.45, 0, -x * 0.6]));
    }
    for (const s of [-1, 1]) {
      // Out from the side of the head and down a little, tipped back; the ribbon a band round its root, outside the skull.
      const tilt: [number, number, number] = [0.3, 0, -s * 2.3];
      hair.push(place(taper(0.1 * k, 0.045 * k, 0.17 * k, 5, 0.85), s * 0.3 * k, 0.06 * k, -0.1 * k, tilt));
      ribbons.push(paint(place(bevelBox(0.15 * k, 0.05 * k, 0.15 * k, 0), s * 0.355 * k, 0.035 * k, -0.115 * k, tilt), look.accent));
    }
  }
  const hairGeo = gradient(paint(wobble(merge(...hair), 0.008, 5), look.hair), 0.82, 1.1);
  head.add(kitMesh(crevice(merge(hairGeo, ...ribbons), { foot: 1 }), 'hide'));

  // Eyes a little lower and bigger on a child; brows that can frown (1) or lift in worry (−1).
  const eyeY = child ? -0.07 : -0.02, eyeZ = child ? 0.39 : 0.305;
  const eyes = new THREE.Group();
  eyes.position.set(0, eyeY, eyeZ);
  head.add(eyes);
  eyes.add(kitMesh(eyePieces(C.eye, C.glint, child ? 1.2 : 1, child ? 0.15 : 0.125), 'skin'));
  const brows = new THREE.Group();
  brows.position.set(0, child ? 0.08 : 0.11, child ? 0.395 : 0.295);
  head.add(brows);
  brows.add(kitMesh(browPieces(look.hair, 1, child ? 0.15 : 0.125, child ? -0.12 : 0.1), 'hide'));

  // ---- Button, held against the chest (hidden until she has her back).
  const doll = new THREE.Group();
  doll.position.set(0, child ? 0.72 : 1.0, child ? 0.32 : 0.36);
  doll.visible = false;
  body.add(doll);
  // Button a little bigger than life (0.37 m tall on Pip), so she reads as a doll from the square.
  if (look.doll) doll.add(kitMesh(place(dollPiece()).scale(1.3, 1.3, 1.3), 'cloth'));

  const joints: VillagerJoints = { pivot, head, armL, armR, legL, legR, eyes, brows, doll };
  const model = bakeRig({ root, joints, flashMats: [] }, { shared: true });
  root.scale.setScalar(scale);
  return { ...model, rig: new VillagerRig(model.joints, look, phase) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------------------------------------------------

/** How a villager looks at one moment: a flat set of numbers (docs/pipeline.md "The rig convention"). Angles in radians. */
export interface VillagerPose {
  /** The hips' height above their rest (m, body space). */
  lift: number;
  pitch: number;
  yaw: number;
  roll: number;
  legLX: number;
  legRX: number;
  armLX: number;
  armLY: number;
  armLZ: number;
  armRX: number;
  armRY: number;
  armRZ: number;
  headX: number;
  headY: number;
  headZ: number;
  /** 0 = eyes open, 1 = shut. */
  blink: number;
  /** 0 = at rest, 1 = a low frown, −1 = lifted in worry. */
  brow: number;
}

export const REST: VillagerPose = {
  lift: 0, pitch: 0, yaw: 0, roll: 0, legLX: 0, legRX: 0,
  armLX: 0, armLY: 0, armLZ: 0.05, armRX: 0, armRY: 0, armRZ: -0.05,
  headX: 0, headY: 0, headZ: 0, blink: 0, brow: 0,
};

const POSE_KEYS = Object.keys(REST) as (keyof VillagerPose)[];

export function blendPose(cur: VillagerPose, target: VillagerPose, k: number) {
  for (const key of POSE_KEYS) cur[key] += (target[key] - cur[key]) * k;
}

/** What the Npc tells the rig each frame (world/objects.ts), which the rig reads but never changes. */
export interface VillagerCue {
  /** Wren is close (the Npc turns to face them). */
  near: boolean;
  /** Holding the doll (Pip, once Button is back). */
  holding: boolean;
}

/** The hug: both arms folded round the doll (left arm; the right mirrors it). */
export const HUG = { armX: -0.9, armY: 0.25, armZ: -0.5 } as const;
/** Shy hands, clasped low in front. */
export const CLASP = { armX: -0.55, armY: 0.2, armZ: -0.42 } as const;
/** A peek at Wren: how long the head stays up (s). */
const PEEK = 1.4;

/**
 * Turns a villager's facts into a pose and puts it on the joints. Calm: the breathing and slow sway of the arms the
 * villagers always had, now with blinks. Shy (Pip): hands clasped, eyes down, a little twisting sway, and while Wren is near
 * a peek up at them every few seconds; holding her doll she hugs it and rocks.
 */
export class VillagerRig {
  readonly pose: VillagerPose = { ...REST };
  private clock: number;
  private nextBlink: number;
  private blinkT = -1;
  private nextPeek = 0.6;
  private peekT = -1;
  private started = false;
  private readonly rnd: () => number;
  private readonly pivotY: number;
  private readonly browY: number;

  constructor(
    private readonly j: VillagerJoints,
    private readonly look: VillagerLook,
    phase = 0,
  ) {
    // Seeded from the phase the Npc already drew: never from Math.random (it would shift every random number after it).
    this.rnd = mulberry32(1 + Math.floor(phase * 1000));
    this.clock = phase;
    this.nextBlink = 1 + this.rnd() * 3;
    this.pivotY = j.pivot.position.y;
    this.browY = j.brows.position.y;
  }

  /** Where the villager's state wants the pose (before the blink). `peek` is 0–1, how far the head is up. */
  target(cue: VillagerCue, clock = this.clock, peek = 0): VillagerPose {
    const p: VillagerPose = { ...REST };
    // Breathing and the slow sway of the arms (the old Npc's idle, kept).
    p.lift = Math.sin(clock * 2) * 0.015;
    p.armLX = Math.sin(clock * 1.3) * 0.08;
    p.armRX = -Math.sin(clock * 1.3) * 0.08;
    p.headZ = Math.sin(clock * 0.7) * 0.06;
    if (this.look.manner === 'shy') {
      // Twisting on the spot, hands clasped, looking at her feet (and around, a little).
      const sway = Math.sin(clock * 0.9);
      p.yaw = 0.12 * sway;
      p.roll = 0.025 * sway;
      p.armLX = CLASP.armX + 0.04 * Math.sin(clock * 1.3);
      p.armLY = CLASP.armY;
      p.armLZ = CLASP.armZ;
      p.armRX = CLASP.armX + 0.04 * Math.sin(clock * 1.3);
      p.armRY = -CLASP.armY;
      p.armRZ = -CLASP.armZ;
      p.headX = 0.22;
      p.headY = 0.25 * Math.sin(clock * 0.37) - 0.6 * p.yaw;
      p.headZ = 0.1 + 0.04 * Math.sin(clock * 0.7);
      p.legRX = 0.12 * Math.max(0, Math.sin(clock * 1.7)) ** 2; // a toe scuffing the ground
      p.brow = -0.6;
    }
    if (cue.holding) {
      // The hug: arms round Button, head on her, rocking.
      const rock = Math.sin(clock * 1.2);
      p.yaw = 0.1 * rock;
      p.roll = 0.03 * rock;
      p.armLX = p.armRX = HUG.armX;
      p.armLY = HUG.armY;
      p.armRY = -HUG.armY;
      p.armLZ = HUG.armZ;
      p.armRZ = -HUG.armZ;
      p.headX = 0.2;
      p.headY = 0;
      p.headZ = 0.16 + 0.03 * rock;
      p.legRX = 0;
      p.brow = 0;
    }
    if (peek > 0) {
      // Looking up at Wren: the head comes up and straight, the sway stills.
      const k = peek;
      p.headX += (-0.08 - p.headX) * k;
      p.headY += (-0.4 * p.yaw - p.headY) * k;
      p.headZ *= 1 - 0.5 * k;
      p.yaw *= 1 - 0.6 * k;
    }
    return p;
  }

  /** One frame: the pose eased toward the target, the blink, the peek, the doll shown while held. */
  update(dt: number, cue: VillagerCue) {
    this.clock += dt;
    // A shy villager peeks at Wren every few seconds while they're near (holding her doll, she just looks up).
    let peek = 0;
    if (this.look.manner === 'shy' && cue.near) {
      if (cue.holding) peek = 1;
      else {
        this.nextPeek -= dt;
        if (this.nextPeek <= 0 && this.peekT < 0) {
          this.peekT = 0;
          this.nextPeek = PEEK + 2 + this.rnd() * 2.5;
        }
      }
    }
    if (this.peekT >= 0) {
      this.peekT += dt;
      const t = this.peekT;
      peek = Math.min(1, t / 0.25, Math.max(0, (PEEK - t) / 0.3));
      if (t >= PEEK) this.peekT = -1;
    }
    const target = this.target(cue, this.clock, peek);
    if (!this.started) Object.assign(this.pose, target);
    this.started = true;
    blendPose(this.pose, target, 1 - Math.exp(-10 * dt));

    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0;
      this.nextBlink = 2 + this.rnd() * 3.5;
    }
    let blink = this.pose.blink;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.max(blink, Math.sin(Math.min(1, this.blinkT / 0.14) * Math.PI));
      if (this.blinkT > 0.14) this.blinkT = -1;
    }
    this.apply(this.pose, blink);
    this.j.doll.visible = cue.holding && this.j.doll.children.length > 0;
  }

  /** Puts a pose on the joints. */
  private apply(p: VillagerPose, blink: number) {
    const { pivot, head, armL, armR, legL, legR, eyes, brows } = this.j;
    pivot.position.y = this.pivotY + p.lift;
    pivot.rotation.set(p.pitch, p.yaw, p.roll);
    legL.rotation.x = p.legLX;
    legR.rotation.x = p.legRX;
    armL.rotation.set(p.armLX, p.armLY, p.armLZ);
    armR.rotation.set(p.armRX, p.armRY, p.armRZ);
    head.rotation.set(p.headX, p.headY, p.headZ);
    eyes.scale.y = Math.max(0.1, 1 - blink);
    // A frown lowers and tips the brows; worry (below 0) lifts them.
    brows.position.y = this.browY - 0.025 * p.brow;
    brows.rotation.x = 0.25 * Math.max(0, p.brow);
  }
}

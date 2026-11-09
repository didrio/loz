import * as THREE from 'three';
import { clamp, easeOut, mix, mulberry32 } from '../../core/math';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, kitMesh, lathe, lowSphere, merge, paint, paintRegion, place, taper, wobble } from '../kit';
import { browPieces, cuffedBoot, earsAndNose, eyePieces, mittenHand, notch, skull, squeeze } from './person';
import { uniqueSurf } from '../materials';
import { pal } from '../palette';
import type { SurfaceId } from '../textures';
import type { Model } from './types';

/**
 * Wren (golden set 2, final; docs/art.md "The golden set"): chunky and simple, a head a little big for the body, mitten
 * hands and heavy boots; short dark hair with a fringe, a geometry face (eyes that blink, brows that frown, a small nose); a
 * clay-orange tunic with a notched hem and short sleeves over a grey undershirt, leather bracers, a belt with a pouch and
 * cuffed boots. Wren is deliberately neither boy nor girl (owner, 2026-11-08): nothing in the model says which.
 * Built with the modeling kit and baked per joint (`bakeRig`).
 *
 * Geometry and animation are kept apart (docs/pipeline.md "The rig convention"): `buildWren` makes the joints (the old
 * humanoid's, where they always were, plus `eyes` and `brows`), a `WrenPose` is a flat set of numbers,
 * and `WrenRig` turns the player's state (game/player.ts) into a pose each frame. The player keeps every timing.
 */

/** Wren's tunic: clay orange; slate once the Stoneward Tunic is bought (the game recolours `coatMat`). */
export const WREN_COAT = pal('clay');
export const STONEWARD_COAT = pal('slate');
/** The shield's wood, and the red it flashes while the guard is broken. */
export const SHIELD_WOOD = pal('wood');
export const SHIELD_BROKEN = pal('crimson');

/** The shield lowered: on the outside of the left forearm (arm space), face turned ~80° out to the side. */
export const SHIELD_REST_POS = new THREE.Vector3(0.14, -0.4, 0.02);
export const SHIELD_REST_YAW = 1.4;
/** The shield raised: its centre in front of the chest (body space, before the character's scale). */
export const SHIELD_BLOCK_POS = new THREE.Vector3(0.05, 1.2, 0.62);
/** Surfing: the shield flat under Wren's feet (body space; the pivot is raised by `SURF_LIFT` to stand on it). */
export const SHIELD_SURF_POS = new THREE.Vector3(0, -0.05, 0);
export const SHIELD_SURF_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
export const SURF_LIFT = 0.12;
/** Where the pivot (hips) rests above the feet. */
export const PIVOT_Y = 0.9;

export type WrenJoints = {
  pivot: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  sword: THREE.Group;
  shield: THREE.Group;
  eyes: THREE.Group;
  brows: THREE.Group;
};

// Wren's colours, by name.
const C = {
  skin: pal('skin', 3),
  cheek: pal('skin', 2),
  hair: pal('bark', 0),
  hairLight: pal('bark', 1),
  white: pal('chalk', 3), // the coat's vertices: the coat material carries the colour
  coatShade: pal('chalk', 1),
  under: pal('stone', 1),
  pants: pal('plaster', 0),
  leather: pal('bark', 1),
  boots: pal('bark', 2),
  cuff: pal('wood', 1),
  sole: pal('bark', 0),
  eye: pal('ink', 2),
  glint: pal('chalk', 3),
  brass: pal('amber', 1),
  pouch: pal('wood', 1),
  iron: pal('slate', 1),
  ironLight: pal('slate', 2),
  grip: pal('earth', 0),
  plank: pal('wood', 1),
};

/** A mesh in one of Wren's own materials (the coat, the blade, the shield's wood): vertex colours times the material's. */
function own(g: THREE.BufferGeometry, material: THREE.MeshLambertMaterial, surface?: SurfaceId) {
  const m = kitMesh(g, surface);
  m.material = material;
  return m;
}

/** The sword's pieces, hanging from the hand (local y down the blade): the blade itself, and the hilt's fittings. */
export function swordPieces() {
  const blade = merge(
    paintRegion(paint(place(bevelBox(0.085, 1.05, 0.03, 0.012), 0, -0.78, 0), C.white), (_c, n) => (Math.abs(n.x) > 0.3 && Math.abs(n.z) > 0.3 ? C.coatShade : undefined)),
    paint(place(taper(0.045, 0, 0.18, 4, 0.4), 0, -1.305, 0, [Math.PI, 0, 0]), C.white),
  );
  const guard = paint(place(bevelBox(0.36, 0.06, 0.1, 0.02), 0, -0.22, 0), C.brass);
  const tips = [-1, 1].map((s) => paint(place(bevelBox(0.05, 0.09, 0.08, 0), s * 0.19, -0.21, 0), C.brass));
  const grip = paint(place(taper(0.04, 0.036, 0.24, 6), 0, -0.2, 0), C.grip);
  const pommel = paint(place(lowSphere(0.055, 6, 4), 0, 0.07, 0), C.brass);
  return { blade, fittings: crevice(merge(guard, ...tips, grip, pommel), { foot: 1 }) };
}

/** The shield's pieces, its face toward +z: the plank disc (two shades of wood in vertical planks), and the iron rim and boss. */
export function shieldPieces() {
  const face = (g: THREE.BufferGeometry) => place(g, 0, 0, 0, [Math.PI / 2, 0, 0]);
  const disc = paintRegion(paint(face(lathe([[0, -0.04], [0.42, -0.04], [0.42, 0.03], [0.3, 0.065], [0, 0.075]], 12)), C.white), (c) =>
    Math.floor((c.x + 0.42) / 0.21) % 2 === 1 ? C.coatShade : undefined,
  );
  const rim = paint(face(lathe([[0.4, -0.05], [0.455, -0.05], [0.455, 0.05], [0.4, 0.065]], 12, false)), C.iron);
  const boss = paintRegion(paint(place(squeeze(lowSphere(0.11, 6, 4), 0.6), 0, 0, 0.07), C.iron), (_c, n) => (n.z > 0.6 ? C.ironLight : undefined));
  const band = paint(place(bevelBox(0.07, 0.8, 0.03, 0), 0, 0, 0.055), C.iron);
  return { disc, iron: merge(rim, boss, band) };
}

/**
 * Wren: the kit model, the sword in the right hand and the shield on the left arm (both hidden until Wren has them: the
 * player shows them). The tunic, blade and shield wood are materials of their own the game recolours, glows and
 * flashes (`coatMat`, `bladeMat`, `shieldMat`), left out of the bake (`animated`).
 */
export function buildWren(seed?: number): Model<WrenJoints> & {
  rig: WrenRig;
  coatMat: THREE.MeshLambertMaterial;
  bladeMat: THREE.MeshLambertMaterial;
  shieldMat: THREE.MeshLambertMaterial;
} {
  const coatMat = uniqueSurf('cloth', WREN_COAT, { vertexColors: true });
  const bladeMat = uniqueSurf('metal', pal('slate', 3), { vertexColors: true, emissive: 0x000000 });
  const shieldMat = uniqueSurf('wood', SHIELD_WOOD, { vertexColors: true });

  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = PIVOT_Y;
  root.add(pivot);
  // The body: the frame the joints were always placed in (y from the feet), hung from the hips.
  const body = new THREE.Group();
  body.position.y = -PIVOT_Y;
  pivot.add(body);

  // ---- the torso (body space): tunic, belt and pouch, a neck under the head.
  const tunic = notch(squeeze(lathe([[0.44, 0.6], [0.41, 0.8], [0.37, 0.97], [0.34, 1.2], [0.36, 1.38], [0.31, 1.53], [0.17, 1.6]], 10), 0.9), 0.6, 0.07, 10);
  body.add(own(crevice(paintRegion(paint(tunic, C.white), (c) => (c.y < 0.72 ? C.coatShade : undefined)), { foot: 0.85, footHeight: 0.9 }), coatMat, 'cloth'));
  const belt = squeeze(lathe([[0.385, 0.91], [0.4, 0.94], [0.4, 1.0], [0.38, 1.03]], 10, false), 0.9);
  const buckle = place(bevelBox(0.12, 0.1, 0.04, 0), 0, 0.97, 0.365);
  const pouch = merge(paint(bevelBox(0.14, 0.15, 0.09, 0.03), C.pouch), paint(place(bevelBox(0.155, 0.055, 0.105, 0), 0, 0.055, 0), C.leather));
  const neckline = lathe([[0.17, 1.56], [0.2, 1.585], [0.17, 1.62]], 10, false);
  const neck = place(taper(0.12, 0.11, 0.16, 8), 0, 1.5, 0);
  // One mesh for the small parts (buckle, neckline, neck ride with the belt's leather): every mesh is a draw call on a phone.
  body.add(kitMesh(crevice(merge(paint(belt, C.leather), place(pouch, -0.27, 0.86, 0.24, [0, -0.7, 0]), paint(buckle, C.brass), paint(neckline, C.under), paint(neck, C.skin)), { foot: 1 }), 'leather'));

  // ---- the legs: trousers, cuffed boots a size too big.
  const leg = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.14, 0.85, 0);
    const pants = paint(place(taper(0.09, 0.11, 0.62, 6), 0, -0.62, 0), C.pants);
    g.add(kitMesh(crevice(merge(pants), { foot: 1 }), 'cloth'));
    g.add(kitMesh(cuffedBoot(s, C), 'leather'));
    body.add(g);
    return g;
  };
  const legL = leg(1);
  const legR = leg(-1);

  // ---- the arms: a coat shoulder and short sleeve, the grey undershirt, a leather bracer, a mitten hand.
  const arm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.44, 1.5, 0);
    g.rotation.order = 'YXZ';
    const shoulder = place(lowSphere(0.125, 8, 4), 0, -0.05, 0);
    const sleeve = place(taper(0.13, 0.115, 0.3, 8), 0, -0.36, 0);
    g.add(own(crevice(paintRegion(paint(merge(shoulder, sleeve), C.white), (c) => (c.y < -0.33 ? C.coatShade : undefined)), { foot: 1 }), coatMat, 'cloth'));
    const undershirt = paint(place(taper(0.075, 0.083, 0.2, 6), 0, -0.52, 0), C.under);
    g.add(kitMesh(crevice(merge(undershirt, paint(place(taper(0.095, 0.088, 0.15, 6), 0, -0.6, 0), C.leather)), { foot: 1 }), 'leather'));
    g.add(kitMesh(mittenHand(s, C.skin), 'skin'));
    body.add(g);
    return g;
  };
  const armL = arm(1);
  const armR = arm(-1);

  // ---- the head: a big egg of a head, a cap of hair swept back, a fringe, ears and a nose; the face on its own joints.
  const head = new THREE.Group();
  head.position.y = 1.88;
  body.add(head);
  const face = paintRegion(paint(skull(), C.skin), (c, n) => {
    if (c.y > 0.15 || (n.z < -0.2 && c.y > -0.25)) return C.hair;
    return undefined;
  });
  head.add(kitMesh(crevice(merge(face, ...earsAndNose(C.skin, C.cheek)), { foot: 1 }), 'skin'));
  const cap = place(lathe([[0.37, 0], [0.355, 0.12], [0.29, 0.25], [0.16, 0.34], [0, 0.37]], 10, false), 0, 0, -0.03, [-0.45, 0, 0]);
  const fringe = [[-0.15, 0.17, 0.22], [-0.04, 0.15, 0.26], [0.07, 0.15, 0.24], [0.17, 0.12, 0.18]].map(([x, len, tilt], i) =>
    place(taper(0.075, 0.005, len, 4, 0.6), x, 0.27 - (i % 2) * 0.02, 0.255, [Math.PI - tilt - 0.35, 0, -x * 0.9]),
  );
  const locks = [-1, 1].map((s) => place(taper(0.06, 0.015, 0.12, 4, 0.6), s * 0.315, 0.12, 0.08, [Math.PI, 0, s * 0.12]));
  head.add(kitMesh(crevice(paintRegion(paint(wobble(merge(cap, ...fringe, ...locks), 0.01, 3), C.hair), (_c, n) => (n.y > 0.6 ? C.hairLight : undefined)), { foot: 1 }), 'hide'));

  const eyes = new THREE.Group();
  eyes.position.set(0, -0.02, 0.305);
  head.add(eyes);
  eyes.add(kitMesh(eyePieces(C.eye, C.glint)));
  const brows = new THREE.Group();
  brows.position.set(0, 0.11, 0.295);
  head.add(brows);
  brows.add(kitMesh(browPieces(C.hair), 'hide'));

  // ---- the sword, in the right hand, the blade continuing the line of the arm.
  const sword = new THREE.Group();
  const sp = swordPieces();
  sword.add(own(sp.blade, bladeMat, 'metal'));
  sword.add(kitMesh(sp.fittings, 'metal'));
  sword.position.y = -0.62;
  sword.visible = false;
  armR.add(sword);

  // ---- the round shield on the left arm (its face is local +z).
  const shield = new THREE.Group();
  const sh = shieldPieces();
  shield.add(own(crevice(sh.disc, { foot: 1 }), shieldMat, 'wood'));
  shield.add(kitMesh(sh.iron, 'metal'));
  shield.position.copy(SHIELD_REST_POS);
  shield.rotation.set(0, SHIELD_REST_YAW, 0);
  shield.visible = false;
  armL.add(shield);

  const joints: WrenJoints = { pivot, head, armL, armR, legL, legR, sword, shield, eyes, brows };
  const model = bakeRig({ root, joints, flashMats: [], animated: [coatMat, bladeMat, shieldMat] });
  return { ...model, rig: new WrenRig(model.joints, shieldMat, seed), coatMat, bladeMat, shieldMat };
}

// ---------------------------------------------------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------------------------------------------------

/** How Wren looks at one moment: a flat set of numbers (docs/pipeline.md "The rig convention"). Angles in radians. */
export interface WrenPose {
  /** The hips' height above their rest (m). */
  lift: number;
  /** The whole body about the hips: + leans forward... (x), turns left (y), rolls (z). */
  pitch: number;
  yaw: number;
  roll: number;
  legLX: number;
  legLZ: number;
  legRX: number;
  legRZ: number;
  armLX: number;
  armLY: number;
  armLZ: number;
  armRX: number;
  armRY: number;
  armRZ: number;
  /** The sword in the hand: −1.1 carried forward, 0 straight down the arm (a swing). */
  sword: number;
  headX: number;
  headY: number;
  headZ: number;
  /** 0 = eyes open, 1 = shut. */
  blink: number;
  /** 0 = brows at rest, 1 = a low frown. */
  brow: number;
}

export const REST: WrenPose = {
  lift: 0, pitch: 0, yaw: 0, roll: 0,
  legLX: 0, legLZ: 0, legRX: 0, legRZ: 0,
  armLX: 0, armLY: 0, armLZ: 0.08, armRX: 0, armRY: 0, armRZ: -0.08,
  sword: -1.1, headX: 0, headY: 0, headZ: 0, blink: 0, brow: 0,
};

const POSE_KEYS = Object.keys(REST) as (keyof WrenPose)[];

export function blendPose(cur: WrenPose, target: WrenPose, k: number) {
  for (const key of POSE_KEYS) cur[key] += (target[key] - cur[key]) * k;
}

/** What the player tells the rig each frame (game/player.ts), which the rig reads but never changes. */
export interface WrenCue {
  alive: boolean;
  /** The player's state and seconds in it. */
  action: 'move' | 'attack' | 'hurt';
  t: number;
  /** Which swing of the combo (0 right to left, 1 left to right, 2 the overhead chop) and how far through it (0–1). */
  combo: number;
  swing: number;
  /** Ground speed (m/s), and as a share of a full run (0–1). */
  speed: number;
  run: number;
  grounded: boolean;
  shielding: boolean;
  surfing: boolean;
  /** The glove is out (its arm thrown ahead). */
  throwing: boolean;
  /** Seconds left of a broken guard (0 = not broken). */
  broken: number;
  hasSword: boolean;
}

/** Where a swing's ease starts and ends (share of the swing): the arc's key angles are exact at both. */
const SWING_FROM = 0.12, SWING_TO = 0.72;
/** A crossfade between two kinds of pose (s), like a crossfade between two clips. */
const FADE = 0.12;

/**
 * Turns the player's state into a pose and puts it on the joints. Every look sits inside the windows the player already
 * has: the swing's arc keeps its key angles where it always had them (a pull-back before, an overshoot after), the raised
 * shield stands exactly where the guard always held it, and the death has its own clock (the game fades to black).
 */
export class WrenRig {
  readonly pose: WrenPose = { ...REST };
  private clock = 0;
  private phase = 0;
  private deathT = 0;
  private wasGrounded = true;
  private landT = 1;
  private kind = '';
  private fadeT = 1;
  private fadeLen = FADE;
  /** Whether Wren was on the ground when the last crossfade began (taking off and landing fade faster). */
  private fadeGrounded = true;
  private readonly from: WrenPose = { ...REST };
  private nextBlink: number;
  private blinkT = -1;
  private readonly rnd: () => number;

  constructor(
    private readonly j: WrenJoints,
    private readonly shieldMat?: THREE.MeshLambertMaterial,
    // A fixed seed: there is one Wren, and drawing from Math.random here would shift every random number after it
    // (enemy AI, the look scenes' seeded runs).
    seed = 1,
  ) {
    this.rnd = mulberry32(seed);
    this.nextBlink = 1.5 + this.rnd() * 2.5;
  }

  /** Back on their feet (a revive): standing, no fade from the fall. */
  reset() {
    this.deathT = 0;
    Object.assign(this.pose, REST);
    this.kind = '';
    this.fadeT = 1;
  }

  /** Where the state wants the pose (before the blink). `phase` is the run cycle, `clock` idle life. */
  target(cue: WrenCue, phase = this.phase, clock = this.clock, deathT = this.deathT, landT = 1): WrenPose {
    const p: WrenPose = { ...REST };
    const amt = cue.run;
    const s = Math.sin(phase);

    // The base: the run cycle (or standing and breathing), and the jump.
    p.legLX = s * 0.8 * amt;
    p.legRX = -s * 0.8 * amt;
    p.armLX = -s * 0.5 * amt;
    p.armRX = s * 0.5 * amt - (cue.hasSword ? 0.35 : 0);
    p.lift = Math.abs(s) * 0.07 * amt;
    p.pitch = 0.1 * amt;
    p.headX = -0.07 * amt;
    const still = 1 - Math.min(1, amt * 4);
    const breath = Math.sin(clock * 2.2);
    p.lift += 0.012 * breath * still;
    p.armLZ += 0.025 * breath * still;
    p.armRZ -= 0.025 * breath * still;
    p.headZ = 0.035 * Math.sin(clock * 0.6) * still;
    p.headY = 0.12 * Math.sin(clock * 0.37) * still * still;
    if (!cue.grounded) {
      p.legLX = -0.6;
      p.legRX = 0.3;
      p.armLX = -0.35;
      p.armLZ = 0.3;
      p.armRX -= 0.2;
      p.armRZ = -0.3;
    } else if (landT < 0.2) {
      p.lift -= 0.07 * Math.sin((landT / 0.2) * Math.PI); // the knees take the landing
    }

    if (!cue.alive) {
      // The knees go, then Wren falls back and lies flat (by half a second), a small bounce on landing.
      const k = Math.min(1, deathT * 2);
      const fall = k * k;
      const bounce = deathT > 0.5 ? 0.07 * Math.exp(-9 * (deathT - 0.5)) * Math.sin(20 * (deathT - 0.5)) : 0;
      return {
        ...p,
        lift: -0.6 * easeOut(Math.min(1, deathT * 2.5)),
        pitch: (-fall * Math.PI) / 2 + bounce,
        yaw: 0,
        roll: 0.1 * fall,
        legLX: 0.35 * (1 - fall),
        legRX: 0.25 * (1 - fall),
        legLZ: 0.08 * fall,
        legRZ: -0.08 * fall,
        armLX: -0.5 * fall,
        armLY: 0,
        armLZ: 0.08 + 0.9 * fall,
        armRX: -0.5 * fall,
        armRY: 0,
        armRZ: -0.08 - 0.9 * fall,
        sword: -1.1,
        headX: -0.25 * fall,
        headY: 0.3 * fall,
        headZ: 0,
        blink: Math.min(1, deathT * 5),
        brow: 0.5,
      };
    }

    if (cue.action === 'attack') {
      const q = clamp(cue.swing, 0, 1);
      const e = easeOut(clamp((q - SWING_FROM) / (SWING_TO - SWING_FROM), 0, 1));
      // The pull-back before the arc and the overshoot after it are zero at its ends, so the arc's key angles stay put.
      const pull = q < SWING_FROM ? Math.sin((q / SWING_FROM) * Math.PI) : 0;
      const over = q > SWING_TO ? Math.sin(((q - SWING_TO) / (1 - SWING_TO)) * Math.PI) : 0;
      p.sword = 0;
      p.legLX = 0.4;
      p.legRX = -0.3;
      p.brow = 1;
      p.headX = 0;
      p.headZ = 0;
      if (cue.combo === 2) {
        p.armRX = mix(-3.1, -0.5, e) - 0.25 * pull + 0.2 * over;
        p.armRY = 0;
        p.armRZ = 0;
        p.pitch = mix(-0.1, 0.25, e) - 0.08 * pull + 0.05 * over;
        p.lift = -0.06 * e;
        p.armLX = -0.45;
        p.armLZ = 0.3;
        p.headX = -0.1 * (1 - e);
      } else {
        const from = cue.combo === 0 ? -1.7 : 1.4;
        const to = cue.combo === 0 ? 1.4 : -1.7;
        const dir = Math.sign(to - from);
        p.armRX = -1.45;
        p.armRY = mix(from, to, e) - dir * 0.3 * pull + dir * 0.18 * over;
        p.armRZ = 0;
        p.yaw = mix(-0.4, 0.4, cue.combo === 0 ? e : 1 - e) - dir * 0.08 * pull + dir * 0.06 * over;
        p.lift = -0.04;
        p.armLX = -0.3;
        p.armLZ = 0.28;
        p.headY = -p.yaw * 0.5; // the eyes stay on what's being hit
      }
    } else if (cue.action === 'hurt') {
      // Knocked back: a jolt that settles into the recoil, eyes screwed shut, arms flung out.
      const jolt = Math.exp(-14 * cue.t);
      p.pitch = -0.35 - 0.12 * jolt;
      p.lift -= 0.03;
      p.armLX = p.armRX = -0.8;
      p.armLZ = 0.35;
      p.armRZ = -0.35;
      p.headX = -0.15 - 0.1 * jolt;
      p.blink = cue.t < 0.22 ? 1 : 0;
      p.brow = 0.8;
    }

    // Throwing the glove: the left arm straight out ahead, the shoulder turned into it.
    if (cue.throwing && cue.action === 'move') {
      p.armLX = -1.6;
      p.armLY = 0;
      p.armLZ = 0.12;
      p.yaw = -0.22;
      p.armRX = 0.3;
      p.brow = 0.5;
    }
    if (cue.shielding) {
      // Guard up: the shield arm across the chest (the shield itself is placed square in front), braced when standing.
      p.armLX = -1.25;
      p.armLY = -0.6;
      p.armLZ = 0;
      p.brow = 0.7;
      if (amt < 0.2) {
        p.legLX = 0.22;
        p.legRX = -0.18;
        p.lift -= 0.05;
      }
    }
    if (cue.surfing) {
      // Riding: half side-on, a low crouch leaning into the ride, feet apart, arms out for balance, a little sway.
      const sway = Math.sin(clock * 3) * 0.06;
      p.lift = SURF_LIFT - 0.12;
      p.pitch = 0.22;
      p.yaw = -0.8;
      p.roll = sway;
      p.legLX = -0.35;
      p.legLZ = 0.3;
      p.legRX = 0.25;
      p.legRZ = -0.3;
      p.armLX = -0.5;
      p.armLY = 0;
      p.armLZ = 1.35 - sway;
      p.armRX = -0.5;
      p.armRY = 0;
      p.armRZ = -1.35 - sway;
      p.headY = 0.6; // looking where they're going
      p.headX = -0.05;
    }
    if (cue.broken > 0) {
      // Guard broken: the shield arm hangs, the body sags, the shield droops (`update`).
      p.armLX = 0.35;
      p.armLY = 0;
      p.armLZ = 0.45 + Math.sin(cue.broken * 18) * 0.05;
      p.pitch += 0.1;
      p.headX = 0.15;
      p.brow = 0.3;
    }
    return p;
  }

  /** One frame: the state's pose (crossfaded when the kind of pose changes), the blink, the shield. */
  update(dt: number, cue: WrenCue) {
    this.clock += dt;
    this.phase += dt * (4 + cue.speed * 1.1) * (cue.run > 0.05 ? 1 : 0);
    if (!cue.alive) this.deathT += dt;
    if (cue.grounded && !this.wasGrounded) this.landT = 0;
    this.wasGrounded = cue.grounded;
    this.landT += dt;

    const target = this.target(cue, this.phase, this.clock, this.deathT, this.landT);
    // A new kind of pose crossfades in from wherever Wren was (a swing and a death start at once: they have their own curves).
    const kind = [cue.alive, cue.action, cue.combo, cue.shielding, cue.surfing, cue.throwing && cue.action === 'move', cue.grounded, cue.broken > 0].join();
    if (kind !== this.kind) {
      const first = this.kind === '';
      this.kind = kind;
      Object.assign(this.from, this.pose);
      this.fadeT = 0;
      this.fadeLen = first || (cue.alive && cue.action === 'attack') ? 0 : cue.grounded !== this.fadeGrounded ? 0.08 : FADE;
      this.fadeGrounded = cue.grounded;
    }
    this.fadeT += dt;
    const k = this.fadeLen <= 0 ? 1 : easeOut(Math.min(1, this.fadeT / this.fadeLen));
    Object.assign(this.pose, this.from);
    blendPose(this.pose, target, k);
    // The shield arm is never late: the shield is placed from it, and the guard is instant.
    if (cue.shielding || cue.surfing) for (const key of ['armLX', 'armLY', 'armLZ'] as const) this.pose[key] = target[key];

    // A blink every few seconds (not mid-swing: the eyes stay on the target).
    if (cue.alive && cue.action === 'move') {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blinkT = 0;
        this.nextBlink = 2 + this.rnd() * 3.5;
      }
    }
    let blink = this.pose.blink;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.max(blink, Math.sin(Math.min(1, this.blinkT / 0.14) * Math.PI));
      if (this.blinkT > 0.14) this.blinkT = -1;
    }

    this.apply(this.pose, blink);
    this.placeShield(cue);
    if (this.shieldMat) {
      const flash = cue.broken > 0 && Math.floor(cue.broken * 6) % 2 === 0;
      this.shieldMat.color.setHex(flash ? SHIELD_BROKEN : SHIELD_WOOD);
    }
  }

  /** Puts a pose on the joints. */
  private apply(p: WrenPose, blink: number) {
    const { pivot, head, armL, armR, legL, legR, sword, eyes, brows } = this.j;
    pivot.position.y = PIVOT_Y + p.lift;
    pivot.rotation.set(p.pitch, p.yaw, p.roll);
    legL.rotation.set(p.legLX, 0, p.legLZ);
    legR.rotation.set(p.legRX, 0, p.legRZ);
    armL.rotation.set(p.armLX, p.armLY, p.armLZ);
    armR.rotation.set(p.armRX, p.armRY, p.armRZ);
    sword.rotation.x = p.sword;
    head.rotation.set(p.headX, p.headY, p.headZ);
    eyes.scale.y = Math.max(0.1, 1 - blink);
    brows.position.y = 0.11 - 0.025 * p.brow;
    brows.rotation.x = 0.25 * p.brow;
  }

  /** The shield: on the forearm, square in front of the chest on guard, flat underfoot surfing, drooping when broken. */
  private placeShield(cue: WrenCue) {
    const { armL, shield } = this.j;
    shield.position.copy(SHIELD_REST_POS);
    shield.rotation.set(0, SHIELD_REST_YAW, 0);
    if (cue.shielding || cue.surfing) {
      // Placed in body space, then expressed in the arm's frame, whatever the arm is doing.
      armL.updateMatrix();
      const inv = armL.quaternion.clone().invert();
      shield.quaternion.copy(inv);
      if (cue.surfing) shield.quaternion.multiply(SHIELD_SURF_ROT);
      shield.position.copy(cue.surfing ? SHIELD_SURF_POS : SHIELD_BLOCK_POS).sub(armL.position).applyQuaternion(inv);
    }
    if (cue.broken > 0) shield.rotation.set(0.5, SHIELD_REST_YAW - 0.3, 0.3);
  }
}

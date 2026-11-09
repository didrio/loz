import * as THREE from 'three';
import { angleDiff, clamp, damp, easeOut, mix, mulberry32 } from '../../core/math';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, extrudePath, gradient, kitMesh, lathe, lowSphere, merge, paint, paintRegion, place, taper, wobble, type Vec3 } from '../kit';
import { fadeInFog, uniqueSurf } from '../materials';
import { pal } from '../palette';
import { faceted, type SurfaceId } from '../textures';
import type { Model } from './types';

/**
 * The Hollow Lamplighter, Keeper of a Stolen Flame (golden set 6; story and fight: game/bosses/lamplighter.ts): a gaunt
 * thing in a tattered lamplighter's coat, absurdly long arms ending in big clawed hands, a pole with a hook and a snuffer
 * bell, and an iron lantern cage for a head around a cracked porcelain mask and the stolen flame. Built with the modeling
 * kit and baked per joint (`bakeRig`); its own baked materials, so the hit flash touches only it.
 *
 * Geometry and animation are kept apart (docs/pipeline.md "The rig convention"): `buildLamplighter` makes the joints,
 * a `LamplighterPose` is a flat set of numbers, and `LamplighterRig` turns the boss's state into a pose each frame.
 */

/** Leg bone lengths (m): the rig's two-bone IK needs them too. */
export const THIGH = 0.95, SHIN = 1.0;
/** Where the hips sit in the model as built (the pose moves them). */
const HIPS_Y = 1.75;

export interface LamplighterArm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
  /** Three long fingers and a thumb (last). */
  fingers: THREE.Group[];
}

/** The joints the behaviour hangs hurtboxes on, moves or hides: by name. */
export type LamplighterJoints = {
  hips: THREE.Group; torso: THREE.Group; neck: THREE.Group; head: THREE.Group; cage: THREE.Group;
  pole: THREE.Group; poleTip: THREE.Object3D; mask: THREE.Object3D;
};

/** The Hollow Lamplighter: its joints, the parts the behaviour reaches for (the howl's strips and lanterns) and its rig. */
export interface LamplighterModel extends Model<LamplighterJoints> {
  armR: LamplighterArm;
  armL: LamplighterArm;
  legs: { thigh: THREE.Group; knee: THREE.Group; foot: THREE.Group }[];
  /** The coat's ragged strips (`a`: angle round the body, `ph`: sway phase, `front`: hangs at the front; the howl hides those). */
  strips: { g: THREE.Group; a: number; ph: number; front: boolean }[];
  /** The caged wisps on its belt (each frees a Gloomwisp in the howl, from where its `glow` is). */
  lanterns: { g: THREE.Group; glow: THREE.Mesh; ph: number }[];
  rig: LamplighterRig;
}

/** A soft additive glow, low-poly (detail 0: 20 faces; 1: 80), fading in fog like the game's other glows. */
function halo(color: number, radius: number, opacity: number, detail = 0) {
  return new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, detail),
    fadeInFog(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
}

/** A flame cone centred on its middle (the rig scales it about there). */
function flameCone(radius: number, height: number) {
  return place(taper(radius, 0, height, 6), 0, -height / 2, 0);
}

/**
 * Builds the Hollow Lamplighter. Every joint the behaviour or rig touches sits where the rough model had it, so the
 * hurtboxes, the hook's tip and the head ride exactly the same points.
 */
export function buildLamplighter(seed = 7): LamplighterModel {
  const coat = pal('stone', 0), coatDark = pal('ink', 3), worn = pal('stone', 1), patchA = pal('bark', 1), patchB = pal('moss', 1);
  const bone = pal('chalk', 0), porcelain = pal('chalk', 1), claw = pal('ink', 1);
  const iron = pal('slate', 0), ironLight = pal('slate', 1), soot = pal('ink', 2);
  const wood = pal('bark', 0), wax = pal('plaster', 2), strapCol = pal('bark', 1), wick = pal('straw', 2);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  const torso = new THREE.Group();
  const neck = new THREE.Group();
  const head = new THREE.Group();
  const cage = new THREE.Group();
  const mask = new THREE.Group();
  const pole = new THREE.Group();
  const poleTip = new THREE.Object3D();
  const legs: LamplighterModel['legs'] = [];
  const strips: LamplighterModel['strips'] = [];
  const lanterns: LamplighterModel['lanterns'] = [];
  /** Every group the rig moves on its own: each is baked separately, so it keeps moving after the bake. */
  const moving: Record<string, THREE.Group> = {};
  /** A finished piece: shaded over its height, darkened underneath, tiled as `surface`. */
  const put = (parent: THREE.Object3D, g: THREE.BufferGeometry, surface: SurfaceId, low = 0.86, high = 1.05) =>
    parent.add(kitMesh(crevice(gradient(g, low, high), { foot: 1 }), surface));

  root.add(hips);
  hips.position.y = HIPS_Y;
  hips.add(torso);

  // Legs: long and digitigrade, ragged trousers to the knee, bone below, ending in heavy clawed feet.
  for (const side of [1, -1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.3, 0, 0);
    put(thigh, paintRegion(paint(place(taper(0.085, 0.12, THIGH, 5), 0, -THIGH, 0), coat), (c) => (c.y < -THIGH + 0.2 ? worn : undefined)), 'cloth');
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    put(knee, merge(paint(lowSphere(0.1, 5, 3), bone), paint(place(taper(0.05, 0.068, SHIN, 5), 0, -SHIN, 0), bone)), 'plaster', 0.8, 1.04);
    const foot = new THREE.Group();
    foot.position.y = -SHIN;
    const sole = paint(place(taper(0.12, 0.045, 0.52, 4, 0.55), 0, 0.03, -0.06, [Math.PI / 2, 0, 0]), bone);
    const heel = paint(place(taper(0.045, 0, 0.17, 4), 0, 0.05, -0.04, [-Math.PI / 2 - 0.5, 0, 0]), bone);
    const claws = [-1, 0, 1].map((t) => paint(place(taper(0.04, 0, 0.22, 4), t * 0.07, 0.01, 0.42, [Math.PI / 2 + 0.3, t * 0.2, 0]), claw));
    foot.add(kitMesh(crevice(gradient(merge(sole, heel, ...claws), 0.82, 1.04)), 'plaster'));
    knee.add(foot);
    thigh.add(knee);
    hips.add(thigh);
    legs.push({ thigh, knee, foot });
    moving[`thigh${side}`] = thigh;
    moving[`knee${side}`] = knee;
    moving[`foot${side}`] = foot;
  }

  // Spine and ribcage, glimpsed through the gap in the coat (and laid bare in phase two): four pairs of ribs from the spine
  // round to the front, drooping toward the breastbone.
  const ribProfile: [number, number][] = [[0.028, 0], [-0.014, 0.024], [-0.014, -0.024]];
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 0.55 + i * 0.26, r = 0.29 - Math.abs(i - 1.5) * 0.03;
    for (const s of [1, -1]) {
      const at = (phi: number): Vec3 => [s * r * Math.sin(phi), y - 0.08 * (1 - phi / Math.PI), -0.12 + r * Math.cos(phi)];
      ribs.push(paint(extrudePath(ribProfile, [at(Math.PI - 0.3), at(Math.PI * 0.5), at(0.2)], (t) => 1 - t * 0.4), bone));
    }
  }
  const spine = paint(place(taper(0.065, 0.05, 1.5, 5), 0, 0.1, -0.12), bone);
  // Two candle stubs burning on its left shoulder (the only warm light on it), wax pooled between them and running off.
  const candles: THREE.BufferGeometry[] = [];
  const candleFlames: THREE.Mesh[] = [];
  for (const [x, h, z] of [[0.38, 0.22, -0.12], [0.5, 0.14, 0.04]]) {
    candles.push(paint(wobble(place(taper(0.042, 0.036, h, 5), x, 1.62, z), 0.006, x * 10), wax));
    const f = new THREE.Mesh(flameCone(0.028, 0.1), new THREE.MeshBasicMaterial({ color: pal('flame', 2) }));
    f.position.set(x, 1.62 + h + 0.05, z);
    torso.add(f);
    candleFlames.push(f);
  }
  const puddle = place(lowSphere(0.1, 5, 2), 0.44, 1.61, -0.04);
  puddle.scale(1, 0.35, 1);
  candles.push(paint(puddle, wax));
  for (const [x, z, len] of [[0.53, 0.06, 0.16], [0.33, -0.1, 0.11]]) candles.push(paint(place(taper(0.024, 0, len, 4), x, 1.6, z, [Math.PI, 0, 0]), wax));
  put(torso, merge(spine, ...ribs, ...candles), 'plaster', 0.84, 1.06);
  // A dull heart of cold light behind the ribs.
  const core = halo(pal('spirit', 3), 0.22, 0.25);
  core.position.set(0, 1.0, -0.05);
  torso.add(core);

  // The collar: a high, open ring of coat round the neck, worn pale at its lip (inside faces too: no double-sided material).
  const collar = lathe([[0.34, 1.445], [0.52, 1.995], [0.47, 1.995], [0.3, 1.46]], 6, false);
  // The lamplighter's kit: a strap across the chest to a wick tin at the hip, a coil of wick beside it.
  const coatAt = (a: number, y: number, out: number): Vec3 => {
    const r = 0.42 + (1.55 - y) * 0.25 + out;
    return [Math.sin(a) * r, y, Math.cos(a) * r];
  };
  const strap = paint(extrudePath([[-0.009, -0.036], [0.009, -0.036], [0.009, 0.036], [-0.009, 0.036]], [coatAt(-0.8, 1.5, 0.03), coatAt(-0.25, 1.22, 0.05), coatAt(0.25, 0.96, 0.06), coatAt(0.6, 0.76, 0.06)]), strapCol);
  const coil = place(lathe([[0.05, 0], [0.085, 0], [0.085, 0.035], [0.05, 0.035], [0.05, 0]], 4, false), ...coatAt(0.95, 0.74, 0.08), [Math.PI / 2, 0.95, 0]);
  put(torso, merge(paintRegion(paint(collar, coatDark), (c) => (c.y > 1.9 ? worn : undefined)), paint(coil, wick)), 'cloth');
  put(torso, strap, 'leather');
  const tinAt = coatAt(0.62, 0.56, 0.07);
  put(torso, merge(paint(place(bevelBox(0.15, 0.19, 0.08, 0), ...tinAt, [0, 0.62, 0]), ironLight), paint(place(bevelBox(0.165, 0.04, 0.09, 0), tinAt[0], tinAt[1] + 0.105, tinAt[2], [0, 0.62, 0]), iron)), 'metal');

  // The coat: frayed strips hanging from the shoulders, open at the front; worn pale at the hem, a few patched.
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wrapped = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    if (wrapped < 0.3) continue; // the gap
    const front = wrapped < 0.95;
    const len = 2.0 + ((i * 7) % 5) * 0.14 + (front ? -0.25 : 0);
    const w = 0.38 + ((i * 3) % 4) * 0.05;
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * 0.42, 1.55, Math.cos(a) * 0.42);
    g.rotation.order = 'YXZ';
    // A thin panel with a crease down its middle that bulges outward, folding a little as it falls.
    const profile: [number, number][] = [[0, -w / 2], [0.012, 0], [0, w / 2], [-0.026, 0]];
    let strip = paint(wobble(extrudePath(profile, [[0, 0, 0], [0, -len * 0.36, 0.03], [0, -len * 0.7, -0.02], [0, -len, 0.04]], (t) => 1 - t * 0.5), 0.012, i + 1), i % 2 ? coat : coatDark);
    const patch = i % 3 === 1 ? (i % 2 ? patchA : patchB) : undefined;
    strip = paintRegion(strip, (c, nrm) => (c.y < -len * 0.72 ? worn : patch && nrm.z > 0 && c.y < -len * 0.36 && c.y > -len * 0.7 ? patch : undefined));
    const pieces = [strip];
    if (i % 4 === 0) pieces.push(paint(place(bevelBox(0.11, 0.36, 0.03, 0), (i % 8 ? 1 : -1) * 0.06, -len - 0.14, 0.035), worn));
    put(g, merge(...pieces), 'cloth', 0.8, 1.08);
    torso.add(g);
    strips.push({ g, a, ph: i * 2.3, front });
    moving[`strip${i}`] = g;
  }

  // The belt of caged lights: each little lantern holds a captured wisp (three: each frees a Gloomwisp in the howl).
  for (const [a, len] of [[0.75, 0.38], [-0.7, 0.3], [2.7, 0.42]] as const) {
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * 0.82, 0.55, Math.cos(a) * 0.82);
    const cy = -len - 0.12;
    const bars = [0, 1, 2].map((k) => {
      const ka = (k / 3) * Math.PI * 2 + a;
      return paint(place(bevelBox(0.018, 0.24, 0.018, 0), Math.cos(ka) * 0.088, cy, Math.sin(ka) * 0.088), iron);
    });
    const chain = paint(place(taper(0.014, 0.014, len, 3), 0, -len, 0), iron);
    const base = paint(place(taper(0.1, 0.1, 0.035, 4), 0, cy - 0.135, 0), iron);
    const roof = paint(place(taper(0.125, 0, 0.11, 4), 0, cy + 0.08, 0), ironLight);
    const arm = paint(place(bevelBox(0.03, 0.03, 0.26, 0), -Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12, [0, a, 0]), iron);
    put(g, merge(arm, chain, base, roof, ...bars), 'metal');
    const wisp = halo(pal('violet', 3), 0.09, 0.9);
    const wispHalo = halo(pal('violet', 3), 0.2, 0.25);
    wisp.position.y = wispHalo.position.y = cy;
    g.add(wisp, wispHalo);
    torso.add(g);
    lanterns.push({ g, glow: wisp, ph: a * 3 });
    moving[`lantern${lanterns.length}`] = g;
  }

  // Arms: absurdly long, frayed sleeves to the elbow, bone forearms, big hands of three long clawed fingers and a thumb.
  const arm = (side: number): LamplighterArm => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.5, 1.55, 0);
    shoulder.rotation.order = 'YXZ';
    const sleeve = paint(place(taper(0.07, 0.09, 1.15, 5), 0, -1.15, 0), coat);
    const cuff = paint(wobble(place(taper(0.1, 0.075, 0.16, 5), 0, -1.15, 0), 0.01, side + 3), worn);
    put(shoulder, merge(paint(lowSphere(0.15, 5, 3), coatDark), sleeve, cuff), 'cloth');
    const elbow = new THREE.Group();
    elbow.position.y = -1.15;
    put(elbow, paint(place(taper(0.048, 0.062, 1.2, 5), 0, -1.2, 0), bone), 'plaster', 0.84, 1.04);
    const hand = new THREE.Group();
    hand.position.y = -1.2;
    put(hand, paint(place(bevelBox(0.21, 0.24, 0.09, 0.025), 0, -0.12, 0), bone), 'plaster', 0.8, 1.04);
    const fingers: THREE.Group[] = [];
    const fingerProfile: [number, number][] = [[0.034, 0], [-0.017, 0.03], [-0.017, -0.03]];
    for (let k = 0; k < 4; k++) {
      const thumb = k === 3;
      const fg = new THREE.Group();
      fg.position.set(thumb ? side * -0.11 : -0.07 + k * 0.07, thumb ? -0.08 : -0.23, thumb ? 0.035 : 0);
      if (thumb) fg.rotation.z = side * 0.6;
      const L = thumb ? 0.28 : [0.44, 0.5, 0.42][k];
      const finger = extrudePath(fingerProfile, [[0, 0, 0], [0, -L * 0.55, 0.02], [0, -L, 0.09]], (t) => 1 - t * 0.85);
      put(fg, paintRegion(paint(finger, bone), (c) => (c.y < -L * 0.6 ? claw : undefined)), 'plaster', 0.86, 1.02);
      hand.add(fg);
      fingers.push(fg);
      moving[`finger${side}${k}`] = fg;
    }
    elbow.add(hand);
    shoulder.add(elbow);
    torso.add(shoulder);
    moving[`shoulder${side}`] = shoulder;
    moving[`elbow${side}`] = elbow;
    moving[`hand${side}`] = hand;
    return { shoulder, elbow, hand, fingers };
  };
  const armR = arm(-1);
  const armL = arm(1);

  // The lamplighter's pole: a tall shaft, an iron collar, a heavy hook and the snuffer bell.
  put(pole, paint(wobble(place(taper(0.058, 0.046, 4.2, 6), 0, -1.2, 0), 0.006, 5), wood), 'wood', 0.82, 1.06);
  const hookPath: Vec3[] = [];
  for (let k = 0; k <= 6; k++) {
    const u = (k / 6) * Math.PI * 1.25;
    const x = 0.29 * Math.cos(u), y = 0.29 * Math.sin(u);
    hookPath.push([0.22 + x * Math.cos(-0.3) - y * Math.sin(-0.3), 3.05 + x * Math.sin(-0.3) + y * Math.cos(-0.3), 0]);
  }
  const hook = paint(extrudePath([[0.05, 0], [0, 0.05], [-0.05, 0], [0, -0.05]], hookPath, (t) => 0.45 + 0.55 * t), iron);
  const bellShape = lathe([[0, 0.27], [0.15, 0.015], [0.2, 0], [0.07, 0.33], [0, 0.37]], 6, false);
  bellShape.translate(0, -0.18, 0);
  const bell = paintRegion(paint(place(bellShape, -0.08, 2.88, 0, [0, 0, 0.4]), iron), (_c, nrm) => (nrm.y < -0.3 ? soot : undefined));
  const ferrule = paint(place(taper(0.08, 0.075, 0.12, 6), 0, 2.69, 0), ironLight);
  put(pole, merge(hook, bell, ferrule), 'metal');
  const hookGlow = halo(pal('spirit', 3), 0.45, 0, 1);
  hookGlow.position.set(0.15, 3.0, 0);
  pole.add(hookGlow);
  poleTip.position.set(0, 3.0, 0);
  pole.add(poleTip);
  armR.hand.add(pole);
  pole.position.y = -0.12;

  // Neck and the lantern-cage head: a heavy base plate, six bars, a sooty roof with wax run down from its eave, a carry ring.
  neck.position.set(0, 1.62, 0.05);
  put(neck, paint(taper(0.08, 0.06, 0.62, 5), bone), 'plaster');
  head.position.y = 0.62;
  neck.add(head);
  torso.add(neck);
  head.add(cage);
  const plate = paint(place(taper(0.33, 0.42, 0.1, 6), 0, -0.05, 0), iron);
  const cageBars = [0, 1, 2, 3, 4, 5].map((k) => {
    const ka = (k / 6) * Math.PI * 2 + Math.PI / 6;
    return paint(place(bevelBox(0.055, 0.66, 0.055, 0), Math.sin(ka) * 0.36, 0.36, Math.cos(ka) * 0.36, [0, ka, 0]), iron);
  });
  const roof = paintRegion(paint(lathe([[0.45, 0.66], [0.41, 0.71], [0.06, 0.98], [0, 1.0]], 6), iron), (c, nrm) => (nrm.y < -0.5 || c.y > 0.86 ? soot : c.y < 0.7 ? ironLight : undefined));
  const ringPath: Vec3[] = [0, 1, 2, 3, 4].map((k) => [0.12 * Math.cos((k / 4) * Math.PI), 0.99 + 0.12 * Math.sin((k / 4) * Math.PI), 0]);
  const ring = paint(extrudePath([[0.026, 0], [-0.013, 0.022], [-0.013, -0.022]], ringPath), ironLight);
  put(cage, merge(plate, ...cageBars, roof, ring), 'metal', 0.8, 1.06);
  const drips = [[0.9, 0.12], [2.3, 0.09], [-2.5, 0.14]].map(([ka, len]) => paint(place(taper(0.022, 0, len, 4), Math.sin(ka) * 0.42, 0.67, Math.cos(ka) * 0.42, [Math.PI, 0, 0]), wax));
  put(cage, merge(...drips), 'plaster');

  // The mask: blank, cracked porcelain, a dark tear streak under one eye; the hollow eyes hold a faint cold light.
  mask.position.set(0, 0.32, 0.13);
  head.add(mask);
  const face = lowSphere(0.22, 7, 5);
  face.scale(1, 1.3, 0.55);
  const tear = paint(place(bevelBox(0.016, 0.17, 0.02, 0), -0.074, -0.17, 0.11, [0, 0, 0.06]), claw);
  const crack = paint(place(bevelBox(0.011, 0.2, 0.02, 0), 0.045, 0.03, 0.105, [0, 0, 0.45]), claw);
  put(mask, merge(paint(face, porcelain), tear, crack), 'plaster', 0.88, 1.04);
  const eyeMat = uniqueSurf('plaster', pal('ink', 1), { emissive: 0x000000 });
  const eyeBall = lowSphere(0.05, 5, 3);
  eyeBall.scale(0.85, 1.25, 0.6);
  mask.add(new THREE.Mesh(faceted(merge(place(eyeBall, -0.075, 0.05, 0.1), place(eyeBall, 0.075, 0.06, 0.1))), eyeMat));

  // The stolen flame inside the cage, and the light it throws.
  const flameMat = new THREE.MeshBasicMaterial({ color: pal('spirit', 3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameOuter = new THREE.Mesh(flameCone(0.13, 0.48), flameMat);
  flameOuter.position.set(0, 0.42, -0.06);
  const flameInner = new THREE.Mesh(flameCone(0.06, 0.28), new THREE.MeshBasicMaterial({ color: pal('chalk', 3) }));
  flameInner.position.set(0, 0.36, -0.06);
  const flameGlow = halo(pal('spirit', 3), 0.3, 0.16, 1);
  flameGlow.position.set(0, 0.4, -0.05);
  const light = new THREE.PointLight(pal('spirit', 3), 8, 18, 1.5);
  light.position.set(0, 0.45, 0.2);
  head.add(flameOuter, flameInner, flameGlow, light);

  const joints: LamplighterJoints = { hips, torso, neck, head, cage, pole, poleTip, mask };
  const baked = bakeRig({ root, joints: { ...joints, ...moving } as LamplighterJoints, flashMats: [], animated: [eyeMat] });
  const parts = { hips, torso, neck, head, pole, armR, armL, legs, strips, lanterns, flameOuter, flameInner, flameGlow, light, hookGlow, flameMat, eyeMat, candleFlames };
  return { root, joints, flashMats: baked.flashMats, animated: [eyeMat], armR, armL, legs, strips, lanterns, rig: new LamplighterRig(parts, seed) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------------------------------------------------

/**
 * How the Lamplighter looks at one moment: a flat set of numbers the rig blends toward (docs/pipeline.md "The rig
 * convention"). Joint angles in radians, `hipsY` in metres, `flame`/`eyes`/`flare`/`hook` as amounts.
 */
export interface LamplighterPose {
  hipsY: number; lean: number; twist: number; roll: number;
  headPitch: number; headYaw: number; headRoll: number;
  rx: number; ry: number; rz: number; relbow: number;
  lx: number; ly: number; lz: number; lelbow: number;
  poleX: number; flame: number; eyes: number; flare: number; hook: number; stride: number;
}

/** Standing at the ready: stooped, the pole held out in front. Every frame starts from here. */
export const REST: LamplighterPose = {
  hipsY: HIPS_Y, lean: 0.28, twist: 0, roll: 0,
  headPitch: -0.2, headYaw: 0, headRoll: 0,
  rx: -0.25, ry: 0, rz: -0.12, relbow: -1.25,
  lx: 0.1, ly: 0, lz: 0.2, lelbow: -0.35,
  poleX: Math.PI / 2, flame: 1, eyes: 0, flare: 0, hook: 0, stride: 0,
};

const POSE_KEYS = Object.keys(REST) as (keyof LamplighterPose)[];

export function blendPose(cur: LamplighterPose, target: LamplighterPose, k: number) {
  for (const key of POSE_KEYS) cur[key] += (target[key] - cur[key]) * k;
}

/** The boss's states and move steps (game/boss.ts), which the rig reads but never changes. */
export type LamplighterState = 'dormant' | 'intro' | 'fight' | 'dying';
export type LamplighterStep = 'windup' | 'active' | 'recover';

/** The move running this frame, as its `update` saw it (before the step could advance). */
export interface LamplighterMoveCue {
  name: string;
  step: LamplighterStep;
  /** Progress through the step, 0 to 1. */
  t: number;
  /** Seconds into the step. */
  stepT: number;
}

/** What the behaviour (game/bosses/lamplighter.ts) tells the rig each frame. */
export interface LamplighterCue {
  /** The state and its time as the frame began, before the boss's clock ticked: the state poses read these. */
  posing: { state: LamplighterState; t: number };
  /** The state and its time now (the dying flame's warmth). */
  state: LamplighterState;
  stateT: number;
  move: LamplighterMoveCue | null;
  /** The intro's head turn toward Wren (rad). */
  turn: number;
  /** Ground speed (m/s): the stride, the coat's flare. */
  speed: number;
  /** Facing (rad): the coat swings when it turns. */
  yaw: number;
  /** 0..1 while it rises at dusk or gutters out at dawn. */
  presence: number;
  shattered: boolean;
  poleDropped: boolean;
  /** Where its feet are (the dropped pole comes to rest just above). */
  floorY: number;
}

type PoseBit = [Partial<LamplighterPose>, number | undefined];
const PI = Math.PI;

/** Each move's look per step (`t` 0..1 through it, `stepT` seconds in), with how fast the pose chases it. */
const MOVES: Record<string, (step: LamplighterStep, t: number, stepT: number, rnd: () => number) => PoseBit> = {
  // Hook Sweep: drawn far back (glowing hook), then a wide swing in front.
  sweep: (step, t) =>
    step === 'windup' ? [{ twist: -0.75 * t, rx: -1.25, ry: -1.9, rz: -0.2, relbow: -0.25, poleX: PI, hook: t, lean: 0.15, lx: -0.4, lz: 0.6 }, 8]
    : step === 'active' ? [{ twist: 0.75, rx: -1.35, ry: 1.7, rz: -0.2, relbow: -0.1, poleX: PI, hook: 1, flare: 0.45, lean: 0.25, lx: -0.2, lz: 0.9 }, 28]
    : [{ twist: 0.5 * (1 - t), rx: mix(-1.2, -0.25, t), ry: mix(1.5, 0, t), relbow: mix(-0.1, -1.25, t), poleX: mix(PI, PI / 2, t), hook: 0 }, 5],
  // Backhand: phase two's quick return swing.
  backhand: (step, t) =>
    step === 'windup' ? [{ twist: 0.8, rx: -1.3, ry: 1.9, relbow: -0.2, poleX: PI, hook: t }, 12]
    : step === 'active' ? [{ twist: -0.8, rx: -1.35, ry: -1.7, relbow: -0.1, poleX: PI, hook: 1, flare: 0.45 }, 28]
    : [{ rx: mix(-1.2, -0.25, t), ry: mix(-1.5, 0, t), relbow: mix(-0.1, -1.25, t), poleX: mix(PI, PI / 2, t), hook: 0 }, 5],
  // Snuffer Slam: up to full height with the pole overhead, down, then stuck: tugging, head low and exposed.
  slam: (step, t) => {
    if (step === 'windup') return [{ hipsY: mix(1.75, 1.95, t), lean: -0.3, rx: -3.0, ry: 0, rz: -0.25, relbow: -0.15, lx: -2.7, lz: 0.35, lelbow: -0.3, poleX: PI, hook: t, headPitch: -0.35, flame: 1.4 }, 7];
    if (step === 'active') return [{ hipsY: 1.3, lean: 0.95, rx: -0.55, rz: -0.15, relbow: -0.05, lx: -0.6, lz: 0.2, lelbow: -0.1, poleX: PI, hook: 1, headPitch: 0.1, flare: 0.3 }, 40];
    if (t > 0.8) return [{ hook: 0 }, 5];
    const tug = Math.max(0, Math.sin(t * 22)) * 0.12;
    return [{ hipsY: 1.25, lean: 1.12 - tug, rx: -0.5, rz: -0.15, relbow: -0.05, lx: -0.55, lz: 0.2, lelbow: -0.1, poleX: PI, hook: 0.2, headPitch: 0.35, headRoll: Math.sin(t * 9) * 0.15, flame: 0.7 }, 12];
  },
  // Cold Flame Volley: rears back, the flame swells.
  volley: (step, t) =>
    step === 'windup' ? [{ headPitch: -0.5, lean: -0.1, flame: 1 + t * 1.2, lx: -1.3, lz: 0.5, lelbow: -0.6 }, 7]
    : step === 'active' ? [{ headPitch: 0.25, lean: 0.35, flame: 2.2, lx: -1.5, lz: 0.3, lelbow: -0.2 }, 18]
    : [{ flame: 1 }, 5],
  // Spin: a crouch, then a full whirl of the pole.
  spin: (step, t) =>
    step === 'windup' ? [{ hipsY: 1.45, lean: 0.4, rx: -1.3, ry: -1.2, relbow: -0.3, poleX: PI, hook: t, twist: -0.5 }, 12]
    : step === 'active' ? [{ hipsY: 1.5, lean: 0.3, rx: -1.4, ry: 0.9, relbow: -0.1, poleX: PI, hook: 1, flare: 0.6 }, 25]
    : [{ rx: mix(-1.2, -0.25, t), ry: 0, relbow: mix(-0.1, -1.25, t), poleX: mix(PI, PI / 2, t), hook: 0 }, 6],
  // Skitter: down on all fours, eyes burning red, a galloping scuttle; panting low afterward.
  skitter: (step, t, stepT) => {
    const crawl = { hipsY: 1.05, lean: 1.38, headPitch: -1.15, rx: -1.25, rz: -0.25, relbow: -0.15, lx: -1.25, lz: 0.25, lelbow: -0.15, poleX: 0.15, eyes: 1 };
    if (step === 'windup') return [{ ...crawl, eyes: t }, 9];
    if (step === 'active') {
      const gallop = Math.sin(stepT * 18);
      return [{ ...crawl, rx: -1.25 + gallop * 0.5, lx: -1.25 - gallop * 0.5, stride: gallop * 0.6, flare: 0.5 }, 20];
    }
    const heave = Math.sin(stepT * 8) * 0.06;
    return t < 0.75 ? [{ ...crawl, lean: 1.38 + heave, eyes: 1 - t }, 10] : [{ eyes: 0 }, 4];
  },
  // Howl: clutches its head, then throws its arms wide as the coat tears.
  howl: (step, t, _stepT, rnd) =>
    step === 'windup' ? [{ rx: -2.7, rz: 0.4, relbow: -1.9, lx: -2.7, lz: -0.4, lelbow: -1.9, poleX: 0.3, lean: 0.5, headPitch: 0.4, headRoll: Math.sin(t * 40) * 0.2, flame: 0.5 + rnd() }, 10]
    : step === 'active' ? [{ rx: -0.7, rz: -1.2, relbow: -0.2, lx: -0.7, lz: 1.2, lelbow: -0.2, poleX: PI, lean: -0.3, hipsY: 1.95, headPitch: -0.75, flame: 2.4, eyes: 1, flare: 0.7 }, 14]
    : [{ flame: 1.2 }, 5],
};

/** The rig's handles on the model. */
interface LamplighterParts {
  hips: THREE.Group; torso: THREE.Group; neck: THREE.Group; head: THREE.Group; pole: THREE.Group;
  armR: LamplighterArm; armL: LamplighterArm;
  legs: LamplighterModel['legs']; strips: LamplighterModel['strips']; lanterns: LamplighterModel['lanterns'];
  flameOuter: THREE.Mesh; flameInner: THREE.Mesh; flameGlow: THREE.Mesh; light: THREE.PointLight; hookGlow: THREE.Mesh;
  flameMat: THREE.MeshBasicMaterial; eyeMat: THREE.MeshLambertMaterial; candleFlames: THREE.Mesh[];
}

const FLAME_COLD = new THREE.Color(pal('spirit', 3));
const FLAME_WARM = new THREE.Color(pal('flame', 2));
/** The eye-holes' faint cold light at rest (they flash red over it). */
const EYE_COLD = new THREE.Color(pal('spirit', 2)).multiplyScalar(0.7);

/**
 * Turns the boss's state into a pose and puts it on the joints. The body (hips, torso, neck, head, arms, pole) follows
 * the rough's motion exactly: its hurtboxes, the slam's low head and the pole's parry ride those joints (owner's call,
 * 2026-11-08, T54; `game/bosses/lamplighter.trace.test.ts` checks it frame by frame). Polish lives only on the parts no
 * hurtbox rides: the coat swings on a spring when it turns, the fingers grip, splay and clutch, the candles flicker and
 * the eye-holes hold a faint cold light.
 */
export class LamplighterRig {
  readonly pose: LamplighterPose = { ...REST };
  private walkPhase = 0;
  private breath = 0;
  private twitchT = 2;
  private twitch = 0;
  private readonly rnd: () => number;
  // The coat's springs: a sideways swing from turning, and the flare with a little overshoot.
  private swing = 0;
  private swingV = 0;
  private flare = 0;
  private flareV = 0;
  private lastYaw: number | null = null;
  private curlR = 0.9;
  private curlL = 0.35;

  constructor(private readonly p: LamplighterParts, seed = 7) {
    this.rnd = mulberry32(seed);
    p.hips.position.y = REST.hipsY;
  }

  /** Where this frame wants the pose, and how fast to chase it (the last layer's rate; 6 if none sets one). */
  target(cue: LamplighterCue): [LamplighterPose, number] {
    const target = { ...REST };
    let rate = 6;
    const layer = ([bit, r]: PoseBit) => {
      Object.assign(target, bit);
      if (r !== undefined) rate = r;
    };
    const { state, t } = cue.posing;
    if (state === 'dormant') {
      // Hunched like a dead scarecrow, back to the road, head hung; every so often it twitches.
      layer([{ lean: 0.6, hipsY: 1.7, headPitch: 0.75, headRoll: this.twitch, rx: 0.05, relbow: -1.1, lx: 0.12, lz: 0.08, lelbow: -0.1, flame: 0.3, poleX: PI / 2 + 0.25 }, undefined]);
    }
    if (state === 'intro') layer(introPose(t, cue.turn));
    if (state === 'dying') layer(dyingPose(t));
    if (cue.move) {
      const look = MOVES[cue.move.name];
      if (look) layer(look(cue.move.step, cue.move.t, cue.move.stepT, this.rnd));
    }
    return [target, rate];
  }

  /** One frame: chase the target, then pose every joint. */
  update(dt: number, cue: LamplighterCue) {
    const p = this.p;
    if (cue.posing.state === 'dormant') {
      this.twitchT -= dt;
      if (this.twitchT <= 0) {
        this.twitchT = 2 + this.rnd() * 4;
        this.twitch = (this.rnd() < 0.5 ? -1 : 1) * (0.35 + this.rnd() * 0.3);
      }
      this.twitch *= Math.exp(-dt * 3);
    }
    const [target, rate] = this.target(cue);
    const c = this.pose;
    blendPose(c, target, damp(rate, dt));

    // Walking: long, slow strides, with a slight bob.
    const speed = cue.speed;
    this.walkPhase += dt * speed * 1.6;
    const swing = Math.sin(this.walkPhase) * Math.min(1, speed / 3) * 0.45 + c.stride;
    this.breath += dt;

    p.hips.position.y = c.hipsY + Math.abs(Math.sin(this.walkPhase)) * 0.06 * Math.min(1, speed / 3) + Math.sin(this.breath * 1.3) * 0.02;
    p.torso.rotation.set(c.lean + Math.sin(this.breath * 1.3) * 0.02, c.twist, c.roll);
    p.neck.rotation.set(c.headPitch * 0.5, c.headYaw * 0.4, c.headRoll * 0.5);
    p.head.rotation.set(c.headPitch * 0.5, c.headYaw * 0.6, c.headRoll * 0.5);

    // Legs: two-bone IK keeps the feet on the ground at any hip height.
    const h = clamp(c.hipsY, 0.6, THIGH + SHIN - 0.02);
    const kneeIn = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - h * h) / (2 * THIGH * SHIN), -1, 1));
    const thighA = Math.acos(clamp((THIGH * THIGH + h * h - SHIN * SHIN) / (2 * THIGH * h), -1, 1));
    const bend = Math.PI - kneeIn;
    p.legs.forEach((leg, i) => {
      const s = (i === 0 ? 1 : -1) * swing;
      leg.thigh.rotation.x = -thighA + s - c.lean * 0.3;
      leg.knee.rotation.x = bend;
      leg.foot.rotation.x = thighA - bend - s + c.lean * 0.3;
    });

    const armSwing = Math.sin(this.walkPhase) * Math.min(1, speed / 3) * 0.2;
    p.armR.shoulder.rotation.set(c.rx, c.ry, c.rz);
    p.armR.elbow.rotation.x = c.relbow;
    p.armL.shoulder.rotation.set(c.lx - armSwing, c.ly, c.lz);
    p.armL.elbow.rotation.x = c.lelbow;
    if (!cue.poleDropped) p.pole.rotation.set(c.poleX, 0, 0);
    else if (cue.posing.state === 'dying') {
      // The dropped pole tips over and lies in the dust.
      const k = clamp((cue.posing.t - 0.9) / 0.8, 0, 1);
      p.pole.rotation.z = mix(p.pole.rotation.z, Math.PI / 2 - 0.1, k * 0.2);
      p.pole.position.y = mix(p.pole.position.y, cue.floorY + 0.1, k * 0.2);
    }

    this.fingers(dt, cue);
    this.coat(dt, cue, c.flare + Math.min(0.4, speed * 0.05));
    for (const l of p.lanterns) {
      l.g.rotation.set(Math.sin(this.breath * 2.5 + l.ph) * 0.25, 0, Math.cos(this.breath * 2 + l.ph) * 0.2);
      (l.glow.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.breath * 6 + l.ph) * 0.3;
    }

    // The stolen flame: flickers, swells with effort, warms as it dies.
    const flick = 0.85 + Math.sin(this.breath * 17) * 0.08 + Math.sin(this.breath * 29) * 0.07;
    const f = Math.max(0, c.flame) * flick;
    p.flameOuter.scale.set(0.8 + Math.min(f, 1.6) * 0.25, Math.max(0.01, Math.min(f, 1.8)), 0.8 + Math.min(f, 1.6) * 0.25);
    p.flameInner.scale.setScalar(Math.max(0.01, Math.min(f, 1.5) * 0.9));
    p.flameGlow.scale.setScalar(0.8 + Math.min(f, 1.6) * 0.25);
    const warmth = cue.state === 'dying' ? clamp((cue.stateT - 2.1) / 1.4, 0, 1) : 0;
    const color = FLAME_COLD.clone().lerp(FLAME_WARM, warmth);
    p.flameMat.color.copy(color);
    (p.flameGlow.material as THREE.MeshBasicMaterial).color.copy(color);
    p.light.color.copy(color);
    p.light.intensity = (cue.shattered ? 0 : 7) * f * cue.presence;
    // The eye-holes: a faint cold light from the flame behind the mask, burning red for the skitter's tell.
    const red = clamp(c.eyes, 0, 1);
    const cold = cue.shattered ? 0 : Math.min(1, f) * cue.presence * (1 - red);
    p.eyeMat.emissive.setRGB(EYE_COLD.r * cold + c.eyes, EYE_COLD.g * cold + 0.05 * c.eyes, EYE_COLD.b * cold + 0.02 * c.eyes);
    (p.hookGlow.material as THREE.MeshBasicMaterial).opacity = c.hook * 0.6;
    // The two candles on its shoulder gutter on their own.
    p.candleFlames.forEach((m, i) => m.scale.set(1, 0.8 + Math.sin(this.breath * (11 + i * 4) + i) * 0.15 + Math.sin(this.breath * 23 + i * 2) * 0.08, 1));
  }

  /** The hands: the right grips the pole (lets go once it's dropped), the left hangs loose, opens to cast, clutches in the howl. */
  private fingers(dt: number, cue: LamplighterCue) {
    const m = cue.move, { state, t } = cue.posing;
    let r = cue.poleDropped ? 0.25 : 0.9;
    let l = 0.35 + Math.sin(this.breath * 2.1) * 0.15;
    if (m?.name === 'volley' && m.step !== 'recover') l = -0.15; // the palm opens toward Wren
    if (m?.name === 'howl' && m.step === 'windup') l = r = 1.25; // clutching its head
    if (m?.name === 'howl' && m.step === 'active') l = -0.2; // flung wide
    if (m?.name === 'skitter' && m.step !== 'recover') l = 0.6; // claws on the ground
    if (state === 'intro' && t >= 2.4 && t < 3.3) l = -0.2; // the shriek
    if (state === 'dying' && t < 0.9) l = -0.25;
    const k = damp(14, dt);
    this.curlR += (r - this.curlR) * k;
    this.curlL += (l - this.curlL) * k;
    this.p.armR.fingers.forEach((f, i) => (f.rotation.x = -this.curlR - (i % 2) * 0.1));
    this.p.armL.fingers.forEach((f, i) => (f.rotation.x = -this.curlL - (i % 2) * 0.1));
  }

  /** The coat's strips: breathing sway, flared out by speed and effort, swinging behind when it turns. Springs, so they overshoot and settle. */
  private coat(dt: number, cue: LamplighterCue, flare: number) {
    const turnRate = this.lastYaw === null || dt <= 0 ? 0 : angleDiff(this.lastYaw, cue.yaw) / dt;
    this.lastYaw = cue.yaw;
    const want = clamp(-turnRate * 0.06, -0.35, 0.35);
    this.swingV += ((want - this.swing) * 60 - this.swingV * 9) * dt;
    this.swing += this.swingV * dt;
    this.flareV += ((flare - this.flare) * 90 - this.flareV * 11) * dt;
    this.flare += this.flareV * dt;
    for (const s of this.p.strips) {
      s.g.rotation.set(-0.24 - this.flare - Math.sin(this.breath * 2 + s.ph) * 0.05, s.a, Math.sin(this.breath * 1.3 + s.ph) * 0.04 + this.swing);
    }
  }
}

function introPose(t: number, turn: number): PoseBit {
  if (t < 1.3) {
    // The head turns all the way around first; the body doesn't move.
    const k = easeOut(t / 1.3);
    return [{ lean: 0.6, hipsY: 1.7, headPitch: mix(0.75, -0.1, k), headYaw: turn * k, flame: mix(0.3, 0.7, k), rx: 0.05, relbow: -1.1, lx: 0.12, lz: 0.08, lelbow: -0.1 }, 20];
  }
  if (t < 2.4) {
    // Then the body turns to match and unfolds to its full height.
    const k = easeOut((t - 1.3) / 1.1);
    return [{ headYaw: turn * (1 - k), lean: mix(0.6, -0.15, k), hipsY: mix(1.7, 1.92, k), lz: mix(0.08, 0.9, k), rz: mix(-0.12, -0.6, k), flame: 0.9 }, 10];
  }
  // A shriek: head thrown back, flame flaring, eyes burning.
  if (t < 3.3) return [{ lean: -0.25, hipsY: 1.92, headPitch: -0.65, headRoll: Math.sin(t * 40) * 0.08, lz: 1.1, lx: -0.5, rz: -0.7, flame: 2.2, eyes: 1, flare: 0.5 }, 14];
  return [{ flame: 1.2 }, 4];
}

function dyingPose(t: number): PoseBit {
  const shake = Math.sin(t * 50) * 0.06;
  if (t < 0.9) return [{ lean: -0.45, headPitch: -0.5, headRoll: shake * 4, lz: 1.2, rz: -1.0, lx: -1.2, flame: 1.6 + Math.sin(t * 30), eyes: 1 }, 12];
  if (t < 2.1) return [{ hipsY: 0.85, lean: 0.55, headPitch: 0.3, rx: 0.2, relbow: -0.3, lx: 0.25, lelbow: -0.2, lz: 0.3, flame: 1.2 }, 5];
  // The cage rattles; the cold flame warms.
  if (t < 3.5) return [{ hipsY: 0.85, lean: 0.4, headPitch: -0.4, headRoll: shake * 3, headYaw: shake * 2, flame: 1.5 + (t - 2.1) * 1.2 }, 20];
  // The body crumbles into ash.
  const k = clamp((t - 3.6) / 2.2, 0, 1);
  return [{ hipsY: 0.8, lean: 0.9, flame: Math.max(0, 1 - k * 3) }, 3];
}

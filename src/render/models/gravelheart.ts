import * as THREE from 'three';
import { clamp, damp, mulberry32 } from '../../core/math';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, extrudePath, gradient, kitMesh, lowSphere, merge, paint, paintRegion, place, wobble, type Vec3 } from '../kit';
import { fadeInFog, uniqueSurf } from '../materials';
import { pal } from '../palette';
import { halo } from '../shapes';
import { faceted, type SurfaceId } from '../textures';
import type { Model } from './types';

/**
 * Gravelheart, Who Came Home (golden set 7; story and fight: game/bosses/gravelheart/): about 5.5 m of stacked grey
 * wakestones. A blocky torso on two stubby stone legs, moss on its tops from the long sleep; arms that are chains of
 * floating stones held together by teal spirit-light, pebbles circling the gaps; a pale carved mask with a heavy brow,
 * deep-set eyes, cheek slabs and a jaw that drops when it howls; the stolen ember glowing through cracks in its chest
 * behind three pale plates; a keystone in its back. The shrine's spiral is carved on its shoulders, fists and keystone,
 * lit faintly by the spirit-light. Built with the modeling kit and baked per joint (`bakeRig`).
 *
 * Geometry and animation are kept apart (docs/pipeline.md "The rig convention"): `buildGravelheart` makes the joints,
 * a `Pose` is a flat set of numbers, and `GravelheartRig` turns the boss's state into a pose each frame.
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
  /** 0 = the ember sits in the chest, 1 = it has risen into the head (phase two). */
  emberUp: number;
  /** Legs folded up (0–1) regardless of the hips' height: the curled-up boulder of Cairn Roll. */
  tuck: number;
}

export const STAND: Pose = {
  hipsY: 1.7, lean: 0.08, twist: 0, headPitch: 0.05, lids: 0.45, eyes: 0.6, red: 0,
  rArm: 0.15, rOut: 0.18, rBend: 0.25, lArm: 0.15, lOut: 0.18, lBend: 0.25, ember: 1, float: 1, emberUp: 0, tuck: 0,
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

/** The hips' height standing (the legs fold as they drop below it). */
const LEG_STAND = 1.7;

export interface GravelheartArm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  fist: THREE.Group;
  /** The two floating stones (upper arm, forearm): the rig bobs them. */
  stones: THREE.Group[];
  /** The pebble rings round the gaps (under the shoulder, under the elbow). */
  pebbles: THREE.Group[];
  side: number;
}

/** The joints the behaviour hangs hurtboxes on or aims the glove at: by name. */
export type GravelheartJoints = { hips: THREE.Group; torso: THREE.Group; head: THREE.Group; ember: THREE.Group; keystone: THREE.Group };

/** The rig's handles on the model. */
interface GravelheartParts {
  hips: THREE.Group; torso: THREE.Group; head: THREE.Group; ember: THREE.Group; keystone: THREE.Group;
  plates: THREE.Group[];
  /** Inside each plate and the keystone (last): what shakes while it is loose, so the joint itself stays put. */
  rattles: THREE.Group[];
  armR: GravelheartArm; armL: GravelheartArm;
  legs: { thigh: THREE.Group; shin: THREE.Group }[];
  lids: THREE.Group[];
  jaw: THREE.Group;
  light: THREE.PointLight;
  emberGlow: THREE.Mesh;
  spiritMat: THREE.MeshBasicMaterial;
  glyphMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshLambertMaterial;
  emberMat: THREE.MeshLambertMaterial;
  keyMat: THREE.MeshLambertMaterial;
  plateMats: THREE.MeshLambertMaterial[];
  flashMats: THREE.MeshLambertMaterial[];
}

/** A box centred at (x, y, z) like three's `BoxGeometry` (`bevelBox` is centred), chamfered by `bevel`, turned by `rot`. */
function blk(w: number, h: number, d: number, x: number, y: number, z: number, bevel = 0.07, rot: Vec3 = [0, 0, 0]) {
  return place(bevelBox(w, h, d, bevel), x, y, z, rot);
}

/** The shrine's spiral, carved as a ridge in the xy plane facing +z (about `r` across). */
function spiral(r: number) {
  const path: Vec3[] = [];
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 3.2;
    const rr = r * (0.22 + 0.78 * (k / n));
    path.push([rr * Math.cos(a), rr * Math.sin(a), 0]);
  }
  return extrudePath([[0.022, 0], [-0.012, 0.03], [-0.012, -0.03]], path);
}

/** A hash of a point, 0..1: which faces get lichen. */
function speck(c: THREE.Vector3) {
  const s = Math.sin(c.x * 12.9898 + c.y * 4.1414 + c.z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Builds Gravelheart. Every joint the behaviour hangs a hurtbox on, aims the glove at or poses sits where the rough
 * model had it, with the same rotation order, so the fight's points ride exactly the same places.
 */
export function buildGravelheart(seed = 7): Model<GravelheartJoints> & { rig: GravelheartRig } {
  const stone = pal('stone', 2), stoneDark = pal('stone', 1), stoneDeep = pal('stone', 0), pale = pal('chalk', 1), paleLight = pal('chalk', 2);
  const seam = pal('ink', 1), hollow = pal('ink', 0), moss = pal('moss', 2), mossLight = pal('leaf', 2), lichen = pal('olive', 3);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const ember = new THREE.Group();
  const keystone = new THREE.Group();
  const jaw = new THREE.Group();
  const plates: THREE.Group[] = [];
  const rattles: THREE.Group[] = [];
  const legs: GravelheartParts['legs'] = [];
  const lids: THREE.Group[] = [];
  /** Every group the rig moves on its own: each is baked separately, so it keeps moving after the bake. */
  const moving: Record<string, THREE.Group> = {};

  const light = new THREE.PointLight(pal('ember', 2), 6, 16, 1.5);
  const keyMat = uniqueSurf('stone', pale, { emissive: 0x000000, vertexColors: true });
  const eyeMat = uniqueSurf('stone', pal('ink', 0), { emissive: 0x000000 });
  const emberMat = uniqueSurf('rock', pal('ember', 0), { emissive: 0x000000 });
  const plateMats: THREE.MeshLambertMaterial[] = [];
  const spiritMat = fadeInFog(new THREE.MeshBasicMaterial({ color: pal('spirit', 3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glyphMat = fadeInFog(new THREE.MeshBasicMaterial({ color: pal('spirit', 3), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));

  /** Moss on the faces that look up (it slept a long time), lichen specks here and there. */
  const mossy = (g: THREE.BufferGeometry, above = -Infinity) =>
    paintRegion(g, (c, n) => (n.y > 0.65 && c.y > above ? (speck(c) < 0.25 ? lichen : speck(c.clone().multiplyScalar(3)) < 0.5 ? moss : mossLight) : undefined));
  /** A finished piece: shaded over its height, darkened underneath (and toward its foot, if it stands), tiled. */
  const put = (parent: THREE.Object3D, g: THREE.BufferGeometry, surface: SurfaceId, stands = false, low = 0.84, high = 1.05) =>
    parent.add(kitMesh(crevice(gradient(g, low, high), stands ? {} : { foot: 1 }), surface));
  const glyph = (parent: THREE.Object3D, r: number, x: number, y: number, z: number, yaw: number) => {
    const m = new THREE.Mesh(place(spiral(r), x, y, z, [0, yaw, 0]), glyphMat);
    parent.add(m);
  };

  root.add(hips);
  hips.position.y = LEG_STAND;
  put(hips, wobble(paint(blk(2.0, 0.8, 1.4, 0, 0, 0, 0.1), stoneDark), 0.03, 11), 'rock');

  // Legs: two stones each, stubby and wide; the lower one a broad, flat-soled foot.
  for (const side of [1, -1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.65, -0.2, 0);
    put(thigh, wobble(paint(blk(0.85, 0.75, 0.9, 0, -0.35, 0, 0.08, [0, side * 0.08, 0]), stone), 0.03, 12 + side), 'rock');
    const shin = new THREE.Group();
    shin.position.y = -0.75;
    const ankle = paint(blk(0.88, 0.48, 0.98, 0, -0.24, 0.03, 0.07), stoneDark);
    const foot = paintRegion(paint(blk(1.02, 0.3, 1.16, 0, -0.6, 0.07, 0.06), stoneDeep), (c) => (c.z > 0.55 ? stoneDark : undefined));
    put(shin, wobble(merge(ankle, foot), 0.025, 14 + side), 'rock', true);
    thigh.add(shin);
    hips.add(thigh);
    legs.push({ thigh, shin });
    moving[`thigh${side}`] = thigh;
    moving[`shin${side}`] = shin;
  }

  // The torso: two great stacked blocks under a heavy lintel, its front cracked open round the ember.
  hips.add(torso);
  torso.position.y = 0.4;
  const lower = paint(blk(2.5, 1.0, 1.52, 0, 0.6, 0, 0.1), stoneDark);
  const upper = mossy(paint(blk(2.6, 1.02, 1.6, 0.03, 1.6, 0, 0.12, [0, 0.03, 0]), stone));
  const lintel = mossy(paint(blk(2.75, 0.27, 1.7, 0, 2.15, 0, 0.07, [0, 0, -0.02]), stoneDeep));
  const back = paint(blk(1.5, 0.12, 0.08, 0, 1.08, -0.79, 0), seam); // the seam where the blocks meet, behind
  put(torso, merge(wobble(merge(lower, upper), 0.035, 21), wobble(lintel, 0.025, 22), back, paint(blk(1.3, 1.3, 0.3, 0, 1.15, 0.68, 0), hollow)), 'rock');
  // Glowing cracks that run out from the ember across the chest.
  const cracks = ([[-0.9, 1.75, 0.9, 0.5], [0.95, 0.55, 0.8, 0.4], [-1.0, 0.5, 0.6, -0.7], [0.85, 1.85, 0.7, -0.5]] as const).map(([x, y, len, rot]) =>
    paint(blk(len, 0.07, 0.04, x, y, 0.81, 0, [0, 0, rot]), 0xffffff));
  torso.add(new THREE.Mesh(faceted(merge(...cracks)), emberMat));
  ember.position.set(0, 1.15, 0.6);
  torso.add(ember);
  ember.add(new THREE.Mesh(faceted(paint(new THREE.IcosahedronGeometry(0.36, 0), 0xffffff)), emberMat));
  const emberGlow = halo(pal('ember', 2), 0.8, 0.4);
  ember.add(emberGlow);
  ember.add(light);
  light.position.z = 0.6;
  // Three pale plates bound over the ember, each with a dark band; slightly chipped at the foot.
  for (let i = 0; i < 3; i++) {
    const plate = new THREE.Group();
    plate.position.set((i - 1) * 0.5, 1.15, 0.86);
    const rattle = new THREE.Group();
    plate.add(rattle);
    const m = uniqueSurf('stone', paleLight, { emissive: 0x000000, vertexColors: true });
    plateMats.push(m);
    const slab = paintRegion(paint(blk(0.5, 1.45, 0.22, 0, 0, 0, 0.04, [0, 0, (i - 1) * 0.05]), pal('chalk', 3)), (c) => (c.y < -0.6 ? pal('chalk', 1) : undefined));
    const band = paint(blk(0.53, 0.1, 0.25, 0, 0.6, 0, 0), pal('stone', 2));
    // Its own material (the glove's loose glow recolours it), the vertices carrying the paint and shade.
    rattle.add(new THREE.Mesh(faceted(crevice(gradient(wobble(merge(slab, band), 0.012, 30 + i), 0.85, 1.04), { foot: 1 })), m));
    torso.add(plate);
    plates.push(plate);
    rattles.push(rattle);
  }
  // The keystone in its back: carved with the shrine's spiral.
  keystone.position.set(0, 1.3, -0.85);
  torso.add(keystone);
  const keyRattle = new THREE.Group();
  keystone.add(keyRattle);
  keyRattle.add(new THREE.Mesh(faceted(crevice(gradient(paint(blk(0.9, 0.9, 0.3, 0, 0, 0, 0.06), pal('chalk', 3)), 0.86, 1.04), { foot: 1 })), keyMat));
  glyph(keyRattle, 0.3, 0, 0, -0.17, Math.PI);
  rattles.push(keyRattle);

  // Shoulders and arms: floating stones, the gaps lit by spirit-light, pebbles circling them.
  const rnd = mulberry32(seed);
  const arm = (side: number): GravelheartArm => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 1.7, 1.75, 0);
    put(shoulder, mossy(wobble(paint(blk(1.0, 1.0, 1.1, side * 0.1, 0.05, 0, 0.1, [0, 0, side * 0.04]), stoneDeep), 0.035, 40 + side)), 'rock');
    glyph(shoulder, 0.26, side * 0.62, 0.1, 0, side * Math.PI / 2);
    const s1 = new THREE.Group();
    s1.position.y = -0.85;
    put(s1, wobble(paint(blk(0.8, 0.8, 0.8, 0, 0, 0, 0.08, [0.1, 0.4, -0.06]), stone), 0.04, 42 + side), 'rock');
    shoulder.add(s1);
    const elbow = new THREE.Group();
    elbow.position.y = -1.45;
    shoulder.add(elbow);
    const s2 = new THREE.Group();
    s2.position.y = -0.35;
    put(s2, wobble(paint(blk(0.75, 0.75, 0.75, 0, 0, 0, 0.08, [-0.08, -0.35, 0.1]), pale), 0.035, 44 + side), 'stone');
    elbow.add(s2);
    const fist = new THREE.Group();
    fist.position.y = -1.05;
    elbow.add(fist);
    const knuckles = [-0.45, -0.15, 0.15, 0.45].map((x, k) => paint(blk(0.28, 0.3, 0.4, x, -0.75, 0.47 + (k % 2) * 0.03, 0), k % 2 ? stoneDark : stoneDeep));
    const thumb = paint(blk(0.3, 0.42, 0.46, -side * 0.66, -0.38, 0.28, 0.05, [0, 0, side * 0.15]), stoneDark);
    put(fist, merge(wobble(paint(blk(1.2, 1.05, 1.25, 0, -0.45, 0.05, 0.1), stone), 0.035, 46 + side), ...knuckles, thumb), 'rock'); // no moss: they pound the floor
    glyph(fist, 0.22, side * 0.62, -0.42, 0.05, side * Math.PI / 2);
    // Spirit-light in the gaps: one wisp under the shoulder, two round the forearm stone.
    const wisp = (y: number) => place(new THREE.IcosahedronGeometry(0.16, 0), 0, y, 0);
    shoulder.add(new THREE.Mesh(wisp(-0.42), spiritMat));
    elbow.add(new THREE.Mesh(merge(wisp(0.12), wisp(-0.78)), spiritMat));
    // Pebbles: a ring of three small stones round the gap under the shoulder and the one above the fist.
    const pebbles: THREE.Group[] = [];
    for (const [parent, y] of [[shoulder, -0.42], [elbow, -0.78]] as const) {
      const ring = new THREE.Group();
      ring.position.y = y;
      const ph = rnd() * Math.PI * 2;
      const bits = [0, 1, 2].map((k) => {
        const a = ph + (k / 3) * Math.PI * 2;
        const r = 0.09 + rnd() * 0.04;
        return paint(wobble(place(lowSphere(r, 5, 3), Math.cos(a) * 0.58, (rnd() - 0.5) * 0.18, Math.sin(a) * 0.58), 0.02, 50 + k), k === 1 ? pale : stoneDark);
      });
      put(ring, merge(...bits), 'rock');
      parent.add(ring);
      pebbles.push(ring);
      moving[`pebbles${side}${pebbles.length}`] = ring;
    }
    torso.add(shoulder);
    Object.assign(moving, { [`shoulder${side}`]: shoulder, [`s1${side}`]: s1, [`elbow${side}`]: elbow, [`s2${side}`]: s2, [`fist${side}`]: fist });
    return { shoulder, elbow, fist, stones: [s1, s2], pebbles, side };
  };
  const armR = arm(-1); // its right is on your left as it faces you (+z)
  const armL = arm(1);

  // The head: a pale carved mask, a heavy mossy brow with the spiral, deep-set eyes between brow and cheek slabs, a
  // blunt nose, and a jaw slab hinged at the back that drops when it howls.
  head.position.set(0, 2.25, 0.1);
  torso.add(head);
  const skull = mossy(paint(blk(1.4, 1.3, 1.1, 0, 0.65, 0, 0.1), pale), 1.1);
  const brow = mossy(paint(blk(1.5, 0.26, 0.5, 0, 1.0, 0.38, 0.06, [0.08, 0, 0]), stoneDark));
  const cheeks = [1, -1].map((s) => paint(blk(0.42, 0.3, 0.16, s * 0.4, 0.44, 0.6, 0.04, [0, -s * 0.12, 0]), paleLight));
  const nose = paint(blk(0.34, 0.46, 0.22, 0, 0.42, 0.62, 0.05), stoneDark);
  const mouth = paint(blk(0.8, 0.2, 0.06, 0, 0.17, 0.56, 0), hollow);
  put(head, merge(wobble(skull, 0.02, 60), brow, ...cheeks, nose, mouth), 'stone');
  glyph(head, 0.2, 0, 1.0, 0.66, 0);
  head.add(new THREE.Mesh(faceted(merge(...[1, -1].map((s) => paint(blk(0.36, 0.12, 0.06, s * 0.33, 0.68, 0.56, 0), 0xffffff)))), eyeMat));
  for (const side of [1, -1]) {
    const lid = new THREE.Group();
    lid.position.set(side * 0.33, 0.85, 0.58);
    put(lid, paint(blk(0.44, 0.3, 0.14, 0, 0, 0, 0.03), pale), 'stone', false, 0.9, 1.04);
    head.add(lid);
    lids.push(lid);
    moving[`lid${side}`] = lid;
  }
  jaw.position.set(0, 0.32, 0.05);
  put(jaw, paintRegion(paint(blk(0.95, 0.3, 0.62, 0, -0.17, 0.27, 0.05), stoneDark), (c, n) => (n.y > 0.5 ? hollow : undefined)), 'stone');
  head.add(jaw);
  moving.jaw = jaw;

  const joints: GravelheartJoints = { hips, torso, head, ember, keystone };
  plates.forEach((p, i) => (moving[`plate${i}`] = p));
  rattles.forEach((r, i) => (moving[`rattle${i}`] = r));
  const animated = [eyeMat, emberMat, keyMat, ...plateMats];
  const baked = bakeRig({ root, joints: { ...joints, ...moving } as GravelheartJoints, flashMats: [keyMat, ...plateMats], animated });
  // The body's baked materials first: the exposed pulse is read off the first (the keystone's and plates' glow writes theirs).
  const flashMats = [...baked.flashMats.filter((m) => !animated.includes(m)), keyMat, ...plateMats];
  const parts: GravelheartParts = { hips, torso, head, ember, keystone, plates, rattles, armR, armL, legs, lids, jaw, light, emberGlow, spiritMat, glyphMat, eyeMat, emberMat, keyMat, plateMats, flashMats };
  return { root, joints, flashMats, animated, rig: new GravelheartRig(parts, seed) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------------------------------------------------

/** The boss's states and move steps (game/boss.ts), which the rig reads but never changes. */
export type GravelheartState = 'dormant' | 'intro' | 'fight' | 'dying';
export type GravelheartStep = 'windup' | 'active' | 'recover';

/** The move running this frame, as its `update` saw it (before the step could advance). */
export interface GravelheartMoveCue {
  name: string;
  step: GravelheartStep;
  /** Progress through the step, 0 to 1. */
  t: number;
  /** Seconds into the step. */
  stepT: number;
}

/** What the behaviour (game/bosses/gravelheart/) tells the rig each frame. */
export interface GravelheartCue {
  /** The state, its time and the phase as the frame began, before the boss's clock ticked: the poses read these. */
  posing: { state: GravelheartState; t: number; phase: number };
  move: GravelheartMoveCue | null;
  /** Walking (the step sway). */
  moving: boolean;
  /** Cairn Roll's roll angle about the hips (set directly, no blending). */
  spin: number;
  /** Seconds the keystone stays loose (it glows and rattles). */
  keyT: number;
  /** Which chest plates are on; the loose one (or -1) and how long it stays loose. */
  plates: readonly boolean[];
  loose: number;
  looseT: number;
}

type PoseBit = [Partial<Pose>, number | undefined];

/** Each move's look per step (`t` 0..1 through it), with how fast the pose chases it. */
const MOVES: Record<string, (step: GravelheartStep, t: number) => PoseBit> = {
  // Hammerfall: fists rise overhead, the eyes go red (the guard-crushing tell); down; stuck, then it wrenches free.
  hammerfall: (step, t) => {
    if (step === 'windup') return [{ rArm: 2.9, lArm: 2.9, rOut: 0.2, lOut: 0.2, rBend: 0.5, lBend: 0.5, lean: -0.15, headPitch: -0.2, lids: 0, eyes: 1, red: Math.min(1, t * 3), hipsY: 1.8 }, 7];
    if (step === 'active') return [{ rArm: 0.9, lArm: 0.9, rOut: 0.12, lOut: 0.12, rBend: 0.1, lBend: 0.1, lean: 0.75, headPitch: 0.1, lids: 0.2, eyes: 1, red: 1, hipsY: 1.15 }, 30];
    const free = t > 0.8 ? (t - 0.8) / 0.2 : 0;
    return [{ rArm: 0.95 - free * 0.6, lArm: 0.95 - free * 0.6, rOut: 0.12, lOut: 0.12, rBend: 0.05, lBend: 0.05, lean: 0.8 - free * 0.5, headPitch: 0.15, lids: 0.35, eyes: 0.7, red: 0, hipsY: 1.05 + free * 0.4 }, 10];
  },
  // Sweep: one arm rears back and swings low across the front.
  sweep: (step) =>
    step === 'windup' ? [{ twist: -1.0, rArm: 1.45, rOut: 1.5, rBend: 0.1, lArm: 0.3, hipsY: 1.55, eyes: 1, lids: 0.1 }, 6]
    : step === 'active' ? [{ twist: 1.15, rArm: 1.45, rOut: 1.45, rBend: 0.05, lArm: 0.3, hipsY: 1.55, eyes: 1, lids: 0.2 }, 30]
    : [{ twist: 1.1, rArm: 1.3, rOut: 1.2, hipsY: 1.6, lids: 0.4 }, 5],
  // Double sweep: the same swing, then back again with both arms out.
  doubleSweep: (step, t) =>
    step === 'windup' ? [{ twist: -1.0, rArm: 1.45, rOut: 1.5, rBend: 0.1, lArm: 0.3, hipsY: 1.55, eyes: 1, lids: 0.1 }, 6]
    : step === 'active' ? [{ twist: t < 0.7 ? 1.15 : -1.15, rArm: 1.45, rOut: 1.45, rBend: 0.05, lArm: 1.45, lOut: 1.45, lBend: 0.05, hipsY: 1.55, eyes: 1, lids: 0.2 }, 22]
    : [{ twist: -1.1, rArm: 1.3, rOut: 1.2, hipsY: 1.6, lids: 0.4 }, 5],
  // Swipe: a quick, high backhand across its front.
  swipe: (step) =>
    step === 'windup' ? [{ twist: 1.0, lArm: 1.3, lOut: 1.6, lBend: 0.2, rArm: 0.3, hipsY: 1.6, eyes: 1, lids: 0.1 }, 8]
    : step === 'active' ? [{ twist: -1.2, lArm: 1.3, lOut: 0.3, lBend: 0.1, rArm: 0.3, hipsY: 1.6, eyes: 1, lids: 0.2 }, 34]
    : [{ twist: -1.0, lArm: 1.2, lOut: 0.5, hipsY: 1.65, lids: 0.4 }, 5],
  // Stone volley: arms up to call the stones, then throwing, one hand after the other.
  volley: (step, t) =>
    step === 'windup' ? [{ rArm: 2.5, lArm: 2.5, rOut: 0.9, lOut: 0.9, rBend: 0.3, lBend: 0.3, headPitch: -0.3, eyes: 1, lids: 0, lean: -0.1, hipsY: 1.75 }, 5]
    : step === 'active' ? [{ rArm: 1.6 + Math.sin(t * 9) * 0.5, lArm: 1.6 - Math.sin(t * 9) * 0.5, rOut: 0.4, lOut: 0.4, headPitch: 0.05, eyes: 1, lids: 0.1 }, 12]
    : [{ rArm: 0.6, lArm: 0.6, lids: 0.4 }, 5],
  // Grind: it turns on its waist and grinds the floor behind it.
  grind: (step) =>
    step === 'windup' ? [{ twist: 2.4, lean: 0.25, hipsY: 1.45, rArm: 0.8, lArm: 0.8, rOut: 0.7, lOut: 0.7, eyes: 1, lids: 0.1 }, 5]
    : step === 'active' ? [{ twist: -2.4, lean: 0.25, hipsY: 1.4, rArm: 0.8, lArm: 0.8, rOut: 0.7, lOut: 0.7, eyes: 1 }, 24]
    : [{ twist: -2.0, hipsY: 1.6, lids: 0.45 }, 4],
  // Staggered: reels, drops to one knee with the ember bare, then rises.
  staggered: (step) =>
    step === 'windup' ? [{ lean: -0.35, hipsY: 1.2, rArm: 0.2, lArm: 0.2, eyes: 1, lids: 0.1, red: 0, ember: 2 }, 12]
    : step === 'active' ? [{ lean: 0.1, hipsY: 0.95, headPitch: 0.45, rArm: 0.4, lArm: 0.4, rOut: 0.5, lOut: 0.5, eyes: 0.2, lids: 0.75, ember: 2 }, 6]
    : [{ lean: 0.1, hipsY: 1.4, headPitch: 0.1, eyes: 0.8, lids: 0.35, ember: 1.2 }, 4],
  // Cairn Roll: rocks back (the tell), curls into a boulder (arms folded, head tucked, legs up), then dazed.
  cairnRoll: (step, t) =>
    step === 'windup' ? [{ lean: -0.45 - Math.sin(t * 16) * 0.05, hipsY: 1.5, tuck: t, rArm: 0.9, lArm: 0.9, rBend: 1.0, lBend: 1.0, headPitch: 0.4, eyes: 1, lids: 0.1, red: t }, 7]
    : step === 'active' ? [{ lean: 1.45, hipsY: 2.1, tuck: 1, rArm: 1.7, lArm: 1.7, rOut: 0.05, lOut: 0.05, rBend: 2.2, lBend: 2.2, headPitch: 1.1, eyes: 0.6, lids: 0.6, red: 1, float: 0.2 }, 14]
    : [{ lean: 0.9, hipsY: 1.1, tuck: 0.7, headPitch: 0.6, rArm: 0.5, lArm: 0.5, lids: 0.9, eyes: 0.2, red: 0 }, 8],
  // Kneel: reels back with the keystone gone, then sinks onto its knees, fists on the floor, head bowed; then rises.
  kneel: (step) =>
    step === 'windup' ? [{ lean: -0.5, hipsY: 1.5, headPitch: -0.3, rArm: 0.4, lArm: 0.4, rOut: 0.9, lOut: 0.9, eyes: 1, lids: 0.1, ember: 2, float: 2 }, 5]
    : step === 'active' ? [{ lean: 1.15, hipsY: 0.8, headPitch: 0.3, rArm: 0.85, lArm: 0.85, rOut: 0.3, lOut: 0.3, rBend: 0.1, lBend: 0.1, eyes: 0.3, lids: 0.7, ember: 2.4, float: 0.4 }, 4]
    : [{ lean: 0.4, hipsY: 1.4, headPitch: 0.1, eyes: 0.8, lids: 0.35, ember: 1.4 }, 4],
  // Howl: rears back and howls, then smashes the floor.
  howl: (step) =>
    step === 'windup' ? [{ lean: -0.4, headPitch: -0.5, hipsY: 1.85, rArm: 1.2, lArm: 1.2, rOut: 1.0, lOut: 1.0, lids: 0, eyes: 1, red: 1, ember: 2 }, 4]
    : step === 'active' ? [{ lean: 0.85, headPitch: 0.1, hipsY: 1.1, rArm: 0.9, lArm: 0.9, rOut: 0.12, lOut: 0.12, eyes: 1, red: 1, ember: 2 }, 24]
    : [{ lean: 0.5, hipsY: 1.35, lids: 0.3, eyes: 0.8, red: 0 }, 5],
};

/** Asleep in a heap, it stirs: the ember brightens, the lids crack open, and it heaves itself up, block by block. */
function introPose(t: number): PoseBit {
  if (t < 1.2) return [{ ...SLEEP, ember: 0.35 + t * 0.8, float: 0.2 + t * 0.3 }, 3];
  if (t < 2.0) return [{ ...SLEEP, lids: 0.55, eyes: 0.5, ember: 1.4, headPitch: 0.2, float: 0.7 }, 4];
  if (t < 3.4) return [{ ...STAND, lean: 0.2, headPitch: -0.25, lids: 0.2, eyes: 1, ember: 1.6, rArm: 0.6, lArm: 0.6, rOut: 0.5, lOut: 0.5 }, 2.2];
  return [{ ...STAND, headPitch: -0.1, lids: 0.35, eyes: 0.9, ember: 1.2 }, 4];
}

/** It slows, sinks to its knees, and its eyes close: asleep at last. The ember dims. */
function dyingPose(t: number): PoseBit {
  const k = clamp(t / 3.5, 0, 1);
  return [{ ...SLEEP, lids: Math.min(1, 0.3 + k), eyes: 1 - k, ember: 1.8 - k * 1.4, float: 1 - k * 0.8 }, 1.2];
}

/** The steps that strike the floor: the pebbles jump and whirl. */
const IMPACTS = new Set(['hammerfall', 'howl', 'grind', 'staggered', 'kneel']);

/**
 * Turns the boss's state into a pose and puts it on the joints. The body (hips, legs, torso, head, arms and fists, the
 * ember, plates and keystone) follows the rough's motion exactly: its hurtboxes and the glove's aim ride those joints
 * (owner's call, 2026-11-08, T55; `game/bosses/gravelheart/gravelheart.trace.test.ts` checks it frame by frame). Polish
 * lives only on the parts no hurtbox rides: the lids slant on the red-eyed tell, the jaw drops in the howl and the heave
 * up, the arm stones tumble, pebbles circle the gaps (and jump when it strikes the floor), a loose plate or keystone
 * rattles inside its joint, and the carved spirals glow with the spirit-light.
 */
export class GravelheartRig {
  readonly hips: THREE.Group;
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  readonly ember: THREE.Group;
  readonly keystone: THREE.Group;
  /** The three chest plates, left to right as it faces you. */
  readonly plates: THREE.Group[];
  readonly armR: GravelheartArm;
  readonly armL: GravelheartArm;
  readonly light: THREE.PointLight;
  /** The rig-only parts (polish): the lids, the jaw, and what rattles inside each plate and the keystone (last). */
  readonly lids: THREE.Group[];
  readonly jaw: THREE.Group;
  readonly rattles: THREE.Group[];
  /** Every material that should flash on a hit (the body's first). */
  readonly flashMats: THREE.MeshLambertMaterial[];
  readonly pose: Pose = { ...SLEEP };
  /** The rig's clock (the arm stones' bob) and the behaviour's old breath and step clocks: they all start at 0. */
  private t = 0;
  private breath = 0;
  private stepPhase = 0;
  // Polish state: the jaw, the pebbles' whirl and jump.
  private jawOpen = 0;
  private whirl = 0;
  private kick = 0;
  private kickV = 0;
  private lastImpact = '';
  private readonly phases: number[];

  constructor(private readonly p: GravelheartParts, seed = 7) {
    this.hips = p.hips;
    this.torso = p.torso;
    this.head = p.head;
    this.ember = p.ember;
    this.keystone = p.keystone;
    this.plates = p.plates;
    this.armR = p.armR;
    this.armL = p.armL;
    this.light = p.light;
    this.lids = p.lids;
    this.jaw = p.jaw;
    this.rattles = p.rattles;
    this.flashMats = p.flashMats;
    const rnd = mulberry32(seed * 31 + 5);
    this.phases = [0, 1, 2, 3].map(() => rnd() * Math.PI * 2);
  }

  /** Back to the sleeping heap (the fight reset when Wren dies). */
  reset() {
    Object.assign(this.pose, SLEEP);
  }

  /** Where this frame wants the pose, and how fast to chase it. */
  target(cue: GravelheartCue): [Pose, number] {
    const { state, t, phase } = cue.posing;
    const target: Pose = state === 'dormant' ? { ...SLEEP } : { ...STAND, emberUp: phase >= 2 ? 1 : 0 };
    let rate = state === 'dormant' ? 2 : 6;
    const layer = ([bit, r]: PoseBit) => {
      Object.assign(target, bit);
      if (r !== undefined) rate = r;
    };
    if (state === 'intro') layer(introPose(t));
    if (state === 'dying') layer(dyingPose(t));
    if (cue.move) {
      const look = MOVES[cue.move.name];
      if (look) layer(look(cue.move.step, cue.move.t));
    }
    return [target, rate];
  }

  /** One frame: chase the target, then pose every joint. */
  update(dt: number, cue: GravelheartCue) {
    const [target, rate] = this.target(cue);
    const c = this.pose;
    blendPose(c, target, damp(rate, dt));
    // A slow, heavy breath; while stalking, a ponderous sway from foot to foot.
    this.breath += dt;
    this.stepPhase += cue.moving ? dt * 2.2 : 0;
    const sway = cue.moving ? Math.sin(this.stepPhase) * 0.05 : 0;
    const hipsY = c.hipsY + Math.sin(this.breath * 1.3) * 0.03 + (cue.moving ? Math.abs(Math.sin(this.stepPhase)) * 0.05 : 0);
    this.applyJoints(c, hipsY, cue.spin, dt);
    this.p.torso.rotation.z = sway;
    this.applyGlows(c);
    const pulse = 0.65 + Math.sin(this.breath * 14) * 0.35;
    const keyGlow = cue.keyT > 0 ? pulse : 0;
    this.p.keyMat.emissive.setRGB(0.2 * keyGlow, 0.75 * keyGlow, 0.65 * keyGlow);
    for (let i = 0; i < this.plates.length; i++) {
      this.plates[i].visible = cue.plates[i];
      const g = i === cue.loose && cue.looseT > 0 ? pulse : 0;
      this.p.plateMats[i].emissive.setRGB(0.2 * g, 0.75 * g, 0.65 * g);
      this.rattle(this.p.rattles[i], g, i);
    }
    this.rattle(this.p.rattles[3], keyGlow, 3);
    this.polish(dt, cue, c);
  }

  /** Puts the body in `c`, with the hips at `hipsY` and rolled by `spin`: exactly the rough's motion. */
  private applyJoints(c: Pose, hipsY: number, spin: number, dt: number) {
    const p = this.p;
    this.t += dt;
    p.hips.position.y = hipsY;
    // Legs fold as the hips drop (a kneel at ~0.8).
    const fold = Math.max(c.tuck, Math.min(1, (LEG_STAND - c.hipsY) / 0.95));
    p.hips.rotation.x = spin;
    p.ember.position.set(0, 1.15 + 1.75 * c.emberUp, 0.6 - 0.15 * c.emberUp);
    for (const l of p.legs) {
      l.thigh.rotation.x = -fold * 1.3;
      l.shin.rotation.x = fold * 1.9;
    }
    p.torso.rotation.set(c.lean, c.twist, 0);
    p.head.rotation.x = c.headPitch;
    for (const [a, raise, out, bend] of [[p.armR, c.rArm, c.rOut, c.rBend], [p.armL, c.lArm, c.lOut, c.lBend]] as const) {
      a.shoulder.rotation.set(-raise, 0, a.side * out);
      a.elbow.rotation.x = -bend;
      // The stones drift apart and bob a little: nothing but spirit holds them together.
      const bob = Math.sin(this.t * 2.2 + a.side) * 0.04 * c.float;
      a.stones[0].position.y = -0.85 - 0.08 * c.float + bob;
      a.stones[1].position.y = -0.35 - 0.08 * c.float - bob;
      a.elbow.position.y = -1.45 - 0.1 * c.float;
      a.fist.position.y = -1.05 - 0.12 * c.float + bob;
    }
    for (const lid of p.lids) lid.position.y = 0.95 - 0.27 * c.lids;
  }

  /** The eyes, the ember and its light, the spirit-light. */
  private applyGlows(c: Pose) {
    const p = this.p;
    p.spiritMat.opacity = 0.25 + 0.5 * c.float;
    const red = c.red, e = c.eyes;
    p.eyeMat.emissive.setRGB(e * (0.45 + red * 0.55), e * (0.9 - red * 0.8), e * (0.8 - red * 0.75));
    const flick = 1 + Math.sin(this.t * 9) * 0.06 + Math.sin(this.t * 23) * 0.04;
    p.emberMat.emissive.setRGB(1 * c.ember * flick * 0.6, 0.35 * c.ember * flick * 0.6, 0.05 * c.ember * 0.6);
    (p.emberGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.7, 0.3 * c.ember * flick);
    p.light.intensity = 5 * c.ember * flick;
  }

  /** A loose plate or the keystone shakes in its socket (`g` 0..1); its joint, which the glove aims at, stays put. */
  private rattle(r: THREE.Group, g: number, i: number) {
    r.rotation.z = g * Math.sin(this.breath * 37 + i * 2) * 0.05;
    r.position.set(g * Math.sin(this.breath * 29 + i) * 0.015, 0, g * Math.abs(Math.sin(this.breath * 23 + i * 3)) * 0.03);
  }

  /** The parts no hurtbox rides: lids, jaw, arm stones, pebbles, the carved spirals. */
  private polish(dt: number, cue: GravelheartCue, c: Pose) {
    const p = this.p;
    const m = cue.move, { state, t } = cue.posing;
    // The lids slant into a scowl as the eyes go red.
    p.lids.forEach((lid, i) => (lid.rotation.z = (i === 0 ? -1 : 1) * c.red * 0.3));
    // The jaw: wide in the howl, open in the long breath as it heaves itself up, a little slack while stunned.
    let jaw = 0;
    if (m?.name === 'howl') jaw = m.step === 'windup' ? 0.5 : m.step === 'active' ? 0.25 : 0.05;
    else if (state === 'intro' && t >= 2 && t < 3.4) jaw = 0.3;
    else if ((m?.name === 'staggered' || m?.name === 'kneel') && m.step === 'active') jaw = 0.15;
    this.jawOpen += (jaw - this.jawOpen) * damp(8, dt);
    p.jaw.rotation.x = this.jawOpen;
    // The arm stones tumble a little as they float.
    for (const a of [p.armR, p.armL]) {
      a.stones.forEach((s, i) => s.rotation.set(Math.sin(this.breath * 1.1 + i + a.side) * 0.06 * c.float, Math.sin(this.breath * 0.7 + i * 2) * 0.12 * c.float, 0));
    }
    // The pebbles circle the gaps, faster as the spirit-light swells; striking the floor makes them jump and whirl.
    const impact = m && m.step === 'active' && IMPACTS.has(m.name) ? m.name : '';
    if (impact && impact !== this.lastImpact) this.kickV += 3;
    this.lastImpact = impact;
    this.kickV += (-this.kick * 40 - this.kickV * 6) * dt;
    this.kick += this.kickV * dt;
    this.whirl += dt * (0.6 + 1.1 * c.float + Math.abs(this.kickV) * 2);
    [...p.armR.pebbles, ...p.armL.pebbles].forEach((ring, i) => {
      ring.rotation.y = this.whirl * (i % 2 ? -1 : 1) + this.phases[i];
      ring.rotation.x = Math.sin(this.breath * 0.9 + this.phases[i]) * 0.15;
      ring.position.y = (i % 2 ? -0.78 : -0.42) + Math.sin(this.breath * 1.7 + this.phases[i]) * 0.05 * c.float + this.kick * 0.25;
    });
    // The carved spirals glow with the spirit-light, faint asleep, brightest when it is roused.
    p.glyphMat.opacity = clamp(0.12 + 0.4 * Math.min(1, c.float) * (0.4 + 0.6 * c.eyes) + Math.sin(this.breath * 2) * 0.04, 0, 1);
  }
}

import * as THREE from 'three';
import { damp, mulberry32 } from '../../core/math';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, extrudePath, gradient, kitMesh, lowSphere, merge, paint, paintRegion, place, taper, wobble, type Vec3 } from '../kit';
import { pal } from '../palette';
import type { Model } from './types';

/**
 * The Thornling (golden set 1, final; docs/art.md "The golden set"): a hopping ball of plum hide with ten pale thorns
 * swept back over its back and sides, a ruff of small ones between them, and a bare face: two glowing eyes with slit pupils
 * under heavy brows, two fangs and a jaw that drops open. Built with the modeling kit and baked per joint (`bakeRig`).
 *
 * Geometry and animation are kept apart (docs/pipeline.md "The rig convention"): `buildThornling` makes the joints, a
 * `ThornlingPose` is a flat set of numbers, and `ThornlingRig` turns the behaviour's state (game/enemies.ts `Thornling`)
 * into a pose each frame. Behaviour keeps every timing and hurtbox; the rig only decides how a moment looks.
 */

export type ThornlingJoints = { body: THREE.Group; shell: THREE.Group; eyes: THREE.Group; brows: THREE.Group; jaw: THREE.Group };

/** Where the body's centre rests above the ground (its radius plus a little: the bottom thorns touch down). */
export const BODY_Y = 0.75;
const RADIUS = 0.65;

export function buildThornling(): Model<ThornlingJoints> & { rig: ThornlingRig } {
  const hide = pal('rose', 1), belly = pal('rose', 0), crown = pal('rose', 2);
  const thornBase = pal('straw', 1), thorn = pal('sand', 3), ruff = pal('sand', 2);
  const mouth = pal('ink', 1), tooth = pal('chalk', 1);

  const root = new THREE.Group();
  const body = new THREE.Group();
  const shell = new THREE.Group();
  const eyes = new THREE.Group();
  const brows = new THREE.Group();
  const jaw = new THREE.Group();
  body.position.y = BODY_Y;
  root.add(body);
  body.add(shell, eyes, brows, jaw);

  // The ball: eighty faces (round in outline, still faceted: owner, 2026-11-08), nudged a couple of centimetres so no two
  // edges run parallel; a dark belly and a lighter crown.
  const ball = paintRegion(paint(wobble(place(new THREE.IcosahedronGeometry(RADIUS, 1)), 0.02, 7), hide), (c) =>
    c.y < -0.3 ? belly : c.y > 0.32 ? crown : undefined,
  );
  // The mouth: a dark slit under the eyes with a throat behind it (the jaw hides the throat until it drops), two fangs.
  const slit = paint(place(bevelBox(0.4, 0.11, 0.16, 0.02), 0, -0.14, 0.57), mouth);
  const throat = paint(place(bevelBox(0.32, 0.16, 0.16, 0.02), 0, -0.24, 0.54), mouth);
  const fangs = [-1, 1].map((s) => paint(place(taper(0.045, 0, 0.13, 4), s * 0.11, -0.09, 0.63, [Math.PI, 0, 0]), tooth));
  body.add(kitMesh(gradient(crevice(merge(ball, slit, throat, ...fangs)), 0.84, 1.06), 'hide'));

  // The thorns: from the same ten directions as ever (none on the face), each a five-sided spike curving toward its back,
  // a darker collar at the root. Between them a ruff of short ones.
  const rnd = mulberry32(11);
  const big: THREE.BufferGeometry[] = [];
  const pentagon: [number, number][] = [];
  for (let i = 0; i < 5; i++) pentagon.push([Math.cos((i / 5) * Math.PI * 2) * 0.13, Math.sin((i / 5) * Math.PI * 2) * 0.13]);
  for (const v of thornDirections()) {
    const length = 0.5 * (0.9 + rnd() * 0.2);
    const back = new THREE.Vector3(0, 0, -1).projectOnPlane(v);
    if (back.lengthSq() < 0.01) back.set(0, -1, 0);
    back.normalize();
    const at = (along: number, bend: number): Vec3 => v.clone().multiplyScalar(0.45 + along * length).addScaledVector(back, bend).toArray() as Vec3;
    const spike = extrudePath(pentagon, [at(0, 0), at(0.42, 0.05), at(1, 0.24)], (t) => 1 - t * 0.98);
    big.push(paintRegion(paint(spike, thorn), (c) => (c.length() < 0.68 ? thornBase : undefined)));
  }
  const small: THREE.BufferGeometry[] = [];
  const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const up = new THREE.Vector3(0, 1, 0);
  for (let f = 0; f + 2 < ico.count; f += 3) {
    const n = new THREE.Vector3().fromBufferAttribute(ico, f).add(new THREE.Vector3().fromBufferAttribute(ico, f + 1)).add(new THREE.Vector3().fromBufferAttribute(ico, f + 2)).normalize();
    if (n.z > 0.2 || n.y < -0.5) continue;
    // Tipped toward its back like the big ones, and long enough to stand clear of the hide.
    const dir = n.clone().add(new THREE.Vector3(0, 0, -0.45)).normalize();
    const g = paint(taper(0.065, 0, 0.26, 4), ruff);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    small.push(place(g, n.x * 0.44, n.y * 0.44, n.z * 0.44));
  }
  shell.add(kitMesh(gradient(merge(...big, ...small), 0.86, 1.06), 'bark'));

  // The eyes: two glowing amber balls where they always were (set a touch deeper, so they sit in the hide), each with a
  // slit pupil. `eyes` squashes to blink.
  eyes.position.set(0, 0.12, 0.545);
  const eyeBall = lowSphere(0.11, 6, 4);
  eyes.add(new THREE.Mesh(merge(place(eyeBall, -0.22, 0, 0), place(eyeBall, 0.22, 0, 0)), new THREE.MeshBasicMaterial({ color: pal('amber', 3) })));
  eyes.add(kitMesh(merge(...[-1, 1].map((s) => paint(place(bevelBox(0.035, 0.13, 0.03, 0), s * 0.22, 0, 0.1), mouth))), 'hide'));

  // The brows: two heavy ridges over the eyes, inner ends low (it always looks a little cross). `brows` lowers to scowl.
  brows.position.set(0, 0.27, 0.48);
  brows.add(kitMesh(crevice(merge(...[-1, 1].map((s) => paint(place(bevelBox(0.21, 0.07, 0.17, 0.025), s * 0.2, 0, 0.04, [0.15, 0, s * 0.35]), belly)))), 'hide'));

  // The jaw: a chin hinged under the mouth with two small teeth; it swings down (+x) to open.
  jaw.position.set(0, -0.17, 0.41);
  const chin = paint(place(bevelBox(0.42, 0.09, 0.28, 0.03), 0, -0.02, 0.15), hide);
  const teeth = [-1, 1].map((s) => paint(place(taper(0.03, 0, 0.07, 4), s * 0.06, 0.02, 0.25), tooth));
  jaw.add(kitMesh(gradient(crevice(merge(chin, ...teeth)), 0.9, 1.04), 'hide'));

  const model = bakeRig({ root, joints: { body, shell, eyes, brows, jaw }, flashMats: [] });
  return { ...model, rig: new ThornlingRig(model.joints) };
}

/** The ten thorn directions (the old model's): an icosahedron's vertices, less the two on its face. */
function thornDirections(): THREE.Vector3[] {
  const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const seen = new Set<string>();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < dirs.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
    const k = v.toArray().map((n) => n.toFixed(2)).join();
    if (seen.has(k) || v.z > 0.7) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------------------------------------------------

/** How the Thornling looks at one moment: a flat set of numbers the rig blends toward (docs/pipeline.md "The rig convention"). */
export interface ThornlingPose {
  /** The body's height above its rest (m): the hop, a crouch. */
  lift: number;
  /** 1 = round; below 1 flattened, above 1 stretched tall (its volume kept). */
  squash: number;
  /** Lean (rad): + tips its face down and forward, − rears back. */
  pitch: number;
  /** 0 = thorns at rest, 1 = bristling out, below 0 = swept flat. */
  bristle: number;
  /** 0 = brows at rest, 1 = a low scowl. */
  scowl: number;
  /** 0 = eyes open, 1 = shut. */
  blink: number;
  /** 0 = mouth shut, 1 = gaping. */
  jaw: number;
}

export const REST: ThornlingPose = { lift: 0, squash: 1, pitch: 0, bristle: 0, scowl: 0, blink: 0, jaw: 0 };

const POSE_KEYS = Object.keys(REST) as (keyof ThornlingPose)[];

export function blendPose(cur: ThornlingPose, target: ThornlingPose, k: number) {
  for (const key of POSE_KEYS) cur[key] += (target[key] - cur[key]) * k;
}

/** The behaviour's states (game/enemies.ts `Thornling`), which the rig reads but never changes. */
export type ThornlingState = 'wander' | 'chase' | 'windup' | 'lunge' | 'recover' | 'stagger';

/** What the behaviour tells the rig each frame. */
export interface ThornlingCue {
  state: ThornlingState;
  /** Seconds in this state. */
  t: number;
  /** How long this windup lasts (s; shorter at night). */
  windup: number;
  /** Hopping along (wandering or chasing, not stopped or staggered). */
  moving: boolean;
}

/** The hop: radians of hop phase per second and how high it bounces (m). */
const HOP_RATE = 9, HOP_HEIGHT = 0.45;
/** The windup's last shiver (s): the moment to raise the shield. */
const SHIVER = 0.12;

/**
 * Turns the behaviour's state into a pose and puts it on the joints. Everything happens inside the windows the behaviour
 * already has: the windup's crouch, bristle and opening jaw end exactly when the lunge starts; the recover's wobble settles
 * inside its 0.7 s; the death fits its 0.35 s.
 */
export class ThornlingRig {
  readonly pose: ThornlingPose = { ...REST };
  private hopT: number;
  private clock = 0;
  private nextBlink: number;
  private blinkT = -1;
  private readonly rnd: () => number;

  constructor(private readonly j: ThornlingJoints, seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rnd = mulberry32(seed);
    this.hopT = this.rnd() * 10;
    this.nextBlink = 1 + this.rnd() * 3;
  }

  /** Where this state wants the pose to be, `t` seconds in (before the hop, breath and shake are added). */
  target(cue: ThornlingCue): ThornlingPose {
    const { state, t } = cue;
    const ease = (x: number) => 1 - (1 - x) * (1 - x);
    switch (state) {
      case 'wander':
        return { ...REST };
      case 'chase':
        return { ...REST, pitch: 0.18, scowl: 0.6, bristle: 0.15 };
      case 'windup': {
        // Sinks onto its belly (the bottom stays on the ground), rears back, thorns up, brows down, the mouth cracks.
        const k = ease(Math.min(1, t / cue.windup));
        // Kept subtle (owner, 2026-11-08: the first, bigger stretches read overdone).
        const squash = 1 - 0.2 * k;
        return { lift: -RADIUS * (1 - squash), squash, pitch: -0.3 * k, bristle: 0.8 * k, scowl: 1, blink: 0, jaw: 0.35 * k };
      }
      case 'lunge':
        // Flung forward and a little stretched, jaw wide, thorns swept back by the rush.
        return { lift: 0.05, squash: 1.07, pitch: 0.35, bristle: -0.3, scowl: 1, blink: 0, jaw: 1 };
      case 'recover': {
        // Lands and wobbles to rest: a damped spring that has settled well inside the 0.7 s.
        const spring = Math.exp(-7 * t) * Math.cos(16 * t);
        const squash = 1 - 0.13 * spring;
        return { lift: -RADIUS * Math.max(0, 1 - squash) * 0.8, squash, pitch: 0.25 * Math.exp(-6 * t) * Math.cos(11 * t), bristle: 0.1 * spring, scowl: 0.6, blink: 0, jaw: 0.6 * Math.max(0, 1 - t / 0.25) };
      }
      case 'stagger': {
        // Knocked back: rocks away from the blow, flattened, eyes screwed shut, thorns flat; it comes round by the end.
        const k = Math.exp(-4 * t);
        const squash = 1 - 0.22 * k;
        return { lift: -RADIUS * (1 - squash), squash, pitch: -0.55 * k, bristle: -0.5 * k, scowl: 0.3, blink: t < 0.4 ? 1 : 0, jaw: 0.25 * k };
      }
    }
  }

  /** One frame: blend toward the state's pose, add the hop, breath, blink and shake, and pose the joints. */
  update(dt: number, cue: ThornlingCue) {
    this.clock += dt;
    const target = this.target(cue);
    // The windup, lunge and the blow itself follow their curves closely; everything else eases in.
    const snappy = cue.state === 'windup' || cue.state === 'lunge' || cue.state === 'stagger' || cue.state === 'recover';
    blendPose(this.pose, target, damp(snappy ? 40 : 12, dt));

    // A blink every few seconds while it is calm or chasing (not mid-attack: it keeps its eyes on you).
    if (cue.state === 'wander' || cue.state === 'chase') {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blinkT = 0;
        this.nextBlink = 2 + this.rnd() * 3.5;
      }
    }
    let blink = this.pose.blink;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      blink = Math.max(blink, Math.sin(Math.min(1, this.blinkT / 0.16) * Math.PI));
      if (this.blinkT > 0.16) this.blinkT = -1;
    }

    // The hop: stretched tall in the air, squashed flat as it touches down.
    let lift = this.pose.lift, squash = this.pose.squash, pitch = this.pose.pitch;
    if (cue.moving) {
      this.hopT += dt * HOP_RATE;
      const h = Math.abs(Math.sin(this.hopT));
      lift += h * HOP_HEIGHT;
      squash *= 0.86 + 0.22 * Math.min(1, h * 1.6);
    } else if (cue.state === 'wander') {
      squash *= 1 + 0.035 * Math.sin(this.clock * 3.2); // breathing
    }
    const sway = cue.state === 'wander' ? 0.05 * Math.sin(this.clock * 2.1) : 0;
    let roll = 0;
    if (cue.state === 'windup' && cue.t > cue.windup - SHIVER) {
      roll = Math.sin(cue.t * 90) * 0.07;
      pitch += Math.sin(cue.t * 77) * 0.04;
    }
    if (cue.state === 'stagger') pitch += Math.sin(cue.t * 30) * 0.3 * Math.exp(-3 * cue.t);

    this.apply(lift, squash, pitch, roll, this.pose.bristle + sway, this.pose.scowl, blink, this.pose.jaw);
  }

  /** The death, `k` from 0 to 1 over its time: it puffs up, the thorns burst outward and the body pops to nothing. */
  die(k: number) {
    k = Math.min(1, Math.max(0, k));
    const puff = k < 0.3 ? 1 + 0.12 * (k / 0.3) : 1.12 * Math.max(0, 1 - (k - 0.3) / 0.55);
    const { body, shell, eyes, jaw } = this.j;
    body.position.y = BODY_Y;
    body.rotation.set(0, 0, 0);
    const bodyScale = Math.max(0.02, puff);
    body.scale.setScalar(bodyScale);
    // The thorns fly out (to 1.6 times as far) and are gone by the end, whatever the body (their parent) is doing.
    const burst = (k < 0.3 ? 1 + 0.5 * k : 1.15 + (k - 0.3) * 0.65) * Math.min(1, (1 - k) / 0.3);
    shell.scale.setScalar(Math.max(0.001, burst) / bodyScale);
    eyes.scale.set(1, 0.15, 1);
    jaw.rotation.x = 0.7;
  }

  /** Puts a pose on the joints. */
  private apply(lift: number, squash: number, pitch: number, roll: number, bristle: number, scowl: number, blink: number, jawOpen: number) {
    const { body, shell, eyes, brows, jaw } = this.j;
    body.position.y = BODY_Y + lift;
    const side = 1 / Math.sqrt(squash);
    body.scale.set(side, squash, side);
    body.rotation.set(pitch, 0, roll);
    shell.scale.setScalar(1 + 0.16 * bristle);
    eyes.scale.set(1, Math.max(0.08, 1 - blink), 1);
    brows.position.y = 0.27 - 0.05 * scowl;
    brows.rotation.x = 0.25 * scowl;
    jaw.rotation.x = 0.7 * jawOpen;
  }
}

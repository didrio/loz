import * as THREE from 'three';
import { uniqueMat, uniqueSurf } from '../materials';
import { glow } from '../shapes';
import { faceted } from '../textures';
import type { Model } from './types';

/** Leg bone lengths (m): the boss's two-bone IK needs them too. */
export const THIGH = 0.95, SHIN = 1.0;
/** Where the hips sit in the model as built (the boss's pose moves them). */
const HIPS_Y = 1.75;

/** A ragged strip of coat: narrows toward the bottom, with a few folds so it doesn't read as a plank. */
function coatStrip(width: number, len: number, seed: number) {
  const g = new THREE.BoxGeometry(width, len, 0.04, 1, 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const down = (len / 2 - p.getY(i)) / len; // 0 at the top, 1 at the bottom
    p.setX(i, p.getX(i) * (1 - down * 0.55) + Math.sin(down * 9 + seed) * 0.03 * down);
    p.setZ(i, p.getZ(i) + Math.sin(down * 7 + seed * 2) * 0.05 * down);
  }
  g.computeVertexNormals();
  return g;
}

export interface LamplighterArm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Group;
  fingers: THREE.Group[];
}

/** Everything the Hollow Lamplighter's behaviour poses: its joints by name, and the parts it animates. */
export interface LamplighterModel extends Model<{ hips: THREE.Group; torso: THREE.Group; neck: THREE.Group; head: THREE.Group; cage: THREE.Group; pole: THREE.Group; poleTip: THREE.Object3D }> {
  armR: LamplighterArm;
  armL: LamplighterArm;
  legs: { thigh: THREE.Group; knee: THREE.Group; foot: THREE.Group }[];
  /** The coat's ragged strips (`a`: angle round the body, `ph`: sway phase, `front`: hangs at the front). */
  strips: { g: THREE.Group; a: number; ph: number; front: boolean }[];
  lanterns: { g: THREE.Group; glow: THREE.Mesh; ph: number }[];
  flameOuter: THREE.Mesh;
  flameInner: THREE.Mesh;
  flameGlow: THREE.Mesh;
  light: THREE.PointLight;
  hookGlow: THREE.Mesh;
  flameMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshLambertMaterial;
  mask: THREE.Mesh;
}

/**
 * The Hollow Lamplighter, Keeper of a Stolen Flame (story and fight: game/bosses/lamplighter.ts): a gaunt thing in a
 * tattered lamplighter's coat, absurdly long arms, a pole with a hook and a snuffer bell, and an iron lantern cage for a
 * head around a cracked porcelain mask and the stolen flame. Its own materials, so the hit flash and guard tint touch only it.
 */
export function buildLamplighter(): LamplighterModel {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  const torso = new THREE.Group();
  const neck = new THREE.Group();
  const head = new THREE.Group();
  const cage = new THREE.Group();
  const pole = new THREE.Group();
  const poleTip = new THREE.Object3D();
  const legs: LamplighterModel['legs'] = [];
  const strips: LamplighterModel['strips'] = [];
  const lanterns: LamplighterModel['lanterns'] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const eyeMat = uniqueMat(0x050505, { emissive: 0x000000 });
  // Its own materials (not the shared palette), so the hit flash and guard tint touch only it.
  const cloth = [uniqueSurf('cloth', 0x1c1a22), uniqueSurf('cloth', 0x23202a), uniqueSurf('cloth', 0x17151c)];
  const bone = uniqueSurf('plaster', 0xd9d2bf), iron = uniqueSurf('metal', 0x2a2c31), wood = uniqueSurf('wood', 0x2e241c), dark = uniqueMat(0x0c0b0e);
  const maskMat = uniqueSurf('plaster', 0xe9e4d4), wax = uniqueSurf('plaster', 0xe8dfc4);
  const flashMats = [...cloth, bone, iron, wood, dark, maskMat, wax];
  const add = (parentNode: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(material.userData.surface ? faceted(geo) : geo, material); // a textured tile needs each face's own normal
    m.position.set(x, y, z);
    parentNode.add(m);
    return m;
  };

  root.add(hips);
  hips.position.y = HIPS_Y;
  hips.add(torso);

  // Legs: long and digitigrade, bone-white below the coat, ending in clawed feet.
  for (const side of [1, -1]) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.3, 0, 0);
    add(thigh, new THREE.BoxGeometry(0.16, THIGH, 0.16), cloth[0], 0, -THIGH / 2, 0);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    add(knee, new THREE.SphereGeometry(0.09, 6, 5), bone);
    add(knee, new THREE.CylinderGeometry(0.06, 0.04, SHIN, 6), bone, 0, -SHIN / 2, 0);
    const foot = new THREE.Group();
    foot.position.y = -SHIN;
    const sole = add(foot, new THREE.ConeGeometry(0.08, 0.55, 4), bone, 0, 0.02, 0.2);
    sole.rotation.x = Math.PI / 2;
    for (const t of [-1, 0, 1]) {
      const claw = add(foot, new THREE.ConeGeometry(0.025, 0.22, 4), dark, t * 0.06, 0, 0.48);
      claw.rotation.x = Math.PI / 2 + 0.3;
    }
    knee.add(foot);
    thigh.add(knee);
    hips.add(thigh);
    legs.push({ thigh, knee, foot });
  }

  // Ribcage, glimpsed through the gap in the coat (and laid bare in phase two).
  add(torso, new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), bone, 0, 0.85, -0.12);
  for (let i = 0; i < 6; i++) {
    const r = 0.3 - Math.abs(i - 2) * 0.035;
    const rib = add(torso, new THREE.TorusGeometry(r, 0.028, 4, 10, Math.PI * 1.1), bone, 0, 0.45 + i * 0.18, -0.12);
    rib.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05);
  }
  // A dull heart of cold light behind the ribs.
  const core = glow(0x6fe8ff, 0.22, 0.25);
  core.position.set(0, 1.0, -0.05);
  torso.add(core);

  // The coat: tattered strips hanging from the shoulders, open at the front.
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const front = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.95;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue; // the gap
    const len = 2.0 + ((i * 7) % 5) * 0.14 + (front ? -0.25 : 0);
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * 0.42, 1.55, Math.cos(a) * 0.42);
    g.rotation.order = 'YXZ';
    const strip = add(g, coatStrip(0.36, len, i * 1.3), cloth[i % 3], 0, -len / 2, 0);
    strip.scale.x = 0.8 + ((i * 3) % 4) * 0.12;
    // Ragged ends: a short tail on some strips.
    if (i % 3 === 0) add(g, new THREE.BoxGeometry(0.12, 0.4, 0.035), cloth[(i + 1) % 3], 0.08, -len - 0.15, 0);
    torso.add(g);
    strips.push({ g, a, ph: i * 1.7, front });
  }
  const collar = add(torso, new THREE.CylinderGeometry(0.52, 0.34, 0.55, 8, 1, true), cloth[1], 0, 1.72, 0);
  (collar.material as THREE.Material).side = THREE.DoubleSide;

  // Belt of caged lights: each little lantern holds a captured wisp.
  for (const [a, len] of [[0.75, 0.38], [-0.7, 0.3], [2.7, 0.42]] as const) {
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * 0.82, 0.55, Math.cos(a) * 0.82);
    add(g, new THREE.CylinderGeometry(0.012, 0.012, len, 4), iron, 0, -len / 2, 0);
    const cage = new THREE.Group();
    cage.position.y = -len - 0.12;
    add(cage, new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6), iron, 0, -0.12, 0);
    add(cage, new THREE.ConeGeometry(0.12, 0.1, 6), iron, 0, 0.13, 0);
    for (let k = 0; k < 4; k++) {
      const ka = (k / 4) * Math.PI * 2;
      add(cage, new THREE.BoxGeometry(0.015, 0.24, 0.015), iron, Math.cos(ka) * 0.09, 0, Math.sin(ka) * 0.09);
    }
    const wisp = glow(0xb06aff, 0.09, 0.9);
    cage.add(wisp, glow(0xb06aff, 0.2, 0.25));
    g.add(cage);
    torso.add(g);
    lanterns.push({ g, glow: wisp, ph: a * 3 });
  }

  // Two candle stubs burning on its left shoulder: the only warm light on it.
  for (const [x, h, z] of [[0.38, 0.22, -0.12], [0.5, 0.14, 0.04]]) {
    add(torso, new THREE.CylinderGeometry(0.035, 0.04, h, 6), wax, x, 1.62 + h / 2, z);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 5), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    f.position.set(x, 1.62 + h + 0.05, z);
    torso.add(f);
  }

  // Arms: absurdly long, ending in long curled fingers. The right one carries the pole.
  const arm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.5, 1.55, 0);
    shoulder.rotation.order = 'YXZ';
    add(shoulder, new THREE.SphereGeometry(0.12, 6, 5), cloth[2]);
    add(shoulder, new THREE.BoxGeometry(0.13, 1.15, 0.13), cloth[1], 0, -0.575, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -1.15;
    add(elbow, new THREE.CylinderGeometry(0.065, 0.05, 1.2, 6), bone, 0, -0.6, 0);
    const hand = new THREE.Group();
    hand.position.y = -1.2;
    add(hand, new THREE.BoxGeometry(0.15, 0.2, 0.06), bone, 0, -0.1, 0);
    const fingers: THREE.Group[] = [];
    for (let k = 0; k < 5; k++) {
      const fg = new THREE.Group();
      const thumb = k === 4;
      fg.position.set(thumb ? side * -0.09 : -0.06 + k * 0.04, thumb ? -0.08 : -0.2, thumb ? 0.03 : 0);
      const len = thumb ? 0.28 : 0.46 - Math.abs(k - 1.5) * 0.05;
      const seg = add(fg, new THREE.ConeGeometry(0.022, len, 4), bone, 0, -len / 2, 0);
      seg.rotation.x = Math.PI;
      if (thumb) fg.rotation.z = side * 0.6;
      hand.add(fg);
      fingers.push(fg);
    }
    elbow.add(hand);
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow, hand, fingers };
  };
  const armR = arm(-1);
  const armL = arm(1);

  // The lamplighter's pole: a tall shaft with a hook and a snuffer bell at the top.
  add(pole, new THREE.CylinderGeometry(0.045, 0.055, 4.2, 6), wood, 0, 0.9, 0);
  const hook = add(pole, new THREE.TorusGeometry(0.26, 0.035, 5, 12, Math.PI * 1.25), iron, 0.22, 3.05, 0);
  hook.rotation.z = -0.3;
  const bell = add(pole, new THREE.ConeGeometry(0.16, 0.32, 8, 1, true), iron, -0.06, 2.9, 0);
  (bell.material as THREE.Material).side = THREE.DoubleSide;
  bell.rotation.z = 0.4;
  add(pole, new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6), iron, 0, 2.75, 0);
  const hookGlow = glow(0x9ff0ff, 0.45, 0);
  hookGlow.position.set(0.15, 3.0, 0);
  pole.add(hookGlow);
  poleTip.position.set(0, 3.0, 0);
  pole.add(poleTip);
  armR.hand.add(pole);
  pole.position.y = -0.12;

  // Neck and the lantern-cage head with a cracked porcelain mask and the stolen flame.
  neck.position.set(0, 1.62, 0.05);
  add(neck, new THREE.CylinderGeometry(0.06, 0.08, 0.62, 6), bone, 0, 0.31, 0);
  head.position.y = 0.62;
  neck.add(head);
  torso.add(neck);
  head.add(cage);
  add(cage, new THREE.CylinderGeometry(0.38, 0.3, 0.07, 6), iron, 0, 0, 0);
  add(cage, new THREE.ConeGeometry(0.46, 0.34, 6), iron, 0, 0.8, 0);
  add(cage, new THREE.TorusGeometry(0.12, 0.028, 4, 10), iron, 0, 1.03, 0);
  for (let k = 0; k < 6; k++) {
    const ka = (k / 6) * Math.PI * 2 + Math.PI / 6;
    add(cage, new THREE.BoxGeometry(0.035, 0.64, 0.035), iron, Math.sin(ka) * 0.34, 0.32, Math.cos(ka) * 0.34);
  }
  const mask = add(head, new THREE.SphereGeometry(0.2, 10, 8), maskMat, 0, 0.32, 0.13);
  mask.scale.set(1, 1.3, 0.55);
  // Blank porcelain: two hollow, slightly uneven eyes, a hairline crack and a dark tear streak.
  for (const s of [-1, 1]) {
    const eye = add(mask, new THREE.SphereGeometry(0.045, 8, 6), eyeMat, s * 0.07, 0.04 + (s > 0 ? 0.008 : 0), 0.16);
    eye.scale.set(0.85, 1.25, 0.6);
  }
  const tear = add(mask, new THREE.BoxGeometry(0.014, 0.16, 0.06), dark, -0.072, -0.07, 0.15);
  tear.rotation.z = 0.06;
  const crack = add(mask, new THREE.BoxGeometry(0.008, 0.2, 0.06), dark, 0.04, 0.13, 0.155);
  crack.rotation.z = 0.45;

  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.48, 6), flameMat);
  flameOuter.position.set(0, 0.42, -0.06);
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  flameInner.position.set(0, 0.36, -0.06);
  const flameGlow = glow(0x7fdcff, 0.3, 0.16);
  flameGlow.position.set(0, 0.4, -0.05);
  const light = new THREE.PointLight(0x7fdcff, 8, 18, 1.5);
  light.position.set(0, 0.45, 0.2);
  head.add(flameOuter, flameInner, flameGlow, light);

  return {
    root, joints: { hips, torso, neck, head, cage, pole, poleTip }, flashMats, animated: [eyeMat],
    armR, armL, legs, strips, lanterns, flameOuter, flameInner, flameGlow, light, hookGlow, flameMat, eyeMat, mask,
  };
}

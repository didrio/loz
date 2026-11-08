import * as THREE from 'three';
import { bevelBox, crevice, kitMesh, lathe, lowSphere, paint, place } from '../kit';
import { pal } from '../palette';
import type { Model } from './types';

/**
 * The gear Wren carries, as pure builders for the pause menu's Gear tab and the HUD's icons (render/icons.ts draws each one
 * offscreen). They are small standalone objects, not the pieces on Wren's body: each stands on y = 0, centred, facing +z,
 * and reads from the front at a small size. Every builder is registered in `registry.ts`.
 */

const part = (parent: THREE.Object3D, g: THREE.BufferGeometry, surface?: 'wood' | 'metal' | 'leather' | 'cloth') => parent.add(kitMesh(g, surface));
const done = (root: THREE.Object3D): Model => ({ root, joints: {}, flashMats: [] });

/** Wren's sword, point up: a blade, a gold guard, a leather grip and a pommel. */
export function buildSwordItem(): Model {
  const steel = pal('slate', 3), gold = pal('amber', 1), grip = pal('bark', 1);
  const root = new THREE.Group();
  part(root, paint(place(bevelBox(0.15, 0.9, 0.04, 0.01), 0, 0.84, 0), steel), 'metal');
  part(root, paint(place(lathe([[0.075, 1.29], [0.0, 1.42]], 4), 0, 0, 0), steel), 'metal');
  part(root, paint(place(bevelBox(0.38, 0.07, 0.1, 0.015), 0, 0.36, 0), gold), 'metal');
  part(root, paint(place(lathe([[0.035, 0.08], [0.035, 0.33]], 6), 0, 0, 0), grip), 'leather');
  part(root, paint(place(lowSphere(0.06, 6, 4), 0, 0.05, 0), gold), 'metal');
  return done(root);
}

/** Wren's round wooden shield, face to the front: plank disc, iron rim and boss. */
export function buildShieldItem(): Model {
  const wood = pal('wood', 2), iron = pal('slate', 3);
  const root = new THREE.Group();
  const disc = lathe([[0, 0], [0.42, 0], [0.42, 0.08], [0, 0.08]], 12);
  part(root, crevice(paint(place(disc, 0, 0.5, 0, [Math.PI / 2, 0, 0]), wood)), 'wood');
  part(root, paint(place(lathe([[0.38, 0], [0.46, 0], [0.46, 0.1], [0.38, 0.1]], 12, false), 0, 0.5, -0.01, [Math.PI / 2, 0, 0]), iron), 'metal');
  part(root, paint(place(lowSphere(0.1, 6, 4), 0, 0.5, 0.1), iron), 'metal');
  return done(root);
}

/** The stoneward tunic, laid flat and shown from the front: a body, two short sleeves, a collar and a belt. */
export function buildTunicItem(): Model {
  const cloth = pal('slate', 2), trim = pal('amber', 1), belt = pal('bark', 1);
  const root = new THREE.Group();
  part(root, crevice(paint(place(bevelBox(0.62, 0.72, 0.12, 0.03), 0, 0.4, 0), cloth)), 'cloth');
  for (const s of [-1, 1]) part(root, paint(place(bevelBox(0.3, 0.2, 0.11, 0.02), s * 0.44, 0.64, 0, [0, 0, s * -0.5]), cloth), 'cloth');
  part(root, paint(place(bevelBox(0.26, 0.06, 0.13, 0.01), 0, 0.76, 0), trim), 'cloth');
  part(root, paint(place(bevelBox(0.64, 0.08, 0.13, 0.01), 0, 0.3, 0), belt), 'leather');
  part(root, paint(place(bevelBox(0.1, 0.1, 0.14, 0.01), 0, 0.3, 0), trim), 'metal');
  return done(root);
}

/** The Tether Glove: a leather gauntlet, fingers up, with a coil of glowing cord at the cuff. */
export function buildTetherGlove(): Model {
  const leather = pal('wood', 2), dark = pal('bark', 1), cord = pal('spirit', 2);
  const root = new THREE.Group();
  part(root, crevice(paint(place(bevelBox(0.5, 0.42, 0.22, 0.04), 0, 0.5, 0), leather)), 'leather');
  [-0.17, -0.06, 0.06, 0.17].forEach((x, i) => part(root, paint(place(bevelBox(0.1, 0.3 - Math.abs(i - 1.5) * 0.04, 0.18, 0), x, 0.86 + (i === 1 || i === 2 ? 0.04 : 0), 0), leather), 'leather'));
  part(root, paint(place(bevelBox(0.12, 0.26, 0.18, 0), 0.33, 0.6, 0, [0, 0, -0.7]), leather), 'leather');
  part(root, crevice(paint(place(bevelBox(0.6, 0.3, 0.3, 0.04), 0, 0.15, 0), dark)), 'leather');
  part(root, paint(place(lathe([[0.2, 0], [0.2, 0.05]], 8, false), 0, 0.17, 0), cord));
  part(root, paint(place(bevelBox(0.64, 0.05, 0.34, 0.01), 0, 0.2, 0), cord));
  return done(root);
}

/** A flask: a stoppered bottle with its potion; `color` null is an empty one (clear glass only). */
export function buildFlask(color: number | null): Model {
  const glass = pal('chalk', 1), cork = pal('wood', 2);
  const root = new THREE.Group();
  const shell = lathe([[0, 0], [0.2, 0.03], [0.26, 0.2], [0.2, 0.42], [0.09, 0.54], [0.09, 0.7], [0.11, 0.72], [0.11, 0.76], [0.0, 0.76]], 8);
  part(root, crevice(paint(shell, color ?? glass)));
  part(root, paint(place(lathe([[0.08, 0], [0.08, 0.14]], 6), 0, 0.72, 0), cork), 'wood');
  return done(root);
}

/** A keeper's bell, hung from nothing: a bronze body with a dome, a lip, a loop and a clapper. */
export function buildBellItem(): Model {
  const bronze = pal('earth', 2), dark = pal('slate', 0);
  const root = new THREE.Group();
  part(root, crevice(paint(lathe([[0.32, 0.05], [0.3, 0.12], [0.2, 0.42], [0.17, 0.6], [0.08, 0.68], [0, 0.7]], 10), bronze)), 'metal');
  part(root, paint(lathe([[0.34, 0.03], [0.34, 0.09]], 10, false), bronze), 'metal');
  part(root, paint(place(lowSphere(0.06, 6, 4), 0, 0.02, 0), dark), 'metal');
  part(root, paint(place(bevelBox(0.05, 0.12, 0.05, 0.01), 0, 0.74, 0), dark), 'metal');
  return done(root);
}

/** A small key lying upright: a ring bow, a shaft and two teeth. `color` is the dungeon's key colour. */
export function buildKeyItem(color = pal('amber')): Model {
  const root = new THREE.Group();
  const bow = lathe([[0.1, 0], [0.19, 0], [0.19, 0.06], [0.1, 0.06]], 8, false);
  part(root, crevice(paint(place(bow, 0, 0.78, 0, [Math.PI / 2, 0, 0]), color)), 'metal');
  part(root, paint(place(bevelBox(0.07, 0.62, 0.06, 0.01), 0, 0.37, 0), color), 'metal');
  part(root, paint(place(bevelBox(0.16, 0.07, 0.06, 0.01), 0.08, 0.14, 0), color), 'metal');
  part(root, paint(place(bevelBox(0.12, 0.07, 0.06, 0.01), 0.06, 0.26, 0), color), 'metal');
  return done(root);
}

/** Pip's doll: a stuffed cloth doll with a round head, a patched dress, stubby arms and yarn hair. */
export function buildDoll(): Model {
  const skin = pal('straw', 2), dress = pal('rose', 1), patch = pal('sky', 2), hair = pal('amber', 1), eye = pal('ink', 1);
  const root = new THREE.Group();
  part(root, crevice(paint(place(lowSphere(0.17, 6, 4), 0, 0.62, 0), skin)), 'cloth');
  part(root, crevice(paint(place(lathe([[0.08, 0.1], [0.2, 0.1], [0.12, 0.46], [0.07, 0.46]], 7), 0, 0, 0), dress)), 'cloth');
  part(root, paint(place(bevelBox(0.09, 0.09, 0.02, 0), 0.08, 0.22, 0.16), patch), 'cloth');
  for (const s of [-1, 1]) {
    part(root, paint(place(bevelBox(0.08, 0.2, 0.08, 0), s * 0.17, 0.34, 0, [0, 0, s * -0.4]), skin), 'cloth');
    part(root, paint(place(bevelBox(0.07, 0.14, 0.08, 0), s * 0.06, 0.04, 0), skin), 'cloth');
    part(root, paint(place(lowSphere(0.02, 3, 2), s * 0.06, 0.64, 0.16), eye));
  }
  part(root, paint(place(lowSphere(0.19, 6, 3), 0, 0.74, -0.05), hair), 'cloth');
  return done(root);
}

import * as THREE from 'three';
import { bevelBox, crevice, extrudePath, gradient, kitMesh, lathe, merge, paint, place, wobble } from '../kit';
import { fadeInFog } from '../materials';
import { pal } from '../palette';
import { halo } from '../shapes';
import { Parts } from './village';
import type { Model } from './types';

/**
 * The shrine's shared props, final (T56a, golden set 8): a doorway's stone frame and the wall sconce. Every dungeon room
 * uses them, so they are final in every wing at once; a frame takes its wing's trim colour.
 */

/** The doorway the frame fits (world/dungeon/format.ts owns these; `build.test.ts` keeps them equal). */
export const DOOR_DEFAULTS = { width: 3, height: 3.2 } as const;

/**
 * A doorway's frame, standing on y = 0, centred on the doorway, the wall running along x (the world turns it for a wall
 * along z): two jambs of two quoins each (the lower one broader and deeper), a lintel and a keystone. The opening stays
 * exactly `width` × `height`, the rough frame's (posts 0.35 wide either side, a lintel 0.35 deep over the top).
 * Standalone (in the dungeon's dynamic group), so it carries its own crevice and gradient: one mesh per doorway.
 */
export function doorFrameGeometry(width: number, height: number, colour: number) {
  const pieces: THREE.BufferGeometry[] = [];
  const split = height * 0.5;
  for (const side of [-1, 1]) {
    pieces.push(
      place(wobble(paint(bevelBox(0.42, split, 0.86, 0.05), colour), 0.012, side + 3), side * (width / 2 + 0.21), split / 2, 0),
      place(wobble(paint(bevelBox(0.36, height - split + 0.02, 0.8, 0.045), colour), 0.012, side + 7), side * (width / 2 + 0.18), split + (height - split) / 2, 0),
    );
  }
  pieces.push(place(wobble(paint(bevelBox(width + 0.78, 0.38, 0.84, 0.05), colour), 0.012, 11), 0, height + 0.19, 0));
  // The keystone: a hair paler, standing a little proud of the lintel and above it.
  pieces.push(place(paint(bevelBox(0.46, 0.56, 0.92, 0.06), pal('stone', 2)), 0, height + 0.3, 0));
  return crevice(gradient(merge(...pieces), 0.82, 1.04));
}

export function buildDoorFrame(width: number = DOOR_DEFAULTS.width, height: number = DOOR_DEFAULTS.height, colour = pal('stone', 1)): Model {
  const parts = new Parts();
  parts.add('stone', doorFrameGeometry(width, height, colour));
  return parts.model();
}

/**
 * A sconce's iron, its origin at the cup's centre, the wall's face 0.2 m behind it (at z = -0.2; +z faces into the room):
 * a wall plate, an arm curving down and out from it, and a flared cup. Static: the dungeon merges it with the scenery, so
 * no crevice (the merge shades it); it carries a gradient so the cup's lip catches the flame.
 */
export function sconceIron() {
  const iron = pal('stone', 1), dark = pal('stone', 0);
  const plate = place(paint(bevelBox(0.24, 0.42, 0.05, 0.015), dark), 0, -0.1, -0.175);
  const sq: [number, number][] = [[-0.028, -0.028], [0.028, -0.028], [0.028, 0.028], [-0.028, 0.028]];
  const arm = paint(extrudePath(sq, [[0, -0.2, -0.17], [0, -0.24, -0.1], [0, -0.21, -0.03], [0, -0.13, 0]]), iron);
  const cup = paint(lathe([[0.04, -0.15], [0.1, -0.1], [0.17, 0.02], [0.2, 0.07], [0.15, 0.05]], 6), iron);
  const drip = place(paint(bevelBox(0.05, 0.07, 0.05, 0), dark), 0, -0.19, 0);
  return gradient(merge(plate, arm, cup, drip), 0.85, 1.1);
}

/** How high the flame stands over the cup's centre. */
export const FLAME_Y = 0.22;

/**
 * The flame: a pale tongue and its glow, all unlit (the room's point light does the lighting). The glow is two halos, a
 * small bright one and a wide faint one, so it fades out from the flame instead of ending at one hard edge.
 */
export function sconceFlame() {
  const group = new THREE.Group();
  const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), fadeInFog(new THREE.MeshBasicMaterial({ color: pal('flame', 3) })));
  tongue.position.y = FLAME_Y;
  const glow = new THREE.Group();
  glow.add(halo(pal('flame', 2), 0.17, 0.32), halo(pal('flame', 2), 0.38, 0.1, 1));
  glow.position.y = FLAME_Y - 0.03;
  group.add(tongue, glow);
  return { group, tongue, glow };
}

export function buildSconce(): Model {
  const iron = kitMesh(sconceIron(), 'metal');
  const flame = sconceFlame();
  const root = new THREE.Group();
  root.add(iron, flame.group);
  return { root, joints: { flame: flame.group }, flashMats: [] };
}

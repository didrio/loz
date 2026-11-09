import * as THREE from 'three';
import { bevelBox, crevice, lathe, lowSphere, merge, paint, paintRegion, place, taper } from '../kit';

/**
 * The pieces every person is made of (Wren, `wren.ts`, and the villagers, `villager.ts`), so the cast matches: the egg of a
 * head, ears and a nose, mitten hands, cuffed boots, the geometry eyes and brows. `k` scales a piece (a child's head is
 * bigger, their hands and boots smaller); with `k = 1` each is exactly Wren's.
 */

/** Squeezes a piece along z (a chest is not round), keeping its faces flat. */
export function squeeze(g: THREE.BufferGeometry, z: number) {
  const out = place(g);
  out.scale(1, 1, z);
  out.computeVertexNormals();
  return out;
}

/** Raises every other vertex on the ring at height `y` by `depth`: a notched (tabbed) hem. */
export function notch(g: THREE.BufferGeometry, y: number, depth: number, sides: number) {
  const out = place(g);
  const pos = out.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - y) > 1e-4) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    if (x * x + z * z < 1e-6) continue;
    const k = Math.round(Math.atan2(z, x) / ((Math.PI * 2) / sides));
    if (((k % 2) + 2) % 2 === 1) pos.setY(i, y + depth);
  }
  out.computeVertexNormals();
  return out;
}

/** The head's egg, centred on the head joint (unpainted): `sides` 10 for Wren, fewer for a villager. */
export function skull(k = 1, sides = 10) {
  const profile: [number, number][] = [[0, -0.355], [0.2, -0.325], [0.31, -0.2], [0.345, -0.02], [0.33, 0.12], [0.26, 0.245], [0.14, 0.32], [0, 0.335]];
  return squeeze(lathe(k === 1 ? profile : profile.map(([r, y]) => [r * k, y * k]), sides), 0.95);
}

/** Two ears and a small nose for a head of size `k`. */
export function earsAndNose(skin: number, nose: number, k = 1) {
  const ears = [-1, 1].map((s) => paint(place(squeeze(lowSphere(0.065 * k, 6, 4), 0.6), s * 0.335 * k, -0.04 * k, -0.01 * k), skin));
  return [...ears, paint(place(taper(0.035 * k, 0, 0.045 * k, 4, 0.8), 0, -0.08 * k, 0.315 * k, [Math.PI / 2, 0, 0]), nose)];
}

/** A mitten hand and its thumb, hanging at `y` in arm space; `s` is the side (+1 left), creviced as a hand. */
export function mittenHand(s: number, skin: number, y = -0.69, k = 1) {
  const hand = place(bevelBox(0.145 * k, 0.19 * k, 0.155 * k, 0.04 * k), 0, y, 0);
  const thumb = place(bevelBox(0.055 * k, 0.085 * k, 0.065 * k, 0), -s * 0.068 * k, y + 0.05 * k, 0.06 * k);
  return crevice(paint(merge(hand, thumb), skin), { foot: 1 });
}

/** A boot a size too big with a turned-down cuff, its centre at `y` in leg space, a darker sole; creviced as a boot. A plain cuff (`cuffBevel` 0) saves 32 triangles. */
export function cuffedBoot(s: number, c: { boots: number; sole: number; cuff: number }, y = -0.71, k = 1, cuffBevel = 0.025) {
  const boot = paintRegion(paint(place(bevelBox(0.24 * k, 0.29 * k, 0.38 * k, 0.055 * k), s * 0.01, y, 0.05 * k), c.boots), (p) => (p.y < y - 0.11 * k ? c.sole : undefined));
  const cuff = paint(place(bevelBox(0.265 * k, 0.08 * k, 0.29 * k, cuffBevel * k), s * 0.01, y + 0.16 * k, 0.0), c.cuff);
  return crevice(merge(boot, cuff), { foot: 0.8, footHeight: 0.3 });
}

/** The two eyes (dark, a glint each), in the eyes joint's space; `spread` is half the distance between them. */
export function eyePieces(eye: number, glint: number, k = 1, spread = 0.125) {
  return merge(
    ...[-1, 1].flatMap((s) => [
      paint(place(bevelBox(0.075 * k, 0.125 * k, 0.04 * k, 0), s * spread, 0, -0.012 * k, [0, s * 0.32, 0]), eye),
      paint(place(bevelBox(0.024 * k, 0.03 * k, 0.02 * k, 0), s * spread + 0.016 * k, 0.03 * k, 0.012 * k, [0, s * 0.32, 0]), glint),
    ]),
  );
}

/** The two brows, in the brows joint's space; `tilt` drops their inner ends (Wren's 0.1 reads determined; below 0 lifts them, soft or worried). */
export function browPieces(hair: number, k = 1, spread = 0.125, tilt = 0.1) {
  return merge(...[-1, 1].map((s) => paint(place(bevelBox(0.12 * k, 0.035 * k, 0.045 * k, 0), s * spread, 0, -0.01 * k, [0, s * 0.3, -s * tilt]), hair)));
}

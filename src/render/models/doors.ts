import * as THREE from 'three';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, gradient, kitMesh, lowSphere, merge, paint, paintRegion, place, taper } from '../kit';
import { pal } from '../palette';
import type { Model } from './types';
import { box } from './village';

/**
 * The two doors (T52, golden set 4; docs/art.md "The golden set"): the plank door of a house and the shrine's stone slab.
 * Pure builders with the rough's size and joints; `world/objects.ts` swings or sinks the named joint. Kit pieces, baked per
 * joint (`bakeRig`), so each is a few meshes instead of two dozen.
 */

/**
 * A plank door on a hinge. It faces +z, hinged on its -x edge (`pivot` swings about it); `root` stands on the middle of the
 * door's bottom edge, so a house yaw turns it in place. Four planks with uneven tops, strap hinges and a latch on the front,
 * a batten frame with a diagonal brace on the back (the door swings inward, so both sides show), and a knob on each side.
 * Built centred on the door, then moved over by half a width so its hinge edge sits on the pivot.
 */
export function buildHingedDoor(width = 1.44, height = 2.3, color = pal('wood', 1)): Model<{ pivot: THREE.Group }> {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.x = -width / 2;
  root.add(pivot);
  const plankLight = pal('wood', 2), plankDark = pal('wood', 0), iron = pal('slate', 1), ironDark = pal('slate', 0);
  const pw = width / 4, hinge = -width / 2;

  // Four planks, each a hair shorter or longer than its neighbour, with a gap of shadow between them.
  const tops = [0, 0.04, 0.015, 0.05];
  const planks = [0, 1, 2, 3].map((i) => box(pw - 0.012, height - tops[i], 0.12, i % 2 ? plankLight : color, hinge + pw * (i + 0.5), (height - tops[i]) / 2, 0));
  const back = [
    box(width - 0.16, 0.15, 0.04, plankDark, 0.0, 0.45, -0.08), box(width - 0.16, 0.15, 0.04, plankDark, 0.0, height - 0.4, -0.08),
    // The brace runs from the low hinge corner up to the high latch corner.
    box(Math.hypot(width - 0.3, height - 0.85), 0.13, 0.04, plankDark, 0, height / 2 + 0.025, -0.1, [0, 0, Math.atan2(height - 0.85, width - 0.3)]),
  ];
  part(pivot, width, merge(...planks, ...back), 'wood');

  // The iron: two strap hinges with a tip, a pintle on the hinge edge, a latch plate and bar, and a knob each side.
  const straps = [0.45, height - 0.4].flatMap((y) => [
    box(width * 0.62, 0.1, 0.03, iron, hinge + width * 0.31, y, 0.075),
    box(0.09, 0.09, 0.03, iron, hinge + width * 0.62 + 0.03, y, 0.075, [0, 0, Math.PI / 4]),
    place(paint(taper(0.05, 0.05, 0.18, 5), ironDark), hinge + 0.01, y - 0.09, 0.0),
  ]);
  const latch = [
    box(0.12, 0.32, 0.03, iron, width / 2 - 0.2, 1.1, 0.075), box(0.04, 0.2, 0.06, ironDark, width / 2 - 0.2, 1.1, 0.12),
    place(paint(lowSphere(0.06, 5, 3), iron), width / 2 - 0.2, 1.1, -0.1),
  ];
  part(pivot, width, merge(...straps, ...latch), 'metal');

  return bakeRig({ root, joints: { pivot }, flashMats: [] }, { shared: true });
}

/** Adds a kit mesh to the pivot, shifted so the door's hinge edge (x = -width/2 in the piece) sits on the pivot. */
function part(pivot: THREE.Group, width: number, g: THREE.BufferGeometry, surface: 'wood' | 'metal') {
  const m = kitMesh(gradient(crevice(g, { foot: 0.9 }), 0.9, 1.04), surface);
  m.position.x = width / 2;
  pivot.add(m);
}

/**
 * A stone slab (a door across a doorway, `width` along z and `height` tall, centred on the origin) with a spiral glyph on its
 * -x face. `glyphMat` is the glyph's colour: dark while the door sleeps, bright once it's awake. The slab is a plain bevelled
 * block with a raised border and a weathered foot; the glyph (a spiral of short bars round a centre stone, on the face) is the only part the world recolours, so it is the one mesh left unbaked.
 */
export function buildStoneDoor(width = 4, height = 6.3): Model<{ slab: THREE.Group }> & { glyphMat: THREE.MeshBasicMaterial } {
  const glyphMat = new THREE.MeshBasicMaterial({ color: pal('teal', 3) });
  const stone = pal('stone', 2), carved = pal('stone', 3), worn = pal('stone', 1);
  const half = height / 2;

  const face = paintRegion(paint(bevelBox(0.6, height, width, 0.06), stone), (c, n) => {
    if (c.y < -half + 1.1) return worn;
    if (n.x < -0.9 && Math.abs(c.z) > width / 2 - 0.22) return carved;
    return undefined;
  });
  // The raised border on the glyph side: two uprights and two bars, inset from the edge.
  const inset = 0.32, bx = -0.33;
  const border = [
    ...[-1, 1].map((s) => box(0.1, height - inset * 2, 0.2, carved, bx, 0, s * (width / 2 - inset))),
    ...[-1, 1].map((s) => box(0.1, 0.2, width - inset * 2, carved, bx, s * (half - inset), 0)),
  ];

  const slab = new THREE.Group();
  slab.add(kitMesh(gradient(crevice(merge(face, ...border)), 0.82, 1.05), 'stone'));

  // The glyph: a spiral of short bars (1.75 turns, out from a centre stone), in y and z on the -x face.
  const cy = 0.3, turns = 1.75, steps = 14, bars: THREE.BufferGeometry[] = [];
  const at = (i: number) => {
    const a = (i / steps) * turns * Math.PI * 2, r = 0.14 + 0.76 * (i / steps);
    return [cy + Math.sin(a) * r, Math.cos(a) * r] as const;
  };
  for (let i = 0; i < steps; i++) {
    const [y0, z0] = at(i), [y1, z1] = at(i + 1), dy = y1 - y0, dz = z1 - z0;
    bars.push(place(bevelBox(0.07, 0.1, Math.hypot(dy, dz) + 0.06, 0), -0.335, (y0 + y1) / 2, (z0 + z1) / 2, [Math.atan2(-dy, dz), 0, 0]));
  }
  bars.push(place(lowSphere(0.26, 4, 2), -0.35, cy, 0));
  slab.add(new THREE.Mesh(merge(...bars), glyphMat));

  const root = new THREE.Group();
  root.add(slab);
  return bakeRig({ root, joints: { slab }, flashMats: [], animated: [glyphMat], glyphMat }, { shared: true });
}

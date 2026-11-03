import * as THREE from 'three';
import { Layer } from '../../core/physics';
import { mat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { THEMES } from './decor';
import { LANDMARK_SIZE, type LandmarkStyle, type RoomTheme } from './format';

/**
 * The shrine's three landmark statues: big (4-5 m), unique and deliberately lopsided, so a
 * player coming back through a shortcut knows which floor's central room they are in. One
 * per wing: the Nave's lantern keeper, the Long Gallery's one-winged watcher, the Crypt's
 * fallen head. Primitives only; everything goes into the floor's static group (merged
 * with the rest), with one World-layer collider. Lantern glow is an emissive material, no
 * light. Local frame: +z is the statue's front, up is +y; `yaw` turns it (0 = facing south).
 */

type V3 = [number, number, number];

const GROUP_FIT = LANDMARK_SIZE / 2;

/** Builds a statue at (x, fy, z), turned by `yaw`, into `solid` (static) and `b` (collider). */
export function buildLandmark(
  b: AreaBuilder, solid: THREE.Group, style: LandmarkStyle, theme: RoomTheme, x: number, fy: number, z: number, yaw: number,
) {
  const g = new THREE.Group();
  g.position.set(x, fy, z);
  g.rotation.y = yaw;
  const pal = THEMES[theme];
  const add = (geo: THREE.BufferGeometry, color: number, pos: V3, rot: V3 = [0, 0, 0], emissive = 0) => {
    const m = new THREE.Mesh(geo, mat(color, emissive));
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, color: number, pos: V3, rot?: V3, emissive?: number) => add(new THREE.BoxGeometry(w, h, d), color, pos, rot, emissive);
  /** A square-section bar from one point to another (arms, legs, roots, feathers). */
  const bar = (from: V3, to: V3, thick: number, color: number, wide = thick) => {
    const a = new THREE.Vector3(...from), c = new THREE.Vector3(...to);
    const len = a.distanceTo(c);
    const m = new THREE.Mesh(new THREE.BoxGeometry(wide, thick, len), mat(color));
    m.position.copy(a).add(c).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.clone().sub(a).normalize());
    m.castShadow = true;
    g.add(m);
  };

  let collider: { hx: number; hy: number; hz: number; cy: number } | { r: number; hy: number; cy: number };
  if (style === 'lanternKeeper') {
    // A kneeling keeper on a plinth. The raised right arm (toward the front) holds a glowing
    // lantern; the left hand rests on a tall staff; the head is turned toward the staff.
    box(3, 0.5, 3, pal.trim, [0, 0.25, 0]);
    box(2.4, 0.5, 2.4, pal.pillar, [0, 0.75, 0]);
    add(new THREE.CylinderGeometry(0.55, 1.0, 1.5, 6), pal.pillar, [0, 1.75, -0.3]); // robe
    box(0.6, 0.55, 1.1, pal.pillar, [-0.4, 1.55, 0.65], [0, 0, 0]); // the raised knee
    box(0.55, 0.4, 0.9, pal.trim, [-0.4, 1.35, 1.35]); // the foot
    box(1.25, 1.5, 0.8, pal.wall, [0, 2.9, -0.35], [0.12, 0, 0]); // torso, leaning forward
    box(1.7, 0.4, 0.9, pal.pillar, [0, 3.55, -0.3]); // shoulders
    const head = new THREE.Group();
    head.position.set(0.05, 4.05, -0.2);
    head.rotation.y = 0.95; // turned to look off to the staff side
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.7, 0.65), mat(pal.pillar));
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 4), mat(pal.trim));
    hood.position.y = 0.55;
    hood.rotation.y = Math.PI / 4;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.25), mat(pal.trim));
    nose.position.set(0, -0.02, 0.42);
    for (const m of [hb, hood, nose]) { m.castShadow = true; head.add(m); }
    g.add(head);
    bar([-0.8, 3.5, -0.3], [-1.05, 4.05, 0.45], 0.32, pal.wall); // lantern arm: up and forward
    bar([-1.05, 4.05, 0.45], [-0.95, 4.55, 1.25], 0.28, pal.wall);
    box(0.34, 0.3, 0.34, pal.pillar, [-0.95, 4.65, 1.3]); // the fist
    box(0.05, 0.4, 0.05, pal.trim, [-0.95, 4.95, 1.3]); // the hook
    box(0.55, 0.12, 0.55, pal.trim, [-0.95, 5.2, 1.3]);
    box(0.42, 0.62, 0.42, 0xffe0a0, [-0.95, 5.55, 1.3], [0, 0.4, 0], 0xff9a30); // lantern glow
    add(new THREE.ConeGeometry(0.4, 0.35, 4), pal.trim, [-0.95, 6.0, 1.3], [0, Math.PI / 4, 0]);
    bar([0.8, 3.45, -0.3], [1.05, 2.85, 0.4], 0.3, pal.wall); // staff arm, down
    bar([1.05, 2.85, 0.4], [0.95, 2.5, 0.6], 0.26, pal.wall);
    add(new THREE.CylinderGeometry(0.1, 0.12, 4.4, 6), pal.trim, [0.95, 3.05, 0.6]); // the staff
    add(new THREE.IcosahedronGeometry(0.28, 0), pal.pillar, [0.95, 5.4, 0.6]);
    collider = { hx: 1.4, hy: 3, hz: 1.4, cy: 3 };
  } else if (style === 'watcher') {
    // A figure on one leg on a snapped column, one arm pointing along the gallery (local
    // +x), one wing only, half broken, a stump where the other would be.
    box(2.7, 0.4, 2.7, pal.trim, [0, 0.2, 0]);
    add(new THREE.CylinderGeometry(1.0, 1.15, 1.7, 8), pal.wall, [0, 1.25, 0]);
    box(2.2, 0.3, 0.35, pal.trim, [0, 0.8, 0], [0, 0.4, 0]);
    // The jagged top of the break.
    add(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 8), pal.pillar, [0, 2.3, 0]);
    box(0.5, 0.5, 0.5, pal.pillar, [0.55, 2.7, 0.2], [0.3, 0.5, 0.2]);
    box(0.4, 0.4, 0.5, pal.pillar, [-0.5, 2.65, -0.4], [0.2, 0.2, 0.4]);
    // A fallen drum and a loose feather at the foot.
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8), pal.wall, [-0.9, 0.6, 1.0], [0, 0, Math.PI / 2]);
    box(0.2, 0.08, 0.8, pal.pillar, [0.9, 0.44, 0.9], [0, 0.6, 0]);
    // Standing leg and a raised, bent one.
    bar([0, 2.55, 0], [0.05, 3.7, 0], 0.4, pal.pillar);
    bar([0.1, 3.7, 0.05], [0.35, 3.3, 0.8], 0.36, pal.pillar);
    bar([0.35, 3.3, 0.8], [0.3, 2.65, 0.35], 0.3, pal.pillar);
    box(0.3, 0.14, 0.5, pal.trim, [0.3, 2.55, 0.5]);
    box(1.05, 1.2, 0.65, pal.pillar, [0, 4.3, 0]); // torso
    box(1.35, 0.3, 0.7, pal.wall, [0, 4.85, 0]);
    box(0.5, 0.5, 0.5, pal.pillar, [0.05, 5.3, 0], [0, 1.2, 0]); // head, turned along the gallery
    box(0.12, 0.14, 0.25, pal.trim, [0.35, 5.28, 0.05], [0, 1.2, 0]);
    // The pointing arm (+x), and the other hanging.
    bar([0.6, 4.8, 0], [1.4, 4.85, 0], 0.3, pal.pillar);
    bar([1.4, 4.85, 0], [2.3, 4.95, 0], 0.26, pal.pillar);
    bar([2.3, 4.95, 0], [2.8, 4.97, 0], 0.1, pal.wall); // the finger
    bar([-0.6, 4.8, 0.05], [-0.8, 4.0, 0.2], 0.28, pal.pillar);
    bar([-0.8, 4.0, 0.2], [-0.7, 3.4, 0.35], 0.24, pal.pillar);
    // One wing on the left shoulder blade: three long feathers, the outer one snapped short.
    const root: V3 = [-0.35, 4.7, -0.4];
    bar(root, [-1.0, 6.0, -0.85], 0.07, pal.wall, 0.5);
    bar(root, [-1.7, 5.7, -1.0], 0.07, pal.wall, 0.5);
    bar(root, [-2.1, 5.15, -0.95], 0.07, pal.wall, 0.45);
    bar(root, [-1.2, 4.6, -0.75], 0.07, pal.pillar, 0.4); // the snapped one
    box(0.1, 0.5, 0.1, pal.trim, [-0.4, 4.9, -0.45]);
    box(0.45, 0.35, 0.3, pal.trim, [0.4, 4.75, -0.4], [0.2, 0.3, 0]); // empty socket on the other side
    collider = { r: 1.1, hy: 1.6, cy: 1.6 };
  } else {
    // A huge head fallen on its left cheek, face to the front (+z): the forehead (and its
    // snapped crown spike) toward +x, the top eye open, the lower one buried, moss and roots
    // pouring over the back (-z) side.
    const skin = pal.pillar;
    add(new THREE.IcosahedronGeometry(1.5, 1), skin, [0, 1.45, 0]).scale.set(1.0, 0.95, 1.05);
    box(2.3, 0.4, 2.3, pal.trim, [0, 0.12, 0], [0, 0.35, 0]); // the broken base it fell off
    box(1.3, 1.0, 1.0, pal.wall, [-1.15, 1.2, 0.5], [0, 0, 0.15]); // jaw
    box(1.1, 0.45, 0.4, pal.wall, [0.65, 1.55, 1.55]); // heavy brow
    box(0.55, 1.0, 0.85, skin, [-0.05, 1.5, 1.6]); // the nose
    box(0.9, 0.2, 0.2, pal.trim, [-0.9, 1.25, 1.55], [0, 0, 0.05]); // the mouth
    box(0.45, 0.4, 0.15, 0x0a0c08, [0.35, 2.15, 1.5]); // the open eye's socket
    add(new THREE.IcosahedronGeometry(0.2, 0), 0xe8f0c8, [0.35, 2.15, 1.58], [0, 0, 0], 0x405020); // the eye
    box(0.5, 0.06, 0.15, pal.trim, [0.4, 0.95, 1.5]); // the buried eye, closed
    add(new THREE.ConeGeometry(0.5, 1.4, 5), pal.trim, [1.9, 1.55, 0.2], [0, 0, -Math.PI / 2]); // snapped crown spike
    box(0.4, 1.0, 0.2, pal.trim, [0.7, 2.7, 0.2], [0, 0, 0.3]); // crown shard
    // Moss and roots over the back side and the top, a sapling growing from the ear.
    const moss = 0x3f6a32, mossLight = 0x55883f, root = 0x4a3a26;
    add(new THREE.IcosahedronGeometry(1.0, 0), moss, [-0.2, 2.6, -0.7]).scale.set(1.2, 0.55, 1.1);
    add(new THREE.IcosahedronGeometry(0.8, 0), mossLight, [0.5, 2.3, -0.9]).scale.set(1.0, 0.5, 1.0);
    add(new THREE.IcosahedronGeometry(0.9, 0), moss, [-0.6, 0.6, -1.4]).scale.set(1.4, 0.45, 1.0);
    add(new THREE.IcosahedronGeometry(0.6, 0), mossLight, [-1.3, 0.45, -0.6]).scale.set(1.2, 0.5, 1.0);
    bar([-0.2, 2.8, -0.5], [-0.5, 4.2, -0.6], 0.3, root);
    bar([-0.5, 4.2, -0.6], [0.0, 4.9, -0.5], 0.18, root);
    add(new THREE.IcosahedronGeometry(0.7, 0), mossLight, [0.1, 5.0, -0.5]).scale.set(1.2, 0.7, 1.2);
    add(new THREE.IcosahedronGeometry(0.5, 0), moss, [-0.9, 4.5, -0.4]);
    bar([-0.2, 2.8, -0.5], [-1.2, 1.9, -1.4], 0.2, root);
    bar([-1.2, 1.9, -1.4], [-1.6, 0.2, -1.7], 0.16, root);
    bar([0.2, 2.9, -0.6], [1.1, 1.8, -1.5], 0.2, root);
    bar([1.1, 1.8, -1.5], [1.9, 0.15, -1.9], 0.14, root);
    bar([-0.8, 2.4, -0.9], [-0.9, 0.8, -1.9], 0.14, root);
    g.scale.setScalar(1.25); // a *huge* head: it overhangs its 3 m footprint a little
    collider = { hx: GROUP_FIT + 0.2, hy: 2, hz: GROUP_FIT + 0.2, cy: 2 };
  }
  solid.add(g);
  if ('r' in collider) b.cylinder(x, fy + collider.cy, z, collider.hy, collider.r, Layer.World);
  else b.box(x, fy + collider.cy, z, collider.hx, collider.hy, collider.hz, yaw, Layer.World);
}

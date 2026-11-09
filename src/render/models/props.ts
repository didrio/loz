import * as THREE from 'three';
import { bakeRig } from '../bakeRig';
import { bevelBox, crevice, extrudePath, gradient, kitMesh, lathe, merge, paint, paintRegion, place, type Vec3 } from '../kit';
import { uniqueMat, uniqueSurf, surf } from '../materials';
import { pal } from '../palette';
import { glow, heartGeometry, shieldModel } from '../shapes';
import { faceted } from '../textures';
import type { Model } from './types';

/**
 * The world's props as pure builders: geometry and materials only. `world/objects.ts` places them, adds colliders and
 * animates the named joints. Every builder is registered in `registry.ts`.
 */

/**
 * A treasure chest with a hinged lid, its front (lock side) facing +z. A locked chest wears an iron padlock until it's opened.
 * Built with the modeling kit (render/kit.ts) and baked per joint (`bakeRig`): a beveled body on feet, a domed lid with two
 * brass straps, a lock plate and a padlock. Same size, hinge and joints as ever; `world/objects.ts`'s `Chest` swings `lid`.
 */
export function buildChest(locked = false): Model<{ lid: THREE.Group; padlock: THREE.Group }> {
  const wood = pal('wood', 2), woodDark = pal('wood', 1), woodDeep = pal('bark', 0), brass = pal('amber', 1), iron = pal('slate', 1);
  /** The lid's dome: a half hexagon-ish disc swept along the chest's width, radius `r`, `length` long, centred on x. */
  const dome = (r: number, length: number, x: number, steps: number) => {
    const profile: [number, number][] = [];
    for (let i = 0; i <= steps; i++) profile.push([Math.cos((i / steps) * Math.PI) * r, Math.sin((i / steps) * Math.PI) * r]);
    return place(extrudePath(profile, [[x - length / 2, 0, 0], [x + length / 2, 0, 0]]), 0, 0, 0.47);
  };
  const part = (parent: THREE.Object3D, g: THREE.BufferGeometry, surface: 'wood' | 'metal') => parent.add(kitMesh(gradient(g, 0.88, 1.04), surface));

  const root = new THREE.Group();
  const lid = new THREE.Group();
  const padlock = new THREE.Group();

  // The body: beveled, a darker skirt, four feet, a brass band round the rim, a dark hollow under the lid.
  const body = paintRegion(paint(place(bevelBox(1.4, 0.8, 0.95, 0.07), 0, 0.4, 0), wood), (c) => (c.y < 0.16 ? woodDark : undefined));
  const feet = merge(...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => paint(place(bevelBox(0.18, 0.12, 0.18, 0), sx * 0.64, 0.06, sz * 0.42), woodDeep))));
  part(root, crevice(merge(body, feet)), 'wood');
  part(root, paint(place(bevelBox(1.45, 0.12, 1.0, 0), 0, 0.7, 0), brass), 'metal');
  part(root, paint(place(bevelBox(1.3, 0.05, 0.85, 0), 0, 0.78, 0), woodDeep), 'wood');

  // The lid: hinged at the back (the pivot), a dome of planks with a lighter crown, two brass straps, a lock plate.
  lid.position.set(0, 0.8, -0.47);
  part(lid, merge(paintRegion(paint(dome(0.48, 1.4, 0, 6), wood), (_c, n) => (n.y > 0.8 ? pal('wood', 3) : undefined)), paint(place(bevelBox(1.4, 0.04, 0.96, 0), 0, -0.01, 0.47), woodDark)), 'wood');
  part(lid, merge(paint(dome(0.5, 0.12, -0.42, 4), brass), paint(dome(0.5, 0.12, 0.42, 4), brass), paint(place(bevelBox(0.22, 0.28, 0.08, 0), 0, 0.05, 0.96), brass)), 'metal');

  // The padlock hangs from the clasp on the front.
  padlock.position.set(0, 0.6, 0.56);
  const shackle: Vec3[] = [];
  for (let i = 0; i <= 4; i++) shackle.push([Math.cos((i / 4) * Math.PI) * 0.1, 0.13 + Math.sin((i / 4) * Math.PI) * 0.1, 0]);
  const loop: [number, number][] = [[-0.025, -0.025], [0.025, -0.025], [0.025, 0.025], [-0.025, 0.025]];
  part(padlock, merge(paint(bevelBox(0.3, 0.26, 0.12, 0), iron), paint(extrudePath(loop, shackle), iron), paint(place(bevelBox(0.05, 0.09, 0.02, 0), 0, -0.02, 0.065), woodDeep)), 'metal');
  padlock.visible = locked;

  root.add(lid, padlock);
  return bakeRig({ root, joints: { lid, padlock }, flashMats: [] }, { shared: true });
}

/** A floating heart container: a chunky heart in a gold ring, with a soft pink glow. Centred on the origin. */
export function buildHeartVessel(): Model<{ heart: THREE.Mesh }> {
  const heart = new THREE.Mesh(heartGeometry(0.22), uniqueMat(0xff3b5c, { emissive: 0x5a0d1a }));
  heart.scale.setScalar(1.6);
  const rim = new THREE.Mesh(faceted(new THREE.TorusGeometry(0.75, 0.05, 6, 24)), surf('metal', 0xe8c770));
  const root = new THREE.Group();
  root.add(heart, rim, glow(0xff7a8a, 1.0, 0.18));
  return { root, joints: { heart }, flashMats: [], animated: [heart.material as THREE.Material] };
}

/** Wren's shield lying on the floor, leaning back on its foot, with a glint on its boss (`glint`: the glow the pickup pulses). */
export function buildShieldPickup(): Model<{ glint: THREE.Mesh }> {
  const shield = shieldModel(surf('wood', 0x8b5a2b), surf('metal', 0x9a9fa6));
  shield.rotation.x = -0.35;
  shield.position.y = 0.42;
  const glint = glow(0xfff1c0, 0.16, 0.6);
  glint.position.set(0, 0.47, 0.12);
  const root = new THREE.Group();
  root.add(shield, glint);
  return { root, joints: { glint }, flashMats: [], animated: [glint.material as THREE.Material] };
}

/**
 * The great lantern atop the shrine: an octahedron of dark metal that glows from within as embers return, a halo and a
 * point light. All at the origin; the light is part of the model so the walls it lights are the model's business.
 */
export function buildGreatLantern(): Model<{ mesh: THREE.Mesh; halo: THREE.Mesh; light: THREE.PointLight }> & { material: THREE.MeshLambertMaterial } {
  const material = uniqueSurf('metal', 0x3a3a44, { emissive: 0x000000 });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), material);
  const halo = glow(0xff9a3a, 1.3, 0);
  const light = new THREE.PointLight(0xffa64a, 0, 26, 1.6);
  const root = new THREE.Group();
  root.add(mesh, halo, light);
  return { root, joints: { mesh, halo, light }, flashMats: [], animated: [material, halo.material as THREE.Material], material };
}

/** One cuttable bush: a faceted green blob, 1.5 m wide at scale 1. `BushField` draws many of its geometry as one instanced mesh. */
export function buildBush(): Model<{ blob: THREE.Mesh }> {
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), surf('foliage', 0x3f7d2e));
  blob.position.y = 0.45;
  blob.scale.set(1, 0.8, 1);
  const root = new THREE.Group();
  root.add(blob);
  return { root, joints: { blob }, flashMats: [] };
}

/**
 * A clay jar, a sword breaks it (`world/jars.ts`): 0.82 m across the belly, 1.1 m tall, standing on y = 0. A lathe with a banded
 * belly, a dark flared lip round a hollow mouth, and two little lugs at the neck. Built with the kit and baked, so a jar is one
 * mesh where the rough's was four.
 */
export function buildJar(): Model {
  const clay = pal('clay', 2), clayDark = pal('clay', 1), mouth = pal('ink', 2);
  const body = lathe([[0, 0], [0.24, 0.02], [0.36, 0.14], [0.41, 0.42], [0.37, 0.68], [0.21, 0.86], [0.2, 0.95], [0.27, 1.02], [0.27, 1.1], [0.17, 1.1], [0.14, 1.0], [0, 0.98]], 8);
  const painted = paintRegion(paint(body, clay), (c, n) => {
    if (n.y > 0.5 && c.y > 0.95) return mouth;
    if (c.y > 0.96 || (c.y > 0.42 && c.y < 0.56 && c.x * c.x + c.z * c.z > 0.14) || c.y < 0.1) return clayDark;
    return undefined;
  });
  const lugs = [-1, 1].map((s) => place(paint(bevelBox(0.1, 0.12, 0.07, 0), clayDark), s * 0.23, 0.9, 0));
  const root = new THREE.Group();
  root.add(kitMesh(gradient(crevice(merge(painted, ...lugs), { foot: 0.9 }), 0.86, 1.05), 'plaster'));
  return bakeRig({ root, joints: {}, flashMats: [] }, { shared: true });
}

/**
 * A signpost facing +z, standing on y = 0: a post behind a board of three planks under a little gabled cap, a paper notice with
 * rows of scribbled ink and a red seal, and a few stones at its foot. `seed` picks the scribbles (the same hash as ever), so
 * every sign reads differently and none moves the shared random numbers. The notice is lit from within a little (it faces the
 * spawn, often away from the sun), so it is the one unbaked mesh, in `animated`.
 */
export function buildSign(seed = 7): Model {
  const wood = pal('wood', 2), woodDark = pal('wood', 1), woodLight = pal('wood', 3), nail = pal('slate', 1);
  const ink = pal('ink', 3), seal = pal('crimson'), stone = pal('stone', 2), stoneDark = pal('stone', 1);
  const planks = [0.37, 0, -0.37].map((dy, i) => place(paint(bevelBox(1.8 - i * 0.03, 0.34, 0.12, 0), i === 1 ? woodLight : wood), i === 1 ? 0.02 : -0.01, 1.6 + dy, 0.02));
  const post = place(paint(bevelBox(0.26, 2.1, 0.2, 0), woodDark), 0, 1.05, -0.12);
  const cap = [-1, 1].map((s) => place(paint(bevelBox(1.95, 0.08, 0.16, 0), woodDark), 0, 2.24, s * 0.07, [s * 0.45, 0, 0]));
  const nails = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => place(paint(bevelBox(0.07, 0.07, 0.03, 0), nail), sx * 0.8, 1.6 + sy * 0.46, 0.09)));
  const root = new THREE.Group();
  root.add(kitMesh(gradient(merge(post, ...planks, ...cap, ...nails), 0.88, 1.05), 'wood'));

  // The notice: a sheet, and its scribbles (two triangles each) from a hash of the seed.
  const paperMat = uniqueSurf('plaster', pal('plaster', 3), { emissive: pal('plaster', 1) });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.86), paperMat);
  paper.position.set(0, 1.6, 0.0825);
  root.add(paper);
  let h = seed;
  const next = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const bars: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 4; row++) {
    let px = -0.62;
    const py = 1.9 - row * 0.16;
    while (px < 0.55) {
      const w = 0.12 + next() * 0.28;
      if (px + w > 0.66) break;
      bars.push(place(paint(new THREE.PlaneGeometry(w, 0.05), ink), px + w / 2, py, 0.0875));
      px += w + 0.07 + next() * 0.06;
    }
  }
  bars.push(place(paint(new THREE.PlaneGeometry(0.14, 0.14), seal), 0.52, 1.28, 0.0885, [0, 0, Math.PI / 4]));
  // Stones heaped round the post's foot.
  const stones = [[-0.22, 0.1, 0.12, 0.3], [0.25, 0.08, 0.05, 0.5], [0.05, 0.07, 0.2, 0.15], [-0.05, 0.08, -0.26, 0.7]].map(([x, y, z, r], i) =>
    place(paint(bevelBox(0.3, 0.2, 0.26, 0), i % 2 ? stone : stoneDark), x, y, z, [0.1, r, 0.08]));
  root.add(kitMesh(gradient(crevice(merge(...bars, ...stones), { foot: 0.9 }), 0.86, 1.05), 'plaster'));
  return bakeRig({ root, joints: {}, flashMats: [], animated: [paperMat] }, { shared: true });
}

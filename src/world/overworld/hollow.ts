import * as THREE from 'three';
import { angleDiff } from '../../core/math';
import { Layer } from '../../core/physics';
import { mat, surf } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { HOLLOW, HOLLOW_ENTRANCE, regionRng, terrainHeight } from './layout';

/**
 * Gloaming Hollow: a sunken, dead clearing where the south road ends. A ring of bare black
 * trees, old iron lamp posts with dead cage lamps, grey grass and drifting ash.
 * Uses its own RNG so it never disturbs the rest of the seeded overworld.
 */
export function buildHollow(b: AreaBuilder) {
  const rand = regionRng('hollow');
  const { x: cx, z: cz, r: R, floor } = HOLLOW;
  const entrance = Math.atan2(HOLLOW_ENTRANCE.z - cz, HOLLOW_ENTRANCE.x - cx);
  const bark = surf('bark', 0x3d342c), barkLight = surf('bark', 0x4d4238);

  // Bare, twisted trees around the rim, leaving the road's way in open.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    if (Math.abs(angleDiff(a, entrance)) < 0.42) continue;
    const r = R + 2.5 + rand() * 4;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    deadTree(b, x, terrainHeight(x, z), z, rand, rand() < 0.5 ? bark : barkLight);
  }

  // Iron lamp posts just outside the arena ring, each with a hanging cage lamp.
  const lamps: THREE.Vector3[] = [];
  const iron = surf('metal', 0x23262b);
  for (let i = 0; i < 7; i++) {
    const a = entrance + Math.PI / 7 + (i / 7) * Math.PI * 2;
    const x = cx + Math.cos(a) * (R + 1.2), z = cz + Math.sin(a) * (R + 1.2), y = terrainHeight(x, z);
    const lean = (rand() - 0.5) * 0.25;
    const post = new THREE.Group();
    post.position.set(x, y, z);
    post.rotation.set(lean, -a + Math.PI / 2, (rand() - 0.5) * 0.2);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.4, 0.14), iron);
    pole.position.y = 1.7;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), iron);
    arm.position.set(0, 3.3, -0.4);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.25, 6), iron);
    cap.position.set(0, 3.05, -0.8);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 6), iron);
    base.position.set(0, 2.62, -0.8);
    post.add(pole, arm, cap, base);
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), iron);
      const ka = (k / 4) * Math.PI * 2 + Math.PI / 4;
      bar.position.set(Math.cos(ka) * 0.15, 2.83, -0.8 + Math.sin(ka) * 0.15);
      post.add(bar);
    }
    b.staticGroup.add(post);
    post.updateMatrixWorld(true);
    lamps.push(new THREE.Vector3(0, 2.83, -0.8).applyMatrix4(post.matrixWorld));
    b.cylinder(x, y + 1.7, z, 1.7, 0.2, Layer.Prop);
  }

  // Grey, dead grass and a few pale stones on the floor.
  const tufts: THREE.Matrix4[] = [], colors: THREE.Color[] = [];
  for (let i = 0; i < 420; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R + 6);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const s = 0.6 + rand() * 0.9;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.7, rand() * 6, (rand() - 0.5) * 0.7));
    tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, terrainHeight(x, z) + 0.22 * s, z), q, new THREE.Vector3(s, s, s)));
    colors.push(new THREE.Color().setHSL(0.11 + rand() * 0.05, 0.12 + rand() * 0.1, 0.3 + rand() * 0.12));
  }
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.6, 3), mat(0xffffff), tufts.length);
  tufts.forEach((m, i) => grass.setMatrixAt(i, m));
  colors.forEach((c, i) => grass.setColorAt(i, c));
  b.dynamic(grass);
  const stone = surf('rock', 0xb8b2a4);
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2, r = 3 + rand() * (R - 2);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const s = 0.15 + rand() * 0.25;
    b.mesh(new THREE.DodecahedronGeometry(s), stone, x, terrainHeight(x, z) + s * 0.3, z).rotation.set(rand(), rand(), rand());
  }

  // Ash drifting up through the hollow.
  const n = 260;
  const ashPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R + 4);
    ashPos.set([cx + Math.cos(a) * r, floor + rand() * 9, cz + Math.sin(a) * r], i * 3);
  }
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
  const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: 0x9aa0a8, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false }));
  b.dynamic(ash);

  // A few bushes on the floor's edge (hearts for a long fight), added to the main bush field.
  const bushes: { x: number; y: number; z: number; rot: number }[] = [];
  for (const a of [entrance + 1.1, entrance - 1.2, entrance + 2.6, entrance - 2.5]) {
    const x = cx + Math.cos(a) * (R - 1.6), z = cz + Math.sin(a) * (R - 1.6);
    bushes.push({ x, z, y: terrainHeight(x, z), rot: rand() * 6 });
  }

  return {
    lamps,
    bushes,
    /** Drifts the ash upward, wrapping at the top. */
    update(dt: number) {
      const p = ashGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        let y = p.getY(i) + dt * (0.25 + (i % 7) * 0.05);
        if (y > floor + 9) y = floor;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(y * 1.3 + i) * dt * 0.15);
      }
      p.needsUpdate = true;
    },
  };
}

/** A bare tree: a leaning trunk and a few crooked branches, each with a twig. */
function deadTree(b: AreaBuilder, x: number, y: number, z: number, rand: () => number, bark: THREE.Material) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set((rand() - 0.5) * 0.25, rand() * 6, (rand() - 0.5) * 0.25);
  const h = 4 + rand() * 3;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.38, h, 6), bark);
  trunk.position.y = h / 2;
  g.add(trunk);
  const branches = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < branches; i++) {
    const len = 1.2 + rand() * 1.8;
    const by = h * (0.45 + rand() * 0.5);
    const yaw = rand() * Math.PI * 2, tilt = 0.6 + rand() * 0.7;
    const br = new THREE.Group();
    br.position.y = by;
    br.rotation.set(0, yaw, tilt);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.11, len, 5), bark);
    limb.position.y = len / 2;
    br.add(limb);
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, len * 0.6, 4), bark);
    twig.position.set(0, len * 0.9, 0);
    twig.rotation.z = -0.8 + rand() * 0.4;
    twig.translateY(len * 0.25);
    br.add(twig);
    g.add(br);
  }
  b.staticGroup.add(g);
  b.cylinder(x, y + 1.5, z, 1.5, 0.4, Layer.Prop);
}

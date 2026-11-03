import * as THREE from 'three';
import { fbm } from '../../core/math';
import { Layer } from '../../core/physics';
import { mat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { GROVE, inGate, inGorge, inHollow, inPass, isOpen, pathDist, placementHeight, riverZ, SHRINE, terrainHeight, VILLAGE } from './layout';

function instanced(b: AreaBuilder, geo: THREE.BufferGeometry, material: THREE.Material, ms: THREE.Matrix4[], colors?: THREE.Color[], shadow = true) {
  const im = new THREE.InstancedMesh(geo, material, ms.length);
  ms.forEach((m, i) => im.setMatrixAt(i, m));
  colors?.forEach((c, i) => im.setColorAt(i, c));
  im.castShadow = shadow;
  im.receiveShadow = true;
  b.dynamic(im);
  return im;
}

/**
 * Round trees and pines: a dense ring in the grove, clumps in the field, pines on the foothills.
 * Note on the seeded layout: every candidate draws the same random numbers whether or not it
 * ends up placed, so filtering out spots (like the hollow) never moves trees elsewhere.
 */
export function buildTrees(b: AreaBuilder) {
  const { rand } = b;
  const round: THREE.Matrix4[] = [], pine: THREE.Matrix4[] = [], trunks: THREE.Matrix4[] = [];
  const roundC: THREE.Color[] = [], pineC: THREE.Color[] = [];
  let placed = 0;
  const place = (x: number, z: number, kind: 'round' | 'pine') => {
    placed++;
    const y = terrainHeight(x, z);
    const s = 0.8 + rand() * 0.7;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0));
    const c1 = rand(), c2 = rand();
    if (inHollow(x, z, 8) || inGorge(x, z, 2) || inGate(x, z, 1) || inPass(x, z, 2)) return; // the hollow's rim has its own dead trees
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.2 * s, z), q, new THREE.Vector3(s, s, s)));
    if (kind === 'round') {
      round.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 3.6 * s, z), q, new THREE.Vector3(s * 2.2, s * 2, s * 2.2)));
      roundC.push(new THREE.Color().setHSL(0.26 + c1 * 0.06, 0.5, 0.3 + c2 * 0.1));
    } else {
      pine.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 4.2 * s, z), q, new THREE.Vector3(s, s, s)));
      pineC.push(new THREE.Color().setHSL(0.33 + c1 * 0.04, 0.45, 0.2 + c2 * 0.07));
    }
    b.cylinder(x, y + 1.5, z, 1.5, 0.45 * s, Layer.Prop);
  };
  let tries = 0;
  while (placed < 130 && tries++ < 4000) {
    const a = rand() * Math.PI * 2, r = 8 + Math.sqrt(rand()) * 30;
    const x = GROVE.x + Math.cos(a) * r, z = GROVE.z + Math.sin(a) * r;
    if (!isOpen(x, z, 3)) continue;
    place(x, z, rand() < 0.5 ? 'round' : 'pine');
  }
  tries = 0;
  let field = 0;
  while (field < 170 && tries++ < 8000) {
    const x = (rand() - 0.5) * 340, z = (rand() - 0.5) * 340;
    if (!isOpen(x, z) || fbm(x * 0.02 + 50, z * 0.02) < 0.52) continue;
    place(x, z, rand() < 0.75 ? 'round' : 'pine');
    field++;
  }
  tries = 0;
  let hill = 0;
  while (hill < 260 && tries++ < 8000) {
    const a = rand() * Math.PI * 2, r = 125 + rand() * 45;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isOpen(x, z)) continue;
    place(x, z, 'pine');
    hill++;
  }
  instanced(b, new THREE.CylinderGeometry(0.22, 0.35, 2.4, 6), mat(0x6b4423), trunks);
  instanced(b, new THREE.IcosahedronGeometry(1, 0), mat(0xffffff), round, roundC);
  instanced(b, new THREE.ConeGeometry(1.6, 5, 7), mat(0xffffff), pine, pineC);
}

export function buildRocks(b: AreaBuilder) {
  const { rand } = b;
  const ms: THREE.Matrix4[] = [];
  let tries = 0, placed = 0;
  while (placed < 140 && tries++ < 5000) {
    const x = (rand() - 0.5) * 360, z = (rand() - 0.5) * 360;
    if (!isOpen(x, z, 3)) continue;
    placed++;
    const s = 0.4 + Math.pow(rand(), 2) * 2.2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(), rand() * 6, rand()));
    if (inHollow(x, z, 1) || inGorge(x, z, 2) || inGate(x, z) || inPass(x, z, 2)) continue;
    const y = terrainHeight(x, z) + s * 0.3;
    ms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 0.75, s)));
    if (s > 0.9) b.ball(x, y, z, s * 0.8, s > 1.6 ? Layer.World : Layer.Prop);
  }
  instanced(b, new THREE.DodecahedronGeometry(1, 0), mat(0x8e8a82), ms);
}

/** Grass tufts and flowers: pure decoration, no collision. */
export function buildGrass(b: AreaBuilder) {
  const { rand } = b;
  const tufts: THREE.Matrix4[] = [], tuftC: THREE.Color[] = [];
  const flowers: THREE.Matrix4[] = [], flowerC: THREE.Color[] = [];
  const palette = [0xffffff, 0xffd84a, 0xf28bb0, 0xa6b8ff];
  let tries = 0, placed = 0;
  while (placed < 3200 && tries++ < 20000) {
    const x = (rand() - 0.5) * 340, z = (rand() - 0.5) * 340;
    const h = placementHeight(x, z);
    if (h < -0.2 || h > 28 || pathDist(x, z) < 2.2 || Math.hypot(x, z) > 170) continue;
    if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 8) continue;
    placed++;
    const y = terrainHeight(x, z);
    const s = 0.6 + rand() * 0.8;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4));
    const hue = rand(), light = rand(), flower = rand() < 0.18;
    const petal = flower ? palette[Math.floor(rand() * palette.length)] : 0;
    if (inHollow(x, z, 3) || inGorge(x, z, 1) || inGate(x, z) || inPass(x, z, 1)) continue; // the hollow has its own dead grass
    tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.25 * s, z), q, new THREE.Vector3(s, s, s)));
    tuftC.push(new THREE.Color().setHSL(0.24 + hue * 0.07, 0.55, 0.32 + light * 0.12));
    if (flower) {
      flowers.push(new THREE.Matrix4().compose(new THREE.Vector3(x + 0.4, y + 0.35, z + 0.2), q, new THREE.Vector3(1, 1, 1)));
      flowerC.push(new THREE.Color(petal));
    }
  }
  instanced(b, new THREE.ConeGeometry(0.18, 0.6, 3), mat(0xffffff), tufts, tuftC, false);
  instanced(b, new THREE.OctahedronGeometry(0.12), mat(0xffffff), flowers, flowerC, false);
}

/** Where cuttable bushes go: around the village fence and along the roads. */
export function bushSpots(b: AreaBuilder) {
  const { rand } = b;
  const spots: [number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    spots.push([VILLAGE.x + Math.cos(a) * (VILLAGE.r + 1.5), VILLAGE.z + Math.sin(a) * (VILLAGE.r + 1.5)]);
  }
  let tries = 0;
  while (spots.length < 110 && tries++ < 4000) {
    const x = (rand() - 0.5) * 300, z = (rand() - 0.5) * 300;
    const pd = pathDist(x, z);
    if (pd < 2.6 || pd > 9 || !isOpen(x, z, 2.6)) continue;
    spots.push([x, z]);
  }
  return spots
    .filter(([x, z]) => Math.abs(z - riverZ(x)) >= 11)
    .map(([x, z]) => ({ x, z, y: terrainHeight(x, z), rot: rand() * 6 }))
    .filter((s) => !inHollow(s.x, s.z, 1) && !inGorge(s.x, s.z, 2) && !inGate(s.x, s.z) && !inPass(s.x, s.z, 2));
}

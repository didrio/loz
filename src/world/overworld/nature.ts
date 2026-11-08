import * as THREE from 'three';
import { fbm } from '../../core/math';
import { Layer } from '../../core/physics';
import { kitMat, mat } from '../../render/materials';
import { pal } from '../../render/palette';
import { buildLoneOak as buildLoneOakModel, FLOWER_COLOURS, grassTuft, pineCrown, pineTint, rockShape, roundCrown, roundTint, treeTrunk, tuftTint } from '../../render/models/nature';
import type { AreaBuilder } from '../area';
import { GROVE, LONE_OAK, inGate, inGorge, inRuin, inHollow, inPass, isOpen, onVillageStep, pathDist, placementHeight, riverZ, SHRINE, terrainHeight, VILLAGE } from './layout';

export function instanced(b: AreaBuilder, geo: THREE.BufferGeometry, material: THREE.Material, ms: THREE.Matrix4[], colors?: THREE.Color[]) {
  const im = new THREE.InstancedMesh(geo, material, ms.length);
  ms.forEach((m, i) => im.setMatrixAt(i, m));
  colors?.forEach((c, i) => im.setColorAt(i, c));
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
    if (inHollow(x, z, 8) || inGorge(x, z, 2) || inGate(x, z, 1) || inPass(x, z, 2) || inRuin(x, z, 2) || Math.hypot(x - LONE_OAK.x, z - LONE_OAK.z) < 9) return; // the lone oak stands alone; the hollow's rim has its own dead trees
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 1.2 * s, z), q, new THREE.Vector3(s, s, s)));
    if (kind === 'round') {
      round.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 3.6 * s, z), q, new THREE.Vector3(s * 2.2, s * 2, s * 2.2)));
      roundC.push(new THREE.Color(roundTint(c1, c2)));
    } else {
      pine.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 4.2 * s, z), q, new THREE.Vector3(s, s, s)));
      pineC.push(new THREE.Color(pineTint(c1, c2)));
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
  // Trees block the baked light (render/bakeLight.ts): soft shade under their crowns where a region is baked.
  // The final models (render/models/nature.ts): white-painted, shaded geometry; each instance's colour is its palette tint.
  instanced(b, treeTrunk(), kitMat('bark'), trunks).userData.bakeLight = 'occlude';
  instanced(b, roundCrown(), kitMat('foliage'), round, roundC).userData.bakeLight = 'occlude';
  instanced(b, pineCrown(), kitMat('foliage'), pine, pineC).userData.bakeLight = 'occlude';
}

/** The lone oak at the grove road's bend: twice a field tree's size, broad and dark, so it reads from the crossroads. */
export function buildLoneOak(b: AreaBuilder) {
  const { x, z } = LONE_OAK;
  const y = terrainHeight(x, z);
  const oak = buildLoneOakModel().root;
  oak.position.set(x, y, z);
  b.staticGroup.add(oak);
  b.cylinder(x, y + 3, z, 3, 0.8, Layer.Prop);
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
    if (inHollow(x, z, 1) || inGorge(x, z, 2) || inGate(x, z) || inPass(x, z, 2) || inRuin(x, z, 1)) continue;
    const y = terrainHeight(x, z) + s * 0.3;
    ms.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 0.75, s)));
    if (s > 0.9) b.ball(x, y, z, s * 0.8, s > 1.6 ? Layer.World : Layer.Prop);
  }
  const rocks = instanced(b, rockShape(), kitMat('rock'), ms);
  rocks.userData.bakeLight = 'occlude';
  rocks.name = 'rocks'; // the look scene `vignette` finds one by this
}

/** Grass tufts and flowers: pure decoration, no collision. */
export function buildGrass(b: AreaBuilder) {
  const { rand } = b;
  const tufts: THREE.Matrix4[] = [], tuftC: THREE.Color[] = [];
  const flowers: THREE.Matrix4[] = [], flowerC: THREE.Color[] = [];
  const palette = FLOWER_COLOURS;
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
    if (inHollow(x, z, 3) || inGorge(x, z, 1) || inGate(x, z) || inPass(x, z, 1) || inRuin(x, z) || onVillageStep(x, z)) continue; // the hollow has its own dead grass
    tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.25 * s, z), q, new THREE.Vector3(s, s, s)));
    tuftC.push(new THREE.Color(tuftTint(hue, light)));
    if (flower) {
      flowers.push(new THREE.Matrix4().compose(new THREE.Vector3(x + 0.4, y + 0.35, z + 0.2), q, new THREE.Vector3(1, 1, 1)));
      flowerC.push(new THREE.Color(petal));
    }
  }
  instanced(b, grassTuft(), kitMat('foliage'), tufts, tuftC);
  instanced(b, new THREE.OctahedronGeometry(0.12), mat(pal('chalk', 3)), flowers, flowerC); // white, so each petal is its instance colour
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
    .filter((s) => !inHollow(s.x, s.z, 1) && !inGorge(s.x, s.z, 2) && !inGate(s.x, s.z) && !inPass(s.x, s.z, 2) && !inRuin(s.x, s.z, 1));
}

import * as THREE from 'three';
import { mat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { SIGNS } from './landmarks';
import { BUDS, LONE_OAK, inGate, inGorge, inHollow, inPass, inRuin, isOpen, terrainHeight, THICKETS, thicketClusters, THORN_SPREAD } from './layout';

/** A thorn's height at scale 1 (about three times the first growths'). */
const THORN_H = 4.5;
/** Clusters scattered through the open field (besides the thickets' rings). */
const FIELD_CLUSTERS = 30;

/** Where a cluster stands and how far its thorns reach: touching inside `r` hurts (game/blight.ts). */
export interface ThornCluster {
  x: number;
  y: number;
  z: number;
  r: number;
  /** How tall its tallest thorn stands at full growth: Wren above that is clear of it. */
  height: number;
}

/**
 * The blight's growths: clusters of tall violet thorns while the valley is sick, scattered in the open
 * field and ringed round a few things worth reaching (`THICKETS`, each with one way in). They hurt to touch
 * (the rule is `thornTouch` in game/blight.ts; no colliders, Wren is shoved back out), shrink away as the
 * blight lifts (`setLevel`) and are gone once it has. Drawn from their own RNG so they never move the trees.
 */
export function buildBlightGrowths(b: AreaBuilder, rand: () => number) {
  const centres: { x: number; z: number }[] = [];
  let tries = 0, scattered = 0;
  while (scattered < FIELD_CLUSTERS && tries++ < 3000) {
    const x = (rand() - 0.5) * 340, z = (rand() - 0.5) * 340;
    if (!fieldSpot(x, z)) continue;
    if (centres.some((c) => Math.hypot(c.x - x, c.z - z) < THORN_SPREAD * 4)) continue; // a lone clump, never a wall
    centres.push({ x, z });
    scattered++;
  }
  for (const t of THICKETS) centres.push(...thicketClusters(t));

  const bases: { x: number; y: number; z: number; q: THREE.Quaternion; s: number }[] = [];
  const colors: THREE.Color[] = [];
  const clusters: ThornCluster[] = [];
  for (const c of centres) {
    const y = terrainHeight(c.x, c.z);
    const thorns = 7 + Math.floor(rand() * 5);
    let height = 0;
    for (let i = 0; i < thorns; i++) {
      // The middle thorns stand tallest; the outer ones lean out, so a clump reads as a mound of spikes.
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (THORN_SPREAD - 1);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const s = (0.7 + rand() * 1.1) * (1.15 - (d / THORN_SPREAD) * 0.5);
      const lean = (d / THORN_SPREAD) * 0.6 + rand() * 0.2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), lean);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6));
      bases.push({ x, y: terrainHeight(x, z) - 0.2, z, q, s });
      colors.push(new THREE.Color().setHSL(0.76 + rand() * 0.06, 0.4, 0.14 + rand() * 0.08));
      height = Math.max(height, THORN_H * s);
    }
    clusters.push({ x: c.x, y, z: c.z, r: THORN_SPREAD, height });
  }

  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.6, THORN_H, 5).translate(0, THORN_H / 2, 0), mat(0xffffff, 0x1c0f2a), bases.length);
  colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  b.dynamic(mesh);

  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  let shown = -1;
  return {
    clusters,
    /** 1 = full grown, 0 = gone (hidden). Each thorn shrinks into its own base. */
    setLevel(level: number) {
      if (level === shown) return;
      shown = level;
      mesh.visible = level > 0.01;
      if (!mesh.visible) return;
      bases.forEach((t, i) => {
        scale.set(t.s, t.s * level, t.s);
        m.compose(pos.set(t.x, t.y, t.z), t.q, scale);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Open field a lone clump may stand in: clear of roads, ruins, buds, signs, the thickets and the passes. */
function fieldSpot(x: number, z: number) {
  if (!isOpen(x, z, THORN_SPREAD + 4)) return false;
  if (inGate(x, z, 8) || inHollow(x, z, 10) || inGorge(x, z, 6) || inPass(x, z, 6) || inRuin(x, z, 8)) return false;
  if (BUDS.some((u) => Math.hypot(u.x - x, u.z - z) < 10)) return false;
  if (SIGNS.some((s) => Math.hypot(s.x - x, s.z - z) < 8) || Math.hypot(LONE_OAK.x - x, LONE_OAK.z - z) < 10) return false;
  return !THICKETS.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + THORN_SPREAD * 4);
}

/** Below this growth the thorns are shrinking away and harmless. */
export const THORN_MIN_LEVEL = 0.5;

/** The clump a body at (x, y, z) with radius `bodyR` is touching at this blight level, or null. */
export function thornTouch<T extends ThornCluster>(clusters: readonly T[], x: number, y: number, z: number, level: number, bodyR = 0.4): T | null {
  if (level < THORN_MIN_LEVEL) return null;
  for (const c of clusters) {
    if (y > c.y + c.height * level || y < c.y - 2) continue;
    if (Math.hypot(x - c.x, z - c.z) < c.r + bodyR) return c;
  }
  return null;
}

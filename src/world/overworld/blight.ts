import * as THREE from 'three';
import { mat, uniqueMat } from '../../render/materials';
import type { AreaBuilder } from '../area';
import { SCARS, scarAt, scarLine, terrainHeight, THORN_SPREAD, thornClusters } from './layout';

/** A thorn's height at scale 1 (about three times the first growths'). */
const THORN_H = 4.5;
/** Sword hits a clump takes before it falls (game rule, docs/world.md "The blight"). */
export const THORN_HP = 5;
/** Below this growth the thorns are shrinking away and harmless (and the sword passes through them). */
export const THORN_MIN_LEVEL = 0.5;
/** How high above the ground Wren's feet clear a scar (mid-jump she's well above it). */
const SCAR_CLEAR = 0.35;

/** Where a cluster stands and how far its thorns reach: touching inside `r` hurts (game/blight.ts). */
export interface ThornCluster {
  /** Saved as a flag once cut down, e.g. `thorn.spine.3`. */
  id: `thorn.${string}`;
  x: number;
  y: number;
  z: number;
  r: number;
  /** How tall its tallest thorn stands at full growth: Wren above that is clear of it. */
  height: number;
  /** Sword hits left; 0 = cut down for good. */
  hp: number;
}

/** A clump the sword reached: where (for the chips) and whether that hit felled it. */
export interface ThornHit {
  id: `thorn.${string}`;
  at: THREE.Vector3;
  felled: boolean;
}

/**
 * The blight's growths while the valley is sick: the scars (jagged violet veins seeping from the gate) and
 * the thorn clumps (`thornClusters` in layout.ts: the thickets' rings, the veins' stretches, the lone ones).
 * Both hurt to touch (`thornTouch`, `scarTouch`; no colliders, Wren is shoved back out). The sword fells a
 * clump in `THORN_HP` hits, for good; scars can't be hurt. Everything shrinks away as the blight lifts
 * (`setLevel`). Thorn shapes come from their own RNG, so they never move the trees.
 */
export function buildBlightGrowths(b: AreaBuilder, rand: () => number) {
  const bases: { x: number; y: number; z: number; q: THREE.Quaternion; s: number; c: number }[] = [];
  const colors: THREE.Color[] = [];
  const clusters: ThornCluster[] = [];
  for (const c of thornClusters()) {
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
      bases.push({ x, y: terrainHeight(x, z) - 0.2, z, q, s, c: clusters.length });
      colors.push(new THREE.Color().setHSL(0.76 + rand() * 0.06, 0.4, 0.14 + rand() * 0.08));
      height = Math.max(height, THORN_H * s);
    }
    clusters.push({ id: c.id, x: c.x, y, z: c.z, r: THORN_SPREAD, height, hp: THORN_HP });
  }

  const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.6, THORN_H, 5).translate(0, THORN_H / 2, 0), mat(0xffffff, 0x1c0f2a), bases.length);
  colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  b.dynamic(mesh);
  const scars = buildScars(b);

  /** Each clump's look: how far a hit is still shaking it (s), and its size from the hits taken. */
  const shake = new Float32Array(clusters.length);
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), wobble = new THREE.Quaternion(), axis = new THREE.Vector3();
  let shown = -1, dirty = true;
  const draw = () => {
    dirty = false;
    mesh.visible = shown > 0.01;
    if (!mesh.visible) return;
    bases.forEach((t, i) => {
      const c = clusters[t.c];
      // A felled clump is gone; a hurt one stands a little lower for every hit (so progress shows).
      const k = c.hp <= 0 ? 0 : shown * (1 - 0.1 * (THORN_HP - c.hp));
      const sh = shake[t.c];
      wobble.setFromAxisAngle(axis.set(Math.cos(i), 0, Math.sin(i)), Math.sin(sh * 60) * sh * 0.8);
      scale.set(t.s * (k > 0 ? 1 : 0), t.s * k, t.s * (k > 0 ? 1 : 0));
      m.compose(pos.set(t.x, t.y, t.z), wobble.multiply(t.q), scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    clusters,
    /** 1 = full grown, 0 = gone (hidden). Each thorn shrinks into its own base, and the veins narrow and sink. */
    setLevel(level: number) {
      if (level !== shown) {
        shown = level;
        dirty = true;
        scars.setLevel(level);
      }
      if (dirty) draw();
    },
    /** Lets the shudder of a hit die down. */
    update(dt: number) {
      for (let i = 0; i < shake.length; i++) {
        if (shake[i] <= 0) continue;
        shake[i] = Math.max(0, shake[i] - dt);
        dirty = true;
      }
      if (dirty) draw();
    },
    /** A sword swing from (x, z) facing (dirX, dirZ): the standing clumps it reaches each take a hit. */
    hit(x: number, z: number, dirX: number, dirZ: number, reach: number): ThornHit[] {
      if (shown < THORN_MIN_LEVEL) return [];
      const out: ThornHit[] = [];
      clusters.forEach((c, i) => {
        if (c.hp <= 0) return;
        const hit = swingReaches(c, x, z, dirX, dirZ, reach);
        if (!hit) return;
        c.hp--;
        shake[i] = 0.25;
        dirty = true;
        out.push({ id: c.id, at: new THREE.Vector3(hit.x, terrainHeight(hit.x, hit.z) + 1.2, hit.z), felled: c.hp <= 0 });
      });
      return out;
    },
    /** Save restore: clumps cut down in an earlier visit stay gone. */
    restore(isCut: (id: ThornCluster['id']) => boolean) {
      for (const c of clusters) if (isCut(c.id)) c.hp = 0;
      dirty = true;
      if (shown >= 0) draw();
    },
  };
}

/**
 * Does a swing from (x, z) facing (dirX, dirZ) reach a clump? Wren can't stand inside it (it hurts), so the
 * blade has to reach its edge: within `reach` of the rim, and the clump roughly ahead. Returns the point struck.
 */
export function swingReaches(c: { x: number; z: number; r: number }, x: number, z: number, dirX: number, dirZ: number, reach: number) {
  const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz);
  if (d - c.r > reach) return null;
  if (d > 0.5 && (dx * dirX + dz * dirZ) / d < 0.35) return null;
  const k = d > 0.5 ? Math.max(0, d - c.r) / d : 0;
  return { x: x + dx * k, z: z + dz * k };
}

/** The standing clump a body at (x, y, z) with radius `bodyR` is touching at this blight level, or null. */
export function thornTouch<T extends Omit<ThornCluster, 'id'>>(clusters: readonly T[], x: number, y: number, z: number, level: number, bodyR = 0.4): T | null {
  if (level < THORN_MIN_LEVEL) return null;
  for (const c of clusters) {
    if (c.hp <= 0) continue;
    if (y > c.y + c.height * level || y < c.y - 2) continue;
    if (Math.hypot(x - c.x, z - c.z) < c.r + bodyR) return c;
  }
  return null;
}

/**
 * The scar under feet at (x, y, z) at this blight level, or null: they hurt only while Wren stands on one
 * (mid-jump she's clear). Returns a point just inside it on her side, so a shove *from* there throws her out.
 */
export function scarTouch(x: number, y: number, z: number, level: number, groundY = terrainHeight(x, z)) {
  if (level < THORN_MIN_LEVEL || y > groundY + SCAR_CLEAR) return null;
  const s = scarAt(x, z, level);
  return s && { x: x - s.out.x, z: z - s.out.z };
}

/**
 * The scars' look: per vein, a dark violet band with ragged edges and a faint glowing crack down its middle,
 * draped on the land. As the blight lifts each narrows toward its middle and sinks into the ground.
 */
function buildScars(b: AreaBuilder) {
  const band = scarStrip(1, 0.1, 0.12);
  const crack = scarStrip(0.28, 0.14, 0.04);
  const bandMesh = new THREE.Mesh(band.geo, uniqueMat(0x3a1850, { emissive: 0x1a0828, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const crackMesh = new THREE.Mesh(crack.geo, new THREE.MeshBasicMaterial({ color: 0xb45ef0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  bandMesh.receiveShadow = true;
  b.dynamic(bandMesh);
  b.dynamic(crackMesh);
  return {
    setLevel(level: number) {
      bandMesh.visible = crackMesh.visible = level > 0.01;
      band.shrink(level);
      crack.shrink(level);
    },
  };
}

/** One triangle strip per vein at `share` of its width, `lift` above the land, edges ragged by `rag` of the width. */
function scarStrip(share: number, lift: number, rag: number) {
  const full: number[] = [], mid: number[] = [], index: number[] = [];
  let n = 0;
  for (const scar of SCARS) {
    const line = scarLine(scar);
    line.forEach((p, j) => {
      const a = line[Math.max(0, j - 1)], c = line[Math.min(line.length - 1, j + 1)];
      const tx = c.x - a.x, tz = c.z - a.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      // The ends close to a point; in between, each edge is knocked in or out on its own.
      const end = j === 0 || j === line.length - 1 ? 0.15 : 1;
      for (const side of [-1, 1]) {
        const half = (p.w / 2) * share * end * (1 + rag * Math.sin(j * 4.1 + side * 1.7 + p.x));
        const x = p.x + nx * half * side, z = p.z + nz * half * side;
        full.push(x, terrainHeight(x, z) + lift, z);
        mid.push(p.x, terrainHeight(x, z) - 0.25, p.z);
      }
      if (j > 0) index.push(n - 2, n - 1, n, n - 1, n + 1, n);
      n += 2;
    });
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.Float32BufferAttribute(full.slice(), 3);
  geo.setAttribute('position', posAttr);
  geo.setIndex(index);
  geo.computeVertexNormals();
  return {
    geo,
    /** Moves every edge vertex toward its sunken middle: 1 = full, 0 = a hairline under the ground. */
    shrink(level: number) {
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < arr.length; i++) arr[i] = mid[i] + (full[i] - mid[i]) * level;
      posAttr.needsUpdate = true;
      geo.computeBoundingSphere();
    },
  };
}


import * as THREE from 'three';
import { gatherPoints, occluderTree, POINT_STRIDE, TERM_STRIDE } from './bakeGather';
import { gatherInBackground } from './bakePool';

/**
 * Baked bounce light (vertex GI): how much open sky each vertex of the scenery sees, plus the colour of whatever
 * blocks the rest, worked out once when an area is built and multiplied into its vertex colours. It's what the
 * N64-era games painted into their vertices, computed instead of hand-painted: dark corners and eaves, contact
 * shade where a house meets the ground, grass-green light under a ledge, a warm wall tinting the path beside it.
 *
 * It's a multiplier on the surface colour, not light: the sun, the hemisphere light and the point lights still
 * light everything at runtime, so day and night keep working. Like a printed shadow on a fabric, not a lamp.
 *
 * Three stages: **prep** (main thread: find the receivers and occluders, split big faces, list the unique points),
 * **gather** (render/bakeGather.ts, in background workers: rays → raw terms per point), **compose** (main thread:
 * terms × the strength numbers → colours). The terms are kept, so the strength changes live (Dev tab) without
 * casting a ray. Areas ask for it with `AreaBuilder.bakeLight`; dungeons queue their floors themselves.
 */

/** How strongly the terms turn into colour. Live: `setBakeStrength` recomposes everything baked with that profile. */
export interface BakeStrength {
  /** How much the blocked share of the sky darkens (1: a vertex that sees half the sky gets half the light). */
  occlusion: number;
  /** The darkest a vertex gets (before the tint), so a deep corner stays readable. */
  floor: number;
  /** How far blocked rays tint toward the hue they hit, at full blockage (grass-green under eaves, a red wall's glow). */
  bleed: number;
}

/**
 * `sky`: outdoors, light from the open sky. `indoor`: dungeons, whose ceilings are left out of the occluders so the
 * open top counts as sky; what's left is corner shade (ambient occlusion), gentler, since lamps light the rooms.
 */
export type BakeProfile = 'sky' | 'indoor';

export const BAKE = {
  /** Rays per vertex (cosine-weighted over the hemisphere the face looks into). */
  rays: 32,
  /** How far a ray looks, m: anything farther counts as open sky. Sets the size of the soft shade. */
  reach: 8,
  /**
   * Big triangles in a region are split to about this edge, m, before baking (`subdivide`). 2 m (the village trial)
   * doubled the valley's triangles and took a dungeon from ~80k to ~450k; 4 m adds about a third, with coarser,
   * N64-like gradients.
   */
  cell: 4,
  sky: { occlusion: 1, floor: 0.3, bleed: 0.6 } as BakeStrength,
  indoor: { occlusion: 0.7, floor: 0.5, bleed: 0.3 } as BakeStrength,
  /**
   * Whether areas bake the regions they ask for. Only in a browser: unit tests build the overworld a dozen times for
   * its logic and don't need the colours (they call `bakeLight` directly).
   */
  atBuild: typeof window !== 'undefined',
};

/** The defaults, for the Dev tab's reset. */
export const BAKE_DEFAULTS: Record<BakeProfile, BakeStrength> = { sky: { ...BAKE.sky }, indoor: { ...BAKE.indoor } };

/** A round region to bake, in world metres; `feather` m inside its edge the effect fades to nothing. */
export interface LightRegion {
  x: number;
  z: number;
  r: number;
  feather: number;
  /**
   * Circles left alone: rooms. The bake models light from the sky, and a closed room sees none, so it would sink to
   * `floor` though its lamps light it (the mill's room did).
   */
  except?: { x: number; z: number; r: number }[];
}

/** Covers anything: a dungeon's floor, baked whole. */
export const EVERYWHERE: LightRegion = { x: 0, z: 0, r: 1e6, feather: 1 };

/**
 * What a dynamic object is to the bake (`object.userData.bakeLight`): a `receive`r (the terrain) gets baked and
 * blocks rays; an `occlude`r (instanced trees) only blocks rays. Merged scenery is both without being marked.
 */
export type BakeRole = 'receive' | 'occlude';

/** One baked geometry: what it needs to compose its colours again with new strength numbers. */
interface Baked {
  profile: BakeProfile;
  /** The colours from before the bake (with the merge's rule-of-thumb shade). */
  plain: Float32Array;
  /** The composed colours (shown while the bake is on). */
  lit: Float32Array;
  /** Per vertex: the rule-of-thumb shade to divide out, the region weight, and the point its terms are at (-1: none). */
  shade: Float32Array;
  weight: Float32Array;
  point: Int32Array;
  terms: Float32Array;
}

const baked = new Map<THREE.BufferGeometry, Baked>();
let bakedOn = true;

export function bakedLightOn() {
  return bakedOn;
}

/** Shows the baked colours (on) or the colours from before the bake (off) on everything baked so far. Live. */
export function setBakedLight(on: boolean) {
  bakedOn = on;
  for (const [g, b] of baked) show(g, b);
}

/** Changes a profile's strength and recomposes everything baked with it. Live. */
export function setBakeStrength(profile: BakeProfile, s: Partial<BakeStrength>) {
  Object.assign(BAKE[profile], s);
  for (const [g, b] of baked) {
    if (b.profile !== profile) continue;
    compose(b);
    show(g, b);
  }
}

function show(g: THREE.BufferGeometry, b: Baked) {
  const attr = g.attributes.color as THREE.BufferAttribute;
  attr.array = bakedOn ? b.lit : b.plain;
  attr.needsUpdate = true;
}

/** The terms × the strength → `lit`, fading from `plain` across a region's feather. */
function compose(b: Baked) {
  const { occlusion, floor, bleed } = BAKE[b.profile];
  const { plain, lit, shade, weight, point, terms } = b;
  for (let v = 0; v < point.length; v++) {
    const i = v * 3;
    const p = point[v];
    if (p < 0) {
      lit[i] = plain[i];
      lit[i + 1] = plain[i + 1];
      lit[i + 2] = plain[i + 2];
      continue;
    }
    const o = p * TERM_STRIDE;
    const sky = Math.max(floor, 1 - occlusion * (1 - terms[o]));
    // The blocked rays' average hue, mixed in by how much of the view they take up.
    const mix = bleed * terms[o + 1];
    const w = weight[v], s = shade[v];
    for (let ch = 0; ch < 3; ch++) {
      const light = sky * (1 + (terms[o + 2 + ch] - 1) * mix);
      lit[i + ch] = plain[i + ch] + ((plain[i + ch] / s) * light - plain[i + ch]) * w;
    }
  }
}

/** 0 outside every region, 1 well inside one, a smooth ramp across the feather. */
export function regionWeight(regions: LightRegion[], x: number, z: number) {
  let w = 0;
  for (const g of regions) {
    if (g.except?.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue;
    const d = Math.hypot(x - g.x, z - g.z);
    const t = Math.min(1, Math.max(0, (g.r - d) / g.feather));
    w = Math.max(w, t * t * (3 - 2 * t));
  }
  return w;
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

/** What to bake: `receivers` get colours, `occluders` (receivers included) block rays. World transforms must be current. */
export interface BakeSet {
  receivers: THREE.Mesh[];
  occluders: THREE.Mesh[];
}

/**
 * The bake set of an area as `AreaBuilder.finish` has it: merged scenery is both (opaque, vertex-coloured, not
 * glowing), dynamic objects take part by `userData.bakeLight`. Both roots must be at the origin, unparented.
 */
export function collectBakeSet(merged: THREE.Object3D, dynamic?: THREE.Object3D): BakeSet {
  const receivers: THREE.Mesh[] = [];
  const occluders: THREE.Mesh[] = [];
  merged.updateMatrixWorld(true);
  merged.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshLambertMaterial;
    if (m.transparent) return;
    occluders.push(o);
    if (m.vertexColors && o.geometry.attributes.color && !(m.emissive && m.emissive.getHex())) receivers.push(o);
  });
  dynamic?.updateMatrixWorld(true);
  dynamic?.traverse((o) => {
    const role = o.userData.bakeLight as BakeRole | undefined;
    if (!role || !(o instanceof THREE.Mesh)) return;
    occluders.push(o);
    if (role === 'receive' && o.geometry.attributes.color && !(o instanceof THREE.InstancedMesh)) receivers.push(o);
  });
  return { receivers, occluders };
}

/** A prepared job: the occluder soup and points to gather, and how to apply the terms when they come back. */
interface Prepared {
  occPos: Float32Array;
  occAlb: Float32Array;
  points: Float32Array;
  apply(terms: Float32Array): void;
}

/**
 * Prep: splits the receivers' big faces, lists their unique points (a corner shared by faces with one normal is
 * gathered once) and builds the occluder soup. Every merged geometry loses its `shade` attribute here (kept aside for
 * compose). Null when there's nothing to bake.
 */
function prepare(set: BakeSet, regions: LightRegion[], profile: BakeProfile): Prepared | null {
  for (const o of set.occluders) {
    const shade = o.geometry.attributes.shade;
    if (shade) {
      o.geometry.userData.bakeShade = new Float32Array(shade.array as Float32Array);
      o.geometry.deleteAttribute('shade');
    }
  }
  const occ = buildOccluders(set.occluders, regions);
  if (!occ) return null;

  const keys = new Map<string, number>();
  const pts: number[] = [];
  const records: { g: THREE.BufferGeometry; b: Baked }[] = [];
  const n = new THREE.Vector3(), v = new THREE.Vector3();
  for (const mesh of set.receivers) {
    if (mesh.geometry.index) continue; // merged scenery and the terrain are non-indexed; anything else isn't ours
    const finer = subdivide(mesh.geometry, mesh.matrixWorld, regions);
    if (finer !== mesh.geometry) {
      mesh.geometry.dispose();
      mesh.geometry = finer;
    }
    const g = mesh.geometry;
    const p = g.attributes.position;
    const color = g.attributes.color as THREE.BufferAttribute;
    const kept = g.userData.bakeShade as Float32Array | undefined;
    delete g.userData.bakeShade;
    const shade = kept && kept.length === p.count ? kept : new Float32Array(p.count).fill(1);
    const weight = new Float32Array(p.count);
    const point = new Int32Array(p.count).fill(-1);
    let any = false;
    for (let f = 0; f + 2 < p.count; f += 3) {
      tmpA.fromBufferAttribute(p, f).applyMatrix4(mesh.matrixWorld);
      tmpB.fromBufferAttribute(p, f + 1).applyMatrix4(mesh.matrixWorld);
      tmpC.fromBufferAttribute(p, f + 2).applyMatrix4(mesh.matrixWorld);
      n.subVectors(tmpB, tmpA).cross(tmpC.sub(tmpA));
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(p, f + k).applyMatrix4(mesh.matrixWorld);
        const w = regionWeight(regions, v.x, v.z);
        if (w <= 0) continue;
        const key = `${Math.round(v.x * 50)},${Math.round(v.y * 50)},${Math.round(v.z * 50)},${Math.round(n.x * 20)},${Math.round(n.y * 20)},${Math.round(n.z * 20)}`;
        let idx = keys.get(key);
        if (idx === undefined) {
          idx = pts.length / POINT_STRIDE;
          keys.set(key, idx);
          pts.push(v.x, v.y, v.z, n.x, n.y, n.z);
        }
        weight[f + k] = w;
        point[f + k] = idx;
        any = true;
      }
    }
    if (!any) continue;
    const plain = new Float32Array(color.array as Float32Array);
    records.push({ g, b: { profile, plain, lit: new Float32Array(plain), shade, weight, point, terms: new Float32Array(0) } });
  }
  if (!records.length) return null;
  let dead = false;
  const onDispose = () => {
    dead = true;
  };
  for (const { g } of records) g.addEventListener('dispose', onDispose);
  return {
    ...occ,
    points: new Float32Array(pts),
    apply(terms) {
      for (const { g } of records) g.removeEventListener('dispose', onDispose);
      if (dead) return; // the area went before its bake came back
      for (const { g, b } of records) {
        b.terms = terms;
        compose(b);
        baked.set(g, b);
        show(g, b);
        g.addEventListener('dispose', () => baked.delete(g));
      }
    },
  };
}

/** How long one bake took, for the report and the look scene. */
export interface BakeStat {
  label: string;
  points: number;
  occluderTris: number;
  /** Main-thread time to prepare (split, list points, build the soup), ms. */
  prepMs: number;
  /** From queueing to the colours landing, ms (the workers' share; the game runs meanwhile). */
  totalMs: number;
}

export const bakeStats: BakeStat[] = [];
let pending = 0;
let idle: (() => void)[] = [];

/** How many bakes are still out in the workers. */
export function bakePending() {
  return pending;
}

/** Resolves once no bake is out (the look harness waits on it before a shot, so baselines don't depend on timing). */
export function bakeSettled(): Promise<void> {
  return pending === 0 ? Promise.resolve() : new Promise((resolve) => idle.push(resolve));
}

/** Bakes `set` in the background; the colours land when the workers are done. */
export function queueBake(label: string, set: BakeSet, regions: LightRegion[], profile: BakeProfile = 'sky') {
  const t0 = Date.now();
  const job = prepare(set, regions, profile);
  if (!job) return;
  const prepMs = Date.now() - t0;
  pending++;
  gatherInBackground(job.occPos, job.occAlb, job.points, BAKE.rays, BAKE.reach).then((terms) => {
    job.apply(terms);
    const stat = { label, points: job.points.length / POINT_STRIDE, occluderTris: job.occPos.length / 9, prepMs: Math.round(prepMs), totalMs: Math.round(Date.now() - t0) };
    bakeStats.push(stat);
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) console.info('[bake]', stat);
    if (--pending === 0) {
      const done = idle;
      idle = [];
      for (const resolve of done) resolve();
    }
  });
}

/**
 * Bakes on the spot (unit tests): `merged` scenery and `dynamic` objects marked by role, as `AreaBuilder.finish`
 * would queue them.
 */
export function bakeLight(merged: THREE.Object3D, dynamic: THREE.Object3D, regions: LightRegion[], profile: BakeProfile = 'sky') {
  const job = prepare(collectBakeSet(merged, dynamic), regions, profile);
  if (job) job.apply(gatherPoints(occluderTree(job.occPos), job.occAlb, job.points, BAKE.rays, BAKE.reach));
}

/**
 * Splits each big triangle in the regions into a k×k grid of smaller ones (k from its longest edge and `BAKE.cell`),
 * so the bake has vertices to hold a gradient: a cottage wall is one quad otherwise, and its shade could only run
 * corner to corner. Every attribute is interpolated, so the faces, colours and textures look the same; the two
 * triangles of a rectangle share their longest edge, so they split alike. Returns `g` itself when nothing needed it.
 * (A `bakeShade` in `userData` is split along.)
 */
export function subdivide(g: THREE.BufferGeometry, world: THREE.Matrix4, regions: LightRegion[]) {
  if (g.index) return g;
  const p = g.attributes.position;
  const names = Object.keys(g.attributes);
  const attrs = names.map((n) => g.attributes[n] as THREE.BufferAttribute);
  const kept = g.userData.bakeShade as Float32Array | undefined;
  if (kept) attrs.push(new THREE.BufferAttribute(kept, 1));
  const out: number[][] = attrs.map(() => []);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let split = false;
  const vertex = (f: number, u: number, v: number) => {
    // The point at barycentric (1-u-v, u, v) of triangle f: A + (B-A)u + (C-A)v, for every attribute.
    attrs.forEach((attr, ai) => {
      for (let ch = 0; ch < attr.itemSize; ch++) {
        const A = attr.getComponent(f, ch), B = attr.getComponent(f + 1, ch), C = attr.getComponent(f + 2, ch);
        out[ai].push(A + (B - A) * u + (C - A) * v);
      }
    });
  };
  for (let f = 0; f + 2 < p.count; f += 3) {
    a.fromBufferAttribute(p, f).applyMatrix4(world);
    b.fromBufferAttribute(p, f + 1).applyMatrix4(world);
    c.fromBufferAttribute(p, f + 2).applyMatrix4(world);
    const inside = regionWeight(regions, a.x, a.z) > 0 || regionWeight(regions, b.x, b.z) > 0 || regionWeight(regions, c.x, c.z) > 0;
    const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const k = inside ? Math.max(1, Math.round(longest / BAKE.cell)) : 1;
    if (k > 1) split = true;
    for (let i = 0; i < k; i++) {
      for (let j = 0; i + j < k; j++) {
        vertex(f, i / k, j / k);
        vertex(f, (i + 1) / k, j / k);
        vertex(f, i / k, (j + 1) / k);
        if (i + j < k - 1) {
          vertex(f, (i + 1) / k, j / k);
          vertex(f, (i + 1) / k, (j + 1) / k);
          vertex(f, i / k, (j + 1) / k);
        }
      }
    }
  }
  if (!split) return g;
  const finer = new THREE.BufferGeometry();
  names.forEach((name, ai) => finer.setAttribute(name, new THREE.BufferAttribute(new Float32Array(out[ai]), attrs[ai].itemSize)));
  finer.userData = { ...g.userData };
  if (kept) finer.userData.bakeShade = new Float32Array(out[attrs.length - 1]);
  return finer;
}

/** One world-space triangle soup of everything that blocks light near the regions, with each triangle's colour. */
function buildOccluders(meshes: THREE.Mesh[], regions: LightRegion[]): { occPos: Float32Array; occAlb: Float32Array } | null {
  const near = (x: number, z: number) =>
    regions.some((g) => Math.hypot(x - g.x, z - g.z) < g.r + BAKE.reach + 2);
  const pos: number[] = [];
  const alb: number[] = [];
  const m4 = new THREE.Matrix4(), world = new THREE.Matrix4();
  const tint = new THREE.Color(), c = new THREE.Color();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const p = g.attributes.position;
    const col = (mesh.material as THREE.MeshLambertMaterial).vertexColors ? g.attributes.color : undefined;
    const index = g.index;
    const tris = (index ? index.count : p.count) / 3;
    const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    const base = (mesh.material as THREE.MeshLambertMaterial).color ?? c.set(1, 1, 1);
    for (let k = 0; k < instances; k++) {
      if (mesh instanceof THREE.InstancedMesh) {
        mesh.getMatrixAt(k, m4);
        world.multiplyMatrices(mesh.matrixWorld, m4);
        tint.copy(base);
        if (mesh.instanceColor) tint.multiply(c.fromBufferAttribute(mesh.instanceColor, k));
        tmpA.setFromMatrixPosition(world);
        if (!near(tmpA.x, tmpA.z)) continue;
      } else {
        world.copy(mesh.matrixWorld);
        tint.copy(base);
      }
      for (let t = 0; t < tris; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        tmpA.fromBufferAttribute(p, i0).applyMatrix4(world);
        tmpB.fromBufferAttribute(p, i1).applyMatrix4(world);
        tmpC.fromBufferAttribute(p, i2).applyMatrix4(world);
        if (!near((tmpA.x + tmpB.x + tmpC.x) / 3, (tmpA.z + tmpB.z + tmpC.z) / 3)) continue;
        pos.push(tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z, tmpC.x, tmpC.y, tmpC.z);
        if (col) {
          alb.push(
            (tint.r * (col.getX(i0) + col.getX(i1) + col.getX(i2))) / 3,
            (tint.g * (col.getY(i0) + col.getY(i1) + col.getY(i2))) / 3,
            (tint.b * (col.getZ(i0) + col.getZ(i1) + col.getZ(i2))) / 3,
          );
        } else alb.push(tint.r, tint.g, tint.b);
      }
    }
  }
  if (!pos.length) return null;
  return { occPos: new Float32Array(pos), occAlb: new Float32Array(alb) };
}

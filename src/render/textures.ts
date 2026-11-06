import * as THREE from 'three';
import { mulberry32 } from '../core/math';

/**
 * Generated textures (owner's call, 2026-11-06: drawn in code, never imported). A texture here is a
 * small grey **detail tile**: it only brightens or darkens the material's own colour, so one "plaster"
 * tile serves every plaster colour and the palette stays the palette. Tiles are placed by position, not
 * UVs (`mergeStatic` drops UVs): the shader works out each face's normal and projects the tile onto it,
 * along the wall for walls and downhill for slopes (see `applySurface`). Details: engine.md "Textures".
 */

/** The tiles. Each is `size × size`, one byte a texel, mean about 128, and wraps seamlessly. */
export type TileId = 'plaster' | 'stone' | 'planks' | 'shingle' | 'ground' | 'rock';

/** What a material can be made of: which tile on its tops and walls, and how hard it shows. */
export type SurfaceId = 'plaster' | 'stone' | 'wood' | 'shingle' | 'ground';

/** Texels per metre on every surface (owner's call: ~3 cm, a PS2-ish density). */
export const TEXELS_PER_METRE = 32;

interface SurfaceDef {
  top: TileId;
  side: TileId;
  /** How far a texel of 0 or 255 pulls the colour (0.5 = ±50%); the tiles' spread makes most texels ±10–20%. */
  strength: number;
}

export const SURFACES: Record<SurfaceId, SurfaceDef> = {
  plaster: { top: 'plaster', side: 'plaster', strength: 0.4 },
  stone: { top: 'stone', side: 'stone', strength: 0.6 },
  wood: { top: 'planks', side: 'planks', strength: 0.6 },
  shingle: { top: 'shingle', side: 'shingle', strength: 0.6 },
  ground: { top: 'ground', side: 'rock', strength: 0.5 },
};

export const TILE_SIZE: Record<TileId, number> = { plaster: 64, stone: 64, planks: 64, shingle: 64, ground: 128, rock: 64 };

/** The spread every tile is normalized to (its standard deviation, on 0–1), so surfaces differ only by `strength`. */
export const TILE_SPREAD = 0.16;

// ---- Drawing the tiles (pure: seeded, no DOM, unit-tested) ----

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/**
 * Value noise that tiles: a `cx × cy` lattice of random values, smoothly interpolated and wrapped at
 * the edges, sampled on an `n × n` grid. Different cx and cy stretch it (wood grain).
 */
export function periodicNoise(n: number, cx: number, cy: number, rnd: () => number) {
  const lattice = Array.from({ length: cx * cy }, () => rnd());
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * cy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
      const at = (i: number, j: number) => lattice[wrap(j, cy) * cx + wrap(i, cx)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      out[y * n + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/** Octaves of `periodicNoise`, each twice as fine and half as strong; roughly 0–1. */
function fbmTile(n: number, cx: number, cy: number, octaves: number, rnd: () => number) {
  const out = new Float32Array(n * n);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = periodicNoise(n, cx << o, cy << o, rnd);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Cuts `n` into pieces between `min` and `max` long (they sum to exactly `n`). */
function cuts(n: number, min: number, max: number, rnd: () => number) {
  const sizes: number[] = [];
  let left = n;
  while (left > 0) {
    let s = min + Math.floor(rnd() * (max - min + 1));
    if (left - s < min) s = left; // the last piece takes the rest (it may run a little over max)
    sizes.push(s);
    left -= s;
  }
  return sizes;
}

/** Shifts and scales `f` to mean 0.5 and spread `TILE_SPREAD`, clamps to 0–1, and stores it as bytes. */
export function finishTile(f: Float32Array) {
  let mean = 0;
  for (const v of f) mean += v;
  mean /= f.length;
  let sd = 0;
  for (const v of f) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / f.length) || 1;
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const v = 0.5 + ((f[i] - mean) / sd) * TILE_SPREAD;
    out[i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  return out;
}

/** Limewashed plaster: soft blotches, fine speckle and a few hairline cracks. */
function plaster(n: number, rnd: () => number) {
  const f = fbmTile(n, 4, 4, 3, rnd);
  for (let i = 0; i < f.length; i++) f[i] = f[i] * 0.6 + rnd() * 0.25;
  for (let c = 0; c < 3; c++) {
    let x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI * 2;
    const len = 8 + rnd() * 14;
    for (let s = 0; s < len; s++) {
      f[wrap(Math.floor(y), n) * n + wrap(Math.floor(x), n)] -= 0.45;
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  return f;
}

/** Coursed stone: rows of blocks (0.25–0.4 m tall), staggered, each its own tone, in dark mortar. */
function stone(n: number, rnd: () => number) {
  const grain = fbmTile(n, 8, 8, 2, rnd);
  const f = new Float32Array(n * n);
  let y0 = 0;
  for (const h of cuts(n, 8, 13, rnd)) {
    const offset = Math.floor(rnd() * n);
    let x0 = offset;
    for (const w of cuts(n, 12, 24, rnd)) {
      const tone = 0.35 + rnd() * 0.5;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y0 + y) * n + wrap(x0 + x, n);
          const mortar = y === 0 || x === 0;
          const edge = y === 1 || x === 1 || y === h - 1 || x === w - 1;
          f[i] = mortar ? -0.35 : tone + grain[i] * 0.45 - (edge ? 0.12 : 0) + (y === h - 1 ? 0.05 : 0);
        }
      }
      x0 += w;
    }
    y0 += h;
  }
  return f;
}

/** Planks running up the tile (v): ~0.2 m wide, dark seams, a grain streak along each, the odd butt joint and knot. */
function planks(n: number, rnd: () => number) {
  const grain = fbmTile(n, 16, 2, 2, rnd);
  const f = new Float32Array(n * n);
  let x0 = 0;
  for (const w of cuts(n, 6, 8, rnd)) {
    const tone = 0.35 + rnd() * 0.4;
    const joint = rnd() < 0.5 ? Math.floor(rnd() * n) : -1;
    const knot = rnd() < 0.4 ? { x: 2 + rnd() * (w - 4), y: rnd() * n } : null;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * n + x0 + x;
        let v = tone + grain[i] * 0.6;
        if (x === 0) v = -0.3;
        else if (x === w - 1) v -= 0.1;
        if (y === joint) v = -0.25;
        if (knot && Math.hypot((x - knot.x) * 1.4, wrap(y - Math.floor(knot.y) + n / 2, n) - n / 2) < 1.6) v -= 0.4;
        f[i] = v;
      }
    }
    x0 += w;
  }
  return f;
}

/**
 * Overlapping shingles in rows across the slope; v runs downhill. Each row starts in the shadow of
 * the row above's lip, and its own lower edge catches the light; staggered gaps between shingles.
 */
function shingle(n: number, rnd: () => number) {
  const grain = fbmTile(n, 8, 8, 2, rnd);
  const f = new Float32Array(n * n);
  const rowH = 8;
  for (let r = 0; r < n / rowH; r++) {
    const offset = Math.floor(rnd() * n);
    let x0 = offset;
    for (const w of cuts(n, 7, 11, rnd)) {
      const tone = 0.4 + rnd() * 0.35;
      for (let y = 0; y < rowH; y++) {
        for (let x = 0; x < w; x++) {
          const i = (r * rowH + y) * n + wrap(x0 + x, n);
          let v = tone + grain[i] * 0.4 + (y / rowH) * 0.25;
          if (y < 2) v -= 0.35 - y * 0.15;
          if (x === 0) v = -0.2;
          f[i] = v;
        }
      }
      x0 += w;
    }
  }
  return f;
}

/** Earth: clumps, speckle and a scatter of pebbles (light or dark, 1–2 texels). */
function ground(n: number, rnd: () => number) {
  const f = fbmTile(n, 8, 8, 3, rnd);
  for (let i = 0; i < f.length; i++) f[i] = f[i] + rnd() * 0.35;
  for (let p = 0; p < n * 0.6; p++) {
    const x = Math.floor(rnd() * n), y = Math.floor(rnd() * n);
    const v = rnd() < 0.5 ? 0.45 : -0.45;
    const big = rnd() < 0.4;
    for (let dy = 0; dy <= (big ? 1 : 0); dy++) for (let dx = 0; dx <= (big ? 1 : 0); dx++) f[wrap(y + dy, n) * n + wrap(x + dx, n)] += v;
  }
  return f;
}

/** Rock faces: broad patches crossed by ridged cracks. */
function rock(n: number, rnd: () => number) {
  const base = fbmTile(n, 4, 4, 3, rnd);
  const ridges = fbmTile(n, 6, 6, 2, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) {
    const crack = Math.abs(ridges[i] - 0.5) < 0.025 ? -0.5 : 0;
    f[i] = base[i] + crack + rnd() * 0.12;
  }
  return f;
}

const DRAW: Record<TileId, (n: number, rnd: () => number) => Float32Array> = { plaster, stone, planks, shingle, ground, rock };

/** A tile's bytes: the same for the same id and seed, on every load. */
export function drawTile(id: TileId, seed = 1) {
  return finishTile(DRAW[id](TILE_SIZE[id], mulberry32(seed)));
}

// ---- The GPU side ----

const textures = new Map<TileId, THREE.DataTexture>();

/** The tile as a texture: one channel, repeating, nearest up close (chunky texels), mipmapped far off (no sparkle). */
export function tileTexture(id: TileId) {
  let t = textures.get(id);
  if (!t) {
    const n = TILE_SIZE[id];
    t = new THREE.DataTexture(drawTile(id), n, n, THREE.RedFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    textures.set(id, t);
  }
  return t;
}

/**
 * Sets a non-indexed geometry's normals to its faces' own (every vertex of a triangle gets the triangle's
 * normal). The projection reads the normal as a `flat` value, so it must be the face's: a cone's smooth
 * normals would tilt it. Free for flat-shaded materials, whose lighting never reads the attribute.
 * (Not the screen derivatives of the position: at world coordinates of ~150 m their float error, times
 * the position, shifts the tile by tens of cm from pixel to pixel; it smeared the well's roof.)
 */
export function faceNormals(geo: THREE.BufferGeometry) {
  if (geo.index) throw new Error('faceNormals needs a non-indexed geometry');
  const pos = geo.attributes.position;
  const normals = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1).sub(a);
    c.fromBufferAttribute(pos, i + 2).sub(a);
    b.cross(c).normalize();
    for (let k = 0; k < 3; k++) normals.set([b.x, b.y, b.z], (i + k) * 3);
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

/**
 * Projects a tile onto a face by its object-space position (merged statics are in world space; moving
 * things keep their tile), along the face's normal (`faceNormals`; `mergeStatic` sets them for textured
 * meshes). Walls: u along the wall, v up. Slopes: v runs downhill (stretched by the slope, so a texel
 * stays ~3 cm along it). Flat tops: x and z.
 */
const SURFACE_FRAGMENT = /* glsl */ `
#include <color_fragment>
{
  vec3 sn = normalize(vSurfNormal);
  float sh = length(sn.xz);
  vec2 suv;
  float sv;
  if (abs(sn.y) < sh) {
    vec2 t = sn.xz / sh;
    suv = vec2(dot(vSurfPos.xz, vec2(-t.y, t.x)), vSurfPos.y);
    sv = texture2D(surfSide, suv * surfSideRepeat).r;
  } else {
    if (sh > 0.2) {
      vec2 d = sn.xz / sh;
      suv = vec2(dot(vSurfPos.xz, vec2(-d.y, d.x)), dot(vSurfPos.xz, d) / abs(sn.y));
    } else {
      suv = vSurfPos.xz;
    }
    sv = texture2D(surfTop, suv * surfTopRepeat).r;
  }
  diffuseColor.rgb *= 1.0 + surfStrength * (sv - 0.5) * 2.0;
}`;

/**
 * Makes `m` show `surface`. Use on materials of your own (the terrain's, a BackSide room); shared
 * coloured ones come from `surf()` in materials.ts. Every textured material shares one shader program.
 */
export function applySurface<T extends THREE.MeshLambertMaterial>(m: T, surface: SurfaceId): T {
  const def = SURFACES[surface];
  m.onBeforeCompile = (shader) => {
    shader.uniforms.surfTop = { value: tileTexture(def.top) };
    shader.uniforms.surfSide = { value: tileTexture(def.side) };
    shader.uniforms.surfTopRepeat = { value: TEXELS_PER_METRE / TILE_SIZE[def.top] };
    shader.uniforms.surfSideRepeat = { value: TEXELS_PER_METRE / TILE_SIZE[def.side] };
    shader.uniforms.surfStrength = { value: def.strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nflat varying vec3 vSurfNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfPos = transformed;\nvSurfNormal = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nflat varying vec3 vSurfNormal;\nuniform sampler2D surfTop;\nuniform sampler2D surfSide;\nuniform float surfTopRepeat;\nuniform float surfSideRepeat;\nuniform float surfStrength;')
      .replace('#include <color_fragment>', SURFACE_FRAGMENT);
  };
  m.customProgramCacheKey = () => 'surface';
  m.userData.surface = surface;
  return m;
}

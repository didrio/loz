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
export type TileId = 'plaster' | 'stone' | 'planks' | 'shingle' | 'ground' | 'rock' | 'bark' | 'foliage' | 'metal' | 'thatch' | 'cloth';

/** What a material can be made of: which tile on its tops and walls, and how hard it shows. */
export type SurfaceId = 'plaster' | 'stone' | 'wood' | 'shingle' | 'ground' | 'rock' | 'bark' | 'foliage' | 'metal' | 'thatch' | 'cloth';

/**
 * Two separate ideas (owner's call, 2026-11-07):
 * - **Scale** is how big a tile's pattern is in the world (`TILE_METRES`): a brick course, a crack, a plank. It's authored with
 *   the tile, so a dungeon of small red bricks and one of big stone blocks are just two tiles; nothing global scales them.
 * - **Resolution** is how many pixels draw that pattern: one global setting, texels per metre. Lowering it makes every
 *   texture blockier and softer, with the same bricks in the same places. It can't exceed what a tile was drawn with.
 * Each tile is drawn once at full detail (`TILE_SIZE` px over `TILE_METRES`), then shrunk to the current resolution.
 */
export const DEFAULT_TEXTURE_RESOLUTION = 32;

/** The Dev tab slider's range, in whole texels per metre. The tiles are drawn at 32 per metre, so 32 is full detail. */
export const TEXTURE_RESOLUTION_RANGE = { min: 1, max: 32 };

let resolution = DEFAULT_TEXTURE_RESOLUTION;

export const textureResolution = () => resolution;

/** Sets every texture's resolution, now (rounded to a whole number, clamped to the range): rebuilds the tiles already on the GPU. */
export function setTextureResolution(v: number) {
  resolution = Math.min(TEXTURE_RESOLUTION_RANGE.max, Math.max(TEXTURE_RESOLUTION_RANGE.min, Math.round(v)));
  for (const [id, t] of textures) {
    const n = tileSizeAt(id, resolution);
    t.dispose(); // a different size needs a new GPU texture
    t.image = { data: tileBytes(id, n), width: n, height: n };
    t.needsUpdate = true;
  }
}

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
  rock: { top: 'rock', side: 'rock', strength: 0.5 },
  bark: { top: 'bark', side: 'bark', strength: 0.6 },
  foliage: { top: 'foliage', side: 'foliage', strength: 0.35 },
  metal: { top: 'metal', side: 'metal', strength: 0.4 },
  thatch: { top: 'thatch', side: 'thatch', strength: 0.5 },
  cloth: { top: 'cloth', side: 'cloth', strength: 0.35 },
};

/** The size a tile is drawn at, in pixels: the most detail it has. */
export const TILE_SIZE: Record<TileId, number> = { plaster: 64, stone: 64, planks: 64, shingle: 64, ground: 128, rock: 64, bark: 64, foliage: 64, metal: 64, thatch: 64, cloth: 32 };

/** How many metres of world one repeat of a tile covers: its authored scale. (Every tile is 32 texels a metre at full detail so far.) */
export const TILE_METRES: Record<TileId, number> = { plaster: 2, stone: 2, planks: 2, shingle: 2, ground: 4, rock: 2, bark: 2, foliage: 2, metal: 2, thatch: 2, cloth: 1 };

/** A tile's pixel size at `texelsPerMetre`: never more than it was drawn with, never less than 1. */
export function tileSizeAt(id: TileId, texelsPerMetre: number) {
  return Math.max(1, Math.min(TILE_SIZE[id], Math.round(TILE_METRES[id] * texelsPerMetre)));
}

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

/** Coursed stone: rows of blocks (0.25–0.4 m tall at 32 texels/m), staggered, each its own tone, in dark mortar. */
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

/** Planks running up the tile (v): ~0.2 m wide at 32 texels/m, dark seams, a grain streak along each, the odd butt joint and knot. */
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

/** Bark: deep vertical furrows (v runs up the trunk) with ridges between, and a few knots. */
function bark(n: number, rnd: () => number) {
  const grain = fbmTile(n, 12, 3, 3, rnd);
  const f = new Float32Array(n * n);
  let x0 = 0;
  for (const w of cuts(n, 5, 9, rnd)) {
    const tone = 0.4 + rnd() * 0.35;
    for (let y = 0; y < n; y++) {
      const wobble = Math.round(Math.sin((y / n) * Math.PI * 2 * 2 + x0) * 1);
      for (let x = 0; x < w; x++) {
        const i = y * n + wrap(x0 + x + wobble, n);
        const ridge = Math.sin((x / w) * Math.PI);
        f[i] = tone + grain[i] * 0.4 + ridge * 0.2 - (x < 2 ? 0.5 : 0);
      }
    }
    x0 += w;
  }
  for (let k = 0; k < 2; k++) {
    const cx = Math.floor(rnd() * n), cy = Math.floor(rnd() * n);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) f[wrap(cy + dy, n) * n + wrap(cx + dx, n)] -= 0.4;
  }
  return f;
}

/** Foliage: soft blotches of light and shade with scattered leaf clumps, 2–4 texels across. Gentle: it must never read as noise. */
function foliage(n: number, rnd: () => number) {
  const f = fbmTile(n, 4, 4, 2, rnd);
  for (let i = 0; i < f.length; i++) f[i] = f[i] * 0.8 + rnd() * 0.08;
  for (let c = 0; c < n * 0.9; c++) {
    const cx = Math.floor(rnd() * n), cy = Math.floor(rnd() * n);
    const v = rnd() < 0.5 ? 0.3 : -0.3, r = 1 + Math.floor(rnd() * 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r + 1) f[wrap(cy + dy, n) * n + wrap(cx + dx, n)] += v;
    }
  }
  return f;
}

/** Worked metal: fine brushed streaks along u, plate seams every 1 m with a rivet at each corner, and a few scuffs. */
function metal(n: number, rnd: () => number) {
  const streak = fbmTile(n, 2, 24, 2, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) f[i] = 0.45 + streak[i] * 0.4 + rnd() * 0.05;
  const plate = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (x % plate === 0 || y % plate === 0) f[y * n + x] = -0.2;
    else if (x % plate === 1 || y % plate === 1) f[y * n + x] += 0.15; // the lit edge of a plate
  }
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const cx = px * plate + 4, cy = py * plate + 4;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) f[(cy + dy) * n + cx + dx] += dx + dy === 0 ? 0.5 : -0.3;
  }
  for (let s = 0; s < 6; s++) {
    const sx = Math.floor(rnd() * n), sy = Math.floor(rnd() * n);
    for (let k = 0; k < 6; k++) f[wrap(sy + k, n) * n + wrap(sx + k, n)] -= 0.3;
  }
  return f;
}

/** Thatch: straw strands running downhill (v), bundled in bands across the slope, ragged at each band's lower edge. */
function thatch(n: number, rnd: () => number) {
  const strands = fbmTile(n, 28, 3, 2, rnd);
  const f = new Float32Array(n * n);
  const band = 16;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inBand = y % band;
    const ragged = (rnd() - 0.5) * 2.4;
    const edge = inBand + ragged > band - 2 ? -0.35 : inBand < 2 ? 0.2 : 0;
    f[y * n + x] = 0.4 + strands[y * n + x] * 0.6 + (inBand / band) * 0.15 + edge;
  }
  return f;
}

/** Cloth: a plain weave (fine warp and weft threads crossing), a few slubs, and a seam fold every half metre. */
function cloth(n: number, rnd: () => number) {
  const f = new Float32Array(n * n);
  const lump = fbmTile(n, 4, 4, 2, rnd);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const weave = (x + y) % 2 === 0 ? 0.05 : -0.05; // over-under
    f[y * n + x] = 0.55 + weave + (lump[y * n + x] - 0.5) * 0.3 + (rnd() - 0.5) * 0.08;
    if (x % (n / 2) === 0) f[y * n + x] -= 0.25; // the seam
  }
  for (let s = 0; s < 10; s++) { // slubs: a short thicker thread
    const sx = Math.floor(rnd() * n), sy = Math.floor(rnd() * n), len = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < len; k++) f[wrap(sy, n) * n + wrap(sx + k, n)] += 0.2;
  }
  return f;
}

const DRAW: Record<TileId, (n: number, rnd: () => number) => Float32Array> = { plaster, stone, planks, shingle, ground, rock, bark, foliage, metal, thatch, cloth };

/** A tile's bytes: the same for the same id and seed, on every load. */
export function drawTile(id: TileId, seed = 1) {
  return finishTile(DRAW[id](TILE_SIZE[id], mulberry32(seed)));
}

/**
 * Shrinks an `n × n` tile to `m × m` (m ≤ n) without ever blending texels, so the result is crisp at every size. (Averaging was
 * tried first: at a ratio that isn't whole, a one-texel crack or mortar line falls across two new texels and smears.) Each
 * source texel belongs to exactly one new texel (the one its centre falls in); the new texel takes the texel of its cell that
 * differs most from the whole tile's mean, so cracks, seams and pebbles survive at full strength (a crack sharing a cell with a
 * flat texel wins, being the farther from the mean). The result is then shifted and
 * stretched back to the source's mean and spread, so the colour and the strength never change with the resolution.
 */
export function downsampleTile(src: Uint8Array, n: number, m: number) {
  if (m >= n) return src;
  const s = n / m;
  const picked = new Float32Array(m * m);
  let tileMean = 0;
  for (let i = 0; i < src.length; i++) tileMean += src[i];
  tileMean /= src.length;
  const cell = (o: number) => [Math.ceil(o * s - 0.5), Math.ceil((o + 1) * s - 0.5)] as const;
  for (let oy = 0; oy < m; oy++) {
    const [y0, y1] = cell(oy);
    for (let ox = 0; ox < m; ox++) {
      const [x0, x1] = cell(ox);
      let best = src[y0 * n + x0], dev = -1;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const d = Math.abs(src[y * n + x] - tileMean);
          if (d > dev) { dev = d; best = src[y * n + x]; }
        }
      }
      picked[oy * m + ox] = best;
    }
  }
  const stats = (a: ArrayLike<number>) => {
    let mu = 0;
    for (let i = 0; i < a.length; i++) mu += a[i];
    mu /= a.length;
    let v = 0;
    for (let i = 0; i < a.length; i++) v += (a[i] - mu) ** 2;
    return { mu, sd: Math.sqrt(v / a.length) };
  };
  const from = stats(src), to = stats(picked);
  const gain = to.sd > 1e-6 ? from.sd / to.sd : 1;
  const out = new Uint8Array(m * m);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.min(255, Math.max(0, from.mu + (picked[i] - to.mu) * gain)));
  return out;
}

const drawn = new Map<TileId, Uint8Array>();

/** The tile's bytes at `size` px: drawn once at full detail, then shrunk. */
function tileBytes(id: TileId, size: number) {
  let full = drawn.get(id);
  if (!full) drawn.set(id, (full = drawTile(id)));
  return downsampleTile(full, TILE_SIZE[id], size);
}

// ---- The GPU side ----

const textures = new Map<TileId, THREE.DataTexture>();

/** The tile as a texture: one channel, repeating, nearest up close (crisp chunky texels: the owner found bilinear too blurry), mipmapped far off (no sparkle). */
export function tileTexture(id: TileId) {
  let t = textures.get(id);
  if (!t) {
    const n = tileSizeAt(id, resolution);
    t = new THREE.DataTexture(tileBytes(id, n), n, n, THREE.RedFormat, THREE.UnsignedByteType);
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
 * Gives a non-indexed geometry a `surfNormal` attribute: every vertex of a triangle gets the triangle's own
 * normal. The projection reads it as a `flat` value, so it must be the face's, while the ordinary `normal`
 * stays free for smooth lighting (a cone's smooth normals would tilt the tile). Plain meshes don't need it.
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
  geo.setAttribute('surfNormal', new THREE.BufferAttribute(normals, 3));
  return geo;
}

/**
 * A geometry ready for a textured *dynamic* mesh: non-indexed, with its faces' own normals in `surfNormal`.
 * Use it on a cone, cylinder or sphere that isn't merged (instanced trees, a rig's limb); boxes and flat-shaded
 * polyhedra already work without it.
 */
export function faceted<T extends THREE.BufferGeometry>(geo: T): THREE.BufferGeometry {
  return faceNormals(geo.index ? geo.toNonIndexed() : geo);
}

/**
 * Projects a tile onto a face by its object-space position (merged statics are in world space; moving
 * things keep their tile), along the face's own normal (the `surfNormal` attribute, `faceNormals`; `mergeStatic` sets it for
 * textured meshes; a mesh without one falls back to its `normal`, right for boxes). Walls: u along the wall, v up. Slopes: v runs downhill (stretched by the slope, so a texel
 * stays the same size along it). Flat tops: x and z.
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
    shader.uniforms.surfTopRepeat = { value: 1 / TILE_METRES[def.top] }; // the tile's authored scale; resolution never changes it
    shader.uniforms.surfSideRepeat = { value: 1 / TILE_METRES[def.side] };
    shader.uniforms.surfStrength = { value: def.strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surfNormal;\nvarying vec3 vSurfPos;\nflat varying vec3 vSurfNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfPos = transformed;\nvSurfNormal = dot(surfNormal, surfNormal) > 0.5 ? surfNormal : objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nflat varying vec3 vSurfNormal;\nuniform sampler2D surfTop;\nuniform sampler2D surfSide;\nuniform float surfTopRepeat;\nuniform float surfSideRepeat;\nuniform float surfStrength;')
      .replace('#include <color_fragment>', SURFACE_FRAGMENT);
  };
  m.customProgramCacheKey = () => 'surface';
  m.userData.surface = surface;
  return m;
}

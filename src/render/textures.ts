import * as THREE from 'three';
import { mulberry32 } from '../core/math';

/**
 * Generated textures (owner's call, 2026-11-06: drawn in code, never imported). A texture here is a
 * small grey **detail tile**: it only brightens or darkens the material's own colour, so one "plaster"
 * tile serves every plaster colour and the palette stays the palette. Tiles are placed by position, not
 * UVs (`mergeStatic` drops UVs): the shader works out each face's normal and projects the tile onto it,
 * along the wall for walls and downhill for slopes (see `applySurface`). Details: render.md "Textures".
 */

/** The tiles. Each is `size × size`, one byte a texel, mean about 128, and wraps seamlessly. */
export type TileId = 'plaster' | 'stone' | 'planks' | 'shingle' | 'ground' | 'rock' | 'bark' | 'foliage' | 'metal' | 'thatch' | 'cloth' | 'leather' | 'hide' | 'scales' | 'skin';

/** What a material can be made of: which tile on its tops and walls, and how hard it shows. */
export type SurfaceId = 'plaster' | 'stone' | 'wood' | 'shingle' | 'ground' | 'rock' | 'bark' | 'foliage' | 'metal' | 'thatch' | 'cloth' | 'leather' | 'hide' | 'scales' | 'skin';

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
  plaster: { top: 'plaster', side: 'plaster', strength: 0.55 },
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
  leather: { top: 'leather', side: 'leather', strength: 0.4 },
  hide: { top: 'hide', side: 'hide', strength: 0.4 },
  scales: { top: 'scales', side: 'scales', strength: 0.45 },
  skin: { top: 'skin', side: 'skin', strength: 0.3 },
};

/** The size a tile is drawn at, in pixels: the most detail it has. */
export const TILE_SIZE: Record<TileId, number> = { plaster: 64, stone: 64, planks: 64, shingle: 64, ground: 128, rock: 64, bark: 64, foliage: 64, metal: 64, thatch: 64, cloth: 32, leather: 32, hide: 32, scales: 48, skin: 32 };

/** How many metres of world one repeat of a tile covers: its authored scale. (Every tile is 32 texels a metre at full detail so far.) */
export const TILE_METRES: Record<TileId, number> = { plaster: 2, stone: 2, planks: 2, shingle: 2, ground: 4, rock: 2, bark: 2, foliage: 2, metal: 2, thatch: 2, cloth: 1, leather: 1, hide: 1, scales: 1.5, skin: 1 };

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

/**
 * Cells that tile: a jittered `g × g` grid of points, each pixel assigned to its nearest point (and told how far the second
 * nearest is), measured with the axes scaled by `ax` and `ay` (`ax < 1` makes cells wider than tall). `dx` and `dy` are the pixel
 * minus its cell's centre. Rock slabs and leaf clumps are drawn on it: `d2 - d1` is small along a cell's border.
 */
function cellField(n: number, g: number, rnd: () => number, ax = 1, ay = 1, jitter = 0.8) {
  const s = n / g;
  const px = Array.from({ length: g * g }, (_, k) => (k % g + 0.5 + (rnd() - 0.5) * jitter) * s);
  const py = Array.from({ length: g * g }, (_, k) => (Math.floor(k / g) + 0.5 + (rnd() - 0.5) * jitter) * s);
  const id = new Int16Array(n * n), d1 = new Float32Array(n * n), d2 = new Float32Array(n * n), dx = new Float32Array(n * n), dy = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, gx = Math.floor(x / s), gy = Math.floor(y / s);
    let best = 1e9, second = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const k = wrap(gy + oy, g) * g + wrap(gx + ox, g);
      const cx = px[k] + Math.floor((gx + ox) / g) * n, cy = py[k] + Math.floor((gy + oy) / g) * n;
      const d = Math.hypot((cx - x - 0.5) * ax, (cy - y - 0.5) * ay);
      if (d < best) { second = best; best = d; id[i] = k; dx[i] = x + 0.5 - cx; dy[i] = y + 0.5 - cy; }
      else if (d < second) second = d;
    }
    d1[i] = best;
    d2[i] = second;
  }
  return { id, d1, d2, dx, dy, s };
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

/**
 * Coursed stone: rows of blocks (0.25-0.4 m tall at 32 texels/m), staggered, each its own tone. Hand-laid, not ruled (owner's call,
 * 2026-11-09: perfect dark lines read as a grid): a course's edge sags a texel here and there, a joint kinks a texel halfway down,
 * the mortar is a gritty mid-dark that thickens where it has worn, and each block has a lit top and left edge, a shaded bottom
 * and right edge, rounded corners, the odd chipped corner, pits, a few hairline cracks and a wall-wide stain. Mortar is only a
 * little darker than the stone: it sets how far the rest can spread (`finishTile` normalizes), so a black joint flattens the blocks.
 */
function stone(n: number, rnd: () => number) {
  const grain = fbmTile(n, 16, 16, 2, rnd);
  const stain = fbmTile(n, 3, 3, 2, rnd);
  const wear = fbmTile(n, 8, 8, 2, rnd);
  const heights = cuts(n, 8, 13, rnd);
  const tops: number[] = [];
  let acc = 0;
  for (const h of heights) { tops.push(acc); acc += h; }
  const sags = heights.map(() => { // each course's top edge: -1, 0 or +1 texels along u, in slow undulations
    const s = periodicNoise(n, 3, 1, rnd);
    return Array.from({ length: n }, (_, x) => (s[x] < 0.33 ? -1 : s[x] > 0.67 ? 1 : 0));
  });
  const courses = heights.map(() => {
    const widths = cuts(n, 12, 24, rnd);
    const rel = [0];
    for (const w of widths) rel.push(rel[rel.length - 1] + w);
    return {
      offset: Math.floor(rnd() * n),
      rel,
      lean: widths.map(() => (rnd() < 0.15 ? (rnd() < 0.5 ? -1 : 1) : 0)), // the joint's lower half sits a texel over
      blocks: widths.map(() => ({ tone: 0.45 + rnd() * 0.22, tilt: (rnd() - 0.5) * 0.1, chip: rnd() < 0.15 ? Math.floor(rnd() * 4) : -1 })),
    };
  });
  const f = new Float32Array(n * n);
  for (let x = 0; x < n; x++) {
    for (let ci = 0; ci < courses.length; ci++) {
      const top = tops[ci] + sags[ci][x];
      const next = ci + 1 < courses.length ? tops[ci + 1] + sags[ci + 1][x] : n + tops[0] + sags[0][x];
      const h = next - top, c = courses[ci], J = c.blocks.length;
      for (let ly = 0; ly < h; ly++) {
        const i = wrap(top + ly, n) * n + x;
        const b = (j: number) => c.rel[j] + c.lean[j % J] * (ly * 2 >= h ? 1 : 0);
        const xr = wrap(x - c.offset, n);
        let j = -1, xu = xr;
        for (const cand of [xr, xr + n, xr - n]) {
          for (let k = 0; k < J && j < 0; k++) if (b(k) <= cand && cand < b(k + 1)) { j = k; xu = cand; }
        }
        const lx = xu - b(j), w = b(j + 1) - b(j), blk = c.blocks[j];
        const right = w - 1 - lx, low = h - 1 - ly;
        const mortarV = 0.21 + (grain[i] - 0.5) * 0.2 + (stain[i] - 0.5) * 0.15 - (wear[i] > 0.62 ? 0.08 : 0);
        const joint = ly === 0 || lx === 0 || (wear[i] > 0.72 && (ly === 1 || lx === 1)); // one texel, two where it has worn
        const corner = (lx <= 1 && ly <= 1) || (right <= 1 && low <= 1) || (lx <= 1 && low <= 1) || (right <= 1 && ly <= 1);
        const chipped = blk.chip >= 0 && (blk.chip % 2 ? right : lx) + (blk.chip < 2 ? ly : low) <= 2;
        if (joint) { f[i] = mortarV; continue; }
        let v = blk.tone + (grain[i] - 0.5) * 0.25 + (stain[i] - 0.5) * 0.2 + blk.tilt + 0.06 - (ly / h) * 0.12;
        if (ly === 1) v += 0.08; // lit top edge
        if (lx === 1) v += 0.05; // lit left edge
        if (low === 0) v -= 0.1; // shaded bottom
        if (right === 0) v -= 0.07; // shaded right
        f[i] = corner || chipped ? mortarV + 0.08 : v;
      }
    }
  }
  for (let p = 0; p < n * 0.25; p++) f[Math.floor(rnd() * n * n)] += rnd() < 0.7 ? -0.14 : 0.1; // pits and pale flecks
  for (let c = 0; c < 3; c++) { // hairline cracks
    let x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI * 2;
    const len = 6 + rnd() * 6;
    for (let s = 0; s < len; s++) {
      f[wrap(Math.floor(y), n) * n + wrap(Math.floor(x), n)] -= 0.18;
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  return f;
}

/**
 * Planks running up the tile (v): ~0.2 m wide at 32 texels/m. Each seam wanders a texel along its length, is a mid-dark gap (not a
 * black rule) with a lit edge on the plank beside it, the grain streaks run strong, and the odd butt joint and knot.
 */
function planks(n: number, rnd: () => number) {
  const grain = fbmTile(n, 16, 2, 2, rnd);
  const f = new Float32Array(n * n);
  const widths = cuts(n, 6, 8, rnd);
  const starts = [0];
  for (const w of widths) starts.push(starts[starts.length - 1] + w);
  const wander = widths.map(() => { // each seam's shift along v: -1, 0 or +1 texels (seam 0 and the wrap share one)
    const s = periodicNoise(n, 4, 1, rnd);
    return Array.from({ length: n }, (_, y) => (s[y] < 0.42 ? -1 : s[y] > 0.58 ? 1 : 0));
  });
  const seamAt = (j: number, y: number) => starts[j] + wander[j % widths.length][y];
  for (let j = 0; j < widths.length; j++) {
    const tone = 0.4 + rnd() * 0.35;
    const joint = rnd() < 0.5 ? Math.floor(rnd() * n) : -1;
    const jointSide = rnd() < 0.5 ? 0 : 1; // the butt joint stops short of one edge
    const w = widths[j];
    const knot = rnd() < 0.4 ? { x: 2 + rnd() * (w - 4), y: rnd() * n } : null;
    for (let y = 0; y < n; y++) {
      const x0 = seamAt(j, y), x1 = j + 1 < widths.length ? seamAt(j + 1, y) : n + seamAt(0, y);
      for (let x = x0; x < x1; x++) {
        const k = x - x0, i = y * n + wrap(x, n);
        let v = tone + (grain[i] - 0.5) * 0.7 + 0.3;
        if (k === 0) v = 0.3 + grain[i] * 0.15; // the seam
        else if (k === 1) v += 0.08;
        else if (x === x1 - 1) v -= 0.08;
        if (y === joint && (jointSide ? k < x1 - x0 - 2 : k > 1)) v = 0.32 + grain[i] * 0.1;
        else if (y === (joint + 1) % n && joint >= 0) v += 0.06;
        if (knot && Math.hypot((k - knot.x) * 1.4, wrap(y - Math.floor(knot.y) + n / 2, n) - n / 2) < 1.6) v -= 0.35;
        f[i] = v;
      }
    }
  }
  return f;
}

/**
 * Overlapping shingles in rows across the slope; v runs downhill. Each row starts in the shadow of the row above's lip (ragged, a
 * texel deeper here and there, soft rather than black) and its own lower edge catches the light. The gaps between shingles are
 * mid-dark and kink a texel halfway down, so no gap is a ruled line.
 */
function shingle(n: number, rnd: () => number) {
  const grain = fbmTile(n, 8, 8, 2, rnd);
  const f = new Float32Array(n * n);
  const rowH = 8;
  for (let r = 0; r < n / rowH; r++) {
    const offset = Math.floor(rnd() * n);
    const lip = periodicNoise(n, 8, 1, rnd); // how deep the shadow under the row above reaches, along u
    let x0 = offset;
    for (const w of cuts(n, 7, 11, rnd)) {
      const tone = 0.4 + rnd() * 0.35;
      const kink = rnd() < 0.5 ? 1 : 0; // the gap's lower half sits a texel over
      for (let y = 0; y < rowH; y++) {
        for (let x = 0; x < w; x++) {
          const i = (r * rowH + y) * n + wrap(x0 + x, n);
          let v = tone + grain[i] * 0.4 + (y / rowH) * 0.25;
          const shade = y < 1 + (lip[wrap(x0 + x, n)] > 0.5 ? 1 : 0);
          if (shade) v -= 0.3 - y * 0.1;
          else if (y === 2) v -= 0.08;
          if (y === rowH - 1) v += 0.08; // the lit lower edge
          const gap = x === (y >= rowH / 2 ? kink : 0);
          if (gap && !(y === 3 && rnd() < 0.3)) v = 0.35 + grain[i] * 0.15;
          f[i] = v;
        }
      }
      x0 += w;
    }
  }
  return f;
}

/**
 * Earth, 128 texels (4 m): clods in a few flat tones (contoured, not smooth), a sparse dither, pebbles with a lit top-left and a
 * shadow under them, short grass tufts, and a few dry cracks. No per-texel noise: at this size it only turns to static.
 */
function ground(n: number, rnd: () => number) {
  const base = fbmTile(n, 8, 8, 3, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) {
    f[i] = Math.round(base[i] / 0.08) * 0.08 + (rnd() < 0.06 ? (rnd() < 0.5 ? -0.07 : 0.07) : 0);
  }
  const at = (x: number, y: number) => wrap(y, n) * n + wrap(x, n);
  for (let c = 0; c < 4; c++) { // dry cracks
    let x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI * 2;
    const len = 14 + rnd() * 12;
    for (let s = 0; s < len; s++) {
      f[at(Math.floor(x), Math.floor(y))] -= 0.2;
      a += (rnd() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  for (let t = 0; t < n * 0.7; t++) { // grass tufts: a dark stem with a light tip
    const x = Math.floor(rnd() * n), y = Math.floor(rnd() * n), len = 2 + Math.floor(rnd() * 2), lean = rnd() < 0.5 ? 0 : rnd() < 0.5 ? -1 : 1;
    for (let k = 0; k < len; k++) f[at(x + (k > 1 ? lean : 0), y - k)] += k === len - 1 ? 0.2 : -0.14;
  }
  for (let p = 0; p < n * 0.45; p++) { // pebbles
    const cx = Math.floor(rnd() * n), cy = Math.floor(rnd() * n), rx = 1 + Math.floor(rnd() * 2), ry = rnd() < 0.5 ? 1 : rx;
    const tone = 0.12 + rnd() * 0.2;
    for (let dy = -ry - 1; dy <= ry + 1; dy++) for (let dx = -rx - 1; dx <= rx + 1; dx++) {
      const inside = (dx / (rx + 0.75)) ** 2 + (dy / (ry + 0.75)) ** 2 <= 1;
      const under = !inside && ((dx - 1) / (rx + 0.75)) ** 2 + ((dy - 1) / (ry + 0.75)) ** 2 <= 1;
      if (inside) f[at(cx + dx, cy + dy)] += tone + (dx + dy < -rx ? 0.14 : 0) - (dx + dy > rx ? 0.1 : 0);
      else if (under) f[at(cx + dx, cy + dy)] -= 0.2; // the shadow it casts
    }
  }
  return f;
}

/**
 * Rock faces: angular slabs, wider than tall, each its own tone and each lit on its upper-left (its centre-to-corner gradient is
 * stepped into flat bands, so it reads as facets, not a blur). Crevices between slabs are a gritty mid-dark that widens where
 * the rock has worn; the rim facing the light is pale, the rim facing away is dark. Pits, pale flecks, a few hairline cracks and
 * a face-wide stain. As with the stone, nothing is near-black: `finishTile` spends the contrast on the slabs.
 */
function rock(n: number, rnd: () => number) {
  const cell = cellField(n, 4, rnd, 0.5, 1, 1.0);
  const grain = fbmTile(n, 16, 16, 2, rnd);
  const stain = fbmTile(n, 3, 3, 2, rnd);
  const wear = fbmTile(n, 6, 6, 2, rnd);
  const tones = Array.from({ length: 16 }, () => 0.42 + rnd() * 0.26);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) {
    const gap = cell.d2[i] - cell.d1[i];
    const crevice = gap < 1.2 || (wear[i] > 0.68 && gap < 2.2);
    if (crevice && !(wear[i] < 0.3 && gap > 1.0 && (i * 7) % 5 === 0)) { // now and then a crevice is closed up
      f[i] = 0.21 + (grain[i] - 0.5) * 0.2 + (stain[i] - 0.5) * 0.15;
      continue;
    }
    const lit = -(cell.dx[i] + cell.dy[i]) / (cell.s * 0.9); // + toward the upper left of the slab
    const step = Math.round(Math.max(-1, Math.min(1, lit)) * 2) / 2;
    let v = tones[cell.id[i]] + step * 0.09 + (grain[i] - 0.5) * 0.2 + (stain[i] - 0.5) * 0.15;
    if (gap < 3.4) v += lit > 0 ? 0.07 : -0.08; // the rim toward the light, the rim away
    f[i] = v;
  }
  const at = (x: number, y: number) => wrap(Math.floor(y), n) * n + wrap(Math.floor(x), n);
  for (let p = 0; p < n * 0.3; p++) f[Math.floor(rnd() * n * n)] += rnd() < 0.7 ? -0.14 : 0.1; // pits and pale flecks
  for (let c = 0; c < 3; c++) { // hairline cracks
    let x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI * 2;
    const len = 6 + rnd() * 8;
    for (let s = 0; s < len; s++) {
      f[at(x, y)] -= 0.18;
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
    }
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

/**
 * Foliage: leaf clumps about 8 texels across, each lit on its upper left and darker below, with a mid-dark shadow under each clump's far rim
 * (broken here and there) and a few pale leaf glints. A canopy-wide slow light and shade under it. Gentle: it must never read as
 * noise, so the clumps stay in a narrow range of tones and the glints are short.
 */
function foliage(n: number, rnd: () => number) {
  const cell = cellField(n, n / 8, rnd, 1, 1, 0.9);
  const slow = fbmTile(n, 3, 3, 2, rnd);
  const wear = fbmTile(n, 8, 8, 2, rnd);
  const tones = Array.from({ length: cell.id.length }, () => 0.45 + rnd() * 0.18);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) {
    const gap = cell.d2[i] - cell.d1[i];
    const lit = -(cell.dx[i] + cell.dy[i]) / (cell.s * 0.7);
    if (gap < 2 && lit < 0.2 && wear[i] < 0.7) { f[i] = 0.3 + (slow[i] - 0.5) * 0.15; continue; } // the shadow under a clump's far rim
    const step = Math.round(Math.max(-1, Math.min(1, lit)) * 2) / 2;
    let v = tones[cell.id[i]] + step * 0.1 + (slow[i] - 0.5) * 0.25;
    f[i] = v;
  }
  for (let g = 0; g < n * 0.5; g++) { // a glint: two texels of a leaf catching the light, lying along a diagonal
    const x = Math.floor(rnd() * n), y = Math.floor(rnd() * n), s = rnd() < 0.5 ? 1 : -1;
    f[wrap(y, n) * n + wrap(x, n)] += 0.2;
    f[wrap(y + s, n) * n + wrap(x + 1, n)] += 0.14;
  }
  return f;
}

/**
 * Worked metal: fine brushed streaks along u, plate seams every 1 m with a rivet at each corner, and a few scuffs. The plates are
 * made things, so the seams stay straight, but they are a worn mid-dark with gaps in them, not a black rule, and the rivets sit a texel off.
 */
function metal(n: number, rnd: () => number) {
  const streak = fbmTile(n, 2, 24, 2, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) f[i] = 0.45 + streak[i] * 0.4 + rnd() * 0.05;
  const plate = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (x % plate === 0 || y % plate === 0) f[y * n + x] = rnd() < 0.15 ? f[y * n + x] - 0.05 : 0.28 + rnd() * 0.12; // the seam, worn through here and there
    else if (x % plate === 1 || y % plate === 1) f[y * n + x] += 0.12; // the lit edge of a plate
  }
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const cx = px * plate + 3 + Math.floor(rnd() * 3), cy = py * plate + 3 + Math.floor(rnd() * 3);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) f[(cy + dy) * n + cx + dx] += dx + dy === 0 ? 0.5 : -0.3;
  }
  for (let s = 0; s < 6; s++) {
    const sx = Math.floor(rnd() * n), sy = Math.floor(rnd() * n);
    for (let k = 0; k < 6; k++) f[wrap(sy + k, n) * n + wrap(sx + k, n)] -= 0.3;
  }
  return f;
}

/**
 * Thatch: straw laid in overlapping bundles down the slope (v runs downhill). Each bundle is 12-18 texels tall with a ragged lower
 * edge that sags a few texels along u; straws are 1-3 texels wide, each its own tone, and drift a texel sideways as they run.
 * The bundle below starts in the shadow of the one above, and its own hanging ends catch the light. Stray straws lie across.
 */
function thatch(n: number, rnd: () => number) {
  const grain = fbmTile(n, 24, 6, 2, rnd);
  const f = new Float32Array(n * n);
  const heights = cuts(n, 12, 18, rnd);
  const tops: number[] = [];
  let acc = 0;
  for (const h of heights) { tops.push(acc); acc += h; }
  const sags = heights.map(() => { const s = periodicNoise(n, 6, 1, rnd); return Array.from({ length: n }, (_, x) => Math.round((s[x] - 0.5) * 5)); });
  const bundles = heights.map(() => {
    const tone: number[] = [], first: boolean[] = [];
    for (const w of cuts(n, 1, 3, rnd)) { const t = 0.3 + rnd() * 0.5; for (let k = 0; k < w; k++) { tone.push(t); first.push(k === 0); } }
    return { tone, first, drift: rnd() < 0.5 ? -1 : 1 };
  });
  for (let x = 0; x < n; x++) {
    for (let bi = 0; bi < heights.length; bi++) {
      const top = tops[bi] + sags[bi][x];
      const next = bi + 1 < heights.length ? tops[bi + 1] + sags[bi + 1][x] : n + tops[0] + sags[0][x];
      const h = next - top, b = bundles[bi];
      for (let ly = 0; ly < h; ly++) {
        const i = wrap(top + ly, n) * n + x;
        const xs = wrap(x + b.drift * Math.floor(ly / 5), n);
        let v = 0.3 + b.tone[xs] * 0.5 + (grain[i] - 0.5) * 0.25;
        if (b.first[xs]) v -= 0.08; // the gap between two straws
        if (ly === 0) v -= 0.3; // under the bundle above
        else if (ly === 1) v -= 0.14;
        else if (ly === h - 1) v += 0.14; // the hanging ends
        f[i] = v;
      }
    }
  }
  for (let s = 0; s < n * 0.6; s++) { // stray straws
    const x = Math.floor(rnd() * n), y = Math.floor(rnd() * n), len = 3 + Math.floor(rnd() * 3), dir = rnd() < 0.5 ? -1 : 1, light = rnd() < 0.6;
    for (let k = 0; k < len; k++) f[wrap(y + (k >> 1), n) * n + wrap(x + dir * k, n)] += light ? 0.2 : -0.16;
  }
  return f;
}

/**
 * Cloth: a plain weave drawn in 2-texel threads (a texel-fine weave shimmers; this one reads as cloth up close and as a tone from
 * far), each thread its own tone, soft folds stepped into flat bands, a few slubs, and a hem seam every half metre: a mid-dark
 * fold with a dashed stitch beside it.
 */
function cloth(n: number, rnd: () => number) {
  const half = n / 2;
  const warp = Array.from({ length: half }, () => rnd() - 0.5), weft = Array.from({ length: half }, () => rnd() - 0.5);
  const lump = fbmTile(n, 4, 4, 2, rnd);
  const f = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const tx = x >> 1, ty = y >> 1, over = (tx + ty) % 2 === 0;
    const fold = Math.round(Math.sin((Math.PI * 4 * (x + 2 * y)) / n) * 2) / 2; // diagonal soft folds, periodic in the tile
    let v = 0.55 + (over ? 0.04 : -0.04) + (over ? warp[tx] : weft[ty]) * 0.09 + (lump[y * n + x] - 0.5) * 0.25 + fold * 0.06;
    const sx = x % half;
    if (sx === 0) v -= 0.1; // the seam
    else if (sx === 1) v += 0.05;
    else if (sx === 3 && y % 4 < 2) v += 0.14; // a stitch every four texels
    f[y * n + x] = v;
  }
  for (let s = 0; s < 8; s++) { // slubs: a short thicker thread
    const sx = Math.floor(rnd() * n), sy = Math.floor(rnd() * n), len = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < len; k++) f[wrap(sy, n) * n + wrap(sx + k, n)] += 0.15;
  }
  return f;
}

/** Leather: a pebbled grain, a few creases where it folds, and a stitched seam every half metre. */
function leather(n: number, rnd: () => number) {
  const grain = periodicNoise(n, 10, 10, rnd);
  const soft = fbmTile(n, 3, 3, 2, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) f[i] = 0.3 + grain[i] * 0.35 + soft[i] * 0.4;
  for (let c = 0; c < 3; c++) { // creases: dark wandering lines across u
    let y = Math.floor(rnd() * n);
    for (let x = 0; x < n; x++) {
      f[wrap(y, n) * n + x] -= 0.35;
      if (rnd() < 0.3) y += rnd() < 0.5 ? -1 : 1;
    }
  }
  const seam = n / 2;
  for (let y = 0; y < n; y++) {
    if (y % 4 < 2) f[y * n + 2] += 0.35; // a stitch every four texels, in a line
    f[y * n + 3] -= 0.12;
    f[y * n + seam] -= 0.2;
  }
  return f;
}

/** Hide: coarse, patchy, with short hair strokes running down (v) and a few darker patches and pale scars. */
function hide(n: number, rnd: () => number) {
  const patch = fbmTile(n, 3, 3, 3, rnd);
  const hair = fbmTile(n, 16, 4, 2, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) f[i] = patch[i] * 0.55 + hair[i] * 0.4 + (rnd() - 0.5) * 0.06;
  for (let s = 0; s < 4; s++) { // pale scars
    const sx = Math.floor(rnd() * n), sy = Math.floor(rnd() * n), len = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < len; k++) f[wrap(sy + k, n) * n + wrap(sx + (k >> 1), n)] += 0.3;
  }
  return f;
}

/** Skin: soft mottling with a fine pore grain and a few freckles. Very gentle (a low `strength`): a face must never read as noisy. */
function skin(n: number, rnd: () => number) {
  const soft = fbmTile(n, 3, 3, 3, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) f[i] = 0.4 + soft[i] * 0.45 + (rnd() - 0.5) * 0.12;
  for (let c = 0; c < 9; c++) f[wrap(Math.floor(rnd() * n), n) * n + wrap(Math.floor(rnd() * n), n)] -= 0.35; // freckles
  return f;
}

/**
 * Scales: rows of overlapping shield-shaped scutes (5-7 texels of row, 7-10 wide, so no two rows line up). Each scute reaches two
 * texels into the row below with a rounded lower edge, casts a one-texel shadow on what it lies over, and has a lit keel down the
 * middle, a lit left half, a shaded right half and a pale lower rim. Rows are drawn bottom-up so upper scutes lie on lower ones
 * (the last row's overlap wraps onto the first). The odd scale is worn pale or chipped. 1.5 m tile (the Shellback's shell).
 */
function scales(n: number, rnd: () => number) {
  const grain = fbmTile(n, 12, 12, 2, rnd);
  const stain = fbmTile(n, 2, 2, 2, rnd);
  const f = new Float32Array(n * n);
  for (let i = 0; i < f.length; i++) f[i] = 0.3 + (grain[i] - 0.5) * 0.15;
  const rows: { top: number; h: number; x0: number; scutes: { w: number; tone: number; worn: boolean; chip: number }[] }[] = [];
  let top = 0;
  for (const h of cuts(n, 5, 7, rnd)) {
    const scutes = cuts(n, 7, 10, rnd).map((w) => ({ w, tone: 0.42 + rnd() * 0.28, worn: rnd() < 0.15, chip: rnd() < 0.12 ? (rnd() < 0.5 ? 1 : w - 2) : -1 }));
    rows.push({ top, h, x0: Math.floor(rnd() * n), scutes });
    top += h;
  }
  const drawRow = (r: (typeof rows)[number], wrapOnly: boolean) => {
    let x0 = r.x0;
    for (const s of r.scutes) {
      const key = Math.floor(s.w / 2), mid = (s.w - 1) / 2;
      for (let lx = 0; lx < s.w; lx++) {
        const round = Math.round(3 * ((lx - mid) / (mid + 0.5)) ** 2); // the lower edge curves up toward the sides
        const depth = r.h + 2 - round - (lx === s.chip ? 1 : 0);
        const x = wrap(x0 + lx, n);
        if (!wrapOnly || r.top + depth + 1 > n) {
          const sh = r.top + depth; // the shadow it casts on the scute below
          if (!wrapOnly || sh >= n) f[wrap(sh, n) * n + x] -= 0.2;
        }
        for (let ly = 0; ly < depth; ly++) {
          if (wrapOnly && r.top + ly < n) continue;
          const i = wrap(r.top + ly, n) * n + x;
          let v = s.tone + (grain[i] - 0.5) * 0.22 + (stain[i] - 0.5) * 0.15 + (lx < key ? 0.04 : lx > key ? -0.05 : 0.08);
          if (ly === depth - 1) v += 0.1; // the lower rim
          if (lx === 0 || lx === s.w - 1) v -= 0.1; // where it meets the scute beside
          if (s.worn && grain[i] > 0.55) v += 0.1;
          f[i] = v;
        }
      }
      x0 += s.w;
    }
  };
  for (let k = rows.length - 1; k >= 0; k--) drawRow(rows[k], false);
  drawRow(rows[rows.length - 1], true);
  return f;
}

const DRAW: Record<TileId, (n: number, rnd: () => number) => Float32Array> = { plaster, stone, planks, shingle, ground, rock, bark, foliage, metal, thatch, cloth, leather, hide, scales, skin };

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
// vSurfNormal is deliberately not `flat`: on Metal (ANGLE) a flat varying ran the GPU out of memory and lost the WebGL context (T44).
export function applySurface<T extends THREE.MeshLambertMaterial>(m: T, surface: SurfaceId): T {
  const def = SURFACES[surface];
  m.onBeforeCompile = (shader) => {
    shader.uniforms.surfTop = { value: tileTexture(def.top) };
    shader.uniforms.surfSide = { value: tileTexture(def.side) };
    shader.uniforms.surfTopRepeat = { value: 1 / TILE_METRES[def.top] }; // the tile's authored scale; resolution never changes it
    shader.uniforms.surfSideRepeat = { value: 1 / TILE_METRES[def.side] };
    shader.uniforms.surfStrength = { value: def.strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surfNormal;\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfPos = transformed;\nvSurfNormal = dot(surfNormal, surfNormal) > 0.5 ? surfNormal : objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;\nuniform sampler2D surfTop;\nuniform sampler2D surfSide;\nuniform float surfTopRepeat;\nuniform float surfSideRepeat;\nuniform float surfStrength;')
      .replace('#include <color_fragment>', SURFACE_FRAGMENT);
  };
  m.customProgramCacheKey = () => 'surface';
  m.userData.surface = surface;
  return m;
}

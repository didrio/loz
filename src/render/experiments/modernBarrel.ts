import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { followDaylight, wearSkyCube } from './skyEnv';

/**
 * EXPERIMENT (T62, owner, 2026-11-09): a **modern-stylized** barrel, the middle of the three-barrel comparison: today's
 * game barrel's size and outline (1 m tall, 0.48 m belly), but smooth-shaded, every edge rounded, clean materials
 * (matte wood with a simple grain, iron that reads as metal), no grime. ~2.8k triangles. Outside every art rule on
 * purpose (no palette, not registered, not in a budget). Delete `experiments/` and the village block to remove it.
 *
 * Shape: one lathe-like grid wraps 16 staves (soft V-grooves between them), rounds over the chime at each end into the
 * inner wall, and two heads close it; four iron hoops with rounded edges. Smooth normals throughout.
 */

const H = 1.0;
const RB = 0.48; // belly radius
const RE = 0.39; // radius at the ends
const STAVES = 16;
/** Where each stave's columns sit across it (0 is the groove it shares with its neighbour). */
const ACROSS = [0, 0.2, 0.8];
const GROOVE = 0.012; // how far the groove between staves sinks
const EDGE = 0.002; // the rounded stave edge, just inside the groove
const HEAD_Y = 0.05; // how far each head sits inside the chime
/** Each hoop's lower and upper edge. */
const HOOPS: [number, number][] = [[0.035, 0.085], [0.2, 0.27], [0.73, 0.8], [0.915, 0.965]];

const WOOD = new THREE.Color(0xb27a40);
const IRON = new THREE.Color(0x3b3f46);

/** The outside radius at height y: a parabola from the ends to the belly, like today's barrel. */
const R = (y: number) => {
  const s = (2 * y) / H - 1;
  return RE + (RB - RE) * (1 - s * s);
};

/** The profile from the bottom head round the bottom chime, up the outside and over the top chime to the top head. */
function profile(): { r: number; y: number; inner: boolean }[] {
  const body = [0.06, 0.16, 0.3, 0.5, 0.7, 0.84, 0.94].map((y) => ({ r: R(y), y, inner: false }));
  const end = (top: boolean) => {
    const y = (v: number) => (top ? H - v : v);
    const pts = [
      { r: RE - 0.045, y: y(HEAD_Y), inner: true },
      { r: RE - 0.04, y: y(0.012), inner: true },
      { r: RE - 0.028, y: y(0), inner: false },
      { r: RE - 0.008, y: y(0), inner: false },
      { r: R(y(0.012)) - 0.001, y: y(0.012), inner: false },
    ];
    return top ? pts.reverse() : pts;
  };
  return [...end(false), ...body, ...end(true)];
}

/** How far a point `t` (0..1) across a stave sinks: the groove at the stave's edges, a rounded lip just inside. */
function sink(t: number) {
  const d = Math.min(t, 1 - t);
  return d < 0.01 ? GROOVE : d < 0.25 ? EDGE : 0;
}

function buildBody(): THREE.BufferGeometry {
  const rows = profile();
  const cols = STAVES * ACROSS.length;
  const pos: number[] = [], col: number[] = [];
  const rnd = mulberry(1109);
  const tint = Array.from({ length: STAVES }, () => 0.9 + rnd() * 0.18);
  for (const row of rows) {
    for (let c = 0; c < cols; c++) {
      const stave = Math.floor(c / ACROSS.length), t = ACROSS[c % ACROSS.length];
      const a = ((stave + t) / STAVES) * Math.PI * 2;
      const r = row.r - sink(t);
      pos.push(r * Math.cos(a), row.y, r * Math.sin(a));
      // A little darkness baked into the grooves and down inside the chime; each stave its own shade of the same wood.
      const k = (t === 0 ? 0.55 : 1) * (row.inner ? 0.6 : 1) * (t === 0 ? 1 : tint[stave]);
      col.push(WOOD.r * k, WOOD.g * k, WOOD.b * k);
    }
  }
  const index: number[] = [];
  for (let j = 0; j + 1 < rows.length; j++) {
    for (let c = 0; c < cols; c++) {
      const a = j * cols + c, b = j * cols + ((c + 1) % cols), d = (j + 1) * cols + c, e = (j + 1) * cols + ((c + 1) % cols);
      index.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A head: a flat disc at `y` facing up, its rim darkened where it meets the staves. */
function buildHead(y: number): THREE.BufferGeometry {
  const n = STAVES * ACROSS.length, r = RE - 0.045;
  const pos = [0, y, 0], col = [WOOD.r * 0.95, WOOD.g * 0.95, WOOD.b * 0.95], index: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    pos.push(r * Math.cos(a), y, r * Math.sin(a));
    col.push(WOOD.r * 0.7, WOOD.g * 0.7, WOOD.b * 0.7);
    const b = 1 + k, c = 1 + ((k + 1) % n);
    index.push(0, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A hoop: a band standing proud of the staves, its edges rounded by smooth normals over a bevel. */
function buildHoop(y0: number, y1: number): THREE.BufferGeometry {
  const n = STAVES * ACROSS.length;
  const T = 0.008, B = 0.007;
  const section = [[R(y0) + 0.001, y0], [R(y0 + B) + T, y0 + B], [R(y1 - B) + T, y1 - B], [R(y1) + 0.001, y1]];
  const pos: number[] = [], index: number[] = [];
  for (const [r, y] of section) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      pos.push(r * Math.cos(a), y, r * Math.sin(a));
    }
  }
  for (let j = 0; j + 1 < section.length; j++) {
    for (let k = 0; k < n; k++) {
      const a = j * n + k, b = j * n + ((k + 1) % n), d = (j + 1) * n + k, e = (j + 1) * n + ((k + 1) % n);
      index.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The grain, per pixel in object space: long streaks along each stave (a little value noise bending sine rings), and on
 * the heads, planks with thin dark seams and their grain across. Gentle: it reads as wood, never as a photo of one.
 */
const GRAIN = /* glsl */ `
varying vec3 vObj;
float mbHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mbNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mbHash(i), mbHash(i + vec3(1, 0, 0)), f.x), mix(mbHash(i + vec3(0, 1, 0)), mbHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mbHash(i + vec3(0, 0, 1)), mbHash(i + vec3(1, 0, 1)), f.x), mix(mbHash(i + vec3(0, 1, 1)), mbHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float mbGrain() {
  if (length(vObj.xz) < ${(RE - 0.044).toFixed(3)}) {
    float w = 0.12, px = vObj.x / w + 10.0, plank = floor(px), f = fract(px);
    float seam = smoothstep(0.0, 0.06, f) * smoothstep(1.0, 0.94, f);
    float n = mbNoise(vec3(plank * 7.3, vObj.z * 3.0, plank));
    float rings = 0.5 + 0.5 * sin(vObj.x * 140.0 + n * 5.0 + plank * 2.1);
    return (0.9 + 0.1 * rings) * mix(0.6, 1.0, seam) * (0.94 + 0.12 * fract(plank * 0.618));
  }
  float a = atan(vObj.z, vObj.x);
  float stave = floor((a + 3.14159265) / 6.2831853 * ${STAVES}.0);
  vec2 p = vec2(a * ${RB.toFixed(2)} * 60.0, vObj.y * 3.0);
  float n = mbNoise(vec3(p.x * 0.5 + stave * 13.1, p.y, stave));
  float rings = 0.5 + 0.5 * sin(p.x * 2.2 + n * 5.0 + stave * 1.7);
  return 0.9 + 0.1 * rings;
}`;

/** Builds the barrel, standing on its bottom at the origin. */
export function buildModernBarrel(): THREE.Group {
  const wood = mergeGeometries([buildBody(), buildHead(HEAD_Y), buildHead(H - HEAD_Y)]);
  const iron = mergeGeometries(HOOPS.map(([y0, y1]) => buildHoop(y0, y1)));

  const woodMat = wearSkyCube(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }));
  woodMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRAIN}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mbGrain();');
  };
  woodMat.customProgramCacheKey = () => 'modernBarrelWood';
  const ironMat = wearSkyCube(new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.38, metalness: 0.85 }));

  const root = new THREE.Group();
  root.name = 'modernBarrel';
  const body = new THREE.Mesh(wood, woodMat);
  const hoops = new THREE.Mesh(iron, ironMat);
  root.add(body, hoops);
  followDaylight(body, [[woodMat, 0.35], [ironMat, 0.9]]);
  return root;
}

/** How many triangles a model draws (the experiments' reports and tests). */
export function triangles(root: THREE.Object3D) {
  let n = 0;
  root.traverse((o) => { if (o instanceof THREE.Mesh) n += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
  return n;
}

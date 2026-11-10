import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { IRON_HEADER, WOOD_HEADER } from './realBarrelGlsl';
import { followDaylight, wearSkyCube } from './skyEnv';

/**
 * EXPERIMENT (owner's request, 2026-11-09): "how real can you make one object?" A 225-litre oak wine barrel at real size,
 * deliberately outside every art rule (no palette, no flat shading, no budget, not registered). Delete `experiments/` and
 * the one line in `world/overworld/village.ts` to remove it.
 *
 * Geometry: 30 separate staves (each a closed solid: rounded edges, chamfered chime, uneven ends, a hair's gap between
 * them), a five-board head with a bevelled rim, a bung, six forged hoops with a riveted overlap each. ~0.4 M triangles.
 * Surface: no textures at all; `realBarrelGlsl.ts` draws every pixel procedurally in metres, so it stays sharp at any distance.
 */

const H = 0.95; // height
const RB = 0.35; // belly radius (outside)
const RH = 0.287; // radius at the ends (outside)
const T = 0.027; // stave thickness
const N_STAVES = 30;
const HEAD_Y = H - 0.042; // the head's top face, sunk below the chime
const CHAMFER = 0.009;
const GAP = 0.0003; // half the gap between staves
const BEV = 0.002; // the staves' rounded long edges
const END_ROUND = 0.0015;
const HOOP_THK = 0.002;
/** Each hoop's lower edge and width. */
const HOOPS: [number, number][] = [
  [0.022, 0.05],
  [0.13, 0.045],
  [0.3, 0.045],
  [H - 0.3 - 0.045, 0.045],
  [H - 0.13 - 0.045, 0.045],
  [H - 0.022 - 0.05, 0.05],
];

/** The barrel's outside radius at height y: a parabola from the ends to the belly. */
const R = (y: number) => {
  const s = (2 * y) / H - 1;
  return RH + (RB - RH) * (1 - s * s);
};

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V3 = [number, number, number];
export type Sample = { p: V3; attrs: Record<string, number[]> };

/**
 * A (nu+1)×(nv+1) grid of vertices (or nu×… when wrapped) with smooth normals of its own, turned so they agree with
 * `outward(p)`. Each surface of a part is its own grid, so creases between them stay sharp.
 */
export function grid(nu: number, nv: number, at: (i: number, j: number) => Sample, outward: (p: THREE.Vector3) => THREE.Vector3, wrapU = false) {
  const cu = wrapU ? nu : nu + 1, cv = nv + 1;
  const pos: number[] = [];
  const attrs: Record<string, number[]> = {};
  const sizes: Record<string, number> = {};
  for (let j = 0; j < cv; j++) {
    for (let i = 0; i < cu; i++) {
      const s = at(i, j);
      pos.push(...s.p);
      for (const [k, v] of Object.entries(s.attrs)) {
        (attrs[k] ??= []).push(...v);
        sizes[k] = v.length;
      }
    }
  }
  const idx = (i: number, j: number) => j * cu + (wrapU ? i % nu : i);
  const index: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      index.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, new THREE.Float32BufferAttribute(v, sizes[k]));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = g.attributes.normal, p = g.attributes.position;
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  let agree = 0;
  for (let k = 0; k < p.count; k++) agree += nn.fromBufferAttribute(n, k).dot(outward(v.fromBufferAttribute(p, k)));
  if (agree < 0) {
    for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  return g;
}

const radial = (p: THREE.Vector3) => new THREE.Vector3(p.x, 0, p.z).normalize();
const cosSpace = (i: number, n: number) => 0.5 - 0.5 * Math.cos((Math.PI * i) / n);

function buildStave(theta0: number, span: number, seed: number, rnd: () => number): THREE.BufferGeometry[] {
  const dr = (rnd() - 0.5) * 0.001, yB = (rnd() - 0.5) * 0.002, yT = H + (rnd() - 0.5) * 0.003;
  const g = GAP / RB, inner = span - 2 * g, half = inner / 2;
  const th = (u: number) => theta0 + g + u * inner;
  const width = (y: number) => inner * R(y);
  const bevel = (u: number, y: number) => {
    const e = Math.min(u, 1 - u) * width(y);
    return e < BEV ? BEV - Math.sqrt(BEV * BEV - (BEV - e) ** 2) : 0;
  };
  // Staves are planed nearly flat across: a quarter of a flat board's chord, so the barrel is ever so slightly polygonal.
  const flat = (u: number, y: number) => 0.25 * R(y) * (1 - Math.cos(half) / Math.cos((u - 0.5) * inner));
  const at = (u: number, y: number, depth: number, end: number): Sample => {
    const t = th(u), r = R(y) + dr - flat(u, y) - depth;
    return { p: [r * Math.cos(t), y, r * Math.sin(t)], attrs: { aWood: [u * width(y), y, depth], aInfo: [seed, 0, width(y), end] } };
  };
  const tangent = (sign: number) => (p: THREE.Vector3) => new THREE.Vector3(-p.z, 0, p.x).normalize().multiplyScalar(sign);
  const parts: THREE.BufferGeometry[] = [];
  const M = 18, N = 150;
  // Outer face.
  parts.push(grid(M, N, (i, j) => {
    const u = cosSpace(i, M), y = yB + END_ROUND + ((yT - yB - 2 * END_ROUND) * j) / N;
    return at(u, y, bevel(u, y), 0);
  }, radial));
  // Inner face.
  parts.push(grid(6, 60, (i, j) => {
    const y = yB + CHAMFER + ((yT - yB - 2 * CHAMFER) * j) / 60;
    return at(i / 6, y, T, 0);
  }, (p) => radial(p).negate()));
  // Each end: the chamfer inside, the end grain, the rounded outer lip.
  for (const top of [true, false]) {
    const s = top ? 1 : -1, yE = top ? yT : yB;
    parts.push(grid(6, 1, (i, j) => at(i / 6, yE - s * (j === 0 ? CHAMFER : 0), j === 0 ? T : T - CHAMFER, 1),
      (p) => radial(p).negate().add(new THREE.Vector3(0, s, 0))));
    const depths = [T - CHAMFER, 0.012, 0.006, 0.003, END_ROUND * 0.7, END_ROUND * 0.3, 0];
    parts.push(grid(M, depths.length - 1, (i, j) => {
      const u = cosSpace(i, M), d = depths[j];
      const ro = d < END_ROUND ? END_ROUND - Math.sqrt(END_ROUND ** 2 - (END_ROUND - d) ** 2) : 0;
      const y = yE - s * ro;
      return at(u, y, d + bevel(u, y) * (1 - d / (T - CHAMFER)), j === depths.length - 1 ? 0 : 1);
    }, () => new THREE.Vector3(0, s, 0)));
  }
  // The two joint faces.
  for (const [u, sign] of [[0, -1], [1, 1]] as const) {
    parts.push(grid(1, 50, (i, j) => {
      const y = yB + CHAMFER + ((yT - yB - 2 * CHAMFER) * j) / 50;
      return at(u, y, i === 0 ? BEV : T, 0);
    }, tangent(sign)));
  }
  return parts;
}

function buildHead(rnd: () => number): THREE.BufferGeometry[] {
  const headR = R(HEAD_Y) - T + 0.004; // into the croze
  const ratios = [0.15, 0.22, 0.26, 0.22, 0.15];
  const edges = [-headR];
  for (const r of ratios) edges.push(edges[edges.length - 1] + r * 2 * headR);
  const HG = 0.00025;
  const parts: THREE.BufferGeometry[] = [];
  const up = () => new THREE.Vector3(0, 1, 0);
  for (let b = 0; b < ratios.length; b++) {
    const xa = edges[b], xb = edges[b + 1], seed = 40 + b * 1.37 + rnd();
    const dy = (rnd() - 0.5) * 0.0008, tilt = (rnd() - 0.5) * 0.004;
    const surfaceY = (x: number, z: number) => {
      const rim = headR - Math.hypot(x, z);
      const drop = rim < 0.03 ? 0.007 * (1 - rim / 0.03) ** 2 : 0;
      return HEAD_Y + dy + tilt * z - drop;
    };
    const zMax = (x: number) => Math.sqrt(Math.max(headR * headR - x * x, 1e-8));
    const info = [seed, 1, xb - xa, 0];
    const NX = 22, NZ = 64;
    parts.push(grid(NX, NZ, (i, j) => {
      const x = xa + HG + ((xb - xa - 2 * HG) * i) / NX;
      const zm = zMax(x), z = -zm + (2 * zm * j) / NZ, y = surfaceY(x, z);
      return { p: [x, y, z], attrs: { aWood: [x - xa, z + headR, HEAD_Y - y], aInfo: info } };
    }, up));
    for (const [x, sx] of [[xa + HG, -1], [xb - HG, 1]] as const) {
      if ((sx < 0 && b === 0) || (sx > 0 && b === ratios.length - 1)) continue;
      parts.push(grid(1, 30, (i, j) => {
        const zm = zMax(x), z = -zm + (2 * zm * j) / 30, y = surfaceY(x, z) - i * 0.012;
        return { p: [x, y, z], attrs: { aWood: [x - xa, z + headR, HEAD_Y - y], aInfo: info } };
      }, () => new THREE.Vector3(sx, 0, 0)));
    }
  }
  return parts;
}

function buildBung(angle: number): THREE.BufferGeometry {
  const pts = [[0, 0.0145], [0.008, 0.0142], [0.014, 0.0135], [0.018, 0.0124], [0.0205, 0.0108], [0.0216, 0.0088], [0.0222, 0.005], [0.0224, -0.012]]
    .map(([x, y]) => new THREE.Vector2(x, y)).reverse();
  const g = new THREE.LatheGeometry(pts, 64);
  g.deleteAttribute('uv');
  const p = g.attributes.position, n = g.attributes.normal;
  const wood: number[] = [], info: number[] = [];
  for (let k = 0; k < p.count; k++) {
    wood.push(p.getX(k) + 0.03, p.getY(k), p.getZ(k) + 0.03);
    info.push(77.7, 2, 0.06, n.getY(k) > 0.8 ? 1 : 0);
  }
  g.setAttribute('aWood', new THREE.Float32BufferAttribute(wood, 3));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  m.setPosition(dir.clone().multiplyScalar(R(H / 2) - 0.0006).setY(H / 2));
  g.applyMatrix4(m);
  return g;
}

/** A hoop's cross-section: a 2 mm band with rounded edges, as (across, out from the wood). */
function hoopSection(w: number): [number, number][] {
  const rho = HOOP_THK / 2, base = 0.0002, out: [number, number][] = [];
  for (let k = 0; k <= 12; k++) out.push([rho + ((w - 2 * rho) * k) / 12, base]);
  for (let k = 1; k < 8; k++) {
    const a = -Math.PI / 2 + (Math.PI * k) / 8;
    out.push([w - rho + rho * Math.cos(a), base + rho + rho * Math.sin(a)]);
  }
  for (let k = 12; k >= 0; k--) out.push([rho + ((w - 2 * rho) * k) / 12, base + HOOP_THK]);
  for (let k = 1; k < 8; k++) {
    const a = Math.PI / 2 + (Math.PI * k) / 8;
    out.push([rho + rho * Math.cos(a), base + rho + rho * Math.sin(a)]);
  }
  return out;
}

function buildHoop(y0: number, w: number, k: number, rnd: () => number): THREE.BufferGeometry[] {
  const sec = hoopSection(w), L = sec.length;
  const off = rnd() * Math.PI * 2, seed = 10 + k * 3.17;
  const ph1 = rnd() * 6, ph2 = rnd() * 6;
  const wobble = (a: number) => 0.0003 * Math.sin(3 * a + ph1) + 0.0002 * Math.sin(7 * a + ph2);
  const rc = R(y0 + w / 2), yc = y0 + w / 2;
  const tube = (lift: number) => (p: THREE.Vector3) => {
    const a = Math.atan2(p.z, p.x), r = rc + 0.0002 + lift + HOOP_THK / 2;
    return p.clone().sub(new THREE.Vector3(r * Math.cos(a), yc, r * Math.sin(a)));
  };
  const S = 480;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(grid(L, S, (i, j) => {
    const a = (2 * Math.PI * j) / S, [t, o] = sec[i], y = y0 + t, r = R(y) + o + wobble(a);
    return { p: [r * Math.cos(a + off), y, r * Math.sin(a + off)], attrs: { aHoop: [a * rc, t, seed, w] } };
  }, tube(0), true));
  // The overlap: the band's end lies over its start, feathered where it was hammered thin, held by two rivets.
  const A = 0.13, SO = 48;
  parts.push(grid(L, SO, (i, j) => {
    const f = j / SO, a = -A + 2 * A * f, [t, o] = sec[i];
    const taper = Math.min(1, Math.min(f, 1 - f) / 0.12) ** 0.7;
    const oo = 0.0002 + HOOP_THK + (o - 0.0002) * Math.max(taper, 0.02) + 0.00005;
    const y = y0 + t, r = R(y) + oo + wobble(a < 0 ? a + 2 * Math.PI : a);
    return { p: [r * Math.cos(a + off), y, r * Math.sin(a + off)], attrs: { aHoop: [a * rc + 20, t, seed + 1, w] } };
  }, tube(HOOP_THK), true));
  for (const a of [-A * 0.45, A * 0.45]) {
    const g = new THREE.SphereGeometry(0.0042, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.deleteAttribute('uv');
    g.scale(1, 0.55, 1);
    const dir = new THREE.Vector3(Math.cos(a + off), 0, Math.sin(a + off));
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    m.setPosition(dir.clone().multiplyScalar(rc + 0.0002 + 2 * HOOP_THK + wobble(a < 0 ? a + 2 * Math.PI : a)).setY(yc));
    g.applyMatrix4(m);
    const p = g.attributes.position, hoop: number[] = [];
    for (let v = 0; v < p.count; v++) {
      let aa = Math.atan2(p.getZ(v), p.getX(v)) - off;
      aa = Math.atan2(Math.sin(aa), Math.cos(aa));
      hoop.push(aa * rc + 40, p.getY(v) - y0, seed + 2, w);
    }
    g.setAttribute('aHoop', new THREE.Float32BufferAttribute(hoop, 4));
    parts.push(g);
  }
  return parts;
}

function patched(header: string, vertexDecl: string, vertexBody: string, fragment: (s: string) => string, key: string, uniforms: Record<string, THREE.IUniform>) {
  const m = wearSkyCube(new THREE.MeshStandardMaterial({ envMapIntensity: 0.5 }));
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexDecl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`);
    shader.fragmentShader = fragment(shader.fragmentShader.replace('#include <common>', `#include <common>\n${header}`));
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/**
 * The A/B (T65): which of the photoreal barrel's ingredients carry its look. `plain` drops the per-pixel surface for flat
 * Standard wood and iron; `bump: false` keeps the colours but not the relief; `variedPbr: false` keeps colour and relief but
 * gives every pixel the same roughness (and the iron one metalness).
 */
export type PhotorealOpts = { surface?: 'full' | 'plain'; bump?: boolean; variedPbr?: boolean };

/** The uniforms the photoreal wood shader reads: stave thickness, 6 hoops (lower, upper edge), the bung and the head. */
export type WoodUniforms = { uT: number; uHoops: [number, number][]; uBung: THREE.Vector4; uHead: THREE.Vector2; uH: number };

/** The photoreal wood and iron materials (the shaders in `realBarrelGlsl.ts`), for any geometry carrying aWood/aInfo and aHoop. */
export function photorealMaterials(u: WoodUniforms, opts: PhotorealOpts = {}): { wood: THREE.MeshStandardMaterial; iron: THREE.MeshStandardMaterial } {
  const { surface = 'full', bump = true, variedPbr = true } = opts;
  if (surface === 'plain') {
    return {
      wood: wearSkyCube(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.19, 0.11), roughness: 0.78, envMapIntensity: 0.5 })),
      iron: wearSkyCube(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.08, 0.075, 0.07), roughness: 0.62, metalness: 0.6, envMapIntensity: 0.5 })),
    };
  }
  const key = `${bump ? 'b' : ''}${variedPbr ? 'v' : ''}`;
  const bumpLine = (s: string) => (bump ? s.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bumpNormal(-vViewPosition, normal, bH, faceDirection);') : s);
  const wood = patched(
    WOOD_HEADER,
    'attribute vec3 aWood; attribute vec4 aInfo; varying vec3 vWood; varying vec4 vInfo; varying vec3 vObj;',
    'vWood = aWood; vInfo = aInfo; vObj = position;',
    (s) => {
      s = s.replace('#include <map_fragment>', '#include <map_fragment>\nvec3 bCol; float bRough; vec3 bH; barrelWood(bCol, bRough, bH); diffuseColor.rgb = bCol;');
      if (variedPbr) s = s.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;');
      return bumpLine(s);
    },
    `realBarrelWood${key}`,
    {
      uT: { value: u.uT },
      uHoops: { value: u.uHoops.map(([y0, y1]) => new THREE.Vector4(y0, y1, 0, 0)) },
      uBung: { value: u.uBung },
      uHead: { value: u.uHead },
    },
  );
  const iron = patched(
    IRON_HEADER,
    'attribute vec4 aHoop; varying vec4 vHoop; varying vec3 vObj;',
    'vHoop = aHoop; vObj = position;',
    (s) => {
      s = s.replace('#include <map_fragment>', '#include <map_fragment>\nvec3 bCol; float bRough; float bMetal; vec3 bH; barrelIron(bCol, bRough, bMetal, bH); diffuseColor.rgb = bCol;');
      if (variedPbr) {
        s = s
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;')
          .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = bMetal;');
      }
      return bumpLine(s);
    },
    `realBarrelIron${key}`,
    { uH: { value: u.uH } },
  );
  if (!variedPbr) {
    wood.roughness = 0.78;
    iron.roughness = 0.62;
    iron.metalness = 0.5;
  }
  return { wood, iron };
}

/** Builds the barrel, standing on its bottom at the origin. */
export function buildRealBarrel(opts: PhotorealOpts = {}): THREE.Group {
  const rnd = mulberry(20261109);
  const widths = Array.from({ length: N_STAVES }, () => 0.75 + rnd() * 0.5);
  const total = widths.reduce((a, b) => a + b, 0);
  const wood: THREE.BufferGeometry[] = [];
  let theta = rnd() * Math.PI * 2, bungAngle = 0, widest = 0;
  widths.forEach((wd, k) => {
    const span = (wd / total) * Math.PI * 2;
    wood.push(...buildStave(theta, span, 1 + k * 2.71, rnd));
    if (wd > widest) [widest, bungAngle] = [wd, theta + span / 2];
    theta += span;
  });
  wood.push(...buildHead(rnd), buildBung(bungAngle));
  const iron = HOOPS.flatMap(([y0, w], k) => buildHoop(y0, w, k, rnd));

  const { wood: woodMat, iron: ironMat } = photorealMaterials({
    uT: T,
    uHoops: HOOPS.map(([y0, w]) => [y0, y0 + w]),
    uBung: new THREE.Vector4(Math.atan2(Math.sin(bungAngle), Math.cos(bungAngle)), H / 2, 0.0222, RB),
    uHead: new THREE.Vector2(HEAD_Y, R(HEAD_Y) - T),
    uH: H,
  }, opts);

  const root = new THREE.Group();
  root.name = 'realBarrel';
  const staves = new THREE.Mesh(mergeGeometries(wood), woodMat);
  const hoops = new THREE.Mesh(mergeGeometries(iron), ironMat);
  // Behind the head's joints: the dark inside, so the hairline gaps don't show the sky.
  const inside = new THREE.Mesh(new THREE.CircleGeometry(R(HEAD_Y) - T, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.009, 0.007) }));
  inside.position.y = HEAD_Y - 0.03;
  root.add(staves, hoops, inside);

  followDaylight(staves, [[woodMat, 0.45], [ironMat, 0.6]]);
  return root;
}

/** For the report: how many triangles the experiment draws. */
export function realBarrelTriangles(root: THREE.Object3D) {
  let n = 0;
  root.traverse((o) => { if (o instanceof THREE.Mesh) n += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
  return n;
}

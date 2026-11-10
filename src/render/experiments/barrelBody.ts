import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grid, mulberry, type Sample, type WoodUniforms } from './realBarrel';

/**
 * EXPERIMENT (T65, owner, 2026-11-09): a game-size barrel body for the photoreal surface. The game barrel's outline
 * (1 m tall, 0.48 m belly, like `modernBarrel.ts`), cut into separate staves with real V-grooves, carrying the attributes the
 * photoreal shaders read (`realBarrelGlsl.ts`: aWood/aInfo, aHoop) and one UV atlas, so the same body can wear the shader
 * live (`buildLiveBarrel`) or baked into textures once (`barrelBake.ts`). `standard` is the phone budget (≤5k triangles);
 * `rich` spends ~3× on shape (rounded stave edges, more rows, rounder hoops, rivets) to show what shape adds.
 * Outside every art rule on purpose; delete `experiments/` and the village block to remove it.
 */

export type BarrelDetail = 'standard' | 'rich';

export const BODY = { H: 1.0, RB: 0.48, RE: 0.39, T: 0.03, HEAD_IN: 0.05 };
const { H, RB, RE, T, HEAD_IN } = BODY;
/** Each hoop's lower and upper edge (the modern barrel's). */
export const BODY_HOOPS: [number, number][] = [[0.035, 0.085], [0.2, 0.27], [0.73, 0.8], [0.915, 0.965]];

/** The outside radius at height y: a parabola from the ends to the belly. */
export const R = (y: number) => {
  const s = (2 * y) / H - 1;
  return RE + (RB - RE) * (1 - s * s);
};
const HEAD_TOP = H - HEAD_IN;
const HEAD_R = R(HEAD_TOP) - T + 0.003; // tucked into the inner wall
const BUNG_R = 0.03;

/** Where each chart sits in the atlas, as [u0, v0, du, dv] in 0..1 (gutters between them, for the bake's dilation). */
export const ATLAS: Record<string, [number, number, number, number]> = {
  staves: [0, 0, 1, 0.5],
  hoop0: [0, 0.51, 1, 0.045],
  hoop1: [0, 0.563, 1, 0.045],
  hoop2: [0, 0.616, 1, 0.045],
  hoop3: [0, 0.669, 1, 0.045],
  head: [0, 0.72, 0.28, 0.28],
  bung: [0.3, 0.72, 0.06, 0.06],
};
const at = (chart: string, u: number, v: number) => {
  const [u0, v0, du, dv] = ATLAS[chart];
  return [u0 + u * du, v0 + v * dv];
};

const DETAIL = {
  standard: {
    staves: 18,
    across: [0, 0.06, 0.5, 0.94, 1],
    outer: [0.03, 0.09, 0.17, 0.27, 0.38, 0.5, 0.62, 0.73, 0.83, 0.91, 0.97],
    lip: [[0.004, 0.0012]],
    hoopSeg: 48,
    hoopSection: (w: number) => [[0, 0.002], [0.004, 0.006], [w - 0.004, 0.006], [w, 0.002]],
    board: [2, 6],
    rivets: false,
    bungSeg: 12,
  },
  rich: {
    staves: 24,
    across: [0, 0.015, 0.05, 0.15, 0.5, 0.85, 0.95, 0.985, 1],
    outer: [0.025, 0.05, 0.085, 0.13, 0.18, 0.3, 0.37, 0.44, 0.5, 0.56, 0.63, 0.7, 0.82, 0.87, 0.915, 0.95, 0.975],
    lip: [[0.0015, 0.0022], [0.005, 0.0007]],
    hoopSeg: 72,
    hoopSection: (w: number) => [[0, 0.002], [0.0012, 0.0045], [0.0035, 0.006], [w - 0.0035, 0.006], [w - 0.0012, 0.0045], [w, 0.002]],
    board: [4, 12],
    rivets: true,
    bungSeg: 20,
  },
};

const BEVEL = 0.006; // the rounded stave edge's radius: the groove between staves is twice this wide at the face
const CHAMFER = 0.008;

type Row = { y: number; d: number; end: number };

/** The profile from the bottom inner wall (up inside past the bottom head) to the top one, as surfaces (each its own grid). */
function profile(det: (typeof DETAIL)[BarrelDetail], jB: number, jT: number): Row[][] {
  const bottom = (j: number): Row[][] => [
    [{ y: HEAD_IN + 0.006, d: T, end: 0 }, { y: CHAMFER, d: T, end: 0 }], // the inner wall
    [{ y: CHAMFER, d: T, end: 1 }, { y: j, d: T - CHAMFER, end: 1 }], // the chamfer inside
    [{ y: j, d: T - CHAMFER, end: 1 }, { y: j, d: 0.004, end: 1 }], // the end grain
  ];
  const lipB = [{ y: jB, d: 0.004, end: 0 }, ...det.lip.map(([dy, d]) => ({ y: jB + dy, d, end: 0 }))];
  const lipT = [{ y: H + jT, d: 0.004, end: 0 }, ...det.lip.map(([dy, d]) => ({ y: H + jT - dy, d, end: 0 }))].reverse();
  const outer: Row[] = [...lipB, ...det.outer.map((y) => ({ y, d: 0, end: 0 })), ...lipT];
  const top = bottom(-jT).map((s) => s.map((r) => ({ ...r, y: H - r.y })).reverse()).reverse();
  return [...bottom(jB), outer, ...top];
}

const radial = (p: THREE.Vector3) => new THREE.Vector3(p.x, 0, p.z).normalize();

export type BarrelBody = {
  /** What's drawn: staves, the heads, the bung. Attributes position, normal, uv, aWood, aInfo. */
  wood: THREE.BufferGeometry;
  /** What's drawn: hoops (and rivets). Attributes position, normal, uv, aHoop. */
  iron: THREE.BufferGeometry;
  /** What the bake rasterises into the atlas (each chart covered edge to edge, nothing twice). */
  bakeWood: THREE.BufferGeometry;
  bakeIron: THREE.BufferGeometry;
  /** The photoreal shader's uniforms for this body. */
  uniforms: WoodUniforms;
};

/** Builds the body, standing on its bottom at the origin. Deterministic. */
export function buildBarrelBody(detail: BarrelDetail): BarrelBody {
  const det = DETAIL[detail];
  const rnd = mulberry(detail === 'standard' ? 65 : 6565);
  const N = det.staves;
  const widths = Array.from({ length: N }, () => 0.8 + rnd() * 0.4);
  const total = widths.reduce((a, b) => a + b, 0);
  const theta0 = rnd() * Math.PI * 2;
  const staves: THREE.BufferGeometry[] = [];
  let theta = theta0, bungAngle = 0, widest = 0;
  widths.forEach((wd, k) => {
    const span = (wd / total) * Math.PI * 2;
    staves.push(...buildStave(det, theta, span, theta0, 1 + k * 2.71, rnd));
    if (wd > widest) [widest, bungAngle] = [wd, theta + span / 2];
    theta += span;
  });
  const [top, topBake] = buildHead(det, true);
  const [bottom] = buildHead(det, false);
  const bung = buildBung(det.bungSeg, bungAngle);
  const hoops = BODY_HOOPS.map(([y0, y1], k) => buildHoop(det, y0, y1, k, rnd));
  const rivets = det.rivets ? BODY_HOOPS.flatMap(([y0, y1], k) => buildRivets(y0, y1, k, hoops[k].off)) : [];

  const uniforms: WoodUniforms = {
    uT: T,
    uHoops: [...BODY_HOOPS, [-10, -10], [-10, -10]],
    uBung: new THREE.Vector4(Math.atan2(Math.sin(bungAngle), Math.cos(bungAngle)), H / 2, BUNG_R, RB),
    uHead: new THREE.Vector2(HEAD_TOP, HEAD_R),
    uH: H,
  };
  return {
    wood: mergeGeometries([...staves, top, bottom, bung]),
    iron: mergeGeometries([...hoops.map((h) => h.geo), ...rivets]),
    bakeWood: mergeGeometries([...staves, topBake, bung]),
    bakeIron: mergeGeometries(hoops.map((h) => h.geo)),
    uniforms,
  };
}

function buildStave(det: (typeof DETAIL)[BarrelDetail], th0: number, span: number, start: number, seed: number, rnd: () => number) {
  const dr = (rnd() - 0.5) * 0.0015, jB = (rnd() - 0.5) * 0.003, jT = (rnd() - 0.5) * 0.004;
  const width = (y: number) => span * R(y);
  const sink = (t: number, y: number) => {
    const e = Math.min(t, 1 - t) * width(y);
    return e < BEVEL ? BEVEL - Math.sqrt(BEVEL * BEVEL - (BEVEL - e) ** 2) : 0;
  };
  // Planed nearly flat across: a quarter of a flat board's chord, so the barrel is ever so slightly polygonal.
  const flat = (t: number, y: number) => 0.25 * R(y) * (1 - Math.cos(span / 2) / Math.cos((t - 0.5) * span));
  const segs = profile(det, jB, jT);
  // v along the profile (arc length at the stave's middle), the same for every stave's ends so the chart is filled.
  const mid = (r: Row) => new THREE.Vector2(R(r.y) - r.d, r.y);
  const lens: number[][] = [];
  let s = 0;
  for (const seg of segs) {
    lens.push(seg.map((r, j) => (j === 0 ? s : (s += mid(r).distanceTo(mid(seg[j - 1]))))));
  }
  const parts: THREE.BufferGeometry[] = [];
  const cols = det.across;
  segs.forEach((seg, si) => {
    const outward = si === 3 ? radial : si < 3 ? (si === 2 ? () => new THREE.Vector3(0, -1, 0) : (p: THREE.Vector3) => radial(p).negate().add(new THREE.Vector3(0, si === 1 ? -1 : 0, 0)))
      : si === 4 ? () => new THREE.Vector3(0, 1, 0) : (p: THREE.Vector3) => radial(p).negate().add(new THREE.Vector3(0, si === 5 ? 1 : 0, 0));
    parts.push(grid(cols.length - 1, seg.length - 1, (i, j): Sample => {
      const t = cols[i], row = seg[j];
      const sk = sink(t, row.y) * Math.max(0, 1 - row.d / T);
      const a = th0 + t * span, r = R(row.y) + dr - flat(t, row.y) - row.d - sk;
      return {
        p: [r * Math.cos(a), row.y, r * Math.sin(a)],
        attrs: {
          uv: at('staves', (a - start) / (Math.PI * 2), lens[si][j] / s),
          aWood: [t * width(row.y), row.y, row.d + sk],
          aInfo: [seed, 0, width(row.y), row.end],
        },
      };
    }, outward));
  });
  return parts;
}

/** A head's five boards: the drawn ones clipped to the disc, and (top only) the bake's, each a full rectangle of the chart. */
function buildHead(det: (typeof DETAIL)[BarrelDetail], top: boolean): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const ratios = [0.15, 0.22, 0.26, 0.22, 0.15];
  const edges = [-HEAD_R];
  for (const r of ratios) edges.push(edges[edges.length - 1] + r * 2 * HEAD_R);
  const y = top ? HEAD_TOP : HEAD_IN;
  const dir = () => new THREE.Vector3(0, top ? 1 : -1, 0);
  const [nx, nz] = top ? det.board : [1, 4];
  const drawn: THREE.BufferGeometry[] = [], bake: THREE.BufferGeometry[] = [];
  const sample = (b: number, x: number, z: number): Sample => {
    const xa = edges[b], xb = edges[b + 1];
    return {
      p: [x, y, z],
      attrs: {
        uv: at('head', (x + HEAD_R) / (2 * HEAD_R), (z + HEAD_R) / (2 * HEAD_R)),
        aWood: [x - xa, z + HEAD_R, 0],
        aInfo: [40 + b * 1.37, 1, xb - xa, 0],
      },
    };
  };
  for (let b = 0; b < ratios.length; b++) {
    const xa = edges[b], xb = edges[b + 1];
    const zMax = (x: number) => Math.sqrt(Math.max(HEAD_R * HEAD_R - x * x, 1e-8));
    drawn.push(grid(nx, nz, (i, j) => {
      const x = xa + ((xb - xa) * i) / nx, zm = zMax(x);
      return sample(b, x, -zm + (2 * zm * j) / nz);
    }, dir));
    bake.push(grid(1, 1, (i, j) => sample(b, i ? xb : xa, j ? HEAD_R : -HEAD_R), dir));
  }
  return [mergeGeometries(drawn), mergeGeometries(bake)];
}

function buildBung(seg: number, angle: number): THREE.BufferGeometry {
  const k = BUNG_R / 0.0224;
  const pts = [[0, 0.0145], [0.008, 0.0142], [0.014, 0.0135], [0.018, 0.0124], [0.0205, 0.0108], [0.0216, 0.0088], [0.0222, 0.005], [0.0224, -0.012]]
    .map(([x, y]) => new THREE.Vector2(x * k, y * k)).reverse();
  const g = new THREE.LatheGeometry(pts, seg);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const wood: number[] = [], info: number[] = [], uvs: number[] = [];
  for (let v = 0; v < p.count; v++) {
    wood.push(p.getX(v) + 0.04, p.getY(v), p.getZ(v) + 0.04);
    info.push(77.7, 2, 0.08, n.getY(v) > 0.8 ? 1 : 0);
    uvs.push(...at('bung', uv.getX(v), uv.getY(v)));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aWood', new THREE.Float32BufferAttribute(wood, 3));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  m.setPosition(dir.clone().multiplyScalar(R(H / 2) - 0.0008).setY(H / 2));
  g.applyMatrix4(m);
  return g;
}

/** A hoop: its section swept round, normals from the section (rounded edges), the seam at a random angle. */
function buildHoop(det: (typeof DETAIL)[BarrelDetail], y0: number, y1: number, k: number, rnd: () => number) {
  const w = y1 - y0, sec = det.hoopSection(w), S = det.hoopSeg;
  const off = rnd() * Math.PI * 2, seed = 10 + k * 3.17, rc = R(y0 + w / 2);
  const pr = sec.map(([t, o]) => new THREE.Vector2(R(y0 + t) + o, y0 + t));
  const nr = pr.map((_, i) => {
    const d = pr[Math.min(i + 1, pr.length - 1)].clone().sub(pr[Math.max(i - 1, 0)]);
    return new THREE.Vector2(d.y, -d.x).normalize();
  });
  const len = [0];
  for (let i = 1; i < pr.length; i++) len.push(len[i - 1] + pr[i].distanceTo(pr[i - 1]));
  const L = len[len.length - 1];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], hoop: number[] = [];
  for (let j = 0; j <= S; j++) {
    const a = (2 * Math.PI * j) / S, c = Math.cos(a + off), s = Math.sin(a + off);
    pr.forEach((p, i) => {
      pos.push(p.x * c, p.y, p.x * s);
      nrm.push(nr[i].x * c, nr[i].y, nr[i].x * s);
      uv.push(...at(`hoop${k}`, j / S, len[i] / L));
      hoop.push(a * rc, sec[i][0], seed, w);
    });
  }
  const index: number[] = [];
  const n = pr.length;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const a = j * n + i, b = (j + 1) * n + i;
      index.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aHoop', new THREE.Float32BufferAttribute(hoop, 4));
  geo.setIndex(index);
  return { geo, off };
}

/** Two rivets where each hoop's ends meet (drawn only: they sample the hoop's texels beneath them). */
function buildRivets(y0: number, y1: number, k: number, off: number): THREE.BufferGeometry[] {
  const w = y1 - y0, yc = y0 + w / 2, rc = R(yc);
  return [0.04, 0.09].map((a) => {
    const g = new THREE.SphereGeometry(0.0055, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.5, 1);
    const dir = new THREE.Vector3(Math.cos(a + off), 0, Math.sin(a + off));
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    m.setPosition(dir.clone().multiplyScalar(rc + 0.0055).setY(yc));
    g.applyMatrix4(m);
    const count = g.attributes.position.count;
    const uv = at(`hoop${k}`, a / (2 * Math.PI), 0.5);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => uv).flat(), 2));
    g.setAttribute('aHoop', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [a * rc, w / 2, 10 + k * 3.17, w]).flat(), 4));
    return g;
  });
}

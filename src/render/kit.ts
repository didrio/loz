import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/math';
import { BAKED_SHADE, kitMat } from './materials';
import { snap } from './palette';
import { faceNormals, type SurfaceId } from './textures';

/**
 * The modeling kit (docs/pipeline.md "The modeling kit"): the builders every final pass uses, so the style is
 * consistent for free. A kit piece is a plain non-indexed `BufferGeometry` with `position`, `normal` and a
 * vertex `color` (linear, like a material's). Pieces are pure and deterministic (the same arguments, and the same seed
 * where there is one, give the same vertices). Paint with `paint`/`paintRegion` (snapped to the master palette), shade with
 * `crevice`, combine with `merge`/`mirror`, then turn the result into a mesh with `kitMesh`.
 *
 * Conventions: forms stand on y = 0 and are centred on x and z (a box is centred on all three); orientation is fixed by
 * construction, so a piece's faces always point outward.
 */

export type Vec3 = readonly [number, number, number];

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

/** The triangles in a flat list of corner points → a non-indexed geometry with flat normals and white vertex colours. */
function fromTriangles(points: THREE.Vector3[]): THREE.BufferGeometry {
  const pos = new Float32Array(points.length * 3);
  points.forEach((p, i) => p.toArray(pos, i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed: each face gets its own normal (flat)
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(points.length * 3).fill(1), 3));
  return g;
}

/** Makes a geometry kit-shaped: non-indexed, with normals and a colour attribute, and nothing else. */
function kitShaped(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

/** Turns the triangles of a closed solid so they all face outward (by the sign of the enclosed volume). */
function outward(points: THREE.Vector3[]): THREE.Vector3[] {
  let volume = 0;
  for (let i = 0; i + 2 < points.length; i += 3) volume += points[i].dot(new THREE.Vector3().crossVectors(points[i + 1], points[i + 2]));
  if (volume >= 0) return points;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < points.length; i += 3) out.push(points[i], points[i + 2], points[i + 1]);
  return out;
}

/** Colours: kit colours are palette colours. */
const linear = (hex: number) => new THREE.Color(snap(hex));

/** Every triangle's three corners are read through this. */
function eachTriangle(g: THREE.BufferGeometry, fn: (i: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, normal: THREE.Vector3) => void) {
  const pos = g.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    fn(i, a, b, c, n);
  }
}

// ---------------------------------------------------------------- forms

/**
 * A box centred on the origin with its edges chamfered by `bevel` (m): 44 triangles instead of 12, and every edge catches
 * the light. `bevel` is capped at 45% of the smallest side; 0 gives a plain 12-triangle box.
 */
export function bevelBox(w: number, h: number, d: number, bevel = 0.05): THREE.BufferGeometry {
  const b = Math.min(bevel, 0.45 * Math.min(w, h, d));
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const pts: THREE.Vector3[] = [];
  // Every triangle is turned to face away from the centre: the box is convex, so that is always outward.
  const tri = (a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(c, a));
    const centre = a.clone().add(bb).add(c);
    if (n.dot(centre) >= 0) pts.push(a, bb, c);
    else pts.push(a, c, bb);
  };
  const quad = (a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, dd: THREE.Vector3) => {
    tri(a, bb, c);
    tri(a, c, dd);
  };
  if (b <= 0) {
    for (const s of [-1, 1]) {
      quad(new THREE.Vector3(s * hx, -hy, -hz), new THREE.Vector3(s * hx, hy, -hz), new THREE.Vector3(s * hx, hy, hz), new THREE.Vector3(s * hx, -hy, hz));
      quad(new THREE.Vector3(-hx, s * hy, -hz), new THREE.Vector3(hx, s * hy, -hz), new THREE.Vector3(hx, s * hy, hz), new THREE.Vector3(-hx, s * hy, hz));
      quad(new THREE.Vector3(-hx, -hy, s * hz), new THREE.Vector3(hx, -hy, s * hz), new THREE.Vector3(hx, hy, s * hz), new THREE.Vector3(-hx, hy, s * hz));
    }
    return fromTriangles(pts);
  }
  // Each corner has one vertex on each of the three faces that meet there.
  const corner = (sx: number, sy: number, sz: number, axis: number) =>
    new THREE.Vector3(sx * (axis === 0 ? hx : hx - b), sy * (axis === 1 ? hy : hy - b), sz * (axis === 2 ? hz : hz - b));
  const S = [-1, 1];
  for (const axis of [0, 1, 2] as const) {
    const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    for (const s of S) {
      // The face itself.
      const at = (p: number, q: number) => {
        const sg: [number, number, number] = [0, 0, 0];
        sg[axis] = s;
        sg[u] = p;
        sg[v] = q;
        return corner(sg[0], sg[1], sg[2], axis);
      };
      quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1));
    }
  }
  // The edges: between two faces, along the third axis.
  for (const along of [0, 1, 2] as const) {
    const [a1, a2] = along === 0 ? [1, 2] : along === 1 ? [0, 2] : [0, 1];
    for (const s1 of S) for (const s2 of S) {
      const at = (face: number, t: number) => {
        const sg: [number, number, number] = [0, 0, 0];
        sg[a1] = s1;
        sg[a2] = s2;
        sg[along] = t;
        return corner(sg[0], sg[1], sg[2], face);
      };
      quad(at(a1, -1), at(a1, 1), at(a2, 1), at(a2, -1));
    }
  }
  // The corners.
  for (const sx of S) for (const sy of S) for (const sz of S) tri(corner(sx, sy, sz, 0), corner(sx, sy, sz, 1), corner(sx, sy, sz, 2));
  return fromTriangles(pts);
}

/**
 * A surface of revolution about the y axis from a `profile` of `[radius, y]` points, bottom to top. A radius of 0 is a pole.
 * `capped` closes a profile that starts or ends away from the axis with a flat disc.
 */
export function lathe(profile: readonly (readonly [number, number])[], sides = 8, capped = true): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const at = (r: number, y: number, k: number) => {
    const a = (k / sides) * Math.PI * 2;
    return new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
  };
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    for (let k = 0; k < sides; k++) {
      const A = at(r0, y0, k), B = at(r0, y0, k + 1), C = at(r1, y1, k + 1), D = at(r1, y1, k);
      if (r1 > 0) pts.push(A, D, C);
      if (r0 > 0) pts.push(A, C, B);
    }
  }
  if (capped && profile.length > 1) {
    const [r0, y0] = profile[0], [r1, y1] = profile[profile.length - 1];
    for (let k = 0; k < sides; k++) {
      if (r0 > 0) pts.push(new THREE.Vector3(0, y0, 0), at(r0, y0, k), at(r0, y0, k + 1));
      if (r1 > 0) pts.push(new THREE.Vector3(0, y1, 0), at(r1, y1, k + 1), at(r1, y1, k));
    }
  }
  return fromTriangles(pts);
}

/**
 * A tapered limb, tree trunk or tooth: `height` tall from y = 0, `bottom` radius at the foot, `top` radius at the tip.
 * `flatten` squeezes it along z (0.6 = a flat plank of a limb); `sides` is the number of flats around it.
 */
export function taper(bottom: number, top: number, height: number, sides = 6, flatten = 1): THREE.BufferGeometry {
  const g = lathe([[bottom, 0], [top, height]], sides);
  g.scale(1, 1, flatten);
  g.computeVertexNormals();
  return g;
}

/** A low-segment sphere centred on the origin: `sides` around and `rings` from pole to pole (a chunky one is 6 × 4). */
export function lowSphere(radius: number, sides = 6, rings = 4): THREE.BufferGeometry {
  const profile: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * Math.PI;
    profile.push([i === 0 || i === rings ? 0 : radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return lathe(profile, sides);
}

/** A capsule standing on y = 0, `length` tall in all (at least two radii), with `rings` steps in each end cap. */
export function capsule(radius: number, length: number, sides = 6, rings = 2): THREE.BufferGeometry {
  const straight = Math.max(0, length - 2 * radius);
  const profile: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * (Math.PI / 2);
    profile.push([i === 0 ? 0 : radius * Math.cos(a), radius + radius * Math.sin(a)]);
  }
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * (Math.PI / 2);
    profile.push([i === rings ? 0 : radius * Math.cos(a), radius + straight + radius * Math.sin(a)]);
  }
  // The ring where the two caps meet appears twice when there is no straight part; drop the duplicate.
  const clean = profile.filter((p, i) => i === 0 || p[0] !== profile[i - 1][0] || p[1] !== profile[i - 1][1]);
  return lathe(clean, sides);
}

/**
 * A closed 2D `profile` (x, y points, in order; the first and last are joined) swept along `path` (3D points): a tail,
 * a horn, a root, a handle, a curved lid. `scale(t)` sizes the profile along the way (t runs 0 to 1; the default is 1
 * everywhere, `(t) => 1 - t` tapers to a point). The profile's x runs to the path's right and its y up, for a path that
 * starts along +z; the ends are closed with a flat cap.
 */
export function extrudePath(profile: readonly (readonly [number, number])[], path: readonly Vec3[], scale: (t: number) => number = () => 1): THREE.BufferGeometry {
  if (profile.length < 3 || path.length < 2) throw new Error('extrudePath needs a profile of 3+ points and a path of 2+');
  const P = path.map(v3);
  const tangents = P.map((p, i) => P[Math.min(P.length - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize());
  // Parallel transport: carry the "up" reference along the path so the profile does not twist.
  let up = Math.abs(tangents[0].y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const rings: THREE.Vector3[][] = [];
  P.forEach((p, i) => {
    const T = tangents[i];
    const N = up.clone().sub(T.clone().multiplyScalar(up.dot(T))).normalize();
    up = N.clone();
    const R = new THREE.Vector3().crossVectors(N, T);
    const s = scale(P.length === 1 ? 0 : i / (P.length - 1));
    rings.push(profile.map(([x, y]) => p.clone().addScaledVector(R, x * s).addScaledVector(N, y * s)));
  });
  const pts: THREE.Vector3[] = [];
  const n = profile.length;
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < n; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % n], c = rings[i + 1][(k + 1) % n], d = rings[i + 1][k];
      pts.push(a, b, c, a, c, d);
    }
  }
  for (const [ring, flip] of [[rings[0], false], [rings[rings.length - 1], true]] as const) {
    const centre = ring.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(n);
    for (let k = 0; k < n; k++) pts.push(...(flip ? [centre, ring[k], ring[(k + 1) % n]] : [centre, ring[(k + 1) % n], ring[k]]));
  }
  return fromTriangles(outward(pts));
}

// ------------------------------------------------------- combine, move

/** Joins pieces into one geometry (they must be kit pieces; a piece without colours is white). */
export function merge(...pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(pieces.map(kitShaped));
  if (!merged) throw new Error('merge: nothing to merge');
  return merged;
}

/** Moves a copy of the piece by (x, y, z), optionally turning it first (radians about x, y, z, in that order). */
export function place(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rotation: Vec3 = [0, 0, 0]): THREE.BufferGeometry {
  const out = kitShaped(g);
  out.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2])), new THREE.Vector3(1, 1, 1)));
  return out;
}

/** The piece and its reflection across the x = 0 plane (or y, or z), both facing outward: half a model is a whole one. */
export function mirror(g: THREE.BufferGeometry, axis: 'x' | 'y' | 'z' = 'x'): THREE.BufferGeometry {
  const k = { x: 0, y: 1, z: 2 }[axis];
  const copy = kitShaped(g);
  const pos = copy.attributes.position, nor = copy.attributes.normal, col = copy.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    pos.setComponent(i, k, -pos.getComponent(i, k));
    nor.setComponent(i, k, -nor.getComponent(i, k));
  }
  // The reflection turns every triangle inside out: swap two corners of each.
  for (const attr of [pos, nor, col]) {
    for (let i = 0; i + 2 < attr.count; i += 3) {
      const b = [attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)], c = [attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2)];
      attr.setXYZ(i + 1, c[0], c[1], c[2]);
      attr.setXYZ(i + 2, b[0], b[1], b[2]);
    }
  }
  return merge(g, copy);
}

/**
 * Slight asymmetry, so nothing looks machine-made: moves every vertex by up to `amount` metres, the same way for vertices
 * that share a position (no cracks). Seeded: the same seed gives the same wobble.
 */
export function wobble(g: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
  const out = kitShaped(g);
  const pos = out.attributes.position;
  const moved = new Map<string, [number, number, number]>();
  const rnd = mulberry32(seed);
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let d = moved.get(key);
    if (!d) moved.set(key, (d = [(rnd() * 2 - 1) * amount, (rnd() * 2 - 1) * amount, (rnd() * 2 - 1) * amount]));
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  out.computeVertexNormals();
  return out;
}

// ------------------------------------------------------------ normals

/**
 * Crease-angle normals: faces that meet at less than `angleDeg` share a smooth normal, sharper edges stay hard.
 * (Faceted is the look, so most pieces keep their flat normals; use this on a dome or a round limb that should read round.)
 */
export function creaseNormals(g: THREE.BufferGeometry, angleDeg = 35): THREE.BufferGeometry {
  const out = kitShaped(g);
  out.computeVertexNormals(); // flat to start from
  const pos = out.attributes.position, nor = out.attributes.normal;
  const limit = Math.cos((angleDeg * Math.PI) / 180);
  const faceN: THREE.Vector3[] = [];
  const faceArea: number[] = [];
  const at = new Map<string, number[]>(); // position → the faces that touch it
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f * 3 + 2 < pos.count; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    const n = e1.subVectors(b, a).cross(e2.subVectors(c, a));
    faceArea.push(n.length());
    faceN.push(n.clone().normalize());
    for (let k = 0; k < 3; k++) {
      const key = `${pos.getX(f * 3 + k).toFixed(4)},${pos.getY(f * 3 + k).toFixed(4)},${pos.getZ(f * 3 + k).toFixed(4)}`;
      const list = at.get(key);
      if (list) list.push(f);
      else at.set(key, [f]);
    }
  }
  const sum = new THREE.Vector3();
  for (let f = 0; f < faceN.length; f++) {
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k;
      const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      sum.set(0, 0, 0);
      for (const o of at.get(key)!) if (faceN[o].dot(faceN[f]) >= limit) sum.addScaledVector(faceN[o], faceArea[o]);
      sum.normalize();
      nor.setXYZ(i, sum.x, sum.y, sum.z);
    }
  }
  return out;
}

// -------------------------------------------------------------- colour

/** Paints the whole piece one palette colour (`pal('wood', 2)`; anything else snaps to the nearest swatch). */
export function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const out = kitShaped(g);
  const c = linear(color);
  const col = out.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b);
  return out;
}

/**
 * Colour breakup by region: `pick` gets each triangle's centre and unit normal and answers a palette colour, or `undefined`
 * to leave it as it is. `(c, n) => n.y > 0.7 ? pal('moss') : undefined` mosses every upward face; `c.y < 0.2` stains a foot.
 */
export function paintRegion(g: THREE.BufferGeometry, pick: (centre: THREE.Vector3, normal: THREE.Vector3) => number | undefined): THREE.BufferGeometry {
  const out = kitShaped(g);
  const col = out.attributes.color;
  const centre = new THREE.Vector3();
  eachTriangle(out, (i, a, b, c, n) => {
    const hex = pick(centre.copy(a).add(b).add(c).divideScalar(3), n);
    if (hex === undefined) return;
    const k = linear(hex);
    for (let j = 0; j < 3; j++) col.setXYZ(i + j, k.r, k.g, k.b);
  });
  return out;
}

/**
 * Crevice and underside darkening: faces that look down darken by `underside`, and walls darken toward their foot (by `foot`
 * at the lowest point of the piece, fading to nothing `footHeight` metres up). The defaults are the merged scenery's
 * (`BAKED_SHADE`), so a model sits in the same light as the world around it. Multiplies the colours, so paint first.
 */
export function crevice(g: THREE.BufferGeometry, shade: Partial<typeof BAKED_SHADE> = {}): THREE.BufferGeometry {
  const s = { ...BAKED_SHADE, ...shade };
  const out = kitShaped(g);
  out.computeBoundingBox();
  const minY = out.boundingBox!.min.y;
  const pos = out.attributes.position, col = out.attributes.color;
  eachTriangle(out, (i, _a, _b, _c, n) => {
    for (let k = 0; k < 3; k++) {
      let f = 1;
      if (n.y < -0.5) f = s.underside;
      else if (Math.abs(n.y) < 0.5) f = s.foot + (1 - s.foot) * Math.min(1, Math.max(0, (pos.getY(i + k) - minY) / s.footHeight));
      col.setXYZ(i + k, col.getX(i + k) * f, col.getY(i + k) * f, col.getZ(i + k) * f);
    }
  });
  return out;
}

/**
 * A gentle ramp of light over a piece's height (owner, 2026-11-08: no object is one flat colour): multiplies the colours by
 * `low` at `from` (default: the piece's lowest point) up to `high` at `to` (its highest), per vertex, so the shade slides
 * smoothly across faces while painted regions keep their colours. Paint first; `crevice` after.
 */
export function gradient(g: THREE.BufferGeometry, low = 0.85, high = 1.05, from?: number, to?: number): THREE.BufferGeometry {
  const out = kitShaped(g);
  out.computeBoundingBox();
  const y0 = from ?? out.boundingBox!.min.y, y1 = to ?? out.boundingBox!.max.y;
  const span = Math.max(1e-6, y1 - y0);
  const pos = out.attributes.position, col = out.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const f = low + (high - low) * Math.min(1, Math.max(0, (pos.getY(i) - y0) / span));
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  return out;
}

// ------------------------------------------------------ count, meshes

/** Triangles in one mesh (instances counted). */
export function meshTriangles(m: THREE.Mesh): number {
  const g = m.geometry;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
  return tris * (m instanceof THREE.InstancedMesh ? m.count : 1);
}

/** Triangles in a geometry, or in every mesh under an object. */
export function triangleCount(of: THREE.BufferGeometry | THREE.Object3D): number {
  if (of instanceof THREE.BufferGeometry) return (of.index ? of.index.count : of.attributes.position.count) / 3;
  let n = 0;
  of.traverse((o) => {
    if (o instanceof THREE.Mesh) n += meshTriangles(o);
  });
  return n;
}

/**
 * A mesh from a kit piece, in the shared vertex-coloured material (`kitMat`). Name a `surface` to give it that texture
 * (the texture reads the colour as its tint, so a painted piece keeps its painted colours).
 */
export function kitMesh(g: THREE.BufferGeometry, surface?: SurfaceId): THREE.Mesh {
  const geo = kitShaped(g);
  if (surface) faceNormals(geo);
  return new THREE.Mesh(geo, kitMat(surface));
}

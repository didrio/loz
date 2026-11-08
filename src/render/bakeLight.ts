import * as THREE from 'three';
import { MeshBVH, SAH } from 'three-mesh-bvh';

/**
 * Baked bounce light (vertex GI): how much open sky each vertex of the scenery sees, plus the colour of whatever
 * blocks the rest, worked out once when an area is built and multiplied into its vertex colours. It's what the
 * N64-era games painted into their vertices, computed instead of hand-painted: dark corners and eaves, contact
 * shade where a house meets the ground, grass-green light under a ledge, a warm wall tinting the path beside it.
 *
 * It's a multiplier on the surface colour, not light: the sun, the hemisphere light and the point lights still
 * light everything at runtime, so day and night keep working. Like a printed shadow on a fabric, not a lamp.
 * Only the regions an area asks for are baked (`AreaBuilder.bakeLight`); the edge of a region fades out.
 */
export const BAKE = {
  /** Rays per vertex (cosine-weighted over the hemisphere the face looks into). */
  rays: 32,
  /** How far a ray looks, m: anything farther counts as open sky. Sets the size of the soft shade. */
  reach: 8,
  /** The darkest a vertex gets (before the tint), so a deep corner stays readable. */
  floor: 0.3,
  /** How much the blocked share of the sky darkens (1: a vertex that sees half the sky gets half the light). */
  occlusion: 1,
  /** How far blocked rays tint toward the hue they hit, at full blockage (grass-green under eaves, a red wall's glow). */
  bleed: 0.6,
  /** Big triangles in a region are split to about this edge, m, before baking (`subdivide`). */
  cell: 2,
  /**
   * Whether `AreaBuilder.finish` bakes the regions it was asked for. Only in a browser: unit tests build the overworld
   * a dozen times for its logic, and ~1 s of rays each made the suite 50% slower (they call `bakeLight` directly).
   */
  atBuild: typeof window !== 'undefined',
};

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

/**
 * What a dynamic object is to the bake (`object.userData.bakeLight`): a `receive`r (the terrain) gets baked and
 * blocks rays; an `occlude`r (instanced trees) only blocks rays. Merged scenery is both without being marked.
 */
export type BakeRole = 'receive' | 'occlude';

/** Every geometry the bake changed, so the Dev tab's toggle can swap between the baked and the plain colours. */
const baked = new Set<THREE.BufferGeometry>();
let bakedOn = true;

export function bakedLightOn() {
  return bakedOn;
}

/** Shows the baked colours (on) or the colours from before the bake (off) on everything baked so far. Live. */
export function setBakedLight(on: boolean) {
  bakedOn = on;
  for (const g of baked) {
    const attr = g.attributes.color as THREE.BufferAttribute;
    attr.array = (on ? g.userData.litColors : g.userData.plainColors) as Float32Array;
    attr.needsUpdate = true;
  }
}

/** The fixed ray pattern: a Fibonacci spiral, cosine-weighted, so a plain average of the hits is the right integral. */
function rayPattern(n: number) {
  const dirs: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = Math.sqrt(u);
    const phi = i * golden;
    dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)]);
  }
  return dirs;
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

/**
 * Bakes `regions` into the merged scenery under `merged` and the dynamic objects under `dynamic` marked
 * `receive`; merged scenery, receivers and `occlude`rs all block rays. Both roots must be at the origin,
 * unparented (as `AreaBuilder.finish` has them). A merged mesh's `shade` attribute (`bakeColor`'s rule-of-thumb
 * shade) is divided out where the bake replaces it, then removed.
 */
export function bakeLight(merged: THREE.Object3D, dynamic: THREE.Object3D, regions: LightRegion[]) {
  const receivers: THREE.Mesh[] = [];
  const occluders: THREE.Mesh[] = [];
  merged.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshLambertMaterial;
    if (m.transparent) return;
    occluders.push(o);
    if (m.vertexColors && o.geometry.attributes.color && !(m.emissive && m.emissive.getHex())) receivers.push(o);
  });
  dynamic.traverse((o) => {
    const role = o.userData.bakeLight as BakeRole | undefined;
    if (!role || !(o instanceof THREE.Mesh)) return;
    occluders.push(o);
    if (role === 'receive' && o.geometry.attributes.color && !(o instanceof THREE.InstancedMesh)) receivers.push(o);
  });
  merged.updateMatrixWorld(true);
  dynamic.updateMatrixWorld(true);

  const bvh = buildOccluders(occluders, regions);
  if (bvh) {
    for (const r of receivers) {
      const finer = subdivide(r.geometry, r.matrixWorld, regions);
      if (finer !== r.geometry) {
        r.geometry.dispose();
        r.geometry = finer;
      }
      bakeMesh(r, bvh, regions);
    }
  }
  merged.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry.attributes.shade) o.geometry.deleteAttribute('shade');
  });
}

/**
 * Splits each big triangle in the regions into a k×k grid of smaller ones (k from its longest edge and `BAKE.cell`),
 * so the bake has vertices to hold a gradient: a cottage wall is one quad otherwise, and its shade could only run
 * corner to corner. Every attribute is interpolated, so the faces, colours and textures look the same; the two
 * triangles of a rectangle share their longest edge, so they split alike. Returns `g` itself when nothing needed it.
 */
export function subdivide(g: THREE.BufferGeometry, world: THREE.Matrix4, regions: LightRegion[]) {
  if (g.index) return g;
  const p = g.attributes.position;
  const names = Object.keys(g.attributes);
  const attrs = names.map((n) => g.attributes[n] as THREE.BufferAttribute);
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
  attrs.forEach((attr, ai) => finer.setAttribute(names[ai], new THREE.BufferAttribute(new Float32Array(out[ai]), attr.itemSize)));
  finer.userData = g.userData;
  return finer;
}

interface Occluders {
  bvh: MeshBVH;
  /** Linear albedo per occluder triangle, in the order the triangles were added. */
  albedo: Float32Array;
}

/** One world-space triangle soup of everything that blocks light near the regions, with each triangle's colour. */
function buildOccluders(meshes: THREE.Mesh[], regions: LightRegion[]): Occluders | null {
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // SAH: a slower build than the default, but a third faster to cast against (the village: ~0.6 s of rays, not ~0.85).
  return { bvh: new MeshBVH(geo, { strategy: SAH }), albedo: new Float32Array(alb) };
}

/** Bakes one receiver's vertices (non-indexed, world space): each vertex with its own face's normal. */
function bakeMesh(mesh: THREE.Mesh, occ: Occluders, regions: LightRegion[]) {
  const g = mesh.geometry;
  if (g.index) return; // merged scenery and the terrain are non-indexed; anything else isn't ours to bake
  const p = g.attributes.position;
  const color = g.attributes.color as THREE.BufferAttribute;
  const shade = g.attributes.shade as THREE.BufferAttribute | undefined;
  const plain = new Float32Array(color.array as Float32Array);
  const lit = new Float32Array(plain);
  const dirs = rayPattern(BAKE.rays);
  const cache = new Map<string, [number, number, number]>();
  const ray = new THREE.Ray();
  const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3();
  const v = new THREE.Vector3();
  let changed = false;

  for (let f = 0; f + 2 < p.count; f += 3) {
    tmpA.fromBufferAttribute(p, f).applyMatrix4(mesh.matrixWorld);
    tmpB.fromBufferAttribute(p, f + 1).applyMatrix4(mesh.matrixWorld);
    tmpC.fromBufferAttribute(p, f + 2).applyMatrix4(mesh.matrixWorld);
    n.subVectors(tmpB, tmpA).cross(tmpC.sub(tmpA));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    t.set(Math.abs(n.y) < 0.99 ? 0 : 1, Math.abs(n.y) < 0.99 ? 1 : 0, 0).cross(n).normalize();
    b.crossVectors(n, t);
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, f + k).applyMatrix4(mesh.matrixWorld);
      const w = regionWeight(regions, v.x, v.z);
      if (w <= 0) continue;
      const key = `${Math.round(v.x * 50)},${Math.round(v.y * 50)},${Math.round(v.z * 50)},${Math.round(n.x * 20)},${Math.round(n.y * 20)},${Math.round(n.z * 20)}`;
      let light = cache.get(key);
      if (!light) {
        light = gather(v, n, t, b, dirs, occ, ray);
        cache.set(key, light);
      }
      const i = (f + k) * 3;
      const s = shade ? shade.getX(f + k) : 1;
      for (let ch = 0; ch < 3; ch++) {
        const unshaded = plain[i + ch] / s;
        // Fade from the old look (plain, with its rule-of-thumb shade) to the baked one across the feather.
        lit[i + ch] = plain[i + ch] + (unshaded * light[ch] - plain[i + ch]) * w;
      }
      changed = true;
    }
  }
  if (!changed) return;
  g.userData.plainColors = plain;
  g.userData.litColors = lit;
  color.array = bakedOn ? lit : plain;
  color.needsUpdate = true;
  baked.add(g);
  g.addEventListener('dispose', () => baked.delete(g));
}

/**
 * The multiplier at one vertex: a shade from how much sky it sees (`occlusion`), tinted toward the hue of what
 * blocks the rest (`bleed`). Kept apart on purpose: a physical bounce adds back most of what occlusion takes
 * (tried first; the village barely changed), so here the bounce only colours and occlusion alone darkens.
 */
function gather(
  v: THREE.Vector3, n: THREE.Vector3, t: THREE.Vector3, b: THREE.Vector3,
  dirs: [number, number, number][], occ: Occluders, ray: THREE.Ray,
): [number, number, number] {
  let open = 0, r = 0, g = 0, bl = 0, blocked = 0;
  ray.origin.copy(v).addScaledVector(n, 0.03);
  for (const [dx, dy, dz] of dirs) {
    ray.direction.set(0, 0, 0).addScaledVector(t, dx).addScaledVector(b, dy).addScaledVector(n, dz);
    const hit = occ.bvh.raycastFirst(ray, THREE.FrontSide, 0, BAKE.reach);
    if (!hit || !hit.face) {
      open += 1;
      continue;
    }
    // Near hits block fully, far ones fade to open sky, so the shade has no hard edge at `reach`.
    const block = 1 - (hit.distance / BAKE.reach) ** 2;
    open += 1 - block;
    // The hit's hue only (its brightest channel scaled to 1): bleed tints, it never brightens.
    const tri = Math.floor(hit.face.a / 3) * 3;
    const top = Math.max(occ.albedo[tri], occ.albedo[tri + 1], occ.albedo[tri + 2], 1e-4);
    r += (block * occ.albedo[tri]) / top;
    g += (block * occ.albedo[tri + 1]) / top;
    bl += (block * occ.albedo[tri + 2]) / top;
    blocked += block;
  }
  const count = dirs.length;
  const shade = Math.max(BAKE.floor, 1 - BAKE.occlusion * (1 - open / count));
  // The blocked rays' average hue, mixed in by how much of the view they take up.
  const mix = blocked > 0 ? (BAKE.bleed * blocked) / count : 0;
  const hue = (sum: number) => (blocked > 0 ? 1 + (sum / blocked - 1) * mix : 1);
  return [shade * hue(r), shade * hue(g), shade * hue(bl)];
}

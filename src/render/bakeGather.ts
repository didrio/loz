import * as THREE from 'three';
import { MeshBVH, SAH } from 'three-mesh-bvh';

/**
 * The ray-casting half of the light bake (render/bakeLight.ts), with no Three.js scene and no strength numbers: given
 * a triangle soup of occluders (with each triangle's colour) and a list of points with their normals, how much open sky
 * each point sees and the hue of what blocks the rest. Pure and self-contained so a worker (render/bakeWorker.ts) can
 * run it off the main thread; the strength (`BAKE.sky` / `BAKE.indoor`) is applied afterwards, live.
 */

/** Floats per point in: position (x, y, z) and normal (x, y, z). */
export const POINT_STRIDE = 6;
/** Floats per point out: open-sky share, blocked share (0–1 each), and the blocked rays' average hue (r, g, b). */
export const TERM_STRIDE = 5;

/** The fixed ray pattern: a Fibonacci spiral, cosine-weighted, so a plain average of the hits is the right integral. */
export function rayPattern(n: number) {
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

/** A BVH over the occluder soup (`occPos`: 9 floats per triangle, world space). */
export function occluderTree(occPos: Float32Array) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(occPos, 3));
  // SAH: a slower build than the default, but a third faster to cast against (the village: ~0.6 s of rays, not ~0.85).
  return new MeshBVH(geo, { strategy: SAH });
}

/**
 * The terms for each point (`points`, `POINT_STRIDE` floats each) against `bvh`, whose triangle `i` has the linear
 * colour `occAlb[i*3..]`. Near hits block fully, far ones fade to open sky by `reach`, so the shade has no hard edge.
 * The hue is the hit's brightest channel scaled to 1: bleed tints, it never brightens.
 */
export function gatherPoints(bvh: MeshBVH, occAlb: Float32Array, points: Float32Array, rays: number, reach: number) {
  const count = points.length / POINT_STRIDE;
  const out = new Float32Array(count * TERM_STRIDE);
  const dirs = rayPattern(rays);
  const ray = new THREE.Ray();
  const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const p = i * POINT_STRIDE;
    n.set(points[p + 3], points[p + 4], points[p + 5]);
    t.set(Math.abs(n.y) < 0.99 ? 0 : 1, Math.abs(n.y) < 0.99 ? 1 : 0, 0).cross(n).normalize();
    b.crossVectors(n, t);
    ray.origin.set(points[p], points[p + 1], points[p + 2]).addScaledVector(n, 0.03);
    let open = 0, r = 0, g = 0, bl = 0, blocked = 0;
    for (const [dx, dy, dz] of dirs) {
      ray.direction.set(0, 0, 0).addScaledVector(t, dx).addScaledVector(b, dy).addScaledVector(n, dz);
      const hit = bvh.raycastFirst(ray, THREE.FrontSide, 0, reach);
      if (!hit || !hit.face) {
        open += 1;
        continue;
      }
      const block = 1 - (hit.distance / reach) ** 2;
      open += 1 - block;
      const tri = Math.floor(hit.face.a / 3) * 3;
      const top = Math.max(occAlb[tri], occAlb[tri + 1], occAlb[tri + 2], 1e-4);
      r += (block * occAlb[tri]) / top;
      g += (block * occAlb[tri + 1]) / top;
      bl += (block * occAlb[tri + 2]) / top;
      blocked += block;
    }
    const o = i * TERM_STRIDE;
    out[o] = open / dirs.length;
    out[o + 1] = blocked / dirs.length;
    out[o + 2] = blocked > 0 ? r / blocked : 1;
    out[o + 3] = blocked > 0 ? g / blocked : 1;
    out[o + 4] = blocked > 0 ? bl / blocked : 1;
  }
  return out;
}

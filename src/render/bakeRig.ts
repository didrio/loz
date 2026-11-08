import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kitMat } from './materials';
import { applySurface, faceNormals, type SurfaceId } from './textures';
import type { Model } from './models/types';

/**
 * `bakeRig` (docs/pipeline.md "The modeling kit"): a model built from many small meshes becomes one mesh per joint.
 *
 * Every joint (a `Group` in `model.joints`) keeps its place in the hierarchy, so behaviour poses it exactly as before, but
 * the meshes inside it, which are not inside another joint, merge into a single mesh (one per kind of surface), with each
 * part's colour baked into its vertices. That is a handful of draw calls instead of dozens, and one material to flash
 * instead of a list: the returned `flashMats` holds those materials, and the hit flash is the material's `emissive`
 * (a uniform), set the way the game already does (`m.emissive.setRGB(k, k, k)`).
 *
 * What is baked: plain opaque meshes (a `MeshLambertMaterial` that is not transparent), kit pieces and old-style `mat`/`surf`
 * meshes alike. What is left alone: glows and anything transparent or `MeshBasicMaterial`, materials the model lists in
 * `animated`, instanced meshes, lights, and a joint that is itself a `Mesh`. Meshes under `root` but in no joint merge too,
 * into a mesh on the root.
 *
 * `shared: true` uses the shared kit materials instead, for a model that never flashes (a prop): then `flashMats` is empty.
 */
export function bakeRig<J extends Record<string, THREE.Object3D>, M extends Model<J>>(model: M, options: { shared?: boolean } = {}): M {
  const { root, joints } = model;
  root.updateMatrixWorld(true);
  const animated = new Set<THREE.Material>(model.animated ?? []);
  const jointSet = new Set<THREE.Object3D>(Object.values(joints));
  const made = new Map<string, THREE.MeshLambertMaterial>();
  const materialFor = (surface: SurfaceId | undefined) => {
    if (options.shared) return kitMat(surface);
    const key = surface ?? '';
    let m = made.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      if (surface) applySurface(m, surface);
      made.set(key, m);
    }
    return m;
  };

  const bakeable = (o: THREE.Object3D): o is THREE.Mesh => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return false;
    const m = o.material as THREE.Material;
    return m instanceof THREE.MeshLambertMaterial && !m.transparent && m.opacity === 1 && !animated.has(m) && !m.map && m.side === THREE.FrontSide;
  };

  /** The meshes that belong to `owner`: its subtree, stopping at other joints. */
  const partsOf = (owner: THREE.Object3D) => {
    const out: THREE.Mesh[] = [];
    const walk = (o: THREE.Object3D) => {
      for (const child of o.children) {
        if (jointSet.has(child)) continue;
        if (bakeable(child)) out.push(child);
        walk(child);
      }
    };
    walk(owner);
    return out;
  };

  const bake = (owner: THREE.Object3D) => {
    const parts = partsOf(owner);
    if (parts.length === 0) return;
    const toLocal = owner.matrixWorld.clone().invert();
    const buckets = new Map<SurfaceId | '', THREE.BufferGeometry[]>();
    for (const part of parts) {
      const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      const m = part.material as THREE.MeshLambertMaterial;
      const hasColors = m.vertexColors && !!g.attributes.color;
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(hasColors && name === 'color')) g.deleteAttribute(name);
      if (!hasColors) {
        const n = g.attributes.position.count;
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) m.color.toArray(colors, i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      part.updateWorldMatrix(true, false);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, part.matrixWorld));
      const key = (m.userData.surface as SurfaceId | undefined) ?? '';
      const list = buckets.get(key);
      if (list) list.push(g);
      else buckets.set(key, [g]);
    }
    for (const part of parts) {
      part.removeFromParent();
      part.geometry.dispose();
    }
    for (const [surface, geos] of buckets) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      if (surface) faceNormals(merged);
      owner.add(new THREE.Mesh(merged, materialFor(surface || undefined)));
    }
  };

  for (const joint of jointSet) if (!(joint instanceof THREE.Mesh)) bake(joint);
  bake(root);

  // Flash materials that still colour a mesh (an unbaked part) stay on the list beside the new ones.
  const still = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) still.add(o.material as THREE.Material);
  });
  const kept = model.flashMats.filter((m) => still.has(m));
  return { ...model, flashMats: options.shared ? kept : [...kept, ...made.values()] };
}

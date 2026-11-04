import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The look of the game: flat-shaded Lambert materials in solid colors. Materials are shared
 * per color, which keeps memory down and lets `mergeStatic` batch meshes by material.
 * Never mutate a material from `mat()`; use `uniqueMat()` for anything that animates.
 */
const cache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(color: number, emissive = 0) {
  const key = `${color}:${emissive}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });
    cache.set(key, m);
  }
  return m;
}

/** A material of its own, safe to animate (flashing enemies, glowing windows). */
export function uniqueMat(color: number, extra: THREE.MeshLambertMaterialParameters = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

/**
 * A glowing (additive) material that fades to nothing in the fog. Left alone, three.js mixes a fogged
 * pixel toward the fog's colour, and additive blending then adds that colour on top, so a far glow
 * shows through the fog as a pale shape (the Northpass gate's veil did, from across the valley).
 */
export function fadeInFog<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb *= 1.0 - fogFactor;
#endif`);
  };
  m.customProgramCacheKey = () => 'fadeInFog';
  return m;
}

export function isSharedMaterial(m: THREE.Material) {
  for (const v of cache.values()) if (v === m) return true;
  return false;
}

/**
 * Bakes every plain mesh under `src` into a few big meshes, one per material per map cell,
 * so a village of hundreds of boxes costs a handful of draw calls. `src` must not be in
 * the scene (its transform is treated as the world). InstancedMeshes are skipped.
 */
export function mergeStatic(src: THREE.Object3D, cellSize = 80) {
  src.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const center = new THREE.Vector3();
  src.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    const material = o.material as THREE.Material;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    g.boundingBox!.getCenter(center);
    const key = `${material.uuid}:${o.castShadow}:${Math.floor(center.x / cellSize)}:${Math.floor(center.z / cellSize)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material, cast: o.castShadow, geos: [] }));
    b.geos.push(g);
    g = null!;
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

/** Frees GPU memory for everything under `root`, except shared materials. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (!isSharedMaterial(m)) m.dispose();
    }
  });
}

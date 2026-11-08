import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { snap } from './palette';
import { applySurface, faceNormals, type SurfaceId } from './textures';

/**
 * The look of the game: flat-shaded Lambert materials in solid colors, some with a generated
 * detail texture (`surf`). Every colour given to `mat`, `surf` and `uniqueMat` is snapped to the
 * master palette (render/palette.ts), so the game stays on palette whatever a call site passes;
 * new code names its colours with `pal()`. Materials are shared per (snapped) color, which keeps
 * memory down. Static scenery is merged by `mergeStatic`, which reads each mesh's colour into a vertex
 * colour and batches by kind of surface, not by colour.
 * Never mutate a material from `mat()`; use `uniqueMat()` for anything that animates.
 */
const cache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(color: number, emissive = 0) {
  color = snap(color);
  if (emissive) emissive = snap(emissive);
  const key = `${color}:${emissive}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });
    cache.set(key, m);
  }
  return m;
}

/**
 * A shared material in `color`, textured as `surface` (render/textures.ts): plaster walls, stone,
 * wood, roof shingles. Same rules as `mat()`: shared per colour and surface, never mutate it.
 */
export function surf(surface: SurfaceId, color: number, emissive = 0) {
  color = snap(color);
  if (emissive) emissive = snap(emissive);
  const key = `${color}:${emissive}:${surface}`;
  let m = cache.get(key);
  if (!m) {
    m = applySurface(new THREE.MeshLambertMaterial({ color, emissive, flatShading: true }), surface);
    cache.set(key, m);
  }
  return m;
}

/**
 * A material of its own, safe to animate (flashing enemies, glowing windows). Its starting colour
 * and emissive are snapped; what code sets on it later (a hit flash, a glow fading) isn't.
 */
export function uniqueMat(color: number, extra: THREE.MeshLambertMaterialParameters = {}) {
  const emissive = typeof extra.emissive === 'number' && extra.emissive ? snap(extra.emissive) : extra.emissive;
  return new THREE.MeshLambertMaterial({ flatShading: true, ...extra, color: snap(color), ...(emissive !== undefined && { emissive }) });
}

/**
 * `uniqueMat` textured as `surface`: for things that flash, fade or glow (enemies, bosses, Wren's coat). The texture
 * only brightens or darkens the colour, so a hit flash (emissive), a fade (`alphaHash`) and the blight's tint work as before.
 * Faces and small bits (eyes, glows) stay on plain `uniqueMat`. Dynamic cones, cylinders and spheres need `faceted()` geometry.
 */
export function uniqueSurf(surface: SurfaceId, color: number, extra: THREE.MeshLambertMaterialParameters = {}) {
  return applySurface(uniqueMat(color, extra), surface);
}

/**
 * A copy of a material that keeps its texture (three's `clone` drops `onBeforeCompile`): for a fade that must not
 * touch the shared original.
 */
export function cloneMaterial<T extends THREE.Material>(m: T): T {
  const c = m.clone() as T;
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  c.userData = { ...m.userData };
  return c;
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

/** The merged scenery's materials: vertex-coloured, one per (surface, emissive) kind. Shared, so never disposed with a tree. */
const baked = new Map<string, THREE.MeshLambertMaterial>();

function bakedMat(surface: SurfaceId | undefined, emissive: number) {
  const key = `${surface ?? 'plain'}:${emissive}`;
  let m = baked.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive, flatShading: true });
    if (surface) applySurface(m, surface);
    baked.set(key, m);
  }
  return m;
}

/**
 * The shared material for kit pieces (render/kit.ts): colour comes from the vertices, optionally textured as `surface`.
 * Same rules as `mat()`: never mutate it. A model that flashes goes through `bakeRig` instead, which makes its own.
 */
export function kitMat(surface?: SurfaceId) {
  return bakedMat(surface, 0);
}

export function isSharedMaterial(m: THREE.Material) {
  for (const v of cache.values()) if (v === m) return true;
  for (const v of baked.values()) if (v === m) return true;
  return false;
}

/**
 * The shade baked into merged scenery's vertex colours (T30), as multipliers: a face looking down is darkest
 * (eaves, ceilings, the underside of a ledge), a wall is darker at its foot and fades to full by `FOOT_HEIGHT`
 * above the mesh's lowest point. It stands in for the crevice shadow the N64 painted into its vertices.
 */
export const BAKED_SHADE = { underside: 0.7, foot: 0.82, footHeight: 1.5 };

/**
 * Writes `color` into `g`'s `color` attribute (linear, like a material's), darkened per `BAKED_SHADE`. `g` is
 * non-indexed and in world space; each triangle's own normal decides which rule applies.
 */
export function bakeColor(g: THREE.BufferGeometry, color: THREE.Color) {
  g.computeBoundingBox();
  const minY = g.boundingBox!.min.y;
  const pos = g.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const shade = new Float32Array(pos.count);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1).sub(a);
    c.fromBufferAttribute(pos, i + 2).sub(a);
    const ny = b.cross(c).normalize().y;
    for (let k = 0; k < 3; k++) {
      let f = 1;
      if (ny < -0.5) f = BAKED_SHADE.underside;
      else if (Math.abs(ny) < 0.5) {
        const t = Math.min(1, Math.max(0, (pos.getY(i + k) - minY) / BAKED_SHADE.footHeight));
        f = BAKED_SHADE.foot + (1 - BAKED_SHADE.foot) * t;
      }
      out.set([color.r * f, color.g * f, color.b * f], (i + k) * 3);
      shade[i + k] = f;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  // The factor itself, so the light bake (render/bakeLight.ts) can replace it; `mergeStatic` drops it unless asked.
  g.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
}

/**
 * Whether a mesh's colour can move into its vertices: a plain opaque Lambert, optionally textured (`surf`) or
 * emissive. Anything else (transparent, BackSide, a custom shader, its own vertex colours) keeps its material.
 */
function isBakeable(m: THREE.Material): m is THREE.MeshLambertMaterial {
  if (!(m instanceof THREE.MeshLambertMaterial)) return false;
  if (m.transparent || m.opacity !== 1 || m.side !== THREE.FrontSide || m.vertexColors || m.map || m.alphaTest > 0) return false;
  if (!m.fog || !m.depthWrite || !m.depthTest || m.wireframe || m.emissiveIntensity !== 1) return false;
  return !Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') || !!m.userData.surface;
}

/**
 * Bakes every plain mesh under `src` into a few big meshes, one per kind of material per map cell
 * (plain, each surface, emissive, plus each odd material on its own), so a village of hundreds of boxes
 * costs a handful of draw calls. Each mesh's colour goes into a vertex colour with a little baked shade
 * (`bakeColor`). `src` must not be in the scene (its transform is treated as the world). InstancedMeshes are skipped.
 */
/** One static mesh that was baked without a texture (see `mergeAudit`). */
export interface PlainStatic {
  geometry: string;
  color: number;
  emissive: number;
  /** World-space centre and size of the mesh. */
  at: THREE.Vector3;
  size: THREE.Vector3;
}

/**
 * A test hook: while `on`, `mergeStatic` records every plain (untextured) mesh it bakes. `world/texturesEverywhere.test.ts` builds
 * the areas and fails on any that isn't justified, so "everything has a texture" stays true as the game grows.
 */
export const mergeAudit = { on: false, plain: [] as PlainStatic[] };

/** `keepShade` keeps `bakeColor`'s `shade` attribute on the merged meshes, for the light bake to read and remove. */
export function mergeStatic(src: THREE.Object3D, cellSize = 80, keepShade = false) {
  src.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const center = new THREE.Vector3();
  src.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    const material = o.material as THREE.Material;
    const bake = isBakeable(material);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(o.matrixWorld);
    if (material.userData.surface) faceNormals(g); // the texture's projection reads them (textures.ts)
    if (bake) bakeColor(g, material.color);
    g.computeBoundingBox();
    g.boundingBox!.getCenter(center);
    if (mergeAudit.on && bake && !material.userData.surface) {
      mergeAudit.plain.push({ geometry: o.geometry.type, color: material.color.getHex(), emissive: material.emissive.getHex(), at: center.clone(), size: g.boundingBox!.getSize(new THREE.Vector3()) });
    }
    const surface = material.userData.surface as SurfaceId | undefined;
    const emissive = bake ? material.emissive.getHex() : 0;
    const kind = bake ? `baked:${surface ?? ''}:${emissive}` : material.uuid;
    const key = `${kind}:${Math.floor(center.x / cellSize)}:${Math.floor(center.z / cellSize)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: bake ? bakedMat(surface, emissive) : material, geos: [] }));
    b.geos.push(g);
    g = null!;
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    if (!keepShade && merged.attributes.shade) merged.deleteAttribute('shade');
    const mesh = new THREE.Mesh(merged, b.material);
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

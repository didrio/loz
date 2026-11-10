import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBarrelBody, type BarrelBody, type BarrelDetail } from './barrelBody';
import { photorealMaterials } from './realBarrel';
import { IRON_HEADER, WOOD_HEADER } from './realBarrelGlsl';
import { followDaylight, wearSkyCube } from './skyEnv';

/**
 * EXPERIMENT (T65, owner, 2026-11-09): the photoreal barrel's surface on a game-size body, two ways.
 * - `buildLiveBarrel`: the photoreal shaders run on every pixel, every frame (the best this body can look; not affordable).
 * - `buildBakedBarrel`: the same shaders run **once**, into three textures of the body's atlas (colour; roughness and
 *   metalness; the bumped normal, in object space), then a plain Standard material reads them: a few texture reads per pixel.
 *   Still generated in code, no images. One mesh, one material, one draw call.
 * The bake draws the body flat in its UV layout (each vertex placed at its uv), so every texel runs the shader at the point
 * of the barrel it stands for; derivatives are per texel, so the shader's own anti-aliasing fits the texture's resolution.
 * Then a few dilation passes spill each chart's edge into the gutter (mipmaps and filtering read across chart edges).
 */

const BAKE_VERT_WOOD = /* glsl */ `
attribute vec3 aWood; attribute vec4 aInfo;
varying vec3 vWood; varying vec4 vInfo; varying vec3 vObj; varying vec3 vNrm;
void main() { vWood = aWood; vInfo = aInfo; vObj = position; vNrm = normal; gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0); }`;
const BAKE_VERT_IRON = /* glsl */ `
attribute vec4 aHoop;
varying vec4 vHoop; varying vec3 vObj; varying vec3 vNrm;
void main() { vHoop = aHoop; vObj = position; vNrm = normal; gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0); }`;
/** OUT 0: colour (linear; the sRGB target encodes it). 1: occlusion 1, roughness (G), metalness (B). 2: object-space normal. */
const out = (col: string, rough: string, metal: string) => /* glsl */ `
#if OUT == 0
  gl_FragColor = vec4(${col}, 1.0);
#elif OUT == 1
  gl_FragColor = vec4(1.0, ${rough}, ${metal}, 1.0);
#else
  vec3 n = bumpNormal(vObj, normalize(vNrm), hs, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
#endif`;
const BAKE_FRAG_WOOD = /* glsl */ `
${WOOD_HEADER}
varying vec3 vNrm;
void main() {
  vec3 col; float rough; vec3 hs;
  barrelWood(col, rough, hs);
  ${out('col', 'rough', '0.0')}
}`;
const BAKE_FRAG_IRON = /* glsl */ `
${IRON_HEADER}
varying vec3 vNrm;
void main() {
  vec3 col; float rough; float metal; vec3 hs;
  barrelIron(col, rough, metal, hs);
  ${out('col', 'rough', 'metal')}
}`;
/** Fills an empty texel (alpha 0) with the mean of its filled neighbours. */
const DILATE_FRAG = /* glsl */ `
uniform sampler2D tSrc;
void main() {
  ivec2 size = textureSize(tSrc, 0), p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(tSrc, p, 0);
  if (c.a < 0.5) {
    vec4 s = vec4(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec4 t = texelFetch(tSrc, clamp(p + ivec2(i, j), ivec2(0), size - 1), 0);
      if (t.a > 0.5) s += vec4(t.rgb, 1.0);
    }
    c = s.a > 0.0 ? vec4(s.rgb / s.a, 1.0) : vec4(0.0);
  }
  gl_FragColor = c;
}`;
const DILATE_STEPS = 6;

export type BakeResult = { material: THREE.MeshStandardMaterial; ms: number; bytes: number };

/** Runs the photoreal shaders once into the body's atlas at `size`² and returns the material that reads it. */
export function bakeBarrel(renderer: THREE.WebGLRenderer, body: BarrelBody, size: number): BakeResult {
  const t0 = Date.now(); // not performance.now: the look runner steps that clock
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);

  const u = body.uniforms;
  const woodUniforms = {
    uT: { value: u.uT },
    uHoops: { value: u.uHoops.map(([y0, y1]) => new THREE.Vector4(y0, y1, 0, 0)) },
    uBung: { value: u.uBung },
    uHead: { value: u.uHead },
  };
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const wood = new THREE.Mesh(body.bakeWood), iron = new THREE.Mesh(body.bakeIron);
  for (const m of [wood, iron]) m.frustumCulled = false;
  scene.add(wood, iron);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: DILATE_FRAG,
    depthTest: false,
    depthWrite: false,
  }));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene().add(quad);
  const made: THREE.Material[] = [quad.material];
  const temps: THREE.WebGLRenderTarget[] = [];

  const bake = (mode: number, colorSpace: THREE.ColorSpace) => {
    const mat = (vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => {
      const m = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, defines: { OUT: mode }, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
      made.push(m);
      return m;
    };
    wood.material = mat(BAKE_VERT_WOOD, BAKE_FRAG_WOOD, woodUniforms);
    iron.material = mat(BAKE_VERT_IRON, BAKE_FRAG_IRON, { uH: { value: u.uH } });
    const temp = () => {
      const t = new THREE.WebGLRenderTarget(size, size, { colorSpace, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
      temps.push(t);
      return t;
    };
    let src = temp(), dst = temp();
    renderer.setRenderTarget(src);
    renderer.clear();
    renderer.render(scene, camera);
    const final = new THREE.WebGLRenderTarget(size, size, {
      colorSpace,
      depthBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    });
    for (let k = 0; k < DILATE_STEPS; k++) {
      const into = k === DILATE_STEPS - 1 ? final : dst;
      (quad.material as THREE.ShaderMaterial).uniforms.tSrc.value = src.texture;
      renderer.setRenderTarget(into);
      renderer.clear();
      renderer.render(quadScene, camera);
      [src, dst] = [dst, src];
    }
    return final.texture;
  };
  const albedo = bake(0, THREE.SRGBColorSpace);
  const orm = bake(1, THREE.NoColorSpace);
  const normal = bake(2, THREE.NoColorSpace);

  // Wait for the GPU once, so the bake's time is real (the report's "bake ms").
  renderer.readRenderTargetPixels(temps[0], 0, 0, 1, 1, new Uint8Array(4));
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  for (const m of made) m.dispose();
  for (const t of temps) t.dispose();
  quad.geometry.dispose();

  const material = wearSkyCube(new THREE.MeshStandardMaterial({
    map: albedo,
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
    normalMap: normal,
    normalMapType: THREE.ObjectSpaceNormalMap,
    envMapIntensity: 0.5,
  }));
  // RGBA8 with mipmaps (a third more), three maps.
  return { material, ms: Date.now() - t0, bytes: Math.round(size * size * 4 * (4 / 3) * 3) };
}

/** The photoreal shaders live on the game-size body (#1 of T65). */
export function buildLiveBarrel(detail: BarrelDetail = 'standard'): THREE.Group {
  const body = buildBarrelBody(detail);
  const { wood: woodMat, iron: ironMat } = photorealMaterials(body.uniforms);
  const root = new THREE.Group();
  const wood = new THREE.Mesh(body.wood, woodMat), iron = new THREE.Mesh(body.iron, ironMat);
  root.add(wood, iron);
  followDaylight(wood, [[woodMat, 0.45], [ironMat, 0.6]]);
  return root;
}

/** The game-size body wearing its baked surface: one mesh (#2 and #3 of T65). `userData.bake` holds its ms and bytes. */
export function buildBakedBarrel(renderer: THREE.WebGLRenderer, detail: BarrelDetail = 'standard', size = 1024): THREE.Group {
  const body = buildBarrelBody(detail);
  const { material, ms, bytes } = bakeBarrel(renderer, body, size);
  const keep = (g: THREE.BufferGeometry) => {
    const c = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) c.setAttribute(k, g.attributes[k]);
    c.setIndex(g.index);
    return c;
  };
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(mergeGeometries([keep(body.wood), keep(body.iron)]), material);
  root.add(mesh);
  root.userData.bake = { ms, bytes, size };
  followDaylight(mesh, [[material, 0.5]]);
  for (const g of [body.bakeWood, body.bakeIron]) g.dispose();
  return root;
}

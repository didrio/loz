import * as THREE from 'three';

/**
 * The retro look (T18): the scene is drawn small, with no antialiasing, then a composite pass adds a soft
 * bloom, reduces the colour depth with an ordered dither, and scales it up with nearest-neighbour. The HUD is DOM,
 * so it stays crisp. Everything here is code: no imported assets.
 *
 * Analogy: a bitcrusher on the picture. Internal height is the sample rate, `COLOR_LEVELS` the bit depth.
 */

/** Settings' "Retro look" choices: Off, then the internal height in pixels (the scene is drawn that many rows tall). */
export const LOOK_NAMES = ['Off', 'Fine (1080)', 'Soft (720)', 'Retro (540)', 'Crunchy (360)'];
export const LOOK_HEIGHTS = [0, 1080, 720, 540, 360] as const;
export type Look = 0 | 1 | 2 | 3 | 4;
/** Off by default everywhere (owner's call, 2026-11-06: the full-resolution picture first; the look stays a Setting). */
export const DEFAULT_LOOK: Look = 0;

/**
 * Settings' "Resolution" (with the retro look off): how many device pixels the scene is drawn with, as a share of the
 * screen's own (`devicePixelRatio`). Native is the screen's full density (2 on a retina laptop), antialiased, with no
 * sharpening filter. The browser scales the lower ones up.
 */
export const RESOLUTION_NAMES = ['Native', 'Balanced', 'Performance'];
export type Resolution = 0 | 1 | 2;
const RESOLUTION_SHARE = [1, 0.75, 0.5] as const;
/** No screen is drawn denser than this (3× phones would cost 2.25× a 2× screen for little visible gain). */
const MAX_PIXEL_RATIO = 3;

/** The renderer's pixel ratio for a Resolution setting on a screen of `dpr` device pixels per CSS pixel. */
export function pixelRatioFor(res: Resolution, dpr: number): number {
  const native = Math.min(Math.max(dpr || 1, 0.5), MAX_PIXEL_RATIO);
  return Math.max(0.5, native * RESOLUTION_SHARE[res]);
}

/** Colour levels per channel after the crush (32 = 5 bits, like a 16-bit framebuffer). */
export const COLOR_LEVELS = 32;
/** Bloom: how much of what is brighter than the threshold is added back, blurred. */
export const BLOOM_THRESHOLD = 0.78;
export const BLOOM_STRENGTH = 0.38;

/** The 4×4 ordered-dither matrix (Bayer), values 0..15. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The dither offset for pixel (x, y), in (-0.5, 0.5): added to a channel (in levels) before rounding. */
export function bayerOffset(x: number, y: number): number {
  const ix = ((Math.floor(x) % 4) + 4) % 4;
  const iy = ((Math.floor(y) % 4) + 4) % 4;
  return (BAYER4[iy * 4 + ix] + 0.5) / 16 - 0.5;
}

/** One channel (0..1) reduced to `levels` steps with the dither offset for that pixel; the shader does the same. */
export function crushChannel(v: number, x: number, y: number, levels = COLOR_LEVELS): number {
  const steps = levels - 1;
  const q = Math.floor(v * steps + 0.5 + bayerOffset(x, y));
  return Math.min(steps, Math.max(0, q)) / steps;
}

/**
 * The internal size for a look and a size in device pixels: the height from the table (never taller than the
 * canvas's own pixels), the width by the window's aspect. `look` 0 (Off) returns null: draw straight to the canvas.
 */
export function internalSize(look: Look, width: number, height: number): { w: number; h: number } | null {
  const rows = LOOK_HEIGHTS[look];
  if (!rows || width <= 0 || height <= 0) return null;
  const h = Math.min(rows, Math.floor(height));
  return { w: Math.max(1, Math.round((h * width) / height)), h };
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, 1.0, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 dir; // one texel step, along x or y
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tMap, vUv).rgb * 0.2270270270;
  sum += (texture2D(tMap, vUv + dir * 1.3846153846).rgb + texture2D(tMap, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  sum += (texture2D(tMap, vUv + dir * 3.2307692308).rgb + texture2D(tMap, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(sum, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 size; // the internal size in pixels
uniform float bloom;
uniform float levels;
varying vec2 vUv;

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  return (BAYER[int(q.y) * 4 + int(q.x)] + 0.5) / 16.0 - 0.5;
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  float steps = levels - 1.0;
  vec3 q = floor(gl_FragColor.rgb * steps + 0.5 + bayer(vUv * size));
  gl_FragColor.rgb = clamp(q / steps, 0.0, 1.0);
}`;

/** A full-screen triangle pair, drawn with a given material into a target (or the canvas). */
class FullScreen {
  private readonly mesh: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly scene = new THREE.Scene();
  constructor() {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  draw(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  }
  dispose() {
    this.mesh.geometry.dispose();
  }
}

function target(w: number, h: number, filter: THREE.MagnificationTextureFilter, depth: boolean) {
  return new THREE.WebGLRenderTarget(w, h, { minFilter: filter, magFilter: filter, depthBuffer: depth, samples: 0, generateMipmaps: false });
}

/** Renders a scene through the retro look. Owns its render targets; `setSize` resizes them. */
export class RetroPipeline {
  private scene: THREE.WebGLRenderTarget | null = null;
  private bloomA: THREE.WebGLRenderTarget | null = null;
  private bloomB: THREE.WebGLRenderTarget | null = null;
  private readonly quad = new FullScreen();
  private readonly bright = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tScene: { value: null }, threshold: { value: BLOOM_THRESHOLD } },
  });
  private readonly blur = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tMap: { value: null }, dir: { value: new THREE.Vector2() } },
  });
  private readonly composite = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tScene: { value: null }, tBloom: { value: null }, size: { value: new THREE.Vector2(1, 1) },
      bloom: { value: BLOOM_STRENGTH }, levels: { value: COLOR_LEVELS },
    },
  });

  /** Sizes the targets for an internal size (null frees them). */
  setSize(size: { w: number; h: number } | null) {
    this.scene?.dispose();
    this.bloomA?.dispose();
    this.bloomB?.dispose();
    this.scene = this.bloomA = this.bloomB = null;
    if (!size) return;
    this.scene = target(size.w, size.h, THREE.NearestFilter, true);
    const bw = Math.max(2, Math.round(size.w / 4)), bh = Math.max(2, Math.round(size.h / 4));
    this.bloomA = target(bw, bh, THREE.LinearFilter, false);
    this.bloomB = target(bw, bh, THREE.LinearFilter, false);
    this.composite.uniforms.size.value.set(size.w, size.h);
  }

  get active() {
    return this.scene !== null;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const { scene: rt, bloomA, bloomB } = this;
    if (!rt || !bloomA || !bloomB) return;
    // One frame is five draws into different targets: count them together (Game turns autoReset back on when the look is off).
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    this.bright.uniforms.tScene.value = rt.texture;
    this.quad.draw(renderer, this.bright, bloomA);
    this.blur.uniforms.tMap.value = bloomA.texture;
    this.blur.uniforms.dir.value.set(1 / bloomA.width, 0);
    this.quad.draw(renderer, this.blur, bloomB);
    this.blur.uniforms.tMap.value = bloomB.texture;
    this.blur.uniforms.dir.value.set(0, 1 / bloomA.height);
    this.quad.draw(renderer, this.blur, bloomA);
    this.composite.uniforms.tScene.value = rt.texture;
    this.composite.uniforms.tBloom.value = bloomA.texture;
    this.quad.draw(renderer, this.composite, null);
  }

  dispose() {
    this.setSize(null);
    this.quad.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}

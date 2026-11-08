import * as THREE from 'three';

/**
 * The N64 display mode (T28): the scene is drawn 240 rows tall with no antialiasing, then a composite pass reduces
 * the colour depth with an ordered dither and scales it up with linear filtering. The HUD is DOM, so it stays crisp. Everything here is code: no imported assets.
 *
 * Analogy: a bitcrusher on the picture. Internal height is the sample rate, `COLOR_LEVELS` the bit depth.
 */

/**
 * Settings' "Display" (art.md "Display modes"). Native: the screen's full density (cap 3), antialiased. Performance: the
 * same look at a pixel ratio of about 1. N64: the scene drawn 240 rows tall, soft-filtered up, colour crush + dither.
 */
export const DISPLAY_NAMES = ['Native', 'Performance', 'N64'];
export type Display = 0 | 1 | 2;
export const DISPLAY_NATIVE: Display = 0;
export const DISPLAY_PERFORMANCE: Display = 1;
export const DISPLAY_N64: Display = 2;
/** The N64 mode's height in rows. */
export const N64_ROWS = 240;
/** No screen is drawn denser than this (3× phones would cost 2.25× a 2× screen for little visible gain). */
const MAX_PIXEL_RATIO = 3;
/** Performance mode's pixel ratio cap. */
const PERFORMANCE_PIXEL_RATIO = 1;
/** The canvas's pixel ratio in N64 mode: it only holds the upscale, so the screen's own density (cap 2) keeps the filter smooth. */
const N64_CANVAS_RATIO = 2;

/** The renderer's pixel ratio for a Display mode on a screen of `dpr` device pixels per CSS pixel. */
export function pixelRatioFor(display: Display, dpr: number): number {
  const native = Math.min(Math.max(dpr || 1, 0.5), MAX_PIXEL_RATIO);
  if (display === DISPLAY_PERFORMANCE) return Math.min(native, PERFORMANCE_PIXEL_RATIO);
  if (display === DISPLAY_N64) return Math.min(native, N64_CANVAS_RATIO);
  return native;
}

/** Colour levels per channel after the crush (32 = 5 bits, like a 16-bit framebuffer). */
export const COLOR_LEVELS = 32;
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
 * The internal size for a Display mode: N64 is `N64_ROWS` tall (never taller than the canvas's own pixels), the width by the
 * window's aspect. Native and Performance return null: draw straight to the canvas.
 */
export function internalSize(display: Display, width: number, height: number): { w: number; h: number } | null {
  if (display !== DISPLAY_N64 || width <= 0 || height <= 0) return null;
  const h = Math.min(N64_ROWS, Math.floor(height));
  return { w: Math.max(1, Math.round((h * width) / height)), h };
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 size; // the internal size in pixels
uniform float levels;
varying vec2 vUv;

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  return (BAYER[int(q.y) * 4 + int(q.x)] + 0.5) / 16.0 - 0.5;
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
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

/** Renders a scene through the N64 look: a small target, then a composite pass (colour crush + dither) to the canvas. */
export class RetroPipeline {
  private scene: THREE.WebGLRenderTarget | null = null;
  private readonly quad = new FullScreen();
  private readonly composite = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tScene: { value: null }, size: { value: new THREE.Vector2(1, 1) }, levels: { value: COLOR_LEVELS } },
  });

  /** Sizes the target for an internal size (null frees it). The target is linear-filtered: the upscale is soft. */
  setSize(size: { w: number; h: number } | null) {
    this.scene?.dispose();
    this.scene = null;
    if (!size) return;
    this.scene = new THREE.WebGLRenderTarget(size.w, size.h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, samples: 0, generateMipmaps: false,
    });
    this.composite.uniforms.size.value.set(size.w, size.h);
  }

  get active() {
    return this.scene !== null;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const rt = this.scene;
    if (!rt) return;
    // Two draws into different targets: count them together (Game turns autoReset back on when the look is off).
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    this.composite.uniforms.tScene.value = rt.texture;
    this.quad.draw(renderer, this.composite, null);
  }

  dispose() {
    this.setSize(null);
    this.quad.dispose();
    this.composite.dispose();
  }
}

/**
 * One still frame as a PNG data URL (the dungeon portrait in the HUD corner, T47): `scene` seen by `camera`, `size` pixels
 * square, drawn through the Display look: N64 gets the colour crush and dither (on the CPU, with `crushChannel`),
 * the others stay smooth. Restores the renderer's target afterwards.
 */
export function renderStill(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, size: number, display: Display): string {
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: display === DISPLAY_N64 ? 0 : 4, depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(prev);
  rt.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = ((size - 1 - y) * size + x) * 4, dst = (y * size + x) * 4; // GL rows run bottom-up
      for (let c = 0; c < 3; c++) {
        const v = px[src + c] / 255;
        img.data[dst + c] = Math.round((display === DISPLAY_N64 ? crushChannel(v, x, y) : v) * 255);
      }
      img.data[dst + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

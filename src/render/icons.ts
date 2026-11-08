import * as THREE from 'three';
import { assetById } from './models/registry';
import { pal } from './palette';

/**
 * Icons drawn from the real models (T39): each is a registered model (`gear-*` in `models/registry.ts`) rendered once,
 * offscreen, onto a transparent square and cached as a PNG data URL. The Gear tab and the HUD's flask and glove show them.
 * Rendering needs WebGL; with none (unit tests) or an unknown id, `get` returns '' and the UI draws no icon.
 */

/** The size of every icon, in pixels. */
export const ICON_PX = 96;

export class Icons {
  private readonly cache = new Map<string, string>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  /** The icon for registry id `id` (drawn on first use). */
  get(id: string): string {
    let url = this.cache.get(id);
    if (url === undefined) this.cache.set(id, (url = this.draw(id)));
    return url;
  }

  /** Draws these now, so the first time the menu opens costs nothing. */
  warm(ids: readonly string[]) {
    for (const id of ids) this.get(id);
  }

  private draw(id: string): string {
    const entry = assetById(id);
    if (!entry) return '';
    const model = entry.build();
    const scene = new THREE.Scene();
    scene.add(model.root, new THREE.HemisphereLight(pal('chalk', 3), pal('stone', 1), 2.2));
    const sun = new THREE.DirectionalLight(pal('chalk', 3), 2.4);
    sun.position.set(-2, 4, 5);
    scene.add(sun);
    model.root.rotation.y = -0.45; // a little turn so the shapes read as solid
    const box = new THREE.Box3().setFromObject(model.root);
    const centre = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(centre.x, centre.y + r * 0.35, centre.z + (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.02);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    return renderTransparent(this.renderer, scene, camera, ICON_PX);
  }
}

/** Renders `scene` to a transparent `size`² PNG data URL ('' if the 2D canvas is unavailable). Restores the renderer's state. */
function renderTransparent(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, size: number): string {
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  rt.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4; // GL rows run bottom-up
    img.data.set(px.subarray(src, src + size * 4), y * size * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

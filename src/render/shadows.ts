import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { blobConfig } from './shapes';
import { DISPLAY_N64, DISPLAY_PERFORMANCE, type Display } from './retro';

/**
 * Sun shadows (T46, the Settings row "Shadows"; docs/art.md "Rendering rules"): one shadow map from the sun (the moon at night,
 * `Sky` already swaps which one `sky.sun` is) that follows Wren. Like a second camera that sits where the sun is and records
 * only depth: a pixel the sun's camera can't see is in shadow. Outdoors only; dungeons and houses keep their blobs.
 */

/** Half the width of the sun camera's box (m): the shadow reaches this far from Wren (the fog is thick by then); beyond it the ground is just lit. */
export const SHADOW_RADIUS = 24;
/** How far the sun camera sees along its beam: `Sky` puts the sun 120 m from its target. */
const SHADOW_FAR = 260;

/** The map's side in texels for a Display mode: N64's is coarse on purpose (about two of its pixels per texel). */
export function shadowMapSize(display: Display, touch = false): number {
  if (display === DISPLAY_N64) return 512;
  return display === DISPLAY_PERFORMANCE || touch ? 1024 : 2048; // a phone's GPU fills the map every frame: half the side, a quarter of the work
}

/** N64: a hard, blocky edge (no filtering); the others filter it a little. */
export function shadowMapType(display: Display): THREE.ShadowMapType {
  return display === DISPLAY_N64 ? THREE.BasicShadowMap : THREE.PCFShadowMap;
}

/**
 * Whether a mesh throws a shadow: a solid, lit surface. Glows, glass, trails, particles (Points, Sprites), blobs and the
 * sky (unlit, transparent or custom shaders) don't. Opt out with `userData.noShadow`.
 */
export function castsShadow(o: THREE.Object3D): boolean {
  if (!(o instanceof THREE.Mesh) || o.userData.noShadow) return false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return isLit(m) && !m.transparent && m.depthWrite;
}

/** Whether a mesh takes a shadow: any lit surface (even a see-through one: water, the dungeon's glass). */
export function receivesShadow(o: THREE.Object3D): boolean {
  if (!(o instanceof THREE.Mesh) || o.userData.noShadow) return false;
  return isLit(Array.isArray(o.material) ? o.material[0] : o.material);
}

function isLit(m: THREE.Material | undefined): boolean {
  return m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhongMaterial;
}

const right = new THREE.Vector3();
const up = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Moves `target` sideways (in the sun camera's own plane) onto a whole number of texels, and returns the shift. Without it
 * the map's texel grid slides over the world as Wren walks and every shadow edge shimmers; snapped, an edge stays put.
 * `dir` points from the target toward the sun; the shift never changes it, so move the light by the same amount.
 */
export function snapToTexel(target: THREE.Vector3, dir: THREE.Vector3, texel: number, out = new THREE.Vector3()): THREE.Vector3 {
  right.crossVectors(WORLD_UP, dir).normalize();
  up.crossVectors(dir, right).normalize();
  const x = target.dot(right), y = target.dot(up);
  out.copy(right).multiplyScalar(Math.round(x / texel) * texel - x);
  return out.addScaledVector(up, Math.round(y / texel) * texel - y);
}

/**
 * How dark a shadow is (0–1) for the sun's sine of elevation: gone at and below the horizon (a low sun's shadows run
 * for hundreds of meters and speckle the ground), full by about 13° up.
 */
export function shadowIntensity(elevation: number): number {
  return smoothstep(0.03, 0.22, elevation);
}

const TICK = 0.25;
const shift = new THREE.Vector3();
const dir = new THREE.Vector3();

/** Owns the sun's shadow camera and which meshes cast and receive; `Game` calls `configure` for settings, `update` each frame after the sky. */
export class ShadowRig {
  private on = false;
  private display: Display = 0;
  private touch = false;
  private sinceMark = 0;
  /** True while the shadow map is drawing this frame (on, and outdoors). */
  active = false;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly sun: THREE.DirectionalLight) {
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -SHADOW_RADIUS;
    cam.right = cam.top = SHADOW_RADIUS;
    cam.near = 1;
    cam.far = SHADOW_FAR;
    cam.updateProjectionMatrix();
    // Faceted flat faces light at every angle; the normal offset (along the surface) keeps them from shadowing themselves.
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
  }

  /** The Settings row and the Display mode; cheap to call again with the same values. */
  configure(on: boolean, display: Display, touch = false) {
    this.touch = touch;
    const size = shadowMapSize(display, touch);
    const type = shadowMapType(display);
    const typeChanged = this.renderer.shadowMap.type !== type;
    if (size !== this.sun.shadow.mapSize.x) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.type = type;
    if (typeChanged) this.refreshMaterials();
    this.renderer.shadowMap.enabled = on;
    if (on && !this.on) this.sinceMark = TICK; // mark everything on the next update
    this.on = on;
    this.display = display;
    if (!on) this.setActive(false);
  }

  /** Changing the filter changes every lit shader. */
  private refreshMaterials() {
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }

  /** Flags every mesh under the scene that should cast and receive. Cheap, and re-run so new enemies and areas join in. */
  mark() {
    this.sinceMark = 0;
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const cast = castsShadow(o), receive = receivesShadow(o);
      if (o.castShadow !== cast) o.castShadow = cast;
      if (o.receiveShadow !== receive) o.receiveShadow = receive;
    });
  }

  /** Call after `Sky.update` has put the sun and its target for this frame. `indoor`: the area has a ceiling. */
  update(dt: number, indoor: boolean) {
    const active = this.on && !indoor;
    this.setActive(active);
    if (!active) return;
    this.sinceMark += dt;
    if (this.sinceMark >= TICK) this.mark();
    const { sun } = this;
    dir.subVectors(sun.position, sun.target.position);
    const length = dir.length();
    if (length < 1e-3) return;
    dir.divideScalar(length);
    const texel = (SHADOW_RADIUS * 2) / shadowMapSize(this.display, this.touch);
    snapToTexel(sun.target.position, dir, texel, shift);
    sun.target.position.add(shift);
    sun.position.add(shift);
    sun.shadow.intensity = shadowIntensity(dir.y);
  }

  private setActive(active: boolean) {
    this.active = active;
    this.sun.castShadow = active;
    blobConfig.realShadows = active;
  }
}

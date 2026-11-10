import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
// The post-processing modules load on first use (`build`): importing them makes objects (Pass.js's shared camera and
// triangle), and every three.js object draws random numbers for its id, which would shift every seeded look shot.
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { gradeUniforms, setGradeUniforms, TONE_MAPS, toneMappingFor, withGrade, type GradeUniforms } from '../grade';
import type { Sky } from '../sky';

/**
 * EXPERIMENT (T62, owner, 2026-11-09): **modern lighting**, a Dev-tab try-out to see how much of a "modern" look comes
 * from light rather than models. Deliberately against art.md's rendering rules (PBR, SSAO, tone mapping); art.md is
 * unchanged. Off by default; never in N64 mode. Remove: delete `render/experiments/`, the Game lines that name
 * `ModernLook`, the village's `lookExperiment` block and the Dev tab's "Look experiment" submenu (render.md).
 *
 * While on, every Lambert material in the scene is swapped for a `MeshStandardMaterial` twin (so it can show sky
 * reflections), the scene gets an environment map painted from the sky's current colours, and the frame goes through
 * a composer: corner shade (GTAO, half resolution), a little bloom, then tone mapping. Smooth shading is a separate
 * switch: it re-welds the normals of today's faceted models (a crease angle keeps hard edges hard).
 */

export { TONE_MAPS, withGrade };

/** The modern pipeline's anti-aliasing: samples per pixel in its half-float buffers. 4× is today's look; it is also most of the pipeline's cost. */
export const AA_NAMES = ['Off', '2×', '4×'];
const AA_SAMPLES = [0, 2, 4];
/** Samples for choice `i`; none where the canvas itself has no anti-aliasing (dense touch screens: `Game`'s constructor). */
export const aaSamples = (canvasAntialias: boolean, i: number) => (canvasAntialias ? (AA_SAMPLES[i] ?? 4) : 0);

/**
 * The dev panel's switches and sliders, at their defaults: the game's look (owner's call, 2026-11-09: classic lighting, modern one switch away;
 * contrast 1, saturation 1, exposure 1, sky light 1, no corner shade, bloom or anti-aliasing). Never remembered: only a page load
 * resets tweaks to these (game/devPanel.ts; its Default switch shows these while on).
 */
/**
 * The owner's grade (2026-11-09, tuned by eye in classic lighting). The look and smoke harness sets `__embervaleNeutralGrade`
 * (scripts/browser.mjs) so its baselines and budgets stay the ungraded picture, and the grade's lazily loaded modules never shift a seeded shot.
 */
const GRADED = !(globalThis as { __embervaleNeutralGrade?: boolean }).__embervaleNeutralGrade;
const g = <T,>(tuned: T, neutral: T) => (GRADED ? tuned : neutral);

export const LOOK = {
  /** Which experiment barrels stand in Thistledown, a switch per type (`BARREL_SWITCH`), so a phone can be timed one type at a time. */
  barrelsModern: false,
  barrelsLive: false,
  barrelsBaked: false,
  barrelsRich: false,
  barrelsReal: false,
  lighting: false,
  smooth: false,
  /** Index into `TONE_MAPS` (render/grade.ts). Auto: Neutral under modern lighting, none under classic. */
  toneMap: g(1, 0),
  exposure: g(2, 1),
  /** The grade (render/grade.ts) for every look: gamma 1 leaves it alone; highlights 0 leaves them alone. */
  gamma: g(1.25, 1),
  highlights: g(-1, 0),
  /** How strongly the sky's environment map lights and reflects (`scene.environmentIntensity`). */
  sky: 1,
  /** Index into `AA_NAMES`. Off by default (owner's call, 2026-11-09: 120 fps only with it and corner shade off). */
  aa: 0,
  /** Corner shade (GTAO blend); 0 turns the pass off. Off by default (the same call); 1 is full strength. */
  ao: 0,
  /** Bloom strength; 0 turns the pass off. Off by default (the owner tunes with it off); 0.25 was the first try. */
  bloom: 0,
  /** The grade after tone mapping (`withGrade`): a power on every channel (above 1: deeper darks, the same white). 1 leaves it alone. */
  contrast: g(1.15, 1),
  /** The grade's saturation around each pixel's own grey. 1 leaves it alone (0.9 was the owner's under modern lighting). Blender's AgX "Punchy" look is contrast 1.35, saturation 1.4. */
  saturation: g(0.9, 1),
};
export type LookSettings = typeof LOOK;

/** While modern lighting is on, the hemisphere light keeps this share: the environment map now carries the sky's light. */
export const HEMI_KEEP = 0.35;
/** Smooth shading's crease: faces meeting at less than this blend (today's 8-sided barrel, 45°, does; a box's 90° doesn't). */
export const SMOOTH_CREASE = (50 * Math.PI) / 180;
/**
 * The `userData` key under which an area leaves a builder for the experiment barrels (`world/overworld/village.ts`): called with the
 * renderer (the baked ones bake on it) and a type, it returns that type's row.
 */
export const EXPERIMENT_BUILD = 'lookExperiment';
/** The experiment barrels' types (T62, T65), each a row of four at the photoreal one's size (render.md "Look experiment"). */
export const BARREL_TYPES = ['modern', 'live', 'baked', 'bakedRich', 'real'] as const;
export type BarrelType = (typeof BARREL_TYPES)[number];
/** Each type's switch in `LOOK` (and the dev panel's label for it). */
export const BARREL_SWITCH = {
  modern: ['barrelsModern', 'Barrels: modern'],
  live: ['barrelsLive', 'Barrels: live'],
  baked: ['barrelsBaked', 'Barrels: baked'],
  bakedRich: ['barrelsRich', 'Barrels: baked rich'],
  real: ['barrelsReal', 'Barrels: photoreal'],
} as const satisfies Record<BarrelType, readonly [keyof typeof LOOK, string]>;
const barrelWanted = (t: BarrelType) => LOOK[BARREL_SWITCH[t][0]];

// ---------------------------------------------------------------------------
// Material twins (pure: no GL, unit-tested)
// ---------------------------------------------------------------------------

const twins = new WeakMap<THREE.MeshLambertMaterial, THREE.MeshStandardMaterial>();
const originals = new WeakMap<THREE.Material, THREE.MeshLambertMaterial>();
/** Twins made so far, for the per-frame sync of what game code changes on an original. */
const live = new Set<THREE.MeshStandardMaterial>();

/** A Standard material that looks like `m` under the same lights: same colour, paint, texture patch, transparency. */
export function twinOf(m: THREE.MeshLambertMaterial): THREE.MeshStandardMaterial {
  let t = twins.get(m);
  if (t) return t;
  const metal = m.userData.surface === 'metal';
  t = new THREE.MeshStandardMaterial({ roughness: metal ? 0.45 : 0.85, metalness: metal ? 0.7 : 0 });
  // Shared by reference: a hit flash or a fade that sets the original's colour or emissive shows on the twin at once.
  t.color = m.color;
  t.emissive = m.emissive;
  t.userData = m.userData;
  t.name = m.name;
  for (const k of ['map', 'alphaMap', 'emissiveMap', 'aoMap', 'lightMap', 'vertexColors', 'flatShading', 'fog', 'wireframe', 'blending', 'premultipliedAlpha', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'toneMapped', 'colorWrite', 'depthTest', 'depthFunc', 'shadowSide'] as const) {
    (t as unknown as Record<string, unknown>)[k] = m[k];
  }
  t.onBeforeCompile = m.onBeforeCompile;
  t.customProgramCacheKey = m.customProgramCacheKey;
  syncTwin(t, m);
  twins.set(m, t);
  originals.set(t, m);
  live.add(t);
  return t;
}

/** What game code changes on a material after it's made (fades, flashes) that isn't shared by reference. */
function syncTwin(t: THREE.MeshStandardMaterial, m: THREE.MeshLambertMaterial) {
  if (t.transparent !== m.transparent || t.alphaHash !== m.alphaHash || t.side !== m.side || t.alphaTest !== m.alphaTest) {
    t.transparent = m.transparent;
    t.alphaHash = m.alphaHash;
    t.side = m.side;
    t.alphaTest = m.alphaTest;
    t.needsUpdate = true;
  }
  t.opacity = m.opacity;
  t.visible = m.visible;
  t.depthWrite = m.depthWrite;
  t.emissiveIntensity = m.emissiveIntensity;
  t.color = m.color; // in case game code replaced the Color object itself
  t.emissive = m.emissive;
}

/** Keeps every twin in step with its original. Called each frame while modern lighting is on. */
export function syncTwins() {
  for (const t of live) {
    const m = originals.get(t);
    if (m) syncTwin(t, m);
  }
}

/** The original of a twin, or the material itself. */
export function originalOf(m: THREE.Material): THREE.Material {
  return originals.get(m) ?? m;
}

/** Puts every Lambert mesh under `root` in its twin (`on`), or back in its original (`!on`). */
export function swapMaterials(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m = o.material as THREE.Material;
    if (on && m instanceof THREE.MeshLambertMaterial) o.material = twinOf(m);
    else if (!on && originals.has(m)) o.material = originals.get(m)!;
  });
}

// ---------------------------------------------------------------------------
// Smooth shading (pure, unit-tested)
// ---------------------------------------------------------------------------

/** Each smoothed geometry's own normals, to give back. */
const savedNormals = new WeakMap<THREE.BufferGeometry, THREE.BufferAttribute | THREE.InterleavedBufferAttribute>();
const smoothed = new Set<WeakRef<THREE.BufferGeometry>>();
/** Lambert materials whose `flatShading` smooth shading turned off. */
const unflattened = new Set<THREE.MeshLambertMaterial>();

/**
 * Smooths every lit mesh under `root` (`on`), or gives back its faceted normals (`!on`). Only non-indexed geometry has
 * per-face normals to weld (the kit's and the merged scenery's); three's indexed primitives already carry smooth ones,
 * so for those turning `flatShading` off is all it takes.
 */
export function smoothMeshes(root: THREE.Object3D, on: boolean) {
  if (!on) {
    for (const ref of smoothed) {
      const g = ref.deref();
      const n = g && savedNormals.get(g);
      if (g && n) g.setAttribute('normal', n);
      if (g) savedNormals.delete(g);
    }
    smoothed.clear();
    for (const m of unflattened) {
      m.flatShading = true;
      m.needsUpdate = true;
      const t = twins.get(m);
      if (t) {
        t.flatShading = true;
        t.needsUpdate = true;
      }
    }
    unflattened.clear();
    return;
  }
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m = originalOf(o.material as THREE.Material);
    if (!(m instanceof THREE.MeshLambertMaterial)) return;
    if (m.flatShading) {
      m.flatShading = false;
      m.needsUpdate = true;
      unflattened.add(m);
    }
    const t = twins.get(m);
    if (t && t.flatShading) {
      t.flatShading = false;
      t.needsUpdate = true;
    }
    const g = o.geometry as THREE.BufferGeometry;
    if (g.index || !g.attributes.normal || savedNormals.has(g) || g.attributes.position.count % 3) return;
    savedNormals.set(g, g.attributes.normal);
    toCreasedNormals(g, SMOOTH_CREASE); // non-indexed: sets a new normal attribute on `g` itself
    smoothed.add(new WeakRef(g));
  });
}

// ---------------------------------------------------------------------------
// The look (needs GL)
// ---------------------------------------------------------------------------

const ENV_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ENV_FRAG = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
void main() {
  float y = normalize(vDir).y;
  vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.55)) : mix(horizon, ground, pow(-y, 0.4));
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * The corner-shade pass's blend step (three's `GTAOBlendShader`) with the effect faded by distance exactly as the scene's fog fades the
 * scene: full strength up to the fog's near distance, none at its far distance (`smoothstep`, like `THREE.Fog`). The depth is the pass's own.
 */
const GTAO_BLEND_FRAG = /* glsl */ `
	#include <packing>
	uniform float intensity;
	uniform sampler2D tDiffuse;
	uniform sampler2D tDepth;
	uniform float cameraNear;
	uniform float cameraFar;
	uniform float fogNear;
	uniform float fogFar;
	varying vec2 vUv;

	void main() {
		vec4 texel = texture2D( tDiffuse, vUv );
		float dist = -perspectiveDepthToViewZ( texture2D( tDepth, vUv ).x, cameraNear, cameraFar );
		float keep = 1.0 - smoothstep( fogNear, fogFar, dist );
		gl_FragColor = vec4( mix( vec3( 1.0 ), texel.rgb, intensity * keep ), texel.a );
	}`;

export class ModernLook {
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  /** The output pass's uniforms, for the grade (`withGrade`). */
  private grade: GradeUniforms | null = null;
  private loading = false;
  private size = { w: 1, h: 1, ratio: 1 };
  private lightingOn = false;
  /** Samples the composer's buffers have now (`render` follows `LOOK.aa`). */
  private samples = 0;
  private smoothOn = false;
  private scanT = 0;
  private envT = 0;
  private pmrem: THREE.PMREMGenerator | null = null;
  private env: THREE.WebGLRenderTarget | null = null;
  /** Made on first use: three.js objects draw random numbers for their ids, and the look shots are seeded. */
  private envScene: THREE.Scene | null = null;
  private readonly envUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() } };
  private readonly envLast = { top: new THREE.Color(-1, -1, -1), horizon: new THREE.Color(), ground: new THREE.Color() };
  /** The last smooth-shading flip's cost (ms), for the report. */
  smoothMs = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.Camera, private readonly sky: Sky) {}

  /** Whether frames go through the composer (modern lighting on, and not N64). */
  get active() {
    return this.lightingOn;
  }

  /** Each frame, after `Sky.update`: follows the switches, the sky's colours and newly loaded or spawned meshes. */
  update(dt: number, n64: boolean, indoor: boolean) {
    const wantLighting = LOOK.lighting && !n64;
    this.scanT -= dt;
    const scan = this.scanT <= 0 || wantLighting !== this.lightingOn || LOOK.smooth !== this.smoothOn;
    if (scan) {
      this.scanT = 0.25;
      this.showBarrels();
    }
    if (wantLighting !== this.lightingOn) {
      this.lightingOn = wantLighting;
      if (!wantLighting) {
        swapMaterials(this.scene, false);
        this.scene.environment = null;
        this.ownEnvs(true);
      } else if (this.env) {
        // Back on: the sky map painted last time is still good. `followSky` only repaints when the sky's colours move (never,
        // while the game is paused behind the dev panel), so without this the scene would stay unlit by the sky and Sky light would do nothing.
        this.scene.environment = this.env.texture;
        this.envT = 0;
      }
    }
    if (LOOK.smooth !== this.smoothOn) {
      this.smoothOn = LOOK.smooth;
      const t0 = Date.now(); // wall time even under the look runner's stepped clock
      smoothMeshes(this.scene, LOOK.smooth);
      this.smoothMs = Date.now() - t0;
    } else if (scan && this.smoothOn) smoothMeshes(this.scene, true);
    if (!this.lightingOn) return;

    if (scan) {
      swapMaterials(this.scene, true);
      this.ownEnvs(false);
      if (this.smoothOn) smoothMeshes(this.scene, true);
    }
    syncTwins();
    this.followSky(dt, indoor);
    this.scene.environmentIntensity = LOOK.sky;
    this.sky.hemi.intensity *= HEMI_KEEP;
  }

  /** The chosen experiment barrels show, each type's row built (from the area's builder) the first time it is wanted. */
  private showBarrels() {
    const hosts: THREE.Object3D[] = [];
    this.scene.traverse((o) => { if (o.userData[EXPERIMENT_BUILD]) hosts.push(o); });
    for (const host of hosts) {
      let built = host.userData.lookExperimentBuilt as Partial<Record<BarrelType, THREE.Object3D>> | undefined;
      if (!built) {
        if (!BARREL_TYPES.some(barrelWanted)) continue;
        built = host.userData.lookExperimentBuilt = {};
      }
      const build = host.userData[EXPERIMENT_BUILD] as (r: THREE.WebGLRenderer, t: BarrelType) => THREE.Object3D;
      for (const t of BARREL_TYPES) {
        if (!built[t] && barrelWanted(t)) host.add((built[t] = build(this.renderer, t)));
        const row = built[t];
        if (row) row.visible = barrelWanted(t);
      }
    }
  }

  /** The experiment barrels wear their own sky cube; while modern lighting is on, the scene's environment lights them. */
  private ownEnvs(give: boolean) {
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
      const own = o.material.userData.ownEnv as THREE.Texture | undefined;
      if (!own) return;
      const want = give ? own : null;
      if (o.material.envMap !== want) {
        o.material.envMap = want;
        if (!give) o.material.envMapIntensity = 1;
        o.material.needsUpdate = true;
      }
    });
  }

  /** Paints the environment map from the sky's colours now (indoors, the hemisphere light's), when they've moved. */
  private followSky(dt: number, indoor: boolean) {
    this.envT -= dt;
    const u = this.envUniforms;
    const hemi = this.sky.hemi;
    if (indoor) {
      u.top.value.copy(hemi.color).multiplyScalar(hemi.intensity);
      u.horizon.value.copy(u.top.value).multiplyScalar(0.7);
    } else {
      const dome = this.sky.domeColors;
      u.top.value.copy(dome.top);
      u.horizon.value.copy(dome.horizon);
    }
    u.ground.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity * (indoor ? 1 : 0.6));
    const moved = (a: THREE.Color, b: THREE.Color) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) > 0.01;
    const last = this.envLast;
    if (this.env && (this.envT > 0 || !(moved(u.top.value, last.top) || moved(u.horizon.value, last.horizon) || moved(u.ground.value, last.ground)))) return;
    this.envT = 0.5;
    last.top.copy(u.top.value);
    last.horizon.copy(u.horizon.value);
    last.ground.copy(u.ground.value);
    this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      this.envScene.add(new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12),
        new THREE.ShaderMaterial({ uniforms: this.envUniforms, vertexShader: ENV_VERT, fragmentShader: ENV_FRAG, side: THREE.BackSide, depthWrite: false }),
      ));
    }
    const next = this.pmrem.fromScene(this.envScene, 0, 0.1, 10, { size: 64 });
    this.env?.dispose();
    this.env = next;
    this.scene.environment = next.texture;
  }

  setSize(w: number, h: number, ratio: number) {
    this.size = { w, h, ratio };
    if (!this.composer) return;
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
  }

  private async build() {
    const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/GTAOPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    /** Corner shade at half the screen's resolution: a quarter of the cost, and it's soft anyway. */
    class HalfGTAOPass extends GTAOPass {
      setSize(width: number, height: number) {
        super.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
      }
    }
    /** Bloom at half the screen's resolution too: it is a blur, so nothing is lost, and its cost falls to a quarter. */
    class HalfBloomPass extends UnrealBloomPass {
      setSize(width: number, height: number) {
        super.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
      }
    }
    const msaa = aaSamples(!!this.renderer.getContextAttributes()?.antialias, LOOK.aa);
    this.samples = msaa;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: msaa });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new HalfGTAOPass(this.scene, this.camera, 1, 1);
    this.gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1 });
    // Corner shade is multiplied over the finished frame, fog included, so it would darken the far trees that fog is hiding: fade it out
    // with the same fog the scene uses (`GTAO_BLEND_FRAG`; the fog's reach and the camera's planes are set each frame in `render`).
    const blend = this.gtao.blendMaterial;
    Object.assign(blend.uniforms, {
      tDepth: { value: this.gtao.depthTexture }, cameraNear: { value: 0.1 }, cameraFar: { value: 1500 }, fogNear: { value: 1e9 }, fogFar: { value: 1e9 },
    });
    blend.fragmentShader = GTAO_BLEND_FRAG;
    blend.needsUpdate = true;
    composer.addPass(this.gtao);
    this.bloom = new HalfBloomPass(new THREE.Vector2(1, 1), LOOK.bloom, 0.4, 0.85);
    composer.addPass(this.bloom);
    const output = new OutputPass();
    output.material.fragmentShader = withGrade(output.material.fragmentShader);
    Object.assign(output.uniforms, gradeUniforms());
    output.material.needsUpdate = true;
    this.grade = output.uniforms as unknown as GradeUniforms;
    composer.addPass(output);
    this.composer = composer;
    this.setSize(this.size.w, this.size.h, this.size.ratio);
  }

  /** Draws a frame through the composer. The renderer's tone mapping is set only for the output pass's sake, then put back. */
  render() {
    const r = this.renderer;
    r.info.reset();
    if (!this.composer) {
      // The first frames after switching on, while the modules load: the plain frame (already in the twins and the sky's light).
      if (!this.loading) {
        this.loading = true;
        void this.build();
      }
      r.render(this.scene, this.camera);
      return;
    }
    const want = aaSamples(!!r.getContextAttributes()?.antialias, LOOK.aa);
    if (want !== this.samples) {
      // A buffer's sample count is fixed when it is made: change it, and let go of it so the next frame makes it again.
      this.samples = want;
      for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        t.samples = want;
        t.dispose();
      }
    }
    this.gtao!.enabled = LOOK.ao > 0;
    this.gtao!.blendIntensity = LOOK.ao;
    const blendUniforms = this.gtao!.blendMaterial.uniforms;
    const fog = this.scene.fog as THREE.Fog | null;
    const cam = this.camera as THREE.PerspectiveCamera;
    blendUniforms.cameraNear.value = cam.near;
    blendUniforms.cameraFar.value = cam.far;
    blendUniforms.fogNear.value = fog?.near ?? 1e9;
    blendUniforms.fogFar.value = fog?.far ?? 1e9;
    this.bloom!.enabled = LOOK.bloom > 0;
    this.bloom!.strength = LOOK.bloom;
    setGradeUniforms(this.grade!, LOOK);
    r.toneMapping = toneMappingFor(LOOK.toneMap, true);
    r.toneMappingExposure = LOOK.exposure;
    this.composer.render();
    r.toneMapping = THREE.NoToneMapping;
    r.toneMappingExposure = 1;
  }
}

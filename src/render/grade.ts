import * as THREE from 'three';

/**
 * The picture's grade (T66): exposure, a tone curve for the highlights, gamma, highlights, contrast and saturation. Like the
 * levels and colour knobs of a monitor, or the master channel strip after the mix: it works on the finished frame and never touches
 * the models, the palette or the lighting.
 *
 * The values live in `LOOK` (render/experiments/modernLook.ts, the dev panel's sliders) and apply to **every** look: modern lighting
 * (its composer's output pass), classic Native / Performance / Auto (folded into every material's tone mapping, `foldGrade`; the
 * `GradePass` below while the dev sliders differ from the folded values) and N64 (a few lines in the composite, retro.ts).
 * At neutral values classic costs nothing (`isNeutral`).
 */

/** The tone curve's choices. Auto: Neutral under modern lighting (its HDR light needs one), none under classic. */
export const TONE_MAPS = ['Auto', 'Neutral', 'AgX', 'ACES', 'Off'];
const TONE_AUTO = 0;
const TONE_NEUTRAL = 1;

/** The grade's dials (a subset of `LOOK`). */
export interface GradeParams {
  /** Index into `TONE_MAPS`. */
  toneMap: number;
  /** A multiplier on the light before the tone curve. */
  exposure: number;
  /** Above 1 lifts the mid-tones, below 1 deepens them; black and white stay. */
  gamma: number;
  /** -1 pulls the brightest areas down (up to half), +1 pushes them up; the mid-tones and darks stay. */
  highlights: number;
  /** A power on every channel: above 1 deepens the darks, the white stays white. */
  contrast: number;
  /** Colour pushed away from (above 1) or toward (below 1) the pixel's own grey. */
  saturation: number;
}

/** three's tone mapping for a choice. "Off" is Linear, which only multiplies by the exposure (three ignores exposure under NoToneMapping). */
export function toneMappingFor(index: number, modernLighting: boolean): THREE.ToneMapping {
  const i = index === TONE_AUTO ? (modernLighting ? TONE_NEUTRAL : 4) : index;
  return [THREE.LinearToneMapping, THREE.NeutralToneMapping, THREE.AgXToneMapping, THREE.ACESFilmicToneMapping, THREE.LinearToneMapping][i] ?? THREE.LinearToneMapping;
}

/** Whether classic lighting would draw exactly what it draws with no grade (so it can skip the grade's pass altogether). */
export function isNeutral(p: GradeParams): boolean {
  const curve = p.toneMap === TONE_AUTO || p.toneMap === 4;
  return curve && p.exposure === 1 && p.gamma === 1 && p.highlights === 0 && p.contrast === 1 && p.saturation === 1;
}

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The grade on one colour (linear, after the tone curve); the shader (`GRADE_GLSL`) does the same maths. */
export function gradeColor(rgb: readonly [number, number, number], p: Pick<GradeParams, 'gamma' | 'highlights' | 'contrast' | 'saturation'>): [number, number, number] {
  const e = p.contrast / p.gamma;
  const c = rgb.map((v) => Math.max(v, 0) ** e);
  const grey = c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
  const k = 1 + p.highlights * 0.5 * smoothstep(0.3, 1, grey);
  const lit = c.map((v) => v * k);
  const g = lit[0] * LUMA[0] + lit[1] * LUMA[1] + lit[2] * LUMA[2];
  const out = lit.map((v) => Math.max(g + (v - g) * p.saturation, 0));
  return [out[0], out[1], out[2]];
}

/** The uniforms the grade needs, for any shader that includes `GRADE_GLSL`. */
export const GRADE_UNIFORMS_GLSL = /* glsl */ `
uniform float gradeContrast;
uniform float gradeGamma;
uniform float gradeHighlights;
uniform float gradeSaturation;`;

/** `gradeApply(colour)`: contrast and gamma as one power, then highlights, then saturation. Mirrors `gradeColor`. */
export const GRADE_GLSL = /* glsl */ `
vec3 gradeApply( vec3 c ) {
	c = pow( max( c, vec3( 0.0 ) ), vec3( gradeContrast / gradeGamma ) );
	float gradeGrey = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c *= 1.0 + gradeHighlights * 0.5 * smoothstep( 0.3, 1.0, gradeGrey );
	gradeGrey = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	return max( mix( vec3( gradeGrey ), c, gradeSaturation ), vec3( 0.0 ) );
}`;

/** Fresh uniform objects for a shader with `GRADE_UNIFORMS_GLSL`. */
export const gradeUniforms = () => ({
  gradeContrast: { value: 1 }, gradeGamma: { value: 1 }, gradeHighlights: { value: 0 }, gradeSaturation: { value: 1 },
});
export type GradeUniforms = ReturnType<typeof gradeUniforms>;

/** Copies the dials into a shader's uniforms. */
export function setGradeUniforms(u: GradeUniforms, p: GradeParams) {
  u.gradeContrast.value = p.contrast;
  u.gradeGamma.value = p.gamma;
  u.gradeHighlights.value = p.highlights;
  u.gradeSaturation.value = p.saturation;
}

/**
 * Puts the grade into three's output pass (`OutputShader`): after tone mapping, before the screen's colour encoding, so it costs
 * nothing extra there. Throws if three's shader has changed shape, so an upgrade can't silently drop the grade.
 */
export function withGrade(fragmentShader: string): string {
  const uniform = 'uniform sampler2D tDiffuse;';
  const before = '// color space';
  if (!fragmentShader.includes(uniform) || !fragmentShader.includes(before)) throw new Error('withGrade: three\'s OutputShader changed shape');
  return fragmentShader
    .replace(uniform, `${uniform}\n${GRADE_UNIFORMS_GLSL}\n${GRADE_GLSL}`)
    .replace(before, `// grade (render/grade.ts)\n\t\t\tgl_FragColor.rgb = gradeApply( gl_FragColor.rgb );\n\n\t\t\t${before}`);
}

/** three's curve function (in its `tonemapping_pars_fragment` chunk) for a choice under classic lighting. Auto and Off: Linear (the exposure only). */
const CURVE_GLSL = ['LinearToneMapping', 'NeutralToneMapping', 'AgXToneMapping', 'ACESFilmicToneMapping', 'LinearToneMapping'];

const glslFloat = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/**
 * The grade as three's `CustomToneMapping` function (T58): the curve, then `gradeApply`, with the dials as constants. Every lit
 * material runs it on its own pixels as it draws to the screen, so classic Native / Performance get the grade with **no extra
 * pass** (no half-float target, no full-screen redraw: on a phone that pass was a large share of the frame). Exposure stays
 * live (three's `toneMappingExposure` uniform); the other dials are compiled in.
 */
export function foldedToneMappingGlsl(p: GradeParams): string {
  const consts = `const float foldContrast = ${glslFloat(p.contrast)};\nconst float foldGamma = ${glslFloat(p.gamma)};\n`
    + `const float foldHighlights = ${glslFloat(p.highlights)};\nconst float foldSaturation = ${glslFloat(p.saturation)};`;
  const apply = GRADE_GLSL.replace('gradeApply', 'foldGradeApply').replace(/grade(Contrast|Gamma|Highlights|Saturation)/g, 'fold$1');
  return `${consts}\n${apply}\nvec3 CustomToneMapping( vec3 color ) { return foldGradeApply( ${CURVE_GLSL[p.toneMap] ?? 'LinearToneMapping'}( color ) ); }`;
}

/** The dials the shaders were compiled with (`foldGrade`), or null. */
let folded: GradeParams | null = null;

/**
 * Puts the grade into three's tone-mapping chunk. Call once, before the first frame (programs compile on first use and are
 * cached, so a later change wouldn't reach them: `canFold` then says no and the grade takes the pass, as while the dev
 * panel's sliders move). Throws if three's chunk has changed shape, so an upgrade can't silently drop the grade.
 */
export function foldGrade(p: GradeParams) {
  const C = THREE.ShaderChunk;
  const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  const apply = 'gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );';
  const mix = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';
  if (!C.tonemapping_pars_fragment.includes(stub) || !C.tonemapping_fragment.includes(apply) || !C.fog_fragment.includes(mix)) {
    throw new Error('foldGrade: three\'s tone-mapping or fog chunk changed shape');
  }
  C.tonemapping_pars_fragment = C.tonemapping_pars_fragment.replace(stub, foldedToneMappingGlsl(p));
  // three mixes the fog in after tone mapping, onto the finished screen colour. The pass graded the fogged picture (the fog
  // mixed in linear light, then the curve), so a tone-mapped frame does the same: the fog first, then the curve. Only while
  // tone mapping is on (TONE_MAPPING: the folded frame; every other path draws as before). `fadeInFog` glows keep theirs.
  C.tonemapping_fragment = C.tonemapping_fragment.replace(apply, `${FOG_BEFORE_CURVE}\n\t${apply}\n${LINEAR_BLEND_ALPHA}`);
  C.fog_fragment = `#ifndef TONE_MAPPING\n${C.fog_fragment}\n#endif`;
  folded = { ...p };
}

/**
 * See-through things on a folded frame. The pass blended them in linear light, then graded; here they blend onto the finished
 * screen colour, where a bright glow over dark reads much fainter and a dark blob over bright much heavier. Re-weighting the
 * alpha closes most of that gap: a bright layer over dark looks in linear light like α^(1/2.2) does on screen, a dark layer
 * over bright like 1 − (1 − α)^(1/2.2); the fragment's own brightness picks between them. Opaque pixels (α = 1) are untouched.
 */
const LINEAR_BLEND_ALPHA = /* glsl */ `	if ( gl_FragColor.a < 1.0 ) {
		float foldLight = pow( clamp( dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0, 1.0 ), 0.4545 );
		float foldA = clamp( gl_FragColor.a, 0.0, 1.0 );
		gl_FragColor.a = mix( 1.0 - pow( 1.0 - foldA, 0.4545 ), pow( foldA, 0.4545 ), foldLight );
	}`;

/**
 * three's fog mix (`fog_fragment`), run before the curve on a tone-mapped frame. And additive glows (`fadeInFog`, which marks
 * them FADE_IN_FOG): their strength goes in before the curve, as it did in the pass (a glow at a third of its colour keeps its
 * hue; at full colour the curve would wash it toward white and the opacity would then only dim that).
 */
const FOG_BEFORE_CURVE = /* glsl */ `#ifdef FADE_IN_FOG
	gl_FragColor.rgb *= gl_FragColor.a;
	gl_FragColor.a = 1.0;
	#endif
	#if defined( USE_FOG ) && !defined( FADE_IN_FOG )
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif`;

/** Whether the compiled-in grade is these dials (exposure aside: it's live), so a frame can be graded without the pass. */
export function canFold(p: GradeParams, compiled: GradeParams | null = folded): boolean {
  return !!compiled && compiled.toneMap === p.toneMap && compiled.gamma === p.gamma && compiled.highlights === p.highlights
    && compiled.contrast === p.contrast && compiled.saturation === p.saturation;
}

const fogWas = new THREE.Color();

/**
 * Draws one classic frame with the folded grade: three's custom tone mapping on for this render only. The fog now mixes in
 * linear light (before the curve, `foldGrade`), but three hands a frame drawn to the screen its fog colour already encoded
 * for the screen; so for this frame the colour is set to what encodes to its own linear value.
 */
export function renderFolded(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, p: GradeParams) {
  const fog = scene.fog;
  if (fog) {
    fogWas.copy(fog.color);
    fog.color.setRGB(fogWas.r, fogWas.g, fogWas.b, THREE.SRGBColorSpace);
  }
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = p.exposure;
  renderer.render(scene, camera);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  if (fog) fog.color.copy(fogWas);
}

/**
 * Classic lighting's grade (Native and Performance) when it can't be folded (`canFold`: the dev panel's sliders moved since load):
 * the scene drawn into a multisampled half-float target, then one output pass
 * (exposure, tone curve, grade, colour encoding). Made only when a dial leaves neutral, so the default path never loads or pays for it.
 */
export class GradePass {
  private composer: import('three/addons/postprocessing/EffectComposer.js').EffectComposer | null = null;
  private uniforms: GradeUniforms | null = null;
  private loading = false;
  private size = { w: 1, h: 1, ratio: 1 };

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {}

  setSize(w: number, h: number, ratio: number) {
    this.size = { w, h, ratio };
    if (!this.composer) return;
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
  }

  private async build() {
    const [{ EffectComposer }, { RenderPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    // The canvas's own anti-aliasing (off on dense touch screens: Game's constructor) decides whether the target is multisampled.
    const samples = this.renderer.getContextAttributes()?.antialias ? 4 : 0;
    const composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
    composer.addPass(new RenderPass(this.scene, this.camera));
    const output = new OutputPass();
    output.material.fragmentShader = withGrade(output.material.fragmentShader);
    Object.assign(output.uniforms, gradeUniforms());
    output.material.needsUpdate = true;
    this.uniforms = output.uniforms as unknown as GradeUniforms;
    composer.addPass(output);
    this.composer = composer;
    this.setSize(this.size.w, this.size.h, this.size.ratio);
  }

  /** Draws a frame through the grade. The first frames, while the modules load, are drawn plain. */
  render(p: GradeParams) {
    const r = this.renderer;
    r.info.reset();
    if (!this.composer || !this.uniforms) {
      if (!this.loading) {
        this.loading = true;
        void this.build();
      }
      r.render(this.scene, this.camera);
      return;
    }
    setGradeUniforms(this.uniforms, p);
    r.toneMapping = toneMappingFor(p.toneMap, false);
    r.toneMappingExposure = p.exposure;
    this.composer.render();
    r.toneMapping = THREE.NoToneMapping;
    r.toneMappingExposure = 1;
  }
}

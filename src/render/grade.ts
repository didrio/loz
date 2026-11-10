import * as THREE from 'three';

/**
 * The picture's grade (T66): exposure, a tone curve for the highlights, gamma, highlights, contrast and saturation. Like the
 * levels and colour knobs of a monitor, or the master channel strip after the mix: it works on the finished frame and never touches
 * the models, the palette or the lighting.
 *
 * The values live in `LOOK` (render/experiments/modernLook.ts, the dev panel's sliders) and apply to **every** look: modern lighting
 * (its composer's output pass), classic Native / Performance (`GradePass`, below) and N64 (a few lines in the composite, retro.ts).
 * At neutral values classic costs nothing: no render target, no pass (`isNeutral`).
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

/**
 * Classic lighting's grade (Native and Performance): the scene drawn into a multisampled half-float target, then one output pass
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

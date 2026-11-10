import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LOOK } from './experiments/modernLook';
import { canFold, foldedToneMappingGlsl, gradeColor, GRADE_GLSL, isNeutral, toneMappingFor, type GradeParams } from './grade';

const NEUTRAL: GradeParams = { toneMap: 0, exposure: 1, gamma: 1, highlights: 0, contrast: 1, saturation: 1 };

describe('the grade (T66)', () => {
  it('the game starts at the owner\'s grade (Neutral curve, exposure 2, gamma 1.25, highlights -1, contrast 1.15, saturation 0.9)', () => {
    expect(LOOK).toMatchObject({ toneMap: 1, exposure: 2, gamma: 1.25, highlights: -1, contrast: 1.15, saturation: 0.9 });
    expect(isNeutral(LOOK)).toBe(false);
  });

  it('any dial off its neutral value makes it count; a tone curve does too', () => {
    for (const change of [{ exposure: 1.1 }, { gamma: 1.2 }, { highlights: -0.3 }, { contrast: 1.1 }, { saturation: 0.9 }, { toneMap: 2 }]) {
      expect(isNeutral({ ...NEUTRAL, ...change })).toBe(false);
    }
    expect(isNeutral({ ...NEUTRAL, toneMap: 4 })).toBe(true); // "Off" is what Auto means under classic
  });

  it('neutral values leave a colour alone', () => {
    const c: [number, number, number] = [0.8, 0.4, 0.1];
    for (let i = 0; i < 3; i++) expect(gradeColor(c, NEUTRAL)[i]).toBeCloseTo(c[i], 9);
  });

  it('gamma lifts or deepens the mid-tones; black and white stay', () => {
    expect(gradeColor([0.25, 0.25, 0.25], { ...NEUTRAL, gamma: 2 })[0]).toBeCloseTo(0.5, 6);
    expect(gradeColor([0.5, 0.5, 0.5], { ...NEUTRAL, gamma: 0.5 })[0]).toBeCloseTo(0.25, 6);
    expect(gradeColor([0, 0, 0], { ...NEUTRAL, gamma: 2 })[0]).toBe(0);
    expect(gradeColor([1, 1, 1], { ...NEUTRAL, gamma: 2 })[0]).toBeCloseTo(1, 9);
  });

  it('contrast deepens the darks and keeps white', () => {
    expect(gradeColor([0.5, 0.5, 0.5], { ...NEUTRAL, contrast: 2 })[0]).toBeCloseTo(0.25, 6);
    expect(gradeColor([1, 1, 1], { ...NEUTRAL, contrast: 2 })[0]).toBeCloseTo(1, 9);
  });

  it('highlights move the bright areas and leave the darks', () => {
    expect(gradeColor([0.1, 0.1, 0.1], { ...NEUTRAL, highlights: -1 })[0]).toBeCloseTo(0.1, 9);
    expect(gradeColor([1, 1, 1], { ...NEUTRAL, highlights: -1 })[0]).toBeCloseTo(0.5, 9);
    expect(gradeColor([1, 1, 1], { ...NEUTRAL, highlights: 1 })[0]).toBeCloseTo(1.5, 9);
  });

  it('saturation 0 is grey and keeps the brightness; 1.5 pushes colour out', () => {
    const [r, g, b] = gradeColor([0.8, 0.4, 0.1], { ...NEUTRAL, saturation: 0 });
    expect(r).toBeCloseTo(g, 9);
    expect(g).toBeCloseTo(b, 9);
    const grey = 0.8 * 0.2126 + 0.4 * 0.7152 + 0.1 * 0.0722;
    expect(r).toBeCloseTo(grey, 9);
    const more = gradeColor([0.8, 0.4, 0.1], { ...NEUTRAL, saturation: 1.5 });
    expect(more[0] - more[2]).toBeGreaterThan(0.7);
  });

  it('the shader names the same dials the maths uses', () => {
    for (const w of ['gradeContrast', 'gradeGamma', 'gradeHighlights', 'gradeSaturation', 'smoothstep( 0.3, 1.0']) expect(GRADE_GLSL).toContain(w);
  });

  it('"Off" is the multiply-only curve, so exposure still works under classic lighting; Auto picks Neutral only under modern lighting', () => {
    expect(toneMappingFor(0, false)).toBe(THREE.LinearToneMapping);
    expect(toneMappingFor(0, true)).toBe(THREE.NeutralToneMapping);
    expect(toneMappingFor(4, true)).toBe(THREE.LinearToneMapping);
    expect(toneMappingFor(2, false)).toBe(THREE.AgXToneMapping);
  });
});

describe('the folded grade (T58)', () => {
  const OWNER: GradeParams = { toneMap: 1, exposure: 2, gamma: 1.25, highlights: -1, contrast: 1.15, saturation: 0.9 };

  it('becomes three\'s CustomToneMapping: the chosen curve, then the grade with the dials as constants', () => {
    const glsl = foldedToneMappingGlsl(OWNER);
    expect(glsl).toContain('vec3 CustomToneMapping( vec3 color ) { return foldGradeApply( NeutralToneMapping( color ) ); }');
    expect(glsl).toContain('const float foldContrast = 1.15;');
    expect(glsl).toContain('const float foldHighlights = -1.0;');
    expect(glsl).not.toMatch(/uniform|gradeContrast|gradeApply\(/); // no names that clash with the pass's uniforms
    expect(foldedToneMappingGlsl({ ...OWNER, toneMap: 0 })).toContain('LinearToneMapping( color )'); // Auto under classic
  });

  it('three\'s chunks still have the lines foldGrade replaces (an upgrade would otherwise drop the grade or double the fog)', () => {
    expect(THREE.ShaderChunk.tonemapping_pars_fragment).toContain('vec3 CustomToneMapping( vec3 color ) { return color; }');
    expect(THREE.ShaderChunk.tonemapping_fragment).toContain('gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );');
    expect(THREE.ShaderChunk.fog_fragment).toContain('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );');
  });

  it('frames fold only while the dials match the compiled ones; exposure is live', () => {
    expect(canFold(OWNER, OWNER)).toBe(true);
    expect(canFold({ ...OWNER, exposure: 1.4 }, OWNER)).toBe(true);
    expect(canFold({ ...OWNER, gamma: 1.3 }, OWNER)).toBe(false);
    expect(canFold({ ...OWNER, toneMap: 2 }, OWNER)).toBe(false);
    expect(canFold(OWNER, null)).toBe(false);
  });
});

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { surf, uniqueMat } from '../materials';
import { OutputShader } from 'three/addons/shaders/OutputShader.js';
import { aaSamples, LOOK, ModernLook, withGrade, originalOf, smoothMeshes, swapMaterials, syncTwins, twinOf } from './modernLook';

describe('modern lighting twins (T62)', () => {
  it('a twin keeps the colour, paint, texture patch and transparency of its Lambert original', () => {
    const m = new THREE.MeshLambertMaterial({ color: 0x806040, vertexColors: true, transparent: true, opacity: 0.5, flatShading: true });
    const t = twinOf(m);
    expect(t).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(t.color.getHex()).toBe(m.color.getHex());
    expect(t.vertexColors).toBe(true);
    expect(t.transparent).toBe(true);
    expect(t.opacity).toBe(0.5);
    expect(t.flatShading).toBe(true);
    expect(t.metalness).toBe(0);
    expect(twinOf(m)).toBe(t); // one twin per original
    expect(originalOf(t)).toBe(m);

    const stone = surf('stone', 0x808080);
    const ts = twinOf(stone);
    expect(ts.onBeforeCompile).toBe(stone.onBeforeCompile);
    expect(ts.customProgramCacheKey()).toBe('surface');
    expect(ts.userData.surface).toBe('stone');
  });

  it('metal reads as metal', () => {
    expect(twinOf(surf('metal', 0x404040)).metalness).toBeGreaterThan(0.5);
  });

  it('what game code changes on an original reaches its twin (a hit flash, a fade)', () => {
    const m = uniqueMat(0x806040);
    const t = twinOf(m);
    m.emissive.setRGB(1, 0, 0);
    expect(t.emissive.r).toBe(1);
    m.transparent = true;
    m.opacity = 0.3;
    syncTwins();
    expect(t.transparent).toBe(true);
    expect(t.opacity).toBe(0.3);
  });

  it('swapping and swapping back gives every mesh its own material again', () => {
    const root = new THREE.Group();
    const lambert = new THREE.MeshLambertMaterial({ color: 0x336699 });
    const basic = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const a = new THREE.Mesh(new THREE.BoxGeometry(), lambert);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), basic);
    root.add(a, b);
    swapMaterials(root, true);
    expect(a.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(b.material).toBe(basic); // glows stay as they are
    swapMaterials(root, false);
    expect(a.material).toBe(lambert);
    expect(b.material).toBe(basic);
  });
});

describe('smooth shading (T62)', () => {
  it('welds faceted normals, then gives back exactly the ones it took', () => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed();
    g.computeVertexNormals(); // non-indexed: flat, one normal per face
    const before = Float32Array.from(g.attributes.normal.array);
    const m = new THREE.MeshLambertMaterial({ flatShading: true });
    const root = new THREE.Group().add(new THREE.Mesh(g, m));
    smoothMeshes(root, true);
    expect(m.flatShading).toBe(false);
    expect(Array.from(g.attributes.normal.array)).not.toEqual(Array.from(before));
    smoothMeshes(root, false);
    expect(m.flatShading).toBe(true);
    expect(Array.from(g.attributes.normal.array)).toEqual(Array.from(before));
  });

  it('keeps a box faceted: its 90° edges are past the crease', () => {
    const g = new THREE.BoxGeometry().toNonIndexed();
    const before = Array.from(g.attributes.normal.array);
    const root = new THREE.Group().add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ flatShading: true })));
    smoothMeshes(root, true);
    const after = Array.from(g.attributes.normal.array);
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i], 5));
    smoothMeshes(root, false);
  });
});

describe('modern lighting switched off and on again', () => {
  it('lights the scene from the sky map again at once, even if the sky has not moved (so Sky light has something to scale)', () => {
    // A stand-in for the GPU: the environment painter hands back a texture without drawing anything.
    vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockImplementation(() => ({ texture: new THREE.Texture(), dispose() {} }) as unknown as THREE.WebGLCubeRenderTarget);
    const scene = new THREE.Scene();
    const sky = {
      hemi: new THREE.HemisphereLight(0xffffff, 0x444444, 1),
      domeColors: { top: new THREE.Color(0x335577), horizon: new THREE.Color(0x889988) },
    };
    const look = new ModernLook({} as THREE.WebGLRenderer, scene, new THREE.PerspectiveCamera(), sky as never);
    const was = { ...LOOK };
    /** One frame: the real sky resets the hemisphere light every frame, which the update then scales. */
    const frame = () => {
      sky.hemi.intensity = 1;
      look.update(0.016, false, false);
    };
    try {
      LOOK.lighting = true;
      frame();
      expect(scene.environment).not.toBeNull();
      const painted = scene.environment;

      LOOK.lighting = false; // the owner toggles it off in the dev panel...
      frame();
      expect(scene.environment).toBeNull();

      LOOK.lighting = true; // ...and on again, the game still paused so the sky has not moved
      frame();
      expect(scene.environment).toBe(painted);
      LOOK.sky = 0.45;
      frame();
      expect(scene.environmentIntensity).toBe(0.45);
    } finally {
      Object.assign(LOOK, was);
      vi.restoreAllMocks();
    }
  });
});

describe('the modern pipeline anti-aliasing', () => {
  it('maps the choices to sample counts, and gives none where the canvas has no anti-aliasing', () => {
    expect([0, 1, 2].map((i) => aaSamples(true, i))).toEqual([0, 2, 4]);
    expect([0, 1, 2].map((i) => aaSamples(false, i))).toEqual([0, 0, 0]);
    expect(LOOK.aa).toBe(0); // off by default (owner's call: 120 fps)
  });
});

describe('the grade after tone mapping', () => {
  it('goes into three\'s output shader after the tone mapping and before the screen encoding, with its two dials', () => {
    const src = withGrade(OutputShader.fragmentShader);
    expect(src).toContain('uniform float gradeContrast;');
    expect(src).toContain('uniform float gradeSaturation;');
    const grade = src.indexOf('gradeApply( gl_FragColor.rgb )');
    expect(grade).toBeGreaterThan(src.indexOf('CustomToneMapping( gl_FragColor.rgb )'));
    expect(grade).toBeLessThan(src.indexOf('sRGBTransferOETF'));
  });

  it('refuses a shader it does not recognise (a three upgrade), instead of dropping the grade silently', () => {
    expect(() => withGrade('void main() { gl_FragColor = vec4(1.0); }')).toThrow(/changed shape/);
  });

  it('starts at the owner\'s look: classic lighting, the tuned grade, nothing else costly', () => {
    expect(LOOK).toMatchObject({ lighting: false, smooth: false, toneMap: 1, contrast: 1.15, saturation: 0.9, gamma: 1.25, highlights: -1, exposure: 2, sky: 1, ao: 0, bloom: 0, aa: 0 });
  });
});

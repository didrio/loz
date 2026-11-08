import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '../core/physics';
import { buildHumanoid } from '../render/characters';
import { cloneMaterial, isSharedMaterial, mat, surf, uniqueMat, uniqueSurf } from '../render/materials';
import { Cragstalker } from './cragstalker';
import { Thornling } from './enemies';
import { flatGround } from './enemyTestEnv';
import { Gravelheart } from './bosses/gravelheart';
import { HollowLamplighter } from './bosses/lamplighter';
import { DozingSentinel } from './sentinel';
import { Shellback } from './shellback';

beforeAll(async () => {
  await initPhysics();
});

/** The meshes under `root` that wear a texture, with the geometry and material they wear it on. */
function textured(root: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && (o.material as THREE.Material).userData.surface) out.push(o);
  });
  return out;
}

/**
 * The tile is projected along each face's own normal. Boxes and flat polyhedra already have one per face; a smooth cylinder, sphere,
 * cone or torus needs `faceted()`, or its tile tilts and swims across it.
 */
const FLAT = ['BoxGeometry', 'IcosahedronGeometry', 'OctahedronGeometry', 'TetrahedronGeometry', 'DodecahedronGeometry'];
function expectProjectable(meshes: THREE.Mesh[]) {
  const bad = meshes.filter((m) => !FLAT.includes(m.geometry.type) && !m.geometry.attributes.surfNormal).map((m) => m.geometry.type);
  expect(bad).toEqual([]);
}

describe('textured materials of their own (T41)', () => {
  it('uniqueSurf is a material of its own that wears the tile, and a flash still lands on it', () => {
    const a = uniqueSurf('hide', 0x7a2f4a), b = uniqueSurf('hide', 0x7a2f4a);
    expect(a).not.toBe(b);
    expect(isSharedMaterial(a)).toBe(false);
    expect(a.userData.surface).toBe('hide');
    expect(a.customProgramCacheKey()).toBe('surface');
    a.emissive.setRGB(1, 1, 1); // the hit flash
    expect(a.emissive.getHex()).toBe(0xffffff);
    expect(uniqueMat(0x7a2f4a).userData.surface).toBeUndefined();
  });

  it('cloneMaterial keeps the texture (three.js clone() drops the shader patch), and the original is untouched', () => {
    const shared = surf('cloth', 0x3a5a8a);
    expect(shared.clone().onBeforeCompile).not.toBe(shared.onBeforeCompile); // the reason cloneMaterial exists
    const c = cloneMaterial(shared);
    expect(c).not.toBe(shared);
    expect(c.onBeforeCompile).toBe(shared.onBeforeCompile);
    expect(c.customProgramCacheKey()).toBe('surface');
    expect(c.userData.surface).toBe('cloth');
    c.alphaHash = true;
    expect(shared.alphaHash).toBe(false);
    expect(isSharedMaterial(c)).toBe(false);
  });
});

describe('people', () => {
  const h = buildHumanoid({ skin: 0xf0c49c, hair: 0x2e2018, coat: 0x3a5a8a, pants: 0x4a4038, boots: 0x5a3a22, accent: 0x2aa198 });

  it('wear cloth, leather, skin and hair, with only the eyes left plain', () => {
    const surfaces = new Set(textured(h.root).map((m) => (m.material as THREE.Material).userData.surface));
    expect([...surfaces].sort()).toEqual(['cloth', 'hide', 'leather', 'skin']);
    const plain: THREE.Mesh[] = [];
    h.root.traverse((o) => o instanceof THREE.Mesh && !(o.material as THREE.Material).userData.surface && plain.push(o));
    expect(plain.length).toBe(2); // the two eyes
    expect(plain.every((m) => (m.material as THREE.MeshLambertMaterial).color.getHex() === mat(0x1b1410).color.getHex())).toBe(true);
  });

  it('can be projected: every curved piece carries its faces\' normals', () => {
    expectProjectable(textured(h.root));
  });
});

describe('enemies and bosses', () => {
  const NAMES = ['thornling', 'sentinel', 'shellback', 'cragstalker', 'lamplighter', 'gravelheart'];
  let physics: ReturnType<typeof flatGround>;
  const roots = new Map<string, THREE.Object3D>();
  let thornling: Thornling;

  beforeAll(() => {
    physics = flatGround();
    const parent = new THREE.Group();
    thornling = new Thornling(parent, physics, 0, 0);
    roots.set('thornling', thornling.root);
    roots.set('sentinel', new DozingSentinel(parent, physics, 0, 0).root);
    roots.set('shellback', new Shellback(parent, physics, 0, 0).root);
    roots.set('cragstalker', new Cragstalker(parent, physics, 0, 0).root);
    roots.set('lamplighter', new HollowLamplighter(parent, physics, null, 0, 0, 0).root);
    roots.set('gravelheart', new Gravelheart(parent, physics, null, 0, 0, 0, 0).root);
  });

  it.each(NAMES)('%s is textured, and every curved textured piece can be projected', (name) => {
    const meshes = textured(roots.get(name)!);
    expect(meshes.length).toBeGreaterThan(3);
    expectProjectable(meshes);
  });

  it('every textured enemy material is its own (flashes and fades never leak into a shared one)', () => {
    for (const root of roots.values()) for (const m of textured(root)) expect(isSharedMaterial(m.material as THREE.Material)).toBe(false);
  });

  it('a hit flash still shows on a textured enemy', () => {
    thornling.hurt(1, new THREE.Vector3(0, 0, 3));
    thornling.update(1 / 60, { playerPos: new THREE.Vector3(0, 0, 30), playerAlive: true, night: false, physics } as never);
    const skin = textured(thornling.root).map((m) => m.material as THREE.MeshLambertMaterial);
    expect(skin.some((m) => m.emissive.r > 0.9)).toBe(true);
  });
});

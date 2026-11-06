import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isSharedMaterial, mat, mergeStatic, surf } from './materials';
import { drawTile, faceNormals, SURFACES, TILE_SIZE, TILE_SPREAD, type TileId } from './textures';

const TILES = Object.keys(TILE_SIZE) as TileId[];

/** Mean absolute difference between texel pairs `(x, y)` and `(x + dx, y + dy)`, over `xs × ys`. */
function step(t: Uint8Array, n: number, xs: number[], ys: number[], dx: number, dy: number) {
  let s = 0, c = 0;
  for (const y of ys) for (const x of xs) {
    s += Math.abs(t[y * n + x] - t[((y + dy) % n) * n + ((x + dx) % n)]);
    c++;
  }
  return s / c;
}

describe('generated tiles', () => {
  it.each(TILES)('%s is the same every load, and a different seed draws another', (id) => {
    expect(drawTile(id, 7)).toEqual(drawTile(id, 7));
    expect(drawTile(id, 7)).not.toEqual(drawTile(id, 8));
  });

  it.each(TILES)('%s averages mid-grey, so it never shifts a surface\'s colour', (id) => {
    const t = drawTile(id);
    expect(t.length).toBe(TILE_SIZE[id] ** 2);
    const mean = t.reduce((a, v) => a + v, 0) / t.length;
    expect(Math.abs(mean - 128)).toBeLessThan(6);
  });

  it.each(TILES)('%s has a visible pattern, within the normal spread', (id) => {
    const t = drawTile(id);
    const mean = t.reduce((a, v) => a + v, 0) / t.length;
    const sd = Math.sqrt(t.reduce((a, v) => a + (v - mean) ** 2, 0) / t.length) / 255;
    expect(sd).toBeGreaterThan(TILE_SPREAD * 0.75);
    expect(sd).toBeLessThan(TILE_SPREAD * 1.1);
  });

  it.each(TILES)('%s tiles without a seam: across the wrap it changes no more than inside', (id) => {
    const n = TILE_SIZE[id], t = drawTile(id);
    const all = [...Array(n).keys()];
    // The step from column n-1 to 0 (and row n-1 to 0) against the sharpest step inside the tile. Patterned
    // tiles have a seam or mortar line on purpose, sometimes at the wrap; a noise that didn't wrap would jump further.
    const worst = (dx: number, dy: number) => Math.max(...all.slice(0, n - 1).map((i) => (dx ? step(t, n, [i], all, 1, 0) : step(t, n, all, [i], 0, 1))));
    expect(step(t, n, [n - 1], all, 1, 0)).toBeLessThanOrEqual(worst(1, 0) + 2);
    expect(step(t, n, all, [n - 1], 0, 1)).toBeLessThanOrEqual(worst(0, 1) + 2);
  });

  it('every surface names tiles that exist and pulls the colour by at most half', () => {
    for (const s of Object.values(SURFACES)) {
      expect(TILES).toContain(s.top);
      expect(TILES).toContain(s.side);
      expect(s.strength).toBeGreaterThan(0);
      expect(s.strength).toBeLessThanOrEqual(0.5 + 0.1);
    }
  });
});

describe('surf()', () => {
  it('is shared per colour and surface, like mat(), and is not the plain material', () => {
    const a = surf('plaster', 0xeadcbc);
    expect(surf('plaster', 0xeadcbc)).toBe(a);
    expect(surf('stone', 0xeadcbc)).not.toBe(a);
    expect(mat(0xeadcbc)).not.toBe(a);
    expect(isSharedMaterial(a)).toBe(true);
    expect(a).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(a.customProgramCacheKey()).toBe('surface');
  });

  it('patches the Lambert shader with the projection and the tiles', () => {
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
    };
    surf('ground', 0x5d9c3a).onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('vSurfPos = transformed;');
    expect(shader.vertexShader).toContain('vSurfNormal = objectNormal;');
    expect(shader.fragmentShader).toContain('flat varying vec3 vSurfNormal;');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= 1.0 + surfStrength');
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect((shader.uniforms.surfTop.value as THREE.DataTexture).image.width).toBe(TILE_SIZE.ground);
    expect((shader.uniforms.surfSide.value as THREE.DataTexture).image.width).toBe(TILE_SIZE.rock);
  });
});

/** Whether every triangle's three normals are its own face normal (what the projection needs). */
function hasFaceNormals(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    c.fromBufferAttribute(p, i + 2).sub(a);
    b.cross(c);
    if (b.length() < 1e-9) continue; // a collapsed triangle (a cone's tip) has no face
    b.normalize();
    for (let k = 0; k < 3; k++) if (m.fromBufferAttribute(n, i + k).distanceTo(b) > 1e-4) return false;
  }
  return true;
}

describe('face normals', () => {
  it('gives every vertex its triangle\'s normal (a cone\'s own normals are smooth, tilted toward its corners)', () => {
    const cone = new THREE.ConeGeometry(2, 1.1, 4).toNonIndexed();
    expect(hasFaceNormals(cone)).toBe(false);
    expect(hasFaceNormals(faceNormals(cone))).toBe(true);
    expect(() => faceNormals(new THREE.BoxGeometry())).toThrow();
  });

  it('mergeStatic sets them on textured meshes, even turned ones, and leaves plain ones alone', () => {
    const src = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 1.1, 4), surf('shingle', 0xa5452f));
    roof.position.set(150, 3, -120);
    roof.rotation.y = 0.7;
    const plain = new THREE.Mesh(new THREE.ConeGeometry(2, 1.1, 4), mat(0xa5452f));
    src.add(roof, plain);
    const out = mergeStatic(src).children as THREE.Mesh[];
    const textured = out.find((m) => m.material === roof.material)!;
    const untouched = out.find((m) => m.material === plain.material)!;
    expect(hasFaceNormals(textured.geometry)).toBe(true);
    expect(hasFaceNormals(untouched.geometry)).toBe(false);
  });
});

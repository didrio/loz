import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BAKED_SHADE, bakeColor, isSharedMaterial, kitMat, mat, mergeAudit, mergeStatic, surf, uniqueMat } from './materials';
import { bevelBox, kitMesh, paint, paintRegion, place } from './kit';
import { pal } from './palette';
import { drawTile, faceNormals, SURFACES, DEFAULT_TEXTURE_RESOLUTION, downsampleTile, setTextureResolution, TILE_METRES, TILE_SIZE, textureResolution, tileSizeAt, TILE_SPREAD, tileTexture, type TileId } from './textures';

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

  // Owner's call, 2026-11-09: perfect dark lines read as a grid and cheap. Joints must wander, wear and stay off the extremes.
  it.each(['stone', 'planks', 'shingle', 'rock', 'scales', 'thatch', 'cloth'] as TileId[])('%s has no ruler-straight dark joint across the whole tile, and no clamped black', (id) => {
    const n = TILE_SIZE[id], t = drawTile(id);
    const mean = t.reduce((a, v) => a + v, 0) / t.length;
    const sd = Math.sqrt(t.reduce((a, v) => a + (v - mean) ** 2, 0) / t.length);
    const dark = (i: number) => t[i] < mean - 2 * sd;
    for (let k = 0; k < n; k++) {
      let row = 0, col = 0;
      for (let j = 0; j < n; j++) {
        if (dark(k * n + j)) row++;
        if (dark(j * n + k)) col++;
      }
      expect(row / n).toBeLessThan(0.8);
      expect(col / n).toBeLessThan(0.8);
    }
    expect(t.filter((v) => v === 0 || v === 255).length / t.length).toBeLessThan(0.02);
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
    expect(shader.vertexShader).toContain('attribute vec3 surfNormal;');
    expect(shader.vertexShader).toContain('? surfNormal : objectNormal;');
    // Never `flat`: on Metal (ANGLE) a flat varying here ran the GPU out of memory and lost the WebGL context (T44). Every vertex of a face carries the same normal, so smooth interpolation is identical.
    expect(shader.fragmentShader).toContain('\nvarying vec3 vSurfNormal;');
    expect(shader.fragmentShader).not.toContain('flat varying');
    expect(shader.vertexShader).not.toContain('flat varying');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= 1.0 + surfStrength');
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect((shader.uniforms.surfTop.value as THREE.DataTexture).image.width).toBe(tileSizeAt('ground', DEFAULT_TEXTURE_RESOLUTION));
    expect((shader.uniforms.surfSide.value as THREE.DataTexture).image.width).toBe(tileSizeAt('rock', DEFAULT_TEXTURE_RESOLUTION));
  });
});

/** Whether every triangle's three `attr` values are its own face normal (what the projection needs). */
function hasFaceNormals(g: THREE.BufferGeometry, attr = 'surfNormal') {
  const p = g.attributes.position, n = g.attributes[attr];
  if (!n) return false;
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
  it('gives every vertex its triangle\'s normal in surfNormal and leaves the smooth normal alone (T30)', () => {
    const cone = new THREE.ConeGeometry(2, 1.1, 4).toNonIndexed();
    const smooth = Array.from(cone.attributes.normal.array);
    expect(hasFaceNormals(cone)).toBe(false);
    expect(hasFaceNormals(faceNormals(cone))).toBe(true);
    expect(hasFaceNormals(cone, 'normal')).toBe(false);
    expect(Array.from(cone.attributes.normal.array)).toEqual(smooth);
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
    expect(out).toHaveLength(2);
    const textured = out.find((m) => m.geometry.attributes.surfNormal)!;
    const untouched = out.find((m) => !m.geometry.attributes.surfNormal)!;
    expect(hasFaceNormals(textured.geometry)).toBe(true);
    expect(hasFaceNormals(untouched.geometry)).toBe(false);
    expect(hasFaceNormals(untouched.geometry, 'normal')).toBe(false); // the cone's smooth normals survive the merge
  });
});

describe('faceted look (owner\'s call, 2026-11-07)', () => {
  it('every kind of material is flat-shaded, merged scenery included', () => {
    expect(mat(0x5d9c3a).flatShading).toBe(true);
    expect(surf('stone', 0x5d9c3a).flatShading).toBe(true);
    expect(uniqueMat(0x5d9c3a).flatShading).toBe(true);
    const src = new THREE.Group();
    src.add(new THREE.Mesh(new THREE.BoxGeometry(), mat(0x5d9c3a)), new THREE.Mesh(new THREE.BoxGeometry(), surf('stone', 0x5d9c3a)));
    for (const m of mergeStatic(src).children as THREE.Mesh[]) expect((m.material as THREE.MeshLambertMaterial).flatShading).toBe(true);
  });
});

describe('texture filtering and density (T30)', () => {
  it('is crisp (nearest) up close, mipmapped far off', () => {
    const t = tileTexture('plaster');
    expect(t.magFilter).toBe(THREE.NearestFilter);
    expect(t.minFilter).toBe(THREE.NearestMipmapLinearFilter);
  });
});

describe('scale and resolution are separate (owner\'s call)', () => {
  it('a tile\'s scale is its own: metres per repeat, set with the tile, and the pattern never rescales with resolution', () => {
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    surf('stone', 0x888888).onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    const before = shader.uniforms.surfTopRepeat.value;
    expect(before).toBe(1 / TILE_METRES.stone);
    setTextureResolution(4);
    try {
      expect(shader.uniforms.surfTopRepeat.value).toBe(before);
    } finally {
      setTextureResolution(DEFAULT_TEXTURE_RESOLUTION);
    }
  });

  it('resolution is one global number of whole texels per metre, within 1..32, and a tile never gets more pixels than it was drawn with', () => {
    try {
      setTextureResolution(20.4);
      expect(textureResolution()).toBe(20);
      setTextureResolution(99);
      expect(textureResolution()).toBe(32);
      setTextureResolution(-3);
      expect(textureResolution()).toBe(1);
      for (const id of TILES) {
        expect(tileSizeAt(id, 32)).toBe(TILE_SIZE[id]);
        expect(tileSizeAt(id, 64)).toBe(TILE_SIZE[id]);
        expect(tileSizeAt(id, 1)).toBe(Math.round(TILE_METRES[id]));
      }
    } finally {
      setTextureResolution(DEFAULT_TEXTURE_RESOLUTION);
    }
  });

  it('changing the resolution re-draws a texture already in use at the new size, same pattern', () => {
    const t = tileTexture('stone');
    const full = drawTile('stone');
    try {
      setTextureResolution(16);
      expect(t.image.width).toBe(tileSizeAt('stone', 16));
      expect(t.image.width).toBe(TILE_SIZE.stone / 2);
      setTextureResolution(8);
      expect(t.image.width).toBe(TILE_SIZE.stone / 4);
      const small = t.image.data as Uint8Array;
      expect(small).toEqual(downsampleTile(full, TILE_SIZE.stone, TILE_SIZE.stone / 4));
    } finally {
      setTextureResolution(DEFAULT_TEXTURE_RESOLUTION);
    }
  });

  it('downsampling is crisp at every size: it never blends texels, so a two-tone tile stays two-tone, even at a ratio that isn\'t whole', () => {
    const n = 64;
    const twoTone = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) twoTone[y * n + x] = (x % 7 === 0 || y % 5 === 0) ? 40 : 190; // mortar lines in blocks
    for (const m of [62, 48, 31, 20, 16, 8, 3]) {
      expect(new Set(downsampleTile(twoTone, n, m)).size, `${m} px`).toBeLessThanOrEqual(2);
    }
  });

  it('downsampling keeps the tile\'s mean and spread (so colour and strength never change with resolution), a flat tile flat, and same-size alone', () => {
    const stats = (a: Uint8Array) => {
      const mu = a.reduce((x, v) => x + v, 0) / a.length;
      return { mu, sd: Math.sqrt(a.reduce((x, v) => x + (v - mu) ** 2, 0) / a.length) };
    };
    for (const id of TILES) {
      const full = drawTile(id), n = TILE_SIZE[id], want = stats(full);
      for (const m of [n - 2, n - 1, n / 2, n / 4]) {
        const got = stats(downsampleTile(full, n, Math.round(m)));
        expect(Math.abs(got.mu - want.mu), `${id} ${m} mean`).toBeLessThan(4); // clamping at 0/255 nudges it at tiny sizes
        expect(Math.abs(got.sd - want.sd) / want.sd, `${id} ${m} spread`).toBeLessThan(0.25); // clamping at 0/255 trims some
      }
    }
    const flat = new Uint8Array(16 * 16).fill(128);
    expect([...new Set(downsampleTile(flat, 16, 5))]).toEqual([128]);
    expect(downsampleTile(flat, 16, 16)).toBe(flat);
  });

  it('downsampling keeps a thin crack at full strength (it is picked, not averaged away)', () => {
    const n = 16;
    const line = new Uint8Array(n * n).fill(200);
    for (let y = 0; y < n; y++) line[y * n + 5] = 0; // a one-texel crack down column 5
    for (const m of [8, 4, 5]) {
      const small = downsampleTile(line, n, m);
      expect(Math.max(...small) - Math.min(...small), `${m} px`).toBeGreaterThan(100);
    }
  });
});

describe('mergeStatic bakes colour into vertices (T30)', () => {
  const box = (m: THREE.Material, x = 0, y = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
    o.position.set(x, y + 0.5, 0);
    return o;
  };

  it('batches by kind, not by colour: many colours of plain boxes are one mesh', () => {
    const src = new THREE.Group();
    for (let i = 0; i < 6; i++) src.add(box(mat(0x100000 * (i + 1) + 0x808080), i * 2));
    const out = mergeStatic(src).children as THREE.Mesh[];
    expect(out).toHaveLength(1);
    expect((out[0].material as THREE.MeshLambertMaterial).vertexColors).toBe(true);
  });

  it('keeps a mesh per surface, per emissive colour, and for transparent or odd materials', () => {
    const src = new THREE.Group();
    src.add(box(mat(0xaa8866)), box(surf('plaster', 0xaa8866)), box(surf('plaster', 0x886644)), box(surf('stone', 0xaa8866)));
    src.add(box(mat(0xaa8866, 0x442200)), box(mat(0x112233, 0x442200)), box(mat(0x112233, 0x224400)));
    const glass = uniqueMat(0x88aacc, { transparent: true, opacity: 0.5 });
    src.add(box(glass), box(glass));
    src.add(box(uniqueMat(0x88aacc, { side: THREE.BackSide })));
    const out = mergeStatic(src).children as THREE.Mesh[];
    // plain, plaster, stone, two emissives, the glass, the BackSide one
    expect(out).toHaveLength(7);
    expect(out.filter((m) => m.material === glass)).toHaveLength(1);
  });

  it('bakes the material colour (linear, as snapped to the palette) into the vertices, full on tops, darker below', () => {
    const src = new THREE.Group();
    const m = mat(0x5d9c3a);
    src.add(box(m));
    const g = (mergeStatic(src).children[0] as THREE.Mesh).geometry;
    const col = g.attributes.color;
    let max = 0, min = 1;
    for (let i = 0; i < col.count; i++) {
      max = Math.max(max, col.getX(i));
      min = Math.min(min, col.getX(i));
    }
    expect(max).toBeCloseTo(m.color.r, 5);
    expect(min).toBeLessThan(m.color.r * 0.9);
  });

  it('darkens undersides and the feet of walls, and nothing else', () => {
    const g = new THREE.BoxGeometry(1, 3, 1).toNonIndexed();
    g.translate(0, 1.5, 0);
    bakeColor(g, new THREE.Color(1, 1, 1));
    const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const v = col.getX(i), ny = nor.getY(i), y = pos.getY(i);
      if (ny > 0.5) expect(v).toBe(1); // the top
      else if (ny < -0.5) expect(v).toBeCloseTo(BAKED_SHADE.underside, 5);
      else if (y < 0.001) expect(v).toBeCloseTo(BAKED_SHADE.foot, 5); // wall foot
      else if (y > BAKED_SHADE.footHeight) expect(v).toBeCloseTo(1, 5);
    }
  });

  it('a kit piece joins the plain meshes of its surface: its paint survives, darkened like theirs (T51)', () => {
    const src = new THREE.Group();
    const red = pal('clay', 2), green = pal('grass', 2);
    // A two-colour kit box (a red top, green sides and bottom) beside a plain plaster box.
    const piece = kitMesh(paintRegion(paint(place(bevelBox(1, 1, 1, 0), 0, 0.5, 0), green), (_c, n) => (n.y > 0.5 ? red : undefined)), 'plaster');
    piece.position.x = 3;
    src.add(piece, box(surf('plaster', 0xaa8866)));
    const out = mergeStatic(src, 80, true).children as THREE.Mesh[];
    expect(out).toHaveLength(1); // the same bucket: no extra draw call
    expect(out[0].material).toBe(kitMat('plaster'));
    const g = out[0].geometry, pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, shade = g.attributes.shade;
    expect(shade).toBeDefined(); // so the light bake can replace the shade, as for plain meshes
    const r = new THREE.Color(red), gr = new THREE.Color(green);
    let seen = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) < 2) continue; // the kit box only
      seen++;
      const want = nor.getY(i) > 0.5 ? r : pos.getY(i) < 0.001 && Math.abs(nor.getY(i)) < 0.5 ? gr.clone().multiplyScalar(BAKED_SHADE.foot) : null;
      if (nor.getY(i) < -0.5) expect(col.getY(i)).toBeCloseTo(gr.g * BAKED_SHADE.underside, 5);
      if (want) expect([col.getX(i), col.getY(i), col.getZ(i)].map((v) => +v.toFixed(5))).toEqual([want.r, want.g, want.b].map((v) => +v.toFixed(5)));
      expect(col.getX(i) / shade.getX(i)).toBeGreaterThan(0); // shade is the factor, not zero
    }
    expect(seen).toBe(36);
  });

  it('a kit piece without a surface is reported to the texture audit (T51)', () => {
    mergeAudit.on = true;
    mergeAudit.plain = [];
    try {
      mergeStatic(new THREE.Group().add(kitMesh(paint(bevelBox(1, 1, 1, 0), pal('stone', 2)))));
      expect(mergeAudit.plain.map((p) => p.geometry)).toEqual(['kit']);
    } finally {
      mergeAudit.on = false;
    }
  });
});

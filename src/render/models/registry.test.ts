import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { surf, uniqueMat } from '../materials';
import { pal } from '../palette';
import { ASSETS, assetById, type AssetEntry } from './registry';
import { assetTable, failures, inspect, inspectAll, meshTriangles, MAX_EXTENT, TRIANGLE_BUDGET } from './validate';

/** A throwaway registry entry around one mesh. */
const entry = (over: Partial<AssetEntry>, mesh: () => THREE.Mesh, flash: THREE.MeshLambertMaterial[] = []): AssetEntry => ({
  id: 'test',
  kind: 'prop',
  tier: 'final',
  build: () => {
    const root = new THREE.Group();
    root.add(mesh());
    return { root, joints: {}, flashMats: flash };
  },
  ...over,
});
const box = (m: THREE.Material, size = 1) => () => new THREE.Mesh(new THREE.BoxGeometry(size, size, size), m);

describe('the registry', () => {
  it('has unique ids, and every entry builds a model with meshes', () => {
    const ids = ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ASSETS) {
      const r = inspect(a);
      expect(r.meshes, a.id).toBeGreaterThan(0);
      expect(r.triangles, a.id).toBeGreaterThan(0);
    }
    expect(assetById('chest')?.kind).toBe('prop');
    expect(assetById('nope')).toBeUndefined();
  });

  it('lists every model builder in render/models/ (a new one must be registered)', () => {
    const files = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const registry = files['./registry.ts'];
    expect(registry).toBeTruthy();
    let found = 0;
    for (const [file, source] of Object.entries(files)) {
      if (file.endsWith('.test.ts')) continue;
      for (const [, name] of source.matchAll(/export function (build\w+)\(/g)) {
        found++;
        // Once in the import and at least once in an entry.
        expect(registry.split(name).length - 1, `${name} (${file}) is not used in registry.ts`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(found).toBeGreaterThan(10);
  });

  it('passes the validator: no failures for final assets (rough ones only warn)', () => {
    const reports = inspectAll();
    expect(failures(reports)).toEqual([]);
    const warned = reports.filter((r) => r.problems.length);
    if (warned.length) console.warn(`${warned.length} rough assets have validator warnings (npm run assets lists them)`);
  });

  it('prints a table with every asset and its findings', () => {
    const table = assetTable();
    for (const a of ASSETS) expect(table).toContain(a.id);
    expect(table.split('\n')[0]).toContain('triangles');
  });
});

describe('the validator', () => {
  it('counts triangles, instances included', () => {
    expect(meshTriangles(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))).toBe(12);
    expect(meshTriangles(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 5))).toBe(60);
    // Non-indexed geometry (faceted, merged) counts by vertices.
    expect(meshTriangles(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed()))).toBe(12);
  });

  it('passes a clean model', () => {
    const r = inspect(entry({}, box(surf('stone', pal('stone', 2)))));
    expect(r.problems).toEqual([]);
    expect(r.triangles).toBe(12);
    expect(r.surfaces).toEqual(['stone']);
    expect(failures([r])).toEqual([]);
  });

  it('flags a model over its triangle budget, and that fails only for final', () => {
    const heavy = () => new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), surf('stone', pal('stone', 2)));
    const final = inspect(entry({}, heavy));
    expect(final.problems.join()).toMatch(/over the prop budget of 300/);
    expect(failures([final])).toHaveLength(1);
    const rough = inspect(entry({ tier: 'rough' }, heavy));
    expect(rough.problems).toHaveLength(1);
    expect(failures([rough])).toEqual([]);
    // The same count is fine for a boss.
    expect(inspect(entry({ kind: 'boss' }, heavy)).problems.join()).not.toMatch(/budget/);
    expect(TRIANGLE_BUDGET.boss).toBeGreaterThan(TRIANGLE_BUDGET.enemy);
  });

  it('flags an off-palette colour, in the base colour and in the emissive, but accepts palette colours', () => {
    const plain = new THREE.MeshBasicMaterial({ color: 0x123457 });
    expect(inspect(entry({}, box(plain))).problems.join()).toMatch(/off-palette colours: #123457/);
    const lit = new THREE.MeshLambertMaterial({ color: pal('stone', 2), emissive: 0x123457 });
    expect(inspect(entry({}, box(lit), [lit])).problems.join()).toMatch(/emissive #123457/);
    const ok = new THREE.MeshBasicMaterial({ color: pal('amber', 2) });
    expect(inspect(entry({}, box(ok))).problems).toEqual([]);
  });

  it('flags a hand-made Lambert material unless it is shared or declared', () => {
    const own = uniqueMat(pal('stone', 2));
    expect(inspect(entry({}, box(own))).problems.join()).toMatch(/unshared materials/);
    expect(inspect(entry({}, box(own), [own])).problems).toEqual([]);
    expect(inspect(entry({}, box(surf('wood', pal('bark', 2))))).problems).toEqual([]);
  });

  it('allows the ground tile to be big, and every other texture is within 64 px', () => {
    // The ground surface's tile is drawn at 128 px: excepted. Nothing else may exceed 64.
    expect(inspect(entry({}, box(surf('ground', pal('grass', 2))))).problems).toEqual([]);
    for (const a of ASSETS) expect(inspect(a).problems.join(), a.id).not.toMatch(/textures over/);
  });

  it('flags an empty or absurdly sized model', () => {
    expect(inspect(entry({}, box(surf('stone', pal('stone', 2)), 0.01))).problems.join()).toMatch(/tiny/);
    expect(inspect(entry({}, box(surf('stone', pal('stone', 2)), 50))).problems.join()).toMatch(new RegExp(`over the prop limit of ${MAX_EXTENT.prop} m`));
    const none: AssetEntry = { id: 'empty', kind: 'prop', tier: 'final', build: () => ({ root: new THREE.Group(), joints: {}, flashMats: [] }) };
    expect(inspect(none).problems.join()).toMatch(/no meshes/);
  });
});

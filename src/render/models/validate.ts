import * as THREE from 'three';
import { meshTriangles } from '../kit';
import { isSharedMaterial } from '../materials';
import { snap, swatchName, nearest } from '../palette';
import { SURFACES, TILE_SIZE, type SurfaceId } from '../textures';
import { ASSETS, type AssetEntry, type AssetKind } from './registry';

/**
 * The asset validator (docs/pipeline.md): builds a registered model in Node and measures it against docs/art.md's budgets.
 * `registry.test.ts` runs it in `npm run check` (findings fail for `final` assets and only warn for `rough` ones);
 * `npm run assets` prints the table.
 */

/** Triangle budget by kind (art.md "Budgets"): the top of each range. A `piece` is environment (big simple shapes): no cap. */
export const TRIANGLE_BUDGET: Record<AssetKind, number> = { player: 2000, enemy: 1200, miniboss: 2500, boss: 4000, npc: 1200, prop: 300, piece: Infinity };

/** The longest side a bounding box may have (m): a sanity check on scale, not a design limit. */
export const MAX_EXTENT: Record<AssetKind, number> = { player: 4, enemy: 6, miniboss: 9, boss: 12, npc: 4, prop: 10, piece: 60 };
export const MIN_EXTENT = 0.1;

/** The biggest a generated texture may be (px); the ground tile is the one exception (it covers whole fields). */
export const MAX_TEXTURE_PX = 64;

export interface AssetReport {
  id: string;
  kind: AssetKind;
  tier: AssetEntry['tier'];
  triangles: number;
  budget: number;
  /** Bounding box size (m). */
  size: THREE.Vector3;
  meshes: number;
  materials: number;
  /** Distinct textured surfaces (`surf`/`uniqueSurf` ids). */
  surfaces: SurfaceId[];
  /** Everything wrong, as sentences. Empty = clean. */
  problems: string[];
}

export { meshTriangles };

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Whether `color` is a palette colour (a swatch snaps to itself); otherwise names the nearest swatch for the message. */
function offPalette(color: number): string | null {
  if (snap(color) === color) return null;
  const { swatch } = nearest(color);
  return `${hex(color)} (nearest ${swatchName(swatch)} ${hex(swatch.hex)})`;
}

/** Builds `entry` and measures it. Throws only if `build()` does. */
export function inspect(entry: AssetEntry): AssetReport {
  const model = entry.build();
  const problems: string[] = [];
  model.root.updateMatrixWorld(true);

  let triangles = 0, meshes = 0;
  const materials = new Set<THREE.Material>();
  model.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    triangles += meshTriangles(o);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });

  const budget = TRIANGLE_BUDGET[entry.kind];
  if (triangles > budget) problems.push(`${triangles} triangles, over the ${entry.kind} budget of ${budget}`);
  if (meshes === 0) problems.push('no meshes');

  const declared = new Set<THREE.Material>([...model.flashMats, ...(model.animated ?? [])]);
  const surfaces = new Set<SurfaceId>();
  const offColours = new Set<string>(), unshared = new Set<string>(), bigTextures = new Set<string>();
  for (const m of materials) {
    const colored = m as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
    if (colored.color) {
      const off = offPalette(colored.color.getHex());
      if (off) offColours.add(off);
    }
    // Emissive is the glow colour at rest; zero is "off", not a colour.
    if (colored.emissive && colored.emissive.getHex() !== 0) {
      const off = offPalette(colored.emissive.getHex());
      if (off) offColours.add(`emissive ${off}`);
    }
    // Lambert materials come from the shared cache or are declared (flash/animated); an undeclared one is a hand-made material.
    if (m instanceof THREE.MeshLambertMaterial && !isSharedMaterial(m) && !declared.has(m)) unshared.add(hex(m.color.getHex()));
    const surface = m.userData.surface as SurfaceId | undefined;
    if (surface) {
      surfaces.add(surface);
      for (const tile of new Set([SURFACES[surface].top, SURFACES[surface].side])) {
        if (tile !== 'ground' && TILE_SIZE[tile] > MAX_TEXTURE_PX) bigTextures.add(`${tile} ${TILE_SIZE[tile]}px`);
      }
    }
  }
  if (offColours.size) problems.push(`off-palette colours: ${[...offColours].join(', ')}`);
  if (unshared.size) problems.push(`unshared materials not declared as flash or animated: ${[...unshared].join(', ')}`);
  if (bigTextures.size) problems.push(`textures over ${MAX_TEXTURE_PX}px: ${[...bigTextures].join(', ')}`);

  const box = new THREE.Box3().setFromObject(model.root);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest < MIN_EXTENT) problems.push(`bounding box is empty or tiny (${longest.toFixed(2)} m)`);
  else if (longest > MAX_EXTENT[entry.kind]) problems.push(`bounding box is ${longest.toFixed(1)} m long, over the ${entry.kind} limit of ${MAX_EXTENT[entry.kind]} m`);

  return { id: entry.id, kind: entry.kind, tier: entry.tier, triangles, budget, size, meshes, materials: materials.size, surfaces: [...surfaces].sort(), problems };
}

export function inspectAll(entries: readonly AssetEntry[] = ASSETS): AssetReport[] {
  return entries.map(inspect);
}

/** `npm run assets`: one row per model, then every finding. */
export function assetTable(reports: AssetReport[] = inspectAll()): string {
  const rows = reports.map((r) => [
    r.id, r.kind, r.tier,
    `${r.triangles}${Number.isFinite(r.budget) ? ` / ${r.budget}` : ''}`,
    `${r.size.x.toFixed(1)}×${r.size.y.toFixed(1)}×${r.size.z.toFixed(1)}`,
    String(r.meshes), String(r.materials), r.surfaces.join(' ') || '-', r.problems.length ? `${r.problems.length} finding${r.problems.length > 1 ? 's' : ''}` : 'ok',
  ]);
  const head = ['id', 'kind', 'tier', 'triangles', 'size (m)', 'meshes', 'mats', 'textures', 'status'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const out = [line(head), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)];
  const findings = reports.filter((r) => r.problems.length);
  if (findings.length) {
    out.push('', 'Findings (rough: warnings; final: failures):');
    for (const r of findings) for (const p of r.problems) out.push(`  ${r.id} [${r.tier}]: ${p}`);
  }
  return out.join('\n');
}

/** The findings that fail the build: every problem of a `final` asset (a `rough` one only warns). */
export function failures(reports: AssetReport[]): string[] {
  return reports.filter((r) => r.tier === 'final').flatMap((r) => r.problems.map((p) => `${r.id}: ${p}`));
}

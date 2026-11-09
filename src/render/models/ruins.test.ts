import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RUINS } from '../../world/overworld/layout';
import { assetById } from './registry';
import { buildRuin, RUIN_WALLS } from './ruins';
import { inspect } from './validate';

function vertices(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  return out;
}

describe('the ruined homes (T51c)', () => {
  it('every ruin of the world is one the model can build, and the plan is the rough one (nine stretches, tallest at the back)', () => {
    expect(RUIN_WALLS).toHaveLength(9);
    expect(Math.max(...RUIN_WALLS.map((w) => w[4]))).toBe(3.0);
    for (const r of RUINS) {
      expect(() => buildRuin(r.scale, r.flip as 1 | -1)).not.toThrow();
    }
  });

  it.each([1, 1.3])('at scale %s the walls stand to the rough heights (the buried 0.6 m and a broken top) and no further', (scale) => {
    const verts = vertices(buildRuin(scale, 1).root);
    // Walls whose footprint the roof, chimney and rafters do not overhang.
    for (const i of [1, 2, 5, 6, 7, 8]) {
      const [ax, az, bx, bz, h] = RUIN_WALLS[i];
      const along = Math.abs(bx - ax) > Math.abs(bz - az);
      const half = (Math.hypot(bx - ax, bz - az) * scale) / 2;
      const cx = ((ax + bx) / 2) * scale, cz = ((az + bz) / 2) * scale;
      /** The vertices over the wall's middle (`margin` along it, a wall's thickness across it). */
      const over = (margin: number) => verts.filter((v) => (along ? Math.abs(v.x - cx) < half - margin && Math.abs(v.z - cz) < 0.25 : Math.abs(v.z - cz) < half - margin && Math.abs(v.x - cx) < 0.25));
      const top = Math.max(...over(0.35).map((v) => v.y));
      expect(top, `wall ${i}`).toBeGreaterThan(h - 0.05);
      expect(top, `wall ${i}`).toBeLessThan(h + 0.35);
      expect(Math.min(...over(-0.05).map((v) => v.y)), `wall ${i}`).toBeLessThan(-0.5);
    }
  });

  it('a flipped ruin is the mirror image, and the same ruin built twice is identical', () => {
    const a = new THREE.Box3().setFromObject(buildRuin(1.3, 1).root), b = new THREE.Box3().setFromObject(buildRuin(1.3, -1).root);
    expect(a.min.x).toBeCloseTo(-b.max.x, 0);
    expect(a.max.x).toBeCloseTo(-b.min.x, 0);
    expect(a.max.y).toBeCloseTo(b.max.y, 3);
    expect(vertices(buildRuin(1, 1).root).map((v) => v.toArray())).toEqual(vertices(buildRuin(1, 1).root).map((v) => v.toArray()));
  });

  it('is registered as a final piece within budget', () => {
    const entry = assetById('ruined-home')!;
    expect(entry.kind).toBe('piece');
    expect(entry.tier).toBe('final');
    expect(inspect(entry).problems).toEqual([]);
  });
});

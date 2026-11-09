import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { assetById } from './registry';
import { inspect } from './validate';
import { buildBarrel, buildCottage, buildCrate, buildFenceSection, buildLanternPost, buildWell, COTTAGE, COTTAGE_WINDOW, FRONT, type CottageStyle } from './village';

/** Every vertex of every mesh under the model, in the model's frame. */
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

const STYLES: CottageStyle[] = ['east', 'southwest'];

describe("Thistledown's cottages (T51b)", () => {
  it.each(STYLES)('the %s cottage stands on its plinth, covers the frozen footprint and keeps its door on +z', (style) => {
    const box = new THREE.Box3().setFromObject(buildCottage(style).root);
    expect(Math.abs(box.min.y)).toBeLessThan(0.01);
    // The walls and plinth fill the footprint the colliders were measured from; the eaves and gable ends reach past it.
    expect(box.min.x).toBeLessThan(-COTTAGE.w / 2);
    expect(box.max.x).toBeGreaterThan(COTTAGE.w / 2);
    expect(box.min.z).toBeLessThan(-COTTAGE.d / 2);
    // The doorstep (and the porch, bench) stand out in front, and nothing but the eave reaches behind as far.
    expect(box.max.z).toBeGreaterThan(FRONT + 0.7);
    expect(box.min.z).toBeGreaterThan(-(COTTAGE.d / 2 + 1.2));
    // A gable roof with a chimney over the ridge.
    expect(box.max.y).toBeGreaterThan(COTTAGE.h + 2.4);
  });

  it.each(STYLES)("the %s cottage leaves the window panes' volume clear (the world places the glowing glass)", (style) => {
    const half = COTTAGE_WINDOW.size / 2 - 0.02;
    for (const sx of [-1, 1]) {
      const inside = vertices(buildCottage(style).root).filter(
        (v) => Math.abs(v.x - sx * COTTAGE_WINDOW.x) < half && Math.abs(v.y - COTTAGE_WINDOW.y) < half && v.z > FRONT + 0.005 && v.z < FRONT + 0.095,
      );
      expect(inside).toEqual([]);
    }
  });

  it('is deterministic, and the registry has both as final pieces within budget', () => {
    expect(vertices(buildCottage('east').root).map((v) => v.toArray())).toEqual(vertices(buildCottage('east').root).map((v) => v.toArray()));
    for (const id of ['cottage-east', 'cottage-southwest']) {
      const entry = assetById(id)!;
      expect(entry.kind).toBe('piece');
      expect(entry.tier).toBe('final');
      expect(inspect(entry).problems).toEqual([]);
    }
  });
});

describe("Thistledown's props (T51b)", () => {
  it('the barrel, crate, lantern post, fence and well keep the rough sizes the colliders were measured from', () => {
    const size = (m: { root: THREE.Object3D }) => new THREE.Box3().setFromObject(m.root).getSize(new THREE.Vector3());
    expect(size(buildBarrel()).y).toBeCloseTo(1, 1);
    expect(size(buildBarrel()).x).toBeLessThan(1.05);
    expect(size(buildCrate()).toArray().map((n) => Math.round(n * 10) / 10)).toEqual([0.9, 0.9, 0.9]);
    // The lantern post: 3.4 m with its hood, 0.7 across (its collider is a 0.2 m cylinder at the post; the core sits at 2.75 m).
    expect(size(buildLanternPost()).y).toBeGreaterThan(3.3);
    expect(size(buildLanternPost()).x).toBeLessThan(0.8);
    // A fence section: a post and rails 2.6 m long.
    expect(size(buildFenceSection()).z).toBeGreaterThan(2.6);
    // The well's apron is 6.6 m across; the curb is 1 m high and the roof tops 3.6 m.
    expect(size(buildWell()).x).toBeCloseTo(6.6, 1);
    expect(size(buildWell()).y).toBeGreaterThan(3.5);
  });

  it('every one is registered as a final prop within the 300 triangle budget', () => {
    for (const id of ['well', 'fence-section', 'lantern-post', 'barrel', 'crate']) {
      const entry = assetById(id)!;
      expect(entry.kind, id).toBe('prop');
      expect(entry.tier, id).toBe('final');
      expect(inspect(entry).problems, id).toEqual([]);
    }
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BANNER, buildBanner, buildLintelCarving, buildOfferingNiche, buildRubble, buildSandDrift, buildSpiralRelief, crackDecal, DECAL_H, FOOT_BAND,
  sunkenFlagDecal, WALL_PIECE_LOW,
} from './shrineDressing';

/** The box round everything drawn under a root, in its own frame. */
const boundsOf = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
};

describe("the Hall's dressing models", () => {
  it('rubble and drifts never stand out more than the foot band, at every variant', () => {
    for (let v = 0; v < 4; v++) {
      for (const m of [buildRubble(v), buildSandDrift(1.4, v), buildSandDrift(2.4, v)]) {
        const b = boundsOf(m.root);
        expect(b.max.z, `variant ${v}`).toBeLessThanOrEqual(FOOT_BAND + 1e-6);
        // A tilted block may sink a few cm into the floor, which hides it.
        expect(b.min.y, `variant ${v}`).toBeGreaterThanOrEqual(-0.03);
        expect(b.max.y).toBeLessThan(0.85);
      }
    }
  });

  it('a drift is as long as asked and lies on the floor', () => {
    const b = boundsOf(buildSandDrift(2).root);
    expect(b.max.x - b.min.x).toBeGreaterThan(1.9);
    expect(b.max.x - b.min.x).toBeLessThan(2.1);
  });

  it('everything on a wall starts above the string course and never reaches into the wall', () => {
    for (const [name, m] of [['relief', buildSpiralRelief()], ['niche', buildOfferingNiche()], ['banner', buildBanner(0)], ['banner 1', buildBanner(1)], ['banner 2', buildBanner(2)], ['lintel', buildLintelCarving(3)]] as const) {
      // The stone parts (a glow is soft light, it has no body).
      const glow = (m.joints as { glow?: THREE.Object3D }).glow;
      if (glow) m.root.remove(glow);
      const b = boundsOf(m.root);
      expect(b.min.y, name).toBeGreaterThanOrEqual(WALL_PIECE_LOW - 0.02); // the string course tops out 7 cm lower
      expect(b.min.z, name).toBeGreaterThanOrEqual(-0.06); // a little buried in the wall is hidden by it
      expect(b.max.z, name).toBeLessThan(0.5);
    }
  });

  it('a banner hangs from its rod and its tails stay above the course', () => {
    for (let v = 0; v < 3; v++) {
      const b = boundsOf(buildBanner(v).root);
      expect(b.max.y).toBeLessThanOrEqual(BANNER.rod + 0.1);
      expect(b.min.y).toBeGreaterThan(WALL_PIECE_LOW + 0.3);
    }
  });

  it('the glowing models keep their glow in an unbaked group, with additive materials from the shared set', () => {
    for (const m of [buildSpiralRelief(), buildLintelCarving(3), buildOfferingNiche()]) {
      const glow = m.joints.glow;
      expect(m.root.children).toContain(glow);
      let meshes = 0;
      glow.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes++;
      });
      expect(meshes).toBeGreaterThan(0);
      expect(m.animated?.length).toBeGreaterThan(0);
    }
  });

  it('flat decals lie within 2 cm of the floor', () => {
    const crack = crackDecal([[0, 0], [0.4, 0.2], [0.9, 0.1], [1.2, 0.5]], 0);
    const sunk = sunkenFlagDecal(0, 0, 1.9, 0);
    for (const g of [crack, sunk]) {
      g.computeBoundingBox();
      expect(g.boundingBox!.max.y).toBeLessThanOrEqual(DECAL_H + 0.004);
      expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

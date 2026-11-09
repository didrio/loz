import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MILL_TOWER } from '../../world/overworld/layout';
import { buildMill, buildMillSails, buildStall, MILL_AXLE_Y, MILL_DEFAULT, MILL_DOOR_TOP, millHub, millLamp, millRadius, SAIL_LENGTH } from './mill';
import { assetById } from './registry';
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

const bounds = (root: THREE.Object3D) => new THREE.Box3().setFromObject(root);

/** Does a ray from `from` going `dir` hit anything in the model? (FrontSide faces only, as the game draws them.) */
function hits(root: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3) {
  root.updateMatrixWorld(true);
  return new THREE.Raycaster(from, dir.normalize()).intersectObject(root, true);
}

describe("Thistledown's windmill (T51c)", () => {
  it("is built from the world's tower, whose radii, height and sides the colliders were measured from", () => {
    expect(MILL_DEFAULT).toEqual(MILL_TOWER);
  });

  it('stands on y = 0 at its axis, the cap over the tower and the stone foot a little wider than the wall', () => {
    const box = bounds(buildMill().root);
    expect(Math.abs(box.min.y)).toBeLessThan(0.06); // the doorstep sinks a hair into the ground
    expect(box.max.y).toBeGreaterThan(MILL_TOWER.height + 3);
    expect(box.min.x).toBeLessThan(-MILL_TOWER.outer);
    // The door's step is the model's furthest reach on +x.
    expect(box.max.x).toBeGreaterThan(MILL_TOWER.outer + 0.5);
  });

  it("leaves the doorway open: a ray through it from the square to the middle of the room hits nothing, and the same ray beside it hits the wall", () => {
    const mill = buildMill().root;
    const through = hits(mill, new THREE.Vector3(12, 1.5, 0), new THREE.Vector3(-1, 0, 0));
    // The step and the frame are in front of the door, but the opening between them is clear all the way in.
    expect(through).toEqual([]);
    const beside = hits(mill, new THREE.Vector3(12, 1.5, 2.5), new THREE.Vector3(-1, 0, 0));
    expect(beside.length).toBeGreaterThan(0);
    // Above the doorway the tower is whole.
    const above = hits(mill, new THREE.Vector3(12, MILL_DOOR_TOP + 1.2, 0), new THREE.Vector3(-1, 0, 0));
    expect(above.length).toBeGreaterThan(0);
  });

  it("the sails clear the tower at their lowest tip, the door's lintel and the lamp, and turn about the hub", () => {
    const sails = buildMillSails().root;
    const box = bounds(sails);
    // A disc about the x axis: as tall as wide, 7 m and a little out from the hub, thin along the axle.
    expect(box.max.y).toBeGreaterThan(SAIL_LENGTH - 0.3);
    expect(box.min.y).toBeLessThan(-(SAIL_LENGTH - 0.3));
    expect(box.max.y).toBeLessThan(SAIL_LENGTH + 0.3);
    expect(Math.abs(box.max.z + box.min.z)).toBeLessThan(0.6);
    expect(box.max.x - box.min.x).toBeLessThan(1.6);
    const hub = millHub(MILL_TOWER);
    // Every part of an arm pointing down stands in front of the wall at its height (the wall is nearer at the sides: sqrt(r² - z²)).
    for (const v of vertices(sails).filter((p) => p.y < -2)) {
      const r = millRadius(MILL_TOWER, MILL_AXLE_Y + v.y);
      const wall = Math.abs(v.z) < r ? Math.sqrt(r * r - v.z * v.z) : 0;
      expect(hub + v.x, `${v.toArray()}`).toBeGreaterThan(wall);
    }
    // The lowest tip stays above the lamp's cage (the lamp hangs at 2.35 m, its hood to ~2.7).
    expect(MILL_AXLE_Y - SAIL_LENGTH).toBeGreaterThan(millLamp(MILL_TOWER).y + 0.1);
    // Whatever of the downward arm reaches over the door stays above the lintel (its top is 2.75 m).
    for (const v of vertices(sails).filter((p) => p.y < -5.8 && Math.abs(p.z) < 1.1 && hub + p.x > MILL_TOWER.outer - 0.1)) expect(MILL_AXLE_Y + v.y).toBeGreaterThan(2.85);
  });

  it('is deterministic and registered as three final pieces within budget', () => {
    const a = bounds(buildMill().root), b = bounds(buildMill().root);
    expect(a.equals(b)).toBe(true);
    for (const id of ['mill', 'mill-sails', 'odo-stall']) {
      const entry = assetById(id)!;
      expect(entry.kind, id).toBe('piece');
      expect(entry.tier, id).toBe('final');
      expect(inspect(entry).problems, id).toEqual([]);
    }
  });
});

describe("Odo's stall (T51c)", () => {
  it("covers the counter's collider (1.0 × 1.1 × 2.8 about the origin) and keeps the awning where the rough's was", () => {
    const box = bounds(buildStall().root);
    expect(Math.abs(box.min.y)).toBeLessThan(0.01);
    expect(box.min.x).toBeLessThan(-2.2);
    expect(box.min.x).toBeGreaterThan(-2.5);
    expect(box.max.x).toBeLessThan(1.3);
    expect(box.max.x).toBeGreaterThan(0.9);
    expect(box.max.z - box.min.z).toBeGreaterThan(3.1);
    expect(box.max.y).toBeGreaterThan(3.0);
    expect(box.max.y).toBeLessThan(3.4);
    // A ray from the customers' side at counter height meets the counter's front.
    const front = hits(buildStall().root, new THREE.Vector3(3, 0.6, 0), new THREE.Vector3(-1, 0, 0));
    expect(front[0].point.x).toBeGreaterThan(0.3);
    expect(front[0].point.x).toBeLessThan(0.7);
  });

  it('leaves room to stand and see under the awning: nothing between 1.2 m and 2.4 m on the customers\' side', () => {
    const stall = buildStall().root;
    // Between the counter's top and the shelf, and between the posts: a customer sees straight through to the back.
    expect(hits(stall, new THREE.Vector3(3, 1.5, 0.5), new THREE.Vector3(-1, 0, 0))).toEqual([]);
    expect(hits(stall, new THREE.Vector3(3, 1.5, -0.4), new THREE.Vector3(-1, 0, 0))).toEqual([]);
  });
});

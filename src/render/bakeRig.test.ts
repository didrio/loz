import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeRig } from './bakeRig';
import { bevelBox, kitMesh, paint, place } from './kit';
import { isSharedMaterial, mat, surf, uniqueMat } from './materials';
import { glow } from './shapes';
import { pal } from './palette';
import type { Model } from './models/types';

const mesh = (w: number, m: THREE.Material, x: number, y = 0) => {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, w, w), m);
  me.position.set(x, y, 0);
  return me;
};
const meshes = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => c instanceof THREE.Mesh && out.push(c));
  return out;
};

/** A little creature: a body with two limbs (joints), plain, textured and kit parts, and a glow. */
function creature() {
  const flesh = uniqueMat(pal('clay'));
  const root = new THREE.Group();
  const body = new THREE.Group(), arm = new THREE.Group(), eyes = new THREE.Group();
  body.position.y = 1;
  arm.position.set(0.6, 0.5, 0);
  arm.rotation.z = 0.4;
  body.add(mesh(1, flesh, 0), mesh(0.4, mat(pal('moss')), 0, 0.7), kitMesh(paint(place(bevelBox(0.3, 0.3, 0.3), 0, -0.5, 0), pal('wood')), 'wood'), arm, eyes);
  arm.add(mesh(0.3, flesh, 0.2), mesh(0.3, surf('stone', pal('stone')), 0.5));
  const halo = glow(pal('flame'), 0.5);
  eyes.add(halo, mesh(0.1, mat(pal('chalk', 3)), 0.2, 0.2));
  root.add(body, mesh(0.2, mat(pal('ink')), 2));
  return { root, joints: { body, arm, eyes }, flashMats: [flesh], animated: [halo.material as THREE.Material] } satisfies Model;
}

describe('bakeRig', () => {
  it('merges each joint into one mesh per kind of surface, and keeps the hierarchy', () => {
    const m = creature();
    const before = meshes(m.root).length;
    const baked = bakeRig(m);
    expect(meshes(m.root).length).toBeLessThan(before);
    // body: plain + wood; arm: plain + stone; the root's loose cube: plain; the eyes keep the glow, and the little cube bakes.
    const count = (j: THREE.Object3D) => j.children.filter((c) => c instanceof THREE.Mesh).length;
    expect(count(m.joints.body)).toBe(2);
    expect(count(m.joints.arm)).toBe(2);
    expect(count(m.joints.eyes)).toBe(2); // the glow stays, the cube baked
    expect(count(m.root)).toBe(1);
    expect(m.joints.arm.parent).toBe(m.joints.body);
    expect(m.joints.arm.position.x).toBe(0.6);
    expect(m.joints.arm.rotation.z).toBe(0.4);
    expect(baked.joints).toBe(m.joints);
  });

  it('keeps every part where it was (the bounding box does not move)', () => {
    const m = creature();
    m.root.updateMatrixWorld(true);
    const glowless = (o: THREE.Object3D) => {
      const box = new THREE.Box3();
      for (const me of meshes(o)) if (!(me.material as THREE.Material).transparent) box.union(new THREE.Box3().setFromObject(me));
      return box;
    };
    const before = glowless(m.root);
    bakeRig(m);
    m.root.updateMatrixWorld(true);
    const after = glowless(m.root);
    for (const k of ['x', 'y', 'z'] as const) {
      expect(after.min[k]).toBeCloseTo(before.min[k], 4);
      expect(after.max[k]).toBeCloseTo(before.max[k], 4);
    }
  });

  it('bakes colours into the vertices: a part keeps its own colour, kit colours stay', () => {
    const m = creature();
    bakeRig(m);
    const body = m.joints.body.children.find((c) => c instanceof THREE.Mesh && !(c.material as THREE.Material).userData.surface) as THREE.Mesh;
    expect(body.geometry.attributes.color).toBeDefined();
    const seen = new Set<number>();
    for (let i = 0; i < body.geometry.attributes.color.count; i++) seen.add(new THREE.Color().fromBufferAttribute(body.geometry.attributes.color, i).getHex());
    expect(seen).toEqual(new Set([pal('clay'), pal('moss')]));
    const wood = m.joints.body.children.find((c) => c instanceof THREE.Mesh && (c.material as THREE.Material).userData.surface === 'wood') as THREE.Mesh;
    expect(new THREE.Color().fromBufferAttribute(wood.geometry.attributes.color, 0).getHex()).toBe(pal('wood'));
    expect(wood.geometry.attributes.surfNormal).toBeDefined(); // a textured one still has what the texture reads
  });

  it('gives the baked meshes materials of their own, listed to flash, and a flash is one uniform per material', () => {
    const m = creature();
    const baked = bakeRig(m);
    expect(baked.flashMats.length).toBe(3); // plain, wood, stone
    expect(baked.flashMats).not.toContain(m.flashMats[0]);
    for (const f of baked.flashMats) expect(isSharedMaterial(f)).toBe(false);
    // Every baked mesh wears one of them, and the glow still wears its own.
    const worn = new Set(meshes(m.root).map((me) => me.material));
    for (const f of baked.flashMats) expect(worn.has(f)).toBe(true);
    for (const f of baked.flashMats) f.emissive.setRGB(0.5, 0.5, 0.5);
    expect(baked.flashMats[0].emissive.r).toBe(0.5);
    expect(baked.animated).toBe(m.animated);
  });

  it('shared: true uses the shared kit materials and an empty flash list', () => {
    const baked = bakeRig(creature(), { shared: true });
    expect(baked.flashMats).toEqual([]);
    expect(baked.flashMats.length).toBe(0);
  });

  it('leaves glows, a joint that is itself a mesh, and other-joint parts alone', () => {
    const root = new THREE.Group();
    const slab = mesh(1, mat(pal('stone')), 0);
    slab.add(mesh(0.2, mat(pal('ink')), 0.3));
    const other = new THREE.Group();
    other.add(mesh(0.2, mat(pal('moss')), 1), mesh(0.2, mat(pal('moss')), 1.3));
    root.add(slab, other);
    const baked = bakeRig({ root, joints: { slab, other }, flashMats: [] });
    expect(slab.children.length).toBe(1); // untouched
    expect(other.children.length).toBe(1);
    expect(baked.flashMats.length).toBe(1);
  });

  it('keeps a flash material that still colours an unbaked mesh', () => {
    const root = new THREE.Group();
    const flash = uniqueMat(pal('clay'));
    const slab = mesh(1, flash, 0);
    root.add(slab);
    expect(bakeRig({ root, joints: { slab }, flashMats: [flash] }).flashMats).toEqual([flash]);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { surf, uniqueMat } from '../materials';
import { originalOf, smoothMeshes, swapMaterials, syncTwins, twinOf } from './modernLook';

describe('modern lighting twins (T62)', () => {
  it('a twin keeps the colour, paint, texture patch and transparency of its Lambert original', () => {
    const m = new THREE.MeshLambertMaterial({ color: 0x806040, vertexColors: true, transparent: true, opacity: 0.5, flatShading: true });
    const t = twinOf(m);
    expect(t).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(t.color.getHex()).toBe(m.color.getHex());
    expect(t.vertexColors).toBe(true);
    expect(t.transparent).toBe(true);
    expect(t.opacity).toBe(0.5);
    expect(t.flatShading).toBe(true);
    expect(t.metalness).toBe(0);
    expect(twinOf(m)).toBe(t); // one twin per original
    expect(originalOf(t)).toBe(m);

    const stone = surf('stone', 0x808080);
    const ts = twinOf(stone);
    expect(ts.onBeforeCompile).toBe(stone.onBeforeCompile);
    expect(ts.customProgramCacheKey()).toBe('surface');
    expect(ts.userData.surface).toBe('stone');
  });

  it('metal reads as metal', () => {
    expect(twinOf(surf('metal', 0x404040)).metalness).toBeGreaterThan(0.5);
  });

  it('what game code changes on an original reaches its twin (a hit flash, a fade)', () => {
    const m = uniqueMat(0x806040);
    const t = twinOf(m);
    m.emissive.setRGB(1, 0, 0);
    expect(t.emissive.r).toBe(1);
    m.transparent = true;
    m.opacity = 0.3;
    syncTwins();
    expect(t.transparent).toBe(true);
    expect(t.opacity).toBe(0.3);
  });

  it('swapping and swapping back gives every mesh its own material again', () => {
    const root = new THREE.Group();
    const lambert = new THREE.MeshLambertMaterial({ color: 0x336699 });
    const basic = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const a = new THREE.Mesh(new THREE.BoxGeometry(), lambert);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), basic);
    root.add(a, b);
    swapMaterials(root, true);
    expect(a.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(b.material).toBe(basic); // glows stay as they are
    swapMaterials(root, false);
    expect(a.material).toBe(lambert);
    expect(b.material).toBe(basic);
  });
});

describe('smooth shading (T62)', () => {
  it('welds faceted normals, then gives back exactly the ones it took', () => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed();
    g.computeVertexNormals(); // non-indexed: flat, one normal per face
    const before = Float32Array.from(g.attributes.normal.array);
    const m = new THREE.MeshLambertMaterial({ flatShading: true });
    const root = new THREE.Group().add(new THREE.Mesh(g, m));
    smoothMeshes(root, true);
    expect(m.flatShading).toBe(false);
    expect(Array.from(g.attributes.normal.array)).not.toEqual(Array.from(before));
    smoothMeshes(root, false);
    expect(m.flatShading).toBe(true);
    expect(Array.from(g.attributes.normal.array)).toEqual(Array.from(before));
  });

  it('keeps a box faceted: its 90° edges are past the crease', () => {
    const g = new THREE.BoxGeometry().toNonIndexed();
    const before = Array.from(g.attributes.normal.array);
    const root = new THREE.Group().add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ flatShading: true })));
    smoothMeshes(root, true);
    const after = Array.from(g.attributes.normal.array);
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i], 5));
    smoothMeshes(root, false);
  });
});

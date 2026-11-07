import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HOLLOW } from './atmosphere';
import { Motes, wrapAround } from './motes';

describe('wrapAround', () => {
  it('keeps a value within half a span of the center, in either direction', () => {
    expect(wrapAround(30, 0, 40)).toBeCloseTo(-10);
    expect(wrapAround(-30, 0, 40)).toBeCloseTo(10);
    expect(wrapAround(105, 100, 40)).toBeCloseTo(105);
    expect(wrapAround(150, 100, 40)).toBeCloseTo(110);
  });
});

describe('Motes', () => {
  const points = (scene: THREE.Scene) => scene.children[0] as THREE.Points;

  it('draws nothing in clear air, and what the preset says otherwise', () => {
    const scene = new THREE.Scene();
    const motes = new Motes(scene, 100);
    motes.update(0.1, new THREE.Vector3(), null);
    expect(points(scene).visible).toBe(false);
    motes.update(0.1, new THREE.Vector3(), { preset: HOLLOW.motes!, level: 0.5 });
    const p = points(scene), m = p.material as THREE.PointsMaterial;
    expect(p.visible).toBe(true);
    expect(m.opacity).toBeCloseTo(HOLLOW.motes!.opacity * 0.5);
    expect(m.size).toBe(HOLLOW.motes!.size);
    expect(p.geometry.drawRange.count).toBe(30); // the hollow's density is 0.3
  });

  it('rises when the preset falls upward, and falls when it falls down', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // one mote, mid-air, speed 1
    const scene = new THREE.Scene();
    const motes = new Motes(scene, 1);
    vi.restoreAllMocks();
    const y = () => (points(scene).geometry.attributes.position.array as Float32Array)[1];
    const focus = new THREE.Vector3();
    const go = (fall: number) => motes.update(0.5, focus, { preset: { ...HOLLOW.motes!, fall }, level: 1 });
    go(0);
    const start = y();
    go(-2);
    expect(y()).toBeCloseTo(start + 1);
    go(2);
    expect(y()).toBeCloseTo(start);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Sky } from './sky';

function skyAt(hours: number, blight: number) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 1, 2);
  const sky = new Sky(scene);
  sky.blight = blight;
  sky.update(hours, new THREE.Vector3(), new THREE.Vector3());
  return { sky, fog: scene.fog as THREE.Fog };
}

describe('Sky blight', () => {
  it('pulls the fog in and turns it violet, by day and by night', () => {
    for (const hours of [12, 0]) {
      const clear = skyAt(hours, 0), sick = skyAt(hours, 1);
      expect(sick.fog.far).toBeLessThan(clear.fog.far);
      expect(sick.fog.color.b).toBeGreaterThan(sick.fog.color.g);
    }
  });

  it('does nothing at level 0', () => {
    expect(skyAt(12, 0).fog.far).toBe(290);
  });
});

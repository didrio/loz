import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Sky, retroHaze } from './sky';

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
    expect(skyAt(12, 0).fog.far).toBe(215);
  });
});

describe('Sky retro haze', () => {
  function withRetro(hours: number, retro: number) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0, 1, 2);
    const sky = new Sky(scene);
    sky.retro = retro;
    sky.update(hours, new THREE.Vector3(), new THREE.Vector3());
    return scene.fog as THREE.Fog;
  }

  it('is thicker and warmer with the look on, and does nothing off', () => {
    const off = withRetro(12, 0), on = withRetro(12, 1);
    expect(off.far).toBe(215);
    expect(on.far).toBeLessThan(off.far);
    expect(on.near).toBeLessThan(off.near);
    expect(on.color.r - on.color.b).toBeGreaterThan(off.color.r - off.color.b);
  });

  it('keeps the fog the colour of the horizon the sky is drawn with', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0, 1, 2);
    const sky = new Sky(scene);
    sky.retro = 1;
    for (const hours of [6, 12, 18, 23]) {
      sky.update(hours, new THREE.Vector3(), new THREE.Vector3());
      const horizon = (sky as unknown as { uniforms: { horizon: { value: THREE.Color } } }).uniforms.horizon.value;
      expect((scene.fog as THREE.Fog).color.getHex()).toBe(horizon.getHex());
    }
  });

  it('warms less at night and not at all in the blight', () => {
    expect(retroHaze(1, 1, 0).warm).toBeLessThan(retroHaze(1, 0, 0).warm);
    expect(retroHaze(1, 0, 1).warm).toBe(0);
    expect(retroHaze(0, 0, 0)).toEqual({ warm: 0, reach: 1 });
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DISPLAY_N64, DISPLAY_NATIVE, DISPLAY_PERFORMANCE } from './retro';
import { blobConfig } from './shapes';
import { castsShadow, receivesShadow, ShadowRig, SHADOW_RADIUS, shadowIntensity, shadowMapSize, shadowMapType, snapToTexel } from './shadows';

const box = new THREE.BoxGeometry(1, 1, 1);

describe('which meshes cast and receive', () => {
  it('solid lit surfaces do both', () => {
    const m = new THREE.Mesh(box, new THREE.MeshLambertMaterial());
    expect(castsShadow(m)).toBe(true);
    expect(receivesShadow(m)).toBe(true);
  });

  it('glows, glass, blobs and the sky cast nothing and take nothing', () => {
    const glow = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ transparent: true }));
    const sky = new THREE.Mesh(box, new THREE.ShaderMaterial());
    expect(castsShadow(glow) || receivesShadow(glow)).toBe(false);
    expect(castsShadow(sky) || receivesShadow(sky)).toBe(false);
    expect(castsShadow(new THREE.Points())).toBe(false);
  });

  it('see-through lit surfaces take a shadow but do not throw one; noShadow opts out of both', () => {
    const water = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.5 }));
    expect(castsShadow(water)).toBe(false);
    expect(receivesShadow(water)).toBe(true);
    const skipped = new THREE.Mesh(box, new THREE.MeshLambertMaterial());
    skipped.userData.noShadow = true;
    expect(castsShadow(skipped) || receivesShadow(skipped)).toBe(false);
  });
});

describe('the map', () => {
  it('is coarse and unfiltered in N64, finer and filtered elsewhere', () => {
    expect(shadowMapSize(DISPLAY_N64)).toBeLessThan(shadowMapSize(DISPLAY_PERFORMANCE));
    expect(shadowMapSize(DISPLAY_PERFORMANCE)).toBeLessThan(shadowMapSize(DISPLAY_NATIVE));
    expect(shadowMapType(DISPLAY_N64)).toBe(THREE.BasicShadowMap);
    expect(shadowMapType(DISPLAY_NATIVE)).toBe(THREE.PCFShadowMap);
  });

  it('fades out with a low sun and is gone at the horizon', () => {
    expect(shadowIntensity(-0.3)).toBe(0);
    expect(shadowIntensity(0.01)).toBe(0);
    expect(shadowIntensity(0.1)).toBeGreaterThan(0);
    expect(shadowIntensity(0.1)).toBeLessThan(1);
    expect(shadowIntensity(0.8)).toBe(1);
  });
});

describe('snapToTexel', () => {
  const texel = (SHADOW_RADIUS * 2) / 2048;
  const dir = new THREE.Vector3(0.5, 0.8, 0.35).normalize();

  it('puts the target on a whole texel in the sun camera, without changing the direction', () => {
    const t = new THREE.Vector3(12.345, 3.2, -48.77);
    const shift = snapToTexel(t, dir, texel);
    expect(shift.length()).toBeLessThan(texel * 1.5);
    expect(shift.dot(dir)).toBeCloseTo(0, 6); // sideways only
    t.add(shift);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const x = t.dot(right) / texel;
    expect(x).toBeCloseTo(Math.round(x), 4);
  });

  it('keeps a shadow edge still while Wren walks less than half a texel', () => {
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const base = new THREE.Vector3(10, 0, 10);
    base.add(snapToTexel(base, dir, texel)); // on the grid
    const a = base.clone().addScaledVector(right, texel * 0.1);
    const b = base.clone().addScaledVector(right, texel * 0.4).addScaledVector(up, -texel * 0.3);
    const snapA = a.clone().add(snapToTexel(a, dir, texel));
    const snapB = b.clone().add(snapToTexel(b, dir, texel));
    expect(snapA.distanceTo(snapB)).toBeLessThan(1e-6);
  });
});

describe('ShadowRig', () => {
  function rig() {
    const renderer = { shadowMap: { enabled: false, type: THREE.PCFShadowMap } } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight();
    sun.position.set(30, 90, 20);
    scene.add(sun, sun.target);
    const wall = new THREE.Mesh(box, new THREE.MeshLambertMaterial());
    const glow = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ transparent: true }));
    scene.add(wall, glow);
    return { r: new ShadowRig(renderer, scene, sun), renderer, sun, wall, glow };
  }

  it('does nothing while Shadows is off', () => {
    const { r, renderer, sun, wall } = rig();
    r.configure(false, DISPLAY_NATIVE);
    r.update(1, false);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(sun.castShadow).toBe(false);
    expect(wall.castShadow).toBe(false);
    expect(blobConfig.realShadows).toBe(false);
  });

  it('on and outdoors: the sun casts, scenery is flagged, blobs give way', () => {
    const { r, renderer, sun, wall, glow } = rig();
    try {
      r.configure(true, DISPLAY_NATIVE);
      r.update(0.016, false);
      expect(renderer.shadowMap.enabled).toBe(true);
      expect(sun.castShadow).toBe(true);
      expect(wall.castShadow && wall.receiveShadow).toBe(true);
      expect(glow.castShadow || glow.receiveShadow).toBe(false);
      expect(blobConfig.realShadows).toBe(true);
    } finally {
      r.configure(false, DISPLAY_NATIVE);
    }
  });

  it('indoors the map is off and the blobs stay', () => {
    const { r, sun } = rig();
    r.configure(true, DISPLAY_NATIVE);
    r.update(0.016, true);
    expect(sun.castShadow).toBe(false);
    expect(blobConfig.realShadows).toBe(false);
    r.configure(false, DISPLAY_NATIVE);
  });

  it('shifts the sun and its target together onto the texel grid, so the beam is unchanged', () => {
    const { r, sun } = rig();
    sun.target.position.set(10.123, 0, 7.456);
    sun.position.copy(sun.target.position).add(new THREE.Vector3(30, 90, 20));
    const before = sun.position.clone().sub(sun.target.position);
    r.configure(true, DISPLAY_NATIVE);
    r.update(0.016, false);
    expect(sun.position.clone().sub(sun.target.position).distanceTo(before)).toBeLessThan(1e-6);
    r.configure(false, DISPLAY_NATIVE);
  });

  it('picks up meshes added later (an enemy spawning) within a moment', () => {
    const { r, sun } = rig();
    r.configure(true, DISPLAY_NATIVE);
    r.update(0.016, false);
    const scene = sun.parent as THREE.Scene;
    const enemy = new THREE.Mesh(box, new THREE.MeshLambertMaterial());
    scene.add(enemy);
    expect(enemy.castShadow).toBe(false);
    r.update(0.3, false);
    expect(enemy.castShadow).toBe(true);
    r.configure(false, DISPLAY_NATIVE);
  });
});

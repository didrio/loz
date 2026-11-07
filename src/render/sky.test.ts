import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLIGHT_ASH, HOLLOW, SHRINE, VILLAGE } from './atmosphere';
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
    expect(skyAt(12, 0).fog.far).toBe(215);
  });
});

describe('Sky atmosphere', () => {
  function setup() {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0, 1, 2);
    const sky = new Sky(scene);
    const update = (hours = 12, dt = 1 / 60) => sky.update(hours, new THREE.Vector3(), new THREE.Vector3(), dt);
    return { sky, fog: scene.fog as THREE.Fog, update };
  }

  it('eases from the valley\'s fog to the hollow\'s over a couple of seconds, not at once', () => {
    const { sky, fog, update } = setup();
    update();
    expect(fog.far).toBe(215);
    sky.setAtmosphere('hollow');
    update(12, 0.1);
    expect(fog.far).toBeLessThan(215);
    expect(fog.far).toBeGreaterThan(HOLLOW.fog.far);
    for (let i = 0; i < 200; i++) update(12, 0.05);
    expect(fog.far).toBe(HOLLOW.fog.far);
  });

  it('jumps straight there when asked to snap (a new area)', () => {
    const { sky, fog, update } = setup();
    sky.setAtmosphere('village', true);
    update();
    expect(fog.far).toBe(VILLAGE.fog.far);
  });

  it('keeps the blight and a boss\'s gloom as modifiers on whichever place is blended', () => {
    const { sky, fog, update } = setup();
    sky.setAtmosphere('hollow', true);
    update();
    const clear = fog.far;
    sky.gloom = 1;
    update();
    expect(fog.far).toBeLessThan(clear * 0.4);
    sky.gloom = 0;
    sky.blight = 1;
    update();
    expect(fog.far).toBeLessThan(clear * 0.6);
  });

  it('reports the motes of the place it is in, and the ash over them while the blight lies', () => {
    const { sky, update } = setup();
    expect(sky.moteLook()).toBeNull();
    sky.setAtmosphere('hollow', true);
    expect(sky.moteLook()?.preset).toBe(HOLLOW.motes);
    sky.blight = 1;
    expect(sky.moteLook()?.preset).toBe(BLIGHT_ASH);
    sky.blight = 0;
    sky.setIndoor(true);
    sky.setAtmosphere('shrine');
    update();
    expect(sky.moteLook()?.preset).toBe(SHRINE.motes);
  });

  it('lights a shrine room from the shrine\'s fill', () => {
    const { sky, update } = setup();
    sky.setIndoor(true);
    sky.setAtmosphere('shrine');
    update();
    expect(sky.sun.intensity).toBe(SHRINE.fill.sunI);
    expect(sky.sun.color.getHex()).toBe(new THREE.Color(SHRINE.fill.sun).getHex());
  });
});

describe('Sky fog', () => {
  it('keeps the fog the colour of the horizon the sky is drawn with', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0, 1, 2);
    const sky = new Sky(scene);
    for (const hours of [6, 12, 18, 23]) {
      sky.update(hours, new THREE.Vector3(), new THREE.Vector3());
      const horizon = (sky as unknown as { uniforms: { horizon: { value: THREE.Color } } }).uniforms.horizon.value;
      expect((scene.fog as THREE.Fog).color.getHex()).toBe(horizon.getHex());
    }
  });
});

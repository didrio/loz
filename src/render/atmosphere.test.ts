import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERES, BLIGHT_ASH, blendLight, easeWeights, HOLLOW, isIndoor, moteLook, SHRINE, VALLEY, VILLAGE, type AtmosphereId, type OutdoorId } from './atmosphere';
import { AREA_PALETTES, pal } from './palette';

const OUTDOOR: OutdoorId[] = ['valley', 'village', 'hollow'];

describe('atmospheres as data', () => {
  it('give every place a sub-palette that exists', () => {
    for (const a of Object.values(ATMOSPHERES)) expect(AREA_PALETTES[a.look]).toBeDefined();
  });

  it('lay their light keys on the clock from midnight round to midnight, in order', () => {
    for (const id of OUTDOOR) {
      const keys = (ATMOSPHERES[id] as typeof VALLEY).keys;
      expect(keys[0].h).toBe(0);
      expect(keys[keys.length - 1].h).toBe(24);
      for (let i = 1; i < keys.length; i++) expect(keys[i].h).toBeGreaterThanOrEqual(keys[i - 1].h);
      expect(keys[0].horizon).toBe(keys[keys.length - 1].horizon); // midnight is midnight on both ends
    }
  });

  it('tells indoor places from outdoor ones', () => {
    expect(isIndoor('shrine')).toBe(true);
    for (const id of OUTDOOR) expect(isIndoor(id)).toBe(false);
  });

  it('gives the hollow a closer fog than the valley, and the village a warmer noon horizon', () => {
    expect(HOLLOW.fog.far).toBeLessThan(VALLEY.fog.far);
    const noon = (a: typeof VALLEY) => new THREE.Color(a.keys[3].horizon);
    expect(noon(VILLAGE).r - noon(VILLAGE).b).toBeGreaterThan(noon(VALLEY).r - noon(VALLEY).b);
  });
});

describe('blendLight', () => {
  it('is exactly the valley\'s old day: noon sky, 50/215 fog, full sun', () => {
    const l = blendLight({ valley: 1 }, 12);
    expect(l.horizon.getHex()).toBe(new THREE.Color(pal('sky', 3)).getHex());
    expect(l.top.getHex()).toBe(new THREE.Color(pal('sky', 1)).getHex());
    expect([l.near, l.far, l.sunI, l.hemiI]).toEqual([50, 215, 2.6, 1.12]);
  });

  it('interpolates between keys and wraps midnight without a jump', () => {
    const dusk = blendLight({ valley: 1 }, 18.65).sunI;
    expect(dusk).toBeGreaterThan(0.8);
    expect(dusk).toBeLessThan(1.3);
    const a = blendLight({ village: 1 }, 23.999).horizon, b = blendLight({ village: 1 }, 0).horizon;
    expect(a.getHex()).toBe(b.getHex());
  });

  it('mixes places by weight, and the weights need not add to 1', () => {
    const half = blendLight({ valley: 0.5, hollow: 0.5 }, 12);
    expect(half.far).toBeCloseTo((VALLEY.fog.far + HOLLOW.fog.far) / 2);
    const doubled = blendLight({ valley: 1, hollow: 1 }, 12);
    expect(doubled.far).toBeCloseTo(half.far);
    expect(doubled.sunI).toBeCloseTo(half.sunI);
  });

  it('falls back to the valley with no weights', () => {
    expect(blendLight({}, 12).far).toBe(VALLEY.fog.far);
  });
});

describe('easeWeights', () => {
  it('moves toward the target and always sums to 1', () => {
    let w = easeWeights({ valley: 1 }, 'hollow', 0.1);
    for (let i = 0; i < 20; i++) {
      expect(Object.values(w).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
      const before = w.hollow ?? 0;
      w = easeWeights(w, 'hollow', 0.1);
      expect(w.hollow!).toBeGreaterThan(before);
    }
  });

  it('settles on the target alone, and stays put once there', () => {
    let w: ReturnType<typeof easeWeights> = { valley: 1 };
    for (let i = 0; i < 200; i++) w = easeWeights(w, 'village', 0.05);
    expect(w).toEqual({ village: 1 });
    expect(easeWeights(w, 'village', 0.05)).toEqual({ village: 1 });
  });

  it('takes about two seconds to cross', () => {
    let w: ReturnType<typeof easeWeights> = { valley: 1 };
    for (let t = 0; t < 2; t += 0.05) w = easeWeights(w, 'hollow', 0.05);
    expect(w.hollow).toBeGreaterThan(0.9);
  });
});

describe('moteLook', () => {
  it('is clear air in the valley and the village', () => {
    expect(moteLook({ valley: 1 }, 0, null)).toBeNull();
    expect(moteLook({ village: 1 }, 0, null)).toBeNull();
  });

  it('shows the hollow\'s lights once Wren is mostly in it, fading in across the second half of the crossing', () => {
    expect(moteLook({ valley: 0.5, hollow: 0.5 }, 0, null)).toBeNull();
    expect(moteLook({ valley: 0.2, hollow: 0.8 }, 0, null)?.level).toBeCloseTo(0.6);
    expect(moteLook({ hollow: 1 }, 0, null)).toEqual({ preset: HOLLOW.motes, level: 1 });
  });

  it('lets the blight\'s ash win outdoors, at the blight\'s strength', () => {
    expect(moteLook({ hollow: 1 }, 0.4, null)).toEqual({ preset: BLIGHT_ASH, level: 0.4 });
  });

  it('is the room\'s own dust indoors, whatever the weights', () => {
    expect(moteLook({ valley: 1 }, 1, SHRINE)).toEqual({ preset: SHRINE.motes, level: 1 });
  });
});

describe('every id', () => {
  it('has an atmosphere', () => {
    for (const id of ['valley', 'village', 'hollow', 'shrine'] as AtmosphereId[]) expect(ATMOSPHERES[id]).toBeDefined();
  });
});

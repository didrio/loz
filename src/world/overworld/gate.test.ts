import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics, SOLID } from '../../core/physics';
import { AreaBuilder } from '../area';
import { Gate } from './gate';
import { GATE, inGate, terrainHeight } from './layout';
import { SIGNS } from './landmarks';

beforeAll(async () => {
  await initPhysics();
});

/** How far a ray from the field side of the gate, aimed north through the middle of the opening, travels before it hits something. */
function reach(physics: Physics, x = GATE.x) {
  physics.refreshQueries();
  const y = terrainHeight(x, GATE.z) + 1.5;
  return physics.rayDistance(new THREE.Vector3(x, y, GATE.z + 5), new THREE.Vector3(0, 0, -1), 20, SOLID);
}

describe('the magic gate', () => {
  it('is a wall while the ward holds, and lets Wren through once it breaks', () => {
    const physics = new Physics();
    const gate = new Gate(new AreaBuilder(physics, () => 0.5));
    expect(gate.isOpen).toBe(false);
    expect(reach(physics)).toBeLessThan(6);
    gate.open();
    expect(gate.isOpen).toBe(true);
    expect(gate.settled).toBe(false);
    expect(reach(physics)).toBeGreaterThan(19.9);
    for (let i = 0; i < 60 * 8 && !gate.settled; i++) gate.update(1 / 60);
    expect(gate.settled).toBe(true);
  });

  it('has no way around it: the ground either side of the pillars is walled off to the rim, ward broken or not', () => {
    const physics = new Physics();
    const gate = new Gate(new AreaBuilder(physics, () => 0.5));
    // Rays north from the field side, at the height of a walker and of someone on a hill, all along the line.
    const blockedAt = (x: number, y: number) => {
      physics.refreshQueries();
      return physics.rayDistance(new THREE.Vector3(x, y, GATE.z + 5), new THREE.Vector3(0, 0, -1), 20, SOLID) < 6;
    };
    const sides = [-120, -60, -20, GATE.x - GATE.halfOpening - 3, GATE.x + GATE.halfOpening + 3, 20, 60, 120];
    for (const open of [false, true]) {
      if (open) gate.open();
      for (const x of sides) for (const up of [1.5, 20, 60]) expect(blockedAt(x, terrainHeight(x, GATE.z) + up), `x=${x} up=${up} open=${open}`).toBe(true);
    }
  });

  it('has rock rising right against both pillars, leaving the opening and the sign\'s ground alone', () => {
    const edge = GATE.halfOpening + 0.8 + 0.85; // the pillars' outer faces
    const floor = terrainHeight(GATE.x, GATE.z);
    for (const side of [-1, 1]) {
      for (const dz of [-1.5, 0, 1.5]) {
        expect(terrainHeight(GATE.x + side * (edge + 2.5), GATE.z + dz) - floor, `side ${side} dz ${dz}`).toBeGreaterThan(7);
        expect(terrainHeight(GATE.x + side * (edge + 0.3), GATE.z + dz) - floor).toBeGreaterThan(1); // no person-wide gap
      }
      expect(Math.abs(terrainHeight(GATE.x + side * GATE.halfOpening, GATE.z) - floor)).toBeLessThan(0.3); // the opening stays level
    }
    const sign = SIGNS.find((s) => s.id === 'sign.gate')!;
    expect(inGate(sign.x, sign.z)).toBe(false);
    expect(terrainHeight(sign.x, sign.z) - terrainHeight(GATE.x + 4, GATE.z + 14)).toBeLessThan(1.5); // not buried in a shoulder
  });

  it('keeps its pillars solid after the ward breaks, and restores already broken', () => {
    const physics = new Physics();
    const gate = new Gate(new AreaBuilder(physics, () => 0.5));
    gate.setOpen();
    expect(gate.settled).toBe(true);
    expect(reach(physics)).toBeGreaterThan(19.9);
    expect(reach(physics, GATE.x + GATE.halfOpening + 0.8)).toBeLessThan(6); // the pillar
  });

  it('clears scenery from its arch and the ground before it', () => {
    expect(inGate(GATE.x, GATE.z)).toBe(true);
    expect(inGate(GATE.x, GATE.z + 6)).toBe(true);
    expect(inGate(GATE.x + 30, GATE.z)).toBe(false);
  });
});

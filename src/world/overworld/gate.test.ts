import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics, SOLID } from '../../core/physics';
import { AreaBuilder } from '../area';
import { Gate } from './gate';
import { GATE, inGate, terrainHeight } from './layout';

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

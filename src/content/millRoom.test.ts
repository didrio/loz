import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { Overworld } from '../world/overworld';
import { fakeApi } from './fakeApi';
import { overworldContent } from './overworld';
import { wakeHour } from './village';
import { Layer } from '../core/physics';
import * as THREE from 'three';
import { MILL, MILL_TOWER, terrainHeight } from '../world/overworld/layout';

beforeAll(async () => {
  await initPhysics();
});

describe('wakeHour', () => {
  it('is the next 06:00 or 18:00', () => {
    expect(wakeHour(9)).toBe(18);
    expect(wakeHour(17.9)).toBe(18);
    expect(wakeHour(18)).toBe(6);
    expect(wakeHour(23)).toBe(6);
    expect(wakeHour(2)).toBe(6);
    expect(wakeHour(6)).toBe(18);
  });
});

describe('Tobin, the mill door and Odo', () => {
  let physics: Physics;
  let ow: Overworld;
  beforeAll(() => {
    physics = new Physics();
    ow = new Overworld(physics);
    physics.refreshQueries();
  });

  it('has a script for the mill door and the bed', () => {
    const { scripts } = overworldContent(ow);
    for (const id of ['door.mill', 'bed.mill', 'door.home0', 'door.home1']) {
      expect(ow.interactables.some((it) => it.id === id), id).toBe(true);
      expect(scripts[id], id).toBeTypeOf('function');
    }
  });

  it('sleeping heals fully and moves the clock to the next 06:00 / 18:00; declining changes nothing', async () => {
    const { api, state, answers } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    state.hp = 1;
    state.hours = 10;
    answers.push(1); // Not now
    await scripts['bed.mill'](api);
    expect(state.hp).toBe(1);
    expect(state.hours).toBe(10);
    answers.push(0);
    await scripts['bed.mill'](api);
    expect(state.hp).toBe(state.maxHp);
    expect(state.hours).toBe(18);
    state.hp = 2;
    answers.push(0);
    await scripts['bed.mill'](api);
    expect(state.hours).toBe(6);
    expect(state.day).toBe(2);
    expect(state.hp).toBe(state.maxHp);
  });

  it('the cottages\' doors are locked, with no word of a key', async () => {
    const { api, said } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    for (const id of ['door.home0', 'door.home1']) {
      await scripts[id](api);
      expect(said.at(-1)!.text).toContain('locked');
      expect(said.at(-1)!.text.toLowerCase()).not.toContain('key');
    }
  });

  it('Tobin gives the mill key once Wren has the sword, and only once', async () => {
    const { api, state, said } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    state.set('gotGroveKey');
    await scripts['npc.tobin'](api);
    expect(state.has('village.millKey')).toBe(false);
    state.set('hasSword');
    await scripts['npc.tobin'](api);
    expect(state.has('village.millKey')).toBe(true);
    const n = said.length;
    await scripts['npc.tobin'](api);
    expect(said.slice(n).some((p) => p.text.includes('Mill Key'))).toBe(false);
  });

  it('the mill door is locked until then; after, it opens and shuts where it stands (no loading)', async () => {
    const { api, state, travels, said } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    // A ray at waist height from the doorstep, straight in through the doorway toward the bed.
    const y = terrainHeight(MILL.x, MILL.z) + 1;
    const from = new THREE.Vector3(MILL.x + MILL_TOWER.outer + 1, y, MILL.z);
    const inward = new THREE.Vector3(-1, 0, 0);
    const reach = () => {
      physics.refreshQueries();
      return physics.rayDistance(from, inward, 10, Layer.World);
    };
    expect(reach()).toBeLessThan(2); // the shut door
    await scripts['door.mill'](api);
    expect(said.at(-1)!.text).toContain('locked');
    expect(ow.millDoor.open).toBe(false);
    state.set('village.millKey');
    await scripts['door.mill'](api);
    expect(ow.millDoor.open).toBe(true);
    expect(reach()).toBeGreaterThan(4); // through the doorway, into the room
    await scripts['door.mill'](api);
    expect(ow.millDoor.open).toBe(false);
    expect(reach()).toBeLessThan(2);
    expect(travels).toEqual([]);
  });

  it('Odo sells the Stoneward Tunic for 50 gems, once', async () => {
    const { api, state, answers } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    state.gems = 49;
    answers.push(0);
    await scripts['npc.odo'](api);
    expect(state.has('village.stonewardTunic')).toBe(false);
    expect(state.gems).toBe(49);
    state.gems = 130;
    answers.push(1); // Not now
    await scripts['npc.odo'](api);
    expect(state.has('village.stonewardTunic')).toBe(false);
    expect(state.gems).toBe(130);
    answers.push(0);
    await scripts['npc.odo'](api);
    expect(state.has('village.stonewardTunic')).toBe(true);
    expect(state.gems).toBe(80);
    await scripts['npc.odo'](api); // already owned: no choice, no charge
    expect(state.gems).toBe(80);
  });

  it('Odo fills one empty flask at a time, 20 gems, with the potion Wren picks', async () => {
    const { api, state, answers, asked, said } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    state.set('village.stonewardTunic');
    // No flasks, or all full: nothing to sell, no choice.
    await scripts['npc.odo'](api);
    state.flasks.add('life');
    await scripts['npc.odo'](api);
    expect(asked).toHaveLength(0);
    state.flasks.add('attack');
    state.flasks.drink(0);
    state.flasks.drink(1);
    state.gems = 19;
    answers.push(1);
    await scripts['npc.odo'](api);
    expect(asked.at(-1)!.options).toEqual(['Life Potion (20 gems)', 'Attack Potion (20 gems)', 'Not now']);
    expect(said.at(-1)!.text).toContain('short');
    expect(state.flasks.slots).toEqual([null, null]);
    state.gems = 45;
    answers.push(1, 1); // attack, then attack again: both flasks the same potion
    await scripts['npc.odo'](api);
    await scripts['npc.odo'](api);
    expect(state.flasks.slots).toEqual(['attack', 'attack']);
    expect(state.gems).toBe(5);
  });

  it('Odo offers the tunic and a refill together, until the tunic is bought', async () => {
    const { api, state, answers, asked } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    state.flasks.add('life');
    state.flasks.drink(0);
    state.gems = 120;
    answers.push(1); // Life Potion
    await scripts['npc.odo'](api);
    expect(asked.at(-1)!.options).toEqual(['Stoneward Tunic (50 gems)', 'Life Potion (20 gems)', 'Attack Potion (20 gems)', 'Not now']);
    expect(state.flasks.slots).toEqual(['life']);
    answers.push(0);
    await scripts['npc.odo'](api);
    expect(state.has('village.stonewardTunic')).toBe(true);
    expect(state.gems).toBe(50);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { MillInterior } from '../world/interior';
import { Overworld } from '../world/overworld';
import { fakeApi } from './fakeApi';
import { millContent, wakeHour } from './mill';
import { overworldContent } from './overworld';

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

describe('the mill', () => {
  let physics: Physics;
  beforeAll(() => {
    physics = new Physics();
  });

  it('has a script for every interactable and trigger', () => {
    const area = new MillInterior(physics);
    const { scripts } = millContent(area);
    for (const it of [...area.interactables, ...area.triggers]) expect(scripts[it.id], it.id).toBeTypeOf('function');
    area.dispose();
  });

  it('sleeping heals fully and moves the clock to the next 06:00 / 18:00; declining changes nothing', async () => {
    const area = new MillInterior(physics);
    const { api, state, answers } = fakeApi(area, physics);
    const { scripts } = millContent(area);
    state.hp = 1;
    state.hours = 10;
    answers.push(1); // Not now
    await scripts.bed(api);
    expect(state.hp).toBe(1);
    expect(state.hours).toBe(10);
    answers.push(0);
    await scripts.bed(api);
    expect(state.hp).toBe(state.maxHp);
    expect(state.hours).toBe(18);
    state.hp = 2;
    answers.push(0);
    await scripts.bed(api);
    expect(state.hours).toBe(6);
    expect(state.day).toBe(2);
    expect(state.hp).toBe(state.maxHp);
    area.dispose();
  });

  it('the exit leads back to the village', async () => {
    const area = new MillInterior(physics);
    const { api, travels } = fakeApi(area, physics);
    await millContent(area).scripts.exit(api);
    expect(travels).toEqual([{ area: 'overworld', entrance: 'mill' }]);
    area.dispose();
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

  it('the overworld has a mill entrance to come back to', () => {
    expect(ow.entrances.mill).toBeDefined();
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

  it('the mill door is locked until then', async () => {
    const { api, state, travels, said } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    await scripts['door.mill'](api);
    expect(travels).toEqual([]);
    expect(said.at(-1)!.text).toContain('locked');
    state.set('village.millKey');
    await scripts['door.mill'](api);
    expect(travels).toEqual([{ area: 'mill', entrance: undefined }]);
  });

  it('Odo sells the Stoneward Tunic for 100 gems, once', async () => {
    const { api, state, answers } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    state.gems = 99;
    answers.push(0);
    await scripts['npc.odo'](api);
    expect(state.has('village.stonewardTunic')).toBe(false);
    expect(state.gems).toBe(99);
    state.gems = 130;
    answers.push(1); // Not now
    await scripts['npc.odo'](api);
    expect(state.has('village.stonewardTunic')).toBe(false);
    expect(state.gems).toBe(130);
    answers.push(0);
    await scripts['npc.odo'](api);
    expect(state.has('village.stonewardTunic')).toBe(true);
    expect(state.gems).toBe(30);
    await scripts['npc.odo'](api); // already owned: no choice, no charge
    expect(state.gems).toBe(30);
  });
});

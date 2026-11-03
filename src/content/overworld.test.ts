import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { GameState } from '../game/state';
import { Overworld } from '../world/overworld';
import { fakeApi } from './fakeApi';
import { overworldContent } from './overworld';

beforeAll(async () => {
  await initPhysics();
});

describe('overworld content', () => {
  let ow: Overworld;
  let physics: Physics;

  beforeAll(() => {
    physics = new Physics();
    ow = new Overworld(physics);
    physics.refreshQueries();
  });

  it('has a script for every interactable and trigger', () => {
    const { scripts } = overworldContent(ow);
    for (const it of [...ow.interactables, ...ow.triggers]) expect(scripts[it.id], it.id).toBeTypeOf('function');
  });

  it('lets the player stand on the ground at the spawn point', () => {
    const y = physics.groundY(ow.spawn.x, ow.spawn.z);
    expect(y).not.toBeNull();
  });

  it('plays the quest in order: locked chest, Maren\'s key, sword, rumors of the hollow, a sealed door', async () => {
    const area = new Overworld(physics);
    const { api, state, said } = fakeApi(area, physics);
    const { scripts } = overworldContent(area);
    const text = () => said.map((p) => p.text).join(' ');

    // Straight to the grove: the chest is locked, and the game points to the village.
    await scripts['chest.grove'](api);
    expect(area.chest.opened).toBe(false);
    expect(state.has('hasSword')).toBe(false);
    expect(text()).toContain('Thistledown');

    await scripts['npc.maren'](api);
    expect(state.has('metMaren')).toBe(true);
    expect(state.keys).toBe(1);

    await scripts['chest.grove'](api);
    expect(state.has('hasSword')).toBe(true);
    expect(area.chest.opened).toBe(true);
    expect(state.keys).toBe(0);

    // Armed, the village talk turns to the stolen flame and the Gloaming Hollow.
    said.length = 0;
    await scripts['npc.maren'](api);
    expect(text()).toContain('Gloaming Hollow');
    said.length = 0;
    await scripts['npc.tobin'](api);
    expect(text()).toContain('Gloaming Hollow');

    // The door stays shut: only the relit lantern wakes it.
    await scripts['door.shrine'](api);
    expect(area.door.opening).toBe(false);
    expect(state.has('shrineOpen')).toBe(false);
    area.dispose();
  });

  it('opens the shrine door by interacting with it once the lantern is relit', async () => {
    const area = new Overworld(physics);
    const { api, state } = fakeApi(area, physics);
    state.set('hasSword');
    state.set('lamplighterDefeated');
    const content = overworldContent(area);
    content.restore(state);
    expect(area.door.awake).toBe(true);
    await content.scripts['door.shrine'](api);
    expect(area.door.opening).toBe(true);
    expect(state.has('shrineOpen')).toBe(true);
    // Walking in through the open door takes Wren into the dungeon.
    const { api: api2, travels } = fakeApi(area, physics, state);
    await content.scripts['trigger.shrineEntrance'](api2);
    expect(travels).toEqual([{ area: 'shrine', entrance: undefined }]);
    area.dispose();
  });

  it('still hands over the key on a save from before keys existed (met Maren, no key)', async () => {
    const area = new Overworld(physics);
    const state = new GameState();
    state.set('metMaren');
    const { api } = fakeApi(area, physics, state);
    await overworldContent(area).scripts['npc.maren'](api);
    expect(state.keys).toBe(1);
    expect(state.has('gotGroveKey')).toBe(true);
    area.dispose();
  });

  it('does not start the Lamplighter fight without a sword', async () => {
    const area = new Overworld(physics);
    const { api } = fakeApi(area, physics);
    area.hollow.armed = true;
    await overworldContent(area).scripts['trigger.hollow'](api);
    expect(area.hollow.sealed).toBe(false);
    area.dispose();
  });

  it('the Lamplighter\'s entrance plays in silence; its song starts with the fight', async () => {
    const area = new Overworld(physics);
    const state = new GameState();
    state.set('hasSword');
    state.hours = 21;
    const { api, enemies } = fakeApi(area, physics, state);
    const content = overworldContent(area);
    content.start?.(api);
    const boss = enemies.find((e) => 'engaged' in e) as unknown as { engaged: boolean };
    expect(boss).toBeTruthy();
    const calls: { on: boolean; fighting: boolean }[] = [];
    api.silenceMusic = (on) => void calls.push({ on, fighting: boss.engaged });
    await content.scripts['trigger.hollow'](api);
    expect(calls).toEqual([{ on: true, fighting: false }, { on: false, fighting: true }]);
    area.dispose();
  });

  it('restores opened things from a save', () => {
    const fresh = new Overworld(physics);
    const state = new GameState();
    state.set('groveChestOpened');
    state.set('shrineOpen');
    overworldContent(fresh).restore(state);
    expect(fresh.chest.opened).toBe(true);
    expect(fresh.door.open).toBe(true);
    expect(fresh.door.awake).toBe(false); // the lantern isn't lit in this save
    fresh.dispose();
  });

  it('removes all of its colliders when disposed', () => {
    const p = new Physics();
    const area = new Overworld(p);
    expect(p.world.colliders.len()).toBeGreaterThan(500);
    area.dispose();
    expect(p.world.colliders.len()).toBe(0);
  });
});

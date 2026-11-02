import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Sfx } from '../core/audio';
import { initPhysics, Physics } from '../core/physics';
import type { Player } from '../game/player';
import type { Page, ScriptApi } from '../game/script';
import { GameState } from '../game/state';
import type { Particles } from '../render/particles';
import { Overworld } from '../world/overworld';
import { overworldContent } from './overworld';
import { songEffects } from './story';

beforeAll(async () => {
  await initPhysics();
});

/** A ScriptApi that resolves everything instantly and records what was said. */
function fakeApi(area: Overworld, physics: Physics, state = new GameState()) {
  const said: Page[] = [];
  const noop = () => {};
  const player = { pos: new THREE.Vector3(), teleport: noop, setSword: noop } as unknown as Player;
  const sfx = new Proxy({}, { get: () => noop }) as Sfx;
  const api: ScriptApi = {
    state, sfx, player, area,
    particles: { burst: noop } as unknown as Particles,
    physics,
    tween: async () => {},
    showBossTitle: noop,
    setTimeScale: noop,
    addEnemy: noop,
    run: noop,
    say: async (pages) => void said.push(...pages),
    wait: async () => {},
    until: async () => {},
    fade: async () => {},
    card: async () => {},
    shot: noop,
    releaseCamera: noop,
    showAreaName: noop,
    toast: noop,
    warpTime: noop,
    respawn: noop,
    giveSword: () => state.set('hasSword'),
  };
  return { api, said, state };
}

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

  it('plays the quest in order: Maren, then the chest', async () => {
    const { api, state } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    await scripts['npc.maren'](api);
    expect(state.has('metMaren')).toBe(true);
    expect(state.songs.has('waking')).toBe(true);
    await scripts['chest.grove'](api);
    expect(state.has('hasSword')).toBe(true);
    expect(ow.chest.opened).toBe(true);
  });

  it('opens the shrine when the Song of Waking is played near the door', async () => {
    const { api, state } = fakeApi(ow, physics);
    api.player.pos.set(ow.door.x - 6, 9, ow.door.z);
    const opening = songEffects.waking(api);
    await opening;
    expect(ow.door.opening).toBe(true);
    expect(state.has('shrineOpen')).toBe(true);
  });

  it('restores opened things from a save', () => {
    const fresh = new Overworld(physics);
    const state = new GameState();
    state.set('groveChestOpened');
    state.set('shrineOpen');
    overworldContent(fresh).restore(state);
    expect(fresh.chest.opened).toBe(true);
    expect(fresh.door.open).toBe(true);
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

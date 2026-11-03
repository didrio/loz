import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeSave } from '../core/save';
import { initPhysics, Physics } from '../core/physics';
import { pickLockTarget } from '../game/lockon';
import { FLAGS, GameState } from '../game/state';
import { Overworld } from '../world/overworld';
import { fakeApi } from './fakeApi';
import { foundHints, hintFlag, HINTS } from './hints';
import { overworldContent } from './overworld';

beforeAll(async () => {
  await initPhysics();
});

describe('keepers\' notes (Murmurbuds)', () => {
  let physics: Physics;

  beforeAll(() => {
    physics = new Physics();
  });

  it('every hint has a saved flag, a bud in the valley and a script; every bud has a hint', () => {
    const ow = new Overworld(physics);
    const { scripts } = overworldContent(ow);
    for (const h of HINTS) {
      expect(FLAGS).toContain(hintFlag(h.id));
      expect(ow.buds.has(`bud.${h.id}`), h.id).toBe(true);
    }
    for (const id of ow.buds.keys()) expect(scripts[id], id).toBeTypeOf('function');
  });

  it('an opened bud\'s note floats until read; reading takes it', async () => {
    const ow = new Overworld(physics);
    const { api, state } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    const bud = ow.buds.get('bud.flasks')!;
    const note = ow.interactables.find((i) => i.id === 'bud.flasks')!;
    expect(note.enabled()).toBe(false); // asleep: nothing to read
    bud.open();
    expect(note.enabled()).toBe(true);
    expect(state.has(hintFlag('flasks'))).toBe(false); // opening alone doesn't count
    await scripts['bud.flasks'](api);
    expect(bud.taken).toBe(true);
    expect(note.enabled()).toBe(false);
    expect(state.has(hintFlag('flasks'))).toBe(true);
  });

  it('a closed bud is a lock-on target; an open one lets go', () => {
    const ow = new Overworld(physics);
    physics.refreshQueries();
    const bud = ow.buds.get('bud.bells')!;
    const from = bud.pos.clone().setX(bud.pos.x + 4);
    const camFwd = new THREE.Vector3(-1, 0, 0);
    expect(pickLockTarget(from, camFwd, [bud], physics)).toBe(bud);
    bud.open();
    expect(bud.alive).toBe(false);
  });

  it('reading a note keeps it (through a save) and points at the pause menu once', async () => {
    const ow = new Overworld(physics);
    const { api, state, said, toasts } = fakeApi(ow, physics);
    const { scripts } = overworldContent(ow);
    await scripts['bud.bells'](api);
    expect(said.at(-1)!.text).toMatch(/post/);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatch(/\[pause\]/);
    await scripts['bud.tunic'](api);
    expect(toasts).toHaveLength(1); // only after the first note
    const loaded = new GameState();
    loaded.load(decodeSave(JSON.stringify(state.toSave()))!);
    // Listed in the registry's order, not the order found.
    expect(foundHints(loaded).map((h) => h.id)).toEqual(['tunic', 'bells']);
  });

  it('buds whose note was read come back open and empty after a reload', () => {
    const ow = new Overworld(physics);
    const state = new GameState();
    state.set(hintFlag('flasks'));
    overworldContent(ow).restore(state);
    expect(ow.buds.get('bud.flasks')!.opened).toBe(true);
    expect(ow.buds.get('bud.flasks')!.taken).toBe(true);
    expect(ow.buds.get('bud.tunic')!.opened).toBe(false);
  });

  it('a swing reaches a bud in front of Wren, not one behind her', () => {
    const ow = new Overworld(physics);
    const struck: string[] = [];
    ow.onBudStrike = (id) => struck.push(id);
    const bud = ow.buds.get('bud.tunic')!;
    ow.strike(bud.x + 2, bud.y + 0.9, bud.z, -1, 0, 2.4); // facing it
    ow.strike(bud.x + 2, bud.y + 0.9, bud.z, 1, 0, 2.4); // facing away
    ow.strike(bud.x + 6, bud.y + 0.9, bud.z, -1, 0, 2.4); // too far
    expect(struck).toEqual(['bud.tunic']);
    bud.open(true);
    ow.strike(bud.x + 2, bud.y + 0.9, bud.z, -1, 0, 2.4); // open: nothing left to strike
    expect(struck).toEqual(['bud.tunic']);
  });
});

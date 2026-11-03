import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, Physics } from '../core/physics';
import { FLAGS } from '../game/state';
import { DUNGEONS } from '../world/dungeon';
import { Overworld } from '../world/overworld';
import { fakeApi } from './fakeApi';
import { overworldContent } from './overworld';
import { foundSigils, readSigil, sigilFlag, SIGILS } from './sigils';

beforeAll(async () => {
  await initPhysics();
});

describe('sigils', () => {
  it('every sigil is placed exactly once: in the hollow or in a dungeon, and none is missing from the registry', () => {
    const placed = ['sigil.hollow', ...Object.values(DUNGEONS).flatMap((d) => d.things.filter((t) => t.kind === 'sigil').map((t) => t.id))];
    expect([...placed].sort()).toEqual(SIGILS.map((s) => s.id).sort());
    expect(FLAGS).not.toContain('sigil.hollow'); // sigil flags are pattern flags, not listed
  });

  it('the hollow\'s sigil appears when the Lamplighter has fallen, and reading it is saved', async () => {
    const physics = new Physics();
    const ow = new Overworld(physics);
    const content = overworldContent(ow);
    const { api, state, toasts } = fakeApi(ow, physics);
    const it_ = ow.interactables.find((i) => i.id === 'sigil.hollow')!;
    expect(it_.enabled()).toBe(false);
    state.set('lamplighterDefeated');
    content.restore(state);
    expect(it_.enabled()).toBe(true);
    await content.scripts['sigil.hollow'](api);
    expect(state.has(sigilFlag('sigil.hollow'))).toBe(true);
    expect(foundSigils(state).map((s) => s.id)).toEqual(['sigil.hollow']);
    expect(toasts.some((t) => t.includes('pause menu'))).toBe(true);
    await readSigil('sigil.cell')(api);
    expect(foundSigils(state)).toHaveLength(2);
  });
});

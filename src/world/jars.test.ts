import { beforeAll, describe, expect, it } from 'vitest';
import { overworldContent } from '../content/overworld';
import { initPhysics, Physics } from '../core/physics';
import { GameState } from '../game/state';
import { Overworld } from './overworld';
import { RUINS } from './overworld/layout';

beforeAll(async () => {
  await initPhysics();
});

describe('jars in the ruins', () => {
  const total = RUINS.reduce((n, r) => n + r.jars.length, 0);

  it('one is built for every entry in RUINS', () => {
    expect(new Overworld(new Physics()).jars.count).toBe(total);
  });

  it('a swing breaks the jars it reaches, once, and says what each held', () => {
    const ow = new Overworld(new Physics());
    const ruin = RUINS.find((r) => r.id === 'lakeHome')!;
    // Sweep from every side of the ruin; between them the swings take every jar in it.
    const got = new Map<string, string>();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let a = -7; a <= 7; a += 1) {
        for (let b = -7; b <= 7; b += 1) {
          for (const j of ow.breakJars(ruin.x + a, ruin.z + b, dx, dz, 2.2)) got.set(j.id, j.drop);
        }
      }
    }
    expect([...got.keys()].filter((id) => id.startsWith('lakeHome.'))).toHaveLength(ruin.jars.length);
    expect([...got.values()].filter((d) => d === 'bluegem')).toHaveLength(1);
    expect(ow.breakJars(ruin.x, ruin.z, 1, 0, 40)).toEqual([]); // already broken
  });

  it('does not break a jar behind the swing', () => {
    const ow = new Overworld(new Physics());
    const r = RUINS.find((q) => q.id === 'roadsideHome')!;
    expect(ow.breakJars(r.x, r.z + 60, 0, 1, 2.2)).toEqual([]);
  });

  it('broken jars stay broken after a reload', () => {
    const ow = new Overworld(new Physics());
    const state = new GameState();
    state.set('jar.lakeHome.2');
    overworldContent(ow).restore(state);
    const r = RUINS.find((q) => q.id === 'lakeHome')!;
    const ids: string[] = [];
    for (let a = -9; a <= 9; a++) for (let b = -9; b <= 9; b++) for (const j of ow.breakJars(r.x + a, r.z + b, 1, 0, 3)) ids.push(j.id);
    expect(ids).not.toContain('lakeHome.2');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('a broken jar is saved and survives a load', () => {
    const state = new GameState();
    state.set('jar.lakeHome.2');
    const loaded = new GameState();
    loaded.load(JSON.parse(JSON.stringify(state.toSave())));
    expect(loaded.has('jar.lakeHome.2')).toBe(true);
  });
});

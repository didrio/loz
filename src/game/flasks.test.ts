import { describe, expect, it } from 'vitest';
import { decodeSave } from '../core/save';
import { Flasks } from './flasks';
import { GameState } from './state';

describe('flasks', () => {
  it('are found full, empty when drunk, and only fill again when filled', () => {
    const f = new Flasks();
    expect(f.drink(0)).toBe(null); // none yet
    f.add('life');
    f.add('attack');
    f.add('life'); // only two flasks exist
    expect(f.slots).toEqual(['life', 'attack']);
    expect(f.drink(0)).toBe('life');
    expect(f.drink(0)).toBe(null);
    expect(f.firstEmpty()).toBe(0);
    // An empty flask takes either potion.
    f.fill(0, 'attack');
    expect(f.slots).toEqual(['attack', 'attack']);
    expect(f.firstEmpty()).toBe(-1);
  });

  it('stay empty through a death (no refill) and survive a reload', () => {
    const s = new GameState();
    s.flasks.add('life');
    s.flasks.add('attack');
    s.flasks.drink(1);
    const loaded = new GameState();
    loaded.load(decodeSave(JSON.stringify(s.toSave()))!);
    expect(loaded.flasks.slots).toEqual(['life', null]);
    // A save without flasks loads with none; junk is dropped or read as empty.
    expect(decodeSave(JSON.stringify({ ...s.toSave(), flasks: undefined }))!.flasks).toEqual([]);
    loaded.load(decodeSave(JSON.stringify({ ...s.toSave(), flasks: ['life', 'beer', 'attack', 'life'] }))!);
    expect(loaded.flasks.slots).toEqual(['life', null]);
  });

  it('older saves turn their drinks into flasks: full if any was left', () => {
    const v4 = { ...new GameState().toSave(), version: 4, flasks: undefined, drinks: { restore: { found: 1, left: 0 }, attack: { found: 1, left: 1 } } };
    const s = new GameState();
    s.load(decodeSave(JSON.stringify(v4))!);
    expect(s.flasks.slots).toEqual([null, 'attack']);
  });
});

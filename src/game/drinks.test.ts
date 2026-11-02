import { describe, expect, it } from 'vitest';
import { decodeSave } from '../core/save';
import { Drinks } from './drinks';
import { GameState } from './state';

describe('drinks', () => {
  it('are single-use until Wren dies, when every drink found refills', () => {
    const d = new Drinks();
    expect(d.use('restore')).toBe(false); // none yet
    d.add('restore');
    d.add('restore');
    d.add('attack');
    expect(d.use('restore')).toBe(true);
    expect(d.use('attack')).toBe(true);
    expect(d.use('attack')).toBe(false);
    expect(d.left.get('restore')).toBe(1);
    d.refill();
    expect([d.left.get('restore'), d.left.get('attack')]).toEqual([2, 1]);
  });

  it('are saved (found and left) and survive a reload', () => {
    const s = new GameState();
    s.drinks.add('attack');
    s.drinks.add('restore');
    s.drinks.use('attack');
    const loaded = new GameState();
    loaded.load(decodeSave(JSON.stringify(s.toSave()))!);
    expect([loaded.drinks.found.get('attack'), loaded.drinks.left.get('attack'), loaded.drinks.left.get('restore')]).toEqual([1, 0, 1]);
    // An older save without drinks loads with none.
    const old = decodeSave(JSON.stringify({ ...s.toSave(), drinks: undefined }))!;
    expect(old.drinks).toEqual({});
  });
});

import { describe, expect, it } from 'vitest';
import { dungeonQuiet } from './dungeonQuiet';
import { GameState } from './state';

describe('dungeonQuiet', () => {
  it('is silent in a dungeon only once its boss is beaten', () => {
    const s = new GameState();
    expect(dungeonQuiet('shrine', s)).toBe(false);
    expect(dungeonQuiet(undefined, s)).toBe(false);
    s.dungeon('shrine').done = true;
    expect(dungeonQuiet('shrine', s)).toBe(true);
    expect(dungeonQuiet(undefined, s)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { GameState } from '../game/state';
import { newsFor, type Villager } from './villageNews';

const VILLAGERS: Villager[] = ['maren', 'tobin', 'lark', 'odo', 'pip'];

describe('villagers\' news', () => {
  it('has nothing to say until Wren reads a sigil, then says it once', () => {
    for (const v of VILLAGERS) {
      const state = new GameState();
      expect(newsFor(v, state)).toBeNull();
      state.set('sigil.hollow');
      const news = newsFor(v, state)!;
      expect(news.lines.length).toBeGreaterThan(0);
      state.set(news.flag);
      expect(newsFor(v, state)).toBeNull();
    }
  });

  it('relief comes once the ward is broken, and takes precedence', () => {
    for (const v of VILLAGERS) {
      const state = new GameState();
      state.set('sigil.hollow');
      state.set('valleyOpen');
      const first = newsFor(v, state)!;
      expect(first.flag).toBe(`village.${v}Relief`);
      state.set(first.flag);
      expect(newsFor(v, state)!.flag).toBe(`village.${v}Sigil`);
    }
  });

  it('nobody speaks his name', () => {
    for (const v of VILLAGERS) {
      const state = new GameState();
      state.set('valleyOpen');
      state.set('sigil.hollow');
      const text = [newsFor(v, state)!.lines];
      state.set(newsFor(v, state)!.flag);
      text.push(newsFor(v, state)!.lines);
      expect(text.flat().join(' ')).not.toMatch(/\bhis name is\b/i);
    }
  });
});

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

  it('once the ward breaks, only the kids have news (Pip\'s is the ask), once; the sigil whispers are dropped', () => {
    for (const v of VILLAGERS) {
      const state = new GameState();
      state.set('sigil.hollow');
      state.set('valleyOpen');
      const news = newsFor(v, state);
      if (v === 'maren' || v === 'tobin' || v === 'odo') {
        expect(news, v).toBeNull();
        continue;
      }
      expect(news!.flag).toBe(v === 'pip' ? 'village.searchAsked' : 'village.larkRelief');
      state.set(news!.flag);
      expect(newsFor(v, state)).toBeNull();
    }
  });

  it('nobody speaks his name', () => {
    for (const v of VILLAGERS) {
      const state = new GameState();
      state.set('sigil.hollow');
      const text = [newsFor(v, state)!.lines];
      state.set('valleyOpen');
      text.push(newsFor(v, state)?.lines ?? []);
      expect(text.flat().join(' ')).not.toMatch(/\bhis name is\b/i);
    }
  });
});

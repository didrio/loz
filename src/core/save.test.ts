import { describe, expect, it } from 'vitest';
import { GameState } from '../game/state';
import { decodeSave, decodeSettings, memoryStore, SaveSlot, SAVE_VERSION } from './save';

describe('save files', () => {
  it('round-trips game state', () => {
    const s = new GameState();
    s.set('hasSword');
    s.songs.add('waking');
    s.gems = 42;
    s.hp = 3;
    s.advance(20);
    const slot = new SaveSlot(memoryStore());
    slot.write(s.toSave());
    const loaded = new GameState();
    loaded.load(slot.load()!);
    expect(loaded.has('hasSword')).toBe(true);
    expect(loaded.songs.has('waking')).toBe(true);
    expect(loaded.gems).toBe(42);
    expect(loaded.day).toBe(2);
    expect(loaded.hours).toBeCloseTo(5);
  });

  it('rejects garbage and other versions', () => {
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave('not json')).toBeNull();
    expect(decodeSave('[]')).toBeNull();
    expect(decodeSave(JSON.stringify({ version: SAVE_VERSION + 1, flags: [], songs: [] }))).toBeNull();
  });

  it('repairs out-of-range values instead of trusting them', () => {
    const d = decodeSave(JSON.stringify({ version: SAVE_VERSION, flags: ['hasSword', 3], songs: [], gems: -5, hp: 99, maxHp: 7, hours: 30, day: 0 }))!;
    expect(d.flags).toEqual(['hasSword']);
    expect(d.gems).toBe(0);
    expect(d.maxHp % 2).toBe(0);
    expect(d.hp).toBeLessThanOrEqual(d.maxHp);
    expect(d.hours).toBe(6);
    expect(d.day).toBe(1);
  });

  it('drops flags and songs the game no longer knows', () => {
    const s = new GameState();
    s.load({ ...new GameState().toSave(), flags: ['hasSword', 'oldRemovedFlag'], songs: ['waking', 'nope'] });
    expect([...s.flags]).toEqual(['hasSword']);
    expect(s.songs.has('waking')).toBe(true);
    expect(s.songs.size).toBe(2); // hours (starting song) + waking
  });

  it('always continues with at least three hearts', () => {
    const s = new GameState();
    s.load({ ...new GameState().toSave(), hp: 1 });
    expect(s.hp).toBe(6);
  });

  it('reads settings with defaults', () => {
    expect(decodeSettings(null).music).toBe(true);
    expect(decodeSettings('{"music":false}').music).toBe(false);
    expect(decodeSettings('{oops').music).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { GameState } from '../game/state';
import { decodeSave, decodeSettings, memoryStore, SaveSlot, SAVE_VERSION } from './save';

describe('save files', () => {
  it('round-trips game state', () => {
    const s = new GameState();
    s.set('hasSword');
    s.keys = 1;
    s.gems = 42;
    s.hp = 3;
    s.advance(20);
    const slot = new SaveSlot(memoryStore());
    slot.write(s.toSave());
    const loaded = new GameState();
    loaded.load(slot.load()!);
    expect(loaded.has('hasSword')).toBe(true);
    expect(loaded.keys).toBe(1);
    expect(loaded.gems).toBe(42);
    expect(loaded.day).toBe(2);
    expect(loaded.hours).toBeCloseTo(5);
  });

  it('rejects garbage and other versions', () => {
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave('not json')).toBeNull();
    expect(decodeSave('[]')).toBeNull();
    expect(decodeSave(JSON.stringify({ version: SAVE_VERSION + 1, flags: [] }))).toBeNull();
  });

  it('repairs out-of-range values instead of trusting them', () => {
    const d = decodeSave(JSON.stringify({ version: SAVE_VERSION, flags: ['hasSword', 3], keys: -2, gems: -5, hp: 99, maxHp: 7, hours: 30, day: 0 }))!;
    expect(d.flags).toEqual(['hasSword']);
    expect(d.gems).toBe(0);
    expect(d.keys).toBe(0);
    expect(d.maxHp % 2).toBe(0);
    expect(d.hp).toBeLessThanOrEqual(d.maxHp);
    expect(d.hours).toBe(6);
    expect(d.day).toBe(1);
  });

  it('drops flags the game no longer knows', () => {
    const s = new GameState();
    s.load({ ...new GameState().toSave(), flags: ['hasSword', 'oldRemovedFlag'] });
    expect([...s.flags]).toEqual(['hasSword']);
  });

  it('migrates a v1 save (from when there was a flute): songs dropped, no keys, progress kept', () => {
    const d = decodeSave(JSON.stringify({ version: 1, flags: ['metMaren', 'hasSword'], songs: ['hours', 'waking'], gems: 12, hp: 6, maxHp: 6, hours: 10, day: 2 }))!;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.keys).toBe(0);
    expect(d.flags).toEqual(['metMaren', 'hasSword']);
    expect(d.gems).toBe(12);
    expect('songs' in d).toBe(false);
  });

  it('round-trips the area, items and each dungeon\'s progress (v3)', () => {
    const s = new GameState();
    s.area = 'shrine';
    s.items.add('tether');
    const d = s.dungeon('shrine');
    d.keys.add('amber');
    d.bossKey = true;
    d.doors.add('tetherDoor');
    d.chests.add('southChest');
    d.switches.add('northBar');
    d.cleared.add('southCell');
    const loaded = new GameState();
    loaded.load(decodeSave(JSON.stringify(s.toSave()))!);
    expect(loaded.area).toBe('shrine');
    expect(loaded.items.has('tether')).toBe(true);
    const l = loaded.dungeon('shrine');
    expect([[...l.keys], l.bossKey, l.done]).toEqual([['amber'], true, false]);
    expect([...l.doors, ...l.chests, ...l.switches, ...l.cleared]).toEqual(['tetherDoor', 'southChest', 'northBar', 'southCell']);
    expect(loaded.dungeonKeysHere).toEqual(['amber']); // in the shrine, its own keys count
    loaded.area = 'overworld';
    expect(loaded.dungeonKeysHere).toEqual([]);
  });

  it('migrates a v3 save: the dungeon key count is dropped (content re-derives colors from chests and doors)', () => {
    const d = decodeSave(JSON.stringify({ version: 3, flags: [], dungeons: { shrine: { keys: 2, doors: ['a'], chests: ['southChest'] } } }))!;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.dungeons.shrine).toMatchObject({ keys: [], doors: ['a'], chests: ['southChest'] });
  });

  it('migrates a v2 save: overworld, no items, no dungeon progress', () => {
    const d = decodeSave(JSON.stringify({ version: 2, flags: ['hasSword'], keys: 1, gems: 3, hp: 6, maxHp: 6, hours: 10, day: 1 }))!;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.area).toBe('overworld');
    expect(d.items).toEqual([]);
    expect(d.dungeons).toEqual({});
    expect(d.keys).toBe(1);
  });

  it('repairs broken dungeon progress instead of trusting it', () => {
    const d = decodeSave(JSON.stringify({ version: SAVE_VERSION, flags: [], dungeons: { shrine: { keys: ['azure', 3], doors: ['a', 7], done: 'yes' }, bad: 3 }, items: ['tether', 'nonsense'] }))!;
    expect(d.dungeons.shrine).toMatchObject({ keys: ['azure'], doors: ['a'], done: false, bossKey: false });
    expect('bad' in d.dungeons).toBe(false);
    const s = new GameState();
    s.load(d);
    expect([...s.items]).toEqual(['tether']);
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

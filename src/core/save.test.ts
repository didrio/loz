import { describe, expect, it } from 'vitest';
import { GameState } from '../game/state';
import { decodeSave, decodeSettings, DEFAULT_SETTINGS, memoryStore, SaveSlot, SAVE_VERSION } from './save';

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
    expect(d.flags).toEqual(['metMaren', 'hasSword', 'hasShield']); // v7: past the old opening keeps the shield
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

  it('round-trips the bells (v6): carried and hung', () => {
    const s = new GameState();
    s.bells.carried.add('lull');
    s.bells.hung.add('morrow');
    const loaded = new GameState();
    loaded.load(decodeSave(JSON.stringify(s.toSave()))!);
    expect([...loaded.bells.carried]).toEqual(['lull']);
    expect([...loaded.bells.hung]).toEqual(['morrow']);
  });

  it('migrates a v5 save: flasks kept, no bells', () => {
    const d = decodeSave(JSON.stringify({ version: 5, flags: [], flasks: ['life', null] }))!;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.flasks).toEqual(['life', null]);
    expect(d.bells).toEqual({ carried: [], hung: [] });
  });

  it('migrates a v6 save: the shield comes with any progress past the old opening', () => {
    const met = decodeSave(JSON.stringify({ version: 6, flags: ['metMaren'], flasks: ['life'] }))!;
    expect(met.version).toBe(SAVE_VERSION);
    expect(met.flags).toContain('hasShield');
    expect(met.flasks).toEqual(['life']);
    expect(decodeSave(JSON.stringify({ version: 2, flags: ['hasSword'] }))!.flags).toContain('hasShield');
    // A fresh start finds it in the ruined cottage, and a current save is taken as it is.
    expect(decodeSave(JSON.stringify({ version: 6, flags: [] }))!.flags).not.toContain('hasShield');
    expect(decodeSave(JSON.stringify({ version: SAVE_VERSION, flags: ['metMaren'] }))!.flags).not.toContain('hasShield');
  });

  it('drops unknown bells, and a hung bell is never also carried', () => {
    const d = decodeSave(JSON.stringify({ version: SAVE_VERSION, flags: [], bells: { carried: ['morrow', 'lull', 7, 'nope'], hung: ['lull', 'nope'] } }))!;
    const s = new GameState();
    s.load(d);
    expect([...s.bells.carried]).toEqual(['morrow']);
    expect([...s.bells.hung]).toEqual(['lull']);
    expect(decodeSave(JSON.stringify({ version: SAVE_VERSION, flags: [], bells: 'lots' }))!.bells).toEqual({ carried: [], hung: [] });
  });

  it('always continues with at least three hearts', () => {
    const s = new GameState();
    s.load({ ...new GameState().toSave(), hp: 1 });
    expect(s.hp).toBe(6);
  });

  it('reads settings with defaults', () => {
    expect(decodeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(decodeSettings('{oops')).toEqual(DEFAULT_SETTINGS);
  });

  it('turns the old music-off setting into a silent music volume', () => {
    expect(decodeSettings('{"music":false}').musicVolume).toBe(0);
    expect(decodeSettings('{"music":true}').musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });

  it('gives a save from before the voice slider the default voice volume', () => {
    expect(decodeSettings('{"masterVolume":0.3}').voiceVolume).toBe(DEFAULT_SETTINGS.voiceVolume);
    expect(decodeSettings('{"voiceVolume":0.25}').voiceVolume).toBe(0.25);
  });

  it('gives shadows the install default unless saved', () => {
    expect(decodeSettings('{"display":1}').shadows).toBe(true);
    expect(decodeSettings('{"display":1}', { ...DEFAULT_SETTINGS, shadows: false }).shadows).toBe(false); // a touch device
    expect(decodeSettings('{"shadows":false}').shadows).toBe(false);
    expect(decodeSettings('{"shadows":"yes"}').shadows).toBe(true);
  });

  it('keeps Auto display and haptics; older saves get the install default', () => {
    expect(decodeSettings('{"display":3}').display).toBe(3);
    expect(decodeSettings('{}', { ...DEFAULT_SETTINGS, display: 3 }).display).toBe(3); // a touch device's fresh install
    expect(decodeSettings('{"display":1}').haptics).toBe(true);
    expect(decodeSettings('{"haptics":false}').haptics).toBe(false);
  });

  it('keeps saved settings and clamps or drops nonsense', () => {
    const s = decodeSettings('{"masterVolume":0.3,"mouseSensitivity":9,"stickSensitivity":"fast","invertY":true,"display":2,"sfxVolume":-1}');
    expect(s).toMatchObject({ masterVolume: 0.3, mouseSensitivity: 2, stickSensitivity: 1, invertY: true, display: 2, sfxVolume: 0 });
    expect(decodeSettings('{"display":7}').display).toBe(DEFAULT_SETTINGS.display);
  });

  it('migrates the old Retro look and Resolution into Display: a look on is N64, Balanced or Performance is Performance, else Native', () => {
    expect(decodeSettings('{"look":3,"resolution":0}').display).toBe(2);
    expect(decodeSettings('{"look":1,"resolution":2}').display).toBe(2); // a look wins over a resolution
    expect(decodeSettings('{"look":0,"resolution":1}').display).toBe(1);
    expect(decodeSettings('{"look":0,"resolution":2}').display).toBe(1);
    expect(decodeSettings('{"look":0,"resolution":0}').display).toBe(0);
    expect(decodeSettings('{"look":9}').display).toBe(DEFAULT_SETTINGS.display);
  });

  it('migrates the oldest Sharpness setting: sharp is Native, standard and performance are Performance', () => {
    expect(decodeSettings('{"quality":2}').display).toBe(0);
    expect(decodeSettings('{"quality":1}').display).toBe(1);
    expect(decodeSettings('{"quality":0}').display).toBe(1);
    expect(decodeSettings('{"quality":7}').display).toBe(DEFAULT_SETTINGS.display);
    expect(decodeSettings('{"quality":2,"look":1}').display).toBe(2); // a saved look wins
  });

  it('counts the retro look\'s old default (Soft, saved before Resolution existed) as never chosen', () => {
    expect(decodeSettings('{"look":2}').display).toBe(0);
    expect(decodeSettings('{"look":3}').display).toBe(2);
    expect(decodeSettings('{"look":2,"resolution":0}').display).toBe(2); // chosen after the change
  });

  it('defaults to Native', () => {
    expect(DEFAULT_SETTINGS.display).toBe(0);
  });

  it('gives a fresh install the caller\'s defaults (touch passes Performance), and saved settings keep theirs', () => {
    const touch = { ...DEFAULT_SETTINGS, display: 1 as const };
    expect(decodeSettings(null, touch).display).toBe(1);
    expect(decodeSettings('not json', touch).display).toBe(1);
    expect(decodeSettings('{"masterVolume":0.5}', touch).display).toBe(1);
    expect(decodeSettings('{"display":0}', touch).display).toBe(0);
    expect(decodeSettings('{"display":2}', touch).display).toBe(2);
  });
});

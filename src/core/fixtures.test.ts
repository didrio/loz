import { describe, expect, it } from 'vitest';
import { AREA_IDS } from '../content/areas';
import { FLAGS, ITEMS } from '../game/state';
import { DUNGEONS } from '../world/dungeon';
import { decodeSave, SAVE_VERSION } from './save';

// The smoke scenarios boot from these (scripts/fixtures). A fixture must be a save the game
// loads exactly as written: when the format changes, this fails until the files are updated.
const files = import.meta.glob('../../scripts/fixtures/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('smoke save fixtures', () => {
  it('exist', () => expect(Object.keys(files).length).toBeGreaterThan(0));
  for (const [path, raw] of Object.entries(files)) {
    it(`${path.split('/').pop()} is a current, valid save`, () => {
      const o = JSON.parse(raw);
      expect(o.version).toBe(SAVE_VERSION);
      expect(decodeSave(raw)).toEqual(o); // nothing repaired, dropped or defaulted
      for (const f of o.flags) expect(FLAGS as readonly string[]).toContain(f);
      for (const i of o.items) expect(ITEMS as readonly string[]).toContain(i);
      expect(AREA_IDS as readonly string[]).toContain(o.area);
      for (const id of Object.keys(o.dungeons)) expect(DUNGEONS.map((d) => d.id)).toContain(id);
    });
  }
});

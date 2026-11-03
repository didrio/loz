import { describe, expect, it } from 'vitest';
import { decodeSave } from '../core/save';
import { FLAGS, ITEMS } from '../game/state';
import { DUNGEONS } from '../world/dungeon';
import { BELL_IDS } from '../world/bell';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { AREA_IDS } from './areas';
import { completedDungeon, DEV_STATES } from './devStates';

describe('dev save states', () => {
  for (const s of DEV_STATES.filter((d) => d.save)) {
    it(`"${s.name}" is a valid save for known areas, flags, items and dungeons`, () => {
      const save = s.save!;
      expect(decodeSave(JSON.stringify(save))).toEqual(save);
      for (const f of save.flags) expect(FLAGS as readonly string[]).toContain(f);
      for (const i of save.items) expect(ITEMS as readonly string[]).toContain(i);
      expect(AREA_IDS as readonly string[]).toContain(save.area);
      for (const id of Object.keys(save.dungeons)) expect(DUNGEONS.map((d) => d.id)).toContain(id);
    });
  }

  it('lists a new game, the night outside the hollow, the shrine start, the boss door and four bell states', () => {
    expect(DEV_STATES.map((s) => s.save?.area ?? 'new')).toEqual(['new', 'overworld', 'shrine', 'shrine', 'overworld', 'shrine', 'shrine', 'overworld']);
  });

  it('the bell states carry or hang only known bells, never one both carried and hung', () => {
    for (const s of DEV_STATES.slice(4)) {
      const { carried, hung } = s.save!.bells;
      for (const b of [...carried, ...hung]) expect(BELL_IDS as readonly string[]).toContain(b);
      expect(carried.filter((b) => hung.includes(b))).toEqual([]);
    }
  });

  it('the boss-door state has everything done but the boss door: boss key, both flasks full, the glove', () => {
    const { save } = DEV_STATES[3];
    const p = save!.dungeons.shrine;
    expect(p.bossKey).toBe(true);
    expect(p.doors).not.toContain('bossDoor');
    expect(p.done).toBe(false);
    expect(save!.flasks).toEqual(['life', 'attack']);
    expect(save!.items).toContain('tether');
    expect(p.chests.length).toBe(SHRINE.things.filter((t) => t.kind === 'chest').length);
  });

  it('completedDungeon opens every key and switch door and clears every room with enemies', () => {
    const { progress } = completedDungeon(SHRINE);
    for (const d of SHRINE.doors) {
      if (d.lock && d.lock !== 'boss' && !(typeof d.lock === 'object' && 'item' in d.lock)) expect(progress.doors).toContain(d.id);
    }
    for (const t of SHRINE.things) if (t.kind === 'enemy') expect(progress.cleared).toContain(t.room);
  });

  it('the night state is at night, with the sword and the bed key, before the Lamplighter', () => {
    const { save } = DEV_STATES[1];
    expect(save!.hours).toBeGreaterThanOrEqual(18);
    expect(save!.flags).toEqual(expect.arrayContaining(['hasSword', 'village.millKey']));
    expect(save!.flags).not.toContain('lamplighterDefeated');
  });
});

import { describe, expect, it } from 'vitest';
import { decodeSave } from '../core/save';
import { FLAGS, ITEMS } from '../game/state';
import { DUNGEONS } from '../world/dungeon';
import { BELL_IDS } from '../world/bell';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { GATE } from '../world/overworld/layout';
import { AREA_IDS } from './areas';
import { completedDungeon, DEV_STATES } from './devStates';
import { HINTS, hintFlag } from './hints';
import { SIGILS } from './sigils';

describe('dev save states', () => {
  for (const s of DEV_STATES.filter((d) => d.save)) {
    it(`"${s.name}" is a valid save for known areas, flags, items and dungeons`, () => {
      const save = s.save!;
      expect(decodeSave(JSON.stringify(save))).toEqual(save);
      for (const f of save.flags) if (!f.startsWith('sigil.')) expect(FLAGS as readonly string[]).toContain(f);
      for (const i of save.items) expect(ITEMS as readonly string[]).toContain(i);
      expect(AREA_IDS as readonly string[]).toContain(save.area);
      for (const id of Object.keys(save.dungeons)) expect(DUNGEONS.map((d) => d.id)).toContain(id);
    });
  }

  it('lists the states in the order the game is played, with a place and a moment in each name', () => {
    expect(DEV_STATES.map((s) => s.name)).toEqual([
      'A new game',
      'Grist (experiment): after the prism',
      'Grist (experiment): before the prism',
      'Hushing Gorge: the mouth',
      'Hushing Gorge: the climb',
      'Thistledown: Morrowbell in hand',
      'Gloaming Hollow: night, before the Lamplighter',
      'Waking Shrine: the entrance',
      'Waking Shrine: the Bell Shaft',
      'Waking Shrine: Lullbell in hand',
      'Thistledown: both bells hung',
      'Waking Shrine: at the boss door',
      'Waking Shrine: Gravelheart beaten, seal room open',
      'Northpass: the gate is open',
      'Sallowmere: the descent',
    ]);
  });

  it('progress only grows down the list: flags, hung bells, hearts', () => {
    const saves = DEV_STATES.flatMap((s) => (s.save ? [s.save] : []));
    const shrineIdx = DEV_STATES.findIndex((s) => s.save?.area === 'shrine');
    expect(shrineIdx).toBeGreaterThan(0);
    // Everything from the shrine's entrance on keeps what the earlier shrine states had.
    const later = DEV_STATES.slice(shrineIdx + 1).flatMap((s) => (s.save ? [s.save] : []));
    for (let i = 1; i < later.length; i++) {
      for (const f of later[i - 1].flags) if (f !== 'hasShield') expect(later[i].flags, `${f} lost`).toContain(f);
      expect(later[i].maxHp).toBeGreaterThanOrEqual(later[i - 1].maxHp);
    }
    expect(saves.length).toBe(DEV_STATES.length - 1);
  });

  it('the bell states carry or hang only known bells, never one both carried and hung', () => {
    for (const s of DEV_STATES.slice(1)) {
      const { carried, hung } = s.save!.bells;
      for (const b of [...carried, ...hung]) expect(BELL_IDS as readonly string[]).toContain(b);
      expect(carried.filter((b) => hung.includes(b))).toEqual([]);
    }
  });

  const flagsOf = (name: string) => DEV_STATES.find((s) => s.name === name)!.save!.flags;
  const notes = (flags: string[]) => ({ hints: flags.filter((f) => f.startsWith('hint.')), sigils: flags.filter((f) => f.startsWith('sigil.')) });

  it('every state has the keepers\' notes and messages Wren could have by then, and no more', () => {
    expect(DEV_STATES[0].save).toBeNull(); // nothing yet in a new game
    const allHints = HINTS.map((h) => hintFlag(h.id));
    // With the sword: all four notes lie in the open valley. No messages before the Lamplighter falls.
    expect(notes(flagsOf('Hushing Gorge: the mouth'))).toEqual({ hints: allHints, sigils: [] });
    expect(notes(flagsOf('Gloaming Hollow: night, before the Lamplighter')).sigils).toEqual([]);
    // The shrine's entrance: the hollow's message only.
    expect(notes(flagsOf('Waking Shrine: the entrance')).sigils).toEqual(['sigil.hollow']);
    // Rooms cleared: the cell, crypt and gauntlet messages, but not the seal's (the stone isn't pressed).
    const door = notes(flagsOf('Waking Shrine: at the boss door')).sigils;
    expect(door).toEqual(expect.arrayContaining(['sigil.hollow', 'sigil.cell', 'sigil.crypt', 'sigil.gauntlet']));
    expect(door).not.toContain('sigil.seal');
    expect(notes(flagsOf('Waking Shrine: Gravelheart beaten, seal room open')).sigils).not.toContain('sigil.seal');
    // The ward broken: all five.
    expect(notes(flagsOf('Northpass: the gate is open')).sigils.sort()).toEqual(SIGILS.map((g) => g.id).sort());
  });

  it('the boss-door state has everything done but the boss door: boss key, both flasks full, the glove', () => {
    const { save } = DEV_STATES.find((x) => x.name.includes('at the boss door'))!;
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
      if (d.lock && d.lock !== 'boss' && !(typeof d.lock === 'object' && ('item' in d.lock || 'cleared' in d.lock))) expect(progress.doors).toContain(d.id);
      // The boss's hidden door and the seal-stone behind it wait for the win.
      if (d.lock && typeof d.lock === 'object' && 'cleared' in d.lock) expect(progress.doors).not.toContain(d.id);
    }
    for (const t of SHRINE.things) if (t.kind === 'enemy') expect(progress.cleared).toContain(t.room);
  });

  it('the beaten-boss state has the Warden asleep, the hidden door open and the tunic and both bells', () => {
    const s = DEV_STATES.find((x) => x.name.includes('Gravelheart beaten'))!;
    const p = s.save!.dungeons.shrine;
    expect(p.done).toBe(true);
    expect(p.cleared).toContain('boss');
    expect(p.doors).toContain('sealDoor');
    expect(p.switches).not.toContain('sealStone');
    expect(s.save!.flags).toContain('village.stonewardTunic');
    expect(s.save!.bells.hung).toEqual(['morrow', 'lull']);
  });

  it('the gate state: the Warden beaten, the vessel taken, the ward broken, both bells hung, Wren at the gate', () => {
    const s = DEV_STATES.find((x) => x.name.includes('gate is open'))!;
    expect(s.save!.dungeons.shrine.done).toBe(true);
    expect(s.save!.flags).toEqual(expect.arrayContaining(['village.stonewardTunic', 'gravelheartVessel', 'valleyOpen']));
    expect(s.save!.maxHp).toBe(10);
    expect(s.save!.bells.hung).toEqual(['morrow', 'lull']);
    expect(Math.hypot(s.at!.x - GATE.x, s.at!.z - GATE.z)).toBeLessThan(12);
  });

  it('the night state is at night, with the sword and the bed key, before the Lamplighter', () => {
    const { save } = DEV_STATES.find((x) => x.name.includes('night'))!;
    expect(save!.hours).toBeGreaterThanOrEqual(18);
    expect(save!.flags).toEqual(expect.arrayContaining(['hasSword', 'village.millKey']));
    expect(save!.flags).not.toContain('lamplighterDefeated');
  });
});

import { describe, expect, it } from 'vitest';
import { scan } from '../../scripts/flags.mjs';
import { FLAGS } from '../game/state';
import { solveDungeon } from '../world/dungeon';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { RUINS } from '../world/overworld/layout';
import { flagProblems, GATES, GOAL, progressionProblems, walk, type Gate } from './progression';
import { TUNIC_PRICE } from './shop';

const without = (...ids: string[]) => GATES.filter((g) => !ids.includes(g.id));
const gate = (id: string) => GATES.find((g) => g.id === id)!;

describe('world progression', () => {
  it('a new save reaches the Waybell hung at the camp, with nothing stranded', () => {
    expect(progressionProblems()).toEqual([]);
    const w = walk(GATES);
    for (const f of GOAL) expect(w.facts.has(f)).toBe(true);
    expect(w.stuck).toEqual([]);
  });

  it('the way on needs no optional gate', () => {
    const w = walk(GATES.filter((g) => !g.optional));
    for (const f of GOAL) expect(w.facts.has(f)).toBe(true);
  });

  it('the shrine is one node, and its own solver says it can be finished', () => {
    const r = solveDungeon(SHRINE);
    expect(r.completable).toBe(true);
    expect(r.unreachable).toEqual([]);
    const g = gate('dungeon.shrine');
    expect(g.gives).toEqual(expect.arrayContaining(['dungeon:shrine:done', 'valleyOpen', 'item:tether', 'item:flask', 'bell:lull:hung']));
    expect(g.gains?.gems).toBeGreaterThan(0);
  });

  it('every blue-gem jar in the ruins is a gate', () => {
    const jars = RUINS.flatMap((r) => r.jars.filter((d) => d === 'bluegem'));
    expect(GATES.filter((g) => g.id.startsWith('jar.'))).toHaveLength(jars.length);
  });

  it('fails when a gate on the way is made unreachable', () => {
    const w = walk(without('lamplighter'));
    expect(w.facts.has('bell:way:hung')).toBe(false);
    expect(progressionProblems(without('lamplighter')).join('\n')).toContain("A new save can't reach bell:way:hung");
    // ...or asks for something nothing gives.
    const bad: Gate[] = GATES.map((g) => (g.id === 'northpassGate' ? { ...g, needs: ['valleyOpen', 'item:nothing'] } : g));
    expect(progressionProblems(bad).join('\n')).toContain('"northpassGate"');
  });

  it('fails when a one-time key is spent twice', () => {
    const twice: Gate[] = [...GATES, { id: 'secondChest', at: 'somewhere', needs: ['gotGroveKey'], spends: { keys: 1 }, gives: ['hasShield'] }];
    const problems = progressionProblems(twice);
    expect(problems.join('\n')).toContain('"secondChest"');
    expect(walk(twice).keys).toBe(0);
    // ...and the first chest still opens: the key is spent by exactly one gate.
    expect(walk(twice).facts.has('hasSword')).toBe(true);
  });

  it('fails when the gems asked for exceed the gems that can be found', () => {
    const dear: Gate[] = GATES.map((g) => (g.id === 'tunic' ? { ...g, spends: { gems: 10000 } } : g));
    const problems = progressionProblems(dear).join('\n');
    expect(problems).toContain('"tunic"');
    expect(problems).toMatch(/ask for \d+ gems but only \d+ can be found/);
    // As it stands, everything can be bought with what can be found.
    const w = walk(GATES);
    expect(w.gemsWanted).toBeLessThanOrEqual(w.gemsFound);
    expect(w.gemsWanted).toBeGreaterThanOrEqual(TUNIC_PRICE);
  });

  it('a purchase never starves the way forward (required gates fire first)', () => {
    const p: Gate[] = [
      { id: 'buy', at: 'x', spends: { gems: 5 }, optional: true },
      { id: 'need', at: 'x', needs: ['gotGroveKey'], spends: { gems: 5 }, gives: ['hasSword'] },
      { id: 'earn', at: 'x', gains: { gems: 5 } },
      { id: 'key', at: 'x', gives: ['gotGroveKey'] },
    ];
    const r = walk(p);
    expect(r.facts.has('hasSword')).toBe(true);
    expect(r.stuck.map((g) => g.id)).toEqual(['buy']);
  });

  it('every id is unique', () => {
    const ids = GATES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the gates match the code', () => {
  const use = scan();

  it('every flag a gate names is real, set when it is given, and read when it is needed', () => {
    expect(flagProblems(GATES, FLAGS, use)).toEqual([]);
  });

  it('catches a flag that was renamed in the code but not in the data', () => {
    const typo: Gate[] = [{ id: 'x', at: 'x', needs: ['hasSwordd' as 'hasSword'], gives: ['shrineOpenn' as 'shrineOpen'] }];
    expect(flagProblems(typo, FLAGS, use)).toEqual([
      '"x" names "hasSwordd", which isn\'t in FLAGS',
      '"x" names "shrineOpenn", which isn\'t in FLAGS',
    ]);
  });

  it('catches a flag nothing sets or reads', () => {
    const idle: Gate[] = [{ id: 'x', at: 'x', needs: ['hint.boss'], gives: ['hint.tunic'] }];
    expect(flagProblems(idle, FLAGS, use)).toEqual(['"x" gives "hint.tunic", but nothing sets it', '"x" needs "hint.boss", but nothing reads it']);
  });
});

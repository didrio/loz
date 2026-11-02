import { describe, expect, it } from 'vitest';
import { EXAMPLE_DUNGEON } from './example';
import { checkDungeon, doorPlacement, dungeonMap, dungeonReport, DUNGEONS, explore, logicProblems, solveDungeon, validateDungeon, type DungeonDef } from './index';

/** A copy of a dungeon with some parts swapped out, for "what if the author got this wrong" tests. */
const tweak = (base: DungeonDef, patch: Partial<DungeonDef>): DungeonDef => ({ ...structuredClone(base), ...patch });

/**
 * The textbook softlock: one key, two locked doors, and one of them leads to a dead end.
 * Spend the key there and the boss key is gone for good.
 */
const SOFTLOCK: DungeonDef = {
  id: 'trap',
  name: 'Trap',
  entrance: { room: 'entry', at: [5, 5], facing: 'n' },
  goal: 'boss',
  rooms: [
    { id: 'entry', floor: 0, x: 0, z: 0, w: 10, d: 10 },
    { id: 'keyRoom', floor: 0, x: 10, z: 0, w: 10, d: 10 },
    { id: 'deadEnd', floor: 0, x: -10, z: 0, w: 10, d: 10 },
    { id: 'boss', floor: 0, x: 0, z: -10, w: 10, d: 10 },
  ],
  doors: [
    { id: 'toKeyRoom', from: 'entry', to: 'keyRoom', lock: 'small' },
    { id: 'toDeadEnd', from: 'entry', to: 'deadEnd', lock: 'small' },
    { id: 'toBoss', from: 'entry', to: 'boss', lock: 'boss' },
  ],
  things: [
    { kind: 'chest', id: 'key', room: 'entry', at: [5, 2], loot: 'smallKey' },
    { kind: 'chest', id: 'bigKey', room: 'keyRoom', at: [5, 5], loot: 'bossKey' },
  ],
};

describe('dungeon format', () => {
  it('places doors on the wall two rooms share', () => {
    const a = { id: 'a', floor: 0, x: 0, z: 0, w: 10, d: 10 };
    expect(doorPlacement(a, { id: 'b', floor: 0, x: 10, z: 4, w: 10, d: 10 })).toEqual({ x: 10, z: 7, wall: 'z', shared: 6 });
    expect(doorPlacement(a, { id: 'c', floor: 0, x: 0, z: 10, w: 6, d: 6 })).toEqual({ x: 3, z: 10, wall: 'x', shared: 6 });
    expect(doorPlacement(a, { id: 'd', floor: 0, x: 11, z: 0, w: 5, d: 5 })).toBeNull(); // a gap between them
    expect(doorPlacement(a, { id: 'e', floor: 1, x: 10, z: 0, w: 5, d: 5 })).toBeNull(); // another floor
  });

  it('accepts the example dungeon', () => {
    expect(validateDungeon(EXAMPLE_DUNGEON)).toEqual([]);
  });

  it('reports the mistakes an author is likely to make, in words', () => {
    const errs = (patch: Partial<DungeonDef>) => validateDungeon(tweak(EXAMPLE_DUNGEON, patch)).join('\n');
    const rooms = EXAMPLE_DUNGEON.rooms, doors = EXAMPLE_DUNGEON.doors, things = EXAMPLE_DUNGEON.things;
    expect(errs({ rooms: [...rooms, { id: 'extra', floor: 0, x: 2, z: 22, w: 5, d: 5 }] })).toMatch(/"entry" and "extra" overlap/);
    expect(errs({ doors: [...doors, { id: 'bad', from: 'entry', to: 'east' }] })).toMatch(/don't share a wall/);
    expect(errs({ doors: [...doors, { id: 'wide', from: 'cellar', to: 'west', width: 10 }] })).toMatch(/doesn't fit/);
    expect(errs({ doors: [...doors, { id: 'skip', from: 'entry', to: 'upper', kind: 'stairs' }] })).toMatch(/don't overlap in plan/);
    expect(errs({ doors: [...doors, { id: 'floors', from: 'east', to: 'upper' }] })).toMatch(/use kind: 'stairs'/);
    expect(errs({ doors: [...doors, { id: 'sw', from: 'hall', to: 'west', lock: { switch: 'nope' } }] })).toMatch(/unknown switch "nope"/);
    expect(errs({ things: [...things, { kind: 'chest', id: 'hallChest', room: 'hall', at: [1, 1], loot: 'heart' }] })).toMatch(/Duplicate id "hallChest"/);
    expect(errs({ things: [...things, { kind: 'chest', id: 'far', room: 'hall', at: [40, 1], loot: 'heart' }] })).toMatch(/outside room "hall"/);
    expect(errs({ goal: 'nowhere' })).toMatch(/unknown room "nowhere"/);
    // Vertical mistakes: a room poking into the floor above, stairs that don't fit or
    // collide, things on a staircase, a pit over another room.
    const tall = rooms.map((r) => (r.id === 'east' ? { ...r, height: 12 } : r));
    expect(errs({ rooms: tall })).toMatch(/"east" is too tall: it reaches into "upper"/);
    const short = doors.map((d) => (d.id === 'eastStairs' ? { ...d, at: [5, 8] as const } : d));
    expect(errs({ doors: short })).toMatch(/don't fit inside room "upper"/);
    expect(errs({ things: [...things, { kind: 'chest', id: 'onStairs', room: 'east', at: [5, 8], loot: 'heart' }] })).toMatch(/"onStairs" stands on "eastStairs"/);
    const pitOverRoom = rooms.map((r) => (r.id === 'upper' ? { ...r, features: [{ kind: 'pit' as const, x: 1, z: 15, w: 2, d: 2 }] } : r));
    expect(errs({ rooms: pitOverRoom })).toMatch(/would open into room "east" below/);
  });
});

describe('dungeon solver', () => {
  it('finishes the example dungeon by the intended route, with no softlocks or dead content', () => {
    const r = solveDungeon(EXAMPLE_DUNGEON);
    expect(r.completable).toBe(true);
    expect(r.softlocks).toEqual([]);
    expect(r.unreachable).toEqual([]);
    expect(r.route).toEqual(['hallWest', 'upperVault']);
  });

  it('respects one-way doors and switches', () => {
    // At the start: the cellar is only reachable by the ledge (one-way, from the locked west
    // room), so its switch is out of reach and the east door stays shut.
    const start = explore(EXAMPLE_DUNGEON);
    expect([...start.rooms].sort()).toEqual(['entry', 'hall']);
    expect(start.smallKeysFound).toBe(1);
    const afterWest = explore(EXAMPLE_DUNGEON, new Set(['hallWest']));
    expect(afterWest.switches.has('cellarSwitch')).toBe(true);
    expect(afterWest.rooms.has('upper')).toBe(true);
  });

  it('drops are one-way, and plates that need an item wait for it', () => {
    // A hole from an upstairs room down into the entry, and a plate that needs a tool.
    const d: DungeonDef = tweak(SOFTLOCK, {
      rooms: [...SOFTLOCK.rooms.filter((r) => r.id !== 'deadEnd'), { id: 'loft', floor: 1, x: 0, z: 0, w: 10, d: 10 }],
      doors: [
        { id: 'toKeyRoom', from: 'entry', to: 'keyRoom', lock: { switch: 'plate' } },
        { id: 'hole', from: 'loft', to: 'entry', kind: 'drop' },
        { id: 'toBoss', from: 'entry', to: 'boss', lock: 'boss' },
      ],
      things: [
        { kind: 'switch', id: 'plate', room: 'entry', at: [3, 3], style: 'plate', needs: 'tether' },
        { kind: 'chest', id: 'bigKey', room: 'keyRoom', at: [5, 5], loot: 'bossKey' },
      ],
    });
    expect(validateDungeon(d)).toEqual([]);
    let p = explore(d);
    expect(p.rooms.has('loft')).toBe(false); // can't climb back up a hole
    expect(p.switches.has('plate')).toBe(false); // no tether yet
    expect(solveDungeon(d).completable).toBe(false);
    // Put the tether upstairs, reachable only by stairs, and it all works.
    d.doors.push({ id: 'up', from: 'entry', to: 'loft', kind: 'stairs' });
    d.things.push({ kind: 'chest', id: 'tetherChest', room: 'loft', at: [5, 5], loot: { item: 'tether' } });
    p = explore(d);
    expect(p.switches.has('plate')).toBe(true);
    expect(logicProblems(d)).toEqual([]); // logic only: these 10 m rooms are too small for real stairs
    expect(validateDungeon(tweak(d, { doors: [...d.doors, { id: 'badHole', from: 'entry', to: 'loft', kind: 'drop' }] })).join()).toMatch(/directly below/);
  });

  it('catches the textbook softlock (a key spent on a dead end)', () => {
    const r = solveDungeon(SOFTLOCK);
    expect(r.completable).toBe(true); // it CAN be finished...
    expect(r.softlocks).toContainEqual(['toDeadEnd']); // ...but also ruined
    expect(checkDungeon(SOFTLOCK).join('\n')).toMatch(/Softlock: spending small keys on "toDeadEnd"/);
    // The fix an author would make: a second key in the dead end.
    const fixed = tweak(SOFTLOCK, { things: [...SOFTLOCK.things, { kind: 'chest', id: 'key2', room: 'deadEnd', at: [5, 5], loot: 'smallKey' }] });
    expect(checkDungeon(fixed)).toEqual([]);
  });

  it('reports an unfinishable dungeon and content nothing can reach', () => {
    const noBossKey = tweak(SOFTLOCK, { things: SOFTLOCK.things.filter((t) => t.id !== 'bigKey') });
    expect(checkDungeon(noBossKey).join('\n')).toMatch(/can't be reached in any order/);
    const island = tweak(EXAMPLE_DUNGEON, { rooms: [...EXAMPLE_DUNGEON.rooms, { id: 'island', floor: 0, x: 40, z: 40, w: 6, d: 6 }] });
    expect(checkDungeon(island).join('\n')).toMatch(/Never reachable: island/);
  });
});

describe('dungeon text map', () => {
  it('draws every floor with doors, stairs and things', () => {
    const map = dungeonMap(EXAMPLE_DUNGEON);
    expect(map).toContain('Floor 0 (entrance level)');
    expect(map).toContain('Floor 1 (up)');
    for (const ch of ['@', 'k', 'B', 's', 'U', 'D', 'X', 'C', 'S', 'e', '?', 'O', 'I', '=']) expect(map, ch).toContain(ch);
    expect(map).toMatch(/hallChest in hall: small key/);
    expect(map).toMatch(/westChest in west: small key \(appears: west cleared\)/);
  });
});

describe('the game dungeons', () => {
  it('are listed in DUNGEONS (each gets its own check below)', () => expect(Array.isArray(DUNGEONS)).toBe(true));
  for (const d of DUNGEONS) {
    it(`${d.id} is well-formed, finishable and softlock-free`, () => {
      expect(checkDungeon(d), dungeonReport(d)).toEqual([]);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { EXAMPLE_DUNGEON } from './example';
import { checkDungeon, doorPlacement, dungeonMap, dungeonReport, DUNGEONS, explore, logicProblems, solveDungeon, validateDungeon, type DungeonDef } from './index';

/** A copy of a dungeon with some parts swapped out, for "what if the author got this wrong" tests. */
const tweak = (base: DungeonDef, patch: Partial<DungeonDef>): DungeonDef => ({ ...structuredClone(base), ...patch });

/** A small dungeon: a crimson key opens the key room (boss key inside); a jade key's door leads to a dead end. */
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
    { id: 'toKeyRoom', from: 'entry', to: 'keyRoom', lock: { key: 'crimson' } },
    { id: 'toDeadEnd', from: 'entry', to: 'deadEnd', lock: { key: 'jade' } },
    { id: 'toBoss', from: 'entry', to: 'boss', lock: 'boss' },
  ],
  things: [
    { kind: 'chest', id: 'key', room: 'entry', at: [5, 2], loot: { key: 'crimson' } },
    { kind: 'chest', id: 'jadeKey', room: 'entry', at: [3, 2], loot: { key: 'jade' } },
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
    expect(errs({ things: [...things, { kind: 'chest', id: 'hallChest', room: 'hall', at: [1, 1], loot: { gems: 5 } }] })).toMatch(/Duplicate id "hallChest"/);
    expect(errs({ things: [...things, { kind: 'chest', id: 'far', room: 'hall', at: [40, 1], loot: { gems: 5 } }] })).toMatch(/outside room "hall"/);
    expect(errs({ goal: 'nowhere' })).toMatch(/unknown room "nowhere"/);
    // Vertical mistakes: a room poking into the floor above, stairs that don't fit or
    // collide, things on a staircase, a pit over another room.
    const tall = rooms.map((r) => (r.id === 'east' ? { ...r, height: 12 } : r));
    expect(errs({ rooms: tall })).toMatch(/"east" is too tall: it reaches into "upper"/);
    const short = doors.map((d) => (d.id === 'eastStairs' ? { ...d, at: [5, 8] as const } : d));
    expect(errs({ doors: short })).toMatch(/don't fit inside room "upper"/);
    expect(errs({ things: [...things, { kind: 'chest', id: 'onStairs', room: 'east', at: [5, 8], loot: { gems: 5 } }] })).toMatch(/"onStairs" stands on "eastStairs"/);
    expect(errs({ things: [...things, { kind: 'enemy', id: 'onStairs2', room: 'east', at: [5, 8], type: 'thornling' }] })).toMatch(/"onStairs2" stands on "eastStairs"/);
    expect(errs({ things: [...things, { kind: 'enemy', id: 'byStairs', room: 'east', at: [3, 8], type: 'thornling' }] })).toMatch(/"byStairs" is too close to the stairs "eastStairs"/);
    const pitOverRoom = rooms.map((r) => (r.id === 'upper' ? { ...r, features: [{ kind: 'pit' as const, x: 1, z: 15, w: 2, d: 2 }] } : r));
    expect(errs({ rooms: pitOverRoom })).toMatch(/would open into room "east" below/);
  });
});

describe('landmark statues', () => {
  const room = { id: 'a', floor: 0, x: 0, z: 0, w: 14, d: 14 };
  const room2 = { id: 'b', floor: 0, x: 14, z: 0, w: 14, d: 14 };
  const withMark = (at: [number, number], extra: DungeonDef['things'] = []): DungeonDef => ({
    id: 'l', name: 'l', goal: 'b', entrance: { room: 'a', at: [3, 12], facing: 'n' }, rooms: [room, room2],
    doors: [{ id: 'ab', from: 'a', to: 'b' }],
    things: [{ kind: 'landmark', id: 'statue', room: 'a', at, style: 'watcher' }, ...extra],
  });
  it('accepts one in open floor and draws it as L', () => {
    expect(validateDungeon(withMark([5, 5]))).toEqual([]);
    expect(dungeonMap(withMark([5, 5]))).toContain('L');
  });
  it('fails one on a doorway approach, another thing, or sticking out of the room', () => {
    expect(validateDungeon(withMark([12, 7])).join('\n')).toContain('opens straight into a landmark "statue"');
    expect(validateDungeon(withMark([5, 5], [{ kind: 'chest', id: 'c', room: 'a', at: [5, 6], loot: { key: 'jade' } }])).join('\n')).toContain('landmark "statue" overlaps chest "c"');
    expect(validateDungeon(withMark([1, 5])).join('\n')).toContain('sticks out');
  });
});

describe('trial room platforms', () => {
  const withPlatforms = (platforms: NonNullable<DungeonDef['rooms'][number]['platforms']>): DungeonDef => ({
    id: 't', name: 't', goal: 'b', entrance: { room: 'a', at: [3, 12], facing: 'n' },
    rooms: [{ id: 'a', floor: 0, x: 0, z: 0, w: 14, d: 14, trial: true, height: 8, platforms }, { id: 'b', floor: 0, x: 14, z: 0, w: 14, d: 14 }],
    doors: [{ id: 'ab', from: 'a', to: 'b' }],
    things: [],
  });
  it('accepts ledges inside the room, clear of the doorway', () => {
    expect(validateDungeon(withPlatforms([{ x: 4, z: 4, w: 2, d: 2, top: 2 }]))).toEqual([]);
  });
  it('fails a ledge sticking out (even when it slides), one too high for the ceiling, or one in front of a door', () => {
    expect(validateDungeon(withPlatforms([{ x: 1, z: 4, w: 4, d: 2, top: 2 }])).join('\n')).toContain('sticks out');
    expect(validateDungeon(withPlatforms([{ x: 10, z: 4, w: 2, d: 2, top: 2, move: { by: [4, 0, 0], period: 4, phase: 0 } }])).join('\n')).toContain('sticks out');
    expect(validateDungeon(withPlatforms([{ x: 4, z: 4, w: 2, d: 2, top: 6.5 }])).join('\n')).toContain('headroom');
    expect(validateDungeon(withPlatforms([{ x: 12, z: 7, w: 2, d: 2, top: 1 }])).join('\n')).toContain('opens straight into a platform');
  });
});

describe('bell posts and bells', () => {
  const one = (things: DungeonDef['things']): DungeonDef => ({
    id: 'b', name: 'b', goal: 'a', entrance: { room: 'a', at: [3, 8], facing: 'n' },
    rooms: [{ id: 'a', floor: 0, x: 0, z: 0, w: 10, d: 10 }], doors: [], things,
  });
  it('accepts a post and a bell, draws them as Y and A, and counts them as content to reach', () => {
    const d = one([{ kind: 'bellPost', id: 'p', room: 'a', at: [3, 3], bell: 'lull' }, { kind: 'bell', id: 'b', room: 'a', at: [7, 3], bell: 'morrow' }]);
    expect(validateDungeon(d)).toEqual([]);
    expect(dungeonMap(d)).toMatch(/Y[^\n]*A/);
    expect(solveDungeon(d).unreachable).toEqual([]);
  });
  it('fails two posts (or two bells) for the same bell', () => {
    const posts = one([{ kind: 'bellPost', id: 'p', room: 'a', at: [3, 3], bell: 'lull' }, { kind: 'bellPost', id: 'q', room: 'a', at: [7, 3], bell: 'lull' }]);
    expect(validateDungeon(posts).join()).toContain('Two posts for the bell "lull"');
    const bells = one([{ kind: 'bell', id: 'p', room: 'a', at: [3, 3], bell: 'morrow' }, { kind: 'bell', id: 'q', room: 'a', at: [7, 3], bell: 'morrow' }]);
    expect(validateDungeon(bells).join()).toContain('Two bells for the bell "morrow"');
  });
});

describe('dungeon solver', () => {
  it('finishes the example dungeon by the intended route, with no softlocks or dead content', () => {
    const r = solveDungeon(EXAMPLE_DUNGEON);
    expect(r.completable).toBe(true);
    expect(r.unreachable).toEqual([]);
    expect(r.route).toEqual(['hallWest', 'upperVault']);
  });

  it('respects one-way doors and switches', () => {
    // At the start: the cellar is only reachable by the ledge (one-way, from the locked west
    // room), so its switch is out of reach and the east door stays shut.
    const noKey = explore(tweak(EXAMPLE_DUNGEON, { things: EXAMPLE_DUNGEON.things.filter((t) => t.id !== 'hallChest') }));
    expect([...noKey.rooms].sort()).toEqual(['entry', 'hall']);
    expect(noKey.switches.size).toBe(0);
    const all = explore(EXAMPLE_DUNGEON);
    expect(all.switches.has('cellarSwitch')).toBe(true);
    expect(all.rooms.has('upper')).toBe(true);
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

  it('opens a key door with its own color only, in any order', () => {
    expect(checkDungeon(SOFTLOCK)).toEqual([]);
    const r = solveDungeon(SOFTLOCK);
    expect(r.completable).toBe(true);
    expect(r.route).toEqual(['toKeyRoom', 'toDeadEnd']);
  });

  it('wants every key color to have exactly one chest and one door', () => {
    const spare = tweak(SOFTLOCK, { things: [...SOFTLOCK.things, { kind: 'chest', id: 'jade2', room: 'entry', at: [7, 2], loot: { key: 'jade' } }] });
    expect(validateDungeon(spare).join('\n')).toMatch(/jade key needs exactly one chest and one door \(has 2 chests, 1 door\)/);
    const noDoor = tweak(SOFTLOCK, { doors: SOFTLOCK.doors.filter((d) => d.id !== 'toDeadEnd') });
    expect(validateDungeon(noDoor).join('\n')).toMatch(/jade key needs exactly one chest and one door \(has 1 chest, 0 doors\)/);
    const noChest = tweak(SOFTLOCK, { things: SOFTLOCK.things.filter((t) => t.id !== 'jadeKey') });
    expect(validateDungeon(noChest).join('\n')).toMatch(/jade key needs exactly one chest and one door \(has 0 chests, 1 door\)/);
  });

  it('reports a key locked behind its own door as unreachable', () => {
    const cycle = tweak(SOFTLOCK, { things: SOFTLOCK.things.map((t) => (t.id === 'key' ? { ...t, room: 'keyRoom' } : t)) });
    expect(validateDungeon(cycle)).toEqual([]);
    expect(checkDungeon(cycle).join('\n')).toMatch(/can't be reached/);
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
    expect(map).toMatch(/hallChest in hall: crimson key/);
    expect(map).toMatch(/westChest in west: azure key \(appears: west cleared\)/);
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

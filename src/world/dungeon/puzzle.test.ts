import { describe, expect, it } from 'vitest';
import { SHRINE } from './defs/shrine';
import type { DungeonDef, ThingDef } from './format';
import { roomGrid } from './grid';
import { puzzleProblems, solveRoomPuzzle } from './puzzle';

const room = (id: string) => SHRINE.rooms.find((r) => r.id === id)!;

/** A one-room dungeon for puzzle tests: 10×10 m (5×5 cells), one door on the south wall. */
const box = (things: ThingDef[], features: DungeonDef['rooms'][number]['features'] = []): DungeonDef => ({
  id: 't', name: 't', goal: 'a', entrance: { room: 'a', at: [5, 9], facing: 'n' },
  rooms: [{ id: 'a', floor: 0, x: 0, z: 0, w: 10, d: 10, features }],
  doors: [], things,
});

describe('room grid', () => {
  it('marks pillars, stairs and shafts solid, and pits as pits', () => {
    const nave = roomGrid(SHRINE, room('nave'));
    expect([nave.cols, nave.rows]).toEqual([8, 10]);
    expect(nave.blocked[1][1] && nave.blocked[2][2]).toBe(true); // the pillar at (4, 4) touches 4 cells
    expect(nave.blocked[2][5]).toBe(false); // the stone's row is clear
    const pit = roomGrid(SHRINE, room('pitHall'));
    expect(pit.pit[2][4] && pit.pit[5][9]).toBe(true); // the pit runs the hall's length, 8 m wide
    expect(pit.pit[0][4] || pit.pit[7][4]).toBe(false);
    const well = roomGrid(SHRINE, room('stairwell'));
    expect(well.blocked[1][5]).toBe(true); // the up stairs
    expect(well.entries.length).toBeGreaterThan(2); // the doorway, both stair landings
  });
});

describe('wakestone puzzles', () => {
  it('the nave\'s plate can be pressed with the sword alone; the loft\'s needs the glove', () => {
    expect(solveRoomPuzzle(SHRINE, room('nave'), false).plates.get('navePlate')).toBe(true);
    expect(solveRoomPuzzle(SHRINE, room('loft'), false).plates.get('loftPlate')).toBe(false);
    expect(solveRoomPuzzle(SHRINE, room('loft'), true).plates.get('loftPlate')).toBe(true);
    expect(solveRoomPuzzle(SHRINE, room('entry'), false).doorways.get('entryStone')).toBe(true);
    expect(puzzleProblems(SHRINE)).toEqual([]);
  });

  it('catches a plate no stone can reach', () => {
    // The plate sits in the northeast corner, walled in by two blocks: nothing gets there.
    const d = box([
      { kind: 'stone', id: 's', room: 'a', at: [3, 5] },
      { kind: 'switch', id: 'p', room: 'a', at: [9, 1], style: 'plate' },
    ], [{ kind: 'block', x: 6, z: 0, w: 2, d: 2, h: 2 }, { kind: 'block', x: 8, z: 2, w: 2, d: 2, h: 2 }]);
    expect(puzzleProblems(d)).toContain('Room "a": no stone can be moved onto plate "p" (with the sword alone)');
  });

  it('a stone stuck in a corner bounces back out (struck against the wall)', () => {
    // Pushing alone could never move it (Wren can't get behind it); bouncing can.
    const d = box([
      { kind: 'stone', id: 's', room: 'a', at: [1, 1] },
      { kind: 'switch', id: 'p', room: 'a', at: [7, 5], style: 'plate' },
    ]);
    expect(puzzleProblems(d)).toEqual([]);
  });

  it('every stone must matter; two hold plates need two stones down at once', () => {
    const plates: ThingDef[] = [
      { kind: 'switch', id: 'p', room: 'a', at: [3, 3], style: 'plate', hold: true },
      { kind: 'switch', id: 'q', room: 'a', at: [7, 3], style: 'plate', hold: true },
    ];
    const one = box([{ kind: 'stone', id: 's', room: 'a', at: [5, 5] }, ...plates]);
    expect(puzzleProblems(one)).toContain('Room "a": its hold plates can\'t all be held down at the same time');
    const two = box([{ kind: 'stone', id: 's', room: 'a', at: [3, 5] }, { kind: 'stone', id: 't', room: 'a', at: [7, 5] }, ...plates]);
    expect(puzzleProblems(two)).toEqual([]);
    // A third stone adds nothing: it's flagged.
    const three = box([{ kind: 'stone', id: 's', room: 'a', at: [3, 5] }, { kind: 'stone', id: 't', room: 'a', at: [7, 5] }, { kind: 'stone', id: 'u', room: 'a', at: [5, 7] }, ...plates]);
    expect(puzzleProblems(three).join()).toMatch(/serves no purpose/);
  });

  it('a stone pushed into a pit fills it, and the next one can cross', () => {
    const pit = [{ kind: 'pit' as const, x: 0, z: 2, w: 10, d: 2 }]; // wall to wall
    const plate: ThingDef = { kind: 'switch', id: 'p', room: 'a', at: [5, 1], style: 'plate' };
    // One stone: pushed north it falls in, and nothing else can reach the plate.
    const one = box([{ kind: 'stone', id: 's', room: 'a', at: [5, 5] }, plate], pit);
    expect(solveRoomPuzzle(one, one.rooms[0], false).plates.get('p')).toBe(false);
    // Two: the first fills the pit, the second rolls over it onto the plate.
    const two = box([{ kind: 'stone', id: 's', room: 'a', at: [5, 5] }, { kind: 'stone', id: 't', room: 'a', at: [5, 7] }, plate], pit);
    expect(solveRoomPuzzle(two, two.rooms[0], false).plates.get('p')).toBe(true);
  });

  it('a heavy stone only moves with the glove', () => {
    const things: ThingDef[] = [
      { kind: 'stone', id: 's', room: 'a', at: [5, 5], heavy: true },
      { kind: 'switch', id: 'p', room: 'a', at: [5, 7], style: 'plate' },
    ];
    const d = box(things);
    expect(solveRoomPuzzle(d, d.rooms[0], false).plates.get('p')).toBe(false);
    expect(solveRoomPuzzle(d, d.rooms[0], true).plates.get('p')).toBe(true);
  });
});

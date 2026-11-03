import { SAVE_VERSION, type DungeonSave, type SaveData } from '../core/save';
import { floorY, worldPos, type DungeonDef } from '../world/dungeon/format';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { GATE, GORGE, gorgePoint, MORROW_POST, VILLAGE } from '../world/overworld/layout';

/**
 * Dev-menu save states: ready-made points in the game to jump to while testing. Loading one
 * replaces the current save. Built from the game's own data (the shrine's ids), so adding a
 * chest or door to a dungeon doesn't leave a state behind. Dev builds only (see game.ts).
 */
export interface DevState {
  name: string;
  /** Null: a brand-new game (the intro plays). */
  save: SaveData | null;
  /** Where Wren stands; omitted = the area's spawn. `y` omitted = the ground (or floor) there. */
  at?: { x: number; z: number; y?: number; facing: number };
}

const base = (o: Partial<SaveData>): SaveData => ({
  version: SAVE_VERSION,
  flags: [], keys: 0, area: 'overworld', items: [], dungeons: {}, flasks: [], bells: { carried: [], hung: [] },
  gems: 0, hp: 6, maxHp: 6, hours: 9, day: 1, savedAt: 0,
  ...o,
});

const SWORD_AND_BED = ['metMaren', 'hasShield', 'village.scare', 'gotGroveKey', 'groveChestOpened', 'hasSword', 'village.millKey'];
const SHRINE_OPEN = [...SWORD_AND_BED, 'lamplighterDefeated', 'hollowVessel', 'shrineOpen'];
const emptyDungeon = (): DungeonSave => ({ keys: [], bossKey: false, doors: [], chests: [], switches: [], cleared: [], done: false });

/** Everything in a dungeon done except the boss: doors open, switches pressed, chests opened, fight rooms cleared, the boss key held. */
export function completedDungeon(def: DungeonDef): { progress: DungeonSave; gems: number } {
  const chests = def.things.flatMap((t) => (t.kind === 'chest' ? [t] : []));
  // Rooms behind a door that waits for another room to be cleared (the boss's seal room): not part of "everything but the boss".
  const hidden = new Set(def.doors.flatMap((d) => (d.lock && typeof d.lock === 'object' && 'cleared' in d.lock ? [d.to] : [])));
  return {
    progress: {
      keys: [],
      bossKey: chests.some((c) => c.loot === 'bossKey'),
      doors: def.doors.filter((d) => d.lock && d.lock !== 'boss' && !(typeof d.lock === 'object' && ('item' in d.lock || 'cleared' in d.lock))).map((d) => d.id),
      chests: chests.map((c) => c.id),
      switches: def.things.flatMap((t) => (t.kind === 'switch' && !hidden.has(t.room) ? [t.id] : [])),
      cleared: [...new Set(def.things.flatMap((t) => (t.kind === 'enemy' ? [t.room] : [])))],
      done: false,
    },
    gems: chests.reduce((n, c) => n + (typeof c.loot === 'object' && 'gems' in c.loot ? c.loot.gems : 0), 0),
  };
}

function shrineAtBossDoor(): DevState {
  const { progress, gems } = completedDungeon(SHRINE);
  const ante = SHRINE.rooms.find((r) => r.id === 'bossAnte')!;
  const [x, z] = worldPos(ante, [8, 2]); // just south of the boss door, which is in the room's north wall
  return {
    name: 'Shrine: at the boss door',
    save: base({
      flags: [...SHRINE_OPEN, 'village.stonewardTunic'], area: 'shrine', items: ['tether'], dungeons: { shrine: progress },
      flasks: ['life', 'attack'], gems, hp: 8, maxHp: 8, hours: 10, bells: { carried: [], hung: ['morrow', 'lull'] },
    }),
    at: { x, z, y: floorY(SHRINE, ante.floor) + 0.05, facing: Math.PI },
  };
}

/** The Warden beaten (the door to the seal room open, the causeway up), Wren on the ledge before it. */
function shrineAfterBoss(): DevState {
  const { progress, gems } = completedDungeon(SHRINE);
  const hearth = SHRINE.rooms.find((r) => r.id === 'boss')!;
  const seal = SHRINE.doors.find((d) => d.lock && typeof d.lock === 'object' && 'cleared' in d.lock)!;
  progress.done = true;
  progress.cleared.push(hearth.id);
  progress.doors.push(seal.id);
  const [x, z] = worldPos(hearth, [24, 8]);
  return {
    name: 'Shrine: Warden asleep, the seal room open',
    save: base({
      flags: [...SHRINE_OPEN, 'village.stonewardTunic'], area: 'shrine', items: ['tether'], dungeons: { shrine: progress },
      flasks: ['life', 'attack'], gems, hp: 8, maxHp: 8, hours: 10, bells: { carried: [], hung: ['morrow', 'lull'] },
    }),
    at: { x, z, y: floorY(SHRINE, hearth.floor) + 0.05, facing: Math.PI },
  };
}

/**
 * The Warden beaten, the Heart Vessel taken, the Keepers' ward broken (the gate stands open), both bells hung, Wren on the
 * field in front of the gate facing the Northpass: where the next stretch of the game starts.
 */
function atTheGate(): DevState {
  const { progress, gems } = completedDungeon(SHRINE);
  const hearth = SHRINE.rooms.find((r) => r.id === 'boss')!;
  const seal = SHRINE.doors.find((d) => d.lock && typeof d.lock === 'object' && 'cleared' in d.lock)!;
  progress.done = true;
  progress.cleared.push(hearth.id);
  progress.doors.push(seal.id);
  return {
    name: 'Northpass: at the opened gate, Warden beaten',
    save: base({
      flags: [...SHRINE_OPEN, 'village.stonewardTunic', 'gravelheartVessel', 'valleyOpen'], items: ['tether'], dungeons: { shrine: progress },
      flasks: ['life', 'attack'], gems, hp: 10, maxHp: 10, hours: 10, bells: { carried: [], hung: ['morrow', 'lull'] },
    }),
    at: { x: GATE.x, z: GATE.z + 9, facing: Math.PI },
  };
}

/** On Thistledown's square, 3 m from the Morrowbell's post toward the well, facing it. */
function atMorrowPost(): DevState['at'] {
  const dx = VILLAGE.x - MORROW_POST.x, dz = VILLAGE.z - MORROW_POST.z, len = Math.hypot(dx, dz);
  return { x: MORROW_POST.x + (dx / len) * 3, z: MORROW_POST.z + (dz / len) * 3, facing: Math.atan2(-dx, -dz) };
}

/** The bells (docs/bells.md): the first one in hand by its post, the second (the travel menu wakes), and both hung. */
function bellStates(): DevState[] {
  const { progress, gems } = completedDungeon(SHRINE);
  const late = { flags: SHRINE_OPEN, items: ['tether'], dungeons: { shrine: progress }, flasks: ['life', 'attack'], gems, hp: 8, maxHp: 8, hours: 10 };
  return [
    { name: 'Bells: Morrowbell in hand, Thistledown', save: base({ flags: SWORD_AND_BED, bells: { carried: ['morrow'], hung: [] } }), at: atMorrowPost() },
    { name: 'Bells: Lullbell in hand, shrine entry', save: base({ ...late, area: 'shrine', bells: { carried: ['lull'], hung: ['morrow'] } }) },
    { name: 'Bells: Bell Shaft start', save: base({ ...late, area: 'shrine', bells: { carried: [], hung: ['morrow'] } }), at: atBellShaft() },
    { name: 'Bells: gorge mouth', save: base({ flags: SWORD_AND_BED, bells: { carried: [], hung: [] } }), at: atGorgeMouth() },
    { name: 'Bells: gorge climb', save: base({ flags: SWORD_AND_BED, bells: { carried: [], hung: [] } }), at: atGorgeClimb() },
    { name: 'Bells: both hung, Thistledown', save: base({ ...late, bells: { carried: [], hung: ['morrow', 'lull'] } }), at: atMorrowPost() },
  ];
}

/** Just outside the Hushing Gorge's mouth, facing in. */
function atGorgeMouth(): DevState['at'] {
  const p = gorgePoint(0);
  return { x: p.x - p.dx * 6, z: p.z - p.dz * 6, facing: Math.atan2(p.dx, p.dz) };
}

/** On the first pillar of the gorge's climb (past its monsters), facing the pit. */
function atGorgeClimb(): DevState['at'] {
  const p = gorgePoint(GORGE.pitAt - 1);
  return { x: p.x, z: p.z, facing: Math.atan2(p.dx, p.dz) };
}

/** Inside the Bell Shaft (the Lullbell's trial), 1.5 m in from its door, facing east at the climb. */
function atBellShaft(): DevState['at'] {
  const room = SHRINE.rooms.find((r) => r.id === 'bellShaft')!;
  const [x, z] = worldPos(room, [1.5, -15 - room.z]); // the door (`anteBell`, offset 5 along the shared wall) is at world z -15
  return { x, z, y: floorY(SHRINE, room.floor) + 0.05, facing: Math.PI / 2 };
}

export const DEV_STATES: DevState[] = [
  { name: 'New game', save: null },
  {
    name: 'Night, outside the Hollow',
    save: base({ flags: SWORD_AND_BED, hours: 22 }),
    // On the south road, a good way before the hollow's trigger ring; facing south toward it.
    at: { x: -22, z: 100, facing: 0 },
  },
  {
    name: 'Shrine: start',
    save: base({ flags: SHRINE_OPEN, area: 'shrine', dungeons: { shrine: emptyDungeon() }, hp: 8, maxHp: 8, hours: 10 }),
  },
  shrineAtBossDoor(),
  shrineAfterBoss(),
  atTheGate(),
  ...bellStates(),
];

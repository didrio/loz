import { SAVE_VERSION, type DungeonSave, type SaveData } from '../core/save';
import { HINTS, hintFlag } from './hints';
import { floorY, worldPos, type DungeonDef } from '../world/dungeon/format';
import { SHRINE } from '../world/dungeon/defs/shrine';
import { GATE, GORGE, gorgePoint, MORROW_POST, VILLAGE } from '../world/overworld/layout';
import { OVERLOOK } from '../world/overworld/mere';

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
    name: 'Waking Shrine: at the boss door',
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
    name: 'Waking Shrine: Gravelheart beaten, seal room open',
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
  progress.switches.push('sealStone'); // the ward is broken: its sigil has been written
  return {
    name: 'Northpass: the gate is open',
    save: base({
      flags: [...SHRINE_OPEN, 'village.stonewardTunic', 'gravelheartVessel', 'valleyOpen'], items: ['tether'], dungeons: { shrine: progress },
      flasks: ['life', 'attack'], gems, hp: 10, maxHp: 10, hours: 10, bells: { carried: [], hung: ['morrow', 'lull'] },
    }),
    at: { x: GATE.x, z: GATE.z + 9, facing: Math.PI },
  };
}

/** The gate open and the Waybell hung at Wayfarers' Camp: Wren at the canyon's mouth, where the road goes down to Sallowmere, facing the mere. */
function atTheDescent(): DevState {
  const gate = atTheGate();
  return {
    name: 'Sallowmere: the descent',
    save: { ...gate.save!, bells: { carried: [], hung: ['morrow', 'lull', 'way'] } },
    at: { x: OVERLOOK.x, z: OVERLOOK.z, facing: OVERLOOK.facing },
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
    { name: 'Thistledown: Morrowbell in hand', save: base({ flags: SWORD_AND_BED, bells: { carried: ['morrow'], hung: [] } }), at: atMorrowPost() },
    { name: 'Waking Shrine: Lullbell in hand', save: base({ ...late, area: 'shrine', bells: { carried: ['lull'], hung: ['morrow'] } }) },
    { name: 'Waking Shrine: the Bell Shaft', save: base({ ...late, area: 'shrine', bells: { carried: [], hung: ['morrow'] } }), at: atBellShaft() },
    { name: 'Thistledown: both bells hung', save: base({ ...late, bells: { carried: [], hung: ['morrow', 'lull'] } }), at: atMorrowPost() },
  ];
}

/** A save with the sword and the bed key, no bells yet, Wren at `at`. */
function gorgeState(at: DevState['at']): Pick<DevState, 'save' | 'at'> {
  return { save: base({ flags: SWORD_AND_BED, bells: { carried: [], hung: [] } }), at };
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

/**
 * Adds every keepers' note and sigil message Wren could have by the point a save is at, so
 * the pause menu's Hints and Messages tabs are filled in to match: all four notes once she has
 * the sword (they sit in the open valley), the hollow's message once the Lamplighter is down,
 * and each shrine message whose room is cleared (or whose switch is pressed).
 */
export function withNotes(save: SaveData): SaveData {
  const flags = new Set(save.flags);
  if (flags.has('hasSword')) for (const h of HINTS) flags.add(hintFlag(h.id));
  if (flags.has('lamplighterDefeated')) flags.add('sigil.hollow');
  const shrine = save.dungeons.shrine;
  if (shrine) {
    for (const t of SHRINE.things) {
      if (t.kind !== 'sigil') continue;
      const c = t.appears;
      const written = !c || ('cleared' in c && shrine.cleared.includes(c.cleared)) || ('switch' in c && shrine.switches.includes(c.switch));
      if (written) flags.add(t.id);
    }
  }
  return { ...save, flags: [...flags] };
}

const [morrowInHand, lullInHand, bellShaft, bothHung] = bellStates();

/** In the order the game is played; the pause menu's Dev tab lists them as they are here. */
const STATES: DevState[] = [
  { name: 'A new game', save: null },
  { name: 'Hushing Gorge: the mouth', ...gorgeState(atGorgeMouth()) },
  { name: 'Hushing Gorge: the climb', ...gorgeState(atGorgeClimb()) },
  morrowInHand,
  {
    name: 'Gloaming Hollow: night, before the Lamplighter',
    save: base({ flags: SWORD_AND_BED, hours: 22 }),
    // On the south road, a good way before the hollow's trigger ring; facing south toward it.
    at: { x: -22, z: 100, facing: 0 },
  },
  {
    name: 'Waking Shrine: the entrance',
    save: base({ flags: SHRINE_OPEN, area: 'shrine', dungeons: { shrine: emptyDungeon() }, hp: 8, maxHp: 8, hours: 10 }),
  },
  bellShaft,
  lullInHand,
  bothHung,
  shrineAtBossDoor(),
  shrineAfterBoss(),
  atTheGate(),
  atTheDescent(),
];

export const DEV_STATES: DevState[] = STATES.map((s) => (s.save ? { ...s, save: withNotes(s.save) } : s));

/** A state's id for `?state=<id>`: its name in lowercase letters and hyphens ("Waking Shrine: at the boss door" → "waking-shrine-at-the-boss-door"). */
export const devStateId = (s: DevState) => s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The state `?state=` names: by id, or by its 1-based number in the Dev tab's list. */
export function findDevState(key: string): DevState | undefined {
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 ? DEV_STATES[n - 1] : DEV_STATES.find((s) => devStateId(s) === key);
}

import type { DungeonDef } from './format';

/**
 * A small made-up dungeon that uses every feature of the format. It's the reference for
 * writing real ones and the fixture the tests check; it is not in the game.
 *
 * The intended route: take the key from the hall chest → unlock the west room (a fight room; a
 * second key appears when it's cleared) → drop off the ledge into the cellar (one-way) →
 * press the switch → lift the bar back to the entry (one-way) → the switch has opened the
 * east door → climb the stairs → unlock the vault with the second key → boss key → the boss.
 */
export const EXAMPLE_DUNGEON: DungeonDef = {
  id: 'example',
  name: 'The Example Keep',
  entrance: { room: 'entry', at: [6, 8], facing: 'n' },
  goal: 'boss',
  rooms: [
    { id: 'entry', floor: 0, x: 0, z: 20, w: 12, d: 10 },
    { id: 'hall', floor: 0, x: 0, z: 8, w: 12, d: 12, features: [{ kind: 'pillar', x: 3, z: 3 }, { kind: 'pillar', x: 9, z: 3 }] },
    { id: 'west', floor: 0, x: -10, z: 8, w: 10, d: 12 },
    { id: 'cellar', floor: 0, x: -10, z: 20, w: 10, d: 10, features: [{ kind: 'pit', x: 2, z: 2, w: 3, d: 4 }] },
    { id: 'east', floor: 0, x: 12, z: 4, w: 10, d: 16 },
    { id: 'boss', name: 'The Old Throne', floor: 0, x: 0, z: -6, w: 12, d: 14, height: 9 },
    { id: 'upper', floor: 1, x: 12, z: 0, w: 10, d: 20, features: [{ kind: 'block', x: 1, z: 6, w: 2, d: 2, h: 1 }] },
    { id: 'vault', floor: 1, x: 22, z: 0, w: 8, d: 10 },
  ],
  doors: [
    { id: 'entryHall', from: 'entry', to: 'hall' },
    { id: 'hallWest', from: 'hall', to: 'west', lock: { key: 'crimson' } },
    { id: 'ledge', from: 'west', to: 'cellar', oneWay: true },
    { id: 'cellarBar', from: 'cellar', to: 'entry', oneWay: true },
    { id: 'hallEast', from: 'hall', to: 'east', lock: { switch: 'cellarSwitch' } },
    { id: 'eastStairs', from: 'east', to: 'upper', kind: 'stairs', at: [5, 14], up: 'n' },
    { id: 'upperVault', from: 'upper', to: 'vault', lock: { key: 'azure' }, offset: 5 },
    { id: 'bossDoor', from: 'hall', to: 'boss', lock: 'boss' },
  ],
  things: [
    { kind: 'chest', id: 'hallChest', room: 'hall', at: [6, 6], loot: { key: 'crimson' } },
    { kind: 'enemy', id: 'westThorn1', room: 'west', at: [3, 4], type: 'thornling' },
    { kind: 'enemy', id: 'westThorn2', room: 'west', at: [7, 8], type: 'thornling' },
    { kind: 'chest', id: 'westChest', room: 'west', at: [5, 6], loot: { key: 'azure' }, appears: { cleared: 'west' } },
    { kind: 'switch', id: 'cellarSwitch', room: 'cellar', at: [7, 7] },
    { kind: 'chest', id: 'upperChest', room: 'upper', at: [2, 16], loot: { gems: 5 } },
    { kind: 'chest', id: 'vaultChest', room: 'vault', at: [4, 5], loot: 'bossKey' },
    { kind: 'sign', id: 'entrySign', room: 'entry', at: [2, 2], text: 'The keep remembers its keys.' },
    { kind: 'boss', id: 'keeper', room: 'boss', type: 'example' },
  ],
};

import type { DungeonDef } from '../format';

/**
 * The Waking Shrine, the first dungeon: 25 rooms on four floors, each floor a wing with its
 * own look and mechanic. Design notes, the route and the boss are in docs/shrine.md; keep
 * the two in step.
 *
 * - **The Sleeping Halls** (floor 0, sandstone): pushing wakestones onto plates, filling pits
 *   with them to make a path, statues that turn out to be sentinels.
 * - **The Upper Galleries** (floor 1, marble): crystals that must all be lit, the Tether
 *   Glove, a heavy stone only the glove moves, drop-hole shortcuts.
 * - **The Undercroft** (floor -1, mossy stone): water channels to fill, a pit too wide to
 *   jump (the glove's bridge), a heavy-stone cellar, shellbacks.
 * - **The Deep Hearth** (floor -2, basalt): a gauntlet fight, the boss key vault (push and
 *   pull together), the antechamber with its shortcut up, Gravelheart.
 */
export const SHRINE: DungeonDef = {
  id: 'shrine',
  name: 'The Waking Shrine',
  music: 'shrine',
  entrance: { room: 'entry', at: [5, 6], facing: 'e' },
  goal: 'boss',
  rooms: [
    // ── The Sleeping Halls (floor 0) ────────────────────────────────────────────────────
    { id: 'entry', name: 'Hall of Sleepers', floor: 0, x: 0, z: 0, w: 14, d: 12, theme: 'sandstone' },
    {
      id: 'nave', name: 'The Nave', floor: 0, x: 14, z: -4, w: 16, d: 20, theme: 'sandstone',
      features: [{ kind: 'pillar', x: 4, z: 4 }, { kind: 'pillar', x: 12, z: 4 }, { kind: 'pillar', x: 4, z: 16 }, { kind: 'pillar', x: 12, z: 16 }],
    },
    { id: 'statueGallery', name: 'Gallery of Statues', floor: 0, x: 0, z: 12, w: 14, d: 14, height: 9, theme: 'sandstone' },
    { id: 'southCell', name: 'Sentinel Cell', floor: 0, x: 14, z: 16, w: 16, d: 10, theme: 'sandstone' },
    { id: 'northCell', name: 'Barred Cell', floor: 0, x: 14, z: -20, w: 16, d: 16, theme: 'sandstone' },
    { id: 'stairwell', name: 'Stairwell', floor: 0, x: 30, z: -4, w: 10, d: 20, theme: 'sandstone' },
    {
      id: 'plateHall', name: 'Hall of Plates', floor: 0, x: 30, z: 16, w: 16, d: 12, theme: 'sandstone',
      features: [{ kind: 'pillar', x: 8, z: 6 }],
    },
    {
      id: 'sunkenCourt', name: 'Sunken Court', floor: 0, x: 46, z: 16, w: 18, d: 18, theme: 'sandstone',
      features: [{ kind: 'pit', x: 10, z: 0, w: 4, d: 18 }],
    },
    // ── The Upper Galleries (floor 1) ───────────────────────────────────────────────────
    { id: 'gallery', name: 'Long Gallery', floor: 1, x: 30, z: -14, w: 10, d: 30, theme: 'marble' },
    { id: 'tetherRoom', name: 'Glove Shrine', floor: 1, x: 40, z: -14, w: 12, d: 12, theme: 'marble' },
    { id: 'echoHall', name: 'Echo Hall', floor: 1, x: 52, z: -14, w: 12, d: 14, theme: 'marble' },
    { id: 'loft', name: 'Stone Loft', floor: 1, x: 14, z: -14, w: 16, d: 16, theme: 'marble' },
    { id: 'crystalWalk', name: 'Crystal Walk', floor: 1, x: 30, z: 16, w: 16, d: 12, theme: 'marble' },
    { id: 'lookout', name: 'Lookout', floor: 1, x: 46, z: 16, w: 8, d: 12, theme: 'marble' },
    // ── The Undercroft (floor -1) ───────────────────────────────────────────────────────
    { id: 'crypt', name: 'Crypt', floor: -1, x: 24, z: -4, w: 16, d: 20, theme: 'moss' },
    { id: 'pitHall', name: 'Pit Hall', floor: -1, x: 8, z: -4, w: 16, d: 20, theme: 'moss', features: [{ kind: 'pit', x: 4, z: 0, w: 8, d: 20 }] },
    {
      id: 'rootCellar', name: 'Root Cellar', floor: -1, x: -8, z: -4, w: 16, d: 20, theme: 'moss',
      features: [{ kind: 'block', x: 6, z: 0, w: 2, d: 10, h: 3 }, { kind: 'block', x: 6, z: 12, w: 2, d: 8, h: 3 }],
    },
    { id: 'ossuary', name: 'Ossuary', floor: -1, x: 40, z: -4, w: 14, d: 20, theme: 'moss' },
    { id: 'cistern', name: 'Cistern', floor: -1, x: 24, z: 16, w: 20, d: 14, theme: 'moss', features: [{ kind: 'pit', x: 0, z: 6, w: 20, d: 2 }] },
    { id: 'deepShaft', name: 'Deep Shaft', floor: -1, x: 14, z: -20, w: 16, d: 16, theme: 'moss' },
    // ── The Deep Hearth (floor -2) ──────────────────────────────────────────────────────
    { id: 'emberHall', name: 'Ember Hall', floor: -2, x: 40, z: -4, w: 14, d: 20, theme: 'basalt' },
    { id: 'gauntlet', name: 'The Gauntlet', floor: -2, x: 24, z: -4, w: 16, d: 20, theme: 'basalt' },
    {
      id: 'keyVault', name: 'Key Vault', floor: -2, x: 54, z: -4, w: 14, d: 20, height: 9, theme: 'basalt',
      features: [{ kind: 'block', x: 4, z: 8, w: 6, d: 2, h: 3 }],
    },
    { id: 'bossAnte', name: 'Antechamber', floor: -2, x: 14, z: -20, w: 16, d: 16, theme: 'basalt' },
    { id: 'boss', name: "Warden's Hearth", floor: -2, x: 6, z: -40, w: 24, d: 20, height: 12, theme: 'basalt' },
  ],
  doors: [
    // The Sleeping Halls.
    // Narrow and on the grid, so the teaching stone fills it: one strike from the side clears it.
    { id: 'entryNave', from: 'entry', to: 'nave', width: 2, offset: 7 },
    { id: 'entryStatues', from: 'entry', to: 'statueGallery' },
    { id: 'naveSouth', from: 'nave', to: 'southCell' },
    // Near the south end, so it opens beside the foot of the up stairs, not into their side.
    { id: 'naveEast', from: 'nave', to: 'stairwell', lock: { switch: 'navePlate' }, offset: 18 },
    // The shortcut: barred from the hub, lifted from the north side late in the dungeon.
    { id: 'naveNorth', from: 'northCell', to: 'nave', lock: { switch: 'northBar' } },
    { id: 'southPlates', from: 'southCell', to: 'plateHall' },
    { id: 'platesCourt', from: 'plateHall', to: 'sunkenCourt', lock: { switches: ['plateA', 'plateB'] } },
    // Two flights share the stairwell's footprint in separate lanes: up along the west
    // wall (climbing north), down along the east wall (into the crypt, climbing south).
    { id: 'stairsUp', from: 'stairwell', to: 'gallery', kind: 'stairs', at: [2.5, 16], up: 'n' },
    { id: 'stairsDown', from: 'stairwell', to: 'crypt', kind: 'stairs', at: [13.5, 3], up: 's' },
    // The Upper Galleries.
    { id: 'galleryLoft', from: 'gallery', to: 'loft' },
    { id: 'loftDrop', from: 'loft', to: 'nave', kind: 'drop' },
    { id: 'galleryCrystals', from: 'gallery', to: 'crystalWalk' },
    { id: 'crystalLookout', from: 'crystalWalk', to: 'lookout' },
    { id: 'lookoutDrop', from: 'lookout', to: 'sunkenCourt', kind: 'drop' },
    // The glove waits behind the Crystal Walk: all three crystals lit raise these bars.
    { id: 'tetherDoor', from: 'gallery', to: 'tetherRoom', lock: { switches: ['crystalA', 'crystalB', 'crystalC'] } },
    { id: 'echoDoor', from: 'tetherRoom', to: 'echoHall', lock: { key: 'violet' } },
    // The Undercroft.
    { id: 'cryptPit', from: 'crypt', to: 'pitHall', lock: { key: 'crimson' }, offset: 16 },
    // The pit is too wide to jump; only the glove bridges it.
    { id: 'pitRoots', from: 'pitHall', to: 'rootCellar', lock: { item: 'tether' } },
    { id: 'cryptOssuary', from: 'crypt', to: 'ossuary', lock: { key: 'jade' }, offset: 18 },
    { id: 'cryptCistern', from: 'crypt', to: 'cistern', lock: { key: 'amber' } },
    { id: 'deepStairs', from: 'ossuary', to: 'emberHall', kind: 'stairs', at: [7, 17], up: 'n' },
    { id: 'shaftUp', from: 'deepShaft', to: 'northCell', kind: 'stairs', at: [12.5, 14], up: 'n' },
    { id: 'shaftDown', from: 'deepShaft', to: 'bossAnte', kind: 'stairs', at: [3.5, 2], up: 's' },
    // The Deep Hearth.
    { id: 'emberGauntlet', from: 'emberHall', to: 'gauntlet', lock: { key: 'azure' } },
    { id: 'emberVault', from: 'emberHall', to: 'keyVault' },
    { id: 'gauntletAnte', from: 'gauntlet', to: 'bossAnte' },
    { id: 'bossDoor', from: 'bossAnte', to: 'boss', lock: 'boss' },
  ],
  things: [
    // ── Hall of Sleepers: teach. A stone fills the doorway; one strike from the side clears it.
    { kind: 'sign', id: 'entrySign', room: 'entry', at: [4, 2], text: 'Sleep, stones, while the lantern burns. Wake, and keep the way.' },
    { kind: 'stone', id: 'entryStone', room: 'entry', at: [13, 7] },
    // The Lullbell's post, in view as you come in; the bell itself waits by the boss door (docs/bells.md).
    { kind: 'bellPost', id: 'lullPost', room: 'entry', at: [10, 9], bell: 'lull' },
    // ── The Nave: test. Slide the stone onto the plate (with thornlings about) to open the stairwell.
    { kind: 'enemy', id: 'naveThorn1', room: 'nave', at: [4, 8], type: 'thornling' },
    { kind: 'enemy', id: 'naveThorn2', room: 'nave', at: [12, 14], type: 'thornling' },
    { kind: 'enemy', id: 'naveThorn3', room: 'nave', at: [8, 18], type: 'thornling' },
    { kind: 'stone', id: 'naveStone', room: 'nave', at: [5, 11] },
    { kind: 'switch', id: 'navePlate', room: 'nave', at: [11, 11], style: 'plate' },
    // Landmark: the lantern keeper, its lantern arm pointing back at the doorway from the entry hall.
    { kind: 'landmark', id: 'naveKeeper', room: 'nave', at: [8, 5], style: 'lanternKeeper', facing: -0.93 },
    // ── Gallery of Statues: the statues along the walls are asleep... three of them aren't.
    { kind: 'sign', id: 'statueSign', room: 'statueGallery', at: [7, 2], text: 'Here stand the shrine\'s keepers. Do not wake them.' },
    { kind: 'enemy', id: 'statueSentinel1', room: 'statueGallery', at: [3, 7], type: 'sentinel' },
    { kind: 'enemy', id: 'statueSentinel2', room: 'statueGallery', at: [11, 7], type: 'sentinel' },
    { kind: 'enemy', id: 'statueSentinel3', room: 'statueGallery', at: [7, 11], type: 'sentinel' },
    { kind: 'chest', id: 'statueChest', room: 'statueGallery', at: [7, 7], loot: { gems: 20 }, appears: { cleared: 'statueGallery' } },
    // ── Sentinel Cell: a key.
    { kind: 'enemy', id: 'southSentinel1', room: 'southCell', at: [4, 5], type: 'sentinel' },
    { kind: 'enemy', id: 'southSentinel2', room: 'southCell', at: [12, 5], type: 'sentinel' },
    { kind: 'enemy', id: 'southThorn', room: 'southCell', at: [8, 8], type: 'thornling' },
    { kind: 'chest', id: 'southChest', room: 'southCell', at: [8, 5], loot: { key: 'amber' }, appears: { cleared: 'southCell' } },
    // ── Barred Cell: reached last, from below. Its crystal lifts the bar into the nave.
    { kind: 'switch', id: 'northBar', room: 'northCell', at: [3, 13] },
    // ── Hall of Plates: two stones, two hold plates, a pillar in the way. Both held down at
    //    once (a stone resting on each) opens the court.
    { kind: 'stone', id: 'plateStoneA', room: 'plateHall', at: [3, 7] },
    { kind: 'stone', id: 'plateStoneB', room: 'plateHall', at: [11, 3] },
    { kind: 'switch', id: 'plateA', room: 'plateHall', at: [13, 9], style: 'plate', hold: true },
    { kind: 'switch', id: 'plateB', room: 'plateHall', at: [3, 11], style: 'plate', hold: true },
    { kind: 'enemy', id: 'plateThorn', room: 'plateHall', at: [12, 9], type: 'thornling' },
    // ── Sunken Court: a pit runs the length of the court; push two stones in to make a path.
    { kind: 'stone', id: 'courtStoneA', room: 'sunkenCourt', at: [7, 7] },
    { kind: 'stone', id: 'courtStoneB', room: 'sunkenCourt', at: [3, 7] },
    { kind: 'chest', id: 'courtChest', room: 'sunkenCourt', at: [16, 9], loot: { key: 'jade' } },
    { kind: 'chest', id: 'courtFlaskChest', room: 'sunkenCourt', at: [16, 3], loot: { flask: 'life' } },
    // ── Long Gallery.
    // Landmark: the watcher, in the middle of the hall facing east, its arm pointing north along the gallery.
    { kind: 'landmark', id: 'galleryWatcher', room: 'gallery', at: [5, 9], style: 'watcher', facing: Math.PI / 2 },
    { kind: 'enemy', id: 'galleryThorn1', room: 'gallery', at: [5, 4], type: 'thornling' },
    { kind: 'enemy', id: 'galleryThorn2', room: 'gallery', at: [7, 22], type: 'thornling' },
    { kind: 'enemy', id: 'gallerySentinel', room: 'gallery', at: [5, 27], type: 'sentinel' },
    // ── Crystal Walk: three crystals, all lit, raise the bars to the Glove Shrine.
    { kind: 'switch', id: 'crystalA', room: 'crystalWalk', at: [3, 3] },
    { kind: 'switch', id: 'crystalB', room: 'crystalWalk', at: [13, 3] },
    { kind: 'switch', id: 'crystalC', room: 'crystalWalk', at: [8, 10] },
    { kind: 'enemy', id: 'crystalThorn1', room: 'crystalWalk', at: [5, 8], type: 'thornling' },
    { kind: 'enemy', id: 'crystalThorn2', room: 'crystalWalk', at: [11, 8], type: 'thornling' },
    // ── Lookout: a view over the court, and a way straight down into it.
    { kind: 'chest', id: 'lookoutChest', room: 'lookout', at: [4, 3], loot: { gems: 20 } },
    // ── Glove Shrine: a hard fight, then the dungeon's item.
    { kind: 'enemy', id: 'gloveSentinel1', room: 'tetherRoom', at: [3, 4], type: 'sentinel' },
    { kind: 'enemy', id: 'gloveSentinel2', room: 'tetherRoom', at: [9, 4], type: 'sentinel' },
    { kind: 'enemy', id: 'gloveShell', room: 'tetherRoom', at: [6, 9], type: 'shellback' },
    { kind: 'enemy', id: 'gloveThorn', room: 'tetherRoom', at: [3, 9], type: 'thornling' },
    { kind: 'chest', id: 'tetherChest', room: 'tetherRoom', at: [6, 6], loot: { item: 'tether' }, appears: { cleared: 'tetherRoom' } },
    // ── Echo Hall (optional): the toughest fight on the floor, for a heart.
    { kind: 'enemy', id: 'echoSentinel1', room: 'echoHall', at: [3, 4], type: 'sentinel' },
    { kind: 'enemy', id: 'echoSentinel2', room: 'echoHall', at: [9, 4], type: 'sentinel' },
    { kind: 'enemy', id: 'echoShell1', room: 'echoHall', at: [3, 10], type: 'shellback' },
    { kind: 'enemy', id: 'echoShell2', room: 'echoHall', at: [9, 10], type: 'shellback' },
    { kind: 'chest', id: 'echoChest', room: 'echoHall', at: [6, 7], loot: { flask: 'attack' }, appears: { cleared: 'echoHall' } },
    // ── Stone Loft: the glove's first puzzle. Pull the heavy stone onto the plate: a key.
    { kind: 'stone', id: 'loftStone', room: 'loft', at: [3, 9], heavy: true },
    { kind: 'switch', id: 'loftPlate', room: 'loft', at: [13, 9], style: 'plate', needs: 'tether' },
    { kind: 'chest', id: 'loftChest', room: 'loft', at: [8, 4], loot: { key: 'crimson' }, appears: { switch: 'loftPlate' } },
    // ── Crypt: shellbacks; a key when it's cleared.
    { kind: 'enemy', id: 'cryptShell1', room: 'crypt', at: [4, 6], type: 'shellback' },
    { kind: 'enemy', id: 'cryptShell2', room: 'crypt', at: [6, 14], type: 'shellback' },
    { kind: 'enemy', id: 'cryptThorn1', room: 'crypt', at: [8, 10], type: 'thornling' },
    { kind: 'enemy', id: 'cryptThorn2', room: 'crypt', at: [4, 17], type: 'thornling' },
    // Landmark: the fallen keeper's head, its open eye toward the foot of the stairs down.
    { kind: 'landmark', id: 'cryptHead', room: 'crypt', at: [9, 14], style: 'fallenKeeper', facing: 2.77 },
    { kind: 'chest', id: 'cryptChest', room: 'crypt', at: [8, 4], loot: { key: 'violet' }, appears: { cleared: 'crypt' } },
    // ── Pit Hall: too wide to jump. A fallen column lies along the far ledge (from here, 12.5 m
    //    toward the back wall); the glove swings it across the pit like a drawbridge.
    { kind: 'stone', id: 'bridgeStone', room: 'pitHall', at: [1, 7], heavy: true, role: 'bridge' },
    { kind: 'enemy', id: 'pitThorn', room: 'pitHall', at: [14, 16], type: 'thornling' },
    // ── Root Cellar: a wall of roots with one gap, plugged by a heavy stone: pull it out.
    { kind: 'stone', id: 'rootStone', room: 'rootCellar', at: [7, 11], heavy: true },
    { kind: 'chest', id: 'rootChest', room: 'rootCellar', at: [3, 3], loot: { key: 'azure' } },
    // ── Ossuary: shellbacks and a sentinel among the bones, then the stairs down.
    { kind: 'enemy', id: 'ossShell1', room: 'ossuary', at: [3, 4], type: 'shellback' },
    { kind: 'enemy', id: 'ossShell2', room: 'ossuary', at: [11, 4], type: 'shellback' },
    { kind: 'enemy', id: 'ossSentinel', room: 'ossuary', at: [3, 16], type: 'sentinel' },
    { kind: 'chest', id: 'ossChest', room: 'ossuary', at: [11, 18], loot: { gems: 25 }, appears: { cleared: 'ossuary' } },
    // ── Cistern: a water channel across the room; one stone pushed in makes a crossing.
    { kind: 'stone', id: 'cisternStone', room: 'cistern', at: [5, 3] },
    { kind: 'chest', id: 'cisternChest', room: 'cistern', at: [17, 12], loot: { gems: 30 } },
    // ── Deep Shaft: the keepers' own stair, linking the antechamber and the Barred Cell.
    { kind: 'sign', id: 'shaftSign', room: 'deepShaft', at: [8, 9], text: 'The keepers\' own stair. It remembers the way home.' },
    // ── Ember Hall: the deep floor opens up.
    { kind: 'enemy', id: 'emberThorn1', room: 'emberHall', at: [3, 4], type: 'thornling' },
    { kind: 'enemy', id: 'emberThorn2', room: 'emberHall', at: [11, 4], type: 'thornling' },
    // ── The Gauntlet: everything the shrine has, at once.
    { kind: 'enemy', id: 'gauntSentinel1', room: 'gauntlet', at: [4, 5], type: 'sentinel' },
    { kind: 'enemy', id: 'gauntSentinel2', room: 'gauntlet', at: [12, 5], type: 'sentinel' },
    { kind: 'enemy', id: 'gauntShell1', room: 'gauntlet', at: [4, 15], type: 'shellback' },
    { kind: 'enemy', id: 'gauntShell2', room: 'gauntlet', at: [12, 15], type: 'shellback' },
    { kind: 'enemy', id: 'gauntThorn1', room: 'gauntlet', at: [8, 10], type: 'thornling' },
    { kind: 'enemy', id: 'gauntThorn2', room: 'gauntlet', at: [8, 17], type: 'thornling' },
    // ── Key Vault: two hold plates, a light stone (the sword) and a heavy one (the glove):
    //    both held down at once, the boss key appears.
    { kind: 'stone', id: 'vaultStone', room: 'keyVault', at: [9, 5] },
    { kind: 'switch', id: 'vaultPlateA', room: 'keyVault', at: [9, 13], style: 'plate', hold: true },
    { kind: 'stone', id: 'vaultHeavy', room: 'keyVault', at: [3, 15], heavy: true },
    { kind: 'switch', id: 'vaultPlateB', room: 'keyVault', at: [11, 17], style: 'plate', needs: 'tether', hold: true },
    { kind: 'chest', id: 'bossKeyChest', room: 'keyVault', at: [7, 2], loot: 'bossKey', appears: { switches: ['vaultPlateA', 'vaultPlateB'] } },
    // ── Antechamber.
    { kind: 'sign', id: 'anteSign', room: 'bossAnte', at: [8, 9], text: 'Something huge breathes beyond the door, slow as a hillside.' },
    // ── Warden's Hearth.
    { kind: 'boss', id: 'gravelheart', room: 'boss', type: 'gravelheart' },
  ],
};

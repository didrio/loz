# The Waking Shrine (first dungeon): design

Status: **design approved by the owner** (2026-11-02), being built milestone by milestone.
Done: the shrine's theme music (owner's progressions), plus milestones 1–5 and the
expansion (25 rooms in four themed wings; multi-crystal
locks; the puzzle checker proves chests across pits reachable). Playable now up to the
boss door, glove and all; the boss is milestone 6. The layout is data in
`src/world/dungeon/defs/shrine.ts` (validated and solved by the tests; `npm run map --
shrine` to see it). This doc covers what the data doesn't: the gimmick's progression, the
item, the enemies, the boss, the overworld gate, and the build plan. Keep the two in step.

**Size (revised 2026-11-02 at the owner's request: "3–4× bigger, every room its own
identity, a decent amount harder")**: 25 rooms on four floors (about 2× the first draft's
12), 7 fight rooms, 39 enemies, 12 wakestones on 5 plates, 13 chests, aiming at 75–90
minutes for a first-time player. I proposed 2× the rooms with every room denser and harder
rather than 3–4× the room count (a 1–2 hour first dungeon would outlast most later ones in
a 10–15 hour game, and size from repetition drags); more rooms are cheap to add if the
owner wants them after playing.

## The wings

Each floor is a wing with its own look (`RoomDef.theme`, `decor.ts`) and its own mechanic:

| Floor | Wing | Look | Mechanic |
|---|---|---|---|
| 0 | **The Sleeping Halls** | warm sandstone, kneeling keeper statues, carved sleeping faces | pushing stones onto plates (the Nave; the Hall of Plates: two stones, two plates, a pillar in the way), filling a pit with stones to make a path (Sunken Court), statues that are sentinels (Gallery of Statues) |
| 1 | **The Upper Galleries** | pale marble, checkered floors, tall windows with light shafts | three crystals that must all be lit (Crystal Walk → the Glove Shrine), drop-hole shortcuts (Lookout → Sunken Court, Loft → Nave), the glove's first heavy stone (Stone Loft) |
| -1 | **The Undercroft** | dark mossy stone, hanging roots, water in the pits | a pit too wide to jump (Pit Hall: the glove's bridge), a heavy stone plugging a wall of roots (Root Cellar), a water channel to fill (Cistern), shellbacks (Crypt, Ossuary) |
| -2 | **The Deep Hearth** | black basalt, glowing ember cracks, red light | the Gauntlet (every enemy type at once), the Key Vault (push and pull for the boss key), the Antechamber (shortcut stairs up through the Deep Shaft to the Barred Cell) |

**Landmarks** (one lopsided 4-5 m statue in each wing's central room, so you know where you are
when a shortcut drops you in; none on floor -2, three rooms in a line need none): the Nave's
*lantern keeper* (kneeling, the lantern arm raised toward the doorway from the Hall of
Sleepers, the head turned, a glowing emissive lantern, no light), the Long Gallery's *watcher*
(one leg on a broken column, one arm pointing north along the hall, one half-broken wing) and
the Crypt's *fallen keeper* (a huge head toppled on one cheek, one eye open, moss and a sapling
over one side). Data kind `landmark` (see [dungeons.md](dungeons.md)); `npm run look -- landmarks`.

**Route** (the solver checks every key order; `npm run map -- shrine`): doorway stone → the
Nave's plate opens the stairwell; the Sentinel Cell and the Sunken Court each give a key;
the Gallery of Statues a Restoring Draught, the Sunken Court an Ember Tonic. Upstairs, the Crystal Walk's
three crystals open the Glove Shrine (fight → the glove); the Loft's heavy stone gives a key.
Downstairs, keys open the Pit Hall and the Ossuary; the glove crosses the Pit Hall to the
Root Cellar (a key); the Ossuary's stairs lead to the Deep Hearth, where a key opens the
Gauntlet and the Key Vault's plate (glove) gives the boss key. The Gauntlet opens onto the
Antechamber, whose stairs climb through the Deep Shaft to the Barred Cell's crystal: the
shortcut back to the Nave. Optional: the Echo Hall (a key, the hardest fight upstairs, a
heart), the Lookout and Cistern chests (gems), the Ossuary (a heart).

## Death, drinks and fairness (owner's direction, 2026-11-02)

The shrine leans a little toward a Souls-like feel: dying sends Wren back to the Hall of
Sleepers; keys, the glove, opened chests and doors, pressed switches and plates stay, but
**every enemy respawns** and **every drink found refills** (cleared fight rooms don't seal
again). Chests hold two single-use drinks instead of a map and compass: the **Restoring
Draught** (Gallery of Statues, Key Vault) and the **Ember Tonic** (Sunken Court). Every
stone has a purpose (the checker proves it), stones can't get stuck (bounce-back), and
heavy stones look nothing like light ones (dark violet, bronze bands, glowing teal spirals).
The Hall of Plates and the Key Vault use **hold plates**: two stones resting on two plates
at the same time.

## The gimmick: wakestones

Carved 2 m blocks with the shrine's spiral. Struck with the sword, a wakestone "wakes"
and slides one cell (2 m) away from Wren, stopping at walls, pillars and other stones; a
stone pushed into a pit falls in and becomes floor. Heavy wakestones (bigger, darker,
cracked) don't budge for a sword. Stones in a puzzle room reset when Wren falls (not on leaving: owner's call, so a stone
can be pulled from out in the doorway), so no puzzle can be ruined for good.

- **Teach** (Hall of Sleepers): a stone sits in the doorway to the nave. One strike slides
  it clear. Statues line the walls, asleep (decoration that sells the theme).
- **Test** (the Nave): slide a stone across the floor onto a plate to open the stairwell.
  Two thornlings make you do it under a little pressure.
- **The item** (Glove Shrine, mid-dungeon): the **Tether Glove**.
- **Twist** (Stone Loft, Pit Hall): heavy stones only the glove can move. Pull one onto
  a plate (boss key); pull another into a pit to bridge it (the way to the boss).
- **Exam** (the boss): the same verbs, push and pull, in a fight.

## The item: the Tether Glove (working name)

A leather glove that throws a glowing cord up to ~10 m and yanks it back. New action
**`item`**: F on keyboard, Y on gamepad (both freed by removing the flute). Aims at the
lock-on target, or straight ahead.

- **Wakestones**: pulls a stone one cell toward Wren (heavy stones too). Push with the
  sword, pull with the glove: together they make stone puzzles hard to break.
- **Enemies: not for now** (owner's call: the glove affects stones only). Shellbacks are
  beaten from behind; maybe later the glove flips them.
- **The boss**: rips loosened armor plates off; pulls out the keystone that drops it to its
  knees.
- **In the overworld**: moves the great stone blocking the Northpass (the way out of the
  valley), and the half-sunk stone at Glimmer Lake (an optional grotto). See below.

## Enemies

- **Thornling** (existing): filler and pressure in puzzle rooms.
- **Dozing Sentinel** (new): a stone statue that sleeps until Wren comes within ~5 m, then
  wakes with a grinding tell. Slow, heavy two-handed swing (guard cost 2, 2 half-hearts),
  long recovery (punish window). Teaches guard management: block one swing, then back off.
  Its maul is its guard: hits that meet the maul clank, hits that get past it land.
- **Shellback** (new): a stone-shelled crawler, its face hidden behind the shell (only the
  eyes show through two holes). The shell turns sword hits (`guarded`: Wren recoils); circle
  round and hit its back feet and tail. (Flipping it with the
  glove is a possible later addition; the glove affects stones only for now.)

## The boss: Gravelheart, the Sleepless Warden

The shrine's guardian was meant to sleep while the lantern burned. When the flame was
stolen, the thief pushed an ember into its chest, and now it can't sleep. About 5 m of
stacked wakestones: a blocky torso, arms that are chains of floating stones, a carved
spiral mask with heavy-lidded eyes, the second ember glowing through cracks in its chest.
Arena: Warden's Hearth, a 20×20 m room with spare wakestones set into the walls.

More intricate than the Lamplighter because every opening takes **two steps** (glove, then
sword), the arena changes in phase two, and the item is the key to the fight. Built on
`Boss` with the same fairness rules (see [combat.md](combat.md)).

**Phase 1 (armored).** Three stone plates bound over its chest; the sword clanks off them.
- **Hammerfall** (main opening): raises both fists (0.9 s windup, eyes glow), slams.
  A direct hit is guard-crushing (cost 3, red-eye tell); the slam sends a shockwave ring
  (jump it). Its fists stick in the floor for ~1.5 s and one chest plate **glows loose**:
  tether it to rip it off.
- **Sweep**: one arm sweeps low across the front (blockable, cost 2; or jump).
- **Stone volley**: pulls three wakestones out of the walls and throws them in sequence
  (block, cost 1 each, or sidestep). A thrown stone can be tethered mid-air to yank it
  aside (a skill shot, never required).
- **Grind** (greed punish): if Wren stays behind it, it turns on its waist and grinds
  (short-range shockwave, jumpable).
- With all three plates off, the ember is exposed and it staggers for ~3 s: sword it (the
  weak point, `weak` hits). Then it pulls new plates from the walls and the cycle repeats.
  The walls visibly run out of stones as the fight goes on.

**Phase 2 (at half health).** It howls, smashes the floor, and the arena's floor tiles
wake: a ring of tiles slides around the room's edge (moving hazards, the arena shrinks
toward the middle). Its ember rises into its head, out of sword reach. Drops a couple of
hearts.
- **Cairn Roll**: curls into a boulder and rolls at Wren (1 s windup of rocking back;
  sidestep). If it hits a wall it's dazed, and the **keystone** in its back glows: tether
  it out and Gravelheart collapses to its knees, head in reach: sword the ember.
- Keeps Hammerfall and the volley, faster. Sweep is replaced by a double sweep (cost 2 +
  2: blocking both breaks a full guard, so jump the second).

**Defeat**: it slowly settles, finally asleep; the ember drifts out of its chest and flies
up through the shrine to the lantern (two embers now). A **Heart Vessel** appears, and the
entrance seal opens.

## Locked in: the seal, death and the shortcut

- Walking into the Hall of Sleepers for the first time triggers a short cutscene: the
  entrance slab rises behind Wren, its spiral goes dark, and a deep breath rumbles from far
  below. Wren can't leave until Gravelheart falls.
- Dying (or continuing a save made in the dungeon) puts Wren at the entrance hall with full
  hearts. **Progress is kept**: opened doors, keys, chests, the glove, pressed switches
  (stone puzzles reset, but their plates stay pressed once solved).
- The **shortcut**: from the antechamber, stairs lead up to the Barred Cell, whose crystal
  lifts the bar into the nave. After that, the boss door is a short walk from the entrance.
- After the boss, the seal opens and Wren can walk out (or take a light in the boss room
  back to the entrance hall).

Why lock in at all: it guarantees the order "glove, then boss, then the world opens",
which the overworld gate depends on, and it suits the story (the shrine wakes).

## The overworld gate: the Northpass

Emberfield gets an exit: a narrow cut through the northern mountains, the **Northpass**,
at the end of a new road north between Thistledown and the grove. From day one it's
blocked by a huge heavy wakestone with the spiral carved on it, the same as the stones
inside the shrine (so the "aha" lands as soon as the glove does).

- Before the glove: striking it shudders it a little ("It stirs, but it's far too heavy
  to wake with a blade"). The sign reads: "NORTHPASS: the road to the highlands." Tobin:
  "Nobody's crossed since that stone rolled down. Some say it rolled itself."
- With the glove: tether it, and it slides out of the cut (a little cutscene), opening the
  way out of the valley. For now walking through shows a "to be continued" card; later it
  leads to the next region.
- Optional: a half-sunk wakestone in the shallows of Glimmer Lake. Pull it out to open a
  little grotto with a chest (blue gems for now; a heart piece once those exist).
- Villagers react after the dungeon: Maren notices the glove and remembers the old stories
  about the shrine's stones; Tobin points out the Northpass stone looks like the shrine's.

## Build plan (milestones)

Each milestone ends with check + smoke (+ look) passing, so the game stays playable.

1. ~~**Dungeon builder**~~ **done**: `DungeonArea` (floors, walls with door gaps, ceilings,
   stairs with ramps and railings, drop holes, pits, pillars, blocks; doors styled by lock;
   chests; switches; wakestones; tablets; sconces and lights; enemy spawns), indoor
   lighting, the `dungeon` look scene with top-down floors. Known gaps for later
   milestones: falling into a pit has no damage/respawn yet (milestone 3), only thornlings
   spawn (4), the rooms are bare (decoration like the sleeping statues: milestone 8).
2. ~~**Area transitions + saving the area**~~ **done**: the shrine door leads in (fade),
   the seal cutscene on the first visit, respawn at the entrance (shutters lift, enemies
   stay), `SAVE_VERSION` 3 with the area, items and per-dungeon progress, small-key and boss
   doors (interact to unlock), chests and their loot (keys, boss key, drinks, the
   glove), chests that appear when a room is cleared or a switch is pressed, fight-room
   shutters, crystal switches struck by the sword, the exit trigger once `done`. Sentinels
   and shellbacks are stood in by thornlings until milestone 4.
3. ~~**Wakestones**~~ **done**: the sword slides stones a cell (grind, thunk on heavy or
   blocked), plates press, stones fill pits, puzzle rooms reset when left, falling into a
   pit costs a heart and returns Wren to the last solid floor, and the puzzle checker proves
   every plate and doorway stone. The first doorway is now 2 m wide and on the grid, so its
   stone blocks it until struck aside.
   (The safe spot is only recorded 0.8 m or more from a pit's lip: `nearPit`; ground hanging over the edge once brought Wren back above the water.)
4. ~~**Enemies**~~ **done**: the Dozing Sentinel and the Shellback replace the stand-in
   thornlings (numbers in [combat.md](combat.md)); unit tests, the `enemies` look scene and
   the `shrine-enemies` smoke scenario. Feel and sounds are untuned until the owner plays them.
5. ~~**The Tether Glove**~~ **done** (2026-11-02): the `item` action (F / Y);
   `DungeonArea.tether` pulls a stone one cell toward Wren (in line, up to `PULL_RANGE`,
   nothing between; auto-aims at the stone she's in line with); the Pit Hall's bridge is a
   **fallen column** (`world/dungeon/bridge.ts`) that swings across the pit like a drawbridge
   (the room is too low for a toppling stone); the cord (`game/tether.ts`), throw pose, sounds,
   HUD slot, item-get moment and hints; the `shrine-glove` smoke scenario. Owner's playtest
   fixes: near-instant turning, stones reset only when Wren falls (not on leaving), enemies
   take `REACTION` (0.9 s) to react on sight, and **the camera**: one
   collision rule (a swept ball, quick in, slow out) with Wren fading when it's close, as
   Souls and Zelda do (see [engine.md](engine.md)).
   Not yet confirmed by eye: the cord in flight (the `glove` look scene catches the throw pose
   but not the cord); the owner should check it and the camera in small rooms in play.
   Original milestone text: **The Tether Glove**: the `item` action, the cord, pulling stones (through
   `DungeonArea.moveStone`), HUD slot, the item-get cutscene. **Rethink the Pit Hall
   first**: its pit is 4 m wide and Wren jumps ~6 m at a run, so it doesn't stop anyone.
   Either widen it past a jump (and bridge it differently, e.g. a tall heavy stone the glove
   topples across) or make the far side a ledge too high to jump.
6. **Gravelheart**: rig, moves, phases, arena tiles, intro and defeat cutscenes, music
   (a boss theme of its own), tests.
7. **The Northpass**: the new road, the cut, the heavy stone, the sign and dialog, the
   lake grotto (minding the seeded-scenery rules; do the per-region seeds scaling item
   here).
8. **Polish**: decoration passes, smoke scenarios for the dungeon. (Dungeon music is done:
   "The Sleeping Stones".) **No map or compass** (owner's call, 2026-11-02): those chests hold
   drinks instead.

## Open questions for the owner

Answered (2026-11-02): the names stay; the glove affects stones only for now; 25–40
minutes is right.

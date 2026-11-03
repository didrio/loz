# The Waking Shrine (first dungeon): design

Status: **design approved by the owner** (2026-11-02), being built milestone by milestone.
Done: the shrine's theme music (owner's progressions), plus milestones 1–5 and the
expansion (25 rooms in four themed wings; multi-crystal
locks; the puzzle checker proves chests across pits reachable). Playable now through the
boss door, glove and all; the boss (milestone 6) is partly built (see the build plan). The layout is data in
`src/world/dungeon/defs/shrine.ts` (validated and solved by the tests; `npm run map --
shrine` to see it). This doc covers what the data doesn't: the gimmick's progression, the
item, the enemies, the boss, the overworld gate, and the build plan. Keep the two in step.

**Size (revised 2026-11-02 at the owner's request: "3–4× bigger, every room its own
identity, a decent amount harder")**: 25 rooms on four floors (about 2× the first draft's
12), 7 rooms of enemies, 39 enemies, 12 wakestones on 5 plates, 13 chests, aiming at 75–90
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
| -2 | **The Deep Hearth** | black basalt, glowing ember cracks, red light | the Gauntlet (every enemy type at once), the Key Vault (push and pull for the boss key), the Antechamber (shortcut stairs up through the Deep Shaft to the Barred Cell), the Bell Shaft (east of the Antechamber, always open: the Lullbell's platforming trial, see [bells.md](bells.md)) |

**Landmarks** (one lopsided 4-5 m statue in each wing's central room, so you know where you are
when a shortcut drops you in; none on floor -2, three rooms in a line need none): the Nave's
*lantern keeper* (kneeling, the lantern arm raised toward the doorway from the Hall of
Sleepers, the head turned, a glowing emissive lantern, no light), the Long Gallery's *watcher*
(one leg on a broken column, one arm pointing north along the hall, one half-broken wing) and
the Crypt's *fallen keeper* (a huge head toppled on one cheek, one eye open, moss and a sapling
over one side). Data kind `landmark` (see [dungeons.md](dungeons.md)); `npm run look -- landmarks`.

**Keys** (colored, one chest and one door each): crimson (Loft) → Pit Hall; azure (Root Cellar) →
Gauntlet; jade (Sunken Court) → Ossuary; violet (Crypt) → Echo Hall; amber (Sentinel Cell) → Cistern.

**Route** (`npm run map -- shrine`): doorway stone → the
Nave's plate opens the stairwell; the Sentinel Cell and the Sunken Court each give a key;
the Gallery of Statues 20 gems, the Sunken Court the life flask. Upstairs, the Crystal Walk's
three crystals open the Glove Shrine (fight → the glove); the Loft's heavy stone gives a key.
Downstairs, keys open the Pit Hall and the Ossuary; the glove crosses the Pit Hall to the
Root Cellar (a key); the Ossuary's stairs lead to the Deep Hearth, where a key opens the
Gauntlet and the Key Vault's plate (glove) gives the boss key. The Gauntlet opens onto the
Antechamber, whose stairs climb through the Deep Shaft to the Barred Cell's crystal: the
shortcut back to the Nave. Optional: the Echo Hall (a key, the hardest fight upstairs, the
attack flask), the Lookout and Cistern chests (gems), the Ossuary (25 gems).

## Death, flasks and fairness (owner's direction, 2026-11-02)

The shrine leans a little toward a Souls-like feel: dying sends Wren back to the Hall of
Sleepers; keys, the glove, opened chests and doors, pressed switches and plates stay, but
**every enemy respawns** (except in beaten challenge rooms, the ones a chest waits on: they stay empty and the chest stays) but **flasks don't refill**. Instead of a map and compass, chests hold the game's two flasks, found
full: **life** (Sunken Court) and **attack** (Echo Hall); Odo refills them in the village (20
gems). No chest raises max hearts or heals: hearts come from bosses. Shrine gems: 95. Every
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
Arena: Warden's Hearth, a 24×20 m room (12 m high) with spare wakestones set into the walls.

**Owner's calls (2026-11-03):** a stone slab seals the boss door when the fight starts and lifts on
a win or a death (the boss is the one exception to "never sealed"). Phase 2's tiles don't slide:
the outer 2 m ring **rises into a low wall and stays** (arena ~20×16 m), and Cairn Roll is dazed
against it. Harder than the Lamplighter: ~4–5 minutes, about two plate cycles per phase, hits of
1–2 half-hearts. The theme is ours to write (a boss version of The Sleeping Stones); the owner listens.

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
wake: the outer ring rises into a low wall (the arena shrinks toward the middle). Its ember rises into its head, out of sword reach. Drops a couple of
hearts.
- **Cairn Roll**: curls into a boulder and rolls at Wren (1 s windup of rocking back;
  sidestep). If it hits a wall it's dazed, and the **keystone** in its back glows: tether
  it out and Gravelheart collapses to its knees, head in reach: sword the ember.
- Keeps Hammerfall and the volley, faster. Sweep is replaced by a double sweep (cost 2 +
  2: blocking both breaks a full guard, so jump the second).

**Defeat**: it slowly settles, finally asleep; the ember drifts out of its chest and flies
up through the shrine to the lantern (two embers now). A **Heart Vessel** appears.

## The way in and out, death and the shortcut

- The entrance is an open doorway (frame, black beyond) with no seal and no entry cutscene:
  Wren can walk out any time. (Owner's call, 2026-11-02, after playtesting: the lock-in
  felt bad. The Northpass is still gated by the glove, so the order "glove, then the world"
  holds without it.)
- Dying (or continuing a save made in the dungeon) puts Wren at the entrance hall with full
  hearts. **Progress is kept**: opened doors, keys, chests, the glove, pressed switches
  (stone puzzles reset, but their plates stay pressed once solved).
- The **shortcut**: from the antechamber, stairs lead up to the Barred Cell, whose crystal
  lifts the bar into the nave. After that, the boss door is a short walk from the entrance.
- Fight rooms have no shutters: Wren can leave a fight. A room counts as cleared when its
  enemies are all beaten; its chests appear then.

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

1–5. **Done**: the builder (`DungeonArea`), transitions and saving, chests/doors/switches,
   wakestones (plates, pits, bounce-back; a fall returns Wren to the last floor ≥ 0.8 m from a
   pit's lip, `nearPit`), the Sentinel and Shellback, the Tether Glove (`item`: F / Y; the Pit
   Hall's fallen-column bridge in `world/dungeon/bridge.ts`; the cord in `game/tether.ts`).
   Enemies take `REACTION` (0.9 s) to react on sight; the camera rule is in
   [engine.md](engine.md). Not yet confirmed by eye: the cord in flight, the camera in
   small rooms.
6. **Gravelheart**, in four sessions (planned 2026-11-03; each ends with check passing):
   - ~~**A, rig, arena, intro**~~ done (the owner hasn't played it): `game/bosses/gravelheart/`,
     `world/dungeon/hearth.ts`, `content/gravelheart.ts`, `Boss.music`. Stand-ins until B–D: its only
     move is Hammerfall, whose stuck slam opens its chest straight to the sword; the defeat just
     settles it and opens the door. The ring rises 2.4 m (Wren jumps ~2 m). To judge in play: the
     palette is low contrast, and the sleeping heap barely reads as kneeling.
   - **B, phase 1**: Hammerfall, Sweep, Stone volley, Grind; loose plates; the glove on boss parts
     (`Enemy.tetherAt`, checked in `Combat.throwTether` before `area.tether`); a thrown-`stone`
     hazard; ember stagger; re-plating from sockets, then from landed rubble (it never runs out);
     inject an RNG into boss move picks and Thornling/Shellback wandering (scaling item); tests.
   - **C, phase 2**: the phase move (howl, smash, ring rises, hearts drop, ember into the head);
     Cairn Roll → dazed on the ring → keystone → kneel; double sweep; faster moves; tests.
   - **D, defeat, music, smoke, docs**: the defeat script, Heart Vessel, lantern at 2 embers; the
     `warden` theme; fixture `shrine-boss.json` + smoke scenario `shrine-boss`; docs.
7. **The Northpass**: the new road, the cut, the heavy stone, the sign and dialog, the
   lake grotto (minding the seeded-scenery rules; the per-region seeds scaling item is done
   first by the bells' Hushing Gorge, see [bells.md](bells.md)).
8. **Polish**: decoration passes, smoke scenarios for the dungeon. (Dungeon music is done:
   "The Sleeping Stones".) **No map or compass** (owner's call, 2026-11-02): those chests hold
   the flasks instead.

## Open questions for the owner

Answered (2026-11-02): the names stay; the glove affects stones only for now; 25–40
minutes is right.

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
Arena: Warden's Hearth, a 48×40 m room (12 m high; first drawn 24×20, doubled at the owner's request
2026-11-03) with spare wakestones set into the walls. Wren fights on a ledge of floor: 4 m drops (pits) run
along the west, north and east edges (the door's south side is solid) and three holes sit in the floor. It is a
`trial` room, so a fall costs a half-heart (`TRIAL_RULES`) and puts Wren back on the last solid floor. The boss
won't walk into a drop (`Boss.walkable`, `WardenHearth.walkable`). The phase-two ring rises along the ledge's
edge (`WardenHearth.platform`), so the drops are walled off then.

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
- **Stone volley**: pulls five wakestones out of the walls and throws them in sequence
  (block, cost 1 each, or sidestep). A thrown stone can be tethered mid-air to yank it
  aside (a skill shot, never required).
- **Swipe**: a quick high backhand when Wren crowds it (blockable, not jumpable).
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

## After the boss: the seal, the gate, the Northpass (owner's design, 2026-11-03)

This replaces the first plan (a heavy wakestone in the Northpass that the glove pulls aside); none
of that was built. The boss, not the glove, opens the way out of the valley.

- **The magic gate**: at the valley's north edge, at the mouth of the Northpass (a new road north
  from the field, between Thistledown and the grove), a rune arch of floating ember-lit stones holds
  a glowing veil across the cut. It's visible from the start of the game and can't be passed, **nor
walked around or climbed over** (owner's call, 2026-11-03): invisible `Bounds` walls run from both pillars
along the gate's latitude out to the valley's rim, and stay after the ward breaks (`world/overworld/gate.ts`,
`FLANK_REACH`; a test rays along the whole line, on foot and at hill height), and **rock shoulders** rise steeply against both
pillars (`raiseGateShoulders` in `layout.ts`) so no gap shows beside them; the gate's sign stands 12 m out, clear of them. Nothing of the valley lies north of that line except the pass.
  Lore (proposal, ask the owner to confirm): the thief who stole the lantern's flame sealed the pass
  with a ward fed by the ember pushed into Gravelheart. While the Warden can't sleep, the ward holds.
- **The defeat**: Gravelheart settles, asleep at last. Its ember drifts out and up toward the
  lantern (two embers now), and a Heart Vessel appears. Then the camera turns to the Hearth's north
  wall: stones rise into a causeway across the pit, and a hidden door grinds open.
- **The Keepers' Seal** (a hidden room north of the Hearth): one button, the seal-stone. Pressing it
  shows a vision. The view cuts to the gate as its stones fall and the veil unravels (flag
  `valleyOpen`), then back to the room. Wren walks back out of the dungeon herself; nothing teleports
  her.
- **The Northpass**: a winding mountain road beyond the gate, part of the same overworld (streamed
  in, no loading). On it are a new enemy, the **Cragstalker** (it circles, crouches as a tell, and
  lunges ~7 m; guard it and it's dazed; it gives up at its leash), then a bell lying on the road, then
  **Wayfarers' Camp**: a camp-looking rest area (no resting yet) with that bell's empty post, the
  third fast-travel stop. That's the end of what's built for now. (Built as: the camp and its empty post first, then a
  canyon with a chasm crossing, then the Cragstalker with the bell behind it; the bell is carried back across to the post.)
- **Villagers react**: Maren, Tobin and Odo each get a line for when the shrine is done and for when
  the valley is open. A sign stands at the gate.
- Optional, later: a half-sunk wakestone in Glimmer Lake that the glove pulls out, opening a grotto
  with a chest.

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
     `world/dungeon/hearth.ts`, `content/gravelheart.ts`, `Boss.music`. The ring rises 2.4 m (Wren jumps ~2 m). To judge in
     play: the palette is low contrast, and the sleeping heap barely reads as kneeling.
   - ~~**B, phase 1**~~ done (details in [combat.md](combat.md), "Bosses"; the owner has played it and likes it).
   - ~~**C, phase 2**~~ done (2026-11-03; the owner hasn't played it): `HOWL`, `ROLL`, `KNEEL`, `DOUBLE_SWEEP` in
     `bosses/gravelheart/moves.ts` (details in [combat.md](combat.md), "Bosses"). Also the owner's damage call: every
     Gravelheart attack is 4 half-hearts (2 in the tunic); the Hammerfall ring is faster. Look scene `gravelheart2`.
     To judge in play: Cairn Roll's speed and tell, the keystone window, the ring shrinking the arena (~20x16 m).
   - **D, the boss's end and the way out** (owner's redesign 2026-11-03, see "After the boss" above;
     three sessions, no plan mode needed, all Sonnet):
     - ~~**D1, defeat and the seal room.**~~ done (2026-11-03; the owner hasn't played it):
       - Door lock `{ cleared: room }` (`format.ts`, `solve.ts`, validator, `DoorStyle` `hidden`; tests). A cleared-lock
         door may open onto a pit (the causeway bridges it).
       - The Keepers' Seal room (`sealRoom`, 24x20 m, S5) north of the Hearth, door `sealDoor`; the prism `sealStone`
         inside (`world/dungeon/prism.ts`, switch `style: 'prism'`: four pylons and beams; four sword hits (one per beam), each with a flash, sfx and
         shards, the first three snap a beam, the fourth shatters it and presses the switch; hits aren't saved, the shatter is. Beams are harmless). The Hearth builds the causeway (`WardenHearth.raiseCauseway`, four slabs rising out of the north pit
         to a flush collider) and the Heart Vessel (`hearth.vessel`, trigger `trigger.heartVessel`, flag `gravelheartVessel`).
       - The defeat script (`content/gravelheart.ts`, `falls`): the ember drifts up through the roof, a line of
         dialog, the ring sinks and the boss door opens, the vessel shows, the camera turns to the north wall, the
         causeway rises and `sealDoor` opens. The lantern's second ember is drawn when the valley next loads
         (`state.dungeon('shrine').done` → `setEmbers(2)`); there's no shot of it flying there.
       - The seal-stone (`seal` in the same file, called from `content/shrine.ts`'s `onSwitch` once the prism shatters; `onPrismHit` plays the per-hit effects): a beat, dialog, `travel`
         to `overworld/gateView` (new `quiet` argument skips the area-name card), the camera on the gate, `gate.open()`,
         flag `valleyOpen`, `travel` back to `shrine/sealStone.beyond` (a spot north of the prism facing the new message, not the door). The press is saved only at the end, so quitting
         mid-vision leaves the stone strikable.
       - The gate (`world/overworld/gate.ts`, `GATE` and `inGate` in `layout.ts`): two pillars, nine floating
         ember-lit stones, a veil of glowing strips, a `Bounds` wall across the cut while closed. Scenery is filtered with `inGate` after the seeded placement.
         `sign.gate` beside it.
       - `warden` music ("The Warden's Vigil", `core/tracks.ts`): Gravelheart's `music`. Unheard: ask the owner.
       - Dev states: "boss door" has the tunic and both bells; new "Warden asleep, the seal room open".
       - Fixture `shrine-boss.json` and smoke `shrine-boss`.
       - To judge in play: the defeat's pacing and camera, the causeway rising, the veil and falling stones, the theme.
     - ~~D2, overworld streaming and the pass~~ done; how it works:
       - `world/overworld/region.ts`: `RegionStreamer`, default load 70 m, unload 110 m; `Area.streamAt`
         (called in `updateWorld` and before `placeAtSpawn` places Wren). See [engine.md](engine.md), "Regions".
       - `buildTerrain(b, rect)` (`terrain.ts`), the valley's chunk unchanged (`VALLEY_RECT`).
       - `PASS`, `passFrame`, `inPass`, `passFloor` and `carvePass` in `layout.ts`: a canyon from (8, -100) to the camp
         at (-10, -255), floor 0.9 m rising to 12 m, walls 14 m (steeper than 55° at their middle), melting into the
         mountain by 36 m; the camp is a flat 17 m circle. `centerline()` is now shared with the gorge.
       - `northpass.ts`: the region (rect x ±150, z -330..-210, joined to the valley's square at z = -210), boulders
         along the walls, a `Bounds` wall at the far end. `buildBounds` leaves a gap in the ring where the pass crosses it.
       - The valley's scenery is filtered with `inPass` after the seeded placement (nothing reshuffles); `PASS` has its
         own seed `pass`. The area name "The Northpass" shows past the gate.
       - The region loads at 260 m and drops at 300 m (fog is full at 290 m), so the canyon never pops into view.
       - Cutscene rules: a vision hides Wren (`api.hidePlayer`) and sets its first shot in `travel`'s `arrive` callback,
         before the fade-in; Gravelheart's intro shot sits on the doorway's own axis (look scene `wardenIntro`).
       - Look scene `northpass`. Not done here (D3): the camp's props, bell, NPC, the Cragstalker.
     - ~~D3, the Cragstalker, the third bell, the camp~~ built 2026-11-03 (owner's redesign: the post at the camp, a canyon
       crossing beyond it, the Cragstalker and the bell on the far side; details in [bells.md](bells.md), "The Waybell's canyon"):
       - `game/cragstalker.ts` on `GroundEnemy` (combat.md), bell id `way` ("Waybell"), `world/overworld/camp.ts`, `content/northpass.ts`.
       - No camp NPC and no other paths yet (owner: later).
       - Dev state "Northpass: at the opened gate, Warden beaten"; fixture `northpass.json`, smoke `northpass`, look scene `camp`.
       - Unplayed: the owner judges the Cragstalker, the crossing and the canyon.
7. (Folded into 6D: the Northpass. The lake grotto stays optional, for later.)
8. **Polish**: decoration passes, smoke scenarios for the dungeon. (Dungeon music is done:
   "The Sleeping Stones".) **No map or compass** (owner's call, 2026-11-02): those chests hold
   the flasks instead.

## Open questions for the owner

Answered (2026-11-02): the names stay; the glove affects stones only for now; 25–40
minutes is right.

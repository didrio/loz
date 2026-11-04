# The keepers' bells: bell posts, fast travel, bell trials

Status: posts, hanging, ringing, the travel menu, the platforming base and both trials (the Bell
Shaft and the Hushing Gorge) work: both bells can be found and hung. Next: the shrine's boss
([shrine.md](shrine.md)).
Design approved by the owner (2026-11-02).

## What it is

Bell posts are this game's bonfires. A crooked post with one arm and an empty hook stands at
each site; the site's own bell waits at the end of a **bell trial** (a platforming course,
with a few enemies as hazards). Hang the bell on its post and it can be rung. A lone hung
bell rings and **nothing answers**. With two or more hung, the bells answer each other, and
ringing one opens a **travel menu** to every other hung bell (fast travel).

- **Bells never heal or rest Wren.** Only a bed does (owner's call): health stays an economy
  of gems, flasks and time.
- No inventory or HUD: a carried bell is only state (`GameState.bells.carried`).
- Order is free: whichever bell is hung second wakes the network.
- Platforming challenges and bells go together: a climb means a bell at the top, so the
  player keeps trying because the reward is big.

## Lore: the lantern's hours (owner's pick)

While the great lantern burned, the shrine's keepers rang its hours from bells hung on posts
around the valley. All were cast from one bronze, warmed at the lantern's flame, so a rung
bell answers the others, and a keeper could follow the answer from post to post. Each bell
is named for the hour it rang. When the flame was stolen, the keepers hid the bells where a
thief would struggle to reach them: that's why every bell sits at the end of a climb.
Later bells take other hours (a Noonbell, a Vesperbell...).

| Bell | Hour | Post (site) | Note | Trial |
|---|---|---|---|---|
| **Morrowbell** (`morrow`) | dawn: "Thistledown woke to its note" | Thistledown's square (`MORROW_POST`, between the east and northeast cottages), facing the well | A4, pale gold rings | **the Hushing Gorge** (working name), western cliffs (milestone 3) |
| **Lullbell** (`lull`) | dusk: told the shrine's stones to sleep | the shrine's Hall of Sleepers (`lullPost`, the respawn room) | D4, violet rings | **the Bell Shaft**, off the Antechamber (milestone 3) |
| **Waybell** (`way`) | noon, the travelers' hour: called people in off the pass | Wayfarers' Camp, at the end of the Northpass (`bellPost.way`, entrance `bell.way`) | E4, verdigris bronze, pale green rings | **the canyon beyond the camp**: a chasm crossing, then the Cragstalker (below) |

The intended path: the Morrowbell first. In the shrine, the empty post in the entry hall is
there from the first visit. The Lullbell waits near the boss door; the Barred Cell shortcut
leads back to the entry, and hanging it there wakes the network.

## Rules (what the code does)

- A post's arm carries its bell's name (`MORROW`, `LULL`): that's how a bell finds its post.
  Prompt: **Check** (empty), **Hang bell** (Wren carries its bell), **Ring** (hung).
- Check: "A crooked post with one arm and an empty hook. Does something go here?" + the
  carving (the owner's line); "Another bell post..." once any bell is hung; carrying another
  bell: "The *X* you carry doesn't belong here."
- Hang: the bell floats from Wren's hands to the hook (`BellPost.hang`, 1.2 s), settles with
  a swing, then rings once by itself. First bell: "...and nothing answers." Second: the far
  bell answers (its note, quieter), a lore line, a tutorial line, then the menu.
- Ring: swing, rings of light, its note; with others hung, they answer (quieter, staggered)
  and `api.choose('Follow the answer', [sites..., 'Stay'])` opens. A choice `travel`s to that
  bell's entrance (in front of its post, facing away); it rings as Wren arrives. The clock
  doesn't move. Stay or backing out does nothing.
- Dying is unchanged (the area's start). The Lullbell post *is* the shrine's start; the
  Morrowbell's isn't the overworld spawn.
- Trial falls (milestone 2): fade out, back on the last checkpoint ledge reached, **half a
  heart lost** (`TRIAL_RULES.fallDamage` = 1; first free, switched on by the owner 2026-11-03);
  enemy hits hurt too; death follows the checkpoint rule.
- **The village goes quiet** (owner's call, 2026-11-04): when Gravelheart falls, a hung Morrowbell is taken off its post
  (`liftVillageBell`, `content/bells.ts`; flag `village.bellMoved`), so Wren walks home through the restored valley instead of
  fast traveling. The bell then lies on the ground behind the windmill (`MORROW_LOST`, `world/overworld/layout.ts`; `BellPickup`
  with `ground`), never on the gorge's plinth again. Taking it and hanging it on the post restores the old network. Nothing new in the
  fast-travel code: `answering()` only counts hung bells, so the Lullbell rings "...and nothing answers." exactly as with one bell,
  and Waybell ↔ Lullbell still travel. Not moved if the bell wasn't hung (or Wren carries it). Restoring a save where the boss is beaten but the bell still hangs
  (older saves, Dev states) lifts it too, once (`settleVillageBell`); rehanging it sets the flag. A beaten dungeon plays no music (`game/dungeonQuiet.ts`).
- Maren and Tobin each say one line (once, flags `village.marenBell` / `village.tobinBell`)
  after the Morrowbell is hung.

## Code

- `world/bell.ts`: `BELL_IDS`, `BellPost` (`label`, `hang`, `ring`, `setHung`, `arrival`,
  `canHang`), `BellPickup` (a bell on a plinth, `take`). Looks only.
- `content/bells.ts`: the registry `BELLS` (name, carving, site, area, entrance, note, text)
  and the scripts; `bellContent(posts, pickups)` gives an area its scripts and `restore`.
- `game/state.ts` `bells: { carried, hung }`; save v6 (`core/save.ts`).
- `game/menuDriver.ts`: `MenuDriver` (input → `MenuStack` → HUD, shared with the pause menu)
  and `ChoiceMenu` (`ScriptApi.choose`).
- Overworld: the post in `world/overworld/index.ts` (`morrowPost`, interactable
  `bellPost.morrow`, entrance `bell.morrow`). Dungeons: thing kinds `bellPost` and `bell`
  (see [dungeons.md](dungeons.md)); `DungeonArea.bellPosts`, `bellPickups`, `entrances`.
- `Area.bellPosts` (by bell id) lets the travel script ring the arrival post.
- Sound: `Sfx.bell(freq, gain, delay)` ([audio.md](audio.md)).

### Adding a bell site (the recipe)

1. Add the id to `BELL_IDS` (`world/bell.ts`) and its look to `LOOKS` (bronze, ring color).
2. Add its `BELLS` entry (`content/bells.ts`): name from the lore (an hour), carving, site
   name, area, entrance id, a note in the valley's key, `found` (the hour it rang + a nudge
   toward its post) and `carries` (where its note goes).
3. Place the post: in a dungeon, a `bellPost` thing (its id is the entrance); in the
   overworld, a `BellPost` with an interactable, an entrance and `update`, bound with
   `bellContent` in the area's content.
4. Place the bell at the end of its trial: a `bell` thing, or a `BellPickup` in the overworld.
5. Tests: `content/bells.test.ts` checks every bell has exactly one post and an entrance.
   Add a dev state, a look shot and a smoke step.

## Milestones

1. ~~Bells and fast travel~~ done (dev states "Bells: ...", smoke and look scene `bells`).
2. ~~Platforming base~~ done: how it works is below.
3. **The two trials**: ~~3a, the Bell Shaft~~ done (owner-approved by play, 2026-11-03); ~~3b, the
   Hushing Gorge~~ built 2026-11-03 (below; awaiting the owner's play).

### How the platforming works

- **Jump feel** (`game/player.ts`): `COYOTE_TIME` and `JUMP_BUFFER` (0.12 s each). A blob shadow
  (`GroundShadow`, 0.4 m) under Wren, indoors and out; she casts no sun shadow (owner's call).
- **Edge stickiness** (`Player.edgeAssist`, `EDGE_HOLD` 0.05 s; on only inside trial rooms, set each
  frame by `shrineContent`): if the next step of a walk would put Wren's feet over nothing, she holds
  at the lip until she has pushed `EDGE_HOLD` seconds, then walks off. Only her *displacement* is held,
  never her speed (her run has no ramp-up), so a jump at the lip, or within coyote time, launches at
  full run speed. If it ever feels like an aid, shorten `EDGE_HOLD`. No acceleration tweaks: her instant
  start and stop is what gives fine control (owner's call).
- **Platforms** (`world/platforming.ts`): `PlatformDef` is a round disc (x, z = centre; `r`, `top`,
  `thickness`, `look`, `checkpoint?`, `move?: { by, period, phase }`); `CourseDef`;
  `platformPosition(def, t)` (cosine ease); `jumpReach(rise)` (85% margin; 5.3 m at rise 0, 4.5 m at +1,
  6.4 m at -2; `MAX_RISE` 1.71 m; the constants mirror `player.ts` by hand); `checkCourse` (start →
  checkpoints → goal; a mover's hop counts if its best sampled pose is in reach, i.e. Wren waits for
  it; headroom ≥ 2.2 m; **no two platforms may overlap in plan and height at any pose**, so movers
  never pass through ledges); the `COURSES` registry (each checked in `npm run check`) and
  `buildCourse` (static discs merged, movers moved by `update(t)`; `dispose()`).
- **Moving platforms** (`core/physics.ts`): `kinematicBox` / `kinematicCylinder` → `KinematicBody`
  (`moveTo`, `remove`) are *fixed* Rapier bodies we teleport (a kinematic body froze Wren's walking);
  `carryDelta(feet)` is how a grounded Wren rides one. **Frame order matters**: `Game.frame` calls
  `Area.movePlatforms(dt)` *before* the player updates (`DungeonArea` ticks its courses there), then
  the player, then `physics.step`. Platform code for the gorge must hang off `movePlatforms` too. Move
  movers by their per-frame path, never teleport them far in one frame.
- **Falls** (`game/trialFalls.ts`): `TrialFalls(checkpoints, fallY, start)` remembers the last
  checkpoint ledge stood on; `recover(api)` fades and returns her. `TRIAL_RULES.fallDamage` is 1
  (half a heart; owner's call; the pause menu's Dev tab can switch it off). Dungeon rooms take `trial: true` and
  `platforms` (see [dungeons.md](dungeons.md): the validator checks the room, the doorways, the
  ceiling and runs `checkCourse` with **first platform = start, last = goal**); `shrineContent`
  applies the trial rule. The gorge will use `TrialFalls` directly.
- **Enemies on a ledge**: an `enemy` thing with `up` (and `facing`) spawns on its disc, stays on it
  (`Spawn.leash`; content's `walkable`) and stands turned toward the previous ledge.
- **Walls where a tall room passes other floors** (`build.ts`): a wall segment whose line is shared
  with another floor's wall at overlapping heights is built as one collider plus a half-thickness
  slab per room on its own side (coplanar boxes z-fought).

### The Bell Shaft (built)

Room `bellShaft` in `defs/shrine.ts`: 28×30 m, 23 m tall (the Upper Galleries above cap it), basalt, a
pit over most of the floor; door `anteBell` from the Antechamber (offset 5). 30 round ledges spiral about
three laps up (checkpoints, sliders of 4 s, two risers of 6 s and +2 m), with three monster discs
(r 2.6 / 3.5 / 4.5) holding 1, 2 and 3 thornlings; the Lullbell is on the last ledge. The ledge data
came from a throwaway generator; edit it by hand, `checkCourse` guards it. Dev state "Bells: Bell
Shaft start", look scene `bellShaft` (the camera shots are hand-placed and a couple sit close to
discs; judge the room by the doorway, climb and from-above shots), smoke `trials`.

### The Hushing Gorge (built, 3b)

Owner calls: keep both names; difficulty gentle-to-medium (the gorge mostly teaches); always open,
with a sign (`sign.gorge`) at its mouth that warns. It reuses the shaft's lessons: round discs,
`movePlatforms`, `TRIAL_RULES`, edge stickiness (on inside the gorge), ledge-free enemies.

- **Terrain** (`world/overworld/layout.ts`, `gorge.ts`): `GORGE.path` is a centerline from the mouth
  (-124, 12) winding west and north into the mountain ring (about 100 m). `carveGorge` (in `terrainHeight`
  only, never `placementHeight`) makes a 10 m wide flat floor that climbs from the field's level to
  7 m over the first 30 m, walls rising 11 m over it, melting into the hills by 28 m, and a pit 6 m deep
  from 62 m in. Helpers: `gorgeFrame(x, z)` (distance and arclength), `gorgePoint(s)` (centerline point,
  direction, normal), `inGorge`. Named "The Hushing Gorge" in `areaNameAt`; field enemies keep out
  (`isEnemyGround`). Scenery that would land in it is filtered out *after* its random draws (`nature.ts`),
  like the hollow, so the valley's trees stay where they were. (Plan said `isOpen`; that would have
  shifted the seeded stream, so it isn't used.)
- **Seeds**: `regionRng(region)` in `layout.ts` (valley 1337, hollow 4242, gorge 7301). A new region
  adds a line there.
- **The corridor** (`content/gorge.ts`): 5 thornlings and 1 Dozing Sentinel (facing the mouth) at fixed
  spots (`GORGE_THORNLINGS`, `GORGE_SENTINEL`), kept on the floor by `onGorgeFloor`; they refill on load and
  after a death (the checkpoint rule).
- **The climb** (`gorge.ts`, `COURSES.gorge`, proved by `checkCourse` in `gorge.test.ts`): six rock pillars
  (discs as tall as the pit is deep) with one slider across the corridor, three checkpoints; the Morrowbell
  (`BellPickup`, interactable `bellPickup.morrow`) on the last. Falling below the pit's line puts Wren back on the
  last checkpoint pillar (`TrialFalls`, half a heart; only checked past the pit's lip). Two stubs of a
  broken plank bridge sit at the rim.
- **Verify**: dev states "Bells: gorge mouth" and "Bells: gorge climb", look scene `gorge`, smoke `gorge`.

### The Waybell's canyon (built, D3)

Owner's design (2026-11-03): the camp's post comes first, with its bell missing; a bit beyond the camp a narrow canyon is
cut by a chasm, crossed on rock pillars; two Cragstalkers wait on the far side with the bell behind them. The bell can be
taken without killing the enemy (it is aggressive, so that is hard), and Wren must cross back to hang it at the camp's post.
No NPC or other paths from the camp yet.

- **Terrain** (`layout.ts`, `BEYOND`, `carveBeyond`): a centerline north from the camp's centre (z -255 to -324), flat at
  the camp's height (12), walls 4.5 m in then rising 11 m, a chasm 6 m deep from `s` 21 to 41 (`s` is metres from the camp's
  centre). It only ever cuts (`min` with the land), so it can't raise a wall. `beyondFrame`, `beyondPoint`, `inBeyond`;
  `areaNameAt` says "Wayfarers' Camp" in the camp and "The Northpass" in the canyon.
- **Camp and crossing** (`world/overworld/camp.ts`): fire, tents, seats, crates, a lantern pole, the post (`WAYBELL_POST`),
  and `CANYON_COURSE` (`COURSES.canyon`, proved by `checkCourse` in `camp.test.ts`): ledge, pillar, checkpoint pillar, a slider,
  the far ledge. They live in the overworld proper, not in the Northpass region, so their state survives the region
  streaming out and in (the props are 30 m or so of fog away from Wren before the ground exists; fine).
- **Content** (`content/northpass.ts`): `TrialFalls` on the crossing (only counted inside the canyon; half a heart; edge
  stickiness on there). The two Cragstalkers (`CRAGSTALKERS_AT`) spawn once the region is built (its ground is part of it), are removed when the region
  drops, each stays dead until Wren dies (the checkpoint rule). Only `onFarSide` ground is walkable for it.
- **Verify**: dev state "Northpass: at the opened gate, Warden beaten" (valley open, both bells hung, 5 hearts), look scene
  `camp`, smoke `northpass`. To judge in play: the Cragstalkers' difficulty (two at once), the crossing, the canyon's look.

## Open questions

- The gorge's name ("the Hushing Gorge" is a working name) and the Bell Shaft's.
- Later: should the bell menu grow options (the owner: "more options can be added as the game
  progresses")? Resting stays out unless the owner says otherwise.

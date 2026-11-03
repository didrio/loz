# The keepers' bells: bell posts, fast travel, bell trials

Status: posts, hanging, ringing, the travel menu, the platforming base and the Bell Shaft (the
Lullbell's trial) work. The Morrowbell can only be had from the dev menu's "Bells:" states until the
gorge exists. Next: **3b, the Hushing Gorge**, before the shrine's boss ([shrine.md](shrine.md)).
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
- Maren and Tobin each say one line (once, flags `village.marenBell` / `village.tobinBell`)
  after the Morrowbell is hung.

## Code

- `world/bell.ts`: `BELL_IDS`, `BellPost` (`label`, `hang`, `ring`, `setHung`, `arrival`,
  `canHang`), `BellPickup` (a bell on a plinth, `take`). Looks only.
- `content/bells.ts`: the registry `BELLS` (name, carving, site, area, entrance, note, text)
  and the scripts; `bellContent(posts, pickups)` gives an area its scripts and `restore`.
- `game/state.ts` `bells: { carried, hung }`; save v6 (`core/save.ts`).
- `game/menuDriver.ts`: `MenuDriver` (input → `MenuStack` → HUD, shared with the dev menu)
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
3. **The two trials**: ~~3a, the Bell Shaft~~ done (owner-approved by play, 2026-11-03); **3b, the
   Hushing Gorge** is next (plan below).

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
  (half a heart; owner's call; the dev menu can switch it off). Dungeon rooms take `trial: true` and
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

### 3b, the Hushing Gorge (next)

Owner calls: keep both names; difficulty gentle-to-medium (the gorge mostly teaches); always open,
with a sign at its mouth that warns. Reuse the shaft's lessons: round discs, `movePlatforms`,
`TRIAL_RULES`, edge stickiness (turn `edgeAssist` on inside the gorge), ledge enemies.

- **Terrain** (`world/overworld/gorge.ts`): built after the seeded scenery with its own RNG (do the
  per-region seeds item from the roadmap here, `regionRng(name)`: the hollow keeps seed 4242, the
  valley 1337); a carve in `terrainHeight` only (never `placementHeight`), excluded in
  `isOpen`/`isEnemyGround`, named in `areaNameAt`, inside the bounds. `GORGE` centerline + `inGorge`
  in `layout.ts`. A mouth near (−127, 10) winding west into the mountain ring; a corridor floor 6–8 m,
  a ~6 m drop under the climb.
- **Content**: a narrow corridor with 4–5 thornlings and one Dozing Sentinel at fixed spots (a
  keeper's statue guarding the way); then a light climb over a drop (discs in `COURSES`, rock
  pillars, a broken plank bridge); the Morrowbell on a high ledge (a `BellPickup`, interactable
  `bell.morrow`). Content spawns the enemies on load and in `onRespawn` (territory `inGorge`) and runs
  a `TrialFalls` inside the gorge.
- **Fix first (test first):** `EnemyManager.removeGone` queues a random field respawn for *any*
  outdoor Thornling that dies; mark the ones the manager spawns and respawn only those.
- **Verify**: dev state "Bells: gorge mouth", look scene `gorge` (no jagged spots or snags in the 2 m
  terrain grid, camera doesn't jam; fallback: a wider carve with rock-box walls), smoke `trials`; the
  full suite at the end (ask the owner first). Then docs: world.md, the roadmap's seeds item, AGENTS.md.

## Open questions

- The gorge's name ("the Hushing Gorge" is a working name) and the Bell Shaft's.
- Later: should the bell menu grow options (the owner: "more options can be added as the game
  progresses")? Resting stays out unless the owner says otherwise.

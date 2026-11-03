# The keepers' bells: bell posts, fast travel, bell trials

Status: posts, hanging, ringing and the travel menu work (milestone 1); the platforming base
works (milestone 2, below). **The Bell Shaft (the Lullbell's trial) is built** (3a, 2026-11-03);
the Morrowbell can still only be had from the dev menu's "Bells:" states until the gorge exists.
Next: **3b, the Hushing Gorge**, before the shrine's boss
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
2. ~~Platforming base~~ done 2026-11-03:
   - Jump feel (`game/player.ts`): `COYOTE_TIME` and `JUMP_BUFFER` (0.12 s each), tested. A blob
     shadow (`GroundShadow`, 0.4 m) under Wren, indoors and out; she casts no sun shadow (owner's call, 2026-11-03; maybe temporary).
   - `world/platforming.ts`: `PlatformDef` (a round disc: x, z = centre; `r`, top, thickness, look,
     `checkpoint?`, `move?: { by, period, phase }`), `CourseDef`, `platformPosition(def, t)`
     (cosine ease), `jumpReach(rise)` (85% margin; 5.3 m at rise 0, 4.5 m at +1, 6.4 m at -2;
     `MAX_RISE` 1.71 m), `checkCourse` (start → checkpoints → goal; for a mover a hop counts if
     its best sampled pose is in reach, i.e. Wren waits for it; also headroom ≥ 2.2 m), the
     `COURSES` registry (each checked in `npm run check`) and `buildCourse(b, course, origin)`
     (static boxes merged, movers kinematic; `update(t)`, `dispose()`). Its jump constants
     mirror `player.ts` by hand.
   - **Moving ledges never pass through others** (`checkCourse` fails a course where any two
     slabs overlap in plan and height at any pose, static ones too).
   - **Coplanar walls across floors** (the Bell Shaft passes floors -1 and 0): `build.ts` builds a
     wall segment as one collider plus a half-thickness slab per room on its own side whenever
     another floor's wall lies on the same line at overlapping heights (z-fighting otherwise).
   - **Edge stickiness** (`Player.edgeAssist`, `EDGE_HOLD` 0.05 s (was 0.15: too strong, owner 2026-11-03); on only inside trial rooms,
     set each frame by `shrineContent`): if the next step of a walk would put Wren's feet over
     nothing, she holds at the lip until she has pushed `EDGE_HOLD` seconds, then walks off. Only
     her *displacement* is held, never her speed (her run has no ramp-up), so a jump at the lip, or
     within coyote time, launches at full run speed. Tested in `player.test.ts`. If it ever feels
     like an aid, shorten `EDGE_HOLD` again; set `edgeAssist` from content only where you want it. No
     acceleration changes: her instant start/stop is what gives fine control.
   - **Moving platforms are fixed Rapier bodies we teleport** (`Physics.kinematicBox/Cylinder`):
     a kinematic body under Wren froze her horizontal movement (she stood in place, jumping worked).
   - **Enemies on a ledge** (`enemy` thing with `up`, optional `facing`): spawned in the middle of
     the disc, turned to face the previous ledge (where the player arrives from), and leashed to the
     disc (`Spawn.leash`; content's `walkable`).
   - **Frame order (a real bug, fixed 2026-11-03):** `Game.frame` calls `Area.movePlatforms(dt)`
     *before* the player updates (`DungeonArea` ticks its courses there). With the player first,
     `physics.step` had already cleared the platforms' carry delta and Wren sank through a rising
     one. New platform code (the gorge) must hang off `movePlatforms` too.
   - Moving platforms (`core/physics.ts`): `kinematicBox(...)` → `KinematicBody` (`moveTo`,
     `remove`), `carryDelta(feet)`. `Player.update` adds the mover's delta when grounded. Order
     matters: platforms `moveTo`, then the player, then `physics.step` (`Game.frame` calls `movePlatforms` first).
     Move movers by their per-frame path, never teleport them far in one frame.
   - Falls (`game/trialFalls.ts`): `TrialFalls(checkpoints, fallY, start)`: remembers the last
     checkpoint ledge stood on, `check` per frame, `recover(api)` fades and returns. **The fall
     damage switch is `TRIAL_RULES.fallDamage` (1 now; the dev menu has "Trial falls cost a
     half heart")**. Dungeon rooms take `trial: true` and `platforms` (x/z from the room's NW corner,
     `top` above its floor; validator: inside the room even when sliding, clear of door
     approaches, 2.2 m under the ceiling); `shrineContent` applies the trial rule in trial
     rooms. The overworld gorge will use `TrialFalls` directly.
3. **The two trials** (main session; `looker` every pass):
   - **The Hushing Gorge** (overworld, `world/overworld/gorge.ts`): built after the seeded
     scenery with its own RNG (do the per-region seeds item from the roadmap here, without
     reshuffling the valley); a carve in `terrainHeight` only (never `placementHeight`),
     excluded in `isOpen`/`isEnemyGround`, named in `areaNameAt`, inside the bounds. A mouth
     near (−127, 10) winding west into the mountain ring; a narrow corridor with a handful of
     thornlings and one Dozing Sentinel (a keeper's statue guarding the way); then a light
     climb over a drop (static ledges, rock pillars, a broken plank bridge); the Morrowbell
     on a high ledge (a `BellPickup`, interactable `bell.morrow`). A sign at the mouth.
   - **The Bell Shaft** (shrine): a room `bellShaft` on floor −2 at x 30–44, z −20…−4 (east
     of the Antechamber; nothing is built above it, so it can be ~15 m tall), door
     `anteBell` in the Antechamber's east wall, basalt, an ember-lit pit floor, `trial:
     true`. The climb spirals up the walls: static ledges, then sliding and rising
     platforms, a thornling or two on wide ledges, the Lullbell (a `bell` thing) at the top.
   - Verify: look scenes `gorge` and `bellShaft`, dev states at each trial's start, smoke
     `trials` (take each bell; a fall puts Wren back at the checkpoint, hp unchanged). The
     owner plays both for feel and difficulty.
   - **Build plan (approved 2026-11-03).** Owner calls: keep both names; difficulty
     gentle-to-medium (the gorge mostly teaches, the shaft adds slow movers near the top,
     2–4 min each for a first-timer); the gorge is always open, and the sign at its mouth warns. Two
     Sonnet sessions, `/clear` between them:
     - **3a, the Bell Shaft first** (DONE 2026-11-03: room `bellShaft` in `defs/shrine.ts`; after the owner's first
       play it was made ~3x longer: 28x30 m, 23 m tall (the shrine's floor-1 rooms above cap it; the climb tops out ~17 m), 30 round
       ledges spiralling ~3 laps up over a pit, with checkpoints, sliders (4 s), 2 risers (6 s, +2 m)
       and three **monster discs** (r 2.6 / 3.5 / 4.5) holding 1, 2 and 3 thornlings, all facing where
       the player lands from; the Lullbell on the last ledge The ledges are generated by a throwaway
       script (ring path, 5.6 m spacing); edit the data by hand now, `checkCourse` guards it.
       The validator now runs `checkCourse` on every room with ≥ 2 platforms (**first = start, last
       = goal**) and `enemy`/`bell` things take `up` to stand on a still ledge. Dev state "Bells: Bell
       Shaft start", look scene `bellShaft` (door, climb, from above, wide ledge, top; a "bell from below" shot kept ending up looking at a ledge's underside, so it's not there), smoke `trials`. Not yet played by the owner for feel.)
       Original plan: (it uses the dungeon format and its validator): room
       `bellShaft` (floor −2, x 30, z −20, w 14, d 16, `height` 15: nothing on floors −1/0
       overlaps it), basalt, `trial: true`, a pit over most of the floor; door `anteBell`
       from `bossAnte`'s east wall. Spiral ledges: static ones for the first ~6 m
       (a checkpoint every 3–4 hops), then sliding and rising movers (period ≥ 3 s), one wide
       ledge with a thornling, the `bell` thing `lull` on top. Make sure check runs
       `checkCourse` on room platforms (or register the course in `COURSES`). `npm run map --
       shrine` clean. Dev state "Bells: Bell Shaft start", look scene `bellShaft` (looker:
       ledges readable, bell visible from below, camera clear of walls), shrine.md updated.
     - **3b, the Hushing Gorge**: `regionRng(name)` (the hollow keeps its seed 4242, the valley
       keeps 1337); `GORGE` centerline + `inGorge` in `layout.ts`, carve in `terrainHeight`
       only (corridor floor 6–8 m, a ~6 m drop under the climb), excluded in `isOpen` /
       `isEnemyGround`, named in `areaNameAt`; `world/overworld/gorge.ts` (rocks, the course in
       `COURSES`, the `BellPickup`, the sign, fixed spawn spots for 4–5 thornlings and one
       Sentinel); content spawns those on load and in `onRespawn` (territory `inGorge`) and runs a
       `TrialFalls` inside the gorge. **Fix first (test first):** `EnemyManager.removeGone`
       queues a random field respawn for *any* outdoor Thornling that dies, so mark the ones
       the manager spawns and only respawn those. Dev state "Bells: gorge mouth", look scene
       `gorge` (looker: no jagged spots or snags in the 2 m terrain grid, camera doesn't
       jam; fallback: a wider carve with rock-box walls). Smoke `trials`; the full suite at the
       end of 3b (ask the owner first). Then docs: world.md, the roadmap's seeds item, AGENTS.md.

## Open questions

- The gorge's name ("the Hushing Gorge" is a working name) and the Bell Shaft's.
- Later: should the bell menu grow options (the owner: "more options can be added as the game
  progresses")? Resting stays out unless the owner says otherwise.

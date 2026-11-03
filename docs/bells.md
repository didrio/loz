# The keepers' bells: bell posts, fast travel, bell trials

Status: posts, hanging, ringing and the travel menu work (milestone 1); the platforming base
works (milestone 2, below). The bells can only be had from the dev menu's "Bells:" states until
their trials exist. Next: **milestone 3** (the two trials), before the shrine's boss
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
- Trial falls (milestone 2): fade out, back on the last checkpoint ledge reached, **no
  damage** (owner's call); enemy hits still hurt; death follows the checkpoint rule.
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
   - `world/platforming.ts`: `PlatformDef` (x, z = centre; w, d, top, thickness, look,
     `checkpoint?`, `move?: { by, period, phase }`), `CourseDef`, `platformPosition(def, t)`
     (cosine ease), `jumpReach(rise)` (85% margin; 5.3 m at rise 0, 4.5 m at +1, 6.4 m at -2;
     `MAX_RISE` 1.71 m), `checkCourse` (start → checkpoints → goal; for a mover a hop counts if
     its best sampled pose is in reach, i.e. Wren waits for it; also headroom ≥ 2.2 m), the
     `COURSES` registry (each checked in `npm run check`) and `buildCourse(b, course, origin)`
     (static boxes merged, movers kinematic; `update(t)`, `dispose()`). Its jump constants
     mirror `player.ts` by hand.
   - Moving platforms (`core/physics.ts`): `kinematicBox(...)` → `KinematicBody` (`moveTo`,
     `remove`), `carryDelta(feet)`. `Player.update` adds the mover's delta when grounded. Order
     matters: platforms `moveTo`, then the player, then `physics.step` (as `updateWorld` does).
     Move movers by their per-frame path, never teleport them far in one frame.
   - Falls (`game/trialFalls.ts`): `TrialFalls(checkpoints, fallY, start)`: remembers the last
     checkpoint ledge stood on, `check` per frame, `recover(api)` fades and returns. **The fall
     damage switch is `TRIAL_RULES.fallDamage` (0 now; the dev menu has "Trial falls cost a
     heart")**. Dungeon rooms take `trial: true` and `platforms` (x/z from the room's NW corner,
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

## Open questions

- The gorge's name ("the Hushing Gorge" is a working name) and the Bell Shaft's.
- Later: should the bell menu grow options (the owner: "more options can be added as the game
  progresses")? Resting stays out unless the owner says otherwise.

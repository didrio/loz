# Roadmap, scaling plan and tech debt

The game is meant to grow to **50–100× its current content** (a 10–15 hour game), built
almost entirely by AI agents. This file is how we keep the codebase ready for that
without stopping to refactor everything up front.

**How to use it (every session, before starting a feature):** read the scaling checklist
below. If the work you're about to do fires an item's trigger, do that item as part of the
work (or first), tell the owner, and tick it off here with the date. When you notice a new
scaling risk, add it with a trigger. Don't do untriggered items early unless the owner
asks: they're best designed against the real use case.

## Feature roadmap

Next, in order:

- **The owner's batch of 2026-11-04** (before the inventory tab). Five chunks, one Sonnet session each, no plan mode; run
  each with `/start batch C<n>`. Owner's calls already made: four highlight colors, a ~60 s dawn burn, "Dawn"/"Nightfall"
  cards, the text pass sample-first.
  - ~~**C1, quick wins**~~ done 2026-11-04 (unplayed: the burn's pacing, the rise/gutter effect up close, the cards' fade): no "Day N" on the clock; the clock 2× slower (`HOURS_PER_SECOND` 1/24, a day ≈ 10 min); a one-word
    "Dawn"/"Nightfall" card at 6:00/18:00; Pip asks for Button only once Wren has the sword (before: just scared); the
    Lamplighter's **dawn burn** (engaged past dawn, it loses HP to 0 in ~60 s, phase 2 as normal, normal death) and an
    ember/smoke effect when it appears at dusk or leaves at dawn outside a fight.
  - ~~**C2, text styling + the terse-text rule**~~ done 2026-11-04 (unplayed: the colors, the shake and the fade up close; the gold tag is `[gear]`, since `item` is an action name; old long boxes are a ratchet, `LONG_ALLOWED` in `content/textRules.test.ts`, C3/C6 lower it). Spec was: semantic tags `[item]` gold, `[place]` pale blue, `[danger]` ember red,
    `[old]` violet (the blight, Keepers, sigils, names from the past), `[key]` bold (buttons), `[soft]` italics (whispers),
    `[shake]` tremble and `[fade]` slow fade-in (both rare), closed by `[/]`; `*x*` migrated and dropped. **Mind the clash:** `[shield]`, `[interact]` etc. already show a button glyph
    (`Action` names in `core/input.ts`), so tag names must never equal an action name (a test should check). `ui/hud.ts` format +
    typewriter, `ui/style.css`. A content test: valid tags, ≤ 2 highlights a box, ≤ ~120 chars a box (tiny exceptions list).
    Rewrite "Writing for the player" in [world.md](world.md) (every word earns its place; before/after examples; the tag table).
  - ~~**C3, text pass sample**~~ done 2026-11-04, the owner approved the voice 2026-11-04: `village.ts` and `villageNews.ts` cut by about a third to a half, retagged (`[gear]` items, `[place]`, `[old]`), ratchet at 0 for both (`shop.ts` has no player text). Item messages now read `[gear]Name[/]. One short fact.`; the `*x*` leftovers are gone.
  - **C4, after the boss: the village bell and the dungeon's silence** (owner's bug + request, 2026-11-04; **do first**: a bug, small). (a) **Bug:** once Gravelheart is dead the village bell must be
    off the post (the rule exists, see Where things stand), but fast travel to it from the dungeon's bell still works. Reproduce
    in a failing test first (the travel menu's list, `game/menuDriver.ts` / `content/bells.ts`: a bell that isn't hung can't be
    a destination), then fix. Rehanging the Morrowbell turns it back on. Add a smoke step (`bells`). (b) **No music in the
    dungeon after the boss dies**: no dungeon theme in any room of the shrine once `gravelheart` is beaten (silence; the valley
    outside keeps its songs). Test the mood pick in `core/audio.ts`/where the area's music is chosen.
  - **C5, the choice window** (owner's request, 2026-11-04; independent of the others, after C4): every `api.ask` / `api.choose`
    (Odo's wares, Sleep/Not now, and so on) now lists its options side by side. Make it one reusable **centered modal window**:
    options stacked vertically, small (just big enough), a highlighted row with a visible cue for Up/Down + Enter (and mouse
    click), and the **back-out row (Not now, Cancel...) in red** to read as an exit. `ui/hud.ts` + `ui/style.css`, driven by
    `ChoiceMenu` in `game/menuDriver.ts`; how a row is marked as an exit needs a convention (e.g. the last option, or a flag on
    the option; check how `offerWares`' "Not now" is built). Unit-test the driver; `looker` for the window; the owner judges feel.
  - **C6, text pass, the rest**: every other content file, item/pickup messages and signs (scout for strings outside `content/`).
  - **C7, dungeon fog and lighting**: fog color/near/far per wing in `world/dungeon/decor.ts`, optional per-room override,
    `scene.fog` blends to Wren's room; sparing accents (ground haze over pits, motes in the window shafts, sconce flicker).
    Independent of the others.
  - **C8, blight scars and routing** (owner's ask, 2026-11-04; **plan mode**: it's level design across the valley). While the
    blight lies on the valley: jagged violet **scars** streak the ground (not in the village, not in water) and hurt exactly
    like a thorn clump (`THORN_ATTACK`: same damage, same shove), and they can't be destroyed. **Thorn clumps become
    breakable** (changes the "sword never cuts them" rule in [world.md](world.md), "The blight"): only with the sword, about
    5 hits. Then re-place clumps and scars together so the routes to the POIs take a little thought (the field, the grove,
    the Hushing Gorge on the way to the Morrowbell), never a maze: e.g. the way to the sword chest runs past enemies, so
    Wren turns round armed and fights them. It should look grown, not designed, and the valley's ground must still make
    sense once the blight lifts and it all shrinks away. Extend `layout.test.ts` (roads, POIs still reachable, gaps).
0. ~~The owner's playtest tweaks A–G (2026-11-02)~~ done. Untested by play: the gem economy
   (95 in the shrine plus bushes, against the 50-gem tunic (it was 100 until 2026-11-03) and 20 per flask refill).
0.5. **Bells: bell posts, fast travel, bell trials** (owner's request, 2026-11-02, before the
   shrine's boss). Done: bells, posts and the travel menu, the platforming base, both trials (the Bell Shaft,
   the Hushing Gorge; the latter awaits the owner's play). See [bells.md](bells.md).
0.7. **Story revamp** (owner's direction, 2026-11-03; the story is in [world.md](world.md), "Story").
   Five Sonnet sessions, no plan mode needed; run each with `/start story S<n>`:
   - ~~S1, the shield-first opening~~ done (2026-11-03; [world.md](world.md), "The opening"). **For S2–S5:** no new story
     cutscenes without asking (AGENTS.md design decisions); the blight lift (S2) and the prism (S5) were planned as cutscenes.
   - ~~S2, the blight~~ done (2026-11-03; [world.md](world.md), "The blight"). Music is placeholder (owner listens); the restored field has 3 strays and no wisps (owner's call).
   - ~~S3, village and ruins~~ done (2026-11-03; [world.md](world.md), "Places"): four bigger cottages (two ruined) plus the mill, six `RUINS` in all
     (`world/overworld/ruins.ts`), scenery filtered with `inRuin` (per-region seeds trigger stays narrowed; nothing reshuffled). Added with it (owner's
     asks): clay **jars** in every ruin (`world/jars.ts`; one blue gem, 1-2 hearts, the rest empty; saved as `jar.<id>` flags), the Murmurbuds spread
     across the valley, a fourth note (`bud.boss`: jump the shock ring, tether a loose plate) and plainer note titles and texts.
   - ~~S4, sigils and the village's silence~~ done (2026-11-03; [world.md](world.md), "Story": the sigils, Messages page, villagers' reactions, text pass).
   - ~~S5, the prism~~ done 2026-11-03 (unplayed; [shrine.md](shrine.md) D1). The full suite hasn't run since; do it at the next milestone's end.
   - ~~The empty village~~ done 2026-11-03 (owner's ask; unplayed; [world.md](world.md) "The empty village"). **Later:** the rescue quests for Maren, Tobin and Odo
     (major story quests out in the world; Odo back at his stall), and the kids' lines changing with them.
1. **First dungeon: the Waking Shrine.** In progress: milestones 1–5 done (see the status
   in [shrine.md](shrine.md)); **milestone 6** (Gravelheart) is in its last part, **6D+**
   (owner's redesign, 2026-11-03, replacing the old glove-stone Northpass): beating the boss opens a
   hidden room whose seal-stone breaks the magic gate at the valley's north edge; beyond it, the
   Northpass (streamed in, one continuous world), the Cragstalker, a third bell and a camp. Three
   sessions, **D1 (done, unplayed), D2, D3 (built 2026-11-03, unplayed)**, in [shrine.md](shrine.md) "Build plan". Then polish (8).
2. **Pause menu**: one tabbed menu (P / Start, `game/pauseMenu.ts`, [engine.md](engine.md) "The pause menu"): Settings (built 2026-11-03,
   unplayed: volumes, sensitivities, invert Y, sharpness, fullscreen), Hints, Messages. Still to come: inventory / equipment / character tabs
   (a tab appears when there is something to show). Settings for the Steam build (key rebinding, resolution, quit) are deferred. (No dungeon map or compass items by design; the HUD's compass strip only shows heading.)
2.5. ~~Shield surfing~~ built, unplayed (rules in [combat.md](combat.md), Lark in [world.md](world.md)). Tune `SURF_SPEED`, the carve and the dust by play.
3. **Desktop build** (Electron) with a file-based `KeyValueStore`; Steamworks later.
4. **Load/perf pass**: Rapier WASM as a file, code splitting, character mesh merging.
5. **Depth**: more enemy types, target switching, jump attack, original items/tools,
   heart pieces, swimming, ledges/climbing, NPC day/night schedules, music per area,
   camera rails for cutscenes.

Then: itch.io demo, Steam page (wishlists), playtesting with real players.

## Scaling checklist

Each item: what, why it matters at 50–100×, and the trigger that says "do it now".

### Done

- [x] **Split AGENTS.md into an index + topic docs** (2026-11-02). AGENTS.md is loaded into
  every session, so it stays short (aim ≤ ~200 lines) and points to `docs/`. Keep it that
  way: details go in the topic doc, not the index.
- [x] **Dungeon data format + validator + solvability checker + text map** (2026-11-02,
  `world/dungeon/`). Dungeons are data, checked for structure and softlocks before any 3D
  exists. See [dungeons.md](dungeons.md).
- [x] **Agent setup for cost** (2026-11-02): project-local Claude Code agents, skills and
  model routing (see CLAUDE.md). Keeps the per-session cost flat as content grows: docs
  carry the state, Sonnet does the documented patterns, Opus only plans and unsticks.
  Keep adding a skill whenever a kind of task repeats.
- [x] **Split `game/game.ts`** (2026-11-02, before the boss): 748 → 529 lines. Combat wiring
  (lock-on, glove throw, hit feedback, enemy/hazard envs) → `game/combat.ts`; the title menu
  → `game/title.ts`; "what's in reach" → `nearestInteractable` in `world/area.ts` (tested).

### Triggered by building the first dungeon (do these with it)

- [x] **Dungeon builder** (2026-11-02, shrine milestone 1): `DungeonArea` turns a
  `DungeonDef` into an indoor `Area`; the `dungeon` look scene renders every floor top-down.
  See [dungeons.md](dungeons.md).
- [x] **Area transitions** (2026-11-02, shrine milestone 2): `api.travel(id, entrance)`,
  named `Area.entrances`. See [engine.md](engine.md).
- [x] **Save the current area** (2026-11-02): `SAVE_VERSION` 3; continue resumes in the
  saved area.
- [x] **Per-dungeon keys and dungeon state** (2026-11-02): `GameState.dungeon(id)`; a
  dungeon's small keys only count inside it (design decision recorded in AGENTS.md).
- [x] **Namespaced flags at scale** (2026-11-02): dungeon objects save by their data ids in
  their dungeon's progress, no hand-added flags; story flags still use `<area>.<thing>`.
- [x] **Room puzzle checker** (2026-11-02, shrine milestone 3): `solveRoomPuzzle` in
  `checkDungeon`. See [dungeons.md](dungeons.md).
- [x] **Scenario smoke tests from save fixtures** (2026-11-02): `npm run smoke` runs named
  scenarios in parallel pages, each from a save fixture (`scripts/fixtures/`, validated by a
  unit test). See [testing.md](testing.md). Add shrine/enemy steps as scenarios.

### Triggered by the Northpass (shrine milestone 6D+)

- [x] **Overworld streaming (regions)** (2026-11-03, session D2): the overworld stays one area (owner's call: one
  continuous world, no loading between field regions; dungeons and interiors still load). The valley stays
  loaded; the Northpass is the first region (`world/overworld/region.ts`, `northpass.ts`). See
  [engine.md](engine.md), "Regions". Later regions: add a `RegionDef` and a seed; bell posts and entrances
  inside a region join `Overworld.entrances` when D3 needs them. (D3 2026-11-03: the Waybell's post, bell and the camp are built in
  the overworld proper, with `bell.way` in `Overworld.entrances`, so their state survives streaming; see [bells.md](bells.md).)

### Later triggers

- [ ] **Split `game/game.ts` again** if it grows back: next out would be areas/transitions
  (`loadArea`, `travel`, respawn) and the HUD feed in `updateWorld`. *Trigger: it passes
  ~700 lines, or the inventory/settings pages land.* (2026-11-03: the pause menu's notes page
  landed in its own modules, `pauseMenu.ts` and `buds.ts`, and game.ts only went 594 → 604, so the
  split waited.)
- [ ] **Split content per area and topic**: `content/overworld.ts` → `content/overworld/`
  (village NPCs, the hollow, the shrine...). *Trigger: a content file passes ~500 lines.* (2026-11-03, S1: the
  village's NPCs and opening moved out to `content/village.ts`, overworld.ts 447 → 305 lines; the hollow is next out.)
- [ ] **Dialog as data**: lines in per-area data files keyed by id, scripts reference
  keys. Makes writing reviewable in one place and enables localization (Steam players
  expect translations). *Trigger: before the second dungeon's content, or when
  localization is planned; at the latest before the Steam page.*
- [ ] **Per-region scenery seeds**: each overworld region gets its own RNG so adding or
  changing one region can't reshuffle another (see Conventions in [engine.md](engine.md)).
  Done 2026-11-03 for the hollow and the gorge (`regionRng(name)` in `layout.ts`; the valley keeps
  its 1337 stream). *Still open, trigger narrowed: a change to the valley's own scenery (split it
  into per-area streams then).* (2026-11-03, S1: the first ruin only filters scenery out with `inRuin` and levels
  a pad in `terrainHeight`, not `placementHeight`, so nothing reshuffled; S3's ruins should do the same.)
- [ ] **Visual level editor (maybe)**: if authoring dungeons as data + text map + top-down
  renders proves slow or error-prone, build a small in-browser editor that edits the same
  data format. *Trigger: evaluate after the first dungeon; decide with the owner.*
- [ ] **The travel menu at scale**: group bells by region, mark where Wren is, maybe a
  little map of the valley. *Trigger: more than ~8 bells.*
- [ ] **Quest/flag overview**: a generated list of every flag, who sets it and who reads
  it, so quest logic stays understandable across many areas. *Trigger: ~30+ flags.*
- [x] **Seed enemy randomness** (done 2026-11-03, shrine session B; `Enemy.rng`, tests seed it): Thornling/Shellback wandering uses `Math.random`, so a few unit tests
  in `thornling.test.ts` fail about 1 run in 8. Give enemies an injected RNG (as `core/math.ts` has).
  *Trigger: the next time one of them flakes in CI, or any enemy work.*
- [ ] **Docs hygiene**: if a topic doc passes ~400 lines, split it. *Trigger: as stated.*

## Known quirks and tech debt

- **Village homes are shells**: the two standing cottages have locked doors (`door.home0/1`, "The door is locked.") and no
  interior. When they become enterable, follow the mill: a `HingedDoor` (`world/objects.ts`), a room inside the walls
  (the camera's doorway pane is `Layer.CameraOnly`), a bed or story beat. Outside the square the road-gate lanterns have glow but no real light
  (four point lights in all: three lanterns and the mill's wall lamp); more would cost GPU in the browser demo.

- **Lamplighter fight perf** (owner's play, 2026-11-03): the shrine's slowness was its 34 real lights (now pooled). `?debug` in the
  village and the fight reads 120 fps (365-1000+ draws, ~190-210k tris), so no sustained slowness. If it still hitches, suspect the
  shader rebuild when the fight's light is added (keep light counts constant), not draw counts.
- **Lamplighter fight, unreproduced** (owner's play, 2026-11-03): after its intro Wren was at the arena's edge, couldn't
  move for a while, then controls felt "inverted". A keyboard repro (walking in, with and without the shield held) moved
  normally and W followed the camera. Waiting on the owner: keyboard or gamepad, what was held during the intro, what
  "inverted" meant, whether a hit pinned Wren against the fire wall. Wren starts ~2 m inside the seal (the trigger is
  `HOLLOW.r - 2`), by design so far.

- **`npm run smoke -- shrine-keys` fails** at "dying in the shrine respawns at its entrance": 39 enemies alive after
  respawning, 38 expected (45 spawns minus 7 in beaten challenge rooms). Fails the same on the commit before surfing,
  every run. Not diagnosed: either the test's count or a real respawn bug (one spawn in a cleared room not obeying the
  checkpoint rule in AGENTS.md). Reproduce in a failing unit test first. Not urgent, but fix before the full suite is
  trusted as a green gate.
- A streamed region builds in one frame: a hitch at the streaming point (the Northpass is 150×60 cells of
  terrain plus a trimesh; unmeasured on a real GPU). Spread the build over frames when regions get big.

- Two roads ford ponds: the grove road (11 m of road, ≤ 0.44 m deep) and the shrine road
  (14 m, ≤ 1.03 m). Walkable since there's no swimming; revisit when swimming lands.
- Bundle is ~5 MB (1.8 MB gzipped), mostly Rapier's WASM inlined as base64 by the
  `-compat` package. Fix in the load/perf pass: `@dimforge/rapier3d` + a WASM plugin, or
  lazy loading.
- Variable time step. If we add dynamic bodies (pushable blocks, physics props), move to a
  fixed 60 Hz physics step with interpolation. (Pushable blocks are a classic dungeon
  puzzle: this may come up with the first dungeon.)
- Characters are ~20 small meshes each (many draw calls), and the Lamplighter ~150; merge
  rigid parts per bone if enemy counts grow. Bosses carry a PointLight; adding/removing
  lights recompiles shaders once (a small hitch at spawn and death, hidden by cutscenes).
- Sword hits, lock-on and interact ranges are distance/angle checks, not physics shapes.
- One save slot; position isn't saved.
- The title screen's control list is keyboard-only text (in-game prompts do adapt).
- The subtitle "Song of the Waking Shrine" predates removing songs; renaming is the
  owner's call.

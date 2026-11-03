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

0. ~~The owner's playtest tweaks A–G (2026-11-02)~~ done. Untested by play: the gem economy
   (95 in the shrine plus bushes, against the 50-gem tunic (it was 100 until 2026-11-03) and 20 per flask refill).
0.5. **Bells: bell posts, fast travel, bell trials** (owner's request, 2026-11-02, before the
   shrine's boss). Done: bells, posts and the travel menu, the platforming base, both trials (the Bell Shaft,
   the Hushing Gorge; the latter awaits the owner's play). See [bells.md](bells.md).
1. **First dungeon: the Waking Shrine.** In progress: milestones 1–5 done (see the status
   in [shrine.md](shrine.md)); **milestone 6** (Gravelheart) is in its last part, **6D+**
   (owner's redesign, 2026-11-03, replacing the old glove-stone Northpass): beating the boss opens a
   hidden room whose seal-stone breaks the magic gate at the valley's north edge; beyond it, the
   Northpass (streamed in, one continuous world), the Cragstalker, a third bell and a camp. Three
   sessions, **D1 (done, unplayed), D2, D3 (built 2026-11-03, unplayed)**, in [shrine.md](shrine.md) "Build plan". Then polish (8).
2. **Pause menu**: started 2026-11-03 (P / Start, `game/pauseMenu.ts`): its first page lists the keepers'
   notes (Murmurbuds, [world.md](world.md)). Still to come: inventory, settings (mouse sensitivity, invert Y,
   volumes). (No dungeon map or compass by design.)
2.5. ~~**Shield surfing**~~ built 2026-11-03, unplayed (rules in [combat.md](combat.md); Lark in [world.md](world.md)). Tune `SURF_SPEED`, the carve and the dust by play. The original brief:
   A small kid in Thistledown does one thing: puts the idea of riding your shield in Wren's head (flag;
   then a short tutorial line: how to do it). Then: jump, raise the shield (or raise it, then jump), and land
   *while still holding shield* → Wren rides the shield along the ground for as long as shield is held, 2–3×
   walking speed: the player's sprint (not the dev sprint). Steering is normal movement (stick/WASD, camera
   with the right stick/mouse), just faster, with the shield under her feet; a riding pose is nice-to-have.
   Debris/dust kicked up from under the shield, not overdone. Let go of shield → back to normal at once. An
   enemy hit while surfing knocks her off and does its normal damage. Design calls for the plan: does the
   surf block hits (probably not: it's the shield under her feet), slopes/water/ledges, jumping off it, lock-on
   while surfing, whether the guard gauge drains. Add a `village` smoke step and a look scene.
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
  (village NPCs, the hollow, the shrine...). *Trigger: a content file passes ~500 lines.*
- [ ] **Dialog as data**: lines in per-area data files keyed by id, scripts reference
  keys. Makes writing reviewable in one place and enables localization (Steam players
  expect translations). *Trigger: before the second dungeon's content, or when
  localization is planned; at the latest before the Steam page.*
- [ ] **Per-region scenery seeds**: each overworld region gets its own RNG so adding or
  changing one region can't reshuffle another (see Conventions in [engine.md](engine.md)).
  Done 2026-11-03 for the hollow and the gorge (`regionRng(name)` in `layout.ts`; the valley keeps
  its 1337 stream). *Still open, trigger narrowed: a change to the valley's own scenery (split it
  into per-area streams then).*
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

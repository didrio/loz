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

0. **The owner's playtest tweaks (2026-11-02), before milestone 6**, one session each:
   - ~~A: combat and visuals~~ **done**: no sword while staggered (crawl at 6%), the shield's
     two poses (side of the arm / square in front), blob shadows under orbs and wisps.
   - ~~B: shrine fixes~~ **done**: no fight-room shutters (`fight` flag removed; rooms just
     count as cleared), no entrance seal or entry cutscene (open doorway, `entered` dropped
     from the save), the "railing" was a statue 0.4 m past the top of the `shaftUp` stairs
     (statues now keep a 2 m landing clear of stairs), stair-trim z-fighting fixed. Smoke
     scenarios edited for the open entrance but not run (owner's call).
   - ~~C: colored keys, one key per door~~ **done**: `Lock`/`Loot` `{ key: color }` replace the
     counted small key; the validator wants exactly one chest and one door per color; the solver is
     one greedy sweep (no softlock search); doors carry a color band, the HUD shows a colored key
     icon per key held; `SAVE_VERSION` 4. Key web in [shrine.md](shrine.md). Statues chest is now
     20 gems.
   - ~~D: village~~ **done**: Tobin's mill (a `MillInterior` area, bed), Odo's stall; `api.ask` and
     `content/shop.ts` `offerWare` are what E reuses for flask refills.
   - **E: flasks** (**plan mode**, new system + save change). Replaces the drinks that
     refill on death (`game/drinks.ts`). Exactly two flasks exist, both found already full: a
     life flask (red) and an attack flask (orange/yellow). Drinking empties it (empty bottle,
     same HUD spot). Death does NOT refill them. Once Wren owns at least one flask, the merchant
     refills empty flasks one at a time, 20 gems each, with a choice of life or attack potion.
     Shrine data: Echo Hall's heart chest (`echoChest`) becomes one flask; the other is one of
     the existing drink chests; remove the third drink chest (check for rooms with two chests).
     Update the checkpoint rule in AGENTS.md, combat.md, shrine.md ("drinks refill on death"),
     the save format (migration) and the HUD. Check the gem economy (gems now pay for refills).
   - ~~G: text and dialog quality pass~~ done (the owner still reads it in-game; tone is theirs).
   - **F: dungeon fixes** (after E, or before it; no plan mode): (1) challenge rooms (a chest or
     progress appears when their enemies are beaten) keep their enemies dead after death, and
     the chest stays visible and open; plain scattered enemies still respawn. Today
     `content/shrine.ts` respawns every enemy on death. (2) A stray sound plays after the
     statues (sentinels) wake, matching none of their actions: trace what sentinel.ts
     (`grind`, `heavySwing`, `stoneThunk`) and old door code (`rumble`, 3.2 s) play and when.
     The owner has to listen to confirm (we can't hear audio).
1. **First dungeon: the Waking Shrine.** In progress: milestones 1–5 done (see the status
   in [shrine.md](shrine.md)); **next is milestone 6** (Gravelheart and its theme), then the
   **Northpass** valley exit the glove opens (7), polish (8).
2. **Pause menu**: inventory, settings (mouse sensitivity, invert Y, volumes). (No dungeon
   map or compass by design.)
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

### Later triggers

- [ ] **Split `game/game.ts` again** if it grows back: next out would be areas/transitions
  (`loadArea`, `travel`, respawn) and the HUD feed in `updateWorld`. *Trigger: it passes
  ~700 lines, or the pause menu/inventory lands.*
- [ ] **Split content per area and topic**: `content/overworld.ts` → `content/overworld/`
  (village NPCs, the hollow, the shrine...). *Trigger: a content file passes ~500 lines.*
- [ ] **Dialog as data**: lines in per-area data files keyed by id, scripts reference
  keys. Makes writing reviewable in one place and enables localization (Steam players
  expect translations). *Trigger: before the second dungeon's content, or when
  localization is planned; at the latest before the Steam page.*
- [ ] **Per-region scenery seeds**: each overworld region gets its own RNG so adding or
  changing one region can't reshuffle another (today one seeded stream covers the whole
  valley; see Conventions in [engine.md](engine.md)). *Trigger: the next new overworld
  region or a scenery change outside the hollow.*
- [ ] **Visual level editor (maybe)**: if authoring dungeons as data + text map + top-down
  renders proves slow or error-prone, build a small in-browser editor that edits the same
  data format. *Trigger: evaluate after the first dungeon; decide with the owner.*
- [ ] **Quest/flag overview**: a generated list of every flag, who sets it and who reads
  it, so quest logic stays understandable across many areas. *Trigger: ~30+ flags.*
- [ ] **Docs hygiene**: if a topic doc passes ~400 lines, split it. *Trigger: as stated.*

## Known quirks and tech debt

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

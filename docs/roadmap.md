# Roadmap, scaling plan and tech debt

The game is meant to grow to **50–100× its current content** (a 10–15 hour game), built
almost entirely by AI agents. This file is how we keep the codebase ready for that
without stopping to refactor everything up front.

**How to use it:** whoever **writes a ticket** ([tickets.md](tickets.md)) reads the scaling
checklist below. If the ticket fires an item's trigger, the item goes into the ticket (or
becomes its own ticket first). The session doing the ticket ticks the item off here with the
date. When you notice a new scaling risk, add it with a trigger. Don't do untriggered items
early unless the owner asks: they're best designed against the real use case.

## Feature roadmap

What's next is in [tickets.md](tickets.md). This is the longer view; an idea becomes a ticket
when it's near.

- **Next region:** Sallowmere's map and Stiltwick are built and empty; its story and mechanics are being redesigned by
  the owner (2026-11-06: the old design in [sallowmere.md](sallowmere.md) is shelved, not the plan).
- **The N64 look rebuild** (owner, 2026-11-07; replaces the shelved PS2 "look pass", old T20–T26 in git history): the
  starter zone rebuilt on the new pipeline ([art.md](art.md), [pipeline.md](pipeline.md)) before any new area. Behaviour
  never changes. In order, each written as a ticket when it's near (at the previous one's `/wrap`):
  1. **Foundations:** T31–T42 in [tickets.md](tickets.md) (T27–T30 are done: look loop, Display setting, palette, shading and textures; T40/T41 texture everything).
  2. **The golden set**, one Final-pass ticket each, locked only when the owner approves (the first ones
     plan · opusplan · high, as they define the style): a Thornling → Wren with her full animation set → the starter-area
     entrance vignette (phone frame rate checked) → the prop set (chest from T35, door, jar, crate, sign) → Pip → the Hollow
     Lamplighter → Gravelheart → one shrine room (puzzles unchanged). Each captures its reference renders (art.md
     "The golden set"). After the second final pass, write a `/final-pass` skill (CLAUDE.md: recipes the second time).
  3. **Everything else, final passes** (auto · sonnet, following the golden set): each remaining enemy (Gloomwisp, Dozing
     Sentinel, Shellback, Cragstalker, the blight's strays, Murmurbuds); the NPCs, grouped (they share `buildHumanoid`);
     props, interactables and pickups (doors, wakestones, switches, plates, jars, signs, keys, hearts, gems, the bells and
     posts, the doll, the glove, the shield, the Heart Vessel, the prism); each valley sub-region with its atmosphere
     (Thistledown and the mill, the ruins, the grove and bridge, the hollow, the gorge, the camp and the Northpass, the
     blight's thorns), texturing what isn't yet (T40, T41) and the de-uniforming jitter (old T20); the shrine's rooms
     in groups; water with a ripple and shore band (old T24); the UI on every screen (HUD, pause, title, file select).
  4. **The phone performance pass:** the owner reads `?debug` (fps, draw calls) on a real mid-range phone at set spots;
     merging and instancing fixes; scene budgets written into art.md; the Performance cap tuned from the numbers.
  5. **The parity sweep:** the registry shows no `rough` assets, nothing uses the old materials, UI or unprocessed audio,
     the full smoke and look suites pass, and a complete playthrough (start to the Waybell, every quest, puzzle, enemy and
     boss) behaves as before. Then the starter zone is a candidate for the public demo.
  Sallowmere and Stiltwick get the global changes for free and their final passes after the owner's redesign.
- **Optional, any time:** the Glimmer Lake grotto (the glove pulls a half-sunk wakestone; shrine.md).
- **Later (owner's asks):** an SFX pass; the rescue quests for Maren, Tobin and Odo (major story
  quests out in the world, Odo back at his stall, the kids' lines changing with them;
  [world.md](world.md) "The empty village").
- **Touch controls:** tune by the friend's reports: camera drag (`TOUCH_LOOK`), button sizes. The layout's refinement is
  T37; touch devices default to the Performance display.
- **Gem economy** (for balancing): 95 in the shrine plus bushes, against the 50-gem tunic and 20
  per flask refill.
- **Pause menu:** Settings, Hints, Messages ([engine.md](engine.md) "The pause menu"). A new tab
  only when there's something to show. Steam-build settings (key rebinding, resolution, quit) wait
  for the desktop build.
- **Desktop build** (Electron) with a file-based `KeyValueStore`; Steamworks later. Ship
  `CREDITS.md` with CMUdict's full license text (its BSD license requires it in binary
  distributions) and the libraries' notices.
- **Load/perf pass:** Rapier WASM as a file, code splitting, character mesh merging.
- **Depth:** more enemy types, target switching, jump attack, original items/tools, heart pieces,
  swimming, ledges/climbing, NPC day/night schedules, music per area, camera rails for cutscenes.
- Then: itch.io demo, Steam page (wishlists), playtesting with real players.

## Scaling checklist

Each item: what, why it matters at 50–100×, and the trigger that says "do it now".

### Done (details in the topic docs and git)

AGENTS.md as an index plus topic docs; dungeons as data with validator, solver, puzzle checker,
text map and builder; area transitions and per-area saves; per-dungeon keys and namespaced
dungeon state; scenario smoke tests from save fixtures; agent setup for cost (CLAUDE.md); the
first `game.ts` split; overworld streaming by region ([engine.md](engine.md) "Regions"); seeded
enemy randomness.

### Later triggers

- [ ] **Split `game/game.ts` again** if it grows back: next out would be areas/transitions
  (`loadArea`, `travel`, respawn) and the HUD feed in `updateWorld`. *Trigger: it passes
  ~700 lines (696 on 2026-11-04).*
- [ ] **Split content per area and topic**: `content/overworld.ts` → `content/overworld/`
  (village NPCs, the hollow, the shrine...). *Trigger: a content file passes ~500 lines.* (The hollow is next out of `overworld.ts`.)
- [x] **Dialog as data**: the player's words live in `content/text/<area>.ts` (done; new text goes there).
- [ ] **Per-region scenery seeds**: each overworld region gets its own RNG so adding or
  changing one region can't reshuffle another (see Conventions in [engine.md](engine.md)).
  Done for the hollow and the gorge (`regionRng(name)` in `layout.ts`); the valley keeps its 1337
  stream (new things in it filter scenery with `inRuin`-style checks and level pads in
  `terrainHeight`, so nothing reshuffles). *Trigger: a change to the valley's own scenery (split it
  into per-area streams then).*
- [ ] **Visual level editor (maybe)**: if authoring dungeons as data + text map + top-down
  renders proves slow or error-prone, build a small in-browser editor that edits the same
  data format. *Trigger: evaluate after the first dungeon; decide with the owner.*
- [ ] **The travel menu at scale**: group bells by region, mark where Wren is, maybe a
  little map of the valley. *Trigger: more than ~8 bells.*
- [x] **Quest/flag overview**: done (`npm run flags`, `game/flags.test.ts`).
- [ ] **Docs hygiene**: if a topic doc passes ~400 lines, split it. *Trigger: as stated.*
- [ ] **AGENTS.md's layout tree at scale**: every region and dungeon adds files, and the tree is
  loaded into every session. When a folder lists more than ~8 files, give it one line in the
  tree and move its file list to its topic doc. *Trigger: as stated, or AGENTS.md over ~200 lines.*
- [x] **World progression solver**: done lean (`content/progression.ts`, [dungeons.md](dungeons.md) "World progression"):
  every gate as data, a walk from a new save to the Waybell. Each Sallowmere ticket adds its gates. Not yet: gates by
  time of day, or a bell lifted off its post. *Trigger to extend: a gate that depends on either.*
- [ ] **An item selector**: the glove owns `item`; the Ember Lantern is passive (Interact) on purpose. *Trigger: a second
  equippable item that needs the item button.* The design (art.md "Items and the pause screen", from the 2026-11-07
  proposal): an **item wheel** that pauses the game, hidden until two items are owned, radial for up to ~8. Touch: tap
  the item button to use, drag outward from it to open the wheel, release on an item to equip. Pad: hold a dedicated
  button (a shoulder or the d-pad). Keyboard: hold a key, plus number keys. Not hold-the-item-button: some items will be
  held to use (aiming, charging).
- [ ] **A test that plays the whole game** (owner noted, 2026-11-05): a scripted run from a new
  game to the current end, nightly in CI, with smoke fixtures exported from it instead of written
  by hand. *Trigger: a second region's quest chain exists, or a fixture turns out not to match
  a real playthrough.*
- [ ] **A code index tool** (CodeGraph, Graphify; looked at 2026-11-05, not worth it yet: our
  docs make discovery cheap, and CodeGraph leaves more code in the context). *Trigger: AGENTS.md's
  map can't stay short, or sessions often need 10+ reads to find code. Then A/B CodeGraph on one
  real ticket.*

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

- A plain region (the Northpass, 150×60 cells of terrain plus a trimesh) still builds in one frame, out of sight; big ones
  build a step a frame (engine.md "Regions"). Neither is measured on a real GPU.
- `npm run lexicon` (the shelved speech lab) now writes ~230 words where the committed lexicon has ~730: it scans fewer files
  than when it was last run. Not re-run since; new words go in `labs/speech/names.ts` until someone fixes the scan.

- Two roads ford ponds: the grove road (11 m of road, ≤ 0.44 m deep) and the shrine road
  (14 m, ≤ 1.03 m). Still walkable: deep water (a fall) starts at 1.2 m (`DEEP_DEPTH`, game/water.ts), and
  `layout.test.ts` keeps every road shallower than that. The river and lake beds, once walkable, are now a fall.
- Bundle is ~5 MB (1.8 MB gzipped), mostly Rapier's WASM inlined as base64 by the
  `-compat` package. Fix in the load/perf pass: `@dimforge/rapier3d` + a WASM plugin, or
  lazy loading.
- Variable time step. If we add dynamic bodies (pushable blocks, physics props), move to a
  fixed 60 Hz physics step with interpolation. (Pushable blocks are a classic dungeon
  puzzle: this may come up with the first dungeon.)
- Characters are ~20 small meshes each (many draw calls), and the Lamplighter ~150: the kit's `bakeRig` (T35) merges
  rigid parts per joint, and each model adopts it in its final pass. Bosses carry a PointLight; adding/removing
  lights recompiles shaders once (a small hitch at spawn and death, hidden by cutscenes).
- Sword hits, lock-on and interact ranges are distance/angle checks, not physics shapes.
- One save slot; position isn't saved.
- The title screen's control list is keyboard-only text (in-game prompts do adapt).
- The subtitle "Song of the Waking Shrine" predates removing songs; renaming is the
  owner's call.

# AGENTS.md

Context for AI agents (and humans) working on this repo. **Keep it current**: when a
behavior, decision or file layout changes, update the matching section here in the same
change.

## What we're building

**Embervale: Song of the Waking Shrine**: an original 3D action-adventure in the spirit of
late-90s console adventures. An open field around a village hub, dungeons with keys,
switches and bosses, lock-on sword combat, a day/night cycle, and an instrument whose songs
change the world. Low-poly, flat-shaded, a little wistful.

It started (Nov 2026) as an experiment in how far AI could get building such a game in the
browser. The goal now is a **real, full-length game (10–15 hours)**, sold for $5–10 **on
Steam** (desktop build via Electron) with a **free browser demo on itch.io**. Build
everything as if it will ship.

## Hard rules

- **Original IP only.** Genre conventions are fine (lock-on targeting, hearts, gems, dungeons,
  songs that do things, a field hub, day/night). Never recreate a specific existing game's
  names, characters, story, map layout, music, sound effects, logos or UI design, and never
  use another franchise's names in code, text or marketing. If a request would recreate a
  specific game's content, do the original version and say so.
- **Art is primitives only**: boxes, cylinders, cones, spheres, icosahedra built in code with
  flat colors. No imported models, textures or sprites. Silhouette + color + flat shading
  is the style.
- **Audio is synthesized in code** (Web Audio in `core/audio.ts`). No samples, no
  recordings. All melodies are original.
- **AI disclosure**: Steam asks whether a game contains AI-generated content. It does (code
  and writing). Keep that in mind; the owner will disclose it.

## Working with the owner

- Fullstack (React) developer and long-time Ableton/keyboard producer; new to game dev
  terms. Explain engine concepts in plain words (DAW/web-dev analogies help).
- They describe what they want and explicitly invite pushback: give an honest opinion,
  propose a simpler model when there is one, then build it and say where you deviated.
- They want depth over speed: take the time to do things properly, but report plainly.
- Verify in a real (headless) browser before calling anything done (see Verifying).
  You can't hear audio or judge game feel: say so and ask them to play/listen.
- Commit or push only when asked.

## Definition of done

Every change, before you call it done. These are the habits that have caught real bugs
here (a camera inside a tree, a boss that froze, Wren stuck under the floor), so don't
skip them because the change "looks small":

1. **Rules get tests.** A logic change gets a unit test next to its module that would fail
   without it. A bug gets **reproduced in a failing test first**, then fixed.
2. **`npm run check`** passes (lint, unit tests, typecheck, build).
3. **Gameplay or content changes: `npm run smoke`** passes, and gets a new step when you
   add a quest beat, a boss or a system.
4. **Anything visible: look at it.** `npm run look -- <scenes>` (or a scratch Playwright
   script built on `scripts/browser.mjs`), then open the screenshots and check them. A
   passing test doesn't mean it looks right. For refactors, capture before and after.
5. **When a check fails, find out why before touching game code.** It may be the test
   (headless timing, reading the HUD before the next frame) or a real bug.
6. **Update this file** in the same change: behavior, layout, decisions, quirks.
7. **Report plainly**: what you verified, what you couldn't (audio, feel, a real GPU or
   gamepad), and where you deviated from the request.

## Tech stack (and why)

- **TypeScript + Vite + Three.js** (rendering) + **Rapier** (`@dimforge/rapier3d-compat`,
  physics in WASM) + **Vitest** (unit tests) + **oxlint** + **playwright-core** (smoke test).
- **Why the web, not Unity/Godot**: everything is text an agent can read, write, test and
  verify headlessly (fast, reliable iteration); a link is the best way to share demos;
  primitive-only art makes an engine's art pipeline irrelevant. Steam is still possible via
  an Electron wrapper. Consoles would need a port; accepted.
- **Why Three.js + our own small engine layer, not Babylon.js**: flexibility and ecosystem.
  We add proven libraries for hard parts (Rapier now; recast-navigation if we need
  pathfinding) and keep our own layer small and tested.

## Architecture

Dependencies point one way: `core` ← `render` ← `world` ← `game` ← `content`.
`core` knows nothing about the game; `world` builds places but never decides what happens
in them; `content` (story, dialog, quest logic) binds behavior to world objects by id.

```
src/
  main.ts                  boot: init Rapier, create Game, expose window.embervale (dev/?debug)
  core/                    engine-level, no game knowledge
    physics.ts             Rapier wrapper: layers, static colliders, Character (kinematic controller), ray queries
    input.ts               actions (keyboard/mouse/gamepad), bindings, button glyphs, deadzone
    director.ts            game-time waits/conditions/tweens for scripts (replaces setTimeout)
    save.ts                save format, validation, KeyValueStore (localStorage now, files later), settings
    audio.ts               synthesized sfx, flute notes, background music
    math.ts                noise, easing, angles, seeded RNG
  render/
    materials.ts           shared flat materials (mat), uniqueMat, mergeStatic (batching), disposeTree
    shapes.ts              reusable shapes: heartGeometry, glow (additive light balls)
    characters.ts          blocky humanoid builder (player + NPCs)
    sky.ts                 sky dome, sun/moon/stars, lights through the day
    particles.ts           little flying cubes
  world/
    area.ts                Area interface, Interactable, Trigger, AreaBuilder
    objects.ts             reusable world objects: Npc, Chest, StoneDoor, BushField, BossArena, HeartVessel, GreatLantern
    overworld/             Emberfield (the first Area)
      layout.ts            pure map: landmarks, terrainHeight, roads, area names, placement rules
      terrain.ts           terrain mesh + trimesh collider, water, boundary walls
      village.ts, landmarks.ts, nature.ts   Thistledown; bridge/grove/shrine/signs; trees/rocks/grass/bushes
      hollow.ts            Gloaming Hollow (the Lamplighter's arena): dead trees, lamp posts, ash
      index.ts             Overworld class: builds it all, exposes npcs/chest/door, interactables, triggers
  game/
    game.ts                Game: owns systems, frame loop, modes, implements ScriptApi
    script.ts              ScriptApi + Script + Page types (the contract content uses)
    player.ts              Wren: controls → movement/combat/animation on a physics Character
    guard.ts               the shield's guard: 3 slots, per-slot regen, guard break
    enemies.ts             Enemy base (hurtboxes, hurt results, hit options), Thornling, Gloomwisp, EnemyManager
    boss.ts                Boss base class: phases, the move system, guarding/weak points, arena, reset
    bosses/lamplighter.ts  The Hollow Lamplighter (first mini-boss): rig, animation, moveset
    hazards.ts             shockwaves and homing orbs that outlive the move that made them
    camera.ts              orbit/lock-on camera with collision and cutscene shots
    dialog.ts              paged dialog (promise-based)
    pickups.ts             gems and hearts
    songs.ts               flute song definitions + matching
    state.ts               GameState (flags, songs, hearts, gems, clock) + save conversion
    debug.ts               ?debug overlay and collider wireframe
  content/                 the game's story; what things DO
    areas.ts               createArea(id): builds an area and binds its content
    overworld.ts           scripts for every overworld interactable/trigger, save restore
    story.ts               intro, death, song effects
  ui/  hud.ts, style.css   DOM HUD over the canvas: hearts, gems, clock, prompts, dialog, flute, cards, title menu
scripts/
  smoke.mjs                end-to-end playthrough in headless Chrome (asserts game state)
  look.mjs                 named scene captures for visual checks
  browser.mjs              shared helpers for both
```

## Core concepts

### Frame loop (`Game.frame`)
`input.poll` → `director.update` (resumes waiting scripts) → mode update (player and
enemies request moves from the character controller; hazards and pickups update) →
area/HUD/music update → camera → `physics.step` → sky → render → `input.endFrame`. Time
step is the frame time capped at 50 ms (game time slows down rather than jumping when
frames are slow), times the **time scale** (slow motion in cutscenes) and zero during
**hit-stop** (a few frozen frames when a hit lands; it's what makes combat feel weighty).

### Modes
`title` (menu over a camera orbit) · `play` · `flute` (notes play; the camera turns and
**enemies keep coming**, so the flute can't pause a fight) · `cutscene` (a script runs:
dialog, item get, camera shot; no player control; the clock and fighting enemies freeze,
but deaths and boss entrances keep animating via `Enemy.animatesInCutscene`).

### Areas
An `Area` (overworld, later dungeons and interiors) owns its meshes and colliders, its
spawn point, its `interactables` (press interact: talk/open/read/check) and `triggers`
(walk-in zones), all with string ids like `npc.maren`, `chest.grove`,
`trigger.shrineEntrance`. `content/<area>.ts` maps those ids to scripts. Build areas with
`AreaBuilder`: `b.mesh(...)` adds **static** geometry that `finish()` merges into a few
draw calls per material per 80 m cell; `b.dynamic(obj)` keeps things that move or change
(NPCs, doors, glowing windows, instanced trees). Colliders made through the builder are
tracked so `dispose()` removes everything. After building, `physics.refreshQueries()`:
Rapier answers ray queries only about colliders that existed at the last step.
Adding an area = an `Area` class + a content file + a case in `content/areas.ts`.

### Physics (`core/physics.ts`)
Units are meters; gravity 30 m/s² (snappier than real). Layers:

| Layer | What | Blocks characters | Blocks camera |
|---|---|---|---|
| World | terrain, buildings, big rocks, doors | yes | yes |
| Prop | trees, fences, barrels, bushes, small rocks, NPCs | yes | no |
| Bounds | invisible walls at the area edge | yes | no |
| Player / Enemy | character capsules | each other | no |

`Character` = kinematic capsule + Rapier's character controller (slides along walls, climbs
slopes ≤ 50°, auto-steps ≤ 0.45 m, snaps to ground). Positions are **feet** positions. Call
`move` at most once per physics step. Player: radius 0.4, 1.8 m tall, run 8.5 m/s, jump 11.
`groundY(x, z)` and `rayDistance(...)` are the queries; gameplay never calls Rapier directly.

### Combat (`game/enemies.ts`, `game/player.ts`, `game/hazards.ts`)
- The sword tests each enemy's **hurtboxes** (spheres; the blade reaches 0.15–2.5 m above
  Wren's feet, 3.1 m for the overhead chop) and prefers higher-`priority` boxes (weak
  points). `Enemy.hurt` answers `hit`, `weak` (weak point), `guarded` (Wren recoils, combo
  ends) or `ignored`. `Game.onSwordHit` turns that into sound, sparks and hit-stop.
- **Defense is the shield, nothing else** (no dodge roll, no stamina). The shield has a
  **guard** of 3 slots (`game/guard.ts`). Every attack is an `Attack` with `damage`
  (half-hearts) and `guard` (slots a block knocks down: 1 light, 2 heavy, 3 crushing);
  TypeScript requires both, and each enemy keeps its numbers in one attack sheet
  (`THORNLING_LUNGE`, the Lamplighter's `ATTACKS`). Each knocked-down slot returns on its
  own after 2 s, **but only while the shield is lowered** (its timer pauses, not resets,
  while it's up): the shield is very safe in short bursts, then you back off and lower it
  to recover, so even slow, light attackers eventually break a shield that's never dropped.
  Blocking with fewer slots up than the cost **breaks the guard**: that hit is still
  stopped, but Wren is knocked back and can't raise the shield for 2 s (moving and
  attacking still work; the shield droops and flashes red; slots refill meanwhile since
  it's down). The shield stays up through jumps (Space works while holding Shift).
- The **guard gauge** floats beside Wren on screen (three 10 px bars: green up, gray down
  and refilling from the bottom, red when broken), like a stamina wheel. It appears when
  the guard takes damage and stays until a second after it's full again
  (`Guard.gaugeVisible`, positioned by `Game.guardGaugePosition`).
- Attacks on Wren go through `hitPlayer(from, attack)`: the shield stops frontal hits
  unless `unblockable`; `groundOnly` attacks (shockwaves) miss while airborne; the 1.2 s
  after a hit is untouchable. Results: `hit` / `blocked` / `broken` / `miss`.
- `Hazards` holds attacks that outlive their move: `shockwave` (unblockable: jump it) and
  `orb` (homes briefly; the shield pops it for 1 slot). Cleared on respawn and area change.

### Bosses (`game/boss.ts`, `game/bosses/`)
A boss is an `Enemy` with states `dormant → intro → fight → dying`. Every attack is a
`Move` with three steps, **windup** (the telegraph) → **active** (can hurt) → **recover**
(open to punishment), plus a weight by distance and an optional cooldown. The base class
picks moves (never the same one three times running unless it's the only option), runs
the steps, turns at `turnRate`, handles HP phases (`phases: [0.5]` → `phaseMove` plays,
invulnerable), follow-ups (`later`, `queue`, `skipStep`), per-move `scratch` notes,
and `reset()` when the player dies mid-fight (full HP, dormant, arena re-armed). A
concrete boss provides its rig + `animate`, `moves()`, `hurtboxes()` (from rig nodes, so
weak points are reachable only when the pose brings them down), `isGuarding` and
`damageMultiplier`. Content spawns it in `AreaContent.start`, arms its `BossArena`, runs
the intro script on the arena trigger (`wake()` → `until(ready)` → `engage()`), and its
`onDefeated` runs the defeat script. The HUD bar, darkening (`gloom`) and boss music
follow whichever boss is engaged.

**Fairness rules** (keep these for every boss; they're what "tough but fair" means here):
- Every attack has a readable windup of at least ~0.5 s and a distinct visual tell.
- Every attack has an answer: block (if the guard can afford it), jump or move.
  Guard-crushing attacks (cost 3) get an unmistakable tell (the Lamplighter's eyes flash
  red and it shrieks). Unblockable attacks (shockwaves) must be jumpable.
- Guard costs are the main tuning knob: chains and volleys should sometimes cost more
  than a full guard, so blocking everything isn't a strategy (the Lamplighter's phase-2
  volley fires 8 orbs; a sweep + backhand costs exactly 3).
- Big attacks leave big openings (the slam's stuck hook brings the weak point down).
- Greed gets punished, not forbidden (the Lamplighter spins if you keep hitting its back).
- A phase change drops a couple of hearts; arenas have a few cuttable bushes.
- Damage: 1–2 half-hearts per hit for an early boss (Wren starts with 3 hearts).

### Input (`core/input.ts`)
Code reads **actions**, never keys. Bindings:

| Action | Keyboard / mouse | Gamepad (standard mapping) |
|---|---|---|
| move / camera | WASD / mouse (click to capture) or arrows | left stick / right stick |
| attack · shield | Click or J · Shift or right-click | X · RT/RB |
| jump | Space | A |
| lock on | Q or Tab | LT/LB |
| interact · flute | E (or Enter) · F | A · Y |
| flute notes 1–5 | 1–5 | A, ↓, →, ←, ↑ |
| confirm · cancel | Enter/Space/E/click · Esc | A/Start · B |
| music on/off | P | Back |

Gamepad A both talks and jumps: the game checks `interact` first (the classic context
action button). The HUD shows glyphs for the last-used device. In dialog text, `[attack]`
renders the right button, `{0}`–`{4}` render flute notes, `*word*` highlights.

### Scripts and cutscenes (`game/script.ts`, `core/director.ts`, `content/`)
Story beats are `async` functions taking a `ScriptApi`: `say`, `wait`, `until`, `tween`,
`fade`, `card`, `shot(from, at, cut?)`/`releaseCamera` (camera moves and cuts; shots never
end up inside geometry), `setTimeScale` (slow motion), `showBossTitle`, `addEnemy`,
`run` (queue another script), `warpTime`, `giveSword`, `respawn`, plus `state`, `sfx`,
`player`, `particles`, `area`, `physics`. `Game.run(script)` switches to cutscene
mode, and when the script ends it releases the camera, returns to play and **saves**.
Never use `setTimeout` for game logic: waits must follow game time.

### State and saves (`game/state.ts`, `core/save.ts`)
`GameState` holds quest `FLAGS`, known songs, hearts, gems and the clock, and is mutated in
place (systems keep references). Add flags to `FLAGS`; **never rename a shipped flag**
(old saves would silently lose it). Saves are versioned JSON (`embervale:save:0`),
validated and repaired on load; bump `SAVE_VERSION` only with a migration in
`decodeSave`. Saved: flags, songs, gems, hearts, clock. Not saved: position (continue
starts at the area spawn, with at least 3 hearts), enemies, cut bushes. Autosave: after
every script, every 30 s of play, and on page hide. Settings (`embervale:settings`): music.
Storage goes through `KeyValueStore` so the desktop build can write real files.

### Conventions
- +x is east, −z is north. Models face +z; `yaw = atan2(dx, dz)`.
- A full day is about 5 minutes (`HOURS_PER_SECOND = 1/12`); night is 18:00–6:00.
- Materials from `mat(color)` are shared: **never mutate them**; use `uniqueMat` for
  anything that flashes or glows.
- Overworld scenery is placed with a seeded RNG (`mulberry32(1337)`) in a fixed build
  order; reordering build calls reshuffles every tree. **Adding a landmark must not move
  existing scenery**: placement checks use `placementHeight` (the terrain before later
  carve-outs), every candidate draws the same random numbers whether or not it's placed,
  spots inside the new landmark are filtered out afterwards, and the landmark's own
  scenery uses its own RNG (see `hollow.ts`).
- Terrain is a formula (`terrainHeight`), so the mesh, collider and placement agree.
- Small pure functions with doc comments explaining *why*; rules in systems, wiring in
  `Game`, story in `content/`.

## World bible

- **Emberfield**, the valley at the heart of the land of **Embervale**: a gentle field ringed by
  mountains. **Thistledown Village** (northwest: cottages, a well, a windmill that turns
  without wind), **the Whispering Grove** (northeast: dense trees, a clearing with a chest
  in a shaft of light), **the Waking Shrine** (east hill: a stone shrine with a dead lantern
  on its roof, ringed by old pillars), **Glimmer Lake** (southwest), a river across the
  south with a wooden bridge.
- **Gloaming Hollow**: a sunken, dead clearing at the end of the south road, ringed by bare
  black trees and old iron lamp posts, with ash drifting up. Sign: "Here ends the
  lamplighter's road." The arena of the first mini-boss.
- **Story so far**: the lantern atop the shrine went dark; thornlings appeared in the field.
  The pedestal reads: "Sing to the sleeping stone, and the stone shall wake. Rekindle the
  lantern, and the night shall break." The flame didn't go out: it was *taken*. **The main
  quest frame: each major boss holds an ember of the stolen flame; returning embers
  relights the great lantern** (it glows brighter with each; `GreatLantern.setEmbers`).
- **The Hollow Lamplighter**, Keeper of a Stolen Flame (mini-boss, Gloaming Hollow): a
  4.4 m gaunt figure in a tattered lamplighter's coat, bone legs and arms, a hooked pole
  with a snuffer bell, candles on one shoulder, caged wisps on its belt, and an iron
  lantern cage for a head holding a cracked porcelain mask and the stolen flame, gone cold
  and blue. Villagers say old Corwin, who lit the hollow's lamps for forty years, still
  walks his rounds, "only taller than he was". Beaten, its flame turns warm and flies
  home: the shrine lantern's first ember. Leaves a **Heart Vessel** (+1 heart).
- **Wren** (hero): rust-orange coat, teal scarf, dark hair, round wooden shield, a reed
  flute; finds the **Wayfarer's Blade** in the grove. **Maren**: older villager in purple who
  knows the Song of Waking. **Tobin the Miller**: dry humor, runs the windmill.
- **Songs** (notes 1–5): Song of Hours `5 3 1 5 3 1` (skip to dawn/dusk), Song of Waking
  `2 4 3 2 5` (opens the shrine).
- **Enemies**: Thornling (hopping thorn ball; wanders, winds up, lunges), Gloomwisp (night
  only, floats through walls, one hit; a boss can summon tame ones that orbit it).
  **Pickups**: green gem (1), blue gem (5), heart. **Heart Vessel**: +1 heart container.
- Naming style: plain English compounds (Thistledown, Gloomwisp, Glimmer Lake). Avoid names
  that echo existing franchises.

## Verifying

- `npm run check`: lint + unit tests + typecheck/build. Run before calling work done.
- `npm run smoke`: starts a dev server and plays through the quest in headless Chrome
  (title → intro → walk → collisions → bridge → bounds → Maren → chest → shield guard
  and guard break → combat →
  shrine song + cutscene → card → the Lamplighter fight (intro, phase two, defeat cutscene,
  heart vessel) → night → reload and Continue), asserting game state,
  failing on console errors and saving screenshots to `smoke-output/`. Uses the installed
  Chrome (`CHROME_PATH` to override). Waits on game state, never fixed delays: headless
  rendering is slow and game time runs slower than real time there. Extend it when you add
  a quest step.
- `npm run look -- <scenes>` (`--list` for names: title, field, village, grove, shrine,
  hollow, night, guard, boss, boss-moves): captures named scenes to `look-output/` for you
  to inspect. Boss scenes slow time, make Wren invulnerable, park the camera and force
  moves. Add a scene when you add a place, a boss or a visual system. Both scripts share
  `scripts/browser.mjs` (dev server, Chrome, `newGame`, `teleport`, `finishScript`...).
  One-off investigation scripts belong in your session scratchpad, not the repo.
- CI (`.github/workflows/deploy.yml`) runs check and smoke on every push and PR; deploys
  to GitHub Pages only if both pass, and uploads smoke screenshots when smoke fails.
- `npm run dev`, then `?debug` in the URL: fps/draw calls/position overlay; backquote (`)
  toggles a collider wireframe. In dev, `window.embervale` is the `Game` (teleport with
  `embervale.player.teleport(x, y, z)`). For bosses: `embervale.activeBoss.forceMove('slam')`
  plays a move on demand, `embervale.setTimeScale(0.05)` slows everything to inspect poses,
  `embervale.rig.shot(from, at, true)` parks the camera, `embervale.player.invuln = 1e6`.
- Unit tests live next to their modules (`*.test.ts`). `content/overworld.test.ts` builds
  the real overworld in Node and runs its scripts against a fake `ScriptApi`; every
  interactable/trigger must have a script. `game/boss.test.ts` runs the Lamplighter's
  state machine headlessly (guarding, slam reach, phase two, death, reset) and a minimal
  `Dummy` boss for the move system; copy that pattern for new bosses.
- Audio, timing and feel can't be verified by an agent: ask the owner to play and listen.

## Known quirks and tech debt

- Two roads ford ponds: the grove road (11 m of road, ≤ 0.44 m deep) and the shrine road
  (14 m, ≤ 1.03 m). Walkable since there's no swimming; revisit when swimming lands.
- Bundle is ~5 MB (1.8 MB gzipped), mostly Rapier's WASM inlined as base64 by the
  `-compat` package. Fix later: `@dimforge/rapier3d` + a WASM plugin, or lazy loading.
- Variable time step. If we add dynamic bodies (pushable blocks, physics props), move to a
  fixed 60 Hz physics step with interpolation.
- Characters are ~20 small meshes each (many draw calls), and the Lamplighter ~150; merge
  rigid parts per bone if enemy counts grow. Bosses carry a PointLight; adding/removing
  lights recompiles shaders once (a small hitch at spawn and death, hidden by cutscenes).
- Sword hits, lock-on and interact ranges are distance/angle checks, not physics shapes.
- One save slot; position isn't saved.
- The title screen's control list is keyboard-only text (in-game prompts do adapt).

## Roadmap

Next, in order:
1. **First dungeon** inside the Waking Shrine as its own Area: area transitions (trigger →
   fade → `loadArea` → entrance spawn, and back), small keys + locked doors, switches,
   a puzzle using a song, and a major boss holding the second ember (built on `Boss`, like
   the Lamplighter). This also proves the Area system with a second area.
2. **Pause menu**: inventory/songs/map, settings (mouse sensitivity, invert Y, volumes).
3. **Desktop build** (Electron) with a file-based `KeyValueStore`; Steamworks later.
4. **Load/perf pass**: Rapier WASM as a file, code splitting, character mesh merging.
5. **Depth**: more enemy types, target switching, jump attack, original items/tools,
   heart pieces, swimming, ledges/climbing, NPC day/night schedules, music per area,
   camera rails for cutscenes.
Then: itch.io demo, Steam page (wishlists), playtesting with real players.

## Design decisions (don't undo without asking)

- Web + Three.js + Rapier, not Unity/Godot (see Tech stack).
- Kinematic character controller for the player, not a dynamic rigid body: predictable,
  classic-feeling movement.
- Story is `async` scripts on game time, bound to world objects by id; world code never
  contains dialog or quest logic.
- Static geometry is merged; anything that changes at runtime is `dynamic`.
- The camera passes through trees and fences (Prop) but pulls in for walls and terrain.
- Continue starts at the area spawn with at least 3 hearts (genre convention; simpler
  than saving positions).
- Gamepad A doubles as interact and jump (context action button).
- Enemies and the clock freeze during dialog and cutscenes; they do **not** freeze while
  the flute is out (no pausing fights with a song).
- **One defensive system: the shield's guard.** No dodge roll (removed on purpose) and no
  stamina. Guard recovers only with the shield lowered (no holding it up forever). A guard break stops the hit that broke it (the punishment is the 2 s without a
  shield, not damage on top). Possible future depth, not built: a perfect block (raise
  the shield just before impact) that costs no guard.
- Bosses are built on one shared move system (windup/active/recover) with the fairness
  rules above; a boss's weak point is a hurtbox that only comes within sword reach in
  specific poses, rather than a special "vulnerable" flag.
- The arena seal is a World-layer wall: once sealed, the camera and projectiles stay in.

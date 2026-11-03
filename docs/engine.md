# Engine

How the game runs: the frame loop, modes, areas, physics, input, scripts, saves, and the
conventions every system follows. Read this before touching `core/`, `game/game.ts`,
`world/area.ts` or saves.

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

## Frame loop (`Game.frame`)

`input.poll` → `director.update` (resumes waiting scripts) → mode update (player and
enemies request moves from the character controller; hazards and pickups update) →
area/HUD/music update → camera → `physics.step` → sky → render → `input.endFrame`. Time
step is the frame time capped at 50 ms (game time slows down rather than jumping when
frames are slow), times the **time scale** (slow motion in cutscenes) and zero during
**hit-stop** (a few frozen frames when a hit lands; it's what makes combat feel weighty).

`Game` is the hub and holds wiring only. Two parts live in their own modules: `Combat`
(`game/combat.ts`: lock-on and its marker, the glove throw, the player/enemy/hazard
environments, hit feedback both ways, hit-stop) and `TitleMenu` (`game/title.ts`: the
orbit and the menu; `Game` acts on its choice). Scripts reach them as `g.combat.*`.

## Menus (`game/menu.ts`, `game/devMenu.ts`, `game/pauseMenu.ts`)

`MenuStack` is the reusable menu: rows are an action, a toggle (flips, stays open) or a
submenu; a menu may carry `body` text under its title (a note to read; a page with no rows is
fine). Up/down wraps, confirm chooses, back pops (from the first menu it closes). It is
pure logic: the owner of the menu feeds it input (keyboard, d-pad/stick, mouse hover and
click via `Hud.onMenuHover/onMenuClick`) and `Hud.setMenu(view)` draws it. The main menu
should be built on it too. `MenuDriver` (`game/menuDriver.ts`) feeds one from input
(up/down with a tick, confirm, cancel) and draws it; the game routes the HUD's mouse hover and
click to whichever menu is open. `ChoiceMenu` is `ScriptApi.choose(title, options)`: a titled
panel of options resolving with the index or null (backed out), shown during a cutscene instead
of the dialog box (the bells' travel menu). `DevMenu` is the first user (~ / L3): Dev sprint,
Invincible (`GameState.invincible`, never saved) and Save states (`content/devStates.ts`:
New game, night outside the Hollow, shrine start, shrine at the boss door; loading one
replaces the current save, via `Game.loadDevState`). While a menu is open `Game.frame` runs
no mode update and `dt` is 0; the frame a menu closes also counts as paused, so the press
that chose a row (Enter = also "interact") doesn't leak into the game. Dev builds, the
Pages build and `?debug` only. To add a state, add an entry to `DEV_STATES` (the unit test
checks it decodes and uses known ids); `completedDungeon(def)` builds "all done" progress
from a dungeon's data.

**The pause menu** (`PauseMenu`, P / Start, play mode only; the shipped game has it): pauses
like the dev menu (the two never open over each other). For now its one page is the keepers'
notes found (`content/hints.ts` `foundHints`, registry order; choose one to read it), or a line
saying to look for them. P / Start close it from any depth. Gear and settings pages go in as
rows of its root later (roadmap item 2).

## Modes

`title` (menu over a camera orbit) · `play` · `cutscene` (a script runs: dialog, item get,
camera shot; no player control; the clock and fighting enemies freeze, but deaths and boss
entrances keep animating via `Enemy.animatesInCutscene`).

## Areas

An `Area` (overworld, later dungeons and interiors) owns its meshes and colliders, its
spawn point, its `interactables` (press interact: talk/open/read/check) and `triggers`
(walk-in zones), all with string ids like `npc.maren`, `chest.grove`,
`trigger.shrineEntrance`. `content/<area>.ts` maps those ids to scripts. Build areas with
`AreaBuilder`: `b.mesh(...)` adds **static** geometry that `finish()` merges into a few
draw calls per material per 80 m cell; `b.dynamic(obj)` keeps things that move or change
(NPCs, doors, glowing windows, instanced trees). Colliders made through the builder are
tracked so `dispose()` removes everything. After building, `physics.refreshQueries()`:
Rapier answers ray queries only about colliders that existed at the last step.
Anything built at runtime frees its own GPU memory when removed: `Enemy.dispose()` runs
`disposeTree` on its root (every geometry and unshared material), because a dungeon death
rebuilds every enemy (`enemyDispose.test.ts` guards it). Three.js never frees a geometry
just because its mesh left the scene.
Adding an area = an `Area` class + a content file + a case (and id) in `content/areas.ts`.

**Regions** (`world/overworld/region.ts`): the overworld is one continuous area, but parts of it beyond the
valley are *regions* that exist only while Wren is near (owner's call, 2026-11-03). A `RegionDef` has an `id`,
a terrain `rect` and `build(physics)`, which returns its `root`, its `interactables`/`triggers` (they join the
overworld's lists while it is loaded), an `update` and a `dispose`. `RegionStreamer` builds one when Wren is
within 70 m of its rect and drops it past 110 m (a `RegionDef` may override both: fog is full at 290 m, so a region
that can be seen from afar, like the Northpass, loads at 260 m and drops at 300 m, where it never visibly pops). `Area.streamAt(x, z)` is called every frame in `updateWorld`
and in `placeAtSpawn` *before* Wren is placed, so a teleport (a bell, a save) finds ground. A region builds in
one frame (a small hitch; spread it over frames if regions get big). Regions use the same `terrainHeight`
and the same 2 m grid as the valley (`buildTerrain(b, rect)`), so seams match; each has its own seed in
`REGION_SEEDS` (`layout.ts`). The only region so far is the Northpass (`northpass.ts`). Objects whose state must survive streaming (the camp's bell post, the canyon's crossing, the Waybell) are built in the overworld proper instead; enemies that need the region's ground (the Cragstalker) are spawned by content while `loadedRegions` has it. Scenery of the valley
stays out of a region's carved land with an `inX` check (as `inGorge`, `inPass`), applied after the seeded
placement so it never reshuffles.

**Moving between areas**: `api.travel(id, entrance?)` fades out, `loadArea`s the other area
with Wren at a named entrance (`Area.entrances`, e.g. the overworld's `shrineDoor`) or its
spawn, shows its name and fades in. `loadArea` during play calls the new content's
`restore(state)` then `start(api)`, so an area always comes up as the save says. Content
also has `update(api, dt)` (every frame of play: cleared rooms) and `onRespawn(api)` (after a
death). Where floors stack (dungeons), interactables and triggers carry the `y` of their
floor and only count on that level (`sameLevel`). `Area.strike` lets the sword hit things
that aren't enemies (crystal switches).
Dungeons are described as data first (see [dungeons.md](dungeons.md)).

**Interiors** (`world/interior.ts`): `MillInterior` is Tobin's mill (id `mill`), a one-room
indoor `Area` with no ceiling mesh (walls stop the camera), one warm flickering light, a
`bed` interactable and an `exit` trigger, bound by `content/mill.ts`. The overworld's
`mill` entrance is the square outside its door. A future house/shop is another class like it.

**Choices and sleeping**: `api.ask(pages, options)` is `say` whose last page ends in a
choice list (menu up/down, confirm); it resolves with the index. `content/shop.ts`
`offerWares(api, pages, wares)` wraps it as a list of priced wares plus Not now and takes
the gems (or reports `short`): every shop uses it. The clock stands still indoors *except during a warp* (`warpTime`), which is how the
bed jumps to the next 06:00 / 18:00 (`wakeHour` in `content/mill.ts`).

**Indoor areas** (`Area.indoor`, the dungeons): the sky, sun disc and stars are hidden and
the sun casts no shadows (every ceiling would shade everything); a cool hemisphere fill, a
dim overhead light and close dark fog take over (`Sky.setIndoor`), and each room's own
point light and sconces do the rest. The clock stands still indoors (genre convention), no
night wisps or respawning thornlings appear, and the camera sits closer (7 m instead of 9).
Anything that finds the ground with a ray from high up (`groundY` from 400 m) lands on the
roof indoors: pass a starting height just above the floor you mean (`Thornling` takes one,
and so does the smoke/look `teleport` helper).

## Physics (`core/physics.ts`)

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
Jump is forgiving: coyote time and a jump buffer (0.12 s each). Moving platforms are
`kinematicBox` bodies; a grounded Wren is carried by the mover's per-frame delta (`carryDelta`),
so the frame order is platform `moveTo` → player → `physics.step` (`Game.frame` calls
`Area.movePlatforms` first). See [bells.md](bells.md).

**Characters never overlap or push each other** (owner's rule, 2026-11-03): the controller sees only
the world; `Character.move` then cuts a move short at another character's edge (circles in plan,
same level, only for layers that collide: bosses ignore other enemies) and slides round it. Only
the mover is displaced, never whoever it ran into; `blockedBy` says who stopped it. Knockback
(`knock`, `pushPlayer`) is still a push, by design. Owners must pass their own `pos` vector to
`createCharacter` and keep it current.

**The follow camera's collision** is one rule, indoors and out (the Souls/Zelda approach,
chosen by the owner 2026-11-02 after a see-through-wall experiment fought with it): a
0.35 m ball is swept from Wren's chest toward where the camera wants to be
(`Physics.sphereDistance`, World layer only, so trees and fences don't count). On a hit the
camera comes in to that point at once, then eases back out slowly (so walking along a wall
doesn't pump it). Closer than 1.7 m Wren fades out, and closer than 1.1 m she's hidden (`rig.playerOpacity` →
`Player.setOpacity`, dithered `alphaHash`, her own material copies) so she never blocks the
view. Small rooms just get a close camera; a room that needs better gets a fixed angle later.

Camera shots keep out of walls with a ray from the look-at point to the camera. **Never aim a shot at a point inside a collider** (e.g. a door's center): the
ray starts inside stone and the camera ends up pressed against it. Aim just in front of
the surface (see `doorFace` in `content/overworld.ts`).

## Input (`core/input.ts`)

Code reads **actions**, never keys. Bindings:

| Action | Keyboard / mouse | Gamepad (standard mapping) |
|---|---|---|
| move / camera | WASD / mouse (click to capture) or arrows | left stick / right stick |
| attack · shield | Click or J · Shift or right-click | X, RB or RT · LT or LB (both hands work out of the box; owner may pick later) |
| jump | Space | A |
| lock on | Q or Tab | R3 (right stick click) |
| interact | E (or Enter) | A |
| confirm · cancel | Enter/Space/E/click · Esc/Backspace | A/Start · B |
| pause menu (`pause`) | P | Start |
| music on/off | M | Back |
| drink flask 1 · flask 2 (`flask1`, `flask2`) | 1 · 2 | d-pad ← · → |
| dev menu (dev builds / `?debug` only) | ~ (Backquote) | L3 (left stick click) |

Gamepad A both talks and jumps: the game checks `interact` first (the classic context
action button). The HUD shows glyphs for the last-used device. In dialog text, `[attack]`
renders the right button and `*word*` highlights.

**Interact prompt**: the nearest enabled interactable in reach gets a floating prompt over
it (button glyph + its `label`, e.g. "E Talk"), positioned every frame by projecting the
interactable's `promptY` (a world height set by the area; default just above Wren's head)
to the screen. The corner hints only list sword and lock-on. A label can be a getter when
it changes (the shrine door says "Check" while asleep, "Open" once awake).

## Scripts and cutscenes (`game/script.ts`, `core/director.ts`, `content/`)

Story beats are `async` functions taking a `ScriptApi`: `say`, `wait`, `until`, `tween`,
`fade`, `card`, `shot(from, at, cut?)`/`releaseCamera(snap?)` (camera moves and cuts; shots never
end up inside geometry, as long as the look-at point isn't inside a collider). **Don't glide a shot
across the map or through scenery**: cut under a `fade`, and give the camera back with `releaseCamera(true)`
(snaps behind the player) when the last shot is far from them (the Lamplighter's cutscene does both),
`setTimeScale` (slow motion), `showBossTitle`, `addEnemy`, `run` (queue another script),
`warpTime`, `giveSword`, `respawn`, plus `state`, `sfx`, `player`, `particles`, `area`,
`physics`. `Game.run(script)` switches to cutscene mode, and when the script ends it
releases the camera, returns to play and **saves**. Never use `setTimeout` for game
logic: waits must follow game time.

## State and saves (`game/state.ts`, `core/save.ts`)

`GameState` holds quest `FLAGS`, the field's small `keys`, the current `area`, carried
`items` (`ITEMS`), the keepers' `bells` (carried and hung sets, [bells.md](bells.md)), per-dungeon progress (`dungeon(id)`: its colored keys held (a set of `KeyColor`), boss key, and sets of opened doors, opened chests, pressed switches and cleared rooms, all
keyed by the dungeon's data ids, plus `done`), hearts, gems and the clock. It's
mutated in place (systems keep references). `keysHere` is the field's plain key count (0 inside a dungeon) and `dungeonKeysHere` the colored
keys held in the current dungeon; the HUD shows both. Add flags to `FLAGS`; **never rename a shipped flag**
(old saves would silently lose it). New flags use a namespaced name, `<area>.<thing>`
(e.g. `shrine.bigKey`); the original seven overworld flags keep their plain names forever. Village flags so far:
`village.millKey` (Tobin's gift), `village.stonewardTunic` (bought from Odo),
`village.marenBell` / `village.tobinBell` (their one line about the Morrowbell, said).
Saves are versioned JSON (`embervale:save:0`), validated and repaired on load; bump
`SAVE_VERSION` only with a migration in `decodeSave`. `SAVE_VERSION` is 6 (v6: `bells: { carried, hung }`, older saves load with none. v5: `flasks`, a list with one potion id or null per flask owned, replaces `drinks`; v3/v4 drinks load as a flask per kind found, full if any was left. v4: a dungeon's `keys` is a list of colors, not a count; a v3 count loads
as none and the shrine's `restore` re-derives held keys from opened key chests whose door is still shut): v1 saves (which
held flute songs) load with the songs dropped and 0 keys; v1/v2 load in the overworld with
no items or dungeon progress. Saved: flags, keys, area, items, dungeons, flasks, bells, gems, hearts, clock. Not saved: position (continue starts at the saved area's spawn, e.g. a dungeon's
entrance, with at least 3 hearts), enemies, cut bushes, where stones were pushed. Autosave: after every script, every 30 s of play, and on page
hide. Settings (`embervale:settings`): music. Storage goes through `KeyValueStore` so the
desktop build can write real files.

## Conventions

- +x is east, −z is north. Models face +z; `yaw = atan2(dx, dz)`.
- A full day is about 5 minutes (`HOURS_PER_SECOND = 1/12`); night is 18:00–6:00.
- Materials from `mat(color)` are shared: **never mutate them**; use `uniqueMat` for
  anything that flashes or glows.
- Overworld scenery is placed with a seeded RNG (`regionRng('valley')`, 1337) in a fixed build
  order; reordering build calls reshuffles every tree. **Adding a landmark must not move
  existing scenery**: placement checks use `placementHeight` (the terrain before later
  carve-outs), every candidate draws the same random numbers whether or not it's placed,
  spots inside the new landmark are filtered out afterwards, and the landmark's own
  scenery uses its own RNG (`regionRng(name)` in `layout.ts`; see `hollow.ts`, `gorge.ts`).
- Terrain is a formula (`terrainHeight`), so the mesh, collider and placement agree.
- Floors stack in dungeons: **anything that measures distance (aggro, attacks, lock-on,
  interact range, triggers) must also check height**, and anything about seeing must check
  walls. Horizontal-only distance checks were fine in the field and broke indoors.
- Small pure functions with doc comments explaining *why*; rules in systems, wiring in
  `Game`, story in `content/`.

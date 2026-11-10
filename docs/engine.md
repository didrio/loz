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

**The HUD's dial and compass** (2026-11-04). The clock's dial (`ui/skyDial.ts`) is a window onto the sky: ground
across the bottom 30%, sky above; the sun rises out of the ground on the left at 6:00, stands near the top at noon
and has sunk out of sight by 18:00, and the moon does the same overnight, so the dial agrees with `isNight`
(18:00–6:00). `dialView(hours)` is the pure, tested part. The compass (`ui/compass.ts`) is a strip at the top centre
fed the render camera's look direction every frame (`Hud.setHeading`), so it is right in cutscene shots too;
`bearing(dx, dz)` maps +x east, −z north, the same in the field and in dungeons.

## Menus (`game/menu.ts`, `game/pauseMenu.ts`)

`MenuStack` is the reusable menu: rows are an action, a toggle (flips, stays open) or a
submenu; a menu may carry `body` text under its title (a note to read; a page with no rows is
fine). Up/down wraps, confirm chooses, back pops (from the first menu it closes). It is
pure logic: the owner of the menu feeds it input (keyboard, d-pad/stick, mouse hover and
click via `Hud.onMenuHover/onMenuClick`) and `Hud.setMenu(view)` draws it. The main menu
should be built on it too. `MenuDriver` (`game/menuDriver.ts`) feeds one from input
(up/down with a tick, confirm, cancel) and draws it; the game routes the HUD's mouse hover and
click to whichever menu is open. Hover follows real mouse movement only, and the menu scrolls to the selection only when the selection moves (never on a hover or an unrelated redraw), so trackpad momentum and touch panning (`touch-action: pan-y` on `.gmenu-list`/`.gmenu-detail`) work. `ChoiceMenu` is `ScriptApi.choose(title, options)`: a titled
panel of options resolving with the index or null (backed out), shown during a cutscene instead
of the dialog box (the bells' travel menu). `choose(title, options, exit?)` and `ask(pages, options, exit?)` share one look: a small centered
window, rows stacked, ▸ and a bar on the selected one, mouse hover/click; `exit` is the index of the back-out row (Not now, Stay), drawn red,
and Cancel picks it (`ask` has no cancel without one). Always pass it for a back-out option. The **dev panel** holds Dev sprint,
**Texture resolution** (a 1–32 slider in whole texels per metre, live on every textured surface and remembered in `localStorage` under `embervale:dev:textureResolution`; the remembered value beats the default, so clear it to see the default again), Invincible (`GameState.invincible`, never saved), trial falls, and Save states (`content/devStates.ts`, in play order: a new game, the gorge, the
Morrowbell, the night before the Lamplighter, the shrine's stages, the opened gate; loading one
replaces the current save, via `Game.loadDevState`). Every state is run through `withNotes`: it gets all the keepers' notes once Wren has
the sword, the hollow's message after the Lamplighter, and each shrine message whose room is cleared, so Hints and Messages match. While the menu is open `Game.frame` runs
no mode update and `dt` is 0; the frame a menu closes also counts as paused, so the press
that chose a row (Enter = also "interact") doesn't leak into the game. The states sit under a "Save states" heading (`MenuRow.group`). To add a state, add an entry to `STATES` in the right place (the unit test
checks it decodes, uses known ids and that the order is progress); `completedDungeon(def)` builds "all done" progress
from a dungeon's data.

**The pause menu** (`PauseMenu`, P / Start, play mode only; the shipped game has it): the one menu for everything, ordered by
**tabs** (`Menu.tabs`; Q/E or LB/RB switch, or click). It pauses the game and
reopens on the tab it was last on. **Settings** is always first and never moves; **Gear** is second, read-only (T39: `game/gearRows.ts` lists what Wren carries as `entry` rows: sword, shield, tunic, glove, flasks, bells, the current dungeon's keys, Pip's doll while Wren has it; words in `content/text/gear.ts`; each row's `icon` is a picture rendered from its `gear-*` model by `render/icons.ts`, `Game.icons`, drawn on boot and cached; no map); **Hints** appears once Wren has found a keepers' note
(`content/hints.ts` `foundHints`), **Messages** once she has read a sigil (`content/sigils.ts` `foundSigils`). The dev tools are not a tab (see "The dev panel"; `Game.devTab` is on for everyone for now, the Steam build sets `VITE_DISABLE_DEV_TAB=1`). A "P Menu" reminder sits under the clock. Add a tab by adding an id
to `tabs()` and a rows builder in `pauseMenu.ts`. Gear/Hints/Messages are `entry` rows (an entry may carry an `icon`): the list on the left, the selected one's text in a pane on the right. P / Start close it
(so do Esc / B / Backspace); P rather than Esc is the pause key because Esc releases the mouse in the browser.
**The dev panel** (T63, `game/devPanel.ts`; backtick, left-stick click on a pad, or the **Dev** button beside ☰ on touch (`.dev-btn`, `Hud.showDevButton`, only where `Game.devTab`; on touch the panel fills the height, has a ✕, and hides the touch buttons by CSS while open); `Game.devTab`): not a tab, a separate plain panel down the right edge (300 px, see-through, no theme) that holds every dev control: sprint, invincible, trial falls, texture resolution, baked light and its sliders, the Look experiment, **Copy values** (only what is changed from the defaults, with the area and the hour, as text on the clipboard, to paste to an agent; `changedSummary`) and the save states. The game stands still behind it (`Game.frame`: `devPanel.update()` before `pauseMenu.update()`), a mouse or finger drag on the world turns the camera (`Input.drag`, from the HUD's `onMenuLook`; the right stick too, not the arrow keys, which move the cursor) with `rig.update` on real time and no lock-on pull, and closing leaves the camera where it is. It has its own HUD element and handlers (`Hud.setDevMenu`, `devHandlers`); rows and controls are the pause menu's. **Hold to hide** (`hideMenu`: Tab / pad Y; a "Hold to hide" button on touch in the pause menu) makes either menu invisible while held (`MenuDriver.setPeek`), and the pause menu's camera may then turn too.
**Defaults and reset** (owner's call, T63): a row with `def` (a toggle's state, a slider's number, a choice's index) gets a **reset button** (↺, dim while the row is at its default; the `R` key / pad X resets the selected row: `menuReset`, `MenuStack.reset`). The Settings tab's defaults are `Game.defaultSettings` (touch: Auto, no shadows); the dev panel's are the code's own (`BAKE_DEFAULTS`, `DEFAULT_TEXTURE_RESOLUTION`, `LOOK`'s values at load) and change only in code. **The dev panel's settings are never saved, and only a page load resets them** (owner's call, 2026-11-09): tweaks survive closing the panel, a new game, Continue and the save states. (The player's own Settings, volumes, display and shadows, are saved as before.)
**Default** (`MenuRow.pinned`: a switch drawn under the dev list, reached by up/down as the last row): while on, every visual setting (texture resolution, baked light and its sliders, the look experiment: `DevPanel` `tuning`) is the code's default, shown and used, and those rows are **locked** (`MenuRow.locked`: dimmed, every change ignored) whatever else happens, until it is switched off (the tweaks it set aside come back) or the page reloads. Right after a load it changes nothing. **Copy values** with Default on reports the hidden tweaks, since those are what the owner hands over.
**The performance meter** (`game/perf.ts`; owner's call, on by default for now): a small see-through box at the bottom right (left of the action buttons; bottom centre on touch), three lines: fps · frame ms · worst frame in the last second; game-code ms · draw calls · triangles; pixel ratio · canvas size · Display mode (· modern) (· sh and the shadow map's side while it draws). `PerfMeter` is fed each frame's timestamp and the game's own CPU time (`Game.frame`; a frame far longer than the CPU time is waiting on the GPU or the screen, and fps is capped by the display's refresh), the HUD redraws it four times a second, and `renderer.info` gives calls and triangles (the pipelines count their own passes). Dev panel: **Performance meter** toggle (only exists while `Game.devTab`; the Steam build hides the meter) and **Copy performance** (`Game.performanceReport`: scene, time of day, Wren's position, the frame numbers, draw/geometry/texture/program counts, canvas and window size, Display, shadows, baked light, modern lighting, the GPU's name, and the dev settings changed from the defaults), to paste to an agent. The look and smoke harness sets `window.__embervaleNoPerf`, so baselines never show it.
**The hitch log** (T70, `HitchLog` in `game/perf.ts`, tested): stutter is a few long frames, not a low average, so the meter's fps can look
fine while play doesn't. Every frame over 2.5× the usual (the median of the last 120, at least +12 ms) is kept with the game code's time in
it and the causes noted during it (`Game.note`: `resolution` (a resize: Auto's steps, a rotation), `shader` (a new program), `upload` (new
textures or geometry), `bake` (baked light landing), `area`, `save`, `menu`); none noted means the browser's own work, usually garbage
collection, or the GPU. The meter's first line adds "N hitches/min"; **Copy performance** ends with the counts by cause and the last 30.

**What a phone frame costs (T58, measured at 844×390 CSS, 3× screen, a 2× canvas, M3 Pro's GPU; a phone's is several times slower):** the
village / field / grove draw in 2.3-3 ms with the grade folded (render.md "The grade"); the old grade pass added 1.1-1.6 ms, Shadows add
0.4-1.3 ms and double the triangles (~+230k), 2× → 1× saves 0.4-1 ms, baked light ~0.1-0.4 ms. Game code was 4.3 ms a frame (11.4 ms
with the CPU slowed 4× like a mid phone) and is 3.3 ms (6.5 ms): enemies far from Wren think every 4th frame (`FAR_ENEMY` 60 m, past
every notice range; bosses never), the hearts compare numbers instead of reading `innerHTML` back, and `toScreen` uses the size from
`resizeIfChanged` (reading the window's size after the HUD's writes made the browser lay out the page mid-frame). Builds skip three's
shader-error check (`checkShaderErrors`, dev only: it waits on each compile). **Habits:** a per-frame HUD setter compares its inputs and
writes the DOM only on change; never read layout (`innerWidth`, rects) in the frame after DOM writes; a per-frame update for something
far away can run at a lower rate.
**Controls** (`Hud.menuRow`, css `.sw`, `.seg`; no arrow marker on the selected row, only the highlight, so text never shifts): a **toggle** is a switch with no text; a **choice** draws every option in a capsule with a pill under the chosen one that slides (`Hud.slideControls`; click an option to pick it, left/right still step, choosing cycles). Every choice is drawn this way (the Display setting, the dev tone mapping), never as a dropdown.
Row kinds in `menu.ts`: action, toggle, submenu, **slider** (left/right or click/drag the track; holding repeats), **choice** (left/right or
choose to cycle), **entry**. `MenuDriver.onTab` is how a tabbed menu hears Q/E (they win over confirm, which E also is).
**Settings** (`Settings` in `core/save.ts`, saved at once under `embervale:settings`, applied by `Game.changeSettings`/`applySettings`):
master/music/effects volume (0..1; 0.8 is the original loudness; `Sfx.setVolumes`), mouse and stick sensitivity (0.2..2×, one number
scaling both axes: `Input.mouseSensitivity/stickSensitivity`), invert camera up/down (`Input.invertY`), **Display** (Auto / Native / Performance / N64, default Native on desktop and Auto on touch devices; render.md "Display modes"), **Shadows** (On / Off, default On on desktop; see "Sun shadows"), **Vibration** (`haptics`, default on; only shown where the browser can vibrate: Android; `core/haptics.ts`) and Fullscreen
(browser Fullscreen API, hidden if unsupported, not saved; a gamepad button may be refused by the browser, which toasts). There is no music hotkey:
the music slider at 0 is mute. Old `music: false` saves load as music volume 0.

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
within 70 m of its rect and drops it past 110 m (a `RegionDef` may override both: fog is full at 215 m, so a region
that can be seen from afar, like the Northpass, loads at 260 m and drops at 300 m, where it never visibly pops). `Area.streamAt(x, z)` is called every frame in `updateWorld`,
and in `placeAtSpawn` and `loadDevState` *before* Wren is placed, so a teleport (a bell, a save, a dev state) finds ground.
A small region builds in one frame. A big one's `build` is a generator that `yield`s between steps (a 20 m strip of
terrain, a kind of scenery, each with its own `AreaBuilder`): the streamer starts it at `loadDist`, runs one step per
`update`, and attaches it when done; within `FINISH_DIST` (30 m) `streamAt` finishes it at once, so the teleport rule
holds. `buildStats` keeps each build's steps and slowest step (the look scene logs them). Regions use the same `terrainHeight`
and the same 2 m grid as the valley (`buildTerrain(b, rect)`), so seams match; each has its own seed in
`REGION_SEEDS` (`layout.ts`). The regions are the Northpass (`northpass.ts`: the corridor and the camp's mountains, built in one go) and
Sallowmere (`sallowmere.ts`, its map in `mere.ts`, which `terrainHeight` folds in with `carveMere`; stepped,
see [sallowmere.md](sallowmere.md) "The map"). `buildTerrain(b, rect, paint)` takes a region's own palette. Objects whose state must survive streaming (the camp's bell post, the canyon's crossing, the Waybell) are built in the overworld proper instead; enemies that need the region's ground (the Cragstalker) are spawned by content while `loadedRegions` has it. Scenery of the valley
stays out of a region's carved land with an `inX` check (as `inGorge`, `inPass`), applied after the seeded
placement so it never reshuffles.

**Overworld files** (`world/overworld/`): `index.ts` (the `Overworld` area), `layout.ts` (the valley's map as pure functions:
`terrainHeight`, places, roads, the pass, `areaNameAt`), `terrain.ts` (ground chunks with a palette, the valley's water and
bounds), `village.ts`, `landmarks.ts` (bridge, grove, shrine, signs), `nature.ts` (trees, rocks, grass, bushes), `hollow.ts`,
`gorge.ts`, `camp.ts` (Wayfarers' Camp, the crossing, the Waybell), `ruins.ts` (ruined homes, the shield's cottage),
`blight.ts` (thorn clumps and thickets, `thornTouch`), `gate.ts`, `region.ts` (`RegionStreamer`), and the regions:
`northpass.ts`; `mere.ts` + `sallowmere.ts` (Sallowmere's map and build) + `stiltwick.ts` (its town and the sites content binds to).

**Moving between areas**: `api.travel(id, entrance?)` fades out, `loadArea`s the other area
with Wren at a named entrance (`Area.entrances`, e.g. the overworld's `shrineDoor`) or its
spawn, shows its name and fades in. `loadArea` during play calls the new content's
`restore(state)` then `start(api)`, so an area always comes up as the save says. Content
also has `update(api, dt)` (every frame of play: cleared rooms) and `onRespawn(api)` (after a
death). Where floors stack (dungeons), interactables and triggers carry the `y` of their
floor and only count on that level (`sameLevel`). `Area.strike` lets the sword hit things
that aren't enemies (crystal switches).
Dungeons are described as data first (see [dungeons.md](dungeons.md)).

**Rooms in the world, not separate areas** (owner's call, 2026-11-04): Tobin's room is the windmill's
ground floor (`world/overworld/village.ts`, sizes in `MILL_TOWER`), walked into straight off the square with
no loading: a round room with a low ceiling (the tower above it is one solid collider, so the camera stops
at the ceiling as it does in dungeons), its own short-reach warm light, and a `bed.mill` interactable. Its door
is a `HingedDoor` (`world/objects.ts`): it swings inward, its collider is on only while it's shut, and the
content decides when it may open (`door.mill`: locked until Tobin's key). Being in the room is being
outdoors (the clock runs, the village song plays). Future homes (the cottages' `door.home0/1`, locked for
now) follow this pattern. A save from the old separate mill area continues in the overworld.

**Choices and sleeping**: `api.ask(pages, options)` is `say` whose last page ends in a
choice window (`.choice-window`, over the dialog box; menu up/down, confirm, click); it resolves with the index. `content/shop.ts`
`offerWares(api, pages, wares)` wraps it as a list of priced wares plus Not now and takes
the gems (or reports `short`): every shop uses it. The clock stands still indoors *except during a warp* (`warpTime`), which is how the
bed jumps to the next 06:00 / 18:00 (`wakeHour` in `content/village.ts`).

**Indoor areas** (`Area.indoor`, the dungeons): the sky, sun disc and stars are hidden and
there are no shadow maps anywhere (blob shadows only, docs/art.md); a cool hemisphere fill, a
dim overhead light and one dark fog (`DUNGEON_FOG`, the shrine atmosphere's, in dungeons) take over (`Sky.setIndoor`; the fill and
fog are `SHRINE` in `render/atmosphere.ts`, see art.md "Atmosphere"), and each room's own
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
**Water** (`game/water.ts`, pure): from the depth of the water at Wren's feet, a spot is dry, shallow (feet 0.35 m under: she wades,
5 m/s, jumps lower, no surfing) or deep (1.2 m under, about chest height: a fall). No swimming. A fall is `TrialFalls` underneath
(`WaterFalls`: half a heart, back to the last dry ground she stood on; `content/overworld.ts` runs it every frame). The level
comes from `Area.waterLevelAt(x, z)` if the area has it, else `waterLevel`: the overworld answers the valley's `WATER_Y`, or a
`RegionDef.waterLevel` inside that region's rectangle (a region without one has no water), so a region can sit at its own height.
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
(`Physics.sphereDistance`, the World layer plus `Layer.CameraOnly`, so trees and fences don't count). `CameraOnly`
is an invisible pane only the camera hits: one across the mill room's doorway keeps the camera in the room while
Wren is inside, instead of backing out through the open door. On a hit the
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
| menu: reset a setting (`menuReset`) · hold to hide it (`hideMenu`) · the dev panel (`devMenu`) | R · Tab · ` (backtick) | X · Y · L3 (left-stick click) |
| menu: change a setting · switch tab (`menuLeft/Right`, `tabPrev/Next`) | A/D or ←/→ · Q/E | d-pad ←/→ or left stick · LB/RB |
| drink flask 1 · flask 2 (`flask1`, `flask2`) | 1 · 2 | d-pad ← · → |

Gamepad A both talks and jumps: the game checks `interact` first (the classic context
action button). The HUD shows glyphs for the last-used device. In dialog text, `[attack]`
renders the right button and `*word*` highlights.

### Touch controls (`core/touch.ts`, `ui/touch.ts`)

Phones and tablets, **landscape only** (portrait shows a "Turn your device sideways" card and the game waits).
They appear only when the device's main pointer is a finger (`matchMedia('(pointer: coarse) and (hover: none)')`),
so desktops and touchscreen laptops never see them; `?touch=1` / `?touch=0` force them on or off. The overlay
shows while the device is `touch`: a key press or a gamepad hides it, the next touch brings it back.

- **Left 45% of the screen: a floating stick** where the thumb lands (its centre follows a thumb that slides past
  the rim). **Elsewhere: drag to turn the camera** (`TOUCH_LOOK` rad/px × the stick sensitivity).
- **Buttons, bottom right** (CSS `.tb-*`; a thumb's arc around Sword, the biggest, which is never context-sensitive):
  Shield left of it (hold; jump, then hold it to surf, as on a pad: a plain button, owner's call 2026-11-04, no
  gestures); Lock directly above it (a toggle; with nothing near it recentres the camera); **Interact** up-left of
  Sword between Shield and Lock, its own button that scales/fades in only when something is usable, always in the same
  spot, reading the verb ("Talk", "Open"); **Jump** on the outer ring up-left of the cluster, only ever jump (a sign
  beside you never turns a jump into a read); Glove (once owned) on the outer ring's upper part. Sword and Shield
  only show once Wren has them. On a touch device the **menu button** (☰, `.menu-btn`) sits top-left, left of the
  hearts; the "Menu" hint under the clock is hidden there.
- **Hit areas are geometry, not elements** (T58): when a finger lands, `hitButton` (`core/touch.ts`, tested) takes each shown button's
  circle from its rect, plus 12 px slop (Interact 18), and where zones overlap the **nearer rim wins**. A fading button, a stacking order
  or the browser's touch adjustment can't steal a tap. All ≥ ~44 pt.
- **Interact forgives a thumb** (T58; the owner saw taps miss): `InteractAim` (`game/lockon.ts`, tested) lets a tap up to 0.45 s after the
  thing left reach still use it (within its reach + 1.2 m), and holds a tap 0.25 s for something coming into reach. The button **lingers**
  for the same grace (`touchContext` asks `lingering`), so what shows is what counts. The **floating prompt** is a second Interact button
  on touch (`.prompt` takes a `pointerdown`). Keyboard and pad are unchanged: only what's in reach that frame.
- **The page never acts like a page** (T58): the overlay cancels `touchstart`/`touchmove` (iOS Safari's edge swipe back, the loupe,
  double-tap zoom), and on a touch device the document blocks `gesture*` (iOS pinch), `dblclick`, `contextmenu` and `selectstart`
  (`blockPageGestures`). Menus hover with a real mouse only (`pointermove`, `pointerType === 'mouse'`): iPhone Safari drops the click of a tap whose
  pretend mouse move changed the page, and the hover redraws the menu (T70). A faded HUD element must not take taps: the title's rows stop at `.title.gone` (they once caught taps and camera
  drags mid-screen, the browser snapping a tap to the nearest tappable thing).
- **Touch-only assists** (`input.device === 'touch'`; keyboard and gamepad are unchanged: the pad's A stays interact + jump):
  with several interactables in reach, `nearestInteractable(list, pos, facing)` picks the one most in front (dead
  ahead is worth 1.5 m); when the locked target dies lock-on moves to the next enemy (`Combat.updateLock(.., touch)`,
  `nextLockTarget`); an unlocked swing turns toward the nearest enemy within 5 m and ~40° in front (`autoAimYaw`,
  `Combat.aimSwing`). The rules are in `game/lockon.ts`.
- **While Wren surfs**, a finger holding Shield also turns the camera when it slides (`TouchPad.buttonLooks`, set
  by the game each frame from `player.surfing`), so one thumb holds the surf and steers. Interact labels longer than
  6 characters get smaller type (`.tb-interact.long`). HUD hearts are inline SVG, not the ♥ glyph (phones draw that as
  a fixed-colour emoji).
- **HUD taps:** title rows, the ☰ menu button (`pause`), the Dev button (`devMenu`, builds with the dev panel), the flask and glove icons, a ✕ on every menu (closes the pause
  menu, or `cancel`), dialog choices. In dialog, a tap anywhere reads on (`confirm`).
- A finger keeps its job (stick, look, a button) until it lifts, wherever it slides. `core/touch.ts` is pure
  (unit-tested); `ui/touch.ts` draws and hit-tests and gets a `TouchContext` from the game each frame.
- Browsers follow a tap with a pretend mouse click: `Input` ignores mouse presses within 1 s of a touch.
- iOS: no fullscreen API on iPhone; "Add to Home Screen" plays fullscreen (meta tags in `index.html`). Audio
  starts on the first lifted finger (`sfx.init()` inside the touch event, which iOS requires).
- **Like a store game** (T58, `Game.onGesture`, run by every lifted finger): the first tap goes **fullscreen and locks landscape** where the
  browser allows (Android; owner's call; once per page load, never under `?touch=`), and asks for a **screen wake lock** (`keepAwake`, also
  at play start and on return). **Sent to the background** (`visibilitychange`): save, `Sfx.setHidden` suspends the audio (Android keeps a
  page's audio playing behind other apps), and the game **comes back paused** (`PauseMenu.openSoon`); iOS's "interrupted" audio resumes on
  the next tap. **Haptics** (`core/haptics.ts`, Settings → Vibration; owner's call): a tick on a hit taken (40 ms), a block (12; heavy 24),
  a pattern on a guard break; Android only (iPhone browsers have no vibrate). **60 fps on fast screens:** `FrameCap` (`game/perf.ts`) draws
  every other frame on a touch device whose screen runs over 100 Hz (heat and battery, as mobile games do); desktops are uncapped.
- `index.html`: `theme-color` black, no auto-linked phone numbers; CSS `text-size-adjust: 100%` (iOS enlarges text in landscape).

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
`SAVE_VERSION` only with a migration in `decodeSave`. `SAVE_VERSION` is 7 (v7: Wren starts without the shield (`hasShield`); an older save that met Maren or has the sword gets it. v6: `bells: { carried, hung }`, older saves load with none. v5: `flasks`, a list with one potion id or null per flask owned, replaces `drinks`; v3/v4 drinks load as a flask per kind found, full if any was left. v4: a dungeon's `keys` is a list of colors, not a count; a v3 count loads
as none and the shrine's `restore` re-derives held keys from opened key chests whose door is still shut): v1 saves (which
held flute songs) load with the songs dropped and 0 keys; v1/v2 load in the overworld with
no items or dungeon progress. Saved: flags, keys, area, items, dungeons, flasks, bells, gems, hearts, clock. Not saved: position (continue starts at the saved area's spawn, e.g. a dungeon's
entrance, with at least 3 hearts), enemies, cut bushes, where stones were pushed. Autosave: after every script, every 30 s of play, and on page
hide. Settings (`embervale:settings`): volumes, sensitivities, invert Y, the display mode (see "The pause menu"). Storage goes through `KeyValueStore` so the
desktop build can write real files.

## Conventions

- +x is east, −z is north. Models face +z; `yaw = atan2(dx, dz)`.
- A full day is about 10 minutes (`HOURS_PER_SECOND = 1/24`, owner's call 2026-11-04); night is 18:00–6:00. Crossing
  6:00 or 18:00 shows a one-word card, "Dawn" / "Nightfall" (`dayTurn` in `game/state.ts`, on the HUD's area-name card).
  The HUD clock shows only the time (no day number).
- **Merging** (`mergeStatic`, `render/materials.ts`, T30): a static mesh's `mat`/`surf` colour is baked into a vertex colour
  (linear, with the baked shade of art.md "Rendering rules": `bakeColor`, `BAKED_SHADE`) and meshes batch by kind on a few shared
  vertex-coloured materials; transparent, BackSide, custom-shader or vertex-coloured materials keep their own bucket. Lighting is
  flat (`flatShading: true` on every material, owner's call: faceted, not rounded). Normals don't matter for lighting, but `surfNormal` still carries the faces' own for textures.
  Dynamic things (characters, doors) keep a material per colour until their final passes.
- **Baked light** (`render/bakeLight.ts`; on across the whole world to be judged, T48): every place asks for it. The valley
  and each region ask with `b.bakeLight(rectBakeRegion(rect), label)`, a circle round their rectangle. Sallowmere's strip
  builders `keepShadeForBake()`, and the region bakes its assembled root once (`finish().bakeSet()`, `queueBake`) so the
  willows shade the strips. Dungeons queue one job per floor themselves, on the floor's merged solid with the ceilings left out.
  The bake runs in **three stages**:
  1. **Prep, main thread:** the merged scenery and dynamic meshes marked `userData.bakeLight = 'receive'` (the terrain) are
     receivers. Their big faces are split to ~4 m (`subdivide`, `BAKE.cell`) so a wall can hold a gradient (2 m, the village
     trial's, doubled the valley's triangles and took a dungeon from ~80k to ~450k), and their unique
     points (position and face normal) are listed. Everything near the region is the occluder soup, `'occlude'` meshes
     (instanced trees, rocks) included.
  2. **Gather, background workers** (`bakeGather.ts` run by `bakeWorker.ts`; `bakePool.ts` keeps up to 4 and deals the
     points out round-robin): 32 cosine-weighted rays per point against a `three-mesh-bvh` tree. The result is **raw terms**:
     the open-sky share, the blocked share and the blocked rays' average hue.
  3. **Compose, main thread:** the terms times the strength numbers multiply the vertex colour, replacing `BAKED_SHADE` (the
     merge keeps a `shade` for this, moved into `userData` at prep).

  The world shows at once with the plain shade, and the baked colours land when the workers finish (`bakeStats` has each
  job's cost; `bakeSettled()` is what look shots wait on).
  - **Strength, live:** two profiles of `BAKE` (occlusion, floor, bleed). `sky` is outdoors (1, 0.3, 0.6). `indoor` is the
    dungeons' corner shade (0.7, 0.5, 0.3): their ceilings don't block, so the open top counts as sky (owner's call,
    2026-11-08). `setBakeStrength(profile, …)` recomposes everything baked with that profile, and `setBakedLight(on)` swaps
    the plain and lit colour arrays. The dev panel drives both and remembers them (`embervale:dev:bakedLight`). Reach and rays
    need a re-bake, so they are not live.
  - **Rooms:** a region's `except` circles are left alone, because they are lit by their lamps, not the sky (the mill's room).
  - **Occlusion and bleed are kept apart:** a physical bounce (tried first) added back most of what occlusion took, and the
    village barely changed.
  - **Known seam:** the valley and the Northpass bake separately, so neither sees the other's cliffs at z = −210.
  - **Only in a browser** (`BAKE.atBuild`): unit tests that build areas skip it, and tests call `bakeLight()` to bake on the
    spot.
- Materials from `mat(color)` are shared: **never mutate them**; use `uniqueMat` for
  anything that flashes or glows. `mat`, `surf` and `uniqueMat` **snap every colour to the master palette**
  (`render/palette.ts`, art.md "Palette"); name new colours with `pal('hue', shade)`. Colours set on a material later
  (a flash, a fading glow) and materials built directly with `new THREE.Mesh…Material` aren't snapped: `npm run palette` lists them. Buildings and props are textured: `surf('stone' | 'plaster' | 'wood' | 'shingle', color)`
  (see "Textures").
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

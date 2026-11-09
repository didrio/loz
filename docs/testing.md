# Testing and verifying

How to prove a change works. The Definition of done in AGENTS.md says *when*; this says
*how*.

## Commands

- `npm run check`: lint + unit tests + typecheck/build. Run before calling work done.
- `npm run assets`: builds every registered model in Node and prints triangles against budget, size, textures and the validator's findings
  (the same checks run in `npm run check`: `render/models/registry.test.ts`; [pipeline.md](pipeline.md)).
- `npm run palette`: the hex colour literals still in `src/`, by file, each off-palette one with its nearest swatch
  (`-- --summary` for counts only, `-- <path part>` for one area). Final passes replace them with `pal()` names. The swatch
  page is `/palette.html` on the dev server; the **UI bench** is `/ui.html` (the real HUD on stand-in backdrops, each look,
  device and moment, and the font specimen with its load status; art.md "UI").
- `npm run flags`: who sets and who reads each quest flag (`FLAGS` in `game/state.ts`), as file:line; flags nothing sets or reads are marked `!!`. `game/flags.test.ts` fails on such a flag unless it is in its `NOT_SEEN` list with a reason (flags built from a template string, like `hint.<id>`, can't be seen by name). A new flag needs a `set('x')` and a `has('x')`.
- `npm run smoke`: starts one dev server and headless Chrome and runs the **scenarios**
  (below) in parallel pages, up to 3 at a time; prints one ok/FAIL line per scenario (with
  its failing steps) and the total time. `npm run smoke -- full combat` runs only those
  named. Asserts game state, fails on console errors, saves screenshots to
  `smoke-output/<scenario>/`. Uses the installed Chrome (`CHROME_PATH` to override). Waits
  on game state, never fixed delays: headless rendering is slow and game time runs slower
  than real time there. The dev server doesn't hot-reload during a run, so edits (yours or
  another session's) don't reset the pages. A scenario that fails is **retried once alone**
  after the rest: FLAKY means it passed alone (a busy CPU slows software rendering past a
  step's timeout; on the GPU it rarely happens), a second FAIL is real. Don't run look scenes alongside it.
  Known load-sensitive steps (2026-11-02, load ~12 on 11 cores): `full`'s bridge walk and
  first walk, `combat`'s stagger check; all pass alone.
- **When to run what** (owner's call, 2026-11-02): `npm run check` on every change; after a
  task, only the scenarios that cover it (table below); the full suite at a milestone's
  end, before a commit, or after shared systems (player, physics, camera, saves, game.ts)
  changed, asking the owner first. CI runs everything on every push anyway.
- `npm run look -- <scenes>` (`--list` for names: title, gear (the pause menu's Gear tab, the HUD's flask and glove icons), touch (desktop without controls; phone title, play, stick, dialog, pause; tablet; portrait card), field, village, vignette (the golden set's entrance vignette, T51: Thistledown's road in, blighted at noon, then restored at noon, dusk and night; the grove's trees and a field rock up close), villageDetails (well, cottage fronts, mill doorstep, night lighting), vignetteModels (the vignette's buildings alone in the viewer, front/three-quarter/side: both cottages, the mill, its sails, Odo's stall, a ruined home), props (the hinged door, the stone door, the jar and the sign alone in the viewer; `LOOK_PROPS=id,id` picks others; in game they show in `mill`, `door` and `ruins`), mill (incl. its room), grove, chest,
  door, dungeon, camera, glove, landmarks, buds, bells, bellShaft, gorge, shrine, enemies, thornling (one in the field: idle, the windup's end, mid-lunge, staggered, dying; then the model in the viewer from the front, three-quarter and side), wren (every state of their animation set in the field, held by swapping the player's update for its pose alone: idle, run, the three swings, guard, hurt, guard broken, surf, the glove throw, the death; then the model in the viewer), villagers (T53: Pip close by day with Wren far off, with Wren near (the peek), hugging Button once returned, the five villagers in the square; then `pip` and `villager` in the viewer, front/three-quarter/side; `LOOK_VILLAGERS=id,id` picks which), hollow, night, atmosphere (each place's sky, fog and light at dawn, noon, dusk and night, in the restored valley, plus a shrine room), guard, shield, surf, orbs, boss, boss-moves, lamplighter (T54: the model in the viewer, front/three-quarter/side by day and the front at night in the hollow; its in-game shots are `boss` and `boss-moves`), gravelheart, gravelheart2, gravelheartModel (T55: the model in the viewer in the shrine's light, front/three-quarter/side/back; its in-game shots are `gravelheart` and `gravelheart2`), gate, northpass, camp, sallowmere (the mere's first view by day and night, the switchbacks, its sites' footprints, from above; logs its stepped build), wardenIntro, seal, blight, emptyVillage, hud (the sky dial through the day, the compass), choice (the choice window over a dialog question, and the script menu), text (text boxes: the longest note, two place signs, a sigil and its toast), lostBell (the Morrowbell by the windmill), thorns (a thicket and its gap, a lone clump, the lone oak, the scars: the spine, the gate's pool, the west vein, the grove's guard post), bake (the baked light on and off: village, field, a ruin, grove, gorge, camp, a shrine room; prints each bake's cost)): captures named scenes to
  `look-output/` (full size). The light bake runs in background workers, so `h.shot` first waits for every bake out (`embervaleBake.settled()`) and then steps one frame. Boss scenes slow time, make Wren invulnerable, park
  the camera and force moves. Add a scene when you add a place, a boss or a visual system.
  **Baselines and budgets:** every shot is compared with its approved baseline
  (`scripts/baselines/look/<shot>.png`, in git, shrunk 4x; `scripts/lookCompare.mjs`) and printed as
  unchanged / changed (with the share of pixels; over 0.05% counts as changed) / new; **only changed and new shots need a look** (the full-size file is in
  `look-output/`, a picture of the differences in `look-output/diff/`). After you or `looker` judged the changed shots right,
  `npm run look -- <scenes> --approve` saves them as the new baselines (commit `scripts/baselines/`); a refactor should print
  "unchanged". `--approve` also rewrites those scenes' budgets in `scripts/look-budgets.json` (peak draw calls and triangles
  of the scene + 25%); a scene over its budget fails the run. Use `--approve` on the scenes you ran, not blindly on all.
  **Every scene has committed baselines and budgets** (approved 2026-11-07 as the N64 rebuild's "before", in Native mode, the
  game's default; [art.md](art.md)): ~246 shots, 5.7 MB. Re-approve **only the scenes you changed** (`--approve` with their names): a full
  re-approve costs ~6 MB of git history. To keep that small a baseline is stored at 4x shrunk **and 5 bits per colour channel** (every
  value a multiple of 8, RGB without alpha, best deflate: `QUANT`, `writeBaseline` in `lookCompare.mjs`; both sides of a compare are
  quantized, so it never shows as a change). `--display n64` (or `performance`) captures a scene in that Display mode: the shots are named `<shot>-n64` so they never meet the Native baselines, and
  budgets are only checked and written for Native. **Shadows are off in every look and smoke run** (`openGame` plants `shadows: false`, so the baselines and budgets stay
  comparable); `--shadows` captures with the Shadows setting On (shots named `<shot>-shadows`, then `-n64`; no budget check). Since N64 moves `renderer.info`, `RetroPipeline`
  turns `autoReset` off so the budgets still count the whole frame.
  **Speed and the renderer** (measured 2026-11-07, M3 Pro, 11 cores): locally Chrome draws on the **real GPU** (ANGLE on Metal, Chrome's own
  default flags); `GL=software` switches to SwiftShader (on the CPU, the fallback), and anything outside a Mac, or with `CI` set, uses it
  by default (`GL` in `browser.mjs`; smoke uses it too). One scene, where the time went (software → GPU): page load to the title
  7.3 s → 2.7 s (Vite's transform and the game's build; the dev server itself starts in 0.2 s, Chrome in 0.2-1.4 s), new game and intro
  0.85 → 0.23 s, 20 stepped frames 3.2 → 0.5 s, a screenshot 1.0 → 0.12 s, shrink and compare 0.05 s. Whole runs: one scene ~2-5 s, the
  **full 48 scenes in ~60 s** (4 scenes at once; `JOBS=n` overrides, default 4 on the GPU, 3 on software), against ~16 min before.
  The floor is the game's boot per scene. Baselines are **GPU renders**; a `GL=software` run draws nearly the same frames (a few shots
  differ by a handful of pixels, which the tolerance absorbs) but isn't what they were approved on. Smoke on the GPU is faster too
  (18-31 s a scenario against 42-127 s) and was not flaky, where the software run was under 3 at a time.
  Look runs on a **stepped clock** (`openGame(..., { stepped: true })` in `browser.mjs`): the page's frames only run when the
  script steps them (50 ms of game time each), `h.wait(ms)` runs frames instead of sleeping, `h.until` checks after every
  frame (its timeout is game time), `Math.random` is seeded and CSS animations are finished before a shot. Two runs on
  unchanged code give nearly identical frames: a few shots (gorge, orbs, hollow) still differ by a handful of scattered pixels
  (cause not found), which the tolerance absorbs. A "changed" shot is a real change, or a new random draw order. **three.js draws four `Math.random()` numbers for every object, material and
  geometry it creates (its UUIDs), and a wisp's orbit adds `root.id`:** a refactor that builds a different number of objects (an extra
  group in a model builder) shifts everything seeded after it, so the boss arena's flame phases and the freed wisps differ by a few
  pixels with no model changed (T33: `boss` went from 5 unchanged to 0.13-1.6%). To prove a model refactor changed nothing, fingerprint the
  model before and after instead (every mesh's geometry type, vertex count, bounds, world matrix, material colour, emissive and surface, from
  a throwaway test that builds it on the old tree with `git stash` and on the new one) and compare. A scene must use
  `h.wait`/`h.until`/`h.shot`/`h.shotOf(locator, name)`, never `page.waitForTimeout` or its own screenshots. The full run takes ~1 min.
- Both scripts share `scripts/browser.mjs` (dev server, Chrome, `newGame`, `teleport`,
  `finishScript`...). One-off investigation scripts belong in your session scratchpad, not
  the repo.
- CI (`.github/workflows/deploy.yml`) runs check and smoke on every push and PR; deploys
  `main` to GitHub Pages as soon as check passes (smoke runs alongside but doesn't gate the
  deploy: owner's call, 2026-11-02), and uploads smoke screenshots when smoke fails.
  The pause menu's **Dev** tab (sprint, invincible, save states) is on in every build for now; the Steam build must set
  `VITE_DISABLE_DEV_TAB=1` to drop it.

## Smoke scenarios and save fixtures

`scripts/smoke.mjs` is the runner; each scenario is `scripts/smoke/<name>.mjs`, exporting
`fixture` (a name, or `null` for a new game) and `default async function run(t)`, where `t`
has the `openGame` helpers from `scripts/browser.mjs` plus `step(title, fn)` and
`check(cond, msg)`. The runner adds the "no errors in the console" step at the end.

| Scenario | Starts from | Covers |
|---|---|---|
| `full` | new game | title, a wordless start and the crossroads sign, walking, collisions, bridge, bounds, locked chest, the shield in the ruined cottage (guard, the scream), Maren's key, the sword, the sealed door, the Lamplighter fight and its heart vessel, the door opening, night + save/Continue, entering the shrine (no seal) |
| `combat` | `field-sword` | the shield's guard and guard break, lock-on and the sword vs a thornling, a blight thorn clump (a heart lost, shoved out), the sword felling a clump in five hits (saved), a scar underfoot (a heart lost, shoved off) |
| `shrine-puzzle` | `shrine-entry` | pushing stones, plates, the crystal switch, the solved puzzle surviving Continue |
| `shrine-keys` | `shrine-entry` | a room clearing, the amber key chest, the Cistern door, the HUD key, dying (the checkpoint rule: beaten challenge rooms stay empty), Continue inside |
| `shrine-exit` | `shrine-entry` | the way out (always open) |
| `shrine-enemies` | `shrine-entry` | sentinels and shellbacks spawn from the data; a sentinel sleeps, wakes, swings (4 half-hearts), falls to hits in its recovery and from behind (the gallery's other statues are blinded for that step: in a 14 m room every spot is in someone's wake range); a shellback's shell turns a frontal hit, it falls from behind |
| `shrine-boss` | `shrine-boss` | walking into the Hearth wakes Gravelheart (its theme, the seal); a direct kill plays the defeat (the ember, the ring and door, the Heart Vessel, the causeway and the hidden door); the vessel adds a heart; the causeway leads to the Keepers' Seal; the prism (one hit only cracks it, four shatter it): its vision breaks the gate and returns to the room |
| `dev-menu` | `field-sword` | the pause menu's Dev tab: opens and pauses, toggles stay open, Backspace closes, loading the boss-door state (with its hints and messages) by keyboard and the night state by mouse; the Sallowmere descent state stands Wren on the streamed region's ground |
| `village` | `field-sword` | Lark's surf idea and a ride (shield-held landing, speed, letting go; not indoors), Tobin's mill key, the mill door swinging open in place, walking in, sleeping (heals, clock to 18:00), a shut door keeping Wren in, walking out, buying Odo's Stoneward Tunic, a villager's talk blipping as it types and staying silent when the typing is skipped |
| `trials` | `shrine-entry` | the Bell Shaft: a fall from a checkpoint ledge returns Wren there, half a heart lost; riding a rising ledge; taking the Lullbell from the top ledge |
| `gorge` | `field-sword` | the Hushing Gorge: its five thornlings and sentinel, a fall off the climb returns Wren to the last pillar (half a heart), taking the Morrowbell |
| `water` | `field-sword` | the valley's river: a shallow edge costs nothing, its deep bed is a fall back to the bank (half a heart) |
| `northpass` | `northpass` | the Cragstalker stands on the canyon's far side once the region is built; a fall in the crossing returns Wren to the last ledge (half a heart); it lunges at Wren; taking the Waybell, hanging it at the camp (the village bell is lifted, so the menu offers only the Hall), then rehanging the lost Morrowbell offers both and Wayfarers' Camp arrives at its post; back in Thistledown only Lark and Pip remain, Pip asks Wren to find the grown-ups, Odo's stall refills a flask unattended; past the Waybell, Sallowmere streams in: the overlook and the descent's foot are dry, Stiltwick's shallows wade, the channel before the Weir is a fall back to dry ground |
| `bells` | `field-sword` | the empty Thistledown post, hanging the Morrowbell (nothing answers), the travel menu to the shrine's post and back, Stay, hearts unchanged; the village bell taken off after the boss (Lullbell rings alone), found behind the mill and rehung (menu returns) |
| `hints` | `field-sword` | P pauses on the Settings tab (then Gear, Dev), a slider changes and saves, lock-on holds a Murmurbud, mashing overloads it, a strike-and-rest rhythm opens it (not read yet), E reads the floating note (gone, kept), the Hints tab lists and shows it, a read sigil adds a Messages tab |
| `touch` | `field-sword` | on a landscape phone (`?touch=1`, CDP multi-touch): the title takes a tap, the stick walks, Sword swings, Jump then held Shield surfs, Interact appears reading Talk near Lark (Jump stays Jump) and opens her talk, taps read on, the bed (its prompt's label centred, a tapped Sleep, then the controls and stick still work), ☰ (top-left) and ✕ open and close the pause menu, a key hides the controls and the next touch brings them back, a rotation reported late (the window gives the old size during the resize events) still fills the screen (`Game.resizeIfChanged`, checked every frame) |
| `jars` | `field-sword` | a sword swing breaks an empty jar in a ruin (flag `jar.<id>` saved, no pickup) and the blue gem jar (a gem is collected); the doll jar, then Pip takes the doll back for 20 gems |

**Fixtures** are real saves in `scripts/fixtures/<name>.json` (current `SAVE_VERSION`).
`openGame(env, dir, { fixture, touch })` (`touch`: an 844×390 phone page with touch, at `?touch=1`; a scenario opts in with `export const touch = true`) plants the file in the page's localStorage before the game
boots (only if the slot is empty, so a reload keeps what the game saved), so the title shows
Continue; `continueGame()` boots and presses it. No game code is involved. A unit test
(`src/core/fixtures.test.ts`) requires every fixture to decode unchanged through `decodeSave`
and to use only known flags, items, areas and dungeons, so a save-format change fails
`npm run check` until the fixtures are updated. To make one: play to the spot in
`npm run dev`, save, copy `localStorage['embervale:save:0']` into a file (set `savedAt` 0),
or edit an existing fixture by hand.

**Adding a scenario**: write `scripts/smoke/<name>.mjs` (copy a small one), add the name to
`SCENARIOS` in `scripts/smoke.mjs`, and a row above. Prefer a fixture over replaying the
game to reach the spot. A scenario runs in its own page and storage, so it must not rely on
another one. Add a new fixture only when a scenario needs a state no fixture has.

## Unit tests

Tests live next to their modules (`*.test.ts`).

- `world/overworld/colliders.test.ts` freezes the overworld's layout for final passes (T51): every collider the overworld builds, Thistledown's one by one and all of them as a digest (the valley's trees and rocks included). A model change that fails it moved a collider: put it back, or ask the owner before updating the snapshot.
- `world/texturesEverywhere.test.ts` builds the valley, the Northpass and the shrine and fails on any plain (untextured) static mesh that isn't glowing, a void or tiny (engine.md "Everything is textured unless justified"); `game/livingTextures.test.ts` does the same for people, enemies and bosses (every curved textured piece must be `faceted`).

- `content/fakeApi.ts` is the shared fake `ScriptApi` for content tests: everything
  resolves instantly and what scripts do is recorded (said, queued `run`s, enemies,
  travel).
- `content/overworld.test.ts` builds the real overworld in Node and runs its scripts
  against the fake API; every interactable/trigger must have a script.
- `content/shrine.test.ts` does the same for the shrine: keys and doors, the boss
  door, cleared rooms, the crystal, respawn, restore and the exit. It plays the
  quest thread in order and checks the edge cases (locked chest first, old saves).
- `game/bosses/gravelheart/gravelheart.test.ts` does the same for Gravelheart (stone armor,
  Hammerfall's window, the 4-half-heart attack sheet, phase 2: howl, double sweep, Cairn Roll, keystone, kneel, reset, settling asleep); `build.test.ts` covers its arena (wall stones,
  the door seal, the ring).
- `game/boss.test.ts` runs the Lamplighter's state machine headlessly (guarding, slam
  reach, phase two, death, reset) and a minimal `Dummy` boss for the move system; copy
  that pattern for new bosses. `game/bosses/lamplighter.trace.test.ts` (T54) proves a final pass left the fight alone: it
  runs the intro, stalking, every move, the howl and the death with the random numbers pinned and snapshots the hurtboxes,
  the hook's tip and the head every 4th frame. The snapshot was recorded on the old code; a model or rig change must pass it
  unedited (re-record it only for a deliberate, owner-approved change to the fight). `game/bosses/gravelheart/gravelheart.trace.test.ts`
  (T55) does the same for Gravelheart: the hurtboxes, the ember, the head, the three plates and the keystone (where the glove aims)
  through the intro, stalking, every move (the glove tearing a plate and pulling the keystone), the howl, a kneel and the death.
- `world/dungeon/build.test.ts` builds the shrine in Node and walks a real Wren around it:
  floors at their levels, pits and drop holes, climbing both staircases, open doorways vs
  locked doors.
- `world/dungeon/puzzle.test.ts`: the room grid and the wakestone puzzle checker (the
  shrine's puzzles solvable, broken ones caught, pits, heavy stones).
- `world/dungeon/dungeon.test.ts` checks the dungeon format, the solver and the text map;
  every dungeon in the registry must validate and be solvable with no softlocks (see
  [dungeons.md](dungeons.md)).
- `game/thornling.test.ts`: enemy senses (no hits from the floor below, in the real
  shrine; no noticing through walls; the leash; dungeon-room territory).
  `game/lockon.test.ts`: lock-on skips enemies on other floors and behind walls.
- `core/music.test.ts` checks that every theme compiles (bars add up, sensible loop).
- `content/bells.test.ts`: every bell has one post and an arrival entrance; the empty post's
  lines; hanging the first bell (no answer) and the second (answer, menu, travel); Stay and
  backing out; hearts never change; taking a bell. `game/menuDriver.test.ts`: `ChoiceMenu`.

## Debugging in the browser

`npm run dev`, then `?debug` in the URL: fps/draw calls/position overlay; backslash (\)
toggles a collider wireframe. In dev, `window.embervale` is the `Game` (teleport with
`embervale.player.teleport(x, y, z)`). For bosses: `embervale.activeBoss.forceMove('slam')`
plays a move on demand, `embervale.setTimeScale(0.05)` slows everything to inspect poses,
`embervale.rig.shot(from, at, true)` parks the camera (it shows Wren at full opacity: a camera parked where Wren stands
needs `embervale.hidePlayer(true)`, or the shot looks out through the inside of Wren's head), `embervale.player.invuln = 1e6`.
Any model change shifts the seeded random sequence (three.js draws a random id per object), so enemies wander elsewhere and
their shots change: expected, not a bug.
`embervale.loadArea('shrine')` jumps into the dungeon; `embervale.area.showFloor(0)` and
`embervale.rig.frozen = true` set up a top-down view (see the `dungeon` look scene).
Indoors, call the `teleport` helper with a `fromY` just above the floor.
**Dev tab**: the last tab of the pause menu (**P**, then Q/E): dev sprint (5× run
speed, `Player.devSpeed`), invincibility, and **save states** (in play order; each has the hints and messages Wren could have by then, and shield surfing, Lark's lesson, for every state past the new game) that jump to a ready-made point
and replace the current save (see "Menus" in [engine.md](engine.md)). Off in builds with `VITE_DISABLE_DEV_TAB=1`.
With `?debug`, **\** toggles the collider wireframe and red rings round enemies' hurtboxes.
`?state=<id or number>` boots straight into a Dev tab state (skips the title); `embervale.spawn('shellback', x, z)` puts a registered enemy in the world
(omit x, z: 3 m ahead of Wren). `/viewer.html?asset=<id>` shows one model on a turntable; `?asset=contact` is the contact sheet (`npm run look -- contact`).
Details: [pipeline.md](pipeline.md) "The viewer, contact sheet and dev shortcuts".
**P** opens the pause menu (Settings, Hints, Messages tabs); music is muted with its volume slider there.

## Known testing quirks

- **Never check the HUD after a fixed delay.** Prompts, the boss bar and cards update on game
  frames, and with scenarios running in parallel game time crawls: `wait(300)` then `check`
  flaked three times in one day. `until` the element shows (with a timeout), then `check`.

- `finishScript` presses Enter, which is also an interact key: right after a script ends,
  a stray Enter can re-trigger the interactable you're standing at. Harmless so far.
- Don't "beat every enemy" in the shrine to clear the way: that clears the rooms ahead
  too (and queues their reveal cutscenes, which ignore input while they play). Clear only
  the rooms the step uses, and wait for `mode === 'play'` before acting.
- After a strike, wait for the stone to change cells (not just "not moving": in headless
  the swing lands a moment after the key press, so "not moving" can be true before the
  push). After clearing a room, wait for it to count as cleared and for play to resume
  (its reveal cutscene ignores input). Wait for the prompt before pressing interact.
- After pressing a flask key, wait for the drink to register before checking (one headless
  frame can outlast the key press gap).
- Ray queries (`groundY`) only see colliders as of the last physics step, and stones are
  Prop-layer: in Node tests, `refreshQueries()` after moving one and query with Prop.
- Knockback moves Wren for ~0.5 s after a hit or guard break: let it settle before
  measuring movement (the stagger check in smoke does).
- Audio, timing and feel can't be verified by an agent: ask the owner to play and listen.

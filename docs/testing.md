# Testing and verifying

How to prove a change works. The Definition of done in AGENTS.md says *when*; this says
*how*.

## Commands

- `npm run check`: lint + unit tests + typecheck/build. Run before calling work done.
- `npm run smoke`: starts one dev server and headless Chrome and runs the **scenarios**
  (below) in parallel pages, up to 3 at a time; prints one ok/FAIL line per scenario (with
  its failing steps) and the total time. `npm run smoke -- full combat` runs only those
  named. Asserts game state, fails on console errors, saves screenshots to
  `smoke-output/<scenario>/`. Uses the installed Chrome (`CHROME_PATH` to override). Waits
  on game state, never fixed delays: headless rendering is slow and game time runs slower
  than real time there. The dev server doesn't hot-reload during a run, so edits (yours or
  another session's) don't reset the pages. A scenario that fails is **retried once alone**
  after the rest: FLAKY means it passed alone (a busy CPU slows software rendering past a
  step's timeout), a second FAIL is real. Don't run look scenes alongside it.
  Known load-sensitive steps (2026-11-02, load ~12 on 11 cores): `full`'s bridge walk and
  first walk, `combat`'s stagger check; all pass alone.
- **When to run what** (owner's call, 2026-11-02): `npm run check` on every change; after a
  task, only the scenarios that cover it (table below); the full suite at a milestone's
  end, before a commit, or after shared systems (player, physics, camera, saves, game.ts)
  changed, asking the owner first. CI runs everything on every push anyway.
- `npm run look -- <scenes>` (`--list` for names: title, field, village, mill, grove, chest,
  door, dungeon, camera, glove, landmarks, buds, bells, bellShaft, gorge, shrine, enemies, hollow, night, guard, shield, surf, orbs, boss, boss-moves, gravelheart, gravelheart2, gate, northpass, camp, wardenIntro, seal, blight): captures named scenes to
  `look-output/` for you to inspect. Boss scenes slow time, make Wren invulnerable, park
  the camera and force moves. Add a scene when you add a place, a boss or a visual system.
- Both scripts share `scripts/browser.mjs` (dev server, Chrome, `newGame`, `teleport`,
  `finishScript`...). One-off investigation scripts belong in your session scratchpad, not
  the repo.
- CI (`.github/workflows/deploy.yml`) runs check and smoke on every push and PR; deploys
  `main` to GitHub Pages as soon as check passes (smoke runs alongside but doesn't gate the
  deploy: owner's call, 2026-11-02), and uploads smoke screenshots when smoke fails.
  The Pages build sets `VITE_DEV_SPRINT=1`, so the dev menu (~ / L3: sprint, invincible, save states) works there; Steam and
  itch builds must not set it.

## Smoke scenarios and save fixtures

`scripts/smoke.mjs` is the runner; each scenario is `scripts/smoke/<name>.mjs`, exporting
`fixture` (a name, or `null` for a new game) and `default async function run(t)`, where `t`
has the `openGame` helpers from `scripts/browser.mjs` plus `step(title, fn)` and
`check(cond, msg)`. The runner adds the "no errors in the console" step at the end.

| Scenario | Starts from | Covers |
|---|---|---|
| `full` | new game | title, a wordless start and the crossroads sign, walking, collisions, bridge, bounds, locked chest, the shield in the ruined cottage (guard, the scream), Maren's key, the sword, the sealed door, the Lamplighter fight and its heart vessel, the door opening, night + save/Continue, entering the shrine (no seal) |
| `combat` | `field-sword` | the shield's guard and guard break, lock-on and the sword vs a thornling |
| `shrine-puzzle` | `shrine-entry` | pushing stones, plates, the crystal switch, the solved puzzle surviving Continue |
| `shrine-keys` | `shrine-entry` | a room clearing, the amber key chest, the Cistern door, the HUD key, dying (the checkpoint rule: beaten challenge rooms stay empty), Continue inside |
| `shrine-exit` | `shrine-entry` | the way out (always open) |
| `shrine-enemies` | `shrine-entry` | sentinels and shellbacks spawn from the data; a sentinel sleeps, wakes, swings (2 half-hearts), falls to hits in its recovery and from behind; a shellback's shell turns a frontal hit, it falls from behind |
| `shrine-boss` | `shrine-boss` | walking into the Hearth wakes Gravelheart (its theme, the seal); a direct kill plays the defeat (the ember, the ring and door, the Heart Vessel, the causeway and the hidden door); the vessel adds a heart; the causeway leads to the Keepers' Seal; the seal-stone's vision breaks the gate and returns to the room |
| `dev-menu` | `field-sword` | ~ opens and pauses, toggles stay open, Backspace goes back/closes, loading the boss-door and night states by keyboard and mouse |
| `village` | `field-sword` | Lark's surf idea and a ride (shield-held landing, speed, letting go; not indoors), Tobin's mill key, the mill door, sleeping (heals, clock to 18:00), the way out, buying Odo's Stoneward Tunic |
| `trials` | `shrine-entry` | the Bell Shaft: a fall from a checkpoint ledge returns Wren there, half a heart lost; riding a rising ledge; taking the Lullbell from the top ledge |
| `gorge` | `field-sword` | the Hushing Gorge: its five thornlings and sentinel, a fall off the climb returns Wren to the last pillar (half a heart), taking the Morrowbell |
| `northpass` | `northpass` | the Cragstalker stands on the canyon's far side once the region is built; a fall in the crossing returns Wren to the last ledge (half a heart); it lunges at Wren; taking the Waybell, hanging it at the camp, the travel menu offers both other bells and Morrowbell → Wayfarers' Camp arrives at its post |
| `bells` | `field-sword` | the empty Thistledown post, hanging the Morrowbell (nothing answers), the travel menu to the shrine's post and back, Stay, hearts unchanged |
| `hints` | `field-sword` | P pauses (empty notes page), M toggles music, lock-on holds a Murmurbud, mashing overloads it, a strike-and-rest rhythm opens it (not read yet), E reads the floating note (gone, kept), the pause menu lists and reads it |

**Fixtures** are real saves in `scripts/fixtures/<name>.json` (current `SAVE_VERSION`).
`openGame(env, dir, { fixture })` plants the file in the page's localStorage before the game
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
  that pattern for new bosses.
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
`embervale.rig.shot(from, at, true)` parks the camera, `embervale.player.invuln = 1e6`.
`embervale.loadArea('shrine')` jumps into the dungeon; `embervale.area.showFloor(0)` and
`embervale.rig.frozen = true` set up a top-down view (see the `dungeon` look scene).
Indoors, call the `teleport` helper with a `fromY` just above the floor.
**Dev menu**: on the dev server (or with `?debug`), **~** / **L3** opens it: dev sprint (5× run
speed, `Player.devSpeed`), invincibility, and **Save states** that jump to a ready-made point
and replace the current save (see "Menus" in [engine.md](engine.md)). Never in the shipped
build. With `?debug`, **\** (not ~) toggles the collider wireframe.
**P** toggles music (saved in the settings) and now shows a toast, so a muted game is no
longer a mystery.

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

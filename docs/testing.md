# Testing and verifying

How to prove a change works. The Definition of done in AGENTS.md says *when*; this says
*how*.

## Commands

- `npm run check`: lint + unit tests + typecheck/build. Run before calling work done.
- `npm run smoke`: starts a dev server and plays through the quest in headless Chrome
  (title → intro → walk → collisions → bridge → bounds → locked chest + floating prompt →
  Maren's key (HUD) → chest: sword → shield guard and guard break (stagger: no jump, a
  crawl) → combat → the sealed shrine door → the Lamplighter fight (intro, phase two,
  defeat cutscene, the door waking, heart vessel) → the door opens on interact (cutscene)
  → night → reload and Continue → into the shrine (the seal) → a fight room's shutters
  and its key chest → unlocking a door upstairs → striking the crystal → dying and
  respawning at the entrance → saving and continuing inside → leaving once it's beaten),
  asserting game state, failing on console errors
  and saving screenshots to `smoke-output/`. Uses the installed Chrome (`CHROME_PATH` to
  override). Waits on game state, never fixed delays: headless rendering is slow and game
  time runs slower than real time there. Extend it when you add a quest step.
- `npm run look -- <scenes>` (`--list` for names: title, field, village, grove, chest,
  door, dungeon, shrine, hollow, night, guard, boss, boss-moves): captures named scenes to
  `look-output/` for you to inspect. Boss scenes slow time, make Wren invulnerable, park
  the camera and force moves. Add a scene when you add a place, a boss or a visual system.
- Both scripts share `scripts/browser.mjs` (dev server, Chrome, `newGame`, `teleport`,
  `finishScript`...). One-off investigation scripts belong in your session scratchpad, not
  the repo.
- CI (`.github/workflows/deploy.yml`) runs check and smoke on every push and PR; deploys
  to GitHub Pages only if both pass, and uploads smoke screenshots when smoke fails.

## Unit tests

Tests live next to their modules (`*.test.ts`).

- `content/fakeApi.ts` is the shared fake `ScriptApi` for content tests: everything
  resolves instantly and what scripts do is recorded (said, queued `run`s, enemies,
  travel).
- `content/overworld.test.ts` builds the real overworld in Node and runs its scripts
  against the fake API; every interactable/trigger must have a script.
- `content/shrine.test.ts` does the same for the shrine: the seal, keys and doors, the boss
  door, fight rooms, the crystal, respawn, restore and the exit. It plays the
  quest thread in order and checks the edge cases (locked chest first, old saves).
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

## Debugging in the browser

`npm run dev`, then `?debug` in the URL: fps/draw calls/position overlay; backquote (`)
toggles a collider wireframe. In dev, `window.embervale` is the `Game` (teleport with
`embervale.player.teleport(x, y, z)`). For bosses: `embervale.activeBoss.forceMove('slam')`
plays a move on demand, `embervale.setTimeScale(0.05)` slows everything to inspect poses,
`embervale.rig.shot(from, at, true)` parks the camera, `embervale.player.invuln = 1e6`.
`embervale.loadArea('shrine')` jumps into the dungeon; `embervale.area.showFloor(0)` and
`embervale.rig.frozen = true` set up a top-down view (see the `dungeon` look scene).
Indoors, call the `teleport` helper with a `fromY` just above the floor.

## Known testing quirks

- `finishScript` presses Enter, which is also an interact key: right after a script ends,
  a stray Enter can re-trigger the interactable you're standing at. Harmless so far.
- Don't "beat every enemy" in the shrine to clear the way: that clears the fight rooms ahead
  too (and queues their reveal cutscenes, which ignore input while they play). Clear only
  the rooms the step uses, and wait for `mode === 'play'` before acting.
- After a strike, wait for the stone to change cells (not just "not moving": in headless
  the swing lands a moment after the key press, so "not moving" can be true before the
  push). After clearing a room, wait for it to count as cleared and for play to resume
  (its reveal cutscene ignores input). Wait for the prompt before pressing interact.
- After pressing a drink key, wait for the drink to register before checking (one headless
  frame can outlast the key press gap).
- Ray queries (`groundY`) only see colliders as of the last physics step, and stones are
  Prop-layer: in Node tests, `refreshQueries()` after moving one and query with Prop.
- Knockback moves Wren for ~0.5 s after a hit or guard break: let it settle before
  measuring movement (the stagger check in smoke does).
- Audio, timing and feel can't be verified by an agent: ask the owner to play and listen.

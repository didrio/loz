# AGENTS.md

Context for AI agents (and humans) working on this repo. This file is loaded into every
session, so it stays **short**: rules, where things are, and pointers. Details live in
`docs/`. **Keep both current**: when behavior, a decision or the file layout changes,
update the matching doc in the same change.

## What we're building

**Embervale: Song of the Waking Shrine**: an original 3D action-adventure in the spirit of
late-90s console adventures. An open field around a village hub, dungeons with keys,
switches and bosses, lock-on sword combat and a day/night cycle. Low-poly, flat-shaded, a
little wistful. There is deliberately **no instrument/song-playing mechanic** (removed as
too close to a famous game; don't bring it back).

The goal is a **real, full-length game (10–15 hours, 50–100× today's content)**, sold for
$5–10 **on Steam** (desktop build via Electron) with a **free browser demo on itch.io**,
built almost entirely by AI agents. Build everything as if it will ship.

## Where things stand (current state only, ≤ 8 lines; history lives in git)

As of 2026-11-03: Emberfield (the valley) plays start to finish (Lamplighter, quest thread, music, village), and **the Waking
Shrine** (25 rooms, the Bell Shaft trial) through **Gravelheart**, whose defeat leads to the Keepers' Seal, which opens the magic
gate ([docs/shrine.md](docs/shrine.md)). Beyond it the Northpass streams in and ends at **Wayfarers' Camp** (the Waybell's post);
a canyon crossing leads to two **Cragstalkers** and the Waybell, the third fast-travel stop (D3, unplayed). **Bells** and three
trials work ([docs/bells.md](docs/bells.md)); the dev menu (~ / L3) has sprint, invincibility and save states (one at the opened gate).
**Murmurbuds** (3 keepers' notes), the **pause menu** (P), **shield surfing** (Lark gives the idea; `game/surf.ts`) and the sealed gate
(rock shoulders and invisible walls out to the rim) are built, unplayed. **Next:** the pause menu's inventory and settings
(roadmap 2); the owner owes a play of D3, the Murmurbuds, surfing and the gate. (Gamepad: attack X/RB/RT, guard LB/LT.)

## Docs: read the one for the area you're touching

| Doc | Read it before... |
|---|---|
| [docs/roadmap.md](docs/roadmap.md) | **starting any feature** (see "Before you start" below); what's next, the scaling checklist, tech debt |
| [docs/engine.md](docs/engine.md) | touching the frame loop, modes, areas, physics, input, scripts/cutscenes, saves; conventions |
| [docs/combat.md](docs/combat.md) | touching the sword, shield/guard, enemies, hazards or bosses (incl. boss fairness rules) |
| [docs/dungeons.md](docs/dungeons.md) | designing or building a dungeon (the data format, solver, text map) |
| [docs/shrine.md](docs/shrine.md) | working on the first dungeon: its design, item, enemies, boss, the Northpass gate, build plan |
| [docs/bells.md](docs/bells.md) | bell posts (bonfires), fast travel, bell trials and platforming: lore, rules, the recipe for a new bell site, build plan |
| [docs/world.md](docs/world.md) | writing dialog, quests, places, characters (world bible and the quest thread) |
| [docs/audio.md](docs/audio.md) | touching sound effects or music |
| [docs/testing.md](docs/testing.md) | verifying anything: smoke, look scenes, unit test patterns, debug tools |

## Hard rules

- **Original IP only.** Genre conventions are fine (lock-on targeting, hearts, gems,
  dungeons, small keys, a field hub, day/night). Never recreate a specific existing game's
  names, characters, story, map layout, music, sound effects, logos or UI design, and never
  use another franchise's names in code, text or marketing. If a request would recreate a
  specific game's content, do the original version and say so.
- **Art is primitives only**: boxes, cylinders, cones, spheres, icosahedra built in code with
  flat colors. No imported models, textures or sprites.
- **Audio is synthesized in code.** No samples, no recordings; all melodies original.
- **AI disclosure**: the game contains AI-generated code and writing; the owner will
  disclose it on Steam.

## Working with the owner

- Fullstack (React) developer and long-time Ableton/keyboard producer; new to game dev
  terms. Explain engine concepts in plain words (DAW/web-dev analogies help).
- They describe what they want and explicitly invite pushback: give an honest opinion,
  propose a simpler model when there is one, then build it and say where you deviated.
- They want depth over speed: take the time to do things properly, but report plainly.
- You can't hear audio or judge game feel: say so and ask them to play/listen.
- They pay for every token: read narrowly (the layout below names the files), keep a
  session to one task, and leave the docs ready for a fresh session instead of relying on
  chat history.
- Commit or push only when asked.
- **Guide them; they follow your lead on process.** End every reply that finishes a step
  with a short **Next for you** line saying exactly what to do: a command to type (`/wrap`,
  `/clear`, `/start <task>`, `/model sonnet`), something to play or listen to, a question to
  answer, or "nothing, I'm continuing". Say so when a session has run long enough that
  `/clear` would save money, and say whether the next task wants plan mode (usually not).

## Text the player reads

Dialog, signs, item messages and toasts are designed, not filler: follow "Writing for the
player" in [docs/world.md](docs/world.md) (short, clear, in-voice, specific to Emberfield,
and NPCs that react to day/night, story progress and Wren's gear where it adds life).

## Before you start a feature

Read the **scaling checklist** in [docs/roadmap.md](docs/roadmap.md). If your work fires
an item's trigger, do that item as part of the work, tell the owner, and tick it off with
the date. This is how the plan for growing the game 50–100× survives between sessions.

## Definition of done

Every change, before you call it done. These habits have caught real bugs here (a camera
inside a tree, a boss that froze, Wren stuck under the floor, a cutscene camera inside a
door), so don't skip them because the change "looks small":

1. **Rules get tests.** A logic change gets a unit test next to its module that would fail
   without it. A bug gets **reproduced in a failing test first**, then fixed.
2. **`npm run check`** passes (lint, unit tests, typecheck, build).
3. **Gameplay or content changes: the smoke scenarios that cover it** pass
   (`npm run smoke -- <scenarios>`, 1–2 min), and smoke gets a new step when you add a
   quest beat, a boss or a system. The **full suite** (~3–6 min) is for the end of a
   milestone, before the owner commits, or after touching shared systems (player, physics,
   camera, saves, game.ts): **ask the owner first** (owner's call, 2026-11-02; CI also runs
   it on every push). See [docs/testing.md](docs/testing.md) for which scenario covers what.
4. **Anything visible: look at it.** `npm run look -- <scenes>` (or a scratch Playwright
   script built on `scripts/browser.mjs`), then open the screenshots and check them. For
   refactors, capture before and after. Dungeon layouts: `npm run map -- <id>`.
5. **When a check fails, find out why before touching game code.** It may be the test
   (headless timing, knockback still settling) or a real bug.
6. **Update the docs** in the same change: this file for layout/rules, the topic doc for
   details, the roadmap checklist for scaling items.
7. **Report plainly**: what you verified, what you couldn't (audio, feel, a real GPU or
   gamepad), and where you deviated from the request.

## Architecture

Dependencies point one way: `core` ← `render` ← `world` ← `game` ← `content`.
`core` knows nothing about the game; `world` builds places but never decides what happens
in them; `content` (story, dialog, quest logic) binds behavior to world objects by id.

```
src/
  main.ts                  boot: init Rapier, create Game, expose window.embervale (dev/?debug)
  core/                    engine-level, no game knowledge
    physics.ts, input.ts   Rapier wrapper (layers, colliders, Character, queries); actions, bindings, glyphs
    director.ts, save.ts   game-time waits/tweens for scripts; save format, migrations, KeyValueStore, settings
    audio.ts, math.ts      sound effects + the song per mood; noise, easing, angles, seeded RNG
    music.ts, synth.ts, tracks.ts   music notation → events; synth + scheduler; the themes (DAY_SONGS picks the day song; the alternate is kept)
    midiFile.ts, midiImport.ts, valleyTheme.ts   MIDI reader; MIDI → notation (npm run midi); the owner's day theme arranged;
                           imported/ holds the generated notes (never edit)
  render/                  materials (shared/unique, static merging), shapes, characters, sky, particles
  world/
    area.ts, interior.ts   Area interface, Interactable, Trigger, AreaBuilder; MillInterior (Tobin's mill)
    objects.ts             Npc, Chest (padlockable), StoneDoor (asleep/awake), BushField, BossArena, HeartVessel, GreatLantern
    bell.ts, murmurbud.ts  BELL_IDS, BellPost, BellPickup; MurmurbudLook (hint bulb: swells, sulks, opens, floating note, wisp)
    platforming.ts         platform courses: PlatformDef/CourseDef, checkCourse (reachability), buildCourse (moving ledges)
    overworld/             Emberfield: layout (pure map), terrain, village, landmarks, nature, hollow, gorge, camp (Wayfarers' Camp,
                           the crossing, the Waybell), gate, region (RegionStreamer), northpass (the first region), index (Overworld)
    dungeon/               data format, validator, softlock solver, text map, DUNGEONS; defs/ the dungeons; build.ts + pieces.ts
                           (data → 3D Area); grid.ts + puzzle.ts (2 m grids, wakestone checker); landmarks.ts (statues);
                           hearth.ts (Gravelheart's arena, causeway, Heart Vessel); decor.ts (each wing's palette and light)
  game/
    game.ts                Game: owns systems, frame loop, modes, implements ScriptApi
    combat.ts, title.ts    lock-on, glove throw, hit feedback both ways, hit-stop; the title menu
    menu.ts, menuDriver.ts MenuStack (rows, submenus, toggles, body text); MenuDriver (input → menu → HUD), ChoiceMenu (api.choose)
    devMenu.ts, pauseMenu.ts   the dev menu (~ / L3); the pause menu (P / Start: the keepers' notes found)
    murmurbud.ts, buds.ts  a Murmurbud's rule (gauge, growth, overload); BudSystem (runs the area's buds, sounds, the gauge)
    script.ts              ScriptApi + Script + Page (the contract content uses)
    player.ts, guard.ts    Wren (movement, sword, shield, stagger); the shield's guard
    surf.ts                shield surfing's rule (when a ride starts and ends; SURF_SPEED)
    enemies.ts, hazards.ts Enemy, GroundEnemy, Thornling, Gloomwisp, EnemyManager; shockwaves/orbs
    sentinel.ts, shellback.ts, cragstalker.ts   the shrine's Dozing Sentinel and Shellback; the Northpass's Cragstalker
    boss.ts, bosses/       Boss base (phases, move system); the Hollow Lamplighter; gravelheart/ (rig, moves, the boss)
    lockon.ts, trialFalls.ts   what lock-on picks (enemies, closed buds: LockTarget); bell trials' fall rule
    flasks.ts              the two flasks (life / attack potion; drinking empties one, Odo refills it)
    camera.ts, dialog.ts (say + ask), pickups.ts, state.ts, debug.ts, enemyTestEnv.ts (enemy unit tests' stand-in game)
  content/                 the game's story; what things DO
    areas.ts, story.ts     createArea(id): builds an area and binds its content; intro, death
    overworld.ts           scripts for every overworld interactable/trigger, save restore
    mill.ts, shop.ts       Tobin's mill (bed, exit); offerWares, the shared buy menu (wares + Not now)
    bells.ts, hints.ts     bell registry (BELLS) + scripts; the keepers' notes (HINTS): reading one, restore, foundHints
    gorge.ts, northpass.ts the Hushing Gorge (monsters, fall rule); the canyon past the camp (Cragstalkers, fall rule)
    shrine.ts, gravelheart.ts  the Waking Shrine (chests, keys, doors, rooms, switches, exit); its boss encounter and the Seal vision
    devStates.ts, fakeApi.ts   dev-menu save states; the fake ScriptApi content tests run against
  ui/  hud.ts, style.css   DOM HUD: hearts, gems, keys, clock, prompt, gauges, dialog, cards, menus, title
scripts/
  smoke.mjs, look.mjs, browser.mjs   scenario smoke runner (smoke/ scenarios, fixtures/ saves); scene captures; shared helpers
  map.mjs                  text map + problems for a dungeon (npm run map -- <id>)
  midi-import.mjs          assets/music-src/<folder>/*.mid → src/core/imported/<folder>.ts (npm run midi -- <folder>)
assets/music-src/          the owner's MIDI exports, one folder per song (see docs/audio.md "Importing the owner's music")
docs/                      topic docs (table above)
CLAUDE.md, .claude/        Claude Code only: model/cost routing, agents/, skills/ (/start, /wrap)
```

## Commands

`npm run dev` (then `?debug`) · `npm run check` · `npm run smoke [-- <scenarios>]` · `npm run look -- <scenes>`
· `npm run map -- <dungeon id>` · `npm run midi -- <song folder>`. Details in [docs/testing.md](docs/testing.md).

## Design decisions (don't undo without asking)

- Web + Three.js + Rapier, not Unity/Godot (see [engine.md](docs/engine.md)).
- Kinematic character controller for the player, not a dynamic rigid body.
- Story is `async` scripts on game time, bound to world objects by id; world code never
  contains dialog or quest logic.
- Dungeons are data (`DungeonDef`) checked by a solver, not hand-placed geometry code.
- Static geometry is merged; anything that changes at runtime is `dynamic`.
- The camera passes through trees and fences (Prop) but pulls in for walls and terrain.
- Continue starts at the spawn of the area you saved in (a dungeon's entrance inside one),
  with at least 3 hearts.
- **The checkpoint rule** (a Souls-leaning choice, owner's call): dying sends Wren back to the
  area's start with full hearts; keys, items, opened chests and doors, pressed switches stay,
  but every enemy respawns. Flasks don't refill (only Odo fills them, for gems). Shortcuts
  matter because of it. Rooms stay cleared (their chests stay revealed).
- No map or compass (owner's call): dungeon chests hold keys, items, flasks (`game/flasks.ts`)
  and gems instead. Max hearts grow only from bosses (no heart chests in dungeons). Every interactable thing must serve
  a purpose (the puzzle checker fails a stone that doesn't).
- A dungeon's small keys are colored (one chest, one door each) and only open that dungeon's doors. Dungeons are never sealed: the
  entrance is an open doorway you can walk out of any time (owner's call, 2026-11-02; no
  fight-room shutters either). Progress gates are items and keys, e.g. the glove for the Northpass.
- Gamepad A doubles as interact and jump (context action button).
- **Bells** (the bonfires, owner's design): travel only, never healing (only a bed rests);
  each waits at the end of a platforming trial, where falls cost nothing.
- Enemies and the clock freeze during dialog and cutscenes; the clock also stands still indoors.
- The Hollow Lamplighter only appears at night (so its fight and theme are always night ones).
- The valley's songs share one tune (the day theme's motif; night reharmonizes it darker,
  the village plays it honky-tonk; see [docs/audio.md](docs/audio.md)). Death silences the
  music and fades to black before the respawn, so it feels like a game over, not a teleport.
- **One defensive system: the shield's guard.** No dodge roll, no stamina. Guard recovers
  only with the shield lowered; a guard break stops the hit but staggers Wren for 2 s.
- Bosses share one move system (windup/active/recover) with fairness rules; weak points
  are hurtboxes that come within reach only in certain poses.
- The arena seal is a World-layer wall: once sealed, the camera and projectiles stay in.

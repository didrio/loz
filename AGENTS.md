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

As of 2026-11-02: Emberfield (the valley) plays start to finish; the Hollow Lamplighter (night
only), the quest thread and all music are done. **The Waking Shrine** (25 rooms, four wings) is
playable up to the boss door ([docs/shrine.md](docs/shrine.md), milestones 1–5 done). Enemy
feel is untuned until the owner plays.
**Next: the owner's playtest tweak D, the village**, then E (flasks) and F (dungeon fixes) ([docs/roadmap.md](docs/roadmap.md), A–C done),
then shrine milestone 6 (Gravelheart and its music), 7 (the Northpass), 8 (polish).

## Docs: read the one for the area you're touching

| Doc | Read it before... |
|---|---|
| [docs/roadmap.md](docs/roadmap.md) | **starting any feature** (see "Before you start" below); what's next, the scaling checklist, tech debt |
| [docs/engine.md](docs/engine.md) | touching the frame loop, modes, areas, physics, input, scripts/cutscenes, saves; conventions |
| [docs/combat.md](docs/combat.md) | touching the sword, shield/guard, enemies, hazards or bosses (incl. boss fairness rules) |
| [docs/dungeons.md](docs/dungeons.md) | designing or building a dungeon (the data format, solver, text map) |
| [docs/shrine.md](docs/shrine.md) | working on the first dungeon: its design, item, enemies, boss, the Northpass gate, build plan |
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
    physics.ts             Rapier wrapper: layers, static colliders, Character, ray and sphere queries
    input.ts               actions (keyboard/mouse/gamepad), bindings, button glyphs
    director.ts            game-time waits/conditions/tweens for scripts (replaces setTimeout)
    save.ts                save format + migrations, validation, KeyValueStore, settings
    audio.ts               synthesized sound effects; picks the background song per mood
    music.ts, synth.ts, tracks.ts   music notation → events; synth + scheduler; the themes
    math.ts                noise, easing, angles, seeded RNG
  render/                  materials (shared/unique, static merging), shapes, characters, sky, particles
  world/
    area.ts                Area interface, Interactable, Trigger, AreaBuilder
    objects.ts             Npc, Chest (padlockable), StoneDoor (asleep/awake), BushField, BossArena, HeartVessel, GreatLantern
    overworld/             Emberfield: layout (pure map), terrain, village, landmarks, nature, hollow, index (Overworld)
    dungeon/               dungeon data format, validator, softlock solver, text map, DUNGEONS registry;
                           defs/ the dungeons; build.ts + pieces.ts turn the data into a 3D indoor Area;
                           grid.ts + puzzle.ts: rooms as 2 m grids, the wakestone puzzle checker;
                           landmarks.ts: the three big landmark statues;
                           decor.ts: each wing's palette, light and decoration
  game/
    game.ts                Game: owns systems, frame loop, modes, implements ScriptApi
    combat.ts, title.ts    lock-on, glove throw, hit feedback both ways, hit-stop; the title menu
    script.ts              ScriptApi + Script + Page (the contract content uses)
    player.ts, guard.ts    Wren (movement, sword, shield, stagger); the shield's guard
    enemies.ts, hazards.ts Enemy, GroundEnemy, Thornling, Gloomwisp, EnemyManager; shockwaves/orbs
    sentinel.ts, shellback.ts  the shrine's Dozing Sentinel and Shellback (on GroundEnemy)
    enemyTestEnv.ts        the stand-in game enemy unit tests run against
    boss.ts, bosses/       Boss base (phases, move system); the Hollow Lamplighter
    lockon.ts              which enemy lock-on picks (same level, in sight)
    drinks.ts              single-use drinks (found / left, refilled on death): Restoring Draught, Ember Tonic
    camera.ts, dialog.ts, pickups.ts, state.ts, debug.ts
  content/                 the game's story; what things DO
    areas.ts               createArea(id): builds an area and binds its content
    overworld.ts           scripts for every overworld interactable/trigger, save restore
    shrine.ts              the Waking Shrine: chests, keys, doors, cleared rooms, switches, the exit
    fakeApi.ts             the fake ScriptApi content tests run against
    story.ts               intro, death
  ui/  hud.ts, style.css   DOM HUD: hearts, gems, keys, clock, interact prompt, dialog, cards, title menu
scripts/
  smoke.mjs, look.mjs, browser.mjs   scenario smoke runner (smoke/ scenarios, fixtures/ saves); scene captures; shared helpers
  map.mjs                  text map + problems for a dungeon (npm run map -- <id>)
docs/                      topic docs (table above)
CLAUDE.md, .claude/        Claude Code only: model/cost routing, agents/ (scout, looker, builder,
                           architect), skills/ (/start, /wrap), settings.json
```

## Commands

`npm run dev` (then `?debug`) · `npm run check` · `npm run smoke [-- <scenarios>]` · `npm run look -- <scenes>`
· `npm run map -- <dungeon id>`. Details in [docs/testing.md](docs/testing.md).

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
  but every enemy respawns and every drink found refills. Shortcuts matter because of it.
  Rooms stay cleared (their chests stay revealed).
- No map or compass (owner's call): dungeon chests hold keys, items, drinks (single-use,
  refilled on death: `game/drinks.ts`) and gems instead. Every interactable thing must serve
  a purpose (the puzzle checker fails a stone that doesn't).
- A dungeon's small keys are colored (one chest, one door each) and only open that dungeon's doors. Dungeons are never sealed: the
  entrance is an open doorway you can walk out of any time (owner's call, 2026-11-02; no
  fight-room shutters either). Progress gates are items and keys, e.g. the glove for the Northpass.
- Gamepad A doubles as interact and jump (context action button).
- Enemies and the clock freeze during dialog and cutscenes; the clock also stands still indoors.
- The Hollow Lamplighter only appears at night (so its fight and theme are always night ones).
- The valley's songs share one tune (the day theme's motif; night reharmonizes it darker,
  the village plays it honky-tonk; see [docs/audio.md](docs/audio.md)). The owner retired
  the old Gmaj7 → Dmaj7 rule on 2026-11-02. Death silences the music and fades to black before the
  respawn, so it feels like a game over, not a teleport.
- No instrument/song mechanic. Progress gates are keys, items and boss outcomes; the
  shrine opens only after the Lamplighter falls.
- **One defensive system: the shield's guard.** No dodge roll, no stamina. Guard recovers
  only with the shield lowered; a guard break stops the hit but staggers Wren for 2 s.
- Bosses share one move system (windup/active/recover) with fairness rules; weak points
  are hurtboxes that come within reach only in certain poses.
- The arena seal is a World-layer wall: once sealed, the camera and projectiles stay in.

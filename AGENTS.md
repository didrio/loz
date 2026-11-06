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

As of 2026-11-05: Emberfield plays start to finish: a wordless start, the shield, the village, the Lamplighter, **the Waking Shrine** through
**Gravelheart** and the **prism**, which opens the gate to the Northpass and **Wayfarers' Camp**. Until then **the blight** lies on the valley (violet
**scars**, **thorn clumps** that 5 sword hits fell, 3 thornlings on the grove road); after it only Lark and Pip remain in the village. Text is terse and
tagged (`textRules.test.ts`); NPCs talk in **blips** (`core/blips.ts`); the speech synth is shelved (`labs/speech/`). **Touch controls** (phones and
tablets, landscape; [engine.md](docs/engine.md)) are being playtested by a friend on GitHub Pages (their first notes are fixed: hearts drawn as SVG, camera from the Shield finger while surfing, button labels; the first exit after the boss is noon).
**Next:** the first open ticket in [docs/tickets.md](docs/tickets.md). Dev server: port 5273.

## Docs: read the one for the area you're touching

| Doc | Read it before... |
|---|---|
| [docs/tickets.md](docs/tickets.md) | **starting work**: the open tickets in order, each with its Run line; how to write one |
| [docs/roadmap.md](docs/roadmap.md) | **writing a ticket**: the longer view, the scaling checklist, tech debt |
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
- **Art is primitives only** (boxes, cylinders, cones, spheres, flat colors; no imported models, textures or sprites).
  **Audio is synthesized in code** (no samples; all melodies original). The owner discloses the AI-generated code and writing on Steam.

## Working with the owner

- Fullstack (React) developer and long-time Ableton/keyboard producer, new to game dev terms: explain engine
  concepts in plain words (DAW/web-dev analogies help).
- They invite pushback: give an honest opinion, propose a simpler model when there is one, then build it and say
  where you deviated.
- **Done properly, but time and tokens matter** (owner, 2026-11-05): take the cheapest route that gets it right the
  first time. Read narrowly (the layout below names the files), one ticket per session, docs ready for a fresh session.
- **They play every change** (owner's call, 2026-11-05) and push back before moving on if something's off. Don't ask
  them to test, don't wait for results, don't mark work "unplayed". You still can't hear audio or judge feel: name
  what you couldn't verify in one line of the report (Definition of done 7), then move on.
- Commit or push only when asked, with one standing exception (owner's call, 2026-11-04): **`/wrap` commits and pushes to `main`** (see the wrap skill).
- **Guide them; they follow your lead on process.** End every reply that finishes a step
  with a short **Next for you** line saying exactly what to do: a command to type (`/wrap`,
  `/clear`, `/start T<n>`), a question to answer, or "nothing, I'm continuing". When the next
  step is a new ticket, give its **Run line** (mode · model · effort) as settings to switch to. Say so when a
  session has run long enough that `/clear` would save money.

## Text the player reads

Dialog, signs, item messages and toasts are designed, not filler: follow "Writing for the player" in
[docs/world.md](docs/world.md) (short, clear, in-voice, specific to Emberfield; NPCs react to time, progress and gear).

## Tickets

Work comes in **tickets** ([docs/tickets.md](docs/tickets.md)): one per session, a clear spec with a Run line
(mode · model · effort) and a Read-first list. The writer had the context, so trust it: read what it names, not
the whole repo. Whoever writes a ticket checks the **scaling checklist** ([docs/roadmap.md](docs/roadmap.md)) and
puts any fired item in it. Done tickets are deleted; their lasting facts go to the topic docs.

## Definition of done

Every change, even a "small" one (these caught a camera inside a tree, a frozen boss, Wren under the floor):

1. **Rules get tests.** A logic change gets a unit test next to its module that would fail
   without it. A bug gets **reproduced in a failing test first**, then fixed.
2. **`npm run check`** passes (lint, unit tests, typecheck, build).
3. **Gameplay or content changes: the smoke scenarios that cover it** pass (`npm run smoke -- <scenarios>`, 1–2 min);
   a new quest beat, boss or system gets a smoke step. The **full suite** (~3–6 min) only at a milestone's end or after
   touching shared systems (player, physics, camera, saves, game.ts), and **ask the owner first** (owner's call,
   2026-11-02; CI runs it on every push). [docs/testing.md](docs/testing.md) says which scenario covers what.
4. **Anything visible: look at it.** `npm run look -- <scenes>` (or a scratch Playwright script on
   `scripts/browser.mjs`), then check the screenshots; refactors: before and after. Dungeons: `npm run map -- <id>`.
5. **When a check fails, find out why before touching game code.** It may be the test
   (headless timing, knockback still settling) or a real bug.
6. **Update the docs** in the same change (this file: layout/rules; topic doc: details; roadmap: scaling items).
7. **Report plainly**: what you verified, what you couldn't (audio, feel, real GPU/gamepad), where you deviated.

## Architecture

Dependencies point one way: `core` ← `render` ← `world` ← `game` ← `content`.
`core` knows nothing about the game; `world` builds places but never decides what happens
in them; `content` (story, dialog, quest logic) binds behavior to world objects by id.

```
src/
  main.ts                  boot: init Rapier, create Game, expose window.embervale (dev/?debug)
  core/                    engine-level, no game knowledge
    physics.ts, input.ts   Rapier wrapper (layers, colliders, Character, queries); actions, bindings, glyphs
    touch.ts               touch controls' logic: fingers → stick, camera drag, buttons (pure)
    director.ts, save.ts   game-time waits/tweens for scripts; save format, migrations, KeyValueStore, settings
    audio.ts, math.ts      sound effects + the song per mood; noise, easing, angles, seeded RNG
    music.ts, synth.ts, tracks.ts   music notation → events; synth + scheduler; the themes (DAY_SONGS picks the day song; the alternate is kept)
    midiFile.ts, midiImport.ts, valleyTheme.ts   MIDI reader; MIDI → notation (npm run midi); the owner's day theme; imported/ (generated, never edit)
    blips.ts               talking blips: blipAt (letter → note, pure), BlipVoice presets, BlipPlayer, ROOMS
  render/                  materials (shared/unique, static merging), shapes, characters, sky (incl. the blight look), particles, motes (ash)
  world/
    area.ts                Area interface, Interactable, Trigger, AreaBuilder
    objects.ts             Npc, Chest (padlockable), StoneDoor (asleep/awake), HingedDoor (a house door), BushField, BossArena, HeartVessel, GreatLantern
    jars.ts, sigil.ts, bell.ts, murmurbud.ts   JarField (ruins' jars: gem/heart/empty, `jar.<id>` flags); SigilLook; BellPost, BellPickup; MurmurbudLook
    platforming.ts         platform courses: PlatformDef/CourseDef, checkCourse (reachability), buildCourse (moving ledges)
    overworld/             Emberfield: layout (pure map), terrain, village, landmarks, nature, hollow, gorge, camp (Wayfarers' Camp,
                           the crossing, the Waybell), ruins (ruined homes; the shield's cottage), blight (thorn clumps and thickets, thornTouch), gate, region (RegionStreamer), northpass (the first region), index (Overworld)
    dungeon/               data format, validator, softlock solver, text map, DUNGEONS; defs/ the dungeons; build.ts + pieces.ts
                           (data → 3D Area); grid.ts + puzzle.ts (2 m grids, wakestone checker); landmarks.ts (statues);
                           hearth.ts (Gravelheart's arena, causeway, Heart Vessel); prism.ts (the Keepers' Seal's prism); decor.ts (each wing's palette and light)
  game/
    game.ts, script.ts     Game: owns systems, frame loop, modes, implements ScriptApi; ScriptApi + Script + Page (content's contract)
    combat.ts, title.ts    lock-on, glove throw, hit feedback both ways, hit-stop; the title menu
    menu.ts, menuDriver.ts MenuStack (rows, submenus, toggles, body text); MenuDriver (input → menu → HUD), ChoiceMenu (api.choose)
    pauseMenu.ts           the pause menu (P / Start): tabs Settings, Hints, Messages, Dev (sprint, invincible, save states)
    murmurbud.ts, buds.ts  a Murmurbud's rule (gauge, growth, overload); BudSystem (runs the area's buds, sounds, the gauge)
    player.ts, guard.ts, surf.ts   Wren (movement, sword, shield, stagger); the shield's guard; surfing's rule
    lunge.ts               whether a swing's small step forward is allowed (not near thorns, ledges, signs, buds)
    enemies.ts, hazards.ts Enemy, GroundEnemy, Thornling, Gloomwisp, EnemyManager; shockwaves/orbs
    sentinel.ts, shellback.ts, cragstalker.ts   the shrine's Dozing Sentinel and Shellback; the Northpass's Cragstalker
    blight.ts              the blight's rules (where it lies, the lift, the strays, its songs, THORN_ATTACK)
    boss.ts, bosses/       Boss base (phases, move system); the Hollow Lamplighter; gravelheart/ (rig, moves, the boss)
    dungeonQuiet.ts        no music in a dungeon once its boss is beaten
    lockon.ts, trialFalls.ts, flasks.ts   what lock-on picks; bell trials' fall rule; the two flasks (Odo refills them)
    camera.ts, dialog.ts (say + ask), pickups.ts, state.ts, debug.ts, enemyTestEnv.ts (enemy unit tests' stand-in game)
  content/                 the game's story; what things DO
    areas.ts, story.ts     createArea(id): builds an area and binds its content; intro, death
    overworld.ts           scripts for every overworld interactable/trigger, save restore
    text/                  the player's words, one typed module per area or topic (`text/village.ts`: `V.maren.bell`; also `news`, `overworld`, `bells`, `hints`, `sigils`, `shrine`, `gravelheart`); scripts keep the logic
    voices.ts              who sounds like what (speaker → VoiceProfile + Delivery)
    village.ts, shop.ts    Thistledown: villagers, mill door and bed, locked cottages, Odo's stall, the opening, Pip's doll; offerWares (the buy menu)
    bells.ts, hints.ts     bell registry (BELLS) + scripts; the keepers' notes (HINTS): reading one, restore, foundHints
    sigils.ts, villageNews.ts   the sigils (SIGILS: texts, reading, foundSigils); villagers' one-time reactions (withNews)
    gorge.ts, northpass.ts the Hushing Gorge (monsters, fall rule); the canyon past the camp (Cragstalkers, fall rule)
    shrine.ts, gravelheart.ts  the Waking Shrine (chests, keys, doors, rooms, switches, exit); its boss encounter and the Seal vision
    devStates.ts, fakeApi.ts   the Dev tab's save states; the fake ScriptApi content tests run against
  ui/  hud.ts, style.css   DOM HUD: hearts, gems, keys, clock, prompt, gauges, dialog, cards, menus, title
       richText.ts          text tags `[gear]…[/]` → spans, tag checks (the content text rules test uses it)
       touch.ts             the on-screen controls (phones/tablets, landscape; detection, layout, rotate card)
       skyDial.ts, compass.ts   the clock's sky dial (sun and moon over the ground); the compass strip
scripts/
  smoke.mjs, look.mjs, browser.mjs   scenario smoke runner (smoke/ scenarios, fixtures/ saves); scene captures; shared helpers
  map.mjs, midi-import.mjs a dungeon's text map + problems (npm run map -- <id>); assets/music-src/<folder>/*.mid → src/core/imported/ (npm run midi)
  flags.mjs                who sets/reads each quest flag (npm run flags; game/flags.test.ts uses it)
  lexicon.mjs              the game's words → src/labs/speech/lexicon.ts from CMUdict (npm run lexicon)
src/dev/ the blips test bench (/blips.html, dev only) · src/labs/ the shelved speech synth (nothing imports it)
CREDITS.md third-party credits · assets/music-src/ the owner's MIDI exports, one folder per song (docs/audio.md)
docs/ (table above); CLAUDE.md, .claude/ (Claude Code only: model/cost routing, agents/, skills/ /start and /wrap)
```

## Commands

`npm run dev` (then `?debug`) · `npm run check` · `npm run smoke [-- <scenarios>]` · `npm run look -- <scenes>`
· `npm run map -- <dungeon id>` · `npm run midi -- <song folder>` · `npm run lexicon` · `npm run flags`. Details in [docs/testing.md](docs/testing.md).

## Design decisions (don't undo without asking)

- Web + Three.js + Rapier, not Unity/Godot (see [engine.md](docs/engine.md)).
- Kinematic character controller for the player, not a dynamic rigid body.
- Story is `async` scripts on game time, bound to world objects by id; world code never
  contains dialog or quest logic.
- Dungeons are data (`DungeonDef`) checked by a solver, not hand-placed geometry code.
- Static geometry is merged; anything that changes at runtime is `dynamic`.
- The camera passes through trees and fences (Prop) but pulls in for walls and terrain.
- Continue starts at the spawn of the area you saved in (a dungeon's entrance inside one), with at least 3 hearts.
- **The checkpoint rule** (owner's call): dying sends Wren back to the area's start with full hearts; keys, items, opened chests
  and doors, pressed switches and cleared rooms stay, but every enemy respawns (except in a beaten challenge room: one a chest or a sigil waits on). Flasks don't refill (only Odo fills them, for gems).
- No map or compass *items* (owner's call): dungeon chests hold keys, items, flasks (`game/flasks.ts`)
  and gems instead (the HUD's compass strip, which only shows heading, is fine: owner's call, 2026-11-04). Max hearts grow only from bosses (no heart chests in dungeons). Every interactable thing must serve
  a purpose (the puzzle checker fails a stone that doesn't).
- A dungeon's small keys are colored (one chest, one door each) and only open that dungeon's doors. Dungeons are never sealed
  (owner's call, 2026-11-02: an open entrance, no fight-room shutters); progress gates are items and keys.
- Gamepad A doubles as interact and jump (context action button).
- **Bells** (the bonfires, owner's design): travel only, never healing (only a bed rests);
  each waits at the end of a platforming trial, where falls cost nothing.
- **Story through NPC lines, not cutscenes** (owner's call, 2026-11-03, Dark Souls-style): the opening has no words; what
  happened comes from talking to people, whose lines change with progress. New story cutscenes only with the owner's OK.
- Enemies and the clock freeze during dialog and cutscenes; the clock also stands still indoors.
- The Hollow Lamplighter only appears at night (so its fight and theme are always night ones).
- The valley's songs share one tune (the day theme's motif; see [docs/audio.md](docs/audio.md)). Death silences the music and
  fades to black before the respawn, so it feels like a game over, not a teleport.
- **One defensive system: the shield's guard.** No dodge roll, no stamina. Guard recovers
  only with the shield lowered; a guard break stops the hit but staggers Wren for 2 s.
- Bosses share one move system (windup/active/recover) with fairness rules; weak points
  are hurtboxes that come within reach only in certain poses.
- The arena seal is a World-layer wall: once sealed, the camera and projectiles stay in.

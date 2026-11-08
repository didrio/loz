# AGENTS.md

Context for AI agents (and humans) working on this repo. This file is loaded into every session, so it stays **short**:
rules, where things are, and pointers. Details live in `docs/`. **Keep both current**: when behavior, a decision or the
file layout changes, update the matching doc in the same change.

## What we're building

**Embervale: Song of the Waking Shrine**: an original 3D action-adventure in the spirit of late-90s console adventures.
An open field around a village hub, dungeons with keys, switches and bosses, lock-on sword combat and a day/night cycle.
**N64 assets, modern presentation** (owner's call, 2026-11-07; [docs/art.md](docs/art.md)): chunky low-poly, flat-shaded and faceted (owner's call: not rounded),
small soft textures, fog, shown sharp and smooth; a little wistful. There is deliberately **no instrument/song-playing
mechanic** (removed as too close to a famous game; don't bring it back).

The goal is a **real, full-length game (10–15 hours, 50–100× today's content)**, sold for
$5–10 **on Steam** (desktop build via Electron) with a **free browser demo on itch.io**,
built almost entirely by AI agents. Build everything as if it will ship.

## Where things stand (current state only, ≤ 8 lines; history lives in git)

As of 2026-11-07: Emberfield plays start to finish: a wordless start, the shield, the village, the Lamplighter, **the Waking Shrine** through
**Gravelheart** and the **prism**, which opens the Northpass, **Wayfarers' Camp** and the Waybell. Until then **the blight** lies on the valley;
after it only Lark and Pip remain in the village. Every gate is data (`content/progression.ts`, checked by a test). Everything is built in code; the
look is flat-shaded and faceted (owner's call), colours snapped to one master palette and baked into vertices on merged scenery, generated crisp textures on everything but glows, glass, voids and writing (terrain, buildings, dungeons, trees, props, characters, enemies, bosses; a test guards the valley, Northpass and shrine; one global resolution slider in the Dev tab, default 32), and a Display setting (Native / Performance / N64). Sun shadows are a Settings option (**Shadows**, default On on desktop, Off on touch: one shadow map outdoors, `render/shadows.ts`; blob shadows remain indoors and for floating things), baked bounce light is a parked trial in the village (Dev toggle), and each place has its own atmosphere (`render/atmosphere.ts`), and the HUD corner shows the place's name and, in a dungeon, a rendered picture of it instead of the dial. NPCs talk in **blips**; **touch controls** are in a playtest on GitHub Pages; **Sallowmere** stands empty and untextured while the owner redesigns it.
**Next:** the **N64 look rebuild** of the starter zone ([art.md](docs/art.md), [pipeline.md](docs/pipeline.md)), foundations in [docs/tickets.md](docs/tickets.md): T35–T39 (the viewer and contact sheet, T34, are in). Every model is already a pure builder in `render/models/`, registered (all `rough`) and checked by a validator (`npm run assets`, [pipeline.md](docs/pipeline.md)). Dev server: port 5273.

## Docs: read the one for the area you're touching

| Doc | Read it before... |
|---|---|
| [docs/tickets.md](docs/tickets.md) | **starting work**: the open tickets in order, each with its Run line; how to write one |
| [docs/roadmap.md](docs/roadmap.md) | **writing a ticket**: the longer view, the scaling checklist, tech debt |
| [docs/art.md](docs/art.md) | making or changing **anything visible or audible**: the style bible (rendering rules, palette, budgets, display modes, UI, controls, golden set) |
| [docs/pipeline.md](docs/pipeline.md) | **adding or finishing any asset, room or area**: the Rough and Final passes, trigger phrases, the registry, viewer and kit |
| [docs/engine.md](docs/engine.md) | touching the frame loop, modes, areas, physics, input, scripts/cutscenes, saves; conventions |
| [docs/render.md](docs/render.md) | touching `render/`: shadows, Display modes, generated textures, model builders (file list) |
| [docs/combat.md](docs/combat.md) | touching the sword, shield/guard, enemies, hazards or bosses (incl. boss fairness rules) |
| [docs/dungeons.md](docs/dungeons.md) | designing or building a dungeon (the data format, solver, text map) |
| [docs/shrine.md](docs/shrine.md) | working on the first dungeon: its design, item, enemies, boss, the Northpass gate, build plan |
| [docs/sallowmere.md](docs/sallowmere.md) | working on the second region (drowned lowlands, Stiltwick) or its dungeon, the Old Weir (the Ember Lantern, the Lurelight) |
| [docs/models.md](docs/models.md) | thinking about imported, rigged character models (shelved; the kept tooling in `labs/rigged/`) |
| [docs/bells.md](docs/bells.md) | bell posts (bonfires), fast travel, bell trials and platforming: lore, rules, the recipe for a new bell site, build plan |
| [docs/world.md](docs/world.md) | writing dialog, quests, places, characters (world bible and the quest thread) |
| [docs/audio.md](docs/audio.md) | touching sound effects or music |
| [docs/testing.md](docs/testing.md) | verifying anything: smoke, look scenes, unit test patterns, debug tools |

## Hard rules

- **Original IP only.** Genre conventions are fine (lock-on targeting, hearts, gems, dungeons, small keys, a field hub,
  day/night). Never recreate a specific existing game's names, characters, story, map layout, music, sound effects,
  logos or UI design, and never use another franchise's names in code, text or marketing. If a request would recreate
  a specific game's content, do the original version and say so.
- **Art is built in code**: primitives (boxes, cylinders, cones, spheres) with textures **generated in code** (`render/textures.ts`, render.md "Textures").
  No imported models, images or sprites (owner's call, 2026-11-07, after a shelved experiment: [models.md](docs/models.md)).
  **Audio is synthesized in code** (no samples; all melodies original). The owner discloses the AI-generated code and writing on Steam.
- **Every new asset, room or area runs Rough → Final without being asked** ([pipeline.md](docs/pipeline.md)), and **a final pass
  never changes gameplay** (behaviour, hurtboxes, timings, layout, puzzles; ask first). Colours from the palette (`pal()`), models registered
  in `render/models/registry.ts` and in budget (`npm run assets`); check visuals in Native and N64 mode and on the contact sheet (`npm run look -- contact`).

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
- **Guide them; they follow your lead on process.** End every reply that finishes a step with a short **Next for you**
  line saying exactly what to do: a command to type (`/wrap`, `/clear`, `/start T<n>`), a question to answer, or "nothing,
  I'm continuing". When the next step is a new ticket, give its **Run line** (mode · model · effort) as settings to
  switch to. Say so when a session has run long enough that `/clear` would save money.

## Text the player reads

Dialog, signs, item messages and toasts are designed, not filler: follow "Writing for the player" in
[docs/world.md](docs/world.md) (short, clear, in-voice, specific to Emberfield; NPCs react to time, progress and gear).

## Tickets

Work comes in **tickets** ([docs/tickets.md](docs/tickets.md), which says how to write one): one per session, with a Run
line and a Read-first list. The writer had the context, so trust it: read what it names, not the whole repo.

## Definition of done

Every change, even a "small" one (these caught a camera inside a tree, a frozen boss, Wren under the floor):

1. **Rules get tests.** A logic change gets a unit test next to its module that would fail without it. A bug gets
   **reproduced in a failing test first**, then fixed.
2. **`npm run check`** passes (lint, unit tests, typecheck, build).
3. **Gameplay or content changes: the smoke scenarios that cover it** pass (`npm run smoke -- <scenarios>`, 1–2 min);
   a new quest beat, boss or system gets a smoke step. The **full suite** (~3–6 min) only at a milestone's end or after
   touching shared systems (player, physics, camera, saves, game.ts), and **ask the owner first** (owner's call,
   2026-11-02; CI runs it on every push). [docs/testing.md](docs/testing.md) says which scenario covers what.
4. **Anything visible: look at it.** `npm run look -- <scenes>` (or a scratch Playwright script on `scripts/browser.mjs`),
   then check the screenshots; refactors: before and after. Dungeons: `npm run map -- <id>`.
5. **When a check fails, find out why before touching game code.** It may be the test (headless timing, knockback
   still settling) or a real bug.
6. **Update the docs** in the same change (this file: layout/rules; topic doc: details; roadmap: scaling items).
7. **Report plainly**: what you verified, what you couldn't (audio, feel, real GPU/gamepad), where you deviated.

## Architecture

Dependencies point one way: `core` ← `render` ← `world` ← `game` ← `content`. `core` knows nothing about the game;
`world` builds places but never decides what happens in them; `content` (story, dialog, quest logic) binds behavior
to world objects by id.

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
  render/                  the look: palette (the master palette: `pal`, `snap`), materials, textures, shapes, effects, atmosphere, sky, shadows, retro (the Display modes), particles, motes, characters (`buildHumanoid`); every file: render.md "Render files"
    models/                every model as a pure builder (no physics, no game), `registry.ts` (id, kind, tier, `build()`), `validate.ts` (budgets, palette); docs/pipeline.md
  world/
    area.ts                Area interface, Interactable, Trigger, AreaBuilder
    objects.ts             Npc, Chest (padlockable), StoneDoor (asleep/awake), HingedDoor (a house door), BushField, BossArena, HeartVessel, GreatLantern
    jars.ts, sigil.ts, bell.ts, murmurbud.ts   JarField (ruins' jars: gem/heart/empty, `jar.<id>` flags); SigilLook; BellPost, BellPickup; MurmurbudLook
    platforming.ts         platform courses: PlatformDef/CourseDef, checkCourse (reachability), buildCourse (moving ledges)
    overworld/             the overworld: the valley, its landmarks, the streamed regions (Northpass, Sallowmere); files: engine.md "Overworld files"
    dungeon/               data format, validator, softlock solver, text map, DUNGEONS; defs/ the dungeons; build.ts + pieces.ts
                           (data → 3D Area); grid.ts + puzzle.ts (2 m grids, wakestone checker); landmarks.ts (statues);
                           hearth.ts (Gravelheart's arena, causeway, Heart Vessel); prism.ts (the Keepers' Seal's prism); decor.ts (each wing's palette and light)
  game/
    game.ts, script.ts     Game: owns systems, frame loop, modes, implements ScriptApi; ScriptApi + Script + Page (content's contract)
    combat.ts, title.ts    lock-on, glove throw, hit feedback both ways, hit-stop; the title menu
    menu.ts, menuDriver.ts MenuStack (rows, submenus, toggles, body text); MenuDriver (input → menu → HUD), ChoiceMenu (api.choose)
    pauseMenu.ts           the pause menu (P / Start): tabs Settings, Hints, Messages, Dev (sprint, invincible, save states)
    murmurbud.ts, buds.ts  a Murmurbud's rule (gauge, growth, overload); BudSystem (runs the area's buds, sounds, the gauge)
    player.ts, guard.ts, surf.ts, lunge.ts   Wren (movement, sword, shield, stagger); the guard; surfing; whether a swing may step forward
    enemies.ts, hazards.ts Enemy, GroundEnemy, Thornling, Gloomwisp, EnemyManager; shockwaves/orbs
    sentinel.ts, shellback.ts, cragstalker.ts   the shrine's Dozing Sentinel and Shellback; the Northpass's Cragstalker
    blight.ts              the blight's rules (where it lies, the lift, the strays, its songs, THORN_ATTACK)
    boss.ts, bosses/       Boss base (phases, move system); the Hollow Lamplighter; gravelheart/ (moves, the boss; its model is render/models/gravelheart.ts); dungeonQuiet.ts (no music once beaten)
    lockon.ts, trialFalls.ts, flasks.ts, water.ts   lock-on's pick; trials' fall rule; the two flasks; dry/shallow/deep at Wren's feet (WaterFalls)
    camera.ts, dialog.ts (say + ask), pickups.ts, state.ts, debug.ts, enemyTestEnv.ts (enemy unit tests' stand-in game)
  content/                 the game's story; what things DO
    areas.ts, story.ts, voices.ts   createArea(id): builds an area, binds its content; intro, death; speaker → VoiceProfile + Delivery
    overworld.ts           scripts for every overworld interactable/trigger, save restore
    text/                  the player's words, one typed module per area or topic (`text/village.ts`: `V.maren.bell`; also `news`, `overworld`, `bells`, `hints`, `sigils`, `shrine`, `gravelheart`); scripts keep the logic
    village.ts, shop.ts    Thistledown: villagers, mill door and bed, locked cottages, Odo's stall, the opening, Pip's doll; offerWares (the buy menu)
    bells.ts, hints.ts     bell registry (BELLS) + scripts; the keepers' notes (HINTS): reading one, restore, foundHints
    sigils.ts, villageNews.ts   the sigils (SIGILS: texts, reading, foundSigils); villagers' one-time reactions (withNews)
    gorge.ts, northpass.ts the Hushing Gorge (monsters, fall rule); the canyon past the camp (Cragstalkers, fall rule)
    shrine.ts, gravelheart.ts  the Waking Shrine (chests, keys, doors, rooms, switches, exit); its boss encounter and the Seal vision
    progression.ts         the world progression solver: every gate as data, a walk from a new save to the end (dungeons.md)
    devStates.ts, fakeApi.ts   the Dev tab's save states; the fake ScriptApi content tests run against
  ui/  hud.ts, style.css, richText.ts   DOM HUD (hearts, gems, keys, clock, prompt, gauges, dialog, cards, menus, title); text tags `[gear]…[/]`
       touch.ts, skyDial.ts, compass.ts   on-screen controls (phones/tablets); the clock's sky dial; the compass strip
scripts/
  smoke.mjs, look.mjs, browser.mjs   smoke runner (smoke/, fixtures/); look scenes (baselines + budgets: lookCompare.mjs); shared helpers, the look stepped clock
  map.mjs, midi-import.mjs a dungeon's text map + problems (npm run map -- <id>); assets/music-src/<folder>/*.mid → src/core/imported/ (npm run midi)
  flags.mjs, lexicon.mjs   who sets/reads each quest flag (npm run flags; flags.test.ts); the game's words → labs/speech/lexicon.ts (npm run lexicon)
  palette.mjs              hex literals still in code, by file, with their nearest swatch (npm run palette)
  assets.mjs               the model registry's table: triangles against budget, size, textures, findings (npm run assets)
src/dev/ the blips test bench (/blips.html), the swatch page (/palette.html) and the asset viewer + contact sheet (/viewer.html), dev only · src/labs/ shelved, nothing imports it: speech/ (a speech synth), rigged/ (imported rigged models, docs/models.md)
CREDITS.md third-party credits · assets/music-src/ the owner's MIDI exports, one folder per song (docs/audio.md)
docs/ (table above); CLAUDE.md, .claude/ (Claude Code only: model/cost routing, agents/, skills/ /start and /wrap)
```

## Commands

`npm run dev` (then `?debug`) · `npm run check` · `npm run smoke [-- <scenarios>]` · `npm run look -- <scenes>`
· `npm run map -- <dungeon id>` · `npm run midi -- <song folder>` · `npm run lexicon` · `npm run flags` · `npm run palette` · `npm run assets`. Details in [docs/testing.md](docs/testing.md).

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

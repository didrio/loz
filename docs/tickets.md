# Tickets

The open work, in run order. **One ticket = one session** (one context, then `/clear`).
A finished ticket is **deleted**, not struck through: git keeps the history, and what a
future agent needs to know goes into the topic docs at `/wrap`.

## Writing a ticket

The session that knows the most writes it: usually the one finishing a ticket (at `/wrap`)
or a planning session. Write it like a good engineering ticket: a clear spec, not an
implementation.

- **Size:** one session. If it's bigger, split it into parts (T7a, T7b), each leaving the
  game working and the checks green.
- **The what, not the how:** the goal, why it matters, and how we'll know it's done. Name
  decisions already made with the owner and hard constraints; leave the code design to the
  agent doing it.
- **Read first is the main cost saver.** The writer has the context, so point at the exact
  doc sections and files. The agent reads those to start and nothing else.
- **Run:** choose from "Choosing a ticket's Run line" in CLAUDE.md.
- **Scaling checklist:** check the triggers in [roadmap.md](roadmap.md) while writing; a fired
  item goes into the ticket's Notes, so the agent doing it needn't read the checklist.
- **Ids** are never reused (next free: **T40**). The order of this file is the run order; the
  owner reorders freely. An idea that isn't near yet is a line in roadmap.md, not a ticket.

```
### T<n>: <what gets done, imperative>
**Run:** <auto | plan> · <sonnet | opus | opusplan> · <medium | high | xhigh>
**Why:** the goal or the problem, in 1–3 sentences.
**Done when:** observable results, as bullets: what the player sees, or what a check proves.
**Read first:** doc sections and files; nothing more.
**Verify:** `npm run check`, plus the smoke scenarios and look scenes it touches.
**Notes:** (optional) decisions made, constraints, questions for the owner (ask them up front), fired checklist items.
```

## Open tickets

**The N64 look rebuild, foundations** (owner, 2026-11-07): [art.md](art.md) is the target, [pipeline.md](pipeline.md)
the workflow. These build the shared infrastructure; the golden set and the rebuild of everything else follow
([roadmap.md](roadmap.md) "The N64 look rebuild"), each written as a ticket when it's near. Behaviour never changes:
every NPC, quest, enemy, boss and puzzle plays exactly as before. Sallowmere waits for its redesign.

### T27: Make the look loop fast, then approve the "before" baselines
**Run:** auto · sonnet · high
**Why:** Every ticket ahead is visual, and `npm run look` takes ~16 min for the full run (~20 s a scene): it renders
with SwiftShader (on the CPU) one scene at a time. A fast loop pays back on every later ticket. The rebuild also needs a
full set of baselines as its "before" (only `sallowmere` has any).
**Done when:**
- A short measurement in testing.md: where one scene's time goes (Vite start, Chrome start, game boot, stepped frames,
  screenshot and compare).
- Locally, look renders on the real GPU (headless Chrome with ANGLE on Metal, or whatever measures fastest), with
  SwiftShader kept as the fallback and for CI (an env switch). Scenes run in parallel pages, bounded by the machine, as
  smoke does. Two runs on unchanged code still print "unchanged".
- One scene in about a minute or less, cold; the full run ≤ ~5 min (or the measured floor, explained).
- The Soft (720) retro pin in `openGame`'s `stepped` option is gone (the game's default is the look Off), and every scene is
  approved: `npm run look -- --approve`, baselines and budgets committed. The owner approved this full re-approve
  (2026-11-07, plan review).
- Baseline size decided and written down: about 30 re-approves are ahead at ~7.5 MB each, so shrink them further, store
  them more compactly, or keep them untracked (CI doesn't run look).
**Read first:** testing.md (Commands: look, baselines, stepped clock); `scripts/browser.mjs`; `scripts/look.mjs` (the
main loop at the end, ~line 1515; Grep for scene names rather than reading the 1,600 lines); `scripts/lookCompare.mjs`.
**Verify:** `npm run check`; `npm run look -- village dungeon` twice (unchanged the second time); one full run timed.
**Notes:** Try the GPU flag on smoke too; keep it only if it's faster and not flakier (CI runs Linux, no GPU). Known quirk:
the `ruins` scene's last two shots are black (roadmap.md tech debt). Find out why before approving them; if it's deep,
approve the rest and leave a note. Update roadmap.md's "Look baselines don't exist yet" item and testing.md's note
about the "polygon-count increase".

### T28: One Display setting: Native, Performance, N64
**Run:** auto · sonnet · medium
**Why:** art.md "Display modes": the two settings (Resolution, Retro look) become one with three options, and every later
visual ticket gets checked in Native and N64 mode.
**Done when:**
- Settings shows **Display**: Native (today's Native), Performance (pixel ratio capped around 1), N64 (the scene 240 rows
  tall, width from the window's aspect, upscaled with linear filtering, the 5-bit colour crush and Bayer dither kept,
  no bloom). Resolution and Retro look are gone; so are Balanced and `Sky.retro`'s warm haze.
- Default Native on desktop, Performance on touch devices. Old settings migrate (a retro look on → N64; Balanced or
  Performance → Performance; else Native), unit-tested next to the old migrations.
- The look runner can capture a scene in N64 mode (e.g. `--display n64`); `looker` compares Native and N64 on village,
  field and a dungeon scene.
- engine.md "The retro look" and "The pause menu" (Settings) rewritten; art.md "Display modes" moved to today.
**Read first:** art.md "Display modes"; engine.md "The retro look" and "The pause menu"; `render/retro.ts` and its test;
`core/save.ts` (`Settings`, the settings migration); `game/pauseMenu.ts`; Grep `game/game.ts` for `applySettings`.
**Verify:** `npm run check`; smoke `hints` (it changes a setting); look `title village dungeon touch` in both modes.

### T29: The palette
**Run:** plan · opusplan · high
**Why:** art.md "Palette": one master palette is what keeps everything one game, and the validator, vertex colours and
every final pass build on it. Today there are ~400 distinct hex literals.
**Done when:**
- `render/palette.ts`: ~24–32 named hues with a few shade steps each, plus sub-palettes per area (the valley, the
  village, the shrine's wings (adapt `THEMES` in `world/dungeon/decor.ts`), the hollow, the blight, the Northpass).
- `mat`, `surf`, `uniqueMat` and the terrain's paint snap any colour to the nearest swatch, so the whole game is on-palette
  at once with no call-site churn. Sky, fog and light keys are chosen from the palette but blend freely.
- A report (`npm run palette` or similar) lists the hex literals still in code by file; final passes replace them with names.
- The owner approved the palette on a swatch sheet plus look shots of the game snapped to it (before/after).
**Read first:** art.md "Palette" and "Rendering rules"; pipeline.md; `render/materials.ts`; `render/sky.ts` (the `KEYS`);
`world/dungeon/decor.ts`; Grep `world/overworld/terrain.ts` for its paint.
**Verify:** `npm run check` (palette unit tests: names unique, snapping deterministic); look on title, village, field,
night, shrine, hollow, blight, before and after.
**Notes:** Ask the owner up front: a starting mood (warmer or cooler than today, how saturated), and whether to show 2–3
palette candidates. Snapping changes every shot: re-approve baselines after sign-off.

### T30: N64 shading: vertex colours, smooth normals, soft textures
**Run:** auto · sonnet · high
**Why:** art.md "Rendering rules". Flat shading reads as modern low-poly indie, and one material per colour costs a draw
call per colour per cell (600–970 per scene today, far too many for phones).
**Done when:**
- `mergeStatic` bakes each mesh's palette colour into a vertex colour and buckets by kind (plain, each surface,
  emissive, transparent) instead of by colour. Draw calls before and after are in the report (village, shrine, field).
- Smooth shading by default (`flatShading` off); box corners and cylinder caps keep their hard edges; terrain gets smooth
  normals.
- Textures still sit right: the projection's per-face axis is its own attribute, no longer written into `normal`
  (`faceNormals`), so lighting can be smooth. Filtering is bilinear up close; density drops toward ~16 texels/m (judged
  by eye with `looker`; `TEXELS_PER_METRE`).
- A simple baked darkening at merge time: undersides and wall feet a shade darker.
- Budgets re-approved; engine.md "Textures" and the materials notes in "Conventions" rewritten.
**Read first:** art.md "Rendering rules" and "Budgets"; engine.md "Textures" and "Conventions"; `render/materials.ts`;
`render/textures.ts` (`applySurface`, `faceNormals`); Grep `world/overworld/terrain.ts` for its material and normals.
**Verify:** `npm run check`; look `village field shrine night hollow` before/after in Native and N64 mode; the budgets go
down, not up.
**Notes:** Dynamic objects (characters, doors) keep their own materials until their final passes (`bakeRig`, T35).
Hit-flash materials (`uniqueMat`) must keep working. If the shader fights twice, hand it to `architect` with the repro.

### T31: Atmosphere per area, and blob shadows
**Run:** auto · sonnet · high
**Why:** art.md: fog tinted to each area's mood is core to the look, and N64 characters stand on blob shadows, not
shadow maps (also cheaper on phones).
**Done when:**
- An area's atmosphere is data in one place: fog colour and reach, sky tint, light keys at a few times of day, its
  sub-palette, a mote preset. The day/night cycle blends between the area's keys; the blight and boss gloom stay as
  modifiers on top. The valley, the village, the shrine and the hollow have one each.
- Wren, NPCs, enemies, bosses and movable stones stand on blob shadows (`GroundShadow`); characters no longer cast
  shadow-map shadows.
- Look shots at dawn, noon, dusk and night in each defined area.
**Read first:** art.md "Rendering rules"; engine.md "Indoor areas"; `render/sky.ts`; `render/shapes.ts`
(`GroundShadow`); `render/motes.ts`; `world/dungeon/decor.ts` (room fog); `game/blight.ts` (Grep for the sky).
**Verify:** `npm run check`; look `field village night hollow shrine blight dungeon` in Native and N64 mode.
**Notes:** Ask the owner up front, with look shots of both: keep the sun's shadow map for scenery (shadows move with the
day), or drop it entirely (N64-authentic, cheaper on phones, with baked darkening instead).

### T32: Effects presets
**Run:** auto · sonnet · medium
**Why:** art.md "Effects": combat feedback should read the same across every enemy and weapon. Today there are 59
ad-hoc `burst(...)` calls.
**Done when:** named presets (hit spark, guard spark, death puff, dust kick, item sparkle, motes) and a sword slash trail
exist; every `burst` call site uses one; colours come from the palette; particle counts are capped.
**Read first:** art.md "Effects"; `render/particles.ts`; `render/shapes.ts` (`glow`); `render/motes.ts`; Grep `\.burst(`.
**Verify:** `npm run check`; smoke `combat shrine-enemies`; look `enemies boss guard orbs`.

### T33: Asset registry, pure model builders, validator
**Run:** auto · sonnet · high
**Why:** pipeline.md: agents need to know what exists, its tier and budget, and a check that fails off-palette or
over-budget work. That needs every model buildable on its own, without physics or a game.
**Done when:**
- Every model's geometry comes from a pure builder (no physics, no game) returning its root, named joints and its flash
  material(s). Split out of the constructors of the Thornling, Gloomwisp, Dozing Sentinel, Shellback and Cragstalker; the
  props in `world/objects.ts`; `buildHumanoid`; both bosses (Gravelheart's `rig.ts` already is one; the Lamplighter's
  model comes out of its 940-line file). Behaviour files keep stats, timings, attack sheets and hurtbox sizes; hurtboxes
  still ride joints. Suggested home: `render/models/`, so the dependency rule holds.
- A registry: id, kind (player, enemy, miniboss, boss, npc, prop, piece), tier (`rough` / `final`), `build()`. Every model is
  in it, all `rough` for now.
- The validator is a unit test in `npm run check`: it builds every entry in Node and checks triangles against art.md's
  budget for its kind, authored colours on the palette, textures ≤ 64 px (the ground tile excepted), shared materials
  only, and a sane bounding box. Violations only warn for `rough` and fail for `final`. `npm run assets` prints the table.
- pipeline.md "The registry and validator" rewritten; `/add-enemy` and `/add-npc` register new models as rough.
**Read first:** pipeline.md; art.md "Budgets"; `game/enemies.ts` (the `Enemy`/`GroundEnemy` constructors, ~line 77–290);
`game/sentinel.ts` (a typical model-in-constructor); `game/bosses/gravelheart/rig.ts` (the target shape); `world/objects.ts`;
`render/characters.ts`; `.claude/skills/add-enemy/`, `add-npc/`.
**Verify:** `npm run check`; smoke `shrine-enemies combat shrine-boss full` (ask before `full`: it touches shared systems
only lightly); look `enemies boss gravelheart village` print **unchanged** (a refactor).
**Notes:** Big. If it runs long, stop at a clean point: T33a the registry, validator, props and humanoid; T33b the
enemies and bosses. **Scaling checklist fired** ("AGENTS.md's layout tree at scale"): AGENTS.md is over 200 lines, so
when `render/models/` joins the tree, give the busiest folders one line each and move their file lists to topic docs.

### T34: Viewer, contact sheet, dev shortcuts
**Run:** auto · sonnet · medium
**Why:** pipeline.md: the owner and the agent reach any test case in seconds, and outliers jump out of one image.
**Done when:**
- Dev-only `/viewer.html?asset=<id>` (like `/blips.html`): one registered asset on a turntable under the game's light and
  fog, a time-of-day slider, its poses or moves to play, a hurtbox overlay, Native/N64.
- A `contact` look scene: every registered asset side by side at one scale, the golden set marked.
- `?state=<dev state id>` boots straight into a Dev tab save state; `embervale.spawn(id, x, z)` spawns a registered
  enemy; `?debug`'s wireframe also draws hurtboxes.
- pipeline.md "The viewer, contact sheet and dev shortcuts" and testing.md "Debugging in the browser" rewritten.
**Read first:** pipeline.md; testing.md "Debugging in the browser"; `blips.html` and `src/dev/blips.ts` (the dev page
pattern); the registry from T33; `content/devStates.ts`; `game/debug.ts`; `src/main.ts`.
**Verify:** `npm run check`; `npm run look -- contact`; open the viewer on two assets (`looker`).

### T35: The modeling kit, proven on the chest
**Run:** auto · sonnet · high
**Why:** pipeline.md: every final pass builds from one toolkit, so the style is consistent for free.
**Done when:**
- Kit builders, seeded and returning vertex-coloured geometry: beveled box, tapered limb, capsule, low-segment sphere,
  lathe, extrude along a path, mirror, merge, crease-angle normals, palette region paint, crevice and underside
  darkening, a triangle counter. Unit-tested (determinism, triangle counts, colours on the palette).
- `bakeRig`: merges each joint's parts into one mesh with one material whose hit flash is a uniform, replacing
  `flashMats` lists for models that use it.
- The chest rebuilt with the kit (same size, lid hinge and interaction), registered as `final` once the owner approves
  it (a golden-set candidate).
- pipeline.md "The modeling kit" holds the reference: each builder with a one-line example and two recipes.
**Read first:** pipeline.md; art.md "Shape language" and "Budgets"; `render/shapes.ts`; `render/materials.ts`; the
registry from T33; `world/objects.ts` (`Chest`).
**Verify:** `npm run check`; smoke `full` covers a chest (ask first) or the shrine scenarios that open one; look `chest`
in Native and N64 mode, and the contact sheet.

### T36: The N64 sound chain
**Run:** auto · sonnet · medium
**Why:** art.md "Audio": the era's playback character on what we already compose, without touching a song.
**Done when:**
- Music and effects pass through a master chain: a lower effective sample rate, a gentle low-pass, a cap on simultaneous
  notes; reverb per area (fields drier, caves and dungeons wetter), reusing `Area.voiceRoom` and `ROOMS`.
- A dev bench (like `/blips.html`) plays the songs and a few effects through the chain with sliders and "Copy values",
  so the owner tunes it by ear.
- Songs and instruments unchanged; audio.md updated.
**Read first:** art.md "Audio"; audio.md; `core/synth.ts` (`MusicPlayer`, the reverb); Grep `core/audio.ts` for the
master gain and `Sfx`; `core/blips.ts` (`ROOMS`).
**Verify:** `npm run check` (render a song offline and check its level against today's); the owner listens.

### T37: Touch controls, refined
**Run:** auto · sonnet · high
**Why:** art.md "Mobile controls": an interact button of its own, so a nearby sign never turns a jump into a read.
**Done when:**
- Interact is its own button that appears only when something is usable, always in the same spot (up-left of Sword,
  between Shield and Lock), shows its verb and animates in; with several in reach it picks the one most in front.
- Jump is only jump, on the outer ring up-left of the cluster; the glove on the outer ring's upper part; the menu button
  top-left with the hearts.
- On touch, lock-on moves to the next enemy when its target dies, and an unlocked swing turns lightly toward the nearest
  enemy in front.
- Hit areas ≥ ~44 pt, bigger than the drawn buttons, spaced against mis-taps.
- Gamepad and keyboard unchanged (A stays interact + jump). engine.md "Touch controls" rewritten.
**Read first:** art.md "Mobile controls"; engine.md "Touch controls"; `ui/touch.ts`; `core/touch.ts` and its test;
`game/combat.ts` (lock-on, ~line 60–90); `game/lockon.ts`.
**Verify:** `npm run check`; smoke `touch`; look `touch`.
**Notes:** Styling waits for T38.

### T38: The period UI
**Run:** plan · opusplan · high
**Why:** art.md "UI": modern structure, period surface; a menu screenshot should pass for a late-90s game and stay
readable on a phone.
**Done when:**
- The owner chose the approach on mockups. The recommendation: keep the DOM HUD and give it the period surface with CSS
  (gradients, bevels, translucent tinted boxes, outlined or shadowed text, palette colours) plus a font authored in code
  (glyphs as data made into a real font at runtime with `FontFace`). The alternative from the proposal: a 640×480 canvas
  upscaled with smoothing (blurry text, a rewrite of hit-testing, menus, rich text and typing).
- Built: the base styles and font, the HUD, the dialog box and choice window, prompts, the touch buttons' styling.
  Readable on a phone (look `touch`); the title and pause menu follow in the UI pass (roadmap.md).
**Read first:** art.md "UI"; `ui/hud.ts` (Grep for the method you need; it's 626 lines); `ui/style.css`;
`ui/richText.ts`; `ui/touch.ts`.
**Verify:** `npm run check`; look `hud text choice touch title` in Native and N64 mode; smoke `touch hints village`.
**Notes:** Ask the owner up front: font mood (rounded sans as proposed?), how garish, and which of the two approaches
after seeing a mockup of each on the dialog box.

### T39: Gear tab, with icons rendered from the models
**Run:** auto · sonnet · medium
**Why:** art.md "Items and the pause screen": a read-only answer to "what do I have?", with era icons drawn from the
real 3D models.
**Done when:**
- Icons rendered offscreen from registered models at boot and cached: sword, shield, tunic, glove, the flasks, the bells,
  keys, Pip's doll. The HUD's flask and glove icons use them.
- A **Gear** tab in the pause menu, read-only: sword and shield, tunic, items, quest items, bells, the current dungeon's
  keys. No map.
- engine.md "The pause menu" updated.
**Read first:** art.md "Items and the pause screen"; engine.md "The pause menu"; `game/pauseMenu.ts`; `game/menu.ts`
(the `entry` row); the registry (T33); `game/state.ts` (items, flasks, bells).
**Verify:** `npm run check`; smoke `hints dev-menu`; look `hud` plus a pause-menu shot of the tab.

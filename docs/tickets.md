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
- **Ids** are never reused (next free: **T48**). The order of this file is the run order; the
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

### T44: The boss look scene's howl shot renders black
**Run:** auto · sonnet · medium
**Why:** `npm run look -- boss` gives an all-black `boss-howl` frame (HUD only; the baseline shows the Lamplighter mid-howl). It
is the same on HEAD without T32, so it predates the effects work (probably the texture commits). The boss baselines are stale
and weren't approved.
**Done when:** `boss-howl` shows the howl again, and `npm run look -- boss --approve` goes in the commit.
**Read first:** `scripts/look.mjs` (the `boss` scene), `game/bosses/lamplighter.ts` (the howl, Grep `howl`).
**Verify:** `npm run check`; look `boss`.

### T46: Sun shadows, a Display toggle
**Run:** auto · sonnet · high
**Why:** the owner (2026-11-07) wants nicer lighting while keeping the N64 look: real sun shadows on top of the baked light,
reversing T31's "no shadow maps" as an option. Houses, trees and Wren cast shadows that turn with the time of day.
**Done when:**
- A Settings row "Shadows: Off / On" (saved with the other settings; default On on desktop, Off on touch devices).
- On: the sun (and the moon at night, dimmer) casts one shadow map that follows Wren; static scenery, trees, characters,
  enemies and bosses cast; the ground and scenery receive. No shadow acne or floating shadows on the faceted surfaces.
- With shadows on, the blob shadows are hidden where a real shadow does their job (characters in the sun), kept indoors and in
  dungeons. Off: everything exactly as today.
- N64 mode looks right: the shadow's edge is crisp and a little blocky, like the rest of the frame, not soft-blurred.
- Within the draw-call and frame budgets (art.md "Budgets"); the cost of On is noted in art.md.
**Read first:** art.md "Rendering rules" (the Shadows row) and "Budgets"; `render/sky.ts` (the sun, `DirectionalLight`);
`render/retro.ts`; `game/game.ts` (Grep `renderer` for setup); `core/save.ts` (Settings); `game/pauseMenu.ts` (settingsRows);
`render/shapes.ts` (Grep `GroundShadow`).
**Verify:** `npm run check`; look `village` and a dungeon scene with shadows on and off, Native and N64; draw calls in budget.
**Notes:** Update art.md's Shadows row (owner's call, 2026-11-07: shadows are back as an option).

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

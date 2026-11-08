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
- **Ids** are never reused (next free: **T59**). The order of this file is the run order; the
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

**The golden set** (owner, 2026-11-08; [roadmap.md](roadmap.md) "The N64 look rebuild" step 2): each is a Final pass, in this order, locked only when the owner approves. Written ahead at the owner's request: when starting one, re-read it against what the previous one taught.

### T49: Final pass: the Thornling (golden set 1)
**Run:** plan · opusplan · high
**Why:** The common enemy is the cheapest place to shake out the enemy side of the pipeline and set the style every other creature follows.
**Done when:**
- Idle life, anticipation before the lunge, overshoot and settle, a hit reaction and a death, with the active frames' timings unchanged.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** src/render/models/thornling.ts, game/enemies.ts (Thornling), combat.md (its attack sheet); pipeline.md "Final pass", "The rig convention" and "The modeling kit"; art.md "The golden set" and the style rules; the model's file in `render/models/` and its behaviour file; `render/models/props.ts` `buildChest` (the approved example of the kit).
**Verify:** `npm run check` (the validator fails a final asset's findings); the unit tests and smoke scenarios for it pass **unchanged**; `npm run look -- contact` and the asset viewer in Native and N64 mode, before and after (looker). smoke `shrine-enemies`.
**Notes:** After this, write the `/final-pass` skill (CLAUDE.md: a recipe the second time; do it after T50).

### T50: Final pass: Wren with her full animation set (golden set 2)
**Run:** plan · opusplan · high
**Why:** The hero is the model the player looks at most; her animation set (idle, run, sword swing, guard, hurt, death, surf, glove throw) defines how characters move.
**Done when:**
- Every state of the rig convention has a pose; the shared humanoid (`buildHumanoid`, `render/characters.ts`) keeps NPCs working. Then write the `/final-pass` skill.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** render/models/wren.ts, render/characters.ts, game/player.ts (grep the pose code, big file); pipeline.md "Final pass", "The rig convention" and "The modeling kit"; art.md "The golden set" and the style rules; the model's file in `render/models/` and its behaviour file; `render/models/props.ts` `buildChest` (the approved example of the kit).
**Verify:** `npm run check` (the validator fails a final asset's findings); the unit tests and smoke scenarios for it pass **unchanged**; `npm run look -- contact` and the asset viewer in Native and N64 mode, before and after (looker). smoke `field-sword hints`; the full suite only after asking the owner (player is a shared system).
**Notes:** The player's sword and shield materials are unique and recoloured by the game; keep them.

### T51: Final pass: the starter-area entrance vignette (golden set 3)
**Run:** plan · opusplan · high
**Why:** One composed view (the village approach or the grove) proves the environment style: textures, props, atmosphere and light together, and phone frame rate.
**Done when:**
- One vignette chosen with the owner, rebuilt as a Final-pass area (sub-palette, set dressing, atmosphere, merged statics); layout and collision frozen (`npm run map` unchanged where it applies); a phone performance check noted.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** pipeline.md "Rooms and areas"; art.md atmosphere and budgets; the area's file under `world/overworld/`; engine.md "Areas".
**Verify:** `npm run check`; smoke for the area; look scenes for it, Native and N64, before and after.
**Notes:** Ask the owner up front which vignette. Do T48 (baked light) first: its verdict changes how the area is lit.

### T52: Final pass: the prop set, rest of it (golden set 4)
**Run:** auto · sonnet · high
**Why:** The chest is approved; the door, jar, crate and sign finish the props that make any room look like a room.
**Done when:**
- Hinged door, stone door, jar, crate and sign as final builders in `render/models/props.ts` (split the file if it passes ~400 lines), matching the chest.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** props.ts `buildChest`, world/objects.ts and world/jars.ts (placement and joints used)
**Verify:** `npm run check`; smoke `village jars shrine-keys`; contact sheet before and after.
**Notes:** A crate and a sign may not exist as models yet: add them as rough first (the pipeline) only if something already places them; otherwise skip and say so.

### T53: Final pass: Pip, the NPC (golden set 5)
**Run:** plan · opusplan · high
**Why:** One NPC on the shared humanoid shows how every villager gets finished; groups follow.
**Done when:**
- Pip's look by colours, proportions and a readable face and prop; her idle life; the humanoid's changes keep every other NPC working.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** render/characters.ts, render/models/wren.ts `buildPerson`, content/village.ts (Pip); pipeline.md "Final pass", "The rig convention" and "The modeling kit"; art.md "The golden set" and the style rules; the model's file in `render/models/` and its behaviour file; `render/models/props.ts` `buildChest` (the approved example of the kit).
**Verify:** `npm run check` (the validator fails a final asset's findings); the unit tests and smoke scenarios for it pass **unchanged**; `npm run look -- contact` and the asset viewer in Native and N64 mode, before and after (looker). smoke `village`.

### T54: Final pass: the Hollow Lamplighter (golden set 6)
**Run:** plan · opusplan · high
**Why:** The first boss, at about twice its mini-boss budget today: finish it and bring it into budget.
**Done when:**
- Under 2500 triangles, `bakeRig` used, its `Pose` data separate from the geometry.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** render/models/lamplighter.ts; game/bosses/lamplighter.ts (Grep `Pose`, then read ranges; the file is big); combat.md boss fairness rules; pipeline.md "Final pass", "The rig convention" and "The modeling kit"; art.md "The golden set" and the style rules; the model's file in `render/models/` and its behaviour file; `render/models/props.ts` `buildChest` (the approved example of the kit).
**Verify:** `npm run check` (the validator fails a final asset's findings); the unit tests and smoke scenarios for it pass **unchanged**; `npm run look -- contact` and the asset viewer in Native and N64 mode, before and after (looker). smoke for the Lamplighter fight.

### T55: Final pass: Gravelheart (golden set 7)
**Run:** plan · opusplan · high
**Why:** The shrine's boss, built on the move system; the finished boss pair sets the bar for every later boss.
**Done when:**
- Within the 4000 triangle boss budget; weak-point hurtboxes and poses unchanged.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** render/models/gravelheart.ts; game/bosses/gravelheart/; combat.md; pipeline.md "Final pass", "The rig convention" and "The modeling kit"; art.md "The golden set" and the style rules; the model's file in `render/models/` and its behaviour file; `render/models/props.ts` `buildChest` (the approved example of the kit).
**Verify:** `npm run check` (the validator fails a final asset's findings); the unit tests and smoke scenarios for it pass **unchanged**; `npm run look -- contact` and the asset viewer in Native and N64 mode, before and after (looker). smoke `gravelheart`.

### T56: Final pass: one shrine room (golden set 8)
**Run:** plan · opusplan · high
**Why:** Rooms get the style by one example: a shrine room with its dressing, palette, light and particles, puzzles untouched.
**Done when:**
- One room chosen with the owner; layout, switches and puzzle logic frozen (`npm run map -- shrine` unchanged); phone performance noted.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** pipeline.md "Rooms and areas"; shrine.md; dungeons.md; world/dungeon/decor.ts, build.ts (Grep, then ranges)
**Verify:** `npm run check`; smoke `shrine-keys shrine-glove`; `npm run map -- shrine`; look scenes before and after.
**Notes:** Ask the owner up front which room.

### T58: Measure and cut the phone's frame cost (Native, shadows, baked light)
**Run:** auto · opus · high
**Why:** On the owner's phone, Native with Shadows and baked light on plays poorly, and Performance (pixel ratio 1) looks noticeably worse, so most players will want Native. A first blind pass cut Native to 2× on touch, no multisampling there and a 1024 shadow map; nobody has measured what it bought or where the rest goes.
**Done when:**
- A dev-only frame readout (`?debug` or the Dev tab): ms per frame, draw calls and triangles (`renderer.info`), the pixel ratio and shadow map in use, so the owner can read real numbers off the phone.
- With it, Native + Shadows + baked light on a phone-sized viewport is profiled; the top costs are named (shadow pass over the merged static chunks, fill rate, overdraw from fog/transparent layers, baked-light shader work, anything per-frame in JS).
- The biggest cheap wins are done, with before/after numbers, and the look unchanged (looker, Native and N64); what's left is a line in roadmap.md.
**Read first:** render.md "Display modes" and shadows; `render/shadows.ts`, `render/retro.ts`; `game/game.ts` (`frame`, `resize`; Grep, then ranges)
**Verify:** `npm run check`; smoke `touch`; look scenes before and after.
**Notes:** Already done: Native on touch capped at 2× (`pixelRatioFor`), antialias off on dense touch screens (`Game` constructor), shadow map 1024 on touch (`shadowMapSize`). Undecided: a "Resolution scale" slider between Performance (1) and Native, so the owner picks the trade.

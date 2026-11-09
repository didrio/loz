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
- **Every later final pass:** follow `/final-pass` (`.claude/skills/final-pass/SKILL.md`).
- **"The behaviour file untouched"** in every ticket below means (owner's call, 2026-11-08, T49): its posing lines move into the model's rig (pipeline.md "The rig convention", the Thornling as example) and the behaviour file then only hands the rig its state; stats, timings, AI and hurtboxes stay byte-identical, and the existing tests pass unedited.
- **Renders:** before touching the model, add a look scene for it (like `thornling`: in-game states, then the viewer with `angle=0/45/90`) and capture it in Native and `--display n64`. Copy the shots to the scratchpad as the "before" set.

**The entrance vignette (golden set 3), owner's calls (2026-11-08, T51's plan):** the vignette is **Thistledown's road in** (the road from the field through the southeast fence gap to the square; the `village` look shot's frame, standing at -50,-42 facing the well). The final **tree, pine, rock and grass replace the rough ones valley-wide at once** (same placement, same `rand()` sequence, same colliders). **Baked light stays as is.** Cottages get **gable roofs with deep eaves** (walls, footprint and colliders unchanged). Three parts, each leaving the game working; the lock comes after T51c on the owner's approval.
- **Kit scenery in the merge:** `mergeStatic` (`render/materials.ts`) drops every attribute but position and normal, so before T51a a kit-painted model in `b.staticGroup` would lose its colours. `kitMat(surface)` *is* `bakedMat(surface, 0)`, so kit meshes join the same merge buckets (no new draw calls) once the merge keeps their `color` and gives them the plain meshes' `BAKED_SHADE` (multiplied in, plus `shade` for the light bake). So **scenery pieces skip `crevice`** (the merge shades them); standalone props keep it.
- **Layout frozen** is proven by `world/overworld/colliders.test.ts` (every collider of the overworld, Thistledown's listed one by one): it must pass unedited after each part.
- **Done so far (T51c):** the mill (outside, door frame, lamp bracket, axle), its sails (hub moved 0.35 m out so the lowest tip clears the wall and the lintel), Odo's stall and every ruined home are final (`render/models/mill.ts`, `ruins.ts`; pipeline.md "Scenery buildings"); colliders, `MILL_TOWER`, `MILL_BED`, jars and flags untouched. Phone check is in art.md "Budgets" (about +3% triangles, 22 fewer draw calls in the village). New look scene `vignetteModels` (both cottages, the mill, sails, stall and a ruin from the front, three-quarter and side). Baselines approved for `vignetteModels`, `mill`, `villageDetails`, `vignette`, `village`, `ruins`, `opening`, `contact`, `bake` (Native and N64); look budgets re-set for `ruins`, `opening`, `contact` (the new pieces cost triangles). The vignette is **locked into the golden set** (owner approved, 2026-11-08). The other outdoor scenes still show "changed" from the new buildings: approve each as you run and review it.
- **Done so far (T51b):** Thistledown's two cottages (gable roofs, deep eaves, timber gables, tapered chimneys, each house's touches), the well, the fence, the lantern post, the barrel and the crate are final (`render/models/village.ts`, pipeline.md "Scenery buildings"); `piece` budget 3,000. The glowing panes and lantern cores stay the world's own. Look baselines approved (Native and N64) for `vignette`, `village`, `villageDetails`, `contact`, `mill`; `villageDetails` is at 258,808 / 259,000 triangles in its budget. The village atmosphere was left as it is (the frame already reads warm); no day motes.
- **Done so far (T51a):** the valley's nature is final (`render/models/nature.ts`, pipeline.md "Instanced nature"), the merge keeps kit paint, the `vignette` look scene exists. Look baselines approved for `vignette`, `field`, `grove`, `village`, `contact`; every other outdoor scene still shows "changed" from the new trees and grass (atmosphere, blight, thorns, opening, ruins, bake, ...): approve each as you run and review it.

### T52: Final pass: the prop set, rest of it (golden set 4)
**Run:** auto · sonnet · high
**Why:** The chest is approved; the door, jar, crate and sign finish the props that make any room look like a room.
**Done when:**
- Hinged door, stone door, jar, crate and sign as final builders in `render/models/props.ts` (split the file if it passes ~400 lines), matching the chest.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** props.ts `buildChest`, world/objects.ts and world/jars.ts (placement and joints used)
**Verify:** `npm run check`; smoke `village jars shrine-keys`; contact sheet before and after.
**Notes:** The crate is done in T51b (`buildCrate`, `render/models/village.ts`). A sign may not exist as a model yet: add it as rough first (the pipeline) only if something already places it; otherwise skip and say so.

### T53: Final pass: Pip, the NPC (golden set 5)
**Run:** plan · opusplan · high
**Why:** One NPC on the shared humanoid shows how every villager gets finished; groups follow.
**Done when:**
- Pip's look by colours, proportions and a readable face and prop; her idle life; the humanoid's changes keep every other NPC working.
- `tier: 'final'` in the registry; within budget; every colour a `pal()` name; built with the kit and `bakeRig`; the behaviour file untouched in the diff (silhouette, scale, joints, hurtboxes, timings frozen; ask the owner first if one must change).
- Before/after renders (front, three-quarter, side, one in-game, Native and N64) shown to the owner. **Locked into the golden set (`GOLDEN_SET`, art.md's list with its reference renders) only when the owner approves.**
**Read first:** render/characters.ts, render/models/wren.ts `buildPerson`, content/village.ts (Pip); pipeline.md "Final pass", "The rig convention" and "The modeling kit"; art.md "The golden set" and the style rules; the model's file in `render/models/` and its behaviour file; `render/models/props.ts` `buildChest` (the approved example of the kit).
**Verify:** `npm run check` (the validator fails a final asset's findings); the unit tests and smoke scenarios for it pass **unchanged**; `npm run look -- contact` and the asset viewer in Native and N64 mode, before and after (looker). smoke `village`.
**Notes:** Wren (T50) left `buildHumanoid` alone and got their own kit builder. Build the new NPC body from Wren's pieces and rig (proportions, mitten hands, cuffed boots, the geometry face, the blink and idle breathing in `WrenRig`) rather than a second design, so the cast matches; every NPC still poses inline in `world/objects.ts` `Npc`, which then hands a small rig its state.

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
**Notes:** The valley's final nature (T51a) added ~40k triangles a scene (instanced trees ~120 each, ~3,200 three-blade tufts); its approval reset the look budgets on top of that (the grove 193k → 234k): a cheaper far tree (an LOD) or fewer tufts are candidates. Already done: Native on touch capped at 2× (`pixelRatioFor`), antialias off on dense touch screens (`Game` constructor), shadow map 1024 on touch (`shadowMapSize`). Undecided: a "Resolution scale" slider between Performance (1) and Native, so the owner picks the trade.

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
- **Ids** are never reused (next free: **T69**). The order of this file is the run order; the
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
- **Every later final pass:** follow `/final-pass` (`.claude/skills/final-pass/SKILL.md`). **No surface one flat colour** (owner, 2026-11-08, T53; art.md "Rendering rules" → Textures): every kit mesh names a surface tile, and the big forms get the kit's `gradient`.
- **"The behaviour file untouched"** in every ticket below means (owner's call, 2026-11-08, T49): its posing lines move into the model's rig (pipeline.md "The rig convention", the Thornling as example) and the behaviour file then only hands the rig its state; stats, timings, AI and hurtboxes stay byte-identical, and the existing tests pass unedited.
- **Renders:** before touching the model, add a look scene for it (like `thornling`: in-game states, then the viewer with `angle=0/45/90`) and capture it in Native and `--display n64`. Copy the shots to the scratchpad as the "before" set.

**The entrance vignette (golden set 3), owner's calls (2026-11-08, T51's plan):** the vignette is **Thistledown's road in** (the road from the field through the southeast fence gap to the square; the `village` look shot's frame, standing at -50,-42 facing the well). The final **tree, pine, rock and grass replace the rough ones valley-wide at once** (same placement, same `rand()` sequence, same colliders). **Baked light stays as is.** Cottages get **gable roofs with deep eaves** (walls, footprint and colliders unchanged). Three parts, each leaving the game working; the lock comes after T51c on the owner's approval.
- **Kit scenery in the merge:** `mergeStatic` (`render/materials.ts`) drops every attribute but position and normal, so before T51a a kit-painted model in `b.staticGroup` would lose its colours. `kitMat(surface)` *is* `bakedMat(surface, 0)`, so kit meshes join the same merge buckets (no new draw calls) once the merge keeps their `color` and gives them the plain meshes' `BAKED_SHADE` (multiplied in, plus `shade` for the light bake). So **scenery pieces skip `crevice`** (the merge shades them); standalone props keep it.
- **Layout frozen** is proven by `world/overworld/colliders.test.ts` (every collider of the overworld, Thistledown's listed one by one): it must pass unedited after each part.
- **Done so far (T51c):** the mill (outside, door frame, lamp bracket, axle), its sails (hub moved 0.35 m out so the lowest tip clears the wall and the lintel), Odo's stall and every ruined home are final (`render/models/mill.ts`, `ruins.ts`; pipeline.md "Scenery buildings"); colliders, `MILL_TOWER`, `MILL_BED`, jars and flags untouched. Phone check is in art.md "Budgets" (about +3% triangles, 22 fewer draw calls in the village). New look scene `vignetteModels` (both cottages, the mill, sails, stall and a ruin from the front, three-quarter and side). Baselines approved for `vignetteModels`, `mill`, `villageDetails`, `vignette`, `village`, `ruins`, `opening`, `contact`, `bake` (Native and N64); look budgets re-set for `ruins`, `opening`, `contact` (the new pieces cost triangles). The vignette is **locked into the golden set** (owner approved, 2026-11-08). The other outdoor scenes still show "changed" from the new buildings: approve each as you run and review it.
- **Done so far (T51b):** Thistledown's two cottages (gable roofs, deep eaves, timber gables, tapered chimneys, each house's touches), the well, the fence, the lantern post, the barrel and the crate are final (`render/models/village.ts`, pipeline.md "Scenery buildings"); `piece` budget 3,000. The glowing panes and lantern cores stay the world's own. Look baselines approved (Native and N64) for `vignette`, `village`, `villageDetails`, `contact`, `mill`; `villageDetails` is at 258,808 / 259,000 triangles in its budget. The village atmosphere was left as it is (the frame already reads warm); no day motes.
- **Done so far (T51a):** the valley's nature is final (`render/models/nature.ts`, pipeline.md "Instanced nature"), the merge keeps kit paint, the `vignette` look scene exists. Look baselines approved for `vignette`, `field`, `grove`, `village`, `contact`; every other outdoor scene still shows "changed" from the new trees and grass (atmosphere, blight, thorns, opening, ruins, bake, ...): approve each as you run and review it.

### T68: Time each barrel type on the owner's phone and pick the modern-prop direction
**Run:** auto · sonnet · medium
**Why:** T65's costs are from an M3 Pro, with a phone assumed ~4× slower. The owner tests the real thing on their phone (the GitHub Pages build: Dev button → Look experiment → one "Barrels: <type>" switch at a time, the Performance meter on) and picks the look that holds 60 fps; T67 builds on that choice.
**Done when:**
- The owner's numbers per barrel type (fps or frame ms, how many on screen, the phone's model) and their pick are in render.md's T65 bullet; the "×4" assumption is replaced by the measured factor.
- T67 is updated for the pick (or rewritten, if no type holds 60 fps: then the next step is cheaper surfaces, e.g. 512² bakes or fewer maps).
**Read first:** render.md "Look experiment" (the T65 bullet); `docs/tickets.md` T67.
**Verify:** nothing to build; docs only (`npm run check` still passes).
**Notes:** Guide the owner step by step: open the Pages build on the phone, tap the screen, Dev, switch on the Performance meter; walk to the rows north of the square (nearest: baked, then baked rich, live, modern, photoreal); one type on at a time, photoreal last (half a million triangles each: it may stall the tab); "Copy performance" pastes the meter's numbers. Each type builds the first time it's switched on (a short hitch, not the frame rate). The local dev server is much slower than the built site: time on Pages.

### T67: The recipe for modern props: a baked photoreal surface on a ≤5k body (draft: the owner confirms the direction first)
**Run:** plan · opusplan · high
**Why:** T65 found how close to photoreal a phone allows (and T68 times it on the owner's phone) (render.md "Look experiment", the T65 bullet): the photoreal barrel's look comes almost all from its per-pixel surface, and running that surface **once** into textures on a 4.4k-triangle body keeps it for ~1 ms per 60 props at phone size. The owner picks a direction from T65's renders (`npm run look -- modernBarrels`); if it's the baked barrel, this turns the experiment into a way to build any prop.
**Done when:**
- The owner's direction and its open calls are recorded in render.md and art.md: whether modern props replace the kit's prop look (left open in T65), and how they meet the palette and the N64 mode.
- A plan, written as tickets, for a shared bake (any model's surface shader → its atlas textures, behind a load screen or idle frames, with a texture-memory budget per area; 1024² for hero props, 512² for clutter) and a first real prop through it (the village barrel), with the pipeline.md recipe that later props follow.
**Read first:** render.md "Look experiment" (the T65 bullet: tables, budget, known flaws); `render/experiments/barrelBody.ts`, `barrelBake.ts`; pipeline.md (Rough → Final, the kit); art.md "Rendering rules".
**Verify:** the owner approves the plan; nothing is built until then.
**Notes:** **Owner's call (2026-11-09, after T65's renders): every barrel in the game is the photoreal one's size** (1.615 m tall, against today's 1 m). The village barrel's collider and `world/overworld/colliders.test.ts` change with it: that is a layout change, so plan it with the owner (paths, the clutter spots). T65's flaws to carry into the recipe: hairlines between staves on the baked barrels up close (filtering across the groove's two edge normals), no contact shadow under props at noon, murky heads. Shader compile is the bake's real cost (2.2 s once on the M3 Pro); memory is the limit (16 MB per prop type at 1024²). The ×4 phone factor waits on T58's real-phone measurement.

### T66: Look shots and budgets in the modern look (the game's default now)
**Run:** auto · sonnet · high
**Why:** Modern lighting is the game's default (owner's call, 2026-11-09), but `npm run look` and smoke still render the classic look (`__embervaleClassicLook` in `scripts/browser.mjs`): every baseline and budget was taken that way, and the post-processing modules load at a moment that would shift the seeded shots. Until this is done, a look shot is not what the player sees.
**Done when:**
- The modern pipeline is ready before the first frame (load its modules up front, e.g. `ModernLook.prepare()` awaited in `main.ts` before `game.start()`), so its objects draw their random numbers at a fixed point and shots stay deterministic (two runs of a scene match).
- `__embervaleClassicLook` is gone; every look scene is re-run and re-approved in the modern look (the owner sees a before/after contact sheet of a handful first), budgets re-measured; the full smoke suite passes (ask the owner first: shared systems).
- art.md "Rendering rules" says what the game now is (Standard-material twins, sky environment light, Neutral tone mapping, saturation 0.9; N64 mode keeps the classic path), and `modernLook.ts` moves out of `experiments/` if nothing experimental is left in it.
**Read first:** render.md "Look experiment"; testing.md (look baselines, approving); `scripts/browser.mjs`; `render/experiments/modernLook.ts` (`build`, `render`); `src/main.ts`.
**Verify:** `npm run check`; two runs of a few look scenes match each other; the full look suite; the full smoke suite.
**Notes:** Until then, any visual ticket that needs the modern look sets `LOOK.lighting` in its own look scene (as `modernLook` does).

### T58: Measure and cut the phone's frame cost (Native, shadows, baked light)
**Run:** auto · opus · high
**Why:** On the owner's phone, Native with Shadows and baked light on plays poorly, and Performance (pixel ratio 1) looks noticeably worse, so most players will want Native. A first blind pass cut Native to 2× on touch, no multisampling there and a 1024 shadow map; nobody has measured what it bought or where the rest goes.
**Done when:**
- **Done** (with T63's follow-up): the dev-only frame readout is the performance meter (engine.md "The performance meter": fps, ms, game-code ms, draw calls, triangles, pixel ratio, canvas, Display; **Copy performance** for a full report). Still missing from it: the shadow map's size, and GPU time (a timer query where the browser allows it); add them if the profiling needs them.
- With it, Native + Shadows + baked light on a phone-sized viewport is profiled; the top costs are named (shadow pass over the merged static chunks, fill rate, overdraw from fog/transparent layers, baked-light shader work, anything per-frame in JS).
- The biggest cheap wins are done, with before/after numbers, and the look unchanged (looker, Native and N64); what's left is a line in roadmap.md.
**Read first:** render.md "Display modes" and shadows; `render/shadows.ts`, `render/retro.ts`; `game/game.ts` (`frame`, `resize`; Grep, then ranges)
**Verify:** `npm run check`; smoke `touch`; look scenes before and after.
**Notes:** The valley's final nature (T51a) added ~40k triangles a scene (instanced trees ~120 each, ~3,200 three-blade tufts); its approval reset the look budgets on top of that (the grove 193k → 234k): a cheaper far tree (an LOD) or fewer tufts are candidates. Already done: Native on touch capped at 2× (`pixelRatioFor`), antialias off on dense touch screens (`Game` constructor), shadow map 1024 on touch (`shadowMapSize`). Undecided: a "Resolution scale" slider between Performance (1) and Native, so the owner picks the trade.
- **Untraced triangle growth:** the `touch`, `choice` and `gear` look scenes were already ~5k triangles over their budgets at 2e5d0c7 (281.6k vs 277k; 297.5k vs 292k), from a commit before T63; T63's wrap re-approved them (new menus), so the budgets now include it. Find what added it while profiling.
- **Modern lighting is the default on phones too now** (owner's call, 2026-11-09): profile Native with it on (no corner shade, bloom or anti-aliasing), and say whether phones should start in it.
- **Done and measured (2026-11-09, owner's modern-lighting tuning):** corner shade now fades with the fog (render.md "Look experiment"); bloom runs at half resolution; the modern pipeline's MSAA is a dev-panel choice (the 4× buffers are its biggest cost: ~2.6 ms with no post, ~8 ms with corner shade; default unchanged). **Distance culling was measured and dropped:** beyond the fog's far distance there are only ~5% of the merged triangles (12k of 246k from the village, 4k from the field) plus 0–36k of ~85k instanced tree/tuft triangles (the instanced meshes are one object each, so culling them would mean splitting them into cells), and almost no draw calls (the frustum already skips most). ~250k triangles is not what limits an M3 Pro: the frame is pixel- and pass-bound. Left for T58: a **resolution scale** (Native on a Retina screen renders 4× the pixels of 1×), an MSAA/FXAA decision for the modern pipeline, a cheaper bloom (fewer mips; its cost is the pass count), and the per-chunk cull only if a phone profile shows triangles matter.

### T64: Exposure and sky light that follow the time and the place (modern lighting)
**Run:** auto · sonnet · high
**Deprioritized** (owner, 2026-11-09): the one global look (render.md "Look experiment" defaults) is good enough for now; do this after T58.
**Why:** The owner likes Modern lighting (Dev → Look experiment) and has tuned it by eye at six points (below). One global Exposure and Sky light can't hold that across the day and the dungeon: the values swing from 0.90 to 1.90 and from 0.10 to 2.00. The engine already keeps the day as data (`render/atmosphere.ts`: six moods on the clock, blended by `lightKeys`, one atmosphere per place), so both belong there. (Auto-exposure was weighed and rejected: a luminance pass every frame when frame cost is the problem, it reacts to what the camera faces, and it can't be tuned per mood.)
**Done when:**
- `Phase` gets `exposure` and `sky` (the environment light's strength), set per mood in the outdoor atmospheres and interpolated by `lightKeys` like the rest of the light. Indoors, each wing's theme (`world/dungeon/decor.ts` `THEMES`: sandstone, marble, moss, basalt) carries its own pair, eased between rooms the way fog is (`Area.fogAt`).
- The data is the owner's points, stored **relative to noon** (noon = 1), with Dev → Look experiment's **Exposure** and **Sky light** becoming global multipliers (default 1.00 = the tuned look). Changing tone mapping or the grade then needs only noon re-tuned, and a spot check of the rest.
- Predawn (4:48) and eve (19:18), which the owner didn't tune, are derived from the light data (their light relative to their neighbours'); sandstone and basalt, which they didn't tune either, get one owner point each (the Hall of Sleepers; the Ember Hall), with console commands to stand there as for the six.
- Tests: the interpolation (wraps round midnight, exact at each key's hour); a data test that every atmosphere and theme has both values in a sane range. Nothing changes with Modern lighting off or in N64 mode (only the modern pipeline reads them).
- Display modes, the N64 look and every look baseline are untouched (Modern lighting is off by default).
**Read first:** art.md "Rendering rules"; render.md "Look experiment"; `render/atmosphere.ts` (`Phase`, `lightKeys`, `ATMOSPHERES`); `render/sky.ts` (how phases blend); `render/experiments/modernLook.ts` (`LOOK`, `render()`: where exposure and `environmentIntensity` are set); `world/dungeon/decor.ts` and `Area.fogAt`.
**Verify:** `npm run check`; standing at each of the six points shows the owner's values (a scratch script reading `toneMappingExposure` and `scene.environmentIntensity` there); a look at noon, dusk and the two rooms (looker: nothing blown or crushed).
**Notes:** **The owner's points (2026-11-09; Thistledown at (-50, -42) facing the `village` shot; Modern lighting on, Corner shade 0, Bloom 0, Anti-aliasing off, Outdoor occlusion 0.70; tone mapping Neutral, presumably: confirm):**

| Point | Exposure | Sky light |
|---|---|---|
| Midnight (night key) | 0.90 | 2.00 |
| 6 am (dawn key) | 1.65 | 0.30 |
| Noon (day plateau, 8 to 16) | 1.15 | 1.20 |
| 6 pm (dusk key) | 1.25 | 0.10 |
| Crypt (moss wing), (32, 13) floor -1 facing north | 1.40 | 0.20 |
| Long Gallery (marble wing), (35, 12) floor 1 facing north | 1.90 | 0.75 |

Indoors Sky light still matters: it scales the environment map, which is painted from the room's fill light. Right after tuning, the owner leaned toward **AgX** with the new grade (Contrast, Saturation: render.md "Look experiment"), so expect a new noon value once the tone mapping is chosen: that is why the data is stored relative to noon. Whether Modern lighting becomes the default look is a separate decision (art.md stands until the owner says); this ticket changes no default.

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
- **Ids** are never reused (next free: **T71**). The order of this file is the run order; the
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

### T70: Find and fix the phone's stutter (from the hitch log)
**Run:** auto · opus · high
**Why:** On the owner's **iPhone Air** (3× screen, ProMotion, Safari) the average fps is good but play **stutters**: some frames take far longer than the rest.
**Done so far:** the **hitch log** (engine.md "The performance meter": long frames with their causes, "N hitches/min" on the meter, the list in Copy performance). **Display → Native "never took" on the phone:** headless taps on the options work; the likely iPhone cause (a tap whose pretend mouse move redrew the menu loses its click) is fixed by hovering with a real mouse only, and the `touch` smoke taps Auto then Native. **Unconfirmed on the phone:** ask the owner first whether it works now.
**Done when:**
- The owner plays a minute or two on the phone (walking, turning, a fight, an area change) and pastes Copy performance; the top causes are fixed, with before/after hitch counts from a second paste.
- Likely fixes by cause: **resolution**: Auto steps rarer (hold still while the stick or camera moves; fewer probes up). **none** with little code time (garbage collection): reuse scratch vectors in the per-frame paths (`GroundEnemy.walk`, `toScreen`, `guardGaugePosition`, the camera, `Combat`). **shader**: warm the area's programs at load (`renderer.compile`/`compileAsync`). **upload**/**bake**: spread over frames. Big **code** time: CPU-profile that path (a scratch CDP profile at phone size, CPU ×4).
**Read first:** engine.md "The performance meter" and "What a phone frame costs"; render.md "Display modes" (Auto); `game/perf.ts`; `render/autoResolution.ts`; then only the files the pasted causes point to.
**Verify:** `npm run check`; smoke `touch`; the owner's second paste.
**Notes:** Measure on the phone, not by guessing: the Mac can't show a phone's GC pauses or compile stalls.

### T64: Exposure and sky light that follow the time and the place (modern lighting)
**Run:** auto · sonnet · high
**Deprioritized** (owner, 2026-11-09): the one global look (render.md "Look experiment" defaults) is good enough for now; T58 is done, so this waits only on the owner's go.
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

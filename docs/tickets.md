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
- **Ids** are never reused (next free: **T61**). The order of this file is the run order; the
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

**The shrine room (golden set 8), owner's calls (2026-11-08, T56's plan):** the room is **the Hall of Sleepers** (`entry`: the first room, where every death returns). The final pass reaches **the whole sandstone wing at once** (floor 0, like the vignette's trees valley-wide): its shell, its decor, and the shared pieces everywhere they stand; only the Hall gets the extra **dressing: carved spiral reliefs, offering niches with candles, rubble and sand drifts, hanging cloth**. **Mood: warm torchlight and dust**, no new real lights. Three parts, each leaving the game working; the lock comes after T56c on the owner's approval. Design: [shrine.md](shrine.md) "The final look".
- **Layout frozen** is proven by `world/dungeon/colliders.test.ts` (every collider of the shrine, the Hall's one by one), passing unedited after each part, and by `npm run map -- shrine` unchanged (save its output before, diff after).
- **Before renders:** the `shrineHall` look scene (8 in-game shots: the Hall from the way in, toward the bell post, the tablet, from high in a corner, the nave door's frame, a sconce close; the Nave's pillars; the Gallery of Statues). Its before set (rough, Native and N64) is in no baseline: if the owner wants it side by side, `git stash` the wing's changes and capture.
- **Done so far (T56a):** the freeze test, the `shrineHall` scene, the sandstone wing's **shell** (flags, plinth, string course, cornice, corner pilasters, ceiling beams, pillars: `render/models/shrine.ts`, laid by `build.ts` round its unchanged colliders; the plain wall faces stay), the **door frame** (every doorway, its wing's trim: `render/models/shrineProps.ts`) and the **sconce** (every room: iron merged in the scenery; the flame flickers and dust rises through its glow: `render/sconceGlow.ts`). Registered `final`: `shrine-corner`, `shrine-pillar`, `shrine-door-frame`, `sconce`. Baselines and budgets approved for `shrineHall` (Native and N64), `dungeon`, `landmarks`, `stairs`, `entrance` (`door` unchanged); the other shrine scenes (`bells`, `bellShaft`, `atmosphere`, `bake`, `gravelheart*`, `wardenIntro`, `seal`, `contact`) still show "changed" from the frames and sconces: approve each as you run and review it.
- **Done so far (T56b):** the Hall's things are final (`render/models/shrineThings.ts`, shrine.md "The final look"): the **wakestones** (light and heavy; the heavy's spirals wear the area's shared pulsing `heavyGlow`), the **tablet**, the **bell post and its bell** (every bell site; `pivot` stays the hook), the wing's **sleeping faces** (now above the tallest stone, 14 cm off the wall, and never within 1.3 m of a sconce: `clearOfSconces`) and **kneeling keepers** (collider unchanged). Registered `final`: `wakestone`, `wakestone-heavy`, `dungeon-tablet`, `bell`, `bell-post`, `shrine-face`, `shrine-keeper`. New look scene `shrineModels`. Baselines and budgets approved for `shrineModels`, `shrineHall`, `bells`, `bellShaft`, `landmarks` (Native and N64); `colliders.test.ts` unedited, `npm run map -- shrine` unchanged. The other shrine scenes still show "changed" from the new things: approve each as you run and review it.

### T56c: Final pass: the Hall's dressing and mood; renders; the lock
**Run:** auto · sonnet · high
**Why:** The golden room needs the dressing that makes it a place, then the owner's approval to lock it as the example every room follows.
**Done when:**
- The Hall's dressing (visual only, no colliders, nothing interactable): **spiral reliefs** on wall panels and a carved lintel over each doorway (faint glow in the cuts, like Gravelheart's spirals); **two or three offering niches** with candle clusters (unlit `halo()` glows, no new lights) and a bowl; **rubble** in the corners and **sand drifted** against the wall feet, a few **cracked or sunken flags** (visual only); **faded, torn banners** between the sconces (the sleeping faces already hang on the north and south walls, kept 1.3 m from each sconce: put banners where `DungeonArea.faceSpots` and `sconceSpots` leave room, and keep them clear of the faces) (one cloth swatch added to `shrine.sandstone` if none fits: say so). A test keeps every piece clear of the wakestone's cells and slide path, the bell post, the tablet and the doorways.
- **Mood:** the Hall's dust (beyond the sconces' own) and the light checked in Native and N64; no new real lights.
- **Phone check:** the `shrineHall` scene's draw calls and triangles against the before set (rough: 868 / 152k; after T56a: 807 / 185k; after T56b: 753 / 201k) into art.md "Budgets".
- Before/after renders shown to the owner (in-game Hall shots and each model front/three-quarter/side, Native and N64). **On approval:** the Hall's ids added to `GOLDEN_SET`, the room to art.md's golden-set list with its reference renders, `shrineHall` and `shrineModels` baselines approved.
**Read first:** tickets.md "The shrine room" (above); shrine.md "The final look"; art.md "The golden set", "Budgets"; `render/models/shrine.ts`; `world/dungeon/build.ts` (Grep `isFinal`, `decorateRoom`); `world/dungeon/decor.ts`
**Verify:** `npm run check`; `npm run assets`; smoke `shrine-keys shrine-glove`; `npm run map -- shrine`; `looker` on `shrineHall shrineModels dungeon contact` (Native and N64).

### T60: Keyed body polish for Gravelheart (anticipation and settle)
**Run:** auto · sonnet · high
**Why:** T55 kept Gravelheart's body moving exactly as the rough did (owner's call: body exact, so the fight provably didn't change). The body only eases toward each pose: no dip before Hammerfall, no settle after a slam. A keyed dip and overshoot would read heavier; the owner wants to play that one change on its own.
**Done when:**
- In `GravelheartRig` (`render/models/gravelheart.ts`): anticipation before the big moves (Hammerfall, Sweep, the howl, Cairn Roll's rock back) and an overshoot-and-settle after their impacts, zero at the ends of each window, so the key angles at the windup's end and the active step stay where they are.
- The behaviour files untouched (timings, AI, hurtbox sizes); `gravelheart.test.ts` passes unedited.
- `gravelheart.trace.test.ts` re-recorded **by design** (the hurtboxes move a little inside the windows): say so in the commit, and check by hand that the hurtboxes at the windup's end and the active step's first frame stay within a few centimetres (compare the old and new snapshot lines at those frames).
**Read first:** pipeline.md "The rig convention"; combat.md (boss fairness rules); `render/models/gravelheart.ts` (the rig half); `render/models/wren.ts` (how its swings keep key angles with a pull-back and overshoot that are zero there).
**Verify:** `npm run check`; smoke `shrine-boss`; look `gravelheart gravelheart2` (looker). The owner plays the fight.

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

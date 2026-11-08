# The asset pipeline: Rough and Final passes

How every model, room and area gets made so the game stays one consistent thing ([art.md](art.md) says what it should
look like). The owner talks like a designer ("add an enemy here", "now do the final version"); the agent runs the right
pass **without being asked** and without the owner listing steps.

Some tools named here don't exist yet: each section says which ticket builds it and what to do until then. The ticket
that builds a tool rewrites its section.

## Trigger phrases

| The owner says | Run |
|---|---|
| "Add / build / rough out a new [enemy, boss, NPC, prop, room, area]" | Rough pass |
| Feedback on feel ("too fast", "the slam needs more warning") | Iterate gameplay; visuals stay rough |
| "Do the final version", "final pass", "art pass", "make it final" | Final pass |
| "Polish the atmosphere in [area]" | Atmosphere pass: fog, light, particles, sub-palette (art.md; area looks as data from T31) |

Feel is only iterated in rough. A final pass that fails its checks goes back for visual fixes and never touches gameplay.

## Rough pass: playable today

Detail is wasted at this stage.
- Built from primitives (the kit, from T35), at the right scale, with the intended silhouette roughly there. Palette colours by name (`pal('wood', 1)`).
- **Full gameplay:** behaviour, hurtboxes and hit ranges, attack timings, the standard poses (simple is fine), sounds.
  Recipes: `/add-enemy`, `/add-npc`, `/add-quest-beat`.
- Registered as `tier: 'rough'` in `render/models/registry.ts`, with a short spec in its topic doc (design intent, attacks, timings, weak points).
- **Done when:** placed in the game, playable, the Definition of done passes (AGENTS.md), the validator passes (`npm run assets`; no failures in `npm run check`),
  and the report says how to reach it (a dev state, `?state=`, or `embervale.spawn`, from T34).

## Final pass: looks finished, plays the same

- **Frozen:** silhouette, scale, joint hierarchy, hurtboxes and hit ranges, attack timings, AI. If one of these really
  should change, stop and ask the owner first.
- **Colours:** every literal in the model's files becomes a `pal()` name from its area's sub-palette (`npm run palette -- <file>`).
- **Added:** secondary forms (horns, plates, teeth, belts, spikes, chipped edges); shaped primitives instead of raw ones
  (tapers, bevels, slight asymmetry); colour breakup by region; crevice darkening; a readable face or eyes.
- **Animation polish:** anticipation before attacks, overshoot and settle, idle life (breathing, bobbing), hit reactions,
  a satisfying death. Timings of the active frames stay as they are.
- **Done when:** within budget; validator passes; the behaviour file is untouched in the diff; on the contact sheet next
  to the golden set it doesn't stand out; before/after renders shared with the owner (Native and N64 mode); `tier: 'final'`.

**How "plays the same" is proven:** the model lives in its own builder file and the behaviour (stats, timings, attack
sheet, hurtbox sizes) in another, so the diff shows only the model changed; the enemy's unit tests (attack sheets,
windows) and its smoke scenarios pass unchanged; hurtboxes ride the same named joints. A final pass replaces the rough
model in place: there is never a rough and a final model side by side.

## Rooms and areas

- **Rough:** blockout geometry, collision, puzzle logic, enemy placement, rough lighting. The playable layout is the
  deliverable. Dungeons are data first ([dungeons.md](dungeons.md)).
- **Final:** set dressing from the prop library, landmark shapes, the area's sub-palette, fog and light mood, particles,
  textures, merged static geometry, a phone performance check. Layout and puzzle logic stay frozen (`npm run map` unchanged).

## The rig convention

Characters are rigid parts on a hierarchy of joints (`THREE.Group`s): no skinning, so nothing distorts. Animation is
code: a **`Pose`**, a flat set of numbers (joint angles, heights, glow amounts) that moves and states blend toward, and
one `pose(p)` that applies it to the joints. Both bosses already work this way (`render/models/gravelheart.ts`, the
Lamplighter's `Pose` in `game/bosses/lamplighter.ts`); regular enemies pose inline and adopt it in their final passes. State names: `idle`, `move`,
`anticipate`, `attack`, `recover`, `hurt`, `death`, plus extras per creature; bosses use the move system's
windup/active/recover ([combat.md](combat.md)). Pose data stays separate from geometry, so a model can be re-detailed
without breaking its animation. From T35, `bakeRig` merges each joint's parts into one mesh with one material (fewer
draw calls; the hit flash becomes a uniform).

## The registry and validator

**A model is a pure builder** in `render/models/<name>.ts`: a function that returns a `Model` (`types.ts`): `root` (everything
visible, at the origin, facing +z), `joints` (the parts behaviour poses or hangs hurtboxes on, by name), `flashMats` (the unique
materials that flash on a hit) and optionally `animated` (other unique materials it animates itself: glowing eyes, an ember). It uses
no physics and no game, so Node can build it. The behaviour file (`game/…`, `world/objects.ts`) calls the builder, adds `root` to its
own, and keeps stats, timings, attack sheets and hurtbox sizes; hurtboxes still ride the named joints. Models that need extra parts
return them beside the `Model` (the Shellback's `eyes` and `legs`, Wren's `coatMat`).

**The registry** (`render/models/registry.ts`): `ASSETS`, one entry per model: `id`, `kind` (`player`, `enemy`, `miniboss`, `boss`,
`npc`, `prop`, `piece`), `tier` (`rough` or `final`) and `build()`. A test fails if a `build…` function in `render/models/` is not
used in the registry, so a new model cannot be forgotten. **Adding a model:** write `render/models/<name>.ts`, register it
(`tier: 'rough'`), run `npm run assets`. `piece` (dungeon rooms and set pieces) is defined but empty: those join with the dungeon
look ticket. Not models, so not registered: `BossArena` (a sealing flame ring, an effect) and the terrain and buildings (merged static
scenery, [art.md](art.md)). Every NPC is `buildHumanoid` with its own colours; the registry holds one stand-in (`villager`).

**The validator** (`render/models/validate.ts`) builds every entry in Node and checks it:

| Check | Rule |
|---|---|
| Triangles | at most the kind's budget (art.md "Budgets": player 2,000, enemy 1,200, mini-boss 2,500, boss 4,000, NPC 1,200, prop 300; instances counted) |
| Colours | every material's colour (and a glow's emissive) is exactly a palette swatch: models name theirs with `pal()` |
| Materials | every `MeshLambertMaterial` is shared (`mat`, `surf`) or declared in `flashMats` / `animated`; no hand-made ones |
| Textures | generated tiles at most 64 px (the ground tile excepted) |
| Bounds | the bounding box is not empty or tiny, and not longer than the kind's limit (a scale sanity check) |

**Findings warn for `rough` and fail for `final`.** `registry.test.ts` runs it inside `npm run check`: any finding on a `final` asset fails,
and a rough asset's findings print as one warning line. `npm run assets` prints the table (triangles against budget, size, textures,
status) and every finding. Reading the table: today's rough models mostly hold glow colours that are not swatches (eyes, embers, halos:
`MeshBasicMaterial`s written as hex) and a few props over the 300-triangle budget (the heart vessel's extruded heart); the
Lamplighter is at about twice its mini-boss budget. A final pass fixes these; it never changes gameplay.

## The viewer, contact sheet and dev shortcuts

- **Viewer** (dev server only, like `/blips.html`): `/viewer.html?asset=<registry id>` shows one model on a turntable under the
  game's own `Sky` (light and fog by time of day), with a panel: asset picker, hour slider, Native / Performance / N64, the place's
  atmosphere (valley, village, hollow, shrine), turntable on/off and an angle slider, and one x/y/z rotation slider per named
  joint to pose it. URL params: `hour`, `place`, `display`, `spin=0`, `panel=0`. Code: `src/dev/viewer.ts`.
  The viewer shows the **model**, not the behaviour, so moves and hurtboxes live in the game (below).
- **Contact sheet**: `/viewer.html?asset=contact`, and the `contact` look scene (`npm run look -- contact`, also with
  `--display n64`). Every registered model at one scale (shelves, biggest kinds first; layout in `src/dev/contactLayout.ts`), its id
  under it; the golden set (`GOLDEN_SET` in `registry.ts`, empty until the owner approves a member) is starred and gold.
  Any model change shows up in this shot, so an outlier is easy to see.
- **`?state=<id>`** (dev server or `?debug`): boots past the title menu straight into a Dev tab save state. The id is the state's
  name in lowercase with hyphens (`devStateId`: `?state=waking-shrine-the-entrance`), or its 1-based number in the Dev tab.
- **`embervale.spawn(id, x?, z?)`**: puts a registered enemy (`thornling`, `gloomwisp`, `dozing-sentinel`, `shellback`,
  `cragstalker`: `game/spawn.ts`) at (x, z) or 3 m in front of Wren. Bosses stay in their arenas: `activeBoss.forceMove(name)`.
- **`?debug` + `\`** draws the collider wireframe **and** red rings round every live enemy's hurtboxes (`Debug`, `game/debug.ts`).

## The modeling kit (T35)

Not built yet. Until then: three.js primitives through `mat`/`surf`/`uniqueMat` (`render/materials.ts`), `buildHumanoid`
(`render/characters.ts`), `render/shapes.ts`. T35 adds the builders (beveled box, taper, capsule, lathe, extrude along a
path, mirror, merge, crease-angle normals, palette region paint, crevice darkening, triangle counter, all seeded) and
writes their reference here.

## Visual checks

Every visual change: `looker` on the look scenes it touches ([testing.md](testing.md)), in Native and N64 mode.
Iterate on the scenes that changed; the full run at milestones.

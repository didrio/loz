# The asset pipeline: Rough and Final passes

How every model, room and area gets made so the game stays one consistent thing ([art.md](art.md) says what it should
look like). The owner talks like a designer ("add an enemy here", "now do the final version"); the agent runs the right
pass **without being asked** and without the owner listing steps.

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
- Built from primitives (the kit, below), at the right scale, with the intended silhouette roughly there. Palette colours by name (`pal('wood', 1)`).
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
  textures, merged static geometry, a phone performance check. Layout and puzzle logic stay frozen (`npm run map` unchanged;
  outdoors, `world/overworld/colliders.test.ts` snapshots every collider and passes unedited).
- **Kit scenery** (T51a): a kit model can stand in the merged static scenery (`b.staticGroup.add(model.root)`). `mergeStatic`
  keeps a kit piece's paint and darkens it with the same `BAKED_SHADE` as every plain mesh (the light bake then replaces that
  shade as usual), in the same bucket as the plain meshes of its surface, so it costs no extra draw call. So **scenery
  models skip `crevice`** (the merge shades them); a model that stands alone (`b.dynamic`, a prop) keeps it. Name a surface
  (`kitMesh(g, 'wood')`): the texture audit flags a kit piece without one.
- **Instanced nature** (T51a, `render/models/nature.ts`): one geometry per kind, painted white with its own shade
  (`crevice`), coloured per instance by a palette swatch the layout's existing random draws pick (`roundTint(c1, c2)`), so
  the placement's random sequence never moves. A part keeps the rough's frame (size and centre), so the instance matrices
  stay byte-identical.
- **Scenery buildings** (T51b, `render/models/village.ts`): a model collects its kit pieces by surface (a `Parts` bin) into one
  mesh per surface, in a local frame that matches the rough's (a cottage: centred, plinth on y = 0, door on +z); the world
  places `model.root` in `b.staticGroup` and keeps every collider call as it was. Anything that glows at night (a window's pane,
  a lantern's core and halo) stays the world's own unique mesh at the same spot, and the model carries only its trim or cage,
  with a test that the trim leaves the pane's volume clear. A fence and the like (many copies along a path) export the
  geometry (`fencePost()`, `fenceRail(len)`) and the world places one mesh each.
- **The mill, the stall and the ruins** (T51c, `render/models/mill.ts`, `ruins.ts`): same `Parts` pattern. The **mill** is the tower's outside
  (a 32-sided shell from a `lathe`, its doorway cut by dropping the triangles either side of +x below the door's top: `cutDoorway`), the
  foot, bands, windows, cap, the door's stone frame and step, the lamp bracket and the axle, and it takes `MILL_TOWER` as an argument
  (render never imports `world`; a test keeps `MILL_DEFAULT` equal). The room inside, the door that swings and the glowing lamp core
  stay the world's. The **sails** are their own model because the world rotates its root about x (`index.ts`); they clear the wall at
  the lowest tip and the door's lintel (tested). **Odo's stall** is a model with the rough's frame (the counter's collider unchanged).
  A **ruined home** is built from `RUIN_WALLS`, the same list the world's colliders are made from, for any `scale` and `flip`
  (rubble and wall-tops are seeded from those two numbers, never from the global random numbers).

## The rig convention

Characters are rigid parts on a hierarchy of joints (`THREE.Group`s): no skinning, so nothing distorts. Animation is
code: a **`Pose`**, a flat set of numbers (joint angles, heights, glow amounts) that moves and states blend toward, and
one `pose(p)` that applies it to the joints. Both bosses already work this way (`render/models/gravelheart.ts`, the
Lamplighter's `Pose` in `game/bosses/lamplighter.ts`). **Regular enemies adopt it in their final passes; the Thornling
(`render/models/thornling.ts`, T49) is the example to copy:** the model exports its `Pose`, a `REST` pose, `blendPose` and a
`ThornlingRig`; the behaviour file keeps every timing and only hands the rig its state each frame (`rig.update(dt, { state, t,
windup, moving })`) and its death (`rig.die(deathT / 0.35)` from a `dying` override). The rig's `target(cue)` is where each
state's look lives (anticipation, overshoot, the hit reaction), all inside the windows behaviour already has; idle life (a
seeded blink, breathing, the hop's squash and stretch) is added on top. A timing the rig must end on (the windup) becomes a
named constant in the behaviour file. **A humanoid: Wren (`render/models/wren.ts`, T50).** `WrenRig.update(dt, cue)` takes the
player's facts (alive, action and its time, the combo and how far through the swing, speed, grounded, shield, surf, glove,
broken guard); `target(cue)` layers them as the old inline code did (run cycle, then death / swing / hurt, then glove, guard,
surf, broken guard). A change of *kind* of pose crossfades over 0.12 s (a swing and a death start at once: they have their
own curves); swings keep their key angles at the ends of the ease (p 0.12 and 0.72) with a pull-back before and an overshoot
after that are zero there. The
shield is placed from the arm's *applied* pose, so the guard's shield stands exactly where it always did. The pose constants
(shield positions, `SURF_LIFT`) live in the model's file. Enemies without a final pass still pose inline. State names: `idle`, `move`,
`anticipate`, `attack`, `recover`, `hurt`, `death`, plus extras per creature; bosses use the move system's
windup/active/recover ([combat.md](combat.md)). Pose data stays separate from geometry, so a model can be re-detailed
without breaking its animation. `bakeRig` merges each joint's parts into one mesh with one material (fewer
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
(`tier: 'rough'`), run `npm run assets`. `piece` is scenery bigger than a prop (buildings, landmarks; dungeon rooms join with the dungeon look ticket):
budget 3,000 triangles (T51b). Not models, so not registered: `BossArena` (a sealing flame ring, an effect) and the terrain. Scenery joins the registry as it gets
its final pass: the valley's nature (T51a; the lone oak as a `piece`), Thistledown's cottages (T51b, two `piece`s) and its well, fence section, lantern post, barrel and crate (`prop`s), then the mill, its sails, Odo's stall and a ruined home (T51c, four `piece`s). Every NPC is `buildVillager` (`render/models/villager.ts`, T53) with its own look: Pip (`pip`, final) and one stand-in for the adults (`villager`, Maren's look, rough until the villagers' group passes).

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
  joint to pose it. URL params: `hour`, `place`, `display`, `spin=0`, `panel=0`, `angle=<deg>` (fixed camera, turntable off: front 0,
  three-quarter 45, side 90; the golden set's reference renders). Code: `src/dev/viewer.ts`.
  The viewer shows the **model**, not the behaviour, so moves and hurtboxes live in the game (below).
- **Contact sheet**: `/viewer.html?asset=contact`, and the `contact` look scene (`npm run look -- contact`, also with
  `--display n64`). Every registered model at one scale (shelves, biggest kinds first; layout in `src/dev/contactLayout.ts`), its id
  under it; the golden set (`GOLDEN_SET` in `registry.ts`: the chest, the Thornling, Wren and the entrance vignette's models so far; art.md lists them) is starred and gold.
  Any model change shows up in this shot, so an outlier is easy to see.
- **`?state=<id>`** (dev server or `?debug`): boots past the title menu straight into a Dev tab save state. The id is the state's
  name in lowercase with hyphens (`devStateId`: `?state=waking-shrine-the-entrance`), or its 1-based number in the Dev tab.
- **`embervale.spawn(id, x?, z?)`**: puts a registered enemy (`thornling`, `gloomwisp`, `dozing-sentinel`, `shellback`,
  `cragstalker`: `game/spawn.ts`) at (x, z) or 3 m in front of Wren. Bosses stay in their arenas: `activeBoss.forceMove(name)`.
- **`?debug` + `\`** draws the collider wireframe **and** red rings round every live enemy's hurtboxes (`Debug`, `game/debug.ts`).

## The modeling kit

Every final pass builds from one toolkit, so the style is consistent for free. **`render/kit.ts`**: builders that return a plain
non-indexed `BufferGeometry` (`position`, `normal`, a vertex `color`), pure and deterministic. **`render/bakeRig.ts`**: merges a model's
parts per joint. Forms stand on y = 0 and are centred on x and z (a box on all three); faces always point outward. Tests: `kit.test.ts`, `bakeRig.test.ts`.

| Builder | What it gives | Example |
|---|---|---|
| `bevelBox(w, h, d, bevel)` | a box with chamfered edges (44 triangles; bevel 0 = plain 12) | `bevelBox(1.4, 0.8, 0.95, 0.07)` |
| `taper(bottom, top, height, sides, flatten)` | a tapered limb, trunk or tooth from y = 0 | `taper(0.18, 0.1, 0.6, 5, 0.7)` |
| `capsule(r, length, sides, rings)` | a rounded limb or body | `capsule(0.25, 0.9)` |
| `lowSphere(r, sides, rings)` | a chunky sphere (6 × 4 default) | `lowSphere(0.4, 6, 4)` |
| `lathe(profile, sides)` | a surface of revolution from `[radius, y]` points | `lathe([[0.4, 0], [0.3, 0.5], [0, 0.8]], 8)` |
| `extrudePath(profile, path, scale)` | a 2D profile swept along a 3D path: horns, tails, handles, a curved lid | `extrudePath(square, arcPoints, (t) => 1 - t)` |
| `mirror(g, axis)` | the piece plus its reflection, both facing outward | `mirror(place(arm, 0.5, 1, 0))` |
| `merge(...gs)` / `place(g, x, y, z, rot)` | join pieces / move (and turn) a copy | `merge(body, head)` |
| `wobble(g, amount, seed)` | seeded asymmetry, no cracks at shared vertices | `wobble(rock, 0.04, 3)` |
| `creaseNormals(g, deg)` | smooth normals inside the crease angle, hard edges beyond it | `creaseNormals(dome, 50)` |
| `paint(g, colour)` | one palette colour into the vertices (anything else snaps to a swatch) | `paint(g, pal('wood'))` |
| `paintRegion(g, pick)` | colour breakup: `pick(centre, normal)` returns a colour or `undefined` | `paintRegion(g, (c, n) => n.y > 0.8 ? pal('moss') : undefined)` |
| `gradient(g, low, high, from?, to?)` | a smooth ramp of light over the height (multiplies, per vertex; paint first): no surface one flat colour | `gradient(paint(coat, c), 0.8, 1.06)` |
| `crevice(g, shade)` | darkens undersides and wall feet; defaults are the scenery's `BAKED_SHADE` | `crevice(paint(g, c))` (paint first: it multiplies) |
| `triangleCount(g or object)` | triangles in a geometry or under an object | `triangleCount(model.root)` |
| `kitMesh(g, surface?)` | a mesh in the shared vertex-colour material (`kitMat`), optionally textured | `kitMesh(g, 'wood')` |

**`bakeRig(model, { shared? })`** returns the model with every joint's meshes merged into one per kind of surface (colours baked into the
vertices), so a model is a handful of draw calls and one material to flash. The joints keep their place and transform, so behaviour poses
them as before. It bakes plain opaque Lambert meshes (kit pieces and old `mat`/`surf` ones alike) and leaves glows, transparent and
`MeshBasicMaterial` parts, `animated` materials and a joint that is itself a `Mesh`. `flashMats` becomes the baked materials (the game's
`m.emissive.setRGB(k, k, k)` flash works unchanged: the flash is the material's emissive uniform). `shared: true` uses the shared kit
materials instead, for a prop that never flashes (`flashMats` stays empty).

**Recipe: a limb with a joint.** Build each part as a kit piece, move it with `place`, `paint` it from the area's sub-palette, `crevice` it,
`kitMesh` it into the joint's `Group`, then `bakeRig` the model at the end of the builder. Rig and poses stay as they were.

**Recipe: colour breakup and wear.** `paintRegion` for a lighter crown, a mossy top, a stained foot; `wobble` the big forms a few
centimetres (seeded) so no two edges are parallel; `crevice` last. Spend triangles on silhouette (a bevel, a strap, a horn), not on
smoother cylinders.

Kit colours are palette colours; `crevice` and the lighting then darken them, as in the scenery. The kit material (white, vertex-coloured) is a swatch, so the validator accepts it.
The chest (`render/models/props.ts`, 272 of its 300 triangles) is the first model built this way (the rest of the prop set, T52, follows it: the hinged door and the stone door in `doors.ts`, the jar and the sign in `props.ts`; a door's pivot or slab is a joint the world still moves, a recoloured glyph or lit notice is an `animated` unbaked mesh, and the sign's scribbles come from a `seed` argument, never from the shared random numbers); the Thornling
(`render/models/thornling.ts`, 800 of 1,200: an 80-face ball, thorns as `extrudePath` spikes curving back, a face of glow eyes, brows and a
hinged jaw, five joints) the first creature; Wren (`render/models/wren.ts`, ten joints) the first person: the coat,
blade and shield wood are `uniqueSurf(..., { vertexColors: true })` materials of their own in `animated`, the vertices painted white, so the
game can still recolour, glow and flash them after the bake; the villagers (`render/models/villager.ts`, T53; Pip is the final one) the first NPCs: one body made of Wren's pieces (`person.ts`: the head, ears and nose, mitten hands, cuffed boots, eyes and brows; `k` scales them), an adult frame (the old humanoid's joints) and a child frame (a head 1.3× bigger, the same height), baked with the shared materials (a villager never flashes), every mesh tiled and graded; `VillagerRig` takes the `Npc`'s facts (`{ near, holding }`): the calm idle the villagers always had plus blinks, or Pip's shy one (hands clasped, eyes down, a peek at Wren every few seconds while near; hugging Button once returned). The `Npc` keeps turning to face Wren, its collider and blob. **The recipe for every final pass: `/final-pass`.**

## Visual checks

Every visual change: `looker` on the look scenes it touches ([testing.md](testing.md)), in Native and N64 mode.
Iterate on the scenes that changed; the full run at milestones.

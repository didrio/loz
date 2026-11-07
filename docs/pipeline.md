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
- Registered as `tier: 'rough'` (from T33), with a short spec in its topic doc (design intent, attacks, timings, weak points).
- **Done when:** placed in the game, playable, the Definition of done passes (AGENTS.md), the validator passes (from T33),
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
one `pose(p)` that applies it to the joints. Both bosses already work this way (`game/bosses/gravelheart/rig.ts`, the
Lamplighter's `Pose`); regular enemies pose inline and adopt it in their final passes. State names: `idle`, `move`,
`anticipate`, `attack`, `recover`, `hurt`, `death`, plus extras per creature; bosses use the move system's
windup/active/recover ([combat.md](combat.md)). Pose data stays separate from geometry, so a model can be re-detailed
without breaking its animation. From T35, `bakeRig` merges each joint's parts into one mesh with one material (fewer
draw calls; the hit flash becomes a uniform).

## The registry and validator (T33)

Not built yet. Until then: count triangles by hand if a budget is in doubt (`renderer.info` in `?debug`), name
colours with `pal()` (`render/palette.ts`). T33 adds a registry of every model (id, kind, tier, a pure `build()`), a validator that runs in
`npm run check` (budget, palette, texture sizes, shared materials, bounds) and `npm run assets` (the table).

## The viewer, contact sheet and dev shortcuts (T34)

Not built yet. Until then: Dev tab save states, `window.embervale` (teleport, `loadArea`, `activeBoss.forceMove`) and look
scenes ([testing.md](testing.md)). T34 adds `/viewer.html?asset=<id>` (one asset on a turntable under game light),
the `contact` look scene (every registered asset at one scale, the golden set alongside), `?state=<id>` and
`embervale.spawn(id, x, z)`.

## The modeling kit (T35)

Not built yet. Until then: three.js primitives through `mat`/`surf`/`uniqueMat` (`render/materials.ts`), `buildHumanoid`
(`render/characters.ts`), `render/shapes.ts`. T35 adds the builders (beveled box, taper, capsule, lathe, extrude along a
path, mirror, merge, crease-angle normals, palette region paint, crevice darkening, triangle counter, all seeded) and
writes their reference here.

## Visual checks

Every visual change: `looker` on the look scenes it touches ([testing.md](testing.md)), in Native and N64 mode.
Iterate on the scenes that changed; the full run at milestones.

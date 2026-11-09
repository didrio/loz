---
name: final-pass
description: Recipe for a Final pass on an Embervale model (a creature, a character, a boss or a prop): before renders, the kit rebuild, the rig that poses it, tests that prove it plays the same, the validator, renders for the owner. Use when a ticket or the owner says "final pass", "make it final", "do the final version", "art pass", or a golden-set ticket.
---

**Assumes:** models are pure builders in `render/models/` built with the kit (`render/kit.ts`) and `bakeRig`, registered
with a tier, checked by the validator; characters are rigid parts on joints posed by a rig (docs/pipeline.md "The rig
convention"). If the art pipeline changes (imported models, skinning), rewrite or delete this. **Default Run:** plan ·
opusplan · high for a golden-set member or a boss; auto · sonnet · high for the rest once the golden set is locked.

**Read first:** docs/pipeline.md "Final pass", "The rig convention", "The modeling kit"; docs/art.md "Rendering rules",
"Shape language", "The golden set"; the model's file and its behaviour file (grep the pose code if it is big). The
examples: `render/models/thornling.ts` (a creature: `ThornlingRig`, its test) and `render/models/wren.ts` (a
humanoid: `WrenRig`, the crossfade, its own recoloured materials, its test); `render/models/villager.ts` (an NPC: the shared
`person.ts` pieces, `VillagerRig`, the `Npc` handing it `{ near, holding }`).

1. **Ask the owner first** (one AskUserQuestion, up front) whatever is a design call: the look of a character
   (hair, face, outfit, who they are: Wren's gender is deliberately undecided), how far to push proportions toward art.md's chunky shapes, which details to add. The frozen
   list (below) is not up for change without asking either.
2. **Before renders, before touching the model.** A look scene for it in `scripts/look.mjs` (`thornling`, `wren`): every
   state in the game, then the viewer at `angle=0/45/90`. For the player or anything that won't hold still, swap its
   `update` for its pose method alone and set the state's fields by hand (the `wren` scene). Capture Native and
   `--display n64`; copy `look-output/<scene>-*.png` to the scratchpad as "before". Wait out the area's name card.
3. **The model** with the kit: forms first (`lathe`, `taper`, `capsule`, `lowSphere`, `bevelBox`, `extrudePath`), then
   `paint`/`paintRegion` with `pal()` names, `wobble` the big forms a little, `gradient` them (no surface is one flat colour, and every `kitMesh` names a surface tile: owner, 2026-11-08), `crevice` last (`{ foot: 1 }` for parts
   that don't stand on the ground). Round forms get more facets, never smooth normals. Keep every joint the behaviour
   uses, at the same place, with the same rotation order; new joints only the rig touches are fine (eyes, brows, a jaw). `bakeRig` at the end. Materials the game recolours, glows or flashes by hand stay unique
   (`uniqueSurf(surface, pal(...), { vertexColors: true })`, the vertices painted white) and go in `animated`, so the
   bake leaves them alone. Budget: art.md "Budgets"; bevels cost 44 triangles a box, so small boxes get bevel 0.
4. **The rig** in the model's file: a `Pose` (flat numbers), `REST`, `blendPose`, a cue (the behaviour's facts, read only),
   `target(cue)` where each state's look lives, `update(dt, cue)`, and `die(k)` or a death state. Keep the active
   frames: anticipation and overshoot are zero at the ends of the behaviour's windows, so key angles stay put. Idle life
   and blinks on top; trailing parts (hair, cloth) as damped springs if the design has them. Seed any randomness. Squash and stretch: start subtle (≤ ~10%;
   none for people).
5. **The behaviour file** only hands the rig its state: its posing lines go, stats, timings, AI, hurtboxes and hit windows
   stay byte-identical. A constant that was only about the pose moves to the model's file. The existing tests pass
   **unedited**.
6. **Tests** `render/models/<name>.test.ts`: joints where they were, bounds against the rough, the budget; each state's
   look at its key moments (the windup's end, a swing's key angles, the shield where the guard holds it); the death;
   determinism for a seed.
7. **Register `tier: 'final'`** (a seed in the registry's `build`, so the validator's renders don't vary). `npm run check`
   fails any finding on a final asset; `npm run assets` shows the table.
8. **Look** (`looker`): the scene after against the before set, Native and N64, and `npm run look -- contact` in both.
   Iterate on what it reports. Smoke the scenarios that cover the behaviour (docs/testing.md); the full suite only after
   asking the owner, if a shared system was touched.
9. **Report to the owner** with the before/after renders (front, three-quarter, side, one in-game, both modes) and what
   you couldn't judge (motion at speed, feel). **Lock it only on "approve":** add its id to `GOLDEN_SET`
   (`render/models/registry.ts`), list it in art.md "The golden set" with its reference renders (approve the look scene's
   baselines, `scripts/baselines/look/<scene>-*.png`).
10. **Docs:** pipeline.md (the example list), render.md's file list if new files, testing.md (the look scene), the ticket
   deleted at `/wrap`, a "waiting on the owner" line in tickets.md until it is approved.

**Gotchas:** `crevice`'s foot shading darkens from a piece's lowest point, so a hand or a head merged alone goes dark
at the bottom unless `{ foot: 1 }`; a lathe or `extrudePath` piece that should stay open (a hair cap, a rim) wants
`capped: false`; anything placed from another joint's matrix (Wren's shield) must use the pose actually applied, not
the target, or it lags the arm. **Meshes are draw calls:** `bakeRig` makes one per joint per surface, so a small part
with a surface of its own (a buckle, a neckline) costs a whole draw call; paint it into a neighbour's mesh instead
(`npm run assets` shows the mesh count; the look scenes' draw-call budgets catch it). **Never seed a rig from
`Math.random`** for a one-of-a-kind model: it shifts every random number after it (enemy AI, the seeded look runs). Any
model change still shifts them a little (three.js draws a random id per object), so other scenes' enemy shots change
too: rerun a scene that times out on its own before suspecting the code.

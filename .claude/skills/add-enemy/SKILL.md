---
name: add-enemy
description: Recipe for a new enemy type on Embervale (a GroundEnemy subclass with a tell, an attack sheet, tests, spawn and a look shot). Use when a ticket says "add an enemy" / "new monster".
---

**Assumes:** hearts, a sword with hurtboxes, the shield's guard (`Attack` = damage + guard slots),
`GroundEnemy` in `game/enemies.ts`. If combat moves to another model, stop trusting this and
rewrite or delete it. **Default Run:** auto · sonnet · medium (high if the AI is new, not a variant).

**Read first:** [docs/combat.md](../../../docs/combat.md) ("What enemies notice", guards, boss/enemy
fairness), `game/cragstalker.ts` + `render/models/cragstalker.ts` (the model to copy: a small enemy end to end), `game/enemyTestEnv.ts`.

1. **The model** `render/models/<name>.ts`: a pure `build<Name>()` returning a `Model` (`render/models/types.ts`: root,
   named joints, `flashMats`), primitives with `uniqueSurf` and `pal()` colours, no physics or game. Register it in
   `render/models/registry.ts` as `tier: 'rough'` and run `npm run assets` (a test fails if it is not registered).
   **The class** `game/<name>.ts` extends `GroundEnemy`: a state machine (idle → stalk → tell →
   attack → recover → stagger), `hp`, `radius`, `lockHeight`, `deathColor`; it calls the builder, adds `model.root` to
   `this.root`, and pushes `model.flashMats` to `flashMats` so hits flash. Export the attack sheet and timings as consts.
2. **Fair by construction:** every attack has a tell of at least 0.5 s and ends in a recovery that
   is the opening (longer when the shield stopped it). Mark `stone: true` for stone things (the
   Stoneward Tunic halves it). Armor (`armor: true` hurtbox) sits tight on the mesh; answer
   `guarded` for it in `hurt`.
3. **Senses:** follow combat.md: same level, line of sight (World ray), a leash/territory
   predicate. Height checks too, or it hits through floors.
4. **Tests** `game/<name>.test.ts` with `enemyEnv`/`runEnemy`/`flatGround`: the tell lasts its
   minimum, the attack lands the exact sheet, a shield block leaves it dazed, dies to its hp, no hit
   from another floor. Add it to the list in `game/enemyDispose.test.ts` (leaks).
5. **Spawn** from content, never from `world/`: dungeon data type + `content/shrine.ts` (~l.187), or
   an area script like `content/northpass.ts` / `content/gorge.ts` (territory fn, respawn on death,
   `checkpoint rule`: enemies come back).
6. **Docs:** a line in combat.md and testing.md's smoke table; AGENTS.md layout if a new file.
7. **Verify:** `npm run check`; the smoke scenario of the place it lives (add a step: it spawns,
   hits for its sheet, falls to the sword); a `look` scene shot of it (via `looker`).

**Gotchas:** a new enemy must not shift seeded scenery (see engine.md Conventions); lock-on skips
enemies on other floors; you can't judge feel or sound: say so in the report.

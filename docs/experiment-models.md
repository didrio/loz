# Experiment: imported, rigged models (branch `experiment/tripo`)

**Not on main.** AGENTS.md says art is primitives only; this branch tests whether AI-generated, rigged models (Meshy,
Tripo) are worth changing that rule. Owner's experiment, 2026-11-06.

## What's here

- **`render/rigged.ts`**: `loadRig(glbUrl, { name: fbxUrl })` loads a GLB with a Mixamo-named skeleton (`mixamorig*`)
  and Mixamo FBX clips once (cached), `RiggedModel` is one instance (a `SkeletonUtils.clone`, its own mixer, Lambert
  materials so day/night/fog and the hit flash work, and a head-look on the neck and head bones).
  - **Retargeting** (`retargetClip`): Mixamo's skeleton and an auto-rigger's share bone names but not rest
    orientations (up to 158° apart on the Meshy rig), so each bone keeps the clip's world rotation relative to the
    T-pose. Both rigs must be T-posed and face +Z. Tested in `rigged.test.ts`.
  - **Root motion** is stripped (hips keep their bob, not their travel): the game's physics moves the character.
  - Any Mixamo-rigged humanoid can reuse all of it (another model, other clips).
- **`game/grist.ts`**: Grist, the Stonesick: a `GroundEnemy` that starts peaceable (wanders, stops and looks at Wren
  within 4.5 m, keeps animating during dialog via `animatesInCutscene`) and turns hostile when offended or struck.
  Three moves (attack sheet `GRIST_ATTACKS`, timings `GRIST_TIMING`, measured from the retargeted clips' fist
  positions): jab (light), haymaker (guard 3, red glow + inhale tell), sweep (wide, ground-only: jump it).
  Walk/run clip speed follows movement speed (natural speeds measured from the planted foot), so feet don't slide.
- **`content/grist.ts`** + **`content/text/grist.ts`**: placement (ahead-left of the new-game spawn), the talk script
  (lines change with `valleyOpen`; unarmed Wren is sent home), flags `grist.met`, `grist.hostile`, `grist.defeated`,
  checkpoint rule (back after a death, still hostile), gone for good once beaten.
- **Dev states**: "Grist (experiment): after the prism" / "before the prism".
- **Assets**: `assets/experiments/` (GLBs, `mixamo-animations/*.fbx`). Bundled by Vite through `?url` imports.

## Numbers so far

| File | Triangles | Rig | Clips |
|---|---|---|---|
| `tripo-enemy.glb` | 5.7k | Mixamo | standing_relax, walk, run |
| `meshy-enemy.glb` | 3.2k | Meshy bones (`Bone_0xx`) | none |
| `meshy-enemy-latest.glb` (Grist) | 10.6k | Mixamo | Idle_11, Walking, walking_2_inplace, Running, Run_03 |

## Open questions (for the owner)

- Does 10k look better than 5k in the 720-row retro picture? If not, ~5k is the enemy budget.
- An asset script (`npm run models`: gltf-transform simplify + texture resize) once more than a couple of models exist;
  LODs only when a scene has 8+ models on screen.
- Licensing and provenance per model (generator, plan, prompt, date) before anything ships.

# Imported character models (shelved)

**Owner's call, 2026-11-07:** no imported models for now; scenery and characters are built in code (AGENTS.md "Hard
rules"). The tooling from one experiment is kept in `src/labs/rigged/` (nothing imports it) in case that changes.
Don't use it without the owner's OK.

## What's kept

- **`labs/rigged/rigged.ts`** (with tests): `loadRig(glbUrl, { name: fbxUrl })` loads a GLB with a Mixamo-named
  skeleton (`mixamorig*`) and Mixamo FBX clips once (cached; Vite bundles them through `?url` imports). `RiggedModel`
  is one instance: a `SkeletonUtils.clone`, its own mixer, Lambert materials (so day/night, fog and the hit flash
  work), and a head-look on the neck and head bones (`update(dt, target)`, clamped ~70° aside, 30° up or down).
  - **Retargeting** (`retargetClip`): Mixamo's skeleton and an auto-rigger's share bone names but not rest
    orientations (up to 158° apart on Meshy's rig), so each bone keeps the clip's world rotation relative to the
    T-pose. Both rigs must be T-posed and face +Z.
  - **Root motion** is stripped (the hips keep their bob, not their travel): the game's physics moves the character.
  - Walk/run clips should play at a speed matched to movement, from the clip's natural ground speed (measured from
    the planted foot), so feet don't slide.
- **The experiment itself** (Grist, a Meshy model who was an NPC, then a field enemy with three Mixamo attack clips)
  is in git history: commit `6cb7017` (`game/grist.ts`, `content/grist.ts`, `assets/models/grist/`).

## If it comes back

- **Getting a model:** generate with a T-pose, ~5–10k triangles, lighting removed, a 1K colour texture only; auto-rig
  with the Mixamo skeleton; export GLB. Clips from Mixamo: FBX, *without skin*, 30 fps, "In Place" ticked. Files in
  `assets/models/<name>/` (the GLB, and `clips/` for the FBX files). About 7 MB a model with five clips.
- **Measuring a clip** (impact frames, natural speeds): a scratch Node script can load the GLB and FBX with three's
  loaders (`globalThis.self = globalThis` first) and sample the retargeted clip with a mixer.
- Rewrite the art rule in AGENTS.md, move `rigged.ts` back to `render/`, and record each model's provenance
  (generator, plan, prompt, date): Steam needs the AI disclosure and the plan's commercial rights.

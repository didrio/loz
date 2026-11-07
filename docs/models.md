# Imported character models

**Owner's call, 2026-11-06:** characters may be imported, rigged 3D models (AI-generated, e.g. Meshy or Tripo) with
Mixamo animation clips. Scenery stays primitives plus generated textures. Every model's provenance (generator, plan,
prompt, date) gets a line in the table below before it ships; Steam needs the AI disclosure and the plan's
commercial rights.

## How it works

- **`render/rigged.ts`**: `loadRig(glbUrl, { name: fbxUrl })` loads a GLB with a Mixamo-named skeleton
  (`mixamorig*`) and Mixamo FBX clips once (cached; Vite bundles them through `?url` imports). `RiggedModel` is one
  instance: a `SkeletonUtils.clone`, its own mixer, Lambert materials (so day/night, fog and the hit flash work), and
  a head-look on the neck and head bones (`update(dt, target)`, clamped ~70° aside, 30° up or down).
  - **Retargeting** (`retargetClip`): Mixamo's skeleton and an auto-rigger's share bone names but not rest
    orientations (up to 158° apart on Grist's rig), so each bone keeps the clip's world rotation relative to the
    T-pose. Both rigs must be T-posed and face +Z.
  - **Root motion** is stripped (the hips keep their bob, not their travel): the game's physics moves the character.
  - Walk/run clips play at a speed matched to movement, from the clip's natural ground speed (measure it from the
    planted foot), so feet don't slide.
- **Getting a model** (the owner's flow): generate with a T-pose, ~5–10k triangles, lighting removed, a 1K colour
  texture only; auto-rig with the Mixamo skeleton; export GLB. Clips from Mixamo: FBX, *without skin*, 30 fps, "In
  Place" ticked. Files go in `assets/models/<name>/` (the GLB, and `clips/` for the FBX files).
- **Measuring a clip** (impact frames, natural speeds): a scratch Node script can load the GLB and FBX with three's
  loaders (`globalThis.self = globalThis` first) and sample the retargeted clip with a mixer.

## Grist, the Stonesick (`game/grist.ts`, `content/grist.ts`, `content/text/grist.ts`)

The first one: a stone-turning wanderer who is first an NPC and then, once offended, a field enemy.
- **NPC:** wanders ahead-left of the new-game spawn (`GRIST_HOME`), stops and looks at Wren within 4.5 m, talks with
  the two Mixamo talking clips (he animates in his own dialog: `animatesInCutscene`, but freezes in other cutscenes).
- **The talk:** lines follow `valleyOpen`; any answer about the shrine offends him (`grist.hostile`), "Leave" parts on
  good terms; unarmed Wren is sent home (no fight without a sword). A sword hit while he's peaceable also starts it.
- **The fight:** `GRIST_ATTACKS` / `GRIST_TIMING` (timings measured from the clips' fist positions): jab (light),
  haymaker (guard 3; red glow and an inhale as the tell), sweep (wide, ground-only: jump it). A blocked blow dazes
  him. 10 hp; beaten, he sinks away and drops two blue gems and a heart (`grist.defeated`, gone for good, like a
  boss). After a death he's back at his spot, still hostile.
- **Dev states:** "Emberfield: Grist, after the prism" / "before the prism".

| Model | File | Triangles | Rig | Clips | Source |
|---|---|---|---|---|---|
| Grist | `assets/models/grist/grist.glb` | 10.6k | Mixamo | GLB: Idle_11, Walking, walking_2_inplace, Running, Run_03; Mixamo: Talking 1/2, Attack Normal Punch, Attack Big Punch, Attack Sweep | Meshy (owner); plan and prompt: *to record* |

## Open questions

- Does 10k look better than ~5k on screen? If not, ~5k is the enemy budget.
- An asset script (`npm run models`: gltf-transform simplify + texture resize) once there are several models; LODs
  only when a scene has 8+ models on screen.
- Download size: each model with clips is ~7 MB; watch the browser demo's total.

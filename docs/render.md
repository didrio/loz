# Render

The look's code: what each `render/` file does, the sun's shadows, the Display modes and the generated textures. The style bible (what it should look like) is [art.md](art.md); the frame loop and everything else is [engine.md](engine.md).

## Render files

 `palette.ts` (the master palette: `pal`, `snap`, area sub-palettes), `materials.ts` (shared/unique, `surf` textured, snapped to
the palette, static merging), `bakeLight.ts` (baked bounce light into vertex colours, world-wide, live strength: engine.md "Baked light") + `bakeGather.ts` (its rays, pure) + `bakeWorker.ts`/`bakePool.ts` (the background threads that run them), `textures.ts` (generated detail tiles, the projection
shader), `shapes.ts`, `kit.ts` + `bakeRig.ts` (the modeling kit: docs/pipeline.md), `effects.ts` (the named particle presets, the cap, `SlashTrail`), `characters.ts` (the `Humanoid` joints type the player holds), `atmosphere.ts` (each place's sky,
light, fog, motes and sub-palette as data), `sky.ts` (blends them; the blight look), `shadows.ts` (the sun's shadow map: the Settings' Shadows option; texel
snapping, what casts), `particles.ts`, `motes.ts`, `sconceGlow.ts` (the dungeon's sconce flames: flicker and rising dust, one `Points`), `roomDust.ts` (a room's drifting dust, one `Points`; the Hall's), `icons.ts` (`Icons`: a registered model drawn once offscreen onto a transparent PNG, cached; the Gear tab and the HUD's flask and glove use the `gear-*` models in `models/gear.ts`), `retro.ts` (the Display modes: N64's 240-row target, dither + colour crush; Native/Performance/Auto pixel ratio), `autoResolution.ts` (Display → Auto's controller, T58), `grade.ts` (the grade: folded into the materials' tone mapping, or the pass; T66, T58).
`models/` holds every model as a **pure builder** (no physics, no game: `thornling.ts` (final: kit-built, its `ThornlingRig` and `Pose`), `gloomwisp.ts`, `sentinel.ts`, `shellback.ts`, `cragstalker.ts`,
`lamplighter.ts` (final, T54: the kit model and `LamplighterRig`, every look of the fight), `gravelheart.ts` (final, T55: the kit model and `GravelheartRig`, every look of the fight), `props.ts` (final: the chest, T52's jar and sign; rough: vessel, shield, lantern, bush), `doors.ts` (final, T52: the hinged plank door and the shrine's stone slab with its unbaked glyph), `nature.ts` (final, T51a: the field tree, pine, rock and grass tuft the valley instances, tinted per instance by palette swatch; the lone oak), `village.ts` (final, T51b: the two cottages, the well, the fence post and rail, the lantern post, the barrel and the crate, as Thistledown's merged scenery), `mill.ts` (final, T51c: the windmill's outside, its turning sails, Odo's stall), `ruins.ts` (final, T51c: a ruined home from the world's wall list), `wren.ts` (Wren, final: the kit model and `WrenRig`; and the NPC stand-in `buildPerson`)),
`types.ts` (`Model`: root, named joints, flash materials), `registry.ts` and `validate.ts` ([pipeline.md](pipeline.md) "The registry and validator").

## Sun shadows (`render/shadows.ts`, T46)

**Settings → Shadows** (`Settings.shadows`; default On on desktop, Off where `wantsTouch()`). `ShadowRig` (made by `Game`; `configure` from `applySettings`,
`update(dt, indoor)` each frame after `Sky.update`) owns the sun's shadow camera: a second camera at the sun that records only depth.
- **One map, one light.** `sky.sun` is the sun by day and the moon by night, so moon shadows come free and weaker. A ±`SHADOW_RADIUS` (24 m) box follows Wren;
  **outdoors only** (`area.indoor` turns it off: dungeons and houses keep blobs). `shadowIntensity` fades it out as the sun nears the horizon.
- **No shimmer, no acne.** `snapToTexel` moves the light onto the map's texel grid; `bias` and `normalBias` stop faceted faces shadowing themselves.
- **Casting** (`castsShadow`/`receivesShadow`): every solid lit mesh; not glows, glass, trails, blobs, the sky or anything transparent (those may still
  receive). `userData.noShadow` opts out. `mark()` flags the scene on area load and every 0.25 s, so spawned enemies join in with no constructor changes.
- **Blobs.** `GroundShadow(..., 'character')` hides while `blobConfig.realShadows`; `'marker'` blobs (orbs, wisps, stones) always stay.
- **Display modes.** `shadowMapSize`/`shadowMapType`: N64 a small unfiltered map (hard, blocky edge), Performance 1024, Native 2048 (1024 on touch), filtered.
- Look and smoke runs plant Shadows **off**; `npm run look -- <scenes> --shadows` captures with it on ([testing.md](testing.md)).

## Display modes (`render/retro.ts`, T28)

One **Display** setting (Settings, `Settings.display`): **Native** (0, the default on desktop), **Performance** (1), **N64** (2) and **Auto**
(3, the default on touch devices since T58). See [art.md](art.md) "Display modes" for the target look. Think of N64 as a bitcrusher on the image: the internal height is the sample rate,
`COLOR_LEVELS` the bit depth.
- **Native / Performance** draw straight to the canvas, antialiased, at `pixelRatioFor(display, devicePixelRatio)`: Native = the screen's own ratio (cap 3, on touch 2,
  so 2 on a retina laptop); Performance caps it at 1. No sharpening filter. A `matchMedia` watch resizes when the window moves to a screen of another density.
- **N64** makes `Game.frame` call `RetroPipeline.render`: the scene goes to a **linear-filtered, un-antialiased** target `N64_ROWS` (240) tall, width from the
  window's aspect (`internalSize(display, w, h)`, with the window in device pixels at the canvas ratio, cap 2; never more rows than the canvas has). A
  composite pass converts to sRGB (`<colorspace_fragment>`) and **crushes each channel to `COLOR_LEVELS` (32) with a 4×4 Bayer dither** on the *internal* pixel
  grid, then the canvas upscales it softly. **No bloom.** The HUD is DOM and unaffected. `RetroPipeline` turns `renderer.info.autoReset` off (two draws a frame),
  and `Game.resize` turns it back on for the other modes.
- The pure parts (`bayerOffset`, `crushChannel`, `internalSize`, `pixelRatioFor`, the settings migration in `core/save.ts`) are unit-tested; the shaders are
  not (no GL in tests): look at them. The look runner captures a mode with `--display n64` ([testing.md](testing.md)).
- **Auto** (3, T58, the default on touch; owner's call: Native's sharpness when the device holds it): `pixelRatioFor` gives Native's cap, and
  `AutoResolution` (`render/autoResolution.ts`, pure, tested on simulated phones) picks the ratio between 1 and that cap in quarter steps from
  each frame's timestamp (`Game.frame`; a change calls `resize`). Under 50 fps for a second it steps down to the level nearest √(fps/58)
  of the ratio; it keeps stepping while frames are no faster (vsync makes frame rates jump in steps), and if even 1× is no faster the pixels
  weren't the bottleneck (game code, a 30 Hz low-power screen): back to the top, held a while, longer each time. At 57+ fps for 3 s it tries a
  step up; one that drops frames goes back and that level waits (15 s, doubling to 4 min). After an area loads it doesn't judge for 2.5 s.
  Its index is 3 so saves keep theirs; the Settings capsule lists Auto first (`DISPLAY_ORDER`). Touch smoke and look pages plant Performance
  (their old default), so baselines hold.
- Settings saved before Display migrate: a retro look on → N64; Balanced or Performance resolution → Performance; else Native (the oldest Sharpness:
  sharp → Native, else Performance; the retro look's old default Soft 720, never chosen, counts as off). Gone: Resolution, Retro look, Balanced, `Sky.retro`'s warm haze.

## Look experiment (`render/experiments/`, T62)

An **experiment to inform a decision** (owner, 2026-11-09): how much of a "modern" look comes from lighting and how much from
models. It breaks art.md's rendering rules on purpose (PBR, SSAO, tone mapping) and **art.md is unchanged**. **Modern lighting is now on by default** (owner's call, 2026-11-09, below); the rest is off. All of it is in
**Dev → Look experiment (T62)** (never saved; only a page load resets tweaks, and the pinned Default switch shows the defaults: engine.md "Defaults and reset"):
- **Barrels**: built by the `lookExperiment` builder Thistledown leaves on its dynamic group (`world/overworld/village.ts`), north of today's barrel at the clutter spot
  (4, 9; layout in the T65 bullet): the photoreal barrel (`realBarrel.ts`, 1.7×, ~0.4 M triangles) and the **modern-stylized** one (`modernBarrel.ts`, today's
  size, ~2.8k triangles, smooth and rounded, Standard materials with a small grain shader). **Nothing is made until switched on**
  (built once, lazily; `ModernLook` makes its own objects lazily too): every three.js object draws random numbers for its id, so
  even an empty hidden Group would shift the seeded look shots. The shipped scene, baselines and budgets don't see any of it. No colliders (layout freeze). Both wear their own
  sky cube (`skyEnv.ts`, `userData.ownEnv`).
- **T65: how close to photoreal a phone allows** (owner, 2026-11-09: "everything but the ground at this standard, 60 fps on a
  2–3-year-old phone"). Three more barrel types, built at the game barrel's size (1 m, 0.48 m belly) on one
  generated body (`barrelBody.ts`: separate staves with V-grooves, 4 hoops, a 5-board head, a bung, one UV atlas, the photoreal
  shader's attributes): **live** (the photoreal shaders on every pixel), **baked** (the same shaders run **once** into three
  1024² textures: colour, roughness/metalness, an object-space normal; then a plain Standard material, one draw call;
  `barrelBake.ts`) and **bakedRich** (the same baked, on a 3.4× richer shape: rounded stave edges, rounder hoops, rivets).
  The bake draws the body flat in its atlas (each vertex at its uv), so the shader's own anti-aliasing fits the texel size, then
  dilates each chart into the gutters. Look scene `modernBarrels` (testing.md).
  **Layout (owner, after the first renders):** every experiment barrel at the photoreal one's size (1.615 m: its 0.95 m × 1.7;
  "every barrel in the game should be the larger one's size", for T67, since shelved with modern props), a **row of four per type** north of today's barrel,
  nearest first: baked, bakedRich, live, modern, photoreal (rows 3 m apart, barrels 2.2 m). The dev panel has a **switch per type**
  (Barrels: modern / live / baked / baked rich / photoreal; `BARREL_SWITCH`), each type's row built the first time it is switched
  on (clones share geometry, materials and the bake), so a phone can be timed one type at a time by walking closer; touch
  opens the dev panel with the **Dev** button beside ☰ (engine.md).
  **Budget (owner's call, 2026-11-09):** a prop ≤5k triangles, 1–2 draw calls, its surface baked; 60 of them at play distance
  plus one close-up add ≤1.5 ms on the M3 Pro at phone size (a phone's GPU taken as ~4× slower, so ≈6 ms of a 16.6 ms frame; the
  ×4 is an assumption until T58 measures a phone).
  **What carries the look** (the A/B on the photoreal barrel, noon close-up):

  | Taken away | Difference |
  |---|---|
  | The per-pixel surface (flat wood and iron instead) | **Huge**: a grey-tan barrel with black bands, the game's own flat look |
  | The bump (relief) | Barely visible: the hoops a little flatter |
  | Varied roughness and metalness (one value each) | Barely visible: a duller sheen on the hoops |
  | Its shape (the 0.4 M-triangle staves → the 4.4k body, same surface) | Small: baked reads almost like it; the photoreal one still has more contrast and specular, and its 1.7× size shows more detail |
  | 3.4× more shape (bakedRich vs baked) | Small: a rounder belly, prouder hoops; rivets and rounded edges don't show |
  | 1024² → 512² textures | None visible up close |

  So **the surface's colour carries the look**, and a baked texture keeps it. **Cost** (`npm run look -- modernBarrels`, M3 Pro,
  modern lighting at the game's defaults, noon, every barrel at the photoreal one's 1.615 m; Δ against the same frame without
  the barrel; a single close-up is within the noise, ±0.1 ms, except where shown):

  | Barrel | Triangles | Draw calls | Textures | Close-up Δms (phone / 1080p) | 60 at play distance Δms (phone / 1080p) | Budget |
  |---|---|---|---|---|---|---|
  | modern | 2,784 | 2 | 0 | ~0 / ~0 | 0.48 / 0.73 | yes |
  | live | 4,360 | 2 | 0 | 1.55 / 2.23 | 8.38 / 10.23 | no (≈6× the budget) |
  | **baked** | 4,360 | 1 | 16 MB (4 at 512²) | ~0 / ~0 | 0.83 / 0.75 | **yes** |
  | bakedRich | 14,752 | 1 | 16 MB | ~0 / ~0 | 1.13 / 1.15 | ms yes, triangles no |
  | photoreal | 475,824 | 3 | 0 | 6.73 / 8.70 | ≈130 / ≈170 (10 measured) | no |

  (At the game barrel's 1 m size, the first run: baked 0.35 + 0.58 ms at phone size, live 1.72 + 5.45.)
  **Bake time:** the first bake 2.2 s (nearly all compiling the photoreal shader once), each one after ~85–105 ms, on the M3 Pro; a
  phone compiles slower, so bakes belong behind a load screen or in idle frames. **Memory** is the real limit: 16 MB per prop
  *type* at 1024², 4 MB at 512² (RGBA8 + mipmaps, 3 maps); 512² showed no loss at a close-up.
  **Known flaws:** faint pale hairlines between staves on the baked ones up close (most likely filtering averaging the two
  staves' sloped edge normals at each groove: inset each stave's uv by a texel, or bake the groove darker); no contact shadow
  under props at noon (corner shade is off by default); the heads read murky and dark. At play distance live, baked and
  bakedRich can't be told apart.
- **Modern props shelved** (owner's call, 2026-11-09, after T69). **Assets stay at today's kit level** (art.md, pipeline.md); the
  barrels above stay behind their switches as a record. T69 built Maren twice on one smooth body at stylized-modern proportions:
  **modern** (flat colours, Standard material) and **baked** (procedural skin, cloth, leather and hair baked into a 1024² atlas, with
  baked occlusion). Both fit the prop budget (4.6k triangles, 1 draw call; a crowd of 20 cost less than the measurement's noise)
  and couldn't be told apart at play distance, but **neither looked good as a person**, while the game's chunky villager stays
  charming. Its code was removed before it was ever committed; this note is the record.
- **Modern lighting** (`modernLook.ts`, `ModernLook`; never in N64): every `MeshLambertMaterial` in the scene is swapped for a cached
  `MeshStandardMaterial` twin (`twinOf`: colour and emissive shared by reference so flashes show, the surface patch carried over, metal
  gets metalness), rescanned every 0.25 s; `scene.environment` is a PMREM painted from the sky dome's colours (indoors the hemisphere
  light's), redrawn when they move; the hemisphere light keeps `HEMI_KEEP` of its strength. Frames go through an `EffectComposer`:
  render → GTAO at half resolution (Corner shade) → `UnrealBloomPass` → `OutputPass` (tone mapping: Neutral / AgX / ACES, Exposure).
  `Game.drawFrame` picks the pipeline. (Lambert alone can't do it: in three r187 it takes `scene.environment` as light but also runs
  the old multiply-by-reflection path, which tints everything.)
- **Smooth shading** (`smoothMeshes`): non-indexed geometry gets `toCreasedNormals` at 50° (8-sided barrels go round, boxes stay
  hard), `flatShading` off; switching off gives back the saved normals exactly. Textures don't move (they project on `surfNormal`).
- **Cost** (T62, M3 Pro GPU, the village square at noon, ms per frame with the GPU waited for): 1920×1080 off 9.6, lighting without
  post 10.9, + corner shade 16.1, + bloom 19.2; at a phone's pixel count (1688×780) 7.1 → 13.9. Corner shade renders the scene a
  second time (draw calls and triangles ×2). Smooth shading's flip: 30-45 ms once. The post-processing modules load on first use
  (importing them makes objects, which would shift the seeded look shots; the first frames after switching on are plain). A phone's GPU will be several times slower: measure
  **Measured later (2026-11-09, same scene, look window 1280×720 with the experiment barrels, ms):** lighting without post 14.6, + corner shade 22.1, + bloom 33.5 (bloom is ~10 ms however it is sized: it is a dozen small passes, and each pass is costly on this GPU). **The 4× multisampled half-float buffers are the biggest single cost:** with them off the same steps read 12.0, 12.9 and 22.7; Dev → Look experiment → **Anti-aliasing (modern)** (Off / 2× / 4×, default 4×, today's look) lets the owner try it live (2× barely helps; Off saves about 2.6 ms without post and about 8 ms with corner shade). Bloom runs at half resolution (`HalfBloomPass`, saves ~1.5 ms). **Corner shade fades with the fog** (`GTAO_BLEND_FRAG`: it is multiplied over the finished frame, fog included, so before this it darkened the far trees fog should hide; the darkening of the far distance fell about 75%, near and mid-distance unchanged).
  **Defaults (owner's call, 2026-11-09, revised the same day for T66): classic lighting is the game's look again** (modern was too heavy on a phone; it stays one dev-panel switch away). Smooth shading off, **the owner's grade (tuned by eye in classic, 2026-11-09): Highlight curve Neutral, Exposure 2.00, Gamma 1.25, Highlights -1.00, Contrast 1.15, Saturation 0.90** (the Exposure slider reaches 4), Sky light 1, Corner shade 0, Bloom 0, Anti-aliasing Off. The owner's earlier modern-lighting tuning was Saturation 0.9 with Neutral. The look and smoke harness needs no flag any more: every baseline is the default.
  **The grade (T66, `render/grade.ts`) works in every look.** Dev → Look experiment: **Exposure**, **Highlight curve** (Auto = Neutral under modern lighting, none under classic; Neutral / AgX / ACES / Off), **Gamma** (mid-tones; black and white stay), **Highlights** (-1 pulls the brightest areas down by up to half, +1 pushes them up), **Contrast** and **Saturation**; all in `LOOK`. How each look applies it: modern lighting in the composer's output pass (`withGrade`, no extra pass); classic Native, Performance and Auto **folded into every material** (T58, below); N64 inside the retro composite, before the colour crush (exposure and the grade; **no tone curve** in N64). A neutral grade (`isNeutral`) is the plain `renderer.render` and costs nothing. The look and smoke harness sets `__embervaleNeutralGrade` (scripts/browser.mjs) so `LOOK` starts neutral there: baselines and budgets stay the ungraded picture.
- **The folded grade (T58).** `foldGrade(LOOK)` (Game's constructor, before any shader compiles) writes the grade into three's `CustomToneMapping` chunk (the curve, then `gradeApply`, the dials as constants; exposure stays live), and `renderFolded` draws a classic frame with `renderer.toneMapping = CustomToneMapping` for that render only, so each lit pixel is graded as it's drawn: **no half-float target, no second full-screen pass**. Measured at phone size (844×390 at 3×, 2× canvas, M3 Pro): the pass cost 1.1-1.6 ms of a 2.3-3 ms frame (~+45%); folded is within noise of no grade. Three things keep it matching the pass (A/B: mean difference 0.5-1.9 levels of 255, against 6-11 before them): three mixes fog *after* tone mapping, so on a tone-mapped frame the fog moves before the curve (`tonemapping_fragment`/`fog_fragment` patched; the fog colour is handed over linear for that frame); see-through pixels re-weight their alpha (`LINEAR_BLEND_ALPHA`: a bright layer like α^(1/2.2), a dark one like 1-(1-α)^(1/2.2), so blob shadows and glass blend as they did in linear light); additive glows (`fadeInFog`, marked `FADE_IN_FOG`) take their opacity before the curve. What still differs a little: the river's water is a touch deeper blue, and lantern glows are slightly brighter, with the lantern visible through them. The chunks are global but only act while tone mapping is on (the folded frame); `foldGrade` throws if three's chunks change shape (tested).
- **The pass stays for tuning:** while the dev sliders differ from the folded values (`canFold`; exposure aside), classic draws through `GradePass` (the scene into a half-float target, multisampled where the canvas is, then one output pass) until they're back. Dev → **Grade as a pass (old)** forces it, for an A/B (`Game.gradePass`). The maths is `gradeColor` (tested) and the shader `GRADE_GLSL` mirrors it. "Off" is three's Linear mapping, which multiplies by the exposure (three ignores exposure under NoToneMapping). Why contrast and saturation exist: **AgX** keeps colours natural (bright saturated colours drift toward white instead of turning neon), but its curve lifts the darks and drains the colour, so the frame stays as bright yet looks washed out. Measured on a noon village frame: Neutral darkest-10% 69, saturation 103; AgX 96 and 57; AgX with Contrast 1.35, Saturation 1.4 (Blender's own "Punchy" look on top of AgX) 65 and 110, but 15% darker overall, so raise Exposure with it.
  there before deciding. `npm run look -- modernLook` re-measures and shoots the comparison.
- **To remove it:** delete `render/experiments/`, the `lookExperiment` block in `village.ts`, the `ModernLook` lines in `game/game.ts`,
  `domeColors` in `sky.ts` if nothing else reads it, `embervaleLook` in `main.ts`, the submenu in `pauseMenu.ts`, the `modernLook` and `modernBarrels` look scenes.

## Textures (`render/textures.ts`, T19)

- **Never `flat` varyings in the surface shader** (T44): `vSurfNormal` as `flat varying` made Metal (ANGLE, Mac GPU) fail with GL_OUT_OF_MEMORY and lose the WebGL context, so frames went black with no console error. A face's vertices share one normal, so smooth interpolation is identical. A black look shot with no error: check `webglcontextlost` and the console's warnings.
Generated in code, never imported (owner's call, 2026-11-06). A texture is a small grey **detail tile**: a single channel with
mean ~128. It only brightens or darkens the material's own colour (`colour × (1 + strength·(t − 0.5)·2)`), so one tile
serves every colour of that surface, and the palette, the blight and the N64 crush behave as before. Think of it as a
send effect on a channel, not a new instrument.
- **Placed by position, not UVs** (`mergeStatic` drops UVs). The patched Lambert shader projects along each face's own normal,
  read as a `flat` value from its own attribute, `surfNormal` (`faceNormals(geo)` writes it; lighting is flat, but the attribute keeps the projection independent of `normal`). `mergeStatic` adds it to textured meshes and `buildTerrain` to the ground. A mesh without the attribute
  falls back to its `normal` (right for boxes); a dynamic textured cone or cylinder needs `faceNormals` too (or its tile tilts). Not screen derivatives: their float error times world coordinates (~150 m) smeared the tile. **Walls**: u runs along the
  wall and v up, so turned houses don't stretch and courses stay level. **Slopes** (roofs, hills): v runs downhill.
  **Flat tops**: x and z. Merged statics are in world space; a moving mesh keeps its tile. Corners don't line up (fine at this
  resolution).
- **Scale and resolution are separate** (owner's call, 2026-11-07). **Scale** is how big a tile's pattern is in the world, authored with the
  tile (`TILE_METRES`: metres per repeat; every tile is 2 m, the ground's 4 m, so far): a dungeon of small red bricks and one of big
  stone blocks are two tiles, and nothing global rescales them. **Resolution** is how many pixels draw the pattern, one global number
  of whole texels per metre (`textureResolution`, default 32 = full detail, owner's pick, range 1–32; the tiles are drawn at 32/m, so more
  can't add anything). Each tile is drawn once at full detail (`TILE_SIZE` px) and shrunk to the current resolution by `downsampleTile`, which
  never blends texels (each new texel takes the most distinctive source texel in its cell, then mean and spread are restored), so every
  value is crisp, not only 32 (averaging smeared one-texel lines at ratios that aren't whole). Lowering it makes everything blockier with
  the same bricks, cracks and planks in the same places; at big reductions a very thin line can drop out. The dev panel's slider calls `setTextureResolution`, which rebuilds the GPU textures live. Up close the filter is nearest
  (crisp chunky texels; the owner tried bilinear in T30 and found it too blurry); far off it's mipmapped (no sparkle).
- **Surfaces** (`SURFACES`): `plaster`, `stone` (hand-laid courses: bevelled blocks, rounded or chipped corners, a gritty mid-dark mortar that wanders, thickens and wears, pits, cracks, a wall-wide stain), `wood` (planks running along v, seams that wander a texel), `shingle` (rows across a
  slope), `ground` (clods in flat contoured tones, lit pebbles with a cast shadow, tufts, dry cracks; a rock tile on steep faces), `rock` (angular slabs wider than tall, each lit upper-left and stepped into flat bands, gritty crevices that widen where worn, rims toward and away from the light; on the shared `cellField` helper), `bark` (furrows up the trunk), `foliage` (leaf clumps with a shadow under each far rim, glints, low strength; also `cellField`), `metal` (brushed plates, worn seams, rivets), `thatch` (overlapping straw bundles with ragged, sagging lower edges, drifting straws, stray straws), `cloth` (a plain weave in 2-texel threads, soft folds, a stitched hem: tents, awnings, sacks, clothes), `leather` (pebbled grain, creases, a stitched seam: boots, belts), `hide` (patchy, with hair strokes and scars: enemy skin), `scales` (rows of overlapping shield-shaped scutes drawn bottom-up with a cast shadow, 1.5 m tile: the Shellback's shell), `skin` (soft mottling, fine pores, freckles; a very low strength, so faces never look noisy). `faceted(geo)` readies a dynamic cone/cylinder/sphere for a tile. Each sets a top tile, a side tile and a `strength`.
  Tiles are pure `(size, seed) → Uint8Array` drawings (`drawTile`), unit-tested for determinism, mean (no colour shift),
  spread and seamless wrap.
- **Use**: `surf('plaster', 0xeadcbc)` instead of `mat(0xeadcbc)`; `surf(kind, colour, emissive)` for a glowing textured thing (the signs). It's shared and cached like `mat`, so never mutate it.
  `applySurface(material, kind)` is for materials of your own: the terrain's vertex-colour material (so **all terrain**,
  valley and regions, is textured) and the mill's BackSide inside. Small bits stay plain: flowers, knobs, glows, windows.
- **Cost**: six tiles under 100 KB with mips, and one shader program shared by every textured material (`customProgramCacheKey
  'surface'`). Since T30 merged scenery batches by kind (plain / each surface / emissive), not by colour, so using a colour both
  plain and textured no longer costs a draw call. Done: the village, all terrain and the dungeons' structure (floors, walls, ceilings, stairs, pillars). T43 did the leftovers (signs, tent door, Northpass rocks, prism and iron fittings). T41 did the living (below).
- **The living** (T41): characters, enemies and bosses use `uniqueSurf(surface, colour, extra?)` (`uniqueMat` + `applySurface`) for anything that flashes or fades, and `surf()` for the shared humanoid
  clothes. Hit flashes are `emissive`, fades `alphaHash` and the blight a tint, none of which touch the tile. A textured *curved* piece (cylinder, sphere, cone, torus) must be `faceted()` (a box or icosahedron
  needn't be); `livingTextures.test.ts` fails otherwise. `cloneMaterial()` (not `.clone()`, which drops the shader patch) is for a copy that must keep its tile (Wren's fade). Only eyes, glows and teeth stay plain (skin has its own tile, hair uses `hide`). Maps so far: people cloth/leather/skin/hide (hair); Wren's sword and shield metal/leather/wood; Thornling hide + bark; Sentinel stone/rock; Shellback scales/rock/hide; Cragstalker rock/hide; Lamplighter cloth/metal/wood/plaster (bone, mask, candles); Gravelheart rock for its blocks and pebbles, stone for the carved mask, the forearm stones, the chest plates and the keystone (its thrown stones are `DodecahedronGeometry` rocks like the overworld's, `hazards.stone`); Gloomwisp plain (it is all glow). A new enemy follows the same pattern.
- **Everything is textured unless justified** (owner's call, 2026-11-07, after T41): `world/texturesEverywhere.test.ts` builds the valley, the Northpass and the shrine with `mergeAudit` on and fails on any plain static
  mesh. Justified (the test lets them through): it glows (any emissive), it is the void colour (`0x18151b`: a black doorway, a well's bottom), or it is a tiny accent (< 0.3 m: flower petals). Water waits for its own ticket, and
  **Sallowmere** (stands empty, the owner is redesigning it) isn't covered: texture it in its redesign (`surf(...)`: stone/wood/plaster/foliage as in the valley). Things that aren't merged statics (NPCs, chests, doors, pickups, enemies)
  aren't covered by that test: when you add one, texture it the same way (`surf`/`uniqueSurf`, `faceted` for curves). Left plain on purpose: window glass, sign writing and tablet lines, eyes, door keyholes, gems and glass lamps, glyph rings, the flames.
- **Look baselines barely see a texture**: they're shrunk 4× by averaging, and a tile averages to grey. Judge a texture
  change on the full-size shots in `look-output/`, by eye.
- **Joints are never black rules** (owner's call, 2026-11-09: perfect dark lines read as a grid and cheap). A seam, mortar line or gap is a mid-dark, gritty tone only ~0.25 below its neighbours, wanders or kinks a texel, and has a lit edge on one side. It is also a matter of contrast budget: `finishTile` normalizes the spread, so a near-black joint uses it all and leaves the blocks flat. `textures.test.ts` fails a stone, planks, shingle, rock, scales, thatch or cloth tile with a full-length dark line or clamped black. Metal's plate seams stay straight (made things) but worn. **Judge a tile on a big lit face seen close** (a dungeon pillar next to the camera), not only a wall: the first brick redraw's one-texel edge wobble looked fine on walls and read as stair-step noise on a pillar until the sag was made slower and the kinks rarer.
- **A new tile**: a drawing function in `DRAW` (periodic noise via `periodicNoise`/`fbmTile`; structure like `cuts` for courses
  and planks, wrapping with `wrap`), a size in `TILE_SIZE`, and a `SURFACES` entry. The tests cover it automatically.

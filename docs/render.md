# Render

The look's code: what each `render/` file does, the sun's shadows, the Display modes and the generated textures. The style bible (what it should look like) is [art.md](art.md); the frame loop and everything else is [engine.md](engine.md).

## Render files

 `palette.ts` (the master palette: `pal`, `snap`, area sub-palettes), `materials.ts` (shared/unique, `surf` textured, snapped to
the palette, static merging), `bakeLight.ts` (baked bounce light into vertex colours, world-wide, live strength: engine.md "Baked light") + `bakeGather.ts` (its rays, pure) + `bakeWorker.ts`/`bakePool.ts` (the background threads that run them), `textures.ts` (generated detail tiles, the projection
shader), `shapes.ts`, `kit.ts` + `bakeRig.ts` (the modeling kit: docs/pipeline.md), `effects.ts` (the named particle presets, the cap, `SlashTrail`), `characters.ts` (the `Humanoid` joints type the player holds), `atmosphere.ts` (each place's sky,
light, fog, motes and sub-palette as data), `sky.ts` (blends them; the blight look), `shadows.ts` (the sun's shadow map: the Settings' Shadows option; texel
snapping, what casts), `particles.ts`, `motes.ts`, `sconceGlow.ts` (the dungeon's sconce flames: flicker and rising dust, one `Points`), `roomDust.ts` (a room's drifting dust, one `Points`; the Hall's), `icons.ts` (`Icons`: a registered model drawn once offscreen onto a transparent PNG, cached; the Gear tab and the HUD's flask and glove use the `gear-*` models in `models/gear.ts`), `retro.ts` (the Display modes: N64's 240-row target, dither + colour crush; Native/Performance pixel ratio).
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

One **Display** setting (Settings, `Settings.display`): **Native** (0, the default on desktop), **Performance** (1, the default on touch devices) and
**N64** (2). See [art.md](art.md) "Display modes" for the target look. Think of N64 as a bitcrusher on the image: the internal height is the sample rate,
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
- Settings saved before Display migrate: a retro look on → N64; Balanced or Performance resolution → Performance; else Native (the oldest Sharpness:
  sharp → Native, else Performance; the retro look's old default Soft 720, never chosen, counts as off). Gone: Resolution, Retro look, Balanced, `Sky.retro`'s warm haze.

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
  the same bricks, cracks and planks in the same places; at big reductions a very thin line can drop out. The Dev tab's slider calls `setTextureResolution`, which rebuilds the GPU textures live. Up close the filter is nearest
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

# Art direction (the style bible)

**N64 assets, modern presentation** (owner, 2026-11-07, from the "Art Direction & Asset Pipeline Proposal"). Every asset
follows Ocarina of Time / Majora's Mask-era rules: chunky low-poly geometry, small soft textures, colour-and-shade in the
vertices, fog. The game is then shown the way most people replay those games today: on an emulator at high resolution
and a smooth frame rate. The goal is that players feel the way they did playing OoT for the first time: a new adventure
that looks the way people *remember* the N64, not the way it literally looked.

- **Reference:** OoT and MM, upscaled. Modern indie benchmarks: *Corn Kidz 64*, *Cavern of Dreams*.
- **Not:** the 3DS remake's busier detail, Wind Waker (cel bands), Twilight Princess, or a glossy, over-polished low-poly indie look. (Genre feel only: never a specific game's designs, AGENTS.md "Hard rules".)
- **How we build it:** [pipeline.md](pipeline.md) (Rough and Final passes, the registry, the checks). The rebuild of
  everything that exists starts with the foundation tickets T34–T39 ([tickets.md](tickets.md)), then the golden set and the rest
  ([roadmap.md](roadmap.md) "The N64 look rebuild").

Each section says **today** (what the code does now) and **target**. Until a ticket moves a section to the target, don't
extend the "today" look: build new work so it moves toward the target.

## Rendering rules

| Rule | Today | Target (ticket) |
|---|---|---|
| Lighting | Lambert, per pixel | Same: soft diffuse Lambert. Per pixel is fine; the look matters, not the method |
| Shading | **Flat, faceted** (owner's call, 2026-11-07, after trying smooth in T30: rounded cones and cylinders lost the polygonal look): `flatShading: true` on every material, terrain included | Same. Faces read as faces; don't smooth normals to hide low polygon counts. **A form that should read round gets more facets, never smooth shading** (owner, 2026-11-08: the Thornling's ball went from 20 to 80 faces: round in outline, every face still visible) |
| Colour | **Done (T30):** `mat`/`surf` colours (snapped to the palette, T29) are baked into **vertex colours** when static scenery is merged, by kind (plain, each surface, emissive; transparent and odd materials on their own), not by colour. Dynamic things keep a material per colour | Same |
| Baked shade | **Done for merged scenery (T30):** undersides ×0.7, wall feet ×0.82 fading to full 1.5 m up (`BAKED_SHADE`). **On across the whole world, to be judged (T48, 2026-11-08): baked bounce light** (`render/bakeLight.ts`, engine.md "Baked light") replaces it: rays from every vertex give real contact shade, dark corners and one bounce of colour (grass-green under eaves, a wall tinting the path), as a multiplier on the vertex colour so day/night still drive the light. They run in background workers, so the colours land a few seconds after a load. Dungeons get corner shade only (their ceilings ignored; a gentler `indoor` strength). The Dev tab has "Baked light" (on/off) and live sliders for both strengths (occlusion, floor, bleed). **Kept as is** (owner's call, 2026-11-08, T51). Instead of real-time GI, which was weighed and turned down (WebGL has none; screen-space GI needs WebGPU, skips phones and the demo, flickers, and the colour crush eats it) | Crevices and joints on models too, in the vertex colour, not by real-time effects (the kit's `crevice`, built in T35). Parked (owner, 2026-11-07): roadmap.md "Known quirks and tech debt" |
| Textures | **Done (T30):** grey detail tiles × colour, drawn at 32 texels/m and shown at a global **resolution** of 32/m, i.e. full detail, by default (owner's call; tunable 1–32 live in the Dev tab), with each tile's **scale** authored with it, **nearest** up close (bilinear was tried in T30: too blurry) | Intensity texture × colour is what N64 games did; ≤ 64 px tiles (the ground's 128 px stays). **No object is one flat solid colour** (owner's call, 2026-11-08, T53): every surface wears a tile and/or a gentle gradient (the kit's `gradient`), small props and simple creatures too. The villagers follow it (a test checks every mesh wears a tile); the rest of the golden set and the props catch up in their own ticket |
| Fog | **Done (T31):** the colour of the sky's horizon, tinted and reaching differently per place (`render/atmosphere.ts`, below); indoors one dark fog | Same. A core part of the look |
| Sky | **Done (T31):** painted gradient, the day's keys per place, blended as Wren crosses (below). No cloud layers yet | Gradient with simple cloud layers, tinted per area to match its fog, driven by the existing day/night cycle |
| Shadows | **Done (T46, owner's call: back as an option, 2026-11-07):** Settings → Shadows (default On on desktop, Off on touch). One sun shadow map outdoors (`render/shadows.ts`, render.md "Sun shadows"): the sun by day and the moon, weaker, at night, following Wren within 24 m; houses, trees, props, Wren, NPCs, enemies and bosses cast, the ground and scenery receive. It fades out as the sun nears the horizon. N64 uses a small unfiltered map (a crisp, blocky edge). **Dungeons and houses keep the blobs**; outdoors `GroundShadow` blobs of characters hide and orbs, wisps and stones keep theirs. Off: no map, everything as in T31 (baked `BAKED_SHADE` darkening in the vertices either way) | Same. Anything lit and solid casts on its own; a glow or glass never does (`userData.noShadow` opts out). Give anything new that stands or floats a blob (it shows indoors and with Shadows off) |

**Not allowed:** PBR materials, normal maps, high-resolution or photographic textures, cel/toon light bands, outlines,
SSAO, depth of field, motion blur, heavy bloom.
**Allowed, the modern layer:** fog, floating particles and motes, gentle colour grading, very subtle bloom on magical
things, native resolution with antialiasing, widescreen, a smooth frame rate.

## Atmosphere (T31)

One file, `render/atmosphere.ts`, holds every place's look as data: **valley**, **village**, **hollow** (outdoors; the
day's light as six moods laid on the clock by `lightKeys`, a fog reach) and **shrine** (indoors; one dark fog, a fixed dim
fill). Each also names its sub-palette (`look`, from `AREA_PALETTES`) and a **mote preset** (specks in the air: the hollow's
rising spirit lights, the shrine's dust; the valley and village have none). Fog is the colour of the horizon outdoors, so tint a
place by tinting its `horizon`.

`Area.atmosphereAt(x, z)` says which applies where (the overworld's `atmosphereAt` in `layout.ts`: the hollow from 4 m outside
its rim, the village where its song plays, else the valley; dungeons default to the shrine). `Sky.setAtmosphere` eases the weights
across over ~2 s as Wren walks (a new area snaps), and the light is the weighted blend. **The blight and a boss's gloom stay
modifiers on top** (fog pulled in by a share of the place's reach, violet sky, dimmer sun). Mote presets cross-fade the same way,
and the blight's ash (`BLIGHT_ASH`) wins while it lies on the valley. To add a place: an id and an entry in `ATMOSPHERES`, an
`atmosphereAt`, a look shot (`npm run look -- atmosphere` shows dawn, noon, dusk and night in each).

## Display modes

**Today (T28 done):** one **Display** setting with three options (render.md "Display modes"):
- **Native**: full device resolution (cap 3×; 2× on touch screens, and no multisampling there), antialiased. Default on desktop and Steam.
- **Performance**: the same look with the render resolution capped (pixel ratio ~1). Default on touch devices.
- **N64**: the 3D scene drawn 240 rows tall, width from the screen's aspect (no black bars), upscaled with soft
  (linear) filtering; the 5-bit colour crush and ordered dither stay (the N64's 16-bit framebuffer did both); no bloom.

The UI is drawn at screen resolution in every mode. Check visual work in **Native and N64** both (`npm run look -- <scenes> --display n64`).

## Texture recipe (owner's call, 2026-11-09, after the brick redraw)

The textures aim at **well-done, lower-resolution pixel art**: a material should *suggest the real thing* (brick, bark, hide, metal) and still be clearly pixelated and stylized. This is the target for every tile; "N64" now names the optional Display mode and the faceted low-poly geometry, not the texture quality bar. The recipe every tile follows (`render/textures.ts`; the stone, planks, shingle, rock and scales are the examples):
- **Every mark has a physical cause:** an edge lit on one side and shaded on the other (light from upper left), a chipped or rounded corner, a worn patch, a crack, a pit, a stain.
- **Joints, seams and gaps are a mid-dark, gritty tone** about 0.25 below their neighbours, never a black ruled line. They wander or kink a texel, are uneven in width, and break where worn. (`finishTile` normalizes the spread: a near-black line uses all the contrast and flattens everything else.)
- **Nothing is perfectly regular:** per-block tone, a slow stain across the whole tile, edges that sag a texel. Made things (metal plates) stay straight but worn.
- **Keep it chunky and calm up close:** texels stay big and crisp (nearest filter), features are 1-3 texels, nothing sits at pure black or white (`textures.test.ts` checks the joints), and a large face seen close (a pillar) must not turn to noise or stair-steps. Tune by looking at a big lit face, not only a wall.
- **Light from the upper left everywhere:** slabs, clumps, pebbles, scutes and bundles are lit on that side, shaded on the other, with the gradient **stepped into flat bands** (a smooth ramp reads as a blur). A thing that overlaps another (a scute, a straw bundle) **casts a one-texel shadow** on what it lies over.
- Still a grey tile × the material colour: palette, blight and Display modes are unchanged.

## Shape language

- **Characters:** chunky, simplified proportions; oversized heads, hands and feet; bold silhouettes that read on a phone.
- **Environments:** big simple forms, compact spaces, landmarks you navigate by. Readability over detail.
- **Surfaces:** detail from silhouette, colour breakup and **textures drawn like well-done, low-resolution pixel art** (see "Texture recipe" below). Not fine high-frequency noise, and not flat cartoony blobs or ruled lines either.
- **More detail ≠ more polygons.** Spend the budget on shapes that change the silhouette (horns, plates, belts, chipped
  edges, a slight asymmetry) and on colour breakup, not on smoother cylinders.

## Palette

**Done (T29):** one **master palette** in `render/palette.ts`, the main thing that keeps everything one game. Mood
(owner, 2026-11-07, tuned by eye): a hair less saturated and a little warmer than the old look (`GRADE`: chroma 0.97,
warm 0.5; a softer, warmer grade read too grey); glows, gems and the key colours stay vivid.
- **33 named hues × 4 shades**: `0` deep, `1` shade, `2` base, `3` light. Most hues give a base and the other shades are
  worked out in OKLCH (shadows lean violet, lights lean warm); the neutrals (`ink`, `stone`, `slate`, `chalk`) and the sky
  hues (`sky`, `night`, `moon`, `blight`) and `rose` are set by hand. A grade (saturation, warmth) sits over the whole table.
- **Use it by name:** `pal('grass')`, `pal('stone', 1)`. `mat`, `surf` and `uniqueMat` snap any other colour to the nearest
  swatch (OKLab distance), so old literals are on palette without being touched; final passes still replace them with names
  (`npm run palette` lists what's left).
- **Sub-palettes:** `AREA_PALETTES` lists each area's swatches (valley, village, hollow, blight, Northpass, the four shrine
  wings, whose `THEMES` in `world/dungeon/decor.ts` are palette names). A final pass paints with its area's list; the
  asset validator checks colours against the palette.
- **Blending is fine:** sky keys, fog, lights and the ground paint name palette colours but blend freely between them; baked
  shading darkens a palette colour. Authored flat colours never sit between swatches.
- **The swatch page:** `/palette.html` on the dev server (every hue and shade, each area's strip).
- A colour the palette lacks: add a hue (or adjust one) in `palette.ts` and check the swatch page and the look shots; don't
  hard-code an off-palette colour.

## Budgets

Starting points; the validator (`npm run assets`, [pipeline.md](pipeline.md)) measures the real counts and enforces them on final assets. Scene budgets (draw calls, overdraw) come from the phone
performance pass and go here.

| Asset type | Triangles | Textures (generated, ≤ 64 px) |
|---|---|---|
| Player | 1,000–2,000 | face + 1–2 for clothing |
| Regular enemy | 200–1,200 | 0–1 |
| Mini-boss | 1,000–2,500 | 0–2 |
| Boss | 1,500–4,000 | 1–3 |
| NPC | 600–1,200 | face + 0–1 |
| Prop | 30–300 | 0–1, a shared tile |
| Environment (`piece`: a building, a landmark) | up to 3,000 (a cottage is ~1,400) | the area's shared tile set |

**Phone check, the entrance vignette (T51c, Native and Performance report the same counts: the Display mode changes pixels, not geometry):** `village` 300 calls / 263,856 triangles before the mill, stall and ruins were rebuilt, 278 / 270,400 after; `vignette` 360 / 262,274 before, 368 / 270,984 after. The kit mill is ~2,050 triangles (sails ~940, stall ~1,310, a ruined home ~1,650); the rough ones were a few hundred, so the frame gains ~7-8k triangles (about 3%) and the village loses 22 draw calls (the old mill was dozens of separate meshes; the new pieces merge into the static buckets). Measured by `npm run look`, not on a phone: the real cost is T58.
**Phone check, the shrine (T56a):** `shrineHall` (the Hall and the sandstone wing next door) went from 868 calls / 152k triangles (rough) to 807 / 185k: the kit sconce merges its iron into the scenery, which saves 3 calls a sconce, and the shell, frames and sconces add ~33k triangles. Every scene that sees the dungeon gained a little: `dungeon` 206k / 216k triangles, `landmarks` 181k / 183k, `stairs` 172k / 173k, so those scenes' budgets were re-set on review (peak + 25%). A frame is 264 triangles × ~46 doorways, a sconce 218 × ~50. Measured by `npm run look`, not on a phone: the real cost is T58.
**Phone check, the Hall's things (T56b):** `shrineHall` 807 → 753 calls and 185k → 201k triangles (Native; N64 754 / 201k). A kneeling keeper is ~460 triangles (the rough's boxes ~85), a sleeping face ~190, a wakestone ~510 / ~630 (the rough's rings ~570), the bell post ~800. The scenes that see the wing gained: `bellShaft` 170k → 186k, `bells` 261k → 265k; their budgets were re-set on review (peak + 25%; N64 baselines now exist for them). If the phone needs triangles back, the keeper is the first to cut (T58). Measured by `npm run look`, not on a phone.
**Phone check, the Hall's dressing (T56c):** `shrineHall` 753 → 761 calls and 201k → 214k triangles (Native; N64 762 / 214k), inside its 950 / 252k budget. The dressing's glows are four merged meshes and the dust one `Points`, so the calls are few; a niche is ~800 triangles, a relief ~420, a lintel ~500 (three), a banner ~270 (four), a rubble heap ~350 (four). If the phone needs triangles back, the niches and rubble go first (T58). Measured by `npm run look`, not on a phone.
On phones, **draw calls and transparent overdraw** (particles, glows, fog planes) matter more than triangles. Today's
scenes run about 90–700 draw calls, the dungeons about 1,200 (`scripts/look-budgets.json`; T30's vertex-colour merge took the village from 720 to 490); dungeons and dynamic objects are the next to trim. **Shadows On** add the sun's depth pass: measured 2026-11-07 on the village, about +70 to +210 draw calls and +140k triangles (the big merged scenery cells are drawn again), so the village runs about 500 and the field about 660-700 calls, inside that range; the look budgets are for Shadows Off. Touch devices default to Off. Habits: build a
model type once and reuse its geometry, instance repeated props, merge static geometry per area, cap particles, keep
transparent layers few.

## Effects

**Done (T32), `render/effects.ts`:** named presets (`FX`): `hitSpark`, `weakSpark`, `guardSpark`, `hurtSpark`, `deathPuff`,
`dustKick`, `leafCut`, `shards`, `itemSparkle`, `magicMotes`, `smoke`, `embers`. Call `particles.fx('hitSpark', at)`; a site that
truly differs overrides a colour or a number (`{ count, speed, life, gravity, color }`). Never call `burst` outside `fx`.
Colours are `pal(...)` and `Particles` snaps anything else; no more than `MAX_PARTICLES` (320) fly at once. `SlashTrail` is the
sword's arc (player). `glow` (render/shapes.ts) and `motes` (atmosphere) are unchanged. New effect = a new preset, not a raw burst.

## UI

**Rule: modern structure, period surface.** A screenshot of any menu should pass for a late-90s game while staying
readable and easy to use.
- **Look:** saturated colours, gradient fills, beveled edges, translucent tinted text boxes, text with drop shadows or
  outlines. Bold and a little garish. Soft, not pixel art.
- **Font: Embervale (built, T38).** A rounded geometric sans authored in code: each character is a skeleton (where a round
  pen travels: points, arcs, loops, dots) in `ui/font/glyphs.ts`; `outline.ts` traces the pen into outlines (sharp corners
  get round joins, overlaps are flagged), `ttf.ts` writes a real TrueType file, and `loadUiFont()` hands it to the browser
  with `FontFace` at boot. Two weights from one skeleton (a wider pen for bold), two text sizes (`--ui-text-size` 21 px,
  `--ui-small-size` 14 px; display text like the area name is the bold at a larger size). CSS names a system font after it,
  so a failed load still reads. A test fails if any character in `content/text/` or a button label lacks a glyph: a new
  character means a new skeleton (check it on the bench's specimen).
- **Icons:** rendered from the real 3D models into small images (`render/icons.ts`, the `gear-*` models).
- **Era habits:** text typed letter by letter with a sound (have it: blips), coloured keywords (have it: `[gear]` tags),
  a big item-get moment (have it), button prompts for the active device (have it). Our own icon designs only.
- **Modern conveniences:** clear structure, big touch targets, text speed and size options.
- **How it's drawn (owner's call, 2026-11-08, on the bench):** the DOM HUD with the period surface in CSS, not a 640×480
  canvas (that blurred text on phones and retina screens and meant rewriting layout, hit-testing, rich text and typing).
  The surface is data: `ui/theme.ts` holds looks (`restrained`, **`bold`**, the owner's pick, and `full`) as palette names
  and sizes, and `applyTheme()` writes them as `--ui-*` CSS variables at boot; `style.css` only reads those. Boxes (dialog,
  choice window, toast, prompt, action hints, pause panel, compass) share one surface: gradient fill, rim, an inner
  bevel lit top-left. Text has a dark outline plus a drop shadow (`--ui-ink`); the name plate and button chips are small
  gold bevelled tablets. A colour change goes in the theme, never as a literal in CSS.
- **The bench:** `/ui.html` on the dev server shows the real HUD over stand-in backdrops (day, dusk, night, dungeon,
  snow) with the look, font, device and moment (dialog, question, playing) switchable, and the font specimen. Check UI
  work there on a desktop and a phone (`npm run dev -- --host`) before the look scenes.
- **Still to do in the UI pass** (roadmap.md): the title screen (logo, menu, controls card) and the pause menu's layout;
  the Gear tab and its icons are done.
- **The corner (T47):** the round picture, the time, then the place's name (quiet, one line, ellipsis; follows `areaName`, so it
  changes with the area-name card). Outdoors and in houses the picture is the sky dial; in a dungeon it is a still render of
  the def's `portrait` view (`DungeonDef.portrait`, room-relative eye and look), taken once at load by `renderStill`
  (`render/retro.ts`) in the current Display look (N64: 64 px, crushed and dithered; otherwise 128 px), with no Wren or
  enemies, and the time text is gone. The rule is `ui/corner.ts`. It isn't re-taken if Display changes mid-visit.
- **Title and file select** get the same care: they set the tone before play starts.

**Authenticity test (UI and audio):** put a screenshot or clip next to real games of the era at the same size or volume.
Anything noticeably crisper, flatter or cleaner than its neighbours gets fixed.

## Audio

The music's composition stays as it is. The goal is the era's *playback* character, not new writing.
- **Have it:** songs are notation data (`core/tracks.ts`, `music.ts`), played on a shared, fixed set of synthesized
  instruments (`core/synth.ts`), so the soundtrack is one ensemble and a sound change never rewrites a song.
- **Built (T36, values to tune by ear):** an N64 chain on the master bus for music and effects: a lower effective sample rate, gentle low-pass,
  a modest cap on simultaneous notes, and reverb per area (caves wetter, fields drier). Tuned by the owner's ear.
- No soundfonts or recorded samples. Details: [audio.md](audio.md).

## Mobile controls

**Built (T37):** engine.md "Touch controls" has the layout and the assists. Below is the design it follows (swap Jump and
Lock if jump matters more in combat); the styling is in (T38); only the later items remain.
- **Interact** gets its own button that appears only when something is usable, always in the same spot (up-left of
  Sword, between Shield and Lock), shows its verb (Talk, Open, Check, Grab) and animates in.
- **Jump** is only jump and moves to the outer ring, up-left of the cluster (swap with Lock if jump matters more in combat).
- **Sword** stays the biggest button, bottom right, never context-sensitive; light auto-aim toward the nearest enemy in front.
- **Lock** directly above Sword; when the target dies it moves to the next one.
- **Item** (the glove) on the outer ring, upper part. Hearts and keys top-left with a small menu button; the dial top-right.
- Touch areas bigger than the drawn buttons, nothing under ~44 pt. Gamepad A stays interact + jump (AGENTS.md).
- Era styling (T38, built): the theme's translucent fill and rim, a domed bevel that flips gold when pressed, the game's font.
- Later: a layout editor, haptics on native builds.

## Items and the pause screen

No inventory to manage: sword and shield upgrades are automatic, there's no crafting or stat gear, keys show on the HUD.
- **Gear tab** in the pause menu, read-only: sword and shield, tunic, items, quest items (Pip's doll), bells, the
  current dungeon's keys. No dungeon map (the "no map or compass" rule; a map would be a new owner's call).
- **Item wheel:** deferred until there's a second equippable item (roadmap.md "An item selector" has its design).

## The golden set

A few finished, owner-approved assets that define the style by example; written rules drift, reference renders don't.
Every later asset is compared against them (the contact sheet, T34). **Order** (each a Final-pass ticket, locked only when
the owner approves): a Thornling (the common enemy; cheapest place to shake out the pipeline) → Wren with their full
animation set → the starter-area entrance vignette → the prop set (chest, door, jar, crate, sign) → Pip (the NPC) → the
Hollow Lamplighter → Gravelheart → one shrine room (done). Each approved member gets front, three-quarter, side and one in-game
render, stored and listed here. If the style changes, update the golden set first, then everything else.

*Members approved so far* (reference renders in `scripts/baselines/look/`, Native and `-n64`):
- **The chest** (2026-11-08): `chest-*`, the first kit model.
- **The Thornling** (2026-11-08, T49): `thornling-model-front`, `-three-quarter`, `-side`; in game `thornling-windup`.
- **Wren** (2026-11-08, T50): `wren-model-front`, `-three-quarter`, `-side`; in game `wren-guard` (the `wren` scene has every state).
- **The entrance vignette, Thistledown's road in** (2026-11-08, T51a-c): the valley's tree, pine, rock, grass tuft and lone oak; both cottages, the well, fence, lantern post, barrel and crate; the windmill, its sails, Odo's stall and a ruined home. Reference renders: `vignette-noon`, `-dusk`, `-night` (the frame), `vignetteModels-<id>-front`, `-three-quarter`, `-side` (the buildings), in game `mill-sails`, `mill-stall`, `ruins-ruin-shieldCottage`.
- **The rest of the prop set** (2026-11-08, T52): the hinged door, the stone door, the jar and the sign (the chest and the crate are above). Reference renders: `props-<id>-front`, `-three-quarter`, `-side`; in game `mill-door-close`, `mill-door-open`, `mill-sign`, `door-asleep`, `door-awake`, `ruins-ruin-shieldCottage`.
- **Pip** (2026-11-08, T53): the first NPC, on the villagers' kit body (`render/models/villager.ts`: Wren's pieces, a child frame), every surface tiled and graded. Reference renders: `villagers-pip-front`, `-three-quarter`, `-side`; in game `villagers-pip-idle`, `-pip-near`, `-pip-doll` (hugging Button), `villagers-square` (the five villagers).

- **The Hollow Lamplighter** (2026-11-08, T54): the first boss on the kit and a rig of its own (`render/models/lamplighter.ts`): gaunt, long-armed, big clawed hands, a frayed and patched coat, the lamplighter's strap, wick tin and coil, a sooty lantern-cage head with wax run off its eave, eye-holes with a faint cold light; its body moves exactly as the rough's did. Reference renders: `lamplighter-model-front`, `-three-quarter`, `-side`, `-night`; in game `boss-front`, `boss-howl` (the `boss-moves` scene has each move's telegraph).
- **Gravelheart** (2026-11-08, T55): the second boss on the kit and a rig of its own (`render/models/gravelheart.ts`): grey stacked wakestones, chamfered and uneven, moss and lichen on its tops, a pale carved face (heavy brow, deep-set eyes, cheek slabs, a jaw that drops in the howl), the shrine's spiral glowing teal on its shoulders, fists, brow and keystone, pebbles circling the spirit-lit gaps in its arms; its body moves exactly as the rough's did. Reference renders: `gravelheartModel-gravelheart-model-front`, `-three-quarter`, `-side`, `-back`; in game `gravelheart-hammer-windup`, `gravelheart2-howl` (the `gravelheart` and `gravelheart2` scenes have each move).
- **The Hall of Sleepers, the shrine room** (2026-11-08, T56a-c): the sandstone wing, final in every room of floor 0 (`render/models/shrine.ts`, `shrineProps.ts`, `shrineThings.ts`, `shrineDressing.ts`; shrine.md "The final look"): the shell (flags, plinth, string course, cornice, pilasters, beams, pillars), door frames and sconces, the wakestones, tablet, bell post and bell, sleeping faces and kneeling keepers, and the Hall's own dressing (spiral reliefs, carved lintels, offering niches, faded banners, rubble, sand drifts, cracked and sunken flags, dust). Reference renders: `shrineModels-<id>-front`, `-three-quarter`, `-side`; in game `shrineHall-hall-in`, `-hall-east`, `-hall-west`, `-hall-niche`, `-hall-high`.

## Escape hatch

If an asset genuinely can't be built well in code (a very organic hero creature), the fallback is a generated mesh
decimated to budget and recoloured to the palette, **with the owner's OK each time** (imported models are shelved:
[models.md](models.md)).

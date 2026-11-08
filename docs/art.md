# Art direction (the style bible)

**N64 assets, modern presentation** (owner, 2026-11-07, from the "Art Direction & Asset Pipeline Proposal"). Every asset
follows Ocarina of Time / Majora's Mask-era rules: chunky low-poly geometry, small soft textures, colour-and-shade in the
vertices, fog. The game is then shown the way most people replay those games today: on an emulator at high resolution
and a smooth frame rate. The goal is that players feel the way they did playing OoT for the first time: a new adventure
that looks the way people *remember* the N64, not the way it literally looked.

- **Reference:** OoT and MM, upscaled. Modern indie benchmarks: *Corn Kidz 64*, *Cavern of Dreams*.
- **Not:** the 3DS remake's busier detail, Wind Waker (cel bands), Twilight Princess, or a glossy, over-polished low-poly indie look. (Genre feel only: never a specific game's designs, AGENTS.md "Hard rules".)
- **How we build it:** [pipeline.md](pipeline.md) (Rough and Final passes, the registry, the checks). The rebuild of
  everything that exists starts with the foundation tickets T33–T39 ([tickets.md](tickets.md)), then the golden set and the rest
  ([roadmap.md](roadmap.md) "The N64 look rebuild").

Each section says **today** (what the code does now) and **target**. Until a ticket moves a section to the target, don't
extend the "today" look: build new work so it moves toward the target.

## Rendering rules

| Rule | Today | Target (ticket) |
|---|---|---|
| Lighting | Lambert, per pixel | Same: soft diffuse Lambert. Per pixel is fine; the look matters, not the method |
| Shading | **Flat, faceted** (owner's call, 2026-11-07, after trying smooth in T30: rounded cones and cylinders lost the polygonal look): `flatShading: true` on every material, terrain included | Same. Faces read as faces; don't smooth normals to hide low polygon counts |
| Colour | **Done (T30):** `mat`/`surf` colours (snapped to the palette, T29) are baked into **vertex colours** when static scenery is merged, by kind (plain, each surface, emissive; transparent and odd materials on their own), not by colour. Dynamic things keep a material per colour | Same |
| Baked shade | **Done for merged scenery (T30):** undersides ×0.7, wall feet ×0.82 fading to full 1.5 m up (`BAKED_SHADE`). **Under trial in the village (owner, 2026-11-07): baked bounce light** (`render/bakeLight.ts`) replaces it there: rays from every vertex at load give real contact shade, dark corners and one bounce of colour (grass-green under eaves, a wall tinting the path), as a multiplier on the vertex colour so day/night still drive the light. Dev tab "Baked light" flips it live. Instead of real-time GI, which was weighed and turned down (WebGL has none; screen-space GI needs WebGPU, skips phones and the demo, flickers, and the colour crush eats it) | Crevices and joints on models too, in the vertex colour, not by real-time effects (kit T35). Parked (owner, 2026-11-07): roadmap.md "Known quirks and tech debt" |
| Textures | **Done (T30):** grey detail tiles × colour, drawn at 32 texels/m and shown at a global **resolution** of 32/m, i.e. full detail, by default (owner's call; tunable 1–32 live in the Dev tab), with each tile's **scale** authored with it, **nearest** up close (bilinear was tried in T30: too blurry) | Intensity texture × colour is what N64 games did; ≤ 64 px tiles (the ground's 128 px stays). Untextured is fine for small props and simple creatures |
| Fog | **Done (T31):** the colour of the sky's horizon, tinted and reaching differently per place (`render/atmosphere.ts`, below); indoors one dark fog | Same. A core part of the look |
| Sky | **Done (T31):** painted gradient, the day's keys per place, blended as Wren crosses (below). No cloud layers yet | Gradient with simple cloud layers, tinted per area to match its fog, driven by the existing day/night cycle |
| Shadows | **Done (T31, owner's call: dropped, 2026-11-07):** no shadow maps at all (the renderer's is off; nothing sets `castShadow`/`receiveShadow`). `GroundShadow` blobs under Wren, NPCs, every enemy and boss (`Enemy.placeShadow`, set by the manager), wakestones, orbs and wisps. Scenery gets its darkening baked into vertex colours (`BAKED_SHADE`) | Same. Give anything new that stands or floats on the ground a blob. Owner, 2026-11-07: sun shadows to come back as a Display option (T46) |

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

**Today (T28 done):** one **Display** setting with three options (engine.md "Display modes"):
- **Native**: full device resolution (cap 3×), antialiased. Default on desktop and Steam.
- **Performance**: the same look with the render resolution capped (pixel ratio ~1). Default on touch devices.
- **N64**: the 3D scene drawn 240 rows tall, width from the screen's aspect (no black bars), upscaled with soft
  (linear) filtering; the 5-bit colour crush and ordered dither stay (the N64's 16-bit framebuffer did both); no bloom.

The UI is drawn at screen resolution in every mode. Check visual work in **Native and N64** both (`npm run look -- <scenes> --display n64`).

## Shape language

- **Characters:** chunky, simplified proportions; oversized heads, hands and feet; bold silhouettes that read on a phone.
- **Environments:** big simple forms, compact spaces, landmarks you navigate by. Readability over detail.
- **Surfaces:** detail from silhouette, colour breakup and small soft textures, never fine high-frequency noise.
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
  wings, whose `THEMES` in `world/dungeon/decor.ts` are palette names). A final pass paints with its area's list; T33's
  validator checks against it.
- **Blending is fine:** sky keys, fog, lights and the ground paint name palette colours but blend freely between them; baked
  shading darkens a palette colour. Authored flat colours never sit between swatches.
- **The swatch page:** `/palette.html` on the dev server (every hue and shade, each area's strip).
- A colour the palette lacks: add a hue (or adjust one) in `palette.ts` and check the swatch page and the look shots; don't
  hard-code an off-palette colour.

## Budgets

Starting points; the validator (T33) measures the real counts. Scene budgets (draw calls, overdraw) come from the phone
performance pass and go here.

| Asset type | Triangles | Textures (generated, ≤ 64 px) |
|---|---|---|
| Player | 1,000–2,000 | face + 1–2 for clothing |
| Regular enemy | 200–1,200 | 0–1 |
| Mini-boss | 1,000–2,500 | 0–2 |
| Boss | 1,500–4,000 | 1–3 |
| NPC | 600–1,200 | face + 0–1 |
| Prop | 30–300 | 0–1, a shared tile |
| Environment | big simple shapes | the area's shared tile set |

On phones, **draw calls and transparent overdraw** (particles, glows, fog planes) matter more than triangles. Today's
scenes run about 90–700 draw calls, the dungeons about 1,200 (`scripts/look-budgets.json`; T30's vertex-colour merge took the village from 720 to 490); dungeons and dynamic objects are the next to trim. Habits: build a
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
- **Font:** authored in code (a slightly rounded sans, two sizes, shadowed); no system or web fonts.
- **Icons:** rendered from the real 3D models into small images (T39).
- **Era habits:** text typed letter by letter with a sound (have it: blips), coloured keywords (have it: `[gear]` tags),
  a big item-get moment (have it), button prompts for the active device (have it). Our own icon designs only.
- **Modern conveniences:** clear structure, big touch targets, text speed and size options.
- **How it's drawn** is decided in T38 on mockups. Recommendation: keep the DOM HUD (it already does layout, wrapping,
  touch and mouse hit-testing, rich text, typing) and give it the period surface with CSS, plus the code-authored font
  turned into a real font at runtime (`FontFace`). The proposal's alternative, a 640×480 canvas upscaled with smoothing,
  blurs text on phones and retina screens and means rewriting all of that.
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
- **Target (T36):** an N64 chain on the master bus for music and effects: a lower effective sample rate, gentle low-pass,
  a modest cap on simultaneous notes, and reverb per area (caves wetter, fields drier). Tuned by the owner's ear.
- No soundfonts or recorded samples. Details: [audio.md](audio.md).

## Mobile controls

**Today:** engine.md "Touch controls": floating stick, drag-to-look, Sword, Jump (doubles as interact and shows its verb),
Shield, Lock (a toggle; with nothing near it recentres the camera), Glove.
**Target (T37):** refine, don't replace.
- **Interact** gets its own button that appears only when something is usable, always in the same spot (up-left of
  Sword, between Shield and Lock), shows its verb (Talk, Open, Check, Grab) and animates in.
- **Jump** is only jump and moves to the outer ring, up-left of the cluster (swap with Lock if jump matters more in combat).
- **Sword** stays the biggest button, bottom right, never context-sensitive; light auto-aim toward the nearest enemy in front.
- **Lock** directly above Sword; when the target dies it moves to the next one.
- **Item** (the glove) on the outer ring, upper part. Hearts and keys top-left with a small menu button; the dial top-right.
- Touch areas bigger than the drawn buttons, nothing under ~44 pt. Gamepad A stays interact + jump (AGENTS.md).
- Era styling of the buttons comes with the UI (T38): semi-transparent, palette colours, a subtle bevel, the game's font.
- Later: a layout editor, haptics on native builds.

## Items and the pause screen

No inventory to manage: sword and shield upgrades are automatic, there's no crafting or stat gear, keys show on the HUD.
- **Gear tab** (T39) in the pause menu, read-only: sword and shield, tunic, items, quest items (Pip's doll), bells, the
  current dungeon's keys. No dungeon map (the "no map or compass" rule; a map would be a new owner's call).
- **Item wheel:** deferred until there's a second equippable item (roadmap.md "An item selector" has its design).

## The golden set

A few finished, owner-approved assets that define the style by example; written rules drift, reference renders don't.
Every later asset is compared against them (the contact sheet, T34). **Order** (each a Final-pass ticket, locked only when
the owner approves): a Thornling (the common enemy; cheapest place to shake out the pipeline) → Wren with her full
animation set → the starter-area entrance vignette → the prop set (chest, door, jar, crate, sign) → Pip (the NPC) → the
Hollow Lamplighter → Gravelheart → one shrine room. Each approved member gets front, three-quarter, side and one in-game
render, stored and listed here. If the style changes, update the golden set first, then everything else.

*Members approved so far:* none.

## Escape hatch

If an asset genuinely can't be built well in code (a very organic hero creature), the fallback is a generated mesh
decimated to budget and recoloured to the palette, **with the owner's OK each time** (imported models are shelved:
[models.md](models.md)).

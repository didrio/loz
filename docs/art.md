# Art direction (the style bible)

**N64 assets, modern presentation** (owner, 2026-11-07, from the "Art Direction & Asset Pipeline Proposal"). Every asset
follows Ocarina of Time / Majora's Mask-era rules: chunky low-poly geometry, small soft textures, colour-and-shade in the
vertices, fog. The game is then shown the way most people replay those games today: on an emulator at high resolution
and a smooth frame rate. The goal is that players feel the way they did playing OoT for the first time: a new adventure
that looks the way people *remember* the N64, not the way it literally looked.

- **Reference:** OoT and MM, upscaled. Modern indie benchmarks: *Corn Kidz 64*, *Cavern of Dreams*.
- **Not:** the 3DS remake's busier detail, Wind Waker (cel bands), Twilight Princess, or the generic flat-shaded
  low-poly indie look. (Genre feel only: never a specific game's designs, AGENTS.md "Hard rules".)
- **How we build it:** [pipeline.md](pipeline.md) (Rough and Final passes, the registry, the checks). The rebuild of
  everything that exists is tickets T27–T39 ([tickets.md](tickets.md)), then the golden set and the rest
  ([roadmap.md](roadmap.md) "The N64 look rebuild").

Each section says **today** (what the code does now) and **target**. Until a ticket moves a section to the target, don't
extend the "today" look (the PS2-ish retro pipeline, flat shading, colour-per-material): build new work so it moves
toward the target.

## Rendering rules

| Rule | Today | Target (ticket) |
|---|---|---|
| Lighting | Lambert, per pixel | Same: soft diffuse Lambert. Per pixel is fine; the look matters, not the method |
| Shading | `flatShading: true` everywhere | **Smooth by default**, hard edges only at real creases (box corners, caps, blade edges). three.js primitives already split normals there (T30) |
| Colour | One shared material per colour (`mat(0x...)`) | Palette colours baked into **vertex colours** on a few shared materials; static scenery merged by kind, not colour (T29, T30) |
| Baked shade | None | Crevices, undersides, wall feet and joints darkened in the vertex colour, not by real-time effects (T30, kit T35) |
| Textures | Grey detail tiles × colour, 64 px, 32 texels/m, nearest up close | Same method (intensity texture × colour is what N64 games did). **Bilinear** filtering, ~16 texels/m, ≤ 64 px tiles (the ground's 128 px stays) (T30). Untextured is fine for small props and simple creatures |
| Fog | Follows the sky's horizon colour; indoor fog per room | Tinted per area to its mood; a core part of the look (T31) |
| Sky | Painted gradient, global day keys | Gradient with simple cloud layers, tinted per area to match its fog, driven by the existing day/night cycle (T31) |
| Shadows | Real sun shadow maps on characters and scenery; `GroundShadow` blobs for floating things | **Blob shadows** under characters and movable things; no shadow maps on characters. Scenery sun shadows decided by look shots in T31 |

**Not allowed:** PBR materials, normal maps, high-resolution or photographic textures, cel/toon light bands, outlines,
SSAO, depth of field, motion blur, heavy bloom.
**Allowed, the modern layer:** fog, floating particles and motes, gentle colour grading, very subtle bloom on magical
things, native resolution with antialiasing, widescreen, a smooth frame rate.

## Display modes

**Today:** Settings has Resolution (Native / Balanced / Performance) and Retro look (Off / 1080 / 720 / 540 / 360 rows:
low-res, nearest, bloom, colour crush, dither; engine.md "The retro look").
**Target (T28):** one **Display** setting with three options, replacing both:
- **Native**: full device resolution (cap 3×), antialiased. Default on desktop and Steam.
- **Performance**: the same look with the render resolution capped (pixel ratio ~1). Default on touch devices.
- **N64**: the 3D scene drawn 240 rows tall, width from the screen's aspect (no black bars), upscaled with soft
  (linear) filtering; the 5-bit colour crush and ordered dither stay (the N64's 16-bit framebuffer did both); no bloom.

The UI is drawn at screen resolution in every mode. Check visual work in **Native and N64** both.

## Shape language

- **Characters:** chunky, simplified proportions; oversized heads, hands and feet; bold silhouettes that read on a phone.
- **Environments:** big simple forms, compact spaces, landmarks you navigate by. Readability over detail.
- **Surfaces:** detail from silhouette, colour breakup and small soft textures, never fine high-frequency noise.
- **More detail ≠ more polygons.** Spend the budget on shapes that change the silhouette (horns, plates, belts, chipped
  edges, a slight asymmetry) and on colour breakup, not on smoother cylinders.

## Palette

**Today:** none; ~400 distinct hex literals in code. `world/dungeon/decor.ts` has per-wing `THEMES`.
**Target (T29):** one **master palette** of ~24–32 named hues, each with a few shade steps, in `render/palette.ts`.
Each area picks a **sub-palette** from it plus its fog colour. Every authored colour (material, vertex paint, texture
tint) comes from it; baked shading darkens a palette colour, which is fine. Sky, fog and light colours take their keys
from the palette but blend freely between them. This is the main thing that keeps everything one game.

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
scenes run 600–970 draw calls (`scripts/look-budgets.json`); T30's vertex-colour merge is the main fix. Habits: build a
model type once and reuse its geometry, instance repeated props, merge static geometry per area, cap particles, keep
transparent layers few.

## Effects

**Today:** `Particles` (little cubes) with ad-hoc `burst(...)` calls; `glow`; `motes`.
**Target (T32):** named presets every enemy and weapon uses: hit spark, guard spark, death puff, dust kick, item
sparkle, magic motes, a sword slash trail. Palette colours. Combat feedback then reads the same everywhere.

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

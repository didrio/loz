# Tickets

The open work, in run order. **One ticket = one session** (one context, then `/clear`).
A finished ticket is **deleted**, not struck through: git keeps the history, and what a
future agent needs to know goes into the topic docs at `/wrap`.

## Writing a ticket

The session that knows the most writes it: usually the one finishing a ticket (at `/wrap`)
or a planning session. Write it like a good engineering ticket: a clear spec, not an
implementation.

- **Size:** one session. If it's bigger, split it into parts (T7a, T7b), each leaving the
  game working and the checks green.
- **The what, not the how:** the goal, why it matters, and how we'll know it's done. Name
  decisions already made with the owner and hard constraints; leave the code design to the
  agent doing it.
- **Read first is the main cost saver.** The writer has the context, so point at the exact
  doc sections and files. The agent reads those to start and nothing else.
- **Run:** choose from "Choosing a ticket's Run line" in CLAUDE.md.
- **Scaling checklist:** check the triggers in [roadmap.md](roadmap.md) while writing; a fired
  item goes into the ticket's Notes, so the agent doing it needn't read the checklist.
- **Ids** are never reused (next free: **T27**). The order of this file is the run order; the
  owner reorders freely. An idea that isn't near yet is a line in roadmap.md, not a ticket.

```
### T<n>: <what gets done, imperative>
**Run:** <auto | plan> · <sonnet | opus | opusplan> · <medium | high | xhigh>
**Why:** the goal or the problem, in 1–3 sentences.
**Done when:** observable results, as bullets: what the player sees, or what a check proves.
**Read first:** doc sections and files; nothing more.
**Verify:** `npm run check`, plus the smoke scenarios and look scenes it touches.
**Notes:** (optional) decisions made, constraints, questions for the owner (ask them up front), fired checklist items.
```

## Open tickets

The next stretch is **Sallowmere** (drowned lowlands) and its dungeon **the Old Weir**: design in
[sallowmere.md](sallowmere.md) (owner-approved 2026-11-06). T15 and T16 write the dungeon's and the
boss's build tickets (and the Wickmoth, Reedwight and Lightless Cut ones) when they run.

### T10: Stiltwick's people
**Run:** auto · sonnet · medium
**Why:** Story through NPC lines: the town's lives, the flood, the light at the Weir, and the hints of the adults.
**Done when:** 5–6 NPCs with lines that change with time and progress (`/add-npc`), the trader and its one ware (a gem
sink: propose it), the ferryman's dawn sighting, Maren's shawl placed by the Lightless Cut; Lark and Pip each get a line
for news of the shawl.
**Read first:** world.md "Writing for the player"; sallowmere.md "Story beats" and "Stiltwick (built, T9)" (`STILTWICK_SITES` in `stiltwick.ts` has the six people's spots and yaws); the `/add-npc` skill.
**Verify:** `npm run check` (`textRules.test.ts`).
**Notes:** Hints only: no rescue, nothing about why he was exiled. Fired: content split (`content/sallowmere.ts`,
`content/text/sallowmere.ts`).

### T11: The Mudlurk
**Run:** auto · sonnet · medium
**Why:** The region's enemy: makes wading tense.
**Done when:** The Mudlurk (sallowmere.md "Enemies") hides as a ripple in shallow water, rises and snaps with a clear
tell, is dazed by a guarded snap; placed in the mere's shallows; tests and a look shot.
**Read first:** the `/add-enemy` skill; combat.md "Fairness rules"; sallowmere.md "Enemies".
**Verify:** `npm run check`; `looker` on its shot.

### T12: Sallowmere's bell site
**Run:** auto · sonnet · medium
**Why:** Fast travel to the region: the post in Stiltwick, its bell at the end of a trial out on the mere.
**Done when:** A new bell (named for an hour: bells.md "Lore") follows bells.md "Adding a bell site", its trial
reachable from the town, travel works both ways.
**Read first:** bells.md "Adding a bell site (the recipe)" and "Lore"; sallowmere.md "Story beats" and "The map" (the trial's
deep pool, `BELL_TRIAL` in `world/overworld/mere.ts`).
**Verify:** `npm run check`; smoke for the new site; `looker` on the trial.

### T13: The ferry errand that opens the Weir
**Run:** auto · sonnet · medium
**Why:** The Weir must be earned in town, the way the Lamplighter woke the shrine.
**Done when:** A short errand chain in Stiltwick (propose it in 2–3 lines before building) ends with the way to the
Weir open; flags, saves, a smoke step; `content/progression.ts` gets its gates.
**Read first:** the `/add-quest-beat` skill; sallowmere.md "Story beats", "World progression" and "The map" (the channel
cuts the Weir's forecourt off; the ferry crosses it).
**Verify:** `npm run check`; the new smoke step.
**Notes:** Fired: "a test that plays the whole game" (a second region's quest chain now exists): write it as a ticket at
`/wrap`.

### T14: The Ember Lantern
**Run:** auto · sonnet · high
**Why:** The dungeon's item: light, kindle, burn, douse. Its rules must exist before the Weir's puzzles are designed.
**Done when:**
- Owning it gives Wren one constant point light (shown in dark places only); braziers (a new switch style, `needs:
  lantern`) take Interact "Kindle"; `{ item: 'lantern' }` doors and overworld reed thickets take "Burn" (saved).
- A fall into deep water douses it until it's relit at any fire; the HUD shows lit/out.
- Unit tests for the rules; a dev state with the lantern; a look scene of a dark room lit by it.
**Read first:** sallowmere.md "The item"; shrine.md "The item" (how the glove came in); dungeons.md "The format, in short"
(locks, switches); roadmap.md "Known quirks" (lights).
**Verify:** `npm run check`; `looker` on the lit room.
**Notes:** Keep the light count constant (no shader rebuilds). Watch `game/game.ts` size (~700 lines: split trigger).

### T15: Design the Old Weir
**Run:** plan · opusplan · high
**Why:** A dungeon is real design: rooms, the water gimmick's progression, and new format and solver work.
**Done when:**
- The owner approved the rooms as a text map; the data format gains `basin`, a toggling `sluice` switch and water-riding
  barges, with the solver tracking sluice states (every wheel reversible: no trap states).
- sallowmere.md holds the room list and route (as shrine.md does); tickets.md holds the build as tickets (format and
  solver, rooms, the Wickmoth, the Reedwight, decor themes), each one session.
**Read first:** sallowmere.md "The dungeon"; dungeons.md (all); shrine.md "The wings" and "Route" (as the model).
**Verify:** docs (and, if built in-session, `npm run check` and `npm run map -- weir`).

### T16: Design the Lurelight
**Run:** plan · opusplan · high
**Why:** The region's boss: the third ember.
**Done when:** The owner approved its moves, arena and phases at combat.md's depth; tickets for its build sessions (A rig
and arena, B phase 1, C phase 2, D defeat and the way out through the Lightless Cut) are in this file.
**Read first:** sallowmere.md "The boss"; combat.md "Bosses" and "Fairness rules"; shrine.md "The boss" (as the model).
**Verify:** docs.
**Notes:** Ask the owner how an ember of the stolen flame got past the mountains (sallowmere.md "Open questions").

## The look pass (owner's idea, 2026-11-06)

A "PS2, a bit demastered" look, and less of the clean machine-made feel. Independent of the Sallowmere tickets: the owner
reorders freely. T18 (the retro post-processing) and T19 (generated textures, the village and all terrain) are in. Suggested
order: T20, then T25 and T26 (settle the picture and the UI), then the texture rollout T21–T24 (its strengths are tuned
against the final picture).

### T20: De-uniform the village and Stiltwick
**Run:** auto · sonnet · high
**Why:** Perfect symmetry, identical props and even spacing read as machine-made. Small, seeded imperfections read as hand-built.
**Done when:**
- Repeated props (trees, fences, rocks, crates, lamps) get seeded jitter in tilt, scale and colour; buildings gain asymmetry (sagging roof, crooked chimney, uneven eaves); wall bases darken (dirt/wear); a few intentional clutter groups (a bucket by a door, a cart at a bend) in the village and Stiltwick.
- Colliders, the dungeon solver and every existing smoke scenario are unaffected (decor only; nothing moves a door, a path or an interactable). Per-region seeds so one region's change can't reshuffle another.
- A reusable helper (seeded jitter) lives in `render/` or `world/`, so later regions use it from the start.
**Read first:** engine.md "Conventions" (seeds); `world/overworld/` for the village and `stiltwick.ts` (see engine.md "Overworld files"); `render/shapes.ts`.
**Verify:** `npm run check`; smoke for the village and Sallowmere scenarios; `looker` before/after on both places.
**Notes:** Add "use the jitter helper" to the `/add-npc`-style recipes or AGENTS.md so new places start with it. Colour
jitter on textured materials (`surf()`, engine.md "Textures") makes one shared material per colour, so one merge bucket
(a draw call) per colour: jitter between a few palette steps per material, not continuously, and check the look budgets.

### T25: The demastered picture, accurately
**Run:** plan · opusplan · high
**Why:** The owner loves the retro look and wants it accurate, not approximate: what remasters, demakes and "PS1/PS2-style"
indie games actually do, and which of those we have.
**Done when:**
- A short research note (in engine.md "The retro look") lists the techniques by era, with what each does to the image. PS2:
  ~448–480 rows, composite or S-video blur, interlacing, bloom and glow, fog for draw distance, bilinear textures. PS1: 15-bit
  colour with dither, vertex snapping (wobble), affine texture warp, no mipmaps. The TV: scanlines, colour bleeding, vignette,
  slight curvature. Each gets "have it" / "missing" / "skip (why)".
- The owner picked what to add and how hard (e.g. a signal pass with blur and colour bleed, scanlines, a lower default row
  count), and it's built as Settings next to Retro look, with look shots before and after.
**Read first:** engine.md "The retro look" and "Textures"; `render/retro.ts` (and its test); `game/pauseMenu.ts` (Settings).
**Verify:** `npm run check` (pure parts tested like `retro.test.ts`); `looker` before/after on village, field and a dungeon scene.
**Notes:** A full-screen signal pass would also soften the DOM HUD only if the HUD is drawn into it; that is T26, so design the
pass so T26 can feed it. Ask the owner up front: PS2 only, or PS1 tricks too (wobble, warp)? Keep everything in Settings.

### T26: A demastered UI
**Run:** plan · opusplan · high
**Why:** The owner: the sharp DOM HUD on top of the retro picture "doesn't look great". The HUD (hearts, gems, dialog,
menus, prompts) should look as if the console drew it.
**Done when:**
- The owner approved the approach on paper. The choice: style the DOM (a pixel font drawn in code, sizes and borders snapped to
  the internal pixel grid, no smoothing, the same palette crush), or draw the HUD into the low-res picture so the retro pass
  applies to it. Include text readability (touch and small screens) and the cost of each.
- Built for the HUD and dialog box at least, with look shots before and after; off with the Retro look off.
**Read first:** engine.md "The retro look"; `ui/hud.ts`, `ui/style.css`; `render/retro.ts`.
**Verify:** `npm run check`; `looker` on a dialog, the pause menu, the title and the touch layout.
**Notes:** Fonts must be generated in code like everything else (a bitmap font as data, not an imported font file): confirm
with the owner. Run after T25, so the UI matches the final picture.

### T21: Texture the rest of the valley
**Run:** auto · sonnet · medium
**Why:** T19 textured the village and the ground; the rest of the valley still has flat colours next to it.
**Done when:** the ruins, the camp, the Northpass, the gorge, the Lamplighter's hollow, nature (bark on trunks, rocks) and
the bell posts use `surf()`. Add a `thatch` tile if a thatched roof is there. Small bits (flowers, cloth, glows) stay plain.
**Read first:** engine.md "Textures"; `render/textures.ts`; engine.md "Overworld files" for where each place is built.
**Verify:** `npm run check`; `looker` before/after on ruins, grove, camp and the Northpass scenes; budgets hold.
**Notes:** T19 left the village's stone and wood colours textured there but plain elsewhere, so they cost two merge buckets
(the village went 585 → 632 draw calls): texture the same colours here and check the calls come back down. Pre-existing bug, seen in T19: the `ruins` look scene's last two shots (`ruins-ring-north`, `ruins-ring-south`, at
(-62, -50) and (-62, -66)) are completely black, before the textures too. Find out why first (the camera inside something?
the teleport?), and approve the scene's baselines only once they show the ruins.

### T22: Texture Sallowmere and Stiltwick
**Run:** auto · sonnet · medium
**Why:** The second region gets the same treatment. Its ground already has it, through the shared terrain material.
**Done when:** Stiltwick (stilts, boardwalks, huts: a `thatch` tile for reed roofs if T21 didn't add one), the causeways and
the Weir's wall use `surf()`.
**Read first:** engine.md "Textures"; `render/textures.ts`; sallowmere.md "The map"; `world/overworld/stiltwick.ts`, `mere.ts`.
**Verify:** `npm run check`; `looker` before/after on the Sallowmere and Stiltwick scenes.

### T23: Texture the Waking Shrine
**Run:** auto · sonnet · medium
**Why:** The first dungeon's walls and floors are the biggest flat surfaces left.
**Done when:** the shrine's walls, floors, pillars, doors and statues use textured materials. The per-wing palettes in
`dungeon/decor.ts` stay the colours; a dungeon may want its own tile (worn flagstones). Gravelheart's arena and the prism room too.
**Read first:** engine.md "Textures"; `render/textures.ts`; dungeons.md (the builder); `world/dungeon/build.ts` (Grep for
`mat(`; it's long), `decor.ts`.
**Verify:** `npm run check`; `npm run map -- shrine` unchanged; `looker` before/after on the shrine scenes.

### T24: Water with a ripple and a shore line
**Run:** auto · sonnet · high
**Why:** The water is a flat translucent plane; at a PS2 level of detail it wants a slow ripple tile and a lighter band where
it meets the shore.
**Done when:** the valley's water and the mere show a slowly moving ripple tile (a generated tile like the others, scrolled by
game time, so it freezes with the clock in dialog) and a shore band where the ground is just under the surface. It doesn't
shimmer at distance, and the shallow/deep read in Sallowmere stays clear.
**Read first:** engine.md "Textures"; `render/textures.ts`; `world/overworld/terrain.ts` (`buildWater`), `sallowmere.ts` (its
water mesh); sallowmere.md (water depths).
**Verify:** `npm run check`; `looker` on the lake, the river and the mere.


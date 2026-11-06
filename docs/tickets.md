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
- **Ids** are never reused (next free: **T21**). The order of this file is the run order; the
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
reorders freely. Run T18, then T19, then T20 (each reads better once the one before it is in).

### T18: The retro look (post-processing)
**Run:** auto · sonnet · high
**Why:** Low internal resolution, dithering, bloom and haze give the game a deliberate PS2-era look, and hide the clean edges of primitives.
**Done when:**
- The scene renders at a low internal height (about 480-540 px, scaled up with nearest-neighbour, no antialiasing), with an ordered-dither and reduced-colour-depth pass, a soft bloom on bright things, and the sky/fog tuned thicker and warmer by time of day (fog colour follows the sky).
- A Settings entry turns the look on or off and sets its strength (internal height); it saves. The existing sharpness setting is folded in or kept coherent with it (one resolution control, not two). The HUD (DOM) stays crisp.
- Default on desktop; touch keeps its lower default. Frame time with the look on is no worse than today's (measure one busy scene before and after and report both numbers).
**Read first:** engine.md "Frame loop" and "Tech stack"; `game/game.ts` (Grep `WebGLRenderer`, `sharpness`); `game/pauseMenu.ts` and `core/save.ts` (the settings); `render/sky.ts` (fog); testing.md "look scenes".
**Verify:** `npm run check`; `looker` on the village, Stiltwick and a night scene, on and off; pure parts (dither matrix, setting migration) unit-tested.
**Notes:** Rules stay: no imported assets, the shader is code. Name what you couldn't judge (pixel shimmer in motion, feel): the owner plays it. Look baselines change: update them and say so.

### T19: Procedural textures
**Run:** plan · opusplan · high
**Why:** Hand-painted low-res textures are most of what makes a PS2 game look intentional. The owner OK'd textures **generated in code** (2026-11-06): no imported images.
**Done when:**
- The owner approved a small texture system on paper: which surfaces get one (stone, plaster, thatch, wood, grass, water edge, dirt), the size (small, e.g. 32-64 px, nearest-filtered), how they are drawn (seeded canvas: noise, bricks, planks, grime), how they fit merged static geometry and the shared-material rules, and the cost.
- Built for the village as the proof, with a look shot before and after; AGENTS.md "Hard rules" and docs name the new rule (generated textures allowed, imports still not).
**Read first:** `render/materials.ts` and `render/shapes.ts` (merging, shared vs unique materials); engine.md "Conventions"; T18's result.
**Verify:** `npm run check`; `looker` before/after on the village.
**Notes:** Ask the owner up front how strong the texturing should be (subtle grain vs clearly painted). Check the scaling checklist for draw calls and memory when it runs. If the plan spans sessions, write the rest as tickets.

### T20: De-uniform the village and Stiltwick
**Run:** auto · sonnet · high
**Why:** Perfect symmetry, identical props and even spacing read as machine-made. Small, seeded imperfections read as hand-built.
**Done when:**
- Repeated props (trees, fences, rocks, crates, lamps) get seeded jitter in tilt, scale and colour; buildings gain asymmetry (sagging roof, crooked chimney, uneven eaves); wall bases darken (dirt/wear); a few intentional clutter groups (a bucket by a door, a cart at a bend) in the village and Stiltwick.
- Colliders, the dungeon solver and every existing smoke scenario are unaffected (decor only; nothing moves a door, a path or an interactable). Per-region seeds so one region's change can't reshuffle another.
- A reusable helper (seeded jitter) lives in `render/` or `world/`, so later regions use it from the start.
**Read first:** engine.md "Conventions" (seeds); `world/overworld/` for the village and `stiltwick.ts` (see engine.md "Overworld files"); `render/shapes.ts`.
**Verify:** `npm run check`; smoke for the village and Sallowmere scenarios; `looker` before/after on both places.
**Notes:** Add "use the jitter helper" to the `/add-npc`-style recipes or AGENTS.md so new places start with it.


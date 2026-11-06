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
- **Ids** are never reused (next free: **T17**). The order of this file is the run order; the
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

### T6: Start the world progression solver
**Run:** auto · sonnet · high
**Why:** Gates now cross areas (embers, items, bells, keys, gem prices). A check that a new save can reach the current
end, with no softlock, is cheapest to build while the gates are few; each Sallowmere ticket then adds its gates as data.
**Done when:**
- Every gate between a new game and the Waybell hung at the camp is data: what it needs (items, flags, keys, gems, a
  beaten boss, a bell) and what it gives, including the shrine as one node (its own solver covers its inside).
- A unit test walks that data from a new save and reaches the current end; it fails if a gate is made unreachable, a
  one-time item is spent twice, or the gems needed exceed the gems that can be found.
- Each gate's flag names match `FLAGS` (`game/state.ts`), checked against `npm run flags` data, so the data can't drift
  from the code silently.
- The format is described in a short section of [dungeons.md](dungeons.md) (or engine.md) with how to add a gate.
**Read first:** roadmap.md "World progression solver"; world.md "The quest thread so far"; sallowmere.md "World
progression"; `src/world/dungeon/solve.ts` (its shape, to mirror); `scripts/flags.mjs` and `src/game/flags.test.ts`.
**Verify:** `npm run check`.
**Notes:** Lean: a list of gates and a fixpoint walk, not a planner. Tick the roadmap item.

### T7: Overworld water: wading and the deep-water fall
**Run:** auto · sonnet · high
**Why:** Sallowmere is mostly water and there's no swimming. Shallow water should slow Wren; deep water should be a fall.
**Done when:**
- A pure rule says, from terrain height and the water level, whether a spot is dry, shallow (wade, slower) or deep.
- Wading slows Wren (tested); deep water acts as a fall (half a heart, back to the last dry ground, as `TrialFalls`).
- The valley's existing ponds, lake and two fords still play as before, or deliberately change (say which, and update
  roadmap.md's ford note).
- The rule takes a region's own water level, so Sallowmere can sit at a different height than the valley.
**Read first:** sallowmere.md "The place" (Water); engine.md "Physics"; `src/world/overworld/terrain.ts`
(`buildWater`, `WATER_Y`); `src/game/trialFalls.ts`; roadmap.md "Known quirks" (the fords).
**Verify:** `npm run check`; smoke `northpass` and one valley scenario that crosses a ford (testing.md says which).
**Notes:** Touches the player (shared system): don't run the full smoke suite without asking.

### T8: Sallowmere's map
**Run:** plan · opusplan · high
**Why:** The region's layout (where the descent, Stiltwick, the Weir, the Lightless Cut, islands and the bell trial sit)
is a design the owner should see before it's built.
**Done when:**
- The owner approved a top-down layout (a text map or a render) in plan mode.
- The road continues past the Waybell's canyon (the Northpass's far `Bounds` wall moves) down a descent onto the mere;
  terrain, water level, causeways, the sites' footprints (empty), bounds, area names.
- The region streams in without a visible hitch: its build is spread over frames.
- Look scene `sallowmere` (day and night) and a dev state at the descent.
**Read first:** sallowmere.md "The place"; engine.md "Areas" (Regions); `src/world/overworld/northpass.ts`,
`region.ts`, and the `PASS`/`BEYOND` parts of `layout.ts` (Grep).
**Verify:** `npm run check`; smoke `northpass`; `looker` on the new scene.
**Notes:** Fired checklist items: per-region seeds (`regionRng('sallowmere')`); spread the streamed build over frames
(roadmap "Known quirks"); AGENTS.md's layout tree at scale (overworld/ passes ~8 files: give it one line, move the list
to engine.md).

### T9: Build Stiltwick
**Run:** auto · sonnet · medium
**Why:** The region's town: the hub where its people, trader and bell post live.
**Done when:** Houses on stilts and rooftops above the water, boardwalks and moored boats joining them, a spot for the
bell post, the trader's stall and 5–6 NPCs (empty for now); walkable, the camera clear of stilts and eaves; look scene.
**Read first:** sallowmere.md "The place"; `src/world/overworld/village.ts` (how Thistledown is built); engine.md
"Conventions".
**Verify:** `npm run check`; `looker` (the town by day and night, the camera on the boardwalks).

### T10: Stiltwick's people
**Run:** auto · sonnet · medium
**Why:** Story through NPC lines: the town's lives, the flood, the light at the Weir, and the hints of the adults.
**Done when:** 5–6 NPCs with lines that change with time and progress (`/add-npc`), the trader and its one ware (a gem
sink: propose it), the ferryman's dawn sighting, Maren's shawl placed by the Lightless Cut; Lark and Pip each get a line
for news of the shawl.
**Read first:** world.md "Writing for the player"; sallowmere.md "Story beats"; the `/add-npc` skill.
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
**Read first:** bells.md "Adding a bell site (the recipe)" and "Lore"; sallowmere.md "Story beats".
**Verify:** `npm run check`; smoke for the new site; `looker` on the trial.

### T13: The ferry errand that opens the Weir
**Run:** auto · sonnet · medium
**Why:** The Weir must be earned in town, the way the Lamplighter woke the shrine.
**Done when:** A short errand chain in Stiltwick (propose it in 2–3 lines before building) ends with the way to the
Weir open; flags, saves, a smoke step; the progression data (T6) has its gates.
**Read first:** the `/add-quest-beat` skill; sallowmere.md "Story beats" and "World progression".
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

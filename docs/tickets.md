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
- **Ids** are never reused (next free: **T6**). The order of this file is the run order; the
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

### T1: Make the checks trustworthy: the scar smoke step and a flag check
**Run:** auto · sonnet · medium
**Why:** The `combat` smoke fails its scar step (Wren shoved 0.50 m; it fails on main too), so
every combat ticket starts from a red check someone has to look into again. And with 33 named
quest flags we're past the roadmap's ~30-flag trigger: TypeScript already catches a misspelled
flag, but not one that nothing sets or nothing reads.
**Done when:**
- The scar step passes, because the actual cause is fixed: either the scar's shove or the
  test's position (if it's the game, a failing unit test first).
- A unit test fails when a flag in `FLAGS` has no setter or no reader in `src/` (exceptions in
  an explicit list, each with a reason).
- A short command (e.g. `npm run flags`) prints who sets and who reads each flag (file:line).
**Read first:** roadmap.md "Known quirks" (the scar line); `scripts/smoke/combat.mjs` ~105–122;
world.md "The blight" (scars); the top of `src/game/state.ts` (`FLAGS`, `Flag`); testing.md
"Smoke scenarios and save fixtures".
**Verify:** check; `npm run smoke -- combat`.
**Notes:** Tick "Quest/flag overview" in the scaling checklist. Add the command to testing.md
and AGENTS.md's Commands line.

### T2: Move the player's text into per-area text files
**Run:** auto · sonnet · medium
**Why:** The roadmap's "dialog as data" trigger is "before the second dungeon's content", and
that's next. The starting area's text is cheap to move now and expensive at 10× the content.
Text in one place per area makes the writing reviewable (the terse rule), and makes
translations possible for Steam.
**Done when:**
- Every line the player reads (NPC talk, signs, item messages, toasts, choices) lives in a
  text module per area or topic (e.g. `src/content/text/village.ts`), keyed by id. Scripts
  refer to keys and keep all the logic (which line, when).
- A wrong key fails the typecheck.
- `textRules.test.ts` checks the text modules.
- Nothing changes for the player: same lines, same order, same conditions.
**Read first:** world.md "Writing for the player"; engine.md "Scripts and cutscenes";
`src/content/village.ts` (the most lines, ~40 calls: convert it first); `src/content/textRules.test.ts`;
`src/content/fakeApi.ts`.
**Verify:** check; `npm run smoke -- village hints bells shrine-exit`.
**Notes:** Design default (decided 2026-11-05; the owner can veto at `/start`): typed TS objects,
not JSON loaded at runtime (a translation export can come later), one module per area or
topic, keys like `<speaker>.<moment>`. Also do the blip loose end: a smoke step that checks a
talk blips and the skip rule holds. Update world.md and AGENTS.md's layout; tick "Dialog as
data" in the checklist. If it won't fit one session, stop at a clean point and write T2b.

### T3: Look baselines and a render budget
**Run:** auto · sonnet · high
**Why:** Every visual check sends every screenshot to `looker`. As content grows that's the
costliest routine step, and slowdowns creep in with nothing to flag them.
**Done when:**
- `npm run look -- <scenes>` compares each shot with an approved baseline and prints
  changed/unchanged per shot (with how much changed); only changed shots go to `looker`. An
  option (e.g. `--approve`) saves new baselines.
- Each scene records draw calls and triangles and fails when it goes over its budget (a small
  file of per-scene budgets with headroom). No fps: it depends on the machine.
- Two runs in a row on unchanged code give "unchanged" (pin the clock, particles, seeds and
  animation time where needed).
**Read first:** testing.md "Commands" and the look-scene parts; the top of `scripts/look.mjs`
and one scene in it; `scripts/browser.mjs`; `.claude/agents/looker.md`; CLAUDE.md
"Where the money goes" (Images).
**Verify:** check; look on 3–4 scenes twice (unchanged), change a color, run again (changed),
revert.
**Notes:** Whether baselines go in git is the agent's call; the tradeoff is repo size against
every session and machine having them (a capped resolution helps). Allow a small pixel
tolerance. Update the looker agent, the wrap skill's step 4 and testing.md.

### T4: Recipe skills for repeated content work
**Run:** auto · sonnet · medium
**Why:** Building past the starting area means dozens more enemies, NPCs, rooms and regions.
A recipe written from how we already did it turns each into a short Sonnet ticket and stops
every agent from re-learning the pattern.
**Done when:** `.claude/skills/` has one short skill (≤ ~60 lines) per repeated kind of work,
covering the steps, files touched, tests/smoke/look to add, and the gotchas that bit us. At
least: a new enemy; an NPC with dialog that reacts to progress; a dungeon (data → build → map
→ smoke); an overworld region (`RegionDef`, seed, streaming); a quest beat (flag, script,
smoke step). Each points at the docs instead of copying them, and gives its default Run line.
**Read first:** CLAUDE.md "Skills"; bells.md's recipe for a new bell site (the model to follow);
the doc for each recipe (combat.md, dungeons.md, engine.md "Regions", world.md); `git log --stat`
of a few real additions (the Cragstalker, the Northpass, Pip) to see what they touched.
**Verify:** check; the skills show up in the skill list. No game change.
**Notes:** Run after T1–T3, so the recipes describe the text files, the flag check and the look
baselines. Update CLAUDE.md's Skills list.

### T5: Plan what lies past Wayfarers' Camp
**Run:** plan · opusplan · high
**Why:** The starting area (~10% of the game) is built. The next stretch needs the owner's
design calls before anything is built. There's no whole-game plan (owner's call, 2026-11-05:
plan as we go), so this plans only the next region and its dungeon.
**Done when:**
- The owner has made the design calls, asked together in one AskUserQuestion up front.
- The result is written down: the next region and its dungeon, at the depth shrine.md's design
  section started at (the place, the item and what it opens, enemies, a boss idea, the story
  beats the owner allows), in world.md or a new topic doc.
- This file holds the build as tickets T6 and up, each sized for one session, with Run lines.
- Whether this dungeon starts the world progression solver (scaling checklist) is decided.
**Read first:** world.md "Story", "Places" and "The quest thread so far"; shrine.md's design
section (as the model); dungeons.md's data format summary; roadmap.md "Feature roadmap" and
the scaling checklist.
**Verify:** docs only.
**Notes:** Don't invent the exile's backstory (world.md). For the Northpass and camp as built,
see shrine.md D2/D3.

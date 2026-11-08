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
- **Ids** are never reused (next free: **T48**). The order of this file is the run order; the
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

**The N64 look rebuild, foundations** (owner, 2026-11-07): [art.md](art.md) is the target, [pipeline.md](pipeline.md)
the workflow. These build the shared infrastructure; the golden set and the rebuild of everything else follow
([roadmap.md](roadmap.md) "The N64 look rebuild"), each written as a ticket when it's near. Behaviour never changes:
every NPC, quest, enemy, boss and puzzle plays exactly as before. Sallowmere waits for its redesign.

### T38: The period UI
**Run:** plan · opusplan · high
**Why:** art.md "UI": modern structure, period surface; a menu screenshot should pass for a late-90s game and stay
readable on a phone.
**Done when:**
- The owner chose the approach on mockups. The recommendation: keep the DOM HUD and give it the period surface with CSS
  (gradients, bevels, translucent tinted boxes, outlined or shadowed text, palette colours) plus a font authored in code
  (glyphs as data made into a real font at runtime with `FontFace`). The alternative from the proposal: a 640×480 canvas
  upscaled with smoothing (blurry text, a rewrite of hit-testing, menus, rich text and typing).
- Built: the base styles and font, the HUD, the dialog box and choice window, prompts, the touch buttons' styling.
  Readable on a phone (look `touch`); the title and pause menu follow in the UI pass (roadmap.md).
**Read first:** art.md "UI"; `ui/hud.ts` (Grep for the method you need; it's 626 lines); `ui/style.css`;
`ui/richText.ts`; `ui/touch.ts`.
**Verify:** `npm run check`; look `hud text choice touch title` in Native and N64 mode; smoke `touch hints village`.
**Notes:** Ask the owner up front: font mood (rounded sans as proposed?), how garish, and which of the two approaches
after seeing a mockup of each on the dialog box.

### T39: Gear tab, with icons rendered from the models
**Run:** auto · sonnet · medium
**Why:** art.md "Items and the pause screen": a read-only answer to "what do I have?", with era icons drawn from the
real 3D models.
**Done when:**
- Icons rendered offscreen from registered models at boot and cached: sword, shield, tunic, glove, the flasks, the bells,
  keys, Pip's doll. The HUD's flask and glove icons use them.
- A **Gear** tab in the pause menu, read-only: sword and shield, tunic, items, quest items, bells, the current dungeon's
  keys. No map.
- engine.md "The pause menu" updated.
**Read first:** art.md "Items and the pause screen"; engine.md "The pause menu"; `game/pauseMenu.ts`; `game/menu.ts`
(the `entry` row); the registry (`render/models/registry.ts`); `game/state.ts` (items, flasks, bells).
**Verify:** `npm run check`; smoke `hints dev-menu`; look `hud` plus a pause-menu shot of the tab.

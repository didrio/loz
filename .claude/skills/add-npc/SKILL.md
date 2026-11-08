---
name: add-npc
description: Recipe for a new talking NPC on Embervale whose lines react to time and progress (text module, voice, placement, script, tests). Use when a ticket says "add an NPC / villager / traveler".
---

**Assumes:** NPCs are `Npc` objects placed by the area, with a script bound by interactable id
`npc.<id>`, text in `content/text/`, blip voices by `who`. If dialog becomes a different system
(branching trees, a journal), rewrite or delete this. **Default Run:** auto · sonnet · medium.

**Read first:** [docs/world.md](../../../docs/world.md) "Writing for the player" (the text rules are
tested), `content/village.ts` (`npc.pip` is the model), `content/villageNews.ts`.

1. **Write the text first** in `content/text/<area>.ts`, keyed `<id>.<moment>`; day/night as
   `{ day, night }`. Cut each box to half, ≤ ~120 visible chars, ≤ 2 highlights, no kin words,
   directions true from where they're said, landmarks must exist. Give the NPC a voice: one trait.
2. **Voice:** add the speaker's `who` to `SPEAKERS` in `content/voices.ts` (a `BLIP_PRESETS` entry).
3. **Look:** an NPC is `buildHumanoid(colors, scale)` (`render/characters.ts`); a new silhouette gets a pure builder in
   `render/models/` and an entry in `registry.ts` (`tier: 'rough'`; `npm run assets`). The registry's `villager` stands in for every humanoid NPC.
4. **Place** in the area (overworld: `npcs` in `world/overworld/index.ts`: `Npc` with colors, an
   interactable `{ id: 'npc.<id>', r, label: 'Talk', promptY, enabled }`, and `update`). Dungeon NPCs
   go through the dungeon data. `world/` never holds dialog.
5. **Script** `'npc.<id>'(api)` in the area's content: an `if` chain, freshest story state first
   (flag/gear/`isNight`/progress), the default last. Set a `<area>.<thing>` flag with `state.set` for
   anything later lines or quests need; add it to `FLAGS` in `game/state.ts` (never rename a shipped
   flag). One-time reactions to big news go through `withNews` rather than new branches.
6. **Tests:** `content/overworld.test.ts` (every interactable has a script) and a talk test with
   `fakeApi`: each branch says its line, flags set once, nothing said twice. `npm run flags`
   must show the flag set and read; `textRules.test.ts` covers the words.
7. **Verify:** `npm run check`; a smoke step in the area's scenario (talk, branch by fixture/flag);
   a `look` shot if the figure is new (via `looker`).

**Gotchas:** dialog freezes enemies and the clock; an NPC that vanishes with story state needs its
interactable `enabled` to follow (a `talk` to an absent NPC is a bug); text outside `content/text/`
still counts for the rules test.

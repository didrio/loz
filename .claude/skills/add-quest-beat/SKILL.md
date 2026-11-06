---
name: add-quest-beat
description: Recipe for a new quest beat on Embervale (a flag, the script that sets it, who reads it, saves, a smoke step). Use when a ticket says "add a quest / beat / pickup that changes the story".
---

**Assumes:** quest state is `FLAGS` in `game/state.ts`, saved as JSON; story is `async` scripts on
game time bound to world objects by id. If progression moves to another model (a journal, an
open-ended order), rewrite or delete this. **Default Run:** auto · sonnet · medium (high if it
touches saves or `game.ts`).

**Read first:** [docs/engine.md](../../../docs/engine.md) "Scripts and cutscenes" and "State and
saves", [docs/world.md](../../../docs/world.md) "The quest thread so far"; the model: Pip's doll
(`content/village.ts` `npc.pip`, `scripts/smoke/jars.mjs`).

1. **Design the beat as flags:** who gives it, what proves it done, what changes afterward. Name
   flags `<area>.<thing>`; add to `FLAGS`. Never rename a shipped one. New persistent shape beyond
   flags = a save migration (`SAVE_VERSION`, `decodeSave`) and a test: ask first.
2. **Script it** in the area's content file (`content/<area>.ts`), bound to the interactable/trigger
   id; use `api.say/wait/until`, never `setTimeout`. Story through NPC lines, not cutscenes unless
   the owner OKs one. Words in `content/text/`.
3. **Restore on load:** anything the world must look like afterwards (a door open, an item gone) is
   re-derived from flags in the area's `restore`. The player's position, enemies and cut bushes are
   not saved.
4. **Every flag is set and read:** `npm run flags`; `game/flags.test.ts` fails otherwise.
5. **Tests:** a content test with `fakeApi` that plays the beat in order and the edge cases (before
   the gate, twice, an old save). A `devStates.ts` entry if the owner will want to jump to it.
6. **Smoke step** in the scenario for that area (testing.md says which): drive the beat, check the
   flag in `state()`, then Continue and check it held. New fixture only if none starts close enough
   (`scripts/fixtures/`, must decode at current `SAVE_VERSION`).
7. **Docs:** world.md's quest thread, engine.md if a flag list is named there.

**Gotchas:** a save made before the beat must still load and play; flags set in a script are saved
when the script ends; check dialog directions against `world/overworld/layout.ts`.

---
name: wrap
description: Finish a task on Embervale - run the Definition of done (tests, check, smoke, look), update the docs so the next session can start cold, and report plainly. Use before telling the owner a task is done.
---

Work through AGENTS.md's Definition of done. Skip steps that truly don't apply, and say
which ones you skipped.

1. **Tests**: every logic change has a unit test that would fail without it; a fixed bug
   has its reproducing test.
2. **`npm run check`**: run it directly (its output is short).
3. **Gameplay or content changed**: the scenarios that cover it,
   `npm run smoke -- <names> > <scratch file> 2>&1` in the background; read only the tail
   (FLAKY = passed on its solo retry, fine). The full suite only at a milestone's end or
   after shared systems changed, and ask the owner first. If a quest beat, boss or system was added, smoke has a
   new step for it.
4. **Anything visible changed**: send `looker` with the scenes and what to check. Open a
   screenshot yourself only if looker flags a problem you need to see.
5. **Docs** (this is what lets the next session start without a recap):
   - the topic doc for what changed (behavior, decisions, new files);
   - AGENTS.md: the layout tree if files moved or were added; **"Where things stand"**,
     with today's date and what's next;
   - `docs/roadmap.md`: tick checklist items done (with the date), add new risks with a
     trigger, update tech debt; `docs/shrine.md` milestone status if relevant.
6. **Report** to the owner, briefly:
   - what changed;
   - what you verified (with results);
   - what you could not verify (audio, game feel, a real GPU or gamepad): ask them to
     play or listen;
   - where you deviated from the request;
   - the suggested next task, and whether it needs Opus or Sonnet will do.
7. Don't commit unless asked. Suggest `/clear` before the next task: the docs now hold the
   state, and a fresh context is cheaper than a long one.

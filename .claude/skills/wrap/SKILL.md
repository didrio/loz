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
5. **Docs** (this is what lets the next session start without a recap). Every session
   reads AGENTS.md and the topic docs, so **edit them to describe the game as it is now:
   replace, never append**. History lives in git; a doc isn't a changelog.
   - **AGENTS.md "Where things stand"**: rewrite the whole paragraph (≤ 8 lines): what
     plays today, what's next. No list of what this session did, no past fixes.
   - **The topic doc**: change the sentences that are now wrong, in place. Add a new fact
     where it belongs, in one or two lines. Delete what no longer holds. Don't add
     "(fixed 2026-…)" notes or playtest stories; record a decision only if a future agent
     could undo it by mistake (then: the rule, plus "owner's call" and the date).
   - **Finished plans and milestones** shrink to one line ("~~B: shrine fixes~~ done") or
     disappear. Detail that a future task still needs moves to the topic doc's
     description of how things work.
   - AGENTS.md layout tree only if files moved or were added. `docs/roadmap.md`: tick
     checklist items (with the date), add new risks with a trigger.
   - **Size check**: `wc -l AGENTS.md docs/*.md`. AGENTS.md over ~200 lines or a topic doc
     over ~400 means prune or split it now, and say so in the report.
6. **Report** to the owner, briefly:
   - what changed;
   - what you verified (with results);
   - what you could not verify (audio, game feel, a real GPU or gamepad): ask them to
     play or listen;
   - where you deviated from the request.
7. **Commit and push** (owner's standing call, 2026-11-04: `/wrap` always does this; it's the one time you commit
   without being asked). Only after check passes, and never with failing tests: stop and report instead.
   `git status --short` and `git diff --stat` (read the diff only as far as you need), stage everything with
   `git add -A` (the repo's `.gitignore` keeps `dist/`, screenshots and scratch out; if something odd shows up
   untracked, such as a secret, a big binary or a log, leave it out and say so), then commit with a message that
   summarizes the diff: a short imperative subject (≤ 70 chars) naming the main change, a blank line, then a few
   bullets on what changed and why, grouped by area (and a line for anything unverified). End it with the
   attribution line from the session's system-reminder. Then `git push origin main` (never force). If the push is
   rejected or fails, report it and stop; don't rebase or force on your own.
8. **End with "Next for you"**, a short list of exactly what the owner should do, in order:
   say the commit is pushed (with its short hash), what to play-test, then `/clear`, then
   the exact next command (e.g. `/start C: colored keys`), and whether that task wants plan
   mode (shift+tab) or not. Plan mode only for real design work; see CLAUDE.md.

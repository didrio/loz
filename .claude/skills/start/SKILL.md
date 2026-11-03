---
name: start
description: Start a work session on Embervale - get oriented from the docs (not the chat history), check the scaling checklist, and propose a plan for the next task with the cheapest capable model/agent per step. Use at the start of a session or when the owner asks "where were we" / "what's next".
---

The docs carry the project's state between sessions, so a fresh session needs no recap
from the owner. Orient cheaply: read docs, not code.

1. "Where things stand" in AGENTS.md (already in your context) and `git status` /
   `git log --oneline -5` for anything uncommitted or newer than the docs.
2. `docs/roadmap.md`: the feature order and the **scaling checklist**. Note any item whose
   trigger the next task fires.
3. The topic doc for the area the next task touches (docs table in AGENTS.md), e.g.
   `docs/shrine.md` for shrine milestones. Read only the relevant sections.
4. Read code only if the plan can't be written without it, and then only the files the
   plan names (scout for sweeping questions).

If the owner named a task in the arguments ($ARGUMENTS), plan that one; otherwise plan the
next item from "Where things stand".

Reply briefly with:
- **Where we are**: 2-3 lines.
- **Next task** and any **triggered checklist items** (do those as part of it).
- **Plan**: 3-8 steps. For each, who does it: main session on Sonnet (default),
  `builder` (planned multi-file work, parallel modules), `looker` (visual checks),
  `scout` (sweeping searches), `architect` (hard math/physics/stuck bugs). Say where Opus
  is worth it and where it isn't.
- **Questions for the owner**: design calls only they can make. Ask them now, not
  halfway through.

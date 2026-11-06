---
name: start
description: Start a work session on Embervale by picking up a ticket from docs/tickets.md - read the ticket and only what it names, check the session matches its Run line, then build it (auto) or plan it (plan mode). Use at the start of a session, with a ticket id ("/start T3") or without (the first open ticket), or when the owner asks "where were we" / "what's next".
---

The ticket was written by a session that had the context, so it is your orientation: trust
it and read narrowly.

1. **Find the ticket.** `docs/tickets.md`: the one named in $ARGUMENTS (e.g. `T3`), else the
   first open ticket. Read only that ticket, not the whole file's other tickets in detail.
   `git status --short` and `git log --oneline -3` for anything uncommitted or newer.
2. **Check the Run line** against this session (plan mode on or off, the model you are).
   If they don't match, say so in one line with the exact switch (e.g. "This ticket wants
   plan · opusplan · high: `/model opusplan`, effort high, shift+tab into plan mode, then
   `/start T5` again") and stop. You can't see the effort level: if it matters, mention it.
3. **Read the ticket's Read-first list**, the doc sections and files it names, and nothing
   else up front. Read more code only when the work needs it (Grep, then offset/limit; `scout`
   for sweeps). If a pointer is stale (a file moved), fix it in the ticket.
4. **Questions for the owner** in the ticket's Notes, or a design call only they can make:
   ask them all now in one AskUserQuestion, before building.
5. **Go.**
   - **auto ticket:** reply with a 2–5 line plan (and which agent does what, if any:
     `builder`, `looker`, `scout`, `architect`; see CLAUDE.md) and **start building in the
     same turn**. Don't wait for "go": the owner reads along and stops you if needed.
   - **plan ticket:** follow "Plan mode" in CLAUDE.md. The plan ends as written design plus
     tickets, or as an approved build on Sonnet, whichever the ticket asks for.
6. Finish with `/wrap` (the owner may type it, or you run the Definition of done and say
   "ready for `/wrap`").

**No ticket, just "where were we":** answer from AGENTS.md "Where things stand" and the
open tickets' titles and Run lines (2–4 lines), and end with **Next for you**: the first
ticket's Run line as settings, then `/start T<n>`.

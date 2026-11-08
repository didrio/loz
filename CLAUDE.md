@AGENTS.md

# Claude Code: models, agents and cost

AGENTS.md (imported above) holds the project rules for any agent. This part is specific to
Claude Code and is about spending the owner's money well **without lowering the bar**:
the Definition of done still applies in full.

## Where the money goes

1. **The main session's model and effort.** Opus costs several times what Sonnet does per
   token, and higher effort means more thinking tokens on every turn. Most work here is
   Sonnet at medium effort, because the patterns are built and documented. Each ticket's
   **Run line** says what to use (table below).
2. **Context length.** Every turn re-sends the whole conversation. One ticket per session;
   when it's done, `/wrap`, then `/clear`. The docs and tickets carry the state between
   sessions, not the chat. `/compact` if a ticket runs long.
3. **Reading.** AGENTS.md maps every file, so go straight to the one you need. Files over
   ~400 lines (`game/bosses/lamplighter.ts`, `game/game.ts`, `world/dungeon/build.ts`,
   `game/enemies.ts`, `game/boss.ts`, `game/player.ts`): Grep for the symbol, then read
   that range with offset/limit. Never read `dist/`, `package-lock.json` or `node_modules`
   wholesale.
4. **Images.** Each screenshot costs 1-2k tokens and stays in context for the rest of the
   session. Visual checks go to `looker`; open a PNG yourself only to see a problem it
   reported.
5. **Subagents start cold.** Each one pays its own setup and re-reads what it needs.
   Delegate when the work is big and the answer small, or when another model fits the job
   better. Don't delegate what you'll need in your own context anyway, or a two-minute
   edit.

## Choosing a ticket's Run line

Every ticket ([docs/tickets.md](docs/tickets.md)) carries `Run: <mode> · <model> · <effort>`,
chosen by whoever writes it, and every "Next for you" repeats it. Pick the cheapest setting
that gets the ticket right **the first time**: a redo costs more than the upgrade would have.

| The ticket is... | Run |
|---|---|
| A documented pattern or recipe: content, rooms, enemies, NPCs, text, UI, tests, smoke steps, docs, tooling, a clear-cut fix | **auto · sonnet · medium** (the default) |
| A clear spec but fiddly: many files to keep consistent, timing or determinism, a refactor through a shared system (player, physics, camera, saves, `game.ts`) | **auto · sonnet · high** |
| Real design: a new system, a data format the owner should see, a dungeon, a boss or a region, or a choice between approaches the owner should make | **plan · opusplan · high** (plans on Opus, builds on Sonnet once the owner approves) |
| A bug that survived one fix; physics, collision or camera math; performance | **auto · opus · high** (or hand it to `architect`) |
| The same, after high effort failed once | **auto · opus · xhigh** |

- **Never as a first try:** xhigh, or Opus for content. Low effort isn't used in the main session.
- **Plan mode with Sonnet** is not a combination we use: real design deserves Opus, and
  anything that doesn't need Opus doesn't need plan mode either.
- **How the owner sets it:** `/model sonnet` / `opus` / `opusplan`, the effort level, and plan
  mode on or off (shift+tab). The project default model is `opusplan`, so an "auto · sonnet"
  ticket needs no model change from it.
- Don't upgrade mid-ticket on a hunch. If a ticket turns out harder than its Run line, say so,
  and finish it or stop at a clean point and write the rest as a ticket with a better Run line.

## Plan mode

**Inside plan mode, these rules override the built-in plan-mode workflow:**
- No `Explore` or `Plan` subagents. Each one starts cold and re-reads what you're about to
  read anyway. Read the files AGENTS.md names yourself (Grep, then offset/limit), or send
  one `scout` if the question really spans many unknown files.
- Ask the owner's design questions in one AskUserQuestion, up front.
- Keep the plan file short: what changes, in which files, how it's verified. Then exit
  plan mode, so the build runs on Sonnet.
- If the plan spans several sessions, write it as tickets in `docs/tickets.md` (and the
  design in the topic doc) before the session ends. The plan file in `~/.claude/plans/`
  doesn't survive `/clear` as far as the next session knows.

## Commands: run them directly

`npm run check` prints ~40 lines and takes ~5 s: run it in the main session, no subagent.
`npm run smoke` prints ~30 lines but takes minutes, and its cost is mostly time: run only the
scenarios a change touches (`npm run smoke -- shrine-enemies`), the full suite only when
AGENTS.md's Definition of done says so (and ask first). Run it in the background with
output to a scratch file (`npm run smoke -- <names> > <scratch>/smoke.log 2>&1`) and read
the tail. It retries a failed scenario alone: FLAKY means it passed alone (machine load),
so don't investigate that; a FAIL after the retry is real. Don't run smoke, look or other
browser work at the same time: they compete for the CPU and make each other flaky.

## Agents (`.claude/agents/`)

| Agent | Model | Use it for | Don't use it for |
|---|---|---|---|
| `scout` | Haiku, low | Sweeping read-only searches: every use of a flag/id, which modules touch a system, inventories | A file AGENTS.md already names |
| `looker` | Sonnet, medium | Every visual check: runs `npm run look`/scratch Playwright, reports in text | Judging motion, feel or audio (the owner plays every change) |
| `builder` | Sonnet, medium | Executing a decided plan from an Opus session; independent modules in parallel; it verifies with check/smoke | Small edits in a Sonnet session (do them) |
| `architect` | Opus, high | A bug that survived one fix; physics/collision/camera math; boss move system; engine design; perf | Routine content and features |

**Escalation:** work on Sonnet. If a fix fails once, stop guessing: write down the repro
(ideally a failing test), what you tried and why it failed, and hand it to `architect`.
It fixes, or returns a spec for `builder`.

**The loop:** `/start T<n>` → build (or plan, if its Run line says so) → `looker` for
visuals → `/wrap` (checks, docs, commit, the next ticket's Run line) → `/clear`.

## Skills (`.claude/skills/`)

- `/start [T<n>]`: read the ticket and its Read-first list, check the session matches its Run
  line, then build (auto) or plan (plan mode).
- `/wrap`: Definition of done, doc updates, delete the finished ticket, commit and push, and
  name the next ticket with its Run line.
- `/final-pass`: the recipe for a model's Final pass (before renders, kit, rig, tests, renders to the owner, the golden set).
- `/add-enemy`, `/add-npc`, `/add-quest-beat`: recipes for the repeated content work. Each opens
  with what it assumes; if the game's direction changes, rewrite or delete it.

When a kind of work repeats (adding an enemy, a dungeon room, a quest beat, a look scene),
write its recipe as a skill the second time you do it. A skill costs one line of context
until it's used, and it turns the next one into Sonnet work.

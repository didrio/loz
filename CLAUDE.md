@AGENTS.md

# Claude Code: models, agents and cost

AGENTS.md (imported above) holds the project rules for any agent. This part is specific to
Claude Code and is about spending the owner's money well **without lowering the bar**:
the Definition of done still applies in full.

## Where the money goes

1. **The main session's model.** Opus costs several times what Sonnet does per token.
   Most work here is Sonnet work, because the patterns are built and documented: content,
   rooms, enemies on the existing base, UI, tests, smoke steps, docs. The project default
   is `opusplan` (`.claude/settings.json`): Opus in plan mode, Sonnet when building. Use
   full Opus (`/model opus`) only for design talks with the owner, milestone planning,
   or a bug that survived one fix.
2. **Context length.** Every turn re-sends the whole conversation. One task per session;
   when it's done, `/wrap`, then `/clear`. The docs carry the state between sessions, not
   the chat (`/start` picks it up). `/compact` if a task runs long.
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
| `looker` | Sonnet, medium | Every visual check: runs `npm run look`/scratch Playwright, reports in text | Judging motion, feel or audio (ask the owner) |
| `builder` | Sonnet, medium | Executing a decided plan from an Opus session; independent modules in parallel; it verifies with check/smoke | Small edits in a Sonnet session (do them) |
| `architect` | Opus, high | A bug that survived one fix; physics/collision/camera math; boss move system; engine design; perf | Routine content and features |

**Escalation:** work on Sonnet. If a fix fails once, stop guessing: write down the repro
(ideally a failing test), what you tried and why it failed, and hand it to `architect`.
It fixes, or returns a spec for `builder`.

**Typical feature** (e.g. a shrine milestone): `/start` → plan in plan mode (Opus via
opusplan), with the owner's design calls asked up front → build on Sonnet (main session,
or `builder` for independent parts in parallel) → `looker` for visuals → `/wrap` →
`/clear`.

## Skills (`.claude/skills/`)

- `/start [task]`: orient from the docs and git, check the scaling checklist, propose a
  plan with a model/agent per step.
- `/wrap`: Definition of done, doc updates (incl. "Where things stand"), plain report.

When a kind of task repeats (adding an enemy, a dungeon room, a quest beat, a look scene),
write its recipe as a skill the second time you do it. A skill costs one line of context
until it's used, and it turns the next one into Sonnet work.

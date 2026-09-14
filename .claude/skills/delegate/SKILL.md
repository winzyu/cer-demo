---
name: delegate
description: How to hand implementation work in cer-demo to a Sonnet subagent — the brief template, model routing, and the routing check. Use before any Agent call that edits files, writes tests, or does a scoped refactor or feature.
---

# Delegating to a Sonnet subagent

Make an edit inline when it takes a couple of tool calls; delegate larger or multi-file mechanical work.

## Route it, then prove it routed

- Pass `model: "sonnet"` on the Agent call itself. Do not rely on agent-frontmatter `model:` or an
  env var — both have been silently ignored before (every subagent from 2026-08-17 to 2026-09-02
  ran on Opus).
- After the first delegation of a session, check the model the subagent actually ran on:

  ```bash
  grep -ho '"model":"claude[^"]*"' ~/.claude/projects/-mnt-c-Users-winsy-OneDrive-Documents-work-and-school-coding-project-aic-clean-earth-rovers-repo-cer-demo/*/subagents/*.jsonl | sort | uniq -c
  ```

  Narrow the glob to the current session directory if the totals are ambiguous. If it did not
  route to Sonnet, stop delegating and tell the user.

## The brief

The subagent inherits none of this conversation — only the prompt. A subagent producing code that
does not fit the repo is an under-specified brief. Every task prompt carries:

1. **Goal** — one or two sentences, and why.
2. **Exact files** to touch, and files that are off-limits (including anything another agent is
   editing concurrently).
3. **Conventions** in force — point at `docs/migration/CONVENTIONS.md` and name the specific
   patterns and naming to follow.
4. **Settled decisions** that are not to be relitigated.
5. **Traps** relevant to the task (e.g. `SENSOR_TOOL`/`REPORT_TOOL` change the pinned system
   prompt; the device API is production with no QA mirror; `test/setupEnv.ts` blocks `.env` in
   jest).
6. **House rules**, verbatim:
   - Write only inside cer-demo; `../user-dashboard` and `../backend` are read-only.
   - Run no git commands.
   - Never run the full jest suite. Run only the suites for what you touched
     (`npx jest test/unit/foo.test.ts`, or `npx jest -t "<name>"`), and report which ones.
     `npm run typecheck` and `npm run lint` are cheap and read-only.
   - Do not spawn subagents.
7. **Report format** — what changed per file, suites run with results, anything unsure.

## After it returns

Read the actual diff, not the agent's summary. Mandatory for retrieval accuracy, numeric data
handling, gate logic or judge logic.

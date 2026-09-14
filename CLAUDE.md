# Scope

WRITE: only within this repository (cer-demo).
READ-ONLY: ../user-dashboard and ../backend are reference repos.
Never create, edit, or delete files outside cer-demo. If a task seems to
require modifying a reference repo, stop and tell me instead.

All migration planning artifacts go in docs/migration/.

Never hand-edit generated or captured artifacts. Eval transcripts (`eval/transcripts/`) are
captured runs that cannot be reconstructed. Regenerate the rest from their source:
`eval/grading/` with `npm run grade:packet`, `eval/retrieval-labels/` with
`scripts/resolveRetrievalLabels.ts`, `data/corpus/` with `npm run ingest`, `dist/` with
`npm run build`, `package-lock.json` with npm.

# Docs

docs/ holds current state only. Superseded session handoffs and the reference-repo
convention docs are **not in the tree** — they live in git history under archive
tags. `docs/ARCHIVED.md` lists what moved, why, and which tag holds it.

Never grep for, read, or cite an archived doc unprompted. If a question seems to
need one, ask me first — usually the archived doc is stale and a current doc
already answers it. Retrieve with `git show <tag>:<path>`, never by restoring the
file to the tree.

**Start at `docs/STATUS.md`**: current state, open work and active traps. Open other
docs only when the task needs them. STATUS.md is rewritten at the end of every
session by `/handoff`, so never cite it from code or other docs; durable reasoning
goes in `docs/SPECS.md`, `docs/EVAL_REBUILD.md` or the `docs/timeline.md` decision log.

When we are weighing options or design choices, publish an Artifact page rather
than a long block of terminal text.

# Delegation

This project runs an Opus orchestrator with Sonnet subagents.

- **Delegate by size.** Make an edit inline when it takes a couple of tool calls; delegate larger or multi-file mechanical work to a Sonnet subagent via the `delegate` skill.
- **Review subagent output before treating it as done.** Read the actual diff, not
  the agent's summary. Mandatory for retrieval accuracy, numeric data handling,
  gate logic or judge logic.
- **Delegation is one level deep.** Subagents do not spawn subagents.

# Testing

Run only the tests relevant to what you changed. Never run the full suite — it is
slow and burns tokens I would rather spend elsewhere. I run `npm test` myself and
will report anything that breaks.

- Target the specific suites: `npx jest test/unit/foo.test.ts`, or `npx jest -t
  "<name>"` for a single case. Pick them by what you touched, and say which ones
  you ran.
- `npm run typecheck` and `npm run lint` are cheap and read-only — run them freely.
  (`npm run lint:fix` writes files.)
- For a bug fix, reproduce it end-to-end first — see the `run-local` skill.
- This applies to subagents too. If you delegate, pass the rule along.

# Git

**Never run a git command until I have confirmed the plan for it.** My confirmation
says who runs it — me, or you. When you run it, run exactly the approved commands.

At every checkpoint you reach and verify, use the `git-plan` skill: it holds the
plan format, the scope rules, and the commit-message rules.

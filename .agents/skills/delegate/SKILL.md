---
name: delegate
description: Scope and review an explicitly requested or materially useful parallel CER task with isolated edits.
---

# Delegate a bounded task

Work inline by default; delegate only independent work whose parallelism or isolation justifies another context.
Read-only research needs no worktree; every delegated edit needs its own worktree.
Worktrees start from committed HEAD; do not assume they contain the user's uncommitted changes.

Use the `cer-worker` custom agent (`gpt-5.6-sol`, medium) for bounded implementation work.
Do not assume spawning a Codex subagent creates a worktree: it normally shares the filesystem.
Create an approved worktree first and use a verified worktree-scoped worker; if this client cannot scope it, use a separate Codex session rooted there or keep the task inline.
Never fabricate Claude `isolation` or `EnterWorktree` parameters in Codex.

Give the worker the goal, exact editable/off-limits paths, settled decisions, relevant conventions from `docs/migration/CONVENTIONS.md`, production traps, and required verification.
For runtime setup, point to `../run-local/references/worktree.md`; do not load it for read-only research.
Assign disjoint paths to parallel workers.
Require: edits only in the assigned worktree, reference repositories read-only, no Git mutations, no full test suite, and no further delegation.
Ask for changed paths, actual checks/results, uncertainties, and worktree path/branch.

Review `git -C <worktree> status --short` and the actual diff before accepting the work, especially retrieval, numeric handling, gate, and judge logic.
Use `git-plan` to propose landing or cleanup; never silently merge or delete a worker's work.

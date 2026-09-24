---
name: delegate
description: Scope and review an explicitly requested or materially useful parallel CER task with isolated edits.
---

# Delegate a bounded task

Work inline by default; delegate only independent work whose parallelism or isolation justifies another context.
Read-only research needs no worktree; every delegated edit needs its own worktree.
Worktrees start from committed HEAD; do not assume they contain the user's uncommitted changes.

Use `model: "sonnet"` and `isolation: "worktree"` on Claude Agent calls that edit files.
Confirm routing from available session metadata; do not scan historical transcripts by default.

Give the worker the goal, exact editable/off-limits paths, settled decisions, relevant conventions from `docs/migration/CONVENTIONS.md`, production traps, and required verification.
For runtime setup, point to `../run-local/references/worktree.md`; do not load it for read-only research.
Assign disjoint paths to parallel workers.
Require: edits only in the assigned worktree, reference repositories read-only, no Git mutations, no full test suite, and no further delegation.
Ask for changed paths, actual checks/results, uncertainties, and worktree path/branch.

Review `git -C <worktree> status --short` and the actual diff before accepting the work, especially retrieval, numeric handling, gate, and judge logic.
Land or clean up through `git-plan` and report what ran; never delete a worker's unmerged work without asking.

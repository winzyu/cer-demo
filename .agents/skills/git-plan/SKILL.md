---
name: git-plan
description: Prepare an exact, approval-gated Git mutation plan or a requested commit message for CER Demo.
---

# Git plan

Use before Git mutations or when a Git plan/commit message is requested, not after every checkpoint.
Read-only inspection needs no plan: status, log, diff, show, ls-files, ls-tree, rev-parse, check-ignore, and worktree list (including `git -C` forms).

1. Inspect fresh status, branch/upstream, recent commits, and relevant worktrees.
2. Scope the plan to this task's current uncommitted changes; exclude others' work and already-landed commits.
3. State branch/worktree, target, exact verification results, untested or failing checks, and paths.
4. List exact commands in order with brief purposes; flag history rewriting, deletion, secrets, generated files, or dependency changes.
5. Wait for chat approval: yes/go/ok means execute; if the user says they will run it, leave execution to them.
6. Execute exactly the approved commands; stop and revise the plan if circumstances change.

Do not claim unverified work is ready; if no relevant changes remain, say so instead of producing a plan.
For retrieval, numeric handling, gate, or judge changes, review the actual diff carefully before proposing a commit; use an available fresh-context review when useful.
Runtime sandbox approvals may still be required; chat approval does not bypass them.

## Landing worktrees

After reviewing the diff, propose one plan: add explicit paths and commit in the worktree, merge into the target checkout, then remove the worktree and delete its merged branch.
Include worktree creation in a Git plan when using `git worktree add`.
If target-checkout changes overlap, stop; never stash the user's work to make room.
Never stage `.env`, `node_modules`, shared cache links, or migration backups.
Rejected worktree cleanup also needs approval.

## Commit messages

Use a short subject stating what changed, with at most a few body lines and no attribution.
Put architectural rationale in durable docs, not the commit message.

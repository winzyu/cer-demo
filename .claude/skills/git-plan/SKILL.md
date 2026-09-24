---
name: git-plan
description: Run CER Demo Git mutations without approval and report them as a command summary; ask first only before losing work or rewriting shared history; also writes commit messages.
---

# Git plan

Git in cer-demo runs without approval; report what ran afterwards.
Read-only inspection is always free: status, log, diff, show, ls-files, ls-tree, rev-parse, check-ignore, fetch, and worktree list (including `git -C` forms).

1. Inspect fresh status, branch and upstream, recent commits, and relevant worktrees before mutating.
2. Scope to this task's changes: stage explicit paths, never `git add -A` or `.`; leave other workstreams' edits and untracked files you did not create alone.
3. Verify before committing; never present unverified or failing work as ready.
4. Run the commands; if circumstances change mid-way (conflict, unexpected diff, moved upstream), stop and report instead of improvising.
5. Report briefly: branch, the commands in order with a one-line purpose each, resulting commit hashes, push target, checks and their results, and anything skipped.

## Ask first

These commands lose work or rewrite shared history. Name the command and what it would lose, then wait for yes in chat:
- `reset --hard`, `checkout --` or `restore` over uncommitted changes, `clean`, `stash drop` or `stash clear`
- deleting an unmerged branch or a worktree with uncommitted changes
- force-push, rebasing or amending pushed commits, deleting a remote branch other than a `cloud/explore-*` branch whose report has been read
- anything in `../clean-earth-rovers-server` or `../user-dashboard` beyond committing on `local`: never push, force-push or merge there (CLAUDE.md)

Never stage `.env`, `node_modules`, shared cache links, migration backups, or secrets.

## Cloud branches

Before merging a `cloud/*` branch into `dev`, fetch it, review its actual diff, and rerun its suites plus `npm run typecheck`.
`cloud/explore-*` branches hold reports only and are never merged; read them with `git show origin/<branch>:<path>`.

## Landing worktrees

Review the diff, then add explicit paths and commit in the worktree, merge into the target checkout, remove the worktree and delete its merged branch.
If target-checkout changes overlap, stop; never stash the user's work to make room.

## Commit messages

Use a short subject stating what changed, with at most a few body lines and no attribution.
Put architectural rationale in durable docs, not the commit message.

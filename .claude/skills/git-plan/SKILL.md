---
name: git-plan
description: Run CER Demo Git mutations without approval and report them as a command summary; irreversible commands need explicit permission first; also writes commit messages.
---

# Git plan

Git in cer-demo runs without approval; report what ran afterwards.
Read-only inspection is always free: status, log, diff, show, ls-files, ls-tree, rev-parse, check-ignore, fetch, and worktree list (including `git -C` forms).

1. Inspect fresh status, branch and upstream, recent commits, and relevant worktrees before mutating.
2. Scope to this task's changes: stage explicit paths, never `git add -A` or `.`; leave other workstreams' edits and untracked files you did not create alone.
3. Verify before committing; never present unverified or failing work as ready.
4. Run the commands; if circumstances change mid-way (conflict, unexpected diff, moved upstream), stop and report instead of improvising.
5. Report briefly: branch, the commands in order with a one-line purpose each, resulting commit hashes, push target, checks and their results, and anything skipped.

## Irreversible commands: explicit permission required

A command that can destroy work or rewrite history someone else may already have is never run on your own.
Before running one, ask explicitly in chat. Name the exact command and exactly what it would lose, such as uncommitted files, commits or a remote ref. Run it only after an explicit yes to that command.
Permission covers only the command it was given for; ask again for the next one.

Examples of irreversible commands:
- Discarding uncommitted work: `git reset --hard`, `git checkout -- <path>`, `git checkout -f`, `git restore <path>`, `git switch --discard-changes`, `git clean -f`/`-fd`/`-fdx`
- Dropping stashes: `git stash drop`, `git stash clear`, or `git stash pop` if it conflicts and you plan to reset
- Deleting local work: `git branch -D` on an unmerged branch, `git worktree remove --force`, `git update-ref -d`
- Rewriting pushed history: `git push --force` or `--force-with-lease`, and `git rebase`, `git commit --amend`, `git reset` or `git filter-repo`/`filter-branch` on commits already pushed
- Deleting remote refs: `git push origin --delete <branch>`, `git push origin :<ref>`, deleting a pushed tag.
- Destroying recovery data: `git reflog expire`, `git gc --prune=now`
- Anything in `../clean-earth-rovers-server` or `../user-dashboard` beyond committing on `local`: never push, force-push or merge there (CLAUDE.md)

When unsure whether a command is reversible, treat it as irreversible and ask.

Never stage `.env`, `node_modules`, shared cache links, migration backups, or secrets.

## Landing worktrees

Review the diff, then add explicit paths and commit in the worktree, merge into the target checkout, remove the worktree and delete its merged branch.
If target-checkout changes overlap, stop; never stash the user's work to make room.

## Commit messages

Use a short subject stating what changed, with at most a few body lines and no attribution.
Put architectural rationale in durable docs, not the commit message.

# Proposed Git plan - commit and push the handoff

Approval is pending; no command below has run except read-only inspection and the patch dry run.
This is a durability push, not a correction-branch landing.
The unmerged correction worktree remains available for the next session's prompt reconciliation.

## Scope and preconditions

The correction commit stages only the exact paths in [commit-paths.txt](commit-paths.txt), including regenerated labels and the new verification/handoff records.
The main-checkout commit stages its STATUS update and only the newly appended EVAL_REBUILD section, leaving the earlier 23-line note unstaged.
Both indexes must be empty before staging.
Stop and revise this plan if local heads, task-owned file contents, remote history or staged files change from the reviewed state.
The fetch below is needed because `origin/dev` is a local tracking ref, not a fresh server check.
If fetched `origin/dev` differs from `c41ffb5`, or the remote correction branch already exists, stop before committing or pushing and inspect the new state.

The correction-branch implementation passed 181 targeted Jest tests, typecheck, lint and the offline audit; merged Gilligan/catalogue behavior is not tested.
The historical checker deliberately fails on the changed prompt hash.
There are no dependency changes, secrets, captured transcript edits, history rewrites, forced pushes or deletions.
The two EPA files are the reviewed dependency from `5d269a3`.
The push of `dev` will also publish all 11 existing Gilligan/recovery commits currently ahead of `origin/dev`, in addition to the handoff documentation commit.
No other repository or tag is pushed.

## Commands, in order

Run from the main cer-demo checkout.
Stop after any failure or unexpected state; do not stash other work or force a push.

```bash
cd /home/winsy/code/clean-earth-rovers/repo/cer-demo

git fetch origin
git rev-parse dev origin/dev eval/wave1-corrections
git ls-remote --heads origin refs/heads/eval/wave1-corrections
git status --short --branch
git diff --cached --exit-code
git -C .claude/worktrees/wave1-corrections diff --cached --exit-code

git -C .claude/worktrees/wave1-corrections add --pathspec-from-file=eval/reviews/wave1-corrections-2026-09-22/commit-paths.txt
git -C .claude/worktrees/wave1-corrections diff --cached --check
git -C .claude/worktrees/wave1-corrections diff --cached --stat
git -C .claude/worktrees/wave1-corrections commit -m "Correct Wave 1 fixtures and explanatory refusal context"

git add -- docs/STATUS.md
git apply --cached .claude/worktrees/wave1-corrections/eval/reviews/wave1-corrections-2026-09-22/handoff-eval.patch
git diff --cached --check
git diff --cached --stat
git commit -m "Record the Wave 1 correction handoff"

git push --atomic --set-upstream origin dev eval/wave1-corrections

git status --short --branch
git -C .claude/worktrees/wave1-corrections status --short --branch
git ls-remote --heads origin refs/heads/dev refs/heads/eval/wave1-corrections
```

Expected pre-commit heads are `dev=eaba51cfc88bb65ddda03aa2385ee4e6d19db47b` and both `origin/dev` and `eval/wave1-corrections=c41ffb5fae172d44e6fdaae7c36ab57e55c3b886`.
The first commit contains the correction branch's explicit path list; the second contains only `docs/STATUS.md` and the appended EVAL_REBUILD section.
The atomic push publishes both branch tips together, without updating tags.
If the server rejects either ref, stop without force-pushing.
After success, the correction worktree should be clean; the main checkout should still show the pre-existing EVAL_REBUILD edit and the three untracked input/artifact paths.
The EPA worktree remains untouched.

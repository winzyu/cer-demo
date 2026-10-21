# Branch propagation - handoff

Written 2026-10-21 by the docs overhaul chat, at `docs/cleanup` after `dev` `79c0f5a`.
Goal: carry `dev`'s docs reorganization (and everything else on `dev`) into every active branch by merging `origin/dev` into each, so no branch still writes to `docs/migration/`.
The user approved items 1-5 below on 2026-10-21 and skipped item 6; nothing else is approved.

## Rules

- Merge, never rebase: `git merge --no-edit origin/dev` inside the branch's own worktree; history is not rewritten (user, 2026-10-20).
- One merge commit per branch, then push that branch to `origin`; never push `dev` or `main`, and never merge a branch into `dev` (the coordinator lands by squash).
- Resolve conflicts by keeping both sides' content; where a file only moves, take `dev`'s folder; never drop a hunk to make a conflict go away.
- Before resolving, run `git fetch origin` and check the branch tip still equals the SHA in the table; if it moved, or its worktree has uncommitted changes, stop and report.
- Other sessions own these branches (flagging, reflection, tide-tool, data tools); report each push to the coordinator so their owners pull before their next commit.
- Do not touch `eval/transcripts/`, `eval/grading/`, captured folders' contents, `data/`, `dist/`, or untracked files; in the main checkout, the user's untracked files stay as they are.
- Commands that discard work or delete refs need the user's explicit yes, one command at a time (the `git-plan` skill).
- No live device-API reads and no paid model runs are needed or allowed.
- Markdown: one sentence per line, plain hyphens, no attribution lines.

## Where files go

Folder roles are in [`DOCS_OVERHAUL_PROPOSAL.md`](DOCS_OVERHAUL_PROPOSAL.md) section 4 and the README's docs table.
Git's rename detection puts some added files under the wrong folder (often `captures/`), so check every path the merge writes.

| branch adds | goes to |
|---|---|
| `docs/migration/GILLIGAN_FIRESTORE_AND_TESTING_PLAN.md` | `docs/plans/` (open; the user has not decided keep or archive) |
| `docs/migration/FLAGGING_REWORK_HANDOFF_2026-10-13.md` and its explainer `FLAGGING_OVERVIEW_2026-10-12.html` | `docs/plans/` |
| `docs/migration/flagging-runs/` (3 JSON) | `docs/captures/flagging-runs/` |
| `docs/migration/data-skepticism-runs/fix-matrix/after-fd7f008*.json` | `docs/captures/data-skepticism-runs/fix-matrix/` |
| `docs/migration/DEMO_PREP_PROMPT.md` | `docs/plans/` |
| `docs/reflection/` | stays where it is (the reflection course) |

After the move, rewrite every link in the branch's own added or edited lines that still points at `docs/migration/`, and every link elsewhere that points at a file you moved.
Captured JSON is moved, never edited.

## The branches, in this order

Previewed read-only on 2026-10-21 with `git merge-tree --write-tree --name-only --messages origin/<branch> origin/dev`.

| # | branch | tip | worktree | expected conflicts |
|---|---|---|---|---|
| 1 | `task/tide-tool` | `36ef4a9` | `.claude/worktrees/tide-tool` | none |
| 2 | `docs/firestore-testing-plan` | `60befd4` | `.claude/worktrees/firestore-plan` | a directory-rename split for its one plan file: place it in `docs/plans/` |
| 3 | `task/swell-rule` | `bc37b4a` | none: create `.claude/worktrees/swell-rule` on the existing branch, and remove it after the push | the two `after-fd7f008` captures (move as above); content in `docs/records/DATA_SKEPTICISM_FIX_2026-10-12.md` (keep both); it also changes `src/prompt/systemPrompt.ts` and `test/unit/prompt.test.ts` |
| 4 | `reflection` | `4c15796` | the main checkout | `.gitignore` and `release/start-rc2-emulator.sh` (the user's WSL path fixes against `dev`'s; keep the WSL paths and any `dev` additions), `docs/STATUS.md` (keep both), `DEMO_PREP_PROMPT.md` (move); its edits to `GILLIGAN_DEPLOYMENT_RUNBOOK.md` and `GILLIGAN_LANDING_2026-09-29.md` should follow the renames to `runbooks/` and `records/`; its own docs cite about 19 `docs/migration/` paths to rewrite |
| 5 | `task/flagging-share-window` | `9714309` | `.claude/worktrees/flagging-share-window` | `docs/STATUS.md` and `docs/timeline.md` (keep both), 5 added files (move as above) |
| 6 | `fix/window-note` | `4fb59bf` | - | **skip**: a production hotfix cut from the deployed `ddd6292`; its fix is already on `dev` (`469e972`), and merging `dev` would pull every undeployed change into it |

Branch 5, extra check: the branch once deleted SPECS §10.7-§19 (`git diff -U0 origin/dev...origin/task/flagging-share-window -- docs/SPECS.md | grep '^@@'`).
The preview shows no SPECS conflict, so after the merge compare `git show HEAD:docs/SPECS.md` with `origin/dev`'s for the headings `### 10.7` to `## 19`; if any is missing, restore it from `origin/dev` and tell the coordinator, because a later squash would delete it from `dev`.

Branch 4: the main checkout holds 8 untracked files of the user's (`git status --short`); a merge leaves untracked files alone, but if Git refuses because an untracked file would be overwritten, stop and ask.

## Checks before each push

- No conflict markers: `git diff --check HEAD~1` and `git grep -nE '^(<<<<<<<|>>>>>>>)'` print nothing.
- No tracked file under `docs/migration/`: `git ls-files docs/migration` prints nothing.
- No link to it: `git grep -n 'docs/migration/' -- docs ':!docs/ARCHIVED.md' ':!docs/plans/DOCS_OVERHAUL_PROPOSAL.md' ':!docs/captures'` shows only historical mentions inside records, which keep their text.
- Every relative link in tracked `docs/` `.md` and `.html` files outside `captures/` resolves: a short script checks each Markdown link target and every `href=` and `src=` target exists (0 unresolved).
- When `src/`, `scripts/` or `test/` changed in the merge: `npm run typecheck` and `npm run lint`, plus the named suites the branch touches run singly with `--runInBand` (for branch 3, `test/unit/prompt.test.ts`); never the full suite.
- A worktree without `node_modules` links the main checkout's, as the `run-local` skill's worktree reference says; never stage the link.

## Report

After each push, message the coordinator with: branch, merge commit SHA, conflicts and how each was resolved, files moved, links rewritten, and checks with their results.
At the end, tell the user in a few lines which branches now carry `dev` and anything stopped or skipped.
Future landings on `dev` need `dev` merged back into the remaining branches again; that is the squash-landing rule, not part of this task.

Resume with: `Read docs/plans/BRANCH_PROPAGATION_HANDOFF.md on dev, then merge origin/dev into branches 1-5 as it says.`

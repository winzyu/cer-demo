# Docs overhaul - handoff

Current as of 2026-10-17 at `docs/cleanup` (the commit that adds this file; `git log -1 docs/cleanup`).
A fresh session reads this file, then [`DOCS_OVERHAUL_PROPOSAL.md`](DOCS_OVERHAUL_PROPOSAL.md) sections 4-9, then follows "Next step".

## What this is

The docs cleanup chat for cer-demo is reorganizing `docs/` into folders by role (`reference/`, `runbooks/`, `plans/`, `people/`, `records/`, `captures/`) so `docs/migration/` can go away.
Work happens only in the worktree `.claude/worktrees/docs-cleanup` on branch `docs/cleanup`; the coordinator lands each batch on `dev`.
The original prompts are `~/code/work/clean-earth-rovers/handoff/2026-10-16/3-docs-cleanup.md` and `3b-docs-overhaul.md`; their rules still apply.

## Standing decisions

- Phase 2 approved by the user on 2026-10-17 with the coordinator's changes; all six decisions are recorded in the proposal, section 9:
  - D1 structure and batch order approved; every batch skips links inside `SPECS.md` §10.7-§19 (dev lines 1099-1786 at `eb9fe5c`), left for batch 7 or 8.
  - D2 reword `CLAUDE.md`/`AGENTS.md` lines 8 and 16 to `docs/plans/` and `docs/records/` in batch 8.
  - D3 no renames.
  - D4 rewrite the `src/catalogue/catalogue.json` doc paths in batches 4 and 7, regenerate `docs/catalogue/review.html` with `scripts/renderCatalogueReview.ts`, run `test/unit/catalogue.test.ts` and `catalogueReviewPage.test.ts` singly with `--runInBand`.
  - D5 replace the root `README.md` doc table (lines 39-46) with one line per docs folder in batch 3, never pointing at STATUS.
  - D6 eval docs stay at the root.
- `docs/README.md` was declined (2026-10-16): STATUS "Where things live" is the only map.
- Each batch: show the user the file list first and get a yes, then one commit, push `docs/cleanup`, report the commit ID for the coordinator.
- Only batch 2 archives (`gilligan_v0.png`, tag `docs-archive-2026-10-16c`, with an `ARCHIVED.md` row and section in the existing style).
- In STATUS, `timeline.md`, SPECS, `CLAUDE.md` and `AGENTS.md` only mechanical link-path rewrites are allowed (plus D2's wording); list each in the batch report.
- One sentence per line in Markdown, plain hyphens, no attribution lines, stage explicit paths only.

## State

| Item | State |
|---|---|
| Codex's five retired docs, tag `docs-archive-2026-10-16` | done `21a60e8`, landed |
| Batch b, tag `docs-archive-2026-10-16b` | done `6e019cf`, landed |
| Proposal | `3044fa7`, decisions recorded with this handoff |
| Batches 1-6 | next, in order |
| Batches 7-8 | wait until `task/flagging-share-window` lands on `dev` |
| Landing sweeps for `reflection`, `task/tide-tool`, `docs/firestore-testing-plan`, `fix/window-note` | after each branch lands (proposal section 7) |

## Waiting on the user

- Approval of each batch's file list before it is committed.

## Next step

1. `git fetch origin` and merge `origin/dev` into `docs/cleanup` (no rebase) if `dev` moved.
2. Batch 1: show the user the 10 runbooks (proposal section 5, batch column `1`) moving to `docs/runbooks/`; on a yes, `git mv` them.
3. Rewrite every link to them: root docs `migration/X` to `runbooks/X`; former siblings in `docs/migration/` `X` to `../runbooks/X`; moved files' links to siblings left behind `Y` to `../migration/Y`; the outside files in proposal section 6, row 1 (scripts take `docs/runbooks/X`).
   Skip any link in SPECS lines 1099-1786.
   Add the `ARCHIVED.md` sentence from proposal section 4.3.
4. Checks: `git grep` for each old path (allowed hits: `git show <tag>:` lines, `ARCHIVED.md`, `docs/captures/`, `archive/`, SPECS 1099-1786); a scratchpad script that resolves every relative Markdown link in changed files; `git diff --check`; `node --check` on edited `.mjs`.
5. Commit, push, report the commit ID and every STATUS/timeline/SPECS rewrite; then batch 2.

Resume with: `Read docs/migration/DOCS_OVERHAUL_HANDOFF.md on branch docs/cleanup (worktree .claude/worktrees/docs-cleanup), then continue the docs overhaul.`

## Facts, with their sources

- Batch contents and per-batch link costs: proposal sections 5 and 6, counted at `eb9fe5c`; recount with `git grep -lE '<names>' -- docs` before each batch.
- Flagging's SPECS deletion range: `git diff -U0 origin/dev...origin/task/flagging-share-window -- docs/SPECS.md | grep '^@@'`.
- Captured folders keep link depth when moved to `docs/captures/` (`grep -r '\.\./\.\./\.\./SPECS' docs/migration`).
- This handoff and the proposal move to `docs/plans/` in batch 6; update the resume prompt then.

## Do not touch

- STATUS beyond mechanical link rewrites; the coordinator owns it and its "Where things live" rewrite.
- `eval/transcripts/`, `eval/grading/`, captured folders' contents, `archive/`, `data/`, `dist/`, untracked files (including the user's `*_EXPLAINED.html` in the main checkout).
- `~/code/work/clean-earth-rovers/handoff/` and the agent memory; the coordinator updates memory after batch 6.
- `../clean-earth-rovers-server`, `../user-dashboard`, and other branches' worktrees.

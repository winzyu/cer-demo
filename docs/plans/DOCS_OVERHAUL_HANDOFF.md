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
- D7 added by the user on 2026-10-17 (prompt `~/code/work/clean-earth-rovers/handoff/2026-10-17/3c-docs-content-pass.md`, recorded in proposal section 9): every file in a batch gets keep, update, merge or archive, shown with one line of reason beside the move list; living docs are updated, records keep their content and are archived where nothing living depends on them; content fixes in STATUS, timeline, SPECS, SQ, `CLAUDE.md` and `AGENTS.md` go to the coordinator as a list.
- `docs/README.md` was declined (2026-10-16): STATUS "Where things live" is the only map.
- Each batch: one commit, push `docs/cleanup`, report the commit ID for the coordinator; on 2026-10-17 the user said to run all remaining batches without per-batch approval and reconcile the changes at the end.
- Batch 2 archived `gilligan_v0.png` (tag `docs-archive-2026-10-16c`); under D7 any batch may archive, each with its own tag, `ARCHIVED.md` row and section in the existing style.
- In STATUS, `timeline.md`, SPECS, `CLAUDE.md` and `AGENTS.md` only mechanical link-path rewrites are allowed (plus D2's wording); list each in the batch report.
- One sentence per line in Markdown, plain hyphens, no attribution lines, stage explicit paths only.

## State

| Item | State |
|---|---|
| Codex's five retired docs, tag `docs-archive-2026-10-16` | done `21a60e8`, landed |
| Batch b, tag `docs-archive-2026-10-16b` | done `6e019cf`, landed |
| Proposal | `3044fa7`, decisions recorded with this handoff |
| Batch 1, 10 runbooks to `docs/runbooks/` | done `24acdfd`, landed |
| Batch 2, 4 capture folders to `docs/captures/`, `gilligan_v0.png` archived (tag `docs-archive-2026-10-16c` at `cfda55a`) | done `4ba64fb`, landed; also fixes a link batch 1 missed in `GILLIGAN_E2E_RESULTS_2026-09-25.md` |
| Batch 3, 7 docs to `docs/reference/`, 3 to `docs/people/`, root `README.md` docs table (D5) | done `498545e`, landed |
| Batch 4, 10 pre-launch records to `docs/records/`, `catalogue.json` path (D4) | done `736d547`, landed; the regenerated `docs/catalogue/review.html` also picks up the 4 draft entries `16cec6e` added without regenerating |
| D7 recorded | done `f2ef65f` |
| Batch 5 with D7: 6 records moved to `docs/records/`, 3 archived (tag `docs-archive-2026-10-17` at `f2ef65f`) | done `14c89a6`; not yet landed |
| Content pass over batches 1-4 (`runbooks/`, `reference/`, `people/`, `records/`), batches of at most 10 | C1 `runbooks/` done `2296975` (5 updated, 5 kept; `E2E_CHECKLIST.md` and the two launch-issue pages wait for the merge proposal); C2 `reference/` and C3 `people/` done `2659b9d` (3 openings updated, 7 kept); C4 `records/` done `45b71db` (2 archived at tag `docs-archive-2026-10-17b`, 8 kept) |
| Batch 6 with D7: 4 records to `docs/records/`, backlog, `Q10_TASKS.md` (status note added), this handoff and the proposal to `docs/plans/` | done `d9aba50`; not yet landed |
| Test-doc merge proposal (section 3.2 docs) | written, proposal section 10, in the commit that records it here; waiting on the user's M1-M3 |
| Batches 7-8 | wait until `task/flagging-share-window` lands on `dev` |
| Landing sweeps for `reflection`, `task/tide-tool`, `docs/firestore-testing-plan`, `fix/window-note` | after each branch lands (proposal section 7) |

## Waiting on the user

- The final reconciliation of all batches (user, 2026-10-17).
- The test-doc merge decisions M1-M3 (proposal section 10).

## Next step

1. `git fetch origin` and merge `origin/dev` into `docs/cleanup` (no rebase) if `dev` moved.
2. Batches 7-8, each with D7, once `task/flagging-share-window` lands on `dev` (check with `git merge-base --is-ancestor origin/task/flagging-share-window origin/dev`; not landed at `c5d90df` on 2026-10-17).
   The test-doc merge (proposal section 10) runs only after the user decides M1-M3.
   `REPORT_OMIT_MIRROR_TEST.md` moved to `records/` in batch 6 because `timeline.md` line 922 links it and STATUS line 78 cites it; archive it once the coordinator repoints both (its Mirror caveats now live in `MIRROR_RUNBOOK.md`).
   `Q10_TASKS.md` can be archived once T4, T5, T6, T9 and T11 are reconciled.
3. Link rewrites (every batch): resolve each relative link against the old tree before `git mv`, and recompute it from the file's new folder to the target's new folder; also rewrite path-form text (`docs/migration/X`, `migration/X`, `../docs/migration/X`), including a name followed by a sentence-ending period (batch 3 missed one in `scripts/exploreFirestoreParity.sh` that way).
   Process every moved file even if it names no moved file: its links to siblings left behind change too (batch 1 missed three in `LOCAL_STACK.md` this way).
   Root docs moving to a folder are cited as `docs/NAME` from code; rewrite those too, and rewrap any comment that then passes the 100-column lint limit.
   Skip SPECS lines 1099-1786, `docs/catalogue/` (regenerate it with `npm run catalogue:review` instead), the `git show <tag>:path` text itself (not the rest of its line; batch 1 missed a link that way), `ARCHIVED.md`, captured folders, `archive/` and the two `DOCS_OVERHAUL_*` files.
4. Checks: `git grep` for each old path (allowed hits as above); a script that resolves every relative Markdown and HTML link in every tracked `docs/` file outside `captures/`; `git diff --check` (the generator leaves one whitespace-only line per entry in `docs/catalogue/review.html`; expected); `node --check` on edited `.mjs`, `bash -n` on edited `.sh`.
5. Commit, push, report the commit ID and every STATUS/timeline/SPECS rewrite; then the next batch.

For the coordinator (content fixes outside this chat's remit): `STAKEHOLDER_QUESTIONS.md` item 23 is unchecked though `timeline.md` (2026-09-25) records the supervisor's approval of the Firestore table; STATUS line 78's `MIRROR_RUNBOOK.md` trap is resolved in the runbook (paths moved, port 3000 and `node_modules` caveats added) and can shrink to a pointer; `timeline.md` line 877 names `records/TASK_C_VERIFICATION.md`, archived in C4 (tag `docs-archive-2026-10-17b`); line 915 still names `migration/GILLIGAN_RESET_2026-09-28.md`, archived in batch 5 (`git show docs-archive-2026-10-17:...` would retrieve it).

Resume with: `Read docs/plans/DOCS_OVERHAUL_HANDOFF.md on branch docs/cleanup (worktree .claude/worktrees/docs-cleanup), then continue the docs overhaul.`

## Facts, with their sources

- Batch contents and per-batch link costs: proposal sections 5 and 6, counted at `eb9fe5c`; recount with `git grep -lE '<names>' -- docs` before each batch.
- Flagging's SPECS deletion range: `git diff -U0 origin/dev...origin/task/flagging-share-window -- docs/SPECS.md | grep '^@@'`.
- Captured folders keep link depth when moved to `docs/captures/` (`grep -r '\.\./\.\./\.\./SPECS' docs/migration`).

## Do not touch

- STATUS beyond mechanical link rewrites; the coordinator owns it and its "Where things live" rewrite.
- `eval/transcripts/`, `eval/grading/`, captured folders' contents, `archive/`, `data/`, `dist/`, untracked files (including the user's `*_EXPLAINED.html` in the main checkout).
- `~/code/work/clean-earth-rovers/handoff/` and the agent memory; the coordinator updates memory after batch 6.
- `../clean-earth-rovers-server`, `../user-dashboard`, and other branches' worktrees.

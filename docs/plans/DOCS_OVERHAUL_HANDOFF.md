# Docs overhaul - handoff

Current as of 2026-10-21 at `docs/cleanup`, the commit that adds this file (`git log -1 docs/cleanup`); `dev` holds everything before it (`74733ff`).
A fresh session reads this file, then [`DOCS_OVERHAUL_PROPOSAL.md`](DOCS_OVERHAUL_PROPOSAL.md) sections 9-10 only if a decision needs its reasoning, then follows "Next step".

## What this is

The docs cleanup chat for cer-demo reorganized `docs/` into folders by role (`reference/`, `runbooks/`, `plans/`, `people/`, `records/`, `captures/`); `docs/migration/` is gone, and every moved file got a content decision (D7).
What remains is cleanup the user approved in principle but must approve step by step: archiving superseded records, re-running the two setup runbooks, and a git tidy.
Work happens only in the worktree `.claude/worktrees/docs-cleanup` on branch `docs/cleanup`; the coordinator chat lands each pushed commit on `dev` after its own checks (the user does not review them, 2026-10-21).

## Standing decisions

- D1-D7 are in the proposal, section 9; the ones that still bind: D3 no renames; D4 any `src/catalogue/catalogue.json` path change regenerates `docs/catalogue/review.html` with `npm run catalogue:review` and runs `test/unit/catalogue.test.ts` and `test/unit/catalogueReviewPage.test.ts` singly with `--runInBand`; D6 eval docs stay at the `docs/` root; D7 every touched file gets keep, update, merge or archive.
- Archiving: an annotated tag `docs-archive-<date>[b,c...]` at the last commit containing the file, `git rm`, then a row and a section in `docs/ARCHIVED.md` in the existing style (tags so far end at `docs-archive-2026-10-21c`: `git tag -l 'docs-archive-*'`); push the tag with the branch.
- Records keep their content and may gain only a pointer line or a link fix; living docs get updated, and every path an update writes must exist.
- This chat may edit STATUS, `timeline.md`, SPECS, `STAKEHOLDER_QUESTIONS.md`, `README.md`, `CLAUDE.md`, `AGENTS.md` and the agent memory (user, 2026-10-21: "you have my explicit permission"); list each such edit for the coordinator.
- Git history is not rewritten (user, 2026-10-20): squash-merge from now on, read `dev` with `--first-parent`, and prune only with per-command approval.
- The coordinator asks that moves of these docs be announced, because the reflection course reads them: EVAL_REBUILD, SPECS, timeline, GRADING_GUIDE, RETRIEVAL_*, ARCHIVED.md, `records/SECURITY_INCIDENT_2026-09-19.md` and the data-skepticism records.
- One sentence per line in Markdown, plain hyphens, no attribution lines, stage explicit paths only, one commit per step, push `docs/cleanup` after each.

## State

| Item | State |
|---|---|
| Batches 1-8 (all moves; `docs/migration/` removed; `CLAUDE.md`/`AGENTS.md` name the folders) | done, last `5b31581` and `ff51594`, landed |
| Content pass C1-C4 and core-doc fixes | done, last `8cc2edc`, landed |
| Q10: decisions as a 2026-09-28 `timeline.md` row, T4+T11 and T9 backlog rows, `Q10_TASKS.md` archived, T11 as `STAKEHOLDER_QUESTIONS.md` item 36 | done `e5596e3`, `ba46ddd`, landed |
| Test-doc merges M3, M2, M1: launch pages to `records/`; `E2E_CHECKLIST.md` is the manual guide's "Short run" plus `records/E2E_CHECKLIST_RESULTS_2026-09-26.md`; `MIRROR_RUNBOOK.md` is the one Mirror setup (dashboard on 3100) | done `fcf2eca`, `2dd024a`, `4b8da98`, landed; `runbooks/` is 7 files (`ls docs/runbooks`) |
| `release/` leftovers in the deployment runbook and backlog item 9 | done `3efe302`, landed |
| Step 5, superseded-records archive list | done 2026-10-21, nothing archived: no file in `records/` is fully covered by a later record or a `timeline.md` row (see "Step 5 outcome") |
| Step 6, re-run the local stack setup | done 2026-10-21: `LOCAL_STACK.md` ran from this worktree on 8011 and was corrected; the manual guide's three emulator scripts read `MIRROR_PROJECT_ID` (syntax-checked, not run); the Mirror and those scripts are verified at the Mirror's next real use (report-omission or flagging) |
| Step 7, git tidy of finished work | approved 2026-10-21; each deletion waits on the user's yes (the auto-mode check refuses `git worktree remove`); proposed list sent to the user and the coordinator |
| Steps 5-6 landing | landed on `dev` as squash `2bf94a3` |
| Landing sweeps for `task/flagging-share-window`, `reflection`, `docs/firestore-testing-plan` | after each lands, its new `docs/migration/` files move to the right folder; none ready on 2026-10-21 (flagging waits on Michael, reflection on the user's OK to merge, firestore-plan on the user's keep-or-archive call); `task/tide-tool` re-homed its own (`36ef4a9`) |

## Step 5 outcome

All 26 records were checked on 2026-10-21; none is superseded, so none was archived (user approved).
- `GILLIGAN_E2E_RESULTS_2026-09-25.md`: the 09-27 record reran only groups A, C, F and G and says the 09-25 results for B, D, E, H and I stand.
- `REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md`: the 2026-10-09 and 2026-10-11 `timeline.md` rows cite it for counts (3 of 8 false edit claims, 5 of 6 with the history marker) that the 10-16 record does not repeat.
- The rest are cited as evidence by SPECS, the manual guide, `EVAL_REBUILD.md` 2c or a `timeline.md` row, hold what no later record restates (`DATA_SKEPTICISM_TESTS_2026-10-11.md`'s harness and baseline, `V2_CORPUS_DECISION.md`'s case against), or are reference rather than superseded results.

## Approved, 2026-10-21

- **Step 6**: re-run the local stack only; leave the Mirror until its next real use, with its "not run end to end" note saying so (done).
- **Step 7**: tidy finished work only; keep `dev`, `docs/cleanup`, `task/flagging-share-window`, `task/tide-tool`, the `omit-mirror` worktree, `reflection` and the report-omission export `~/code/work/clean-earth-rovers/worktrees/mirror-report-omit`; ask before each irreversible command; send the coordinator the final worktree and branch list.

## Next step

1. `git fetch origin` and merge `origin/dev` into `docs/cleanup` (no rebase) if `dev` moved.
2. Step 5 is done (above).
3. Step 6 is done (above).
4. Step 7, finished work only, keeping the list under "Approved".
   Corpus, done 2026-10-21 with the user's approval: `release/artifacts.sha256` holds rc2's hashes (as `ddd6292`), the main checkout's `data/corpus/` and `data/embeddings/` are rc2's files from `release/rc2-artifacts/` (old 446-chunk pair in `data/pre-rc2-446/`), and every linked worktree matches; `timeline.md` has the row.
   `e7-corpus` and `e2e-dev` hold the same 457 chunks and vectors under other build timestamps, so they can join the removals.
   The adapter check is the `POST_LAUNCH_BACKLOG.md` §3 row, not done on this branch.
   Then: list merged remote branches (`git branch -r --merged origin/dev`), finished worktrees (`git worktree list`) and `wip-*` tags (`git tag -l 'wip-*'`), then run each deletion only after the user's yes to that exact command, and send the coordinator the final `git worktree list` and branch list.
5. Checks before every commit: the link resolver over every tracked `docs/` `.md` and `.html` outside `captures/` (0 unresolved), `git grep` for each old path, `git diff --check`, `node --check` and `bash -n` on edited scripts, and `npm run typecheck` and `npm run lint` when `src/`, `scripts/` or `test/` change.

Resume with: `Read docs/plans/DOCS_OVERHAUL_HANDOFF.md on branch docs/cleanup (worktree .claude/worktrees/docs-cleanup), then continue the docs overhaul.`

## Facts, with their sources

- The flagging branch deletes SPECS §10.7-§19 and this branch rewrote links inside that range, so its landing conflicts there; the deletion looks unintended (`git diff -U0 origin/dev...origin/task/flagging-share-window -- docs/SPECS.md | grep '^@@'`).
- `MIRROR_RUNBOOK.md` was rebuilt from `REPORT_OMIT_MIRROR_RUNBOOK.md`'s setup, which ran as written on 2026-10-15; the rebuilt version has not run (its opening lines).
- `release/cer-gilligan.env.yaml` is on `dev` since `0921140`; whether it matches the live revision `00004-r5q` is unchecked (`docs/plans/POST_LAUNCH_BACKLOG.md` §4 item 9).
- Link tools from this session were scratchpad scripts and are gone; a resolver is a short script that checks that every relative Markdown link target and every `href=` and `src=` target exists.

## Do not touch

- `eval/transcripts/`, `eval/grading/`, captured folders' contents, `archive/`, `data/`, `dist/`, and untracked files (including the user's `*_EXPLAINED.html` in the main checkout).
- `~/code/work/clean-earth-rovers/handoff/`, `../clean-earth-rovers-server`, `../user-dashboard`, and other branches' worktrees.
- Live device-API writes and paid model runs without the user's approval; live reads only after announcing them.

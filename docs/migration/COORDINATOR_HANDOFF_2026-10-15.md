# Coordinator - handoff

Current as of 2026-10-16 after the docs-cleanup landing; first written 2026-10-15 at `650451c`.
A fresh coordinator session reads `docs/STATUS.md`, then this file, then follows "Next step"; for the report-omission test it also reads `docs/runbooks/REPORT_OMIT_MIRROR_RUNBOOK.md`.

## What this is

The coordinator chat lands branches on `dev` and alone writes `dev`, STATUS, the timeline and the plan; it works from the `dev` worktree (`.claude/worktrees/dev`).
The goal now is the next release: the data-skepticism fix, report omission and the flagging rework, deployed together once Michael answers the rework's questions.

## Standing decisions

- The next release ships the data-skepticism fix, report omission and the flagging rework together, after Michael answers the rework's questions; `dev` is not deployed alone before then (user, 2026-10-15; timeline).
- Send Michael nothing more until he answers the questions already sent (user, 2026-10-15).
- Outside-data tools are post-release work, joining the release only if finished and tested in time (user, 2026-10-15).
- `WATER_TYPE` stays `freshwater`; all five live pods have a registered type, so it changes no live report (user, 2026-10-15; timeline).
- The swell claim is accepted and `task/swell-rule` dropped "for now"; its branch and worktree stay until the user says to delete them (user, 2026-10-15; timeline).
- The server report-omit PR goes ahead after the Mirror test (user, 2026-10-15): "for 7, we can move forward with it, but first, provide me a run book to be able to test the report omissions in a mirror or a demo branch".

## State

| Item | State |
|---|---|
| Docs branches `task/report-html-option`, `task/skeptic-triage` | landed `a8e07b3`, `76a0892`; worktrees and local branches removed; remote branches remain |
| Report-omit Mirror runbook and helpers | done `650451c`: `REPORT_OMIT_MIRROR_RUNBOOK.md`, `scripts/mirror/reportOmit{Tree.sh,Env.mjs,Checks.mjs,LastChat.mjs}`, `scripts/mirror/mirror-seed-turbidity.patch` |
| Mirror free checks (runbook §6.1-§6.2) | pass, 53/53, dry run 2026-10-15 |
| Mirror paid chat steps (§7) | run 2026-10-16 by the coordinator with `scripts/mirror/reportOmitDrive.mjs` (no browser, so §6.3 not run): server side passes; findings C1 and A4; `docs/migration/REPORT_OMIT_MIRROR_RESULTS_2026-10-16.md`; outputs in `/tmp/claude-1000/-home-winsy-code-work-clean-earth-rovers-repo-cer-demo/bd2ce85b-a0d5-45c2-a3d0-0b0d9fb45a04/scratchpad/omit7/out` |
| Mirror stack | still running 2026-10-16, reseeded 06:30:52 UTC; super-1, super-2 and super-3 have used reports from the reruns (reseed before a full run), seeded 2026-10-16 03:56 UTC: emulator :8080, cer-api :5101, Gilligan :8010, dashboard :3100; stop with `kill -- -2396408 -2382161 -2382158 -2378693 -2379082` (process groups; recheck with `ps -o pid,pgid,comm -p <pid>` first) |
| Mirror settings file (secrets) | `/tmp/claude-1000/-home-winsy-code-work-clean-earth-rovers-repo-cer-demo/01b61cb2-b806-4480-812e-0a64be32db55/scratchpad/omit/env.sh`; delete after stopping the stack |
| Server PR body | updated in place with the `report_retried` relay: `~/code/work/clean-earth-rovers/handoff/2026-10-15/report-omit-pr-body.md` |
| Server retry patch, push, PR | ready: runbook §10, one command at a time with the user |
| `swell-rule` worktree | removed 2026-10-16 (user); local branch `task/swell-rule` kept |
| Docs cleanup `docs/cleanup` | landed 2026-10-16 by fast-forward to `6e019cf` (tags `docs-archive-2026-10-16`, `docs-archive-2026-10-16b`); worktree `docs-cleanup` and the branch remain until the docs chat is done: see "Docs cleanup review" |
| Flagging rework `task/flagging-share-window` `c5d90df` | waiting on Michael's answers to questions 28-32 |

## Waiting on the user

1. **Server PR** (paid Mirror steps done 2026-10-16): follow runbook §10, one command at a time:
   - `! git -C /home/winsy/code/work/clean-earth-rovers/worktrees/server-report-omit am /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-retried.patch`
   - the push of `task/gilligan-report-omit` (the coordinator supplies the exact command; separate consent);
   - `! gh pr create --repo Clean-Earth-Rovers-Technology/clean-earth-rovers-server --base develop --head task/gilligan-report-omit --title "Relay a report request's omit list to cer-gilligan" --body-file /home/winsy/code/work/clean-earth-rovers/handoff/2026-10-15/report-omit-pr-body.md`
   - cer-gilligan must deploy first or alongside: the live one ignores `omit`.
2. **Other data-skepticism items**: "The inverted time of day (item 3): I'd fix it while landing the flagging rework. The rework adds new UTC-only times to the tool output, which makes that mistake more likely." Also: "The misread daily-cycle timing (2) and the skipped conductivity zeros (5a): these can wait until after the release." The before-fix comparison at `c514e0b` is dropped (user, 2026-10-16).
3. **"Free prompt-rule inventory"**: "Tell me what the 'free prompt-rule inventory' meant." The phrase appears only in the 2026-10-14 coordinator commit `9c635f9`. If it means listing every rule bearing on data skepticism, the triage doc's "Contradictions" section starts it.
4. **Post-launch order**: "the unguarded user-update routes are a live production security hole in the server, and I'd put them first."
5. **Worktree cleanup**: remove `post-launch-land` (merged) and the detached `e2e-dev`, `skeptic-before`, `skeptic-evals-run` and `skeptic-repro`, after checking each is clean and reachable from a branch or tag. `swell-rule`'s worktree is gone; `git branch -D task/swell-rule` still needs explicit permission (commits `fd7f008`, `bc37b4a` stay on `origin`).
6. **Report-omission findings**: done; reproduced, fixed on `dev` `acb9d7d`, Mirror rerun passes (results doc, "Reruns of A4 and C1").
7. **Docs cleanup**: landed; the four docs it left are in "Docs cleanup review".
8. **Still open from before**: delete the old scratchpad secrets (STATUS "Working tree"); delete the test user `winsyu475+certest@gmail.com`; decide the main checkout's uncommitted `.claude/settings.json` and `release/start-rc2-emulator.sh` edits.

## Waiting on Michael

- Stakeholder questions 27-35, sent by 2026-10-15; 28-32 gate the flagging rework and therefore the release.
- Item 35, whether report omission should go live early, would change the release plan if he says yes.
- When he answers, add `verify-do-sensor` to question 26 in the next message, together with the supervisor review of the natural-variation drafts.

## Next step

1. Walk the user through runbook §10 one command at a time; if the Mirror stack is no longer wanted, stop it with the `kill` line in "State" and delete the settings file.
2. Docs cleanup landed; land any further batch the docs chat reports the same way (tag, table row and section per batch).
3. When Michael answers, record his answers in `STAKEHOLDER_QUESTIONS.md` and the timeline, and tell the flagging chat.
4. Land `task/flagging-share-window` when its chat asks, after review. While landing:
   - restore the about 680 `SPECS.md` lines its commit `9c57aa9` deleted, keeping dev's §10.7-§19 and applying only the branch's flag-rule edits;
   - rewrite the G1 check in `scripts/skepticism/replay.ts:240-243`;
   - fix the "persistent" verdict's "sensor fouling or calibration" wording;
   - fix the inverted time of day (item 2 above);
   - merge STATUS, the timeline and `STAKEHOLDER_QUESTIONS.md` by hand (the branch adds items 28-29).
5. Verify the combined `dev`: the affected Jest suites, a paid data-skepticism retest (quote the cost first), and the manual test guide cases the rework changes.
6. Prepare the release: stage with `release/deploy-cer-gilligan.sh` (deployment runbook §6.1; `IMAGE` and `TAG` required), the user deploys and routes, then `main` moves to the deployed commit.

Resume with: `Read docs/STATUS.md on branch dev, then docs/migration/COORDINATOR_HANDOFF_2026-10-15.md, then continue as cer-demo coordinator from the dev worktree.`

## Docs cleanup review

Landed 2026-10-16: `dev` fast-forwarded to `docs/cleanup` `6e019cf` after review.
Codex's five docs went under tag `docs-archive-2026-10-16` (`650451c`) and four more (`CORPUS_SEEDING.md`, `Q9_CLOUD_RESULT.md`, `Q9_C1_D1_RESULT.md`, `TURBIDITY_EXPLORATION.md`) under `docs-archive-2026-10-16b` (`21a60e8`); each batch has a row and a section in `ARCHIVED.md`, and both tags are on `origin`.
`docs/README.md` and `DOCS_CLEANUP_REVIEW_2026-10-15.md` were deleted (user's choice).
Checked: no reference to a removed path outside `git show` lines and `ARCHIVED.md`; `git diff --check` passes.

The docs chat left four docs for the coordinator:

- `GILLIGAN_RESET_2026-09-28.md`: a finished freeze-day roundup, linked from `timeline.md`; a later batch can retire it with that link repointed.
- `REPORT_OMIT_MIRROR_TEST.md`: superseded as a plan by `REPORT_OMIT_MIRROR_RUNBOOK.md`, but STATUS "Active traps" cites its path substitutions; keep until those move.
- `P3_CALIBRATION_REVIEW_2026-09-24.md`: unlinked, but holds the AI review's per-answer conclusions that `EVAL_REBUILD.md` 2c cites by SHA; keep.
- `Q10_TASKS.md`: unlinked, still has open or blocked tasks (T3-T9, T11); retire once closed.

## Facts, with their sources

- Live pods' water types, five pods, all recognised (one read-only `GET /devices` on 2026-10-15; timeline row "`WATER_TYPE` stays `freshwater`").
- Live cer-gilligan reads `WATER_TYPE` only as the report fallback and the unused `water_type` field (`git grep -n "config.waterType" ddd6292 -- src`).
- Mirror free checks 53/53 (`node scripts/mirror/reportOmitChecks.mjs <dir>` right after a seed).
- Gilligan omit suites on `dev`: 5, 37, 20 and 22 tests pass (`npx jest --runInBand test/unit/{reportOmit,reportRenderPdf,reportDelivery,generateReport}.test.ts`).
- `npm run typecheck` and `npm run lint` pass on `dev` `f0cb4d2`.
- Report-omit branch merges cleanly into `develop` `5f04064` and into `mirror/release-rc1` (`git -C ../clean-earth-rovers-server merge-tree --write-tree <base> task/gilligan-report-omit`, exit 0).
- Session spend 2026-10-15 evening: $0; one production read (above).
- Session spend 2026-10-16: 981,015 tokens on the Mirror (first run 429,072, reruns 274,359 and 277,584; about $0.15, at most about $0.50), no production reads.
- Mirror Gilligan (`omit-mirror`) now runs `acb9d7d`; the Mirror was reseeded 2026-10-16 06:30:52 UTC.

## Do not touch

- `task/flagging-share-window` (its own chat) and `task/tide-tool` (the outside-data chat), except to land them on request.
- The upstream repositories beyond branch `local`: no merges, every push needs the user's approval of the exact command; the Mirror server tree is an export, not a checkout.
- Paid runs and deploys without approval; the device API is production.

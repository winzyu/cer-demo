# Wave 1 correction handoff

The correction implementation is complete for the reviewed findings, but it has not been integrated with the later Gilligan and catalogue prompt changes.
This handoff prepares two commits and an atomic push of `dev` and `eval/wave1-corrections`; execution requires approval of [GIT_PLAN.md](GIT_PLAN.md).
No merge, rebase, worktree cleanup or deletion is proposed in this handoff.

## Read next

Read `docs/STATUS.md` in the main checkout `/home/winsy/code/clean-earth-rovers/repo/cer-demo`, then this file and [README.md](README.md) in `.claude/worktrees/wave1-corrections`.
The correction worktree's own STATUS predates the other workstreams and is not the current entry point.
Inspect fresh status/worktrees before continuing because other sessions have advanced `dev` twice during this task.

## Exact state at preparation

- Main checkout: `dev` at `eaba51cfc88bb65ddda03aa2385ee4e6d19db47b`, 11 commits ahead of locally recorded `origin/dev` at `c41ffb5fae172d44e6fdaae7c36ab57e55c3b886`.
- Correction worktree: `.claude/worktrees/wave1-corrections`, branch `eval/wave1-corrections`, based on `c41ffb5`, with the implementation and this handoff still uncommitted.
- EPA worktree: `.claude/worktrees/eval-claims-reresolve`, branch `worktree-eval-claims-reresolve`, clean at `5d269a3`.
- Remote for both planned pushes: `git@github.com:winzyu/cer-demo.git`.
- No upstream dashboard or server repository is part of this plan.

The correction branch contains 35 changed fixtures, 45 generated label files with only the changed outputs appearing in the diff, the policy/harness changes, tests and the separate verification record.
All 34 EDIT fixtures were corrected; the additional KEEP fixture needed explanatory context.
The two EPA dependency files were copied verbatim from `5d269a3`, not reauthored.
No original review hashes or captured transcripts were changed.

The main checkout's `docs/STATUS.md` was updated only for this eval workstream, and a new correction-handoff section was appended to `docs/EVAL_REBUILD.md`.
The pre-existing 23-line EPA note in EVAL_REBUILD remains owned by the earlier workstream and is excluded from staging through [handoff-eval.patch](handoff-eval.patch).
That patch was generated from the before/after main-checkout file and dry-run checked against the index, so it stages only the new appended section.
The existing untracked exit sheet, grading directory and root v2 PDF remain excluded.

## Validation and remaining work

The correction branch passed 181 tests across six individual Jest suites, typecheck, lint, the generator success/failure checks and the offline audit.
The correction set is 45 fixtures, 90 turns and 738 conditions, with 13 changed question turns.
Contamination is 10.98% for notes-derived source chunks and 28.89% for documents; the separate labelled-chunk result is 10.00%.
No paid captures, production reads or writes ran.
Phase 1d human verification is incomplete.
The existing EPA chart-header quote exception, broader per-turn labels/hard negatives and judge calibration remain open.
The original checker must fail on the intentionally changed prompt; use `scripts/verifyWave1Corrections.ts` for this revision instead of rewriting the historical hashes.

Before landing the corrections, reconcile these overlapping files with current `dev`:

- `src/prompt/systemPrompt.ts`: preserve Gilligan's greeting/capability carve-out, `list_pods` routing and honest fleet-status rules, the closest-supported-alternative refusal sentence, and the recovered catalogue argument/block; retain the corrected partial-answer, citation and unavailable-threshold contract.
- `test/unit/prompt.test.ts`: preserve tests for those later behaviors and catalogue isolation, while updating the now-obsolete assertions about absent thresholds and refusal citations.

The combined behavior has not been tested.
After integration, rerun the six named correction suites plus the affected `listPods` and catalogue prompt checks individually, typecheck/lint, the label generator and both new verification scripts.
Generate a new verification record from the integrated prompt before measuring generation; do not treat old captures as scores for it.
Obtain a fresh Git plan for integration and eventual worktree cleanup.

## Resume prompt

> Read docs/STATUS.md in the main cer-demo checkout, then eval/reviews/wave1-corrections-2026-09-22/HANDOFF.md on eval/wave1-corrections.
> Inspect the actual branch/push state before acting.
> Reconcile the Wave 1 correction prompt and tests with the current Gilligan/catalogue changes, preserving both workstreams, then run focused offline checks and propose the Git landing plan.
> Preserve historical review hashes and transcripts, and do not mark Phase 1d human verification complete or run paid captures.

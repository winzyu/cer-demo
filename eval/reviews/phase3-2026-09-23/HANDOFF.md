# Phase 3 / R4 handoff - 2026-09-25 (updated after calibration and the final capture)

R4 (evaluation-driven improvement) has calibrated the judge (E2) and captured and double-judged the final two-arm run (E3).
What remains is the held-out calibration check, an optional improvement round, E4 (caveats and refusals for weak classes) and E6 (report and landing).
Work on branch `eval/wave1-corrections` in its worktree `.claude/worktrees/wave1-corrections`; landing into `dev` is a separate step with its own git plan.

## Exact state

- Branch `eval/wave1-corrections` at `4e74603` or later, pushed to `origin`; `dev` last merged at `e7d3e44`.
- `dev` has since gained Q1's tools-on prompt and tool changes only; its tools-off message list is byte-identical to the merge base's, so R4's tools-off captures are unaffected, but merge `dev` before landing.
- The judge is calibrated: correctness Cohen's kappa 0.849 against the user's grades with four rows adjudicated by Claude at the user's request, after a prompt fix (`49e28ae`) tuned on the same 32 rows (`EVAL_REBUILD.md` "Calibration packet (2c)").
- Ungrounded agreement stays weak (any/none 78%, count kappa 0.23), so ungrounded rates are an indicator, not a gate the judge can verify.
- `scripts/judge.ts` now exits 1 when any call fails (`e662fa0`); a pass is complete only when a re-run reports 0 failed.
- A 12-row held-out round is built at `eval/grading/p3-calib-2026-09-24/rounds/heldout-2026-09-25/warm/` (`309da6c`), three fixtures untouched by the tuning: `definitional-required-versus-recommended`, `precedence-do-hypoxia-qa-trigger-not-pod-limit`, `probecal-buffer-handling`.
- The user is grading that round; their `scores.csv` there is uncommitted work in progress and must not be overwritten, reset or staged by anyone else.
- Spend about $11.30 of the $20 ceiling the user set on 2026-09-24, approved for R4 through September 28.

## Results

E3, runs `p3-final-2026-09-25` and `p3-final-rejudge-2026-09-25`, judged twice at `--final` with the calibrated prompt:

| | gold-context | hybrid-slice-vector, k=20 |
|---|---|---|
| correctness, pass 1 / 2 (floor 1.30) | 1.01 / 1.01 | 0.58 / 0.59 |
| classes under 1.00 | cross-document 0.83, refusal 0.88 | all seven in at least one pass |
| ungrounded turns, pass 1 / 2 (ceiling 2%) | 51.1% / 48.9% | 58.9% / 55.6% |
| refusal gate | FAIL, 1 of 8 answered | FAIL, 2 answered, 1 off-contract |
| citation validity (current checker) | 60.4% | 77.9% |
| fabricated figures | FAIL, 1 | PASS, 0 |

- Pass-to-pass correctness agreement is 84/90 and 81/90 turns; the judge's empty replies (34 attempts) were re-run until both passes held 360/360.
- Task C's citation audit (`fb75add`) changed the citation checker: earlier runs re-score lower (iteration 1 gold context 57.5%, recorded as 90.5%), so compare Tier 1 only on the current checker.
- Retrieval over-refusal: 19 non-refusal turns carry refusal wording and 13 of them score 0; 13 of the 19 had no labelled chunk in context, so this is mostly retrieval, not generation.
- Full record: `docs/EVAL_REBUILD.md` "R4 final capture (E3)".

## Next steps

1. Held-out check: when the user says the round is graded, validate its 12 rows (correctness 0-2, integer ungrounded, `invalid_citations` blank), then judge only those fixtures at `--final` with `--only` and without `--calibration` (which reads fixtures from the base sheet only), about $0.05, and report agreement for the round separately from the 32 tuned rows.
2. Optional improvements, both awaiting the user's go-ahead: (a) a reranking step after `hybrid-slice-vector`, measured offline with `retrieval:eval` on nDCG and MRR before any capture, keeping the always-on operator slice that precedence depends on; (b) one gold-context capture with the answer model's reasoning effort at `high`, correctness-judged only, recording completion tokens and latency so the launch cost is measured rather than estimated.
3. E4: the user chooses, per class, between a caveat and a refusal under D3 (`docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`); implement each as a tools-off prompt rule with a prompt test, and re-measure with a capture only if spend allows.
4. E6: the R4 report in `eval/reviews/`, `DEFAULT_TOP_K=20` into `docs/SPECS.md`, decisions into `docs/timeline.md`, then merge `dev` and land `eval/wave1-corrections` with a git plan.

## Traps found

- `pkill -f "<pattern>"` matches its own shell when the pattern is in the command line; stop the server by the PID listening on the port.
- A re-judge needs its own `--run`; a symlink run directory to the original transcripts works and keeps them verbatim.
- The judge rebuilds the system prompt from source at start: finish any judge pass before editing `systemPrompt.ts`, and never start a merge while a judge pass is running.
- `scores.csv` notes contain unquoted commas; the reader takes everything after the seventh comma as the note, so edit rows line by line, never through a CSV library.
- The judge ledger numbers turns from 1 and transcripts from 0.
- `gate:check` writes a file only with `--out`; a plain re-run is safe on any earlier run.
- `.env` sets `SENSOR_TOOL` and `REPORT_TOOL` to true: pass both `false`, plus `CATALOGUE_PROMPT=false` and `DEBUG_RETRIEVAL=true`, to server and runner for every capture.

## Decisions

- User, 2026-09-24: raise `DEFAULT_TOP_K` until marginal utility flattens; measured, it peaks at 20.
- User, 2026-09-24: R4 spend ceiling $20; calibration graded by the user on correctness and ungrounded.
- User, 2026-09-25: the AI review of the calibration packet was amended (strict numeric rule withdrawn) and the user's ungrounded counts reconciled to it; correctness stayed the user's.
- User, 2026-09-25: targeted correctness-prompt fixes and a correctness-only re-judge approved; Claude to be the final judge on the disputed rows; the result (kappa 0.849) accepted.
- User, 2026-09-25: E3 approved and run.
- Judge strictness audit (`EVAL_REBUILD.md`): about 6 of 117 flagged claims are over-strict and about 90% are real model elaboration.

## Edits wanted in other files at landing

- `docs/SPECS.md`: retrieval depth is `DEFAULT_TOP_K=20`.
- `docs/timeline.md`: decisions for the Phase 1d closure without human verification (2026-09-23), the top-k choice, the iteration 2 revert, the $20 ceiling, the calibration adjudication and E3.
- `docs/migration/GILLIGAN_RELEASE_PLAN.md` (on `dev`): mark E2 and E3 done with their commits.

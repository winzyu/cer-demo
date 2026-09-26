# Phase 3 / R4 handoff - 2026-09-25 (updated after the held-out check, the improvement round and the rubric review)

R4 (evaluation-driven improvement) has calibrated the judge (E2), captured the final two-arm run (E3), checked the judge on held-out rows, and tried the two improvement levers: a reranker and answer-model reasoning `high`.
Neither lever raised correctness, and three outside reviews of the rubric's strictness are in for the user to synthesize.
What remains is the user's rubric decision, E4 (caveats and refusals for weak classes) and E6 (report and landing).
Work on branch `eval/wave1-corrections` in its worktree `.claude/worktrees/wave1-corrections`; landing into `dev` is a separate step with its own git plan.

## Exact state

- Branch `eval/wave1-corrections` at `01a7609` or later, pushed to `origin`; the only untracked path is the v2 re-judge link `eval/transcripts/p3-final-rubric-v2-2026-09-25`; `dev` last merged at `e7d3e44`.
- `dev` has since gained Q1's tools-on prompt and tool changes only; its tools-off message list is byte-identical to the merge base's, so R4's tools-off captures are unaffected, but merge `dev` before landing.
- The correctness judge is calibrated (kappa 0.849 on the 32 tuned rows) and held up on 12 held-out rows at 9/12 exact, all within one point, errors in both directions.
- Two retrieval modes and one setting were added and are off by default: `local-rerank` and `hybrid-slice-rerank` (`32275aa`, `RERANK_MODEL`), and `LLM_REASONING_EFFORT` (`d11d577`, default sends nothing); `DEFAULT_RETRIEVAL` and the answer model are unchanged.
- Spend about $13.90 of the $20 ceiling the user set on 2026-09-24, approved for R4 through September 28.

## What to review

Everything below is committed on `eval/wave1-corrections`; the full records with method and caveats are in `docs/EVAL_REBUILD.md`, one section each.

| item | where | commit |
|---|---|---|
| Held-out calibration check | `EVAL_REBUILD.md` "Held-out calibration check"; grades in `eval/grading/p3-calib-2026-09-24/rounds/heldout-2026-09-25/warm/scores.csv` | `33021b9`, `276a2ee`, `c78aeef` |
| Reranker, offline | `EVAL_REBUILD.md` "Reranker, offline" | `3995d8d` |
| Reranker mode and capture | `src/retrieval/adapters/RerankAdapter.ts`, `src/services/RerankService.ts`; `EVAL_REBUILD.md` "Reranker capture"; run `p3-rerank-2026-09-25` | `32275aa`, `7643e15` |
| Reasoning `high` setting and capture | `src/services/LlmService.ts`; `EVAL_REBUILD.md` "Answer-model reasoning `high`"; run `p3-reason-high-2026-09-25` | `d11d577`, `abfe241` |
| Rubric-strictness review packet | `eval/reviews/rubric-strictness-2026-09-25/PROMPT.md`, `SAMPLE.md`, `ALL_TURNS.md`; generator `scripts/buildRubricReviewPacket.ts` | `eb7e69a` |
| Outside reviews | same folder: `claude-review-packet.md`, `codex-review-packet.md`, `rubric_review_report.md` (Gemini) | `1c5f1fd`, `bc3f124`, `abfe241` |

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

Held-out check (about $0.09): correctness 75% exact on 12 unseen rows against 91% on the 32 tuned rows; kappa 0.25 is unstable because 9 of the user's 12 grades are 1.
Single-turn scores carry about one point of noise in a quarter of rows, but with no direction to the errors the arm means stand.

Improvement round:

| | correctness | other |
|---|---|---|
| E3 `hybrid-slice-vector` | 0.58 / 0.59 | recall 39.5%, 19 over-refusals |
| `hybrid-slice-rerank` (top 50 reranked to 20) | 0.62, 16 turns up and 12 down | recall 51.9%, 13 over-refusals; about $0.0066 and 1 s more per question |
| E3 gold context, same 67 turns | 1.00 | median 525 completion tokens, 2.5 s |
| gold context, reasoning `high` | 0.88, 7 turns up and 15 down | 12 of 79 turns empty (reasoning used all 16,384 tokens), median 10.3 s |

Reading: better evidence and more reasoning both fail to lift correctness, so neither is recommended for launch.
On gold context 69 of 90 turns score 1, and the judge's notes on them are mostly omitted rubric points rather than wrong statements; 9 of the 10 zeros are must-not violations.
Three answer-prompt versions had already plateaued at 0.92-1.01 (iteration 2 entry).

Rubric review, three reviewers given the same packet (verdicts only; read the files):

| | Gemini | Claude | Codex |
|---|---|---|---|
| verdict | mixed, leaning rubric; high confidence | mixed; medium | mixed; medium |
| sample's 74 must-contain points: core / supplementary / flawed | 37 / 31 / 1 (counted 69) | 40 / 25 / 9 | 43 / 27 / 4 |
| sample rescore | - | core-only about 1.4 (1.1-1.7) | 0.94 under the rubric as written, 1.19 as an operator would judge |
| largest cause | rubric granularity | rubric granularity, then answer habits | model capability and rubric scope, jointly |

- All three agree: report 1.01 as a failed pre-registered test and keep 1.30; a core/supplementary split is legitimate only as a secondary, versioned metric with labels applied blind to answers (ideally an outside practitioner) and confirmed on fresh fixtures; real errors exist (warm-week oxygen table column, ORP treated as Eh); must-not items of the form "omits X" turn omissions into zeros; refusal rubrics expecting a corpus inventory cap correct refusals.
- Weight: Gemini miscounted the sample (69 points, "8 turns" against 16) and recommended reasoning `high`, since tested and worse; Claude shares the rubric author's family and labelled after reading answers; Codex shares the answer model's family and rescored the sample below the judge, so the judge is not the problem.
- The reasoning `high` result arrived after the reviews: Claude's review proposed it as the test of answer habit against capability, and scores did not rise.
- The blind labelling and fresh fixtures all three ask for cannot be done before the September 30 launch.

## Next steps

1. Done 2026-09-25: the user chose to fix only flawed points; rubric v2 is applied and logged (`eval/reviews/rubric-strictness-2026-09-25/RUBRIC_FIXES.md`, `EVAL_REBUILD.md` "Rubric v2"). Next: with approval, re-judge E3 on v2 as run `p3-final-rubric-v2-2026-09-25` (a symlink to `p3-final-2026-09-25`), correctness only at `--final`, 180 calls, and report it as secondary to 1.01.
1a. Measure the datasheet slice, offline first: `hybrid-slice-vector` pins the four probe datasheets on every request (about 6.5K tokens, 4 of 24 excerpts; the answer-model prompt is a median 19.5K tokens, max 26.6K, against a window of about 131K), yet they hold 6 of 485 labelled chunks and draw 12 of 165 citations in E3.
   Their original reason, keeping the source-of-truth document in the prompt, lapsed when it left the corpus on 2026-09-13; that document (the root v2 PDF included) is in no prompt in any form.
   Propose `local-vector` at an equal budget against `hybrid-slice-vector` with its cost before any capture; production questions about the operator's own probes may still need the datasheets.
2. User: accept or reject the recommendation not to enable `hybrid-slice-rerank` or `LLM_REASONING_EFFORT=high` for launch.
3. E4: the user chooses, per class, between a caveat and a refusal under D3 (`docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`); implement each as a tools-off prompt rule with a prompt test, and re-measure with a capture only if spend allows (about $6.10 left).
4. E6: the R4 report in `eval/reviews/` (1.01 as the failed pre-registered result with the rubric caveat, then the improvement round and the review outcome), the "Edits wanted" below, then merge `dev` and land `eval/wave1-corrections` with a git plan.

## Traps found

- `pkill -f "<pattern>"` matches its own shell when the pattern is in the command line; stop the server by the PID listening on the port.
- Port 8010 is taken by a server running from `.claude/worktrees/feat+service-release`; R4's captures this session used 8011.
- A re-judge needs its own `--run`; a symlink run directory to the original transcripts works and keeps them verbatim.
- The judge rebuilds the system prompt from source at start: finish any judge pass before editing `systemPrompt.ts`, and never start a merge while a judge pass is running.
- `scores.csv` notes contain unquoted commas; the reader takes everything after the seventh comma as the note, so edit rows line by line, never through a CSV library.
- The judge ledger numbers turns from 1 and transcripts from 0.
- `gate:check` writes a file only with `--out`; a plain re-run is safe on any earlier run.
- `.env` sets `SENSOR_TOOL` and `REPORT_TOOL` to true: pass both `false`, plus `CATALOGUE_PROMPT=false` and `DEBUG_RETRIEVAL=true`, to server and runner for every capture.
- `--calibrate` merges every graded round with the base sheet; to report a round alone, pass only its fixtures' ledger records to `calibrate()`.
- `retrieval:eval` on `local-rerank` or `hybrid-slice-rerank` is paid (about $0.60 per 90-query run); the offline reranker numbers came from scoring cached pools once.
- `bakeoff` writes transcripts only when the run ends, and skips a conversation's second turn when its first fails, so a failure costs two turns of coverage.
- At `LLM_REASONING_EFFORT=high`, `LLM_MAX_TOKENS=16384` is too small for about one turn in seven.
- One answer in `p3-rerank-2026-09-25` looped on 807 malformed citation markers and alone drags citation validity to 16.0%; check per-turn totals before trusting a citation rate.
- Rubric v1 and v2 verdicts are not comparable: judge v2 only under its own `--run`, and report any v2 number as secondary to E3's 1.01.
- `npm run lint` covers `src/` only; `scripts/` has pre-existing lint errors.
- Outside review agents wrote into this worktree and into `/tmp/cer-codex-review-packet-20260925`; everything is committed, and that `/tmp` clone is no longer needed.

## Decisions

- User, 2026-09-24: raise `DEFAULT_TOP_K` until marginal utility flattens; measured, it peaks at 20.
- User, 2026-09-24: R4 spend ceiling $20; calibration graded by the user on correctness and ungrounded.
- User, 2026-09-25: the AI review of the calibration packet was amended (strict numeric rule withdrawn) and the user's ungrounded counts reconciled to it; correctness stayed the user's.
- User, 2026-09-25: targeted correctness-prompt fixes and a correctness-only re-judge approved; Claude to be the final judge on the disputed rows; the result (kappa 0.849) accepted.
- User, 2026-09-25: E3 approved and run.
- User, 2026-09-25: held-out check and reranker measurement approved and run; reranker capture approved and run; reasoning `high` capture approved and run.
- User, 2026-09-25: commissioned the rubric-strictness review from Gemini, Claude and Codex, to synthesize personally.
- User, 2026-09-25: rubric question decided as "fix only flawed points" (rubric v2); no core/supplementary split before launch.
- Judge strictness audit (`EVAL_REBUILD.md`): about 6 of 117 flagged claims are over-strict and about 90% are real model elaboration.

## Edits wanted in other files at landing

- `docs/SPECS.md`: retrieval depth is `DEFAULT_TOP_K=20`; the `local-rerank` and `hybrid-slice-rerank` modes and `RERANK_MODEL`; `LLM_REASONING_EFFORT`.
- `docs/timeline.md`: decisions for the Phase 1d closure without human verification (2026-09-23), the top-k choice, the iteration 2 revert, the $20 ceiling, the calibration adjudication, E3, the held-out check, the reranker and reasoning `high` outcomes, and the user's rubric decision.
- `docs/migration/GILLIGAN_RELEASE_PLAN.md` (on `dev`): E2 and E3 are marked done in the uncommitted `dev` edits; add the improvement round and the rubric review when E4 or E6 lands.

# Phase 3 / R4 handoff - 2026-09-26 (updated after the judge replacement and the unpinned-datasheet captures)

R4 (evaluation-driven improvement) has calibrated the judge (E2), captured the final two-arm run (E3), checked the judge on held-out rows, tried a reranker and answer-model reasoning `high`, applied rubric v2, replaced the judge after Fireworks withdrew it, and measured retrieval without the pinned probe datasheets at k=10 and k=20.
No lever has lifted correctness beyond the judge's noise; the gap splits into a retrieval gap (production retrieval 0.72 against 1.10 on gold context) and an answer gap (1.10 against the 1.30 floor).
Next is the improvement plan below (follow-up query rewriting, keyword search, a stronger model on gold context), then the user's open decisions, E4 and E6.
Work on branch `eval/wave1-corrections` in its worktree `.claude/worktrees/wave1-corrections`; landing into `dev` is a separate step with its own git plan.

## Exact state

- Branch `eval/wave1-corrections` at `b395570` or later, pushed to `origin`, clean; `dev` last merged at `e7d3e44`.
- `dev` has since gained Q1's tools-on prompt and tool changes only; its tools-off message list is byte-identical to the merge base's, so R4's tools-off captures are unaffected, but merge `dev` before landing.
- **Judge:** `deepseek-v4-flash-0731` returns 404 on Fireworks since 2026-09-25 but is still `DEFAULT_JUDGE_MODEL` in `src/eval/judge/runner.ts`; every judge call must pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash` until the default is changed (with the user's approval) and its rate added to `src/eval/prices.ts` (unknown; Fireworks' pricing page does not list it).
  The replacement is calibrated (kappa 0.852 on the 32 tuned rows, 0.823 on the 38 rows v2 left unchanged) but about 0.05-0.09 more lenient than the old judge, so compare only runs judged by the same judge.
- **Rubric:** v2 as corrected (`19b363d`, fixture fingerprint `9a715154...`); v1 stays the reported rubric for E3's 1.01.
- **Baselines, new judge, rubric v2:** gold context 1.10; `hybrid-slice-vector` k=20 (E3, pinned datasheets) 0.68; `local-vector` k=10 0.72 / 0.72; `local-vector` k=20 0.72 / 0.74.
- `DEFAULT_RETRIEVAL` is unchanged (`hybrid-slice-vector`); the user decided to stop pinning the datasheets (they stay in the corpus) but has not yet chosen the production depth.
- Modes and settings off by default: `local-rerank`, `hybrid-slice-rerank` (`RERANK_MODEL`), `LLM_REASONING_EFFORT`.
- Spend about $15.50 of the $20 ceiling at the old judge's rate (about $4.50 left, approved for R4 through September 28); the new judge's own rate may differ, so check the Fireworks bill.

## What to review

Everything below is committed on `eval/wave1-corrections`; the full records with method and caveats are in `docs/EVAL_REBUILD.md`, one section each.

| item | where | commit |
|---|---|---|
| Held-out calibration check | `EVAL_REBUILD.md` "Held-out calibration check"; grades in `eval/grading/p3-calib-2026-09-24/rounds/heldout-2026-09-25/warm/scores.csv` | `33021b9`, `276a2ee`, `c78aeef` |
| Reranker, offline | `EVAL_REBUILD.md` "Reranker, offline" | `3995d8d` |
| Reranker mode and capture | `src/retrieval/adapters/RerankAdapter.ts`, `src/services/RerankService.ts`; `EVAL_REBUILD.md` "Reranker capture"; run `p3-rerank-2026-09-25` | `32275aa`, `7643e15` |
| Reasoning `high` setting and capture | `src/services/LlmService.ts`; `EVAL_REBUILD.md` "Answer-model reasoning `high`"; run `p3-reason-high-2026-09-25` | `d11d577`, `abfe241` |
| Rubric-strictness review packet | `eval/reviews/rubric-strictness-2026-09-25/PROMPT.md`, `SAMPLE.md`, `ALL_TURNS.md`; generator `scripts/buildRubricReviewPacket.ts` | `eb7e69a` |
| Rubric v2 review corrections | `eval/reviews/rubric-strictness-2026-09-25/RUBRIC_FIXES.md` "Review corrections" | `19b363d` |
| Judge replacement calibration | `EVAL_REBUILD.md` "Judge replacement calibration"; run `p3-calib-v4p1-2026-09-25` | `dfe3345` |
| E3 re-judged, new judge, v1 and v2 | `EVAL_REBUILD.md` "E3 re-judged by the new judge"; runs `p3-final-v4p1-2026-09-25`, `p3-final-rubric-v2-2026-09-25` | `c250011` |
| Unpinned datasheets, k=10 and k=20 | `EVAL_REBUILD.md` "Datasheets unpinned, k=10" and "k=20"; runs `p3-lv-k10-2026-09-26`, `p3-lv-k20-2026-09-26` and their `-rejudge` links | `00afbd7`, `b395570` |
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

## Results since the rubric decision (new judge, rubric v2, secondary to E3's 1.01)

| | correctness | median prompt | "not enough information" on answerable turns |
|---|---|---|---|
| gold context | 1.10 | - | - |
| E3 `hybrid-slice-vector` k=20, datasheets pinned | 0.68 | 19,524 | 19 |
| `local-vector` k=10, unpinned | 0.72 / 0.72 | 7,236 | 22 |
| `local-vector` k=20, unpinned | 0.72 / 0.74 | 12,913 | 16 |

- Rubric v2 moved 13 of 180 E3 verdicts (+0.04 gold, +0.01 retrieval): flawed points were not what held scores down.
- Unpinning costs nothing measurable: all six datasheet-labelled turns score at or above the baseline at k=20, and 32 of 90 turns still retrieve a datasheet chunk; the refusal class dipped on both unpinned depths (8 turns, one or two verdicts; refusal gate not re-run).
- Retrieval sees only the latest message (`ChatController.postChat` calls `adapter.getContext(query)`; `history` goes to the prompt only), so follow-up turns that do not name their subject search blind.
- Keyword search (`local-hybrid`, dense+BM25 by RRF, `RrfHybridAdapter`) exists but was last measured on the archived August label set (59.5% against 54.3% for dense at k=10), never on the frozen 90.

## Next steps

Improvement plan agreed with the user on 2026-09-26; every paid step needs the user's approval with its cost first, and offline steps come first.

1. **Follow-up query rewriting, offline (about $0.02).**
   Add an optional step that rewrites the latest message into a standalone search query from the conversation history before retrieval, behind a new off-by-default setting, with unit tests; the answer prompt still gets the user's own words.
   Measure it with the retrieval harness on the 45 second turns (history from the fixtures), `local-vector` k=20, against the same turns without rewriting; the rewrite model is `gpt-oss-120b` (45 short calls) plus query embeddings.
   Bar: a clear recall gain on second turns (the whole-set noise band is a few points), with no loss on first turns, which are unchanged by construction.
2. **Keyword search, offline (query embeddings only, under $0.01).**
   `npm run retrieval:eval -- --arm=local-hybrid --k=20` on the frozen 90 against `local-vector` at k=20 (38.4% recall, from the saved pools); read per class, and remember the contamination caveat (`EVAL_REBUILD.md` item 1: questions inherit their sources' wording, which flatters BM25).
   If 1 helped, also measure the two together.
3. **One capture of the winner, if 1 or 2 lifts recall by more than about 5 points (about $0.50):** k=20, judged twice by the new judge on v2, against `local-vector` k=20 at 0.72 / 0.74.
4. **A stronger model on gold context (about $1-1.50, depending on its rate):** the direct test of whether `gpt-oss-120b` is the ceiling (1.10 with perfect excerpts, 1.30 needed).
   Pick a non-DeepSeek model, since the judge is DeepSeek (candidates Fireworks serves on 2026-09-26: `kimi-k3`, `glm-5p3`, `qwen3p8-max`, `minimax-m3`); add its rate to `prices.ts`, set `LLM_MODEL` on the capture server only, and judge twice.
   Optional, cheaper, and a proposal the user has not yet approved: gold context with `gpt-oss-120b` and the tools-off prompt's "Keep answers short and direct" line relaxed (about $0.40), since the judge's notes on gold-context 1s are mostly omitted points, not wrong ones.
5. **User decisions, then E4 and E6:** the production retrieval setting (recommended: `local-vector` at k=20, datasheets unpinned; k=10 needs a code change because `DEFAULT_TOP_K` is a constant); not enabling `hybrid-slice-rerank` or `LLM_REASONING_EFFORT=high` for launch (recommended); per class, a caveat or a refusal under D3; whether to capture k=20 once with `CATALOGUE_PROMPT=true` (about $0.60), the prompt customers get, which adds about 21,000 characters; then the R4 report in `eval/reviews/`, the "Edits wanted" below, merging `dev` and landing with a git plan.

## Traps found

- `DEFAULT_TOP_K` is a constant in `src/retrieval/options.ts`, not an environment setting; an env var of that name is silently ignored (the spot check shows the real excerpt count). The k=10 capture edited the constant for the run and restored it.
- The judge reads the fixtures in its own tree: judging on an older rubric means running from an archive of the older commit (`git archive <sha> | tar -x`, with `node_modules` and `.env` linked in), then copying the ledger back.
- `npm run judge` exits 1 when the Tier 2 gates fail, even with every verdict recorded; check "judged, 0 failed", not the exit code.
- A model can stay listed in Fireworks' `/v1/models` after chat calls to it return 404; probe with one small chat call.

- `pkill -f "<pattern>"` matches its own shell when the pattern is in the command line; stop the server by the PID listening on the port.
- R4 captures use port 8011 so they never collide with the user's own server on 8000 (8010 was taken on 2026-09-25, free on 2026-09-26).
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

- User, 2026-09-25: MN4 on followup-cleaning-the-salt-sensor#1 stays deleted; the two v2 edits that exceeded their classes were corrected before the re-judge.
- User, 2026-09-25/26: replace the withdrawn judge with `deepseek-v4p1-flash` after calibration; re-judge E3 on v1 and v2 with it.
- User, 2026-09-26: stop pinning the four probe datasheets and keep them as ordinary corpus documents; the turbidity sensor datasheets and the source-of-truth document stay out of the corpus.
- User, 2026-09-26: capture unpinned `local-vector` at k=10, then k=20 (both run); pursue the improvement order rewriting, keyword search, stronger model.

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
- `docs/timeline.md`: the judge replacement, the datasheet unpinning and the production depth decision; and decisions for the Phase 1d closure without human verification (2026-09-23), the top-k choice, the iteration 2 revert, the $20 ceiling, the calibration adjudication, E3, the held-out check, the reranker and reasoning `high` outcomes, and the user's rubric decision.
- `docs/migration/GILLIGAN_RELEASE_PLAN.md` (on `dev`): E2 and E3 are marked done in the uncommitted `dev` edits; add the improvement round and the rubric review when E4 or E6 lands.

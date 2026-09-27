# Phase 3 / R4 handoff - 2026-09-27 (updated after follow-up rewriting, the model test and the switch to `glm-5p3-flash`)

R4 (evaluation-driven improvement) has calibrated the judge (E2), captured the final two-arm run (E3), replaced the withdrawn judge, and on 2026-09-26 ran the improvement round: follow-up query rewriting, keyword search, two prompt variants and a stronger answer model.
Two levers worked: rewriting follow-ups before retrieval (0.72 / 0.74 to 0.89 / 0.92 on `gpt-oss-120b`) and `glm-5p3-flash` as the answer model (gold context 1.33 / 1.34, the first arm over the 1.30 floor; real retrieval with rewriting 1.07 / 1.06).
The user switched the answer model to `glm-5p3-flash` and approved the next round (steps 1-6 under "Next steps"), to run in a new conversation.
Work on branch `eval/wave1-corrections` in its worktree `.claude/worktrees/wave1-corrections`; landing into `dev` is a separate step with its own git plan.

## Exact state

- Branch `eval/wave1-corrections` at `691e4f0` or later, pushed to `origin`, clean; `dev` last merged at `e7d3e44`.
- `dev` has since gained Q1's tools-on prompt and tool changes only; its tools-off message list is byte-identical to the merge base's, so R4's tools-off captures are unaffected, but merge `dev` before landing, and re-check the tools-on path with GLM (step 1).
- **Answer model:** decided `glm-5p3-flash` at `LLM_REASONING_EFFORT=low` (user, 2026-09-26); production still runs `gpt-oss-120b` until the runbook changes at landing ("Edits wanted"). GLM always reasons and rejects `thinking` disabled; `low` is accepted. Its rate is in `src/eval/prices.ts` ($0.15 / $0.03 cached / $0.50).
- **New settings on this branch, both off by default:** `QUERY_REWRITE` (`src/retrieval/queryRewrite.ts`, wired in `ChatController.postChat`; the user has not yet decided whether launch turns it on, recommended yes) and `LLM_THINKING=disabled` (for models such as `minimax-m3`). `retrieval:eval --rewrite [--history-run=<run>] [--history-arm=<arm>]` replays follow-ups with captured history and prints per-turn recall.
- **Judge:** every call must pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash`; `DEFAULT_JUDGE_MODEL` in `src/eval/judge/runner.ts` still names the withdrawn `deepseek-v4-flash-0731` (changing it awaits the user) and the replacement's rate is not in `prices.ts`. Compare only runs judged by the same judge.
  The user's blind grades of 10 GLM and 10 `gpt-oss-120b` turns agree with the judge within 0.1 on both models (7 of 10 exact each), so the judge does not favour GLM.
- **Rubric:** v2 as corrected (`19b363d`, fixture fingerprint `9a715154...`); v1 stays the reported rubric for E3's 1.01.
- **Baselines, new judge, rubric v2, two passes unless noted:** gold context `gpt-oss-120b` 1.10 (one pass), `glm-5p3-flash` 1.33 / 1.34; `local-vector` k=20 unpinned `gpt-oss-120b` 0.72 / 0.74, with rewriting 0.89 / 0.92; **`glm-5p3-flash` with rewriting 1.07 / 1.06 (run `p3-lv-k20-rewrite-glm-2026-09-26`), the baseline for the next round.**
- `DEFAULT_RETRIEVAL` is unchanged (`hybrid-slice-vector`); production retrieval is still the user's choice (recommended `local-vector` k=20, datasheets unpinned, with `QUERY_REWRITE=true`).
- **Spend:** about $18.40 of the ceiling, which the user raised from $20 to $30 on 2026-09-26, so about $11.60 left; at the old judge's rate, so check the Fireworks bill. Steps 1-6 are approved at about $2.50-3.00.

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
| Follow-up rewriting and keyword search, offline | `src/retrieval/queryRewrite.ts`, `test/unit/queryRewrite.test.ts`, `scripts/retrievalEval.ts`; `EVAL_REBUILD.md` "Follow-up rewriting and keyword search, offline"; `data/results/retrieval/r4-2026-09-26/` | `4fee6d6` |
| Brevity-line variants A and B | `EVAL_REBUILD.md` "Brevity line relaxed on gold context"; runs `p3-gold-promptA-2026-09-26`, `p3-gold-promptB-2026-09-26` | `c78d91b` |
| Rewriting captured, `gpt-oss-120b` | `EVAL_REBUILD.md` "Follow-up rewriting captured, k=20"; run `p3-lv-k20-rewrite-2026-09-26` | `765a080` |
| `LLM_THINKING`, GLM price | `src/services/LlmService.ts`, `src/config/index.ts`, `test/unit/llmService.test.ts` | `cf5f0af` |
| Stronger models on gold context | `EVAL_REBUILD.md` "Stronger answer models on gold context"; runs `p3-gold-glm-5p3-flash-2026-09-26`, `p3-gold-minimax-m3-2026-09-26` (invalid) | `607119a` |
| GLM with rewriting, ungrounded checks, blind grades | `EVAL_REBUILD.md` "`glm-5p3-flash` with follow-up rewriting"; runs `p3-lv-k20-rewrite-glm-2026-09-26`, `p3-gold-*-ungrounded-2026-09-26`; grades in `eval/grading/p3-gold-glm-vs-gptoss-2026-09-26/warm/scores.csv` | `2cb522f`, `e9569ca` |
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

## Results of the 2026-09-26 improvement round (new judge, rubric v2, secondary to E3's 1.01)

| configuration | correctness, pass 1 / 2 | notes |
|---|---|---|
| gold, `gpt-oss-120b` (E3) | 1.10 (one pass) | citations 60.4% |
| gold, `gpt-oss-120b`, brevity line deleted (A) | 1.10 / 1.06 | longer answers, more zeros; dropped |
| gold, `gpt-oss-120b`, "include every point" (B) | 1.02 / 1.07 | dropped |
| gold, `glm-5p3-flash`, reasoning low | 1.33 / 1.34 | citations 99.5%; ungrounded 40% of turns against 60% |
| gold, `minimax-m3`, thinking disabled | 0.13 / 0.13 | invalid: the second system message (CONTEXT) is dropped |
| `local-vector` k=20, `gpt-oss-120b` | 0.72 / 0.74 | |
| + `QUERY_REWRITE` | 0.89 / 0.92 | second turns 0.62 to 0.93-0.98 |
| + `QUERY_REWRITE`, `glm-5p3-flash` | 1.07 / 1.06 | refusal gate PASS, citations 99.5%, 0 unexplained figures |

Offline recall at k=20: `local-vector` 38.4% (turn 2 26.8%), with rewriting 55.4% (turn 2 60.8%); `local-hybrid` 38.9%, with rewriting 58.1% (within noise of dense, so keyword search was dropped).
GLM with rewriting still loses about 0.27 to its gold-context score, so the remaining gap is mostly retrieval; cross-document (0.67-0.75) is the weakest class.
The user's blind grading flagged a GLM habit: with the tools off it twice offered to look at "your pod's readings", and once invented a claim about upstream pods.

## Next steps

Approved by the user on 2026-09-26 (steps 1-6, about $2.50-3.00 of the $11.60 left), to run in a new conversation; every paid step beyond these needs approval with its cost first.
Run steps 3 and 1 first, in parallel; they are cheap and independent.
Report every result with its full configuration (model, reasoning, retrieval arm, k, `QUERY_REWRITE`, prompt, judge and passes): the user asked for this explicitly.

1. **GLM tool-calling check (under $0.10).** Production answers sensor and report questions through tools; no GLM run has exercised them.
   First check whether the tools can point at the local mirror (`DEVICE_API_BASE_URL` at the mirror server on :5101, fabricated data, `mirror/e2e-p3`); if not, the user approved about 10 live read-only questions against the production device API, announced before running.
   Ask about 10 sensor and report questions through the chat endpoint with `LLM_MODEL=accounts/fireworks/models/glm-5p3-flash`, `LLM_REASONING_EFFORT=low`, `SENSOR_TOOL=true`, `REPORT_TOOL=true`, on port 8011; check that tool calls are well-formed, results are used, the withheld-history note and water-type note survive (plan Q8), and no call loops to `MAX_TOOL_ROUNDS`.
2. **Production-prompt capture (about $0.55):** `local-vector` k=20, GLM, `QUERY_REWRITE=true`, `CATALOGUE_PROMPT=true` (adds about 21,000 characters), tools off; judged twice; against 1.07 / 1.06.
   `CATALOGUE_PROMPT` changes the system prompt, so pass the same value to the judge as to the server.
3. **Offline retrieval experiments (a few cents), recall on the frozen 90 with `retrieval:eval`:** (a) split cross-document questions into two or three sub-queries and merge the results (a new off-by-default option beside `QUERY_REWRITE`); (b) rewrite first turns too; (c) k=30 with rewriting, since GLM handles long prompts.
   Baseline `local-vector` k=20 with rewriting, 55.4%; use `--history-run=p3-lv-k20-rewrite-glm-2026-09-26` for GLM's own first answers and `LLM_MODEL` set to GLM so it writes the rewrites.
4. **Reranker on top of rewriting (about $0.60 per 90-query offline run):** `local-rerank` or `hybrid-slice-rerank` with `--rewrite`; earlier the reranker alone lifted recall from 39.5% to 51.9%.
5. **GLM prompt fix (about $0.40):** with the tools off, forbid offering pod readings or any capability the tools-off prompt does not have; gold context with GLM, judged twice, against 1.33 / 1.34; check the two refusal turns the user flagged in `refusal-temperature-harm-threshold`.
6. **One real capture of the winner of 3-4, plus 5 if it helped (about $0.55):** k as chosen, GLM, rewriting on, judged twice, against 1.07 / 1.06.

Then: the user's open decisions (`QUERY_REWRITE` for launch, production retrieval setting, reranker and reasoning, the judge default in code, E4's per-class caveat or refusal under D3, with cross-document the obvious candidate), E4 and E6, the R4 report in `eval/reviews/`, the "Edits wanted" below, merging `dev` and landing with a git plan.

## Traps found

- `minimax-m3` on Fireworks keeps only the first system message; `buildMessages` sends CONTEXT as a second one, so that model answers with no excerpts. Any model change needs a two-system-message probe first.
- `glm-5p3-flash` is thinking-only: `thinking: {type: "disabled"}` returns 400; use `LLM_REASONING_EFFORT=low`.
- Retrieval transcripts keep excerpts under `turns[].context` (with `id`), not `citations`; a check reading the wrong key compares empty lists and reports "identical".
- `rewriteQuery` logs nothing on success, only on fallback; confirm a rewrite capture by comparing second-turn excerpt lists with `p3-lv-k20-2026-09-26` (all 45 should differ). Rewrite usage is not in transcripts, so its cost is an estimate.
- The spot check is single-turn, so it never exercises `QUERY_REWRITE`.
- `gold-context` looks up excerpts by verbatim question text: never run it with `QUERY_REWRITE=true`.
- The ungrounded judge returns an empty reply on a few long answers, repeatably (4 of 180 on 2026-09-26); resume once, then report them unjudged.
- `grade:packet` needs at least two arms; for a blind two-model packet, make a run directory whose arm folders are symlinks to the two captures' arm folders.
- Model-run helper used on 2026-09-26 (scratchpad, not committed): start the server with the env, spot-check, capture with `--run`, stop the server by the PID on :8011, symlink a `-rejudge` run, judge twice with `--final --dimension=correctness --arm=<arm> --judge-model=...deepseek-v4p1-flash`.

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

- User, 2026-09-26 (late): approved next-round steps 1-6 (about $2.50-3.00), including about 10 live read-only device API questions for the GLM tool check if the local mirror cannot serve them; to run in a new conversation.
- User, 2026-09-26 (late): switch the answer model to `glm-5p3-flash` (at `LLM_REASONING_EFFORT=low`), after the blind 10-turn grading; raise the R4 spend ceiling from $20 to $30 to keep improving.
- User, 2026-09-26: the brevity-line variants were tried and dropped; the stronger-model test and follow-up rewriting were approved and run (`EVAL_REBUILD.md`, "Follow-up rewriting and keyword search, offline" through "`glm-5p3-flash` with follow-up rewriting").
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
- `docs/migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md` (on `dev`, line 187 and the L4 check at 212): `LLM_MODEL: "accounts/fireworks/models/glm-5p3-flash"` and `LLM_REASONING_EFFORT: "low"`, plus `QUERY_REWRITE: "true"` if the user approves it for launch; `.env.example` likewise. Only after GLM passes a tool-calling check with the sensor and report tools, which the gold and retrieval captures did not exercise.
- `docs/SPECS.md`: `QUERY_REWRITE` and `LLM_THINKING`.

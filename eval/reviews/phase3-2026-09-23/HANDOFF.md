# Phase 3 / R4 handoff - 2026-09-27 (updated after the GLM round: steps 1 and 3-6 run, step 2 not run)

R4 (evaluation-driven improvement) has calibrated the judge (E2), captured the final two-arm run (E3), replaced the withdrawn judge, and run two improvement rounds on 2026-09-26 and 2026-09-27.
The answer model is `glm-5p3-flash` at `LLM_REASONING_EFFORT=low` (user, 2026-09-26); follow-up rewriting (`QUERY_REWRITE`) is the clearest win of R4, first-turn rewriting (`QUERY_REWRITE_FIRST_TURN`) and a tools-off prompt rule were added on 2026-09-27, and GLM passed a tool-calling check against the fabricated mirror.
The control capture (2026-09-27) settled the reranker: `local-vector` k=20 with both rewrites scores 1.14 / 1.17 against the reranker's 1.11 / 1.17 at a third of the cost and 1.2 s sooner to first token, so the reranker adds nothing; both arms fail the refusal gate (2 answered), which is GLM's to fix.
Work on branch `eval/wave1-corrections` in its worktree `.claude/worktrees/wave1-corrections`; landing into `dev` is a separate step with its own git plan.

## Exact state

- Branch `eval/wave1-corrections` at `edcffd6` or later, pushed to `origin`, clean; `dev` last merged at `e7d3e44`.
- `dev` has since gained Q1's tools-on prompt and tool changes only; its tools-off message list is byte-identical to the merge base's, so R4's tools-off captures are unaffected, but merge `dev` before landing; the tools-on path was checked with GLM on 2026-09-27.
- **Answer model:** decided `glm-5p3-flash` at `LLM_REASONING_EFFORT=low` (user, 2026-09-26); production still runs `gpt-oss-120b` until the runbook changes at landing ("Edits wanted"); GLM passed the tool-calling check on 2026-09-27, so the switch is no longer blocked on tools. GLM always reasons and rejects `thinking` disabled; `low` is accepted. Its rate is in `src/eval/prices.ts` ($0.15 / $0.03 cached / $0.50).
- **New settings on this branch, all off by default:** `QUERY_REWRITE_FIRST_TURN` (2026-09-27; rewrites a first message with `rewriteFirstTurn`, only while `QUERY_REWRITE` is on; recommended on), `QUERY_REWRITE` (`src/retrieval/queryRewrite.ts`, wired in `ChatController.postChat`; the user has not yet decided whether launch turns it on, recommended yes) and `LLM_THINKING=disabled` (for models such as `minimax-m3`). `retrieval:eval --rewrite [--history-run=<run>] [--history-arm=<arm>]` replays follow-ups with captured history and prints per-turn recall; `--rewrite-first` rewrites first turns and `--decompose` splits queries (`src/retrieval/queryDecompose.ts`, eval only, not wired into the server, did not help).
- **Tools-off prompt rule:** `NO_TOOLS_RULE` in `src/prompt/systemPrompt.ts` (2026-09-27, kept by the user) is added only when both tools are off and forbids offering pod readings or other tool actions; the tools-on prompt is byte-identical.
- **Judge:** every call must pass `--judge-model=accounts/fireworks/models/deepseek-v4p1-flash`; `DEFAULT_JUDGE_MODEL` in `src/eval/judge/runner.ts` still names the withdrawn `deepseek-v4-flash-0731` (changing it awaits the user) and the replacement's rate is not in `prices.ts`. Compare only runs judged by the same judge.
  The user's blind grades of 10 GLM and 10 `gpt-oss-120b` turns agree with the judge within 0.1 on both models (7 of 10 exact each), so the judge does not favour GLM.
- **Rubric:** v2 as corrected (`19b363d`, fixture fingerprint `9a715154...`); v1 stays the reported rubric for E3's 1.01.
- **Launch configuration (2026-09-27), new judge, rubric v2, two passes:** 1.18 / 1.13, all Tier 1 gates pass (`p3-launch-lv-k20-glm-2026-09-27`); gold context with the refusal fix 1.36 / 1.30.
- **Earlier arms, new judge, rubric v2, two passes:** gold context GLM with the tools-off rule 1.28 / 1.31 (`p3-gold-glm-notools-2026-09-27`); `local-rerank` k=20, both rewrites, GLM, rule 1.11 / 1.17 (`p3-rerank-k20-rewrite2-glm-2026-09-27`), refusal gate FAIL.
- **Baselines, new judge, rubric v2, two passes unless noted:** gold context `gpt-oss-120b` 1.10 (one pass), `glm-5p3-flash` 1.33 / 1.34; `local-vector` k=20 unpinned `gpt-oss-120b` 0.72 / 0.74, with rewriting 0.89 / 0.92; **`glm-5p3-flash` with rewriting 1.07 / 1.06 (run `p3-lv-k20-rewrite-glm-2026-09-26`), the baseline for the next round.**
- `DEFAULT_RETRIEVAL` is unchanged (`hybrid-slice-vector`); launch retrieval decided by the user on 2026-09-27: `DEFAULT_RETRIEVAL=local-vector`, k=20, datasheets unpinned, `QUERY_REWRITE=true`, `QUERY_REWRITE_FIRST_TURN=true`, no reranker (the runbook still says `hybrid-slice-vector`; change it at landing).
- **Spend:** about $25.85 of the $30 ceiling, so about $4.15 left (corrected 2026-09-27; the E4 caveat capture was about $0.86 measured). `deepseek-v4p1-flash` is now priced ($0.30 / $0.006 cached / $1.20, read 2026-09-27); its ledgers from 2026-09-25 to the launch capture total $7.60 measured, about $3.15 more than the estimates recorded at the old judge's rate. A two-pass judge of a retrieval arm costs about $0.62 (pass 1 about $0.45 uncached). Check the Fireworks bill.

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
| Retrieval experiments on GLM rewrites, reranker offline | `src/retrieval/queryDecompose.ts`, `test/unit/queryDecompose.test.ts`, `scripts/retrievalEval.ts`, `src/eval/retrieval/runner.ts`; `EVAL_REBUILD.md` "Retrieval experiments on GLM rewrites, offline"; `data/results/retrieval/r4-2026-09-27/` | `89cef3e`, `888705e` |
| Tools-off rule | `src/prompt/systemPrompt.ts` (`NO_TOOLS_RULE`), `test/unit/prompt.test.ts`; `EVAL_REBUILD.md` "GLM tools-off rule on gold context"; run `p3-gold-glm-notools-2026-09-27` | `873f349`, `50d4b07` |
| `QUERY_REWRITE_FIRST_TURN` | `src/config/index.ts`, `src/retrieval/queryRewrite.ts`, `src/controllers/ChatController.ts`, `.env.example`, `test/unit/queryRewrite.test.ts` | `26e0a6d` |
| GLM tool-calling check | `EVAL_REBUILD.md` "GLM tool-calling check on the fabricated mirror"; `data/results/tool-check-2026-09-27/` | `7bd2d6a`, `f939346` |
| Reranker with both rewrites captured | `EVAL_REBUILD.md` "Reranker with both rewrites captured, k=20"; run `p3-rerank-k20-rewrite2-glm-2026-09-27` | `edcffd6` |
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

## Results of the 2026-09-27 round (new judge, rubric v2, secondary to E3's 1.01)

Full records in `EVAL_REBUILD.md`: "Retrieval experiments on GLM rewrites, offline", "GLM tools-off rule on gold context", "GLM tool-calling check on the fabricated mirror" and "Reranker with both rewrites captured, k=20".

| configuration | result | notes |
|---|---|---|
| offline recall, `local-vector` k=20 + follow-up rewrite (GLM rewrites) | 56.4% | new offline baseline |
| + split into sub-queries (3a) | 59.4% | split all 90; cross-document +1.3; dropped |
| + first-turn rewrite (3b) | 61.0% | 15 first turns up, 3 down |
| k=30 + follow-up rewrite (3c) / + first-turn rewrite | 63.8% / 67.1% | 50% more context |
| `local-rerank` k=20 + both rewrites (step 4) | 69.4%, nDCG 0.570 | 35 up, 5 down; about $0.007 per question |
| gold context, GLM + tools-off rule (step 5) | 1.28 / 1.31 against 1.33 / 1.34 | offers of pod readings 9 to 0 |
| tool check, GLM on the mirror (step 1) | 10/10 well-formed, at most 2 rounds | "last 24 hours" defect, see Traps |
| `local-rerank` k=20 + both rewrites + rule, GLM (step 6) | 1.11 / 1.17 against 1.07 / 1.06 | first turns 1.00 to 1.18, cross-document 0.71 to 0.96; refusal gate FAIL (2 answered); 4.2 s to first token against 2.3 s |

## Next steps

The user asks before every paid step: give its cost and wait for approval.
Report every result with its full configuration (model, reasoning, retrieval arm, k, `QUERY_REWRITE`, `QUERY_REWRITE_FIRST_TURN`, prompt, judge and passes).

1. **Done 2026-09-27: control capture** (`p3-lv-k20-rewrite2-glm-2026-09-27`, `local-vector` k=20, both rewrites, GLM low, tools-off rule, tools and catalogue off): 1.14 / 1.17 against the reranker's 1.11 / 1.17, refusal gate FAIL (5 exact, 1 off-contract, 2 answered); drop the reranker (`EVAL_REBUILD.md`, "Control: `local-vector` with both rewrites").
2. **Done 2026-09-27: GLM refusal fix** (`dcb3ce3`, two general prompt rules): gold context 1.36 / 1.30 against 1.28 / 1.31, refusal gate 8 exact (`p3-gold-glm-refusal-2026-09-27`); kept.
3. **Done 2026-09-27: launch-configuration capture** (`p3-launch-lv-k20-glm-2026-09-27`, `local-vector` k=20, both rewrites, `CATALOGUE_PROMPT=true`, the fix, tools off): 1.18 / 1.13, every Tier 1 gate PASS, cross-document 0.83; the run E4 and the R4 report cite.
4. **Done 2026-09-27:** `deepseek-v4p1-flash` priced in `src/eval/prices.ts` and made `DEFAULT_JUDGE_MODEL` (user, `59e4b5d`).
6. **Done 2026-09-27: E4.** The prompt caveat (`e0abe8b`, run `p3-launch-caveat-glm-2026-09-27`) reached only confident answers and was reverted (`f694766`); the user chose a standing caveat carried by the dashboard, not the server, since a new response field would need the server relay and the dashboard to pass it on. The launch capture `p3-launch-lv-k20-glm-2026-09-27` stays the cited run.
5. **Route the tool-check findings to the Gilligan answer-quality work on `dev`** (tools-on prompt and tools, not R4): the "last 24 hours" answer and the partial relay of the water-type and withheld-history notes (plan Q8).

Then: E6, the R4 report in `eval/reviews/`, the "Edits wanted" below, merging `dev` and landing with a git plan.

## Traps found

- The tool reads a relative window ("last 24 hours") back from `device_last_reported`, not from now; GLM answered "Yes, 25 samples in the last 24 hours" for a pod silent for 30 hours (`data/results/tool-check-2026-09-27/`).
- Mirror tool check: log in at `POST http://localhost:5101/api/v1/users/login` as `user-harbor-admin-1@mirror.example.invalid` with the password in the mirror README, pass the token as the caller's `Authorization: Bearer`, and leave `DEVICE_API_TOKEN` empty; auto mode blocked the login until the user allowed it in chat. The mirror has no non-superadmin in the CER organization, so the cross-organization withheld-history case cannot be exercised there.
- Start the mirror server from `clean-earth-rovers-server/.worktrees/mirror` with a scratchpad settings file (empty `DEV_UPSTREAM_BASE_URL`, `DEV_LOCAL_PATHS`, `DEV_CHAT_STORE`, `DEV_UNVERIFIED_AUTH`, fresh `ACCESS_TOKEN_SECRET`) after the malware scan; never reseed the emulator on :8080, which another session owns.
- Each `retrieval:eval` run with a rewrite flag draws its own rewrites, so recall differences of a point or two are noise; a provider 503 kills the run (re-run it).
- Pre-existing failures, not R4's: `test/unit/prompt.test.ts` "forbids causes, actions and contacts outright while nothing is approved" (fails at HEAD), lint errors in `test/unit/prompt.test.ts`, `test/unit/queryRewrite.test.ts:97` and `scripts/retrievalEval.ts:152`.

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

- User, 2026-09-27 (later): E4 is a standing caveat shown by the dashboard; the prompt caveat is dropped.
- User, 2026-09-27 (later): judge default switched to `deepseek-v4p1-flash`; E4 is a caveat for cross-document; the caveat's verification capture (about $0.90) approved and run.
- User, 2026-09-27 (later): the refusal fix on gold context and the launch-configuration capture approved and run.
- User, 2026-09-27 (later): the control capture approved and run; launch retrieval is `local-vector` k=20, datasheets unpinned, with `QUERY_REWRITE` and `QUERY_REWRITE_FIRST_TURN` on and no reranker.
- User, 2026-09-27: steps 1 and 3-6 approved and run; keep the tools-off rule; add `QUERY_REWRITE_FIRST_TURN`; the mirror login allowed for the tool check. The control capture (next step 1) awaits approval.

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
- `docs/migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md` (on `dev`, line 187 and the L4 check at 212): `LLM_MODEL: "accounts/fireworks/models/glm-5p3-flash"` and `LLM_REASONING_EFFORT: "low"`, plus `QUERY_REWRITE: "true"` (approved 2026-09-27); `.env.example` likewise. Only after GLM passes a tool-calling check with the sensor and report tools, which the gold and retrieval captures did not exercise.
- `docs/SPECS.md`: `QUERY_REWRITE`, `QUERY_REWRITE_FIRST_TURN`, `LLM_THINKING` and the tools-off rule (`NO_TOOLS_RULE`).
- `docs/migration/GILLIGAN_DEPLOYMENT_RUNBOOK.md` and `.env.example`: add `QUERY_REWRITE_FIRST_TURN: "true"` beside `QUERY_REWRITE`, and `DEFAULT_RETRIEVAL: "local-vector"` (approved 2026-09-27).
- `docs/timeline.md`: the 2026-09-27 decisions (tools-off rule kept, first-turn rewriting added, the tool check passed, the reranker held pending the control).
- `docs/migration/GILLIGAN_RELEASE_PLAN.md` (on `dev`): E4 done as a standing caveat; add a dashboard task beside U1 ("Disclaimer line on the Gilligan page"): a fixed line under every answer that cites documents, such as "Answers draw on document excerpts and may not cover every step; check the cited sections before acting.", wording approved by the user; the dashboard session (`task/gilligan-ux`) builds it.

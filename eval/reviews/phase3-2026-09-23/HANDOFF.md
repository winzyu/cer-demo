# Phase 3 / R4 handoff - 2026-09-24 (updated after the depth captures and the dev merge)

R4 (evaluation-driven improvement) has measured prompt iterations on gold context and retrieval depth on `hybrid-slice-vector`; depth is settled at k=20, and calibration plus the final capture remain.
Work on branch `eval/wave1-corrections` in a fresh worktree; landing into `dev` is a separate step with its own git plan.

## Exact state

- Branch `eval/wave1-corrections`, pushed to `origin`, with `dev` merged in (Task A turbidity, Task C provenance, and `c55f7cb`, the tools-off correctness prompt newline fix).
- The prompt is iteration 1's plus Task A's turbidity wording; `DEFAULT_TOP_K` is 20.
- Every capture so far predates the Task A wording, so the final capture is the first to include it.
- `eval/judge-cost` is merged in: exploratory judge passes run with reasoning off, any reported or deciding pass runs with `--final`, and a saved verdict is reused only for the same prompt hash and reasoning setting.
- Every run before this merge was judged at default reasoning; compare only passes judged at the same setting.
- Task A changed the system prompt the judge rebuilds from source, so re-judging a pre-Task A run no longer reuses its saved verdicts and costs a full pass.
- Spend about $7.44 of the $20 ceiling the user set on 2026-09-24, approved for R4 through September 28.

## Results (gold context unless named)

| run | correctness | ungrounded turns | refusals answered | fabricated |
|---|---|---|---|---|
| baseline `p3-2026-09-23` | 1.01 | 47.8% | 3 of 8 | 3 |
| iteration 1 `p3-it1-2026-09-23` | 1.01 | 54.4% | 2 of 8 | 2 |
| same answers re-judged `p3-it1-rejudge-2026-09-23` | 0.98 | 63.3% | - | - |
| iteration 2 `p3-it2-2026-09-24` (reverted) | 0.92 | 60.7% | 3 of 8 | 3 |
| `hybrid-slice-vector` baseline, k=5 | 0.52 | 59.6% | 2 + 1 off-contract | 1 |
| `hybrid-slice-vector` iteration 1, k=10 | 0.51 | 57.8% | 1 + 2 off-contract | 2 |
| `hybrid-slice-vector` k=20 `p3-k20-2026-09-23` | **0.60** | 62.2% | 2 + 1 off-contract | 2 |
| `hybrid-slice-vector` k=30 `p3-k30-2026-09-24` | 0.52 | 62.2% | 0 | 0 |

- Judge noise: correctness about ±0.03, ungrounded about ±9 points on identical answers; treat correctness changes under 0.05 as noise.
- Depth: k=30 refuses questions the excerpts answer, so its passing gates reflect refusing more, not answering better. Ranking, not depth, is the next retrieval lever.
- Full records: `docs/EVAL_REBUILD.md` sections "R4 iteration 1" through "Retrieval depth captures".

## Next steps

1. Calibration (2c), user-chosen 2026-09-24: 32 rows (8 conversations, 2 turns each, gold context and retrieval answers side by side), graded by the user for correctness and ungrounded claims. Build `--run` support in `npm run grade:packet` and the judge first, then generate the packet; the user grades.
2. Optional, offline and nearly free: a reranker, or dropping the always-on operator slice in `src/retrieval/adapters/HybridSliceVectorAdapter.ts`, measured with `retrieval:eval`.
3. About September 27: final two-arm capture at k=20 with the Task A wording, judged twice with `--final`, then a tools-on live smoke check of the three previously failing questions plus one report question (live production reads, so get approval first).
4. For classes still under 1.00, add a D3 caveat or refusal (`docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`) with a prompt test.
5. Write the R4 report in `eval/reviews/`.

## Traps found

- `pkill -f "<pattern>"` matches its own shell when the pattern is in the command line; stop the server by the PID listening on the port.
- A re-judge needs its own `--run`; a symlink run directory to the original transcripts works and keeps them verbatim.
- The judge rebuilds the system prompt from source at start: finish any judge pass before editing `systemPrompt.ts`, and never start a merge while a judge pass is running.

## Decisions

- User, 2026-09-24: raise `DEFAULT_TOP_K` until marginal utility flattens; measured, it peaks at 20.
- User, 2026-09-24: `epa-oxygen-solubility-chart-01` re-parented to chunk index 10 (`c85848a`); labels unchanged.
- User, 2026-09-24: R4 spend ceiling $20; calibration graded by the user on correctness and ungrounded.
- Judge strictness audit (`EVAL_REBUILD.md`): about 6 of 117 flagged claims are over-strict and about 90% are real model elaboration.

## Edits wanted in other files at landing

- `docs/SPECS.md`: retrieval depth is `DEFAULT_TOP_K=20`.
- `docs/timeline.md`: decisions for the Phase 1d closure without human verification (2026-09-23), the top-k choice, the iteration 2 revert and the $20 ceiling.

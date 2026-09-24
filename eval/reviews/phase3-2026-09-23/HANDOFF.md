# Phase 3 / R4 handoff - 2026-09-24 (updated after the depth sweep and strictness audit)

R4 (evaluation-driven improvement) has measured two iterations: prompt work on gold context is at the noise floor, and retrieval is the lever left.
Work only in `.claude/worktrees/wave1-corrections` on branch `eval/wave1-corrections`; landing into `dev` is a separate step with its own git plan.

## Exact state

- Branch `eval/wave1-corrections` at `e36d3a2`, nothing pushed, `dev` untouched. Uncommitted: `docs/EVAL_REBUILD.md` ("Judge strictness audit", "Retrieval depth sweep") and this file; commit them with a git plan first.
- Commits since the previous handoff (`fb8d22d`), in order:
  - `9195a8d` iteration 1 record, judge variance record, captures `p3-it1-2026-09-23` and `p3-it1-rejudge-2026-09-23`.
  - `e2a0761` iteration 2 prompt (dropped the excerpt-number rule, narrowed the partial-refusal rule).
  - `3d2a920` iteration 2 record and capture `p3-it2-2026-09-24`.
  - `e36d3a2` revert of `e2a0761`: the prompt is iteration 1's again, with `DEFAULT_TOP_K` 10.
- Checks after the revert: `test/unit/prompt.test.ts` 46/46, `npm run typecheck`, `npm run lint`.
- No server is running; port 8011 was stopped.
- Spend about $4.34 of the user's $10 ceiling, approved for R4 through September 28.

## Results (gold context unless named)

| run | correctness | ungrounded turns | refusals answered | fabricated |
|---|---|---|---|---|
| baseline `p3-2026-09-23` | 1.01 | 47.8% | 3 of 8 | 3 |
| iteration 1 `p3-it1-2026-09-23` | 1.01 | 54.4% | 2 of 8 | 2 |
| same answers re-judged `p3-it1-rejudge-2026-09-23` | 0.98 | 63.3% | - | - |
| iteration 2 `p3-it2-2026-09-24` (reverted) | 0.92 | 60.7% | 3 of 8 | 3 |
| `hybrid-slice-vector` baseline, k=5 | 0.52 | 59.6% | 2 + 1 off-contract | 1 |
| `hybrid-slice-vector` iteration 1, k=10 | 0.51 | 57.8% | 1 + 2 off-contract | 2 |

- Judge noise: correctness about ±0.03, ungrounded about ±9 points on identical answers. Treat correctness changes under 0.05 as noise; the 2% ungrounded ceiling is not measurable with this judge.
- Retrieval decides the default arm: at k=10, turns with half or more of their labels retrieved score 0.95, under half 0.56, none 0.19. Recall (captured context against fixture-wide labels) rose from 11.6% to 20.3% at k=10, but the iteration 1 prompt made answers shorter and more cautious, so the total stayed flat.
- Out-of-range citation numbers (for example 【10】 with 5 excerpts) are invented by the model and did not respond to a prompt rule either way; Task C owns correcting them from the quote's location.
- Full records: `docs/EVAL_REBUILD.md` sections "R4 iteration 1" and "R4 iteration 2".

## Next steps

1. Offline sweep done (`EVAL_REBUILD.md` "Retrieval depth sweep"): recall 29.0% at k=10, 39.5% at 20, 46.5% at 30, 51.0% at 40, no knee. The user wants depth raised until utility flattens.
2. Once the user approves (about $2): set `DEFAULT_TOP_K` per capture, commit it (git plan), and capture `hybrid-slice-vector` at k=20 and k=30 under new `--run` ids. Pick the smallest k beyond which correctness gains under 0.05. Capture commands: `git show fb8d22d:eval/reviews/phase3-2026-09-23/HANDOFF.md`, step 1.
3. Optional, offline: dropping the operator slice in `src/retrieval/adapters/HybridSliceVectorAdapter.ts`, and follow-up turns retrieving without the earlier turn's context.
4. About September 27: merge `dev` (git plan; Task C's `systemPrompt.ts` / `prompt.test.ts` edits will conflict), final two-arm capture judged twice (about $0.60 extra per arm) to halve judge noise, then a tools-on live smoke check of the three previously failing questions plus one report question - live production reads, so get approval first.
5. For classes still under 1.00, add a D3 caveat or refusal (`docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`) with a prompt test.
6. Write the R4 report in `eval/reviews/`.

## Coordination with Task C (separate session, worktree `task-c-provenance`)

- Task C owns citation-marker handling: renumbering a marker from its quote, validation into audit and the gate's invalid-citation count, display stripping as a fallback.
- Its tool-citation prompt edits go in the tool blocks; the general rule at `systemPrompt.ts:261` is part of the evaluated prompt, so its change must land before the final capture.
- When its gate-check changes land, re-run `gate:check` over the earlier runs (free) so all runs are scored alike.

## Traps found

- `pkill -f "<pattern>"` matches its own shell when the pattern is in the command line; stop the server by the PID listening on the port.
- A re-judge needs its own `--run`; a symlink run directory to the original transcripts works and keeps them verbatim.
- The judge rebuilds the system prompt from source at start: finish any judge pass before editing `systemPrompt.ts`.

## Decisions

- User, 2026-09-24: raise `DEFAULT_TOP_K` until marginal utility flattens (measured on correctness).
- User, 2026-09-24: re-parent `epa-oxygen-solubility-chart-01` to chunk index 10. It belongs on `worktree-eval-claims-reresolve` (`5d269a3`, not in this branch); it needs a git plan, a label regeneration and a recorded label fingerprint; fixture text stays frozen.
- Judge strictness audit (`EVAL_REBUILD.md`): about 6 of 117 flagged claims are over-strict and about 90% are real model elaboration, so strictness does not explain the ungrounded rate.

## Open questions for the user

- Approve the k=20 and k=30 captures (about $2).
- Approve the EPA re-parent git plan once written.
- Recommended, not yet agreed: skip formal calibration (2c: 30 rows, 1.5-2 h of the user's grading, under $0.30) before launch, double-judge the final captures instead, and record the 2% ungrounded ceiling as not measurable with this judge.
- For launch, not this workstream: STATUS user item 8 (re-seed Firestore); the turbidity datasheets in `documents/_excluded/` stay out of the corpus pending Task A.

## Edits wanted in other files at landing

- `docs/SPECS.md`: retrieval depth is `DEFAULT_TOP_K=10`.
- `docs/timeline.md`: decisions for the Phase 1d closure without human verification (2026-09-23), the top-k change, and the iteration 2 revert.

## Resume prompt

> Read docs/STATUS.md, then continue Eval R4.
> Work in `.claude/worktrees/wave1-corrections` on `eval/wave1-corrections` (confirm with `git worktree list` and `pwd`); read `eval/reviews/phase3-2026-09-23/HANDOFF.md`, then `docs/EVAL_REBUILD.md` from "R4 iteration 1" onward.
> Start by committing the uncommitted records (git plan), then get approval for the k=20 and k=30 `hybrid-slice-vector` captures and the EPA re-parent plan.
> Spend is approved up to $10 total through September 28 (about $4.34 used); report each run's cost. Commits need a `git-plan` approved in chat; never push or merge into `dev`; no subagents; Task C owns citation-marker handling.

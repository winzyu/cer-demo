# Phase 3 / R4 handoff - 2026-09-23

R4 (evaluation-driven improvement) is mid-loop: the baseline is captured and graded, iteration 1 is committed, and its recapture has not run.
Work only in `.claude/worktrees/wave1-corrections` on branch `eval/wave1-corrections`; the other session lands this branch into `dev`.

## Exact state

- Branch `eval/wave1-corrections` at `22d6dd0`, working tree clean, nothing pushed, `dev` untouched (last merged `9c783cd`).
- Commits this session, in order:
  - `ec58b05` Wave 1 corrections (35 fixtures, 45 labels, refusal/context contract).
  - `9cf91fe` merge of `dev`; the refusal rule keeps `dev`'s closest-alternative sentence followed by the partial-answer rule.
  - `e74a4b3` fixture freeze and Phase 1d user decision in `docs/EVAL_REBUILD.md`, plus `--run=<id>` on `bakeoff`, `gate:check` and `judge`, and a bakeoff guard against overwriting transcripts.
  - `786accf` Phase 3 baseline data and record (run `p3-2026-09-23`).
  - `22d6dd0` iteration 1: four prompt rules and `DEFAULT_TOP_K` 5 to 10.
- Runtime links in the worktree (git-ignored): `node_modules`, `data/corpus`, `data/embeddings` link to the main checkout; `.env` is a copy.
- No server is running; the 8011 eval server was stopped.
- Spend so far: about $1.53 of the user's $10 ceiling, approved 2026-09-23 for R4 through September 28.

## Baseline (run `p3-2026-09-23`, at `e74a4b3`)

| arm | correctness (floor 1.30) | ungrounded turns (ceiling 2%) | Tier 1 |
|---|---|---|---|
| `gold-context` | 1.01 | 47.8% | FAIL: refusal 3 of 8 answered, 3 fabricated figures |
| `hybrid-slice-vector`, k=5 | 0.52 | 59.6% | FAIL: refusal 2 answered + 1 off-contract, 1 fabricated figure |

Weak classes on gold context: cross-document 0.92 and refusal 0.75; every class fails on the retrieval arm.
Causes and numbers are recorded in `docs/EVAL_REBUILD.md`, section "Phase 3 baseline - 2026-09-23".

## Iteration 1 (committed at `22d6dd0`, not yet measured)

- Prompt: marker numbers are the 【n】 label, never a step/table/page number in the text.
- Prompt: a question asking for any value no excerpt gives must contain the refusal sentence, even with related parts answered.
- Prompt: say only what an excerpt states; no added reasons, mechanisms or steps; keep "can" as "can".
- Prompt: table values from the exact row and column, quoted, with arithmetic shown.
- Retrieval: `DEFAULT_TOP_K` 10 (offline recall on `hybrid-slice-vector` 18.4% at k=5, 29.0% at 10, 35.2% at 15, 39.5% at 20).
- Checks run after the change: `prompt` (46), `retrieval` (21), `hybridSliceVector` (5), `rrfHybrid` (6) suites, typecheck, lint.

## Next steps

1. Recapture both arms as run `p3-it1-2026-09-23` (about $1.50), spot check first:
   ```
   PORT=8011 SENSOR_TOOL=false REPORT_TOOL=false CATALOGUE_PROMPT=false DEBUG_RETRIEVAL=true \
     CORPUS_SOURCE=artifact DEFAULT_RETRIEVAL=hybrid-slice-vector LLM_MAX_TOKENS=16384 npx ts-node src/index.ts
   # runner, same env flags:
   npm run bakeoff -- --arm=gold-context --base-url=http://localhost:8011/api/v1 --spot-check
   npm run bakeoff -- --arm=gold-context --pass=warm --run=p3-it1-2026-09-23 --base-url=http://localhost:8011/api/v1
   npm run bakeoff -- --arm=hybrid-slice-vector --pass=warm --run=p3-it1-2026-09-23 --base-url=http://localhost:8011/api/v1
   npm run gate:check -- --run=p3-it1-2026-09-23 --out=data/results/gate-check/p3-it1-2026-09-23/warm.json
   npm run judge -- --run=p3-it1-2026-09-23
   ```
   Check port 8011 is free first; never kill 8000, 5001 or 3000.
   Rerun `judge` once more if calls fail with "no JSON object"; it only sends the missing rows.
2. Attribute the change: the gold-context delta is the prompt; the hybrid delta minus it is k=10.
   If ungrounded or dilution rises on hybrid, try k=15 or drop the always-on probe-datasheet slice (`local-hybrid` scores alike without its ~9.4K tokens).
3. Iterate on the weakest remaining classes; land every prompt change as a commit before its capture.
4. Where a class stays weak by September 28, caveat or refuse it (decision D3 in `docs/migration/GILLIGAN_TARGET_ARCHITECTURE.md`).
5. Record each run in `docs/EVAL_REBUILD.md`, then write the final R4 report.

## Traps found this session

- The judge ledger is keyed `arm|fixtureId|turn|dimension` with no answer hash: always judge a new capture under its own `--run`, or it silently reuses old verdicts.
- The judge builds the system prompt from source at start and uses it as grounding: do not edit `systemPrompt.ts` while a judge pass is starting.
- `judge` prints "N already on disk" as the whole ledger size, not the number skipped for the requested arm.
- The quote checker already folds U+2011 hyphens, so its "not found verbatim" results are real misses.

## Open questions for the user

- Judge calibration (2c) is unmeasured: part of the 47.8% is judge strictness (adjectives, `±` against OCR `+`), so the 2% ceiling may be unreachable with this judge as is.
- `DEFAULT_TOP_K=10` changes production prompt size and cost (about +4K tokens, about $0.0006 per uncached request).
- Whether the default arm should keep the always-on probe-datasheet slice.
- `epa-oxygen-solubility-chart-01` chart-header quote exception is still open.

## Edits wanted in the other session's files

- `docs/SPECS.md`: retrieval depth is now `DEFAULT_TOP_K=10` (was 5); state it where top-k or prompt size is described.
- `docs/timeline.md`: decision-log entries for the Phase 1d closure without human verification (2026-09-23) and for the top-k change.
- `CLAUDE.md` / `docs/EVAL_REBUILD.md` §7: captures should use `--run=<id>`; `eval/transcripts/<run>/` is captured data under the same verbatim rule.

## Lines for STATUS

- Eval: Phase 1d closed by user decision without human verification; the 45 / 90 set is frozen (`e74a4b3`).
- Phase 3 baseline `p3-2026-09-23`: gold context 1.01 correctness / 47.8% ungrounded, default arm 0.52 / 59.6%; both fail; retrieval recall at k=5 was 16-18%.
- Iteration 1 (four prompt rules, `DEFAULT_TOP_K` 10) is committed at `22d6dd0` and not yet measured; about $1.53 of the $10 R4 ceiling spent.
- `eval/wave1-corrections` is ready for the other session to land after iteration 1 is measured; nothing pushed.

## Resume prompt

> Work in `.claude/worktrees/wave1-corrections` on `eval/wave1-corrections` (confirm with `git worktree list` and `pwd`).
> Read `eval/reviews/phase3-2026-09-23/HANDOFF.md`, then `docs/EVAL_REBUILD.md` from "Phase 1d decision and fixture freeze" onward.
> Continue R4: recapture both arms as run `p3-it1-2026-09-23`, grade, attribute the prompt and top-k effects, and iterate on weak classes.
> Spend is approved up to $10 total through September 28 (about $1.53 used); report each run's cost. Commits need a `git-plan` approved in chat; never push or merge into `dev`; no subagents.

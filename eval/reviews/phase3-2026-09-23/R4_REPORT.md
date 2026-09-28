# R4 report - evaluation-driven improvement, 2026-09-23 to 2026-09-27

Release task E6 of `docs/migration/GILLIGAN_RELEASE_PLAN.md`.
The full record of every run is `docs/EVAL_REBUILD.md`; the working log and traps are `HANDOFF.md` beside this file.

## Result

Gilligan launches below the evaluation's correctness bar, with every hard gate passing and the weakest answers caveated under decision D3.

| | correctness (floor 1.30) | refusal gate | citation validity | unexplained figures |
|---|---|---|---|---|
| E3, gold context (`gpt-oss-120b`, old judge, rubric v1): the reported Phase 3 result | 1.01 | - | - | - |
| E3, `hybrid-slice-vector` k=20 (same) | 0.58-0.59 | - | - | - |
| Launch configuration (`p3-launch-lv-k20-glm-2026-09-27`), new judge, rubric v2 | 1.18 / 1.13 | PASS, 8 of 8 exact | 99.8% | 0 of 535 |

The two rows use different judges and rubrics, so the launch figure is not a like-for-like gain over E3; compared on the new judge and rubric v2, the same retrieval path went from 0.72 / 0.74 (`gpt-oss-120b`, `local-vector` k=20, no rewriting) to 1.18 / 1.13.
Each pair is two judge passes over the same answers; pass-to-pass spread is about 0.05.

## Launch configuration

- Answer model `glm-5p3-flash` at `LLM_REASONING_EFFORT=low`, `LLM_MAX_TOKENS=16384`.
- Retrieval `local-vector`, `DEFAULT_TOP_K` 20, probe datasheets unpinned, no reranker.
- `QUERY_REWRITE=true` and `QUERY_REWRITE_FIRST_TURN=true`.
- `CATALOGUE_PROMPT=true`, the three R4 prompt rules (`SPECS.md` §10.2).
- The evaluation ran with the sensor and report tools off, since on means live production reads; the tools-on path was checked separately with GLM against the fabricated mirror (10 of 10 well-formed tool calls) and is release task E5's live smoke.
- These values are in the runbook §4.1 and must match at L4.

## What moved the score

| change | effect | evidence |
|---|---|---|
| Judge calibration (E2) | correctness kappa 0.849 against the user's grades; 75% exact on 12 held-out rows | `EVAL_REBUILD.md`, "Final adjudication" |
| Depth k=20 | peak of the depth sweep | 2026-09-24 |
| Follow-up rewriting | 0.72 / 0.74 to 0.89 / 0.92 on `gpt-oss-120b`; offline recall 38% to 55% | 2026-09-26 |
| `glm-5p3-flash` | 0.89 / 0.92 to 1.07 / 1.06 with rewriting; gold context 1.10 to 1.33 | 2026-09-26 |
| First-turn rewriting and the tools-off rule | 1.07 / 1.06 to 1.14 / 1.17 | control capture, 2026-09-27 |
| Refusal rules | refusal gate from 2 answered to 8 of 8 exact | 2026-09-27 |

Tried and dropped: the reranker (level with the control at three times the cost), reasoning `high`, two brevity-line prompt variants, query decomposition, keyword search (within noise of dense), `minimax-m3` (drops the second system message), and a prompt caveat (reached only confident answers).

## Remaining weaknesses

- Overall correctness is under the 1.30 floor; the judge's gold-context score for GLM is 1.33 / 1.34, so most of the remaining gap is retrieval.
- Cross-document questions score 0.83: field situations where several factors interact need guidance spread across documents, and answers often rest on one. The dashboard shows a standing caveat under every answer that cites documents (plan U7).
- GLM's refusal wording varies between runs: the same prompt refused all eight must-refuse turns exactly in one capture and 6 of 8 (one paraphrased, one borderline) in the next.
- The judge scores bare refusals low when the rubric also wants the supported related points; the refusal class sits at 0.75-1.25.
- The ungrounded-claim judge agrees weakly with the reference grades (any/none 78%, count kappa 0.23), so ungrounded rates are indicative only.
- Tools-on findings routed to answer quality (plan Q8): a "last 24 hours" question answered from a window anchored to the pod's last report rather than now, and partial relay of the water-type and withheld-history notes.

## Spend

About $25.85 of the $30 ceiling, measured from token counts at the rates in `src/eval/prices.ts`; the judge was priced only on 2026-09-27, when earlier estimates turned out about $3.15 low.
The Fireworks bill is the authority.

## Addendum: launch corpus update (E7), 2026-09-27

The Keyestudio document and the source-of-truth v2 excerpt (§5-7 and §11, without §7.2 rule 1) join the launch corpus by user decision.
Two captures on the E4 settings score 1.14 / 1.16 and 1.16 / 1.17 against a same-day control of 1.19 / 1.20 on the old corpus, with cross-document 0.83-1.00.
The pre-set rule failed on its gates, but the control failed the refusal gate as well, so GLM's refusal behaviour, not the corpus, is the launch weakness; the new documents cost two refusal turns a point each by displacing the USGS passages their rubrics expect.
Spend about $4.75 more, from the remaining budget plus $10 the user added. Details: `docs/EVAL_REBUILD.md`, "E7 launch corpus update: results".


# Wave 1 corrections - 2026-09-22

35 fixtures corrected after checking the findings in the [historical agent review](../wave1-agent-2026-09-21/README.md).
The set remains 45 fixtures and 90 turns, with 738 rubric conditions; 13 question turns changed.
All 34 EDIT fixtures were changed, along with the KEEP buffering-capacity fixture to supply its required explanatory context.
This is an implemented correction pass with targeted agent checks, not a second full review or Phase 1d human sign-off.
The changes are uncommitted on `eval/wave1-corrections`, based on `c41ffb5`.

## Reviewable changes

| Area | Correction | Checked evidence |
|---|---|---|
| Numerical stabilization | Added the >100 TU branch of ±10%; retained ±0.5 TU or 5%, whichever is greater, at or below 100 TU; allowed documented professional selection alongside the median alternative. | Multiparameter A6.8:714-722; field A6.0:510-542. |
| DO procedures | Selected the USGS chamber procedure and table explicitly where timing or numbers differed; distinguished manual and automatic salinity correction, conditional optical hardware, and equilibrium saturation from a maximum or an attributable site change. | DO A6.2:621-631,716-731,810-870,1759-1785 and tables 6.2-2/6.2-4; EPA:151-168,368-372. |
| Conductivity and pH | Corrected cell geometry and temperature-reference implications; accepted certified compatible standards, the two documented slope ranges, and design-appropriate electrode repair; separated the A6.8 form criteria from the A6.4 final-buffer check. | SC A6.3:297-365,611-625,674-677,759-784,848-853; pH A6.4:1359-1372,1677-1722; MP A6.8:1059-1061. |
| Turbidity | Distinguished reversible settling from flocculation, final reporting from raw precision, configuration-dependent immersion choices, and white-light BU/AU units from N-prefixed units. | Turbidity A6.7:418-427,998-1000,1190-1196,1295-1314,2156-2159; MP A6.8:901-919. |
| Source context | Changed the cold-water scenario to groundwater so its qualifier rule applies; separated ZoBell standard checking from field stabilization; corrected minimum 90-day stability; allowed qualified subsample reporting and valid thermal-verification alternatives. | Field A6.0:1583-1604; ORP A6.5:151,369-381,508-516; temperature A6.1:700-727,1216-1240. |
| Threshold precedence | Replaced claims of absent configuration with unavailable limits unless a successful result confirms absence; rejected limits remain unusable with their stated reason; attributed qualitative turbidity treatment to application policy. | Three precedence fixtures; `systemPrompt.ts`; `getPodThresholds.ts`. |
| Refusal scope | Preserved refusal of missing capacity, deployment lifetime/retention rules, site-specific thermal limits and hardware specifications while supplying positive explanatory sources; distinguished the declared NTU label from unknown optical design. | Alkalinity A6.6:56-77,368-371,1294-1319; temperature A6.1:248-272,660-674; turbidity A6.7:930-933,1793-1797,2051-2097; EPA:94-101,162-168,584-612. |
| EPA drift and tables | Preserved per-location calibration exemptions and successful midday recalibration; accepted the USGS oxygen performance-check alternative; tied the table difference to the applicable tolerance and recognized the uncovered combined temperature/pressure case. | EPA:151-168,584-612,762-785 and chart bounds; DO A6.2:567-573,1743-1750 and table bounds. |

Source line numbers are one-based `document.text.split('\n')` positions in the pinned corpus, not `splitlines()` positions or old chunk IDs.
The detailed original condition findings remain in the nine historical batch reports.
The new [verification record](verification.json) lists changed fixtures and questions, current hashes, per-turn context counts and BM25 results.
Fixture notes were revised to retain valid claim anchors while removing obsolete exclusivity claims and obsolete slice/range assumptions.
No claim extraction or full scientific review was repeated.

## Context and response contract

`retrieval_evidence` is an optional per-turn list of corpus filenames and verbatim quotes.
When present, it overrides the fixture-wide claim-note label set and resolves against the current corpus; supplemental lists retain the prior relevant anchors.
All eight refusal turns now carry explicit evidence and `requires_refusal: true`.
Their labels have supporting relevance grade 1, because these excerpts explain the limitation without providing the requested missing value.
The other mechanical labels remain provisional, usually fixture-wide grade 2.
The loader validates source membership and nonempty evidence; the generator rejects unresolved explicit quotes, mismatched claim quotes, missing refusal evidence and stale output files.
It prepares every label before writing, so a validation error does not partially overwrite the output set.

The application still uses its pinned refusal sentence when no relevant context exists, followed by one short explanation.
For a partially supported request it uses that sentence for the missing part, names the missing input, and supplies separately cited supported explanations.
The citation prohibition applies to the refusal sentence, not the explanatory material.
The judge now grades refusal and explanatory rubric points independently, so a bare refusal cannot earn full credit for a compound rubric.
The mechanical refusal gate permits this pinned-sentence-plus-explanation form; its existing heuristic is not a semantic proof of correct refusal.
Paraphrased refusals containing figures can still be vetoed by that heuristic, while the exact sentence alone can mask a later incorrect claim; quote/figure gates, rubric judging and human calibration remain necessary.

The threshold tool previously emitted `no_threshold` and claimed no turbidity threshold existed on any pod, although it does not map a turbidity threshold field.
It now emits `unavailable` for turbidity and describes that limitation of the tool.
This changes model-facing tool output; the other five metrics retain their existing validation behavior.
No production device reads were needed.

## EPA dependency and preserved history

Initial inspection found `dev` at `c41ffb5`, plus existing eval notes/artifacts and separate EPA and Gilligan worktrees.
Despite the current status notes, the EPA re-resolution was on branch `worktree-eval-claims-reresolve` at `5d269a3`, not in `dev`.
The two claim files from that commit were inspected, checked against the live corpus, and copied verbatim into this correction worktree as a dependency.
The EPA worktree itself was not edited or merged.
All 446 claim chunk IDs resolve; the known `epa-oxygen-solubility-chart-01` quote exception remains.
Affected fixtures no longer name that invalid header claim, instead using the verified table-value claims and explicit current header evidence where needed.
No decision was silently made about re-parenting that claim or refreshing its OCR quote.

The original review, its manifest/context hashes and all captured transcripts are byte-identical to `c41ffb5`.
The original checker passed before edits: 45 fixtures, 90 turns, 734 conditions, 11 KEEP and 34 EDIT.
After intentional edits it correctly fails with `Reviewed policy/harness changed: src/prompt/systemPrompt.ts`.
Do not update those historical hashes to make it pass.
The new audit writes only this directory's verification JSON.
Existing main-checkout `docs/EVAL_REBUILD.md`, exit criteria, grading packet and source PDF were not changed.
Gilligan work was not changed.
At final inspection, another session had advanced `dev` to `d290472` and replaced the `gilligan-tools` worktree with `gilligan-handoff`.
Those commits also change `src/prompt/systemPrompt.ts` and `test/unit/prompt.test.ts`; this correction worktree remains at its approved `c41ffb5` base, so landing requires reconciliation of those two files.

## Validation

| Check | Result |
|---|---|
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `goldContext.test.ts` | 6 tests passed; real labels/current corpus, including all refusal turns and added numerical alternatives. |
| `prompt.test.ts` | 30 tests passed. |
| `evalFixtures.test.ts` | 26 tests passed. |
| `judge.test.ts` | 55 tests passed. |
| `gateCheck.test.ts` | 55 tests passed. |
| `getPodThresholds.test.ts` | 9 tests passed against stubbed device responses. |
| Label-generator CLI | Success case plus five rejection cases passed, preserving all output bytes on each rejection. |
| New correction audit | 45 labels, 90 exact query matches and adapter lookups; valid quoted evidence; historical files and corpus unchanged. |
| `git diff --check` | PASS. |

The original gold-context suite reproduced the dead EPA IDs before regeneration; after regeneration, its old empty-refusal expectation failed because explanatory context now exists, and the corrected expectation passes.
The new unavailable-turbidity assertions failed before the tool correction and passed afterward.
The generator still reports the known `in-situ-vs-25` regex false positive in the unchanged `crossdoc-acid-drainage-conductivity-suspect` notes: 340 real claim references resolve and this one prose token does not.
Its nine gold chunks validate successfully; the scanner warning is not a missing source claim.
All Jest suites ran individually with `--runInBand`; no full suite, paid captures, embeddings, ingestion or live API calls ran.

Offline BM25 rank-1 contamination, using unchanged retriever defaults and each turn's literal question without history:

| Measure | Result |
|---|---:|
| Notes-derived source-chunk provenance | 9/82 = 10.98% |
| Current labelled explanatory chunks | 9/90 = 10.00% |
| Source document | 26/90 = 28.89% |

All aggregate measurements remain below the 40% contamination bar.
The three precedence fixtures measure 0/6 labelled-chunk hits and 2/6 document hits.
The deep-manual class measures 45% at document level and 25% at labelled-chunk level; the aggregate pass is not a claim that every class passes every measure.
The historical 46-fixture percentages are not directly comparable: the corpus, fixture set, questions and explanatory source coverage changed.
The notes-derived metric excludes the eight refusal turns with no claim-note provenance, while their explicit explanatory labels are included in the separate labelled-chunk metric.
84/90 turns have explanatory sources entirely outside the four-document direct-feed slice, including the refusal explanations; this is source coverage, not whole-request answerability.

Reproduce from the correction worktree with the restored corpus and installed dependencies:

```bash
node_modules/.bin/ts-node scripts/resolveRetrievalLabels.ts
python3 scripts/verifyWave1LabelFailures.py
node_modules/.bin/ts-node scripts/verifyWave1Corrections.ts
```

The audit invokes read-only Git subprocesses; this session needed sandbox approval for that invocation.
Generated labels and verification JSON must be regenerated with these scripts, never hand-edited.

## Remaining blockers

- Phase 1d human verification and fixture freeze remain incomplete; the 738 corrected conditions are not a human-approved grading target.
- The EPA chart-header claim still needs the separately recorded re-parent/re-quote decision; it is reported by the audit but is no longer used by these labels.
- Phase 1e still needs broader per-turn label splits, candidate review, hard negatives and relevance-grade differentiation; the new per-turn explanatory lists do not close that phase.
- Judge calibration and a newly authorized capture are still needed to measure behavior under the changed prompt/rubrics; old captures retain their historical meaning and cannot score this revision.
- The corrected worktree needs review and an approved Git landing plan; it has not been committed, merged or pushed.
  Reconcile the prompt and prompt-test overlap with the Gilligan changes now on `dev` and rerun their focused checks before landing.

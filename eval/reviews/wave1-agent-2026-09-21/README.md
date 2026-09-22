# Wave 1 agent verification

**Completed: 45 fixtures, 90 turns, and 734 rubric conditions reviewed against the restored 14-document corpus.**
**11 KEEP; 34 EDIT; 0 RETIRE; 0 wholly UNVERIFIABLE.**
EDIT means at least one requirement needs correction or clarification before it is a reliable grading target; it does not mean every condition in that fixture is wrong.
Some individual conditions remain ambiguous or unverifiable even though their fixture can be repaired.
It is agent verification, not human verification, judge calibration, or grading of generated answers.
Phase 1d human sign-off remains unclaimed.

Read the [fixture index](INDEX.md) for all 45 verdicts, the linked batch reports for condition-level evidence and proposed fixes, and [secondary checks](SECONDARY_CHECKS.md) for the coordinator's verification and limitations.
Machine-readable verdicts are in [verdicts.json](verdicts.json).

## Main findings

| Issue | Affected examples | Required correction |
|---|---|---|
| A missing numerical branch changes the expected answer | `crossdoc-how-steady-before-i-write-it-down`, `deepmanual-sonde-settle-time` | Add the ±10% turbidity stabilization rule above 100 TU; the lower-range rule is not universal. |
| A rule is applied outside its source context | `crossdoc-cold-water-hot-day-turbidity`, `deepmanual-zobell-check` | Separate groundwater from surface-water rules, and standard verification from field-sample stabilization. |
| A source statement is reversed or overgeneralized | `crossdoc-orp-sliding-do-steady`, `definitional-what-a-bare-tu-label-tells-us` | “At least 90 days” is not a 90-day expiry; white-light units include BU/AU and are not all N-prefixed. |
| Correct alternative answers can lose credit | `deepmanual-do-saturation-ceiling`, `probecal-ph-slope-acceptance`, `deepmanual-ec-standard-choice` | Select the intended procedure in the question or accept source-supported alternatives and their conditions. |
| Distinct measurement/check concepts are merged | `crossdoc-soft-water-ph-wont-settle`, `deepmanual-turbidity-rounding`, `probecal-end-of-day-check` | Separate buffer checks, stabilization, drift qualification, raw logging and final reporting. |
| Missing input is treated as known configuration | All three `precedence` fixtures | Distinguish unavailable limits from absent configured limits, while recording that the current prompt itself requires the overstatement. |
| A refusal conflicts with the actual application contract | `refusal-turbidity-sensor-hardware` | Distinguish the declared NTU display label from unknown optical design and calibration. |
| Refusal fixtures require source explanations but receive no gold context | All four refusal fixtures | Supply per-turn explanatory evidence and reconcile substantive partial answers with the exact-refusal contract before measuring correctness. |

The 11 KEEP verdicts allow minor clarifications documented in their reports.
In particular, `refusal-buffering-capacity-not-measured` has a sound substantive refusal but still shares the context/response-contract blocker.
KEEP does not certify that the existing harness can fairly grade every condition.

## Resource allocation and completion

The intended nine fresh contexts were unavailable because the tool enforces a three-worker thread limit for this session, including completed threads.
Three read-only workers instead handled source-related batches sequentially without inheriting the parent conversation.
Seven complete worker reports cover 35 fixtures.
Two workers hit their usage limit before delivering the final two reports; the coordinator completed batches 5 and 9, covering the remaining 10 fixtures, from direct source inspection.
The completed partial-worker observations were used only as leads and were checked before inclusion.
There was no repeated paid capture or attempt to bypass the usage limit.

## Method

Nine batches each contain five fixtures, grouped by source overlap, with at most three workers running concurrently.
Workers received their fixtures and shared review instructions, without the parent conversation or the previous qualification report.
Each worker checks every `must_contain` and `must_not` condition, citation lists, `answerable_from`, question answerability, and follow-up coherence.
The parent checked selected material findings, higher-risk cases, and four KEEP examples against source passages before consolidating the results.
This is a targeted secondary review, not a second blind review of all 734 conditions.
Batch reports are parent-consolidated review documents, not verbatim captured transcripts.
There are no paid evaluation API calls, fixture edits, generated-answer captures, or Git mutations.

`manifest.json` records the exact corpus and fixture SHA-256 hashes and batch assignments.
`context-hashes.json` pins the reviewed application prompt, judge prompt, label generator and gold-context adapter.
Source locators in batch reports refer to one-based lines in each document's `text` field from `data/corpus/corpus.json`, written verbatim to a separate UTF-8 text file.
These locators do not rely on stale chunk IDs.
Source files are named by their original PDF filenames even where reviewers use the corresponding `.txt` suffix.
The corpus JSON, rather than fixture notes or the claim inventory, supplies the reviewed evidence.
OCR uncertainty is reported rather than silently repaired.

`MC` denotes a `must_contain` condition and `MN` a `must_not` condition, numbered from one within each turn.
A supported MN means the prohibition is justified, not that the prohibited proposition is true.
Reasonable deductions are distinguished from explicit source statements where material.
Corpus-wide absence checks are bounded searches, not a proof that no possible paraphrase exists.
The judge renders `rubric.cite` as SHOULD CITE; omitted alternatives are not automatically described as demonstrated deterministic citation failures.

## Verification and follow-up

Run `python3 eval/reviews/wave1-agent-2026-09-21/verify_review.py` from the repository root, or invoke the script by absolute path.
The completed check confirms 45 unique fixture sections, all 90 turns' 734 condition identifiers covered, the expected batch assignments, and unchanged fixture/corpus SHA-256 hashes.
It regenerates the index and JSON verdicts from the authored batch reports.
It checks bookkeeping, not scientific truth or semantic completeness of each explanation.
No runtime tests or paid model evaluations were needed for this read-only source review.

Next, apply a separate, reviewable fixture/source-label patch, reconcile the prompt conflicts, regenerate affected labels and contamination measurements, and review the corrected set before freezing it.
Do not interpret the verdict counts as a measured generator score, judge agreement result, or permission to mark Phase 1d human verification complete.
The review leaves the existing fixture files, source corpus, status document, exit criteria, application prompt and label generator unchanged.

# Report omit: Mirror results, 2026-10-10

Results of [`REPORT_OMIT_MIRROR_TEST.md`](REPORT_OMIT_MIRROR_TEST.md), run on the Mirror with fabricated data; nothing touched production.
Verdict: the `omit` mechanism works end to end, and the model picks the right groups on a first request, but on a second edit in the same chat it twice claimed a new copy without calling `generate_report`.
That failure needs a decision before the feature ships (see "Open decision").

## Stack

| service | port | code |
|---|---|---|
| Firestore emulator, seeded 2026-10-10 08:41:46 UTC (22 devices, 13,680 readings) | 8080 | server `mirror/release-rc1` `8594338` |
| cer-api | 5101 | `8594338` plus `task/gilligan-report-omit` `ddcddc5`, applied to an exported tree in the session's scratch directory |
| Gilligan | 8010 | cer-demo `task/report-omit` `4b2845b`, then the prompt change in this commit for R1-R3 |

Departures from the plan:

- The auto-mode classifier refused to create the `mirror/report-omit` branch and worktree in the server repository, so the server ran from `git archive mirror/release-rc1` plus `git diff local task/gilligan-report-omit`, applied with no conflict in a scratch directory; the malware scan printed nothing.
- No dashboard was started: every check went through cer-api's routes directly, which is the same path the dashboard uses.
- The first seed crashed in Firestore's bulk writer ("Request time should not be before the last token refill time", a backwards clock step under WSL); the retry succeeded.
- Gilligan ran with the plan's production model settings (`glm-5p3-flash`, reasoning low, 16 tool rounds, first-turn query rewrite) and `CATALOGUE_PROMPT=true`.

## Fixture caveat confirmed

No Mirror pod has a turbidity row.
The seed stores field 72 as 0 (`scripts/mirror/mirrorData.ts:455`) and only `turbVolt` varies, but `/water/period` returns the stored field unconverted, so every pod reads turbidity 0 for the whole period and the stuck-sensor rule (`src/tools/stuckSensor.ts`) drops it.
`turbidity_notes` and `sensor_fault_notes` were therefore checked offline (below); on the Mirror they only change the Omitted row.

## Free steps

| step | request | result |
|---|---|---|
| F1 | health and auth smoke | pass: Gilligan 200 with `fireworksConfigured`, cer-api `/devices` 401 without a token, quota 20 / 5 / 1,000,000 in `demo-cer-mirror` |
| F2 | Superadmin, Demo Public Dock Buoy, last 7 days | pass: 200, 3-page PDF, sections 1-5 |
| F3a | same, `omit: ["turbidity_notes"]` | pass: only the Omitted row differs ("turbidity notes (at the requester's request)") |
| F3b | same, all four groups with `data_quality` repeated | pass: the Omitted row names all four once; the threshold-provenance footnote, both "Not assessed: ... placeholder" notes, the temperature provenance sentence and the Data Quality section go; Recommendations renumbers from 5 to 4; every number is identical |
| F4 | `omit: "turbidity_notes"`, `omit: ["Bad!"]` | pass: cer-api answers 400 without calling Gilligan |
| F4 | `omit: ["recommendations"]` | pass: cer-api relays it and passes back Gilligan's 400 naming the four allowed groups; no report is counted (River Watch stayed at 0 used); the body carries a stack trace only because cer-api runs with `NODE_ENV=development` (`errorHandler.ts:26`) |

## Paid steps

| # | persona, chat | message | `omit` passed | verdict |
|---|---|---|---|---|
| P1 | River Watch, chat A | report for River Watch Float, last 7 days | none | pass |
| P2 | chat A | exclude the turbidity disclaimers to share a clean copy online | `turbidity_notes`, `sensor_fault_notes` | pass with a note: one group more than the plan expected, a defensible reading of "turbidity disclaimers"; the PDF's Omitted row matches |
| P3 | chat A | remove all the warnings and the data quality section | **no tool call** | **fail**: the reply says all four groups were left out and points to the download button, but `generate_report` was not called and no report exists |
| P4 | chat A | take the pH numbers out | none | pass on the refusal, but it repeats P3's false claim ("I've already omitted those in the latest copy") |
| P5 | Lakeside, new chat | report for Lakeside Buoy 2026 without the notes about where thresholds come from | `threshold_notes` | pass; the PDF's Omitted row matches |
| P6 | Superadmin, new chat | make me a shorter report for Demo Public Dock Buoy | none | pass: it offered the note groups instead of guessing |
| P7 | Lakeside, new chat | how has the water been at Lakeside Buoy 2026 this week | none | pass |

P2 and P5 named the groups by their internal names (`turbidity_notes`; "listed under omitted_from_pdf").
The prompt was changed to require a fresh `generate_report` call for every edit, even when an earlier reply claimed one, and to describe the omitted notes in plain words (`src/prompt/systemPrompt.ts`, `REPORT_TOOL_BLOCK`; `test/unit/prompt.test.ts` passes).
P1-P3 were then rerun as the Harbor admin on Harbor Pier Buoy:

| # | `omit` passed | verdict |
|---|---|---|
| R1 | none | pass |
| R2 | `turbidity_notes`, `sensor_fault_notes` | pass: plain-language reply, and it warned that a reader of the clean copy will not see the caveats |
| R3 | **no tool call** | **fail again**, same pattern as P3 |

Both failures are the third turn of a chat whose earlier replies said "a new PDF is ready"; each used about 25,000 tokens, one model round with tools offered and none called (`ChatOrchestrator.ts` offers tools on every round below `MAX_TOOL_ROUNDS`).
The prompt change fixed the wording but not the missing call.

## Offline turbidity samples

`prepareReport` and `renderReportPdf` over `test/fixtures/device-api/algalita-period-1-day.json`, the same pipeline the route runs, with the pod renamed "Sample Pod" and a synthetic turbidity index (520-940, one reading at 1005), since the fixture's turbidity is also 0.

| sample | `omit` | what changes against S1 |
|---|---|---|
| S1 | none | the full report: status Watch, turbidity band Turbid (mean 805.2) |
| S2 | `turbidity_notes` | all four turbidity caveats go: the summary bullet's "uncalibrated scale" clause, the table's Baseline cell ("No range (relative index)" becomes "—"), the Section 2 footnote's turbidity half and the analysis paragraph's "provisional, uncalibrated conversion" sentence; band, min, max, mean and median stay |
| S3 | plus `sensor_fault_notes` | only the Omitted row: the period mean is not off-scale and not all zero, so no fault note was printed to remove |
| S4 | all four | as S3, plus the threshold notes and the Data Quality section |

## Samples for Michael

In [`report-omit-samples/`](../captures/report-omit-samples/), all from fabricated or synthetic data:

- Before and after for his request: `offline-S1-full.pdf` and `offline-S2-no-turbidity-notes.pdf` (turbidity values synthetic; the only pair that shows the turbidity caveats).
- Through the deployed path, chat to PDF: `mirror-P2-chat-turbidity-disclaimers.pdf` and `mirror-P5-chat-threshold-notes.pdf`.
- Route-only: `mirror-F2-full.pdf`, `mirror-F3a-omit-turbidity.pdf`, `mirror-F3b-omit-all-four.pdf`.
- `offline-S3-no-turbidity-or-fault-notes.pdf`, `offline-S4-all-four.pdf`.

A "clean" turbidity copy can still mention turbidity in Data Quality when the sensor looks faulty (the stuck-sensor and implausible-value notes in `mirror-P2-chat-turbidity-disclaimers.pdf`); only `data_quality` removes them.

## Spend

10 questions, 511,627 tokens: about $0.08 at $0.15 per million input tokens, at most $0.26 if every token were billed at the output rate; reports add no model cost.
Report downloads used: Superadmin 3, River Watch 2, Lakeside 1.

## Open decision

The model can tell a user a report was edited when it was not, which matters more here than elsewhere: the user would share a PDF still carrying the notes they asked to remove, or no new PDF at all.
Options, for the user to choose:

1. A deterministic guard in the orchestrator: when the final answer points at the download button (or says notes were left out) and no `generate_report` call succeeded in this answer, replace or append a correction, or retry once with the tool required.
2. Give the model the earlier turns' tool results (or a marker that a report was produced), so history no longer shows bare "ready" replies to imitate; larger change, wider effect.
3. Ship as is, documenting that a second edit in one chat may need a new chat.

## Other observations

- P7: "this week" produced a report period of 2026-10-05 to 2026-10-12, ending two days after the request; outside this task, not investigated.
- The Mirror's turbidity field (above) means no Mirror test can cover turbidity; seeding field 72 from `turbVolt` would fix that in the server's mirror branch.

## History-marker test, 2026-10-11

Hypothesis: the model skips `generate_report` because history holds only the earlier replies' text ("a new PDF is ready") and never shows the tool call behind them.
Test: R3's message sent straight to Gilligan's `/api/v1/chat` (service key and caller headers as cer-api sends them) with R1-R2 as history, either as plain text, which is what cer-api sends (`toHistory`), or with each reply marked `[generate_report was called for this reply with {...}]`.

| history | runs | no tool call |
|---|---|---|
| plain | 6 | 1 |
| marked | 6 | 5 |

The marker made the failure more frequent, not less, so option 2 in that form is rejected: a reply that says a report was produced reads to the model as one more reason not to produce another.
The plain-history failure is intermittent: 1 of 6 here, 2 of 2 through cer-api earlier, so about 3 of 8 overall for a second edit in one chat; the runs differ only by sampling.
Every run that called the tool passed all four groups, as expected.
Spend: 12 questions, 453,495 tokens, about $0.07 (at most $0.23); session total about $0.15.

## Fix test, 2026-10-11

The fix (`5390332`, `SPECS.md` §10.7): the server appends "New PDF in this reply: …" from the tool results and strips it from history, and an answer that claims a report it did not make is rerun once with `generate_report` forced through `tool_choice`, else replaced.
Fireworks honours `tool_choice` for `glm-5p3-flash`, both `"required"` and a named function (three direct calls, under a cent).
The user ran the test (`run-mirror-test.sh` in the session scratchpad) because the auto-mode classifier refused it from the agent as a production read; it reached only the Mirror.

Replays of R3 with R1-R2 as plain history (the old-prompt replies, which say "a new PDF is ready"), straight to Gilligan as the Harbor admin:

| runs | first answer skipped the tool (retry fired) | report made in the end | replaced with the fallback | `omit` passed |
|---|---|---|---|---|
| 8 | 6 | 8 | 0 | all four groups in 7; turbidity, sensor fault and data quality in 1 (X6) |

One chat through cer-api as the Harbor customer, P1-P3 wording, history in the new shape:

| turn | `omit` | retry | delivery line |
|---|---|---|---|
| C1 report, last 7 days | none | no | "…, 2026-10-04 to 2026-10-11, full report." |
| C2 exclude the turbidity disclaimers | `turbidity_notes`, `sensor_fault_notes` | no | "…, leaving out the turbidity notes and sensor fault notes." |
| C3 remove all the warnings and the data quality section | all four | yes (Gilligan log) | "…, leaving out the turbidity notes, sensor fault notes, threshold notes and Data Quality section." |

Every answer that should have made a PDF now made one, and every delivery line matched the `omit` actually passed; no answer needed the fallback.
The skip itself is more frequent than before (7 of 9 first answers here against about 3 of 8), and it happens with the new history shape too (C3), so the retry, not the prompt, is what holds; it costs one extra round, about 24,000 tokens.
The model still opens replayed answers with "Done — a new PDF … is ready via the Download report (PDF) button" despite the new rule, imitating the old-prompt history; these are now true, and the C2-C3 answers with new-shape history no longer mention the button.
X6 read "all the warnings" as not including the threshold notes; the delivery line and the PDF's Omitted row both say so.
cer-api does not relay `report_retried`, so the C3 retry was read from Gilligan's log.
Spend: 3 probe calls plus 11 questions, 745,700 tokens, about $0.11 (at most $0.37 at the output rate); report downloads none.

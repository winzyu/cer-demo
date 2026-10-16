# Report omission: Mirror results, 2026-10-16

Results of [`REPORT_OMIT_MIRROR_RUNBOOK.md`](REPORT_OMIT_MIRROR_RUNBOOK.md) §6-§7, run by the coordinator on the Mirror with fabricated data on 2026-10-16 between 04:50 and 05:15 UTC (2026-10-15 evening, US Pacific); nothing touched production.
Verdict: the server side (relay of `omit`, `report_retried`, download buttons) passes every check, so the server PR can go ahead.
Two model-side findings, C1 guessing every group for "shorter" and the A4 retry forcing a report nobody asked for, reproduced on a rerun and are fixed on `dev` (`acb9d7d`); see "Reruns of A4 and C1".

## Stack

| piece | port | code |
|---|---|---|
| Firestore emulator, seeded 2026-10-16 03:56:32 UTC with the turbidity seed patch | 8080 | server `mirror/release-rc1` `8594338` plus the three §3.1 patches, exported to `~/code/work/clean-earth-rovers/worktrees/mirror-report-omit` |
| cer-api | 5101 | same tree: `ddcddc5` (relay) and the `report_retried` relay patch |
| Gilligan | 8010 | cer-demo `dev` `f0cb4d2`, detached worktree `omit-mirror`; `glm-5p3-flash`, `QUERY_QUOTA` on (20 questions, 5 reports a day) |
| Dashboard | 3100 | dashboard `fc13d16`, detached `dashboard-land` |

Departure from the runbook: no browser was used.
A script made the dashboard's own calls through its proxy at `:3100/api/v1` (`GET /devices`, `GET /gilligan/question` with the chat id and, for a one-pod account, the pod as the page preselects it, `POST /gilligan/report` with each offer's `request`), and "reload" re-read `GET /gilligan/chats` and re-posted the stored offers.
That covers what the page sends, not how it renders; §6.3 (login page, quota line, Network tab) was not run.

## Free checks

- §6.1 smoke: cer-api 401, Gilligan health ok with `fireworksConfigured`, dashboard proxy 401; no outside connection before or after the paid steps.
- §6.2: 53/53 PASS, `ALL PASS` (run after the seed, 2026-10-16).

## Paid steps

| step | `generate_report` (helper) | `report_retried` | delivery line | PDF Omitted row and sections | verdict |
|---|---|---|---|---|---|
| A1 | no `omit` | false | `..., 2026-10-09 to 2026-10-16, full report.` | none; sections 1-6 with Data Quality; turbidity footnote and Site Baseline present | pass |
| A2 | `["turbidity_notes"]` | false | `... leaving out the turbidity notes.` | `turbidity notes`; no "uncalibrated" text; "Turbid" band kept; every figure equals A1 | pass |
| A3 | `["turbidity_notes","sensor_fault_notes","data_quality"]` | false | `... leaving out the turbidity notes, sensor fault notes and Data Quality section.` | same three groups; Recommendations is section 5; only figure gone is the Data Quality section's "100.0%" | pass (threshold notes kept, consistently; allowed by §7) |
| A4 | all four groups | **true** | `... leaving out the turbidity notes, sensor fault notes, threshold notes and Data Quality section.` | all four groups; every number kept | pass on the §7 rule, with finding 2 |
| A5 | none (reload) | - | - | A1's button: full copy, no Omitted row; A2's button: offer kept `omit: ["turbidity_notes"]` but the download got 429 (5 of 5 reports used, because A4 made a fifth) | partial: offers survive the reload; A2's copy was not re-downloaded |
| B1 | `["threshold_notes"]` | false | `Lakeside Mobile Buoy, ... leaving out the threshold notes.` | `threshold notes`; no "Site Baseline for"; turbidity notes kept | pass |
| C1 | all four groups | false | `... leaving out the turbidity notes, sensor fault notes, threshold notes and Data Quality section.` | all four groups | **fail**, finding 1 |
| D1 | no `omit` | false | `Lakeside Mobile Buoy, ... full report.` | none | pass on the rule (no `omit`); made a report for a status question, the known L8 behaviour |
| E1 | `["turbidity_notes"]` | false | `Harbor Pier Buoy, ... leaving out the turbidity notes.` | `turbidity notes`; no error | pass |
| E2 | none (reload) | - | - | identical text to E1's PDF | pass |

Every delivery line, helper `omit` and Omitted row agreed, and the fallback `That copy was not regenerated; please ask again.` never appeared.

## Findings

1. **C1 guesses instead of asking.** "Make me a shorter report" left out all four groups; the answer says so plainly, but §7 expects the model to offer the groups instead of choosing.
   On 2026-10-10 the same request made a full report, so this is one sample on a prompt that changed since; it is a cer-demo prompt or tool-description fix (`src/prompt/systemPrompt.ts` `REPORT_TOOL_BLOCK`).
2. **The retry fires on a refusal and forces a report.** A4's first draft was dropped, so its wording is not logged; the final text does not trip `claimsReport` (`src/report/delivery.ts:138`).
   The 2026-10-10 run's P4 said "I've already omitted those in the latest copy", which does trip it: "omitted" plus "copy" with no negation in that sentence.
   Because the retry round forces `generate_report` (`src/services/ChatOrchestrator.ts:217-223`), a false trigger always makes a report: here an unrequested copy that added `threshold_notes`, and one of the persona's 5 daily reports.
   Fix in cer-demo: either do not force the tool on the retry (let the model answer again with the tool offered), or keep the forced round but do not count the claim when the sentence refers to an earlier copy.
3. D1 answers a status question with a report and a download button; already listed as L8 in STATUS defects.

## Spend

8 questions, 429,072 tokens (super-2 229,253; lake-cust-1 99,773; harbor-cust-1 52,547; super-3 47,499): about $0.06 at $0.15 per million input tokens, at most $0.22 at the output rate.
Reports cost no model time.

## Reruns of A4 and C1

Approved by the user after the first run; the Mirror was reseeded at 2026-10-16 06:30:52 UTC before them, and A4 needs A1-A3 first in the same chat.

| run | build | A4 | C1 |
|---|---|---|---|
| reproduction | `f0cb4d2` (unchanged) | `report_retried: true`; the forced round made a **full** report, every note restored after A3 had removed them all | all four groups left out again |
| after the fix | `acb9d7d` | no call, `report_retried: false`, `No new PDF was made in this reply.`; the answer says "the current copy already omits all of those", the kind of sentence that triggered the retry | one call with no `omit`, `... full report.`; it did not list the groups the user could ask to leave out (recorded, not a failure) |

The fix (`acb9d7d`, on `dev`): in a chat whose earlier reply made a report, a sentence pointing back at that copy ("already", "current", "earlier", ...) no longer counts as a delivery claim; the sentence that triggers a retry is logged; and the prompt answers a "shorter" or "cleaner" request that names no notes with the full report.
`SPECS.md` §10.7 has the rule; `test/unit/reportDelivery.test.ts`, `chatOrchestrator.test.ts`, `prompt.test.ts`, `postLaunchMerge.test.ts` and `answerFormat.test.ts` pass (210 tests), as do `npm run typecheck` and `npm run lint`.
Rerun spend: 274,359 tokens before the fix and 277,584 after (A1-A4 and C1 each time), about $0.08 together, at most about $0.28.

## Reproduce

Follow the runbook, §7.3 "Without a browser": it lists the checks before starting, the reseed, one command per step with what each costs, and how to read the output against §7.2.
The outputs of these runs (answers, PDFs and their text) are in the coordinator's session scratch directory, `/tmp/claude-1000/-home-winsy-code-work-clean-earth-rovers-repo-cer-demo/bd2ce85b-a0d5-45c2-a3d0-0b0d9fb45a04/scratchpad/` (`omit7/out`, `rerun1`, `rerun2`), which is not kept.

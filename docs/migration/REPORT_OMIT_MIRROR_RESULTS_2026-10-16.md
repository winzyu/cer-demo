# Report omission: Mirror results, 2026-10-16

Results of [`REPORT_OMIT_MIRROR_RUNBOOK.md`](REPORT_OMIT_MIRROR_RUNBOOK.md) §6-§7, run by the coordinator on the Mirror with fabricated data on 2026-10-16 between 04:50 and 05:15 UTC (2026-10-15 evening, US Pacific); nothing touched production.
Verdict: the server side (relay of `omit`, `report_retried`, download buttons) passes every check, so the server PR can go ahead.
Two model-side findings need a cer-demo fix before the release: C1 guessed every group for "shorter", and the A4 retry fired on a refusal and forced a report nobody asked for.

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

## Reproduce

Needs the Mirror stack running (runbook §5) and a seed from the last 7 days with no reports used by these four personas; reseed first if in doubt (it erases chats and resets allowances).
From the `dev` worktree, one command per step, in order (the eight questions cost about $0.06-0.22 in all):

```bash
cd ~/code/work/clean-earth-rovers/repo/cer-demo/.claude/worktrees/dev
O=~/report-omit-chat-$(date +%F); D="node scripts/mirror/reportOmitDrive.mjs $O"
$D A1 user-super-2 new "Give me a water quality report for Demo Public Dock Buoy for the last 7 days."
$D A2 user-super-2 same "Can you exclude the turbidity disclaimers so I can share a clean PDF copy online?"
$D A3 user-super-2 same "Remove all the warnings and the data quality section."
$D A4 user-super-2 same "Take the pH numbers out of the report."
$D A5 user-super-2 reload 0,1
$D B1 user-lake-cust-1 new "Report for Lakeside Mobile Buoy, last 7 days, without the notes about where the thresholds come from."
$D C1 user-super-3 new "Make me a shorter report for Demo Public Dock Buoy."
$D D1 user-lake-cust-1 new "How has the water been at Lakeside Mobile Buoy this week?"
$D E1 user-harbor-cust-1 new "Give me a report for Harbor Pier Buoy for the last 7 days without the turbidity notes."
$D E2 user-harbor-cust-1 reload 0
for p in user-super-2 user-lake-cust-1 user-super-3 user-harbor-cust-1; do node scripts/mirror/reportOmitLastChat.mjs $p@mirror.example.invalid; done
```

Each step prints the answer, the offers and, per downloaded PDF, its Omitted row and section list; compare with the table above and the §7 pass rules.
The helper prints `omit` and `report_retried` per turn (it shows each persona's latest chat, so run it for `user-lake-cust-1` after B1 as well if B1 needs checking).
`A5 ... reload 0,1` downloads A1's and A2's offers; if A4 made a report, A2's download is refused with 429, as here.
The model is not deterministic: C1 and A4 may pass on a rerun, which does not clear the findings.

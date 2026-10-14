# Post-launch merge tests (`land/post-launch`)

Branch `land/post-launch` is `dev` `469e972` plus, in order, `docs/launch-handoff`, `task/sot-v2-flagging`, `task/report-omit` and `docs/behavior-handoff`.
`dev` fast-forwards to it only after tiers 1-3 pass and the user has decided on the two findings below.

## What the merge joined

- v2 flagging: per-reading QC (`src/devices/readingQc.ts`), operator thresholds with v2 fallbacks, the 3-in-a-row rule against the minimum detectable change, per-metric verdicts in `query_sensor_data`.
- Report editing: the `omit` groups (`src/report/omit.ts`), the server-written "New PDF in this reply" line and the forced `generate_report` retry for an unmade report claim (`src/report/delivery.ts`, `ChatOrchestrator`).
- Docs only: the launch handoff, the data-skepticism incident and the window-note SPECS rule.

Conflict resolution renamed report-omit's `probeAccuracy` arguments to v2's `noiseFloor` / `minimumDetectableChange` and kept both branches' doc lines.
One conflict git did not flag: `test/unit/reportRenderPdf.test.ts` still passed `probeAccuracy` to `buildReportPdf`, fixed in the merge commit.

## Findings from the merge

1. **QC explanations read as report claims (defect).**
   `claimsReport` treats "excluded", "removed" or "omitted" next to "report" as a delivery claim, and v2 answers explain QC exclusions in exactly those words.
   With the report tool registered, such an answer forces a `generate_report` round in a chat that never asked for a report; if no PDF is made, the answer is replaced with "That copy was not regenerated; please ask again."
   Fixed at landing (2026-10-12): a sentence that names readings is not a delivery claim, since `omit` never removes readings; reproduced first through `POST /api/v1/chat` (`test/integration/reportClaim.test.ts`).
2. **`threshold_notes` does not cover v2's fallback footnote (decision).**
   The operator-threshold footnote is left out, but the "generic fallback" footnote and the "Not assessed" footnote still print.
   The parameter prose still says "generic fallback" under every omit subset, so a reader can always tell a fallback from a site limit.
   Resolved at landing (2026-10-12): `threshold_notes` now drops all three footnotes, as its description promised (`timeline.md`).
3. **Spike rule over-flags steady channels (defect, found by the test chats).**
   Against the series' MAD alone, ordinary noise on a healthy steady channel read as spikes, and three in a row made a likely data issue.
   Fixed at landing (2026-10-12): a spike must also exceed v2's minimum detectable change (`readingQc.ts`, `test/unit/readingQc.test.ts`).

## Tier 1: static checks (free)

- `npm run typecheck`
- `npm run lint`

## Tier 2: Jest suites, run by name (free, offline)

Never run the full suite; the user runs `npm test`.

```
npx jest --silent \
  test/unit/postLaunchMerge.test.ts \
  test/unit/reportOmit.test.ts test/unit/reportDelivery.test.ts test/unit/chatOrchestrator.test.ts \
  test/unit/generateReport.test.ts test/unit/reportRenderPdf.test.ts test/unit/reportNarrative.test.ts \
  test/unit/readingQc.test.ts test/unit/flagRules.test.ts test/unit/operatorThresholds.test.ts \
  test/unit/reportReferenceRanges.test.ts test/unit/querySensorData.test.ts test/unit/getPodThresholds.test.ts \
  test/unit/buildReportInput.test.ts test/unit/siteQuality.test.ts test/unit/siteSnapshot.test.ts \
  test/unit/reportModel.test.ts test/unit/reportEvents.test.ts test/unit/prompt.test.ts
npx jest --silent \
  test/integration/reports.test.ts test/integration/chat.test.ts test/integration/sensorChat.test.ts \
  test/integration/devices.test.ts test/integration/provenance.test.ts
```

On 2026-10-12, after the landing fixes and `task/data-skepticism`, the 24 touched suites (706 tests) and 9 further dependent suites (229 tests) pass.
`postLaunchMerge.test.ts` covers:

- all 16 omit subsets leave every numeric flag cell unchanged;
- two readings beyond a limit stay Normal under every subset (3-in-a-row rule);
- a PDF with an operator limit, a v2 fallback, a Not assessed row and all-zero turbidity renders under all 16 subsets, keeps the numbers, the status and an accurate Omitted row, and drops exactly the chosen groups;
- the fallback wording survives `threshold_notes`;
- finding 1 at the `claimsReport` and orchestrator level.

## Tier 3: local smoke against the merged server (live reads, paid)

Needs the user's approval first: it reads the production device API (read-only) and calls the LLM.
Budget: about $0.15, stop at $0.30.
Start the server from the `post-launch-land` worktree with the `run-local` skill, with the sensor and report tools on; never write to production.

| # | Question | Pass when |
|---|---|---|
| S1 | "Is the dissolved oxygen at Balboa OK over the last 30 days?" | A per-metric verdict; no flag from a single reading; no "New PDF" line. |
| S2 | "Were any readings thrown out this week at Balboa, and why?" | The answer explains QC exclusions and is not replaced; `report_retried` is false. A failure here reproduces finding 1 end-to-end. |
| S3 | "Make a report for Balboa for the last 7 days." | One PDF; a "New PDF in this reply" line naming "full report"; flags match S1's verdicts. |
| S4 | Same chat: "Now leave out the turbidity notes and the threshold notes." | A fresh `generate_report` call with `omit`; the line says what was left out; flags and numbers match S3. |
| S5 | Same chat: "Thanks, what's the pH range there?" | No new PDF, a "No new PDF was made in this reply." line, no forced retry. |
| S6 | "Leave the numbers out of the report." | A refusal; no forced retry; no PDF. |

Record each run's question, tool calls, `report_retried`, delivery line and spend in `docs/migration/POST_LAUNCH_MERGE_RESULTS_<date>.md`.

## Landing

After tiers 1-3 pass and the user decides on the findings: fast-forward `dev` to `land/post-launch`, push `dev`, and rebase nothing.
`task/data-skepticism` builds on `task/sot-v2-flagging` and lands later on its own.

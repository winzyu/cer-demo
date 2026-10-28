# Flagging rework: handoff (2026-10-13)

Branch `task/flagging-share-window` (worktree `.claude/worktrees/flagging-share-window`), cut from `dev` `60f531c`, pushed to `origin`, not merged, nothing deployed.
Design and the real cases: [`FLAGGING_OVERVIEW_2026-10-12.html`](FLAGGING_OVERVIEW_2026-10-12.html).
Decisions: [`../timeline.md`](../timeline.md), the 2026-10-13 row "Flagging rework decisions".
Rules as built: [`../SPECS.md`](../SPECS.md), "The flag rule", "Reading labels" and "Verdicts".

## Start here (next chat)

Michael answered on 2026-10-23 and the user decided on 2026-10-27; the servicing rule and the coordinator's landing checklist are built on the branch (see "Michael's answers and the servicing rule" below).
What remains: the user's call on the Sep 25-29 pH swings (question 28) and the coordinator's squash landing; the servicing replay is recorded below ("Replay with the servicing rule").
Read this file, then the timeline's 2026-10-13 and 2026-10-27 flagging rows; open the overview only for a case's detail.
Rules carried over: STATUS.md is the coordinator's and is not edited on this branch; merge `origin/dev` before each commit; announce any device API read before running it; production reads are blocked for the agent, so hand the user a `! ...` command; no paid runs without approval; do not quote the customer's chat or name her in committed docs beyond the chat id; keep real readings out of git; run only relevant Jest suites singly plus `npm run typecheck` and `npm run lint`; push the task branch when a verified unit is done and send the coordinator the commit IDs; the coordinator lands it on `dev` by squash.

Next steps, in order:
1. If the user reclassifies the Sep 25-29 swings as device issues, build that rule and rerun the suites under "Tests run".
2. Ask the coordinator to land the branch; deployment (F16) is a separate decision.

## Michael's answers and the servicing rule (2026-10-23 to 2026-10-27)

| Question | Michael | On the branch |
|---|---|---|
| 28, Algalita pH swings | No service until about Oct 13; the swings were "likely device issues" | Kept unusual, as built, pending the user's call |
| 29, wording | Yes | Approved as built |
| 30, 15% Action Required bar | Yes | Approved as built |
| 27, alert emails | They are binary and need a grey area | Out of scope; the coordinator's post-release backlog |
| 31, hot-afternoon dips | Board heat should not affect readings | Dips stay water; whole-board failures stay device faults |
| 32, Sep 24 | Probably a service: out of water reads near-0 conductivity, bleach sends pH up, the buoy keeps reporting | The servicing rule below |

The servicing rule (user, 2026-10-27; `servicingWindows` in `src/devices/readingQc.ts`; SPECS "Reading labels"):
- On marine pods only, conductivity below half its 24-hour median within 2 hours of a reading at the usual level, together with a pH rail or a sudden pH jump, starts a servicing window.
- Every channel's readings from the first signal until conductivity recovers fail as `servicing`: left out, never a likely data issue, listed by the sensor tool as `servicing` and named in the report's Data Quality.
- On Algalita, Sep 24 22:45 to Sep 25 00:25 UTC is left out and the Sep 24-25 conductivity flag is gone; the 30-day report keeps only the pH flags and stays Watch.
- Left alone, by design: a marine conductivity drop with pH steady (the skepticism fixture's Marina Dock cleaning is one), and the same pattern on brackish or freshwater pods.

Also built with it, from the coordinator's landing checklist:
- The persistent-offset wording names a threshold that does not fit the site and a calibration check, not "sensor fouling or calibration" (`narrative.ts`, `systemPrompt.ts`).
- `daily_cycle` gives each day's low (`daily_lows_local_solar`) and the prompt takes times of day from it, for data-skepticism item 3.
- The G1 guard in `scripts/skepticism/replay.ts` grades the four 2.07s as unusual: passing when they go unmentioned or are described as unusual, failing on fault wording or an acidification claim.
- The fixture's Sep 24 follows the service's real timing with rounded synthetic values.
- Stale since the real month: "the dips stopped after Oct 9" below holds for the fixture only; the real dips returned Oct 13-14.

## Summary for Michael

Written to be sent as is; it names no customer.

**What changed.** Gilligan now gives every reading one of four labels.
Normal.
Out of range: past the limit by more than the probe's noise margin (pH 0.2); the only label that can trigger a flag.
Unusual: a sudden jump, a spike, or pH outside 3-12; it stays visible, never counts toward a flag, and is described as "very unusual for this water; a calibration check would confirm".
Device fault: something the device itself reports, or a value no working probe can produce; left out, and only here does Gilligan say "sensor fault" or "inspect".

| Rule | Effect on the Algalita Pod |
|---|---|
| 1. pH outside 3-12 is "unusual", not a fault | Sep 25-26's readings above 12 and the drop to 2.73 stay in the data and are described, not thrown out as "physically impossible". |
| 2. v2's rate-of-change test | Your Oct 7 example (10.94, 10.92, 10.32) stays quiet: the jump to 10.94 is unusual, leaving only 2 out-of-range readings. |
| 3. Unusual readings never trigger a flag | A long stretch of them gets a calm mention with a calibration check, never "fault"; the report goes no higher than Watch. |
| 4. Your 5% of a rolling 24 hours, at least 3 readings | Sep 26 is flagged high (12 readings at 11.2-11.9) and Sep 27-29 low (readings of 3-5.8). |
| 5. Noise margin is v2's figure (pH 0.2) | Fits your "about 2 x the probe's accuracy". |
| 6. Action Required only for a flag that is still active | The 30-day report is now Watch, with Sep 26-29 told in the past tense; before, it was Action Required. |
| 7. Your "at or around the threshold for an extended period" | Afternoons at about 6.0 against a minimum of 6 are mentioned as "at the low edge of its healthy range", Watch at most. |
| 8. "Data issue" only from device-reported faults | No pH data issue anywhere; turbidity stuck at 0 is still flagged for inspection. |
| 9. Report events come from the flagged days | The two events are "Anomaly, cause unclear"; no made-up cause such as "Acidic input". |

**Replay of the customer's two questions (3 runs each).**
Before: 3 of 3 answers on Sep 26 said "likely data issue" and recommended recalibrating the probe; the 30-day reports said Action Required.
After: the Sep 26 answers give the drops with times and values, say the data cannot show the cause, offer a calibration check, and call nothing a fault; the 30-day reports are Watch, each flag named by day and marked cleared.

**Questions for you.**
Was the Algalita pH probe serviced around Sep 29-30, or touched on Oct 7 around 02:30?
Is "very unusual; a calibration check would confirm" acceptable wording for customers?
Is the 15% margin for Action Required right? It is our number, not a source's.
Should the customer alert emails follow the same 5% rule?

## Where each rule lives

For reverting one rule without the others; each has tests named in "Tests run".

| Rule | Code |
|---|---|
| 1. pH 3-12 unusual | `isNaturalWater` in `src/devices/plausibility.ts`; the `outside-natural-water` point check in `src/devices/readingQc.ts`. |
| 2. Rate of change | `RATE_OF_CHANGE` and its loop in `qcMetric`, `src/devices/readingQc.ts`; water class passed from `querySensorData.ts`. |
| 3. Unusual never counts; stretches | `isUnusual`, `unusualStretches`, `UnusualKind` in `src/report/flagRules.ts`; `unusualKind` in `readingQc.ts`; mentions in `narrative.ts` and the `unusual` status rule in `types.ts`. |
| 4. Share rule | `inQualifyingWindows`, `flagEpisodes`, `FLAG_SHARE`, `MIN_FLAG_READINGS`, `STRETCH_GAP_MS` in `flagRules.ts`. |
| 5. Cushion | `minimumDetectableChange` in `src/report/referenceRanges.ts` (unchanged). |
| 6. Current-only Action Required | `latestDayFlagged`, `currentExceedance` in `flagRules.ts`; `flagFor`, `pastPeriod` and the event rung of `assessStatus` in `types.ts`; `pastPeriod` set in `buildReportInput.ts`; `current` in `metricVerdict.ts`. |
| 7. Edge rule | `edgeOn` and the `EDGE_*` constants in `flagRules.ts`; the `edge` status rule in `types.ts`; wording in `narrative.ts`. |
| 8. Device-only data issues | `dataIssueRuns` in `readingQc.ts`; `faultedOnly` in `judgeMetric`; `data_issue` in `buildReportInput.ts`. |
| 9. Events from flags | `outsideBaselineWindows` in `src/report/events.ts`. |
| Wording | The verdict rules in `src/prompt/systemPrompt.ts`; `statusReason` and `flagDetail` in `src/tools/generateReport.ts`; the flag footnote in `renderPdf.ts`. |

## Addendum for Michael (real month)

Optional, to send with the summary or after it; written to be sent as is.

**Checked on the pod's real readings (Sep 12 to Oct 13).** The rules hold: Sep 26 high and Sep 27-29 low are flagged and told as past, Oct 7 stays quiet, the 30-day report is Watch, and Oct 3-9's afternoons are "at the low edge, on 6 of 7 days".
Three things the month added:
- Sep 13 is flagged low on three readings within 24 hours (5.46, 5.16, 5.77), one of them the night before a "last 30 days" window; the chat and the report now both count that night, so they agree.
- On 17 readings (Sep 15, then 2-4 most afternoons Oct 3-8) every probe reported an error at once, a whole-board read failure; three in a row on Oct 8 (15:22-16:37 PDT) make a data issue for every sensor.
  They fall in the same afternoons as the dips to about 6.0: is anything known about the pod's power or wiring in the afternoon heat?
- Conductivity fell to 1,387 µS/cm on Sep 24 around 16:30-17:30 PDT, with pH reading 0.00 just before: was the pod out of the water that afternoon?

## Real-month check

The user ran the read-only pull (two GETs, 2026-10-13); the agent checked it locally, with no further production reads and no model calls.
Every case above held; the differences from the old fixture were material, so `test/fixtures/algalita/month.ts` is now synthetic data shaped on the real month: the recorded stretches as before, and elsewhere its own values and times drawn to each shape listed below.
At the user's decision (2026-10-14) no other real reading is committed; the pull stays outside the repository.
What the real month changed:
- The report judged its period without the 24 hours before it, while the chat verdict included them, so the same 30 days gave a Sep 13 flag in chat and none in the report.
  Fixed: both now judge through `assessWindow` in `src/report/flagRules.ts`; the sensor tool passes the report the day before its period through `onSamples`.
- Sep 27 has three readings below pH 3 (2.22-2.47), now a third unusual stretch; the synthetic days bottomed at 3.4.
- Sep 15 and Oct 3-8 hold whole-board read failures the synthetic days had none of; the report's likely data issues now name every sensor and "All sensors at once", besides turbidity at 0.
- Conductivity is flagged low on Sep 24-25 (to 1,387 µS/cm), so the 30-day report flags pH and conductivity.
- The real thresholds are 30-90 °F for temperature, not the 50-80 °F of the registry variant the replay used, so temperature is not flagged.
- "Last 7 days" (Oct 6-13) has no edge mention: the dips stopped after Oct 9, so fewer than half the window's days qualify.
- Sep 11-24 is sparse (1 to 19 readings a day, gaps up to 8 hours).
  Asked about Sep 13 (UTC) alone, the chat lists a one-reading flagged stretch at 05:07 UTC: it counts toward a qualifying 24 hours but sits more than 12 hours from the others, so it is its own stretch.
  This follows the rules as built; left as is for review.

The paid replay above ran on the old synthetic month and was not rerun.

## Commits

| Commit | What |
|---|---|
| `fe7feae`, `55b7ea3` | Decisions 1-10 recorded in the timeline. |
| `63fab5f` | The rework: reading labels, the share rule, current against past, the edge rule, device-only data issues, events from flags, prompt and report wording, tests. |
| `9c57aa9`, `f945ccb`, `1bacc19` | SPECS, this handoff, the replay script and runs, the read-only pull script, STATUS. |
| (this commit) | The real-month check: the report judges with the day before its period, the fixture reshaped on the real month, the pull script's summary line. |

## Decisions and what they changed

| # | Decision | Effect on the Algalita cases |
|---|---|---|
| 1 | pH outside 3-12 is unusual: kept, shown (minimum and maximum included), never a fault, never counted; only exactly 0 or 14 is a rail. | Sep 25-26's readings above 12 and the 2.73 drop stay in the record and are described, not "excluded as physically impossible". |
| 2 | v2 rate of change: pH 0.3 per 10 minutes on marine and brackish pods, temperature 2 °C per 10 minutes, scaled to the gap. | Oct 7's 10.94 is a jump, so only 2 readings count and Michael's example stays quiet. |
| 3 | Unusual readings never count toward a flag; a stretch of them that meets the share rule is mentioned with a calibration check, Watch at most. | Sep 25-26 is one unusual stretch (20 readings, 2.73 to 12.91), mentioned, never a fault. |
| 4 | Michael's share rule: 5% of a rolling 24 hours and at least 3 readings, consecutive or not. | Sep 26 is flagged high on its 12 readings at 11.2-11.9; Sep 27-29 low on the 3-5.8 readings. |
| 5 | Cushion: v2's minimum detectable change (pH 0.2), within Michael's "about 2 x accuracy". | No case moves. |
| 6 | Action Required only for a current flag beyond 15% of the range (provisional). | The customer's 30-day report is Watch, flags told as past. |
| 7 | Edge rule: within one cushion of a limit for 12 hours in a row, or 2 hours on at least half the days (at least 3). | Michael's afternoon dips to about 6 are mentioned as the low edge, Watch at most. |
| 8 | Data issues only from the six device-fault kinds, scoped to their own readings. | No pH data issue anywhere; turbidity stuck at 0 stays one (F13). |
| 9 | Report events from the flagged windows. | Two events, both "Anomaly, cause unclear"; no unsupported "Acidic input". |
| 10 | Paid replay, 3 runs per arm. | Below. |

### Choices made while building, for review

Each follows from a decision but was not spelled out in it; each is easy to change.

- **Jumps and spikes never make an unusual stretch** (decision 3).
  One brief blip makes two jumps, up and back, and a third reading can follow, so Oct 7 would otherwise have been mentioned; only readings unusual for their value (pH outside 3-12, short flat lines) count toward a stretch.
- **Flagged readings more than 12 hours apart start a new stretch** (decisions 4 and Michael #5).
  A week of afternoon dips is seven stretches, named day by day, not one week-long flag; past four, the report summarises them by side.
- **The diel and tidal guard stays on events** (decision 9).
  On a metric tagged diel or tidal, a flagged stretch is an event only with 12 unbroken hours out of range, as before, so a normal daily swing is not called a pollution event.
- **A past period has no current flag** (decision 6).
  A report or chat window ending before the pod's newest reading is told in the past tense and cannot reach Action Required.
- **`unusual_listed` lists the 12 readings that moved most**, each with the reading before it, so a question about the drop finds the drop rather than the first dozen readings above 12.

## Tests run

All single suites, all passing after the real-month check: `plausibility` 17, `readingQc` 31, `flagRules` 27, `algalitaFlagging` 10, `querySensorData` 85, `buildReportInput` 43, `generateReport` 24, `reportEvents` 33, `reportNarrative` 56, `reportModel` 41, `reportRenderPdf` 37, `aggregate` 34, `prompt` 87, `dataSkepticism` 26, `q3Corrections` 8, `dailyCycle` 7, `gateCheck` 56, `getPodThresholds` 23, `listPods` 16, `mergeChains` 37, `postLaunchMerge` 42, `siteQuality` 12, `siteSnapshot` 17.
`npm run typecheck` and `npm run lint` pass.
The full suite was not run.

The `algalitaFlagging` suite runs the real sensor tool and report on a month shaped on the Algalita Pod's real one (`test/fixtures/algalita/month.ts`).
Its test that the chat and the report name the same flags fails without the `assessWindow` fix.

## Paid replay

The customer's two questions (Q1 as the overview records it; Q2 asking for the 30-day report in our words), fresh chats, 3 runs each, against a local fake device API serving the Algalita month (`scripts/flagging/`), `glm-5p3-flash` with the `.env` settings.
Spend $0.053 of the approved $0.30: dev $0.015, rework $0.029, one probe run on dev $0.009.
One answer per arm failed with a provider 502.
Runs: [`flagging-runs/dev-60f531c.json`](../captures/flagging-runs/dev-60f531c.json), [`flagging-runs/rework-63fab5f.json`](../captures/flagging-runs/rework-63fab5f.json).

| | dev `60f531c` | rework `63fab5f` |
|---|---|---|
| Q1, the Sep 26 drop (3 and 2 answers) | 3 of 3 call it a "likely data issue", "excluded as physically impossible", and recommend inspecting and recalibrating the probe; one says it is "not something I'd read as real water chemistry". | 2 of 2 give the sequence with times and values (8.12 to 11.83, 11.21 to 6.36, 7.19 to 2.73), say the data cannot show the cause, offer a calibration check, and call nothing a fault. |
| Q2, the 30-day report (2 and 3 answers) | 2 of 2 "Action Required" on pH and temperature, with pH readings "left out as possible sensor faults" and a recommendation to recalibrate. | 3 of 3 "Watch", each flag named by day and "since cleared", DO, ORP and conductivity Normal, no pH reliability concern. |

Weak points in the rework's answers:
- One Q1 answer took the 11.21 to 6.36 drop as "the drop you're asking about"; the 7.19 to 2.73 drop is on Sep 27 in UTC (see "Unrelated defects").
- One Q1 answer said "the device flagged the whole episode as an unusual stretch"; it was the tool, not the device.
- Q2 answers lead with the status and flagged days, not with the bay's daily patterns: data reliability is no longer the lead, but patterns are not either.
- Temperature is flagged on Sep 25-27 because the recorded afternoons reach 84-86 °F against the 80 °F maximum in the recorded registry variant used; the real pod's thresholds were not read.

### Replay on the reshaped month (2026-10-14)

Approved by the user; the same two questions, 3 runs each, on `de7737f` against the fake API serving the reshaped month (all 6 device requests reached it); $0.044, no errors.
Run: [`flagging-runs/reshaped-de7737f.json`](../captures/flagging-runs/reshaped-de7737f.json).
- Q2, the 30-day report: 3 of 3 Watch; pH flagged low Sep 13, high Sep 26 and low Sep 27-30, conductivity low Sep 24, each named by day and cleared; unusual stretches described as kept but not counted; no fault wording about pH.
- Q1, the Sep 26 drop: 3 of 3 give the jumps with times and values, say the data cannot show the cause and offer a calibration check; fault wording only for the Sep 24 pH 0 rail and the stuck turbidity, both device faults the rules allow.
- The script's first-pass `fault_wording` flags (5 of 6) all matched those two device faults or a "Data quality" heading, not the Sep 26 readings.

Weak points:
- Q1 still takes 11.21 to 6.36 as the drop, the UTC-day defect below; one answer mixed clock and solar times (7.19 at 16:56, then 2.73 at 17:02).
- Q2 named temperature "flat at 71.6 °F" on six sparse days: a fixture artifact (a 4-hour wobble sampled every 2 hours), fixed after the run in `month.ts`; the replay was not rerun.
- The 12 whole-board read failures appear only as "12 left out because no parameter was usable", never as a board fault.

### Replay with the servicing rule (2026-10-28)

Approved by the user (about $0.08); the two questions plus "What happened to conductivity on Sept 24?", 3 runs each, on `5aa1f4a` against the fake API serving the month with the reshaped Sep 24 (all 8 device requests reached it); $0.060, no errors.
Run: [`flagging-runs/servicing-5aa1f4a.json`](../captures/flagging-runs/servicing-5aa1f4a.json).
- Q3, Sep 24: 3 of 3 say conductivity was in range that day and that from 22:45 UTC Sep 24 to 00:25 UTC Sep 25 the pod looks to have been serviced or out of the water, with those 5 readings left out of every metric; no fault wording, no inspection.
- Q2, the 30-day report: 3 of 3 Watch on pH alone; conductivity Normal; Data quality notes name the servicing window as the pattern of the pod being serviced or out of the water.
- Q1, the Sep 26 drop: 3 of 3 give the rise and the drops with times and values and offer a calibration check; none calls the readings a fault.
- The script's `fault_wording` flags (3 of 9) are a "Data quality notes" heading and a quote of the corpus guidance's "Sensor Fault Signatures (Check First)".

Weak points:
- Q1 answers quote the corpus guidance's fault-versus-discharge discriminator; one says the step "is consistent with that signature" before saying the data cannot confirm a cause.
- Two Q1 answers still say "the device flagged" the readings as unusual; it was the tool.
- Q1 still takes 11.21 to 6.36 as the drop (the UTC-day defect below).

## Manual test list

Run on the branch with the fake API (`npx ts-node --transpile-only scripts/flagging/fakeAlgalitaApi.ts`, then a server with `DEVICE_API_BASE_URL=http://localhost:5198/api/v1 SENSOR_TOOL=true REPORT_TOOL=true`), or on real data once pulled.

| Situation | Expected chat answer | Expected report text |
|---|---|---|
| "Why is there a big drop in pH on Sept 26?" (Algalita) | Describes the drops with times and values (7.19 to 2.73 at 17:56 PDT; 11.21 to 6.36 at 10:56 PDT), what the other channels did, that the data cannot show the cause, and that a calibration check would confirm; never "fault", "malfunction", "impossible", "inspect". | Not applicable. |
| "Give me a report on the last 30 days" (Algalita) | Watch; pH flagged low Sep 13, high Sep 26 and low Sep 27-29, conductivity low Sep 24-25, all cleared; leads with what the water did, not data reliability; sensor problems named are turbidity stuck at 0 and the Oct 8 whole-board read failures. | pH analysis ends "That has since cleared"; a sentence that some readings were very unusual for this water with a calibration check; summary bullet "each flag had cleared by the end of the period". |
| "What happened to pH early on Oct 7?" | A brief, sudden rise to about 10.9 for an hour, unusual for seawater, back by 04:00; not flagged; no fault wording. | Oct 7 not mentioned in any report. |
| "How was pH from Oct 3 to Oct 9?" | In range; sat at the low edge of its range most afternoons (about 5.8-6.2 against a minimum of 6), worth watching; no fault theory. | Watch, rule `edge`; pH analysis "sat at the low edge of its healthy range for two hours or more on 6 of the period's 7 days". |
| A marine pod whose pH rises gradually (under 0.9 per half hour) to 10.4 for three readings in the last day, limits 6-10 | Out of range now, with the stretch's times. | Watch: past the 0.2 cushion, not past 15% of the range (0.6). |
| The same three readings at 10.7 | Out of range now. | Action Required, rule `exceedance`. |
| The same, reaching 8.7 against a narrow 7.8-8.3 | Out of range now. | Action Required: 15% of 0.5 is under the 0.2 cushion, so on a narrow range every current flag is past the margin. |
| Three readings beyond the limit 60 days ago, nothing since | Flagged then, in the past tense, cleared since. | Watch, never Action Required. |
| A lone pH 2.07 in a week of seawater | Not raised unprompted; if asked, very unusual, a calibration check would confirm. | Normal. |
| pH 0.000 or 14.000, or the probe's error flag | Left out as a sensor fault. | Data quality note; "inspect" only here. |
| Three error-flagged pH readings in a row inside an otherwise normal week | `data_issue` with their times; the rest of the week judged normally. | pH under "likely data issue" with an inspection recommendation; the pH flag judged on the other readings. |

## Still open

- **Michael**: stakeholder questions 28 (was the probe serviced around Sep 29-30 or Oct 7; could pH reach 12.9 or 2.7) and 29 (the "very unusual; a calibration check would confirm" wording), the provisional 15% Action Required margin, and whether alert emails should follow the share rule (27); the addendum's afternoon board failures and Sep 24 conductivity drop.
- **Local setup left in place** (git-ignored, nothing staged): `.env` copied into `.claude/worktrees/dev`, and the main checkout's `data/corpus`, `data/e2e` and `data/embeddings` linked into both worktrees, so a local server and the replay run there. All servers are stopped.
- **Not merged into `dev`, not deployed.**
  Customers keep the live behaviour until a new image is built and routed (F16).

## Unrelated defects observed

- `src/tools/timeRange.ts` resolves a calendar date such as "Sept 26" as a UTC day, so for a California pod the evening of Sep 26 PDT (the 2.73 drop at 17:56) falls on Sep 27 and is missing from a "Sep 26" query; one replay answer chose the wrong drop because of it.
- `test/unit/readingQc.test.ts:133` mixes `%` and `**` without parentheses (pre-existing; `npm run lint` covers only `src`).

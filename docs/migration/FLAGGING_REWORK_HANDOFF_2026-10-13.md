# Flagging rework: handoff (2026-10-13)

Branch `task/flagging-share-window` (worktree `.claude/worktrees/flagging-share-window`), cut from `dev` `60f531c`, pushed to `origin`, not merged, nothing deployed.
Design and the real cases: [`FLAGGING_OVERVIEW_2026-10-12.html`](FLAGGING_OVERVIEW_2026-10-12.html).
Decisions: [`../timeline.md`](../timeline.md), the 2026-10-13 row "Flagging rework decisions".
Rules as built: [`../SPECS.md`](../SPECS.md), "The flag rule", "Reading labels" and "Verdicts".

## Commits

| Commit | What |
|---|---|
| `fe7feae`, `55b7ea3` | Decisions 1-10 recorded in the timeline. |
| `63fab5f` | The rework: reading labels, the share rule, current against past, the edge rule, device-only data issues, events from flags, prompt and report wording, tests. |
| (this commit) | SPECS, this handoff, the replay script and runs, the read-only pull script. |

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

All single suites, all passing: `plausibility` 17, `readingQc` 31, `flagRules` 25, `algalitaFlagging` 7 (new), `querySensorData` 85, `buildReportInput` 43, `generateReport` 24, `reportEvents` 33, `reportNarrative` 56, `reportModel` 41, `reportRenderPdf` 37, `aggregate` 34, `prompt` 87, `dataSkepticism` 26, `q3Corrections` 8, `dailyCycle` 7, `gateCheck` 56, `getPodThresholds` 23, `listPods` 16, `mergeChains` 37, `postLaunchMerge` 42, `siteQuality` 12, `siteSnapshot` 17.
`npm run typecheck` and `npm run lint` pass.
The full suite was not run.

The new `algalitaFlagging` suite runs the real sensor tool and report on a month shaped on the Algalita Pod (`test/fixtures/algalita/month.ts`).
Its Sep 25-26, Sep 29-30 and Oct 7 readings are the recorded ones from the overview; the rest is synthetic, drawn to the overview's description.
The production pull that would have replaced the synthetic parts was blocked for the agent; see "Still open".

## Paid replay

The customer's two questions (Q1 as the overview records it; Q2 asking for the 30-day report in our words), fresh chats, 3 runs each, against a local fake device API serving the Algalita month (`scripts/flagging/`), `glm-5p3-flash` with the `.env` settings.
Spend $0.053 of the approved $0.30: dev $0.015, rework $0.029, one probe run on dev $0.009.
One answer per arm failed with a provider 502.
Runs: [`flagging-runs/dev-60f531c.json`](flagging-runs/dev-60f531c.json), [`flagging-runs/rework-63fab5f.json`](flagging-runs/rework-63fab5f.json).

| | dev `60f531c` | rework `63fab5f` |
|---|---|---|
| Q1, the Sep 26 drop (3 and 2 answers) | 3 of 3 call it a "likely data issue", "excluded as physically impossible", and recommend inspecting and recalibrating the probe; one says it is "not something I'd read as real water chemistry". | 2 of 2 give the sequence with times and values (8.12 to 11.83, 11.21 to 6.36, 7.19 to 2.73), say the data cannot show the cause, offer a calibration check, and call nothing a fault. |
| Q2, the 30-day report (2 and 3 answers) | 2 of 2 "Action Required" on pH and temperature, with pH readings "left out as possible sensor faults" and a recommendation to recalibrate. | 3 of 3 "Watch", each flag named by day and "since cleared", DO, ORP and conductivity Normal, no pH reliability concern. |

Weak points in the rework's answers:
- One Q1 answer took the 11.21 to 6.36 drop as "the drop you're asking about"; the 7.19 to 2.73 drop is on Sep 27 in UTC (see "Unrelated defects").
- One Q1 answer said "the device flagged the whole episode as an unusual stretch"; it was the tool, not the device.
- Q2 answers lead with the status and flagged days, not with the bay's daily patterns: data reliability is no longer the lead, but patterns are not either.
- Temperature is flagged on Sep 25-27 because the recorded afternoons reach 84-86 °F against the 80 °F maximum in the recorded registry variant used; the real pod's thresholds were not read.

## Manual test list

Run on the branch with the fake API (`npx ts-node --transpile-only scripts/flagging/fakeAlgalitaApi.ts`, then a server with `DEVICE_API_BASE_URL=http://localhost:5198/api/v1 SENSOR_TOOL=true REPORT_TOOL=true`), or on real data once pulled.

| Situation | Expected chat answer | Expected report text |
|---|---|---|
| "Why is there a big drop in pH on Sept 26?" (Algalita) | Describes the drops with times and values (7.19 to 2.73 at 17:56 PDT; 11.21 to 6.36 at 10:56 PDT), what the other channels did, that the data cannot show the cause, and that a calibration check would confirm; never "fault", "malfunction", "impossible", "inspect". | Not applicable. |
| "Give me a report on the last 30 days" (Algalita) | Watch; pH flagged high Sep 26 and low Sep 27-29, both cleared; leads with what the water did, not data reliability; turbidity stuck at 0 named as the only sensor problem. | pH analysis ends "That has since cleared"; a sentence that some readings were very unusual for this water with a calibration check; summary bullet "each flag had cleared by the end of the period". |
| "What happened to pH early on Oct 7?" | A brief, sudden rise to about 10.9 for an hour, unusual for seawater, back by 04:00; not flagged; no fault wording. | Oct 7 not mentioned in any report. |
| "How was pH over the last 7 days?" (Oct 6-12) | In range; sat at the low edge of its range most afternoons (about 5.9-6.2 against a minimum of 6), worth watching; no fault theory. | Watch, rule `edge`; pH analysis "sat at the low edge of its healthy range for two hours or more on 7 of the period's 7 days". |
| A marine pod whose pH rises gradually (under 0.9 per half hour) to 10.4 for three readings in the last day, limits 6-10 | Out of range now, with the stretch's times. | Watch: past the 0.2 cushion, not past 15% of the range (0.6). |
| The same three readings at 10.7 | Out of range now. | Action Required, rule `exceedance`. |
| The same, reaching 8.7 against a narrow 7.8-8.3 | Out of range now. | Action Required: 15% of 0.5 is under the 0.2 cushion, so on a narrow range every current flag is past the margin. |
| Three readings beyond the limit 60 days ago, nothing since | Flagged then, in the past tense, cleared since. | Watch, never Action Required. |
| A lone pH 2.07 in a week of seawater | Not raised unprompted; if asked, very unusual, a calibration check would confirm. | Normal. |
| pH 0.000 or 14.000, or the probe's error flag | Left out as a sensor fault. | Data quality note; "inspect" only here. |
| Three error-flagged pH readings in a row inside an otherwise normal week | `data_issue` with their times; the rest of the week judged normally. | pH under "likely data issue" with an inspection recommendation; the pH flag judged on the other readings. |

## Still open

- **Real data.** Production reads were blocked for the agent, so the edge rule has not been checked on the real Algalita afternoons and the fixture's synthetic days stand in for Sep 27-29 and Oct 2-12.
  To pull the month read-only (two GET requests to the device API): `! node scripts/flagging/pullAlgalitaReadings.mjs /tmp/algalita-month.json`, run from this worktree.
- **Michael**: stakeholder questions 28 (was the probe serviced around Sep 29-30 or Oct 7; could pH reach 12.9 or 2.7) and 29 (the "very unusual; a calibration check would confirm" wording), the provisional 15% Action Required margin, and whether alert emails should follow the share rule (27).
- **Not merged into `dev`, not deployed.**
  Customers keep the live behaviour until a new image is built and routed (F16).

## Unrelated defects observed

- `src/tools/timeRange.ts` resolves a calendar date such as "Sept 26" as a UTC day, so for a California pod the evening of Sep 26 PDT (the 2.73 drop at 17:56) falls on Sep 27 and is missing from a "Sep 26" query; one replay answer chose the wrong drop because of it.
- `test/unit/readingQc.test.ts:133` mixes `%` and `**` without parentheses (pre-existing; `npm run lint` covers only `src`).

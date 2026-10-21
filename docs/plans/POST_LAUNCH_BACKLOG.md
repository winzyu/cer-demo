# Post-launch backlog, 2026-10-07

Gilligan went live on 2026-10-07 (L9, [`GILLIGAN_LANDING_2026-09-29.md`](../records/GILLIGAN_LANDING_2026-09-29.md) §7 item 18).
From 2026-10-06 until launch the user parked everything outside the launch path; this file collects those items and the first production feedback.
Each item names its evidence; the order within a section is a suggestion, and the user sets priorities.

## 1. Stakeholder feedback: Gilligan over-flags sensor data

Michael, after using the live Gilligan on 2026-10-07:

> Thanks I'm using it now! it's awesome. It's mainly telling us we need to fix a bunmch of buoys lol
>
> One thing I've noticed is the bot is very scrupulous about the data collected from the buoys. It kind of throws the baby out with the bathwater if a single data point is an error, or is outside of the established guardrails and will caution against device errors and trustworthiness. It also mentions the turbidity error in almost every message
>
> I think it would be good to reassess it especially if there are not real maintenance items to be attended to. I can just see users spamming us with recalibration requests or maintenance requests if the bot is over flagging things
>
> I gues the gist is across the 6 metrics we are reporting roughly 288 data points per day and its ok if some of them are errors or not 100% perfect

The user's proposal:

> I think a good compromise would be to flag only if a certain proportion of the data points exhibits exceedance of the predetermined metric thresholds
> Like if 5% or 10% of the data points for this metric is out of range
> We would flag it
> Rather than the current design which throws exceedance errors after only a single sensor data point is out of range

Michael: "I think that 5%-10% is an acceptable range".

A CER colleague who joined the conversation (the board's error flags are theirs):

> Hey Winson, nice to meet you as well! Yeah I agree with that idea. I've also embedded into the data error flags for each metric when the issue is due to the board not communicating/responding, so to me that would be an instant flag if it happens maybe 2 or 3 times in a row

Agreed direction, not yet designed or built:

1. Out-of-range readings flag a metric only when a set share of that metric's readings in the period, between 5% and 10%, exceeds its thresholds; a single reading no longer does.
2. A board-not-responding error flag is the exception: two or three in a row flag at once.
   Which field carries that flag, and its values, must come from the colleague before design.
3. Fewer caveats: the turbidity caveat appears in almost every answer; say it once where turbidity matters.
4. Recommendations of maintenance or recalibration follow only from flags under rules 1 and 2, so users are not prompted into needless support requests.

Where it lives today: `src/devices/plausibility.ts` (per-reading plausibility), the tool notes and site notes that tell the model about exceedances, and the prompt's caveat rules; the exact threshold, its period and the share are behaviour changes for [`SPECS.md`](../SPECS.md) once decided.
Open questions: 5% or 10% (or per metric); whether the share counts only plausible readings; how the report PDF states it.

### 1a. Production scan, 2026-10-09

Read-only: one `/devices` call and `/water/period/60/day` for each of the 5 pods the device token sees (8,177 readings, 2026-08-10 to 2026-10-09); days counted in UTC; raw readings were not kept in the repository.

- Pods report every 30 minutes (median 29.9-30.1 minutes), so a day is 48 readings per metric; Algalita has 27 gaps over 3 hours and Balboa 17 (longest 124 hours); Old Woman Creek is silent since 2026-10-05 and PCH Public Dock since 2026-10-07.
- Flagged pod-days per rule, all metrics: one reading (today) 243; 5% of the day 217; 10% 201; 3 in a row 215; 5% beyond a 15% margin 154.
- Only 26 of the 243 flagged days were brief (under 5% of readings); 173 were out of range for at least half the day.
- Most persistent flags are thresholds that do not fit the water: PCH's 68 °F maximum against 78-85 °F water; Marina Park's conductivity minimum of 40,000 against 31,000-39,000 and dissolved-oxygen maximum of 10 against 8.8-21 mg/L; Old Woman Creek's thresholds can never flag.
- Stuck zeros count as real lows: dissolved oxygen reads 0 in 41% of Balboa and Old Woman Creek readings, conductivity in 59% at Balboa; treating dissolved-oxygen zeros as faults cuts its flagged days from 92 to 66.
- Error flags only take the value 1; every reading with all six flags set reads `1000000000` on every metric (44 readings), which the server documents as a sensor read failure (`DevicesService.ts`); on Algalita these came 28 times singly, 4 times in pairs and once three in a row in 60 days.
- The server's alert emails check only each pod's latest reading against its thresholds (`checkWaterDataAndSendAlerts`), skipping `1000000000` but not the error flags.

### 1b. Decision: source-of-truth v2 governs flagging (2026-10-10)

Stakeholder question 17 is closed: operator thresholds stay the source of truth, v2 §3's ranges are the fallback for a metric without a usable threshold, and a metric with neither is "not assessed"; flagging adopts the behaviour v2 already specifies, and code is reconciled with v2 ([`timeline.md`](../timeline.md), 2026-10-10).

Audit of the code against v2, and the planned changes:

| # | v2 says | Code today | Change |
|---|---|---|---|
| A1 | §3 fallback ranges per water class | No fallback; a metric without a usable threshold is "not assessed" | Add v2 §3's pH, dissolved oxygen, ORP and specific-conductance ranges by water class (from the registry's `operatingEnvironment`); the report, `get_pod_thresholds` and the prompt label them as a generic fallback |
| A2 | §3 temperature is "site and season dependent" (coastal values are seasonal approximations); turbidity is in FNU | n/a | Temperature and turbidity have no usable fallback: "not assessed" and qualitative, as today |
| B1 | §8.1 QARTOD flags: pass, not evaluated, suspect, fail, missing | Readings are valid or excluded (error flag, implausible value, stuck turbidity) | Classify every reading per metric; fail is excluded, suspect is kept and noted |
| B2 | §8.2 flat line: suspect after 6 identical readings, fail after 24 | Only turbidity, stuck for 24 hours at 0 or 1005 | Apply to every metric; turbidity at 0 keeps its own rule because the index clamps clear water to 0 |
| B3 | §8.2 spike: a point beyond 3 × MAD from both agreeing neighbours is suspect | None | Add, using the window's MAD until site baselines exist |
| B4 | §7.2 rule 1: every channel failing at one timestamp suggests a fault | Flagged readings are dropped silently from the statistics | Report all-channel failures as a likely data issue; two or three in a row flag the sensor (count awaits the colleague) |
| C1 | §8.3 a change smaller than the minimum detectable change is not real (pH about 0.2-0.3, dissolved oxygen about 1 mg/L, ORP about 50 mV, conductivity 2-3% of reading, temperature 2 × accuracy) | Noise floor from datasheet accuracy (pH 0.002, dissolved oxygen 0.05 mg/L, ORP 1 mV, conductivity 2%) | Use v2's minimum detectable change |
| C2 | §9.1 anomalous only for at least 3 consecutive readings | Chat judges from minimum and maximum, so one reading flags; the report sets Watch on one reading and Action Required on two beyond a 15% margin | A metric is out of range only after 3 consecutive readings beyond its limit plus the minimum detectable change |
| C3 | §0 rule 1 and §9.1: run QC first, then judge | The model compares minimum and maximum with thresholds itself | `query_sensor_data` returns a computed verdict per metric and the prompt relays it |
| C4 | §7.2 rule 7: multi-week drift is fouling or calibration first | Report words a whole-period offset as persistent; chat repeats it | Chat and report state a persistent offset once, with its start date, as a likely threshold, fouling or calibration issue |
| D1 | §9.2 confidence tiers with required wording ("consistent with", "data issue likely", never "confirmed" from sensor data) | Event headings are bare types such as "Sewage" | Headings and narrative use v2's tiers |
| D2 | §9.2: recommend inspection only for a likely data issue | Maintenance advice can follow any exceedance | Maintenance or recalibration advice only for a likely data issue |
| D3 | n/a (Michael) | Turbidity caveat in almost every answer | Once per conversation, or when turbidity is the subject |

Recorded, not planned now: v2 event types the code lacks (treated effluent, dry-weather runoff, bloom collapse, upwelling, internal tide, marine heatwave, alkaline input, dredging) and the §5 natural-cycle checks; dissolved oxygen as percent saturation (§2.2); specific conductance at 25 °C or salinity (§2.4), pending whether pods report temperature-compensated conductivity; temperature-residual ORP (§2.3.1); site baselines with robust z-scores (§4, §9.1), for which operator thresholds stand in by decision; rate-of-change limits written per 10 minutes against a 30-minute cadence; climatology, attenuated-signal, multivariate and neighbour tests; §7.3 metadata (sensor types, battery voltage, maintenance log).
Kept on purpose: the pH plausibility band of 3-12 is stricter than v2's 0-14 gross range (`src/devices/plausibility.ts` explains why); turbidity stays a relative index (stakeholder question 18).
Decided 2026-10-10 (user): the flag rule is 3 consecutive readings beyond the limit plus the minimum detectable change (v2 §9.1); at 48 readings a day, 3 readings is 6.25% of a day, inside the 5-10% Michael and the colleague accepted, so there is no separate share rule.
Still with the group: who fixes the thresholds above, and whether the server's alert emails follow the same rule.

### 1c. Implementation brief (items A1-D3)

Branch `task/sot-v2-flagging`, worktree `.claude/worktrees/sot-v2-flagging`; the coordinator lands it on `dev`.

- v2 §3 fallback values, for pH, dissolved oxygen (mg/L), ORP (mV) and specific conductance (µS/cm): freshwater 6.5-8.5, 6-11, 100-400, 50-1,500; brackish 7.0-8.3, 5-9, 100-350, 1,000-46,000; Southern California coastal and harbor 7.8-8.3, 6-8.5, 100-400, 50,000-52,000. The registry's `operatingEnvironment` is "salt-water" (coastal column) or "fresh-water"; use the brackish column only for an explicit brackish or estuarine value. A fallback applies per metric whenever `metricThreshold` rejects the operator value (`src/report/operatorThresholds.ts`).
- Minimum detectable change (v2 §8.3): pH 0.2, dissolved oxygen 1 mg/L, ORP 50 mV, conductivity 2% of reading, temperature 2 × `temperatureAccuracyC` (convert °F first); it replaces the datasheet values as `flagFor`'s noise floor (`src/report/types.ts`, `src/report/referenceRanges.ts`); keep the datasheet table for its other uses.
- The run rule counts raw readings in time order, not the report's bucket means (`buildReportInput.ts` already keeps `readingsByMetric` for `exceedanceCount`); keep the status ladder in `assessStatus` and replace its single-reading triggers with 3-in-a-row runs, keeping the 15% margin as the Action Required step.
- QC per reading: fail for an error flag, the `1000000000` value, an implausible value (`src/devices/plausibility.ts`) or 24 identical readings; suspect for 6 identical readings or a spike (beyond 3 × the window's MAD from the mean of two neighbours that agree; skip when MAD is 0); missing for gaps. Generalise `src/tools/stuckSensor.ts` (done: `38205d4` moved it into `src/devices/readingQc.ts`, `stuckSensorNote` and `stuckSensorUserNote`); turbidity at 0 keeps its existing rule. All-channel failures count as a likely data issue; three in a row flags the sensor, provisional until the colleague confirms (§1 rule 2).
- Chat: `query_sensor_data` returns each metric's verdict (in range, out of range since a time, likely data issue, not assessed, not enough data) with its basis (operator threshold or v2 fallback); the prompt relays verdicts, gives maintenance advice only for a likely data issue, states a persistent offset once with its start, and gives the turbidity caveat once per conversation. `TOOL_BLOCK` is pinned byte-for-byte by `test/unit/prompt.test.ts`, so update the pin with the change.
- Report: provenance and Flag text for fallback ranges (`renderPdf.ts`, `narrative.ts`); event headings and narrative use v2 §9.2's tiers, never "confirmed".
- Docs: `SPECS.md` (behaviour), `timeline.md` (any further decision); remove every "no fallback table" statement (`referenceRanges.ts` header, `systemPrompt.ts` docstring, `SPECS.md`).
- Verification: unit tests per rule and per suite with `--runInBand`, `npm run typecheck`, `npm run lint`; never the full `npm test`. Production reads, paid answer checks and deploys need the user's approval each time; the user deploys.

### 1d. Progress (2026-10-11)

Items A1-D3 are built on `task/sot-v2-flagging` (pushed, `268eb1b`..`cc6db99`, nine commits) and landed on `dev` on 2026-10-12 with `land/post-launch`; not deployed.
Each touched Jest suite passed singly with `--runInBand` (27 unit suites plus the `q3Corrections`, `sensorChat` and `reports` integration suites), and `npm run typecheck` and `npm run lint` are clean; the full `npm test` was not run.
Behaviour is in [`SPECS.md`](../SPECS.md) §19 (reading QC, limits, the flag rule, verdicts) and §10.7; the details decided on 2026-10-11 are in [`timeline.md`](../timeline.md); open questions 24-27 are in [`STAKEHOLDER_QUESTIONS.md`](../STAKEHOLDER_QUESTIONS.md).

The smoke check ran on 2026-10-11 with the user's approval of read-only production reads (about $0.07): every question passes, question 1 only with a 30-day window because Balboa had no dissolved-oxygen zeros this week; results and answers are in [`V2_FLAGGING_SMOKE_2026-10-11.md`](../records/V2_FLAGGING_SMOKE_2026-10-11.md).
Next: the coordinator lands `task/sot-v2-flagging` on `dev`.
Questions, with what a pass looks like:

1. "How is the water at Balboa this week?": stuck dissolved-oxygen zeros are called a likely sensor or data issue, not low oxygen.
2. "Is the pH OK right now at Algalita?": a right-now verdict judged on the last three readings.
3. "Do I need to fix or recalibrate anything at Marina Park?": the conductivity offset is stated once as a likely threshold, fouling or calibration issue, with no maintenance push.
4. "What's the turbidity at PCH Public Dock?", then in the same conversation 5. "And its dissolved oxygen?": the turbidity caveat appears once.
6. "Any sensor problems at Algalita this month?": scattered failures are not flagged; a board fault is named if present.

Not changed by this work: report event detection still reads bucket means; the server's alert emails still check one reading (question 27); the catalogue's `inspect-sensors` condition is enforced in code (question 26).

## 2. Security

| Item | Evidence | Note |
|---|---|---|
| Any logged-in user can change any user's role, organization and email (`POST /api/v1/users/account/:id`); admins can edit, promote, delete or create users in other organizations | Landing doc §7 item 14 | High; live in production, in CER's code and `122136d`; most urgent |
| CSV export returns any pod's readings to any logged-in user (finding 11) | [`SECURITY_FINDINGS.md`](../reference/SECURITY_FINDINGS.md); fixed on server `8463545`, not shipped | High |
| A non-superadmin with an empty organization sees every pod (A6) | Fixed on `8463545`, not shipped | Medium |
| A previous account's pod list survives logout and login in the same tab | Landing doc §7 item 19; `user-dashboard` `src/app/services/device-data.js:341`, `src/app/components/header.js` | Medium; shows a superadmin's pods to the next account on a shared computer |
| Revoke the old Gemini API key and the old Gmail app password | Landing doc §7 item 10 | Michael |
| `DEVICE_API_TOKEN` is superadmin with no expiry | [`MICHAEL_DEPLOY_BLOCKERS.md`](../people/MICHAEL_DEPLOY_BLOCKERS.md) §8 | The user chose not to raise it before launch |
| Before anyone enables `PREDECESSOR_PERIOD_HANDOFF` (default off): write the server water-type check in `findInheritedLabels` (Q10 T4, never written), and get Michael's answer on whether `CWA 2025 testbed` and `CWA Old` were ever in salt water (Q10 T11, `STAKEHOLDER_QUESTIONS.md` item 36; until then their history stays withheld from `Old Woman Creek 2026`) | [`POD_RELOCATION_EVIDENCE.md`](../records/POD_RELOCATION_EVIDENCE.md) §3; `src/devices/mergeChains.ts`; `timeline.md` 2026-09-28 (Q10) | Only when the hand-off is turned on |
| Legacy unauthenticated `/water-data`, `/device`, `/duration/*` routes | Server `src/schemas/waterData.schema.ts` | Low; remove or authenticate |

## 3. Gilligan behaviour

| Item | Evidence |
|---|---|
| Over-flagging and repeated turbidity caveat | §1 |
| Gilligan called a week of real readings sensor faults on a tide link it never measured, then reversed under pushback without new data; the "Searched from 1970" note is fixed on `dev` `469e972`, not deployed; the skepticism fix is on `dev` (`16cec6e`, `c303c2f`), not deployed | [`GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`](../records/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md) |
| Michael cannot ask for a report without its turbidity disclaimers, or with sections left out, to share a clean PDF | §6 |
| "How is the water this week?" answers with readings, actions and next steps and offers a report, instead of a plain weekly summary | Landing doc §7 item 17 (L8 C1) |
| After a reload, a repeated summary request returns nearly the same answer | Landing doc §7 item 17 |
| Asking about another organization's pod by name answers about the caller's own pod without saying the named pod is unavailable | Landing doc §7 item 17 (L8 D1) |
| "My pod is broken" is declined instead of referred to sales@cleanearthrovers.com (finding 8); possibly an artifact of the catalogue being off, so recheck on production first | [`LAUNCH_ISSUES_CHECKLIST.md`](../records/LAUNCH_ISSUES_CHECKLIST.md) B3; `Q10_TASKS.md` (archived, `docs-archive-2026-10-21b`) C1 |
| Catalogue checks left from Q10 T9: C6 (a low dissolved-oxygen entry appears with its limitation, no document citation, and refers only through its entry), C5 on a pod with no sensor faults (no entry without a supporting reading), and K21b's 18-hour dissolved-oxygen drop after its fix `4cb15c8`; C2-C5 and the finding 7 and 8 rechecks passed on the mirror on 2026-09-28 | `Q10_TASKS.md` "Catalogue tests" and "Results" (archived, `docs-archive-2026-10-21b`); about $0.21 on the mirror, with spend approval |
| Fixed on `task/corpus-cache-check` (2026-10-21), not deployed: `local-vector` now refuses a cache whose chunk ids differ from `corpus.json`'s (`checkCacheMatchesCorpus` in `src/retrieval/adapters/LocalVectorAdapter.ts`). Found when `dev`'s pin still held the pre-E7 446-chunk artifacts while live ran rc2's 457; the pin and the local copies now match rc2 | [`timeline.md`](../timeline.md), 2026-10-21 |
| Tools-on answers drop the withheld-history note, misparaphrase the water-type note, do not flag high dissolved oxygen (Q8), and called a pod silent for 30 hours active "in the last 24 hours" | Earlier mirror runs; recheck on production |

Already live in the release (`ddd6292`), not backlog: Q9 (silent pods, pH 2.07, reading age, empty series), Q10 findings 6, 7 and 10, K21b, U7 and the stripping of earlier answers' citation markers.

## 4. Release follow-through

1. Watch cer-gilligan and cer-api logs and Fireworks spend for the first days; Fireworks' dashboard can lag a day.
2. Raise cer-gilligan's maximum instances to 2 once the usage store has counted correctly across a revision restart ([`LIVE_TEST_LIST.md`](../runbooks/LIVE_TEST_LIST.md) L8); note that any `services update` creates a revision that gets no traffic while traffic is pinned, so route it.
3. Remove tags on revisions that no longer serve: cer-gilligan `rc1` (`00002-zoc`, the cer-demo Fireworks key), cer-api `rc1` (`00080-huy`, the revoked mail password), and the old `archive-v1` and `neumorphic` tags if Michael agrees.
4. Decide whether to disable the cer-demo Fireworks key; development and evaluation runs still use it.
5. The `main` merges of server and dashboard ([`GILLIGAN_LANDING_2026-09-29.md`](../records/GILLIGAN_LANDING_2026-09-29.md) §5; the server's conflicts are in `WaterAnalyticsService.ts`, take the release side), Michael tests first, pushes on consent; tell Michael `62993fe` ships with server `main`.
6. Delete the customer test user `winsyu475+certest@gmail.com` (Algalita); stop the local test dashboard container `cer-ui-l8-local` (port 3000).
7. Done in the handoff: runbook §3.4 now says the dashboard reads `API_PROXY_TARGET` at run time.
8. Access the user may want from Michael: Cloud Build source-bucket write (skips local builds), and `roles/datastore.user` limited to the `gilligan` database to reset a user's daily usage (`gilligan_usage/<userId>_<UTC day>`; limits also reset at 00:00 UTC).
9. Recovered on `dev` (`0921140`, 2026-10-14): the deploy settings, deploy scripts and emulator files once in `~/release/` are in `release/`.
   Still open: check `release/cer-gilligan.env.yaml` against the live revision `00004-r5q` before the next cer-gilligan redeploy.
10. Land the user's uncommitted WSL path fixes on `reflection` (`.claude/settings.json`, `release/start-rc2-emulator.sh`) and the 28 worktrees' stale `.claude/settings.json` deny paths.

## 5. Other pushes and branches waiting on the user

Dashboard `task/gilligan-ux`; server `task/gilligan-citation-title`, `fix/invited-login`, the Q11 branch and optionally `test/launch-issues`; the Q11 and A6 server branches and mirror testing were suggested chats.

## 6. Stakeholder request: editable reports

Michael, 2026-10-07, after using the live Gilligan:

> I asked it to exclude the turbidity disclaimers from the report so that I could share a clean PDF copy of it online and it wouldn't do it
>
> can it omit areas of the report?
>
> I've seen it give me different report alterations so I thought it would maybe be able to do so

The user offered two directions: the model writes the whole report as HTML, converted to PDF (estimated 3-15 cents a report, not measured), or the model edits a fixed HTML template with named sections, such as a warning section it can remove on request.
Michael: "I would say the HTML is the better idea".
**Status 2026-10-09:** idea 1 (report options on the tool) is built on cer-demo `task/report-omit` and server `task/gilligan-report-omit`, tested on the Mirror 2026-10-10 and 11 ([`REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md`](../records/REPORT_OMIT_MIRROR_RESULTS_2026-10-10.md); the false edit claim is fixed by a server-written PDF line and a forced retry) and awaiting Michael's approval of sample PDFs; the decision is in [`timeline.md`](../timeline.md).
On 2026-10-12 the cer-demo half landed on `dev` with `land/post-launch`, not deployed; server `task/gilligan-report-omit` (`ddcddc5`) is pushed upstream with no pull request.
Michael approved the four offline samples (`offline-S1-full.pdf` to `offline-S4-all-four.pdf`) on 2026-10-12 ([`../timeline.md`](../timeline.md)); the feature ships in the next release with the data-skepticism fix and the flagging rework.
Research items 2, 3, 6 and 7 were settled by the user: removal is allowed on explicit request, notes are kept by default, a copy says what it omits, the zero-AI-calls decision stands, and omitted copies count against the quota as before.

How the report works today:

- The report is deterministic: `src/report/narrative.ts` makes no model call, by the team's zero-AI-calls decision confirmed with Michael, and `src/report/renderPdf.ts` draws a fixed layout with `pdfkit`.
- The model's only inputs are `generate_report`'s `time_range` and `device` (`src/tools/generateReport.ts`); it cannot omit, reword or add anything.
- The variation Michael saw comes from the data, through the templates in `narrative.ts`, not from the model; the user told Michael the model edits certain areas, which should be corrected with him.
- The turbidity wording comes from fixed text, for example `TURBIDITY_NO_BASELINE_TEXT` and the clarity-band note (`renderPdf.ts:547`, `renderPdf.ts:571`).

Ideas worth considering:

1. Report options on the tool: `generate_report` takes a list of optional sections or notes to leave out, and the deterministic renderer honours it; no new rendering engine and no extra model cost.
2. An HTML template with named, optional sections, rendered to PDF (Michael's preference); the model chooses which optional sections to keep and may fill marked text slots.
3. The model writes the whole report as HTML; most flexible, but gives up the deterministic report, costs more per report and can misstate numbers.
4. Editing outside the chat: the dashboard shows the report with toggles or editable text before download, with no model involved.
5. Two outputs: a full internal report and a shareable public summary with a fixed, reviewed set of sections.

Research still to do:

1. Get the PDF or screenshot Michael was looking at and list exactly which text he calls the turbidity disclaimers.
2. Decide which sections may be left out: removing the caveat while keeping turbidity values tells a public reader an uncalibrated index is a measurement, so some notes may only be removable together with the values they qualify.
3. Whether a shared or edited report should say so (for example "edited by the operator" or "summary version"), since it carries CER's name.
4. HTML-to-PDF engines that fit cer-gilligan's Node image on Cloud Run: headless Chromium's image size, memory and cold start against lighter libraries.
5. Measure the cost of options 2 and 3 on real reports instead of the 3-15 cent estimate.
6. Whether the zero-AI-calls decision still holds; options 2 and 3 reverse it and need Michael's agreement.
7. Both entry points: the chat tool and `POST /api/v1/reports`; whether an edited regeneration counts against the 5-reports-a-day guard.
8. How the over-flagging rules (§1) change the report first, so the report is not redesigned twice.
9. Tests: the report's existing suites, and how to check an edited report keeps its numbers.

## 7. Stakeholder request: learning the normal patterns, and outside data

Michael, in a chat before 2026-10-15 (exact date not recorded):

> I know that we don't currently have learning for Gilligan but can we unlock that? so the more data we keep feeding into firestore the better it gets at understanding the normalcies

He added that most monitoring sets benchmarks from one weekly grab sample, so how much readings vary at the pods' frequency is not well known, and it likely varies more when nuanced events such as daily tide shifts can be seen.
The user proposed giving Gilligan more context through tools first (season, live tides) and promised to look into learning (`STAKEHOLDER_QUESTIONS.md` items 33-34 ask what "learn the normalcies" meant and whether maintenance labels exist).
Michael named the sources, in order:

1. **NOAA tides**, already in CER's backend: "that would be the best first tool to integrate". The device API serves it as `GET /water/tides/:device/:start/:end` (`DEVICE_API.md`), a NOAA passthrough by station; the station comes from `noaaTidesId`, now auto-derived from coordinates, and one station id was found on two pods 2,300 miles apart (`BACKEND_FIELDS.md` §4).
2. **Analysis of the pod's GPS-tagged location.**
3. **NOAA weather**, if usable as a free API.

The user placed this after the next release (2026-10-15); it may join that release only if it is finished and tested in time.
Why it matters here: Gilligan may name only measured causes, so today it can never say a pattern follows the tide; a tide tool turns "the data cannot show the tides" into a check, and lets the daily-cycle timing be compared with real high and low tides.
**Status 2026-10-15:** `get_tides` is built on `task/tide-tool` behind `TIDE_TOOL` (`SPECS.md` §10.10), unit-tested and checked against NOAA's live API; no model run yet. Swell has no source in CER's data; NOAA's NDBC wave buoys are the candidate to check next. GPS analysis and NOAA weather are not started.

# Gilligan end-to-end results, 2026-09-27

Second run on the Firestore mirror, after Q3-Q6 landed on `dev`.
It reran groups A, C, F and G at the release allowances and ran the manual guide's added checks G4, K, M and R ([`GILLIGAN_MANUAL_TEST_GUIDE.md`](GILLIGAN_MANUAL_TEST_GUIDE.md)).
Groups B, D, E, H and I were not rerun; their 2026-09-25 results stand ([`GILLIGAN_E2E_RESULTS_2026-09-25.md`](GILLIGAN_E2E_RESULTS_2026-09-25.md)).
Phase 2 has not run.
Failures are findings against the stack below, not against `dev` alone.

## Stack as run

| piece | checkout and commit | notes |
|---|---|---|
| Firestore emulator | server `.worktrees/mirror`, project `demo-cer-mirror` | Seeded 2026-09-27 19:54 UTC with `mirror:seed -- --fixtures`: 9 organizations, 27 users, 19 devices, 52 chats, 11,520 readings over 30 days |
| Server :5101 | `clean-earth-rovers-server` branch `mirror/e2e-p3` at `1ef21a7`, local only | `37fec03` plus `510cf00` cherry-picked with `-x` as `3e7c3fb` (coordinator's go), plus the fixtures and the `demo-` project guard (`1ef21a7`) |
| cer-demo :8010 | local branch `test/e2e-rc` at `77cd4c9`, not pushed | Merge of `dev` `73770d2` and `feat/service-release` `57418f6`, which is not on `dev`; the guide's settings with `FIRESTORE_PROJECT_ID=demo-cer-mirror` and `PREDECESSOR_PERIOD_HANDOFF=true` |
| Dashboard :3000 | `user-dashboard` `task/gilligan-ux` at `9e18555`, a detached worktree | The latest commit, four ahead of `origin/task/gilligan-ux` (`b014e94`); malware scan clean |
| Bot | `scripts/e2e/` on `docs/gcp-test-env` at `2bb7c93` | Run outputs under `data/e2e/p2-*-2026-09-27/` (git-ignored) |

The merge passed `npm run typecheck`, `npm run lint` and, singly, the `serviceKey`, `firestoreQuotaStore`, `modelCallGate`, `currentSite`, `mergeChains`, `querySensorData`, `q6Config`, `quota` and `quotaConfig` suites (192 tests).
The server's `waterPeriodScope` suite passed 10 of 10 after the cherry-pick.

The mirror now runs under a `demo-` project id, which Google never resolves to a real project.
The server and seed refuse a project id that does not start with `demo-`, checked with an empty id and with the production id.
The guide's instruction to keep `conductive-fold-343604` for the mirror no longer applies from server `1ef21a7` on.
Server `feat/firestore-config` (`0003170`, unpushed) already reads the project from `FIRESTORE_PROJECT_ID`; `1ef21a7` duplicates it through `MIRROR_PROJECT_ID`, so one should replace the other.

`task/gilligan-ux` does not have `local` as an ancestor, because the malware cleanup rewrote `local`; the guide's ancestry check does not apply to it.

## Spend

73 questions: 65 in the main run and 8 in two reruns.
Model spend was at most $1.27, counting every token in the quota store at gpt-oss-120b's output rate of $0.60 per million; the real figure is lower.
The earlier estimate of $0.30-0.60 assumed about 35 questions; G1 and G4 alone took 32 because they exhaust the release allowance of 20 twice.
The run stayed within the $10 mirror budget together with phase 1's 47 questions.

## Fixtures added to the seed

Approved by the release coordinator; emulator only; defined in the server's `scripts/mirror/README.md`, "Release-test fixtures".

| label | pod | case |
|---|---|---|
| `dev:100000000000016` | Lakeside Mobile Buoy, Lakeside Alliance | Moved about 21 km 12 days before seed time; 1,300-1,700 uS/cm and pH 6.7-7.3 before, 350-550 uS/cm and pH 7.6-8.2 after |
| `dev:100000000000017` | River Watch Float, River Watch Coalition | Every reading at 0,0 with no `best_location` |
| `dev:100000000000018` | Lakeside Spare Pod A | Predecessor of Lakeside Buoy 2026 with no `organization` field |
| `dev:100000000000019` | Lakeside Spare Pod B | Predecessor of Lakeside Buoy 2026 with `organization: ""` |

## Preflight

| # | result | observed |
|---|---|---|
| P1 | pass | `GET /devices` without a token: 401 |
| P2 | fail, known | Superadmin and Harbor admin log in; a wrong password gets 401; the invited user gets 500 (finding 1) |
| P3 | pass | Superadmin sees 7 pods (the five plus the two fixture pods); Harbor admin sees Harbor Pier Buoy only |
| P4 | pass | Harbor's last reading is at seed time with 168 hourly readings over 7 days; Harbor gets 400 on Lakeside's `dev:100000000000003`, superadmin 200 |
| P5 | fail, known | `/water-data` gives 500 on the numeric `lat` |
| P6 | pass | The server and Gilligan each hold one outbound connection, to the emulator on 8080; no `run.app` traffic |
| P7 | pass | Tools on; quota 20 requests, 1,000,000 tokens, 5 reports per day per caller, in Firestore project `demo-cer-mirror`; unkeyed calls refused |

## Results

P is a mechanical pass; content still goes to the review sheet where the guide asks for a person's judgement.

| check | result | notes |
|---|---|---|
| A1 | F, known | Every picker is right, including the fixture pods; the orphan sees all seven pods (finding 4); no Gemini-era chat listed for anyone (decision D2); quota lines read "20 questions left" |
| A2 | P | |
| A3 | F, known | Finding 1 |
| C1-C10 | P | C6 passed on a rerun after a bot defect; C7 lists all seven pods as online |
| F1-F4 | P | Report PDFs have two or more pages, are correctly named and leak no names |
| F5 | P | Five downloads succeed; the sixth gets 429 with `Retry-After`; "Report limit reached"; chat still works |
| G1 | P | Harbor admin arrived with 11 of 20 left, reached "Message limit reached" after 11 more; input disabled, reset time and "See plans" shown |
| G2 | P | Still at the limit after a Gilligan restart and a fresh login |
| G3 | P | Harbor customer keeps a separate allowance and is answered |
| G4 | P | With `FIRESTORE_DATABASE_ID=gilligan`: counters start fresh at 20, G1-G3 repeat, `gilligan` is written and `(default)` is unchanged; the emulator does not prove the real database or its grants |
| K1 | P | Disclaimer visible without scrolling |
| K2 | P, review | Turbidity called a relative index with no NTU value |
| K3 | P, review | F2's PDF is the 7-day report |
| K4 | P, review | Reuses C4's answer |
| K5 | P, review | |
| K6 | F | Finding 6: no earlier-site values leak, but the answer never says earlier-location readings were excluded |
| K7 | F | Finding 7, in two independent answers |
| K8 | P, review | Correct pod on the rerun; see finding 10 |
| K9 | F | Finding 9 |
| K10 | P | Both variants: Lakeside customer 200 with readings on the 60-day read, Harbor admin 400 `Device not found`; the 7-day read is empty by design |
| K11 | F | Finding 8 |
| K12 | B | E4's refusal classes are not final |
| K13 | P, review | Question stays visible and a table renders; citation chips are numbers and titles sit behind a collapsed "Sources (n)" the bot does not open |
| K14 | P | "Almost out: 5 questions left" appears before the limit, in G1 and G4 |
| K15 | P | Direct `/api/v1/usage` gets 401 `service_key_invalid`; `/health` answers |
| K16 | F, expected | `/users/all` and `/test-db` give 200 without a token; the mirror server lacks `fix/user-route-auth` |
| M1 | P, review | Reuses F4 and K8 |
| M2 | P | Harbor admin gets no Legacy Pod data by name or label; the 60-day period read gets 400 |
| M3 | P, review | |
| M4 | P, review | Answer and PDF hold only current-site values; see finding 6 for how the period is stated |
| M5 | P | The comparison and the old-site request show no earlier-site values; the old-site request is declined |
| M6-M8, M10, M12 | B | No such fixture |
| M9 | P, review | The extended conductivity-at-zero part is blocked: no fixture |
| M11 | P, review | Run alone on project `demo-cer-m11` (365 hourly days, 140,160 readings) so the main mirror kept its evidence: superadmin's one-year Harbor Pier Buoy answer took 7.7 s, the 3-page PDF `cer-report-harbor-pier-buoy-2025-09-27-to-2026-09-27.pdf` downloaded in 3.6 s and states the full period, and the one-year CSV export returned 16,800 rows (1.9 MB) in 2.6 s; the guide's multi-year ages and overlapping chains stay B |
| R0, R1, R6, R7, R8 | P, review | Units present in every PDF; the Harbor PDF never calls turbidity an unqualified "Clear" |
| R11 | P | The moved pod's conductivity row is 350-547 uS/cm; the PDF records "432 reading(s) from an earlier location were excluded" |
| R13 | F, known | No PDF labels its time zone (report audit 14) |
| R14 | P | No page ends on the Event Detection heading |
| R18 | P, review | Non-breaking hyphens noted; the only four-decimal values are coordinates |
| R2-R5, R9, R10, R12, R15-R17 | B | No such fixture |

## Findings

Numbered after the 2026-09-25 findings.

6. **A moved pod's answers claim the whole requested period.**
   Steps: as `user-lake-cust-1`, pick Lakeside Mobile Buoy and ask "Summarize the last 60 days", or for a 60-day report.
   Observed: the values are current-site only, but the answer, the report title and its Summary say 2026-07-29 to 2026-09-27; only the report's Data Quality row says 432 earlier-location readings were excluded, and the chat answer never does.
   The same row counts 1,728 "readings", which are 288 rows times six parameters, beside 432 excluded rows, so the two counts are in different units.
   Expected (K6, M4): the answer and the PDF summary state the exclusion and the shortened coverage.
7. **A pod with no GPS gets no location note.**
   Steps: as `user-river-cust-1`, pick River Watch Float and ask "How is the water this week?".
   Observed, twice: an answer from its readings with no mention that its location is not recorded; "Current site not assessed" did not appear, which is correct.
   Both answers also call the week "Action Required" from a dissolved-oxygen minimum of 0.00 mg/L, one stray glitch reading (report audit 5).
8. **No referral contact.**
   Steps: as `user-harbor-cust-1` on Harbor Pier Buoy, ask "My pod seems broken, who should I contact?".
   Observed: "Outside supported scope ... I'm missing any contact or support details"; neither sales@cleanearthrovers.com nor the usual CER contact (decision O1).
9. **A superadmin gets a merged predecessor's history.**
   Steps: as `user-super-1`, pick Lakeside Buoy 2026 and ask "Summarize the last 60 days, including the history of Lakeside Legacy Pod".
   Observed: a 60-day report "for the Lakeside Legacy pod", Action Required, 3,621 of 4,320 readings usable.
   Expected (K9, decision of 2026-09-27): Lakeside Buoy 2026's own readings, with Legacy Pod's history withheld and a note.
10. **A fresh-water pod's history includes its salt-water predecessor's conductivity.**
   Steps: as `user-lake-cust-1` on Lakeside Buoy 2026, ask for 60 days of history (K8) or a 60-day report (F4).
   Observed: conductivity 350 to 49,992 uS/cm flagged Exceedance and Action Required; the high values come from Lakeside Testbed, a same-organization, same-site predecessor registered salt-water, as one production chain is.
   Likely cause: merged history is judged against the survivor's fresh-water limits with no check of the predecessor's registered water type.

11. **Any logged-in user can export any pod's readings as CSV.**
   Steps: log in as `user-harbor-admin-1` and `POST /api/v1/water/export/csv/dev:100000000000003` (a Lakeside pod) with a 7-day `startDate` and `endDate`, as the dashboard's Export dialog does; D6 in the bot.
   Observed: 200 with 167 rows for Lakeside's pod and for `dev:100000000000006`; Harbor admin owns neither.
   Likely cause: `WaterAnalyticsController.exportCsv` never passes the caller, and `WaterAnalyticsService.findDeviceWaterDataExportCSV` looks the pod up with `findByLabel(device, null)`, so no organization filter applies; `SECURITY_FINDINGS.md` lists this query among those with both merge expansion and an organization check, which is wrong for it.
   Unfixed on every pushed server branch and on `local`; likely in production, not checked live.

Still seen, already known: findings 1 and 4, P5, K16 (`LIVE_TEST_LIST.md` L5) and R13 (report audit 14).

## Bot defects fixed during the run

- The pod picker could miss a click while the list re-rendered, so the first run sent K8 with Lakeside Mobile Buoy selected and K13 with Lakeside Buoy 2026 selected; `pickPod` now retries once and verifies the selection, and C6, K8 and K13 were rerun.
- The old-site check first counted the 1,500 uS/cm limit and the "1438 of 1728" counts as readings; it now reads only values written with the unit, and the PDF check reads the Conductivity row. K6, M4 and R11 were rerun.

## Review sheet

`data/e2e/p2-paid-2026-09-27/review.html` holds every question of the main run with its persona, pod, expectation, answer and screenshot; the reruns have their own sheets in `p2-rerun-2026-09-27` and `p2-rerun2-2026-09-27`.
Rows marked "P, review" above need a person's mark.
The downloaded PDFs are under each run's `downloads/`.

## Not run

- Groups B, D, E, H and I, and phase 2.
- Every check blocked for a missing fixture.
- The live follow-ups, listed in [`LIVE_TEST_LIST.md`](LIVE_TEST_LIST.md).

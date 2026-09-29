# Q9 cloud result — pH bound, silent pods, report reading age, thin 1-day series

Branch `cloud/q9-logic`, cut from `origin/task/q3-q5` at `e8bbaa9`. This was a cloud session, so it made no live device reads, captured no eval runs, ran with no `SENSOR_TOOL` or `REPORT_TOOL`, and used no secrets.

## Source notes

- `docs/migration/GILLIGAN_RELEASE_PLAN.md` on this branch has rows Q1-Q8 but no Q9 row.
- `docs/migration/E2E_CHECKLIST.md` does not exist on this branch or anywhere in the fetched history.
- Items C1 and D1 were therefore implemented from the task prompt. Audit items #3 and #4 came from `docs/migration/REPORT_AUDIT_2026-09-25.md`, whose finding 5 is the source of the pH 2.07 value.

## Changed files

| File | Change |
| --- | --- |
| `src/devices/plausibility.ts` | Adds an optional `naturalWater` window to `PlausibleRange`. `isPlausible` also checks it, and pH sets it to 3-12. |
| `src/tools/listPods.ts` | Adds a per-pod `status`, a result-level `silent_pods` list and a note sentence about silent pods. |
| `src/report/buildReportInput.ts` | Adds `trendFloor`: the thin-bucket floor now scales with the series' own median bucket count. |
| `src/report/renderPdf.ts` | Adds `lastReadingText`, a "Last Reading" metadata row, a stale warning, and an optional `nowMs` in `RenderPdfOptions`. |
| `test/unit/plausibility.test.ts` | Adds D1 cases. The old test that pH 2.5 and 12.5 are plausible is replaced (see D1). |
| `test/unit/listPods.test.ts` | Adds two C1 cases. |
| `test/unit/buildReportInput.test.ts` | Adds two #4 cases and one #3 case (`lastReadingAt` is carried). |
| `test/unit/reportRenderPdf.test.ts` | Adds three `lastReadingText` cases and one render smoke case. |
| `docs/SPECS.md` | Adds four rule lines after the operator-limit rule. |

## Rules chosen

**D1 — pH plausibility.** A pH reading must lie in 3-12, inclusive.
- **Why 3-12:** natural surface water runs from about 3.5 (peat bogs, humic streams) to about 11 (soda lakes, and eutrophic water at the photosynthetic peak). The fleet's lakes, creeks, harbors and coast contain neither mine drainage nor volcanic acid, so a reading outside that band is a failed probe.
- **Live evidence:** 2.07 and the Algalita Pod's 12.62 are both now flagged.
- **What stays the same:** `PLAUSIBLE_RANGES.ph.min/max` remain 0 and 14 (exclusive), because `operatorThresholds.ts` validates configured pH limits against them. Shrinking them would have rejected limits, not readings, and changed files outside this task's scope.
- **Safety margin:** every non-placeholder pH limit in the recorded registry fixtures lies between 5 and 10, so the new band is wider than any of them. A test pins this.
- **Reversed expectation:** the previous test asserted that pH 2.5 (acid mine drainage) is plausible. That is now deliberately false.

**C1 — silent pods in `list_pods`.**
- Each probed pod gets a `status`:
  - `reporting`: its last current-site reading is at most 6 hours old.
  - `silent`: that reading is older than 6 hours (`readingAge`'s stale line).
  - `unconfirmed`: there is no timestamp, and a null is not proof of silence.
  - `not_checked`: the pod is beyond the 20-pod probe cap.
- Silent pods are repeated in `silent_pods` with `last_reported` and `last_reported_age`.
- When there is at least one silent pod, the note tells the model to list silent pods, marked silent with that age, when asked which pods are online.

**Audit #3 — reading age in the PDF.**
- The metadata table gains "Last Reading": `YYYY-MM-DD HH:MM UTC (<age> before this report)`, or "Not available" when there is no timestamp.
- The age is measured at render time with `readingAge`, the same rule the `generate_report` and `list_pods` tool results use.
- When the age is over 6 hours, an amber bold line under the table says the pod has not reported for that long, and that the report describes the water at the last reading, not current conditions.
- `buildReportInput.ts` needed no logic change: it already carried `site.lastReadingAt` from `device_last_reported`. A test now pins that.

**Audit #4 — thin 1-day series.**
- A trend bucket is thin when it holds fewer readings than half the series' median bucket count. The floor is capped at `MIN_BUCKET_SAMPLES` (3) and is never below 1.
- The existing "keep every bucket if the floor would empty the series" fallback is unchanged.
- **Twice-hourly pods:** with a median of 2 the floor is 1, so Balboa's 25 one-hour buckets all survive.
- **The original gap case still holds:** a single-reading 12-hour bucket among buckets of about 10 is dropped (floor 3), and n=1 among n=3 is also dropped (floor 2).

## Checks run

| Check | Result |
| --- | --- |
| `npx jest test/unit/plausibility.test.ts --runInBand` | 17 passed |
| `npx jest test/unit/listPods.test.ts --runInBand` | 15 passed |
| `npx jest test/unit/buildReportInput.test.ts --runInBand` | 38 passed |
| `npx jest test/unit/reportRenderPdf.test.ts --runInBand` | 29 passed |
| `npm run typecheck` | clean |
| `npm run lint` (`eslint src`) | clean. The first run flagged a nested ternary and a long line in `listPods.ts`; both are fixed. |

The following were not run: `npm test`, other suites, the local server, and live reads.

Other suites were checked statically instead:
- No `test/fixtures` reading has an unflagged pH between 0-3 or 12-14.
- No other test references pH values in that band.
- No other test matches exactly on the `list_pods` pod shape or on the PDF metadata rows.
- `test/unit/siteQuality.test.ts` and `test/unit/prompt.test.ts` read `list_pods`' `note` and `last_reported` only by substring or field.

## Open questions

1. **Missing plan sources.** Q9 is not in the release plan and `E2E_CHECKLIST.md` is missing on this base. Should the plan row and checklist land from wherever they were written?
2. **pH band edges.** Is 3-12 acceptable to the supervisor? Tightening further toward 4-11 would still admit bog and soda-lake water. Loosening to 2-13 would re-admit the Algalita readings. If a pod is ever deployed in mine drainage, the lower edge must move.
3. **Operator limits outside the band.** An operator limit below 3 or above 12, for example `minPH=2`, is still accepted as a configured limit, but no plausible reading can now cross it. `metricBlindSpotNote` (`operatorThresholds.ts`) still compares against 0-14, so it does not warn about this. Should it compare against `naturalWater`? That change is outside this task's files.
4. **Stale comment in `types.ts`.** `SiteMetadata.lastReadingAt` still says "Not printed". That file was out of scope, and its comment is now wrong.
5. **Age clock.** The PDF measures age against its own render clock (`Date.now()`, or `nowMs`), not the sensor's injected clock, because `produceReport.ts` was out of scope. In production these agree to within milliseconds. Should `produceReport.ts` pass `sensor.clockMs()` so the PDF age and the tool result age are computed from one clock?
6. **What the render test proves.** The PDF smoke test only shows that a stale and a fresh render differ and are valid PDFs. Under Jest the PDF's text cannot be extracted (see the test file's docstring), so the exact wording is pinned only through `lastReadingText`.
7. **Meaning of "silent".** A pod is marked `silent` from its current-site timestamp, which needs a GPS fix. A pod still reporting chemistry without a fix for over 6 hours would read as silent, not unconfirmed. The existing note still tells the model to confirm with `query_sensor_data` before saying a pod has stopped reporting.

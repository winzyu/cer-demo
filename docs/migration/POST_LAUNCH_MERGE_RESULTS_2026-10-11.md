# Post-launch merge results, 2026-10-11 (`land/post-launch`)

The completed merge plan is available with `git show docs-archive-2026-10-16:docs/migration/POST_LAUNCH_MERGE_TESTS.md`.
Tested commit: `247e0ad`.
Result: tiers 1-3 all pass.
Finding 1 is still open: the unit cases pin it, but no live answer triggered it.

## Tier 1: static checks

| Check | Exit | Errors |
|---|---|---|
| `npm run typecheck` | 0 | none |
| `npm run lint` | 0 | none |

## Tier 2: Jest suites by name

| Run | Suites | Tests | Exit |
|---|---|---|---|
| Unit (19 named suites) | 19 passed | 631 passed, 1 todo (632) | 0 |
| Integration (5 named suites) | 5 passed | 66 passed | 0 |

`postLaunchMerge.test.ts` passes, so its `it.failing` cases still fail and finding 1 is not fixed.

## Tier 3: local smoke, live reads

Server: `npm run dev` from the `post-launch-land` worktree on port 8012, with release settings set in the environment.
The settings came from `GILLIGAN_DEPLOYMENT_RUNBOOK.md` §4.1: `LLM_MODEL=accounts/fireworks/models/glm-5p3-flash`, `LLM_REASONING_EFFORT=low`, `LLM_MAX_TOKENS=16384`, `DEFAULT_RETRIEVAL=local-vector`, both `QUERY_REWRITE` settings `true`, `CATALOGUE_PROMPT=true`, `MAX_TOOL_ROUNDS=16`, `SENSOR_TOOL=true` and `REPORT_TOOL=true`.
`QUERY_QUOTA=false` and `AUDIT_LOG=false` kept the run write-free.
The device API was production, read-only, with `DEVICE_API_TOKEN` sent as the caller's bearer token (as in `LOCAL_STACK.md`).
The main checkout's `.env` still sets `LLM_MODEL` to `gpt-oss-120b`, so a plain `npm run dev` does not answer with the release model.
S3-S5 shared one chat history; S1, S2 and S6 were fresh chats.

| # | Tool calls | `report_retried` | Delivery line | Spend | Result |
|---|---|---|---|---|---|
| S1 | `query_sensor_data` (Balboa, dissolved_oxygen, last 30 days) | false | none | $0.0048 | pass |
| S2 | `query_sensor_data` without a device (error: device required), then with Balboa Yacht Basin Buoy, all metrics, last week | false | none | $0.0041 | pass |
| S3 | `generate_report` (Balboa, last 7 days) | false | "New PDF in this reply: Balboa Yacht Basin Buoy, 2026-10-04 to 2026-10-11, full report." | $0.0028 | pass |
| S4 | `generate_report` (Balboa Yacht Basin Buoy, last 7 days, `omit: [turbidity_notes, threshold_notes]`) | false | "New PDF in this reply: Balboa Yacht Basin Buoy, 2026-10-04 to 2026-10-11, leaving out the turbidity notes and threshold notes." | $0.0036 | pass |
| S5 | `get_pod_thresholds` (Balboa Yacht Basin Buoy) | false | "No new PDF was made in this reply." | $0.0036 | pass |
| S6 | none | false | none | $0.0020 | pass |

Spend is $0.021 in total.
It is costed at the `glm-5p3-flash` rates in `src/eval/prices.ts` ($0.15 input, $0.03 cached input and $0.50 output per 1M tokens) from each response's `usage`.
`usage` leaves out the query-rewrite calls, so the real total is slightly higher, still well under the $0.30 cap.

### Per-question notes

- S1: the verdict is "likely data issue": 28 stuck readings and 1 faulted reading were excluded, and the mean is 11.67 mg/L from 1,013 readings.
  No flag came from a single reading, and there was no "New PDF" line.
- S2: the answer explains the QC exclusions (all 337 conductivity readings at 0 µS/cm, all 337 turbidity readings stuck, 1 pH reading at 2.92) and was not replaced.
  It never puts "report" next to "excluded", so finding 1 did not occur end-to-end; this run neither reproduces nor clears it.
  The tool's per-metric verdicts were pH out of range, conductivity and turbidity likely data issue, and the rest in range.
  The answer leaves out the pH out-of-range verdict.
- S3: flags are pH Low and dissolved oxygen, ORP and temperature Normal, with status Watch.
  They match S2's tool verdicts for the same 7-day window, and conductivity and turbidity are reported as having no usable readings.
  S1's 30-day dissolved oxygen verdict covers a longer window that includes the stuck readings, so it differs from the 7-day Normal.
- S4: the `generate_report` result is identical to S3's, except for `omitted_from_pdf` and the `omit` inside `report_request`.
  Status, flags, period and event counts are unchanged.
  In the answer, the citation markers on the next-steps line were stripped and left a space before each comma.
- S5: no PDF and no forced retry.
  The answer gives the configured pH limits (4-10) rather than the observed range (3.06-9.28 in the report).
- S6: refused, explaining that numbers, flags, status and recommendations always stay in and that only the note groups can be left out.
  No tool call, no PDF and no retry.

The server was stopped afterwards.
The shared stack on ports 8010 and 8080 was not touched.

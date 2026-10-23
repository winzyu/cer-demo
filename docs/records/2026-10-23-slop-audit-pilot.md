# Slop audit pilot: `src/tools` (2026-10-23)

Steps 1 (inventory) and 3 (pilot one module) of the phased slop audit. Read-only: no source was changed.
The aim is to calibrate the rubric before running it over the rest of the repo.

## Step 1: inventory

Tracked JS/TS, excluding `archive/`, `eval/transcripts/`, `dist/` and vendored files.

| Module | Lines | Files | | Module | Lines | Files |
|---|---:|---:|---|---|---:|---:|
| test/unit | 20,008 | 76 | | src/devices | 1,221 | 5 |
| scripts | 7,109 | 36 | | src/quota | 742 | 6 |
| src/eval | 5,084 | 21 | | src/config | 721 | 2 |
| src/report | 4,519 | 12 | | src/controllers | 715 | 5 |
| **src/tools** (pilot) | **3,590** | **14** | | src/catalogue | 688 | 6 |
| frontend | 3,122 | 12 | | src/ingestion | 623 | 4 |
| test/integration | 2,286 | 11 | | src/utils | 619 | 7 |
| src/retrieval | 2,048 | 19 | | src/prompt | 612 | 2 |
| src/services | 1,229 | 6 | | other src (types, middleware, routes, validators, app) | ~840 | 18 |

Production `src/` is about 23k lines, the test suite about 22k, and scripts 7k.
At 3–5k lines per unit, the rest of the audit is about 8 units: `src/eval`, `src/report`, `frontend`, `src/retrieval` + `src/ingestion`,
`src/services` + `src/controllers` + `src/prompt`, `src/devices` + `src/quota` + `src/config`, the remaining small `src/*` directories, and `scripts`.
The tests are better audited one target module at a time, alongside that module, than as their own unit.

## Step 3: pilot, `src/tools`

Baseline: `npm run typecheck` and `npx eslint src/tools --ext .ts` both pass with no output.
Each finding below was checked against callers (grep across `src`, `scripts` and `test`) and, where marked, run directly.

### Summary

| Severity | Count | What |
|---|---:|---|
| High | 1 | A tool schema advertises input the parser rejects |
| Medium | 5 | Dead production code kept alive only by tests or nothing; stale or misplaced docs; divergent error paths |
| Low | 6 | Copy-pasted logic and strings that will drift |

### High

**H1. `generate_report` tells the model to send `"this month"`, and the parser rejects it.**
`src/tools/generateReport.ts:66` gives `"this month"` as an example `time_range`. The report reads through `QuerySensorData.query()` → `parseTimeRange`,
and `parseTimeRange` accepts only `this week` (`src/tools/timeRange.ts:126-145`). Verified with ts-node:
`parseTimeRange("this month")` → `Could not understand time_range "this month"`. A model that copies the example fails the report on its first call.
Fix: drop the example, or add `this month` to the grammar and to `HINT`.
This is a classic slop pattern: plausible example text written without being checked against the code it describes.

### Medium

**M1. `lastReportedForTool()` and `lastReportedAt()` are dead, and their docs claim callers that don't exist.**
`src/tools/querySensorData.ts:666-675` says the method is "for `list_pods`'s freshness column".
`listPods.ts:144-146` gets freshness from `sensor.run({ metric: "all", time_range: "last year" })` instead. Nothing in `src`, `scripts` or `test` calls
`lastReportedForTool`, and `lastReportedAt` (`:1145-1156`, docs: "used only when a window came back empty") is reachable only through it.
About 25 lines of code and docs can go.

**M2. The empty-history path skips the best-effort guard that M1's dead helper was written for.**
`loadSnapshot` (`querySensorData.ts:467-468`) calls `client.getLastReading()` directly when a chain has no rows.
The dead `lastReportedAt` wraps that same call in try/catch, because "a second failure should not replace a useful answer with an error."
In the live path, a failed `/water/last` call on a pod with no history turns "No readings found" into "Could not read sensor data: …".
Severity is medium, not high, because a pod with no history at all is rare. Fix: route the call through `lastReportedAt` (and keep it), or delete both.

**M3. `lookbackMsFor`, `fetchWindowFor`, `widerWindow`, `LADDER` and `FetchWindow` exist only for their own tests.**
`src/tools/timeRange.ts:256-315`. No production caller. Their docs describe a caller that "widens a window that came back empty… bounded by the caller",
which was the fetch model before the snapshot rewrite (`loadSnapshot` now reads N days directly). `test/unit/timeRange.test.ts:179-235` tests code nothing uses.
About 60 lines of source plus about 55 of tests can go.

**M4. A doc comment is attached to the wrong constant.**
`querySensorData.ts:147-153`: the block that begins "Said when every channel failed at once on three or more consecutive readings…" sits on
`TURBIDITY_CAVEAT`. It describes `BOARD_FAULT_NOTE`, two lines below. Anyone reading the turbidity caveat is told it concerns board faults.

**M5. `SiteSnapshot.visits` is computed on every snapshot and never read.**
`src/tools/siteSnapshot.ts:22,61`: `snapshotSite` runs `siteVisits(context)` again, even though `currentSite` has already done it internally. No code reads `.visits`.
Removing the field drops a full pass over the site history per snapshot load.

**M6 (plausible; needs your call). `generate_report` is the one tool that doesn't turn transient device errors into tool results.**
`query_sensor_data`, `list_pods` and `get_pod_thresholds` all catch everything except `device_auth_expired` and `caller_token_required` and return `{ error }`,
so the model can say the sensors were unreachable (`querySensorData.ts:534-537`).
`GenerateReport.run` (`generateReport.ts:208`) has no such wrapper. `buildReportInput.ts:329-333` catches only `SensorQueryError`,
and `query()` lets `device_unavailable`/`device_timeout` escape, so a device outage during a report fails the whole chat request.
This may be deliberate; the docstring mentions only the token case. Confirm before changing it.

### Low

- **L1. The range-membership test is written five times.** `inRequestedRange` (`querySensorData.ts:821`), `overlaps` (`:976`), `newestPosition` (`:1080`),
  `samplesInRange.inRange` (`:1114`), and `metricVerdict.ts:58`. Each reimplements `start <= t && (endInclusive ? t <= end : t < end)`.
  A `inRange(range, ms)` helper on `timeRange.ts` would remove the chance of one copy getting the inclusive end wrong.
- **L2. The `run()` error wrapper and `failure()` helper are copy-pasted** in `querySensorData.ts:524-550`, `listPods.ts:117-130` and `getPodThresholds.ts:138-151`,
  with `failure` defined a fourth time in `generateReport.ts:87`. The rethrow list is the security-relevant part, and it lives in three places.
- **L3. The "no devices for this token" message is duplicated verbatim** (`querySensorData.ts:373`, `listPods.ts:138`). So is `device.name ?? device.label ?? "(unnamed)"`
  (`querySensorData.ts:379`, `listPods.ts:98`, `getPodThresholds.ts:201`), and so is the `device` parameter description (`querySensorData.ts:1320`, `getPodThresholds.ts:112`).
- **L4. The "unlocated readings" note and user note are copy-pasted** between `currentSite` (`currentSite.ts:129-133`) and `siteNotesForPeriod` (`:193-197`).
- **L5. `HOUR_MS`/`DAY_MS` are defined in five files** (`aggregate.ts`, `timeRange.ts`, `readingAge.ts`, `dailyCycle.ts`, `siteSnapshot.ts`, which also exports `DAY_MS`).
  `querySensorData.ts:264-269` spells them out again inline.
- **L6. Comment copy-paste and drift.** In `aggregate.ts:281` the `raw` branch says "A series has no single value", copied from the `series` branch.
  `generateReport.ts:286-287` says metrics are judged against "nothing at all if it has no usable one", but `baselineProvenance` (`:104`) documents the v2 fallback.
  `querySensorData.ts:1188` and `:1222` share a copy-pasted sentence ("a reader comparing this against … needs to know why the counts differ").
  The device cache evicts on `SITE_CACHE_MAX_ENTRIES` (`:345`), a constant borrowed from the site cache.

### What is *not* slop here

Calibration matters as much as the findings. The module is mostly the opposite of vibe-coded:

- Behavior is grounded in specific, verified incidents (the OWC acronym, the `-1023 °C` sentinel, the `earliest` aggregation's origin). Exhaustive `never` checks and
  null-vs-zero handling are deliberate and correct.
- No swallowed errors in the live paths, no hallucinated dependency APIs, and typecheck and lint are clean.
- The passthrough methods (`resolveDeviceForTool`, `listDevicesForTool`) are thin, but they do share one cache and one set of error texts across tools, so they stay.

## Rubric questions before the full run

1. **Comment volume.** 26% of `src/tools` lines are comments (929 of 3,590), and several files run 40%+. Most explain *why*, which is good.
   But six blocks narrate history ("used to", "before this", "an earlier cut"), and many cite planning shorthand (`◆G8`, `Phase N6`, `§8 step 5`) that a new reader
   can't resolve. Should the full run flag history narration and opaque doc citations, or treat them as house style?
2. **Test-only exports.** M3 is a pattern worth sweeping for repo-wide: a grep pass found exports referenced only by tests. Include it as a standard check? (Recommended.)
3. **Pilot cost.** One person-reading of 3.6k lines found 1 high, 6 medium and 6 low findings, all confirmed against the code. The remaining roughly 8 units are about 7× this.

## Suggested next fixes (by payoff)

1. H1: one-line fix that prevents a user-visible tool failure.
2. M1 + M2 together: decide whether `getLastReading` failure is best-effort; then delete or wire up `lastReportedAt`.
3. M3: delete the orphaned fetch-ladder helpers and their tests.
4. M4, M5, L6: trivial doc and dead-field cleanups.
5. L1, L2: extract `inRange` and a shared tool-error wrapper.

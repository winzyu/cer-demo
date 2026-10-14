# Data coverage check, `b140d43` (2026-10-12)

Whether summary and overview answers name the period they cover ([`SPECS.md`](../../../SPECS.md) §10.8), after Michael's 2026-10-11 clarification.

Setup: `task/data-skepticism` `b140d43` on :8420 with the release settings (`glm-5p3-flash`, reasoning low, `local-vector`, `CATALOGUE_PROMPT=true`, `WATER_TYPE=freshwater`), pointed at `scripts/skepticism/fakeDeviceApi.ts` (`test/data-skepticism-evals` `b628a62`) on :5299 with the default pH swing; no production reads.
Questions: "Give me a summary of this buoy", "Can you give me an overview of the data?" and "How is the water looking?" about Bay Mouth Pod, each followed by "What about the pH?", three runs (`scripts/e2e/coverageCheck.mjs`).
18 answers, 826,365 tokens, about $0.15 at `glm-5p3-flash` rates (at most $0.41 if every token were output).

## Results, read by hand

- All 9 openers called `generate_report` with "last 7 days" and named the period in their first sentence ("covering 2026-10-05 to 2026-10-12", "over the last 7 days (Oct 5 to Oct 12)"); each carried the matching "New PDF" line.
- None said that 7 days was a default chosen because no period was named, and 1 of 9 offered a longer period: the prompt's "say so" and "offer a longer one" are not followed on the report path.
- All 9 follow-ups called `query_sensor_data` and carried a "Data covered" line; none needed the "No new readings" line.
  6 of 9 read only the latest value ("now") after a 7-day overview, and their lines said so ("the reading at 2026-10-12 05:18 UTC (1 reading)").
- Every "Data covered" line said "current site only", including a single latest reading and a week that began 50 days after the earlier site's last reading.
  The tool labels any pod with earlier-site history as "current-site readings"; the line now says "current site only" only when `window_actually_searched.complete` is false, the case where readings inside the request were dropped.

`coverage-check.json` holds every answer; this run predates saving tool results, which the script now records.

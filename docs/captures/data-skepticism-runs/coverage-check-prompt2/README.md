# Data coverage check, tightened prompt (2026-10-12)

The same check as [`coverage-check-b140d43`](../coverage-check-b140d43/README.md), rerun after tightening two prompt rules ([`SPECS.md`](../../../SPECS.md) §10.8).
The report rule now has an answer with no named period say the user named none, so it covers the last 7 days, and end by offering a longer period; a one-parameter follow-up after an answer about a period now reads that same period rather than the latest value.

Setup as before: `task/data-skepticism` on :8420 with the release settings, pointed at `scripts/skepticism/fakeDeviceApi.ts` on :5299; no production reads.
18 answers, 866,411 tokens, about $0.15 at `glm-5p3-flash` rates.

## Results, read by hand

| | Before | After |
|---|---|---|
| Opener names its period in the first sentence | 9 of 9 | 9 of 9 |
| Opener says 7 days was chosen because no period was named | 0 of 9 | 3 of 9 explicitly; 4 more add "(last 7 days)" after the dates |
| Opener offers a longer period | 1 of 9 | 9 of 9 |
| "What about the pH?" reads the overview's week | 3 of 9 | 9 of 9 (316 readings each) |
| Server line present and correct | 18 of 18 | 18 of 18 |

All 9 pH follow-ups said "775 readings from an earlier location (Jul 4 - Aug 23) were excluded, so this covers only the current site", though that site ended 43 days before the week asked about.
The model is repeating `query_sensor_data`'s `note` and `user_notes` (`src/tools/currentSite.ts`), which report earlier-site readings whether or not any fell inside the requested window; this is the same over-reach the coverage line had before `6752b66`.

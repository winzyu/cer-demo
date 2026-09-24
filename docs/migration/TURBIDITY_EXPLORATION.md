# Turbidity exploration (Task A input)

Explored at `dev` `6d8c6e9` on 2026-09-24, cer-demo only; the dashboard and `turbVoltToNTU.ts` are upstream and were not read.
This is input for the Task A interview, not a decision record.

## 1. Where the bands and conversion live

- The band edges are `TURBIDITY_BAND_EDGES` in `src/report/referenceRanges.ts:110-115`: Turbid at 795 or above, Moderate from 345 to below 795, Clear from 0 to below 345. The edges are half-open and first-match-wins (`:74-79`), so exactly 795 counts as Turbid, although the operator's "below 0.7 V" wording would put it in Moderate.
- The conversion constants mirror the backend: `TURBIDITY_CLEAR_VOLT = 3.35` (`:122`) and `TURBIDITY_INDEX_PER_VOLT = 300` (`:128`). The index is the voltage drop below 3.35 V times 300, clamped at 0.
- `OFF_SCALE_INDEX = 1005` (`:141`) and `isOffScaleTurbidity` (`:149`) flag readings beyond the conversion's range; this is a data-quality flag, not a fourth band.
- The consumers are:
  - `get_turbidity_info`, which derives its bands and voltage bounds from these exports (`src/tools/getTurbidityInfo.ts:22-60`, `:94`).
  - The report Flag column, via `clarityBandFor` plus "(off-scale)" (`src/report/renderPdf.ts:64-68`).
  - The narrative (`src/report/narrative.ts:227-240`, `:336`) and event detection (`src/report/events.ts:445`).
- The docstring at `referenceRanges.ts:105-108` calls the bands operator-authoritative and the conversion uncalibrated.

## 2. How a 0 reading is handled

- Everywhere in cer-demo, 0 counts as a real reading: `referenceRanges.ts:81-85`, `src/devices/plausibility.ts:26-27` (the plausibility bound is 0 to 4000, at `:88-93`), `src/tools/aggregate.ts:207` and `src/tools/querySensorData.ts:875`.
- It lands in the Clear band (`referenceRanges.ts:131`).
- The only documented source of 0 is a voltage above 3.35 V, clamped (observed at 4.20 V).
- **Nothing in cer-demo can tell a real 0 apart from the backend's 0 for a missing voltage or the offline sentinel.** Those arrive as ordinary 0 values and are reported as Clear.
- A genuinely missing window is handled separately: `value: null` with `n_samples: 0`, and the prompt forbids reporting that as 0 (`src/prompt/systemPrompt.ts:133-136`).

## 3. What users are told

- `TURBIDITY_SCALE_CAVEAT` (`referenceRanges.ts:156-158`) says the index comes from a provisional, uncalibrated conversion and is a clarity band and a direction of change, not a measurement. It is printed by the tool (`getTurbidityInfo.ts:94`) and the narrative (`narrative.ts:240`).
- The report footnote (`renderPdf.ts:516-521`) explains the bands and says "A reading of 0 is a real reading".
- The system prompt describes turbidity:
  - as "PROVISIONAL, uncalibrated ... expressed in NTU" (`systemPrompt.ts:163-166`);
  - as qualitative only (`:244-245`);
  - with "(in NTU)" in the scope line (`:260`).
- The old 0-25 NTU range was removed (`:22-23`).

## 4. Catalogue

- 7 of 43 catalogue items mention turbidity: `sewage-marine`, `sewage-freshwater`, `hypoxia`, `stormwater`, `thermal`, `saltwater-intrusion` and `turbidity-relative`.
- Only `turbidity-relative` names the bands (Clear, Moderate, Turbid).
- None contains a numeric edge.
- All entries are drafts pending the supervisor.

## 5. If the edges move to 350 and 800

- **Code:** change `referenceRanges.ts:113-114` and its docstrings (`:76-78`, and `src/report/types.ts:31-37`). The tool, report, narrative and events derive from the constant.
- **Tests:** 10 hard-coded values need updating: `reportReferenceRanges.test.ts` (6), `getTurbidityInfo.test.ts` (3) and `reportNarrative.test.ts` (1).
- **Docs:** check `docs/SPECS.md`; no 345 or 795 was found there.

## Open questions for the interview

1. Which edges are current: 345/795 (the report) or 350/800 (the dashboard dial)? Should the report and the dial share one source?
2. Should the backend's 0 for a missing voltage or the offline sentinel stay Clear, become "no reading", or get a new flag? The fix is upstream in `turbVoltToNTU.ts`; cer-demo can only follow its lead.
3. Does the v2 turbidity exemption (supervisor item 18) change the bands or the caveat?
4. Should the prompt keep saying "NTU" for an index the caveat says is not a calibrated measurement?
5. Does any pod have a quantitative sensor? The registry has no sensor-model field.

## Risks

- A pod reporting all zeros reads as 14 days of Clear water, in both chat and reports.
- The edge disagreement means a 347 reading shows as Clear on the dial and Moderate in a report.

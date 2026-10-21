# Report audit — PDF quality and consistency, 2026-09-25

Read-only audit of the deterministic report pipeline (`src/report/`, `src/tools/generateReport.ts`)
as of `dev` at `c4fe461`. No source or test file was changed. Every finding below comes from a
live report or from the code path that produced it. Fixes are left to the release-plan items named
in the table, or to a new item.

## Method

- **Code read:** `SPECS.md` §10.7, `src/report/*.ts`, `src/tools/generateReport.ts`,
  `src/tools/readingAge.ts`, and the report suites. `test/unit/report*.test.ts`,
  `generateReport.test.ts` and `buildReportInput.test.ts` pass on `c4fe461` (8 suites, 213 tests).
- **Live reads (announced):** one `GET /devices`, then 15 reports through `prepareReport` /
  `renderReportPdf` with `DEVICE_API_TOKEN`: five pods × `last 1 day`, `last 7 days`,
  `last 30 days`. Each report makes three period queries and one registry lookup. Generated
  2026-09-26 ≈01:30 UTC (2026-09-25 18:30 PDT). `Marina Park DataPod™`, the retired predecessor
  merged into `Marina Park`, was left out.
- **Determinism:** each report's sensor responses were recorded and replayed through the same
  pipeline, with the same clock, to build it a second time. This avoided a second live read.
  **All 15 matched**: the report model and narrative were identical, and the PDF bytes were
  identical once pdfkit's `CreationDate`/`ID` were stripped. A live re-run would differ
  legitimately, because relative ranges anchor to the pod's newest reading (§10.7).
- **Layout:** each PDF's text was extracted and every page rendered to PNG (`pdf-parse` v2), then
  inspected. The harness, PDFs and recorded readings sit under the gitignored
  `generated_reports/audit/` and are not part of this change.

## Run matrix

| Pod | Range | Period printed | Last reading (age) | Status (rule) | Events |
|---|---|---|---|---|---|
| Old Woman Creek 2026 | 1 d | 2026-09-13 to 2026-09-14 | 09-14 15:19Z (12 days) | Normal (normal) | 0 |
| Old Woman Creek 2026 | 7 d | 2026-09-07 to 2026-09-14 | 12 days | Normal (normal) | 0 |
| Old Woman Creek 2026 | 30 d | 2026-08-15 to 2026-09-14 | 12 days | Action Required (exceedance: ORP) | 0 |
| Marina Park | 1 d | 2026-09-25 to 2026-09-26 | 23 minutes | Action Required (DO, conductivity) | 1 |
| Marina Park | 7 d | 2026-09-19 to 2026-09-26 | 23 minutes | Action Required (DO, conductivity) | 0 |
| Marina Park | 30 d | 2026-08-27 to 2026-09-26 | 23 minutes | Action Required (DO, ORP, conductivity) | 2 |
| PCH Public Dock Buoy | 1 d | 2026-09-11 to 2026-09-12 | 09-12 20:19Z (14 days) | Action Required (DO) | 1 |
| PCH Public Dock Buoy | 7 d | 2026-09-05 to 2026-09-12 | 14 days | Action Required (DO) | 1 |
| PCH Public Dock Buoy | 30 d | 2026-08-13 to 2026-09-12 | 14 days | Action Required (DO, ORP, pH) | 2 |
| Algalita Pod | 1 d | 2026-09-25 to 2026-09-26 | 5 minutes | Action Required (pH) | 1 |
| Algalita Pod | 7 d | 2026-09-19 to 2026-09-26 | 5 minutes | Action Required (ORP, pH, conductivity) | 1 |
| Algalita Pod | 30 d | 2026-08-27 to 2026-09-26 | 5 minutes | Action Required (ORP, pH, cond., temp.) | 1 |
| Balboa Yacht Basin Buoy | 1 d | 2026-09-25 to 2026-09-26 | 24 minutes | Watch (excursion: DO) | 0 |
| Balboa Yacht Basin Buoy | 7 d | 2026-09-19 to 2026-09-26 | 24 minutes | Watch (excursion: DO) | 2 |
| Balboa Yacht Basin Buoy | 30 d | 2026-08-27 to 2026-09-26 | 24 minutes | Action Required (ORP, conductivity) | 5 |

**Checks that found no problem:**

- **Status matches the flags.** In all 15 reports the status equals what `assessStatus`
  derives from that report's own flags and events. No report shows a status its table contradicts.
- **Water type.** All 15 read it from the device registry: Freshwater for Old Woman Creek, Marine
  for the four Newport/Seal Beach pods. None fell back to the deployment default.
- **Limits.** Every limit printed is the registry pair that passed `operatorThresholds.ts`. No
  report printed a fallback range or a rejected pair.
- **Units.** Labels and units are consistent: °F, µS/cm, mV, mg/L, and turbidity marked as a
  unitless relative index.

13 of 15 reports carry a status of Watch or Action Required, which is expected on this fleet. The
findings below are about whether those verdicts, and the three that read Normal, are earned.

## Findings

Severity: **High** means the cover status or a verdict is wrong or unsupported. **Medium** means
the content misleads a careful reader. **Low** is cosmetic or latent.
**Covered by** names the release-plan item whose stated scope already fixes the finding. **New**
means no item covers it.

| # | Pod | Range | Issue | Severity | Likely file | Covered by |
|---|---|---|---|---|---|---|
| 1 | Old Woman Creek 2026 | 1 d, 7 d | **Stuck DO shown as normal.** DO reads 0.00 in every 1-day bucket (median 0 over 7 days; flat 0 since 2026-09-09) and is flagged Normal against 0-12 mg/L. The cover reads "Normal — no action required". The DO row gets no Section 3 text because `heldSteady` drops Normal/unknown rows, and Calibration reads "Pass". | High | `types.ts` (`flagFor`, `assessStatus`), `narrative.ts` (`heldSteady`), `buildReportInput.ts` | Q4 |
| 2 | PCH Public Dock Buoy | 1 d, 7 d | **Stuck DO drives Action Required.** DO is 0.00 in every 1-day bucket (98% of 7-day buckets). This produces an Exceedance flag, a "persistent" Threshold-crossing event, and Action Required, all on what Q4 would call a failed sensor. Balboa's DO (median 0 over 1 d and 7 d) has the same shape and drives its Watch status. | High | `events.ts`, `types.ts` | Q4 |
| 3 | Old Woman Creek 2026, PCH Public Dock Buoy | all | **No reading age in the PDF.** "Last 1 day" on a pod silent for 12-14 days prints a two-week-old period beside Report Date 2026-09-26. Nothing says the pod stopped reporting. OWC's 1-day report calls that "Normal — no action required at this time". `site.lastReadingAt` is carried "Not printed" (`types.ts`); Q1 gave the age to the tool result only. | High | `renderPdf.ts`, `narrative.ts` | New |
| 4 | Balboa Yacht Basin Buoy, PCH Public Dock Buoy | 1 d | **Thin data: `MIN_BUCKET_SAMPLES` empties 1-day series.** Auto buckets are 1 h, and these pods report about twice an hour. Balboa's 25 buckets hold n=2 each except one (n=4), so the series collapses to one bucket. The report has no sparklines and no trend ("no trend available"), and nothing can open an event window. DO reads "Outside baseline in 0% of the period's series buckets" while its median is 0.00 mg/L against a 3 mg/L minimum. PCH keeps 6 of 24 buckets. | High | `buildReportInput.ts` (`MIN_BUCKET_SAMPLES` vs auto bucket width) | New |
| 5 | Algalita Pod | 1 d, 7 d, 30 d | **One spike sets the cover status.** pH min 2.07 (1 d) and max 12.62 (7 d, 30 d) in seawater. Both pass the 0-14 plausibility rail, both sit in 4% or fewer of buckets, and each alone sets Action Required through `exceedance`. The table's own "Out of range 4%" undercuts the cover. Q1's spike guidance reaches the chat prompt, not the report. | Medium | `types.ts` (`flagFor` on min/max), `devices/plausibility.ts` | New |
| 6 | Old Woman Creek 2026, PCH Public Dock Buoy | 30 d | **The off-scale turbidity check reads only the mean.** Max 3004 (OWC) and 2939 (PCH) are far past `OFF_SCALE_INDEX` 1005, yet both print "Moderate" with no "(off-scale)". The means (746.6, 435.2) blend a ≈2,800 regime with a later run of zeros (median 0), so "Moderate" describes neither, and "falling across the period" describes a sensor change. These values vary, so Q4's zero-variance rule would not catch them. | Medium | `referenceRanges.ts` (`isOffScaleTurbidity` callers), `narrative.ts`, `renderPdf.ts` (`flagCellText`) | New |
| 7 | Marina Park, Balboa, PCH, Algalita, OWC | 11 of 15 | **Turbidity is 0 in almost every report.** It is labelled "Clear (all zero)" with the missing-sensor caveat. Algalita 30 d (max 17.9, mean 0.03, two distinct bucket values) escapes `isAllZeroTurbidity` because one bucket is nonzero, so it prints plain "Clear" with no caveat. | Medium | `referenceRanges.ts` (`isAllZeroTurbidity` is exact-zero) | Q4 |
| 8 | Old Woman Creek 2026 | all | **Limits at the sensor floor.** DO 0-12, pH 0-10, conductivity 0-100000, ORP 0-800. Readings can never go below the minimum, so a DO stuck at 0 passes (finding 1). | Medium | registry data; `operatorThresholds.ts` | Q5 |
| 9 | Old Woman Creek 2026 | 1 d, 7 d | **Blind-spot and provenance notes disappear with the row.** `baselineNote` is printed only in Section 3, which omits Normal rows with an unknown or flat pattern. OWC's "excursions below the configured dissolved oxygen minimum (0) cannot be detected" warning never reaches the PDF, even though `generate_report` does return it. Among the rows that do print, only temperature carries a provenance sentence. | Medium | `narrative.ts` (`heldSteady` filter), `buildReportInput.ts` | New (Q5-adjacent) |
| 10 | Balboa Yacht Basin Buoy | 1 d, 7 d, 30 d | **Magnitude words scale with the limit's width.** DO falling from a 3 mg/L minimum to 0.00 mg/L is written "slightly below it", because the overshoot is 3 against the 3-27 width (12.5%). Q5 flags only limits wider than the sensor range, and 3-27 is inside 0-30, so Q5 would not catch this. | Medium | `narrative.ts` (`magnitudeWord`) | New |
| 11 | Old Woman Creek 2026 | 1 d, 7 d | **Normal-summary boilerplate claims rhythms.** It says "diel and tidal rhythms tracked the site baseline throughout", but every parameter was tagged `unknown`. | Medium | `narrative.ts` (Normal branch) | New |
| 12 | Algalita Pod, Balboa Yacht Basin Buoy, OWC, PCH | 30 d | **Possible earlier-site readings (unconfirmed).** Algalita conductivity daily means are 10-22k µS/cm from 08-28 to 09-05, then ≈50k after a gap. That window is the High Stormwater event and part of the conductivity Exceedance. Balboa conductivity is 91-255 µS/cm (freshwater-like) from 09-01 to 09-05, in a marine basin. OWC and PCH turbidity sits at ≈2,800, then drops to 0 after a multi-day gap. The PDF prints only the newest GPS fix, so the report cannot show whether these came from another site. The query layer's "Earlier readings from this site were NOT included" note (OWC, PCH) is also dropped by the report. | Medium | `buildReportInput.ts` (single newest `position`) | Q3 |
| 13 | Marina Park | all | **Limits that do not fit the site.** DO 3-10 mg/L against readings of 9-28 mg/L, and conductivity minimum 40000 against 30-38k µS/cm. DO is out of range in 93-100% of buckets and conductivity in 100%, so every range is Action Required. The "persistent" wording points at the limits, correctly. DO of 20-28 mg/L is ≈250-350% saturation, which suggests a sensor fault as much as the limits. This is registry data, not code. | Medium | registry data (none in code) | New (operator) |
| 14 | all | all | **Dates are UTC and unlabelled.** Generated at 18:30 PDT on 09-25, the reports print Report Date 2026-09-26 and periods ending 09-26. Event windows ("2026-09-24 06:00") have no zone. "Last 1 day" prints as "2026-09-25 to 2026-09-26", which reads as two days. | Low | `buildReportInput.ts` (`reportDate`, date slicing), `renderPdf.ts` (`formatTs`) | New |
| 15 | Balboa Yacht Basin Buoy, PCH Public Dock Buoy | 30 d | **"4. Event Detection" heading orphaned at the foot of page 2.** `sectionHeader` reserves 34 pt, but the first event block needs 90. | Low | `renderPdf.ts` (`sectionHeader` / event loop `ensureSpace`) | New |
| 16 | Balboa Yacht Basin Buoy | 30 d | **Sparklines bridge reporting gaps.** A straight line spans the 8-day silence from 09-14 to 09-22 and reads as steady measured values. | Low | `renderPdf.ts` (`drawSparkline`) | New |
| 17 | Balboa Yacht Basin Buoy | 1 d, 7 d | **A parameter with no readings drops out of Section 2.** Conductivity (every reading implausible) has no row. Only a Data Quality note mentions it, lowercase after a full stop ("… usable. no readings at all for: …"), and the summary is silent. | Low | `renderPdf.ts`, `buildReportInput.ts` (`buildDataQuality`) | New |
| 18 | Balboa Yacht Basin Buoy, PCH Public Dock Buoy | 1 d, 30 d | **A verdict beside "0%".** ORP Exceedance with Out of range 0% (Balboa 30 d), and ORP Elevated at 0% (PCH 1 d). Flags use reading extremes, while the share uses bucket means. The footnote explains this, but the pairing still reads as a contradiction. The same split gives sparkline high/low labels (14.83/0.06) that differ from the table's max/min (15.42/0.00). | Low | `types.ts` (`outOfRangeShare`), `renderPdf.ts` | New |
| 19 | all | all | **Temperature noise floor uses °F in a °C formula.** `flagFor` passes the °F reading to `probeAccuracy("temperature", …)`, whose docstring says the input must be Celsius. At 75 °F the effect is about 0.3 against 0.36 °F. This is latent, not visible in the reports. | Low | `types.ts` (`flagFor`), `referenceRanges.ts` | New |
| 20 | all | all | **Rounding and range formatting.** ORP and DO print two decimals ("687.55 mV") where the probe is ±1 mV. Limits print as "min-max", so a negative registry minimum would read "-200-400". `status_reason` already switched to "to", but the PDF did not. No pod in scope has a negative limit today. | Low | `types.ts` (`statValue`), `renderPdf.ts`, `narrative.ts` | New |

### Notes on coverage

- **Q4** (stuck runs at 0 or 1005) covers findings 1, 2 and 7 as scoped. Finding 6 is a
  varying off-scale run, which a zero-variance rule would miss. Finding 9 decides whether a stuck
  sensor's row is even visible, so the Q4 fix may need it.
- **Q3** would answer finding 12 by splitting on coordinates. The report still prints one
  coordinate pair, so if Q3 keeps earlier sites on request, the PDF will need to say which site
  it covers.
- **Q5** covers finding 8. Findings 9 and 10 are about wide limits that sit inside the sensor
  range, which Q5's rule does not reach.
- **New, highest value first:** 3 (reading age in the PDF), 4 (thin 1-day series), 5 (spike-driven
  status), 6 (off-scale by max).

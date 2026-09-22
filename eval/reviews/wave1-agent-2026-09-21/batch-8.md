# Batch 8 - precedence, oxygen tables and drift checks

Read-only reviewer: `/root/batch2`.
Parent-consolidated report preserving condition coverage and source evidence.
PH/DO/TBY/MP/FIELD abbreviate the corresponding USGS pH, dissolved-oxygen, turbidity, multiparameter and field-measurement PDFs.
EPA = `epa-sop-field-instrument-calibration-2010.pdf`; PROMPT = `src/prompt/systemPrompt.ts`.

## precedence-ph-river-range-not-pod-limit - EDIT

- T1 MC1-2 supported: PH:343-347 describes rivers generally at 6.5-8.5, not pod limits.
- T1 MC3 supported by PROMPT:203-204 but unverifiable as a deployment fact: unavailable limits do not establish absent configuration.
- T1 MC4, MN1/MN2/MN4 supported by PROMPT:199-204 against applying background ranges as configured limits.
- T1 MN3 supported: `IpH_probe.pdf`:2 gives the instrument's 0-14 span, not an acceptable-water band.
- T2 MC1-2/MC4, MN2/MN4 supported: PH:337-344 distinguishes groundwater 6.0-8.5 from river 6.5-8.5 descriptions.
- T2 MC3 policy-supported but factually unverifiable for the same configuration issue.
- T2 MC5, MN1/MN3 supported against deriving alarms solely from descriptions, not against independently justified project criteria.

The source list is appropriate; the probe sheet is optional evidence for the distractor.
Follow-up coherence is sound.
Replace “no threshold is configured” with “the configured threshold is unavailable here”; reconcile the prompt's same overstatement separately.
This recommendation distinguishes policy compliance from factual grounding rather than claiming the existing rubric contradicts the current policy.

## precedence-turbidity-groundwater-background-not-pod-limit - EDIT

- T1 MC1-2, MN2 supported: TBY:1732-1738 gives generally below 5 and observed up to 19 in some settings, not criteria.
- T1 MC3, MN3 supported by PROMPT:205-208's application treatment as an uncalibrated relative index, not established from unidentified hardware or corpus manuals.
- T1 MC4 policy-supported, factually unverifiable as absent configuration.
- T1 MC5, MN1/MN4 supported by the policy and unavailable pod limits.
- T2 MC1-2, MN2/MN4 supported: TBY:1734-1738 says contaminated systems can be considerably higher without a numeric contamination cutoff.
- T2 MC3 policy-supported with the same hardware-evidence distinction.
- T2 MC4 policy-supported, factually unverifiable.
- T2 MC5, MN1/MN3 supported against inventing a pod alarm from these observations.

TBY supports groundwater background; it does not independently establish this deployment's calibration or configuration.
The follow-up is coherent.
Label the qualitative-index treatment as application policy and distinguish unknown limits from absent limits.
Remove the notes' claim that a numeric turbidity threshold can never exist merely because the tool exposes none.

## precedence-do-hypoxia-qa-trigger-not-pod-limit - EDIT

- T1 MC1 supported narrowly: DO:1422-1429 uses “hypoxic to anoxic (concentration less than 1.0 mg/L)” in optical-sensor verification, not a universal ecological definition.
- T1 MC2 supported with strict below-1.0 boundary: DO:1088-1094,1425-1429 requires an instrument-specific rating/side-by-side verification.
- T1 MC3 policy-supported but deployment fact unverifiable.
- T1 MC4, MN1/MN2/MN4 supported by verification context and PROMPT:199-204.
- T1 MN3 supported: `Industrial-DO-probe.pdf`:1 gives the 0-100 mg/L measurement span.
- T2 MC1 supported with strict inequality; MC2 supported by DO:1430-1432's Rhodazine D range 0.025-1.0 mg/L.
- T2 MC3 policy-supported but factually unverifiable.
- T2 MC4, MN1-4 supported against deriving an alarm from the verification trigger.

DO supports both turns; the probe sheet supports only the span distinction.
Follow-up coherence is sound.
Attribute the hypoxic wording to this verification discussion, retain below rather than at/below, condition optical advice on sensor type, and distinguish unavailable configuration from no configuration.

## crossdoc-two-oxygen-tables-disagree - EDIT

- T1 MC1 supported: DO:3233-3260,3682-3722 gives 9.09 mg/L at 20 °C/760 mmHg.
- T1 MC2 supported: EPA:762-765,785 gives 9.06 for the same conditions.
- T1 MC3, MN2 ambiguous if universally insignificant: the difference is 0.03 mg/L; significance depends on the relevant tolerance.
- T1 MC4 supported: DO:1738-1743 attributes the tables to Benson and Krause.
- T1 MC5 supported as a stabilization comparison: FIELD:424-425 and MP:719 give ±0.2 mg/L, not proof of equivalent accuracy.
- T1 MC6/MN4 supported as protocol-consistency inference: EPA:368-372 and DO:567-573 direct their own chart/table checks; neither endorses averaging.
- T1 MN1/MN3 supported by the explicit comparison and verified cells.
- T2 MC1/MC4 supported: EPA:810,821,872 reaches 45 °C and 690 mmHg.
- T2 MC2/MC3 supported: DO:5375,5423,8842 reaches 40 °C and 600 mmHg.
- T2 MC5 supported as a bounds inference but should allow neither table to cover simultaneous >40 °C and <690 mmHg.
- T2 MC6 supported for these documents: DO:8891-8894 supplies salinity factors, absent from the EPA chart and its salinity search.
- T2 MN1-3 supported by printed bounds; DO:1743-1750 permits supported generated values outside the printed table, not invented printed entries.

All listed sources are relevant, but DO:567-573 itself provides the more relevant ±0.2 mg/L saturation-check tolerance, so FIELD is not essential.
Follow-up coherence is sound.
Compare the difference to a named routine check tolerance, distinguish stabilization from accuracy, and accept supported alternative evidence.
Explicitly recognize the uncovered combined high-temperature/low-pressure case.

## probecal-end-of-day-check - EDIT

- T1 MC1-2, MN1 supported for normal spot sampling: EPA:151-154 gives daily calibration and end-of-day checks.
- T1 MC3, MN3 supported: EPA:585-589 specifies measurement mode and initial standards; DO has its own check at 595-598.
- T1 MC4 supported: EPA:590-593 requires qualification when the instrument check, not the environmental reading, exceeds criteria.
- T1 MC5 ambiguous without corrective recalibration: EPA:156-157 only limits qualification to pre-check data in that corrective context.
- T1 MN2 contradicted absolutely: EPA:166-168 exempts instruments calibrated at each location; 162-164 gives deployment/recovery checks for continuous sondes.
- T2 MC1-2 supported: EPA:607-610 gives default ±0.5 mg/L saturation and ±0.3 pH in pH 7 buffer; OCR damages plus/minus glyphs.
- T2 MC3/MC5 supported: EPA:603-604 defers to QAPP or sampling/analysis criteria.
- T2 MC4 supported with conditions: PH:1140-1144 gives daily and nearby-buffer rechecks at ±0.05 with temperature proximity.
- T2 MN1/MN3 supported by source-specific tolerances; MN2 supported against invented criteria.

Sources and follow-up coherence are appropriate; MP is supplementary.
Make the cadence conditional, preserve exemptions and successful midday correction, and distinguish retrospective drift qualification from recalibration checks.
The question also asks about oxygen under USGS, but the rubric only compares pH; DO:567-573 supplies relevant oxygen verification evidence that should receive credit.

## Checks and limits

Reviewer inspected application policy, numeric table headers/cells, calibration cadence and alternative DO/MP tolerances, plus bounded cross-corpus searches for thresholds, hypoxia and salinity.
No source established actual pod configuration or technology.

# Batch 4 - conductivity definitions, standards and compensation

Read-only reviewer: `/root/batch3`.
Parent-consolidated report preserving condition coverage and source evidence.
SC = `usgs-nfm-a6.3-specific-conductance.pdf`; T = `usgs-nfm-a6.1-temperature.pdf`; MP = `usgs-nfm-a6.8-multiparameter-instruments.pdf`; EPA = `epa-sop-field-instrument-calibration-2010.pdf`; EC = `EC_K_1.0_probe.pdf`.

## deepmanual-ec-standard-choice - EDIT

- T1 MC1 supported for DIW by SC:780-784, “Do not calibrate using DIW”; extending the wording to distilled water is an inference.
- T1 MC2 supported: SC:705-710 recommends above 200 µS/cm to reduce contamination/dilution problems.
- T1 MC3-4 supported: SC:674-677 lists 500/1,413/12,900; 759-767 describes nearby one-point or bracketing multipoint standards.
- T1 MN1 supported by the DIW prohibition; MN2 ambiguous if it excludes every unlisted certified standard, since SC:617-625 describes traceable standards across 50-50,000 µS/cm.
- T1 MN3 supported: SC:589-601 requires checks/calibration before trips despite infrequent recalibration.
- T2 MC1-2 supported: SC:782-784 gives DIW below 3 µS/cm, so 6 fails that check.
- T2 MC3 and MN1-3 supported: SC:611-614 permits a dry-cell-in-air or DIW zero-response check; this is not calibration or proof of a particular fault.

SC supports both turns and their coherent follow-up.
T1 asks about zeroing but omits the important permitted zero-response check from its rubric.
Explicitly distinguish checking from calibration, and replace the closed example list with supported certified, instrument-compatible standards.
EPA:418-425 and MP:432-434 are legitimate supplementary standard-selection evidence.

## followup-cleaning-the-salt-sensor - KEEP

- T1 MC1 supported: SC:1347 gives detergent first, then 5-percent HCl if necessary.
- T1 MC2-3 supported: SC:543-547 specifies 5% v/v HCl and checking manufacturer guidance before acid.
- T1 MC4 supported with material qualification: SC:548-551 prohibits etching chemicals for platinum/platinum-iridium electrodes.
- T1 MN1 supported against unsupported chemicals; MN2 supported against scouring platinum coatings at SC:521, not all gentle mechanical cleaning.
- T1 MN3 supported as relevance to the requested manual guidance; MN4 supported by manufacturer checks.
- T2 MC1-2 supported: SC:543-547 gives up to two hours and thorough DIW rinsing.
- T2 MC3 supported as the practical implication of checking manufacturer instructions, not a separately quoted universal precedence rule.
- T2 MN1-3 supported by the bounded acid procedure; MN4 supported by the acid-clean context; MN5 supported because `IORP_probe.pdf`:313-319 gives a different ORP-specific 5-10%/few-minute procedure.

SC supports the complete coherent answer.
Preserve 5% v/v, the maximum rather than mandatory duration, and electrode-material conditions.
SC:518-520 and EC:180-189 permit gentle cleaning for some materials; do not ban it universally.
Actual acid compatibility still depends on the unidentified sensor's manufacturer.

## probecal-ec-never-recalibrate - EDIT

- T1 MC1 supported: EC:148-151 says graphite does not change and recalibration is unnecessary; SC:599-601 says frequent recalibration is generally unnecessary.
- T1 MC2-3 supported: SC:589-598 requires trip and laboratory/field checks; the in-situ procedure beginning at 936 requires field-site verification.
- T1 MC4 supported: SC:595-598 gives ±5 µS/cm at/below 100 and ±3% above 100.
- T1 MC5 supported: SC:848-853 directs recalibration after failed standard checks.
- T1 MN1-2 supported by those verification rules; MN3 supported against invented criteria.
- T2 MC1 supported: SC:615-618 requires traceable KCl standards.
- T2 MC2-3 supported: SC:759-767 supports nearby/bracketing standards and 705-710 recommends above 200.
- T2 MC4 ambiguous if exclusive: 500 is nearest among SC:674-677 examples, but 617-625 permits a wider certified range and 759-767 requires meter compatibility; “700” also lacks units.
- T2 MC5 supported: SC:848-853 applies acceptance to the check standard's value.
- T2 MN1 supported by DIW prohibition; MN2 supported as a recommendation here, not an absolute ban on instrument-supported lower standards; MN3 ambiguous if it forbids all unenumerated certified values.

All listed sources are relevant, but EPA:450-465 uses manufacturer specifications rather than independently supplying every USGS numerical condition.
Follow-up coherence is sound.
Add µS/cm, make 500 or 500/1,413 examples rather than exclusive answers, preserve meter compatibility and recommendation wording, and apply the percentage criterion to the standard.

## definitional-what-per-centimetre-means - EDIT

- T1 MC1 supported: SC:319-325 defines conductance in siemens as inverse resistance.
- T1 MC2 ambiguous mathematically: SC:324-330 gives conductivity as conductance multiplied by plate spacing/area, not divided by both dimensions.
- T1 MC3 supported for specific conductance at 25 °C by SC:306-318, not every reading labeled µS/cm.
- T1 MC4 contradicted unconditionally: SC:297-305 explicitly says conductivity is not always referenced to a standard temperature; the unit alone cannot identify compensation.
- T1 MN1 supported by geometry normalization; MN2 supported against inventing this instrument's cell constant; MN3 supported as relevance to definitions; MN4 supported because normalization does not require physical heating/cooling.
- T2 MC1-2 supported: SC:330-333 equates S/cm and mhos/cm and dates the older terminology.
- T2 MC3-4 supported: SC:295-305 requires matching temperature/reference basis.
- T2 MN1 supported against a fabricated nonunit conversion but must permit factor 1; MN2-3 supported by equivalence and temperature caveats.

SC supports both coherent turns; EPA:414-416 corroborates the distinction.
Correct the geometry formula and distinguish conductivity from temperature-corrected specific conductance.
Replace the unconditional temperature-invariance promise with the purpose and limitations of compensation.

## crossdoc-conductivity-rise-with-warming - EDIT

- T1 MC1-2 supported: SC:334-336 gives 0.5-3% per °C depending on ions.
- T1 MC3-4 supported for the linear method: SC:343-358 uses temperature minus 25 and 0.019-0.020 per °C, while also allowing nonlinear compensation.
- T1 MC5 supported: SC:338-354 uses 25 °C reference.
- T1 MC6 ambiguous/overstated: SC:363-365 says typical ±5% accuracy over 5-35 °C/pH 4-11, not universal invalidity outside that envelope; SC:1270-1279 permits verified alternatives.
- T1 MN1-2 supported by variable response/documented coefficients; MN3 supported because SC:297-301 still requires temperature context.
- T2 MC1 supported: T:469-474 requires ≤±0.2 °C for bundled compensation sensors.
- T2 MC2 supported: T:630-644 distinguishes verification from adjustment.
- T2 MC3 supported: MP:407 and T:636-644 require certified/traceable references.
- T2 MC4 supported: SC:460-463 links faulty thermistors to erroneous compensated values.
- T2 MN1-3 supported by that accuracy, verification and relevance guidance.

The three sources collectively support the coherent answer; all three need not be cited when one already establishes a particular point.
Allow source-supported nonlinear explanations and describe the typical accuracy envelope correctly.
Check whether the output is already compensated before attributing its change to warming.

## Checks and limits

Reviewer searched all 14 extracted sources in text mode for standards, zero response, DIW, cleaning chemicals/times, thermistors and compensation, then read bounded USGS/EPA/vendor passages and current grounding policy.
No sensor identity, settings or acid compatibility was assumed.

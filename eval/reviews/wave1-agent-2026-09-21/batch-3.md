# Batch 3 - pH calibration and low-conductance measurements

Read-only reviewer: `/root/batch3`.
Parent-consolidated report preserving condition coverage and source evidence.
PH = `usgs-nfm-a6.4-ph.pdf`; SC = `usgs-nfm-a6.3-specific-conductance.pdf`; MP = `usgs-nfm-a6.8-multiparameter-instruments.pdf`; FIELD = `usgs-nfm-a6.0-field-measurement-guidelines.pdf`; EPA = `epa-sop-field-instrument-calibration-2010.pdf`.

## probecal-ph-what-solutions - KEEP

- T1 MC1-2 supported: PH:1230-1239 requires two/three-point calibration and rejects single-point calibration.
- T1 MC3-4 supported: PH:1036-1062 requires bracketing and lists 1.68/4.01/7.00/10.01.
- T1 MC5 supported: PH:684-691 requires traceability and unexpired buffers.
- T1 MN1 supported by the single-point prohibition; MN2 supported against invented standards, but PH:1349-1357 allows other buffers for unusual ranges or manufacturer requirements.
- T1 MN3-4 supported: PH supplies the procedure; `IpH_probe.pdf`:309-315 supplies frequency, not buffer calibration.
- T2 MC1 supported: PH:1054-1056 requires at least pH 7 and 10.01 for expected 7-8 samples.
- T2 MC2 supported: PH:1248-1249 starts with 7 if the meter gives no order.
- T2 MC3 supported: PH:1063-1085 recommends buffers within ±10 °C, with an office-calibration alternative.
- T2 MC4 supported: PH:1282-1287 and table 6.4-3 at 702-720 require temperature-specific buffer values.
- T2 MN1-3 supported by those bracketing/temperature provisions.

PH supports both complete answers; EPA:247-260 is valid supplementary bracketing/container evidence, not a substitute for every USGS-specific detail.
Follow-up coherence is sound.
Preserve recommendation wording and allow legitimate alternate buffers and temperature-corrected values.

## probecal-ph-slope-acceptance - EDIT

- T1 MC1-3 supported for PH:1014-1031,1298-1307: slope is percent theoretical response, 56.2-59.8 mV/pH at 25 °C, or 95-101 percent.
- T1 MC4 supported: PH:1032-1033 gives 1-2 minutes in standard buffers.
- T1 MN1 supported against invention, but MP:1061 independently gives 95-102 percent.
- T1 MN2 supported: measured performance governs fitness, not the approximate lifespan in `IpH_probe.pdf`:142.
- T1 MN3 supported by the explicit 25 °C qualification.
- T2 MC1-2 supported: PH:1298-1307 places 92 percent outside range and directs cleaning then recalibration.
- T2 MC3 ambiguous unconditionally: PH:789-796 says gel-filled electrodes need no filling and cannot readily have gel reconditioned/replaced; 804 conditions filling on refillability.
- T2 MC4 ambiguous unconditionally: PH:883-892 describes liquid-filled reconditioning under manufacturer instructions.
- T2 MC5 supported for that liquid-filled sequence: PH:945-951 and 1358-1361 prohibit use after failed restoration; a universal reconditioning sequence is overprescriptive.
- T2 MN1 supported under both accepted percent ranges.
- T2 MN2 ambiguous as an absolute: PH:780-786 includes broken glass/bodies/cables for which cleaning before replacement is not sensible.
- T2 MN3 supported against inventing a separate replacement threshold.

The notes accept MP's 95-102 alternative while mandatory lines fix PH's 95-101 and corresponding millivolts.
Choose PH explicitly in the question or allow branch-specific standards and citations without imposing PH's mV equivalence on MP.
Condition fill-hole/refill/reconditioning instructions on design and permit replacement of damaged or unserviceable electrodes.
Follow-up coherence is sound.

## probecal-buffer-handling - KEEP

- T1 MC1-3 supported: PH:732-735 prohibits stock-bottle immersion and requires decanting/disposal; 694-695 prohibits returning used buffer.
- T1 MC4 supported: PH:1123-1131 requires a secondary field bottle labeled with pH/lot/expiry.
- T1 MN1-2 supported by those contamination prohibitions; MN3 supported because calibration standards differ from electrode-storage solutions at 952 onward.
- T2 MC1 supported: PH:1250-1254 refreshes capped field bottles before each trip.
- T2 MC2 supported: PH:691 prohibits expired buffers.
- T2 MC3-4 supported: PH:753-758 protects against heat/freezing and discards compromised buffer.
- T2 MC5 supported: PH:1240-1243 records temperature, corresponding buffer pH, lot and expiry.
- T2 MN1 supported against invented numeric shelf lives; MN2 supported by temperature protections; MN3 supported against invented storage-temperature ranges.

PH fully supports both answers; EPA is supplementary.
The coherent follow-up concerns decanted stock, not already used aliquots.
No material defect found; absence checks do not supersede manufacturers' labels.

## crossdoc-soft-water-ph-wont-settle - EDIT

- T1 MC1 ambiguous: PH:1677-1684 supports low conductance as a cause, but “55” lacks units and a new probe is not proven fault-free.
- T1 MC2-3 conditionally supported if 55 means µS/cm: that passage explains conductivity, ionic-strength differences and junction potentials.
- T1 MC4 supported: PH:550-562 lists suitable electrode types.
- T1 MC5-7 supported: PH:1696-1707 gives the KCl method, approximately +150 µS/cm and pH change below 0.01, after ordinary methods fail.
- T1 MC8 supported: FIELD:1115-1118 says not to stir pH samples below 100 µS/cm.
- T1 MN1 ambiguous if universal: PH:1716-1722 permits gentle swirling to dissolve KCl; target untreated-sample stirring instead.
- T1 MN2 supported by 20 mg/250 mL and approximately +150 µS/cm; MN3 supported against a failure-only diagnosis; MN4 supported by PH:1692-1695 on easily contaminated low-ionic-strength buffers.
- T2 MC1-2 supported as form text but ambiguous for the asked buffer check: MP:1059 labels calibration criteria ±0.1, or ±0.3 below 75 µS/cm.
- T2 MC3 ambiguous: estuary conductance is unspecified and this form does not establish distinct PH buffer-check tolerances.
- T2 MC4 supported: PH:1363-1372 requires final-buffer agreement within 0.05 at calibration temperature.
- T2 MN1 contradicted as an absolute ban on applying one tolerance at both sites: PH's 0.05 buffer check can legitimately apply to both.
- T2 MN2 supported against inventing the form's threshold, while separately attributed 100 µS/cm low-conductance guidance remains valid.
- T2 MN3 supported: MP:709-720 separately identifies stabilization criteria.

All listed sources are relevant, but distinct calibration/stabilization/drift checks need explicit separation.
EPA:582-612 adds a separate end-of-day criterion, not a resolution of every discrepancy.
Add µS/cm, describe low ionic strength as a likely cause, and distinguish KCl swirling from untreated-sample stirring.
Rewrite T2 to compare the named MP example form with PH's final-buffer check, or accept ±0.05 at both sites for the existing question.

## crossdoc-acid-drainage-conductivity-suspect - KEEP

- T1 MC1-4 supported: SC:365-373 describes errors as large as 50 percent below pH 4, hydrogen-ion transport and temperature compensation.
- T1 MC5-6 supported: SC:1270-1278 compares in-situ with a 25 °C sample, using ±5 µS/cm at/below 100 and ±3 percent above 100.
- T1 MC7 supported: SC:1314-1317 records nonstandard compensation factors in comments.
- T1 MN1-3 supported against invention, blanket assurance, or an explanation omitting the relevant compensation issue.
- T2 MC1 supported for pH 3.2: PH:460-461 calls for pH 1.68 or 2 standards in acidic water.
- T2 MC2 supported: PH:1159-1167 gives the procedure's pH range with other conditions.
- T2 MC3-4 supported: PH:1019-1024 requires bracketing and temperature proximity.
- T2 MC5 supported: PH:1668-1674 checks the nearest buffer and recalibrates beyond 0.05.
- T2 MN1-2 supported by bracketing and documented tolerances; MN3 supported against relying only on conductivity evidence for pH instructions, not against supplementary conductivity citations.

The source list supports the coherent two-turn answer; EPA:247-256 is legitimate supplementary bracketing evidence.
The source establishes a possible error, not that compensation necessarily caused the observed direction.
Condition “normal buffers” on the operator actually using 4/7/10.

## Checks and limits

Reviewer searched all 14 documents for calibration, buffers, storage/expiry, slope, low ionic strength, 75/100 thresholds and low-pH compensation, then inspected bounded passages.
Relevant searches were repeated in text mode for the NUL-bearing ORP document.
No prior review, external sources, model outputs or file mutations were used.

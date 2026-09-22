# Batch 5 - ORP definitions, checks and sampling

Reviewed inline by the parent after `/root/batch3` hit its usage limit before submitting a complete report.
Preliminary worker findings were independently checked against source text; they are not counted as a second completed review.
ORP = `usgs-nfm-a6.5-orp.pdf`; FIELD = `usgs-nfm-a6.0-field-measurement-guidelines.pdf`; MP = `usgs-nfm-a6.8-multiparameter-instruments.pdf`; EPA = `epa-sop-field-instrument-calibration-2010.pdf`.

## definitional-eh-versus-the-millivolts-we-log - KEEP

- T1 MC1-2 supported: ORP:54-68 defines Eh relative to the standard hydrogen electrode and equilibrium at a noble-metal/water boundary, while warning many natural-water readings are not equilibrium values.
- T1 MC3-4 supported: ORP:371-395 describes adding the reference half-cell potential to measured potential, “Eh = emf + Eref.”
- T1 MN1 supported by that distinction; MN2 supported because hardware/reference/temperature are unspecified; MN3 supported because a vendor electron-activity description does not supply the requested SHE distinction.
- T2 MC1-2 supported: FIELD:434 explicitly says “Eh is not considered to be a routine or direct field measurement,” and table 6.0-1 omits it.
- T2 MC3 supported: FIELD table 6.0-1 at 416-432 lists temperature, SC, DO, pH and turbidity.
- T2 MN1 supported against inventing an Eh row or unsupported time; ORP:503-517 nevertheless supplies its own stabilization/timing procedure and must remain permissible.
- T2 MN2-3 supported: ORP:493-550 describes measurement and recording, disproving both inability to measure and worthlessness.

Sources/citations support both turns and follow-up coherence is sound.
Maintain the qualification that converting a raw voltage does not guarantee a natural sample has a single meaningful equilibrium Eh.
No material rubric defect found.

## deepmanual-zobell-check - EDIT

- T1 MC1 supported: ORP:241-263 and 344 onward require equipment testing with ZoBell before field use.
- T1 MC2/MC4 supported: ORP:369-382 gives stabilization within ±5 mV, adding the reference potential, and calculated agreement within 5 mV.
- T1 MC3 supported: ORP:341 gives 430 mV at 25 °C in table 6.5-3.
- T1 MN1-3 supported by the actual tolerance, equipment-test procedure and distinction between reference potential and calculated Eh.
- T2 MC1 supported: ORP:369-370 gives 15-30 minutes for the standard and sensors to equilibrate.
- T2 MC2-3 supported for field samples but ambiguous for this follow-up: ORP:509-517,563-570 describes field stabilization and recording drift when a field sample does not stabilize, whereas “that” refers to the standard check in T1.
- T2 MN1 supported against invented time; MN2 supported against reporting an unstabilized value as settled.
- T2 MN3 ambiguous as a compulsory field-data rule for a failed standard check; ORP:380-382 directs a failed equipment check to troubleshooting instead.

ORP contains all quoted rules, but the follow-up conflates equipment verification with field-sample behavior.
Ask separately about field readings, or grade T2 as a failed standard check requiring troubleshooting and withholding a pass.
The rubric must not let a drifting standard count as a completed field-ready test merely because its drift was recorded.

## probecal-orp-standard-check - EDIT

- T1 MC1-2 supported: ORP:144-151,369-370 specifies ZoBell and 15-30 minute thermal equilibration.
- T1 MC3 supported: ORP:373-377 adds the appropriate reference potential.
- T1 MC4 supported: ORP:323-341 gives temperature-dependent values and 430 at 25 °C.
- T1 MC5 supported: ORP:377-382 gives the 5 mV pass criterion.
- T1 MN1-3 supported for the stated ZoBell-Eh comparison; MN4 supported: ORP:146-148 does not recommend quinhydrone and says its temperature behavior is less well defined.
- T2 MC1 supported: ORP:674-680 lists out-of-5-mV, drift and erratic readings as troubleshooting symptoms.
- T2 MC2-3 supported for separately accessible compatible reference electrodes: ORP:683-689 describes a known-good same-type electrode comparison and 0±5 mV.
- T2 MC4 ambiguous/overgeneralized: ORP:689-691's 44±5 mV is specifically for the Ag:AgCl and Hg:HgCl2 pair, not arbitrary dissimilar reference electrodes.
- T2 MN1 supported because 20 exceeds the cited window; MN2 supported against invented diagnostic values; MN3 supported because the diagnostic procedure is in ORP, not the vendor sheet.

ORP supports the intended procedure and coherent follow-up; EPA is a legitimate alternative protocol but does not independently supply all USGS-specific conditions.
Name the particular dissimilar pair and condition component swapping on accessible, compatible reference hardware.
Do not instruct the operator to disassemble an unidentified sealed combination probe; ORP's manufacturer guidance and design-specific instructions govern applicability.

## crossdoc-orp-sliding-do-steady - EDIT

- T1 MC1 supported by ORP's equipment test and MP:842-843's failed-ZoBell temperature check.
- T1 MC2-4 supported: ORP:273-276,323-341 gives temperature tables, interpolation and 430 at 25 °C.
- T1 MC5-6 supported: ORP:369-382 gives thermal equilibration and the calculated-Eh 5 mV acceptance criterion.
- T1 MC7 contradicted as an approximately 90-day expiry: ORP:149-151 says “stable for at least 90 days if kept chilled at 4°C.”
- T1 MN1-2 supported by temperature-specific values/tolerance; MN3 supported as the requested instrument check rather than assumed organic loading; MN4 supported by ORP:146-148's quinhydrone limitation.
- T2 MC1 supported for optical DO by FIELD:424-425,510-516.
- T2 MC2 ambiguous/overstated: 0.3 variability exceeds the table's stated 0.2 criterion under its consecutive-reading interpretation, but does not by itself prove sensor noise, identify sensor technology, or establish permanent nonreportability.
- T2 MC3 supported as one route, not exclusive: FIELD:534-542 allows extra equilibration and final-five median or documented professional selection of a representative final reading.
- T2 MC4 supported: FIELD:521-532 distinguishes final-three surface-water and final-five groundwater medians.
- T2 MC5 supported: FIELD:434 omits Eh, while ORP:503-517 supplies its own potential-stability sequence.
- T2 MN1 supported against invention; MN2 supported for variability exceeding the stated criterion, but should clarify what “spread” means rather than confuse a total range with a ± band.
- T2 MN3 supported for the named median routes, not as a ban on FIELD's documented alternative judgment route; MN4 supported because the DO tolerance is not an ORP criterion.

The source list collectively supports the coherent channel-switch follow-up.
Change the expiry requirement to the actual minimum demonstrated stability, and require an appropriate reference-potential correction before comparing a raw ORP number with 430 mV.
Distinguish failed routine stability from proof of noise or a blanket prohibition on qualified reporting.

## crossdoc-bailed-orp-jumping - EDIT

- T1 MC1-3 supported by FIELD:1153-1161's explicit bailed/decanted DO/Eh/temperature prohibition and atmospheric-exposure explanation.
- T1 MC4 supported by FIELD:365-369,555 onward and 959-980's in-situ distinction.
- T1 MC5 supported: FIELD:1599-1604 prohibits reducing/anoxic subsampling except under inert gas.
- T1 MC6 supported: FIELD:1026-1032 rejects suction-lift pumping for DO/Eh because of gas loss.
- T1 MN1 supported against a definitive primary hardware diagnosis; MN2 supported because faster open-beaker handling does not establish valid in-situ results; MN3 supported against an invented beaker tolerance.
- T1 MN4 ambiguous because the same source has tension: FIELD:1583-1595 explicitly includes bailer aliquots in subsamples and permits estimated/qualified reporting of Eh/DO/temperature/turbidity.
- T2 MC1-2 supported: ORP:448-467 requires in-situ/airtight flow, low oxygen permeability, airtight fittings and purging.
- T2 MC3-4 supported: ORP:485-517 distinguishes potentially >30-minute thermal equilibration from the subsequent timed stability sequence.
- T2 MC5 supported: ORP:563-568 describes slower, asymmetric response versus pH.
- T2 MC6-7 supported: ORP:711-714 reports calculated Eh to nearest 10 mV with temperature, electrode system and pH.
- T2 MN1 supported against inventing universal shorter timing; MN2 supported for published Eh precision, not against keeping more precise raw observations; MN3 supported by required metadata; MN4 supported by ORP:503-506's ±5 mV stabilization.

Both documents support the method change and coherent follow-up.
Acknowledge FIELD's explicit qualified-reporting exception rather than failing any answer that mentions it; preserve the prohibition on treating an aerated beaker as an unqualified ambient Eh measurement.
Clarify that ORP's reporting precision applies to calculated Eh, not automatically to a pod's raw reference-relative ORP series.
Do not collapse thermal equilibration and later stability observation into a single guaranteed 30-minute wait.

## Checks and limits

Parent read the ORP definitions, standard solution, verification tables/procedure, field procedure, troubleshooting and reporting sections, plus FIELD's complete stabilization and competing subsampling passages and MP's temperature-check advice.
The bailed-sample source tension is reported explicitly rather than resolved by selectively quoting one paragraph.
No unknown hardware, field chemistry or continuous-stream validity was inferred.

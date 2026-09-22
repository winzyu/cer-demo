# Batch 1 - oxygen calibration and correction

Read-only reviewer: `/root/batch1`.
Parent-consolidated report preserving condition coverage and source evidence.
DO = `usgs-nfm-a6.2-dissolved-oxygen.pdf`; EPA = `epa-sop-field-instrument-calibration-2010.pdf`; MP = `usgs-nfm-a6.8-multiparameter-instruments.pdf`.
Source line numbers follow the extraction convention in README.md.

## deepmanual-do-air-calibration - KEEP

- T1 MC1-3, MN2 supported: EPA:334-352 requires a wet sponge/towel without sensor contact and approximately 10-15 minutes for saturation.
- T1 MC4, MN3 supported: EPA:357-362 requires an on-site barometer or weather-service pressure corrected for elevation.
- T1 MC5, MN1 supported with qualification: EPA:368-372 says instrument accuracy, usually 0.2 mg/L, governs chart agreement; the extracted plus symbol is OCR text.
- T2 MC1-2, MN1-2 supported: EPA:375-380 gives less than 0.5 mg/L, and cleaning/membrane/electrolyte changes above 0.5 or for negative readings.
- T2 MC3, MN3 supported: EPA:378-398 permits adjustment for instrument/project accuracy.

EPA supports both citation lists and the source list; follow-up coherence is sound.
Retain the instrument-accuracy qualifier and distinguish saturation time from guaranteed instrument warm-up.
The source's strict less-than acceptance and above-0.5 corrective wording leave the exact boundary imperfectly specified; do not silently invent a new boundary rule.

## probecal-do-saturation-target - EDIT

- T1 MC1, MN1 supported: DO:594-603 specifies 100-percent saturation and equal sensor/thermistor temperature.
- T1 MC2-4 ambiguous as mandatory answers: DO:810-833 supports chamber water, a nonairtight seal and 5-10 minutes, but DO:739-760 also permits wet-towel and manufacturer-dependent water methods.
- T1 MC5-6, MN2 supported for USGS: DO:697-703 specifies local pressure to nearest 1 mmHg; EPA:357-362 permits elevation-corrected weather-service pressure, so the USGS-only requirement cannot also govern every EPA alternative.
- T1 MN3 supported: DO:828-833 gives 5-10 minutes and EPA:350-352 gives 10-15; invention remains prohibited.
- T1 MN4-5 supported: `Industrial-DO-probe.pdf`:169-177,251-257 describes galvanic operation and maintenance, not this calibration procedure.
- T2 MC1-2, MN1 supported for USGS Procedure 1: DO:860-870 gives ±0.2 mg/L or 2 percent and the droplet check.
- T2 MC3 supported: DO:487 lists a calibrated specific-conductance sensor for saline/brackish work.
- T2 MC4 conditionally supported, MC5 and MN2 supported: DO:723-731 makes the after-measurement preference conditional on user-specified correction and explains recalibration for changed salinity after manual correction during calibration.
- T2 MN3 supported: DO:716-735 addresses the substantive brackish-water issue.

Follow-up coherence is sound.
Specify USGS air-chamber Procedure 1, or accept branch-specific alternate procedures and citations.
The notes confuse EPA initial verification, usually ±0.2 mg/L at EPA:368-372, with end-of-day ±0.5 mg/L at EPA:594-608; correct that distinction before grading.
The citation list is advisory, not proof that every alternative citation deterministically fails.
Do not infer optical hardware from an unidentified probe; the supplied vendor sheet is galvanic.

## deepmanual-do-saturation-ceiling - EDIT

- T1 MC1 supported: DO table 6.2-2 headers at 3234-3274 and row at 3684-3724 give 9.09 mg/L at 20 °C/760 mmHg.
- T1 MC2 supported as attribution but ambiguous as an exclusive requirement: DO:3229-3231 says freshwater; the question does not select this table.
- T1 MC3 supported: DO:1738-1754 distinguishes freshwater from salinity correction.
- T1 MN1 ambiguous/overrestrictive: EPA:785 independently gives 9.06 at 20 °C/760 mmHg.
- T1 MN2 supported when prohibiting use of the datasheet to establish solubility; an incidental datasheet citation need not fail the answer.
- T2 MC1 supported: DO headers at 4517-4555 and row at 4965-5005 give 6.95 at 35 °C/760 mmHg.
- T2 MC2 supported numerically: 9.09 minus 6.95 is 2.14; “ceiling” is ambiguous if interpreted as an absolute maximum rather than equilibrium saturation.
- T2 MC3, MN1 ambiguous/overrestrictive: DO:1745-1750 endorses DOTABLES-generated individual values, not only literal table lookup.
- T2 MN2 supported: DO:1036-1041 says colder water allows more dissolved oxygen.
- T2 MN3 supported: pressure is held constant; invented corrections are unjustified.

USGS supports the intended answer and the follow-up is coherent, but the question leaves salinity and the chosen table unspecified.
Ask explicitly for freshwater equilibrium values from USGS table 6.2-2; otherwise permit supported alternate tables/calculations.

## deepmanual-brackish-do-correction - EDIT

- T1 MC1, MN2 conditionally supported: DO:1782-1786 illustrates multiplying an uncompensated concentration by a correction factor.
- T1 MC2 ambiguous: DO:11804-11823 requires specific conductance at 25 °C; row 12453-12483 gives 0.8235 for 20 °C and 50,000 µS/cm, but the question only says conductivity.
- T1 MC3 supported: DO:11789-11796 identifies the specific-conductance-based factor table.
- T1 MN1 ambiguous/overrestrictive if it prohibits justified normalization or source-endorsed calculations; DO:1745-1750 permits individual calculated factors.
- T2 MC1 ambiguous as an absolute: DO:1759-1763 defines operational saline correction above 2,000 µS/cm, while table rows 8897-8932 show a nonunity factor of 0.9961 at 1,000 µS/cm/0 °C.
- T2 MC2 supported: the zero-conductance factor is 1.0000, including DO:8928.
- T2 MC3, MN1 supported as the manual's operational definition at DO:1759-1760.
- T2 MN2 supported against universal mandatory correction, not against every optional small freshwater correction.

Follow-up coherence is sound, but actual upstream conductance is absent.
Specify 50,000 µS/cm normalized to 25 °C and an uncompensated DO reading.
Describe the operational freshwater convention without equating freshwater with zero conductivity or mathematically zero salinity effects.

## crossdoc-do-calibrated-dry-deployed-brackish - EDIT

- T1 MC1 supported: DO:594-603 establishes saturation and matching temperatures.
- T1 MC2-3, MN1 supported: DO:835-840 specifies checked barometer, nearest 1 mmHg and nearest 0.1 °C.
- T1 MC4-5, MN2 supported: DO:663-676 explains conductivity-based ionic strength and that sensors do not directly measure mg/L.
- T1 MC6 ambiguous as universal: DO:865-870 names an optical module; unidentified hardware does not establish this design, while EPA:329-332 supplies a membrane-compatible precaution.
- T1 MC7 conditionally supported, MC8 supported: DO:723-731 limits the after-measurement preference to manual correction and explains recalibration for salinity changes.
- T1 MN3 supported by DO:716-735; MN4 supported because vendor specifications do not replace DO:810-870 procedure.
- T2 MC1-4 supported: EPA:151-168 establishes daily use/end-of-day, midday qualification, and deployment/recovery checks; retain the exception for calibration at every sampling location.
- T2 MC5 supported: EPA:594-600 calls for measurement mode, DO/temperature/pressure and chart comparison.
- T2 MC6, MN2 supported: EPA:603-608 supplies defaults only when project criteria are absent.
- T2 MN1 supported: EPA:94-99 “supplements, but does not replace” analytical methods.
- T2 MN3 supported because the question selects EPA.
- T2 MN4 supported only against unsupported disagreement; documented differences such as weather-service-pressure handling remain valid to explain.

DO supports T1; EPA supports T2; MP is supplementary corroboration, not necessary evidence for every answer.
Follow-up coherence is sound.
Make optical checks conditional on technology and post-measurement preference conditional on manual compensation.
Do not treat advisory citation lists as a requirement to cite every listed document.

## Checks and limits

Reviewer searched all 14 extracted corpus texts using binary-safe searches for saturation, salinity, thresholds and target values, then read bounded DO/EPA/MP/conductivity/vendor passages.
No external sources, prior qualification findings, model answers, writes or Git operations were used.

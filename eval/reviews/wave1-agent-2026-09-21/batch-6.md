# Batch 6 - temperature, turbidity and oxygen changes

Read-only reviewer: `/root/batch1`.
Parent-consolidated report preserving condition coverage and source evidence.
T/DO/SC/PH/ORP/TBY/MP/FIELD abbreviate the temperature, dissolved-oxygen, specific-conductance, pH, ORP, turbidity, multiparameter and field-measurement USGS PDFs respectively.
EPA = `epa-sop-field-instrument-calibration-2010.pdf`.

## crossdoc-temp-sensor-drift-blast-radius - EDIT

- T1 MC1 ambiguous: EPA:122-124 conditions its affected-parameter list on probes that rely on that sensor; unspecified shared wiring/compensation is not established.
- T1 MC2 conditionally supported: SC:303-312 describes 25 °C correction, generally automatic.
- T1 MC3 supported: DO:673-676 derives concentration using temperature and ionic strength.
- T1 MC4 supported: PH:635-657 connects temperature to slope and buffer values.
- T1 MC5 supported for reference-potential dependence at ORP:485-490, not proof of shared automatic compensation; ORP:373-377 distinguishes raw voltage from Eh.
- T1 MC6 supported: PH:1133-1139 locates multiparameter thermistors elsewhere in the system.
- T1 MN1 conditionally supported by SC/DO dependencies; MN2 supported against inventing exact error propagation; MN3 ambiguous if it excludes legitimate hardware evidence merely because it is a datasheet.
- T2 MC1-2 supported: T:630-639 distinguishes verification from adjustment and requires a certified/traceable reference.
- T2 MC3, MN3 supported: T:469-474 requires ≤±0.2 °C for bundled correction, which 0.5 exceeds.
- T2 MC4 supported: PH:1133-1135 and T:645-647 give annual/12-month checks.
- T2 MC5 supported with context: EPA:192-193 requires solution coverage; EPA:328-332's evaporation warning is specific to DO air calibration.
- T2 MN1-2 supported against inventing an adjustment procedure, tolerance or interval.

Follow-up coherence is sound.
Add DO to the source list because its explanation supports MC3.
Condition affected channels on actual thermistor use, separate raw ORP from corrected Eh, and retain the DO-specific evaporation context.
EPA:201-205 also supplies annual verification, contrary to the fixture notes' exclusivity claim.

## followup-jumpy-temperature-trace - EDIT

- T1 MC1-3 supported: T:1218-1220 lists dirty connections, cable breaks and weak batteries.
- T1 MC4 supported as a distinction, not an exclusive diagnosis: T:1215-1217 also lists weak batteries for inaccurate readings.
- T1 MN1/MN3 supported as troubleshooting priorities, not categorical exclusions of environmental variation or replacement; MN2 supported against an invented numerical jumpiness tolerance.
- T2 MC1, MN1 supported if the referent is cable: T:1219 says replacement may require recertification.
- T2 MC2 supported with publication-system scope: T:1230-1239 states the chapter's conditional NWIS uncertainty rule, while allowing other releases with verified uncertainty.
- T2 MC3 ambiguous if it always requires recertification: T:456-465 requires verified accuracy, while cable replacement only may require recertification.
- T2 MN2 supported against invented price/provider/interval; MN3 supported by verification versus adjustment at T:630-647.

The source supports the intended answer, but “that one” could refer to multiple items from T1.
Name the cable explicitly, check whether certification is invalidated, and require re-verification rather than universal recertification.
Attribute the NWIS restriction to the chapter rather than claiming to have verified the platform's current state.

## deepmanual-thermistor-annual-check - EDIT

- T1 MC1-3 supported: T:701-704 gives at least two points, within ±2 °C of extrema and ±4 °C of the mean.
- T1 MC4 supported as one example, ambiguous if exclusive: T:719-725 chooses 6/10 °C for a 4-12 °C span, but other qualifying point sets are allowed.
- T1 MC5 supported for this procedure: T:707-709 gives five maximum required points, distinct from reference-sensor certification.
- T1 MN1 ambiguous if it rejects the supported statement that two points suffice here; MN2 supported because the pretrip one-point comparison is additional; MN3 supported but incomplete without the spacing rules at T:702-709.
- T2 MC1-3, MN1 supported: T:645-667 gives annual verification, neither method preferred, and the in-situ site-visit cycle.
- T2 MC4, MN3 supported: T:676-680 requires a one-point reference check immediately before a trip.
- T2 MN2 ambiguous if it rejects more frequent legitimate checks; T:709-711 discusses quarterly checks and the same rubric requires visit/pretrip checks.

T fully supports the coherent answer; EPA is supplementary.
Accept any point set satisfying all constraints, with 6/10 as an example.
Target unsupported mandatory counts/intervals rather than banning legitimate additional checks.

## crossdoc-cold-water-hot-day-turbidity - EDIT

- T1 MC1 supported as a hypothesis: TBY:1424-1428 describes condensation when water is colder than air.
- T1 MC2 supported by the same passage's orientation/color/bubbles/cell conditions.
- T1 MC3 supported: TBY:615-619 describes transport-temperature effects.
- T1 MC4 supported as preference, ambiguous as proof that the pod is right: TBY:792-804 prefers dynamic measurement, while 2183-2195 lists possible in-situ errors.
- T1 MC5 supported: TBY:1543-1550 permits equilibration against condensation but warns warming can change particle associations.
- T1 MN1 ambiguous if it rules out genuine creek change; MN2-4 supported against unsupported correction/adjustment rather than proper calibration and bias checks.
- T2 MC1-2 and MN3 contradicted for this creek: FIELD:1591-1595 puts the qualifier rule under groundwater §3.2.3, whereas surface-water §3.1.3 at 969-980 permits turbidity subsamples.
- T2 MC3, MN1 supported as a sensible collection precaution but originally groundwater-scoped: TBY:1755-1762 prohibits downstream collection after the other sensors' chamber.
- T2 MC4-5, MN2 supported: TBY:1429-1439 prefers on-site measurement and specifies amber/no sunlight/≤4 °C/≤24 hours.

The source pair contains the quoted rules, but their current cross-context application is invalid.
Change the scenario to groundwater or grade T2 against surface-water §3.1.3.
Treat condensation as a possibility and dynamic measurement as a preference, not a verdict that one instrument is wrong.

## crossdoc-warm-week-oxygen-drop - EDIT

- T1 MC1-2 supported as freshwater/760-mmHg references: DO table headers at 3234-3274 and rows 3274-3314,3684-3724 give 10.08 at 15 °C and 9.09 at 20 °C.
- T1 MC3 supported for the reference equilibrium difference, 0.99 mg/L, not an absolute ceiling.
- T1 MC4-5 supported: DO:663-668 and 1751-1763 require pressure, temperature, ionic strength and appropriate salinity treatment.
- T1 MC6 contradicted as determined attribution: no pressure, salinity or initial saturation assumptions establish that warming caused approximately 1 mg/L of the site's measured 1.4 mg/L drop.
- T1 MN1 ambiguous if it excludes supported calculations/interpolation; DO:1745-1750 endorses generated values.
- T1 MN2-3 supported because conditional reference numbers are useful and brackish correction matters.
- T2 MC1-2, MN1/MN3 supported: DO:8897 and SC:303-317 identify specific conductance at 25 °C.
- T2 MC3-4 supported: SC:310-312,351-359 requires checking instrument compensation and avoiding double correction.
- T2 MC5 supported: DO:1759-1763 gives >2,000 µS/cm and instrument/calibration/salt dependence.
- T2 MN2 supported against invented coefficients; SC:355-359 gives 0.019-0.020 per °C and nonlinear alternatives.

Follow-up coherence and collective sources are sound; EPA is optional corroboration.
Require the 0.99 mg/L benchmark while explicitly refusing to quantify actual warming contribution or a residual from missing site information.
The notes' claim that only SC states the 25 °C basis is false; DO's table header also states it.

## Checks and limits

Reviewer inspected bounded USGS/EPA/vendor passages and searched all 14 texts in binary-safe mode for compensation, recertification, condensation and subsample reporting.
No current platform state or pod hardware identity was assumed.

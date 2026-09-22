# Batch 7 - spatial sampling, stabilization and sensor order

Read-only reviewer: `/root/batch1`.
Parent-consolidated report preserving condition coverage and source evidence.
FIELD/MP/SC/DO/PH/TBY abbreviate the corresponding USGS field-measurement, multiparameter, specific-conductance, dissolved-oxygen, pH and turbidity PDFs.

## deepmanual-cross-section-points - KEEP

- T1 MC1-2, MN1-2 supported: FIELD:695-701 permits a centroid reading with profiles differing by less than 5 percent and demonstrated vertical/cross-section mixing; 640-654 also invokes stabilization and judgment.
- T1 MC3 supported: FIELD:640-643 gives typically under 5 ft for a well-mixed single-centroid case.
- T1 MC4 supported: FIELD:665-671 requires at least four increments, more for poor mixing.
- T1 MC5 supported: FIELD:803-807 recommends at least ten equal-width increments at/above 5 ft.
- T1 MN3 supported against invented counts.
- T2 MC1 supported: FIELD:521-524 gives at least 60 seconds or manufacturer guidance, then stabilization.
- T2 MC2 supported: FIELD:721-726,853-857 gives the median over approximately 60 seconds after equilibration at each vertical.
- T2 MC3, MN1 supported: FIELD:523-526 gives the final three-or-more median.
- T2 MN2 supported for a vertical, not against later cross-section averaging; FIELD:847 explicitly uses a mean of medians.
- T2 MN3 supported by the stated timing.

FIELD supports both coherent turns and source lists.
Keep equilibration distinct from the observation window and individual medians distinct from later aggregation.
No material defect found.

## crossdoc-how-steady-before-i-write-it-down - EDIT

- T1 MC1-4, MN1-2 supported: FIELD:416-427 and MP:717-720 agree on temperature ±0.2 °C, SC ±5 µS/cm at/below 100 and ±3% above, DO ±0.2 mg/L, and pH ±0.1.
- T1 MC5 contradicted as unrestricted: FIELD:429-432 and MP:721-722 limit ±0.5 TU/±5% to ≤100 TU and require ±10% above 100.
- T1 MC6 supported: FIELD:510-516 uses about five-or-more consecutive readings.
- T1 MC7-8, MN3 supported: MP:681-685 requires at least 60 seconds, possibly longer manufacturer guidance; 753-757 permits several minutes or more.
- T1 MN4 supported: MP:714-716 distinguishes stabilization from instrument accuracy.
- T2 MC1, MN1/MN2/MN4 supported because the complete tables agree.
- T2 MC2 supported: FIELD:436 points to MP's similar criteria; MC3 supported by MP:714-716.
- T2 MC4 supported as one route, ambiguous if mandatory: FIELD:534-542 permits final-five median or documented professional selection of a representative final reading.
- T2 MN3 contradicted if it bans correcting T1's missing >100 branch.

Both sources support the coherent comparison.
Add the high-turbidity branch, accept both documented persistent-variability routes, and allow corrections of earlier incomplete answers.

## deepmanual-sonde-settle-time - EDIT

- T1 MC1-3, MN1-2 supported: MP:681-685 requires whole-sonde/sensor equilibration at each location for at least 60 seconds, allowing longer manufacturer times.
- T1 MC4 supported: MP:753-757 permits several minutes or more.
- T1 MN3 supported: `EC_K_1.0_probe.pdf`:133's 90% in one second does not replace whole-sonde equilibration.
- T2 MC1-4 supported: MP:717-720 and FIELD:416-427 give the stated temperature/DO/pH/SC tolerances.
- T2 MC5 contradicted as universal: MP:721-722 and FIELD:429-432 give ±10% above 100 TU.
- T2 MN1 supported against invention; MN2 supported because these are stabilization, not water-health limits; MN3 ambiguous unless requirements apply only to channels actually present.

The source list and follow-up are appropriate.
Add the >100 branch and installed-channel qualification.
For completeness, include FIELD:510-516's five-or-more readings; elapsed time alone does not establish stability.

## probecal-sonde-calibration-order - KEEP

- T1 MC1-4, MN1-2 supported as the general sequence: MP:584-607 orders temperature, SC, pH, DO, ORP, turbidity, then other sensors.
- T1 MC5, MN3 supported: MP:586-593 orders roughly increasing ionic strength to limit residual-standard contamination.
- T1 MC6 supported: SC:881-888 requires SC before pH because buffers/filling solutions contaminate it.
- T1 MN4 supported because manuals, not recalibration intervals in vendor sheets, establish the procedure.
- T2 MC1, MN1 supported: MP:591-593 requires three DIW rinses.
- T2 MC2 supported for applicable solution calibration: SC:785-800 and PH:1400-1404 add standard/buffer rinses, not immersion of an air-calibrated DO sensor.
- T2 MC3 supported: PH:1396-1402 includes sonde, cup, electrodes and thermistor.
- T2 MC4 supported: MP:838-839 identifies inadequate rinsing as a fault source.
- T2 MN2 supported: PH:732-735 discards used buffer; MN3 supported by documented rinse counts.

Listed sources collectively support the coherent follow-up.
The fixture note already accepts DO:625-628's two-point DO-last exception, so preserve that qualification.
No material defect found.

## crossdoc-sonde-sensor-order - EDIT

- T1 MC1-3 supported as default, ambiguous unconditionally: MP:584-607 gives the general order, but DO:625-628 requires DO last for two-point calibration to avoid sulfite interference.
- T1 MC4 supported: MP:586-593 explains ionic strength; MC5 supported: SC:881-888 explains pH carryover; MC6 supported: MP:591-593 requires three rinses.
- T1 MC7 supported: MP:565-568 calls for checking/calibration before field use.
- T1 MN1-3 supported against unsupported departures/inventions, not the documented exception.
- T1 MN4 supported: MP:574-580 calls individual chapters definitive.
- T2 MC1 supported for separately installed sensors: FIELD:1502-1505 places pH downstream of conductivity.
- T2 MC2 supported: SC:1153-1157 and FIELD:1497-1501 place the cell near the well and shaded.
- T2 MC3 supported with design dependence at SC:1158-1160.
- T2 MN1-2 supported by the distinction between plumbing and calibration order.
- T2 MN3 supported: TBY:1755-1762 prohibits collecting turbidity after the other sensors' chamber.

Follow-up coherence is sound.
Add DO and its two-point exception, matching the other order fixture's allowance.
Add TBY as provenance for the turbidity prohibition.
Keep the separate-sensor/design condition because integrated sonde geometry need not be adjustable.

## Checks and limits

Reviewer read bounded source tables, calibration/flow-cell passages, the DO exception, turbidity discharge rule and vendor response specification, and searched alternatives in EPA and relevant probe/parameter sources.
No hardware configuration or external source was assumed.

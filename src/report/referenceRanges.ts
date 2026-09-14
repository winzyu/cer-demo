/**
 * Probe accuracy and turbidity clarity bands. Ported from the Python prototype's
 * `reference_ranges.py`, numbers unchanged for what remains here.
 *
 * **Every numeric baseline range this file used to carry is gone.** It used to transcribe the
 * "Water Quality Metrics -- Source of Truth" doc's per-water-type ranges for pH, dissolved
 * oxygen, ORP and conductivity (`BASELINE_RANGES`, `baselineFor`) plus that doc's DO clinical
 * scale (`DO_ABSOLUTE_THRESHOLDS`, itself already dead -- nothing read it). The project supervisor
 * vetoed the entire source document as a range source on 2026-09-13 (see docs/timeline.md):
 * every number in it is discarded, not just the ones this file already excluded. There is no
 * fallback table. A metric's baseline now comes only from this device's own registry threshold
 * (`operatorThresholds.ts`'s `metricThreshold`), the same path temperature always used -- and
 * when a pod has no usable threshold for a metric, that metric has no baseline, exactly as
 * temperature already behaved before this change. See `buildReportInput.ts` §5 for how all five
 * numeric metrics now resolve their baseline.
 *
 * Two things that remain true and worth knowing:
 *
 * 1. Water body type still exists (`WaterBodyType`, `operatingEnvironment`) and still matters --
 *    event classification and narrative text still read it -- but it no longer selects a
 *    baseline table, because there is no longer a table to select from.
 * 2. Turbidity has NO numeric baseline, for the reason it never had one even before the veto: the
 *    value is not a measurement. It is a relative index derived from a raw voltage (see
 *    TURBIDITY_CLARITY_BANDS below). It is reported as a qualitative clarity band, never compared
 *    against a numeric range, and no device carries an operator turbidity threshold either.
 */

import type { ClarityBand } from "./types";

/* -------------------------------------------------------------------------------------------
 * Turbidity: qualitative clarity bands, not a numeric range
 * -----------------------------------------------------------------------------------------*/

/**
 * Turbidity is the one metric this pipeline reports **qualitatively**, and these are the cut
 * points. Read this block before changing a number in it.
 *
 * **Why there is no numeric range.** Turbidity is not a stored measurement. The backend derives
 * it from a raw analog voltage (`water_data.turbVolt`) with a conversion its own source file
 * marks PROVISIONAL and not lab-calibrated:
 *
 *     index = clamp((3.35 V - turbVolt) * 300, 0, 4550)
 *
 * Fixed constants, a clear-water reference of 3.35 V, 300 units per volt of drop. No lab
 * calibration stands behind any of it. Three independent signals agree that the result is a
 * monotonic relative index expressed in NTU-shaped units rather than a calibrated NTU
 * measurement: the backend's own PROVISIONAL comment, the customer dashboard's "Turbidity
 * (Relative)" relabel (and its shipped clarity bands), and the live data below.
 *
 * **And there is no operator threshold to fall back on.** A census of all 15 devices in the live
 * Firestore registry (2026-08-20) found the `thresholds` object carries exactly 10 keys --
 * min/max for temperature, pH, dissolved oxygen, ORP and conductivity. There is no turbidity
 * key on any device. Every other metric has an operator-owned numeric range; turbidity has
 * none, so there is nothing to compare a reading against even if the scale were trustworthy.
 * See docs/migration/BACKEND_FIELDS.md §3b and DEVICE_API.md §8.
 *
 * **The edges below are operator-authoritative.** The operator supplied his own three clarity
 * bands on 2026-09-10 (finding 5, docs/HANDOFF_2026-09-10.md section 5), replacing this
 * project's own provisional 250 / 600 / 1005 cut points -- those had no operator backing at all,
 * only the two justifications this docstring used to carry here. Adopting his bands is a settled
 * decision, not one to relitigate. He also independently confirmed the conversion formula as
 * `NTU = (3.35 - V) * 300`, matching what this file had already reverse-engineered from the
 * backend source above -- worth recording, since it means the reverse-engineering was right.
 *
 * His bands, given in both units because the conversion is inverse (clearer water = higher
 * voltage = LOWER index) and a one-unit description invites exactly that inversion -- an earlier
 * draft of the handoff that recorded these bands had the voltage direction backwards on one edge
 * for precisely this reason:
 *
 *   - Clear:    above 2.2 V   -> index below 345    ((3.35 - 2.2) * 300 = 345)
 *   - Moderate: 0.7 V-2.2 V   -> index 345-795       ((3.35 - 0.7) * 300 = 795)
 *   - Turbid:   below 0.7 V   -> index above 795
 *
 * **Edge convention.** `clarityBandFor` keeps this file's existing convention unchanged:
 * descending edges, first one an index clears wins, which makes every band half-open
 * `[min, next)`. So Clear is `[0, 345)`, Moderate is `[345, 795)`, Turbid is `[795, Infinity)`.
 * That puts the exact value 795 in Turbid, where the operator's own phrasing ("Turbid below
 * 0.7 V") would put it in Moderate -- a one-value difference, accepted so this file keeps a
 * single comparison convention instead of adding a second one just for this edge.
 *
 * **0 is a real reading and lives in the bottom band.** A `turbVolt` above the 3.35 V reference
 * yields a negative drop, which clamps to 0 -- observed live at `turbVolt = 4.20 V`. So 0 can
 * mean "above the clear-water reference voltage" rather than "measurably clear water". It is
 * never missing data (plausibility.ts and aggregate.ts carry the same carve-out), and it must
 * never be filtered out or treated as absent.
 *
 * **The off-scale flag.** `3.35 V x 300 = 1005` is the largest index the documented conversion
 * can produce from a non-negative input voltage -- it is not one of the operator's three bands.
 * An index at or above 1005 means the input went below 0 V relative to the conversion's
 * assumptions: the reading is off the end of the scale the conversion was derived on, which is a
 * data-quality signal about the sensor or its wiring, not a claim about water clarity. One
 * recorded pod's 1-day mean sits at 1006 -- essentially `turbVolt = 0` -- and that pod may be
 * sitting on its sensor rail rather than reading very turbid water. `isOffScaleTurbidity` below
 * flags exactly this case. It is deliberately not a fourth band: an off-scale reading is still,
 * correctly, `Turbid`, it is just also suspect.
 *
 * Sampled 1-day means across live pods came in at 456, 555, 1006, 1385 and 2042, against a
 * system-prompt "authoritative range" of 0-25 NTU freshwater / 0-10 saltwater -- one to two
 * orders of magnitude outside it. That spread no longer justifies the band edges (the operator's
 * bands do), but it is still the clearest evidence that this index is not comparable to a
 * calibrated NTU scale, and it is what makes the 1006 pod's off-scale reading concrete rather
 * than hypothetical.
 *
 * **What is, and is not, settled by this.** The three bands above are operator-authoritative and
 * no longer provisional. The *conversion* that feeds them -- the 3.35 V reference, the 300
 * units/volt scale factor -- remains exactly as uncalibrated as before: the operator confirmed
 * the formula, not a lab calibration of it. That distinction is why `TURBIDITY_SCALE_CAVEAT`
 * below still calls the conversion uncalibrated even though the bands themselves are not.
 */
export const TURBIDITY_BAND_EDGES: ReadonlyArray<{ band: ClarityBand; min: number }> = [
  // Descending, so the first edge a value clears is its band. Operator-authoritative as of
  // 2026-09-10 -- see the docstring above.
  { band: "Turbid", min: 795 },
  { band: "Moderate", min: 345 },
  { band: "Clear", min: 0 },
];

/**
 * The conversion's clear-water reference voltage, `V_CLEAR` in the backend's `turbVoltToNTU.ts`.
 * Exported so callers deriving a band's voltage bound from `TURBIDITY_BAND_EDGES` (e.g.
 * `get_turbidity_info`) compute it from this one constant instead of re-typing 3.35.
 */
export const TURBIDITY_CLEAR_VOLT = 3.35;

/**
 * Index units gained per volt of drop below `TURBIDITY_CLEAR_VOLT` -- `NTU_PER_VOLT_DROP` in the
 * backend's `turbVoltToNTU.ts`. Exported for the same reason as `TURBIDITY_CLEAR_VOLT`.
 */
export const TURBIDITY_INDEX_PER_VOLT = 300;

/** The band a relative turbidity index falls in. `0` is a real reading and returns "Clear". */
export const clarityBandFor = (index: number): ClarityBand => (
  TURBIDITY_BAND_EDGES.find((edge) => index >= edge.min)?.band ?? "Clear"
);

/**
 * `3.35 V x 300 = 1005`, the largest index the documented conversion can produce from a
 * non-negative input voltage -- see the "off-scale flag" paragraph in the docstring above
 * `TURBIDITY_BAND_EDGES`. It is not one of the operator's three bands.
 */
export const OFF_SCALE_INDEX = 1005;

/**
 * True once a turbidity index is at or beyond the conversion's own scale limit, meaning the
 * input voltage went below 0 V relative to the conversion's assumptions -- a data-quality signal
 * about the sensor or its wiring, not a water-clarity claim. Not a `ClarityBand`: an off-scale
 * reading is still `Turbid` by `clarityBandFor`, this just flags that it is also suspect.
 */
export const isOffScaleTurbidity = (index: number): boolean => index >= OFF_SCALE_INDEX;

/**
 * One sentence saying what the turbidity number is, printed wherever a turbidity value appears
 * in user-facing output. Kept here, next to the cut points, so the caveat and the numbers cannot
 * drift apart.
 */
export const TURBIDITY_SCALE_CAVEAT = "Relative index derived from a raw sensor voltage by a "
  + "provisional, uncalibrated conversion; no operator turbidity range exists, so this is a "
  + "clarity band and a direction of change, not a measurement judged in or out of range.";

/** Column value where a numeric baseline would otherwise print. */
export const TURBIDITY_NO_BASELINE_TEXT = "No range (relative index)";

export interface ProbeSpec {
  accuracyAbs?: number;
  /** Fraction of reading -- used for EC, specified as +/-2%. */
  accuracyPct?: number;
  recalibrationIntervalDays?: number;
  lifeExpectancyYears?: number;
  source: string;
}

export const PROBE_SPECS: Record<string, ProbeSpec> = {
  ph: {
    accuracyAbs: 0.002,
    recalibrationIntervalDays: 365,
    lifeExpectancyYears: 4,
    source: "Atlas Scientific Industrial pH probe, Gen 3 V5.3",
  },
  orp: {
    accuracyAbs: 1.0,
    recalibrationIntervalDays: 365,
    lifeExpectancyYears: 4,
    source: "Atlas Scientific Industrial ORP probe, Gen 3 V3.2",
  },
  dissolved_oxygen: {
    accuracyAbs: 0.05,
    recalibrationIntervalDays: 365,
    lifeExpectancyYears: 4,
    source: "Atlas Scientific Industrial D.O. probe, Gen 3 V2.4",
  },
  conductivity: {
    accuracyPct: 0.02,
    recalibrationIntervalDays: 3650, // spec sheet: plates don't degrade, ~10yr
    lifeExpectancyYears: 10,
    source: "Atlas Scientific Conductivity Probe K 1.0, Gen 3 V4.2",
  },
  // Reported via the D.O. probe's internal PT-1000 (Class A RTD), not a standalone temperature
  // probe: +/-(0.15 + 0.002*t) degC, t = reading IN CELSIUS. The device API reports temperature
  // in °F (metrics.ts) -- callers MUST convert to Celsius before calling temperatureAccuracyC,
  // same trap device.types.ts flags for the raw reading itself.
  temperature: {
    recalibrationIntervalDays: 365,
    lifeExpectancyYears: 4,
    source: "PT-1000 internal to Atlas Scientific Industrial D.O. probe, Gen 3 V2.4",
  },
  // No turbidity probe spec sheet was provided among the four uploaded -- leave unset rather
  // than inventing a number.
  turbidity: { source: "No turbidity probe spec supplied" },
};

/** PT-1000 Class A accuracy formula from the D.O. probe spec sheet. Input MUST be Celsius. */
export const temperatureAccuracyC = (readingC: number): number => 0.15 + 0.002 * Math.abs(readingC);

/**
 * Returns the probe's stated accuracy tolerance, in the metric's own units, evaluated near the
 * given reading. Returns 0 if no spec is on file for this metric (e.g. turbidity) -- callers
 * should treat that as "no noise floor available," not "the probe is perfectly accurate."
 *
 * `reading` for "temperature" must already be in Celsius (see PROBE_SPECS.temperature note).
 */
export const probeAccuracy = (key: string, reading: number): number => {
  if (key === "temperature") {
    return temperatureAccuracyC(reading);
  }
  const spec = PROBE_SPECS[key];
  if (!spec) {
    return 0;
  }
  if (spec.accuracyAbs !== undefined) {
    return spec.accuracyAbs;
  }
  if (spec.accuracyPct !== undefined) {
    return spec.accuracyPct * Math.abs(reading);
  }
  return 0;
};

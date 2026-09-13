/**
 * Baseline ranges and probe accuracy, transcribed from the two source documents Michael
 * approved sharing: "Water Quality Metrics -- Source of Truth" and the four Atlas Scientific
 * probe spec sheets (EC K1.0, Industrial D.O., Industrial ORP, Industrial pH). Ported from the
 * Python prototype's `reference_ranges.py`, numbers unchanged.
 *
 * Two things worth knowing before trusting a number out of this file:
 *
 * 1. Three water-body tiers, not two. The source-of-truth doc gives Freshwater /
 *    Brackish-Estuarine / Seawater ranges -- the template's "Brackish" and "Estuarine" options
 *    both map to the middle tier.
 * 2. Temperature has NO fixed baseline. The source doc is explicit: "Climate/season-dependent"
 *    for all three water types, closing with "Establish a site-specific baseline before treating
 *    deviations as events." So temperature is deliberately absent from BASELINE_RANGES -- it
 *    must be supplied per deployment once one exists, not looked up here. This is also this
 *    port's answer to cer-demo's own open ◆G3 ("what does the report's Site Baseline mean"):
 *    start from these reference ranges, then refine toward a measured site-specific baseline
 *    over time, per the source document's own closing instruction. That is a working
 *    interpretation carried over from the prototype, not a finalized team decision -- ◆G3 is
 *    still open in docs/timeline.md as of this port.
 *
 *    **The site-specific baseline the doc asks for now has a source.** It is the operator's own
 *    `minTemperature`/`maxTemperature` on the backend's device document, read and validated by
 *    `operatorThresholds.ts` and attached by `buildReportInput.ts`. It lives in that file rather
 *    than this one on purpose: everything here is transcribed from two approved documents and is
 *    identical for every pod in a tier, while a registry threshold is hand-entered, per-device,
 *    and has to be validated before it can be believed. Do not add a temperature entry to
 *    BASELINE_RANGES to "fill the gap" -- the gap is the source document's finding.
 * 3. Turbidity has NO numeric baseline either, for an entirely different reason: the value is
 *    not a measurement. It is a relative index derived from a raw voltage (see
 *    TURBIDITY_CLARITY_BANDS below). It is reported as a qualitative clarity band, never
 *    compared against a numeric range, and is therefore also absent from BASELINE_RANGES.
 */

import type { ClarityBand } from "./types";

export type RangeTier = "freshwater" | "brackish_estuarine" | "seawater";

export const WATER_BODY_TO_TIER: Record<string, RangeTier> = {
  Freshwater: "freshwater",
  Brackish: "brackish_estuarine",
  Estuarine: "brackish_estuarine",
  Marine: "seawater",
};

export interface RangeByTier {
  freshwater: [number, number];
  brackish_estuarine: [number, number];
  seawater: [number, number];
}

export const rangeForTier = (range: RangeByTier, tier: RangeTier): [number, number] => range[tier];

/**
 * Source-of-truth doc, section 2 "Baseline Reference Ranges". Temperature intentionally omitted.
 */
export const BASELINE_RANGES: Record<string, RangeByTier> = {
  dissolved_oxygen: {
    freshwater: [6, 11], brackish_estuarine: [5, 9], seawater: [5, 8],
  },
  orp: {
    freshwater: [200, 400], brackish_estuarine: [150, 350], seawater: [200, 400],
  },
  conductivity: {
    freshwater: [50, 1_500], brackish_estuarine: [1_000, 35_000], seawater: [45_000, 55_000],
  },
  ph: {
    freshwater: [6.5, 8.5], brackish_estuarine: [7.0, 8.3], seawater: [7.8, 8.3],
  },
  // turbidity is deliberately absent -- see TURBIDITY_CLARITY_BANDS below. It has no numeric
  // baseline in this pipeline, so `baselineFor("turbidity", ...)` returns undefined and the
  // report never flags it in or out of a range.
};

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

/**
 * Source-of-truth doc, DO section: absolute thresholds independent of site baseline.
 *
 * ⚠️ Defined but NOT currently consulted anywhere in this pipeline -- DO severity today is
 * judged only against the site baseline (BASELINE_RANGES above), never against this absolute
 * clinical scale. Kept here, sourced, so wiring it into event severity is a decision to make
 * rather than data to go find.
 */
export const DO_ABSOLUTE_THRESHOLDS = {
  healthy: 6.0, // > 6 mg/L
  stress: 4.0, // 4-6 mg/L
  hypoxicStress: 2.0, // 2-4 mg/L
  hypoxia: 0.0, // < 2 mg/L is hypoxia, ~0 is anoxia
};

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

/**
 * Builds a fixed-baseline ParameterBaseline from the source-of-truth reference table, for any
 * metric except temperature (which has none -- see module docstring). Returns undefined for
 * temperature and for an unknown water body type rather than throwing, since a report can still
 * be produced with that one row marked "no fixed baseline" (see buildReportInput.ts and
 * types.ts's Flag = "N/A").
 */
export interface FixedBaseline {
  key: string;
  label: string;
  unit: string;
  baselineMin: number;
  baselineMax: number;
}

export const baselineFor = (
  key: string,
  label: string,
  unit: string,
  waterBodyType: string,
): FixedBaseline | undefined => {
  const range = BASELINE_RANGES[key];
  const tier = WATER_BODY_TO_TIER[waterBodyType];
  if (!range || !tier) {
    return undefined;
  }
  const [lo, hi] = rangeForTier(range, tier);
  return {
    key, label, unit, baselineMin: lo, baselineMax: hi,
  };
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

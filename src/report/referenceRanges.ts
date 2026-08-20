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
 */

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
  turbidity: {
    freshwater: [5, 25], brackish_estuarine: [5, 100], seawater: [5, 10],
  },
};

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

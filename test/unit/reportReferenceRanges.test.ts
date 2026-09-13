import {
  baselineFor, probeAccuracy, temperatureAccuracyC, rangeForTier, WATER_BODY_TO_TIER, BASELINE_RANGES,
  clarityBandFor, TURBIDITY_BAND_EDGES, isOffScaleTurbidity, OFF_SCALE_INDEX,
} from "../../src/report/referenceRanges";

/**
 * referenceRanges.ts is a numeric transcription of the source-of-truth doc and four probe spec
 * sheets -- these tests pin the exact numbers and, more importantly, the two traps this port
 * added over the Python prototype: temperature has no fixed baseline at all (source doc:
 * "Establish a site-specific baseline"), and its accuracy formula requires Celsius while the
 * live device API reports Fahrenheit (see buildReportInput.ts and querySensorData's metrics.ts).
 */

describe("baselineFor", () => {
  it("returns the freshwater tier for a known parameter", () => {
    const b = baselineFor("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", "Freshwater");
    expect(b).toEqual({
      key: "dissolved_oxygen", label: "Dissolved Oxygen (mg/L)", unit: "mg/L", baselineMin: 6, baselineMax: 11,
    });
  });

  it("maps both Brackish and Estuarine to the same middle tier", () => {
    const brackish = baselineFor("ph", "pH", "", "Brackish");
    const estuarine = baselineFor("ph", "pH", "", "Estuarine");
    expect(brackish).toEqual(estuarine);
    expect(brackish?.baselineMin).toBe(7.0);
  });

  it("maps Marine to the seawater tier", () => {
    const b = baselineFor("conductivity", "Conductivity (µS/cm)", "µS/cm", "Marine");
    expect(b).toEqual({
      key: "conductivity", label: "Conductivity (µS/cm)", unit: "µS/cm", baselineMin: 45_000, baselineMax: 55_000,
    });
  });

  it("returns undefined for temperature -- the source doc gives it no fixed range", () => {
    expect(baselineFor("temperature", "Temperature (°F)", "°F", "Freshwater")).toBeUndefined();
    expect(BASELINE_RANGES.temperature).toBeUndefined();
  });

  it("returns undefined, not a throw, for an unrecognized water body type", () => {
    expect(baselineFor("ph", "pH", "", "Lagoon" as never)).toBeUndefined();
  });

  it("returns undefined, not a throw, for an unrecognized metric key", () => {
    expect(baselineFor("salinity", "Salinity", "ppt", "Freshwater")).toBeUndefined();
  });

  it("returns undefined for turbidity in every water type -- it has no numeric baseline at all", () => {
    // Not the same case as temperature. Temperature has no range *yet*; turbidity's value is a
    // provisional uncalibrated index with no operator range on any of the 15 registered devices,
    // so a numeric baseline would be a fabrication rather than a gap.
    expect(BASELINE_RANGES.turbidity).toBeUndefined();
    (["Freshwater", "Brackish", "Estuarine", "Marine"] as const).forEach((waterType) => {
      expect(baselineFor("turbidity", "Turbidity (Relative)", "", waterType)).toBeUndefined();
    });
  });
});

describe("clarityBandFor", () => {
  it("puts 0 in the bottom band -- 0 is a real reading, never missing data", () => {
    // A turbVolt above the 3.35 V clear-water reference clamps the derived index to 0 (observed
    // live at 4.20 V). Anything that treated 0 as absent would delete a real observation.
    expect(clarityBandFor(0)).toBe("Clear");
  });

  it("bands the Clear/Moderate edge on its lower bound, inclusive (operator: above 2.2 V / below 345)", () => {
    expect(clarityBandFor(344)).toBe("Clear");
    expect(clarityBandFor(345)).toBe("Moderate");
  });

  it("bands the Moderate/Turbid edge on its lower bound, inclusive -- the one value that differs "
    + "from the operator's own phrasing (\"Turbid below 0.7 V\" would put 795 in Moderate)", () => {
    expect(clarityBandFor(794)).toBe("Moderate");
    expect(clarityBandFor(795)).toBe("Turbid");
  });

  it("handles a reading in the thousands without falling off the top of the scale", () => {
    // Live 1-day means of 1385 and 2042 sit well past the conversion's own 1005 ceiling, which is
    // precisely why the index is not treated as calibrated NTU -- but they are still Turbid.
    expect(clarityBandFor(1_385)).toBe("Turbid");
    expect(clarityBandFor(2_042)).toBe("Turbid");
    expect(clarityBandFor(4_550)).toBe("Turbid"); // the conversion's own ceiling
  });

  it("degrades to the bottom band rather than throwing on a negative index", () => {
    // The conversion clamps at 0, so this should not occur -- but failing to "Clear" beats
    // returning undefined into a report row.
    expect(clarityBandFor(-5)).toBe("Clear");
  });

  it("keeps the edge table descending, which is what makes the first match the right band", () => {
    const mins = TURBIDITY_BAND_EDGES.map((e) => e.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(mins[mins.length - 1]).toBe(0); // the bottom band must admit 0
  });

  it("matches the operator's confirmed conversion at each of his three edges", () => {
    // NTU = (3.35 - V) * 300, confirmed by the operator 2026-09-10 and unchanged from what this
    // file had already reverse-engineered.
    expect((3.35 - 2.2) * 300).toBeCloseTo(345, 10);
    expect((3.35 - 0.7) * 300).toBeCloseTo(795, 10);
  });
});

describe("isOffScaleTurbidity", () => {
  it("is false just below the conversion's own ceiling, true at and above it", () => {
    expect(isOffScaleTurbidity(1_004)).toBe(false);
    expect(isOffScaleTurbidity(1_005)).toBe(true);
    expect(isOffScaleTurbidity(1_006)).toBe(true); // the recorded pod mean sitting on its rail
  });

  it("uses the same 1005 = 3.35 V x 300 ceiling as OFF_SCALE_INDEX", () => {
    expect(OFF_SCALE_INDEX).toBe(1_005);
  });

  it("does not change the band -- an off-scale reading is still Turbid, just also suspect", () => {
    expect(clarityBandFor(1_006)).toBe("Turbid");
    expect(isOffScaleTurbidity(1_006)).toBe(true);
  });
});

describe("rangeForTier / WATER_BODY_TO_TIER", () => {
  it("resolves every template water body type to a tier", () => {
    expect(WATER_BODY_TO_TIER.Freshwater).toBe("freshwater");
    expect(WATER_BODY_TO_TIER.Brackish).toBe("brackish_estuarine");
    expect(WATER_BODY_TO_TIER.Estuarine).toBe("brackish_estuarine");
    expect(WATER_BODY_TO_TIER.Marine).toBe("seawater");
  });

  it("pulls the tuple for a given tier", () => {
    expect(rangeForTier(BASELINE_RANGES.ph, "seawater")).toEqual([7.8, 8.3]);
  });
});

describe("temperatureAccuracyC", () => {
  it("applies the PT-1000 Class A formula, 0.15 + 0.002*|t|", () => {
    expect(temperatureAccuracyC(20)).toBeCloseTo(0.19, 10);
    expect(temperatureAccuracyC(0)).toBeCloseTo(0.15, 10);
    expect(temperatureAccuracyC(-10)).toBeCloseTo(0.17, 10); // uses |t|, not t
  });
});

describe("probeAccuracy", () => {
  it("returns a flat absolute tolerance for pH, ORP, and dissolved oxygen", () => {
    expect(probeAccuracy("ph", 7.2)).toBe(0.002);
    expect(probeAccuracy("orp", 250)).toBe(1.0);
    expect(probeAccuracy("dissolved_oxygen", 8.0)).toBe(0.05);
  });

  it("scales conductivity's tolerance with the reading, at +/-2%", () => {
    expect(probeAccuracy("conductivity", 1000)).toBeCloseTo(20, 10);
    expect(probeAccuracy("conductivity", -1000)).toBeCloseTo(20, 10); // magnitude, not sign
  });

  it("returns 0 for turbidity -- no spec sheet was supplied, so there is no noise floor", () => {
    expect(probeAccuracy("turbidity", 15)).toBe(0);
  });

  it("routes temperature through the Celsius-only formula, on the raw value passed in", () => {
    // Caller's job to convert F->C first (see referenceRanges.ts's PROBE_SPECS.temperature note
    // and buildReportInput.ts) -- this function does not know or check the input's units.
    expect(probeAccuracy("temperature", 20)).toBeCloseTo(temperatureAccuracyC(20), 10);
  });

  it("returns 0 for a metric with no spec on file at all", () => {
    expect(probeAccuracy("salinity", 10)).toBe(0);
  });
});

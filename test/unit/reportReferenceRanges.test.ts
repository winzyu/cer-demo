import {
  probeAccuracy, temperatureAccuracyC, minimumDetectableChange, V2_FALLBACK_RANGES, fallbackWaterClass,
  clarityBandFor, TURBIDITY_BAND_EDGES, isAllZeroTurbidity, isOffScaleTurbidity, OFF_SCALE_INDEX,
} from "../../src/report/referenceRanges";

/**
 * referenceRanges.ts holds the probe spec sheets' accuracy numbers, the turbidity clarity bands,
 * and source-of-truth v2's fallback ranges and minimum detectable change. A metric's range is the
 * pod's operator threshold first (`operatorThresholds.ts`); v2's ranges apply only when that is
 * rejected (docs/timeline.md, 2026-10-10 and 2026-10-11). The trap worth pinning here: the
 * temperature accuracy formula requires Celsius while the live device API reports Fahrenheit.
 */

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

describe("isAllZeroTurbidity", () => {
  it("is true only when the period's maximum is 0, meaning every reading was 0", () => {
    expect(isAllZeroTurbidity(0)).toBe(true);
    expect(isAllZeroTurbidity(0.1)).toBe(false);
    expect(isAllZeroTurbidity(456)).toBe(false);
  });

  it("does not change the band -- an all-zero period is still Clear, just also suspect", () => {
    expect(clarityBandFor(0)).toBe("Clear");
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

describe("V2_FALLBACK_RANGES (v2 §3)", () => {
  it("transcribes v2's pH, dissolved oxygen and ORP ranges per water class", () => {
    expect(V2_FALLBACK_RANGES.freshwater).toEqual({
      ph: { min: 6.5, max: 8.5 }, dissolvedOxygen: { min: 6, max: 11 }, orp: { min: 100, max: 400 },
    });
    expect(V2_FALLBACK_RANGES.brackish).toEqual({
      ph: { min: 7.0, max: 8.3 }, dissolvedOxygen: { min: 5, max: 9 }, orp: { min: 100, max: 350 },
    });
    expect(V2_FALLBACK_RANGES.coastal.ph).toMatchObject({ min: 7.8, max: 8.3 });
    expect(V2_FALLBACK_RANGES.coastal.dissolvedOxygen).toMatchObject({ min: 6, max: 8.5 });
  });

  it("gives no conductivity fallback in any class until 25 °C correction is confirmed", () => {
    // Marina Park reads 31,000-39,000 µS/cm; v2's coastal 50,000-52,000 would flag it every day.
    Object.values(V2_FALLBACK_RANGES).forEach((ranges) => {
      expect(ranges.conductivity).toBeUndefined();
      expect(ranges.temperature).toBeUndefined();
    });
  });

  it("gives no coastal ORP fallback: v2 judges coastal ORP by trend, not absolute value", () => {
    expect(V2_FALLBACK_RANGES.coastal.orp).toBeUndefined();
  });

  it("notes upwelling beside the coastal dissolved oxygen and pH ranges", () => {
    expect(V2_FALLBACK_RANGES.coastal.dissolvedOxygen?.note).toMatch(/upwelling/);
    expect(V2_FALLBACK_RANGES.coastal.ph?.note).toMatch(/upwelling/);
    expect(V2_FALLBACK_RANGES.freshwater.ph?.note).toBeUndefined();
  });

  it("maps water body types to v2 columns, estuarine reading the brackish column", () => {
    expect(fallbackWaterClass("Marine")).toBe("coastal");
    expect(fallbackWaterClass("Brackish")).toBe("brackish");
    expect(fallbackWaterClass("Estuarine")).toBe("brackish");
    expect(fallbackWaterClass("Freshwater")).toBe("freshwater");
  });
});

describe("minimumDetectableChange (v2 §8.3)", () => {
  it("uses v2's fixed amounts for pH, dissolved oxygen and ORP", () => {
    expect(minimumDetectableChange("ph", 8.1)).toBe(0.2);
    expect(minimumDetectableChange("dissolved_oxygen", 7)).toBe(1);
    expect(minimumDetectableChange("orp", 250)).toBe(50);
  });

  it("scales conductivity at 2% of the reading", () => {
    expect(minimumDetectableChange("conductivity", 40_000)).toBeCloseTo(800, 10);
  });

  it("doubles the PT-1000 accuracy for temperature, converting °F in and out", () => {
    // 77 °F = 25 °C; accuracy 0.15 + 0.002 x 25 = 0.2 °C; x2 = 0.4 °C = 0.72 °F.
    expect(minimumDetectableChange("temperature", 77)).toBeCloseTo(0.72, 10);
  });

  it("returns 0 for turbidity, which is never range-compared", () => {
    expect(minimumDetectableChange("turbidity", 500)).toBe(0);
  });
});

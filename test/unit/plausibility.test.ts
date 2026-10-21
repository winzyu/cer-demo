import { PLAUSIBLE_RANGES, isPlausible } from "../../src/devices/plausibility";
import { aggregate } from "../../src/tools/aggregate";
import type { Sample } from "../../src/tools/aggregate";

/**
 * Regression tests for the probe-rail filter.
 *
 * The concrete defect: `dev:351077454569099` reading `2026-07-24T00:09:22Z` carried
 * `water_data["102"] = -1023` (Celsius) with `rtdError = 0` -- the hardware reported no fault, so
 * the `sample.valid` filter kept it, and -1023 °C decodes to -1809.4 °F. That value became the
 * temperature minimum of a generated report and flowed into Section 2, the narrative, and the
 * overall status. These tests pin both halves: the bound catches the rail, and the bounds stay
 * wide enough not to eat real readings.
 */

const sample = (value: number, overrides: Partial<Sample> = {}): Sample => ({
  atMs: Date.parse("2026-07-24T00:09:22.000Z"),
  at: "2026-07-24T00:09:22.000Z",
  value,
  valid: true,
  ...overrides,
});

describe("isPlausible", () => {
  it("rejects the -1809.4 °F temperature rail that reached a live report", () => {
    // -1023 °C * 9/5 + 32. The exact value observed on the Algalita Pod.
    expect(isPlausible("temperature", -1809.4)).toBe(false);
  });

  it("accepts the real temperatures recorded either side of that rail", () => {
    [70.75, 73.4, 83.1, 88.91].forEach((f) => {
      expect(isPlausible("temperature", f)).toBe(true);
    });
  });

  it("treats pH pinned exactly to either end of the scale as a rail, not a measurement", () => {
    expect(isPlausible("ph", 0)).toBe(false);
    expect(isPlausible("ph", 14)).toBe(false);
    expect(isPlausible("ph", 7.2)).toBe(true);
  });

  it("flags pH outside what natural water reaches, including the Algalita Pod's live 2.07 and 12.62", () => {
    // Report audit 2026-09-25 finding 5: a seawater pod (~pH 8.1) printed a 1-day minimum of 2.07
    // and a 7-day maximum of 12.62, and each alone set the report to Action Required.
    expect(isPlausible("ph", 2.07)).toBe(false);
    expect(isPlausible("ph", 12.62)).toBe(false);
    expect(isPlausible("ph", 2.99)).toBe(false);
    expect(isPlausible("ph", 12.01)).toBe(false);
  });

  it("keeps the most extreme natural waters the fleet could plausibly sit in", () => {
    // Peat bog / humic brown-water streams bottom out near pH 3.5; soda lakes and eutrophic water
    // at the photosynthetic peak reach about 11. The bound is inclusive at 3 and 12.
    [3, 3.5, 4.2, 6.5, 8.1, 9.8, 11, 12].forEach((ph) => {
      expect(isPlausible("ph", ph)).toBe(true);
    });
  });

  it("keeps the pH scale itself as the rail operator limits are validated against", () => {
    // operatorThresholds.ts reads min/max as its pH rail; tightening those would reject
    // configured limits rather than readings.
    expect(PLAUSIBLE_RANGES.ph.min).toBe(0);
    expect(PLAUSIBLE_RANGES.ph.max).toBe(14);
  });

  it("keeps 0 plausible for ORP and turbidity -- the carve-out aggregate.ts documents", () => {
    // A falsy-style filter here would delete real measurements and bias the turbidity index
    // toward looking cleaner than it is.
    expect(isPlausible("orp", 0)).toBe(true);
    expect(isPlausible("turbidity", 0)).toBe(true);
  });

  it("rejects 0 µS/cm, the one metric the zero carve-out does not cover", () => {
    // Every natural water conducts; deionized water still reads ~0.055 µS/cm. An exact 0 is
    // the probe floor, and it was showing up as the conductivity minimum on a live report.
    expect(isPlausible("conductivity", 0)).toBe(false);
    expect(isPlausible("conductivity", 0.055)).toBe(true);
  });

  it("accepts seawater conductivity, which a freshwater-shaped bound would have rejected", () => {
    expect(isPlausible("conductivity", 58_057)).toBe(true);
    expect(isPlausible("conductivity", 68_425)).toBe(true);
  });

  it("rejects non-finite values", () => {
    expect(isPlausible("temperature", Number.NaN)).toBe(false);
    expect(isPlausible("ph", Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("fails open for a metric with no bounds on file", () => {
    // Matches probeAccuracy's "no spec on file" behaviour: a newly added metric must not be
    // silently dropped the day it appears.
    expect(isPlausible("somethingNew" as never, 12_345)).toBe(true);
  });

  it("keeps every bound wider than the reference ranges it must not encroach on", () => {
    // Guards the one way this filter could do real harm: tightening a bound until it starts
    // deleting genuine excursions that referenceRanges.ts is supposed to flag.
    expect(PLAUSIBLE_RANGES.conductivity.max).toBeGreaterThan(55_000); // seawater baseline top
    expect(PLAUSIBLE_RANGES.dissolvedOxygen.max).toBeGreaterThan(11); // freshwater baseline top
    expect(PLAUSIBLE_RANGES.temperature.max).toBeGreaterThan(95); // prompt's stated °F ceiling
    expect(PLAUSIBLE_RANGES.temperature.min).toBeLessThan(32);
    // Every non-placeholder operator pH limit in the recorded registry fixtures lies in 5-10.
    expect(PLAUSIBLE_RANGES.ph.naturalWater!.min).toBeLessThan(5);
    expect(PLAUSIBLE_RANGES.ph.naturalWater!.max).toBeGreaterThan(10);
  });
});

describe("aggregate with implausible samples", () => {
  it("excludes a rail from min, and counts it apart from faulted readings", () => {
    const samples = [
      sample(73.4, { plausible: true }),
      sample(-1809.4, { plausible: false }),
      sample(70.75, { plausible: true }),
    ];

    const result = aggregate(samples, "min", 200);

    expect(result.value).toBe(70.75);
    expect(result.nSamples).toBe(2);
    expect(result.excludedImplausible).toBe(1);
    // The hardware never flagged it -- that is the whole point of the separate counter.
    expect(result.excludedFaulted).toBe(0);
  });

  it("keeps a rail out of series buckets too, so the trend is not dragged with it", () => {
    const samples = [
      sample(73.4, { atMs: Date.parse("2026-07-24T00:00:00Z"), plausible: true }),
      sample(-1809.4, { atMs: Date.parse("2026-07-24T00:09:22Z"), plausible: false }),
      sample(74.1, { atMs: Date.parse("2026-07-24T00:20:00Z"), plausible: true }),
    ];

    const result = aggregate(samples, "series", 200, { bucketMs: 60 * 60_000 });

    expect(result.series).toHaveLength(1);
    expect(result.series![0].min).toBe(73.4);
    expect(result.series![0].n).toBe(2);
    expect(result.excludedImplausible).toBe(1);
  });

  it("counts faulted and implausible separately when both occur", () => {
    const samples = [
      sample(73.4),
      sample(60, { valid: false }),
      sample(-1809.4, { plausible: false }),
    ];

    const result = aggregate(samples, "mean", 200);

    expect(result.excludedFaulted).toBe(1);
    expect(result.excludedImplausible).toBe(1);
    expect(result.nSamples).toBe(1);
    expect(result.value).toBe(73.4);
  });

  it("treats an unset `plausible` as plausible, so unclassified callers are unaffected", () => {
    // The field is optional on purpose: existing callers that never classified their samples
    // must keep the pre-existing include-everything behaviour rather than lose every reading.
    const result = aggregate([sample(73.4), sample(70.75)], "min", 200);

    expect(result.nSamples).toBe(2);
    expect(result.excludedImplausible).toBe(0);
    expect(result.value).toBe(70.75);
  });

  it("reports no usable data rather than a value when every sample is a rail", () => {
    const result = aggregate([sample(-1809.4, { plausible: false })], "mean", 200);

    expect(result.value).toBeNull();
    expect(result.nSamples).toBe(0);
    expect(result.excludedImplausible).toBe(1);
  });
});

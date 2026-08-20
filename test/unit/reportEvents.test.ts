import { detectEvents, CONFIDENCE_FLOOR_FOR_CLASSIFICATION } from "../../src/report/events";
import type {
  ParameterBaseline, ParameterStats, ReportInput, SiteMetadata,
} from "../../src/report/types";

/**
 * events.ts ports the Pollution Event Signature Matrix classifier (events.py). These tests build
 * ReportInput fixtures with real [ms, value] series rather than mocking the classifier, so a
 * regression in the threshold-crossing/window-merge logic (not just the rule table) would fail
 * them too -- matching the "verified against real numbers" bar the rest of this port used.
 */

const HOUR = 3_600_000;
const BASE = Date.parse("2026-08-01T00:00:00.000Z");
const at = (hours: number): number => BASE + hours * HOUR;

const fixedBaseline = (
  key: string, label: string, unit: string, min: number, max: number,
): ParameterBaseline => ({
  key, label, unit, baselineMin: min, baselineMax: max, exceedanceMargin: 0.15, hasFixedBaseline: true,
});

const noFixedBaseline = (key: string, label: string, unit: string): ParameterBaseline => ({
  key, label, unit, baselineMin: 0, baselineMax: 0, exceedanceMargin: 0.15, hasFixedBaseline: false,
});

/** A flat series at `normal` for the whole 4h window, except `abnormal` at each hour in `excursionHours`. */
const seriesWithExcursion = (normal: number, abnormal: number, excursionHours: number[]): Array<[number, number]> => (
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map((h) => [at(h), excursionHours.includes(h) ? abnormal : normal])
);

const statsFor = (baseline: ParameterBaseline, series: Array<[number, number]>, pattern: ParameterStats["pattern"] = "unknown"): ParameterStats => {
  const values = series.map(([, v]) => v);
  return {
    baseline,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((s, v) => s + v, 0) / values.length,
    median: values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)],
    pattern,
    series,
  };
};

const report = (parameters: ParameterStats[]): ReportInput => ({
  site: {} as SiteMetadata,
  parameters,
  events: [],
});

describe("detectEvents — no excursions", () => {
  it("returns no events when every parameter stays within baseline", () => {
    const ph = statsFor(fixedBaseline("ph", "pH", "", 6.5, 8.5), seriesWithExcursion(7.2, 7.2, []));
    expect(detectEvents(report([ph]))).toEqual([]);
  });

  it("ignores an excursion shorter than the 1-hour minimum event duration", () => {
    // Only the single point at h=2 is abnormal -- a 30-minute-spaced series can't sustain an
    // hour-long window from one abnormal sample surrounded by normal ones.
    const ph = statsFor(fixedBaseline("ph", "pH", "", 6.5, 8.5), seriesWithExcursion(7.2, 5.0, [2]));
    expect(detectEvents(report([ph]))).toEqual([]);
  });
});

describe("detectEvents — classification", () => {
  it("classifies a DO/ORP crash with rising conductivity and turbidity as Sewage", () => {
    const window = [1, 1.5, 2]; // h=1 to h=2, a 1-hour sustained window
    const parameters = [
      statsFor(fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 6, 11), seriesWithExcursion(9, 4, window)),
      statsFor(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), seriesWithExcursion(300, 100, window)),
      statsFor(fixedBaseline("turbidity", "Turbidity (NTU)", "NTU", 5, 25), seriesWithExcursion(10, 40, window)),
      statsFor(fixedBaseline("conductivity", "Conductivity (µS/cm)", "µS/cm", 50, 1_500), seriesWithExcursion(500, 2_000, window)),
    ];

    const events = detectEvents(report(parameters));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("Sewage");
    expect(events[0].confidence).toBeCloseTo(0.7, 10);
    expect(events[0].windowStartMs).toBe(at(1));
    expect(events[0].windowEndMs).toBe(at(2));
  });

  it("downgrades a below-floor classification to Inconclusive rather than asserting it", () => {
    // Conductivity alone, rising -- matches "Saltwater intrusion" at confidence 0.45, which is
    // below CONFIDENCE_FLOOR_FOR_CLASSIFICATION (0.5).
    const window = [1, 1.5, 2];
    const conductivity = statsFor(
      fixedBaseline("conductivity", "Conductivity (µS/cm)", "µS/cm", 50, 1_500),
      seriesWithExcursion(500, 2_000, window),
    );

    const events = detectEvents(report([conductivity]));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("Inconclusive");
    expect(events[0].confidence).toBeLessThan(CONFIDENCE_FLOOR_FOR_CLASSIFICATION);
    expect(events[0].interpretation).toContain("downgraded to");
  });
});

describe("detectEvents — pattern and baseline exclusions", () => {
  it("never flags a parameter tagged diel or tidal, even with real excursions", () => {
    const window = [1, 1.5, 2];
    const orp = statsFor(
      fixedBaseline("orp", "ORP (mV)", "mV", 200, 400),
      seriesWithExcursion(300, 100, window),
      "diel",
    );
    expect(detectEvents(report([orp]))).toEqual([]);
  });

  it("never flags a parameter with no fixed baseline (temperature)", () => {
    const window = [1, 1.5, 2];
    const temperature = statsFor(
      noFixedBaseline("temperature", "Temperature (°F)", "°F"),
      seriesWithExcursion(70, 95, window),
    );
    expect(detectEvents(report([temperature]))).toEqual([]);
  });
});

describe("detectEvents — algal bloom", () => {
  it("flags a DO series tagged diel that swings above and below baseline within one day", () => {
    const baseline = fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 6, 11);
    // Supersaturated at midday, crashed pre-dawn -- both inside the same calendar day.
    const series: Array<[number, number]> = [
      [at(0), 7.0],
      [at(4), 4.5], // pre-dawn crash, below baselineMin
      [at(12), 13.0], // midday supersaturation, above baselineMax
      [at(20), 7.5],
    ];
    const doStats = statsFor(baseline, series, "diel");

    const events = detectEvents(report([doStats]));
    expect(events.some((e) => e.type === "Algal bloom")).toBe(true);
  });

  it("does not run the algal-bloom check on a DO series that isn't tagged diel", () => {
    const baseline = fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 6, 11);
    const series: Array<[number, number]> = [
      [at(0), 7.0], [at(4), 4.5], [at(12), 13.0], [at(20), 7.5],
    ];
    const doStats = statsFor(baseline, series, "unknown");
    // The daily swing itself does sustain 1h+ windows against baseline, so the generic
    // threshold detector may still fire -- but it must not be typed "Algal bloom" without
    // the diel tag, since that classification specifically requires it.
    const events = detectEvents(report([doStats]));
    expect(events.every((e) => e.type !== "Algal bloom")).toBe(true);
  });
});

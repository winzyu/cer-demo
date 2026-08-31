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

/** Turbidity as buildReportInput builds it: no numeric baseline, judged only on relative movement. */
const relativeIndexBaseline = (): ParameterBaseline => ({
  key: "turbidity",
  label: "Turbidity (Relative)",
  unit: "",
  baselineMin: 0,
  baselineMax: 0,
  exceedanceMargin: 0.15,
  hasFixedBaseline: false,
  scale: "relative-index",
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
      // Relative index, no numeric baseline: it contributes "turbidity rose" to the sewage
      // signature purely by departing from its own period average, which is the one claim an
      // uncalibrated monotonic index can support.
      statsFor(relativeIndexBaseline(), seriesWithExcursion(10, 40, window)),
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

  it("never opens an event window on turbidity alone, however large the index swing", () => {
    // "Crossed a threshold" is the one claim a relative index cannot make -- there is no
    // operator turbidity range on any device to cross. A 40x swing on its own produces nothing.
    const window = [1, 1.5, 2];
    const turbidity = statsFor(relativeIndexBaseline(), seriesWithExcursion(50, 2_000, window));
    expect(detectEvents(report([turbidity]))).toEqual([]);
  });

  it("describes a turbidity movement relative to its own period average, with no unit or range", () => {
    const window = [1, 1.5, 2];
    const parameters = [
      statsFor(fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 6, 11), seriesWithExcursion(9, 4, window)),
      statsFor(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), seriesWithExcursion(300, 100, window)),
      statsFor(relativeIndexBaseline(), seriesWithExcursion(10, 40, window)),
    ];

    const events = detectEvents(report(parameters));
    expect(events).toHaveLength(1);
    const { parameterMovements } = events[0];
    expect(parameterMovements).toContain("Turbidity (Relative) rose to a relative index of 40.00");
    expect(parameterMovements).toContain("period average");
    // No NTU claim and no baseline range anywhere in the turbidity clause.
    expect(parameterMovements).not.toContain("NTU");
  });

  it("ignores a turbidity wobble inside the relative-movement deadband", () => {
    // 10 -> 11 is a ~9% departure from the period average, well inside the 25% deadband, so
    // turbidity contributes nothing and the DO/ORP-only pattern classifies as Hypoxia rather
    // than Sewage.
    const window = [1, 1.5, 2];
    const parameters = [
      statsFor(fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 6, 11), seriesWithExcursion(9, 4, window)),
      statsFor(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), seriesWithExcursion(300, 100, window)),
      statsFor(relativeIndexBaseline(), seriesWithExcursion(10, 11, window)),
    ];

    const events = detectEvents(report(parameters));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("Hypoxia");
    expect(events[0].parameterMovements).not.toContain("Turbidity");
  });

  it("reads a rise from an all-zero turbidity period as a real rise, not as missing data", () => {
    // 0 is a genuine turbidity reading (a turbVolt above the clear-water reference clamps to 0),
    // so a period average of 0 gives a deadband of 0 and any non-zero window average is a rise.
    const window = [1, 1.5, 2];
    const parameters = [
      statsFor(fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 6, 11), seriesWithExcursion(9, 4, window)),
      statsFor(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), seriesWithExcursion(300, 100, window)),
      statsFor(fixedBaseline("conductivity", "Conductivity (µS/cm)", "µS/cm", 50, 1_500), seriesWithExcursion(500, 2_000, window)),
      statsFor(relativeIndexBaseline(), seriesWithExcursion(0, 800, window)),
    ];

    const events = detectEvents(report(parameters));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("Sewage"); // needs the turbidity rise to reach this classification
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

describe("detectEvents — a window covering the whole period", () => {
  /** pH sitting below baseline for every point in the period, as the Algalita Pod's does
   * against a seawater 7.8-8.3 range. */
  const persistentReport = (): ReportInput => report([
    statsFor(
      fixedBaseline("ph", "pH", "", 7.8, 8.3),
      [0, 4, 8, 12, 16, 20, 24].map((h): [number, number] => [at(h), 7.0]),
    ),
  ]);

  it("caps severity at Moderate instead of calling the whole period a High-severity event", () => {
    const [event] = detectEvents(persistentReport());
    expect(event.severity).toBe("Moderate");
  });

  it("says the readings never returned to baseline, and points at the baseline itself", () => {
    const [event] = detectEvents(persistentReport());
    expect(event.interpretation).toContain("sustained offset spanning the whole reporting period");
    expect(event.interpretation).toContain("baseline that does not fit this site");
  });

  it("still calls a short excursion a discrete event", () => {
    const short = report([
      statsFor(
        fixedBaseline("ph", "pH", "", 7.8, 8.3),
        [0, 4, 8, 12, 16, 20, 24].map((h): [number, number] => [at(h), h >= 4 && h <= 8 ? 7.0 : 8.0]),
      ),
    ]);
    const [event] = detectEvents(short);
    expect(event.interpretation).not.toContain("sustained offset spanning");
  });
});

describe("detectEvents — movement clauses", () => {
  it("names the bucket-mean peak and the period extreme, so Section 4 cannot contradict Section 2", () => {
    const stats = statsFor(
      fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 5, 8),
      [0, 1, 2, 3, 4].map((h): [number, number] => [at(h), 11.91]),
    );
    // The table's Max is an exact per-bucket extreme; the series carries bucket means.
    stats.max = 23.32;
    const [event] = detectEvents(report([stats]));
    expect(event.parameterMovements).toContain("11.91 mg/L on bucket averages");
    expect(event.parameterMovements).toContain("period max 23.32 mg/L");
  });

  it("leaves no trailing space on a parameter with no unit", () => {
    const stats = statsFor(
      fixedBaseline("ph", "pH", "", 7.8, 8.3),
      [0, 1, 2, 3, 4].map((h): [number, number] => [at(h), 6.18]),
    );
    const [event] = detectEvents(report([stats]));
    expect(event.parameterMovements).toContain("fell to 6.18 on bucket averages");
    expect(event.parameterMovements).not.toMatch(/ {2}/);
  });
});

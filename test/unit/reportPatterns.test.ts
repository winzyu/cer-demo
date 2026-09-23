import { classifyPattern, type HourlySeries } from "../../src/report/patterns";

/**
 * The diel/tidal/trend classifier on synthetic hourly series whose rhythm is known by
 * construction. Noise is a fixed pseudo-random sequence so every run sees the same numbers.
 */

const HOUR_MS = 3_600_000;
const START = Date.parse("2026-08-01T00:00:00.000Z");

/** Deterministic noise in [-1, 1): a linear congruential generator, seeded per call. */
const noise = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return (state / 2_147_483_648) * 2 - 1;
  };
};

const hourly = (hours: number, valueAt: (h: number) => number): HourlySeries => (
  Array.from({ length: hours }, (_, h): [number, number] => [START + h * HOUR_MS + 30 * 60_000, valueAt(h)])
);

const TWO_PI = 2 * Math.PI;

describe("classifyPattern", () => {
  it("tags a daily oscillation as diel, through noise", () => {
    const n = noise(1);
    const dissolvedOxygen = hourly(7 * 24, (h) => 8 + 2.5 * Math.sin((TWO_PI * h) / 24) + 0.5 * n());

    expect(classifyPattern(dissolvedOxygen)).toBe("diel");
  });

  it("tags a semidiurnal oscillation (12.42 h) as tidal, not diel", () => {
    const n = noise(2);
    const conductivity = hourly(7 * 24, (h) => 45_000 + 3_000 * Math.sin((TWO_PI * h) / 12.42) + 300 * n());

    expect(classifyPattern(conductivity)).toBe("tidal");
  });

  it("still sees the daily cycle under a slow drift, since the drift is removed first", () => {
    const n = noise(3);
    const drifting = hourly(10 * 24, (h) => 7 + 0.01 * h + 1.5 * Math.sin((TWO_PI * h) / 24) + 0.3 * n());

    expect(classifyPattern(drifting)).toBe("diel");
  });

  it("tags a multi-week creep with no cycle as trend", () => {
    const n = noise(4);
    // Drought-driven salinity creep: +150 µS/cm a day for three weeks, with sensor noise.
    const creep = hourly(21 * 24, (h) => 40_000 + (150 / 24) * h + 400 * n());

    expect(classifyPattern(creep)).toBe("trend");
  });

  it("does not call a week-long creep a trend: it must span weeks", () => {
    const n = noise(5);
    const shortCreep = hourly(7 * 24, (h) => 40_000 + (150 / 24) * h + 400 * n());

    expect(classifyPattern(shortCreep)).toBe("unknown");
  });

  it("leaves noise without a rhythm as unknown", () => {
    const n = noise(6);
    expect(classifyPattern(hourly(14 * 24, () => 7.5 + 0.2 * n()))).toBe("unknown");
  });

  it("leaves a perfectly flat signal as unknown rather than dividing by zero", () => {
    expect(classifyPattern(hourly(7 * 24, () => 7.5))).toBe("unknown");
  });

  it("refuses to classify fewer than three days", () => {
    const daily = hourly(60, (h) => 8 + 2 * Math.sin((TWO_PI * h) / 24));
    expect(classifyPattern(daily)).toBe("unknown");
  });

  it("refuses to classify a series with too many gaps", () => {
    // Every other half-day missing: half the grid empty, below the coverage floor.
    const gappy = hourly(10 * 24, (h) => 8 + 2 * Math.sin((TWO_PI * h) / 24))
      .filter((_, h) => Math.floor(h / 12) % 2 === 0 || h % 12 < 1);
    expect(classifyPattern(gappy)).toBe("unknown");
  });

  it("is unknown for an empty series", () => {
    expect(classifyPattern([])).toBe("unknown");
  });

  it("reads the grid by timestamp, not by array order", () => {
    const n = noise(7);
    const shuffled = hourly(7 * 24, (h) => 8 + 2.5 * Math.sin((TWO_PI * h) / 24) + 0.5 * n()).reverse();
    expect(classifyPattern(shuffled)).toBe("diel");
  });
});

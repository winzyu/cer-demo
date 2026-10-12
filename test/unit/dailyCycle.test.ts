import type { Sample } from "../../src/tools/aggregate";
import {
  dailyCycle, localSolar, solarOffsetHours, withLocalSolar,
} from "../../src/tools/dailyCycle";

/**
 * When in the day a metric peaks (`src/tools/dailyCycle.ts`, record §5 item 5): the only evidence
 * the model has for telling a solar cycle from a tidal one, since no tool measures tides.
 */

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-10-01T00:00:00.000Z");
/** Bay Mouth's longitude: local solar time runs about 7 h 52 min behind UTC. */
const LON = -118.1146;
const OFFSET = solarOffsetHours(LON) * HOUR;

/** Half-hourly samples whose value peaks at `peakHour(day)` local solar time each day. */
const samples = (days: number, peakHour: (day: number) => number, noise = 0): Sample[] => {
  const out: Sample[] = [];
  let seed = 7;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let t = START; t < START + days * DAY; t += HOUR / 2) {
    const local = t + OFFSET;
    const day = Math.floor((local - (START + OFFSET)) / DAY);
    const hour = ((local % DAY) + DAY) % DAY / HOUR;
    const value = Math.cos((2 * Math.PI * (hour - peakHour(day))) / 24) + noise * random();
    out.push({
      atMs: t, at: new Date(t).toISOString(), value, valid: true, plausible: true,
    });
  }
  return out;
};

describe("dailyCycle", () => {
  it("calls a peak at the same hour every day a solar timing", () => {
    const cycle = dailyCycle(samples(8, () => 14.5), LON);
    expect(cycle?.timing).toBe("same hour each day");
    // Samples fall on the UTC half hour, so local solar times end in :08 or :38.
    expect(cycle?.daily_peaks_local_solar.every((at) => at.slice(11, 13) === "14")).toBe(true);
    expect(Math.abs(cycle!.peak_drift_minutes_per_day)).toBeLessThan(15);
  });

  it("calls a peak about 50 minutes later each day a tidal timing, across midnight", () => {
    // Starts at 21:00 and drifts past midnight by the fourth day.
    const cycle = dailyCycle(samples(9, (day) => 21 + 0.83 * day), LON);
    expect(cycle?.timing).toBe("about 50 minutes later each day");
    expect(cycle?.peak_drift_minutes_per_day).toBeGreaterThan(40);
    expect(cycle?.peak_drift_minutes_per_day).toBeLessThan(60);
  });

  it("calls noise with no daily shape unclear rather than guessing", () => {
    const flat = samples(8, () => 12, 0).map((s, i) => ({ ...s, value: Math.sin(i * 12.9898) * 43758.5453 % 1 }));
    expect(dailyCycle(flat, LON)?.timing).toBe("unclear");
  });

  it("gives nothing with fewer than three full days", () => {
    expect(dailyCycle(samples(3, () => 14), LON)).toBeUndefined();
  });

  it("ignores readings the device flagged or that were implausible", () => {
    const rows = samples(8, () => 14.5).map((s) => (
      new Date(s.atMs + OFFSET).getUTCHours() === 3 ? { ...s, value: 50, valid: false } : s
    ));
    expect(dailyCycle(rows, LON)?.timing).toBe("same hour each day");
  });
});

describe("local solar time", () => {
  it("shifts UTC by the longitude, not by a time zone", () => {
    expect(localSolar(Date.parse("2026-10-05T22:00:00.000Z"), LON)).toBe("2026-10-05 14:07");
    expect(localSolar(Date.parse("2026-10-05T22:00:00.000Z"), 0)).toBe("2026-10-05 22:00");
  });

  it("labels each series bucket beside its UTC start", () => {
    const [bucket] = withLocalSolar([{
      start: "2026-10-05T21:00:00.000Z", end: "2026-10-06T00:00:00.000Z", mean: 1, min: 0, max: 2, n: 6,
    }], LON);
    expect(bucket.start).toBe("2026-10-05T21:00:00.000Z");
    expect(bucket.start_local_solar).toBe("2026-10-05 13:07");
  });
});

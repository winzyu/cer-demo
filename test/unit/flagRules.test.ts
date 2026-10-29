import { decodeReading } from "../../src/devices/metrics";
import { qcMetric, unusualKind } from "../../src/devices/readingQc";
import {
  assessFlags, assessWindow, EXCEEDANCE_MARGIN, flagEpisodes, FLAG_SHARE, judgeMetric, MIN_FLAG_READINGS,
  PERSISTENT_SHARE, unusualStretches,
} from "../../src/report/flagRules";
import type { TimedValue } from "../../src/report/flagRules";
import { minimumDetectableChange } from "../../src/report/referenceRanges";
import { OCT_7, SEP_25_26, SEP_29_30 } from "../fixtures/algalita/recorded";
import type { RecordedRow } from "../fixtures/algalita/recorded";

/**
 * The flag rules of 2026-10-13 (docs/timeline.md): Michael's share rule (5% of a rolling 24 hours,
 * at least 3 readings), current against past, the edge rule, and unusual readings that never
 * count. Readings are 30 minutes apart, the pods' cadence, unless a case says otherwise.
 */
const MINUTE = 60_000;
const STEP = 30 * MINUTE;
const series = (values: number[], step = STEP): TimedValue[] => values.map((v, i) => [i * step, v]);
const ph = (reading: number): number => minimumDetectableChange("ph", reading); // 0.2
const LIMIT = { min: 7.8, max: 8.3 };
const quiet = (n: number): number[] => Array.from({ length: n }, () => 8.1);
const unusual = (point: TimedValue): TimedValue => [point[0], point[1], "value"];

describe("the share rule (Michael #1, #2)", () => {
  it("never flags one or two readings, however far out", () => {
    expect(MIN_FLAG_READINGS).toBe(3);
    expect(flagEpisodes(series([...quiet(20), 11, ...quiet(20)]), LIMIT, ph)).toEqual([]);
    expect(flagEpisodes(series([...quiet(20), 9, 9, ...quiet(20)]), LIMIT, ph)).toEqual([]);
  });

  it("flags three readings in 24 hours, consecutive or not", () => {
    const values = quiet(48);
    [5, 20, 40].forEach((i) => { values[i] = 8.7; });
    expect(flagEpisodes(series(values), LIMIT, ph)).toEqual([{
      direction: "high", startMs: 5 * STEP, endMs: 40 * STEP, readings: 3, extreme: 8.7,
    }]);
  });

  it("needs 5% of the window once a pod reports more often than every 24 minutes", () => {
    expect(FLAG_SHARE).toBe(0.05);
    const step = 20 * MINUTE; // 72 readings a day
    // Three days, the readings on the middle one: every 24-hour window holds 72 readings.
    const three = quiet(216);
    [90, 110, 130].forEach((i) => { three[i] = 8.7; }); // at most 3 of 72, 4.2%
    expect(flagEpisodes(series(three, step), LIMIT, ph)).toEqual([]);
    const four = [...three];
    four[120] = 8.7; // 4 of 72, 5.6%
    expect(flagEpisodes(series(four, step), LIMIT, ph)).toHaveLength(1);
  });

  it("does not flag readings spread over more than a day", () => {
    const values = quiet(144);
    [0, 50, 100].forEach((i) => { values[i] = 8.7; }); // 25 hours apart
    expect(flagEpisodes(series(values), LIMIT, ph)).toEqual([]);
  });

  it("ignores readings past the limit by less than the minimum detectable change", () => {
    // 8.45 is above 8.3 by 0.15, under pH's 0.2.
    expect(flagEpisodes(series([8.45, 8.45, 8.45, 8.45]), LIMIT, ph)).toEqual([]);
  });

  it("counts high and low separately", () => {
    expect(flagEpisodes(series([8.6, 7.2, 8.6, 7.2, ...quiet(10)]), LIMIT, ph)).toEqual([]);
  });

  it("never counts unusual readings, but keeps them in the denominator", () => {
    const values = series([...quiet(10), 8.7, 8.7, 8.7, ...quiet(10)]);
    expect(flagEpisodes(values, LIMIT, ph)).toHaveLength(1);
    const marked = values.map((point, i) => (i === 10 ? unusual(point) : point));
    expect(flagEpisodes(marked, LIMIT, ph)).toEqual([]);
  });
});

describe("assessFlags", () => {
  it("is current only when the latest 24 hours meet the rule (Michael #4)", () => {
    const past = assessFlags(series([8.7, 8.7, 8.7, ...quiet(60)]), LIMIT, ph);
    expect(past.episodes).toHaveLength(1);
    expect(past.current).toBe(false);
    const now = assessFlags(series([...quiet(60), 8.7, 8.7, 8.7]), LIMIT, ph);
    expect(now.current).toBe(true);
  });

  it("puts Action Required on current flags beyond 15% of the range only", () => {
    expect(EXCEEDANCE_MARGIN).toBe(0.15);
    const conductivity = (r: number): number => minimumDetectableChange("conductivity", r);
    const limit = { min: 40_000, max: 50_000 }; // margin 1,500 against 2% of ~52,000 = 1,040
    const recent = assessFlags(series([...Array(60).fill(45_000), 52_000, 52_000, 52_000]), limit, conductivity);
    expect(recent.currentExceedance).toBe(true);
    const mild = assessFlags(series([...Array(60).fill(45_000), 51_200, 51_300, 51_200]), limit, conductivity);
    expect(mild.current).toBe(true);
    expect(mild.currentExceedance).toBe(false);
    const cleared = assessFlags(series([52_000, 52_000, 52_000, ...Array(60).fill(45_000)]), limit, conductivity);
    expect(cleared.exceedance).toHaveLength(1);
    expect(cleared.currentExceedance).toBe(false);
  });

  it("calls flagged readings over at least 80% of the readings persistent", () => {
    expect(PERSISTENT_SHARE).toBe(0.8);
    expect(assessFlags(series([8.1, 8.6, 8.6, 8.6, 8.6]), LIMIT, ph).persistent).toBe(true);
    expect(assessFlags(series([8.1, 8.1, 8.6, 8.6, 8.6]), LIMIT, ph).persistent).toBe(false);
  });
});

describe("the edge rule (Michael #6)", () => {
  const MICHAEL = { min: 6, max: 10 };
  /** A week of pH near 7.5, dipping to `dip` from 14:00 to 17:30 on the given days. */
  const afternoons = (days: number[], dip: number, total = 7): TimedValue[] => Array.from(
    { length: total * 48 },
    (_, i): TimedValue => {
      const hour = (i % 48) / 2;
      const inDip = days.includes(Math.floor(i / 48)) && hour >= 14 && hour <= 17.5;
      return [i * STEP, inDip ? dip + 0.02 * (i % 3) : 7.5];
    },
  );

  it("mentions a daily dip to the edge on most days, without flagging it", () => {
    const flags = assessFlags(afternoons([0, 1, 2, 3, 4, 5, 6], 5.9), MICHAEL, ph);
    expect(flags.episodes).toEqual([]);
    expect(flags.edge).toMatchObject({ side: "low", shape: "daily", days: 7, periodDays: 7 });
  });

  it("needs half the days and at least three", () => {
    expect(assessFlags(afternoons([0, 1, 2], 5.9), MICHAEL, ph).edge).toBeUndefined(); // 3 of 7
    expect(assessFlags(afternoons([0, 2, 4, 6], 5.9), MICHAEL, ph).edge).toBeDefined(); // 4 of 7
    expect(assessFlags(afternoons([0, 1], 5.9, 2), MICHAEL, ph).edge).toBeUndefined(); // 2 days
  });

  it("mentions 12 hours in a row at the edge", () => {
    const values = series([...Array(10).fill(7.5), ...Array(25).fill(6.1), ...Array(10).fill(7.5)]);
    expect(assessFlags(values, MICHAEL, ph).edge).toMatchObject({ side: "low", shape: "plateau" });
    const short = series([...Array(10).fill(7.5), ...Array(20).fill(6.1), ...Array(10).fill(7.5)]);
    expect(assessFlags(short, MICHAEL, ph).edge).toBeUndefined();
  });

  it("gives way to a flag", () => {
    const flags = assessFlags(afternoons([0, 1, 2, 3, 4, 5, 6], 5.5), MICHAEL, ph);
    expect(flags.episodes.length).toBeGreaterThan(0);
    expect(flags.edge).toBeUndefined();
  });
});

describe("unusualStretches", () => {
  it("mentions unusual readings only when they meet the share rule themselves", () => {
    const values = series(quiet(48));
    const two = values.map((p, i) => (i === 5 || i === 30 ? unusual(p) : p));
    expect(unusualStretches(two)).toEqual([]);
    const three = values.map((p, i) => ([5, 6, 7].includes(i) ? unusual([p[0], 12.5]) : p));
    expect(unusualStretches(three)).toEqual([{
      startMs: 5 * STEP, endMs: 7 * STEP, readings: 3, lowest: 12.5, highest: 12.5,
    }]);
  });

  it("leaves spikes and jumps out: a blip is a moment, not a stretch (Michael #1)", () => {
    const spikes = series(quiet(48)).map((p, i): TimedValue => ([5, 6, 7].includes(i) ? [p[0], 9, "moment"] : p));
    expect(unusualStretches(spikes)).toEqual([]);
    expect(flagEpisodes(spikes, LIMIT, ph)).toEqual([]);
  });
});

describe("judgeMetric", () => {
  const base = { minimumDetectableChange: ph };

  it("is in range, or out of range with its flagged stretches", () => {
    expect(judgeMetric({ ...base, values: series([8.1, 8.2, 8.1]), limit: LIMIT }).status)
      .toBe("in range");
    const verdict = judgeMetric({ ...base, values: series([8.1, 8.6, 8.7, 8.6]), limit: LIMIT });
    expect(verdict.status).toBe("out of range");
    expect(verdict.flags?.current).toBe(true);
  });

  it("is a likely data issue only when device faults left no readings", () => {
    expect(judgeMetric({ ...base, faultedOnly: true, values: [], limit: LIMIT }).status)
      .toBe("likely data issue");
    // Faults elsewhere in the window are reported beside the verdict, never instead of it.
    expect(judgeMetric({
      ...base, faultedOnly: true, values: series([8.6, 8.7, 8.6]), limit: LIMIT,
    }).status).toBe("out of range");
  });

  it("judges a one-reading window on the 24 hours before it", () => {
    const values = series([8.6, 8.7, 8.6, 8.7]);
    expect(judgeMetric({
      ...base, values: values.slice(3), lookback: values.slice(0, 3), limit: LIMIT,
    })).toMatchObject({ status: "out of range", flags: { current: true } });
    expect(judgeMetric({ ...base, values: values.slice(3), limit: LIMIT }).status)
      .toBe("not enough data");
  });

  it("keeps only flagged stretches reaching into the window", () => {
    const all = series([8.7, 8.7, 8.7, ...quiet(100)]);
    const fromMs = all[60][0];
    const verdict = judgeMetric({
      ...base, values: all.filter(([ms]) => ms >= fromMs), lookback: all.filter(([ms]) => ms < fromMs), fromMs, limit: LIMIT,
    });
    expect(verdict.status).toBe("in range");
  });

  it("reports not assessed without a limit", () => {
    expect(judgeMetric({ ...base, values: series([8.1, 8.1, 8.1]) }).status).toBe("not assessed");
  });
});

describe("assessWindow", () => {
  // One out-of-range reading the day before the window and two inside it: three in 24 hours.
  const all = series([...quiet(10), 8.7, ...quiet(5), 8.7, 8.7, ...quiet(10)]);
  const fromMs = all[12][0];
  const values = all.filter(([ms]) => ms >= fromMs);
  const lookback = all.filter(([ms]) => ms < fromMs);

  it("flags a stretch straddling the window's start, as the chat verdict does", () => {
    const flags = assessWindow({ values, lookback, fromMs, limit: LIMIT, minimumDetectableChange: ph });
    expect(flags.episodes).toEqual([expect.objectContaining({ direction: "high", readings: 3 })]);
    expect(judgeMetric({ values, lookback, fromMs, limit: LIMIT, minimumDetectableChange: ph }).flags)
      .toEqual(flags);
    // The window's own two readings are not enough without the day before it.
    expect(assessWindow({ values, fromMs, limit: LIMIT, minimumDetectableChange: ph }).episodes)
      .toEqual([]);
  });

  it("ignores lookback older than 24 hours before the window's first reading", () => {
    const shifted = lookback.map(([ms, v]): TimedValue => [ms - 24 * 60 * MINUTE, v]);
    expect(assessWindow({
      values, lookback: shifted, fromMs, limit: LIMIT, minimumDetectableChange: ph,
    }).episodes).toEqual([]);
  });
});

describe("the recorded Algalita cases (limits 6-10, a marine pod)", () => {
  const ALGALITA = { min: 6, max: 10 };
  /** QC, then the kept readings with unusual ones marked, as the sensor tool builds them. */
  const kept = (rows: readonly RecordedRow[]): TimedValue[] => {
    const readings = rows.map(([at, value]) => decodeReading({
      timestamp: Date.parse(at) / 1000, water_data: { 99: value, phError: 0 },
    }));
    const flags = qcMetric(readings, "ph", { water: "coastal" });
    return readings
      .filter((row) => flags.get(row)?.flag !== "fail")
      .map((row): TimedValue => {
        const kind = unusualKind(flags.get(row));
        const point: [number, number] = [Date.parse(row.observedAt!), row.metrics.ph.value!];
        return kind ? [...point, kind] : point;
      });
  };
  const before = (rows: readonly RecordedRow[], hours: number): TimedValue[] => {
    const start = Date.parse(rows[0][0]);
    return Array.from({ length: hours * 2 }, (_, i): TimedValue => [start - (hours * 2 - i) * STEP, 7.4]);
  };

  it("keeps Michael's Oct 7 three readings above 10 quiet", () => {
    const values = [...before(OCT_7, 22), ...kept(OCT_7)];
    const flags = assessFlags(values, ALGALITA, ph);
    expect(flags.episodes).toEqual([]);
    expect(unusualStretches(values)).toEqual([]);
  });

  it("flags Sep 26 high from the 11.2-11.9 readings and mentions the readings above 12", () => {
    const values = kept(SEP_25_26);
    const flags = assessFlags(values, ALGALITA, ph);
    const high = flags.episodes.filter((e) => e.direction === "high");
    expect(high).toHaveLength(1);
    expect(high[0]).toMatchObject({
      startMs: Date.parse("2026-09-26T11:26:00Z"), // 04:26 PDT, 11.87
      endMs: Date.parse("2026-09-26T17:26:00Z"), // 10:26 PDT, 11.21
      readings: 12,
      extreme: 11.92,
    });
    const stretches = unusualStretches(values);
    expect(stretches[0]).toMatchObject({ highest: 12.91 });
    expect(stretches[0].readings).toBeGreaterThanOrEqual(19);
  });

  it("does not count the 2.73 drop or the jump after it toward a flag", () => {
    const values = kept(SEP_25_26);
    const low = assessFlags(values, ALGALITA, ph).episodes.filter((e) => e.direction === "low");
    // Only 5.07 is a counted low reading so far; the days after it flag once 3 accumulate.
    expect(low).toEqual([]);
    const later: TimedValue[] = Array.from({ length: 6 }, (_, i): TimedValue => [
      Date.parse("2026-09-27T02:26:00Z") + i * STEP, 5.2 + 0.05 * i,
    ]);
    const flagged = assessFlags([...values, ...later], ALGALITA, ph).episodes
      .filter((e) => e.direction === "low");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ startMs: Date.parse("2026-09-27T01:56:00Z"), extreme: 5.07 });
  });

  it("leaves the normal night alone", () => {
    const flags = assessFlags(kept(SEP_29_30), ALGALITA, ph);
    expect(flags.episodes).toEqual([]);
    expect(flags.edge).toBeUndefined();
  });
});

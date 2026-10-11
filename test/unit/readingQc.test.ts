import { decodeReading } from "../../src/devices/metrics";
import {
  allChannelFailureRuns, dataIssueRuns, FLAT_LINE_FAIL_READINGS, FLAT_LINE_SUSPECT_READINGS,
  inTimeOrder, isAllChannelFailure, MAX_GAP_MS, medianAbsoluteDeviation, qcMetric, readingGaps,
  SENSOR_READ_FAILURE_VALUE, STUCK_TURBIDITY_MIN_DURATION_MS,
} from "../../src/devices/readingQc";
import type { MetricKey } from "../../src/types/device.types";

/**
 * Per-reading QC, v2 §8. Readings are 30 minutes apart unless a case says otherwise, the pods'
 * real cadence (POST_LAUNCH_BACKLOG.md §1a).
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const STEP = 30 * MINUTE;
const ALL: MetricKey[] = ["dissolvedOxygen", "orp", "ph", "conductivity", "temperature", "turbidity"];

const at = (i: number, step = STEP): number => 1_000_000 + (i * step) / 1000;
const ph = (values: number[], step = STEP, extra: Record<string, number> = {}) => values.map(
  (value, i) => decodeReading({
    timestamp: at(i, step), water_data: { 99: value, phError: 0, ...extra },
  }),
);
const turbidity = (values: number[], step = STEP) => values.map(
  (value, i) => decodeReading({ timestamp: at(i, step), water_data: { 72: value, turbError: 0 } }),
);
/** pH wobbling naturally, never twice the same value. */
const wobble = (n: number): number[] => Array.from(
  { length: n },
  (_, i) => 8 + 0.01 * (i % 7) + 0.001 * i,
);
const flagsOf = (rows: ReturnType<typeof ph>, key: MetricKey = "ph") => {
  const flags = qcMetric(rows, key);
  return rows.map((row) => flags.get(row)?.flag);
};

describe("point checks (v2 §8.2 gross range)", () => {
  it("fails a reading whose error flag is set, and passes one whose flag is clear", () => {
    const rows = [...ph([8.1]), ...ph([8.1], STEP, { phError: 1 })];
    const flags = qcMetric(rows, "ph");
    expect(flags.get(rows[0])).toEqual({ flag: "pass" });
    expect(flags.get(rows[1])).toEqual({ flag: "fail", reason: "error-flag" });
  });

  it("fails the server's 1000000000 read-failure value", () => {
    const rows = ph([SENSOR_READ_FAILURE_VALUE]);
    expect(qcMetric(rows, "ph").get(rows[0])).toEqual({ flag: "fail", reason: "read-failure" });
  });

  it("fails an implausible value the probe did not flag", () => {
    const rows = ph([2.07]); // Algalita's pH minimum in seawater, REPORT_AUDIT finding 5
    expect(qcMetric(rows, "ph").get(rows[0])).toEqual({ flag: "fail", reason: "implausible" });
  });

  it("leaves readings without a value for the metric out of the map", () => {
    const rows = ph([8.1]);
    expect(qcMetric(rows, "orp").size).toBe(0);
  });
});

describe("flat line (v2 §8.2)", () => {
  it("passes 5 identical readings, suspects 6, fails 24", () => {
    expect(FLAT_LINE_SUSPECT_READINGS).toBe(6);
    expect(FLAT_LINE_FAIL_READINGS).toBe(24);
    expect(flagsOf(ph([...wobble(3), 8.5, 8.5, 8.5, 8.5, 8.5, ...wobble(3)])))
      .not.toContain("suspect");
    const six = flagsOf(ph([...wobble(3), ...Array(6).fill(8.5), 8.21]));
    expect(six.slice(3, 9)).toEqual(Array(6).fill("suspect"));
    const rows = ph(Array(24).fill(0.0).map(() => 7.9));
    expect(new Set(flagsOf(rows))).toEqual(new Set(["fail"]));
    expect(qcMetric(rows, "ph").get(rows[0])?.reason).toBe("flat-line");
  });

  it("is broken by a gap longer than 3 hours", () => {
    const rows = ph(Array(6).fill(8.5), MAX_GAP_MS + MINUTE);
    expect(flagsOf(rows)).not.toContain("suspect");
  });

  it("is broken by a failed reading in the middle", () => {
    const faulted = ph([8.5], STEP, { phError: 1 });
    const rows = [...ph([8.5, 8.5, 8.5]), ...faulted, ...ph([8.5, 8.5, 8.5])]
      .map((row, i) => ({ ...row, observedAt: new Date(at(i) * 1000).toISOString() }));
    expect(flagsOf(rows).filter((f) => f === "suspect")).toHaveLength(0);
  });

  it("applies to stuck zeros on metrics where 0 is not a real reading (Balboa's dissolved oxygen)", () => {
    const rows = Array.from({ length: 24 }, (_, i) => decodeReading({
      timestamp: at(i), water_data: { 97: 0, doError: 0 },
    }));
    expect(new Set(flagsOf(rows, "dissolvedOxygen"))).toEqual(new Set(["fail"]));
  });
});

describe("turbidity at 0 keeps its own 24-hour rule", () => {
  it("does not suspect a few hours of zeros: the index clamps clear water to 0", () => {
    expect(flagsOf(turbidity(Array(12).fill(0)), "turbidity")).not.toContain("suspect");
  });

  it("fails zeros that last a full day, with exactly 3-hour gaps", () => {
    expect(STUCK_TURBIDITY_MIN_DURATION_MS).toBe(24 * HOUR);
    const rows = turbidity(Array(9).fill(0), 3 * HOUR);
    const flags = qcMetric(rows, "turbidity");
    expect(rows.map((row) => flags.get(row)))
      .toEqual(Array(9).fill({ flag: "fail", reason: "stuck-turbidity" }));
  });

  it("keeps zeros one millisecond short of a day", () => {
    const rows = turbidity(Array(9).fill(0), 3 * HOUR);
    rows[8].observedAt = new Date(Date.parse(rows[8].observedAt!) - 1).toISOString();
    expect(flagsOf(rows, "turbidity")).not.toContain("fail");
  });

  it("treats a stuck 1005 as an ordinary flat line", () => {
    expect(new Set(flagsOf(turbidity(Array(24).fill(1005)), "turbidity"))).toEqual(new Set(["fail"]));
  });
});

describe("spike (v2 §8.2)", () => {
  it("suspects a reading far from two agreeing neighbours", () => {
    const values = wobble(20);
    values[10] = 9.5;
    const rows = ph(values);
    const flags = qcMetric(rows, "ph");
    expect(flags.get(rows[10])).toEqual({ flag: "suspect", reason: "spike" });
    expect(flagsOf(rows).filter((f) => f === "suspect")).toHaveLength(1);
  });

  it("does not suspect a step change, where the neighbours disagree", () => {
    const values = [...wobble(10), ...wobble(10).map((v) => v + 1)];
    expect(flagsOf(ph(values))).not.toContain("suspect");
  });

  it("is skipped when the MAD is 0", () => {
    expect(medianAbsoluteDeviation([5, 5, 5, 9])).toBe(0);
    const rows = turbidity([0, 0, 0, 900, 0, 0, 0]);
    expect(flagsOf(rows, "turbidity")).not.toContain("suspect");
  });
});

describe("likely data issue: 3 consecutive suspect or failed readings", () => {
  it("is not raised by scattered failures", () => {
    const rows = inTimeOrder([0, 1, 2, 3, 4, 5].map((i) => decodeReading({
      timestamp: at(i), water_data: { 99: 8.1 + i * 0.01, phError: i % 2 },
    })));
    expect(dataIssueRuns(rows, qcMetric(rows, "ph"))).toEqual([]);
  });

  it("is raised by three failures in a row, with their start and end", () => {
    const rows = inTimeOrder([0, 1, 2, 3, 4].map((i) => decodeReading({
      timestamp: at(i), water_data: { 99: 8.1 + i * 0.01, phError: i >= 1 && i <= 3 ? 1 : 0 },
    })));
    expect(dataIssueRuns(rows, qcMetric(rows, "ph")))
      .toEqual([{ startMs: at(1) * 1000, endMs: at(3) * 1000, readings: 3 }]);
  });

  it("is broken by a gap longer than 3 hours", () => {
    const rows = inTimeOrder([0, 1, 2].map((i) => decodeReading({
      timestamp: at(i, 4 * HOUR), water_data: { 99: 8.1, phError: 1 },
    })));
    expect(dataIssueRuns(rows, qcMetric(rows, "ph"))).toEqual([]);
  });
});

describe("all-channel failures (v2 §7.2 rule 1)", () => {
  const failure = (i: number) => decodeReading({
    timestamp: at(i),
    water_data: Object.fromEntries(
      [97, 98, 99, 100, 102, 72].map((code) => [code, SENSOR_READ_FAILURE_VALUE]),
    ),
  });
  const healthy = (i: number) => decodeReading({
    timestamp: at(i),
    water_data: {
      97: 7, 98: 200, 99: 8.1, 100: 50_000, 102: 20, 72: 300,
    },
  });

  it("recognises a reading on which every channel failed, and not a partial one", () => {
    expect(isAllChannelFailure(failure(0), ALL)).toBe(true);
    expect(isAllChannelFailure(healthy(0), ALL)).toBe(false);
    const partial = decodeReading({
      timestamp: at(0), water_data: { 99: 8.1, 97: SENSOR_READ_FAILURE_VALUE },
    });
    expect(isAllChannelFailure(partial, ALL)).toBe(false);
  });

  it("flags three in a row, as on Algalita once in 60 days, and not two", () => {
    const pair = [healthy(0), failure(1), failure(2), healthy(3)];
    expect(allChannelFailureRuns(pair, ALL)).toEqual([]);
    const three = [healthy(0), failure(1), failure(2), failure(3), healthy(4)];
    expect(allChannelFailureRuns(three, ALL)).toHaveLength(1);
  });
});

describe("missing data", () => {
  it("counts silences longer than 3 hours", () => {
    const rows = ph([8.1, 8.2, 8.3]);
    rows[2].observedAt = new Date(Date.parse(rows[1].observedAt!) + MAX_GAP_MS + 1).toISOString();
    expect(readingGaps(rows)).toHaveLength(1);
    expect(readingGaps(ph([8.1, 8.2, 8.3]))).toEqual([]);
  });
});

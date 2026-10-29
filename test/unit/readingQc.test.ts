import { decodeReading } from "../../src/devices/metrics";
import {
  allChannelFailureRuns, dataIssueRuns, FLAT_LINE_FAIL_READINGS, FLAT_LINE_SUSPECT_READINGS,
  inTimeOrder, isAllChannelFailure, MAX_GAP_MS, medianAbsoluteDeviation, qcMetric, qcReadings,
  readingGaps, SENSOR_READ_FAILURE_VALUE, servicingRuns, STUCK_TURBIDITY_MIN_DURATION_MS,
} from "../../src/devices/readingQc";
import type { MetricKey } from "../../src/types/device.types";
import { OCT_7, SEP_25_26 } from "../fixtures/algalita/recorded";

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

  it("fails a rail the probe did not flag: pH exactly 0 or 14", () => {
    const rows = ph([0, 14]);
    const flags = qcMetric(rows, "ph");
    expect(flags.get(rows[0])).toEqual({ flag: "fail", reason: "implausible" });
    expect(flags.get(rows[1])).toEqual({ flag: "fail", reason: "implausible" });
  });

  it("keeps pH outside 3-12 as unusual, not a fault (docs/timeline.md, 2026-10-13)", () => {
    const rows = ph([2.07, 12.62]); // Algalita in seawater, REPORT_AUDIT finding 5
    const flags = qcMetric(rows, "ph");
    expect(flags.get(rows[0])).toEqual({ flag: "suspect", reason: "outside-natural-water" });
    expect(flags.get(rows[1])).toEqual({ flag: "suspect", reason: "outside-natural-water" });
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
  /** Deterministic Gaussian noise (Box-Muller over a fixed LCG), so the case never flakes. */
  const noise = (n: number, sd: number): number[] => {
    let seed = 42;
    const uniform = (): number => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
      return (seed + 0.5) / 2 ** 32;
    };
    return Array.from({ length: n }, () => (
      sd * Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform())
    ));
  };
  const conductivity = (values: number[]) => values.map(
    (value, i) => decodeReading({ timestamp: at(i), water_data: { 100: value, ecError: 0 } }),
  );

  it("never makes a likely data issue from noise inside the minimum detectable change", () => {
    // A healthy seawater probe: 52,000 µS/cm with noise of 300 (0.6%), under v2's 2% detectable
    // change. Against the series' MAD alone, ordinary noise read as spikes and three in a row
    // made a likely data issue in most such weeks.
    const rows = conductivity(noise(336, 300).map((n) => 52_000 + n));
    const flags = qcMetric(rows, "conductivity");
    expect(rows.filter((row) => flags.get(row)?.reason === "spike")).toHaveLength(0);
    expect(dataIssueRuns(rows, flags)).toEqual([]);
  });

  it("still suspects a conductivity spike beyond the detectable change", () => {
    const values = noise(48, 300).map((n) => 52_000 + n);
    values[20] = 58_000;
    const rows = conductivity(values);
    expect(qcMetric(rows, "conductivity").get(rows[20])).toEqual({ flag: "suspect", reason: "spike" });
  });

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

describe("rate of change (v2 §8.2)", () => {
  it("labels Michael's Oct 7 jump unusual on a marine pod, leaving the readings after it", () => {
    // Recorded Oct 7 01:27-03:57 PDT: 7.16, 7.16, 10.94, 10.92, 10.32, 8.41.
    const rows = ph(OCT_7.map(([, value]) => value));
    const flags = qcMetric(rows, "ph", { water: "coastal" });
    expect(rows.map((row) => flags.get(row)?.reason ?? flags.get(row)?.flag))
      .toEqual(["pass", "pass", "rate-of-change", "pass", "pass", "rate-of-change"]);
  });

  it("scales the limit with the gap: 0.3 per 10 minutes", () => {
    const passes = ph([8.0, 8.85]); // 0.85 in 30 minutes, under 0.9
    expect(qcMetric(passes, "ph", { water: "brackish" }).get(passes[1])?.flag).toBe("pass");
    const jumps = ph([8.0, 8.95]);
    expect(qcMetric(jumps, "ph", { water: "brackish" }).get(jumps[1])?.reason).toBe("rate-of-change");
    const slow = ph([8.0, 9.5], 2 * HOUR); // 1.5 in 2 hours, under 3.6
    expect(qcMetric(slow, "ph", { water: "coastal" }).get(slow[1])?.flag).toBe("pass");
  });

  it("does not test across a gap longer than 3 hours", () => {
    const rows = ph([8.0, 10.5], 4 * HOUR);
    expect(qcMetric(rows, "ph", { water: "coastal" }).get(rows[1])?.flag).toBe("pass");
  });

  it("gives freshwater pH no rate test, as v2 gives none", () => {
    const rows = ph([7.0, 9.0]);
    expect(qcMetric(rows, "ph", { water: "freshwater" }).get(rows[1])?.flag).toBe("pass");
    expect(qcMetric(rows, "ph").get(rows[1])?.flag).toBe("pass");
  });

  it("tests temperature at 2 °C per 10 minutes in any water", () => {
    const temperature = (celsius: number[]) => celsius.map((value, i) => decodeReading({
      timestamp: at(i), water_data: { 102: value, rtdError: 0 },
    }, "celsius"));
    const steady = temperature([20, 25]); // 5 °C in 30 minutes, under 6
    expect(qcMetric(steady, "temperature", { water: "freshwater" }).get(steady[1])?.flag).toBe("pass");
    const jump = temperature([20, 27]);
    expect(qcMetric(jump, "temperature").get(jump[1])?.reason).toBe("rate-of-change");
  });

  it("labels the recorded Sep 25-26 night: jumps and readings above 12 unusual, the rest kept", () => {
    const rows = ph(SEP_25_26.map(([, value]) => value));
    const flags = qcMetric(rows, "ph", { water: "coastal" });
    const label = (value: number): string | undefined => {
      const row = rows[SEP_25_26.findIndex(([, v]) => v === value)];
      return flags.get(row)?.reason ?? flags.get(row)?.flag;
    };
    expect(label(11.83)).toBe("rate-of-change"); // 8.12 to 11.83 in 30 minutes
    expect(label(12.91)).toBe("outside-natural-water");
    expect(label(11.87)).toBe("pass"); // out of range, but a real reading to count
    expect(label(6.36)).toBe("rate-of-change"); // 11.21 to 6.36: back in range, still a jump
    expect(label(2.73)).toBe("outside-natural-water");
    expect(label(4.26)).toBe("rate-of-change"); // 2.73 to 4.26
    expect(label(5.07)).toBe("pass");
    expect(dataIssueRuns(rows, flags)).toEqual([]);
  });
});

describe("likely data issue: 3 consecutive device faults", () => {
  it("is never raised by unusual readings, however many in a row", () => {
    const rows = ph([2.5, 2.4, 2.6, 2.5, 12.5, 12.6, 12.4]);
    expect(dataIssueRuns(rows, qcMetric(rows, "ph", { water: "coastal" }))).toEqual([]);
  });

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

describe("servicing: conductivity collapse with a pH rail or jump (Michael, 2026-10-23)", () => {
  /** pH and conductivity, 30 minutes apart; seawater either side of `middle`. */
  const pod = (middle: Array<[number, number]>, after = 10) => {
    const sea = (n: number, from: number): Array<[number, number]> => Array.from(
      { length: n },
      (_, i) => [7.8 + 0.01 * ((from + i) % 5), 54_000 + 150 * ((from + i) % 7)],
    );
    return [...sea(20, 0), ...middle, ...sea(after, 3)].map(([phValue, conductivity], i) => decodeReading({
      timestamp: at(i), water_data: { 99: phValue, phError: 0, 100: conductivity, ecError: 0 },
    }));
  };
  /** The Sep 24 shape: pH rail beside off-scale conductivity, the collapse, bleach. */
  const SERVICE: Array<[number, number]> = [
    [0, 177_000], [10.3, 7_600], [7.5, 5_000], [7.1, 2_900], [12.6, 1_400],
  ];
  const KEYS: MetricKey[] = ["ph", "conductivity"];
  const reasons = (rows: ReturnType<typeof pod>, flags: ReturnType<typeof qcReadings>, key: MetricKey) => rows
    .map((row) => flags.get(key)!.get(row)?.reason ?? flags.get(key)!.get(row)?.flag);

  it("leaves the service out of every metric, from the pH rail until conductivity recovers", () => {
    const rows = pod(SERVICE);
    const flags = qcReadings(rows, KEYS, { water: "coastal" });
    for (const key of KEYS) {
      expect(reasons(rows, flags, key).slice(20, 25)).toEqual(Array(5).fill("servicing"));
      // The recovery is judged against the seawater before the service, so it is not a jump.
      expect(flags.get(key)!.get(rows[25])?.flag).toBe("pass");
    }
    expect(servicingRuns(rows, flags)).toEqual([{ startMs: at(20) * 1000, endMs: at(24) * 1000, readings: 5 }]);
  });

  it("never makes the service a likely data issue", () => {
    const rows = pod(SERVICE);
    const flags = qcReadings(rows, KEYS, { water: "coastal" });
    expect(dataIssueRuns(rows, flags.get("ph")!)).toEqual([]);
    expect(dataIssueRuns(rows, flags.get("conductivity")!)).toEqual([]);
  });

  it("is found from conductivity and pH even when only another metric is asked for", () => {
    const rows = pod(SERVICE);
    const flags = qcReadings(rows, ["ph"], { water: "coastal" });
    expect(reasons(rows, flags, "ph").slice(20, 25)).toEqual(Array(5).fill("servicing"));
  });

  it("leaves a marine conductivity drop with pH steady to be judged as water", () => {
    const rows = pod([[7.8, 7_600], [7.81, 5_000], [7.8, 2_900], [7.82, 1_400]]);
    const flags = qcReadings(rows, KEYS, { water: "coastal" });
    expect(servicingRuns(rows, flags)).toEqual([]);
    expect(reasons(rows, flags, "conductivity").slice(20, 24)).not.toContain("servicing");
  });

  it("leaves a partial conductivity drop with a pH jump to be judged as water, the jump unusual", () => {
    // Down to about 40% of seawater: a freshwater pulse can do that; out of the water reads near 0.
    const rows = pod([[10.3, 22_000], [7.8, 21_000], [7.8, 22_500]]);
    const flags = qcReadings(rows, KEYS, { water: "coastal" });
    expect(servicingRuns(rows, flags)).toEqual([]);
    expect(flags.get("ph")!.get(rows[20])).toEqual({ flag: "suspect", reason: "rate-of-change" });
  });

  it("leaves a pH jump with conductivity steady alone", () => {
    const rows = pod([[10.3, 54_100], [7.8, 54_000]]);
    expect(servicingRuns(rows, qcReadings(rows, KEYS, { water: "coastal" }))).toEqual([]);
  });

  it("applies to marine pods only: the same shape on a freshwater or brackish pod is untouched", () => {
    for (const water of ["freshwater", "brackish"] as const) {
      const rows = pod(SERVICE);
      const flags = qcReadings(rows, KEYS, { water });
      expect(servicingRuns(rows, flags)).toEqual([]);
      // The rail on its own is still a device fault.
      expect(flags.get("ph")!.get(rows[20])).toEqual({ flag: "fail", reason: "implausible" });
    }
  });

  it("runs to the last reading when conductivity never recovers", () => {
    const rows = pod([[0, 9_000], [7.6, 1_200], [7.5, 900], [7.6, 800]], 0);
    const flags = qcReadings(rows, KEYS, { water: "coastal" });
    expect(servicingRuns(rows, flags)).toEqual([{ startMs: at(20) * 1000, endMs: at(23) * 1000, readings: 4 }]);
  });

  it("needs the collapse to be sudden: a gap over two hours before it is not servicing", () => {
    const before = pod([], 0);
    const later = [[0, 7_600], [7.5, 5_000], [7.1, 2_900]].map(([phValue, conductivity], i) => decodeReading({
      timestamp: at(19) + 3 * 3600 + i * 1800,
      water_data: { 99: phValue, phError: 0, 100: conductivity, ecError: 0 },
    }));
    const rows = [...before, ...later];
    expect(servicingRuns(rows, qcReadings(rows, KEYS, { water: "coastal" }))).toEqual([]);
  });
});

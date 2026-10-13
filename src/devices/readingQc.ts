/**
 * Per-reading quality control, following source-of-truth v2 §8 (QARTOD flags) before any reading
 * is judged against a limit (v2 §9.1 step 1: "Run QC. Exclude failed data. Carry suspect flags
 * forward into the explanation").
 *
 * Every reading of every metric gets one flag:
 *
 * - **fail** (QARTOD 4), a *device fault*: the probe's error flag is set; the value is
 *   `1000000000`, which the server documents as a sensor read failure; the value is a rail no
 *   probe in water can emit (`isPlausible`, e.g. pH exactly 0 or 14, -1023 °C); or it belongs to a
 *   flat line of 24 or more identical readings. Turbidity at exactly 0 instead fails only after a
 *   day of zeros, because the index clamps clear water to 0 and a long run of zeros can be real
 *   (`referenceRanges.ts`). Failed readings are left out.
 * - **suspect** (QARTOD 3), an *unusual* reading: kept and shown, never counted toward a flag and
 *   never called a fault (`report/flagRules.ts`). A flat line of 6 or more identical readings; pH
 *   outside the range natural water spans (`isNaturalWater`, 3-12); a jump faster than v2 §8.2's
 *   rate of change (`RATE_OF_CHANGE`); or a spike: a reading more than 3 x the metric's MAD from
 *   the mean of its two neighbours, when those neighbours agree with each other within the same
 *   tolerance. With a MAD of 0 the spike test is skipped.
 * - **pass** (QARTOD 1) otherwise. Gaps longer than `MAX_GAP_MS` are counted as missing data
 *   (QARTOD 9) and break every run.
 *
 * A **likely data issue** (v2 §9.2) is `DATA_ISSUE_RUN` or more consecutive device faults of one
 * metric; it covers only those readings, and unusual readings never make one (docs/timeline.md,
 * 2026-10-13). Scattered failures are excluded and counted, never flagged on their own
 * (`POST_LAUNCH_BACKLOG.md` §1: one bad reading among 48 a day is not a maintenance item).
 * Readings on which every channel fails at once suggest a board fault (v2 §7.2 rule 1); three in a
 * row flag it, provisionally until CER confirms the count (STAKEHOLDER_QUESTIONS.md item 25).
 *
 * QC runs over everything the caller fetched (the site's readings), not just the requested window,
 * so a flat line that started before the window is still recognised inside it. The MAD is that
 * whole series' MAD until site baselines exist (v2 §4).
 */

import type { DeviceReading, MetricKey } from "../types/device.types";
import { isNaturalWater, isPlausible } from "./plausibility";
import { minimumDetectableChange } from "../report/referenceRanges";
import type { FallbackWaterClass } from "../report/referenceRanges";
import type { UnusualKind } from "../report/flagRules";

export type QcFlag = "pass" | "suspect" | "fail";

export type QcReason =
  | "error-flag"
  | "read-failure"
  | "implausible"
  | "flat-line"
  | "stuck-turbidity"
  | "outside-natural-water"
  | "rate-of-change"
  | "spike";

export interface QcResult {
  flag: QcFlag;
  reason?: QcReason;
}

/** The server's documented sensor read failure value (`DevicesService.ts`). */
export const SENSOR_READ_FAILURE_VALUE = 1_000_000_000;
/** v2 §8.2 flat line: suspect after 6 identical consecutive readings, fail after 24. */
export const FLAT_LINE_SUSPECT_READINGS = 6;
export const FLAT_LINE_FAIL_READINGS = 24;
/** Turbidity at exactly 0 fails only after this long (supervisor, 2026-09-24). */
export const STUCK_TURBIDITY_MIN_DURATION_MS = 24 * 60 * 60_000;
/** A longer silence is missing data and breaks every run. */
export const MAX_GAP_MS = 3 * 60 * 60_000;
/**
 * v2 §8.2 spike: beyond 3 x MAD from the neighbours' mean, and beyond v2 §8.3's minimum
 * detectable change. The MAD is the series' own until site baselines exist, so on a steady channel
 * it is just the noise, and 3 x MAD alone suspected ordinary noise.
 */
export const SPIKE_MAD_MULTIPLE = 3;

/** `minimumDetectableChange`'s names for the device metric keys. */
const DETECTABLE_CHANGE_KEY: Record<MetricKey, string> = {
  dissolvedOxygen: "dissolved_oxygen",
  orp: "orp",
  ph: "ph",
  conductivity: "conductivity",
  temperature: "temperature",
  turbidity: "turbidity",
};
/**
 * v2 §8.2 rate of change, per 10 minutes, scaled to the gap between consecutive kept readings: pH
 * 0.3 for marine and brackish pods (v2 gives no freshwater pH rate), temperature 2 °C, in °F here
 * because readings are decoded to °F. Only the reading after the jump is labelled, so a real
 * change that holds still counts from the next reading on.
 */
export const RATE_OF_CHANGE: Partial<Record<MetricKey, {
  perTenMinutes: number; waters?: readonly FallbackWaterClass[];
}>> = {
  ph: { perTenMinutes: 0.3, waters: ["coastal", "brackish"] },
  temperature: { perTenMinutes: 2 * (9 / 5) },
};
const TEN_MINUTES_MS = 10 * 60_000;

/**
 * How a kept reading is unusual, for `report/flagRules.ts`: "moment" for a spike or a jump,
 * "value" for pH outside natural water or a short flat line; undefined when it passed.
 */
export const unusualKind = (result: QcResult | undefined): UnusualKind | undefined => {
  if (result?.flag !== "suspect") return undefined;
  return result.reason === "spike" || result.reason === "rate-of-change" ? "moment" : "value";
};

/** Consecutive device faults (failed readings) that make a likely data issue. */
export const DATA_ISSUE_RUN = 3;

const timeOf = (row: DeviceReading): number => Date.parse(row.observedAt ?? "");

/** Readings with a usable timestamp, oldest first. */
export const inTimeOrder = (rows: readonly DeviceReading[]): DeviceReading[] => rows
  .filter((row) => Number.isFinite(timeOf(row)))
  .sort((a, b) => timeOf(a) - timeOf(b));

/** The tests that need only the reading itself; undefined when the metric has no value. */
const pointCheck = (row: DeviceReading, key: MetricKey): QcResult | undefined => {
  const metric = row.metrics[key];
  if (!metric || metric.value === undefined) return undefined;
  if (metric.value === SENSOR_READ_FAILURE_VALUE) return { flag: "fail", reason: "read-failure" };
  if (!metric.valid) return { flag: "fail", reason: "error-flag" };
  if (!isPlausible(key, metric.value)) return { flag: "fail", reason: "implausible" };
  if (!isNaturalWater(key, metric.value)) return { flag: "suspect", reason: "outside-natural-water" };
  return { flag: "pass" };
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Median absolute deviation, unscaled, as v2 §8.2 states it. */
export const medianAbsoluteDeviation = (values: number[]): number => {
  if (values.length === 0) return 0;
  const centre = median(values);
  return median(values.map((v) => Math.abs(v - centre)));
};

/** What QC needs to know about the site: its water class, for the pH rate of change. */
export interface QcOptions {
  water?: FallbackWaterClass;
}

/**
 * Flags every reading of one metric. `rows` must be in time order (`inTimeOrder`); readings with
 * no value for this metric are left out of the map.
 */
export const qcMetric = (
  rows: readonly DeviceReading[],
  key: MetricKey,
  options: QcOptions = {},
): Map<DeviceReading, QcResult> => {
  const flags = new Map<DeviceReading, QcResult>();
  rows.forEach((row) => {
    const result = pointCheck(row, key);
    if (result) flags.set(row, result);
  });

  // Flat lines: identical passing values, broken by a change, a gap, a missing or failed reading.
  let run: DeviceReading[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const { value } = run[0].metrics[key];
    if (key === "turbidity" && value === 0) {
      if (timeOf(run[run.length - 1]) - timeOf(run[0]) >= STUCK_TURBIDITY_MIN_DURATION_MS) {
        run.forEach((row) => flags.set(row, { flag: "fail", reason: "stuck-turbidity" }));
      }
    } else if (run.length >= FLAT_LINE_FAIL_READINGS) {
      run.forEach((row) => flags.set(row, { flag: "fail", reason: "flat-line" }));
    } else if (run.length >= FLAT_LINE_SUSPECT_READINGS) {
      run.forEach((row) => flags.set(row, { flag: "suspect", reason: "flat-line" }));
    }
    run = [];
  };
  rows.forEach((row) => {
    const passing = flags.get(row)?.flag === "pass";
    const previous = run[run.length - 1];
    if (!passing || (previous && (row.metrics[key].value !== previous.metrics[key].value
      || timeOf(row) - timeOf(previous) > MAX_GAP_MS))) {
      flush();
    }
    if (passing) run.push(row);
  });
  flush();

  const kept = rows.filter((row) => {
    const flag = flags.get(row)?.flag;
    return flag === "pass" || flag === "suspect";
  });

  // Rate of change, against the previous kept reading within `MAX_GAP_MS`.
  const rate = RATE_OF_CHANGE[key];
  if (rate && (!rate.waters || (options.water && rate.waters.includes(options.water)))) {
    kept.forEach((row, i) => {
      const before = kept[i - 1];
      if (!before || flags.get(row)?.flag !== "pass") return;
      const gap = timeOf(row) - timeOf(before);
      if (gap <= 0 || gap > MAX_GAP_MS) return;
      const change = Math.abs(row.metrics[key].value! - before.metrics[key].value!);
      if (change > rate.perTenMinutes * (gap / TEN_MINUTES_MS)) {
        flags.set(row, { flag: "suspect", reason: "rate-of-change" });
      }
    });
  }

  // Spikes, among the readings still kept, against the whole series' MAD and the detectable change.
  const values = kept.map((row) => row.metrics[key].value as number);
  const tolerance = SPIKE_MAD_MULTIPLE * medianAbsoluteDeviation(values);
  if (tolerance > 0) {
    kept.forEach((row, i) => {
      if (i === 0 || i === kept.length - 1 || flags.get(row)?.flag !== "pass") return;
      const before = kept[i - 1];
      const after = kept[i + 1];
      const gap = Math.max(timeOf(row) - timeOf(before), timeOf(after) - timeOf(row));
      if (gap > MAX_GAP_MS) return;
      const [prev, value, next] = [values[i - 1], values[i], values[i + 1]];
      const expected = (prev + next) / 2;
      const detectable = minimumDetectableChange(DETECTABLE_CHANGE_KEY[key], expected);
      const floor = Math.max(tolerance, detectable);
      if (Math.abs(prev - next) <= tolerance && Math.abs(value - expected) > floor) {
        flags.set(row, { flag: "suspect", reason: "spike" });
      }
    });
  }
  return flags;
};

/** Every metric's flags over the same rows. */
export const qcReadings = (
  rows: readonly DeviceReading[],
  keys: readonly MetricKey[],
  options: QcOptions = {},
): Map<MetricKey, Map<DeviceReading, QcResult>> => {
  const ordered = inTimeOrder(rows);
  return new Map(keys.map((key) => [key, qcMetric(ordered, key, options)]));
};

/** A stretch of consecutive readings, by time. */
export interface ReadingRun {
  startMs: number;
  endMs: number;
  readings: number;
}

/**
 * Runs of `DATA_ISSUE_RUN` or more consecutive failed readings (device faults) of one metric. A
 * kept reading, passing or unusual, a reading with no value, or a gap over `MAX_GAP_MS` ends a
 * run. `rows` in time order.
 */
export const dataIssueRuns = (
  rows: readonly DeviceReading[],
  flags: Map<DeviceReading, QcResult>,
): ReadingRun[] => {
  const runs: ReadingRun[] = [];
  let run: DeviceReading[] = [];
  const flush = (): void => {
    if (run.length >= DATA_ISSUE_RUN) {
      runs.push({
        startMs: timeOf(run[0]), endMs: timeOf(run[run.length - 1]), readings: run.length,
      });
    }
    run = [];
  };
  rows.forEach((row) => {
    const flag = flags.get(row)?.flag;
    const previous = run[run.length - 1];
    if (flag !== "fail" || (previous && timeOf(row) - timeOf(previous) > MAX_GAP_MS)) {
      flush();
    }
    if (flag === "fail") run.push(row);
  });
  flush();
  return runs;
};

/**
 * Whether every channel failed on this reading at once: at least two metrics carry a value and
 * every one of them failed its point check (error flag, read failure or implausible value).
 */
export const isAllChannelFailure = (row: DeviceReading, keys: readonly MetricKey[]): boolean => {
  const checks = keys.map((key) => pointCheck(row, key))
    .filter((r): r is QcResult => r !== undefined);
  return checks.length >= 2 && checks.every((r) => r.flag === "fail");
};

/** Runs of `DATA_ISSUE_RUN` or more consecutive all-channel failures. `rows` in time order. */
export const allChannelFailureRuns = (
  rows: readonly DeviceReading[],
  keys: readonly MetricKey[],
): ReadingRun[] => {
  const flags = new Map<DeviceReading, QcResult>(rows.map((row) => [
    row, isAllChannelFailure(row, keys) ? { flag: "fail" } : { flag: "pass" },
  ]));
  return dataIssueRuns(rows, flags);
};

/** Silences longer than `MAX_GAP_MS` between consecutive readings (QARTOD 9, missing data). */
export const readingGaps = (rows: readonly DeviceReading[]): ReadingRun[] => rows
  .slice(1)
  .flatMap((row, i) => {
    const gapMs = timeOf(row) - timeOf(rows[i]);
    return gapMs > MAX_GAP_MS
      ? [{ startMs: timeOf(rows[i]), endMs: timeOf(row), readings: 0 }]
      : [];
  });

const listOf = (labels: string[]): string => (labels.length < 2
  ? labels.join("")
  : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`);

/**
 * Said when readings were excluded as a flat line or stuck turbidity: v2 §9.2's "data issue
 * likely" tier, the one case where inspection is the advice.
 */
export const stuckSensorNote = (labels: string[]): string => `${listOf(labels)} readings were `
  + "stuck at one value for a long stretch (24 or more identical readings in a row, or turbidity "
  + "at 0 for a day or more), a likely failed sensor. This pattern most likely reflects a sensor "
  + "or data issue; those readings were left out, and the sensor should be inspected.";

/** The reader's version of `stuckSensorNote` (see `USER_NOTES_FIELD`). */
export const stuckSensorUserNote = (labels: string[]): string => `${listOf(labels)} readings `
  + "stuck at one value for a long stretch were left out as a likely failed sensor; the sensor "
  + "should be inspected.";

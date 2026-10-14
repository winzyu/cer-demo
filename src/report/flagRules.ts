/**
 * When a metric counts as out of range, shared by chat (`query_sensor_data`) and the report
 * (`flagFor`), so the two can never disagree.
 *
 * Source-of-truth v2 §9.1 marks a parameter anomalous only "for at least 3 consecutive samples",
 * and v2 §8.3 says a change smaller than the minimum detectable change is not a detected change.
 * So a metric is out of range only after `RUN_LENGTH` consecutive readings beyond its limit plus
 * that minimum detectable change (docs/timeline.md, 2026-10-10). At 48 readings a day that is
 * 6.25% of a day, inside the 5-10% Michael and the CER colleague accepted, so there is no separate
 * share rule. One reading never flags a metric (`POST_LAUNCH_BACKLOG.md` §1).
 *
 * Runs count raw readings in time order, already cleared of failed readings by QC
 * (`devices/readingQc.ts`); high and low runs are counted separately, and a silence longer than
 * `MAX_GAP_MS` breaks a run (docs/timeline.md, 2026-10-11).
 */

import { MAX_GAP_MS } from "../devices/readingQc";

/** Consecutive readings beyond a limit that make a metric out of range (v2 §9.1). */
export const RUN_LENGTH = 3;
/**
 * The report's Action Required step: a run beyond the limit by this share of the range's width,
 * or by the minimum detectable change where that is larger. Not from any source document; kept
 * from the report's earlier rule.
 */
export const EXCEEDANCE_MARGIN = 0.15;
/**
 * Runs covering at least this share of the kept readings are a persistent offset: the likelier
 * cause is a threshold that does not fit the site, fouling or calibration (v2 §7.2 rule 7), the
 * same share `events.ts` uses for a persistent event window.
 */
export const PERSISTENT_SHARE = 0.8;

/** One reading: epoch ms and value, in the metric's own units. */
export type TimedValue = readonly [number, number];

export interface Limit {
  min: number;
  max: number;
}

export interface ExcursionRun {
  direction: "high" | "low";
  startMs: number;
  endMs: number;
  readings: number;
  /** The run's highest reading for a high run, lowest for a low one. */
  extreme: number;
}

/** How far past a limit a reading must sit to count, in the metric's units, near that reading. */
export type Margin = (reading: number) => number;

/**
 * Runs of `RUN_LENGTH` or more consecutive readings beyond the limit by more than `margin`.
 * `values` must be in time order.
 */
export const excursionRuns = (
  values: readonly TimedValue[],
  limit: Limit,
  margin: Margin,
): ExcursionRun[] => {
  const runs: ExcursionRun[] = [];
  let run: TimedValue[] = [];
  let direction: ExcursionRun["direction"] | undefined;
  const flush = (): void => {
    if (direction && run.length >= RUN_LENGTH) {
      const readings = run.map(([, v]) => v);
      runs.push({
        direction,
        startMs: run[0][0],
        endMs: run[run.length - 1][0],
        readings: run.length,
        extreme: direction === "high" ? Math.max(...readings) : Math.min(...readings),
      });
    }
    run = [];
  };
  values.forEach((point) => {
    const [atMs, value] = point;
    const beyond = margin(value);
    let side: ExcursionRun["direction"] | undefined;
    if (value > limit.max + beyond) side = "high";
    else if (value < limit.min - beyond) side = "low";
    const previous = run[run.length - 1];
    if (side !== direction || (previous && atMs - previous[0] > MAX_GAP_MS)) flush();
    direction = side;
    if (side) run.push(point);
  });
  flush();
  return runs;
};

/** The two rungs a report reads, and how much of the period the out-of-range runs covered. */
export interface RunAssessment {
  /** Runs beyond the limit plus the minimum detectable change: Watch. */
  outOfRange: ExcursionRun[];
  /** Runs beyond the limit plus the larger of the exceedance margin and that change. */
  exceedance: ExcursionRun[];
  /** True when `outOfRange` runs hold at least `PERSISTENT_SHARE` of the readings. */
  persistent: boolean;
}

export const assessRuns = (
  values: readonly TimedValue[],
  limit: Limit,
  minimumDetectableChange: Margin,
  exceedanceMargin = EXCEEDANCE_MARGIN,
): RunAssessment => {
  const outOfRange = excursionRuns(values, limit, minimumDetectableChange);
  const width = (limit.max - limit.min) * exceedanceMargin;
  const exceedance = excursionRuns(
    values,
    limit,
    (reading) => Math.max(width, minimumDetectableChange(reading)),
  );
  const inRuns = outOfRange.reduce((sum, r) => sum + r.readings, 0);
  return {
    outOfRange,
    exceedance,
    persistent: values.length > 0 && inRuns / values.length >= PERSISTENT_SHARE,
  };
};

export type VerdictStatus =
  | "in range"
  | "out of range"
  | "likely data issue"
  | "not assessed"
  | "not enough data";

export interface MetricVerdict {
  status: VerdictStatus;
  /** Present whenever a limit was assessed, even under a data issue. */
  runs?: RunAssessment;
  /** True when the newest reading is part of an out-of-range run. */
  ongoing?: boolean;
}

/**
 * One metric's verdict over a window, by precedence: a likely data issue first (a faulty sensor's
 * readings say nothing about the water), then no limit, then too few readings, then the runs.
 *
 * `values` are the window's kept readings in time order. When the window holds fewer than
 * `RUN_LENGTH` (a "right now" question resolves to the newest reading alone), `lookback` supplies
 * the kept readings just before it, so the newest reading is judged on the run that ends at it
 * (docs/timeline.md, 2026-10-11).
 */
export const judgeMetric = (input: {
  values: readonly TimedValue[];
  lookback?: readonly TimedValue[];
  limit?: Limit;
  minimumDetectableChange: Margin;
  dataIssue: boolean;
}): MetricVerdict => {
  const short = input.values.length < RUN_LENGTH;
  const values = short && input.lookback
    ? [...input.lookback.slice(-(RUN_LENGTH - input.values.length)), ...input.values]
    : input.values;
  const runs = input.limit && values.length >= RUN_LENGTH
    ? assessRuns(values, input.limit, input.minimumDetectableChange)
    : undefined;
  const newest = values[values.length - 1]?.[0];
  const ongoing = runs ? runs.outOfRange.some((r) => r.endMs === newest) : undefined;
  const assessed = { ...(runs ? { runs, ongoing } : {}) };
  if (input.dataIssue) return { status: "likely data issue", ...assessed };
  if (!input.limit) return { status: "not assessed" };
  if (!runs) return { status: "not enough data" };
  return { status: runs.outOfRange.length > 0 ? "out of range" : "in range", ...assessed };
};

/**
 * The computed verdict `query_sensor_data` returns for each metric, so the model relays a judgement
 * instead of comparing a minimum and maximum with thresholds itself (source-of-truth v2 §0 rule 1
 * and §9.1: run QC first, then judge). The rules live in `report/flagRules.ts` and
 * `devices/readingQc.ts`, shared with the report; this file only gathers a metric's readings, limit
 * and QC flags and shapes the result for the model.
 */

import { dataIssueRuns } from "../devices/readingQc";
import type { QcResult, ReadingRun } from "../devices/readingQc";
import { judgeMetric } from "../report/flagRules";
import type { TimedValue } from "../report/flagRules";
import {
  fallbackLimitNote, metricThresholdRejectionReason, resolveLimit,
} from "../report/operatorThresholds";
import type { ResolvedLimit } from "../report/operatorThresholds";
import { mapWaterType, minimumDetectableChange } from "../report/referenceRanges";
import type { DeviceReading, DeviceSummary, MetricKey } from "../types/device.types";
import type { ResolvedRange } from "./timeRange";

const iso = (ms: number): string => new Date(ms).toISOString();

const timeOf = (row: DeviceReading): number => Date.parse(row.observedAt ?? "");

/** Why a limit is what it is, for the model to relay; undefined for a plain operator threshold. */
const limitNote = (
  key: Exclude<MetricKey, "turbidity">,
  limit: ResolvedLimit,
  device: DeviceSummary,
): string | undefined => {
  if (!limit.assessed) return metricThresholdRejectionReason(limit.reason, key);
  const water = mapWaterType(device.operatingEnvironment);
  return limit.source === "v2-fallback" && water
    ? fallbackLimitNote(key, water, limit.min, limit.max, limit.note)
    : undefined;
};

const runText = (run: ReadingRun): Record<string, unknown> => ({
  from: iso(run.startMs), to: iso(run.endMs), readings: run.readings,
});

/**
 * One metric's verdict over the requested range. `ordered` is the site's readings in time order
 * and `flags` their QC flags for this metric (`qcReadings`).
 */
export const metricVerdict = (input: {
  key: MetricKey;
  wireName: string;
  ordered: readonly DeviceReading[];
  flags: Map<DeviceReading, QcResult>;
  range: ResolvedRange;
  device: DeviceSummary;
}): Record<string, unknown> => {
  const {
    key, wireName, ordered, flags, range, device,
  } = input;
  const inRange = (ms: number): boolean => ms >= range.startMs
    && (range.endInclusive ? ms <= range.endMs : ms < range.endMs);
  const kept: TimedValue[] = ordered.flatMap((row): TimedValue[] => {
    const flag = flags.get(row)?.flag;
    return flag === "pass" || flag === "suspect"
      ? [[timeOf(row), row.metrics[key].value as number]] : [];
  });
  const values = kept.filter(([ms]) => inRange(ms));
  const lookback = kept.filter(([ms]) => ms < range.startMs);
  const dataIssues = dataIssueRuns(ordered, flags)
    .filter((run) => run.endMs >= range.startMs && inRange(Math.max(run.startMs, range.startMs)));

  const limit = key === "turbidity" ? undefined : resolveLimit(
    device.thresholds,
    key,
    mapWaterType(device.operatingEnvironment),
  );
  const verdict = judgeMetric({
    values,
    lookback,
    ...(limit?.assessed ? { limit: { min: limit.min, max: limit.max } } : {}),
    minimumDetectableChange: (reading) => minimumDetectableChange(wireName, reading),
    dataIssue: dataIssues.length > 0,
  });

  const runs = verdict.runs?.outOfRange ?? [];
  const directions = [...new Set(runs.map((r) => r.direction))];
  const suspect = ordered
    .filter((row) => inRange(timeOf(row)) && flags.get(row)?.flag === "suspect").length;
  let basis: string | undefined;
  if (key === "turbidity") basis = "relative index: described by clarity band, never judged against a range";
  else if (limit?.assessed) {
    basis = limit.source === "operator-threshold"
      ? "operator threshold" : "source-of-truth v2 general range (generic fallback)";
  }
  const note = key === "turbidity" || !limit ? undefined : limitNote(key, limit, device);

  return {
    status: verdict.status,
    ...(basis ? { basis } : {}),
    ...(limit?.assessed ? { limit: { min: limit.min, max: limit.max } } : {}),
    ...(note ? { limit_note: note } : {}),
    ...(runs.length > 0 ? {
      out_of_range: {
        direction: directions.length > 1 ? "high and low" : directions[0],
        first_run_start: iso(runs[0].startMs),
        latest_run_end: iso(runs[runs.length - 1].endMs),
        runs: runs.length,
        ongoing: verdict.ongoing === true,
        persistent: verdict.runs?.persistent === true,
      },
    } : {}),
    ...(dataIssues.length > 0 ? { data_issue: dataIssues.map(runText) } : {}),
    ...(suspect > 0 ? { suspect_readings: suspect } : {}),
  };
};

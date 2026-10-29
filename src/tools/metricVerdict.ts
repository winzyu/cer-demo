/**
 * The computed verdict `query_sensor_data` returns for each metric, so the model relays a judgement
 * instead of comparing a minimum and maximum with thresholds itself (source-of-truth v2 §0 rule 1
 * and §9.1: run QC first, then judge). The rules live in `report/flagRules.ts` and
 * `devices/readingQc.ts`, shared with the report; this file only gathers a metric's readings, limit
 * and QC flags and shapes the result for the model.
 */

import { dataIssueRuns, unusualKind } from "../devices/readingQc";
import type { QcReason, QcResult, ReadingRun } from "../devices/readingQc";
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
 * How many unusual readings (those that moved most) or flagged stretches (the newest) are listed
 * one by one; the counts cover the rest.
 */
export const UNUSUAL_LISTED = 12;

const UNUSUAL_REASON: Partial<Record<QcReason, string>> = {
  "outside-natural-water": "outside the range natural water spans",
  "rate-of-change": "a sudden jump from the previous reading",
  spike: "a spike against its neighbours",
  "flat-line": "repeated the same value",
};

const hours = (ms: number): number => Math.round((ms / 3_600_000) * 10) / 10;

/**
 * One metric's verdict over the requested range. `ordered` is the site's readings in time order
 * and `flags` their QC flags for this metric (`qcReadings`). Readings QC failed (device faults)
 * are left out; unusual ones are kept, listed, and never counted toward a flag (`flagRules.ts`).
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
  const keptRows = ordered.filter((row) => {
    const flag = flags.get(row)?.flag;
    return flag === "pass" || flag === "suspect";
  });
  const kept: TimedValue[] = keptRows.map((row): TimedValue => {
    const kind = unusualKind(flags.get(row));
    const point: [number, number] = [timeOf(row), row.metrics[key].value as number];
    return kind ? [...point, kind] : point;
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
    fromMs: range.startMs,
    ...(limit?.assessed ? { limit: { min: limit.min, max: limit.max } } : {}),
    minimumDetectableChange: (reading) => minimumDetectableChange(wireName, reading),
    faultedOnly: dataIssues.length > 0,
  });

  // "Current" means the pod's latest 24 hours: a window ending before the newest reading holds
  // only past flags, told in the past tense (Michael #4).
  const newest = kept[kept.length - 1]?.[0];
  const current = verdict.flags?.current === true && newest !== undefined && inRange(newest);
  const episodes = verdict.flags?.episodes ?? [];
  const directions = [...new Set(episodes.map((e) => e.direction))];
  const edge = verdict.flags?.edge;
  const unusualRows = keptRows
    .map((row, i) => ({ row, before: keptRows[i - 1] }))
    .filter(({ row }) => inRange(timeOf(row)) && flags.get(row)?.flag === "suspect");
  const moved = ({ row, before }: { row: DeviceReading; before?: DeviceReading }): number => (
    before
      ? Math.abs((row.metrics[key].value as number) - (before.metrics[key].value as number))
      : 0
  );
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
    ...(episodes.length > 0 ? {
      out_of_range: {
        direction: directions.length > 1 ? "high and low" : directions[0],
        ...(episodes.length > UNUSUAL_LISTED
          ? { flagged_not_listed: episodes.length - UNUSUAL_LISTED } : {}),
        flagged: episodes.slice(-UNUSUAL_LISTED).map((e) => ({
          direction: e.direction,
          from: iso(e.startMs),
          to: iso(e.endMs),
          readings_out_of_range: e.readings,
          [e.direction === "high" ? "highest" : "lowest"]: e.extreme,
        })),
        current,
        persistent: verdict.flags?.persistent === true,
      },
    } : {}),
    ...(edge ? {
      at_edge: {
        side: edge.side === "low" ? "low edge" : "high edge",
        shape: edge.shape === "plateau"
          ? `${hours(edge.longestMs)} hours in a row` : `on ${edge.days} of ${edge.periodDays} days`,
        lowest: edge.lowest,
        highest: edge.highest,
      },
    } : {}),
    ...(verdict.unusual.length > 0 ? {
      unusual_stretches: verdict.unusual.map((u) => ({
        from: iso(u.startMs),
        to: iso(u.endMs),
        readings: u.readings,
        lowest: u.lowest,
        highest: u.highest,
      })),
    } : {}),
    ...(unusualRows.length > 0 ? {
      unusual_readings: unusualRows.length,
      // The ones that moved most from the reading before, in time order: a question about a
      // drop must find the drop, not the first dozen of a long stretch above 12.
      unusual_listed: [...unusualRows]
        .sort((a, b) => moved(b) - moved(a))
        .slice(0, UNUSUAL_LISTED)
        .sort((a, b) => timeOf(a.row) - timeOf(b.row))
        .map(({ row, before }) => {
          const reason = flags.get(row)?.reason;
          return {
            at: row.observedAt,
            value: row.metrics[key].value,
            ...(reason && UNUSUAL_REASON[reason] ? { why: UNUSUAL_REASON[reason] } : {}),
            // The reading before it, so a drop can be told as one ("from 7.19 to 2.73 in 30
            // minutes") whichever test labelled it.
            ...(before
              ? { previous: before.metrics[key].value, previous_at: before.observedAt } : {}),
          };
        }),
    } : {}),
    ...(dataIssues.length > 0 ? { data_issue: dataIssues.map(runText) } : {}),
  };
};

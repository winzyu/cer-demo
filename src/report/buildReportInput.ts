/**
 * Transforms QuerySensorData results into a ReportInput the rest of src/report/ can work with.
 * This is the ONLY file in src/report/ that talks to the device data path -- everything else
 * (referenceRanges.ts, events.ts, narrative.ts, renderPdf.ts) works on plain ReportInput data
 * and is testable without a live device, same split the Python prototype used.
 *
 * ⚠️ Known, deliberate scope limits in this first cut -- read before trusting a generated report:
 *
 * 1. **No real diel/tidal pattern detection.** Every parameter's `pattern` is set to "unknown".
 *    The Python prototype never had a pattern classifier either -- its demo data set `pattern`
 *    directly on fabricated test fixtures, it was never computed from real readings. Detecting
 *    a genuine ~24h diel rhythm or tidal correlation from a bucketed series is a real
 *    signal-processing task (autocorrelation, or comparing same-time-of-day buckets across
 *    days) that deserves its own scoped effort and testing, not a guessed heuristic bolted on
 *    here under time pressure. Consequence: `events.ts`'s diel/tidal exclusion never triggers
 *    on live data today (every parameter goes through the generic threshold detector), and the
 *    algal-bloom detector (which requires a DO series tagged "diel") never fires. Both still
 *    work correctly for anyone who constructs a ReportInput by hand with a real pattern tag
 *    (as the unit tests for events.ts do) -- this limitation is specifically about data pulled
 *    from `QuerySensorData`.
 * 2. **Series is bucketed, not raw.** `event`/pattern detection here runs against
 *    `aggregation: "series"` buckets (bucket means at each bucket's midpoint), not the sensor's
 *    native ~15min cadence. This is coarser than what the Python prototype's demo data
 *    simulated. Min/max are still exact (a bucket's min/max are real per-bucket extremes, not
 *    averaged away), so the Parameter Data table (Section 2) is unaffected; only event-window
 *    boundaries and excursion timestamps are bucket-resolution rather than reading-resolution.
 * 3. **Coordinates and client/contract are not available from this API.** `query_sensor_data`
 *    only echoes `{name, label, operating_environment}` for the device -- lat/lon and any
 *    organization/contract field live on `DeviceSummary.raw` from `GET /devices`, which this
 *    function does not call. Both report as "Not available" rather than a fabricated value.
 *    Wiring in a `GET /devices` lookup to fill these in is a reasonable, bounded follow-up.
 */

import type { QuerySensorData, SensorQueryParams } from "../tools/querySensorData";
import { SensorQueryError } from "../tools/querySensorData";
import type { ToolContext } from "../types/tool.types";
import type {
  ParameterStats, ReportInput, SiteMetadata, WaterBodyType,
} from "./types";
import { baselineFor } from "./referenceRanges";

/** Wire name -> template row label + unit. Labels match the DataPod report template. */
const PARAMETER_META: Array<{ key: string; label: string; unit: string }> = [
  { key: "dissolved_oxygen", label: "Dissolved Oxygen (mg/L)", unit: "mg/L" },
  { key: "orp", label: "ORP (mV)", unit: "mV" },
  { key: "ph", label: "pH", unit: "" },
  { key: "conductivity", label: "Conductivity (µS/cm)", unit: "µS/cm" },
  // Device API reports Fahrenheit (metrics.ts) -- label reflects the unit actually returned,
  // not the Celsius unit the source-of-truth doc's probe-accuracy formula expects internally.
  { key: "temperature", label: "Temperature (°F)", unit: "°F" },
  { key: "turbidity", label: "Turbidity (NTU)", unit: "NTU" },
];

const mapWaterType = (
  operatingEnvironment: string | null | undefined,
  fallback: WaterBodyType,
): WaterBodyType => {
  if (!operatingEnvironment) {
    return fallback;
  }
  const normalized = operatingEnvironment.toLowerCase();
  if (normalized.includes("salt")) {
    return "Marine";
  }
  if (normalized.includes("fresh")) {
    return "Freshwater";
  }
  return fallback;
};

interface MetricEntry {
  value: number | null;
  n_samples?: number;
  series?: Array<{ start: string; end: string; mean: number; min: number; max: number; n: number }>;
}

const asRecord = (v: unknown): Record<string, unknown> => (
  v && typeof v === "object" ? v as Record<string, unknown> : {}
);

const metricsOf = (result: Record<string, unknown>): Record<string, MetricEntry> => {
  const metrics = asRecord(result.metrics);
  return Object.entries(metrics).reduce<Record<string, MetricEntry>>((out, [key, val]) => {
    const rec = asRecord(val);
    out[key] = {
      value: typeof rec.value === "number" ? rec.value : null,
      n_samples: typeof rec.n_samples === "number" ? rec.n_samples : undefined,
      series: Array.isArray(rec.series) ? (rec.series as MetricEntry["series"]) : undefined,
    };
    return out;
  }, {});
};

export interface BuildReportInputParams {
  /** Natural-language window, same grammar QuerySensorData's tool advertises
   * (e.g. "last 7 days"). */
  timeRange: string;
  device?: string;
  /** Overrides the device registry's operating_environment when set. */
  waterBodyType?: WaterBodyType;
}

export interface BuildReportInputResult {
  report?: ReportInput;
  error?: string;
  /** Parameters with no readings in the window -- surfaced to the caller, not silently dropped. */
  skippedParameters?: string[];
}

export const buildReportInput = async (
  sensor: QuerySensorData,
  params: BuildReportInputParams,
  context?: ToolContext,
): Promise<BuildReportInputResult> => {
  const baseArgs: Omit<SensorQueryParams, "aggregation"> = {
    metric: "all",
    timeRange: params.timeRange,
    ...(params.device !== undefined ? { device: params.device } : {}),
  };

  let seriesResult: Record<string, unknown>;
  let medianResult: Record<string, unknown>;
  try {
    // `sensor.query` is the typed programmatic path QuerySensorData exposes specifically for
    // report generation (see querySensorData.ts's module docstring) -- it does not go through
    // the model's tool-calling loop, this handler calls it directly.
    [seriesResult, medianResult] = await Promise.all([
      sensor.query({ ...baseArgs, aggregation: "series", bucket: "auto" }, context?.token),
      sensor.query({ ...baseArgs, aggregation: "median" }, context?.token),
    ]);
  } catch (error) {
    if (error instanceof SensorQueryError) {
      return { error: error.message };
    }
    throw error;
  }

  const seriesMetrics = metricsOf(seriesResult);
  const medianMetrics = metricsOf(medianResult);

  const timeRangeResolved = asRecord(seriesResult.time_range_resolved);
  const startDate = typeof timeRangeResolved.start === "string" ? timeRangeResolved.start.slice(0, 10) : "unknown";
  const endDate = typeof timeRangeResolved.end === "string" ? timeRangeResolved.end.slice(0, 10) : "unknown";

  const device = asRecord(seriesResult.device);
  const firstStringField = (...vals: unknown[]): string | undefined => (
    vals.find((v): v is string => typeof v === "string")
  );
  const siteName = firstStringField(device.name, device.label) ?? "Unknown device";
  const operatingEnvironment = typeof device.operating_environment === "string"
    ? device.operating_environment
    : undefined;
  const waterBodyType = params.waterBodyType ?? mapWaterType(operatingEnvironment, "Freshwater");

  const site: SiteMetadata = {
    siteName,
    startDate,
    endDate,
    reportDate: new Date().toISOString().slice(0, 10),
    waterBodyType,
    // Not available from query_sensor_data -- see file docstring §3.
    clientName: "Not available from device registry",
  };

  type ParamResult = { parameter: ParameterStats } | { skippedLabel: string };

  const buildParameter = (meta: typeof PARAMETER_META[number]): ParamResult => {
    const seriesEntry = seriesMetrics[meta.key];
    const medianEntry = medianMetrics[meta.key];
    const hasNoReadings = !seriesEntry || !seriesEntry.series || seriesEntry.series.length === 0
      || (seriesEntry.value === null && !seriesEntry.n_samples);
    if (!seriesEntry || hasNoReadings) {
      return { skippedLabel: meta.label };
    }

    const buckets = seriesEntry.series!;
    const totalN = buckets.reduce((s, b) => s + b.n, 0);
    if (totalN === 0) {
      return { skippedLabel: meta.label };
    }
    const min = Math.min(...buckets.map((b) => b.min));
    const max = Math.max(...buckets.map((b) => b.max));
    const mean = buckets.reduce((s, b) => s + b.mean * b.n, 0) / totalN;
    const median = medianEntry?.value ?? mean; // falls back to mean if the median call had no data

    const fixed = meta.key === "temperature"
      ? undefined
      : baselineFor(meta.key, meta.label, meta.unit, waterBodyType);
    const baseline = fixed
      ? { ...fixed, exceedanceMargin: 0.15, hasFixedBaseline: true }
      : {
        key: meta.key,
        label: meta.label,
        unit: meta.unit,
        baselineMin: 0,
        baselineMax: 0,
        exceedanceMargin: 0.15,
        hasFixedBaseline: false,
      };

    const series: Array<[number, number]> = buckets.map((b) => {
      const startMs = Date.parse(b.start);
      const endMs = Date.parse(b.end);
      const midMs = Number.isFinite(startMs) && Number.isFinite(endMs)
        ? (startMs + endMs) / 2
        : startMs;
      return [midMs, b.mean];
    });

    return {
      parameter: {
        baseline,
        min,
        max,
        mean,
        median,
        // See file docstring §1 -- no real pattern classifier yet.
        pattern: "unknown",
        series,
      },
    };
  };

  const results = PARAMETER_META.map(buildParameter);
  const parameters = results
    .filter((r): r is { parameter: ParameterStats } => "parameter" in r)
    .map((r) => r.parameter);
  const skipped = results
    .filter((r): r is { skippedLabel: string } => "skippedLabel" in r)
    .map((r) => r.skippedLabel);

  if (parameters.length === 0) {
    return { error: `No readings found for any parameter in "${params.timeRange}".` };
  }

  const report: ReportInput = {
    site,
    parameters,
    events: [],
    // Deployment metadata, not derivable from readings -- see events/narrative docs.
    dataQuality: undefined,
  };

  return { report, ...(skipped.length > 0 ? { skippedParameters: skipped } : {}) };
};

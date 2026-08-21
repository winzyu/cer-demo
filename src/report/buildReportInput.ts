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
 * 3. **Client/contract is not available from this API.** `query_sensor_data` echoes only
 *    `{name, label, operating_environment}` plus a position for the device, and no clean
 *    organization/contract field exists on `DeviceSummary` today, so Client / Contract reports
 *    as "Not available" rather than a fabricated value.
 *
 *    Coordinates *are* available and are now filled in. An earlier version of this note claimed
 *    they lived on `DeviceSummary.raw` from `GET /devices`; that was wrong -- verified live,
 *    that record carries no lat/lon field at all. Coordinates ride on the individual readings
 *    (`decodeReading` -> `resolvePosition`), so `query_sensor_data` surfaces the newest in-window
 *    fix as `position` and this function reads it, with no extra API call.
 * 4. **Turbidity is reported qualitatively.** It stays fully in scope as a measured, reported
 *    metric -- only its *expression* changed. It is built here with `scale: "relative-index"`
 *    and no numeric baseline, so downstream it renders as a clarity band plus a direction of
 *    change instead of a pass/fail against a range. See referenceRanges.ts's
 *    TURBIDITY_BAND_EDGES for the cut points and why there is no range to compare against.
 * 5. **Temperature's baseline comes from the device registry, not from the reference table.**
 *    The source-of-truth doc gives temperature no fixed range on purpose ("Climate/season-
 *    dependent"; "Establish a site-specific baseline before treating deviations as events"), so
 *    `referenceRanges.ts` has no temperature entry and never will. The site-specific baseline it
 *    asks for is the operator's own `thresholds.minTemperature`/`maxTemperature` on the device
 *    document, which this function reads via `sensor.deviceRecord()` -- a second registry lookup
 *    that costs nothing, because it hits the device cache `sensor.query()` just primed.
 *
 *    Those numbers are hand-entered and partly junk, so they go through
 *    `operatorThresholds.ts` first; anything that fails validation leaves temperature exactly as
 *    it was before this existed -- Flag "N/A", baseline "Not established". The row also carries
 *    `baselineSource` so the PDF can distinguish an operator threshold from a reviewed reference
 *    range, the same way `waterBodyTypeSource` marks where the water type came from.
 *
 *    ⚠️ Knock-on worth knowing: `events.ts` skips any parameter with `hasFixedBaseline: false`,
 *    so on a device with a usable threshold temperature now participates in event detection for
 *    the first time, and the signature matrix's two Thermal rules can fire. That is the behavior
 *    those rules were written for, but an operator threshold is an *alert* line, not a
 *    seasonally-corrected baseline -- a pod whose summer water genuinely runs above the range
 *    someone set in spring will now raise Thermal candidates. Section 4 already frames every
 *    event as a candidate for investigation, and the alternative (a real baseline the report
 *    refuses to act on) is worse, but this is the row to look at first if event counts jump.
 */

import type { QuerySensorData, SensorQueryParams } from "../tools/querySensorData";
import { SensorQueryError } from "../tools/querySensorData";
import type { ToolContext } from "../types/tool.types";
import type {
  DataQualityCheck, ParameterBaseline, ParameterStats, ReportInput, SiteMetadata, WaterBodyType,
} from "./types";
import { baselineFor } from "./referenceRanges";
import { temperatureThreshold, thresholdRejectionNote } from "./operatorThresholds";
import type { ThresholdVerdict } from "./operatorThresholds";

/** Wire name -> template row label + unit. Labels match the DataPod report template. */
const PARAMETER_META: Array<{ key: string; label: string; unit: string }> = [
  { key: "dissolved_oxygen", label: "Dissolved Oxygen (mg/L)", unit: "mg/L" },
  { key: "orp", label: "ORP (mV)", unit: "mV" },
  { key: "ph", label: "pH", unit: "" },
  { key: "conductivity", label: "Conductivity (µS/cm)", unit: "µS/cm" },
  // Device API reports Fahrenheit (metrics.ts) -- label reflects the unit actually returned,
  // not the Celsius unit the source-of-truth doc's probe-accuracy formula expects internally.
  { key: "temperature", label: "Temperature (°F)", unit: "°F" },
  // Deliberately NOT the template's "Turbidity (NTU)". The value is a provisional, uncalibrated
  // relative index, not an NTU measurement (referenceRanges.ts, TURBIDITY_BAND_EDGES), so
  // printing "NTU" on it would assert a calibration nobody has. The label matches the customer
  // dashboard's own "Turbidity (Relative)" relabel; the unit is blank because the index has no
  // honest unit to name. This is the one row where this port diverges from the template's exact
  // wording, and this comment is why.
  { key: "turbidity", label: "Turbidity (Relative)", unit: "" },
];

/** Metrics reported on an uncalibrated relative scale -- see types.ts `ParameterScale`. */
const RELATIVE_INDEX_KEYS = new Set(["turbidity"]);

/**
 * The device registry's `operating_environment` as a report water body type, or `undefined` when
 * the registry does not say anything usable.
 *
 * Returns `undefined` rather than taking a fallback argument so the caller can tell "the registry
 * classified this pod" from "nothing was on file and a default was applied" -- a distinction the
 * report prints, because it decides which baseline table every flag is computed against.
 */
export const mapWaterType = (
  operatingEnvironment: string | null | undefined,
): WaterBodyType | undefined => {
  if (!operatingEnvironment) {
    return undefined;
  }
  const normalized = operatingEnvironment.toLowerCase();
  if (normalized.includes("salt") || normalized.includes("marine")) {
    return "Marine";
  }
  if (normalized.includes("brackish") || normalized.includes("estuar")) {
    return "Brackish";
  }
  if (normalized.includes("fresh")) {
    return "Freshwater";
  }
  return undefined;
};

interface MetricEntry {
  value: number | null;
  n_samples?: number;
  excluded_faulted?: number;
  excluded_implausible?: number;
  series?: Array<{ start: string; end: string; mean: number; min: number; max: number; n: number }>;
}

/**
 * Buckets thinner than this are dropped from the series handed to pattern/event detection.
 *
 * A `series` bucket is only as trustworthy as the number of readings behind it, and `bucketize`
 * omits empty buckets rather than zero-filling, so a reporting gap yields one bucket holding a
 * single reading whose "mean" is that reading. Verified on the Algalita Pod: the 12h bucket at
 * 2026-07-24T00:00Z held exactly one reading. Feeding a 1-sample bucket to the event detector
 * as a trend point invites a step-change event out of a gap in reporting.
 *
 * Section 2's min/max/mean deliberately do NOT apply this floor -- those are exact statistics
 * over every usable reading, and dropping readings from them to tidy a trend line would be the
 * same fabrication in the other direction.
 */
const MIN_BUCKET_SAMPLES = 3;

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
      excluded_faulted: typeof rec.excluded_faulted === "number" ? rec.excluded_faulted : undefined,
      excluded_implausible: typeof rec.excluded_implausible === "number"
        ? rec.excluded_implausible
        : undefined,
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
  /**
   * Water body type to fall back on when the device registry's `operating_environment` is
   * missing or unrecognized. **Not an override** -- the registry wins.
   *
   * It used to be an override, and that was a real defect: `generateReport` always passes this
   * (it defaults from `config.waterType`), so the `??` that was meant to let the registry decide
   * never fell through and `mapWaterType` was dead code on the production path. The Algalita Pod
   * is registered `operating_environment: "salt-water"`, but a deployment with
   * `WATER_TYPE=freshwater` produced a report headed "Freshwater" and judged its conductivity
   * against the freshwater baseline of 50-1500 µS/cm instead of seawater's 45,000-55,000 --
   * turning ordinary seawater into a 45x exceedance, a High-severity "Stormwater" event, and an
   * "Action Required" status. The device knows what it is sitting in; one global env var does
   * not.
   */
  waterBodyTypeFallback?: WaterBodyType;
}

export interface BuildReportInputResult {
  report?: ReportInput;
  error?: string;
  /** Parameters with no readings in the window -- surfaced to the caller, not silently dropped. */
  skippedParameters?: string[];
}

/**
 * Fills in the Data Quality section from what the query layer actually reported.
 *
 * Previously hardcoded to `undefined`, which made the section unreachable on live data --
 * `renderPdf` only prints it `if (report.dataQuality)`. That is why the report that carried a
 * -1809.4 °F probe rail into Section 2 had no Data Quality section to disclose it.
 *
 * Only two rows are genuinely computable here. Drift, biofouling, and cross-sensor agreement have
 * no detector in this pipeline, so their statuses are left unset and render as "Not assessed"
 * rather than as a clean result nothing verified (see DataQualityCheck).
 */
const buildDataQuality = (
  seriesMetrics: Record<string, MetricEntry>,
  skipped: string[],
): DataQualityCheck => {
  const entries = PARAMETER_META
    .map((meta) => ({ meta, entry: seriesMetrics[meta.key] }))
    .filter((e): e is { meta: typeof PARAMETER_META[number]; entry: MetricEntry } => !!e.entry);

  const used = entries.reduce((sum, e) => sum + (e.entry.n_samples ?? 0), 0);
  const faulted = entries.reduce((sum, e) => sum + (e.entry.excluded_faulted ?? 0), 0);
  const implausible = entries.reduce((sum, e) => sum + (e.entry.excluded_implausible ?? 0), 0);
  const offered = used + faulted + implausible;
  // "Completeness" here is the share of readings the device returned that survived filtering --
  // not coverage against an expected cadence, which this pipeline cannot know. Said plainly in
  // the note so the number is not read as the stronger claim.
  const completenessPct = offered === 0 ? 0 : (used / offered) * 100;

  const railed = entries
    .filter((e) => (e.entry.excluded_implausible ?? 0) > 0)
    .map((e) => `${e.meta.label}: ${e.entry.excluded_implausible}`);

  const completenessNotes = [
    `${used} of ${offered} readings returned for the period were usable`,
    faulted > 0 ? `${faulted} excluded on the probe's own fault flag` : null,
    implausible > 0 ? `${implausible} excluded as physically impossible` : null,
    skipped.length > 0 ? `no readings at all for: ${skipped.join(", ")}` : null,
    "Share of returned readings, not coverage against an expected sampling cadence.",
  ].filter(Boolean).join(". ");

  return {
    completenessPct,
    completenessNotes,
    // A probe that rails without raising its error flag is exactly the signal a calibration
    // review exists to catch, so this row is driven by the plausibility filter's count.
    calibrationStatus: implausible > 0 ? "Review" : "Pass",
    calibrationNotes: implausible > 0
      ? `${implausible} reading(s) were sensor rails reported without a fault flag (${railed.join("; ")}). `
        + "Inspect and recalibrate the affected probes; the hardware did not self-report these."
      : "No physically impossible readings in the period. Probe error flags were clear for all "
        + "readings counted above.",
    driftNotes: "Not assessed — this pipeline has no drift detector. Requires comparison against "
      + "a calibration record, which is not available from the device API.",
    biofoulingNotes: "Not assessed — this pipeline has no biofouling detector. Requires service "
      + "history or a fouling-sensitive baseline, neither of which is available here.",
    sensorAgreementNotes: "Not assessed — cross-sensor agreement needs a second co-located pod "
      + "or a grab-sample result to compare against.",
    // driftStatus, biofoulingStatus and sensorAgreementStatus are deliberately left unset:
    // no detector ran, so the PDF prints "Not assessed" instead of inventing a result.
  };
};

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
  // The registry is authoritative; the caller's value is only the fallback. See
  // BuildReportInputParams.waterBodyTypeFallback for the defect this ordering fixes.
  const registryWaterBodyType = mapWaterType(operatingEnvironment);
  const waterBodyType = registryWaterBodyType ?? params.waterBodyTypeFallback ?? "Freshwater";
  const waterBodyTypeSource = registryWaterBodyType ? "device" as const : "default" as const;

  // Temperature's site-specific baseline lives on the device document, not on the readings --
  // see file docstring §4. Looked up by the label the query already settled on rather than by
  // the caller's `params.device` string, so a fuzzy or ambiguous device name cannot attach one
  // pod's thresholds to another pod's readings.
  const resolvedLabel = typeof device.label === "string" && device.label !== ""
    ? device.label
    : params.device;
  const deviceRecord = await sensor.deviceRecord(resolvedLabel, context?.token);
  const temperatureVerdict: ThresholdVerdict = temperatureThreshold(deviceRecord?.thresholds);

  // Newest in-window GPS fix, carried on the readings themselves -- see file docstring §3.
  const position = asRecord(seriesResult.position);
  const latitude = typeof position.latitude === "number" ? position.latitude : undefined;
  const longitude = typeof position.longitude === "number" ? position.longitude : undefined;

  const site: SiteMetadata = {
    siteName,
    startDate,
    endDate,
    reportDate: new Date().toISOString().slice(0, 10),
    waterBodyType,
    waterBodyTypeSource,
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    ...(typeof position.location === "string" ? { locationName: position.location } : {}),
    // No clean client/contract field exists on DeviceSummary -- see file docstring §3.
    clientName: "Not available from device registry",
  };

  type Meta = typeof PARAMETER_META[number];

  /** The "no baseline" row: Flag "N/A", no numbers printed, and a note saying why. */
  const absentBaseline = (meta: Meta, note?: string): ParameterBaseline => ({
    key: meta.key,
    label: meta.label,
    unit: meta.unit,
    // Zeros are placeholders that `flagFor` never reads, because `hasFixedBaseline` short-
    // circuits to "N/A" before any comparison happens. Nothing downstream may print them --
    // "0-0" as a range is the fabricated figure this whole path exists to avoid.
    baselineMin: 0,
    baselineMax: 0,
    exceedanceMargin: 0.15,
    hasFixedBaseline: false,
    ...(note ? { baselineNote: note } : {}),
  });

  /**
   * Source-of-truth reference table, for the four metrics that have an entry in it.
   *
   * Turbidity is intercepted first: `BASELINE_RANGES` no longer carries a turbidity entry, so the
   * lookup would miss regardless -- the explicit guard states the intent rather than relying on a
   * lookup miss, and tags the row `relative-index` so nothing downstream range-compares it.
   * See file docstring §4.
   */
  const fixedBaseline = (meta: Meta): ParameterBaseline => {
    if (RELATIVE_INDEX_KEYS.has(meta.key)) {
      return { ...absentBaseline(meta), scale: "relative-index" as const };
    }
    const fixed = baselineFor(meta.key, meta.label, meta.unit, waterBodyType);
    return fixed
      ? {
        ...fixed,
        exceedanceMargin: 0.15,
        hasFixedBaseline: true,
        baselineSource: "reference-table",
      }
      : absentBaseline(meta);
  };

  /**
   * Temperature only: this device's validated operator threshold, or no baseline at all.
   *
   * There is deliberately no fallback to a reference range here. The source-of-truth doc's
   * position is that no fixed temperature range is defensible for any water type, so inventing
   * one when the registry is unconfigured would contradict the document this report cites.
   */
  const temperatureBaseline = (meta: Meta): ParameterBaseline => {
    if (!temperatureVerdict.usable) {
      return absentBaseline(meta, thresholdRejectionNote(temperatureVerdict.reason));
    }
    return {
      key: meta.key,
      label: meta.label,
      unit: meta.unit,
      baselineMin: temperatureVerdict.min,
      baselineMax: temperatureVerdict.max,
      exceedanceMargin: 0.15,
      hasFixedBaseline: true,
      baselineSource: "operator-threshold",
      baselineNote: `Operator-set threshold for this device (${temperatureVerdict.min}-`
        + `${temperatureVerdict.max} ${meta.unit}, from the device registry), not a fixed `
        + "reference range — the source-of-truth document gives temperature none, and asks for a "
        + "site-specific baseline instead.",
    };
  };

  type ParamResult = { parameter: ParameterStats } | { skippedLabel: string };

  const buildParameter = (meta: Meta): ParamResult => {
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

    // Two sources, and which one applies is decided by the metric, not by availability:
    // temperature is always the operator threshold (the reference table has no entry for it and
    // will not get one), every other metric is always the reference table (an operator threshold
    // must never quietly displace a reviewed range). See file docstring §5.
    const baseline = meta.key === "temperature"
      ? temperatureBaseline(meta)
      : fixedBaseline(meta);

    // Thin buckets are dropped from the trend series only -- see MIN_BUCKET_SAMPLES. The floor
    // is skipped entirely when it would empty the series (a genuinely sparse pod), since a
    // coarse trend beats no trend and the bucket count is what event detection reasons over.
    const trendBuckets = buckets.filter((b) => b.n >= MIN_BUCKET_SAMPLES);
    const series: Array<[number, number]> = (trendBuckets.length > 0 ? trendBuckets : buckets)
      .map((b) => {
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
    dataQuality: buildDataQuality(seriesMetrics, skipped),
  };

  return { report, ...(skipped.length > 0 ? { skippedParameters: skipped } : {}) };
};

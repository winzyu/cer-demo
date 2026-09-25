/**
 * `generate_report` tool: the model's entry point for "give me a water quality report",
 * distinct from `query_sensor_data`'s "what is a reading" (see the routing rule this adds to
 * `systemPrompt.ts`'s TOOL_BLOCK).
 *
 * Unlike `query_sensor_data`, this tool does not hand the model raw numbers to reason over --
 * it calls `QuerySensorData.query()` itself (the typed programmatic path that module documents
 * as existing for exactly this purpose), runs the same deterministic compute-then-narrate
 * pipeline end to end, and returns a short structured summary plus a `report_request` the page
 * turns into a download.
 * Nothing here calls an LLM: report prose is produced by `narrative.ts`'s rule-based writer,
 * per the team's zero-AI-calls decision for report generation. That is a deliberate difference
 * from `query_sensor_data`, whose whole point is handing facts to the model to narrate.
 *
 * **The tool renders no PDF and hands out no file URL.** `report_request` carries the same
 * `time_range` and `device` back out, and `POST /api/v1/reports` renders the PDF from them when
 * the user asks for it, returning the bytes in the response (`report/produceReport.ts`). An
 * earlier cut wrote PDFs to local disk behind a token-hash ownership sidecar; that lost every
 * report on redeploy and bound access to one exact token string, and both went with the disk.
 */

import { config } from "../config";
import { codedError } from "../utils/errors";
import { createLogger } from "../utils/logger";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import { QuerySensorData, type SensorToolResult } from "./querySensorData";
import { prepareReport } from "../report/produceReport";
import {
  flagFor, reportPeriod, statValue, withUnit,
} from "../report/types";
import { metricBlindSpotNote, WIRE_KEY_TO_METRIC } from "../report/operatorThresholds";
import { probeAccuracy } from "../report/referenceRanges";
import type {
  Flag, ReportInput, WaterBodyType, ParameterStats, StatusAssessment,
} from "../report/types";
import { readingAge } from "./readingAge";

const log = createLogger("GenerateReport");

export const generateReportDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "generate_report",
    description:
      "Generates a water quality report PDF for a reporting period, covering all six sensor "
      + "parameters at once: baseline comparison, flagged excursions, candidate pollution "
      + "events, and recommendations. Use this for a request that asks for a report, a "
      + "summary of conditions, or \"how has the water been\" -- NOT for a question about one "
      + "specific reading or stat, which query_sensor_data answers directly and faster.",
    parameters: {
      type: "object",
      properties: {
        time_range: {
          type: "string",
          description:
            "Natural-language reporting period, same grammar query_sensor_data accepts "
            + "(e.g. \"last 7 days\", \"last 30 days\", \"this month\").",
        },
        device: {
          type: "string",
          description: "Device name or dev: label. Required whenever more than one device is visible.",
        },
      },
      required: ["time_range"],
    },
  },
};

const failure = (message: string): SensorToolResult => ({ error: message });

/**
 * One compact line per numeric metric describing where its baseline came from, keyed by the
 * same wire metric names `query_sensor_data`/`get_pod_thresholds` use.
 *
 * Every numeric parameter is now judged against this device's own **operator-configured
 * registry threshold** -- the "Water Quality Metrics -- Source of Truth" table was vetoed in
 * full (project supervisor, 2026-09-13; see docs/timeline.md) and no longer feeds any baseline.
 * A reader who disagrees with a range needs to know it lives in the device registry, not in an
 * approved document, and a metric with no usable threshold has no baseline at all rather than a
 * fallback. The numbers here have already passed `operatorThresholds.ts` validation, so unlike
 * the raw `thresholds` object this is safe to put in front of the model.
 *
 * The blind-spot clause (`metricBlindSpotNote`) is recomputed here rather than read off
 * `ParameterBaseline.baselineNote`, so this summary's wording does not depend on what the PDF's
 * prose happens to say for the same row.
 */
const baselineProvenance = (report: ReportInput): Record<string, string> => {
  const byKey = new Map(
    report.parameters.map((p): [string, ParameterStats] => [p.baseline.key, p]),
  );
  return Object.fromEntries(Object.entries(WIRE_KEY_TO_METRIC).map(([wireKey, metricKey]) => {
    const p = byKey.get(wireKey);
    if (!p) {
      return [wireKey, "no readings in this period"];
    }
    const b = p.baseline;
    if (!b.hasFixedBaseline) {
      return [wireKey, `not established${b.baselineNote ? ` — ${b.baselineNote}` : ""}`];
    }
    const range = `${b.baselineMin}-${b.baselineMax}${b.unit ? ` ${b.unit}` : ""}`;
    const blindSpot = metricBlindSpotNote(metricKey, b.baselineMin, b.baselineMax);
    return [wireKey, blindSpot ? `${range} (configured; ${blindSpot})` : `${range} (configured)`];
  }));
};

/**
 * Every measured parameter's flag, keyed like `baseline_provenance`. The status alone told the
 * model that something was wrong without saying what, so it filled the gap from the event count
 * and wrote "Action Required" beside "no abnormal conditions" (`CONVERSATION_QA_2026-09-24.md`
 * finding 3).
 */
const parameterFlags = (report: ReportInput): Record<string, Flag> => Object.fromEntries(
  report.parameters.map((p): [string, Flag] => [p.baseline.key, flagFor(p, probeAccuracy)]),
);

/**
 * One sentence saying which rule set the status and, for a flag-driven status, the observed range
 * of each parameter behind it against its configured threshold, in the PDF's own number format.
 * Built from `assessStatus`, the same ladder that chose the status, so the two cannot disagree.
 */
const statusReason = (report: ReportInput, basis: StatusAssessment): string => {
  const byKey = new Map(
    report.parameters.map((p): [string, ParameterStats] => [p.baseline.key, p]),
  );
  const observed = basis.parameters.map((key) => {
    const p = byKey.get(key) as ParameterStats;
    const b = p.baseline;
    // Keyed as in parameter_flags, and "from ... to" because a hyphen misreads beside a negative.
    return `${key} ranged from ${withUnit(`${statValue(p.min)} to ${statValue(p.max)}`, b.unit)} `
      + `against its configured ${withUnit(`${b.baselineMin} to ${b.baselineMax}`, b.unit)}`;
  }).join("; ");
  switch (basis.rule) {
    case "exceedance":
      return "Action Required because a parameter went beyond its configured threshold by more "
        + `than the exceedance margin: ${observed}. This is independent of the event count.`;
    case "high-confidence-high-event":
      return "Action Required because a high-severity event was detected with enough confidence "
        + "to name it; see event_types.";
    case "excursion":
      return `Watch because a parameter moved outside its configured threshold: ${observed}.`;
    case "event":
      return "Watch because the report flagged a candidate event; see event_types. No parameter "
        + "left its configured threshold.";
    case "no-baseline":
      return "Not assessed because no parameter has a usable configured threshold, so nothing was "
        + "compared.";
    default:
      return "Normal: every parameter with a configured threshold stayed within it, and no event "
        + "was flagged.";
  }
};

export interface GenerateReportOptions {
  sensor?: QuerySensorData;
  /** Injectable for tests; defaults to config.waterType mapped to the report's WaterBodyType. */
  defaultWaterBodyType?: WaterBodyType;
}

export class GenerateReport {
  private readonly sensor: QuerySensorData;

  private readonly defaultWaterBodyType: WaterBodyType;

  constructor(options: GenerateReportOptions = {}) {
    this.sensor = options.sensor ?? new QuerySensorData();
    this.defaultWaterBodyType = options.defaultWaterBodyType
      ?? (config.waterType === "saltwater" ? "Marine" : "Freshwater");
  }

  /**
   * **Throws** `caller_token_required` when the request carried no bearer token, rather than
   * returning it as a `{ error }` the model narrates. Same call the sensor tool makes, for the
   * same reason (`querySensorData.ts`): the model cannot reword its way out of having no
   * credentials, and the UI needs a machine-readable signal to send the user to a sign-in.
   *
   * Checked *after* `time_range`, so an obviously malformed call still gets the argument error
   * it would have got before -- a missing header is not the interesting failure there.
   */
  async run(args: Record<string, unknown>, context?: ToolContext): Promise<SensorToolResult> {
    const timeRange = typeof args.time_range === "string" ? args.time_range : "";
    if (!timeRange) {
      return failure("\"time_range\" is required, e.g. \"last 7 days\".");
    }

    // Required up front rather than left to fail somewhere inside the sensor path: every reading
    // behind the report is fetched with this token, scoped to the caller's organization.
    const token = context?.token;
    if (!token) {
      throw codedError(
        401,
        "Generating a report requires the caller's own credentials. Send an "
        + "`Authorization: Bearer <token>` header with the chat request.",
        "caller_token_required",
      );
    }

    const device = typeof args.device === "string" ? args.device : undefined;

    const prepared = await prepareReport(
      this.sensor,
      // Fallback, not an override: the device registry's operating_environment wins when it has
      // one. See BuildReportInputParams.waterBodyTypeFallback.
      { timeRange, device, waterBodyTypeFallback: this.defaultWaterBodyType },
      context,
    );
    if (prepared.error !== undefined) {
      return failure(prepared.error);
    }
    const {
      report, status, statusBasis, narrative, skippedParameters,
    } = prepared;
    const { events } = report;
    // The period ends on the device's newest reading, not today, so a silent pod's "last 30
    // days" quietly ends on the day it stopped. The age says so.
    const lastReading = report.site.lastReadingAt
      ? readingAge(report.site.lastReadingAt, this.sensor.clockMs())
      : null;

    log.info(`Report summarised (status=${status}, events=${events.length})`);

    return {
      status,
      status_reason: statusReason(report, statusBasis),
      parameter_flags: parameterFlags(report),
      site_name: report.site.siteName,
      time_range_resolved: { start: report.site.startDate, end: report.site.endDate },
      // The period as the PDF prints it, for the model to quote verbatim (see REPORT_TOOL_BLOCK).
      report_period: reportPeriod(report.site),
      ...(report.site.lastReadingAt && lastReading
        ? {
          device_last_reported: report.site.lastReadingAt,
          device_last_reported_age: lastReading.age,
          device_last_reported_stale: lastReading.stale,
        }
        : {}),
      // Surfaced because event classification and narrative text still read it, and a reader who
      // disagrees with it should be told rather than have to open the PDF to find out. It no
      // longer selects any baseline -- see baseline_provenance below for where baselines come
      // from now.
      water_body_type: report.site.waterBodyType,
      water_body_type_source: report.site.waterBodyTypeSource === "device"
        ? "device registry"
        : "deployment default (registry did not specify)",
      // Every numeric metric is judged against this device's own operator-configured registry
      // threshold now, or against nothing at all if it has no usable one. Either way, say so.
      baseline_provenance: baselineProvenance(report),
      events_flagged: events.length,
      // The PDF's headings, not the raw classifications: a cause the catalogue does not approve
      // is not named in the report, so it must not reach the model either.
      event_types: narrative.events.map((e) => e.heading),
      catalogue_version: narrative.catalogueVersion,
      guidance_ids: narrative.guidanceIds,
      // What the page sends to `POST /api/v1/reports` to download the PDF. The arguments this
      // summary was computed from, echoed rather than resolved: the route re-validates them
      // against the caller's own token, so nothing here is trusted on the way back in.
      report_request: { time_range: timeRange, ...(device ? { device } : {}) },
      ...(skippedParameters && skippedParameters.length > 0
        ? { note: `No readings for: ${skippedParameters.join(", ")}. Report covers the remaining parameters only.` }
        : {}),
    };
  }
}

/**
 * `generate_report` tool: the model's entry point for "give me a water quality report",
 * distinct from `query_sensor_data`'s "what is a reading" (see the routing rule this adds to
 * `systemPrompt.ts`'s TOOL_BLOCK).
 *
 * Unlike `query_sensor_data`, this tool does not hand the model raw numbers to reason over --
 * it calls `QuerySensorData.query()` itself (the typed programmatic path that module documents
 * as existing for exactly this purpose), runs the same deterministic compute-then-narrate
 * pipeline end to end, and returns a short structured summary plus a URL to the finished PDF.
 * Nothing here calls an LLM: report prose is produced by `narrative.ts`'s rule-based writer,
 * per the team's zero-AI-calls decision for report generation. That is a deliberate difference
 * from `query_sensor_data`, whose whole point is handing facts to the model to narrate.
 *
 * PDF storage is local disk (`generated_reports/`, served by `reportRoutes.ts`) for this first
 * cut. On Cloud Run that directory does not survive a redeploy or scale-to-zero cycle -- moving
 * it to Cloud Storage (this deployment already depends on GCP via Firestore) is a reasonable,
 * bounded follow-up once report generation is more than a demo path.
 *
 * Each PDF is written together with an ownership sidecar recording a hash of the caller's token,
 * because `report_<8 hex>.pdf` on a route with no auth was a guessable capability URL onto a
 * named customer's readings. See `report/reportOwnership.ts` -- that file carries the reasoning
 * and the residual risk; this one just has to remember to call it.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { config } from "../config";
import { codedError } from "../utils/errors";
import { createLogger } from "../utils/logger";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import { QuerySensorData, type SensorToolResult } from "./querySensorData";
import { buildReportInput } from "../report/buildReportInput";
import { detectEvents } from "../report/events";
import { deterministicNarrative } from "../report/narrative";
import { buildReportPdf } from "../report/renderPdf";
import { recordReportOwner } from "../report/reportOwnership";
import { overallStatus } from "../report/types";
import { probeAccuracy } from "../report/referenceRanges";
import type { ReportInput, WaterBodyType } from "../report/types";

const log = createLogger("GenerateReport");

export const REPORTS_DIR = path.join(process.cwd(), "generated_reports");

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
 * One line describing where the temperature row's baseline came from.
 *
 * Surfaced for the same reason `water_body_type_source` is: temperature is the only parameter
 * judged against a **per-device operator threshold** rather than the source-of-truth reference
 * table, and a reader who disagrees with the range needs to know it lives in the device registry
 * rather than in an approved document. The numbers here have already passed
 * `operatorThresholds.ts` validation, so unlike the raw `thresholds` object this is safe to put
 * in front of the model.
 */
const temperatureBaselineSummary = (report: ReportInput): string => {
  const temp = report.parameters.find((p) => p.baseline.key === "temperature");
  if (!temp) {
    return "no temperature readings in this period";
  }
  const b = temp.baseline;
  if (!b.hasFixedBaseline) {
    return "not established — this device has no usable temperature threshold in the registry, "
      + "so the row is reported for reference only";
  }
  return `${b.baselineMin}-${b.baselineMax} ${b.unit} (operator-set threshold for this device, `
    + "from the device registry)";
};

export interface GenerateReportOptions {
  sensor?: QuerySensorData;
  reportsDir?: string;
  /** Injectable for tests; defaults to config.waterType mapped to the report's WaterBodyType. */
  defaultWaterBodyType?: WaterBodyType;
}

export class GenerateReport {
  private readonly sensor: QuerySensorData;

  private readonly reportsDir: string;

  private readonly defaultWaterBodyType: WaterBodyType;

  constructor(options: GenerateReportOptions = {}) {
    this.sensor = options.sensor ?? new QuerySensorData();
    this.reportsDir = options.reportsDir ?? REPORTS_DIR;
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

    // Required up front rather than left to fail somewhere inside the sensor path: a report is
    // *bound* to this token, so without one there is nobody to bind the finished PDF to and the
    // document would be written and then be unreadable by anyone, forever.
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

    const { report, error, skippedParameters } = await buildReportInput(
      this.sensor,
      // Fallback, not an override: the device registry's operating_environment wins when it has
      // one. See BuildReportInputParams.waterBodyTypeFallback.
      { timeRange, device, waterBodyTypeFallback: this.defaultWaterBodyType },
      context,
    );
    if (error || !report) {
      return failure(error ?? "Could not build a report from the available sensor data.");
    }

    const events = detectEvents(report);
    report.events = events;
    const status = overallStatus(report, probeAccuracy);
    const narrative = deterministicNarrative(report, probeAccuracy, status);

    fs.mkdirSync(this.reportsDir, { recursive: true });
    const filename = `report_${randomUUID().slice(0, 8)}.pdf`;
    const outPath = path.join(this.reportsDir, filename);

    await new Promise<void>((resolve, reject) => {
      try {
        const doc = buildReportPdf(report, narrative, { probeAccuracy, status });
        const stream = fs.createWriteStream(outPath);
        doc.pipe(stream);
        doc.end();
        stream.on("finish", () => resolve());
        stream.on("error", reject);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // Written after the PDF, never before: a sidecar for a document that failed to render would
    // outlive nothing and confuse the next reader of this directory.
    recordReportOwner(this.reportsDir, filename, token);

    log.info(`Report generated: ${filename} (status=${status}, events=${events.length})`);

    return {
      status,
      site_name: report.site.siteName,
      time_range_resolved: { start: report.site.startDate, end: report.site.endDate },
      // Surfaced because it selects the baseline table every flag was computed against, and a
      // reader who disagrees with it should be told rather than have to open the PDF to find out.
      water_body_type: report.site.waterBodyType,
      water_body_type_source: report.site.waterBodyTypeSource === "device"
        ? "device registry"
        : "deployment default (registry did not specify)",
      // The source-of-truth doc gives temperature no fixed range, so this row alone is judged
      // against the operator's own threshold -- or against nothing at all. Either way, say so.
      temperature_baseline: temperatureBaselineSummary(report),
      events_flagged: events.length,
      event_types: events.map((e) => e.type),
      report_url: `/api/v1/reports/${filename}`,
      ...(skippedParameters && skippedParameters.length > 0
        ? { note: `No readings for: ${skippedParameters.join(", ")}. Report covers the remaining parameters only.` }
        : {}),
    };
  }
}

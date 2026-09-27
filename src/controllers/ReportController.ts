import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { config } from "../config";
import { quotaService, quotaSubjectFor } from "../quota";
import type { QuotaService } from "../quota";
import { prepareReport, renderReportPdf, reportFilename } from "../report/produceReport";
import type { WaterBodyType } from "../report/types";
import { QuerySensorData } from "../tools/querySensorData";
import { callerToken } from "../utils/bearerToken";
import { createLogger } from "../utils/logger";

const log = createLogger("Reports");

/** Generous for any phrase the time-range grammar accepts, and a bound on what is parsed. */
const MAX_TIME_RANGE_CHARS = 100;
const MAX_DEVICE_CHARS = 200;

export interface ReportControllerOptions {
  /** Defaults to `REPORT_TOOL`: the flag governs report generation, not just the model's tool. */
  enabled?: boolean;
  sensor?: QuerySensorData;
  quota?: QuotaService;
  /** Injectable for tests; defaults to config.waterType mapped to the report's WaterBodyType. */
  defaultWaterBodyType?: WaterBodyType;
}

const optionalString = (value: unknown, name: string, max: number): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.length > max) {
    throw createHttpError(400, `"${name}" must be a string of at most ${max} characters.`);
  }
  return value;
};

/**
 * `POST /api/v1/reports` - renders a report PDF and returns its bytes as a download.
 *
 * Body: `{ time_range, device? }`, the `report_request` a `generate_report` tool result carries,
 * so a report offered in chat downloads through here with the arguments it was summarised from.
 *
 * **Nothing is stored.** The PDF is rendered in memory and streamed back, which is what lets this
 * route drop the per-file ownership check the disk-backed design needed: there is no file for a
 * second caller to ask for. Every reading in the report is fetched with the caller's own token
 * (`requireCallerToken`, mounted in `reportRoutes.ts`), which the device API scopes to their
 * organization, so a report can only describe the caller's own pods.
 *
 * **Counted against `QUERY_QUOTA_REPORTS`** (the gate is `quotaGuard(…, "report")`), and only
 * once the PDF has rendered, so a bad range or a pod with no readings costs nothing.
 */
export class ReportController {
  private readonly enabled: boolean;

  private readonly sensor: QuerySensorData;

  private readonly quota: QuotaService;

  private readonly defaultWaterBodyType: WaterBodyType;

  constructor(options: ReportControllerOptions = {}) {
    this.enabled = options.enabled ?? config.tools.reportTool;
    this.sensor = options.sensor ?? new QuerySensorData();
    this.quota = options.quota ?? quotaService;
    this.defaultWaterBodyType = options.defaultWaterBodyType
      ?? (config.waterType === "saltwater" ? "Marine" : "Freshwater");
  }

  createReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!this.enabled) {
        throw createHttpError(404, "Report generation is not enabled on this deployment.");
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const timeRange = optionalString(body.time_range, "time_range", MAX_TIME_RANGE_CHARS);
      if (!timeRange) {
        throw createHttpError(400, "\"time_range\" is required, e.g. \"last 7 days\".");
      }
      const device = optionalString(body.device, "device", MAX_DEVICE_CHARS);

      // Non-null by construction: `requireCallerToken` refuses the request before it gets here.
      const token = callerToken(req) as string;
      const prepared = await prepareReport(
        this.sensor,
        { timeRange, device, waterBodyTypeFallback: this.defaultWaterBodyType },
        { token },
      );
      if (prepared.error !== undefined) {
        // The same prose the tool would have handed the model: a range the grammar does not
        // read, a pod the caller cannot see, or a window with no readings.
        throw createHttpError(422, prepared.error);
      }

      const pdf = await renderReportPdf(prepared);
      await this.quota.recordReport(quotaSubjectFor(req));
      log.info(`Report rendered (status=${prepared.status}, bytes=${pdf.length})`);

      res.status(200)
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${reportFilename(prepared.report)}"`,
          "Content-Length": String(pdf.length),
          // A customer's readings: never cached by a browser or anything in between.
          "Cache-Control": "no-store",
        })
        .end(pdf);
    } catch (error) {
      next(error);
    }
  };
}

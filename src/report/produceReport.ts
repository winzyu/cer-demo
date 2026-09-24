/**
 * The report pipeline end to end: sensor data -> report model -> events -> status -> narrative,
 * then optionally the PDF bytes.
 *
 * Shared by the `generate_report` tool, which needs the summary but never the PDF, and by
 * `POST /api/v1/reports`, which returns the PDF. Nothing here calls an LLM and nothing touches
 * disk: a report is rendered when it is downloaded and handed straight back in the response, so
 * there is no stored file to protect and no per-file owner to check. Access rests on the caller's
 * own token, which the device API scopes to their organization on every read.
 *
 * Rendering at download time means the PDF is recomputed from the same `time_range` phrase the
 * tool used. Relative phrases anchor to the pod's newest reading (`timeRange.ts`), so a pod that
 * reported again between the answer and the click yields a window shifted by those minutes. The
 * PDF prints its own resolved period, which is the authority.
 */

import type { ToolContext } from "../types/tool.types";
import type { QuerySensorData } from "../tools/querySensorData";
import { guidance } from "../catalogue";
import { buildReportInput } from "./buildReportInput";
import { detectEvents } from "./events";
import { deterministicNarrative, type NarrativeSections } from "./narrative";
import { probeAccuracy } from "./referenceRanges";
import { buildReportPdf } from "./renderPdf";
import { assessStatus } from "./types";
import type {
  ReportInput, ReportStatus, StatusAssessment, WaterBodyType,
} from "./types";

export interface ReportRequest {
  timeRange: string;
  device?: string;
  /** Used only when the device registry does not say; see BuildReportInputParams. */
  waterBodyTypeFallback?: WaterBodyType;
}

export interface PreparedReport {
  report: ReportInput;
  status: ReportStatus;
  /** The rule and parameters behind `status`, for `generate_report`'s tool result. */
  statusBasis: StatusAssessment;
  narrative: NarrativeSections;
  skippedParameters?: string[];
}

export type PrepareResult =
  | ({ error?: undefined } & PreparedReport)
  | { error: string };

/** Everything except the PDF. An `error` is a reason the user can act on, not an exception. */
export const prepareReport = async (
  sensor: QuerySensorData,
  request: ReportRequest,
  context?: ToolContext,
): Promise<PrepareResult> => {
  const { report, error, skippedParameters } = await buildReportInput(sensor, request, context);
  if (error || !report) {
    return { error: error ?? "Could not build a report from the available sensor data." };
  }

  report.events = detectEvents(report);
  const statusBasis = assessStatus(report, probeAccuracy);
  const { status } = statusBasis;
  const narrative = deterministicNarrative(report, probeAccuracy, status, guidance);
  return {
    report, status, statusBasis, narrative, ...(skippedParameters ? { skippedParameters } : {}),
  };
};

/** Renders a prepared report to PDF bytes in memory. */
export const renderReportPdf = (prepared: PreparedReport): Promise<Buffer> => (
  new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = buildReportPdf(prepared.report, prepared.narrative, {
        probeAccuracy, status: prepared.status,
      });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  })
);

/**
 * `cer-report-<site>-<start>-to-<end>.pdf`, reduced to characters that are safe in a
 * `Content-Disposition` header without quoting rules: a device name is operator-entered text.
 */
export const reportFilename = (report: ReportInput): string => {
  const slug = report.site.siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "site";
  const day = (iso: string): string => iso.slice(0, 10);
  return `cer-report-${slug}-${day(report.site.startDate)}-to-${day(report.site.endDate)}.pdf`;
};

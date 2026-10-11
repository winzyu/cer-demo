import type { ToolInvocation } from "../types/tool.types";
import { OMIT_LABELS, parseReportOmit } from "./omit";

/**
 * Which PDF an answer actually made, said by the server rather than the model (`SPECS.md` §10.7).
 *
 * The model used to announce "a new PDF is ready" itself, and on a second edit in one chat it
 * sometimes said so without calling `generate_report` (Mirror, 2026-10-10 and 2026-10-11): the
 * user would then share the earlier copy, still carrying the notes they asked to remove. The
 * server knows exactly which reports an answer prepared, so it writes that line, and it checks
 * an answer that sounds like a delivery against that same fact.
 */

export const REPORT_TOOL_NAME = "generate_report";

const NEW_PDF_PREFIX = "New PDF in this reply:";

export const NO_NEW_PDF_LINE = "No new PDF was made in this reply.";

/** Replaces an answer that still claims a report after the forced retry made none. */
export const NOT_REGENERATED_ANSWER = "That copy was not regenerated; please ask again.";

/** A report this answer prepared: the page shows one download button for each. */
export interface MadeReport {
  siteName?: string;
  reportPeriod?: string;
  omit: string[];
}

/**
 * Reports prepared in this answer, by the rule cer-api uses to show download buttons
 * (`toReportOffers`): a `generate_report` call that returned a `report_request` and no error,
 * not counting a deduped repeat, which would only duplicate a button.
 */
export const madeReports = (invocations: readonly ToolInvocation[]): MadeReport[] => (
  invocations.flatMap((call) => {
    if (call.name !== REPORT_TOOL_NAME || call.deduped) {
      return [];
    }
    const result = (call.result ?? {}) as Record<string, unknown>;
    const request = result.report_request as Record<string, unknown> | undefined;
    if (!request || typeof request !== "object" || typeof result.error === "string") {
      return [];
    }
    const parsed = parseReportOmit(request.omit);
    return [{
      ...(typeof result.site_name === "string" ? { siteName: result.site_name } : {}),
      ...(typeof result.report_period === "string" ? { reportPeriod: result.report_period } : {}),
      omit: "omit" in parsed ? parsed.omit : [],
    }];
  })
);

const listInWords = (items: string[]): string => (
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
);

const describeReport = (report: MadeReport): string => {
  const omitted = report.omit.map((group) => OMIT_LABELS[group as keyof typeof OMIT_LABELS]);
  const parts = [
    report.siteName,
    report.reportPeriod,
    omitted.length > 0 ? `leaving out the ${listInWords(omitted)}` : "full report",
  ].filter((part): part is string => typeof part === "string" && part !== "");
  return `${NEW_PDF_PREFIX} ${parts.join(", ")}.`;
};

/** True when `text` carries a line this module wrote, so the conversation has had a report. */
export const hasDeliveryLine = (text: string): boolean => (
  text.split("\n").some((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith(NEW_PDF_PREFIX) || trimmed === NO_NEW_PDF_LINE;
  })
);

/**
 * Removes this module's lines from an earlier reply before it reaches the model as history.
 * Marking earlier replies as having produced a report made the model skip `generate_report`
 * more often (5 of 6 runs against 1 of 6), so the model never sees them.
 */
export const stripDeliveryLines = (text: string): string => {
  if (!hasDeliveryLine(text)) {
    return text;
  }
  return text
    .split("\n")
    .filter((line) => !hasDeliveryLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * The lines appended to an answer: one per report it made; otherwise "No new PDF" when the
 * answer tried a report and failed, or follows an earlier reply that carried one of these lines.
 * Nothing at all for an answer in a chat that has never involved a report.
 */
export const deliveryLines = (
  invocations: readonly ToolInvocation[],
  earlierReport: boolean,
): string[] => {
  const made = madeReports(invocations);
  if (made.length > 0) {
    return made.map(describeReport);
  }
  const tried = invocations.some((call) => call.name === REPORT_TOOL_NAME);
  return tried || earlierReport ? [NO_NEW_PDF_LINE] : [];
};

/** `answer` with its delivery lines, each as its own paragraph. */
export const withDeliveryLines = (answer: string, lines: string[]): string => (
  lines.length === 0
    ? answer
    : [answer.trimEnd(), ...lines].filter((part) => part !== "").join("\n\n")
);

const BUTTON = /\bdownload(?:\s+report)?\s+button\b|\bdownload report\b/i;
const LEFT_OUT = /\b(?:left out|leaves out|leaving out|omitted|omits|removed|excluded|stripped)\b/i;
const REPORT_NOUN = /\b(?:pdf|copy|report|version)\b/i;
/** "Numbers cannot be removed from the report" is a refusal, not a delivery. */
const NEGATION = /\b(?:cannot|can't|can not|not|never|won't|unable)\b/i;

/**
 * True when an answer reads as delivering a report: it points at the download button, or says a
 * PDF, copy or report has notes left out, in one sentence that is not a refusal. Only consulted
 * for an answer that made no report, where either reading is false. A wording this misses (the
 * model saying "done" without either) still gets the "No new PDF" line when the chat has had a
 * report.
 */
export const claimsReport = (answer: string): boolean => (
  BUTTON.test(answer)
  || answer.split(/(?<=[.!?])\s+|\n+/).some((sentence) => (
    LEFT_OUT.test(sentence) && REPORT_NOUN.test(sentence) && !NEGATION.test(sentence)
  ))
);

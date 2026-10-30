import {
  NO_NEW_PDF_LINE, claimsReport, deliveryLines, hasDeliveryLine, madeReports, reportClaim, stripDeliveryLines,
  withDeliveryLines,
} from "../../src/report/delivery";
import type { ToolInvocation } from "../../src/types/tool.types";

/** The server-written "New PDF in this reply" line and the report-claim check (`SPECS.md` §10.7). */

const reportCall = (
  result: Record<string, unknown>,
  extra: Partial<ToolInvocation> = {},
): ToolInvocation => ({
  handle: "T1",
  raw_arguments: "{}",
  round: 1,
  name: "generate_report",
  arguments: {},
  result,
  ...extra,
});

const made = (omit?: string[]) => reportCall({
  site_name: "Harbor Pier Buoy",
  report_period: "Oct 4, 2026 - Oct 11, 2026",
  report_request: { time_range: "last 7 days", ...(omit ? { omit } : {}) },
});

describe("madeReports", () => {
  it("counts a report_request with no error, as cer-api counts download buttons", () => {
    expect(madeReports([made(["turbidity_notes"])])).toEqual([{
      siteName: "Harbor Pier Buoy",
      reportPeriod: "Oct 4, 2026 - Oct 11, 2026",
      omit: ["turbidity_notes"],
    }]);
  });

  it("skips errors, deduped repeats and other tools", () => {
    expect(madeReports([
      reportCall({ error: "no readings", report_request: { time_range: "x" } }),
      reportCall({ report_request: { time_range: "x" } }, { deduped: true }),
      reportCall({ report_request: { time_range: "x" } }, { name: "query_sensor_data" }),
      reportCall({ note: "no request" }),
    ])).toEqual([]);
  });
});

describe("deliveryLines", () => {
  it("names the site, the period and what the copy leaves out", () => {
    expect(deliveryLines([made(["turbidity_notes", "sensor_fault_notes", "data_quality"])], false))
      .toEqual(["New PDF in this reply: Harbor Pier Buoy, Oct 4, 2026 - Oct 11, 2026, leaving out "
        + "the turbidity notes, sensor fault notes and Data Quality section."]);
  });

  it("says a copy with nothing left out is the full report", () => {
    expect(deliveryLines([made()], false))
      .toEqual(["New PDF in this reply: Harbor Pier Buoy, Oct 4, 2026 - Oct 11, 2026, full report."]);
  });

  it("writes one line per report", () => {
    expect(deliveryLines([made(), made(["threshold_notes"])], false)).toHaveLength(2);
  });

  it("says no PDF was made when the report call failed", () => {
    expect(deliveryLines([reportCall({ error: "unknown pod" })], false)).toEqual([NO_NEW_PDF_LINE]);
  });

  it("says no PDF was made after an earlier report, even with no call", () => {
    expect(deliveryLines([], true)).toEqual([NO_NEW_PDF_LINE]);
  });

  it("adds nothing to a chat that has never involved a report", () => {
    expect(deliveryLines([], false)).toEqual([]);
  });
});

describe("withDeliveryLines and stripDeliveryLines", () => {
  const answer = "Status: Action Required, from pH above its threshold.";

  it("appends each line as its own paragraph and leaves an answer alone without lines", () => {
    expect(withDeliveryLines(answer, ["New PDF in this reply: X, full report."]))
      .toBe(`${answer}\n\nNew PDF in this reply: X, full report.`);
    expect(withDeliveryLines(answer, [])).toBe(answer);
  });

  it("round-trips: what the server appends is exactly what history loses", () => {
    const shown = withDeliveryLines(answer, deliveryLines([made(["turbidity_notes"])], false));
    expect(hasDeliveryLine(shown)).toBe(true);
    expect(stripDeliveryLines(shown)).toBe(answer);
    expect(stripDeliveryLines(`${answer}\n\n${NO_NEW_PDF_LINE}`)).toBe(answer);
  });

  it("does not touch a reply without one", () => {
    expect(hasDeliveryLine(answer)).toBe(false);
    expect(stripDeliveryLines(`${answer}\n\n\n`)).toBe(`${answer}\n\n\n`);
  });
});

describe("claimsReport", () => {
  it.each([
    // P3 and R3 on the Mirror, 2026-10-10.
    "I've left out all four groups. Use the Download report (PDF) button above to get it.",
    "Click Download report - Harbor Pier Buoy (PDF) to save the copy.",
    "The download button now gives you the clean copy.",
    // P4: no button, but a delivery all the same.
    "I've already omitted those in the latest copy.",
    "This version of the PDF leaves out the turbidity notes.",
  ])("recognises a delivery: %s", (text) => {
    expect(claimsReport(text)).toBe(true);
  });

  it.each([
    "pH stayed between 7.1 and 7.6 all week.",
    "Numbers, flags and recommendations cannot be removed from the report.",
    "I can't take the pH values out of the PDF.",
    "Turbidity readings were removed by the sensor's own filter.",
  ])("does not read an ordinary answer or a refusal as one: %s", (text) => {
    expect(claimsReport(text)).toBe(false);
  });
  // Mirror A4, 2026-10-16: after an earlier reply made a copy, pointing back at it is true.
  it.each([
    "I've already omitted those in the latest copy.",
    "Your current copy already leaves out the turbidity notes.",
    "The earlier download button still gives you that copy.",
  ])("reads a back-reference as a claim only when no earlier report exists: %s", (text) => {
    expect(claimsReport(text)).toBe(true);
    expect(claimsReport(text, { earlierReport: false })).toBe(true);
    expect(claimsReport(text, { earlierReport: true })).toBe(false);
  });

  // Mirror A4, 2026-10-30: an offer of a copy is not a delivery of one.
  it.each([
    "What I can do instead: if you'd like a copy without the explanatory notes (turbidity notes, sensor fault notes, threshold notes, or the Data Quality section), I can regenerate it with any of those left out.",
    "Would you like a copy with the turbidity notes left out?",
    "If you want, I could make a version that leaves out the threshold notes.",
  ])("does not read an offer as a claim: %s", (text) => {
    expect(claimsReport(text)).toBe(false);
    expect(claimsReport(text, { earlierReport: true })).toBe(false);
  });

  it("still reads a new delivery as a claim after an earlier report", () => {
    const text = "This version of the PDF leaves out the turbidity notes.";
    expect(claimsReport(text, { earlierReport: true })).toBe(true);
    expect(reportClaim(`pH was normal. ${text}`)).toBe(text);
  });
});

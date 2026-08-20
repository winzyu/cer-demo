import { buildReportPdf, resolveSectionNumbers } from "../../src/report/renderPdf";
import type {
  ParameterBaseline, ParameterStats, ReportInput, SiteMetadata, WQEvent, DataQualityCheck,
} from "../../src/report/types";
import type { NarrativeSections } from "../../src/report/narrative";

/**
 * renderPdf.ts is the pdfkit port of render_pdf.py. The behavior most worth pinning here is the
 * user-requested fix: sections 4-6 are numbered dynamically, so whichever of Event Detection /
 * Data Quality is skipped, the following section's number shifts down rather than leaving a gap
 * or printing a fixed "5"/"6" that no longer matches.
 *
 * `resolveSectionNumbers` was pulled out of `buildReportPdf` specifically so this numbering
 * logic is unit-testable directly -- extracting the rendered PDF's actual text (e.g. via
 * pdf-parse, as src/ingestion/extract.ts does for real documents) needs pdfjs-dist's worker,
 * which errors under Jest without `--experimental-vm-modules`
 * ("A dynamic import callback was invoked without --experimental-vm-modules") -- the project's
 * own ingestion tests never exercise that code path under Jest either, only its metadata
 * functions. The buffer-level smoke test below covers "the render doesn't throw and produces
 * a real PDF," which is the piece text-extraction would otherwise be needed for.
 */

const noAccuracy = (): number => 0;

const site: SiteMetadata = {
  siteName: "Test Site",
  startDate: "2026-08-01",
  endDate: "2026-08-08",
  reportDate: "2026-08-09",
  waterBodyType: "Freshwater",
  clientName: "Not available",
};

const baseline: ParameterBaseline = {
  key: "ph", label: "pH", unit: "", baselineMin: 6.5, baselineMax: 8.5, exceedanceMargin: 0.15, hasFixedBaseline: true,
};

const param: ParameterStats = {
  baseline, min: 7.0, max: 7.5, mean: 7.2, median: 7.2, pattern: "flat",
};

const narrative: NarrativeSections = {
  summaryBullets: ["Overall status: Normal — no action required at this time."],
  parameterAnalysis: new Map(),
  recommendationsOperational: "No action needed.",
  recommendationsInvestigative: "None required this period.",
  recommendationsStakeholder: "Routine report distribution to client only.",
};

const event: WQEvent = {
  type: "Inconclusive",
  windowStartMs: Date.parse("2026-08-02T00:00:00.000Z"),
  windowEndMs: Date.parse("2026-08-02T02:00:00.000Z"),
  severity: "Low",
  parameterMovements: "pH fell to 6.0",
  interpretation: "Test interpretation.",
  followUp: "Grab sample",
  confidence: 0.3,
};

const dataQuality: DataQualityCheck = {
  completenessPct: 98.5,
  completenessNotes: "Two short gaps.",
  calibrationStatus: "Pass",
  calibrationNotes: "Within spec.",
  driftStatus: "None",
  driftNotes: "n/a",
  biofoulingStatus: "None",
  biofoulingNotes: "n/a",
  sensorAgreementStatus: "Pass",
  sensorAgreementNotes: "n/a",
};

describe("resolveSectionNumbers — dynamic section numbering", () => {
  it("numbers Recommendations as 4 when both Event Detection and Data Quality are absent", () => {
    expect(resolveSectionNumbers({ events: [], dataQuality: undefined })).toEqual({
      recommendations: 4,
    });
  });

  it("numbers Event Detection as 4 and Recommendations as 5 when only events are present", () => {
    expect(resolveSectionNumbers({ events: [event], dataQuality: undefined })).toEqual({
      eventDetection: 4, recommendations: 5,
    });
  });

  it("numbers Data Quality as 4 and Recommendations as 5 when only data quality is present", () => {
    expect(resolveSectionNumbers({ events: [], dataQuality })).toEqual({
      dataQuality: 4, recommendations: 5,
    });
  });

  it("numbers all three consecutively (4, 5, 6) when both are present", () => {
    expect(resolveSectionNumbers({ events: [event], dataQuality })).toEqual({
      eventDetection: 4, dataQuality: 5, recommendations: 6,
    });
  });
});

describe("buildReportPdf — smoke test", () => {
  const render = async (report: ReportInput): Promise<Buffer> => {
    const doc = buildReportPdf(report, narrative, { probeAccuracy: noAccuracy, status: "Normal" });
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    });
  };

  it("renders a real, non-empty PDF for the minimal case", async () => {
    const report: ReportInput = { site, parameters: [param], events: [] };
    const buffer = await render(report);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders without throwing when every optional section is present", async () => {
    const report: ReportInput = {
      site, parameters: [param], events: [event], dataQuality,
    };
    const buffer = await render(report);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

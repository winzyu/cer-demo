/**
 * Renders a ReportInput + NarrativeSections into a PDF matching the DataPod Water Quality
 * Report template layout (title block, metadata table, sections 1-6). Ported from the Python
 * prototype's `render_pdf.py`, which used reportlab's Platypus flowables; this port uses
 * `pdfkit` instead (no Python runtime in this service's Node/Alpine deployment -- see the
 * `generateReport.ts` tool docstring), so table layout and pagination are hand-rolled below
 * rather than coming from a flowable engine. Layout constants (column widths, colors, spacing)
 * are chosen to match the prototype's output as closely as pdfkit's lower-level API allows, not
 * copied byte-for-byte.
 */

import PDFDocument from "pdfkit";
import type {
  ReportInput, WQEvent, Flag, ReportStatus,
} from "./types";
import { coordinatesStr, flagFor } from "./types";
import type { NarrativeSections } from "./narrative";

const STATUS_COLORS: Record<ReportStatus, string> = {
  Normal: "#1a7f37",
  Watch: "#b35900",
  "Action Required": "#c0392b",
};
const FLAG_COLORS: Record<Flag, string> = {
  Normal: "#1a7f37",
  Elevated: "#b35900",
  Low: "#b35900",
  Exceedance: "#c0392b",
  "N/A": "#777777",
};

/** Printed for a Data Quality check that has no detector in this pipeline (see types.ts). */
const NOT_ASSESSED = "Not assessed";

export const MARGIN = 54; // 0.75in
const PAGE_WIDTH = 612; // US Letter, points
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const ensureSpace = (doc: PDFKit.PDFDocument, height: number): void => {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
  }
};

const sectionHeader = (doc: PDFKit.PDFDocument, text: string): void => {
  ensureSpace(doc, 30);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#000000").text(text);
  doc.moveDown(0.3);
};

const bodyText = (
  doc: PDFKit.PDFDocument,
  text: string,
  opts: PDFKit.Mixins.TextOptions = {},
): void => {
  doc.font("Helvetica").fontSize(10).fillColor("#000000");
  const height = doc.heightOfString(text, { width: CONTENT_WIDTH, ...opts });
  ensureSpace(doc, height + 4);
  doc.text(text, { width: CONTENT_WIDTH, ...opts });
};

/** Two-column label/value rows with a bottom border line each, e.g. the metadata block.
 * Exported for `reportRenderPdf.test.ts`'s cursor-reset regression test. */
export const drawKeyValueTable = (
  doc: PDFKit.PDFDocument,
  rows: Array<{ label: string; value: string; color?: string }>,
): void => {
  const labelWidth = 130;
  const valueWidth = CONTENT_WIDTH - labelWidth;
  rows.forEach((row) => {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
    const labelHeight = doc.heightOfString(row.label, { width: labelWidth });
    doc.font(row.color ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(row.color ?? "#000000");
    const valueHeight = doc.heightOfString(row.value, { width: valueWidth });
    const rowHeight = Math.max(labelHeight, valueHeight) + 12;
    ensureSpace(doc, rowHeight);

    const top = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000")
      .text(row.label, MARGIN, top + 6, { width: labelWidth });
    doc.font(row.color ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(row.color ?? "#000000")
      .text(row.value, MARGIN + labelWidth, top + 6, { width: valueWidth });
    doc.y = top + rowHeight;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).strokeColor("#dddddd").lineWidth(0.5)
      .stroke();
  });
  // Each row above calls `.text(str, x, y, opts)` with an explicit x -- pdfkit leaves `doc.x`
  // parked at that x afterward rather than restoring the page's left margin. Every following
  // call that omits x/y (sectionHeader, bodyText, doc.list, ...) flows from whatever `doc.x`
  // currently is, so without this the entire rest of the document renders indented by
  // `labelWidth` (visible for one line as a nudged heading, worse once the leftover x conflicts
  // with an explicit `width` on a later wrapped paragraph -- see drawGridTable's version of the
  // same bug, which is why "3. Parameter Analysis" render as a squeezed sliver on the right
  // margin instead of full-width prose).
  doc.x = MARGIN;
};

interface GridColumn {
  header: string;
  width: number;
  align?: "left" | "center";
}

/** A bordered grid table with a dark header row and zebra-striped body rows -- used for both
 * the Parameter Data and Data Quality tables. `cellColor` lets a caller color one cell's text
 * (used for the Flag column). Exported for `reportRenderPdf.test.ts`'s cursor-reset regression
 * test. */
export const drawGridTable = (
  doc: PDFKit.PDFDocument,
  columns: GridColumn[],
  rows: string[][],
  tableOpts: { cellColor?: (rowIdx: number, colIdx: number) => string | undefined } = {},
): void => {
  const rowPad = 5;
  const drawRow = (
    cells: string[],
    opts: { header?: boolean; bg?: string; rowIndex?: number } = {},
  ): void => {
    const { header = false, bg, rowIndex = -1 } = opts;
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    let x = MARGIN;
    const heights = cells.map((cell, i) => (
      doc.heightOfString(cell, { width: columns[i].width - 2 * rowPad })
    ));
    const rowHeight = Math.max(...heights, 12) + rowPad * 2;
    ensureSpace(doc, rowHeight);
    const top = doc.y;

    if (bg) {
      doc.rect(MARGIN, top, CONTENT_WIDTH, rowHeight).fill(bg);
    }
    doc.strokeColor("#cccccc").lineWidth(0.5).rect(MARGIN, top, CONTENT_WIDTH, rowHeight).stroke();

    x = MARGIN;
    cells.forEach((cell, i) => {
      const col = columns[i];
      const color = header ? "#ffffff" : (tableOpts.cellColor?.(rowIndex, i) ?? "#000000");
      doc.fillColor(color).font(header || color !== "#000000" ? "Helvetica-Bold" : "Helvetica").fontSize(9)
        .text(cell, x + rowPad, top + rowPad, { width: col.width - 2 * rowPad, align: col.align ?? "left" });
      // internal vertical gridlines
      if (i > 0) {
        doc.moveTo(x, top).lineTo(x, top + rowHeight).strokeColor("#cccccc").lineWidth(0.5)
          .stroke();
      }
      x += col.width;
    });
    doc.y = top + rowHeight;
    // Same reason as drawKeyValueTable's version of this line: the last cell's explicit-x
    // `.text()` call above leaves `doc.x` parked at that cell's x instead of the page margin,
    // and every unqualified `.text()` call after this table (the "Flag values" footnote,
    // "3. Parameter Analysis" and its paragraphs, and — after the Data Quality table — the
    // Recommendations section) would otherwise flow from there: squeezed into whatever sliver
    // of page width remains between that x and the right margin.
    doc.x = MARGIN;
  };

  drawRow(columns.map((c) => c.header), { header: true, bg: "#2c3e50" });
  rows.forEach((row, i) => {
    drawRow(row, { bg: i % 2 === 1 ? "#f5f5f5" : undefined, rowIndex: i });
  });
};

const formatTs = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

/**
 * Sections 4-6 are numbered dynamically: Event Detection and Data Quality are each conditional
 * (Event Detection only prints if events were found, Data Quality only if metadata was
 * supplied), so whichever is skipped, the next section's number shifts down rather than leaving
 * a gap or printing a number that no longer matches (the bug this replaced -- a hardcoded
 * "see Section 6" reference in narrative.ts went stale exactly this way; see narrative.ts).
 * Pulled out as its own pure function so the numbering logic is unit-testable without rendering
 * and parsing an actual PDF.
 */
export interface SectionNumbers {
  eventDetection?: number;
  dataQuality?: number;
  recommendations: number;
}

export const resolveSectionNumbers = (
  report: Pick<ReportInput, "events" | "dataQuality">,
): SectionNumbers => {
  let sectionNum = 4;
  const result: SectionNumbers = { recommendations: 4 };
  if (report.events.length > 0) {
    result.eventDetection = sectionNum;
    sectionNum += 1;
  }
  if (report.dataQuality) {
    result.dataQuality = sectionNum;
    sectionNum += 1;
  }
  result.recommendations = sectionNum;
  return result;
};

export interface RenderPdfOptions {
  probeAccuracy: (key: string, reading: number) => number;
  status: ReportStatus;
}

export const buildReportPdf = (
  report: ReportInput,
  narrative: NarrativeSections,
  { probeAccuracy, status }: RenderPdfOptions,
): PDFKit.PDFDocument => {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: {
      top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN,
    },
    info: { Title: `Water Quality Report — ${report.site.siteName}` },
    bufferPages: true,
  });

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#000000").text("Water Quality Report");
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(11).fillColor("#333333").text(
    `${report.site.siteName}  Reporting Period: ${report.site.startDate} to ${report.site.endDate}`,
  );
  doc.moveDown(0.5);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).strokeColor("#333333").lineWidth(1)
    .stroke();
  doc.moveDown(0.4);

  drawKeyValueTable(doc, [
    { label: "Coordinates", value: coordinatesStr(report.site) },
    // The provenance travels with the value: this one field selects the whole baseline table
    // (referenceRanges.ts), so "Freshwater" sourced from a deployment default is a materially
    // weaker claim than "Marine" read off the device registry.
    {
      label: "Water Body Type",
      value: report.site.waterBodyTypeSource === "default"
        ? `${report.site.waterBodyType} (deployment default — registry did not specify)`
        : `${report.site.waterBodyType} (from device registry)`,
    },
    { label: "Client / Contract", value: report.site.clientName },
    { label: "Report Date", value: report.site.reportDate },
    { label: "Prepared By", value: "Clean Earth Rovers" },
    { label: "Status", value: status, color: STATUS_COLORS[status] },
  ]);

  doc.moveDown(0.3);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).strokeColor("#333333").lineWidth(1)
    .stroke();
  doc.moveDown(0.6);

  // 1. Summary
  sectionHeader(doc, "1. Summary");
  doc.font("Helvetica").fontSize(10).fillColor("#000000");
  doc.list(narrative.summaryBullets, MARGIN + 4, doc.y, {
    width: CONTENT_WIDTH - 4,
    bulletRadius: 2,
    textIndent: 10,
  });
  doc.moveDown(0.4);

  // 2. Parameter Data
  sectionHeader(doc, "2. Parameter Data");
  const paramColumns: GridColumn[] = [
    { header: "Parameter", width: 130 },
    { header: "Site Baseline", width: 90, align: "center" },
    { header: "Min", width: 52, align: "center" },
    { header: "Max", width: 52, align: "center" },
    { header: "Mean", width: 52, align: "center" },
    { header: "Median", width: 55, align: "center" },
    { header: "Flag", width: 73, align: "center" },
  ];
  const paramFlags = report.parameters.map((p) => flagFor(p, probeAccuracy));
  const paramRows = report.parameters.map((p, i) => {
    const b = p.baseline;
    return [
      b.label,
      b.hasFixedBaseline ? `${b.baselineMin}-${b.baselineMax}` : "Not established (site-specific)",
      p.min.toFixed(2),
      p.max.toFixed(2),
      p.mean.toFixed(2),
      p.median.toFixed(2),
      paramFlags[i],
    ];
  });
  drawGridTable(doc, paramColumns, paramRows, {
    cellColor: (rowIdx, colIdx) => (
      colIdx === 6 && rowIdx >= 0 ? FLAG_COLORS[paramFlags[rowIdx]] : undefined
    ),
  });
  doc.moveDown(0.15);
  doc.font("Helvetica").fontSize(8).fillColor("#777777").text(
    "Flag values: Normal, Elevated, Low, or Exceedance relative to the site baseline.",
    { width: CONTENT_WIDTH },
  );

  // 3. Parameter Analysis
  sectionHeader(doc, "3. Parameter Analysis");
  if (narrative.parameterAnalysis.size > 0) {
    [...narrative.parameterAnalysis].forEach(([label, text]) => {
      bodyText(doc, `${label} — ${text}`);
      doc.moveDown(0.25);
    });
  } else {
    bodyText(doc, "All parameters held steady within the site baseline.");
  }

  // Sections 4-6 are numbered dynamically -- see resolveSectionNumbers above.
  const sectionNumbers = resolveSectionNumbers(report);

  // 4. Event Detection (conditional)
  if (report.events.length > 0) {
    sectionHeader(doc, `${sectionNumbers.eventDetection}. Event Detection`);
    report.events.forEach((e: WQEvent, i: number) => {
      ensureSpace(doc, 20);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(`Event ${i + 1}`);
      bodyText(doc, `Type: ${e.type}`);
      bodyText(doc, `Window: ${formatTs(e.windowStartMs)} to ${formatTs(e.windowEndMs)}`);
      bodyText(doc, `Severity: ${e.severity}`);
      doc.moveDown(0.15);
      bodyText(doc, `Parameter movements: ${e.parameterMovements}`);
      doc.moveDown(0.15);
      bodyText(doc, `Interpretation: ${e.interpretation}`);
      doc.moveDown(0.15);
      bodyText(doc, `Follow-up: ${e.followUp}`);
      doc.moveDown(0.5);
    });
  }

  // 5. Data Quality (conditional)
  if (report.dataQuality) {
    const dq = report.dataQuality;
    sectionHeader(doc, `${sectionNumbers.dataQuality}. Data Quality`);
    drawGridTable(
      doc,
      [
        { header: "Check", width: 115 },
        { header: "Result", width: 65 },
        { header: "Notes", width: CONTENT_WIDTH - 115 - 65 },
      ],
      [
        ["Data completeness", `${dq.completenessPct.toFixed(1)}%`, dq.completenessNotes],
        // An unset status means the check did not run. Printing NOT_ASSESSED rather than a
        // default result keeps the table from claiming a clean bill of health nothing verified.
        ["Calibration status", dq.calibrationStatus ?? NOT_ASSESSED, dq.calibrationNotes],
        ["Drift indicators", dq.driftStatus ?? NOT_ASSESSED, dq.driftNotes],
        ["Biofouling indicators", dq.biofoulingStatus ?? NOT_ASSESSED, dq.biofoulingNotes],
        ["Sensor agreement", dq.sensorAgreementStatus ?? NOT_ASSESSED, dq.sensorAgreementNotes],
      ],
    );
  }

  // 6. Recommendations
  sectionHeader(doc, `${sectionNumbers.recommendations}. Recommendations`);
  bodyText(doc, `Operational: ${narrative.recommendationsOperational}`);
  doc.moveDown(0.15);
  bodyText(doc, `Investigative: ${narrative.recommendationsInvestigative}`);
  doc.moveDown(0.15);
  bodyText(doc, `Stakeholder: ${narrative.recommendationsStakeholder}`);

  return doc;
};

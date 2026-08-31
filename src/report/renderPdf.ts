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
  ReportInput, WQEvent, Flag, ReportStatus, ParameterStats, Severity,
} from "./types";
import {
  coordinatesStr, flagFor, isRelativeIndex, outOfRangeShare, statValue,
} from "./types";
import { clarityBandFor, TURBIDITY_NO_BASELINE_TEXT } from "./referenceRanges";
import type { NarrativeSections } from "./narrative";

const STATUS_COLORS: Record<ReportStatus, string> = {
  Normal: "#1a7f37",
  Watch: "#b35900",
  "Action Required": "#c0392b",
};
/** Severity's own scale, kept apart from FLAG_COLORS: a Moderate event and an Elevated
 * parameter are different claims and should not borrow each other's colour by accident. */
const SEVERITY_COLORS: Record<Severity, string> = {
  Low: "#4a5a6a",
  Moderate: "#b35900",
  High: "#c0392b",
};
const FLAG_COLORS: Record<Flag, string> = {
  Normal: "#1a7f37",
  Elevated: "#b35900",
  Low: "#b35900",
  Exceedance: "#c0392b",
  "N/A": "#777777",
  // Deliberately outside the green/amber/red verdict palette. A clarity band is an observation,
  // not a pass/fail, and colouring "Very turbid" red would smuggle back exactly the exceedance
  // claim this row exists to avoid -- against a range that does not exist. One neutral slate for
  // all four bands; the band's own wording carries the severity.
  Qualitative: "#4a5a6a",
};

/**
 * What goes in the Flag column. For a relative-index parameter that is the clarity band, derived
 * from the period mean -- the same value the row's Mean column prints, so a reader can see where
 * the band came from without a second lookup. Exported for `reportRenderPdf.test.ts`, since the
 * rendered PDF's text cannot be extracted under Jest (see the test file's docstring).
 */
export const flagCellText = (
  p: ParameterStats,
  probeAccuracy: (key: string, reading: number) => number,
): string => (
  isRelativeIndex(p.baseline) ? clarityBandFor(p.mean) : flagFor(p, probeAccuracy)
);

/** Printed for a Data Quality check that has no detector in this pipeline (see types.ts). */
const NOT_ASSESSED = "Not assessed";

export const MARGIN = 54; // 0.75in
const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** One dark ink and one accent, used for every heading, rule and table header. */
const INK = "#1f3a4d";
const ACCENT = "#2f7d8c";
const MUTED = "#6b7780";
const HAIRLINE = "#dfe4e8";
const BAND_FILL = "#e6f0ea"; // the in-baseline band behind a sparkline
/** Right-hand strip a sparkline leaves free for its high/low labels. */
const AXIS_GUTTER = 34;
const HEADER_HEIGHT = 96;

/** Pill background for the cover status and for each parameter card's flag. */
const drawPill = (
  doc: PDFKit.PDFDocument,
  text: string,
  opts: { right: number; top: number; color: string; size?: number },
): void => {
  const size = opts.size ?? 10;
  doc.font("Helvetica-Bold").fontSize(size);
  const width = doc.widthOfString(text) + size * 2;
  const height = size * 2;
  doc.roundedRect(opts.right - width, opts.top, width, height, height / 2).fill(opts.color);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(size)
    .text(text, opts.right - width, opts.top + height / 2 - size * 0.62, {
      width,
      align: "center",
      lineBreak: false,
    });
  doc.x = MARGIN;
};

const ensureSpace = (doc: PDFKit.PDFDocument, height: number): void => {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + height > bottom) {
    doc.addPage();
  }
};

const sectionHeader = (doc: PDFKit.PDFDocument, text: string): void => {
  ensureSpace(doc, 34);
  doc.moveDown(0.7);
  const top = doc.y;
  // A short accent bar rather than a heavier font: it separates sections at a glance without
  // making every heading shout, and it survives the greyscale printing these get in the field.
  doc.rect(MARGIN, top + 2.5, 3, 12).fill(ACCENT);
  doc.font("Helvetica-Bold").fontSize(12.5).fillColor(INK)
    .text(text, MARGIN + 10, top, { width: CONTENT_WIDTH - 10 });
  // Same cursor-parking hazard drawKeyValueTable documents: an explicit-x .text() leaves doc.x
  // there, and the next unqualified paragraph would flow from the indent.
  doc.x = MARGIN;
  doc.moveDown(0.35);
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
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
    const labelHeight = doc.heightOfString(row.label, { width: labelWidth });
    doc.font(row.color ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(row.color ?? "#000000");
    const valueHeight = doc.heightOfString(row.value, { width: valueWidth });
    const rowHeight = Math.max(labelHeight, valueHeight) + 12;
    ensureSpace(doc, rowHeight);

    const top = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED)
      .text(row.label, MARGIN, top + 6, { width: labelWidth });
    doc.font(row.color ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(row.color ?? "#000000")
      .text(row.value, MARGIN + labelWidth, top + 6, { width: valueWidth });
    doc.y = top + rowHeight;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y)
      .strokeColor(HAIRLINE).lineWidth(0.5)
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
  align?: "left" | "center" | "right";
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
    doc.strokeColor(HAIRLINE).lineWidth(0.5).rect(MARGIN, top, CONTENT_WIDTH, rowHeight).stroke();

    x = MARGIN;
    cells.forEach((cell, i) => {
      const col = columns[i];
      const color = header ? "#ffffff" : (tableOpts.cellColor?.(rowIndex, i) ?? "#000000");
      doc.fillColor(color).font(header || color !== "#000000" ? "Helvetica-Bold" : "Helvetica").fontSize(9)
        .text(cell, x + rowPad, top + rowPad, { width: col.width - 2 * rowPad, align: col.align ?? "left" });
      // internal vertical gridlines
      if (i > 0) {
        doc.moveTo(x, top).lineTo(x, top + rowHeight).strokeColor(HAIRLINE).lineWidth(0.5)
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

  drawRow(columns.map((c) => c.header), { header: true, bg: INK });
  rows.forEach((row, i) => {
    drawRow(row, { bg: i % 2 === 1 ? "#f4f7f8" : undefined, rowIndex: i });
  });
};

/**
 * A sparkline of one parameter's series, with its in-baseline band shaded behind the line and
 * the period's high and low marked.
 *
 * This is the one thing the numbers alone cannot say: whether a flagged parameter drifted for
 * weeks or spiked once. Section 2's Min/Max make those two identical, and the flag column made
 * them identical too until `outOfRangeShare` landed -- the chart is the version a reader takes
 * in without arithmetic.
 *
 * Draws nothing (and reports so) for a parameter with fewer than two series points: the report
 * renders happily without a chart, and a one-point "trend" would be a fabricated line. The
 * points are `buildReportInput`'s bucket means, so the line is bucket-resolution, not
 * reading-resolution -- Section 3's caption says so once rather than on every chart.
 *
 * Exported for `reportRenderPdf.test.ts`, which cannot read text out of a rendered PDF and so
 * pins the guard (`false` for a seriesless parameter) directly.
 */
export const drawSparkline = (
  doc: PDFKit.PDFDocument,
  p: ParameterStats,
  box: { x: number; y: number; width: number; height: number },
): boolean => {
  const points = [...(p.series ?? [])].sort((a, b) => a[0] - b[0]);
  if (points.length < 2) {
    return false;
  }
  const b = p.baseline;
  const banded = b.hasFixedBaseline && !isRelativeIndex(b);
  const values = points.map(([, v]) => v);
  const lo = Math.min(...values, banded ? b.baselineMin : Infinity);
  const hi = Math.max(...values, banded ? b.baselineMax : -Infinity);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.1;
  const yLo = lo - pad;
  const ySpan = (hi + pad) - yLo || 1;
  const t0 = points[0][0];
  const tSpan = points[points.length - 1][0] - t0 || 1;
  const px = (t: number): number => box.x + ((t - t0) / tSpan) * box.width;
  const py = (v: number): number => box.y + box.height - ((v - yLo) / ySpan) * box.height;
  const clamp = (v: number): number => Math.min(box.y + box.height, Math.max(box.y, v));

  doc.save();
  doc.rect(box.x, box.y, box.width, box.height).fill("#fafbfc");
  if (banded) {
    const bandTop = clamp(py(b.baselineMax));
    const bandBottom = clamp(py(b.baselineMin));
    doc.rect(box.x, bandTop, box.width, Math.max(bandBottom - bandTop, 0.75)).fill(BAND_FILL);
  }
  doc.strokeColor(HAIRLINE).lineWidth(0.5).rect(box.x, box.y, box.width, box.height).stroke();

  doc.strokeColor(INK).lineWidth(0.9);
  points.forEach(([t, v], i) => {
    const X = px(t);
    const Y = clamp(py(v));
    if (i === 0) {
      doc.moveTo(X, Y);
    } else {
      doc.lineTo(X, Y);
    }
  });
  doc.stroke();

  // High and low of the plotted series, not of the period: these mark the line the reader can
  // see, and Section 2 already carries the exact period extremes.
  const hiPoint = points.reduce((a, c) => (c[1] > a[1] ? c : a));
  const loPoint = points.reduce((a, c) => (c[1] < a[1] ? c : a));
  doc.circle(px(hiPoint[0]), clamp(py(hiPoint[1])), 1.9).fill("#c0392b");
  doc.circle(px(loPoint[0]), clamp(py(loPoint[1])), 1.9).fill(ACCENT);

  // The plotted high and low, printed in the gutter to the right of the plot. Without them the
  // line has no scale at all and two charts of very different magnitude look the same shape.
  // These are bucket-mean extremes, which is why they can differ from Section 2's Min/Max --
  // the section caption says the charts are bucket means.
  doc.font("Helvetica").fontSize(6.5).fillColor(MUTED)
    .text(statValue(hiPoint[1]), box.x + box.width + 4, box.y + 1, {
      width: AXIS_GUTTER - 6, lineBreak: false,
    })
    .text(statValue(loPoint[1]), box.x + box.width + 4, box.y + box.height - 8, {
      width: AXIS_GUTTER - 6, lineBreak: false,
    });
  doc.restore();
  // Every text and path call above moved the cursor; the caller lays out around `box`, so hand
  // it back exactly where it was rather than wherever the last axis label landed.
  doc.x = MARGIN;
  doc.y = box.y;
  return true;
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

/**
 * Site, period and "Page n of m" along the bottom of every page.
 *
 * Runs last, over `bufferedPages`, because the page count is not known until the content is
 * laid out. The bottom margin is dropped to zero for the duration: pdfkit adds a page whenever
 * a `.text()` call would cross the bottom margin, so writing into the footer strip would
 * otherwise append a blank page per page, forever.
 */
const drawFooters = (doc: PDFKit.PDFDocument, report: ReportInput): void => {
  const range = doc.bufferedPageRange();
  const marginBottom = doc.page.margins.bottom;
  const y = PAGE_HEIGHT - 36;
  const half = CONTENT_WIDTH / 2;
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.moveTo(MARGIN, y - 9).lineTo(MARGIN + CONTENT_WIDTH, y - 9)
      .strokeColor(HAIRLINE).lineWidth(0.5)
      .stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text(
        `${report.site.siteName} · ${report.site.startDate} to ${report.site.endDate}`,
        MARGIN,
        y,
        { width: half, lineBreak: false },
      )
      .text(`Page ${i + 1} of ${range.count}`, MARGIN + half, y, {
        width: half, align: "right", lineBreak: false,
      });
    doc.page.margins.bottom = marginBottom;
  }
  doc.x = MARGIN;
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

  // Full-bleed masthead. The status is a pill up here rather than the last row of the metadata
  // table: it is the one thing a reader looks for first, and it was previously the least
  // prominent line on the page.
  doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT).fill(INK);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(21)
    .text("Water Quality Report", MARGIN, 30, { width: CONTENT_WIDTH - 150 });
  doc.font("Helvetica").fontSize(10.5).fillColor("#b9c8d2")
    .text(
      `${report.site.siteName} · ${report.site.startDate} to ${report.site.endDate}`,
      MARGIN,
      60,
      { width: CONTENT_WIDTH - 150 },
    );
  drawPill(doc, status, {
    right: PAGE_WIDTH - MARGIN, top: 36, color: STATUS_COLORS[status], size: 10,
  });
  doc.x = MARGIN;
  doc.y = HEADER_HEIGHT + 16;

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
  ]);

  doc.moveDown(0.4);

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
  // Numeric columns are right-aligned so decimal points line up: centered, "68425.00" and
  // "550.35" in the same column read as unrelated magnitudes.
  const paramColumns: GridColumn[] = [
    { header: "Parameter", width: 120 },
    { header: "Site Baseline", width: 74, align: "center" },
    { header: "Min", width: 44, align: "right" },
    { header: "Max", width: 48, align: "right" },
    { header: "Mean", width: 48, align: "right" },
    { header: "Median", width: 48, align: "right" },
    { header: "Out of range", width: 50, align: "center" },
    // Wide enough for "Exceedance" on one line: the word wrapping mid-column was the first
    // thing the eye caught in a table whose whole job is to be scanned.
    { header: "Flag", width: 72, align: "center" },
  ];
  const paramFlags = report.parameters.map((p) => flagFor(p, probeAccuracy));
  const paramCells = report.parameters.map((p) => flagCellText(p, probeAccuracy));
  const paramRows = report.parameters.map((p, i) => {
    const b = p.baseline;
    const baselineText = (() => {
      if (b.hasFixedBaseline) {
        return `${b.baselineMin}-${b.baselineMax}`;
      }
      // "Not established (site-specific)" is temperature's story -- a range that could exist once
      // a deployment has one. Turbidity's is different and must not borrow that wording: there
      // is no operator turbidity range on any device, and the value is not on a calibrated
      // scale, so no site-specific range would help.
      return isRelativeIndex(b) ? TURBIDITY_NO_BASELINE_TEXT : "Not established (site-specific)";
    })();
    // A flag says only "this left the range at some point in 30 days". One bad reading in 1,382
    // and a month-long offset produce the same word. The share says which.
    const share = outOfRangeShare(p);
    return [
      b.label,
      baselineText,
      statValue(p.min),
      statValue(p.max),
      statValue(p.mean),
      statValue(p.median),
      share === null ? "—" : `${(share * 100).toFixed(0)}%`,
      paramCells[i],
    ];
  });
  drawGridTable(doc, paramColumns, paramRows, {
    cellColor: (rowIdx, colIdx) => (
      colIdx === 7 && rowIdx >= 0 ? FLAG_COLORS[paramFlags[rowIdx]] : undefined
    ),
  });
  doc.moveDown(0.15);
  const hasRelativeIndex = report.parameters.some((p) => isRelativeIndex(p.baseline));
  const clarityFootnote = hasRelativeIndex
    ? "  Turbidity is reported as a water-clarity band (Clear / Slightly turbid / Turbid / Very "
      + "turbid) from a provisional, uncalibrated relative index derived from a raw sensor "
      + "voltage. No operator turbidity range exists on any device, so it is never flagged in or "
      + "out of range; its Min/Max/Mean/Median are shown for period-to-period comparison only. A "
      + "reading of 0 is a real reading."
    : "";
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
    "Flag values: Normal, Elevated, Low, or Exceedance relative to the site baseline. Out of "
    + "range is the share of the period's series buckets whose average sat outside that "
    + "baseline — approximate, at bucket resolution, and shown because a flag alone cannot "
    + `separate a single stray reading from a sustained offset.${clarityFootnote}`,
    { width: CONTENT_WIDTH },
  );
  // Provenance, because the Site Baseline column mixes two sources of different authority: a
  // reviewed reference table that is the same for every pod in this water body type, and one
  // device's operator-entered thresholds. A reader deciding whether to act on a flag needs to
  // know which of the two produced it -- and, for the operator-set rows, that the range is
  // theirs to correct. Same reasoning as the "(from device registry)" tag on Water Body Type.
  const operatorSourced = report.parameters
    .filter((p) => p.baseline.baselineSource === "operator-threshold")
    .map((p) => p.baseline.label);
  if (operatorSourced.length > 0) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
      `Site Baseline for ${operatorSourced.join(", ")} is this device's operator-set threshold `
      + "from the device registry, not a fixed reference range. Every other baseline above comes "
      + `from the Water Quality Metrics source-of-truth table for ${report.site.waterBodyType} `
      + "water.",
      { width: CONTENT_WIDTH },
    );
  }

  // 3. Parameter Analysis — one card per parameter: heading, flag, chart, prose. The chart is
  // the section's reason for existing in this form; the same prose under a shared paragraph
  // stack made every parameter look alike.
  // The heading, its caption and the first card travel together: a section that opens with a
  // title and 90 points of blank page reads as a rendering fault.
  ensureSpace(doc, 150);
  sectionHeader(doc, "3. Parameter Analysis");
  if (narrative.parameterAnalysis.size > 0) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
      "Each chart plots the period's series bucket means, oldest to newest. The shaded band is "
      + "the site baseline where one exists; the dots mark the plotted high and low.",
      MARGIN,
      doc.y,
      { width: CONTENT_WIDTH },
    );
    doc.x = MARGIN;
    doc.moveDown(0.5);

    const byLabel = new Map(report.parameters.map((p) => [p.baseline.label, p]));
    [...narrative.parameterAnalysis].forEach(([label, text]) => {
      const p = byLabel.get(label);
      const chartHeight = p && p.series && p.series.length >= 2 ? 40 : 0;
      doc.font("Helvetica").fontSize(9.5);
      const textHeight = doc.heightOfString(text, { width: CONTENT_WIDTH });
      // Enough for the heading, the chart and the first two lines of prose -- the rest may flow
      // onto the next page. Requiring the whole card left a third of page one blank whenever a
      // long paragraph did not fit.
      ensureSpace(doc, Math.min(textHeight, 26) + chartHeight + 34);

      const top = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK)
        .text(label, MARGIN, top, { width: CONTENT_WIDTH - 130 });
      if (p) {
        drawPill(doc, flagCellText(p, probeAccuracy), {
          right: MARGIN + CONTENT_WIDTH,
          top: top - 2,
          color: FLAG_COLORS[flagFor(p, probeAccuracy)],
          size: 7,
        });
      }
      doc.x = MARGIN;
      doc.y = top + 16;

      if (p && chartHeight > 0) {
        drawSparkline(doc, p, {
          x: MARGIN, y: doc.y, width: CONTENT_WIDTH - AXIS_GUTTER, height: chartHeight,
        });
        doc.y += chartHeight + 6;
      }
      doc.font("Helvetica").fontSize(9.5).fillColor("#22282c")
        .text(text, MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.x = MARGIN;
      doc.moveDown(0.6);
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
      // Enough room for the heading, the window line and the first lines of the movements --
      // "Event 1" alone at the foot of a page is the split this prevents.
      ensureSpace(doc, 90);
      const top = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK)
        .text(`Event ${i + 1} — ${e.type}`, MARGIN, top, { width: CONTENT_WIDTH - 130 });
      drawPill(doc, e.severity, {
        right: MARGIN + CONTENT_WIDTH,
        top: top - 2,
        color: SEVERITY_COLORS[e.severity],
        size: 7,
      });
      doc.x = MARGIN;
      doc.y = top + 16;
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
        .text(
          `${formatTs(e.windowStartMs)} to ${formatTs(e.windowEndMs)}  ·  confidence `
          + `${Math.round(e.confidence * 100)}%`,
          MARGIN,
          doc.y,
          { width: CONTENT_WIDTH },
        );
      doc.x = MARGIN;
      doc.moveDown(0.35);
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

  drawFooters(doc, report);
  return doc;
};

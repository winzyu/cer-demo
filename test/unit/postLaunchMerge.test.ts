import PDFDocument from "pdfkit";
import { claimsReport, NOT_REGENERATED_ANSWER } from "../../src/report/delivery";
import { REPORT_OMIT_GROUPS, type ReportOmitGroup } from "../../src/report/omit";
import { buildReportPdf, flagCellText } from "../../src/report/renderPdf";
import { deterministicNarrative } from "../../src/report/narrative";
import type { ParameterBaseline, ParameterStats, ReportInput, ReportStatus } from "../../src/report/types";
import { guidance } from "../../src/catalogue";
import { ChatOrchestrator } from "../../src/services/ChatOrchestrator";
import type { LlmAnswer, LlmService } from "../../src/services/LlmService";
import type { ChatMessage } from "../../src/types/chat.types";
import type { ToolDefinition, ToolHandler } from "../../src/types/tool.types";

/**
 * Where `land/post-launch` joins two branches that were built apart: v2 flagging
 * (`task/sot-v2-flagging`: reading QC, the 3-in-a-row rule, v2 fallback limits) and report
 * editing (`task/report-omit`: the `omit` groups and the server-checked report claim).
 * Each branch's own suites pass; these cases cover what neither could test alone.
 *
 * `it.failing` marks a known cross-branch defect: the case passes while the defect is present
 * and fails once it is fixed, which is the signal to turn it into a plain `it`.
 */

const noFloor = (): number => 0;

/** Six half-hourly readings: three at `low`, then three at `high`. */
const held = (low: number, high: number): Array<[number, number]> => (
  [low, low, low, high, high, high].map((v, i): [number, number] => [i * 1_800_000, v])
);

const stats = (baseline: ParameterBaseline, low: number, high: number): ParameterStats => ({
  baseline,
  min: low,
  max: high,
  mean: (low + high) / 2,
  median: (low + high) / 2,
  pattern: "flat",
  readings: held(low, high),
});

const ph: ParameterBaseline = {
  key: "ph", label: "pH", unit: "", baselineMin: 6.5, baselineMax: 8.5,
  exceedanceMargin: 0.15, hasFixedBaseline: true, baselineSource: "operator-threshold",
};
const dissolvedOxygen: ParameterBaseline = {
  key: "dissolved_oxygen", label: "Dissolved Oxygen", unit: "mg/L", baselineMin: 6, baselineMax: 11,
  exceedanceMargin: 0.15, hasFixedBaseline: true, baselineSource: "v2-fallback",
};
const orp: ParameterBaseline = {
  key: "orp", label: "ORP", unit: "mV", baselineMin: 0, baselineMax: 0,
  exceedanceMargin: 0.15, hasFixedBaseline: false,
};
const turbidity: ParameterBaseline = {
  key: "turbidity", label: "Turbidity (Relative)", unit: "", baselineMin: 0, baselineMax: 0,
  exceedanceMargin: 0.15, hasFixedBaseline: false, scale: "relative-index",
};

/** Operator limit in range, v2 fallback with a sustained high run, no usable limit, all-zero turbidity. */
const mixed: ReportInput = {
  site: {
    siteName: "Merge Test Site",
    startDate: "2026-10-04",
    endDate: "2026-10-11",
    reportDate: "2026-10-11",
    waterBodyType: "Freshwater",
    clientName: "Not available",
  },
  parameters: [
    stats(ph, 7.0, 7.5),
    stats(dissolvedOxygen, 8.0, 13.0),
    stats(orp, 200, 260),
    { ...stats(turbidity, 0, 0), pattern: "unknown" },
  ],
  events: [],
  dataQuality: {
    completenessPct: 97,
    completenessNotes: "One gap over 3 hours.",
    calibrationStatus: "Pass",
    calibrationNotes: "Merge calibration note.",
    driftStatus: "None",
    driftNotes: "n/a",
    biofoulingStatus: "None",
    biofoulingNotes: "n/a",
    sensorAgreementStatus: "Pass",
    sensorAgreementNotes: "n/a",
  },
};

/** Every subset of the omit groups, in `REPORT_OMIT_GROUPS` order. */
const subsets: ReportOmitGroup[][] = Array.from(
  { length: 2 ** REPORT_OMIT_GROUPS.length },
  (_, mask) => REPORT_OMIT_GROUPS.filter((_, bit) => (mask >> bit) & 1),
);

/** Every string the PDF drew; PDF text cannot be extracted under Jest (see reportRenderPdf.test.ts). */
const drawnText = (report: ReportInput, status: ReportStatus, omit: ReportOmitGroup[]): string => {
  const text = jest.spyOn(PDFDocument.prototype, "text");
  try {
    const doc = buildReportPdf(
      report,
      deterministicNarrative(report, noFloor, status, guidance, omit),
      { noiseFloor: noFloor, status, omit },
    );
    doc.resume();
    doc.end();
    return text.mock.calls.map(([value]) => String(value)).join(" \n ");
  } finally {
    text.mockRestore();
  }
};

describe("omit never changes a v2 verdict", () => {
  it("the fixture exercises a raised flag, a pass and a Not assessed row", () => {
    const cells = mixed.parameters.slice(0, 3).map((p) => flagCellText(p, noFloor));
    expect(cells[0]).toBe("Normal");
    expect(cells[1]).not.toBe("Normal");
    expect(cells[2]).toBe("Not assessed");
  });

  it.each(subsets.map((omit) => [omit.join("+") || "(none)", omit] as const))(
    "numeric flag cells are identical with omit %s",
    (_label, omit) => {
      for (const p of mixed.parameters.filter((q) => q.baseline.scale !== "relative-index")) {
        expect(flagCellText(p, noFloor, omit)).toBe(flagCellText(p, noFloor));
      }
    },
  );

  it("two readings beyond the limit stay Normal under every omit subset (3-in-a-row rule)", () => {
    const twoHigh: ParameterStats = {
      ...stats(ph, 7.0, 9.4),
      readings: [7.0, 7.0, 7.0, 7.0, 9.4, 9.4].map((v, i): [number, number] => [i * 1_800_000, v]),
    };
    for (const omit of subsets) {
      expect(flagCellText(twoHigh, noFloor, omit)).toBe("Normal");
    }
  });
});

describe("omit on a v2-flagged PDF", () => {
  it.each(subsets.map((omit) => [omit.join("+") || "(none)", omit] as const))(
    "renders with omit %s, keeping numbers, statuses and an accurate Omitted row",
    (_label, omit) => {
      const text = drawnText(mixed, "Action Required", omit);
      expect(text).toContain("6.5-8.5");
      expect(text).toContain("6-11");
      expect(text).toContain("Not assessed");
      expect(text).toContain("Action Required");
      if (omit.length === 0) {
        expect(text).not.toContain("Omitted");
      } else {
        expect(text).toContain("(at the requester's request)");
      }
      expect(/\d\. Data Quality/.test(text)).toBe(!omit.includes("data_quality"));
      expect(text.includes("operator-configured threshold from the device registry"))
        .toBe(!omit.includes("threshold_notes"));
      expect(text.includes("(all zero)")).toBe(!omit.includes("sensor_fault_notes"));
    },
  );

  it("still tells a reader a fallback limit is generic when threshold notes are left out", () => {
    // timeline.md 2026-10-10: the reader must be able to tell a fallback from a site limit.
    // The parameter prose carries that, so it has to survive `threshold_notes`.
    const narrative = deterministicNarrative(mixed, noFloor, "Action Required", guidance, ["threshold_notes"]);
    expect(narrative.parameterAnalysis.get("Dissolved Oxygen")).toContain("generic fallback");
  });

  it.todo("decide whether threshold_notes also drops the v2 'generic fallback' footnote and the Not assessed footnote");
});

describe("report-claim check against v2 QC wording", () => {
  it.each([
    "Done: the turbidity notes are left out of this copy.",
    "Use the Download report button for the new version.",
  ])("still catches a real delivery claim: %s", (sentence) => {
    expect(claimsReport(sentence)).toBe(true);
  });

  // A chat answer explaining reading QC (readingQc.ts) uses the same verbs as an omit delivery.
  it.failing.each([
    "Two flat-line readings were excluded from the report period's average.",
    "Spike readings are removed before the report's verdicts are worked out.",
    "Readings flagged by the probe were omitted from this report.",
  ])("does not read a QC explanation as a delivery claim: %s", (sentence) => {
    expect(claimsReport(sentence)).toBe(false);
  });
});

describe("orchestrator: a QC explanation in a chat with no report", () => {
  const definition = (name: string): ToolDefinition => ({
    type: "function",
    function: { name, description: name, parameters: { type: "object", properties: {}, required: [] } },
  });
  const answer = (overrides: Partial<LlmAnswer>): LlmAnswer => ({
    content: "",
    model: "test-model",
    toolCalls: [],
    usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
    ...overrides,
  });
  const qcAnswer = answer({
    content: "Dissolved oxygen is within range. Two flat-line readings were excluded from the "
      + "report period's average, so no flag was raised.",
  });
  const scripted = (script: LlmAnswer[]) => {
    const forced: Array<string | undefined> = [];
    let i = 0;
    const llm = {
      complete: async (_m: ChatMessage[], _t?: ToolDefinition[], forceTool?: string) => {
        forced.push(forceTool);
        const next = script[Math.min(i, script.length - 1)];
        i += 1;
        return next;
      },
    } as unknown as LlmService;
    return { llm, forced };
  };
  const tools = (report: jest.Mock): ToolHandler[] => [
    { definition: definition("query_sensor_data"), run: async () => ({ verdicts: {} }) },
    { definition: definition("generate_report"), run: report },
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: "system prompt" },
    { role: "user", content: "Is the dissolved oxygen OK this week?" },
  ];

  it.failing("answers without forcing generate_report", async () => {
    const report = jest.fn(async () => ({ error: "not requested" }));
    const { llm, forced } = scripted([qcAnswer, qcAnswer]);

    const result = await new ChatOrchestrator(llm, tools(report)).run(messages);

    expect(forced.every((tool) => tool === undefined)).toBe(true);
    expect(report).not.toHaveBeenCalled();
    expect(result.content).toBe(qcAnswer.content);
  });

  it("today: the answer is replaced when the forced report is not made (documents the defect)", async () => {
    const report = jest.fn(async () => ({ error: "not requested" }));
    const { llm } = scripted([qcAnswer, qcAnswer]);

    const result = await new ChatOrchestrator(llm, tools(report)).run(messages);

    expect(result.reportRetried).toBe(true);
    expect(result.content).toBe(NOT_REGENERATED_ANSWER);
  });
});

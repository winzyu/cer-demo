import { deterministicNarrative } from "../../src/report/narrative";
import type {
  ParameterBaseline, ParameterStats, ReportInput, SiteMetadata, WQEvent,
} from "../../src/report/types";

/**
 * narrative.ts is the rule-based (zero-AI-call) prose writer. Covers the two user-requested
 * fixes carried into this port -- summary as discrete bullets rather than one paragraph, and no
 * hardcoded section-number reference now that section numbering is dynamic (renderPdf.ts) -- plus
 * the new N/A branch for temperature's no-fixed-baseline case.
 */

const noAccuracy = (): number => 0;

const fixedBaseline = (
  key: string, label: string, unit: string, min: number, max: number,
): ParameterBaseline => ({
  key, label, unit, baselineMin: min, baselineMax: max, exceedanceMargin: 0.15, hasFixedBaseline: true,
});

const noFixedBaseline = (key: string, label: string, unit: string): ParameterBaseline => ({
  key, label, unit, baselineMin: 0, baselineMax: 0, exceedanceMargin: 0.15, hasFixedBaseline: false,
});

const param = (baseline: ParameterBaseline, overrides: Partial<ParameterStats> = {}): ParameterStats => ({
  baseline,
  min: (baseline.baselineMin + baseline.baselineMax) / 2 - 0.1,
  max: (baseline.baselineMin + baseline.baselineMax) / 2 + 0.1,
  mean: (baseline.baselineMin + baseline.baselineMax) / 2,
  median: (baseline.baselineMin + baseline.baselineMax) / 2,
  pattern: "unknown",
  ...overrides,
});

const report = (parameters: ParameterStats[], events: WQEvent[] = []): ReportInput => ({
  site: {
    siteName: "Test Site", startDate: "2026-08-01", endDate: "2026-08-08", reportDate: "2026-08-09",
    waterBodyType: "Freshwater", clientName: "Not available",
  } as SiteMetadata,
  parameters,
  events,
});

describe("deterministicNarrative — summary is a bulleted list", () => {
  it("returns an array of discrete bullet strings, not one paragraph", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5));
    const { summaryBullets } = deterministicNarrative(report([ph]), noAccuracy, "Normal");

    expect(Array.isArray(summaryBullets)).toBe(true);
    expect(summaryBullets.length).toBeGreaterThan(1);
    summaryBullets.forEach((b) => expect(typeof b).toBe("string"));
  });

  it("states the all-clear plainly when status is Normal and no events fired", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5));
    const { summaryBullets } = deterministicNarrative(report([ph]), noAccuracy, "Normal");

    expect(summaryBullets[0]).toContain("Overall status: Normal");
    expect(summaryBullets.join(" ")).toContain("continue routine monitoring");
  });

  it("names the flagged parameters and event count when status is not Normal", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 }); // clears the exceedance margin
    const events: WQEvent[] = [{
      type: "Inconclusive", windowStartMs: 0, windowEndMs: 1, severity: "Low",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.2,
    }];
    const { summaryBullets } = deterministicNarrative(report([ph], events), noAccuracy, "Watch");

    expect(summaryBullets[0]).toContain("Overall status: Watch");
    // sentenceCase only touches the first character, so the label "pH" renders "PH" here --
    // that quirk is expected (see the ORP-acronym test below for why a full capitalize() isn't used).
    expect(summaryBullets[1]).toMatch(/^PH moved outside the site baseline/);
    expect(summaryBullets[2]).toContain("1 candidate event(s)");
  });

  it("never references a hardcoded section number, since numbering is dynamic in the PDF", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const { summaryBullets } = deterministicNarrative(report([ph]), noAccuracy, "Watch");
    const joined = summaryBullets.join(" ");

    expect(joined).not.toMatch(/[Ss]ection\s+\d/);
    expect(joined).toContain("Recommendations below");
  });
});

describe("deterministicNarrative — parameter analysis", () => {
  it("omits a parameter from the analysis map when it held steady", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" }); // Normal + flat -> held steady
    const { parameterAnalysis } = deterministicNarrative(report([ph]), noAccuracy, "Normal");
    expect(parameterAnalysis.has("pH")).toBe(false);
  });

  it("includes a parameter that moved outside baseline, with the excursion described", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0, pattern: "flat" });
    const { parameterAnalysis } = deterministicNarrative(report([ph]), noAccuracy, "Watch");
    expect(parameterAnalysis.has("pH")).toBe(true);
    expect(parameterAnalysis.get("pH")).toContain("baseline");
  });

  it("gives temperature its own N/A explanation instead of comparing it to a range", () => {
    const temp = param(noFixedBaseline("temperature", "Temperature (°F)", "°F"), { min: 60, max: 90, pattern: "unknown" });
    const { parameterAnalysis } = deterministicNarrative(report([temp]), noAccuracy, "Normal");

    // "unknown" pattern would normally count as held-steady-if-Normal, but N/A is not Normal,
    // so heldSteady is false and this parameter must still get a line.
    expect(parameterAnalysis.has("Temperature (°F)")).toBe(true);
    const text = parameterAnalysis.get("Temperature (°F)")!;
    expect(text).toContain("No fixed baseline exists");
    expect(text).not.toContain("site baseline.");
  });

  it("does not mangle interior acronyms the way a naive capitalize() would", () => {
    const orp = param(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), { pattern: "flat" });
    const { parameterAnalysis } = deterministicNarrative(report([orp]), noAccuracy, "Normal");
    // Held steady (Normal + flat) so nothing is in the map -- force a non-steady case instead.
    expect(parameterAnalysis.has("ORP (mV)")).toBe(false);

    const orpElevated = param(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), { max: 500, pattern: "flat" });
    const { parameterAnalysis: pa2 } = deterministicNarrative(report([orpElevated]), noAccuracy, "Watch");
    const text = pa2.get("ORP (mV)")!;
    expect(text).not.toContain("orp");
    expect(text[0]).toBe(text[0].toUpperCase());
  });
});

describe("deterministicNarrative — recommendations", () => {
  it("gives routine-only recommendations when nothing is flagged", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" });
    const { recommendationsOperational, recommendationsInvestigative, recommendationsStakeholder } = deterministicNarrative(
      report([ph]), noAccuracy, "Normal",
    );
    expect(recommendationsOperational).toContain("No action needed");
    expect(recommendationsInvestigative).toBe("None required this period.");
    expect(recommendationsStakeholder).toContain("Routine report distribution");
  });

  it("escalates the stakeholder recommendation to authorities only when a High-severity event fired", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const highEvent: WQEvent = {
      type: "Sewage", windowStartMs: 0, windowEndMs: 1, severity: "High",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.7,
    };
    const { recommendationsStakeholder } = deterministicNarrative(report([ph], [highEvent]), noAccuracy, "Action Required");
    expect(recommendationsStakeholder).toContain("relevant authority");
  });
});

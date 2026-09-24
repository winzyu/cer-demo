import {
  deterministicNarrative as narrate, NO_APPROVED_STEP, UNEXPLAINED_HEADING,
} from "../../src/report/narrative";
import type {
  ParameterBaseline, ParameterStats, ReportInput, ReportStatus, SiteMetadata, WaterBodyType, WQEvent,
} from "../../src/report/types";
import { catalogue, parseCatalogue, usableGuidance } from "../../src/catalogue";
import type { UsableGuidance } from "../../src/catalogue";
import { TURBIDITY_ALL_ZERO_CAVEAT } from "../../src/report/referenceRanges";

/**
 * narrative.ts is the rule-based (zero-AI-call) prose writer. Covers the two user-requested
 * fixes carried into this port -- summary as discrete bullets rather than one paragraph, and no
 * hardcoded section-number reference now that section numbering is dynamic (renderPdf.ts) -- plus
 * the N/A branch for a parameter with no baseline at all, and the provenance wording that
 * distinguishes a source-of-truth reference range from a device's operator-set threshold.
 */

const noAccuracy = (): number => 0;

/** No usable entries: what a deployment shows before the supervisor approves anything. */
const NO_GUIDANCE: UsableGuidance = { version: "test", entries: [], referrals: new Map() };

/** Every test outside the recommendations block is about wording the catalogue does not touch. */
const deterministicNarrative = (
  input: ReportInput,
  accuracy: (key: string, reading: number) => number,
  status: ReportStatus,
  guidance: UsableGuidance = NO_GUIDANCE,
) => narrate(input, accuracy, status, guidance);

const fixedBaseline = (
  key: string, label: string, unit: string, min: number, max: number,
): ParameterBaseline => ({
  key, label, unit, baselineMin: min, baselineMax: max, exceedanceMargin: 0.15, hasFixedBaseline: true,
});

const noFixedBaseline = (key: string, label: string, unit: string): ParameterBaseline => ({
  key, label, unit, baselineMin: 0, baselineMax: 0, exceedanceMargin: 0.15, hasFixedBaseline: false,
});

/** Turbidity as buildReportInput builds it -- no numeric baseline, uncalibrated relative scale. */
const relativeIndexBaseline = (): ParameterBaseline => ({
  key: "turbidity",
  label: "Turbidity (Relative)",
  unit: "",
  baselineMin: 0,
  baselineMax: 0,
  exceedanceMargin: 0.15,
  hasFixedBaseline: false,
  scale: "relative-index",
});

const HOUR = 3_600_000;
const BASE = Date.parse("2026-08-01T00:00:00.000Z");
/** A series whose values are given in order, one per hour. */
const hourly = (values: number[]): Array<[number, number]> => (
  values.map((v, i) => [BASE + i * HOUR, v])
);

const turbidityParam = (
  values: number[], overrides: Partial<ParameterStats> = {},
): ParameterStats => {
  const series = hourly(values);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    baseline: relativeIndexBaseline(),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    median: sorted[Math.floor(sorted.length / 2)],
    pattern: "unknown",
    series,
    ...overrides,
  };
};

const param = (baseline: ParameterBaseline, overrides: Partial<ParameterStats> = {}): ParameterStats => ({
  baseline,
  min: (baseline.baselineMin + baseline.baselineMax) / 2 - 0.1,
  max: (baseline.baselineMin + baseline.baselineMax) / 2 + 0.1,
  mean: (baseline.baselineMin + baseline.baselineMax) / 2,
  median: (baseline.baselineMin + baseline.baselineMax) / 2,
  pattern: "unknown",
  ...overrides,
});

const report = (
  parameters: ParameterStats[],
  events: WQEvent[] = [],
  waterBodyType: WaterBodyType = "Freshwater",
): ReportInput => ({
  site: {
    siteName: "Test Site", startDate: "2026-08-01", endDate: "2026-08-08", reportDate: "2026-08-09",
    waterBodyType, clientName: "Not available",
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

describe("deterministicNarrative — Not assessed status", () => {
  it("says plainly that nothing could be compared, rather than reading like a clean result", () => {
    const temp = param(noFixedBaseline("temperature", "Temperature (°F)", "°F"));
    const { summaryBullets } = deterministicNarrative(report([temp]), noAccuracy, "Not assessed");

    expect(summaryBullets[0]).toContain("Overall status: Not assessed");
    expect(summaryBullets.join(" ")).toContain("no usable registry thresholds");
    // Must not read as an all-clear -- the whole point of this status.
    expect(summaryBullets.join(" ").toLowerCase()).not.toContain("no action required");
  });

  it("still reports a turbidity clarity band under Not assessed -- it was measured, just never "
    + "judged against a baseline", () => {
    const temp = param(noFixedBaseline("temperature", "Temperature (°F)", "°F"));
    const turbidity = turbidityParam([10, 10, 10]);
    const { summaryBullets } = deterministicNarrative(
      report([temp, turbidity]), noAccuracy, "Not assessed",
    );

    expect(summaryBullets.join(" ")).toContain("Turbidity (Relative): Clear");
  });

  it("recommends setting operator thresholds rather than routine or escalation language", () => {
    const temp = param(noFixedBaseline("temperature", "Temperature (°F)", "°F"));
    const { recommendationsOperational, recommendationsStakeholder } = deterministicNarrative(
      report([temp]), noAccuracy, "Not assessed",
    );

    expect(recommendationsOperational).toContain("threshold");
    expect(recommendationsStakeholder).toContain("no usable registry thresholds");
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

  it("names BOTH excursion directions when a parameter left the range at each end", () => {
    // The Algalita Pod's dissolved oxygen: a 23.32 mg/L peak and a 1.72 mg/L trough in the same
    // 30 days. The old wording printed the peak only, dropping the near-hypoxic number a reader
    // would actually act on.
    const do_ = param(fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 5, 8), {
      min: 1.72, max: 23.32, mean: 8.78, median: 8.68, pattern: "unknown",
    });
    const text = deterministicNarrative(report([do_]), noAccuracy, "Action Required")
      .parameterAnalysis.get("Dissolved Oxygen (mg/L)")!;
    expect(text).toContain("above it to 23.32 mg/L");
    expect(text).toContain("below it to 1.72 mg/L");
  });

  it("reports how much of the period a parameter spent outside baseline", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), {
      min: 6.0, max: 8.0, series: hourly([6.0, 6.2, 7.0, 7.0]), pattern: "unknown",
    });
    const text = deterministicNarrative(report([ph]), noAccuracy, "Watch").parameterAnalysis.get("pH")!;
    expect(text).toContain("50% of the period");
  });

  it("prints no stray space around a value whose parameter has no unit", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0, pattern: "unknown" });
    const text = deterministicNarrative(report([ph]), noAccuracy, "Watch").parameterAnalysis.get("pH")!;
    expect(text).toContain("above it to 9.00,");
    expect(text).not.toMatch(/ {2}/);
  });

  it("gives temperature its own N/A explanation instead of comparing it to a range", () => {
    const temp = param(noFixedBaseline("temperature", "Temperature (°F)", "°F"), { min: 60, max: 90, pattern: "unknown" });
    const { parameterAnalysis } = deterministicNarrative(report([temp]), noAccuracy, "Normal");

    // "unknown" pattern would normally count as held-steady-if-Normal, but N/A is not Normal,
    // so heldSteady is false and this parameter must still get a line.
    expect(parameterAnalysis.has("Temperature (°F)")).toBe(true);
    const text = parameterAnalysis.get("Temperature (°F)")!;
    // Wording widened with the operator-threshold baseline: "no fixed baseline" was accurate
    // when the reference table was the only source, but N/A now means no baseline from EITHER
    // source -- the doc's table or this device's registry thresholds.
    expect(text).toContain("No baseline is established");
    expect(text).not.toContain("site baseline.");
    expect(text).not.toMatch(/\b0-0\b/); // the internal placeholder must never be printed
  });

  it("carries the baseline note onto the parameter line, so the reader is told why there is none", () => {
    const baseline = {
      ...noFixedBaseline("temperature", "Temperature (°F)", "°F"),
      baselineNote: "No operator thresholds are configured for this device.",
    };
    const temp = param(baseline, { min: 60, max: 90, pattern: "unknown" });
    const { parameterAnalysis } = deterministicNarrative(report([temp]), noAccuracy, "Normal");

    expect(parameterAnalysis.get("Temperature (°F)")).toContain("No operator thresholds are configured");
  });

  it("calls an operator-set range a device threshold, not a site baseline", () => {
    // The two sources carry different authority: one is a reviewed table identical for every pod
    // in the tier, the other is one operator's number. The sentence has to say which it used.
    const baseline: ParameterBaseline = {
      ...fixedBaseline("temperature", "Temperature (°F)", "°F", 50, 80),
      baselineSource: "operator-threshold",
    };
    // "irregular" rather than "flat": a Normal + flat parameter is held-steady and gets no
    // analysis line at all (see heldSteady).
    const temp = param(baseline, { min: 60, max: 70, pattern: "irregular" });
    const { parameterAnalysis } = deterministicNarrative(report([temp]), noAccuracy, "Normal");

    const text = parameterAnalysis.get("Temperature (°F)")!;
    expect(text).toContain("operator-set threshold for this device");
    expect(text).not.toContain("site baseline");
  });

  it("still calls a baseline with no operator-threshold source a site baseline", () => {
    // baselineSource is only ever "operator-threshold" now (the reference-table source was
    // vetoed in full, 2026-09-13) -- this pins the ternary's other branch, which stays reachable
    // for any row that somehow carries no source at all.
    const baseline: ParameterBaseline = fixedBaseline("ph", "pH", "", 7.8, 8.3);
    const { parameterAnalysis } = deterministicNarrative(
      report([param(baseline, { pattern: "irregular" })]), noAccuracy, "Normal",
    );

    expect(parameterAnalysis.get("pH")).toContain("site baseline");
  });

  it("gives turbidity a clarity band and supporting context, never an in/out-of-range verdict", () => {
    // mean 650 -> "Moderate" (operator band [345, 795)); the second half averages 200 above the
    // first, clearing the trend deadband (10% of the period mean) so the direction of change is
    // reported.
    const turbidity = turbidityParam([500, 550, 600, 700, 750, 800]);
    const { parameterAnalysis } = deterministicNarrative(report([turbidity]), noAccuracy, "Normal");

    expect(parameterAnalysis.has("Turbidity (Relative)")).toBe(true);
    const text = parameterAnalysis.get("Turbidity (Relative)")!;
    expect(text).toContain("Moderate");
    expect(text).toContain("relative index mean 650.0");
    expect(text).toContain("rising across the period"); // the legitimate relative claim
    expect(text).toContain("provisional, uncalibrated conversion");
    // The claims a report must never make about a turbidity value.
    expect(text).not.toContain("site baseline");
    expect(text).not.toContain("NTU");
    expect(text).not.toMatch(/[Ee]xceedance|[Ee]levated reading|outside the/);
  });

  it("bands all-zero turbidity as Clear but flags it as a possible missing sensor", () => {
    // The zeros are still reported, never dropped as missing data; the backend's 0 for a missing
    // voltage just cannot be ruled out when every reading is 0.
    const turbidity = turbidityParam([0, 0, 0, 0]);
    const { parameterAnalysis, summaryBullets } = deterministicNarrative(
      report([turbidity]), noAccuracy, "Normal",
    );

    const text = parameterAnalysis.get("Turbidity (Relative)")!;
    expect(text).toContain("Clear");
    expect(text).toContain("relative index mean 0.0");
    expect(text).toContain("held steady across the period");
    expect(text).toContain(TURBIDITY_ALL_ZERO_CAVEAT);
    expect(text).not.toMatch(/no data|not available/i);
    expect(summaryBullets.join(" ")).toContain("possibly a missing sensor");
  });

  it("does not flag a period with a lone 0 among real readings", () => {
    const turbidity = turbidityParam([0, 120, 140, 130]);
    const { parameterAnalysis, summaryBullets } = deterministicNarrative(
      report([turbidity]), noAccuracy, "Normal",
    );

    expect(parameterAnalysis.get("Turbidity (Relative)")!).not.toContain(TURBIDITY_ALL_ZERO_CAVEAT);
    expect(summaryBullets.join(" ")).not.toContain("missing sensor");
  });

  it("bands a reading in the thousands without inventing an exceedance", () => {
    const turbidity = turbidityParam([2_400, 2_200, 2_000, 1_800, 1_600, 1_400]); // mean 1900, falling
    const { parameterAnalysis } = deterministicNarrative(report([turbidity]), noAccuracy, "Normal");

    const text = parameterAnalysis.get("Turbidity (Relative)")!;
    expect(text).toContain("Turbid");
    expect(text).toContain("falling across the period");
    expect(text).not.toMatch(/[Ee]xceedance/);
  });

  it("names the bands a period spanned when min and max fall in different ones", () => {
    const turbidity = turbidityParam([0, 100, 900, 1_400]); // Clear -> Turbid
    const { parameterAnalysis } = deterministicNarrative(report([turbidity]), noAccuracy, "Normal");

    expect(parameterAnalysis.get("Turbidity (Relative)")!)
      .toContain("The period spanned clear to turbid conditions.");
  });

  it("appends the off-scale sentence to the analysis line when the mean is at or beyond 1005, "
    + "and omits it otherwise", () => {
    const offScale = turbidityParam([1_006, 1_006, 1_006]);
    const { parameterAnalysis: offScaleAnalysis } = deterministicNarrative(
      report([offScale]), noAccuracy, "Normal",
    );
    const offScaleText = offScaleAnalysis.get("Turbidity (Relative)")!;
    expect(offScaleText).toContain("beyond the top of the conversion's scale");
    expect(offScaleText).toContain("turbVolt");

    const onScale = turbidityParam([900, 900, 900]);
    const { parameterAnalysis: onScaleAnalysis } = deterministicNarrative(
      report([onScale]), noAccuracy, "Normal",
    );
    const onScaleText = onScaleAnalysis.get("Turbidity (Relative)")!;
    expect(onScaleText).not.toContain("beyond the top of the conversion's scale");
  });

  it("keeps turbidity out of the excursion list, however turbid, and gives it its own bullet", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const turbidity = turbidityParam([2_042, 2_042, 2_042]);
    const { summaryBullets } = deterministicNarrative(report([ph, turbidity]), noAccuracy, "Watch");

    // Only pH is named as having moved outside the site baseline.
    expect(summaryBullets[1]).toMatch(/^PH moved outside the site baseline/);
    expect(summaryBullets[1]).not.toContain("Turbidity");

    const clarity = summaryBullets.find((b) => b.startsWith("Turbidity (Relative):"))!;
    expect(clarity).toBeDefined();
    expect(clarity).toContain("Turbid");
    expect(clarity).toContain("no");
    expect(clarity).toContain("operator range");
  });

  it("appends the off-scale clause to its own summary bullet when the mean is off-scale, "
    + "and omits it otherwise", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" });
    const offScale = turbidityParam([1_006, 1_006, 1_006]);
    const { summaryBullets: offScaleBullets } = deterministicNarrative(
      report([ph, offScale]), noAccuracy, "Normal",
    );
    const offScaleClarity = offScaleBullets.find((b) => b.startsWith("Turbidity (Relative):"))!;
    expect(offScaleClarity).toContain("Off-scale");
    expect(offScaleClarity).toContain("turbVolt");

    const onScale = turbidityParam([10, 10, 10]);
    const { summaryBullets: onScaleBullets } = deterministicNarrative(
      report([ph, onScale]), noAccuracy, "Normal",
    );
    const onScaleClarity = onScaleBullets.find((b) => b.startsWith("Turbidity (Relative):"))!;
    expect(onScaleClarity).not.toContain("Off-scale");
  });

  it("still reports turbidity in the all-clear summary -- silence would read as unmeasured", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" });
    const turbidity = turbidityParam([10, 10, 10]);
    const { summaryBullets } = deterministicNarrative(report([ph, turbidity]), noAccuracy, "Normal");

    expect(summaryBullets[0]).toContain("Overall status: Normal");
    expect(summaryBullets.join(" ")).toContain("Turbidity (Relative): Clear");
    // The all-clear line no longer over-claims on behalf of parameters that have no baseline.
    expect(summaryBullets.join(" ")).not.toContain("All parameters held within the site baseline");
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

/**
 * A small catalogue built for these tests, so they check the selection rules rather than the
 * shipped wording, which changes with every supervisor review.
 */
const approved = { status: "approved", by: "Supervisor", date: "2026-09-20" };
const fixture = parseCatalogue({
  version: "fixture.1",
  sources: { test: "Test fixture" },
  referrals: [
    { id: "pro", service: "Professional review", review: approved },
    {
      id: "vendor", provider: "Vendor", service: "Cleanup", contact: "help@example.org", review: { status: "draft" },
    },
  ],
  entries: [
    {
      id: "sewage-explained", title: "Sewage explained", kind: "explanation",
      text: "Consistent with sewage.", appliesTo: { triggers: ["Sewage"], water: ["marine"], minConfidence: 0.7, conditions: "c" },
      requiredEvidence: "e", limitations: "Source unconfirmed.", sources: ["test 1"], review: approved,
    },
    {
      id: "sewage-limit", title: "Sewage limit", kind: "limitation",
      text: "Bacteria are not measured.", appliesTo: { triggers: ["Sewage"], conditions: "c" },
      requiredEvidence: "e", limitations: "l", sources: ["test 1"], review: approved,
    },
    {
      id: "sewage-test", title: "Test for bacteria", kind: "next-step", slot: "investigative",
      text: "Test for bacteria.", appliesTo: { triggers: ["Sewage"], conditions: "c" },
      requiredEvidence: "e", limitations: "l", sources: ["test 1"], review: approved,
    },
    {
      id: "check-pod", title: "Check the pod", kind: "next-step", slot: "operational",
      text: "Check the pod.", appliesTo: { triggers: ["threshold-crossing", "Inconclusive", "Sewage"], conditions: "c" },
      requiredEvidence: "e", limitations: "l", sources: ["test 1"], review: approved,
    },
    {
      id: "long-event", title: "Get a review", kind: "next-step", slot: "stakeholder",
      text: "Ask a professional.", appliesTo: {
        triggers: ["Sewage", "Inconclusive"], minSeverity: "High", minConfidence: 0.5, conditions: "c",
      },
      requiredEvidence: "e", limitations: "l", referral: "pro", sources: ["test 1"], review: approved,
    },
    {
      id: "vendor-offer", title: "Vendor cleanup", kind: "next-step", slot: "stakeholder",
      text: "Vendor offers cleanup.", appliesTo: { triggers: ["Sewage"], conditions: "c" },
      requiredEvidence: "e", limitations: "l", referral: "vendor", sources: ["test 1"], review: approved,
    },
    {
      id: "rejected-step", title: "Rejected", kind: "next-step", slot: "operational",
      text: "Flush the drain.", appliesTo: { triggers: ["Sewage", "threshold-crossing"], conditions: "c" },
      requiredEvidence: "e", limitations: "l", sources: ["test 1"],
      review: { status: "rejected", by: "Supervisor", date: "2026-09-20" },
    },
  ],
});
const approvedOnly = usableGuidance(fixture, false);
const withDrafts = usableGuidance(fixture, true);

const flaggedPh = (): ParameterStats => param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
const event = (overrides: Partial<WQEvent>): WQEvent => ({
  type: "Sewage",
  windowStartMs: 0,
  windowEndMs: 2 * HOUR,
  severity: "Moderate",
  parameterMovements: "",
  interpretation: "Unreviewed rule rationale.",
  followUp: "",
  confidence: 0.7,
  ...overrides,
});

describe("deterministicNarrative — recommendations", () => {
  it("gives routine-only recommendations when nothing is flagged", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" });
    const sections = deterministicNarrative(report([ph]), noAccuracy, "Normal", approvedOnly);
    expect(sections.recommendationsOperational).toContain("No action needed");
    expect(sections.recommendationsInvestigative).toBe("None required this period.");
    expect(sections.recommendationsStakeholder).toContain("Routine report distribution");
    expect(sections.guidanceIds).toEqual([]);
  });

  it("recommends nothing it has no approved entry for", () => {
    const sections = deterministicNarrative(
      report([flaggedPh()], [event({})], "Marine"), noAccuracy, "Watch", NO_GUIDANCE,
    );
    expect(sections.recommendationsOperational).toBe(NO_APPROVED_STEP);
    expect(sections.recommendationsInvestigative).toBe(NO_APPROVED_STEP);
    expect(sections.recommendationsStakeholder).toBe(NO_APPROVED_STEP);
    expect(sections.events[0].followUp).toBe(NO_APPROVED_STEP);
  });

  it("uses threshold-crossing entries for a flagged parameter with no event", () => {
    const sections = deterministicNarrative(report([flaggedPh()]), noAccuracy, "Watch", approvedOnly);
    expect(sections.recommendationsOperational).toBe("Check the pod.");
    expect(sections.recommendationsInvestigative).toBe(NO_APPROVED_STEP);
    expect(sections.guidanceIds).toEqual(["check-pod"]);
  });

  it("never uses a rejected entry, drafts included", () => {
    const sections = deterministicNarrative(report([flaggedPh()], [event({})], "Marine"), noAccuracy, "Watch", withDrafts);
    expect(sections.recommendationsOperational).not.toContain("Flush");
    expect(sections.guidanceIds).not.toContain("rejected-step");
  });

  it("fills each slot once per entry, however many findings select it", () => {
    const sections = deterministicNarrative(
      report([flaggedPh()], [event({}), event({ windowStartMs: 5 * HOUR, windowEndMs: 7 * HOUR })], "Marine"),
      noAccuracy,
      "Watch",
      approvedOnly,
    );
    expect(sections.recommendationsOperational).toBe("Check the pod.");
    expect(sections.recommendationsInvestigative).toBe("Test for bacteria.");
    expect(sections.guidanceIds).toEqual(["sewage-explained", "sewage-limit", "sewage-test", "check-pod"]);
  });

  it("adds the review step only for a High-severity event at or above the confidence floor", () => {
    const high = deterministicNarrative(
      report([flaggedPh()], [event({ severity: "High" })], "Marine"), noAccuracy, "Action Required", approvedOnly,
    );
    expect(high.recommendationsStakeholder).toBe("Ask a professional.");

    const weak = deterministicNarrative(
      report([flaggedPh()], [event({ type: "Inconclusive", severity: "High", confidence: 0.3 })]),
      noAccuracy,
      "Watch",
      approvedOnly,
    );
    expect(weak.recommendationsStakeholder).toBe(NO_APPROVED_STEP);

    const moderate = deterministicNarrative(
      report([flaggedPh()], [event({ confidence: 0.9 })], "Marine"), noAccuracy, "Watch", approvedOnly,
    );
    expect(moderate.recommendationsStakeholder).toBe(NO_APPROVED_STEP);
  });

  it("offers an entry only once its referral is usable too", () => {
    const blocked = deterministicNarrative(report([flaggedPh()], [event({})], "Marine"), noAccuracy, "Watch", approvedOnly);
    expect(blocked.recommendationsStakeholder).not.toContain("Vendor");

    const offered = deterministicNarrative(report([flaggedPh()], [event({})], "Marine"), noAccuracy, "Watch", withDrafts);
    expect(offered.recommendationsStakeholder).toBe("Vendor offers cleanup. Contact: help@example.org");
  });
});

describe("deterministicNarrative — event wording", () => {
  it("names a cause only when an approved explanation matches the event and the water", () => {
    const [named] = deterministicNarrative(
      report([flaggedPh()], [event({})], "Marine"), noAccuracy, "Watch", approvedOnly,
    ).events;
    expect(named.heading).toBe("Sewage");
    expect(named.causeNamed).toBe(true);
    expect(named.interpretation).toBe(
      "Consistent with sewage. Source unconfirmed. Bacteria are not measured. The change lasted 2.0 hours.",
    );
    expect(named.followUp).toBe("Test for bacteria; Check the pod (see Recommendations).");
  });

  it.each([
    ["freshwater", event({}), "Freshwater"],
    ["below the entry's confidence", event({ confidence: 0.5 }), "Marine"],
  ] as const)("leaves the cause unnamed when the only explanation does not fit (%s)", (_, e, water) => {
    const sections = deterministicNarrative(report([flaggedPh()], [e], water), noAccuracy, "Watch", approvedOnly);
    const [wording] = sections.events;
    expect(wording.heading).toBe(UNEXPLAINED_HEADING);
    expect(wording.causeNamed).toBe(false);
    expect(wording.interpretation).not.toMatch(/sewage|bacteria|Unreviewed/i);
    // Selected as Inconclusive: the sewage next step would name the cause by implication.
    expect(sections.recommendationsInvestigative).toBe(NO_APPROVED_STEP);
    expect(sections.recommendationsOperational).toBe("Check the pod.");
  });

  it("never prints the detection rule's own rationale", () => {
    const sections = deterministicNarrative(report([flaggedPh()], [event({})], "Marine"), noAccuracy, "Watch", withDrafts);
    expect(sections.events[0].interpretation).not.toContain("Unreviewed");
  });

  it("describes a persistent window as a threshold mismatch rather than a duration", () => {
    const [wording] = deterministicNarrative(
      report([flaggedPh()], [event({ persistent: true })], "Marine"), noAccuracy, "Watch", approvedOnly,
    ).events;
    expect(wording.interpretation).toContain("do not fit this site");
    expect(wording.interpretation).not.toContain("lasted");
  });
});

describe("deterministicNarrative — shipped catalogue", () => {
  const drafts = usableGuidance(catalogue, true);

  it("shows nothing from the shipped catalogue until the supervisor approves it", () => {
    expect(usableGuidance(catalogue, false).entries.filter((e) => e.review.status !== "approved")).toEqual([]);
  });

  it("names marine sewage and recommends bacteria testing with drafts on", () => {
    const sections = deterministicNarrative(report([flaggedPh()], [event({})], "Marine"), noAccuracy, "Watch", drafts);
    expect(sections.events[0].heading).toBe("Sewage");
    expect(sections.recommendationsInvestigative).toContain("Enterococcus");
    expect(sections.catalogueVersion).toBe(catalogue.version);
  });

  it("does not name an acidic input in marine water, where v2 says it is rarely detectable", () => {
    const acid = event({ type: "Acidic input", confidence: 0.55 });
    const sections = deterministicNarrative(report([flaggedPh()], [acid], "Marine"), noAccuracy, "Watch", drafts);
    expect(sections.events[0].heading).toBe(UNEXPLAINED_HEADING);
  });

  it("shows the hedged saltwater explanation under an unnamed heading below the floor", () => {
    // The saltwater entry is approved from 0.45, under the 0.5 floor that decides naming. The
    // heading stays unnamed; the approved, hedged wording still reaches the reader.
    const salt = event({ type: "Inconclusive", signature: "Saltwater intrusion", confidence: 0.45 });
    const sections = deterministicNarrative(report([flaggedPh()], [salt], "Marine"), noAccuracy, "Watch", drafts);

    expect(sections.events[0].heading).toBe(UNEXPLAINED_HEADING);
    expect(sections.events[0].causeNamed).toBe(false);
    expect(sections.events[0].interpretation).toContain("too weak for the report to name a cause");
    expect(sections.events[0].interpretation).toContain("saltier water reaching the pod");
    expect(sections.guidanceIds).toContain("saltwater-intrusion");
  });

  it("shows the hedged industrial explanation for the catch-all, and no industrial next step", () => {
    const industrial = event({
      type: "Inconclusive", signature: "Industrial", confidence: 0.3, severity: "High",
    });
    const sections = deterministicNarrative(report([flaggedPh()], [industrial]), noAccuracy, "Watch", drafts);

    expect(sections.events[0].heading).toBe(UNEXPLAINED_HEADING);
    expect(sections.events[0].interpretation).toContain("The data cannot tell which");
    expect(sections.guidanceIds).toContain("industrial-unclear");
    // Next steps are still selected as Inconclusive, so no Industrial-only step appears.
    const industrialOnlySteps = drafts.entries.filter((e) => e.kind === "next-step"
      && e.appliesTo.triggers?.includes("Industrial") && !e.appliesTo.triggers.includes("Inconclusive"));
    industrialOnlySteps.forEach((e) => expect(sections.guidanceIds).not.toContain(e.id));
  });

  it("adds nothing for a signature whose entry is not approved at that confidence", () => {
    // Thermal's entry needs 0.6; a 0.4 partial match gets the plain unexplained wording.
    const thermal = event({ type: "Inconclusive", signature: "Thermal", confidence: 0.4 });
    const sections = deterministicNarrative(report([flaggedPh()], [thermal]), noAccuracy, "Watch", drafts);

    expect(sections.events[0].interpretation).toContain("No approved explanation covers this pattern");
    expect(sections.guidanceIds).not.toContain("thermal");
  });

  it("never emits remediation phrasing -- next steps inspect, confirm and notify", () => {
    const events = (["Sewage", "Stormwater", "Hypoxia", "Thermal", "Acidic input", "Algal bloom"] as const)
      .map((type) => event({ type, severity: "High" }));
    const sections = deterministicNarrative(report([flaggedPh()], events), noAccuracy, "Action Required", drafts);
    const allText = [
      ...sections.summaryBullets,
      ...sections.parameterAnalysis.values(),
      ...sections.events.map((e) => `${e.interpretation} ${e.followUp}`),
      sections.recommendationsOperational,
      sections.recommendationsInvestigative,
      sections.recommendationsStakeholder,
    ].join(" \n ");
    // Treating the water is a separate, legally gated piece of work.
    expect(allText).not.toMatch(/\binstall\b|\bdose\b|\baerat|\bincrease flow\b|\bflush\b|\breduce\b|\badd\s+(chlorine|treatment|lime)/i);
  });
});

import {
  assessStatus, flagFor, heldSteady, overallStatus, coordinatesStr, outOfRangeShare, withUnit, statValue,
} from "../../src/report/types";
import type {
  ParameterBaseline, ParameterStats, ReportInput, SiteMetadata, WQEvent,
} from "../../src/report/types";

/**
 * types.ts is the ported core data model (template_report/models.py). These tests cover the
 * three decision functions report generation leans on hardest: flagFor (does a reading count
 * as a real excursion, net of probe noise), heldSteady (does a parameter get a paragraph in
 * Section 3), and overallStatus (what goes in the report header and drives routing text).
 */

const noAccuracy = (): number => 0;

const baseline = (overrides: Partial<ParameterBaseline> = {}): ParameterBaseline => ({
  key: "ph",
  label: "pH",
  unit: "",
  baselineMin: 6.5,
  baselineMax: 8.5,
  exceedanceMargin: 0.15, // 15% of a 2.0-wide baseline = 0.3
  hasFixedBaseline: true,
  ...overrides,
});

/** Turbidity as buildReportInput now constructs it: no numeric baseline, relative-index scale. */
const turbidityBaseline = (overrides: Partial<ParameterBaseline> = {}): ParameterBaseline => baseline({
  key: "turbidity",
  label: "Turbidity (Relative)",
  unit: "",
  baselineMin: 0,
  baselineMax: 0,
  hasFixedBaseline: false,
  scale: "relative-index",
  ...overrides,
});

const param = (overrides: Partial<ParameterStats> = {}): ParameterStats => ({
  baseline: baseline(),
  min: 7.0,
  max: 7.5,
  mean: 7.2,
  median: 7.2,
  pattern: "unknown",
  ...overrides,
});

describe("flagFor", () => {
  it("returns Normal when every reading is within baseline", () => {
    expect(flagFor(param(), noAccuracy)).toBe("Normal");
  });

  it("returns Elevated when the max clears baseline but stays under the exceedance margin", () => {
    // width 2.0, margin 0.3 -> exceedance edge is 8.8; 8.6 clears baseline but not the margin.
    expect(flagFor(param({ max: 8.6 }), noAccuracy)).toBe("Elevated");
  });

  it("returns Low when the min falls below baseline but stays inside the exceedance margin", () => {
    expect(flagFor(param({ min: 6.3 }), noAccuracy)).toBe("Low");
  });

  it("returns Exceedance once a reading clears the margin beyond baseline", () => {
    expect(flagFor(param({ max: 9.0 }), noAccuracy)).toBe("Exceedance");
  });

  it("treats a reading inside the probe's own accuracy tolerance as noise, not an excursion", () => {
    // 8.51 is 0.01 past baselineMax=8.5 -- inside a 0.05 probe tolerance, should stay Normal.
    const accuracy = (): number => 0.05;
    expect(flagFor(param({ max: 8.51 }), accuracy)).toBe("Normal");
  });

  it("returns N/A for a parameter with no fixed baseline, regardless of the readings", () => {
    const noBaseline = param({
      baseline: baseline({ hasFixedBaseline: false, baselineMin: 0, baselineMax: 0 }),
      min: -500,
      max: 5000,
    });
    expect(flagFor(noBaseline, noAccuracy)).toBe("N/A");
  });

  it("returns Qualitative for a relative-index parameter, never an excursion verdict", () => {
    // Turbidity. A reading of 2042 against the system prompt's nominal 0-25 NTU would be a 80x
    // exceedance if the scale meant what its units say; it does not, so no numeric verdict is
    // produced at all.
    const turbidity = param({
      baseline: turbidityBaseline(),
      min: 0,
      max: 2_042,
      mean: 1_006,
      median: 980,
    });
    expect(flagFor(turbidity, noAccuracy)).toBe("Qualitative");
  });

  it("returns Qualitative even when a stale numeric baseline is still attached", () => {
    // Defensive: the scale check runs before any range arithmetic, so a leftover
    // hasFixedBaseline/min/max on a relative-index parameter cannot resurrect an Exceedance.
    const turbidity = param({
      baseline: turbidityBaseline({ hasFixedBaseline: true, baselineMin: 5, baselineMax: 25 }),
      min: 0,
      max: 2_042,
      mean: 1_006,
    });
    expect(flagFor(turbidity, noAccuracy)).toBe("Qualitative");
  });

  it("returns Qualitative for a flat all-zero turbidity period -- 0 is a real reading", () => {
    const turbidity = param({
      baseline: turbidityBaseline(), min: 0, max: 0, mean: 0, median: 0,
    });
    expect(flagFor(turbidity, noAccuracy)).toBe("Qualitative");
  });
});

describe("heldSteady", () => {
  it("is true for a Normal flag with a flat or unknown pattern", () => {
    expect(heldSteady(param({ pattern: "flat" }), "Normal")).toBe(true);
    expect(heldSteady(param({ pattern: "unknown" }), "Normal")).toBe(true);
  });

  it("is false for a Normal flag with a diel or tidal pattern", () => {
    expect(heldSteady(param({ pattern: "diel" }), "Normal")).toBe(false);
    expect(heldSteady(param({ pattern: "tidal" }), "Normal")).toBe(false);
  });

  it("is false for any non-Normal flag, no matter the pattern", () => {
    expect(heldSteady(param({ pattern: "flat" }), "Elevated")).toBe(false);
    expect(heldSteady(param({ pattern: "flat" }), "N/A")).toBe(false);
    // Qualitative too: turbidity is a deliberately reported metric, so it always earns a line in
    // Section 3 rather than being dropped as "held steady".
    expect(heldSteady(param({ pattern: "flat" }), "Qualitative")).toBe(false);
  });
});

describe("overallStatus", () => {
  const report = (overrides: Partial<ReportInput> = {}): ReportInput => ({
    site: {} as SiteMetadata,
    parameters: [param()],
    events: [],
    ...overrides,
  });

  const event = (overrides: Partial<WQEvent> = {}): WQEvent => ({
    type: "Inconclusive",
    windowStartMs: 0,
    windowEndMs: 1,
    severity: "Low",
    parameterMovements: "",
    interpretation: "",
    followUp: "",
    confidence: 0.2,
    ...overrides,
  });

  it("is Normal when nothing is flagged and there are no events", () => {
    expect(overallStatus(report(), noAccuracy)).toBe("Normal");
  });

  it("is Action Required when any parameter is an Exceedance", () => {
    expect(overallStatus(report({ parameters: [param({ max: 9.0 })] }), noAccuracy)).toBe("Action Required");
  });

  it("is Action Required when a confident High-severity event lands, even with clean parameters", () => {
    const e = event({ severity: "High", confidence: 0.7 });
    expect(overallStatus(report({ events: [e] }), noAccuracy)).toBe("Action Required");
  });

  it("keeps a High-severity event below the confidence floor at Watch", () => {
    // Severity is computed from duration alone, so a long window classified "Inconclusive" at
    // 30% confidence used to put "Action Required" on the cover and make narrative.ts recommend
    // notifying an authority -- escalation on evidence the same report calls too weak to name.
    const e = event({ severity: "High", confidence: 0.3, type: "Inconclusive" });
    expect(overallStatus(report({ events: [e] }), noAccuracy)).toBe("Watch");
  });

  it("is Watch when a parameter is Elevated or Low but nothing is a full Exceedance", () => {
    expect(overallStatus(report({ parameters: [param({ max: 8.6 })] }), noAccuracy)).toBe("Watch");
  });

  it("is Watch when an event is Low or Moderate severity and nothing escalates it", () => {
    expect(overallStatus(report({ events: [event({ severity: "Moderate" })] }), noAccuracy)).toBe("Watch");
  });

  it("is Not assessed for a very turbid relative index alone -- a band is not an excursion, and "
    + "turbidity is never a baseline", () => {
    // The whole point of the qualitative treatment: turbidity cannot move the report status on
    // its own, because it cannot be shown to have left a range. It still reaches the status
    // legitimately through events.ts, which reads its relative movement instead. And because
    // turbidity is the only parameter here and it never has a fixed baseline (isRelativeIndex
    // excludes it), nothing was actually compared -- "Normal" would be a silent all-clear.
    const turbidity = param({
      baseline: turbidityBaseline(), min: 900, max: 3_000, mean: 2_042, median: 2_000,
    });
    expect(overallStatus(report({ parameters: [turbidity] }), noAccuracy)).toBe("Not assessed");
  });

  it("lets an Exceedance parameter override a merely Watch-level event", () => {
    const r = report({
      parameters: [param({ max: 9.0 })],
      events: [event({ severity: "Low" })],
    });
    expect(overallStatus(r, noAccuracy)).toBe("Action Required");
  });

  describe("Not assessed -- a pod with no usable baseline for any numeric parameter", () => {
    const noBaseline = (overrides: Partial<ParameterStats> = {}): ParameterStats => param({
      baseline: baseline({ hasFixedBaseline: false, baselineMin: 0, baselineMax: 0 }),
      ...overrides,
    });

    it("is Not assessed, not Normal, when every numeric parameter has no baseline and nothing fired", () => {
      // The defect this guards: every numeric row N/A means flagFor never returns
      // Elevated/Low/Exceedance, so nothing here escalates -- overallStatus must not fall through
      // to "Normal" and print a silent all-clear over a report that compared nothing.
      const r = report({ parameters: [noBaseline(), noBaseline({ baseline: baseline({ key: "orp", hasFixedBaseline: false }) })] });
      expect(overallStatus(r, noAccuracy)).toBe("Not assessed");
    });

    it("stays Watch when a turbidity-driven event fires despite no numeric parameter having a baseline", () => {
      // Turbidity never has a baseline (isRelativeIndex excludes it from the check), but its
      // event can still legitimately move the status -- events.ts reads relative movement, not
      // a range crossing. Any event outranks "Not assessed".
      const turbidity = param({ baseline: turbidityBaseline(), min: 900, max: 3_000, mean: 2_042 });
      const r = report({
        parameters: [noBaseline(), turbidity],
        events: [event({ severity: "Moderate" })],
      });
      expect(overallStatus(r, noAccuracy)).toBe("Watch");
    });

    it("returns to Normal once even one numeric parameter has a real baseline and nothing is flagged", () => {
      // A report is only "Not assessed" when NOT ONE numeric parameter was comparable. One usable
      // baseline with nothing flagged is a real "Normal" result, not a partial "Not assessed".
      const r = report({ parameters: [param(), noBaseline()] });
      expect(overallStatus(r, noAccuracy)).toBe("Normal");
    });

    it("still escalates to Action Required when the one baselined parameter is an Exceedance", () => {
      const r = report({ parameters: [param({ max: 9.0 }), noBaseline()] });
      expect(overallStatus(r, noAccuracy)).toBe("Action Required");
    });
  });

  describe("assessStatus -- the rule and parameters behind the status", () => {
    // generate_report states this reason, so it must come off the same ladder as the status.
    const orp = (overrides: Partial<ParameterStats> = {}): ParameterStats => param({
      baseline: baseline({ key: "orp", baselineMin: 0, baselineMax: 800 }),
      min: 100,
      max: 400,
      ...overrides,
    });

    it("names only the Exceedance parameters, even when others are merely Elevated", () => {
      const r = report({ parameters: [param({ max: 8.6 }), orp({ min: -160 })] });
      expect(assessStatus(r, noAccuracy)).toEqual({
        status: "Action Required", rule: "exceedance", parameters: ["orp"],
      });
    });

    it("names the excursion parameters behind a Watch", () => {
      expect(assessStatus(report({ parameters: [param({ max: 8.6 }), orp()] }), noAccuracy)).toEqual({
        status: "Watch", rule: "excursion", parameters: ["ph"],
      });
    });

    it("attributes an event-driven status to the events, not to a parameter", () => {
      const confident = event({ severity: "High", confidence: 0.7 });
      expect(assessStatus(report({ events: [confident] }), noAccuracy))
        .toEqual({ status: "Action Required", rule: "high-confidence-high-event", parameters: [] });
      expect(assessStatus(report({ events: [event()] }), noAccuracy))
        .toEqual({ status: "Watch", rule: "event", parameters: [] });
    });

    it("agrees with overallStatus on every case above", () => {
      const cases = [
        report(),
        report({ parameters: [param({ max: 9.0 })] }),
        report({ parameters: [param({ max: 8.6 })] }),
        report({ events: [event()] }),
        report({ parameters: [param({ baseline: baseline({ hasFixedBaseline: false }) })] }),
      ];
      cases.forEach((r) => expect(assessStatus(r, noAccuracy).status).toBe(overallStatus(r, noAccuracy)));
      expect(assessStatus(report(), noAccuracy).rule).toBe("normal");
      expect(assessStatus(cases[4], noAccuracy).rule).toBe("no-baseline");
    });
  });
});

describe("coordinatesStr", () => {
  it("formats a N/E coordinate pair", () => {
    const site = { latitude: 33.7, longitude: -118.2 } as SiteMetadata;
    expect(coordinatesStr(site)).toBe("33.7000° N, 118.2000° W");
  });

  it("says no GPS fix, rather than fabricating a coordinate, when none is present", () => {
    // Wording changed with the coordinate plumbing: coordinates ride on the readings, not on
    // the device registry, so an absent value means no reading in the window carried a fix.
    const site = {} as SiteMetadata;
    expect(coordinatesStr(site)).toBe("No GPS fix in the reporting period");
  });

  it("falls back to the API's location label when there is no numeric fix", () => {
    const site = { locationName: "Seal Beach CA" } as SiteMetadata;
    expect(coordinatesStr(site)).toBe("Seal Beach CA");
  });

  it("appends the location label to a numeric fix when both are present", () => {
    const site = {
      latitude: 33.7496725, longitude: -118.11551953, locationName: "Seal Beach CA",
    } as SiteMetadata;
    expect(coordinatesStr(site)).toBe("33.7497° N, 118.1155° W  (Seal Beach CA)");
  });
});

describe("outOfRangeShare", () => {
  const hourly = (values: number[]): Array<[number, number]> => (
    values.map((v, i): [number, number] => [i * 3_600_000, v])
  );

  it("is the share of series points sitting outside the baseline", () => {
    // The distinction the Flag column cannot draw on its own: one stray point and a sustained
    // offset both read "Exceedance".
    const p = param({ series: hourly([7, 7, 7, 9.5]) });
    expect(outOfRangeShare(p)).toBeCloseTo(0.25);
  });

  it("is 1 when every point is outside", () => {
    expect(outOfRangeShare(param({ series: hourly([9, 9.5]) }))).toBe(1);
  });

  it("is null without a series, and null for a parameter with no range to be outside of", () => {
    expect(outOfRangeShare(param())).toBeNull();
    expect(outOfRangeShare(param({
      baseline: turbidityBaseline(), series: hourly([900, 2_000]),
    }))).toBeNull();
  });
});

describe("withUnit / statValue", () => {
  it("omits the space for a parameter with no unit", () => {
    expect(withUnit("8.90", "")).toBe("8.90");
    expect(withUnit("8.90", "mg/L")).toBe("8.90 mg/L");
  });

  it("drops the decimals above 1,000", () => {
    expect(statValue(7.0499)).toBe("7.05");
    expect(statValue(68_425.0001)).toBe("68425");
  });
});

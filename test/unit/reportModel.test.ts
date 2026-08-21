import {
  flagFor, heldSteady, overallStatus, coordinatesStr,
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

  it("is Action Required when any event is High severity, even with clean parameters", () => {
    expect(overallStatus(report({ events: [event({ severity: "High" })] }), noAccuracy)).toBe("Action Required");
  });

  it("is Watch when a parameter is Elevated or Low but nothing is a full Exceedance", () => {
    expect(overallStatus(report({ parameters: [param({ max: 8.6 })] }), noAccuracy)).toBe("Watch");
  });

  it("is Watch when an event is Low or Moderate severity and nothing escalates it", () => {
    expect(overallStatus(report({ events: [event({ severity: "Moderate" })] }), noAccuracy)).toBe("Watch");
  });

  it("lets an Exceedance parameter override a merely Watch-level event", () => {
    const r = report({
      parameters: [param({ max: 9.0 })],
      events: [event({ severity: "Low" })],
    });
    expect(overallStatus(r, noAccuracy)).toBe("Action Required");
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

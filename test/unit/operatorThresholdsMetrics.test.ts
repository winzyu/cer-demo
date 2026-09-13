import {
  metricThreshold,
  metricThresholdRejectionReason,
  temperatureThreshold,
} from "../../src/report/operatorThresholds";

/**
 * `metricThreshold` generalises what was originally `temperatureThreshold`'s body alone to the
 * four other registry-configured metrics (`get_pod_thresholds`, N-phase turbidity/threshold work).
 * `test/unit/operatorThresholds.test.ts` pins `temperatureThreshold`'s own behaviour untouched --
 * this file covers the other four metrics plus the generic entry point, using the same real-junk
 * cases that file documents (`BACKEND_FIELDS.md` §3c): pH 0-100 as a placeholder, ORP -2200 as a
 * typo, an all-zero "never configured" row.
 */
describe("metricThreshold", () => {
  it("accepts every threshold pair observed live on the fleet on 2026-09-13", () => {
    // Old Woman Creek 2026, salt-water pods -- the live read table this brief carries.
    expect(metricThreshold({ minPH: "0", maxPH: "10" }, "ph")).toEqual({ usable: true, min: 0, max: 10 });
    expect(metricThreshold({ minPH: "4", maxPH: "10" }, "ph")).toEqual({ usable: true, min: 4, max: 10 });
    expect(metricThreshold({ minPH: "6", maxPH: "10" }, "ph")).toEqual({ usable: true, min: 6, max: 10 });

    expect(metricThreshold(
      { minDissolvedOxygen: "0", maxDissolvedOxygen: "12" },
      "dissolvedOxygen",
    )).toEqual({ usable: true, min: 0, max: 12 });
    expect(metricThreshold(
      { minDissolvedOxygen: "3", maxDissolvedOxygen: "27" },
      "dissolvedOxygen",
    )).toEqual({ usable: true, min: 3, max: 27 });

    expect(metricThreshold({ minORP: "0", maxORP: "800" }, "orp")).toEqual({ usable: true, min: 0, max: 800 });
    expect(metricThreshold({ minORP: "50", maxORP: "400" }, "orp")).toEqual({ usable: true, min: 50, max: 400 });
    expect(metricThreshold({ minORP: "100", maxORP: "400" }, "orp")).toEqual({ usable: true, min: 100, max: 400 });

    expect(metricThreshold(
      { minConductivity: "0", maxConductivity: "100000" },
      "conductivity",
    )).toEqual({ usable: true, min: 0, max: 100_000 });
    expect(metricThreshold(
      { minConductivity: "40024", maxConductivity: "75000" },
      "conductivity",
    )).toEqual({ usable: true, min: 40_024, max: 75_000 });
  });

  it("rejects a pH placeholder outside the 0-14 scale", () => {
    // CER Conference Pod's real maxPH=100.
    expect(metricThreshold({ minPH: "0", maxPH: "100" }, "ph"))
      .toEqual({ usable: false, reason: "implausible" });
  });

  it("rejects an ORP typo outside the probe's -2000 to 2000 mV rail", () => {
    // Marina Park's real minORP=-2200.
    expect(metricThreshold({ minORP: "-2200", maxORP: "400" }, "orp"))
      .toEqual({ usable: false, reason: "implausible" });
  });

  it("rejects a dissolved-oxygen placeholder outside the probe's 0-30 mg/L rail", () => {
    expect(metricThreshold(
      { minDissolvedOxygen: "0", maxDissolvedOxygen: "100" },
      "dissolvedOxygen",
    )).toEqual({ usable: false, reason: "implausible" });
  });

  it("rejects a conductivity placeholder outside the probe's 0-100,000 µS/cm rail", () => {
    expect(metricThreshold(
      { minConductivity: "0", maxConductivity: "300000" },
      "conductivity",
    )).toEqual({ usable: false, reason: "implausible" });
  });

  it("rejects a limit the probe could never report, even when it is not absurd", () => {
    // The rail is the probe's own plausibility range (plausibility.ts), so a DO ceiling of 40 mg/L
    // or a conductivity ceiling of 150,000 µS/cm is a placeholder, not a configured alert limit.
    expect(metricThreshold({ minDissolvedOxygen: "3", maxDissolvedOxygen: "40" }, "dissolvedOxygen"))
      .toEqual({ usable: false, reason: "implausible" });
    expect(metricThreshold({ minConductivity: "0", maxConductivity: "150000" }, "conductivity"))
      .toEqual({ usable: false, reason: "implausible" });
  });

  it("treats an all-zero pair as unset for every non-temperature metric too", () => {
    expect(metricThreshold({ minPH: "0", maxPH: "0" }, "ph"))
      .toEqual({ usable: false, reason: "unset" });
    expect(metricThreshold({ minORP: "0", maxORP: "0" }, "orp"))
      .toEqual({ usable: false, reason: "unset" });
    expect(metricThreshold({ minDissolvedOxygen: "0", maxDissolvedOxygen: "0" }, "dissolvedOxygen"))
      .toEqual({ usable: false, reason: "unset" });
    expect(metricThreshold({ minConductivity: "0", maxConductivity: "0" }, "conductivity"))
      .toEqual({ usable: false, reason: "unset" });
  });

  it("rejects an inverted pair for a non-temperature metric", () => {
    expect(metricThreshold({ minPH: "10", maxPH: "4" }, "ph"))
      .toEqual({ usable: false, reason: "inverted" });
  });

  it("rejects a non-numeric pair for a non-temperature metric", () => {
    expect(metricThreshold({ minPH: "n/a", maxPH: "10" }, "ph"))
      .toEqual({ usable: false, reason: "non-numeric" });
  });

  it("reports a missing key for a metric whose fields are simply absent", () => {
    // Turbidity has no threshold keys on any device -- a stand-in for "this metric was never
    // asked about" using a real registry-shaped object.
    expect(metricThreshold({ minTemperature: "50", maxTemperature: "80" }, "ph"))
      .toEqual({ usable: false, reason: "missing" });
  });

  it("reports no-thresholds for an absent or empty thresholds object, for any metric", () => {
    expect(metricThreshold(undefined, "orp")).toEqual({ usable: false, reason: "no-thresholds" });
    expect(metricThreshold({}, "conductivity")).toEqual({ usable: false, reason: "no-thresholds" });
  });

  it("delegates temperatureThreshold to metricThreshold(..., \"temperature\") with identical output", () => {
    const thresholds = { minTemperature: "50", maxTemperature: "80" };
    expect(temperatureThreshold(thresholds)).toEqual(metricThreshold(thresholds, "temperature"));
  });
});

describe("metricThresholdRejectionReason", () => {
  it.each([
    "no-thresholds", "missing", "non-numeric", "unset", "inverted", "implausible",
  ] as const)("gives %s a non-empty sentence for a non-temperature metric", (reason) => {
    const note = metricThresholdRejectionReason(reason, "ph");
    expect(note.length).toBeGreaterThan(0);
    expect(note.endsWith(".")).toBe(true);
  });

  it("never echoes a raw registry value", () => {
    // The rejected pH pair was 0/100; neither number may appear in the reason text.
    const note = metricThresholdRejectionReason("implausible", "ph");
    expect(note).not.toContain("100");
  });

  it("names the metric rather than always saying temperature", () => {
    expect(metricThresholdRejectionReason("missing", "orp")).toContain("ORP");
    expect(metricThresholdRejectionReason("missing", "dissolvedOxygen")).toContain("dissolved oxygen");
    expect(metricThresholdRejectionReason("missing", "conductivity")).toContain("conductivity");
  });
});

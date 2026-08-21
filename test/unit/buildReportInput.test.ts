import fs from "fs";
import path from "path";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { buildReportInput } from "../../src/report/buildReportInput";

/**
 * buildReportInput.ts is the only place in src/report/ that talks to QuerySensorData -- these
 * tests exercise it against the same recorded device-api fixtures querySensorData.test.ts uses,
 * offline throughout, so a regression in how report generation reads sensor data (not just in
 * the report math downstream) would fail here too.
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

const DEVICES = load("devices.json");
const ALGALITA_PERIOD = load("algalita-period-1-day.json") as Array<Record<string, unknown>>;
const OWC_PERIOD_DAY = load("owc-period-1-day.json");
const OWC_LAST = load("owc-last.json") as { data: Record<string, unknown> };

const OWC = "dev:351077454567580";
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

const ALGALITA_LAST = (() => {
  const newest = [...ALGALITA_PERIOD]
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
  const water = newest.water_data as Record<string, number>;
  return {
    id: "algalita-last",
    data: { ...newest, water_data: { ...water, 102: water[102] * (9 / 5) + 32 } },
  };
})();

const makeSensor = (
  overrides: Partial<Record<"devices" | "periodDay" | "periodWeek" | "periodMonth" | "last", unknown>> = {},
): QuerySensorData => {
  const fetchImpl = async (url: string): Promise<Response> => {
    const body = ((): unknown => {
      if (url.includes("/devices")) {
        return overrides.devices ?? DEVICES;
      }
      if (url.includes("/water/last/")) {
        if (overrides.last !== undefined) return overrides.last;
        return url.includes(encodeURIComponent(OWC)) ? OWC_LAST : ALGALITA_LAST;
      }
      if (url.includes("/water/period/")) {
        const forOwc = url.includes(encodeURIComponent(OWC));
        if (url.includes("/1/week")) return overrides.periodWeek ?? (forOwc ? OWC_PERIOD_DAY : ALGALITA_PERIOD);
        if (url.includes("/1/month")) return overrides.periodMonth ?? (forOwc ? OWC_PERIOD_DAY : ALGALITA_PERIOD);
        return overrides.periodDay ?? (forOwc ? OWC_PERIOD_DAY : ALGALITA_PERIOD);
      }
      return {};
    })();
    return {
      ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body),
    } as unknown as Response;
  };

  const client = new DeviceApiClient({ baseUrl: "https://example.invalid/api/v1", token: "test-token", fetchImpl });
  return new QuerySensorData({
    client, now: () => NOW, rawLimit: 200, waterType: "saltwater",
  });
};

describe("buildReportInput", () => {
  it("builds a ReportInput covering every parameter with real readings", async () => {
    const sensor = makeSensor();
    const { report, error, skippedParameters } = await buildReportInput(
      sensor, { timeRange: "last day", device: "Algalita" },
    );

    expect(error).toBeUndefined();
    expect(skippedParameters).toBeUndefined();
    expect(report).toBeDefined();
    expect(report!.site.siteName).toContain("Algalita");
    expect(report!.parameters).toHaveLength(6);
  });

  it("labels temperature in the unit the device API actually returns (°F, not °C)", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    const temp = report!.parameters.find((p) => p.baseline.key === "temperature");
    expect(temp).toBeDefined();
    expect(temp!.baseline.unit).toBe("°F");
    expect(temp!.baseline.label).toContain("°F");
  });

  it("gives temperature no fixed baseline, so it reports as N/A rather than a fabricated range", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    const temp = report!.parameters.find((p) => p.baseline.key === "temperature");
    expect(temp!.baseline.hasFixedBaseline).toBe(false);
  });

  it("builds turbidity as a relative index with no numeric baseline, and relabels it", async () => {
    // Turbidity stays fully in scope as a reported metric -- what changed is how it is
    // expressed. It carries no baseline to be flagged against (there is no operator turbidity
    // range on any registered device) and is labelled Relative, matching the dashboard, rather
    // than claiming NTU it is not calibrated in.
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    const turbidity = report!.parameters.find((p) => p.baseline.key === "turbidity");
    expect(turbidity).toBeDefined();
    expect(turbidity!.baseline.scale).toBe("relative-index");
    expect(turbidity!.baseline.hasFixedBaseline).toBe(false);
    expect(turbidity!.baseline.label).toBe("Turbidity (Relative)");
    expect(turbidity!.baseline.unit).toBe("");
    expect(turbidity!.baseline.label).not.toContain("NTU");
  });

  it("keeps every other parameter on the numeric scale", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    report!.parameters
      .filter((p) => p.baseline.key !== "turbidity")
      .forEach((p) => expect(p.baseline.scale).toBeUndefined());
  });

  it("computes min/max/mean from the series buckets, and falls back mean when the median call has no data", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    const ph = report!.parameters.find((p) => p.baseline.key === "ph")!;
    expect(ph.max).toBeGreaterThanOrEqual(ph.min);
    expect(ph.mean).toBeGreaterThanOrEqual(ph.min);
    expect(ph.mean).toBeLessThanOrEqual(ph.max);
  });

  it("reports Not available for coordinates and client, rather than fabricating placeholder values", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    expect(report!.site.latitude).toBeUndefined();
    expect(report!.site.longitude).toBeUndefined();
    expect(report!.site.clientName).toContain("Not available");
  });

  it("marks every parameter's pattern as unknown -- no live pattern detector exists yet", async () => {
    const sensor = makeSensor();
    const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

    expect(report!.parameters.every((p) => p.pattern === "unknown")).toBe(true);
  });

  it("returns an error instead of throwing when the device query fails", async () => {
    const sensor = makeSensor();
    const { report, error } = await buildReportInput(sensor, { timeRange: "since the storm", device: "Algalita" });

    expect(report).toBeUndefined();
    expect(error).toBeDefined();
  });

  it("returns an error when no parameter has any readings in the window", async () => {
    const sensor = makeSensor({
      periodDay: [], periodWeek: [], periodMonth: [], last: [],
    });
    const { report, error } = await buildReportInput(sensor, { timeRange: "last day", device: "OWC" });

    expect(report).toBeUndefined();
    expect(error).toContain("No readings found");
  });

  it("threads the caller's bearer token from ToolContext into both sensor.query calls", async () => {
    // QuerySensorData.query() only grew a `token` parameter for this integration (see
    // querySensorData.ts's docstring on `query`) -- verify buildReportInput actually passes
    // context?.token through, not just that it compiles. A real QuerySensorData wired to a
    // constructor-supplied client (as the other tests here use) ignores the per-call token, so
    // this checks buildReportInput's own responsibility with a stub in QuerySensorData's shape.
    const calls: Array<{ token: string | undefined }> = [];
    const stubSensor = {
      query: async (_params: unknown, token?: string) => {
        calls.push({ token });
        return { device: { name: "Stub" }, time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" }, metrics: {} };
      },
    } as unknown as QuerySensorData;

    await buildReportInput(stubSensor, { timeRange: "last day" }, { token: "caller-token" });

    expect(calls).toHaveLength(2); // series + median
    expect(calls.every((c) => c.token === "caller-token")).toBe(true);
  });

  /**
   * The defect: `waterBodyType` used to be an override, and `generateReport` always passes it
   * (defaulted from `config.waterType`), so the `??` meant to let the registry decide never fell
   * through. The Algalita Pod is registered `operatingEnvironment: "salt-water"`, but a
   * `WATER_TYPE=freshwater` deployment produced a report headed "Freshwater" that judged ~58,000
   * µS/cm of ordinary seawater against the freshwater baseline of 50-1500 -- a 45x "Exceedance",
   * a High-severity "Stormwater" event, and an "Action Required" status, all manufactured.
   */
  describe("water body type", () => {
    it("takes the device registry's operating_environment over the deployment fallback", async () => {
      const sensor = makeSensor();
      const { report } = await buildReportInput(
        sensor,
        { timeRange: "last day", device: "Algalita", waterBodyTypeFallback: "Freshwater" },
      );

      expect(report!.site.waterBodyType).toBe("Marine");
      expect(report!.site.waterBodyTypeSource).toBe("device");
    });

    it("selects the seawater baseline table for a salt-water pod", async () => {
      const sensor = makeSensor();
      const { report } = await buildReportInput(
        sensor,
        { timeRange: "last day", device: "Algalita", waterBodyTypeFallback: "Freshwater" },
      );

      const ec = report!.parameters.find((p) => p.baseline.key === "conductivity")!;
      // Seawater: 45,000-55,000. The freshwater bug produced 50-1500 here.
      expect(ec.baseline.baselineMin).toBe(45_000);
      expect(ec.baseline.baselineMax).toBe(55_000);
    });

    it("falls back to the deployment value only when the registry says nothing usable", async () => {
      const stubSensor = {
        query: async () => ({
          device: { name: "Unregistered Pod", operating_environment: null },
          time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
          metrics: {
            ph: {
              value: 7.2, n_samples: 4, series: [{ start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean: 7.2, min: 7.1, max: 7.3, n: 4 }],
            },
          },
        }),
      } as unknown as QuerySensorData;

      const { report } = await buildReportInput(
        stubSensor,
        { timeRange: "last day", waterBodyTypeFallback: "Brackish" },
      );

      expect(report!.site.waterBodyType).toBe("Brackish");
      // Flagged as a default so the PDF can say the classification was never confirmed.
      expect(report!.site.waterBodyTypeSource).toBe("default");
    });
  });

  /**
   * `dataQuality` was hardcoded to `undefined`, and renderPdf only prints the section
   * `if (report.dataQuality)` -- so the one section that could have disclosed the -1809.4 °F
   * probe rail was structurally unreachable on live data.
   */
  describe("data quality", () => {
    it("is populated rather than left undefined, so the section can render at all", async () => {
      const sensor = makeSensor();
      const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });

      expect(report!.dataQuality).toBeDefined();
      expect(report!.dataQuality!.completenessPct).toBeGreaterThan(0);
    });

    it("raises calibration to Review, naming the metric, when a probe railed without a fault flag", async () => {
      const stubSensor = {
        query: async () => ({
          device: { name: "Algalita Pod", operating_environment: "salt-water" },
          time_range_resolved: { start: "2026-07-21T00:00:00.000Z", end: "2026-08-20T00:00:00.000Z" },
          metrics: {
            temperature: {
              value: null,
              n_samples: 1259,
              excluded_faulted: 0,
              excluded_implausible: 1,
              series: [{ start: "2026-07-24T00:00:00.000Z", end: "2026-07-24T12:00:00.000Z", mean: 73.4, min: 70.75, max: 88.91, n: 1259 }],
            },
          },
        }),
      } as unknown as QuerySensorData;

      const { report } = await buildReportInput(stubSensor, { timeRange: "last month" });
      const dq = report!.dataQuality!;

      expect(dq.calibrationStatus).toBe("Review");
      expect(dq.calibrationNotes).toContain("Temperature");
      expect(dq.calibrationNotes).toContain("without a fault flag");
    });

    it("leaves undetectable checks unset rather than reporting a clean result nothing verified", async () => {
      const sensor = makeSensor();
      const { report } = await buildReportInput(sensor, { timeRange: "last day", device: "Algalita" });
      const dq = report!.dataQuality!;

      expect(dq.driftStatus).toBeUndefined();
      expect(dq.biofoulingStatus).toBeUndefined();
      expect(dq.sensorAgreementStatus).toBeUndefined();
      expect(dq.driftNotes).toContain("Not assessed");
    });
  });

  it("drops single-reading buckets from the trend series but not from min/max", async () => {
    // A reporting gap leaves one bucket holding one reading whose "mean" is that reading;
    // feeding it to the event detector invites a step-change event out of a gap. Section 2's
    // extremes stay exact over every usable reading.
    const stubSensor = {
      query: async () => ({
        device: { name: "Algalita Pod", operating_environment: "salt-water" },
        time_range_resolved: { start: "2026-07-21T00:00:00.000Z", end: "2026-08-20T00:00:00.000Z" },
        metrics: {
          ph: {
            value: 7.2,
            n_samples: 21,
            series: [
              { start: "2026-07-21T00:00:00.000Z", end: "2026-07-21T12:00:00.000Z", mean: 7.2, min: 7.0, max: 7.4, n: 10 },
              { start: "2026-07-24T00:00:00.000Z", end: "2026-07-24T12:00:00.000Z", mean: 8.9, min: 8.9, max: 8.9, n: 1 },
              { start: "2026-07-25T00:00:00.000Z", end: "2026-07-25T12:00:00.000Z", mean: 7.3, min: 7.1, max: 7.5, n: 10 },
            ],
          },
        },
      }),
    } as unknown as QuerySensorData;

    const { report } = await buildReportInput(stubSensor, { timeRange: "last month" });
    const ph = report!.parameters.find((p) => p.baseline.key === "ph")!;

    expect(ph.series).toHaveLength(2); // the n=1 bucket is gone from the trend
    expect(ph.series!.some(([, v]) => v === 8.9)).toBe(false);
    // ...but it still counted toward the exact extremes.
    expect(ph.max).toBe(8.9);
    expect(ph.min).toBe(7.0);
  });
});

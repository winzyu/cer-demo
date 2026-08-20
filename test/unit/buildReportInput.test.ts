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
});

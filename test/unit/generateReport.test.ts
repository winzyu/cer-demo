import fs from "fs";
import path from "path";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { GenerateReport, generateReportDefinition } from "../../src/tools/generateReport";
import { catalogue } from "../../src/catalogue";

/**
 * generate_report end to end: runs the real report pipeline over recorded device-api fixtures
 * (same ones querySensorData.test.ts and buildReportInput.test.ts use), offline throughout.
 * Confirms the tool's contract with the model -- what JSON comes back, since that is what gets
 * JSON-stringified into the chat's tool message (ChatOrchestrator.ts). The PDF itself is
 * rendered by `POST /api/v1/reports` (test/integration/reports.test.ts).
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

const DEVICES = load("devices.json");
const ALGALITA_PERIOD = load("algalita-period-1-day.json") as Array<Record<string, unknown>>;
const NOW = Date.parse("2026-08-13T12:00:00.000Z");

const ALGALITA_LAST = (() => {
  const newest = [...ALGALITA_PERIOD].sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
  const water = newest.water_data as Record<string, number>;
  return {
    id: "algalita-last",
    data: { ...newest, water_data: { ...water, 102: water[102] * (9 / 5) + 32 } },
  };
})();

const makeSensor = (): QuerySensorData => {
  const fetchImpl = async (url: string): Promise<Response> => {
    const body = ((): unknown => {
      if (url.includes("/devices")) return DEVICES;
      if (url.includes("/water/last/")) return ALGALITA_LAST;
      if (url.includes("/water/period/")) return ALGALITA_PERIOD;
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

/** The caller's bearer token: every reading behind a report is fetched with it. */
const CALLER = { token: "caller-jwt" };

describe("generate_report — tool definition", () => {
  it("is named generate_report and requires only time_range", () => {
    expect(generateReportDefinition.function.name).toBe("generate_report");
    expect(generateReportDefinition.function.parameters.required).toEqual(["time_range"]);
  });
});

describe("GenerateReport.run", () => {
  it("rejects a call with no time_range instead of guessing one", async () => {
    const tool = new GenerateReport({ sensor: makeSensor() });
    const result = await tool.run({});
    expect(result.error).toContain("time_range");
  });

  it("returns a status, event count and report_request -- no raw numbers, no file", async () => {
    const tool = new GenerateReport({ sensor: makeSensor() });
    const result = await tool.run({ time_range: "last day", device: "Algalita" }, CALLER);

    expect(result.error).toBeUndefined();
    expect(["Normal", "Watch", "Action Required", "Not assessed"]).toContain(result.status);
    expect(typeof result.events_flagged).toBe("number");
    expect(Array.isArray(result.event_types)).toBe(true);
    // The audit trail needs to know which approved wording the report used.
    expect(result.catalogue_version).toBe(catalogue.version);
    expect(Array.isArray(result.guidance_ids)).toBe(true);
    // What the page posts to POST /api/v1/reports: the arguments, never a URL to a stored file.
    expect(result.report_request).toEqual({ time_range: "last day", device: "Algalita" });
    expect(result).not.toHaveProperty("report_url");

    // The tool result is JSON.stringify'd straight into a chat message (ChatOrchestrator.ts) --
    // it must not carry the underlying readings, only the summary fields. "dissolved_oxygen" is
    // no longer a clean stand-in for "a raw metric dump leaked": baseline_provenance legitimately
    // uses it as a label key now, so this checks for the raw series/sample shape instead.
    expect(JSON.stringify(result)).not.toMatch(/"value":|"mean":|"n_samples":|"series":/);
  });

  it("gives the period as the exact string the PDF prints, for the model to copy", async () => {
    const result = await new GenerateReport({ sensor: makeSensor() })
      .run({ time_range: "last day", device: "Algalita" }, CALLER);
    const resolved = result.time_range_resolved as { start: string; end: string };

    expect(result.report_period).toBe(`${resolved.start} to ${resolved.end}`);
    expect(result.report_period).toMatch(/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/);
  });

  it("omits device from report_request when the call named none", async () => {
    // A single-pod caller need not name one; the download resolves the same default.
    const stubSensor = {
      query: async () => ({
        device: { name: "Only Pod", label: "dev:only", operating_environment: "salt-water" },
        time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
        metrics: {
          ph: {
            value: 7.2,
            n_samples: 20,
            series: [{ start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean: 7.2, min: 7, max: 7.4, n: 20 }],
          },
        },
      }),
      deviceRecord: async () => null,
    } as unknown as QuerySensorData;
    const result = await new GenerateReport({ sensor: stubSensor }).run({ time_range: "last week" }, CALLER);

    expect(result.report_request).toEqual({ time_range: "last week" });
  });

  it("refuses to generate a report for a caller who sent no token", async () => {
    // Thrown, not returned as `{ error }`: the model cannot reword its way out of the request
    // having had no credentials, and the readings are only ever fetched as the caller.
    const tool = new GenerateReport({ sensor: makeSensor() });

    await expect(tool.run({ time_range: "last day", device: "Algalita" }))
      .rejects.toMatchObject({ status: 401, code: "caller_token_required" });
  });

  it("names each numeric metric's baseline source, since all five now come from the device "
    + "registry rather than any reference table", async () => {
    // The reference table was vetoed in full (2026-09-13, docs/timeline.md); every numeric
    // baseline is this device's own operator-configured registry threshold now, or nothing at
    // all. The recorded /devices fixture has the Algalita Pod at pH 6-10, DO 4-15, ORP 50-400,
    // conductivity 40000-75000, temperature 50-80 °F -- none of which sit at a probe's physical
    // floor or ceiling, so none carry a blind-spot clause.
    const tool = new GenerateReport({ sensor: makeSensor() });
    const result = await tool.run({ time_range: "last day", device: "Algalita" }, CALLER);

    expect(result.baseline_provenance).toEqual({
      temperature: "50-80 °F (configured)",
      ph: "6-10 (configured)",
      dissolved_oxygen: "4-15 mg/L (configured)",
      orp: "50-400 mV (configured)",
      conductivity: "40000-75000 µS/cm (configured)",
    });
  });

  it("surfaces an error from buildReportInput rather than throwing", async () => {
    const tool = new GenerateReport({ sensor: makeSensor() });
    const result = await tool.run({ time_range: "since the storm", device: "Algalita" }, CALLER);

    expect(result.error).toBeDefined();
    expect(result).not.toHaveProperty("report_request");
  });

  describe("the reason behind the status", () => {
    // CONVERSATION_QA_2026-09-24 finding 3, as observed live on Old Woman Creek 2026: ORP dipped
    // below its configured 0-800 mV, the status came back "Action Required" with no events, and
    // with nothing saying why, the model wrote "Action Required" beside "no abnormal conditions".
    const flat = (value: number) => ([
      { start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean: value, min: value, max: value, n: 20 },
    ]);
    const orpSeries = [
      { start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean: 300, min: 250, max: 350, n: 20 },
      { start: "2026-08-01T12:00:00.000Z", end: "2026-08-02T00:00:00.000Z", mean: -156.25, min: -160, max: -150, n: 20 },
    ];
    const LAST_READING = "2026-08-02T00:00:00.000Z";
    const stubSensor = (orp: unknown[], now = Date.parse("2026-08-12T00:00:00.000Z")) => ({
      query: async () => ({
        device: { name: "Old Woman Creek 2026", label: "dev:owc", operating_environment: "fresh-water" },
        time_range_resolved: { start: "2026-07-26T00:00:00.000Z", end: LAST_READING },
        device_last_reported: LAST_READING,
        metrics: {
          temperature: { value: 70, n_samples: 40, series: flat(70) },
          ph: { value: 7.5, n_samples: 40, series: flat(7.5) },
          orp: { value: 72, n_samples: 40, series: orp },
        },
      }),
      deviceRecord: async () => ({
        label: "dev:owc",
        thresholds: {
          minPH: "6", maxPH: "9", minORP: "0", maxORP: "800", minTemperature: "30", maxTemperature: "100",
        },
      }),
      clockMs: () => now,
    } as unknown as QuerySensorData);

    it("names the parameter behind an Exceedance, with its range against the threshold", async () => {
      const result = await new GenerateReport({ sensor: stubSensor(orpSeries) })
        .run({ time_range: "last week", device: "Old Woman Creek" }, CALLER);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe("Action Required");
      expect(result.events_flagged).toBe(0);
      expect(result.parameter_flags).toMatchObject({ orp: "Exceedance", ph: "Normal", temperature: "Normal" });
      expect(result.status_reason).toContain("orp ranged from -160.00 to 350.00 mV against its configured 0 to 800 mV");
      expect(result.status_reason).toContain("independent of the event count");
    });

    it("gives a Normal report a reason that names no parameter", async () => {
      const result = await new GenerateReport({ sensor: stubSensor(flat(300)) })
        .run({ time_range: "last week", device: "Old Woman Creek" }, CALLER);

      expect(result.status).toBe("Normal");
      expect(result.status_reason).toMatch(/^Normal: every parameter with a configured threshold stayed within it/);
      expect(result.parameter_flags).toMatchObject({ orp: "Normal" });
    });

    it("says how long ago the period's last reading was, so a silent pod's window is not read as current", async () => {
      const result = await new GenerateReport({ sensor: stubSensor(flat(300)) })
        .run({ time_range: "last week", device: "Old Woman Creek" }, CALLER);

      expect(result).toMatchObject({
        device_last_reported: LAST_READING,
        device_last_reported_age: "10 days",
        device_last_reported_stale: true,
      });
    });
  });

  it("reports Not assessed, not Normal, for a device with no usable registry threshold on any "
    + "numeric parameter", async () => {
    // A device whose registry row cannot be read (deviceRecord() -> null) or carries no
    // thresholds at all leaves every numeric row with no baseline -- flagFor never returns
    // Elevated/Low/Exceedance, so the old overallStatus fell through to "Normal". The model-
    // facing status must say "Not assessed" instead, and baseline_provenance must not claim the
    // ordinary "not configured" wording when the failure was a registry lookup, not an empty row.
    const seriesFor = (mean: number, min: number, max: number) => ([
      { start: "2026-08-01T00:00:00.000Z", end: "2026-08-01T12:00:00.000Z", mean, min, max, n: 20 },
    ]);
    const stubSensor = {
      query: async () => ({
        device: { name: "Unreachable Pod", label: "dev:unreachable", operating_environment: "salt-water" },
        time_range_resolved: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
        metrics: {
          temperature: { value: 68, n_samples: 20, series: seriesFor(68, 64, 72) },
          ph: { value: 7.2, n_samples: 20, series: seriesFor(7.2, 7.0, 7.4) },
        },
      }),
      deviceRecord: async () => null,
    } as unknown as QuerySensorData;
    const tool = new GenerateReport({ sensor: stubSensor });
    const result = await tool.run({ time_range: "last week" }, CALLER);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe("Not assessed");
    expect(result.baseline_provenance).toMatchObject({
      temperature: expect.stringContaining("could not be read"),
      ph: expect.stringContaining("could not be read"),
    });
  });
});

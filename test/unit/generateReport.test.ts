import fs from "fs";
import os from "os";
import path from "path";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import { QuerySensorData } from "../../src/tools/querySensorData";
import { GenerateReport, generateReportDefinition } from "../../src/tools/generateReport";
import { isReportOwner } from "../../src/report/reportOwnership";

/**
 * generate_report end to end: builds a real PDF on disk from recorded device-api fixtures (same
 * ones querySensorData.test.ts and buildReportInput.test.ts use), offline throughout. Confirms
 * the tool's contract with the model -- what JSON comes back, since that (not the PDF bytes)
 * is what gets JSON-stringified into the chat's tool message (ChatOrchestrator.ts).
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

/**
 * The caller's bearer token, which a report is now *bound* to: `reportOwnership.ts` records a
 * hash of it beside the PDF so `GET /api/v1/reports/:filename` can refuse a token that did not
 * generate the document. Without it `run()` throws rather than writing a PDF nobody could read.
 */
const CALLER = { token: "caller-jwt" };

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "generate-report-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generate_report — tool definition", () => {
  it("is named generate_report and requires only time_range", () => {
    expect(generateReportDefinition.function.name).toBe("generate_report");
    expect(generateReportDefinition.function.parameters.required).toEqual(["time_range"]);
  });
});

describe("GenerateReport.run", () => {
  it("rejects a call with no time_range instead of guessing one", async () => {
    const tool = new GenerateReport({ sensor: makeSensor(), reportsDir: tmpDir });
    const result = await tool.run({});
    expect(result.error).toContain("time_range");
  });

  it("produces a PDF on disk and returns a status, event count, and report_url -- no raw numbers", async () => {
    const tool = new GenerateReport({ sensor: makeSensor(), reportsDir: tmpDir });
    const result = await tool.run({ time_range: "last day", device: "Algalita" }, CALLER);

    expect(result.error).toBeUndefined();
    expect(["Normal", "Watch", "Action Required"]).toContain(result.status);
    expect(typeof result.events_flagged).toBe("number");
    expect(Array.isArray(result.event_types)).toBe(true);
    expect(result.report_url).toMatch(/^\/api\/v1\/reports\/report_[a-f0-9]{8}\.pdf$/);

    // The tool result is JSON.stringify'd straight into a chat message (ChatOrchestrator.ts) --
    // it must not carry the underlying readings, only the summary fields.
    expect(JSON.stringify(result)).not.toMatch(/dissolved_oxygen|"value":|"mean":/);

    const filename = (result.report_url as string).split("/").pop()!;
    const pdfPath = path.join(tmpDir, filename);
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(fs.statSync(pdfPath).size).toBeGreaterThan(0);
  });

  it("binds the PDF to the token that generated it, and to no other", async () => {
    // The filename is eight hex characters and the route has no expiry, so without this the URL
    // is a guessable capability onto a named customer's readings. The bound token is the only
    // identity this service has: it cannot verify a JWT, so it cannot bind to a user id.
    const tool = new GenerateReport({ sensor: makeSensor(), reportsDir: tmpDir });
    const result = await tool.run({ time_range: "last day", device: "Algalita" }, CALLER);
    const filename = (result.report_url as string).split("/").pop()!;

    expect(isReportOwner(tmpDir, filename, CALLER.token)).toBe(true);
    // A different organization's perfectly valid token is still not this report's owner.
    expect(isReportOwner(tmpDir, filename, "some-other-orgs-jwt")).toBe(false);
  });

  it("fails closed for a report that has no ownership record at all", () => {
    // A PDF written before this existed, or one whose sidecar was removed. "Cannot establish who
    // this belongs to" must not read as "anyone".
    fs.writeFileSync(path.join(tmpDir, "report_deadbeef.pdf"), "%PDF-1.4");

    expect(isReportOwner(tmpDir, "report_deadbeef.pdf", CALLER.token)).toBe(false);
  });

  it("refuses to generate a report for a caller who sent no token", async () => {
    // Thrown, not returned as `{ error }`: the model cannot reword its way out of the request
    // having had no credentials. And a report generated anonymously would have nobody to bind
    // to, so it would be written and then be unreadable by everyone, forever.
    const tool = new GenerateReport({ sensor: makeSensor(), reportsDir: tmpDir });

    await expect(tool.run({ time_range: "last day", device: "Algalita" }))
      .rejects.toMatchObject({ status: 401, code: "caller_token_required" });
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  it("names the temperature baseline's source, since it is the one row not from the doc's table", async () => {
    // The source-of-truth document gives temperature no fixed range and asks for a site-specific
    // baseline instead; that baseline is this device's operator-set registry threshold. The
    // recorded /devices fixture has the Algalita Pod at 50-80 °F.
    const tool = new GenerateReport({ sensor: makeSensor(), reportsDir: tmpDir });
    const result = await tool.run({ time_range: "last day", device: "Algalita" }, CALLER);

    expect(result.temperature_baseline).toBe(
      "50-80 °F (operator-set threshold for this device, from the device registry)",
    );
  });

  it("surfaces an error from buildReportInput rather than throwing", async () => {
    const tool = new GenerateReport({ sensor: makeSensor(), reportsDir: tmpDir });
    const result = await tool.run({ time_range: "since the storm", device: "Algalita" }, CALLER);

    expect(result.error).toBeDefined();
    expect(fs.readdirSync(tmpDir)).toHaveLength(0); // no partial PDF left behind on failure
  });
});

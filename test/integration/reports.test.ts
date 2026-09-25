import request from "supertest";
import fs from "fs";
import path from "path";
import type { Express } from "express";

/**
 * `POST /api/v1/reports` end to end: `requireCallerToken`, the report quota gate, the real report
 * pipeline and PDF renderer. Only `fetch` is faked, with recorded device-API bodies. No model, no
 * network, no disk.
 *
 * What this pins, against the disk-backed design it replaced: the PDF comes back in the response
 * and nothing is written anywhere, every device read carries the caller's own token, and a report
 * is refused before any device read when the caller is anonymous, over quota, or the deployment
 * has reports switched off.
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

const DEVICES = load("devices.json");
const ALGALITA_PERIOD = load("algalita-period-1-day.json") as Array<Record<string, unknown>>;

/** `/water/last` reports temperature in °F, unlike `/water/period`; see generateReport.test.ts. */
const ALGALITA_LAST = (() => {
  const newest = [...ALGALITA_PERIOD].sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0];
  const water = newest.water_data as Record<string, number>;
  return {
    id: "algalita-last",
    data: { ...newest, water_data: { ...water, 102: water[102] * (9 / 5) + 32 } },
  };
})();

const REPORTS = "/api/v1/reports";
const CALLER = "Bearer caller-jwt";
const RELOAD_TIMEOUT_MS = 60_000;
const GENERATED_REPORTS = path.join(process.cwd(), "generated_reports");

const ENV_VARS = [
  "REPORT_TOOL", "SENSOR_TOOL", "DEFAULT_RETRIEVAL", "DEVICE_API_BASE_URL", "DEVICE_API_TOKEN",
  "SENSOR_DEVICE_LABEL", "WATER_TYPE", "QUERY_QUOTA", "QUERY_QUOTA_REPORTS",
  "QUERY_QUOTA_REQUESTS", "QUERY_QUOTA_WINDOW",
];

const loadAppWith = (env: Record<string, string>): Express => {
  jest.resetModules();
  ENV_VARS.forEach((name) => { delete process.env[name]; });
  Object.entries({
    REPORT_TOOL: "true",
    SENSOR_TOOL: "false",
    DEFAULT_RETRIEVAL: "stub",
    DEVICE_API_BASE_URL: "https://example.invalid/api/v1",
    DEVICE_API_TOKEN: "deployment-token",
    SENSOR_DEVICE_LABEL: "",
    WATER_TYPE: "saltwater",
    QUERY_QUOTA: "false",
    ...env,
  }).forEach(([key, value]) => { process.env[key] = value; });
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require("../../src/app").default as Express;
};

/** Collects a binary body; supertest leaves an unrecognised content type unparsed otherwise. */
const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};

const originalFetch = global.fetch;
let fetchCalls: Array<{ url: string; auth?: string }> = [];

beforeEach(() => {
  fetchCalls = [];
  global.fetch = (async (url: string, init?: RequestInit) => {
    const auth = ((init?.headers ?? {}) as Record<string, string>).Authorization;
    fetchCalls.push({ url: String(url), auth });
    const body = ((): unknown => {
      if (String(url).includes("/devices")) return DEVICES;
      if (String(url).includes("/water/last/")) return ALGALITA_LAST;
      if (String(url).includes("/water/period/")) return ALGALITA_PERIOD;
      return {};
    })();
    return {
      ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  ENV_VARS.forEach((name) => { delete process.env[name]; });
});

describe("POST /api/v1/reports", () => {
  it("returns the PDF as a download, read with the caller's own token, and writes nothing to disk", async () => {
    const app = loadAppWith({});
    const existedBefore = fs.existsSync(GENERATED_REPORTS);

    const response = await request(app)
      .post(REPORTS)
      .set("Authorization", CALLER)
      .send({ time_range: "last day", device: "Algalita" })
      .buffer(true)
      .parse(binary)
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["content-disposition"])
      .toMatch(/^attachment; filename="cer-report-[a-z0-9-]+-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.body as Buffer;
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(Number(response.headers["content-length"])).toBe(body.length);

    expect(fetchCalls.length).toBeGreaterThan(0);
    // Every read is the caller's, never the deployment's own credential.
    expect(new Set(fetchCalls.map((call) => call.auth))).toEqual(new Set([CALLER]));
    expect(fs.existsSync(GENERATED_REPORTS)).toBe(existedBefore);
  }, RELOAD_TIMEOUT_MS);

  it("refuses an anonymous caller before any device read", async () => {
    const app = loadAppWith({});

    const response = await request(app).post(REPORTS).send({ time_range: "last day" }).expect(401);

    expect(response.body.code).toBe("caller_token_required");
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(fetchCalls).toHaveLength(0);
  }, RELOAD_TIMEOUT_MS);

  it("is off while REPORT_TOOL is off", async () => {
    const app = loadAppWith({ REPORT_TOOL: "false" });

    await request(app)
      .post(REPORTS)
      .set("Authorization", CALLER)
      .send({ time_range: "last day", device: "Algalita" })
      .expect(404);
    expect(fetchCalls).toHaveLength(0);
  }, RELOAD_TIMEOUT_MS);

  it("rejects a missing or oversized time_range without reading any device", async () => {
    const app = loadAppWith({});

    await request(app).post(REPORTS).set("Authorization", CALLER).send({}).expect(400);
    await request(app)
      .post(REPORTS)
      .set("Authorization", CALLER)
      .send({ time_range: "x".repeat(101) })
      .expect(400);
    await request(app)
      .post(REPORTS)
      .set("Authorization", CALLER)
      .send({ time_range: "last day", device: 7 })
      .expect(400);
    expect(fetchCalls).toHaveLength(0);
  }, RELOAD_TIMEOUT_MS);

  it("answers 422 with the pipeline's own reason for a range it cannot read, and counts nothing", async () => {
    const app = loadAppWith({ QUERY_QUOTA: "true", QUERY_QUOTA_REPORTS: "1", QUERY_QUOTA_WINDOW: "1d" });

    const failed = await request(app)
      .post(REPORTS)
      .set("Authorization", CALLER)
      .send({ time_range: "since the storm", device: "Algalita" })
      .expect(422);
    expect(failed.body.error).toBeTruthy();

    const usage = await request(app).get("/api/v1/usage").set("Authorization", CALLER).expect(200);
    expect(usage.body.reports).toEqual({
      used: 0, limit: 1, remaining: 1, nearLimit: true,
    });
  }, RELOAD_TIMEOUT_MS);

  it("counts a rendered report and refuses the next one with quota_reports_exceeded", async () => {
    const app = loadAppWith({
      QUERY_QUOTA: "true", QUERY_QUOTA_REPORTS: "1", QUERY_QUOTA_REQUESTS: "5", QUERY_QUOTA_WINDOW: "1d",
    });
    const ask = () => request(app)
      .post(REPORTS)
      .set("Authorization", CALLER)
      .send({ time_range: "last day", device: "Algalita" })
      .buffer(true)
      .parse(binary);

    await ask().expect(200);
    const readsAfterFirst = fetchCalls.length;
    const refused = await request(app)
      .post(REPORTS)
      .set("Authorization", CALLER)
      .send({ time_range: "last day", device: "Algalita" })
      .expect(429);

    expect(refused.body.code).toBe("quota_reports_exceeded");
    expect(refused.headers["retry-after"]).toBeDefined();
    // Refused at the gate: the second report spent no device reads.
    expect(fetchCalls.length).toBe(readsAfterFirst);

    // A report is not a question: the chat allowance is untouched.
    const usage = await request(app).get("/api/v1/usage").set("Authorization", CALLER).expect(200);
    expect(usage.body.reports).toEqual({
      used: 1, limit: 1, remaining: 0, nearLimit: false,
    });
    expect(usage.body.questions).toEqual({
      used: 0, limit: 5, remaining: 5, nearLimit: false,
    });
  }, RELOAD_TIMEOUT_MS);

  it("no longer serves GET /api/v1/reports/:filename", async () => {
    const app = loadAppWith({});

    await request(app)
      .get("/api/v1/reports/report_deadbeef.pdf")
      .set("Authorization", CALLER)
      .expect(404);
  }, RELOAD_TIMEOUT_MS);
});

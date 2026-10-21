import request from "supertest";
import fs from "fs";
import path from "path";
import type { Express } from "express";

/**
 * The report-claim check (`src/report/delivery.ts`) through `POST /api/v1/chat`, with the sensor
 * and report tools both on. Only the model (a scripted queue) and `fetch` (recorded device-API
 * bodies) are faked; offline, no token, no cost.
 *
 * A reading-QC explanation (`readingQc.ts`) uses the verbs of an omit delivery ("excluded",
 * "removed"), and read as a claim it forced a `generate_report` round in a chat that never asked
 * for a report.
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
const DEVICES = load("devices.json");
const ALGALITA_PERIOD = load("algalita-period-1-day.json");

let script: Array<Record<string, unknown>> = [];
let forced: Array<string | undefined> = [];

jest.mock("../../src/services/LlmService", () => ({
  LlmService: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockImplementation(async (_m: unknown[], _t?: unknown[], forceTool?: string) => {
      forced.push(forceTool);
      const next = script.shift() ?? { content: "fallback", toolCalls: [] };
      return {
        model: "test-model", usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 }, ...next,
      };
    }),
    completeStream: jest.fn(),
  })),
}));

const RELOAD_TIMEOUT_MS = 60_000;
const originalFetch = global.fetch;

const loadApp = (): Express => {
  jest.resetModules();
  Object.assign(process.env, {
    SENSOR_TOOL: "true",
    REPORT_TOOL: "true",
    DEFAULT_RETRIEVAL: "stub",
    DEVICE_API_BASE_URL: "https://example.invalid/api/v1",
    DEVICE_API_TOKEN: "test-token",
    SENSOR_DEVICE_LABEL: "dev:351077454569099",
    WATER_TYPE: "saltwater",
  });
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require("../../src/app").default as Express;
};

const sensorCall = {
  content: "",
  toolCalls: [{
    id: "call_1",
    type: "function",
    function: {
      name: "query_sensor_data",
      arguments: JSON.stringify({ metric: "dissolved_oxygen", time_range: "last 7 days", aggregation: "mean" }),
    },
  }],
};

beforeEach(() => {
  script = [];
  forced = [];
  global.fetch = (async (url: string) => {
    const body = String(url).includes("/devices") ? DEVICES : ALGALITA_PERIOD;
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  ["SENSOR_TOOL", "REPORT_TOOL", "SENSOR_DEVICE_LABEL"].forEach((key) => delete process.env[key]);
});

describe("POST /api/v1/chat report-claim check", () => {
  it.each([
    "Dissolved oxygen averaged 9.6 mg/L. Two flat-line readings were excluded from the report period's average.",
    "Dissolved oxygen is in range; spike readings are removed before the report's verdicts are worked out.",
  ])("leaves a reading-QC explanation alone: %s", async (qcAnswer) => {
    script = [sensorCall, { content: qcAnswer, toolCalls: [] }];

    const response = await request(loadApp()).post("/api/v1/chat")
      .set("Authorization", "Bearer caller-jwt")
      .send({ query: "Is the dissolved oxygen OK this week?" })
      .expect(200);

    expect(forced).not.toContain("generate_report");
    expect(response.body.answer).toContain(qcAnswer);
    expect(response.body.tool_calls.map((call: { name: string }) => call.name)).toEqual(["query_sensor_data"]);
  }, RELOAD_TIMEOUT_MS);

  it("still forces generate_report for a delivery claim with no report", async () => {
    script = [
      { content: "Done: the turbidity notes are left out of this copy. Use the Download report button.", toolCalls: [] },
      { content: "", toolCalls: [] },
    ];

    await request(loadApp()).post("/api/v1/chat")
      .set("Authorization", "Bearer caller-jwt")
      .send({ query: "Leave out the turbidity notes from the Algalita report." })
      .expect(200);

    expect(forced).toContain("generate_report");
  }, RELOAD_TIMEOUT_MS);
});

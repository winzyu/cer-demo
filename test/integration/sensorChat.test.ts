import request from "supertest";
import fs from "fs";
import path from "path";
import type { Express } from "express";

/**
 * `query_sensor_data` end to end through `POST /api/v1/chat` — the Phase N3 definition of done.
 *
 * Two things are faked and nothing else: the **model** (a scripted queue, so the tool call is
 * deterministic rather than bought) and **`fetch`** (recorded device-API bodies from
 * `test/fixtures/device-api/`). Everything between them is the real thing — the orchestration
 * loop, tool dispatch, `DeviceApiClient`, the metric decoder, the aggregations.
 *
 * Offline, no token, no cost.
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

const DEVICES = load("devices.json");
const ALGALITA_PERIOD = load("algalita-period-1-day.json");
const ALGALITA = "dev:351077454569099";
const OWC = "Old Woman Creek 2026";

/** Scripted model responses, replaced per test. */
let script: Array<Record<string, unknown>> = [];
let sent: Array<{ messages: unknown[]; tools?: unknown[] }> = [];

jest.mock("../../src/services/LlmService", () => ({
  LlmService: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockImplementation(async (messages: unknown[], tools?: unknown[]) => {
      sent.push({ messages, tools });
      const next = script.shift() ?? { content: "fallback", model: "test-model", toolCalls: [] };
      return {
        model: "test-model", usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 }, ...next,
      };
    }),
    completeStream: jest.fn(),
  })),
}));

const CHAT = "/api/v1/chat";
const RELOAD_TIMEOUT_MS = 60_000;

const loadAppWith = (env: Record<string, string>): Express => {
  jest.resetModules();
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require("../../src/app").default as Express;
};

const SENSOR_ENV = {
  SENSOR_TOOL: "true",
  // Pinned, or the suite inherits the developer's `.env` and runs the direct-feed arm against
  // the gitignored `data/corpus/corpus.json` — green here, 500 on a fresh clone. The tool loop
  // is what these tests assert; the retrieval arm underneath it should be the inert one.
  DEFAULT_RETRIEVAL: "stub",
  DEVICE_API_BASE_URL: "https://example.invalid/api/v1",
  DEVICE_API_TOKEN: "test-token",
  SENSOR_DEVICE_LABEL: ALGALITA,
  WATER_TYPE: "saltwater",
};

/**
 * The same deployment with **no** `SENSOR_DEVICE_LABEL` — the shipped default, and the case the
 * request's `device` exists for. The recorded registry holds four distinct pods, so with no
 * default and no argument the tool's correct answer is "tell me which pod you mean".
 */
const NO_DEFAULT_ENV = { ...SENSOR_ENV, SENSOR_DEVICE_LABEL: "" };

const originalFetch = global.fetch;
const fetchCalls: string[] = [];
/** Authorization header of every upstream call, so token forwarding can be asserted. */
let fetchAuth: Array<string | undefined> = [];
/** Set to a status >= 400 to make every upstream call fail with it. */
let upstreamStatus = 200;

beforeEach(() => {
  script = [];
  sent = [];
  fetchCalls.length = 0;
  fetchAuth = [];
  upstreamStatus = 200;

  global.fetch = (async (url: string, init?: RequestInit) => {
    fetchCalls.push(String(url));
    fetchAuth.push(((init?.headers ?? {}) as Record<string, string>).Authorization);
    const body = String(url).includes("/devices") ? DEVICES : ALGALITA_PERIOD;
    return {
      ok: upstreamStatus < 400,
      status: upstreamStatus,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  delete process.env.SENSOR_TOOL;
  delete process.env.SENSOR_DEVICE_LABEL;
});

describe("POST /api/v1/chat with the sensor tool enabled", () => {
  it("answers a sensor question by calling the tool and reporting real recorded data", async () => {
    script = [
      {
        content: "",
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: {
            name: "query_sensor_data",
            arguments: JSON.stringify({
              metric: "dissolved_oxygen", time_range: "now", aggregation: "latest",
            }),
          },
        }],
      },
      { content: "The latest dissolved oxygen reading is 9.64 mg/L.", toolCalls: [] },
    ];

    const app = loadAppWith(SENSOR_ENV);
    const response = await request(app)
      .post(CHAT)
      .send({ query: "What's our current DO reading?" })
      .expect(200);

    expect(response.body.answer).toContain("9.64");

    // The tool trace is on the response, and it carries the value the device actually returned.
    const trace = response.body.tool_calls;
    expect(trace).toHaveLength(1);
    expect(trace[0].name).toBe("query_sensor_data");
    expect(trace[0].result.value).toBeCloseTo(9.640000343322754, 6);
    expect(trace[0].result.unit).toBe("mg/L");
    expect(trace[0].result.observed_at).toBe("2026-08-11T19:37:25.000Z");

    // Tool results are traced, never cited — a sensor reading is this deployment's own
    // measurement, not a claim attributable to a corpus document (MIGRATION_SPEC §3 rule 4).
    // Asserted on shape, because a corpus document may itself be named "sensor-reference":
    // every citation is a retrieved chunk, and none carries a tool result's fields.
    const citations = response.body.citations as Array<Record<string, unknown>>;
    expect(citations.length).toBeGreaterThan(0);
    citations.forEach((citation) => {
      expect(typeof citation.text).toBe("string");
      expect(citation).not.toHaveProperty("value");
      expect(citation).not.toHaveProperty("n_samples");
    });
  }, RELOAD_TIMEOUT_MS);

  it("offers the tool on the first round and sends the tool block in the prompt", async () => {
    script = [{ content: "Answered from context.", toolCalls: [] }];

    const app = loadAppWith(SENSOR_ENV);
    await request(app).post(CHAT).send({ query: "what is ORP?" }).expect(200);

    const tools = sent[0].tools as Array<{ function: { name: string } }>;
    expect(tools.map((tool) => tool.function.name)).toEqual(["query_sensor_data"]);

    const system = (sent[0].messages as Array<{ content: string }>)[0].content;
    expect(system).toContain("query_sensor_data");
  }, RELOAD_TIMEOUT_MS);

  it("feeds a tool result back and runs a second round", async () => {
    script = [
      {
        content: "",
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: {
            name: "query_sensor_data",
            arguments: JSON.stringify({ metric: "ph", time_range: "last day", aggregation: "mean" }),
          },
        }],
      },
      { content: "Mean pH was 7.2.", toolCalls: [] },
    ];

    const app = loadAppWith(SENSOR_ENV);
    await request(app).post(CHAT).send({ query: "average pH yesterday?" }).expect(200);

    expect(sent).toHaveLength(2);
    const second = sent[1].messages as Array<{ role: string; tool_call_id?: string }>;
    expect(second[second.length - 1]).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    // The final round still offers tools — it is round 2 of 16, not the forced text round.
    expect(sent[1].tools).toBeDefined();
  }, RELOAD_TIMEOUT_MS);

  it("sums usage across both rounds", async () => {
    script = [
      {
        content: "",
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: {
            name: "query_sensor_data",
            arguments: JSON.stringify({ metric: "ph", time_range: "now", aggregation: "latest" }),
          },
        }],
      },
      { content: "pH is 7.13.", toolCalls: [] },
    ];

    const app = loadAppWith(SENSOR_ENV);
    const response = await request(app).post(CHAT).send({ query: "pH now?" }).expect(200);

    expect(response.body.usage.totalTokens).toBe(24);
  }, RELOAD_TIMEOUT_MS);

  it("returns a tool error to the model rather than failing the request", async () => {
    script = [
      {
        content: "",
        toolCalls: [{
          id: "call_1",
          type: "function",
          function: {
            name: "query_sensor_data",
            arguments: JSON.stringify({ metric: "salinity", time_range: "now", aggregation: "latest" }),
          },
        }],
      },
      { content: "That sensor does not measure salinity.", toolCalls: [] },
    ];

    const app = loadAppWith(SENSOR_ENV);
    const response = await request(app).post(CHAT).send({ query: "salinity?" }).expect(200);

    expect(response.body.tool_calls[0].result.error).toContain("salinity");
    expect(response.body.answer).toContain("does not measure salinity");
  }, RELOAD_TIMEOUT_MS);
});

/**
 * `device` on the request — the pod the UI already chose.
 *
 * `SENSOR_DEVICE_LABEL` is deliberately unset in this deployment (guessing between pods on
 * opposite coasts is unsafe), so without a request device the tool has to stop and ask. These
 * cover the gap it fills and the one thing it must never do: overrule the model.
 */
describe("POST /api/v1/chat with a device on the request", () => {
  const latestPh = (args: Record<string, unknown> = {}) => ({
    content: "",
    toolCalls: [{
      id: "call_1",
      type: "function",
      function: {
        name: "query_sensor_data",
        arguments: JSON.stringify({
          metric: "ph", time_range: "now", aggregation: "latest", ...args,
        }),
      },
    }],
  });

  it("asks which pod when nothing names one", async () => {
    // The behavior the request device replaces — pinned so the gap it fills stays visible.
    script = [latestPh(), { content: "Which pod did you mean?", toolCalls: [] }];

    const app = loadAppWith(NO_DEFAULT_ENV);
    const response = await request(app).post(CHAT).send({ query: "pH now?" }).expect(200);

    expect(response.body.tool_calls[0].result.error).toMatch(/"device" is required/);
  }, RELOAD_TIMEOUT_MS);

  it("uses the pod from the request when the model named none", async () => {
    script = [latestPh(), { content: "pH is 7.13.", toolCalls: [] }];

    const app = loadAppWith(NO_DEFAULT_ENV);
    const response = await request(app)
      .post(CHAT)
      .send({ query: "pH now?", device: "Algalita Pod" })
      .expect(200);

    const trace = response.body.tool_calls[0];
    expect(trace.arguments.device).toBe("Algalita Pod");
    expect(trace.result.error).toBeUndefined();
    expect(trace.result.device.label).toBe(ALGALITA);
  }, RELOAD_TIMEOUT_MS);

  it("lets a device the model named beat the one on the request", async () => {
    // The user asked about another pod inside the question; that is the more specific
    // instruction, and the selector must not silently redirect it.
    script = [latestPh({ device: OWC }), { content: "pH is 7.13.", toolCalls: [] }];

    const app = loadAppWith(NO_DEFAULT_ENV);
    const response = await request(app)
      .post(CHAT)
      .send({ query: "pH at Old Woman Creek?", device: "Algalita Pod" })
      .expect(200);

    const trace = response.body.tool_calls[0];
    expect(trace.arguments.device).toBe(OWC);
    expect(trace.result.device.name).toBe(OWC);
  }, RELOAD_TIMEOUT_MS);

  it("returns an unknown device as a recoverable tool error, not a 400", async () => {
    // The caller may be a stale UI naming a pod that has since gone. A 400 would end the
    // request; a tool result lets the model say so and recover in the next round.
    script = [latestPh(), { content: "I could not find that pod.", toolCalls: [] }];

    const app = loadAppWith(NO_DEFAULT_ENV);
    const response = await request(app)
      .post(CHAT)
      .send({ query: "pH now?", device: "Pod That Does Not Exist" })
      .expect(200);

    expect(response.body.tool_calls[0].result.error).toContain("No device matches");
    expect(response.body.answer).toContain("could not find that pod");
  }, RELOAD_TIMEOUT_MS);
});

describe("POST /api/v1/chat with the sensor tool disabled", () => {
  it("makes one tool-free call and returns the pre-N3 response shape", async () => {
    // The default. This path must stay identical to what the three captured bake-off arms ran
    // against while ◆G7 is open (RETRIEVAL_BAKEOFF.md §4).
    script = [{ content: "Answered from context.", toolCalls: [] }];

    const app = loadAppWith({ ...SENSOR_ENV, SENSOR_TOOL: "false" });
    const response = await request(app).post(CHAT).send({ query: "what is ORP?" }).expect(200);

    expect(sent).toHaveLength(1);
    expect(sent[0].tools).toBeUndefined();
    expect(response.body).not.toHaveProperty("tool_calls");
    expect(response.body).not.toHaveProperty("tool_round_cap_reached");

    const system = (sent[0].messages as Array<{ content: string }>)[0].content;
    expect(system).not.toContain("query_sensor_data");
  }, RELOAD_TIMEOUT_MS);

  it("never touches the device API", async () => {
    script = [{ content: "Answered from context.", toolCalls: [] }];

    const app = loadAppWith({ ...SENSOR_ENV, SENSOR_TOOL: "false" });
    await request(app).post(CHAT).send({ query: "what is ORP?" }).expect(200);

    expect(fetchCalls).toHaveLength(0);
  }, RELOAD_TIMEOUT_MS);

  it("accepts a device on the request and does nothing with it", async () => {
    // A UI that always sends the selected pod must not break when the flag is off, and it must
    // not drag a `tools` array into the request that the bake-off arms were captured without.
    script = [{ content: "Answered from context.", toolCalls: [] }];

    const app = loadAppWith({ ...SENSOR_ENV, SENSOR_TOOL: "false" });
    const response = await request(app)
      .post(CHAT)
      .send({ query: "what is ORP?", device: "Algalita Pod" })
      .expect(200);

    expect(sent).toHaveLength(1);
    expect(sent[0].tools).toBeUndefined();
    expect(response.body).not.toHaveProperty("tool_calls");
    expect(response.body).not.toHaveProperty("tool_round_cap_reached");
    expect(fetchCalls).toHaveLength(0);
  }, RELOAD_TIMEOUT_MS);
});

describe("POST /api/v1/chat forwards the caller's identity to the device API", () => {
  it("uses the caller's bearer token for every upstream call, not the deployment's", async () => {
    // The device API scopes `/devices` and `/water/*` to the token holder's organization, so a
    // fallback slipping into any one of these calls reads another org's fleet.
    script = [
      {
        content: "",
        toolCalls: [{
          id: "call_1",
          type: "function" as const,
          function: {
            name: "query_sensor_data",
            arguments: JSON.stringify({
              metric: "ph", time_range: "last 24 hours", aggregation: "mean",
            }),
          },
        }],
      },
      { content: "pH averaged 7.9.", toolCalls: [] },
    ];

    const app = loadAppWith(SENSOR_ENV);
    await request(app)
      .post(CHAT)
      .set("Authorization", "Bearer caller-jwt")
      .send({ query: "what is the pH?" })
      .expect(200);

    expect(fetchAuth.length).toBeGreaterThan(0);
    fetchAuth.forEach((auth) => expect(auth).toBe("Bearer caller-jwt"));
  }, RELOAD_TIMEOUT_MS);

  it("falls back to DEVICE_API_TOKEN when the caller sends no bearer token", async () => {
    script = [
      {
        content: "",
        toolCalls: [{
          id: "call_1",
          type: "function" as const,
          function: {
            name: "query_sensor_data",
            arguments: JSON.stringify({
              metric: "ph", time_range: "last 24 hours", aggregation: "mean",
            }),
          },
        }],
      },
      { content: "pH averaged 7.9.", toolCalls: [] },
    ];

    const app = loadAppWith(SENSOR_ENV);
    await request(app).post(CHAT).send({ query: "what is the pH?" }).expect(200);

    expect(fetchAuth.length).toBeGreaterThan(0);
    fetchAuth.forEach((auth) => expect(auth).toBe("Bearer test-token"));
  }, RELOAD_TIMEOUT_MS);

  it("surfaces an expired device token as a coded error instead of prose in a 200", async () => {
    // `device_auth_expired` is terminal by design — this service has no refresh path. Returned
    // as a tool result it becomes something the model paraphrases inside a successful answer,
    // and the UI gets no machine-readable signal to act on.
    upstreamStatus = 401;
    script = [
      {
        content: "",
        toolCalls: [{
          id: "call_1",
          type: "function" as const,
          function: {
            name: "query_sensor_data",
            arguments: JSON.stringify({
              metric: "ph", time_range: "last 24 hours", aggregation: "mean",
            }),
          },
        }],
      },
    ];

    const app = loadAppWith(SENSOR_ENV);
    const response = await request(app)
      .post(CHAT)
      .send({ query: "what is the pH?" })
      .expect(401);

    expect(response.body.code).toBe("device_auth_expired");
    expect(response.body).not.toHaveProperty("status");
  }, RELOAD_TIMEOUT_MS);
});

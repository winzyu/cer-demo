import request from "supertest";
import type { Express } from "express";

// Mocked wholesale, like chat.test.ts: these assert the gate's HTTP behavior, and no suite
// should need a key or spend money. `totalTokens: 120` is what the token-dimension tests count.
jest.mock("../../src/services/LlmService", () => ({
  LlmService: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      content: "Stubbed model answer.",
      model: "test-model",
      toolCalls: [],
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    }),
    completeStream: jest.fn().mockImplementation(async function* completeStream() {
      yield { text: "Stubbed streamed answer.", model: "test-model" };
      yield { model: "test-model", usage: { totalTokens: 120 } };
    }),
  })),
}));

const CHAT = "/api/v1/chat";
const RELOAD_TIMEOUT_MS = 60_000;

const QUOTA_VARS = [
  "QUERY_QUOTA",
  "QUERY_QUOTA_REQUESTS",
  "QUERY_QUOTA_TOKENS",
  "QUERY_QUOTA_WINDOW",
  "QUERY_QUOTA_SCOPE",
];

/**
 * A fresh app, and therefore a fresh in-process counter map, per configuration.
 *
 * The quota service is a module-level singleton — it has to be, since the counters *are* the
 * shared state — so `jest.resetModules()` is what gives each test an empty one. Retrieval and
 * the tool flags are pinned for the same reason `chat.test.ts` pins them: otherwise the suite
 * becomes a function of the developer's shell.
 */
const loadAppWith = (env: Record<string, string>): Express => {
  jest.resetModules();
  QUOTA_VARS.forEach((name) => { delete process.env[name]; });
  Object.entries({
    DEFAULT_RETRIEVAL: "stub",
    DEBUG_RETRIEVAL: "false",
    SENSOR_TOOL: "false",
    REPORT_TOOL: "false",
    ...env,
  }).forEach(([key, value]) => { process.env[key] = value; });
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  return require("../../src/app").default as Express;
};

afterAll(() => {
  QUOTA_VARS.forEach((name) => { delete process.env[name]; });
  jest.resetModules();
});

const ask = (app: Express, body: Record<string, unknown> = {}) => (
  request(app).post(CHAT).send({ query: "what is ORP?", ...body })
);

describe("quota disabled (the shipped default)", () => {
  it("never refuses, even with limits set", async () => {
    // The limits are deliberately present and tiny. QUERY_QUOTA=false has to beat them, or
    // "off" would not be a single unambiguous state.
    const app = loadAppWith({
      QUERY_QUOTA: "false",
      QUERY_QUOTA_REQUESTS: "1",
      QUERY_QUOTA_TOKENS: "1",
      QUERY_QUOTA_SCOPE: "global",
    });

    await ask(app).expect(200);
    await ask(app).expect(200);
    await ask(app).expect(200);
  }, RELOAD_TIMEOUT_MS);

  it("never refuses when enabled with both dimensions unlimited", async () => {
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "unlimited",
      QUERY_QUOTA_TOKENS: "unlimited",
      QUERY_QUOTA_SCOPE: "global",
    });

    await ask(app).expect(200);
    await ask(app).expect(200);
    await ask(app).expect(200);
  }, RELOAD_TIMEOUT_MS);
});

describe("request-count quota over HTTP", () => {
  it("answers up to the limit, then refuses with a 429 in the documented body shape", async () => {
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "2",
      QUERY_QUOTA_WINDOW: "1h",
      QUERY_QUOTA_SCOPE: "global",
    });

    await ask(app).expect(200);
    await ask(app).expect(200);

    const refused = await ask(app).expect(429);

    // conventions §6: `error` mandatory, `message` mirrors it, no `status` in the body.
    expect(refused.body.error).toBe(refused.body.message);
    expect(refused.body).not.toHaveProperty("status");
    expect(refused.body.code).toBe("quota_requests_exceeded");
    expect(refused.body.error).toMatch(/2 of 2 chat requests/);
    expect(refused.body.error).toMatch(/1h window/);
    // Staged before the error reaches the terminal handler, which only writes a body.
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
  }, RELOAD_TIMEOUT_MS);

  it("does NOT charge a request that failed validation", async () => {
    // Counting happens after `parseChatRequest`, not at the gate. A typo'd body never reached
    // retrieval or the model, so billing a weekly allowance for it would be a bill for nothing.
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "1",
      QUERY_QUOTA_SCOPE: "global",
    });

    await request(app).post(CHAT).send({}).expect(400);
    await request(app).post(CHAT).send({ query: 42 }).expect(400);

    await ask(app).expect(200);
    await ask(app).expect(429);
  }, RELOAD_TIMEOUT_MS);

  it("keeps separate buckets per bearer token under caller scope", async () => {
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "1",
      QUERY_QUOTA_SCOPE: "caller",
    });

    await ask(app).set("Authorization", "Bearer user-one").expect(200);
    await ask(app).set("Authorization", "Bearer user-one").expect(429);
    // A different token is a different bucket — the per-user half of the upstream policy.
    await ask(app).set("Authorization", "Bearer user-two").expect(200);
  }, RELOAD_TIMEOUT_MS);

  it("shares one bucket across callers under global scope", async () => {
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "1",
      QUERY_QUOTA_SCOPE: "global",
    });

    await ask(app).set("Authorization", "Bearer user-one").expect(200);
    // The stand-in for the upstream organization counter.
    await ask(app).set("Authorization", "Bearer user-two").expect(429);
  }, RELOAD_TIMEOUT_MS);
});

describe("token quota over HTTP", () => {
  it("refuses once the answers already given have spent the budget", async () => {
    // The stub reports 120 tokens per answer, so a 200-token budget survives one answer and
    // is spent by the second — the documented overshoot: the request that crosses the line
    // completes, the next one is refused.
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_TOKENS: "200",
      QUERY_QUOTA_REQUESTS: "unlimited",
      QUERY_QUOTA_WINDOW: "1h",
      QUERY_QUOTA_SCOPE: "global",
    });

    await ask(app).expect(200);
    await ask(app).expect(200); // 240 recorded — over, but only known afterwards

    const refused = await ask(app).expect(429);
    expect(refused.body.code).toBe("quota_tokens_exceeded");
    expect(refused.body.error).toMatch(/240 of 200 LLM tokens/);
  }, RELOAD_TIMEOUT_MS);

  it("counts tokens spent on a STREAMED answer too", async () => {
    // Easy to get wrong: the streaming path bypasses the JSON branch entirely, and usage
    // arrives on a late chunk rather than as a return value.
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_TOKENS: "100",
      QUERY_QUOTA_REQUESTS: "unlimited",
      QUERY_QUOTA_SCOPE: "global",
    });

    await ask(app, { stream: true }).expect(200);

    const refused = await ask(app).expect(429);
    expect(refused.body.code).toBe("quota_tokens_exceeded");
  }, RELOAD_TIMEOUT_MS);
});

describe("refusing a streamed request", () => {
  it("answers with a JSON 429 and never opens the SSE stream", async () => {
    // The reason the gate is middleware. `openSseStream` writes the status line before the
    // first token, so a refusal discovered inside the handler could only be an in-band error
    // event on a 200 — unactionable. Same rule the validation 400s follow.
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "1",
      QUERY_QUOTA_SCOPE: "global",
    });

    await ask(app, { stream: true }).expect(200);

    const refused = await ask(app, { stream: true }).expect(429);

    expect(refused.headers["content-type"]).toMatch(/json/);
    expect(refused.headers["content-type"]).not.toMatch(/event-stream/);
    expect(refused.text).not.toContain("event:");
    expect(refused.body.code).toBe("quota_requests_exceeded");
  }, RELOAD_TIMEOUT_MS);
});

describe("the kill switch", () => {
  it("refuses every chat request at a limit of 0, without touching the model", async () => {
    const app = loadAppWith({
      QUERY_QUOTA: "true",
      QUERY_QUOTA_REQUESTS: "0",
      QUERY_QUOTA_SCOPE: "global",
    });

    const refused = await ask(app).expect(429);
    expect(refused.body.error).toMatch(/0 of 0 chat requests/);
  }, RELOAD_TIMEOUT_MS);
});

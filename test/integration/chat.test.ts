import request from "supertest";
import type { Express } from "express";

// The LLM is mocked for every test in this file: these assert HTTP behavior, and no test
// suite should depend on a network call, an API key, or spend money to pass.
jest.mock("../../src/services/LlmService", () => ({
  LlmService: jest.fn().mockImplementation(() => ({
    complete: jest.fn().mockResolvedValue({
      content: "Stubbed model answer.",
      model: "test-model",
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    }),
    completeStream: jest.fn().mockImplementation(async function* completeStream() {
      yield { text: "Stubbed ", model: "test-model" };
      yield { text: "streamed answer.", model: "test-model" };
      yield { model: "test-model", usage: { totalTokens: 120 } };
    }),
  })),
}));

// eslint-disable-next-line import/first
import app from "../../src/app";

const CHAT = "/api/v1/chat";

/**
 * Loads a fresh app with the given env, so the config-driven retrieval rules can be
 * exercised end to end. `config` is frozen at import, so the module cache must be reset
 * for a different DEBUG_RETRIEVAL to take effect.
 */
const loadAppWith = (env: Record<string, string>): Express => {
  jest.resetModules();
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  return require("../../src/app").default as Express;
};

describe("POST /api/v1/chat", () => {
  it("answers a valid query, with retrieval provenance attached", async () => {
    const response = await request(app)
      .post(CHAT)
      .send({ query: "what is ORP?" })
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body.answer).toBe("Stubbed model answer.");
    expect(response.body.model).toBe("test-model");
    expect(response.body.mode).toBe("stub");
    expect(response.body.usage.totalTokens).toBe(120);

    expect(Array.isArray(response.body.citations)).toBe(true);
    expect(response.body.citations.length).toBeGreaterThan(0);
    response.body.citations.forEach((citation: Record<string, unknown>) => {
      expect(typeof citation.id).toBe("string");
      expect(typeof citation.source).toBe("string");
    });
  });

  it("trims the query before retrieving", async () => {
    await request(app).post(CHAT).send({ query: "  what is ORP?  " }).expect(200);
  });

  describe("validation", () => {
    it("rejects a missing query", async () => {
      const response = await request(app).post(CHAT).send({}).expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe(response.body.message);
      expect(response.body).not.toHaveProperty("status");
    });

    it("rejects an empty or whitespace-only query", async () => {
      await request(app).post(CHAT).send({ query: "" }).expect(400);
      await request(app).post(CHAT).send({ query: "   " }).expect(400);
    });

    it("rejects a non-string query", async () => {
      await request(app).post(CHAT).send({ query: 42 }).expect(400);
    });

    it("rejects a non-string retrieval override", async () => {
      await request(app).post(CHAT).send({ query: "hi", retrieval: 7 }).expect(400);
    });

    it("rejects a non-boolean stream flag", async () => {
      await request(app).post(CHAT).send({ query: "hi", stream: "yes" }).expect(400);
    });

    it("rejects a non-object body", async () => {
      await request(app)
        .post(CHAT)
        .set("Content-Type", "application/json")
        .send('"just a string"')
        .expect(400);
    });
  });

  it("does not answer GET", async () => {
    await request(app).get(CHAT).expect(404);
  });
});

describe("POST /api/v1/chat with stream: true", () => {
  it("responds as Server-Sent Events", async () => {
    const response = await request(app)
      .post(CHAT)
      .send({ query: "what is ORP?", stream: true })
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(response.headers["cache-control"]).toMatch(/no-cache/);
    // Without this a buffering proxy delivers the whole stream at once.
    expect(response.headers["x-accel-buffering"]).toBe("no");
  });

  it("sends meta with citations before any token", async () => {
    const response = await request(app)
      .post(CHAT)
      .send({ query: "what is ORP?", stream: true })
      .expect(200);

    const body = response.text;
    expect(body.indexOf("event: meta")).toBeGreaterThanOrEqual(0);
    // Provenance must arrive before content — after the first byte, nothing can be retracted.
    expect(body.indexOf("event: meta")).toBeLessThan(body.indexOf("event: token"));

    const metaLine = body.split("\n").find((l) => l.startsWith("data: ")) as string;
    const meta = JSON.parse(metaLine.replace("data: ", ""));
    expect(meta.mode).toBe("stub");
    expect(meta.citations.length).toBeGreaterThan(0);
  });

  it("streams the answer as token events and terminates", async () => {
    const response = await request(app)
      .post(CHAT)
      .send({ query: "what is ORP?", stream: true })
      .expect(200);

    const tokens = response.text
      .split("\n\n")
      .filter((block) => block.startsWith("event: token"))
      .map((block) => JSON.parse(block.split("data: ")[1]).text);

    expect(tokens.join("")).toBe("Stubbed streamed answer.");
    expect(response.text).toContain("event: done");
    expect(response.text.trimEnd().endsWith("data: {}")).toBe(true);
  });

  it("still applies validation before opening the stream", async () => {
    // A 400 must arrive as JSON with a status code — not as an SSE error event.
    const response = await request(app).post(CHAT).send({ stream: true }).expect(400);

    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body).toHaveProperty("error");
  });
});

describe("retrieval mode selection over HTTP", () => {
  const originalDebug = process.env.DEBUG_RETRIEVAL;

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.DEBUG_RETRIEVAL;
    } else {
      process.env.DEBUG_RETRIEVAL = originalDebug;
    }
    jest.resetModules();
  });

  it("IGNORES a requested mode when DEBUG_RETRIEVAL is false", async () => {
    const scopedApp = loadAppWith({ DEBUG_RETRIEVAL: "false" });

    // Ignored, not rejected: falls back to the default rather than erroring.
    const response = await request(scopedApp)
      .post(CHAT)
      .send({ query: "what is ORP?", retrieval: "does-not-exist" })
      .expect(200);

    expect(response.body.mode).toBe("stub");
  });

  it("HONORS a requested mode when DEBUG_RETRIEVAL is true", async () => {
    const scopedApp = loadAppWith({ DEBUG_RETRIEVAL: "true" });

    const response = await request(scopedApp)
      .post(CHAT)
      .send({ query: "what is ORP?", retrieval: "stub" })
      .expect(200);

    expect(response.body.mode).toBe("stub");
  });

  it("rejects an unknown mode with a 400 when DEBUG_RETRIEVAL is true", async () => {
    const scopedApp = loadAppWith({ DEBUG_RETRIEVAL: "true" });

    const response = await request(scopedApp)
      .post(CHAT)
      .send({ query: "what is ORP?", retrieval: "does-not-exist" })
      .expect(400);

    expect(response.body.error).toMatch(/Unknown retrieval mode/);
  });
});

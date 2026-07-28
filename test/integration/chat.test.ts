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

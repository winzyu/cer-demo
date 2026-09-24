import type { Express } from "express";
import request from "supertest";
import app from "../../src/app";
import { isConfiguredValue } from "../../src/controllers/HealthController";

/** Reloading the app recompiles the tree. */
const RELOAD_TIMEOUT_MS = 60_000;

const CONFIG_KEYS = ["FIREWORKS_API_KEY", "FIRESTORE_PROJECT_ID"] as const;

/** `config` is frozen at import, so the module cache is reset for new values to take effect. */
const loadAppWith = (env: Record<(typeof CONFIG_KEYS)[number], string>): Express => {
  jest.resetModules();
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  return require("../../src/app").default as Express;
};

describe("GET /health", () => {
  it("returns 200 with status ok and diagnostic fields", async () => {
    const response = await request(app)
      .get("/health")
      .expect("Content-Type", /json/)
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("clean-earth-rag");
    expect(response.body).toHaveProperty("timestamp");
    expect(response.body).toHaveProperty("checks");
  });
});

describe("unknown route", () => {
  it("returns 404 with the { error, message } shape", async () => {
    const response = await request(app).get("/does-not-exist").expect(404);

    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toBe(response.body.message);
    expect(response.body).not.toHaveProperty("status");
  });
});

describe("isConfiguredValue", () => {
  it.each([undefined, "", "   ", "<your-fireworks-key>", "your-api-key", "YOUR_PROJECT_ID", "your key",
    "changeme", "Placeholder", "xxx", "XXXXXXXX", "TODO", "  todo  "])("treats %p as not configured", (value) => {
    expect(isConfiguredValue(value)).toBe(false);
  });

  it.each(["fw_abc123", "cer-rag-prod", "yourtown-project", "xx"])("treats %p as configured", (value) => {
    expect(isConfiguredValue(value)).toBe(true);
  });
});

describe("GET /health config checks", () => {
  const saved = Object.fromEntries(CONFIG_KEYS.map((key) => [key, process.env[key]]));

  afterAll(() => {
    CONFIG_KEYS.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  });

  it("reports placeholder values as not configured", async () => {
    const placeholderApp = loadAppWith({ FIREWORKS_API_KEY: "<your-fireworks-key>", FIRESTORE_PROJECT_ID: "changeme" });
    const response = await request(placeholderApp).get("/health").expect(200);

    expect(response.body.checks).toEqual({ fireworksConfigured: false, firestoreProjectConfigured: false });
  }, RELOAD_TIMEOUT_MS);

  it("reports real-looking values as configured", async () => {
    const configuredApp = loadAppWith({ FIREWORKS_API_KEY: "fw_test_not_a_secret", FIRESTORE_PROJECT_ID: "cer-rag-test" });
    const response = await request(configuredApp).get("/health").expect(200);

    expect(response.body.checks).toEqual({ fireworksConfigured: true, firestoreProjectConfigured: true });
  }, RELOAD_TIMEOUT_MS);
});

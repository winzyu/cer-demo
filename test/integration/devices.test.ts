import request from "supertest";
import fs from "fs";
import path from "path";
import type { Express } from "express";

/**
 * `GET /api/v1/devices` end to end — the route, the controller, `DeviceApiClient` and the
 * dedupe are all the real thing. Only `fetch` is faked, and only with **recorded** production
 * bodies from `test/fixtures/device-api/`.
 *
 * Offline, no token, no cost.
 */

const FIXTURES = path.join(__dirname, "../fixtures/device-api");
const load = (name: string): unknown => JSON.parse(
  fs.readFileSync(path.join(FIXTURES, name), "utf8"),
);

/** Six registry rows, three of them the same Algalita Pod (`DEVICE_API.md` §2). */
const DEVICES = load("devices.json");
/** Old Woman Creek's real last reading — the stale pod, 2026-08-07. */
const OWC_LAST = load("owc-last.json");
/**
 * Algalita has no recorded `/water/last` body, so its newest recorded *period* document is
 * wrapped in the `{ id, data }` envelope that route returns. Only the envelope's timestamp is
 * read here, so the fixtures' deliberate °C/°F split is not in play.
 */
const ALGALITA_LAST = {
  id: "algalita-last",
  data: (load("algalita-period-1-day.json") as unknown[])[0],
};

const ALGALITA = "dev:351077454569099";
const OWC = "dev:351077454567580";
const UNNAMED = "dev:351077454591408";
const TEST_2 = "dev:9879347923842";

const DEVICES_URL = "/api/v1/devices";
/**
 * Reloading the app under ts-jest is slow — the compile dominates, the assertions are instant —
 * so the shared-environment app is built once and only the tests that need a different
 * configuration pay for a reload.
 */
const RELOAD_TIMEOUT_MS = 120_000;

const ENV_KEYS = [
  "DEVICE_API_BASE_URL",
  "DEVICE_API_TOKEN",
  "DEVICE_API_TIMEOUT_MS",
  "WATER_TYPE",
  "SENSOR_TOOL",
  "SENSOR_DEVICE_LABEL",
];
const originalEnv = ENV_KEYS.map((key) => [key, process.env[key]] as const);

/** Rebuilds the app so `config` re-reads the environment. Mirrors `sensorChat.test.ts`. */
const loadAppWith = (env: Record<string, string>): Express => {
  jest.resetModules();
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require("../../src/app").default as Express;
};

/**
 * `DEVICE_API_TOKEN` is set but `SENSOR_TOOL` deliberately is **not**: the pod list must work on
 * the default configuration, where the model is offered no tool at all.
 */
const BASE_ENV = {
  DEVICE_API_BASE_URL: "https://example.invalid/api/v1",
  DEVICE_API_TOKEN: "dev-fallback-token",
};

/** Built once: every test that runs on the default configuration shares this instance. */
let baseApp: Express | undefined;
const appOnDefaultConfig = (): Express => {
  if (!baseApp) {
    baseApp = loadAppWith(BASE_ENV);
  }
  return baseApp;
};

const originalFetch = global.fetch;
let calls: Array<{ url: string; authorization?: string }> = [];

/** Recorded bodies, routed by URL. Anything unrecognised answers `[]`, as a silent pod does. */
const lastReadingFor = (url: string): unknown => {
  if (url.includes(encodeURIComponent(ALGALITA))) {
    return ALGALITA_LAST;
  }
  if (url.includes(encodeURIComponent(OWC))) {
    return OWC_LAST;
  }
  return [];
};

const jsonResponse = (body: unknown, status = 200): unknown => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const recordingFetch = (status = 200) => (async (url: string, init?: RequestInit) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  calls.push({ url: String(url), authorization: headers.Authorization });
  const body = String(url).includes("/devices") ? DEVICES : lastReadingFor(String(url));
  return jsonResponse(body, status);
}) as unknown as typeof fetch;

/** Never resolves; rejects with an `AbortError` when the client's own timeout fires. */
const hangingFetch = (async (url: string, init?: RequestInit) => {
  calls.push({ url: String(url) });
  return new Promise<never>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      reject(error);
    });
  });
}) as unknown as typeof fetch;

beforeEach(() => {
  calls = [];
  global.fetch = recordingFetch();
});

afterAll(() => {
  global.fetch = originalFetch;
  originalEnv.forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
});

describe("GET /api/v1/devices", () => {
  it("returns the pod list the picker is written against", async () => {
    const app = appOnDefaultConfig();
    const response = await request(app)
      .get(DEVICES_URL)
      .expect("Content-Type", /json/)
      .expect(200);

    // The whole body, pinned: this is the contract the frontend is built on.
    expect(response.body).toEqual({
      devices: [
        {
          label: ALGALITA,
          name: "Algalita Pod",
          operating_environment: "salt-water",
          last_reported: "2026-08-11T19:37:25.000Z",
        },
        {
          label: UNNAMED,
          name: UNNAMED,
          operating_environment: "salt-water",
          last_reported: null,
        },
        {
          label: OWC,
          name: "Old Woman Creek 2026",
          operating_environment: "fresh-water",
          last_reported: "2026-08-07T14:38:49.000Z",
        },
        {
          label: TEST_2,
          name: "Test 2",
          operating_environment: "fresh-water",
          last_reported: null,
        },
      ],
      // Unset in this deployment, so the configured default — and it disagrees with Algalita's
      // salt-water registration, which is exactly the mismatch the UI is meant to flag.
      water_type: "freshwater",
    });
  }, RELOAD_TIMEOUT_MS);

  it("is not gated on SENSOR_TOOL", async () => {
    // The flag governs whether the *model* gets a tool. A human picking a pod is a different
    // thing, and `SENSOR_TOOL=false` — the default — is precisely where the picker has to work.
    const app = loadAppWith({ ...BASE_ENV, SENSOR_TOOL: "false" });
    const response = await request(app).get(DEVICES_URL).expect(200);

    expect(response.body.devices.length).toBeGreaterThan(0);
  }, RELOAD_TIMEOUT_MS);

  it("reports the deployment's configured water type", async () => {
    const app = loadAppWith({ ...BASE_ENV, WATER_TYPE: "saltwater" });
    const response = await request(app).get(DEVICES_URL).expect(200);

    expect(response.body.water_type).toBe("saltwater");
  }, RELOAD_TIMEOUT_MS);

  it("collapses the three duplicate Algalita registry rows into one pod", async () => {
    const app = appOnDefaultConfig();
    const response = await request(app).get(DEVICES_URL).expect(200);

    const labels = response.body.devices.map((device: { label: string }) => device.label);
    expect(labels.filter((label: string) => label === ALGALITA)).toHaveLength(1);
    expect(new Set(labels).size).toBe(labels.length);
    // Six rows in, four pods out.
    expect((DEVICES as unknown[]).length).toBe(6);
    expect(labels).toHaveLength(4);

    // And the duplicates are collapsed *before* the reading fan-out, not after: one physical
    // pod must not be polled three times.
    const algalitaReads = calls.filter(
      (call) => call.url.includes("/water/last/") && call.url.includes(encodeURIComponent(ALGALITA)),
    );
    expect(algalitaReads).toHaveLength(1);
  }, RELOAD_TIMEOUT_MS);

  it("orders devices by name so the dropdown does not reshuffle between loads", async () => {
    const app = appOnDefaultConfig();
    const first = await request(app).get(DEVICES_URL).expect(200);
    const second = await request(app).get(DEVICES_URL).expect(200);

    const names = (body: { devices: Array<{ name: string }> }) => body.devices.map((d) => d.name);
    expect(names(first.body)).toEqual(["Algalita Pod", UNNAMED, "Old Woman Creek 2026", "Test 2"]);
    expect(names(second.body)).toEqual(names(first.body));
  }, RELOAD_TIMEOUT_MS);

  it("reports a pod with no readings as last_reported: null, not as an error", async () => {
    const app = appOnDefaultConfig();
    const response = await request(app).get(DEVICES_URL).expect(200);

    const silent = response.body.devices.find(
      (device: { label: string }) => device.label === TEST_2,
    );
    // `/water/last` answers `[]` for a pod that has never reported, or is reporting without a
    // GPS fix. Both are normal states of a real fleet.
    expect(silent.last_reported).toBeNull();
    expect(response.body.devices.every(
      (device: { label: string }) => typeof device.label === "string",
    )).toBe(true);
  }, RELOAD_TIMEOUT_MS);

  it("forwards the caller's bearer token unchanged", async () => {
    const app = appOnDefaultConfig();
    await request(app)
      .get(DEVICES_URL)
      .set("Authorization", "Bearer caller-jwt")
      .expect(200);

    // Every upstream call, not just the first: `/devices` and `/water/*` are both org-scoped to
    // the token holder, so a fallback slipping into the fan-out would read another org's fleet.
    expect(calls.length).toBeGreaterThan(1);
    calls.forEach((call) => expect(call.authorization).toBe("Bearer caller-jwt"));
  }, RELOAD_TIMEOUT_MS);

  it("falls back to DEVICE_API_TOKEN when the caller sends no bearer token", async () => {
    const app = appOnDefaultConfig();
    await request(app).get(DEVICES_URL).expect(200);

    calls.forEach((call) => expect(call.authorization).toBe("Bearer dev-fallback-token"));
  }, RELOAD_TIMEOUT_MS);

  it("surfaces an expired token as device_auth_expired and never retries it", async () => {
    global.fetch = recordingFetch(401);

    const app = appOnDefaultConfig();
    const response = await request(app).get(DEVICES_URL).expect(401);

    expect(response.body.code).toBe("device_auth_expired");
    expect(response.body.error).toMatch(/rejected the token/i);
    expect(response.body.error).toBe(response.body.message);
    // The body shape is fixed: `status` never appears in it (CONVENTIONS §6).
    expect(response.body).not.toHaveProperty("status");
    // One request, not two. This service has no refresh path, so a retry would only re-fail.
    expect(calls).toHaveLength(1);
  }, RELOAD_TIMEOUT_MS);

  it("surfaces an unresponsive device API as device_timeout", async () => {
    global.fetch = hangingFetch;

    const app = loadAppWith({ ...BASE_ENV, DEVICE_API_TIMEOUT_MS: "25" });
    const response = await request(app).get(DEVICES_URL).expect(504);

    expect(response.body.code).toBe("device_timeout");
    expect(response.body.error).toMatch(/timed out after 25ms/);
    expect(response.body).not.toHaveProperty("status");
  }, RELOAD_TIMEOUT_MS);

  it("returns a coded 503 when DEVICE_API_BASE_URL is unset, never an empty list", async () => {
    const app = loadAppWith({ DEVICE_API_TOKEN: "dev-fallback-token" });
    const response = await request(app).get(DEVICES_URL).expect(503);

    expect(response.body.code).toBe("device_unavailable");
    expect(response.body.error).toMatch(/DEVICE_API_BASE_URL/);
    // An empty `devices` array has to keep meaning "this token sees no pods". A misconfigured
    // deployment answering `[]` would tell the user their fleet had disappeared.
    expect(response.body).not.toHaveProperty("devices");
    expect(calls).toHaveLength(0);
  }, RELOAD_TIMEOUT_MS);
});

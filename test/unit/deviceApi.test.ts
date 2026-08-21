import createError from "http-errors";
import { DeviceApiClient } from "../../src/devices/DeviceApiClient";
import {
  METRICS,
  METRIC_BY_CODE,
  decodeAverages,
  decodeMetric,
  decodeReading,
} from "../../src/devices/metrics";
import { errorHandler } from "../../src/middleware/errorHandler";
import { ERROR_CODES, codedError, resolveErrorCode } from "../../src/utils/errors";
import type { FetchLike } from "../../src/devices/DeviceApiClient";
import type { NextFunction, Request, Response } from "express";

const BASE = "https://example.test/api/v1";

/** Records the calls a client makes and replies with a canned JSON body. */
const stubFetch = (
  body: unknown,
  init: { status?: number; text?: string } = {},
): { fetchImpl: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url, requestInit) => {
    calls.push({ url, init: requestInit });
    const payload = init.text ?? JSON.stringify(body);
    return new Response(payload, {
      status: init.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, calls };
};

const client = (fetchImpl: FetchLike, token = "test-token"): DeviceApiClient => (
  new DeviceApiClient({ baseUrl: BASE, token, fetchImpl })
);

describe("metric codes", () => {
  // Pinned deliberately. The backend carries a THIRD, shifted mapping in
  // DevicesService.checkWaterDataAndSendAlerts (100="pH", 97="ORP", 102="Dissolved Oxygen").
  // If anyone ever "reconciles" our table against that one, every reading silently becomes
  // another metric — a failure that produces plausible numbers, not an error.
  it("match the backend's WaterAnalyticsService mapping", () => {
    expect(METRIC_BY_CODE.get(97)?.key).toBe("dissolvedOxygen");
    expect(METRIC_BY_CODE.get(98)?.key).toBe("orp");
    expect(METRIC_BY_CODE.get(99)?.key).toBe("ph");
    expect(METRIC_BY_CODE.get(100)?.key).toBe("conductivity");
    expect(METRIC_BY_CODE.get(102)?.key).toBe("temperature");
    expect(METRIC_BY_CODE.get(72)?.key).toBe("turbidity");
  });

  it("cover exactly the six parameters the DataPod reads", () => {
    expect(METRICS).toHaveLength(6);
  });

  it("report temperature in °F, the unit the API converts to", () => {
    // The system prompt's authoritative range is "32 to 95 °F". Firestore stores Celsius;
    // the backend converts on the way out. Labelling this °C would compare against the
    // wrong range without any type error.
    expect(METRIC_BY_CODE.get(102)?.unit).toBe("°F");
  });
});

describe("decodeMetric", () => {
  it("reads the value at the metric's numeric code", () => {
    const reading = decodeMetric({ 99: 7.4 }, METRIC_BY_CODE.get(99)!);
    expect(reading.value).toBe(7.4);
    expect(reading.valid).toBe(true);
  });

  it("marks a metric invalid when its error flag is set", () => {
    const reading = decodeMetric({ 99: 7.4, phError: 1 }, METRIC_BY_CODE.get(99)!);
    expect(reading.value).toBe(7.4);
    expect(reading.valid).toBe(false);
    expect(reading.errorFlagValue).toBe(1);
  });

  it("treats a zero error flag as healthy", () => {
    expect(decodeMetric({ 98: 0, orpError: 0 }, METRIC_BY_CODE.get(98)!).valid).toBe(true);
  });

  it("treats a missing error flag as healthy", () => {
    // Historical documents predate the flags; defaulting to invalid would discard the archive.
    expect(decodeMetric({ 98: 250 }, METRIC_BY_CODE.get(98)!).valid).toBe(true);
  });

  it("keeps 0 as a real reading for ORP and turbidity", () => {
    // 0 is valid for both (timeline.md) — a falsy check here would erase them.
    expect(decodeMetric({ 98: 0 }, METRIC_BY_CODE.get(98)!).value).toBe(0);
    expect(decodeMetric({ 72: 0 }, METRIC_BY_CODE.get(72)!).value).toBe(0);
  });

  it("coerces string values, which the backend stores for several fields", () => {
    expect(decodeMetric({ 99: "7.4" }, METRIC_BY_CODE.get(99)!).value).toBe(7.4);
  });

  it("yields undefined rather than NaN for unparseable values", () => {
    expect(decodeMetric({ 99: "n/a" }, METRIC_BY_CODE.get(99)!).value).toBeUndefined();
  });

  it("distinguishes an absent metric from a zero one", () => {
    expect(decodeMetric({}, METRIC_BY_CODE.get(99)!).value).toBeUndefined();
  });
});

describe("decodeReading", () => {
  const envelope = {
    id: "doc-1",
    data: {
      device: "dev:864622040478253",
      timestamp: 1_754_000_000,
      best_location: "South Salt Lake UT",
      lat: "40.71261",
      lon: "-111.90",
      water_data: {
        97: 8.1, 98: 250, 99: 7.4, 100: 900, 102: 61.2, 72: 3.5, turbError: 0,
      },
    },
  };

  it("unwraps the { id, data } envelope", () => {
    const reading = decodeReading(envelope);
    expect(reading.id).toBe("doc-1");
    expect(reading.device).toBe("dev:864622040478253");
  });

  it("reads timestamps as epoch SECONDS", () => {
    // Treating these as milliseconds silently yields January 1970 — a wrong answer that
    // looks like a date rather than an error.
    expect(decodeReading(envelope).observedAt).toBe(new Date(1_754_000_000 * 1000).toISOString());
  });

  it("parses string coordinates", () => {
    const reading = decodeReading(envelope);
    expect(reading.latitude).toBeCloseTo(40.71261);
    expect(reading.longitude).toBeCloseTo(-111.9);
  });

  it("falls back to best_lat when lat is zero, not just when it is missing", () => {
    // 0 means "no GPS fix" on this feed, not the equator — the backend does the same.
    const reading = decodeReading({
      data: { lat: 0, lon: 0, best_lat: 33.7, best_lon: -118.1, water_data: {} },
    });
    expect(reading.latitude).toBeCloseTo(33.7);
  });

  it("accepts a bare document as well as an envelope", () => {
    const reading = decodeReading({ device: "dev:1", water_data: { 99: 7 } });
    expect(reading.metrics.ph.value).toBe(7);
  });

  it("decodes all six metrics", () => {
    const { metrics } = decodeReading(envelope);
    expect(metrics.dissolvedOxygen.value).toBe(8.1);
    expect(metrics.orp.value).toBe(250);
    expect(metrics.ph.value).toBe(7.4);
    expect(metrics.conductivity.value).toBe(900);
    expect(metrics.temperature.value).toBe(61.2);
    expect(metrics.turbidity.value).toBe(3.5);
  });

  it("survives a payload with no water_data at all", () => {
    const reading = decodeReading({ data: { device: "dev:1" } });
    expect(reading.metrics.ph.value).toBeUndefined();
    expect(reading.metrics.ph.valid).toBe(true);
  });
});

describe("temperature units", () => {
  // Verified live 2026-08-11 against dev:351077454569099: ONE document, timestamp 1786477045,
  // returned 78.7838020324707 from /water/last and 25.99100112915039 from /water/period.
  // The backend converts on last/average and not on period, and nothing in the payload says so.
  const doc = { water_data: { 102: 25.99100112915039 } };

  it("defaults to Fahrenheit, which last/average already return", () => {
    expect(decodeReading(doc).metrics.temperature.value).toBeCloseTo(25.991);
  });

  it("converts Celsius payloads so the value matches the °F label", () => {
    const reading = decodeReading(doc, "celsius");
    expect(reading.metrics.temperature.value).toBeCloseTo(78.7838, 3);
    expect(reading.metrics.temperature.unit).toBe("°F");
  });

  it("records that a conversion happened", () => {
    expect(decodeReading(doc, "celsius").metrics.temperature.convertedFrom).toBe("celsius");
    expect(decodeReading(doc).metrics.temperature.convertedFrom).toBeUndefined();
  });

  it("converts only temperature, never another metric", () => {
    const reading = decodeReading({ water_data: { 99: 7.4, 98: 250 } }, "celsius");
    expect(reading.metrics.ph.value).toBe(7.4);
    expect(reading.metrics.orp.value).toBe(250);
  });

  it("leaves an absent temperature absent rather than converting undefined to 32", () => {
    expect(decodeReading({ water_data: {} }, "celsius").metrics.temperature.value)
      .toBeUndefined();
  });
});

describe("decodeAverages", () => {
  it("decodes the bare code-keyed object the average route returns", () => {
    const averages = decodeAverages("dev:1", {
      97: 8, 98: 250, 99: 7.4, 100: 900, 102: 60, 72: 2,
    });
    expect(averages.device).toBe("dev:1");
    expect(averages.metrics.dissolvedOxygen.value).toBe(8);
    expect(averages.metrics.turbidity.value).toBe(2);
    expect(averages.empty).toBe(false);
  });

  it("flags an all-zero payload as an empty window, not a measurement", () => {
    // Verified live 2026-08-11: Old Woman Creek 2026 had not reported for four days and its
    // 1-day average returned exactly this. Reported as data it says anoxic water at pH 0.
    const averages = decodeAverages("dev:1", {
      72: 0, 97: 0, 98: 0, 99: 0, 100: 0, 102: 0,
    });
    expect(averages.empty).toBe(true);
  });

  it("does not flag a window where only the zero-valid metrics are zero", () => {
    // 0 is a real reading for ORP and turbidity, so a single zero must never mean "no data".
    const averages = decodeAverages("dev:1", {
      72: 0, 97: 8, 98: 0, 99: 7.4, 100: 900, 102: 60,
    });
    expect(averages.empty).toBe(false);
  });
});

describe("DeviceApiClient", () => {
  it("sends the bearer token", async () => {
    const { fetchImpl, calls } = stubFetch([]);
    await client(fetchImpl).listDevices();
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
  });

  it("strips a trailing slash from the base URL", async () => {
    const { fetchImpl, calls } = stubFetch([]);
    await new DeviceApiClient({ baseUrl: `${BASE}/`, token: "t", fetchImpl }).listDevices();
    expect(calls[0].url).toBe(`${BASE}/devices`);
  });

  it("maps the { id, data } device envelope to name and label", async () => {
    const { fetchImpl } = stubFetch([
      { id: "abc", data: { name: "Algalita pod", label: "dev:123", operatingEnvironment: "salt-water" } },
    ]);
    const devices = await client(fetchImpl).listDevices();
    expect(devices[0]).toMatchObject({
      id: "abc", name: "Algalita pod", label: "dev:123", operatingEnvironment: "salt-water",
    });
  });

  it("url-encodes the device label, which contains a colon", async () => {
    const { fetchImpl, calls } = stubFetch({ id: "1", data: { water_data: {} } });
    await client(fetchImpl).getLastReading("dev:864622040478253");
    expect(calls[0].url).toBe(`${BASE}/water/last/dev%3A864622040478253`);
  });

  it("returns null when /water/last yields an empty array", async () => {
    // The no-GPS path returns [] from a route documented as returning an object.
    const { fetchImpl } = stubFetch([]);
    expect(await client(fetchImpl).getLastReading("dev:1")).toBeNull();
  });

  it("passes the device as a query param on the period route", async () => {
    const { fetchImpl, calls } = stubFetch([]);
    await client(fetchImpl).getPeriod(1, "day", "dev:1");
    expect(calls[0].url).toBe(`${BASE}/water/period/1/day?device=dev%3A1`);
  });

  it("treats period temperatures as Celsius and normalizes them", async () => {
    // The route returns the raw document; last/average do not. Getting this wrong reports
    // 26 °C water as 26 °F — below the prompt's 32-95 °F range, so it reads as a cold snap.
    const { fetchImpl } = stubFetch([{ data: { water_data: { 102: 25.99100112915039 } } }]);
    const [reading] = await client(fetchImpl).getPeriod(1, "day", "dev:1");
    expect(reading.metrics.temperature.value).toBeCloseTo(78.7838, 3);
    expect(reading.metrics.temperature.convertedFrom).toBe("celsius");
  });

  it("leaves last-reading temperatures alone", async () => {
    const { fetchImpl } = stubFetch({ id: "1", data: { water_data: { 102: 78.78 } } });
    const reading = await client(fetchImpl).getLastReading("dev:1");
    expect(reading?.metrics.temperature.value).toBeCloseTo(78.78);
    expect(reading?.metrics.temperature.convertedFrom).toBeUndefined();
  });

  it("omits the query param when no device is given", async () => {
    const { fetchImpl, calls } = stubFetch([]);
    await client(fetchImpl).getPeriod(1, "week");
    expect(calls[0].url).toBe(`${BASE}/water/period/1/week`);
  });

  it("repeats the devices param for a multi-device average", async () => {
    const { fetchImpl, calls } = stubFetch({});
    await client(fetchImpl).getAveragesForDevices(1, "day", ["dev:1", "dev:2"]);
    expect(calls[0].url).toBe(`${BASE}/water/average/many-devices/1/day?devices=dev%3A1&devices=dev%3A2`);
  });

  it("keys multi-device averages by label", async () => {
    const { fetchImpl } = stubFetch({ "dev:1": { 99: 7 }, "dev:2": { 99: 8 } });
    const results = await client(fetchImpl).getAveragesForDevices(1, "day", ["dev:1", "dev:2"]);
    expect(results.map((r) => r.device)).toEqual(["dev:1", "dev:2"]);
    expect(results[1].metrics.ph.value).toBe(8);
  });

  it("surfaces a 401 as an actionable error rather than retrying", async () => {
    const { fetchImpl } = stubFetch(null, { status: 401 });
    await expect(client(fetchImpl).listDevices()).rejects.toThrow(/rejected the token/i);
  });

  it("issues exactly one request for a 401 — expiry is surfaced, never retried", async () => {
    // There is no refresh path in this service. A retry loop here would burn the rate
    // limit against a token that cannot come back to life.
    const { fetchImpl, calls } = stubFetch(null, { status: 401 });
    await expect(client(fetchImpl).listDevices()).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("refuses to call an authenticated route with no token", async () => {
    const { fetchImpl, calls } = stubFetch([]);
    const noToken = new DeviceApiClient({ baseUrl: BASE, token: "", fetchImpl });
    await expect(noToken.listDevices()).rejects.toThrow(/DEVICE_API_TOKEN/);
    expect(calls).toHaveLength(0);
  });

  it("reports upstream 5xx as a 502 naming the path", async () => {
    const { fetchImpl } = stubFetch(null, { status: 500, text: "boom" });
    await expect(client(fetchImpl).listDevices()).rejects.toMatchObject({ status: 502 });
  });

  it("throws when the base URL is not configured", () => {
    expect(() => new DeviceApiClient({ baseUrl: "" })).toThrow(/DEVICE_API_BASE_URL/);
  });

  describe("login", () => {
    it("posts credentials unauthenticated and normalizes accessToken", async () => {
      const { fetchImpl, calls } = stubFetch({ accessToken: "jwt-1" });
      const token = await new DeviceApiClient({ baseUrl: BASE, fetchImpl }).login("A@B.com ", "pw");
      expect(token).toBe("jwt-1");
      expect(calls[0].url).toBe(`${BASE}/users/login`);
      expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
      // Lowercased and trimmed, matching the dashboard — the backend looks up by exact string.
      expect(JSON.parse(calls[0].init?.body as string)).toEqual({ email: "a@b.com", password: "pw" });
    });

    it("accepts the legacy access_token spelling", async () => {
      const { fetchImpl } = stubFetch({ access_token: "jwt-2" });
      expect(await new DeviceApiClient({ baseUrl: BASE, fetchImpl }).login("a@b.com", "pw"))
        .toBe("jwt-2");
    });

    it("fails loudly when login succeeds but carries no token", async () => {
      const { fetchImpl } = stubFetch({ message: "log in successful!" });
      await expect(new DeviceApiClient({ baseUrl: BASE, fetchImpl }).login("a@b.com", "pw"))
        .rejects.toThrow(/no token/i);
    });
  });

  it("times out rather than hanging on an unresponsive upstream", async () => {
    const hang: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
    const impatient = new DeviceApiClient({
      baseUrl: BASE, token: "t", timeoutMs: 5, fetchImpl: hang,
    });
    await expect(impatient.listDevices()).rejects.toThrow(/timed out after 5ms/);
  });
});

/** Aborts on the first request, the way an unresponsive upstream does. */
const hangingFetch: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    reject(error);
  });
});

/** The code the client attaches when a call fails for the given reason. */
const codeFromClient = async (
  fetchImpl: FetchLike,
  options: Partial<{ token: string; timeoutMs: number }> = {},
): Promise<string | undefined> => {
  const api = new DeviceApiClient({
    baseUrl: BASE, token: "t", fetchImpl, ...options,
  });
  try {
    await api.listDevices();
    return undefined;
  } catch (error) {
    return resolveErrorCode(error);
  }
};

describe("error taxonomy", () => {
  it("keeps the code set closed", () => {
    expect([...ERROR_CODES]).toEqual([
      "llm_not_configured",
      "device_auth_expired",
      "device_timeout",
      "device_unavailable",
      "quota_requests_exceeded",
      "quota_tokens_exceeded",
    ]);
  });

  it("codes a device 401 as expired auth", async () => {
    const { fetchImpl } = stubFetch(null, { status: 401 });
    expect(await codeFromClient(fetchImpl)).toBe("device_auth_expired");
  });

  it("codes a timeout distinctly from an outage", async () => {
    expect(await codeFromClient(hangingFetch, { timeoutMs: 5 })).toBe("device_timeout");
  });

  it("codes an upstream 5xx as unavailable", async () => {
    const { fetchImpl } = stubFetch(null, { status: 503, text: "gateway down" });
    expect(await codeFromClient(fetchImpl)).toBe("device_unavailable");
  });

  it("codes an unreachable host as unavailable", async () => {
    const refused: FetchLike = () => Promise.reject(new Error("ECONNREFUSED"));
    expect(await codeFromClient(refused)).toBe("device_unavailable");
  });

  it("codes a missing token as unavailable, not as expired auth", async () => {
    // Nothing was ever issued, so there is no session to renew.
    const { fetchImpl } = stubFetch([]);
    expect(await codeFromClient(fetchImpl, { token: "" })).toBe("device_unavailable");
  });

  it("codes a missing base URL as unavailable", () => {
    try {
      // eslint-disable-next-line no-new
      new DeviceApiClient({ baseUrl: "" });
      throw new Error("expected a throw");
    } catch (error) {
      expect(resolveErrorCode(error)).toBe("device_unavailable");
    }
  });

  it("leaves an upstream 4xx uncoded, so no retry is implied", async () => {
    // A 404 for one device is a specific answer, not an outage.
    const { fetchImpl } = stubFetch(null, { status: 404, text: "not found" });
    expect(await codeFromClient(fetchImpl)).toBeUndefined();
  });

  it("codes a missing FIREWORKS_API_KEY, which is thrown outside this module", () => {
    expect(resolveErrorCode(createError(503, "FIREWORKS_API_KEY is not configured.")))
      .toBe("llm_not_configured");
  });

  it("does not mislabel another 503 as a missing key", () => {
    expect(resolveErrorCode(createError(503, "LLM_MODEL is not configured."))).toBeUndefined();
  });

  it("never publishes a foreign code such as a Node errno", () => {
    // `http-errors` has an index signature and Node stamps `code` on system errors, so an
    // unfiltered pass-through would leak ECONNREFUSED into the public contract.
    const errno = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(resolveErrorCode(errno)).toBeUndefined();
  });

  it("returns no code for an ordinary error", () => {
    expect(resolveErrorCode(new Error("boom"))).toBeUndefined();
    expect(resolveErrorCode(undefined)).toBeUndefined();
  });

  it("does not treat an empty window as an error at all", async () => {
    // Old Woman Creek's silent-window payload (DEVICE_API.md §12b). It must resolve as a
    // result — value null / n_samples 0 downstream — never reject with a code. Reporting
    // these zeros as measurements is the eval's automatic disqualification.
    const { fetchImpl } = stubFetch({ 72: 0, 97: 0, 98: 0, 99: 0, 100: 0, 102: 0 });
    const averages = await client(fetchImpl).getAverages(1, "day", "dev:1");
    expect(averages.empty).toBe(true);
    expect(resolveErrorCode(averages)).toBeUndefined();
  });
});

describe("errorHandler body", () => {
  /** Runs the terminal handler against a minimal `res` and returns what it wrote. */
  const render = (err: Error): { status: number; body: Record<string, unknown> } => {
    let status = 0;
    let body: Record<string, unknown> = {};
    const res = {
      headersSent: false,
      status(code: number) { status = code; return this; },
      json(payload: Record<string, unknown>) { body = payload; return this; },
    };
    errorHandler(
      err,
      {} as Request,
      res as unknown as Response,
      (() => undefined) as NextFunction,
    );
    return { status, body };
  };

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("adds code alongside the existing fields without introducing status", () => {
    const { status, body } = render(
      codedError(401, "Device API rejected the token (401).", "device_auth_expired"),
    );
    expect(status).toBe(401);
    expect(body.error).toBe("Device API rejected the token (401).");
    expect(body.message).toBe(body.error);
    expect(body.code).toBe("device_auth_expired");
    // The HTTP status line carries the status; the body must not (health.test.ts pins it).
    expect(body).not.toHaveProperty("status");
  });

  it("omits code entirely for an error outside the taxonomy", () => {
    const { body } = render(createError(400, "Validation error"));
    expect(body).not.toHaveProperty("code");
    expect(body.error).toBe("Validation error");
  });

  it("still exposes the stack outside production", () => {
    expect(render(new Error("boom")).body).toHaveProperty("stack");
  });
});

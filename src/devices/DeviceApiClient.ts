import createError from "http-errors";
import { config } from "../config";
import { codedError } from "../utils/errors";
import { createLogger } from "../utils/logger";
import { decodeAverages, decodeReading } from "./metrics";
import type {
  DeviceAverages,
  DeviceReading,
  DeviceSummary,
  PeriodUnit,
} from "../types/device.types";

const log = createLogger("DeviceAPI");

/** Injectable for tests; matches the global `fetch` signature. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface DeviceApiClientOptions {
  /** Base URL **including** the `/api/v1` suffix. Defaults to `config.deviceApi.baseUrl`. */
  baseUrl?: string;
  /** Bearer JWT. Defaults to `config.deviceApi.devToken`. */
  token?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

const asArray = (payload: unknown): unknown[] => (Array.isArray(payload) ? payload : []);

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

/**
 * Read client for the Clean Earth backend's device and water-data API.
 *
 * Deliberately **read-only**: it exposes no device create/update call, even though the backend
 * has them. This service answers questions about a fleet it does not own, and a client that
 * cannot write cannot corrupt someone else's production device registry through a prompt.
 *
 * Auth is a bearer JWT. `config.deviceApi.devToken` is the dev fallback; a per-request caller
 * token should be passed to the constructor in production, because the backend scopes `/devices`
 * and every `/water/*` route to the **token holder's organization** — a shared service token
 * would hand every chat user the whole fleet.
 */
export class DeviceApiClient {
  private readonly baseUrl: string;

  private readonly token?: string;

  private readonly timeoutMs: number;

  private readonly fetchImpl: FetchLike;

  constructor(options: DeviceApiClientOptions = {}) {
    const baseUrl = options.baseUrl ?? config.deviceApi.baseUrl;
    if (!baseUrl) {
      // `device_unavailable` rather than a config-specific code: from a caller's side an
      // unconfigured client and an unreachable host are the same fact — no device data is
      // obtainable — and the message already says which one it is.
      throw codedError(503, "DEVICE_API_BASE_URL is not configured.", "device_unavailable");
    }
    // A trailing slash would produce `//water/last/...`, which some proxies 404 rather than
    // normalize. Cheaper to strip once here than to debug against a live deployment.
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = options.token ?? config.deviceApi.devToken;
    this.timeoutMs = options.timeoutMs ?? config.deviceApi.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /**
   * Issues one request and parses the JSON body.
   *
   * The timeout is enforced here rather than left to the platform default, which on Node is
   * effectively none: a hung upstream would otherwise hold a chat request open until the
   * caller gave up.
   */
  private async request<T>(
    path: string,
    init: RequestInit = {},
    { authenticated = true }: { authenticated?: boolean } = {},
  ): Promise<T> {
    if (authenticated && !this.token) {
      // Not `device_auth_expired`: no token was ever issued, so there is nothing to
      // re-authenticate. Telling a user their session expired when the deployment simply
      // has no credential would send them to a login flow that cannot fix it.
      throw codedError(
        503,
        "No device-API token available. Set DEVICE_API_TOKEN, or pass a caller token to DeviceApiClient.",
        "device_unavailable",
      );
    }

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(authenticated && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw codedError(
          504,
          `Device API timed out after ${this.timeoutMs}ms (${path}).`,
          "device_timeout",
        );
      }
      // DNS failure, refused connection, TLS error: the host did not answer at all.
      throw codedError(
        502,
        `Device API request failed (${path}): ${(error as Error).message}`,
        "device_unavailable",
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      // The dashboard's interceptor silently drops the token and redirects to /login. This
      // service has no login page and must not retry blindly, so expiry is surfaced as an
      // actionable error instead — the token is minted without an `expiresIn`, so a 401 here
      // means revoked or wrong-secret, not simply stale.
      throw codedError(
        401,
        "Device API rejected the token (401). Obtain a fresh JWT from POST /users/login.",
        "device_auth_expired",
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message = `Device API ${response.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ""}`;
      // Only upstream 5xx is "unavailable". A 403 or 404 is a specific answer about a
      // specific request — coding it as an outage would tell the UI to offer a retry that
      // is guaranteed to fail the same way.
      if (response.status >= 500) {
        throw codedError(502, message, "device_unavailable");
      }
      throw createError(response.status, message);
    }

    return await response.json() as T;
  }

  /**
   * Exchanges credentials for a bearer JWT via `POST /users/login`.
   *
   * The response key varies by endpoint — `/users/login` returns `accessToken` while the legacy
   * `/auth/signin` returns `access_token` — so all three spellings the dashboard accepts are
   * tried here rather than assuming one.
   */
  async login(email: string, password: string): Promise<string> {
    const payload = await this.request<Record<string, unknown>>(
      "/users/login",
      {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      },
      { authenticated: false },
    );

    const token = payload.accessToken ?? payload.access_token ?? payload.token;
    if (typeof token !== "string" || token === "") {
      throw createError(502, "Login succeeded but no token was present in the response.");
    }
    return token;
  }

  /**
   * Lists the devices visible to the token holder.
   *
   * **Scoped to the token's organization** by the backend (superadmin sees all), so this is the
   * only authoritative source of pod names — neither reference repo contains them.
   */
  async listDevices(): Promise<DeviceSummary[]> {
    const payload = await this.request<unknown>("/devices");
    return asArray(payload).map((entry) => {
      const outer = asRecord(entry);
      const data = asRecord(outer.data);
      return {
        id: typeof outer.id === "string" ? outer.id : "",
        name: typeof data.name === "string" ? data.name : undefined,
        label: typeof data.label === "string" ? data.label : undefined,
        organization: typeof data.organization === "string" ? data.organization : undefined,
        operatingEnvironment: typeof data.operatingEnvironment === "string"
          ? data.operatingEnvironment
          : undefined,
        nextCalibrationDate: typeof data.nextCalibrationDate === "string"
          ? data.nextCalibrationDate
          : undefined,
        thresholds: asRecord(data.thresholds) as Record<string, string | number>,
        raw: data,
      };
    });
  }

  /**
   * Most recent reading for one device.
   *
   * Returns `null` rather than throwing when the backend has nothing to give. That is not
   * always "no data": `/water/last` filters out readings whose latitude is absent or zero, so a
   * pod that is reporting water chemistry without a GPS fix looks identical to a silent one.
   * Callers that need the distinction should fall back to `getPeriod`, which does not filter.
   */
  async getLastReading(deviceLabel: string): Promise<DeviceReading | null> {
    const payload = await this.request<unknown>(
      `/water/last/${encodeURIComponent(deviceLabel)}`,
    );
    // Documented as `{ id, data }`, but the no-GPS path returns `[]` from the same route.
    if (Array.isArray(payload)) {
      const first = payload[0];
      return first === undefined ? null : decodeReading(first);
    }
    const record = asRecord(payload);
    if (record.data === undefined && record.id === undefined) {
      return null;
    }
    return decodeReading(payload);
  }

  /**
   * Raw readings over a rolling window ending now — e.g. `(1, "day")` for the last 24 hours.
   *
   * Unlike the average and last-reading routes this one does **not** drop rows whose error
   * flags are set, so the caller sees faults rather than a quietly cleaned series. That is the
   * behavior N6's faulty-data feature needs, and the reason this is the right window source.
   */
  async getPeriod(
    duration: number,
    unit: PeriodUnit,
    deviceLabel?: string,
  ): Promise<DeviceReading[]> {
    const query = deviceLabel ? `?device=${encodeURIComponent(deviceLabel)}` : "";
    const payload = await this.request<unknown>(
      `/water/period/${duration}/${unit}${query}`,
    );
    // Celsius: this route returns the stored document untouched, while `/water/last` and
    // `/water/average` convert to Fahrenheit on the way out. Same document, different unit,
    // no marker in the payload saying which — so the unit is supplied by the call site that
    // knows which endpoint it asked.
    return asArray(payload).map((entry) => decodeReading(entry, "celsius"));
  }

  /**
   * Per-metric averages over a window.
   *
   * The backend computes these across rows where **every** probe reported healthy, so a single
   * faulty sensor removes the whole row from every metric's average. Worth knowing before
   * treating a gap here as "the water changed".
   */
  async getAverages(
    duration: number,
    unit: PeriodUnit,
    deviceLabel: string,
  ): Promise<DeviceAverages> {
    const payload = await this.request<unknown>(
      `/water/average/${duration}/${unit}?device=${encodeURIComponent(deviceLabel)}`,
    );
    return decodeAverages(deviceLabel, payload);
  }

  /** Averages for several devices at once, keyed by device label. */
  async getAveragesForDevices(
    duration: number,
    unit: PeriodUnit,
    deviceLabels: string[],
  ): Promise<DeviceAverages[]> {
    const query = deviceLabels
      .map((label) => `devices=${encodeURIComponent(label)}`)
      .join("&");
    const payload = await this.request<unknown>(
      `/water/average/many-devices/${duration}/${unit}?${query}`,
    );
    const record = asRecord(payload);
    return Object.entries(record).map(([label, value]) => decodeAverages(label, value));
  }

  /** Logs the resolved endpoint once, so a misconfigured base URL is visible before any call. */
  describe(): string {
    const auth = this.token ? "token present" : "NO TOKEN";
    log.info(`Base URL ${this.baseUrl} (${auth}, timeout ${this.timeoutMs}ms).`);
    return this.baseUrl;
  }
}

/* eslint-disable max-classes-per-file -- SensorQueryError is a one-line subclass that belongs
   with the module whose contract it is part of, not in utils/errors.ts, which holds the
   HTTP-shaped errors. Same exemption .eslintrc.js already grants that file. */
import { createHash } from "crypto";
import { config } from "../config";
import { DeviceApiClient } from "../devices/DeviceApiClient";
import {
  mergeByTimestamp, resolveChain, isChainRefusal, withholdRefused,
} from "../devices/mergeChains";
import type { DeviceChain } from "../devices/mergeChains";
import { METRIC_BY_KEY, METRICS } from "../devices/metrics";
import { implausibilityReason, isPlausible } from "../devices/plausibility";
import { isAllZeroTurbidity, TURBIDITY_ALL_ZERO_CAVEAT } from "../report/referenceRanges";
import type {
  DeviceReading,
  DeviceSummary,
  MetricKey,
} from "../types/device.types";
import { codedError, resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import { USER_NOTES_FIELD } from "../types/tool.types";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import {
  AGGREGATIONS, aggregate, isAggregation,
} from "./aggregate";
import type { AggregateResult, Aggregation, Sample } from "./aggregate";
import {
  TimeRangeError,
  parseTimeRange,
  resolveRange,
} from "./timeRange";
import type { ResolvedRange } from "./timeRange";
import { readingAge } from "./readingAge";
import { provenSiteStart } from "./currentSite";
import {
  DAY_MS, SITE_CACHE_MAX_ENTRIES, SITE_CACHE_MAX_ROWS, SITE_CACHE_RETENTION_MS,
  SITE_CACHE_TTL_MS, SITE_RECENT_DAYS, snapshotSite,
} from "./siteSnapshot";
import type { SiteSnapshot } from "./siteSnapshot";
import { stuckTurbidityReadings, STUCK_SENSOR_NOTE, STUCK_SENSOR_USER_NOTE } from "./stuckSensor";

const log = createLogger("SensorTool");

/**
 * `query_sensor_data` — the legacy sensor tool (`MIGRATION_SPEC.md` §8), rebuilt on the live
 * device API rather than on a Firestore port of the historical CSV (◆G8).
 *
 * The legacy version ran one SQL query against one table. This one has to reconstruct the same
 * behavior from an API that offers only rolling windows and pre-averaged summaries, so three
 * things happen here that did not happen there:
 *
 * - **Everything is computed from the raw period series.** `/water/average` is never called —
 *   it answers an empty window with zeros for all six metrics and drops whole rows when any one
 *   probe faults (`docs/migration/DEVICE_API.md` §12b, §6). See `aggregate.ts`.
 * - **Recent windows expand when they cannot establish the current site.** Empty windows
 *   cannot establish the reference instant, and partial nonempty windows may lack the earlier
 *   centroid context needed to distinguish visits.
 * - **A device has to be chosen.** The legacy service had exactly one deployment; this fleet has
 *   21 visible devices, three of which are duplicate registry rows for the same physical pod.
 */

/**
 * Wire names for the metrics: the legacy enum plus turbidity, which came into scope with
 * N4's early prompt landing on 2026-07-29.
 */
const METRIC_ALIASES: ReadonlyArray<[string, MetricKey]> = [
  ["dissolved_oxygen", "dissolvedOxygen"],
  ["do", "dissolvedOxygen"],
  ["orp", "orp"],
  ["ph", "ph"],
  ["conductivity", "conductivity"],
  ["ec", "conductivity"],
  ["temperature", "temperature"],
  ["turbidity", "turbidity"],
];

/** The enum the model is shown — aliases are accepted but not advertised. */
export const METRIC_NAMES = [
  "dissolved_oxygen", "orp", "ph", "conductivity", "temperature", "turbidity",
] as const;

const METRIC_KEY_BY_NAME = new Map(METRIC_ALIASES);

/** Wire name for a metric key, for echoing back what was actually read. */
const NAME_BY_METRIC_KEY = new Map<MetricKey, string>(
  METRIC_NAMES.map((name) => [METRIC_KEY_BY_NAME.get(name) as MetricKey, name]),
);

/** Every metric the tool can serve, in table order. */
export const SUPPORTED_METRICS: readonly MetricKey[] = METRICS.map((metric) => metric.key);

/** §8 step 5 reports pH as "unitless" rather than omitting the field. */
const unitFor = (key: MetricKey): string => METRIC_BY_KEY.get(key)?.unit ?? "unitless";

export interface SensorToolResult {
  [field: string]: unknown;
}

/** Everything the tool returns on failure. Fed back to the model, never thrown (§3). */
const failure = (message: string): SensorToolResult => ({ error: message });

/** The reader's version of the withheld-predecessor note (see `USER_NOTES_FIELD`). */
const WITHHELD_USER_NOTE = "Earlier readings from this site are not available to this account, "
  + "so the history shown may start later than the site's first reading.";

/**
 * Initials of a device name — "Old Woman Creek 2026" → "owc".
 *
 * Exists because of a specific verified trap: the pod everyone calls "OWC" is registered as
 * "Old Woman Creek 2026", and the acronym appears nowhere in the registry
 * (`docs/migration/DEVICE_API.md` §2). Without this, asking about OWC matches nothing and the
 * tool reports "no such device" about a device that exists.
 */
const initialsOf = (name: string): string => name
  .split(/[^a-z0-9]+/i)
  .filter((word) => word !== "" && /^[a-z]/i.test(word))
  .map((word) => word[0])
  .join("")
  .toLowerCase();

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Picks the device a question is about.
 *
 * Matching widens in strict-to-loose order and **stops at the first tier that matches**, so a
 * device whose name is exactly the query is never beaten by another whose name merely contains
 * it. An ambiguous query fails rather than picking one: the two cleared pods sit in different
 * water bodies on opposite coasts, so a confident answer about the wrong pod is worse than an
 * error the model can recover from.
 */
export const matchDevices = (devices: DeviceSummary[], query: string): DeviceSummary[] => {
  const wanted = normalize(query);
  const tiers: Array<(device: DeviceSummary) => boolean> = [
    (device) => normalize(device.label ?? "") === wanted,
    (device) => normalize(device.name ?? "") === wanted,
    (device) => initialsOf(device.name ?? "") === wanted,
    (device) => normalize(device.name ?? "").includes(wanted) && wanted.length >= 3,
    (device) => initialsOf(device.name ?? "").startsWith(wanted) && wanted.length >= 2,
  ];

  const matched = tiers.map((test) => devices.filter(test)).find((hits) => hits.length > 0);
  return matched ?? [];
};

/**
 * Collapses the registry's duplicate rows.
 *
 * "Algalita Pod" has three entries pointing at the same `dev:` label, two of them in the same
 * organization (`DEVICE_API.md` §2). A label is one physical pod, so without this a device
 * question looks ambiguous when it is not, and sampling per row treats one pod's readings as
 * three independent sources.
 */
export const dedupeByLabel = (devices: DeviceSummary[]): DeviceSummary[] => {
  const seen = new Map<string, DeviceSummary>();
  devices.forEach((device) => {
    if (device.label && !seen.has(device.label)) {
      seen.set(device.label, device);
    }
  });
  return [...seen.values()];
};

/**
 * Thrown by `query()`. The tool path returns these as `{ error }` instead.
 *
 * Lives here rather than in `utils/errors.ts` because it is part of this module's contract: a
 * caller catching it is catching "the sensor query failed", not a generic HTTP-shaped error.
 */
export class SensorQueryError extends Error {}

/** Typed arguments for the programmatic path. */
export interface SensorQueryParams {
  /** A metric wire name, or `"all"` for every metric from one fetched window. */
  metric: (typeof METRIC_NAMES)[number] | "all";
  /** Natural-language window, same grammar the tool advertises. */
  timeRange: string;
  aggregation: Aggregation;
  /** Name or `dev:` label. Required whenever more than one device is visible. */
  device?: string;
  /** `series` only. Omit for an auto width derived from the window's span. */
  bucket?: "auto" | "hour" | "day" | "week";
  /**
   * `series` only, and programmatic only: the model's tool schema does not offer it. Raises the
   * bucket cap for a caller that needs a fine series over a long window, such as the report's
   * hourly pattern classification. Defaults to `DEFAULT_MAX_BUCKETS`.
   */
  maxBuckets?: number;
}

export interface QuerySensorDataOptions {
  client?: DeviceApiClient;
  /** Injectable for deterministic tests; defaults to the wall clock. */
  now?: () => number;
  rawLimit?: number;
  defaultDeviceLabel?: string;
  /** Deployment water type, for the mismatch note. Defaults to `config.waterType`. */
  waterType?: string;
}

/** How long a device list is reused. The registry changes on the order of weeks. */
const DEVICE_CACHE_MS = 5 * 60_000;

/**
 * Bucket widths a caller may name for `series`.
 *
 * `auto` is the default and the recommended one: the width is derived from the window's own span
 * so the answer stays human-sized, which is work the model would otherwise have to get right.
 */
const BUCKET_MS: Record<string, number | undefined> = {
  auto: undefined,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
};

export class QuerySensorData {
  private readonly clientOverride?: DeviceApiClient;

  private readonly now: () => number;

  private readonly rawLimit: number;

  private readonly defaultDeviceLabel?: string;

  private readonly waterType: string;

  /**
   * Keyed by token, because the device API scopes `/devices` to the token holder's organization.
   * A single-slot cache on this shared singleton would serve one caller's fleet to the next.
   * Authorization is hashed with the API base URL; the null-token key is distinct and only
   * usable with an injected client whose authentication scope is fixed by the caller.
   */
  private deviceCache = new Map<string, { at: number; devices: DeviceSummary[] }>();

  private devicePending = new Map<string, Promise<DeviceSummary[]>>();

  private siteCache = new Map<string, SiteSnapshot>();

  private sitePending = new Map<string, Promise<SiteSnapshot>>();

  constructor(options: QuerySensorDataOptions = {}) {
    this.clientOverride = options.client;
    this.now = options.now ?? (() => Date.now());
    this.rawLimit = options.rawLimit ?? config.tools.rawLimit;
    this.defaultDeviceLabel = options.defaultDeviceLabel ?? config.deviceApi.defaultDeviceLabel;
    this.waterType = options.waterType ?? config.waterType;
  }

  /**
   * Constructed lazily so the service boots, and `/health` passes, without device credentials —
   * the same rule the Fireworks client follows. A missing base URL becomes a tool-result error
   * the model can report, not a 500 on an unrelated chat request.
   */
  private client(token?: string): DeviceApiClient {
    if (this.clientOverride) {
      return this.clientOverride;
    }
    if (!token) {
      // **A caller token is required.** `DeviceApiClient` used to default to `DEVICE_API_TOKEN`,
      // so a chat request with no `Authorization` header answered the user's sensor question out
      // of the deployment's own organization rather than theirs. Refusing here rather than
      // letting the client fall back is the same fix `deviceRoutes.ts` applies to `GET /devices`,
      // at the other end of the same class of bug.
      //
      // `clientOverride` above is deliberately exempt: a test or a CLI script that supplies its
      // own client has already decided what that client authenticates with
      // (`scripts/verifySensorTool.ts` passes one built with `useConfiguredToken: true`).
      throw codedError(
        401,
        "Reading sensor data requires the caller's own credentials. Send an "
        + "`Authorization: Bearer <token>` header with the chat request.",
        "caller_token_required",
      );
    }
    // Built per call, not memoized: the token varies by caller, and a client cached on this
    // shared instance would authenticate one user's request as another.
    return new DeviceApiClient({ token });
  }

  private async devices(token?: string): Promise<DeviceSummary[]> {
    const key = createHash("sha256")
      .update(JSON.stringify([token ?? null, config.deviceApi.baseUrl])).digest("hex");
    this.deviceCache.forEach((entry, entryKey) => {
      if (this.now() - entry.at >= DEVICE_CACHE_MS) this.deviceCache.delete(entryKey);
    });
    const cached = this.deviceCache.get(key);
    if (cached) return cached.devices;
    const pending = this.devicePending.get(key);
    if (pending) return pending;
    const read = this.client(token).listDevices().then((rows) => {
      const devices = dedupeByLabel(rows);
      this.deviceCache.set(key, { at: this.now(), devices });
      while (this.deviceCache.size > SITE_CACHE_MAX_ENTRIES) {
        this.deviceCache.delete(this.deviceCache.keys().next().value as string);
      }
      return devices;
    });
    this.devicePending.set(key, read);
    try {
      return await read;
    } finally {
      this.devicePending.delete(key);
    }
  }

  /**
   * Resolves the `device` argument, or the configured default, to exactly one pod.
   *
   * Discriminated on `device`/`error` rather than returning a union of two object shapes —
   * a `SensorToolResult` is an open record, so `"label" in result` would narrow nothing and the
   * error path could be read as a device with an undefined label.
   */
  private async resolveDevice(
    requested?: string,
    token?: string,
  ): Promise<{ device: DeviceSummary } | { error: SensorToolResult }> {
    const devices = await this.devices(token);
    if (devices.length === 0) {
      return {
        error: failure(
          "The device API returned no devices for this token. The token is scoped to one "
          + "organization, so this usually means it belongs to a different one.",
        ),
      };
    }

    const nameOf = (device: DeviceSummary): string => device.name ?? device.label ?? "(unnamed)";
    const choices = devices.map(nameOf).join(", ");

    const query = requested?.trim() ?? "";
    if (query === "") {
      if (this.defaultDeviceLabel) {
        const matched = matchDevices(devices, this.defaultDeviceLabel);
        if (matched.length === 1) {
          return { device: matched[0] };
        }
        return {
          error: failure(
            `SENSOR_DEVICE_LABEL is set to "${this.defaultDeviceLabel}" but that matches `
            + `${matched.length} devices. Available devices: ${choices}.`,
          ),
        };
      }
      if (devices.length === 1) {
        return { device: devices[0] };
      }
      return {
        error: failure(
          `This deployment can see ${devices.length} devices, so "device" is required. `
          + `Ask the user which one they mean. Available devices: ${choices}.`,
        ),
      };
    }

    const matched = matchDevices(devices, query);
    if (matched.length === 1) {
      return { device: matched[0] };
    }
    if (matched.length === 0) {
      return { error: failure(`No device matches "${requested}". Available devices: ${choices}.`) };
    }
    return {
      error: failure(
        `"${requested}" matches ${matched.length} devices (${matched.map(nameOf).join(", ")}). `
        + "Ask the user which one they mean.",
      ),
    };
  }

  /** Each hidden predecessor is authorized separately; only its specific refusal is recoverable. */
  private async readChain(chain: DeviceChain, days: number, token?: string): Promise<{
    rows: DeviceReading[]; chain: DeviceChain;
  }> {
    let authorized = chain;
    const batches: DeviceReading[][] = [];
    for (let i = 0; i < chain.labels.length; i += 1) {
      const label = chain.labels[i];
      try {
        // eslint-disable-next-line no-await-in-loop
        batches.push(await this.client(token).getPeriod(days, "day", label));
      } catch (error) {
        if (!chain.unconfirmed.includes(label) || !isChainRefusal(error)) throw error;
        authorized = withholdRefused(authorized, label);
      }
    }
    return { rows: mergeByTimestamp(batches), chain: authorized };
  }

  private async loadSnapshot(chain: DeviceChain, token?: string, previous?: SiteSnapshot)
    : Promise<SiteSnapshot> {
    const at = this.now();
    // An overlapping recent read replaces the cached tail, including deletions/corrections.
    const days = Math.max(
      SITE_RECENT_DAYS,
      previous ? Math.ceil((at - previous.at) / DAY_MS) + 1 : 0,
    );
    let fromMs = at - days * DAY_MS;
    let fetched = await this.readChain(chain, days, token);
    let { rows } = fetched;
    let contextAt = at;
    if (previous && JSON.stringify(previous.chain) === JSON.stringify(fetched.chain)) {
      rows = [...previous.rows.filter((row) => Date.parse(row.observedAt ?? "") < fromMs),
        ...rows];
      fromMs = previous.fromMs;
      contextAt = previous.contextAt;
    }
    if (fromMs > 0 && provenSiteStart(rows) === undefined) {
      // The API accepts a duration in days. Reach the epoch when no recent reset is provable,
      // instead of declaring the left edge of a week/month/year to be a site boundary.
      fetched = await this.readChain(fetched.chain, Math.ceil(at / DAY_MS) + 1, token);
      rows = fetched.rows;
      fromMs = 0;
      contextAt = at;
    }
    const lastReported = QuerySensorData.newestObservedAt(rows) === null
      ? (await this.client(token).getLastReading(chain.labels[0]))?.observedAt : undefined;
    return {
      lastReported,
      at,
      contextAt,
      rows,
      fromMs,
      chain: fetched.chain,
      ...snapshotSite(rows, fromMs),
    };
  }

  private async snapshot(
    chain: DeviceChain,
    token?: string,
    scope?: Map<string, Promise<SiteSnapshot>>,
  ): Promise<SiteSnapshot> {
    const key = createHash("sha256").update(JSON.stringify([
      token ?? null, config.deviceApi.baseUrl, chain,
      config.tools.predecessorPeriodHandoff,
    ])).digest("hex");
    const pinned = scope?.get(key);
    if (pinned) return pinned;
    this.siteCache.forEach((entry, entryKey) => {
      if (this.now() - entry.contextAt >= SITE_CACHE_RETENTION_MS) this.siteCache.delete(entryKey);
    });
    const cached = this.siteCache.get(key);
    const pending = this.sitePending.get(key);
    const read = pending ?? (cached && this.now() - cached.at < SITE_CACHE_TTL_MS
      ? Promise.resolve(cached) : this.loadSnapshot(chain, token, cached));
    scope?.set(key, read);
    if (pending) return pending;
    this.sitePending.set(key, read);
    try {
      const result = await read;
      this.siteCache.delete(key);
      if (result.rows.length <= SITE_CACHE_MAX_ROWS) this.siteCache.set(key, result);
      let count = [...this.siteCache.values()].reduce((sum, entry) => sum + entry.rows.length, 0);
      while (this.siteCache.size > SITE_CACHE_MAX_ENTRIES || count > SITE_CACHE_MAX_ROWS) {
        const oldest = this.siteCache.keys().next().value as string;
        count -= this.siteCache.get(oldest)!.rows.length;
        this.siteCache.delete(oldest);
      }
      return result;
    } finally {
      this.sitePending.delete(key);
    }
  }

  /**
   * Runs the tool. **Never throws** — every failure becomes `{ error }` so the model can
   * recover inside the tool loop rather than the whole chat request 500ing (§3, §8).
   *
   * This is the **LLM-facing** entry point: loose arguments in, errors as data out. Code that is
   * not a language model should call `query()` instead.
   */
  async run(args: Record<string, unknown>, context?: ToolContext): Promise<SensorToolResult> {
    try {
      return await this.execute(args, context?.token);
    } catch (error) {
      // `device_auth_expired` alone is re-thrown. It is terminal by design (`errors.ts`): this
      // service has no refresh path, so no number of retries and no rewording by the model can
      // recover it. Returned as a tool result it becomes prose inside a 200, the UI gets no
      // machine-readable signal, and — because the dedupe cache keys on arguments — a model that
      // varies the metric re-issues the failing call every round until the cap.
      //
      // Every other coded failure stays a tool result on purpose. `device_unavailable` and
      // `device_timeout` are transient and *are* the model's to report: a 500 on the chat
      // request would deny it the chance to say it could not reach the sensors
      // (`MIGRATION_SPEC.md` §3, §8).
      // `caller_token_required` is re-thrown for the same reasons and one more: the request
      // never had credentials, so there is nothing for the model to word differently. Returned as
      // a tool result it would become an apology inside a 200 and the UI would get no signal to
      // send the user to a sign-in.
      const code = resolveErrorCode(error);
      if (code === "device_auth_expired" || code === "caller_token_required") {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.error(`query_sensor_data failed: ${message}`);
      return failure(`Could not read sensor data: ${message}`);
    }
  }

  /**
   * The **programmatic** entry point: typed arguments in, `SensorQueryError` on failure.
   *
   * Exists for Phase N6's report generation. `timeline.md` requires the report's header, §2 and
   * §5 to be **computed deterministically** and only narrated by the model — so the report must
   * not obtain its numbers by asking an LLM to call a tool. It needs the same computation
   * reached directly, and it needs failures to be exceptions rather than an `{ error }` object
   * that a caller can forget to check and then render into a customer-facing document.
   *
   * Same code path as `run()` underneath, so there is one implementation of the traps, not two.
   *
   * `token` threads the caller's bearer token the same way `run()`'s `ToolContext` does (added
   * for `generateReport.ts`, N6 landing). It is **required in practice**: omit it and, unless the
   * caller injected its own `client`, this throws a coded `caller_token_required` 401 rather than
   * quietly reading someone else's organization out of `DEVICE_API_TOKEN`.
   */
  async query(
    params: SensorQueryParams,
    token?: string,
    scope?: Map<string, Promise<SiteSnapshot>>,
  ): Promise<SensorToolResult> {
    const result = await this.execute({
      metric: params.metric,
      time_range: params.timeRange,
      aggregation: params.aggregation,
      ...(params.device !== undefined ? { device: params.device } : {}),
      ...(params.bucket !== undefined ? { bucket: params.bucket } : {}),
    }, token, params.maxBuckets, scope);

    if (typeof result.error === "string") {
      throw new SensorQueryError(result.error);
    }
    return result;
  }

  /** Pin all report aggregations to one snapshot even across TTL expiry or cache eviction. */
  async queryBatch(params: SensorQueryParams[], token?: string): Promise<SensorToolResult[]> {
    const scope = new Map<string, Promise<SiteSnapshot>>();
    return Promise.all(params.map((param) => this.query(param, token, scope)));
  }

  /**
   * The registry row for one device, resolved by the same rules `query()` uses, or `null` when
   * nothing resolves.
   *
   * The second **programmatic** entry point, added for the same reason `query()` exists: report
   * generation needs a fact that lives on the device document rather than on the readings, and
   * needs it typed rather than as an open record it might mis-key. Today that fact is
   * `thresholds.minTemperature`/`maxTemperature` — the site-specific temperature baseline the
   * source-of-truth doc tells the report to establish (`operatorThresholds.ts`).
   *
   * Why this and not another field on the tool result. `run()`'s result is **model-facing**:
   * everything in it is handed to an LLM to narrate. `thresholds` is ten operator-entered
   * numbers, several of them known junk (`BACKEND_FIELDS.md` §3c) — putting them there would
   * invite the model to quote "your acceptable pH range is 0-100" in chat, in a service whose
   * whole posture is refusing to state numbers it cannot stand behind. The report needs the
   * data; the model does not. A method keeps the split honest, and it keeps validation in
   * `src/report/`, where the rule about what makes a threshold trustworthy belongs.
   *
   * Cheap by construction: it reads the same TTL device cache `query()` primed moments earlier
   * (keyed by token, since `/devices` is organization-scoped), so a report costs no extra HTTP
   * request in the normal case.
   *
   * Returns `null` — not an error — for an unresolvable or ambiguous `requested`. A caller here
   * has already produced a report's worth of readings; failing the whole document over a
   * registry lookup would be worse than the one row it can still print as "not established".
   */
  async deviceRecord(requested?: string, token?: string): Promise<DeviceSummary | null> {
    try {
      const resolved = await this.resolveDevice(requested, token);
      return "device" in resolved ? resolved.device : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`device registry lookup failed for "${requested ?? "(default)"}": ${message}`);
      return null;
    }
  }

  /**
   * Public passthrough onto the private `resolveDevice()`, for other model-facing tools that need
   * the *same* device resolution and the *same* failure text `query_sensor_data` produces --
   * ambiguous match, no match, no devices for this token's organization -- rather than
   * `deviceRecord()`'s null-on-failure collapse (built for report generation, which needs to
   * degrade a document gracefully instead of surfacing a message to reword).
   *
   * `get_pod_thresholds` (`getPodThresholds.ts`) is the first caller: it needs the registry row,
   * not a reading, but a caller asking about the wrong device deserves the same "which pod did
   * you mean" error a sensor question would get, not a second, differently-worded one.
   *
   * Same cache as everything else here: `resolveDevice` calls `devices(token)`, which is the TTL
   * cache keyed by token, so a request that already called `query_sensor_data` costs this no
   * extra `/devices` call.
   */
  async resolveDeviceForTool(
    requested?: string,
    token?: string,
  ): Promise<{ device: DeviceSummary } | { error: SensorToolResult }> {
    return this.resolveDevice(requested, token);
  }

  /**
   * Public passthrough onto the private `devices()` TTL cache, for `list_pods` (`listPods.ts`),
   * which needs the whole fleet rather than one resolved row.
   *
   * Deliberately **not** `resolveDevice`: that collapses to exactly one pod and turns "more than
   * one device is visible" into an error, which is precisely the case `list_pods` exists to
   * answer. It returns the same `dedupeByLabel`'d list every other tool resolves against, so the
   * names it prints are the strings `device` accepts, and it shares the per-token cache, so
   * listing then reading costs one `/devices` round trip rather than two.
   */
  async listDevicesForTool(token?: string): Promise<DeviceSummary[]> {
    return this.devices(token);
  }

  /**
   * Public passthrough onto the private `lastReportedAt()`, for `list_pods`'s freshness column.
   *
   * Keeps that tool's best-effort semantics intact: this returns `null` both when the pod has
   * genuinely gone quiet and when `/water/last` filtered its readings for want of a GPS fix, so
   * a caller may report it as "not confirmed recently" and never as proof of silence.
   */
  async lastReportedForTool(label: string, token?: string): Promise<string | null> {
    return this.lastReportedAt(label, token);
  }

  /**
   * The clock this instance measures against, for the tools that share it (`list_pods`,
   * `generate_report`), so one injected `now` makes every age in a test deterministic.
   */
  clockMs(): number {
    return this.now();
  }

  /**
   * `device_last_reported_age` and `device_last_reported_stale`, beside `device_last_reported`.
   * Every window here is anchored to the device's newest reading, so without them a pod that went
   * silent ten days ago answers "now" with a ten-day-old reading that looks current
   * (`readingAge.ts`).
   */
  private lastReportedAge(iso: string): Record<string, unknown> {
    const age = readingAge(iso, this.now());
    return age ? { device_last_reported_age: age.age, device_last_reported_stale: age.stale } : {};
  }

  private async execute(
    args: Record<string, unknown>,
    token?: string,
    maxBuckets?: number,
    scope?: Map<string, Promise<SiteSnapshot>>,
  ): Promise<SensorToolResult> {
    const metricName = typeof args.metric === "string" ? normalize(args.metric) : "";
    // "all" fetches one window and reads every metric out of it — one API call, not six, and
    // six fewer chances for the model to drop a parameter while reassembling them.
    const metricKeys: MetricKey[] = metricName === "all"
      ? [...SUPPORTED_METRICS]
      : [METRIC_KEY_BY_NAME.get(metricName)].filter((key): key is MetricKey => key !== undefined);

    if (metricKeys.length === 0) {
      return failure(
        `Unknown metric "${String(args.metric)}". Valid metrics: ${METRIC_NAMES.join(", ")}, all.`,
      );
    }

    const aggregationName = typeof args.aggregation === "string" ? normalize(args.aggregation) : "";
    if (!isAggregation(aggregationName)) {
      return failure(
        `Unknown aggregation "${String(args.aggregation)}". Valid aggregations: ${AGGREGATIONS.join(", ")}.`,
      );
    }
    const aggregation: Aggregation = aggregationName;

    const bucket = typeof args.bucket === "string" ? normalize(args.bucket) : undefined;
    if (bucket !== undefined && !(bucket in BUCKET_MS)) {
      return failure(
        `Unknown bucket "${String(args.bucket)}". Valid buckets: ${Object.keys(BUCKET_MS).join(", ")}.`,
      );
    }
    const bucketMs = bucket === undefined || bucket === "auto" ? undefined : BUCKET_MS[bucket];

    const timeRangeInput = typeof args.time_range === "string" ? args.time_range : "";
    let parsed;
    try {
      parsed = parseTimeRange(timeRangeInput);
    } catch (error) {
      if (error instanceof TimeRangeError) {
        return failure(error.message);
      }
      throw error;
    }

    const resolved = await this.resolveDevice(
      typeof args.device === "string" ? args.device : undefined,
      token,
    );
    if ("error" in resolved) {
      return resolved.error;
    }
    const { device } = resolved;
    const { label } = device;
    if (typeof label !== "string" || label === "") {
      // Six of the 21 visible devices have no name, and the registry is not guaranteed clean
      // (DEVICE_API.md §2). A row with no label cannot be queried at all — every /water/*
      // route keys on it — so this is a real registry state, not a defensive impossibility.
      return failure(
        `Device "${device.name ?? device.id}" has no dev: label in the registry, so its readings `
        + "cannot be queried.",
      );
    }

    // The site's history, not just this Notecard's. A merge moves the registry row and leaves
    // the readings behind under the old label, so a survivor can hold under 4 % of its own
    // site's record (`BACKEND_FIELDS.md` §4a). Resolved off the caller's own device list, which
    // `resolveDevice` has already fetched and cached, so this costs no extra request.
    const requestedChain = resolveChain(device, await this.devices(token));
    const snapshot = await this.snapshot(requestedChain, token, scope);
    const { chain, site } = snapshot;

    const single = metricKeys.length === 1 ? metricKeys[0] : undefined;
    const identity = {
      device: {
        name: device.name ?? label,
        label,
        operating_environment: device.operatingEnvironment ?? null,
        // Disclosed rather than silent: the numbers below come from these labels and not from
        // the withheld ones, and a reader cannot tell that from the values alone.
        ...(chain.labels.length > 1 ? { history_labels: chain.labels } : {}),
        ...(chain.withheld.length > 0 ? { history_withheld: chain.withheld } : {}),
      },
      metric: single ? NAME_BY_METRIC_KEY.get(single) : "all",
      ...(single ? { unit: unitFor(single) } : {}),
      aggregation,
    };

    const referenceIso = QuerySensorData.newestObservedAt(snapshot.rows);
    if (referenceIso === null) {
      return {
        ...identity,
        time_range_requested: timeRangeInput,
        time_range_resolved: null,
        value: null,
        n_samples: 0,
        excluded_faulted: 0,
        device_last_reported: snapshot.lastReported ?? null,
        ...(snapshot.lastReported ? this.lastReportedAge(snapshot.lastReported) : {}),
        note: ["No readings found in available history.", site.note, ...(chain.notes ?? []),
          snapshot.lastReported ? `This device last reported at ${snapshot.lastReported}.` : null,
          chain.withheld.length ? "Earlier history was withheld for this account." : null]
          .filter(Boolean).join(" "),
        // "No readings" and the last report are derived by the page from the fields above.
        ...QuerySensorData.userNotes([
          ...(site.userNotes ?? []), ...(chain.notes ?? []),
          chain.withheld.length ? WITHHELD_USER_NOTE : undefined,
        ]),
      };
    }
    const referenceMs = Date.parse(referenceIso);
    const range = resolveRange(parsed, referenceMs);
    const { readings } = site;
    const stuck = stuckTurbidityReadings(readings);
    const inRequestedRange = (row: DeviceReading): boolean => {
      const time = Date.parse(row.observedAt!);
      return time >= range.startMs
        && (range.endInclusive ? time <= range.endMs : time < range.endMs);
    };
    const excludedStuck = [...stuck].filter(inRequestedRange).length;

    // One fetched window, read once per requested metric. The device API is not touched again.
    const computed = metricKeys.map((key) => {
      const usable = key === "turbidity" ? readings.filter((row) => !stuck.has(row)) : readings;
      const samples = QuerySensorData.samplesInRange(usable, key, range);
      return {
        key,
        samples,
        result: aggregate(
          samples,
          aggregation,
          this.rawLimit,
          { bucketMs, ...(maxBuckets !== undefined ? { maxBuckets } : {}) },
        ),
      };
    });

    const shape = (key: MetricKey, result: AggregateResult): Record<string, unknown> => ({
      unit: unitFor(key),
      ...(key === "turbidity" && excludedStuck > 0
        ? { excluded_stuck: excludedStuck, sensor_quality: "likely failed sensor" } : {}),
      value: result.value,
      n_samples: result.nSamples,
      excluded_faulted: result.excludedFaulted,
      ...(result.excludedImplausible > 0
        ? { excluded_implausible: result.excludedImplausible }
        : {}),
      ...(result.observedAt ? { observed_at: result.observedAt } : {}),
      ...(result.samples ? { samples: result.samples } : {}),
      ...(result.series ? { series: result.series, bucket_ms: result.bucketMs } : {}),
      ...(result.truncated
        ? { truncated: true, truncated_to: this.rawLimit, truncated_kept: result.truncatedKept }
        : {}),
    });

    const coveredFromMs = Math.max(range.startMs, snapshot.fromMs);
    const partial = coveredFromMs > range.startMs;

    const position = QuerySensorData.newestPosition(readings, range);

    const common = {
      ...identity,
      current_site_last_reported: QuerySensorData.newestObservedAt(readings),
      ...(site.note ? { site_note: site.note } : {}),
      time_range_requested: timeRangeInput,
      time_range_resolved: { start: range.start, end: range.end, label: range.label },
      // Omitted rather than nulled when no reading carried a fix, so a consumer cannot mistake
      // an absent GPS lock for coordinates of 0,0 — the same rule metrics.ts applies to `lat`.
      ...(position ? { position } : {}),
      window_actually_searched: {
        start: new Date(snapshot.fromMs).toISOString(),
        end: new Date(snapshot.at).toISOString(),
        ...(partial
          ? { complete: false, reason: "Earlier history predates the established site context and is excluded." }
          : { complete: true }),
      },
      device_last_reported: new Date(referenceMs).toISOString(),
      ...this.lastReportedAge(new Date(referenceMs).toISOString()),
    };

    const totalSamples = computed.reduce((sum, entry) => sum + entry.result.nSamples, 0);
    const implausible = computed
      .filter((entry) => entry.result.excludedImplausible > 0)
      .map((entry): [MetricKey, number] => [entry.key, entry.result.excludedImplausible]);
    // Judged on the samples `aggregate` actually used, so a faulted or implausible reading
    // cannot hide an otherwise all-zero window, and a window with none left is not "all zero".
    const turbidityValues = computed
      .find((entry) => entry.key === "turbidity")
      ?.samples.filter((sample) => sample.valid && sample.plausible !== false)
      .map((sample) => sample.value) ?? [];
    const allZeroTurbidity = turbidityValues.length > 0
      && isAllZeroTurbidity(turbidityValues.reduce((max, v) => Math.max(max, v), 0));
    const notes = this.notes(
      metricKeys,
      device,
      chain,
      totalSamples,
      referenceMs,
      range.start,
      implausible,
      allZeroTurbidity,
    );

    const stuckExcluded = metricKeys.includes("turbidity") && excludedStuck > 0;
    const extraNotes = [notes.note, site.note, stuckExcluded ? STUCK_SENSOR_NOTE : undefined]
      .filter(Boolean);
    if (extraNotes.length) notes.note = extraNotes.join(" ");
    Object.assign(notes, QuerySensorData.userNotes([
      ...(notes[USER_NOTES_FIELD] as string[] | undefined ?? []),
      ...(site.userNotes ?? []),
      stuckExcluded ? STUCK_SENSOR_USER_NOTE : undefined,
    ]));

    if (single) {
      // Flat shape for a single metric — unchanged from before multi-metric existed, so nothing
      // reading `result.value` had to learn a new shape.
      return { ...common, ...shape(single, computed[0].result), ...notes };
    }

    // Every metric comes off the same rows, so for `latest`/`earliest` they all share one
    // instant. Surfacing it at the top level as well as per-metric matters: without it a model
    // asked "when was the earliest reading" reached for `time_range_resolved.start` — the window
    // boundary — and reported 2016 for a pod whose first reading is 2026-06-13.
    const observedAts = new Set(
      computed
        .map((entry) => entry.result.observedAt)
        .filter((at): at is string => at !== undefined),
    );

    return {
      ...common,
      ...(observedAts.size === 1 ? { observed_at: [...observedAts][0] } : {}),
      metrics: Object.fromEntries(computed.map((entry) => [
        NAME_BY_METRIC_KEY.get(entry.key) as string,
        shape(entry.key, entry.result),
      ])),
      ...notes,
    };
  }

  /**
   * The newest in-window reading's position, or null when none carries a GPS fix.
   *
   * Coordinates ride on the *readings*, not on the device registry — `DeviceSummary.raw` has no
   * lat/lon field at all (verified live on `dev:351077454569099`). `decodeReading` already parses
   * them via `resolvePosition`, which is why this needs no extra API call: it reads the window
   * that was fetched anyway. Newest-first because a pod drifts on its mooring, so the most
   * recent fix is the one that describes where it is now.
   */
  private static newestPosition(
    readings: DeviceReading[],
    range: ResolvedRange,
  ): { latitude: number; longitude: number; location?: string } | null {
    const { startMs, endMs, endInclusive } = range;
    const positioned = readings
      .filter((reading) => {
        if (reading.latitude === undefined || reading.longitude === undefined) {
          return false;
        }
        const atMs = reading.observedAt ? Date.parse(reading.observedAt) : Number.NaN;
        return Number.isFinite(atMs)
          && atMs >= startMs && (endInclusive ? atMs <= endMs : atMs < endMs);
      })
      .sort((a, b) => Date.parse(b.observedAt as string) - Date.parse(a.observedAt as string));

    const newest = positioned[0];
    if (!newest) {
      return null;
    }
    return {
      latitude: newest.latitude as number,
      longitude: newest.longitude as number,
      ...(newest.location ? { location: newest.location } : {}),
    };
  }

  /** Newest `observedAt` across a series, or null when none of them carries a usable one. */
  private static newestObservedAt(readings: DeviceReading[]): string | null {
    const times = readings
      .map((reading) => (reading.observedAt ? Date.parse(reading.observedAt) : Number.NaN))
      .filter((ms) => Number.isFinite(ms));
    return times.length === 0 ? null
      : new Date(times.reduce((latest, time) => Math.max(latest, time), -Infinity)).toISOString();
  }

  /** Extracts one metric from each reading that falls inside the resolved window. */
  private static samplesInRange(
    readings: DeviceReading[],
    metricKey: MetricKey,
    range: ResolvedRange,
  ): Sample[] {
    // `endInclusive` is decided by the phrase, not guessed here — see ResolvedRange. A relative
    // window ends *at* the newest reading, so an exclusive end would drop exactly the reading
    // the question is usually about.
    const { startMs, endMs, endInclusive } = range;
    const inRange = (ms: number): boolean => (
      ms >= startMs && (endInclusive ? ms <= endMs : ms < endMs)
    );

    return readings.flatMap((reading) => {
      const at = reading.observedAt;
      if (!at) {
        return [];
      }
      const atMs = Date.parse(at);
      if (!Number.isFinite(atMs) || !inRange(atMs)) {
        return [];
      }
      const metric = reading.metrics[metricKey];
      // `value !== undefined`, never a falsy check: 0 is a real reading for ORP and turbidity.
      if (!metric || metric.value === undefined) {
        return [];
      }
      return [{
        atMs,
        at,
        value: metric.value,
        valid: metric.valid,
        // Classified here, where the metric key is known, rather than in `aggregate`. Catches
        // probe rails the hardware did not flag -- see devices/plausibility.ts for the verified
        // -1023 °C temperature sentinel that motivated it.
        plausible: isPlausible(metricKey, metric.value),
      }];
    });
  }

  /** Best-effort "when did this pod last speak", used only when a window came back empty. */
  private async lastReportedAt(label: string, token?: string): Promise<string | null> {
    try {
      const reading = await this.client(token).getLastReading(label);
      return reading?.observedAt ?? null;
    } catch (error) {
      // Already in the no-data path; a second failure should not replace a useful answer
      // with an error.
      log.warn(`Could not read last reading for ${label}: ${(error as Error).message}`);
      return null;
    }
  }

  /** `USER_NOTES_FIELD` holding the given sentences once each, or nothing when there are none. */
  private static userNotes(texts: Array<string | undefined>): Record<string, string[]> {
    const unique = [...new Set(texts.filter((text): text is string => Boolean(text)))];
    return unique.length > 0 ? { [USER_NOTES_FIELD]: unique } : {};
  }

  /**
   * Caveats that belong with the number rather than in a doc nobody reads at answer time.
   *
   * The water-type note is a **flag, not a fix**. `WATER_TYPE` is one global env var, while pods
   * differ in water type — one deployment cannot describe both. The system prompt no longer carries
   * ranges (deleted 2026-09-13; pod limits come from `get_pod_thresholds`), so the global value now
   * only frames the answer. Reading water type per device in chat is unbuilt Phase N4 work, no
   * longer gated by ◆G3, which resolved 2026-09-13 (`DEVICE_API.md` §12c). Surfacing the
   * disagreement here at least stops the model describing a saltwater pod as freshwater in silence.
   */
  private notes(
    metricKeys: MetricKey[],
    device: DeviceSummary,
    chain: DeviceChain,
    nSamples: number,
    referenceMs: number,
    rangeStart: string,
    implausible: Array<[MetricKey, number]> = [],
    allZeroTurbidity = false,
  ): Record<string, unknown> {
    const notes: string[] = [...(chain.notes ?? [])];
    // The reader's version of the caveats a person needs, without instructions to the model;
    // the page shows these, never `note` (see `USER_NOTES_FIELD`). Caveats the page already
    // derives from structured fields (no readings, provisional turbidity) are not repeated.
    const userNotes: string[] = [...(chain.notes ?? [])];

    if (chain.labels.length > 1) {
      // Said out loud because the alternative is a number whose provenance is invisible: these
      // are the same physical site under successive Notecards, and a reader comparing this
      // against a single-label export needs to know why the counts differ.
      notes.push(
        `This site's readings are spread across ${chain.labels.length} device labels — a `
        + "replaced Notecard mints a new label and the older readings keep the old one. This "
        + `answer covers all of them (${chain.labels.join(", ")}), de-duplicated where their `
        + "spans overlap.",
      );
      userNotes.push(
        `Includes readings recorded under this site's earlier device labels (${chain.labels.join(", ")}).`,
      );
    }

    if (chain.withheld.length > 0) {
      // A withheld predecessor is not absent data, and the difference matters: the site has that
      // history, this account may not read it. Reported as a limit on the answer, never as a
      // statement that the readings do not exist.
      const parts = chain.withheld.map((entry) => `${entry.label} (${entry.reason})`);
      notes.push(
        `Earlier readings from this site were NOT included: ${parts.join("; ")}. `
        + "Say that the history shown may start later than the site's first reading.",
      );
      userNotes.push(WITHHELD_USER_NOTE);
    }

    if (chain.mergedInto) {
      const merged = `This device was retired and merged into ${chain.mergedInto}, so its `
        + "readings stop at the merge. Current data for the site is under that label.";
      notes.push(merged);
      userNotes.push(merged);
    }

    if (implausible.length > 0) {
      // Said out loud rather than silently dropped: a probe that rails without setting its
      // error flag is a maintenance finding in its own right, and a reader comparing this
      // answer against a raw export needs to know why the counts differ.
      const parts = implausible.map(([key, count]) => {
        const label = METRIC_BY_KEY.get(key)?.label ?? key;
        return `${count} ${label} reading(s) ${implausibilityReason(key)}`;
      });
      notes.push(
        `Excluded as physically impossible despite no probe fault flag: ${parts.join("; ")}. `
        + "These are sensor rails, not measurements, and are not counted in any statistic above.",
      );
      userNotes.push(
        `Left out as sensor faults, not measurements: ${parts.join("; ")}.`,
      );
    }

    if (nSamples === 0) {
      notes.push(
        `No readings fall inside ${rangeStart} to the end of the requested range. `
        + `This device's most recent reading is ${new Date(referenceMs).toISOString()}.`,
      );
    }

    if (metricKeys.includes("turbidity")) {
      notes.push(
        "Turbidity is derived from a raw voltage by a provisional, uncalibrated conversion. "
        + "It is a relative index with no unit, not a calibrated measurement and not NTU.",
      );
    }

    if (allZeroTurbidity) {
      notes.push(TURBIDITY_ALL_ZERO_CAVEAT);
      userNotes.push(TURBIDITY_ALL_ZERO_CAVEAT);
    }

    const environment = device.operatingEnvironment;
    const deviceWaterType = environment?.includes("salt") ? "saltwater" : "freshwater";
    if (environment && deviceWaterType !== this.waterType) {
      notes.push(
        `This device operates in ${environment}, but the deployment's configured water type is `
        + `${this.waterType}. Your instructions carry no ranges; to judge this reading against `
        + "limits, use this pod's configured thresholds from get_pod_thresholds.",
      );
    }

    return {
      ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
      ...(userNotes.length > 0 ? { [USER_NOTES_FIELD]: userNotes } : {}),
    };
  }
}

/**
 * The function schema shown to the model.
 *
 * Wording matters more than usual here. The description is the only thing standing between a
 * question about a reading and an answer invented from the CONTEXT documents, which is why it
 * says what the tool is the *only* source of rather than merely what it does.
 */
export const querySensorDataDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "query_sensor_data",
    description:
      "Get a statistic from this deployment's real water-quality sensors. This is the only "
      + "source of actual readings — the provided documents never contain them. Use it for any "
      + "question about current or past values, averages, minimums, maximums, or trends. "
      + "Returns value: null with n_samples: 0 when no reading exists in the window; that means "
      + "no data, never a reading of zero.",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: [...METRIC_NAMES, "all"],
          description:
            "Which parameter to read. Use \"all\" to get every parameter from one call — prefer "
            + "that over six separate calls when the question covers the whole pod.",
        },
        time_range: {
          type: "string",
          description:
            "Natural-language window, resolved against the device's most recent reading rather "
            + "than the current clock. Accepted: \"last N hours/days/weeks/months\", \"last day\", "
            + "\"last week\", \"today\", \"yesterday\", \"this week\", \"now\" for the single latest "
            + "reading, \"YYYY-MM-DD\", or \"YYYY-MM-DD to YYYY-MM-DD\".",
        },
        aggregation: {
          type: "string",
          enum: [...AGGREGATIONS],
          description:
            "How to reduce the window. \"latest\" for the current value, \"earliest\" for the first "
            + "reading in the window, \"mean\" for a typical value, \"series\" for a bucketed summary "
            + "over time (use this for trends — it is exact, unlike \"raw\", which is capped and "
            + "drops the OLDEST rows first).",
        },
        bucket: {
          type: "string",
          enum: ["auto", "hour", "day", "week"],
          description:
            "Bucket width for aggregation \"series\". Omit it — the default derives a sensible "
            + "width from the window, which is almost always what you want.",
        },
        device: {
          type: "string",
          description:
            "Which pod, by name or dev: label. Optional when the deployment has one device or a "
            + "default is configured. Ask the user rather than guessing if the tool reports the "
            + "name is ambiguous.",
        },
      },
      required: ["metric", "time_range", "aggregation"],
    },
  },
};

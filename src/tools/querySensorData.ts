/* eslint-disable max-classes-per-file -- SensorQueryError is a one-line subclass that belongs
   with the module whose contract it is part of, not in utils/errors.ts, which holds the
   HTTP-shaped errors. Same exemption .eslintrc.js already grants that file. */
import { config } from "../config";
import { DeviceApiClient } from "../devices/DeviceApiClient";
import { METRIC_BY_KEY, METRICS } from "../devices/metrics";
import { implausibilityReason, isPlausible } from "../devices/plausibility";
import type { DeviceReading, DeviceSummary, MetricKey } from "../types/device.types";
import { resolveErrorCode } from "../utils/errors";
import { createLogger } from "../utils/logger";
import type { ToolContext, ToolDefinition } from "../types/tool.types";
import {
  AGGREGATIONS, aggregate, isAggregation,
} from "./aggregate";
import type { AggregateResult, Aggregation, Sample } from "./aggregate";
import {
  TimeRangeError,
  fetchWindowFor,
  lookbackMsFor,
  parseTimeRange,
  resolveRange,
  widerWindow,
} from "./timeRange";
import type { FetchWindow, ResolvedRange } from "./timeRange";

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
 * - **The window is widened when it comes back empty**, because one of the two cleared pods has
 *   been silent for days and the reference instant has to be found before a relative range can
 *   be resolved at all.
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

/** Empty-window escalations before giving up. Two rungs: day → week → month. */
const MAX_ESCALATIONS = 2;

/**
 * Floor on the window a query may ask for. Guards the "now" case and any range whose start is
 * in the future, either of which would otherwise compute a zero or negative look-back.
 */
const MIN_LOOKBACK_MS = 60 * 60_000;

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
   * The key for "no caller token" is the empty string — that is the `DEVICE_API_TOKEN` fallback,
   * which is a real, distinct scope of its own.
   */
  private deviceCache = new Map<string, { at: number; devices: DeviceSummary[] }>();

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
    // Built per call, not memoized: the token varies by caller, and a client cached on this
    // shared instance would authenticate one user's request as another.
    return this.clientOverride ?? new DeviceApiClient({ token });
  }

  private async devices(token?: string): Promise<DeviceSummary[]> {
    const key = token ?? "";
    const cached = this.deviceCache.get(key);
    if (cached && this.now() - cached.at < DEVICE_CACHE_MS) {
      return cached.devices;
    }
    const devices = dedupeByLabel(await this.client(token).listDevices());
    this.deviceCache.set(key, { at: this.now(), devices });
    return devices;
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

  /**
   * Fetches a raw window, widening it when it comes back empty.
   *
   * An empty window is not an answer: the reference instant that anchors every relative range
   * lives inside the data, so a pod silent for six days needs a wider look-back before "the last
   * day" can mean anything at all.
   */
  private async fetchWindow(
    label: string,
    lookbackMs: number,
    token?: string,
  ): Promise<{ readings: DeviceReading[]; window: FetchWindow }> {
    let window = fetchWindowFor(lookbackMs);
    let readings = await this.client(token).getPeriod(window.duration, window.unit, label);
    let escalations = 0;

    while (readings.length === 0 && escalations < MAX_ESCALATIONS) {
      const wider = widerWindow(window);
      if (!wider) {
        break;
      }
      window = wider;
      // eslint-disable-next-line no-await-in-loop
      readings = await this.client(token).getPeriod(window.duration, window.unit, label);
      escalations += 1;
    }

    return { readings, window };
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
      if (resolveErrorCode(error) === "device_auth_expired") {
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
   * for `generateReport.ts`, N6 landing) -- omit it and, same as an unauthenticated `run()` call,
   * the device API falls back to `DEVICE_API_TOKEN`, which on an organization-scoped API answers
   * out of that token's fleet rather than the caller's.
   */
  async query(params: SensorQueryParams, token?: string): Promise<SensorToolResult> {
    const result = await this.execute({
      metric: params.metric,
      time_range: params.timeRange,
      aggregation: params.aggregation,
      ...(params.device !== undefined ? { device: params.device } : {}),
      ...(params.bucket !== undefined ? { bucket: params.bucket } : {}),
    }, token);

    if (typeof result.error === "string") {
      throw new SensorQueryError(result.error);
    }
    return result;
  }

  private async execute(args: Record<string, unknown>, token?: string): Promise<SensorToolResult> {
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

    const single = metricKeys.length === 1 ? metricKeys[0] : undefined;
    const identity = {
      device: {
        name: device.name ?? label,
        label,
        operating_environment: device.operatingEnvironment ?? null,
      },
      metric: single ? NAME_BY_METRIC_KEY.get(single) : "all",
      ...(single ? { unit: unitFor(single) } : {}),
      aggregation,
    };

    // Step 1: find the reference instant, cheaply.
    //
    // Every relative range is anchored to the device's newest reading (§8 step 2), and the API's
    // period route is a rolling window ending at the *server's* now. Those differ by however
    // stale the pod is, so a window sized from the phrase alone can start after the range does —
    // "last week" on a six-day-silent pod fetches the last seven days from now, which reaches
    // back only to the day before its final reading. That yields a real statistic over a
    // fraction of the window it claims, with nothing in the result saying so.
    //
    // Asking `/water/last` first — one document — makes the window sizeable in one shot instead
    // of fetching a series, discovering it was short, and fetching a wider one. Two calls either
    // way, but the first is now tiny and the second is exactly the right size.
    let referenceIso = await this.lastReportedAt(label, token);
    let readings: DeviceReading[] = [];
    let probeSpanMs = 0;

    if (referenceIso === null) {
      // `/water/last` drops readings with no GPS fix, so a null here is not proof of silence.
      // Fall back to widening period windows, which do not filter, to find any data at all.
      const probe = await this.fetchWindow(label, lookbackMsFor(parsed, this.now()), token);
      readings = probe.readings;
      probeSpanMs = probe.window.spanMs;
      referenceIso = QuerySensorData.newestObservedAt(readings);
    }

    if (referenceIso === null) {
      return {
        ...identity,
        time_range_requested: timeRangeInput,
        time_range_resolved: null,
        value: null,
        n_samples: 0,
        excluded_faulted: 0,
        device_last_reported: null,
        note: "No readings found, and the device API has no last reading for this device either.",
      };
    }

    const referenceMs = Date.parse(referenceIso);
    if (!Number.isFinite(referenceMs)) {
      return failure("The device API returned a reading with no usable timestamp.");
    }
    const range = resolveRange(parsed, referenceMs);

    // Step 2: one window, sized to reach from now back to the start of the resolved range.
    const neededLookback = Math.max(this.now() - range.startMs, MIN_LOOKBACK_MS);
    const window = fetchWindowFor(neededLookback);
    if (readings.length === 0 || window.spanMs > probeSpanMs) {
      readings = await this.client(token).getPeriod(window.duration, window.unit, label);
    }

    if (readings.length === 0) {
      return {
        ...identity,
        time_range_requested: timeRangeInput,
        time_range_resolved: { start: range.start, end: range.end, label: range.label },
        value: null,
        n_samples: 0,
        excluded_faulted: 0,
        device_last_reported: referenceIso,
        note: `No readings found in this window. This device last reported at ${referenceIso}.`,
      };
    }

    // One fetched window, read once per requested metric. The device API is not touched again.
    const computed = metricKeys.map((key) => ({
      key,
      result: aggregate(
        QuerySensorData.samplesInRange(readings, key, range),
        aggregation,
        this.rawLimit,
        { bucketMs },
      ),
    }));

    const shape = (key: MetricKey, result: AggregateResult): Record<string, unknown> => ({
      unit: unitFor(key),
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

    // The resolved range is what the phrase asked for; the fetched window is what the API's
    // fixed unit ladder could actually reach (it tops out at one year). When the phrase reaches
    // further back than the ladder, saying only "2016 to 2026" invites the reader to treat the
    // window start as the first reading — which is exactly what a model did with "last 10 years".
    const coveredFromMs = Math.max(range.startMs, this.now() - window.spanMs);
    const partial = coveredFromMs > range.startMs;

    const common = {
      ...identity,
      time_range_requested: timeRangeInput,
      time_range_resolved: { start: range.start, end: range.end, label: range.label },
      window_actually_searched: {
        start: new Date(coveredFromMs).toISOString(),
        end: range.end,
        ...(partial
          ? { complete: false, reason: "The device API's longest window is one year." }
          : { complete: true }),
      },
      device_last_reported: new Date(referenceMs).toISOString(),
    };

    const totalSamples = computed.reduce((sum, entry) => sum + entry.result.nSamples, 0);
    const implausible = computed
      .filter((entry) => entry.result.excludedImplausible > 0)
      .map((entry): [MetricKey, number] => [entry.key, entry.result.excludedImplausible]);
    const notes = this.notes(
      metricKeys,
      device,
      totalSamples,
      referenceMs,
      range.start,
      implausible,
    );

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

  /** Newest `observedAt` across a series, or null when none of them carries a usable one. */
  private static newestObservedAt(readings: DeviceReading[]): string | null {
    const times = readings
      .map((reading) => (reading.observedAt ? Date.parse(reading.observedAt) : Number.NaN))
      .filter((ms) => Number.isFinite(ms));
    return times.length === 0 ? null : new Date(Math.max(...times)).toISOString();
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

  /**
   * Caveats that belong with the number rather than in a doc nobody reads at answer time.
   *
   * The water-type note is a **flag, not a fix**. `WATER_TYPE` is one global env var selecting
   * the conductivity and turbidity ranges in the system prompt, and the two cleared pods are
   * different water types — one deployment cannot serve both. Making it per-device is Phase N4
   * work and an input to ◆G3 (`DEVICE_API.md` §12c). Surfacing the disagreement here at least
   * stops the model comparing a saltwater pod against freshwater limits in silence.
   */
  private notes(
    metricKeys: MetricKey[],
    device: DeviceSummary,
    nSamples: number,
    referenceMs: number,
    rangeStart: string,
    implausible: Array<[MetricKey, number]> = [],
  ): Record<string, unknown> {
    const notes: string[] = [];

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
        + "It is a relative index expressed in NTU, not a calibrated measurement.",
      );
    }

    const environment = device.operatingEnvironment;
    const deviceWaterType = environment?.includes("salt") ? "saltwater" : "freshwater";
    if (environment && deviceWaterType !== this.waterType) {
      notes.push(
        `This device operates in ${environment}, but the deployment's configured water type is `
        + `${this.waterType}. The normal ranges in your instructions are for ${this.waterType}; `
        + "say so if you compare this reading against them.",
      );
    }

    return notes.length > 0 ? { note: notes.join(" ") } : {};
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

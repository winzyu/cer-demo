import { config } from "../config";
import { DeviceApiClient } from "../devices/DeviceApiClient";
import { METRIC_BY_KEY, METRICS } from "../devices/metrics";
import type { DeviceReading, DeviceSummary, MetricKey } from "../types/device.types";
import { createLogger } from "../utils/logger";
import type { ToolDefinition } from "../types/tool.types";
import {
  aggregate, isAggregation,
} from "./aggregate";
import type { Aggregation, Sample } from "./aggregate";
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

export class QuerySensorData {
  private readonly clientOverride?: DeviceApiClient;

  private readonly now: () => number;

  private readonly rawLimit: number;

  private readonly defaultDeviceLabel?: string;

  private readonly waterType: string;

  private deviceCache?: { at: number; devices: DeviceSummary[] };

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
  private client(): DeviceApiClient {
    return this.clientOverride ?? new DeviceApiClient();
  }

  private async devices(): Promise<DeviceSummary[]> {
    const cached = this.deviceCache;
    if (cached && this.now() - cached.at < DEVICE_CACHE_MS) {
      return cached.devices;
    }
    const devices = dedupeByLabel(await this.client().listDevices());
    this.deviceCache = { at: this.now(), devices };
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
  ): Promise<{ device: DeviceSummary } | { error: SensorToolResult }> {
    const devices = await this.devices();
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
  ): Promise<{ readings: DeviceReading[]; window: FetchWindow }> {
    let window = fetchWindowFor(lookbackMs);
    let readings = await this.client().getPeriod(window.duration, window.unit, label);
    let escalations = 0;

    while (readings.length === 0 && escalations < MAX_ESCALATIONS) {
      const wider = widerWindow(window);
      if (!wider) {
        break;
      }
      window = wider;
      // eslint-disable-next-line no-await-in-loop
      readings = await this.client().getPeriod(window.duration, window.unit, label);
      escalations += 1;
    }

    return { readings, window };
  }

  /**
   * Runs the tool. **Never throws** — every failure becomes `{ error }` so the model can
   * recover inside the tool loop rather than the whole chat request 500ing (§3, §8).
   */
  async run(args: Record<string, unknown>): Promise<SensorToolResult> {
    try {
      return await this.execute(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`query_sensor_data failed: ${message}`);
      return failure(`Could not read sensor data: ${message}`);
    }
  }

  private async execute(args: Record<string, unknown>): Promise<SensorToolResult> {
    const metricName = typeof args.metric === "string" ? normalize(args.metric) : "";
    const metricKey = METRIC_KEY_BY_NAME.get(metricName);
    if (!metricKey) {
      return failure(
        `Unknown metric "${String(args.metric)}". Valid metrics: ${METRIC_NAMES.join(", ")}.`,
      );
    }

    const aggregationName = typeof args.aggregation === "string" ? normalize(args.aggregation) : "";
    if (!isAggregation(aggregationName)) {
      return failure(
        `Unknown aggregation "${String(args.aggregation)}". Valid aggregations: min, max, mean, median, latest, raw.`,
      );
    }
    const aggregation: Aggregation = aggregationName;

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

    const identity = {
      device: {
        name: device.name ?? label,
        label,
        operating_environment: device.operatingEnvironment ?? null,
      },
      metric: NAME_BY_METRIC_KEY.get(metricKey) ?? metricName,
      unit: unitFor(metricKey),
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
    let referenceIso = await this.lastReportedAt(label);
    let readings: DeviceReading[] = [];
    let probeSpanMs = 0;

    if (referenceIso === null) {
      // `/water/last` drops readings with no GPS fix, so a null here is not proof of silence.
      // Fall back to widening period windows, which do not filter, to find any data at all.
      const probe = await this.fetchWindow(label, lookbackMsFor(parsed, this.now()));
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
      readings = await this.client().getPeriod(window.duration, window.unit, label);
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

    const samples = QuerySensorData.samplesInRange(readings, metricKey, range);
    const result = aggregate(samples, aggregation, this.rawLimit);

    return {
      ...identity,
      time_range_requested: timeRangeInput,
      time_range_resolved: { start: range.start, end: range.end, label: range.label },
      value: result.value,
      n_samples: result.nSamples,
      excluded_faulted: result.excludedFaulted,
      device_last_reported: new Date(referenceMs).toISOString(),
      ...(result.observedAt ? { observed_at: result.observedAt } : {}),
      ...(result.samples ? { samples: result.samples } : {}),
      ...(result.truncated ? { truncated: true, truncated_to: this.rawLimit } : {}),
      ...this.notes(metricKey, device, result.nSamples, referenceMs, range.start),
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
        atMs, at, value: metric.value, valid: metric.valid,
      }];
    });
  }

  /** Best-effort "when did this pod last speak", used only when a window came back empty. */
  private async lastReportedAt(label: string): Promise<string | null> {
    try {
      const reading = await this.client().getLastReading(label);
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
    metricKey: MetricKey,
    device: DeviceSummary,
    nSamples: number,
    referenceMs: number,
    rangeStart: string,
  ): Record<string, unknown> {
    const notes: string[] = [];

    if (nSamples === 0) {
      notes.push(
        `No readings fall inside ${rangeStart} to the end of the requested range. `
        + `This device's most recent reading is ${new Date(referenceMs).toISOString()}.`,
      );
    }

    if (metricKey === "turbidity") {
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
          enum: [...METRIC_NAMES],
          description: "Which parameter to read. One metric per call.",
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
          enum: [...(["min", "max", "mean", "median", "latest", "raw"] as const)],
          description:
            "How to reduce the window. Use \"latest\" for the current value, \"mean\" for a typical "
            + "value, \"raw\" for the individual readings behind a trend.",
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

/** Every metric the tool can serve, for tests and diagnostics. */
export const SUPPORTED_METRICS = METRICS.map((metric) => metric.key);

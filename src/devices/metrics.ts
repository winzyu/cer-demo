import type {
  DeviceAverages,
  DeviceReading,
  MetricDefinition,
  MetricKey,
  MetricReading,
  TemperatureUnit,
} from "../types/device.types";

/**
 * The metric-code table.
 *
 * **Source of truth: `WaterAnalyticsService.mapWaterData` / `isValidData`** in
 * `clean-earth-rovers-server`, cross-checked against the dashboard's `MetricsDictionary`
 * (`user-dashboard/src/app/services/device-data.js`). The two agree.
 *
 * ⚠️ A third mapping exists in the backend's `DevicesService.checkWaterDataAndSendAlerts`, and it
 * is **wrong** — its codes are shifted (it calls 100 "pH", 97 "ORP", 102 "Dissolved Oxygen"), so
 * its threshold alerts compare each metric against another metric's limits. Do not port it, and
 * do not treat a disagreement with it as ambiguity about the real codes. Reported in
 * `docs/migration/DEVICE_API.md` §7.
 */
export const METRICS: readonly MetricDefinition[] = [
  {
    key: "dissolvedOxygen", code: 97, label: "Dissolved Oxygen", unit: "mg/L", errorFlag: "doError",
  },
  {
    key: "orp", code: 98, label: "ORP", unit: "mV", errorFlag: "orpError",
  },
  {
    key: "ph", code: 99, label: "pH", unit: null, errorFlag: "phError",
  },
  {
    key: "conductivity", code: 100, label: "Conductivity", unit: "µS/cm", errorFlag: "ecError",
  },
  {
    // Stored in Celsius. The backend converts to Fahrenheit on `/water/last` and
    // `/water/average` but NOT on `/water/period`, which returns the raw document — verified
    // live 2026-08-11: one document, timestamp 1786477045, came back as 78.78 from `last` and
    // 25.99 from `period`. `unit` here is the **normalized** unit; the decoder converts when a
    // caller says the payload is Celsius. See DEVICE_API.md §7.
    key: "temperature", code: 102, label: "Temperature", unit: "°F", errorFlag: "rtdError",
  },
  {
    // Not a stored measurement: the backend derives it from `water_data.turbVolt` via
    // `turbVoltToNTU`, whose own source file marks the conversion PROVISIONAL and not
    // lab-calibrated. The dashboard labels it "Turbidity (Relative)" for that reason.
    // Our system prompt states an authoritative `0-25 NTU` range — see DEVICE_API.md §8,
    // this is the one place the live feed contradicts a pinned control.
    key: "turbidity", code: 72, label: "Turbidity", unit: "NTU", errorFlag: "turbError",
  },
] as const;

export const METRIC_BY_CODE: ReadonlyMap<number, MetricDefinition> = new Map(
  METRICS.map((metric) => [metric.code, metric]),
);

export const METRIC_BY_KEY: ReadonlyMap<MetricKey, MetricDefinition> = new Map(
  METRICS.map((metric) => [metric.key, metric]),
);

/**
 * Coerces a payload value to a number.
 *
 * The backend stores several numeric fields as strings (`lat`, `lon`, `time_meas`, and every
 * threshold), so a strict `typeof === "number"` check would silently drop real data. An
 * unparseable value yields `undefined` rather than `NaN`, which would survive arithmetic and
 * surface much later as a nonsense reading.
 */
const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
);

/**
 * Decodes one metric out of a `water_data` payload.
 *
 * Validity is read from the metric's own error flag, matching the backend's `isValidData`:
 * a flag `> 0` means the hardware reported a fault for that probe. **A missing flag is treated
 * as valid**, because most historical documents predate the flags entirely and defaulting them
 * to invalid would discard the whole archive.
 */
export const decodeMetric = (
  waterData: Record<string, unknown>,
  metric: MetricDefinition,
  temperatureUnit: TemperatureUnit = "fahrenheit",
): MetricReading => {
  const errorFlagValue = toNumber(waterData[metric.errorFlag]);
  const rawValue = toNumber(waterData[String(metric.code)]);

  // Temperature is the one metric whose unit depends on which endpoint produced the payload.
  // Normalizing here — rather than at each call site — is what keeps a Celsius reading from
  // being compared against the system prompt's "32 to 95 °F" range and flagged as near-freezing.
  const needsConversion = metric.key === "temperature"
    && temperatureUnit === "celsius"
    && rawValue !== undefined;

  return {
    key: metric.key,
    code: metric.code,
    label: metric.label,
    unit: metric.unit,
    value: needsConversion ? (rawValue as number) * (9 / 5) + 32 : rawValue,
    valid: errorFlagValue === undefined || errorFlagValue <= 0,
    errorFlagValue,
    ...(needsConversion ? { convertedFrom: "celsius" as const } : {}),
  };
};

const decodeMetrics = (
  waterData: Record<string, unknown>,
  temperatureUnit: TemperatureUnit = "fahrenheit",
): Record<MetricKey, MetricReading> => (
  METRICS.reduce((acc, metric) => {
    acc[metric.key] = decodeMetric(waterData, metric, temperatureUnit);
    return acc;
  }, {} as Record<MetricKey, MetricReading>)
);

/**
 * Resolves a reading's position.
 *
 * The backend reads `lat`/`lon` from three different places depending on the endpoint — the
 * document root, `best_lat`/`best_lon` at the root, and inside `water_data` — because producer
 * firmware has been inconsistent. It falls back when `lat` is falsy **or zero**, and 0 here means
 * "no fix", not "the equator". Reproduced rather than simplified: picking one location would
 * return `undefined` for whichever firmware generation wrote to the others.
 */
const resolvePosition = (
  doc: Record<string, unknown>,
  waterData: Record<string, unknown>,
): { latitude?: number; longitude?: number } => {
  const candidates: Array<[unknown, unknown]> = [
    [doc.lat, doc.lon],
    [doc.best_lat, doc.best_lon],
    [waterData.lat, waterData.lon],
  ];
  const found = candidates
    .map(([lat, lon]) => ({ latitude: toNumber(lat), longitude: toNumber(lon) }))
    .find((pos) => pos.latitude !== undefined && pos.latitude !== 0);
  return found ?? {};
};

/**
 * Decodes a water-data document into a typed reading.
 *
 * `timestamp` is Unix epoch **seconds** on this API. Passing it to `new Date()` unmultiplied
 * yields January 1970, which reads as a plausible-looking bug rather than an obvious one — so
 * the conversion happens once, here, and `observedAt` is what everything downstream should use.
 */
export const decodeReading = (
  envelope: unknown,
  temperatureUnit: TemperatureUnit = "fahrenheit",
): DeviceReading => {
  const outer = asRecord(envelope);
  // `/water/*` returns `{ id, data: <doc> }`; some callers hand us the bare document.
  const doc = outer.data !== undefined ? asRecord(outer.data) : outer;
  const waterData = asRecord(doc.water_data);
  const timestamp = toNumber(doc.timestamp);

  return {
    id: typeof outer.id === "string" ? outer.id : undefined,
    device: typeof doc.device === "string" ? doc.device : undefined,
    timestamp,
    observedAt: timestamp === undefined ? undefined : new Date(timestamp * 1000).toISOString(),
    location: typeof doc.best_location === "string" ? doc.best_location : undefined,
    ...resolvePosition(doc, waterData),
    metrics: decodeMetrics(waterData, temperatureUnit),
    raw: doc,
  };
};

/**
 * Decodes `/water/average/:duration/:unit`, which returns a bare `{ "97": n, ... }` object —
 * metric codes only, no error flags, because the backend has already excluded invalid rows.
 *
 * **An empty window returns literal zeros, not an error or an absent field.** Verified live
 * 2026-08-11: `Old Woman Creek 2026` had not reported for four days, and its 1-day average came
 * back `{72:0, 97:0, 98:0, 99:0, 100:0, 102:0}`. Read naively that says the water is anoxic, at
 * pH 0, at 0 °F — a set of catastrophic readings rather than "no data", and exactly the kind of
 * fabricated figure the quality floor forbids.
 *
 * The `empty` flag requires **all six** metrics to be exactly 0 at once. That matters because 0
 * is a genuinely valid reading for ORP and turbidity (`timeline.md`), so no single zero can be
 * treated as missing — but pH 0 and 0 µS/cm and 0 °F simultaneously is not water, it is an empty
 * result set.
 */
export const decodeAverages = (device: string, payload: unknown): DeviceAverages => {
  const raw = asRecord(payload);
  const metrics = decodeMetrics(raw);
  const empty = METRICS.every((metric) => metrics[metric.key].value === 0);
  return {
    device, metrics, empty, raw,
  };
};

/** Formats a metric for display: value, unit, and an explicit marker when the probe faulted. */
export const formatMetric = (reading: MetricReading): string => {
  if (reading.value === undefined) {
    return `${reading.label}: —`;
  }
  const unit = reading.unit ? ` ${reading.unit}` : "";
  const definition = METRIC_BY_KEY.get(reading.key);
  const fault = reading.valid ? "" : `  [!] ${definition?.errorFlag ?? "error flag"} set`;
  return `${reading.label}: ${reading.value}${unit}${fault}`;
};

/**
 * Shapes returned by the Clean Earth backend (`clean-earth-rovers-server`), as observed by
 * reading its controllers and services rather than its `API_ENDPOINTS.md` — that file is stale
 * and documents none of the `/water/*` analytics routes this service depends on.
 *
 * Contract and provenance: `docs/migration/DEVICE_API.md`.
 */

/** Canonical name for each of the six parameters the DataPod reads. */
export type MetricKey =
  | "dissolvedOxygen"
  | "orp"
  | "ph"
  | "conductivity"
  | "temperature"
  | "turbidity";

export interface MetricDefinition {
  key: MetricKey;
  /** The numeric key this metric appears under inside a reading's `water_data` object. */
  code: number;
  /** Human-readable name, matching the dashboard's `MetricsDictionaryLabel`. */
  label: string;
  /**
   * Unit **as the API returns it**, which is not always the unit the sensor records.
   * Temperature is the trap: stored in Celsius, converted to Fahrenheit server-side before
   * it leaves `/water/*`.
   */
  unit: string | null;
  /**
   * Field inside `water_data` carrying this metric's hardware error flag. The backend treats
   * a value `> 0` as "this metric's reading is invalid" and excludes the row from averages
   * and CSV exports.
   */
  errorFlag: string;
}

/** A device (a "pod") as listed by `GET /devices`. */
export interface DeviceSummary {
  /** Firestore document id. Not the identifier any `/water/*` endpoint accepts. */
  id: string;
  /** Human-readable name — "Algalita pod", "OWC 2026", etc. */
  name?: string;
  /**
   * The query key. Format `dev:<numeric id>`, and the join key against a reading's
   * `device` field. Every `/water/*` route except `/water/tides` wants this whole string.
   */
  label?: string;
  organization?: string;
  /** e.g. "salt-water" — the backend's equivalent of this service's `WATER_TYPE`. */
  operatingEnvironment?: string;
  nextCalibrationDate?: string;
  /** Per-metric operator thresholds. Stored as strings by the backend's own seed script. */
  thresholds?: Record<string, string | number>;
  /** Everything else the document carries, kept so exploration can see unmodelled fields. */
  raw: Record<string, unknown>;
}

/** One decoded metric value from a reading. */
export interface MetricReading {
  key: MetricKey;
  code: number;
  label: string;
  unit: string | null;
  /** `undefined` when the metric is absent from the payload entirely. */
  value?: number;
  /**
   * False when the metric's error flag is `> 0`. A present-but-invalid reading is the case
   * that matters: the number looks plausible and the flag is the only thing saying otherwise.
   */
  valid: boolean;
  /** The raw error-flag value, so a caller can report *why* rather than just that. */
  errorFlagValue?: number;
  /**
   * Set when the decoder converted the payload value to `unit`. Temperature is the only case:
   * `/water/period` returns Celsius while `/water/last` and `/water/average` return Fahrenheit,
   * so the normalization has to be recorded rather than assumed.
   */
  convertedFrom?: TemperatureUnit;
}

/** Unit a payload carries for temperature (code 102). Endpoint-dependent — see `decodeReading`. */
export type TemperatureUnit = "celsius" | "fahrenheit";

/** A single water-data document, decoded. */
export interface DeviceReading {
  /** Firestore document id. */
  id?: string;
  /** The device `label` this reading belongs to. */
  device?: string;
  /** Unix epoch **seconds** (not milliseconds). */
  timestamp?: number;
  /** ISO-8601 rendering of `timestamp`, for anything human- or LLM-facing. */
  observedAt?: string;
  /** Human place name the backend attaches, e.g. "South Salt Lake UT". */
  location?: string;
  latitude?: number;
  longitude?: number;
  metrics: Record<MetricKey, MetricReading>;
  /** The undecoded document, retained for exploration and for fields we have not modelled. */
  raw: Record<string, unknown>;
}

/** Averages over a window, as returned by `/water/average/:duration/:unit`. */
export interface DeviceAverages {
  device: string;
  metrics: Record<MetricKey, MetricReading>;
  /**
   * True when the window contained no readings. The backend signals this by returning **zero
   * for every metric** rather than an error or an empty body, so without this flag "no data for
   * the last day" is indistinguishable from "anoxic water at pH 0 and 0 °F". Never report an
   * `empty` average as a measurement.
   */
  empty: boolean;
  raw: Record<string, unknown>;
}

/** Window units accepted by the `/water/*` period and average routes. */
export type PeriodUnit = "hour" | "day" | "week" | "month" | "year" | "fiveYears";

export const PERIOD_UNITS: readonly PeriodUnit[] = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "fiveYears",
] as const;

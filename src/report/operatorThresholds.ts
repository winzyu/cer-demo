/**
 * Reads the **operator-set** temperature range off a device registry row, and refuses to hand
 * one back unless it survives validation.
 *
 * Why this file exists at all. `referenceRanges.ts` deliberately has no temperature entry: the
 * source-of-truth doc calls temperature "Climate/season-dependent" for every water type and
 * closes with "Establish a site-specific baseline before treating deviations as events." That
 * site-specific baseline is not missing — it is in the backend's Firestore device registry, as
 * `thresholds.minTemperature` / `thresholds.maxTemperature`, set on 13 of the 15 live devices
 * (`docs/migration/BACKEND_FIELDS.md` §3, §3a). This module is the bridge, and it is kept
 * separate from `referenceRanges.ts` on purpose: that file is a transcription of two approved
 * documents and nothing operator-entered belongs in it.
 *
 * Why validation is not optional. These values are typed into a dashboard by hand, stored as
 * **strings**, and a live census (`BACKEND_FIELDS.md` §3c) found real junk in them:
 *
 *   - `Trinidad Island DataPod™` and `dev:860322068098448` have **all ten values `0`**. A range
 *     of 0–0 is the registry's "never configured" state, not a range in which every reading on
 *     Earth is an exceedance.
 *   - `CER Conference Pod` carries `maxPH=100`, `maxDissolvedOxygen=100` — placeholders someone
 *     typed to get past a form.
 *   - `Marina Park DataPod™` has `minORP=-2200`, almost certainly a typo for `-200`.
 *
 * Printing "temperature 72 °F is outside the acceptable range of 0–0" in a customer-facing PDF
 * is the same fabricated-figure failure class as reporting a probe rail as a measurement
 * (`plausibility.ts`). So every rejection below returns a *reason* and the report falls back to
 * "no baseline established", which is exactly what it printed before this module existed —
 * a missing baseline is a safe outcome, a wrong one is not.
 *
 * Pure and offline: it takes a plain record and returns a verdict. Nothing here touches the
 * device API.
 */
import { PLAUSIBLE_RANGES } from "../devices/plausibility";

/**
 * Sanity rail for an operator-entered temperature **baseline edge**, in °F.
 *
 * Deliberately narrower than `plausibility.ts`'s temperature rail (-40 to 140 °F). Those two
 * bounds answer different questions:
 *
 *   - `PLAUSIBLE_RANGES.temperature` asks "could a working probe in water have emitted this
 *     reading?" and is intentionally wide, because a bound tight enough to be interesting is a
 *     bound tight enough to silently delete a real excursion.
 *   - This rail asks "is this number an operator describing their site, or a placeholder?" A
 *     baseline edge outside the range natural surface water occupies is not a measurement that
 *     might be real — it is someone leaving a form field at its default.
 *
 * 25 °F sits below the freezing point of even brine (~28.4 °F for seawater); 110 °F sits above
 * the hottest natural surface water short of a geothermal spring. Every threshold observed live
 * clears it with room to spare — the widest real pair is Old Woman Creek 2026's 30–100 °F, and
 * the tightest is Algalita Pod's 50–80 °F. The values this rail actually rejects are `0` (the
 * all-zero rows) and the `100000`-style placeholders.
 *
 * Both edges must fall inside the rail. A pair with one good edge and one placeholder is
 * rejected whole rather than half-kept: clamping the bad edge to the rail would invent a number,
 * and inventing one is the thing this module exists to prevent.
 */
export const TEMPERATURE_BASELINE_RAIL_F: readonly [number, number] = [25, 110];

/**
 * The five metrics the registry carries an operator threshold pair for (`BACKEND_FIELDS.md` §1).
 * Turbidity has no threshold key on any device and is deliberately absent -- see
 * `getTurbidityInfo.ts`. Spelled to match `MetricKey` in `types/device.types.ts` so a caller
 * holding one already has the other.
 */
export type MetricThresholdKey = "temperature" | "ph" | "dissolvedOxygen" | "orp" | "conductivity";

/**
 * Wire metric name (`QuerySensorData`'s names, also `ParameterBaseline.key`) -> registry
 * threshold key. `buildReportInput.ts` and `generateReport.ts` both need this mapping to go from
 * a report row to the registry field pair backing it; kept here, next to `MetricThresholdKey`
 * itself, rather than copied in both places.
 */
export const WIRE_KEY_TO_METRIC: Record<string, MetricThresholdKey> = {
  temperature: "temperature",
  ph: "ph",
  dissolved_oxygen: "dissolvedOxygen",
  orp: "orp",
  conductivity: "conductivity",
};

/** Registry field names, exact spellings from the live documents (`BACKEND_FIELDS.md` §1, §3). */
const FIELD_KEYS: Record<MetricThresholdKey, { min: string; max: string }> = {
  temperature: { min: "minTemperature", max: "maxTemperature" },
  ph: { min: "minPH", max: "maxPH" },
  dissolvedOxygen: { min: "minDissolvedOxygen", max: "maxDissolvedOxygen" },
  orp: { min: "minORP", max: "maxORP" },
  conductivity: { min: "minConductivity", max: "maxConductivity" },
};

/** Human label for a metric, used only in generated rejection sentences. */
const METRIC_LABELS: Record<MetricThresholdKey, string> = {
  temperature: "temperature",
  ph: "pH",
  dissolvedOxygen: "dissolved oxygen",
  orp: "ORP",
  conductivity: "conductivity",
};

/**
 * Sanity rails per metric, in the registry's own unit. Both edges of a pair must lie inside the
 * rail (see `withinRail` below). These catch data-entry garbage -- pH "100", ORP "-2200", the
 * all-zero "never configured" rows -- not operator judgement, and every threshold pair observed
 * live on the fleet on 2026-09-13 clears all five rails with room to spare.
 *
 * `temperature`'s rail is `TEMPERATURE_BASELINE_RAIL_F`, unchanged from before this table existed
 * -- see its own docstring for why 25-110 °F was chosen, and why it is deliberately tighter than
 * the probe can report: the report uses it as a site baseline, and that behaviour must not move.
 *
 * **The other four reuse the probe's own plausibility rails** (`PLAUSIBLE_RANGES` in
 * `src/devices/plausibility.ts`) rather than a second set of invented numbers. The test is the
 * same one that file applies to a reading: a configured limit the probe can never report is not a
 * limit, it is a placeholder. pH 0-14 is the scale itself; dissolved oxygen 0-30 mg/L allows ~200%
 * supersaturation; ORP -2,000 to 2,000 mV; conductivity 0-100,000 µS/cm. Both edges are inclusive.
 *
 * What these rails reject: `maxPH=100`, `maxDissolvedOxygen=100`, `minORP=-2200`. What they
 * deliberately **accept**: an operator's generous or odd-but-physical choice, such as Balboa Yacht
 * Basin Buoy's `maxDissolvedOxygen=27` or Old Woman Creek's `maxConductivity=100000`. Those are
 * reported to the model as configured alert limits, which is what they literally are; whether they
 * are *good* limits is the operator's data to fix, not this validator's to overrule.
 */
const RAILS: Record<MetricThresholdKey, readonly [number, number]> = {
  temperature: TEMPERATURE_BASELINE_RAIL_F,
  ph: [PLAUSIBLE_RANGES.ph.min, PLAUSIBLE_RANGES.ph.max],
  dissolvedOxygen: [PLAUSIBLE_RANGES.dissolvedOxygen.min, PLAUSIBLE_RANGES.dissolvedOxygen.max],
  orp: [PLAUSIBLE_RANGES.orp.min, PLAUSIBLE_RANGES.orp.max],
  conductivity: [PLAUSIBLE_RANGES.conductivity.min, PLAUSIBLE_RANGES.conductivity.max],
};

/**
 * Why a threshold pair was not usable. Carried out of the validator rather than collapsed to
 * `undefined` so the report can say which kind of "no baseline" this is, and so the tests can
 * pin each rule independently.
 */
export type ThresholdRejection =
  /** The device row carries no `thresholds` object at all (2 of 15 devices). */
  | "no-thresholds"
  /** `thresholds` exists but one or both temperature keys are absent. */
  | "missing"
  /** Present but not a finite number once cast — empty string, null, "n/a", etc. */
  | "non-numeric"
  /** `min === max`. The registry's unset state, not a zero-width acceptable range. */
  | "unset"
  /** `min > max`. Transposed or mistyped; there is no honest way to read it. */
  | "inverted"
  /** An edge falls outside TEMPERATURE_BASELINE_RAIL_F — a placeholder, not a site baseline. */
  | "implausible";

export type ThresholdVerdict =
  | { usable: true; min: number; max: number }
  | { usable: false; reason: ThresholdRejection };

/**
 * Casts one registry threshold value to a number.
 *
 * Only `string` and `number` are accepted, and an all-whitespace string is rejected explicitly,
 * because `Number("")`, `Number(" ")` and `Number(null)` are all **0** — the exact value the
 * all-zero rows carry. Letting any of them through the cast would turn "this field is blank"
 * into "the operator set this edge to 0 °F", which then reads as a real baseline.
 */
const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const withinRail = (value: number, rail: readonly [number, number]): boolean => {
  const [lo, hi] = rail;
  return value >= lo && value <= hi;
};

/**
 * The device's operator-set range for one metric, in the registry's own unit, or the reason there
 * isn't a usable one.
 *
 * Generalised from what was originally `temperatureThreshold`'s body alone -- same five rules,
 * now parameterised by `FIELD_KEYS`/`RAILS` instead of hard-coding the temperature pair. Units:
 * whatever the registry itself stores (°F for temperature, matching what `metrics.ts` normalizes
 * code 102 to) -- no conversion happens here, and none should be added without re-checking the
 * dashboard, because a silent unit mix-up here would produce a plausible-looking wrong range
 * rather than an obvious one.
 */
export const metricThreshold = (
  thresholds: Record<string, string | number> | null | undefined,
  metric: MetricThresholdKey,
): ThresholdVerdict => {
  if (!thresholds || typeof thresholds !== "object" || Object.keys(thresholds).length === 0) {
    return { usable: false, reason: "no-thresholds" };
  }

  const { min: minKey, max: maxKey } = FIELD_KEYS[metric];
  const rawMin = (thresholds as Record<string, unknown>)[minKey];
  const rawMax = (thresholds as Record<string, unknown>)[maxKey];
  if (rawMin === undefined || rawMax === undefined || rawMin === null || rawMax === null) {
    return { usable: false, reason: "missing" };
  }

  const min = toNumber(rawMin);
  const max = toNumber(rawMax);
  if (min === undefined || max === undefined) {
    return { usable: false, reason: "non-numeric" };
  }

  // Order matters: `min === max` is checked before `min > max` so an all-zero row reports as
  // "never configured" rather than as a data-entry mistake, and before the rail so the reason
  // names the actual registry state instead of blaming the value's magnitude.
  if (min === max) {
    return { usable: false, reason: "unset" };
  }
  if (min > max) {
    return { usable: false, reason: "inverted" };
  }
  const rail = RAILS[metric];
  if (!withinRail(min, rail) || !withinRail(max, rail)) {
    return { usable: false, reason: "implausible" };
  }

  return { usable: true, min, max };
};

/**
 * The device's operator-set temperature range, in °F, or the reason there isn't a usable one.
 *
 * Thin wrapper kept for every existing caller (`buildReportInput.ts`, this file's own
 * `thresholdRejectionNote`, `test/unit/operatorThresholds.test.ts`) -- behaviour is byte-for-byte
 * unchanged, since `RAILS.temperature` is `TEMPERATURE_BASELINE_RAIL_F` and
 * `FIELD_KEYS.temperature` is the same `minTemperature`/`maxTemperature` pair this always read.
 */
export const temperatureThreshold = (
  thresholds: Record<string, string | number> | null | undefined,
): ThresholdVerdict => metricThreshold(thresholds, "temperature");

/**
 * One line for the tool result explaining why a metric's threshold pair was rejected, for any of
 * the five metrics `metricThreshold` validates. Generic counterpart to `thresholdRejectionNote`
 * below, which stays temperature-only and unchanged for the report.
 *
 * Never echoes the raw registry value -- only the reason and, for "implausible", the sanity rail
 * itself (a fixed fact about this codebase, not the operator's data).
 */
export const metricThresholdRejectionReason = (
  reason: ThresholdRejection,
  metric: MetricThresholdKey,
): string => {
  const label = METRIC_LABELS[metric];
  switch (reason) {
    case "no-thresholds":
      return "No operator thresholds are configured for this device.";
    case "missing":
      return `This device's thresholds do not include a ${label} range.`;
    case "non-numeric":
      return `This device's ${label} thresholds are not readable as numbers.`;
    case "unset":
      return `This device's ${label} thresholds have an identical minimum and maximum, which is `
        + "the registry's unconfigured state rather than a range.";
    case "inverted":
      return `This device's ${label} thresholds have a minimum above the maximum, so they cannot `
        + "be read as a range.";
    case "implausible": {
      const [lo, hi] = RAILS[metric];
      return `This device's ${label} thresholds fall outside a plausible range (${lo} to ${hi}), `
        + "so they read as a placeholder rather than a configured limit.";
    }
    default:
      return "This device's thresholds for this metric could not be used.";
  }
};

/**
 * One line for the report explaining why temperature has no baseline, phrased for a reader who
 * has the device registry open and could go fix it.
 *
 * Every branch says the same operational thing — set a real min/max on this device — because
 * that is the action, whatever the underlying state was.
 */
export const thresholdRejectionNote = (reason: ThresholdRejection): string => {
  const tail = "Set a minimum and maximum temperature for this device in the registry to give "
    + "this row a baseline.";
  switch (reason) {
    case "no-thresholds":
      return `No operator thresholds are configured for this device. ${tail}`;
    case "missing":
      return `This device's thresholds do not include a temperature range. ${tail}`;
    case "non-numeric":
      return `This device's temperature thresholds are not readable as numbers. ${tail}`;
    case "unset":
      return "This device's temperature thresholds have an identical minimum and maximum, which "
        + `is the registry's unconfigured state rather than a range. ${tail}`;
    case "inverted":
      return "This device's temperature thresholds have a minimum above the maximum, so they "
        + `cannot be read as a range. ${tail}`;
    case "implausible":
      return "This device's temperature thresholds fall outside the range natural surface water "
        + `occupies (${TEMPERATURE_BASELINE_RAIL_F[0]}-${TEMPERATURE_BASELINE_RAIL_F[1]} °F), so `
        + `they read as placeholders rather than a site baseline. ${tail}`;
    default:
      return tail;
  }
};

/**
 * Warns when a usable threshold's edge sits at or beyond the probe's own physical floor or
 * ceiling (`PLAUSIBLE_RANGES`, `src/devices/plausibility.ts` -- the same rails `metricThreshold`
 * validates against for every metric but temperature).
 *
 * Why this matters: `events.ts` only opens an event window when a reading crosses OUTSIDE
 * `baselineMin`/`baselineMax`. A limit configured at the metric's own physical edge can never be
 * crossed in that direction, because no reading can physically get there -- the probe would have
 * to report something implausible first. Live example: Old Woman Creek 2026's registry carries
 * dissolved oxygen 0-12 mg/L. 0 is also `PLAUSIBLE_RANGES.dissolvedOxygen.min`, so no reading can
 * ever fall below this baseline's minimum -- Hypoxia, Sewage and Algal bloom, which all require
 * DO to cross below baseline, are silently undetectable on that pod, and the report would
 * otherwise print "no events" with no hint why.
 *
 * Deliberately checked against the plausible rail, not the validation rail (`RAILS` above):
 * temperature's validation rail (`TEMPERATURE_BASELINE_RAIL_F`, 25-110 °F) is tighter than its
 * plausible range (-40-140 °F) specifically so a validated temperature threshold can never sit at
 * the probe's physical edge -- which is why this note never fires for temperature in practice,
 * without needing a special case here to make it so.
 *
 * Returns `undefined` when neither edge is blind, which is the common case -- e.g. ORP's
 * plausible floor is -2,000 mV, so a configured ORP minimum of 0 is nowhere near it and produces
 * no note.
 */
export const metricBlindSpotNote = (
  metric: MetricThresholdKey,
  min: number,
  max: number,
): string | undefined => {
  const plausible = PLAUSIBLE_RANGES[metric];
  const label = METRIC_LABELS[metric];
  const clauses = [
    min <= plausible.min
      ? `Excursions below the configured ${label} minimum (${min}) cannot be detected on this `
        + "pod: that limit sits at the edge of what the probe can report, so a reading can never "
        + "cross it from below."
      : null,
    max >= plausible.max
      ? `Excursions above the configured ${label} maximum (${max}) cannot be detected on this `
        + "pod: that limit sits at the edge of what the probe can report, so a reading can never "
        + "cross it from above."
      : null,
  ].filter((c): c is string => c !== null);
  return clauses.length > 0 ? clauses.join(" ") : undefined;
};

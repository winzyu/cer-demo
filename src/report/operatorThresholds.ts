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

/** Registry field names. Exact spellings from the live documents — see BACKEND_FIELDS.md §3. */
const MIN_KEY = "minTemperature";
const MAX_KEY = "maxTemperature";

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

const withinRail = (value: number): boolean => {
  const [lo, hi] = TEMPERATURE_BASELINE_RAIL_F;
  return value >= lo && value <= hi;
};

/**
 * The device's operator-set temperature range, in °F, or the reason there isn't a usable one.
 *
 * Units: °F, matching what this codebase's temperature metric is normalized to (`metrics.ts`
 * converts code 102 to Fahrenheit) and what the report's "Temperature (°F)" row prints. The
 * registry stores these thresholds in the same unit the dashboard displays, so no conversion
 * happens here — and none should be added without re-checking the dashboard, because a silent
 * C/F mix-up here would produce a plausible-looking wrong range rather than an obvious one.
 */
export const temperatureThreshold = (
  thresholds: Record<string, string | number> | null | undefined,
): ThresholdVerdict => {
  if (!thresholds || typeof thresholds !== "object" || Object.keys(thresholds).length === 0) {
    return { usable: false, reason: "no-thresholds" };
  }

  const rawMin = (thresholds as Record<string, unknown>)[MIN_KEY];
  const rawMax = (thresholds as Record<string, unknown>)[MAX_KEY];
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
  if (!withinRail(min) || !withinRail(max)) {
    return { usable: false, reason: "implausible" };
  }

  return { usable: true, min, max };
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

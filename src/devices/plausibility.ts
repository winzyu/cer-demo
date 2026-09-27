/**
 * Physical-plausibility bounds: the sentinel/rail filter the device's own error flags do not
 * provide.
 *
 * **Why this exists.** `decodeMetric` judges validity from the probe's error flag, and that flag
 * is not always set when the probe fails. Verified live on `dev:351077454569099` (Algalita Pod),
 * reading `2026-07-24T00:09:22Z`:
 *
 *     water_data["102"] = -1023      (Celsius, as /water/period returns it)
 *     rtdError          = 0          <- hardware says the probe is FINE
 *     decoded           = -1809.4 °F ( -1023 * 9/5 + 32 )
 *
 * -1023 is a 10-bit ADC rail (0x3FF negated), i.e. a disconnected or shorted probe. Because
 * `rtdError` was 0, `aggregate`'s `sample.valid` filter could not exclude it, so it reached the
 * generated report as a genuine minimum of -1809.4 °F and from there into Section 2, the
 * parameter narrative, and the overall status. Fourteen such readings exist on this pod across
 * three months (2026-06-13 x4, 2026-06-14 x9, 2026-07-24 x1).
 *
 * **These are rails, not quality thresholds.** Every bound here is deliberately wider than any
 * reading real water can produce, because the only job is to reject values that no working probe
 * in water can emit. Judging whether a *plausible* reading is normal is `referenceRanges.ts`'s
 * job, against the site baseline, and nothing here should encroach on it -- a bound tight enough
 * to be interesting is a bound tight enough to silently delete a real excursion, which is the
 * failure this file exists to prevent, not to cause.
 *
 * Note what is deliberately NOT filtered: `0` stays plausible for ORP and turbidity, which is
 * the same carve-out `aggregate.ts` documents. A zero from those two probes is a real reading.
 */

import type { MetricKey } from "../types/device.types";

export interface PlausibleRange {
  /** Inclusive unless the matching `exclusive` flag says otherwise. */
  min: number;
  max: number;
  /** True when a reading exactly equal to the bound is itself the rail (pH 0.000 / 14.000). */
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
  /**
   * Tighter, inclusive bounds a *reading* must also meet, where the metric's scale is wider
   * than any natural water (pH). Kept apart from `min`/`max` because those also validate
   * operator-configured limits (`operatorThresholds.ts`), which may legitimately sit anywhere on
   * the scale.
   */
  naturalWater?: { min: number; max: number };
  reason: string;
}

/**
 * Keyed by `MetricKey`, in the metric's **normalized** unit -- the unit `decodeMetric` has
 * already converted to, which for temperature is °F, not the Celsius the wire carries.
 */
export const PLAUSIBLE_RANGES: Record<MetricKey, PlausibleRange> = {
  temperature: {
    // Liquid water, with generous margin for a sun-baked hull and a brine-depressed freezing
    // point. The observed -1809.4 °F sentinel is ~1770 °F below this floor.
    min: -40,
    max: 140,
    reason: "outside the range liquid water can occupy (probe disconnected or ADC rail)",
  },
  ph: {
    // 0 and 14 are the ends of the scale itself. A probe reporting exactly 0.000 or 14.000 is
    // reporting its rail, not water -- natural water never sits precisely on either end.
    // `operatorThresholds.ts` validates configured pH limits against these two numbers, so they
    // stay the scale; readings are held to the tighter `naturalWater` window below.
    min: 0,
    max: 14,
    exclusiveMin: true,
    exclusiveMax: true,
    // Natural surface water spans roughly pH 3.5 (peat bogs and humic brown-water streams, the
    // most acidic natural water outside mine drainage and volcanic crater lakes) to about 11
    // (soda lakes, and eutrophic water at the peak of afternoon photosynthesis). The fleet sits
    // in lakes, creeks, harbors and the open coast, where neither extreme source exists, so a
    // reading outside 3-12 is a failing probe, not water. Live cause: the Algalita Pod, in
    // seawater (~pH 8.1), reported a 1-day minimum of 2.07 and a 7-day maximum of 12.62, and
    // each alone set a report to Action Required (REPORT_AUDIT_2026-09-25.md finding 5). Both
    // edges stay outside every non-placeholder operator pH limit in the recorded registry
    // fixtures (5 to 10), so no excursion those limits exist to catch is removed here.
    naturalWater: { min: 3, max: 12 },
    reason: "outside the pH range natural water can reach (pH 3-12; probe failure, not a measurement)",
  },
  dissolvedOxygen: {
    // Max solubility is ~14.6 mg/L at 0 °C; ~30 allows for roughly 200% supersaturation during
    // an extreme bloom, which is already beyond anything this fleet should see.
    min: 0,
    max: 30,
    reason: "beyond the solubility limit of oxygen in water",
  },
  orp: {
    min: -2_000,
    max: 2_000,
    reason: "outside the range an ORP electrode can develop",
  },
  conductivity: {
    // Seawater is ~50,000 µS/cm; 100,000 leaves room for hypersaline water without admitting a
    // rail value.
    //
    // Zero is excluded, unlike ORP and turbidity: every natural water conducts (even lab-grade
    // deionized water reads ~0.055 µS/cm), so an exact 0 is the probe's floor, not a
    // measurement. This is the one metric where the "0 is a real reading" carve-out does not
    // apply, and saying so explicitly is why the exclusion is safe.
    min: 0,
    max: 100_000,
    exclusiveMin: true,
    reason: "at or below the conductivity floor -- no natural water reads 0 µS/cm",
  },
  turbidity: {
    // Derived from a raw voltage by a provisional, uncalibrated conversion (see metrics.ts), so
    // this bound is looser than the others on purpose -- the index has no calibrated ceiling.
    min: 0,
    max: 4_000,
    reason: "beyond the range of the turbidity voltage conversion",
  },
};

/**
 * Whether a decoded reading is physically possible for its metric.
 *
 * Unknown metrics return `true`: this is a rail filter, and a metric with no bounds on file has
 * no rail to catch. Failing open matches `probeAccuracy`'s "no spec on file" behaviour and keeps
 * a new metric from being silently dropped the day it is added.
 */
export const isPlausible = (key: MetricKey, value: number): boolean => {
  const range = PLAUSIBLE_RANGES[key];
  if (!range) {
    return true;
  }
  if (!Number.isFinite(value)) {
    return false;
  }
  const aboveMin = range.exclusiveMin ? value > range.min : value >= range.min;
  const belowMax = range.exclusiveMax ? value < range.max : value <= range.max;
  const natural = range.naturalWater;
  const inNaturalWater = !natural || (value >= natural.min && value <= natural.max);
  return aboveMin && belowMax && inNaturalWater;
};

/** Human-readable reason a metric's bounds exist, for a data-quality note. */
export const implausibilityReason = (key: MetricKey): string => (
  PLAUSIBLE_RANGES[key]?.reason ?? "outside the metric's physical range"
);

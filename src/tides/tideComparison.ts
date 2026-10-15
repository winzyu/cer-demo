import type { Sample } from "../tools/aggregate";
import { localSolar, type CycleTiming } from "../tools/dailyCycle";
import type { TideEvent } from "./noaaTides";

/**
 * Whether a metric's daily peaks follow the tide, computed here so the model relays a verdict
 * instead of comparing two lists of times itself (it misread `daily_cycle` once in the
 * data-skepticism matrix, `DATA_SKEPTICISM_FIX_2026-10-12.md` "Remaining" item 2).
 *
 * A cycle driven by the tide keeps a steady lag behind high tide while its clock hour drifts
 * about 50 minutes a day; one driven by the sun keeps its clock hour while its lag behind high
 * tide drifts. So the test is the scatter of each day's lag behind the nearest high tide, read
 * on the 12.42-hour tidal cycle (a lag of 6 hours after one high is 6.4 hours before the next).
 */

const HOUR_MS = 60 * 60_000;
/** The principal lunar semidiurnal period, hours. */
const TIDE_PERIOD_HOURS = 12.42;
/**
 * Days needed before a verdict: the tide moves about 0.84 hours a day against the clock, so it
 * takes 5 days (3.4 hours of drift) before a solar cycle's lag spreads clearly past the
 * `MAX_LAG_SCATTER_HOURS` a tidal one stays within.
 */
export const MIN_TIDE_DAYS = 5;
/** A lag scattering less than this, day to day, keeps to the tide. */
const MAX_LAG_SCATTER_HOURS = 1.5;
/** A peak with no high tide within this distance is left out (a gap in the predictions). */
const MAX_NEAREST_HIGH_HOURS = 7;

export type TideVerdict =
  | "peaks follow the tide"
  | "peaks keep to the time of day, not the tide"
  | "unclear";

export interface TideComparison {
  verdict: TideVerdict;
  /** Days compared. */
  days: number;
  /** Mean lag of the peak behind high tide, hours; negative means before high tide. */
  mean_hours_after_high_tide: number;
  /** Day-to-day scatter of that lag, hours. */
  lag_scatter_hours: number;
  daily: Array<{
    peak_local_solar: string;
    nearest_high_tide_local_solar: string;
    hours_after_high_tide: number;
  }>;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Compares each daily peak with the nearest predicted high tide. `timing` is the metric's own
 * `daily_cycle` timing; a solar verdict also needs the peaks to hold their clock hour, so a
 * cycle that neither keeps the hour nor keeps to the tide stays "unclear".
 */
export const compareWithTides = (
  peaks: Sample[],
  tides: TideEvent[],
  longitude: number,
  timing: CycleTiming | undefined,
): TideComparison | undefined => {
  const highs = tides.filter((tide) => tide.type === "high");
  const daily = peaks.flatMap((peak) => {
    const nearest = highs.reduce<TideEvent | undefined>(
      (best, tide) => (!best || Math.abs(tide.atMs - peak.atMs) < Math.abs(best.atMs - peak.atMs)
        ? tide : best),
      undefined,
    );
    const gapMs = nearest ? Math.abs(nearest.atMs - peak.atMs) : Number.POSITIVE_INFINITY;
    if (!nearest || gapMs > MAX_NEAREST_HIGH_HOURS * HOUR_MS) return [];
    return [{ peak, high: nearest, lagHours: (peak.atMs - nearest.atMs) / HOUR_MS }];
  });
  if (daily.length < MIN_TIDE_DAYS) return undefined;

  // Circular mean and spread of the lag on the tidal cycle.
  const angles = daily.map(({ lagHours }) => (2 * Math.PI * lagHours) / TIDE_PERIOD_HOURS);
  const c = angles.reduce((sum, a) => sum + Math.cos(a), 0) / angles.length;
  const s = angles.reduce((sum, a) => sum + Math.sin(a), 0) / angles.length;
  const resultant = Math.min(1, Math.hypot(c, s));
  const meanLag = (Math.atan2(s, c) * TIDE_PERIOD_HOURS) / (2 * Math.PI);
  const scatter = resultant === 0
    ? Number.POSITIVE_INFINITY
    : (Math.sqrt(-2 * Math.log(resultant)) * TIDE_PERIOD_HOURS) / (2 * Math.PI);

  let verdict: TideVerdict = "unclear";
  if (scatter <= MAX_LAG_SCATTER_HOURS) verdict = "peaks follow the tide";
  else if (timing === "same hour each day") verdict = "peaks keep to the time of day, not the tide";

  return {
    verdict,
    days: daily.length,
    mean_hours_after_high_tide: round1(meanLag),
    lag_scatter_hours: Number.isFinite(scatter) ? round1(scatter) : 99,
    daily: daily.map(({ peak, high, lagHours }) => ({
      peak_local_solar: localSolar(peak.atMs, longitude),
      nearest_high_tide_local_solar: localSolar(high.atMs, longitude),
      hours_after_high_tide: round1(lagHours),
    })),
  };
};

import type { Sample } from "../tools/aggregate";
import { localSolar, solarOffsetHours } from "../tools/dailyCycle";
import type { TideEvent } from "./noaaTides";

/**
 * Whether a metric's daily peaks follow the tide, computed here so the model relays a verdict
 * instead of comparing two lists of times itself (it misread `daily_cycle` once in the
 * data-skepticism matrix, `DATA_SKEPTICISM_FIX_2026-10-12.md` "Remaining" item 2).
 *
 * A cycle driven by the tide keeps a steady lag behind high tide while its clock hour drifts
 * about 50 minutes a day; one driven by the sun keeps its clock hour while its lag behind high
 * tide drifts. So the test weighs two scatters of the same peaks: each day's lag behind the
 * nearest high tide, read on the 12.42-hour tidal cycle (a lag of 6 hours after one high is 6.4
 * hours before the next), and each day's local clock hour, read on the 24-hour day.
 *
 * Over a week the tide drifts only about 5 hours against the clock, so the wrong one of the two
 * scatters by about 1.3 hours: under any fixed threshold worth having. A verdict therefore needs
 * its own scatter small and at most half the other's; a sun-driven week once read as tidal with a
 * lag scatter of 1.4 hours against real NOAA predictions (`get_tides` on the skepticism fleet).
 */

const HOUR_MS = 60 * 60_000;
/** The principal lunar semidiurnal period, hours. */
const TIDE_PERIOD_HOURS = 12.42;
/**
 * Days needed before a verdict: the tide moves about 0.84 hours a day against the clock, so 5
 * days (3.4 hours of drift) is the least that spreads the wrong scatter to about twice the right
 * one for peaks timed to within half an hour.
 */
export const MIN_TIDE_DAYS = 5;
/** The winning scatter, lag or clock hour, must be at most this, in hours... */
const MAX_SCATTER_HOURS = 1.5;
/** ...and at most this share of the other. */
const MAX_SCATTER_RATIO = 0.5;
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
  /** Day-to-day scatter of the peaks' local clock hour, hours. */
  clock_hour_scatter_hours: number;
  daily: Array<{
    peak_local_solar: string;
    nearest_high_tide_local_solar: string;
    hours_after_high_tide: number;
  }>;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Circular mean and spread (hours) of values on a cycle of `period` hours. */
const circular = (hours: number[], period: number): { mean: number; scatter: number } => {
  const angles = hours.map((h) => (2 * Math.PI * h) / period);
  const c = angles.reduce((sum, a) => sum + Math.cos(a), 0) / angles.length;
  const s = angles.reduce((sum, a) => sum + Math.sin(a), 0) / angles.length;
  const resultant = Math.min(1, Math.hypot(c, s));
  return {
    mean: (Math.atan2(s, c) * period) / (2 * Math.PI),
    scatter: resultant === 0
      ? Number.POSITIVE_INFINITY
      : (Math.sqrt(-2 * Math.log(resultant)) * period) / (2 * Math.PI),
  };
};

/**
 * Compares each daily peak with the nearest predicted high tide, and with its own clock hour; a
 * cycle that neither keeps the hour nor keeps to the tide clearly better than the other stays
 * "unclear".
 */
export const compareWithTides = (
  peaks: Sample[],
  tides: TideEvent[],
  longitude: number,
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

  const lag = circular(daily.map(({ lagHours }) => lagHours), TIDE_PERIOD_HOURS);
  const clock = circular(
    daily.map(({ peak }) => peak.atMs / HOUR_MS + solarOffsetHours(longitude)),
    24,
  );
  const wins = (mine: number, other: number): boolean => mine <= MAX_SCATTER_HOURS
    && mine <= MAX_SCATTER_RATIO * other;

  let verdict: TideVerdict = "unclear";
  if (wins(lag.scatter, clock.scatter)) verdict = "peaks follow the tide";
  else if (wins(clock.scatter, lag.scatter)) verdict = "peaks keep to the time of day, not the tide";

  const hours = (value: number): number => (Number.isFinite(value) ? Math.abs(round1(value)) : 99);
  return {
    verdict,
    days: daily.length,
    mean_hours_after_high_tide: round1(lag.mean),
    lag_scatter_hours: hours(lag.scatter),
    clock_hour_scatter_hours: hours(clock.scatter),
    daily: daily.map(({ peak, high, lagHours }) => ({
      peak_local_solar: localSolar(peak.atMs, longitude),
      nearest_high_tide_local_solar: localSolar(high.atMs, longitude),
      hours_after_high_tide: round1(lagHours),
    })),
  };
};

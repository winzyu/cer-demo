import type { Sample, SeriesBucket } from "./aggregate";

/**
 * When in the day a metric peaks, in the pod's local solar time (record §5 item 5,
 * `docs/records/GILLIGAN_DATA_SKEPTICISM_2026-10-09.md`).
 *
 * A cycle driven by the sun peaks at the same clock hour every day; a tidal one comes about 50
 * minutes later each day, because the lunar day is 24.84 hours. No tool measures tides, so this
 * timing is the only evidence the model has for telling the two apart. In the incident the model
 * called a solar cycle "tide-locked", and read UTC bucket times as local ones ("68 °F midday to
 * 88 °F overnight" for an afternoon peak).
 *
 * Local solar time comes from the pod's longitude (UTC + longitude / 15 hours), not a time zone:
 * the API carries none, and solar time is what decides whether a cycle follows the sun.
 */

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** Full local days needed before a timing is called; fewer cannot separate the two cycles. */
export const MIN_CYCLE_DAYS = 3;
/** A peak that moves less than this per day stays on the clock. */
const FIXED_DRIFT_HOURS = 0.25;
/** A tide's peak moves about 0.83 hours per day; this band allows for noise around it. */
const TIDAL_DRIFT_HOURS: [number, number] = [0.5, 1.2];
/** Day-to-day scatter around the fitted drift beyond which no timing is called. */
const MAX_SCATTER_HOURS = 1.5;

export type CycleTiming = "same hour each day" | "about 50 minutes later each day" | "unclear";

export interface DailyCycle {
  timing: CycleTiming;
  /** Each full local day's highest reading, as "YYYY-MM-DD HH:MM" local solar time. */
  daily_peaks_local_solar: string[];
  /**
   * Each full local day's lowest reading, the same way. Without it the model guessed when the lows
   * fell and put an afternoon pH low in "the early-to-mid morning" (data-skepticism item 3).
   */
  daily_lows_local_solar: string[];
  /** Fitted change in the peak's hour from one day to the next, in minutes. */
  peak_drift_minutes_per_day: number;
}

/** Hours the pod's local solar time runs ahead of UTC (negative west of Greenwich). */
export const solarOffsetHours = (longitude: number): number => longitude / 15;

/** "2026-10-05T22:00:00.000Z" at longitude -118 as "2026-10-05 14:08", local solar time. */
export const localSolar = (atMs: number, longitude: number): string => new Date(
  atMs + solarOffsetHours(longitude) * HOUR_MS,
).toISOString().slice(0, 16).replace("T", " ");

/** Each series bucket with its start in local solar time beside the UTC one. */
export const withLocalSolar = (series: SeriesBucket[], longitude: number)
  : Array<SeriesBucket & { start_local_solar: string }> => series.map((bucket) => ({
  ...bucket, start_local_solar: localSolar(Date.parse(bucket.start), longitude),
}));

/** Least-squares slope and the scatter around it. */
const fit = (ys: number[]): { slope: number; scatter: number } => {
  const n = ys.length;
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  const sxx = ys.reduce((sum, _, x) => sum + (x - meanX) ** 2, 0);
  const slope = ys.reduce((sum, y, x) => sum + (x - meanX) * (y - meanY), 0) / sxx;
  const residuals = ys.map((y, x) => y - (meanY + slope * (x - meanX)));
  return { slope, scatter: Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / n) };
};

/**
 * The peak hour of each full local solar day in `samples`, and whether it holds or drifts.
 * Undefined with fewer than `MIN_CYCLE_DAYS` full days of usable readings.
 */
export const dailyCycle = (samples: Sample[], longitude: number): DailyCycle | undefined => {
  const offsetMs = solarOffsetHours(longitude) * HOUR_MS;
  const usable = samples.filter((s) => s.valid && s.plausible !== false);
  if (usable.length === 0) return undefined;
  const dayOf = (s: Sample): number => Math.floor((s.atMs + offsetMs) / DAY_MS);
  const days = new Map<number, Sample[]>();
  usable.forEach((s) => days.set(dayOf(s), [...(days.get(dayOf(s)) ?? []), s]));
  // Only days the window covers end to end: a partial day has a false peak at its edge.
  const first = dayOf(usable[0]);
  const last = dayOf(usable[usable.length - 1]);
  const fullDays = [...days.entries()]
    .filter(([day, rows]) => day > first && day < last && rows.length >= 8)
    .sort(([a], [b]) => a - b)
    .map(([, rows]) => rows);
  const peaks = fullDays.map((rows) => rows.reduce((best, s) => (s.value > best.value ? s : best)));
  const lows = fullDays.map((rows) => rows.reduce((best, s) => (s.value < best.value ? s : best)));
  if (peaks.length < MIN_CYCLE_DAYS) return undefined;

  // Unwrap each peak's hour against the previous one, so a peak drifting past midnight keeps going.
  const hours: number[] = [];
  peaks.forEach((s) => {
    let hour = ((((s.atMs + offsetMs) % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS;
    const previous = hours[hours.length - 1];
    if (previous !== undefined) {
      while (hour - previous > 12) hour -= 24;
      while (previous - hour > 12) hour += 24;
    }
    hours.push(hour);
  });
  const { slope, scatter } = fit(hours);
  let timing: CycleTiming = "unclear";
  const steady = scatter <= MAX_SCATTER_HOURS;
  if (steady && Math.abs(slope) <= FIXED_DRIFT_HOURS) timing = "same hour each day";
  if (steady && slope >= TIDAL_DRIFT_HOURS[0] && slope <= TIDAL_DRIFT_HOURS[1]) {
    timing = "about 50 minutes later each day";
  }
  return {
    timing,
    daily_peaks_local_solar: peaks.map((s) => localSolar(s.atMs, longitude)),
    daily_lows_local_solar: lows.map((s) => localSolar(s.atMs, longitude)),
    peak_drift_minutes_per_day: Math.round(slope * 60),
  };
};
